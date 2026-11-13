/**
 * Phòng đấu online dùng chung cho các môn (bóng đá, bóng rổ): gọi API có đăng nhập,
 * luồng SSE nhận trạng thái trận, và một hàng đợi phím có giới hạn cho mỗi trận.
 */
export const createRoomClient = ({ base, code: prefix, unreachable, guestHint }) => {
  const request = async (path, body = {}, options = {}) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const { signal, method = "POST", ...fetchOptions } = options;
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    let timedOut = false;
    const deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
    try {
      const response = await fetch(`/api/${base}/${path}`, {
        ...fetchOptions,
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.message || unreachable), { status: response.status, code: result.code });
      return result;
    } catch (error) {
      if (timedOut) throw Object.assign(new Error("Máy chủ phản hồi quá lâu. Hãy thử kết nối lại."), { code: `${prefix}_TIMEOUT` });
      throw error;
    } finally {
      clearTimeout(deadline);
      signal?.removeEventListener("abort", cancel);
    }
  };

  /** A missing login may create a guest only while explicitly entering a room. */
  const call = async (path, body) => {
    try { return await request(path, body); }
    catch (error) {
      if (error.status !== 401) throw error;
      const guest = await fetch("/api/auth/guest", { method: "POST", credentials: "include" });
      if (!guest.ok) throw Object.assign(new Error(guestHint), { code: `${prefix}_AUTH_REQUIRED` });
      return request(path, body);
    }
  };

  const isTerminal = (error) => [401, 403, 404, 410].includes(error.status);

  /** SSE lifecycle and ordered inputs; onError reports a lost room/session once. */
  const openRoom = (code, handlers) => {
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
    const roomRequest = (path, body, options) => request(`rooms/${code}${path}`, body, { ...options, signal: session.signal });
    const scheduleReconnect = () => {
      if (closed || retryTimer !== null) return;
      retryTimer = setTimeout(() => { retryTimer = null; connect(); }, Math.min(500 * 2 ** Math.min(retry++, 4), 5000));
    };
    const connect = () => {
      if (closed) return;
      const current = new EventSource(`/api/${base}/rooms/${code}/events`, { withCredentials: true });
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
      leave: () => request(`rooms/${code}/leave`, {}, { keepalive: true }).catch(() => {}),
      close,
    };
  };

  return { request, call, openRoom };
};
