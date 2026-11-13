/** Authenticated room requests and one bounded input queue per live match. */
export const footballRequest = async (path, body = {}, options = {}) => {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const { signal, method = "POST", ...fetchOptions } = options;
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  let timedOut = false;
  const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    const response = await fetch(`/api/football/${path}`, {
      ...fetchOptions,
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.message || "Chưa kết nối được máy chủ bóng đá. Hãy thử lại."), { status: response.status, code: result.code });
    return result;
  } catch (error) {
    if (timedOut) throw Object.assign(new Error("Máy chủ phản hồi quá lâu. Hãy thử kết nối lại."), { code: "FOOTBALL_TIMEOUT" });
    throw error;
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", cancel);
  }
};

/** A missing login may create a guest only while explicitly entering a room. */
export const footballCall = async (path, body) => {
  try { return await footballRequest(path, body); }
  catch (error) {
    if (error.status !== 401) throw error;
    const guest = await fetch("/api/auth/guest", { method: "POST", credentials: "include" });
    if (!guest.ok) throw Object.assign(new Error("Máy chủ chưa bật đăng nhập khách. Hãy đăng nhập Google để đá online."), { code: "FOOTBALL_AUTH_REQUIRED" });
    return footballRequest(path, body);
  }
};

const isTerminal = (error) => [401, 403, 404, 410].includes(error.status);

/** SSE lifecycle and ordered inputs; onError reports a lost room/session once. */
export const openRoom = (code, handlers) => {
  const session = new AbortController();
  let source = null;
  let closed = false;
  let retry = 0;
  let retryTimer = null;
  let inputTimer = null;
  let queued = null;
  let probing = false;
  let inFlight = false;
  let lastSent = "";
  let lastAt = -Infinity;

  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(retryTimer);
    clearTimeout(inputTimer);
    queued = null;
    source?.close();
    session.abort();
  };
  const fail = (error) => {
    if (closed) return;
    close();
    handlers.onConnection?.("disconnected");
    handlers.onError?.(error);
  };
  const roomRequest = (path, body, options) => footballRequest(`rooms/${code}${path}`, body, { ...options, signal: session.signal });
  const scheduleReconnect = () => {
    if (closed || retryTimer !== null) return;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, Math.min(500 * 2 ** Math.min(retry++, 4), 5000));
  };
  const connect = () => {
    if (closed) return;
    const current = new EventSource(`/api/football/rooms/${code}/events`, { withCredentials: true });
    source = current;
    handlers.onConnection?.("connecting");
    current.addEventListener("open", () => { if (!closed && source === current) { retry = 0; handlers.onConnection?.("connected"); } });
    for (const [event, handler] of [["lobby", "onLobby"], ["start", "onStart"], ["state", "onState"], ["end", "onEnd"]]) {
      current.addEventListener(event, (message) => {
        if (closed || source !== current) return;
        try { handlers[handler]?.(JSON.parse(message.data)); } catch (error) { console.error("Gói tin trận online lỗi", error); }
      });
    }
    current.addEventListener("error", () => {
      if (closed || source !== current || probing) return;
      current.close();
      handlers.onConnection?.("reconnecting");
      probing = true;
      roomRequest("", undefined, { method: "GET" }).then(() => { if (!closed) scheduleReconnect(); }).catch((error) => {
        if (closed) return;
        if (isTerminal(error)) fail(error);
        else scheduleReconnect();
      }).finally(() => { probing = false; });
    });
  };

  const flush = async () => {
    if (closed || inFlight || !queued) return;
    const body = JSON.stringify(queued);
    const now = performance.now();
    if (body === lastSent && now - lastAt < 250) { queued = null; return; }
    if (now - lastAt < 50) {
      if (inputTimer === null) inputTimer = setTimeout(() => { inputTimer = null; void flush(); }, 50 - (now - lastAt));
      return;
    }
    const next = queued;
    queued = null;
    lastSent = body;
    lastAt = now;
    inFlight = true;
    try { await roomRequest("/input", next); }
    catch (error) { if (!closed && isTerminal(error)) fail(error); }
    finally { inFlight = false; if (!closed && queued) void flush(); }
  };
  connect();

  return {
    input: (state) => { if (!closed) { queued = state; void flush(); } },
    action: (action, opts = {}) => {
      if (closed) return false;
      void roomRequest("/act", { action, opts }).catch((error) => { if (isTerminal(error)) fail(error); });
      return true;
    },
    ready: (body) => roomRequest("/ready", body),
    next: () => roomRequest("/next"),
    // Leave must survive close(), which aborts all gameplay requests.
    leave: () => footballRequest(`rooms/${code}/leave`, {}, { keepalive: true }).catch(() => {}),
    close,
  };
};

export const inputState = (input) => ({
  mx: Math.round(input.mx * 100) / 100,
  mz: Math.round(input.mz * 100) / 100,
  sprint: input.sprint, shield: input.shield, contain: input.contain, press: input.press,
  barge: input.barge, holdBall: input.holdBall, callPress: input.callPress, pushUp: input.pushUp,
});
