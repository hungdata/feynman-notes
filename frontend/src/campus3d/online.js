import { useCallback, useEffect, useRef, useState } from "react";

export const campusRequest = async (path, options = {}) => {
  const response = await fetch(`/api/campus/${path}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "Chưa kết nối được với sân trường. Hãy thử lại.");
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
};

/** One event stream per tab. Position requests never overlap, even on a slow link. */
export const useCampusOnline = (profile, worldRef, ready) => {
  const onlineRef = useRef({ snapshot: null, connected: false });
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const sendRef = useRef(null);
  const pendingRef = useRef(null);
  const actionBusyRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const recoverRef = useRef(null);

  useEffect(() => {
    if (!profile || !ready) return undefined;
    let alive = true;
    let inFlight = null;
    let lastSent = 0;
    let lastPoint = "";
    let reconnectTimer = null;
    let probing = false;
    let terminal = false;
    const controller = new AbortController();
    const source = new EventSource("/api/campus/events", { withCredentials: true });
    onlineRef.current.connected = false;
    setConnection("connecting");
    const boundedRequest = async (path, options = {}) => {
      const requestController = new AbortController();
      let timedOut = false;
      const abortRequest = () => requestController.abort();
      controller.signal.addEventListener("abort", abortRequest, { once: true });
      const deadline = window.setTimeout(() => { timedOut = true; requestController.abort(); }, 15000);
      try {
        return await campusRequest(path, { ...options, signal: requestController.signal });
      } catch (cause) {
        if (timedOut && alive && !controller.signal.aborted) {
          throw Object.assign(new Error("Kết nối phản hồi quá lâu. Đang tự kết nối lại…"), { code: "CAMPUS_TIMEOUT" });
        }
        throw cause;
      } finally {
        window.clearTimeout(deadline);
        controller.signal.removeEventListener("abort", abortRequest);
      }
    };
    const scheduleReconnect = (immediate = false) => {
      if (!alive || terminal) return;
      if (reconnectTimer !== null) {
        if (!immediate) return;
        window.clearTimeout(reconnectTimer);
      }
      onlineRef.current.connected = false;
      source.close();
      setConnection("reconnecting");
      const attempt = reconnectAttemptRef.current++;
      // A server waking up may take a while. Retry gently, never in a tight loop.
      const delay = immediate ? 0 : Math.min(500 * 2 ** Math.min(attempt, 5), 10000);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (alive && !terminal) setRetry((value) => value + 1);
      }, delay);
    };
    const recover = (cause) => {
      if (!alive || cause.name === "AbortError") return;
      if (cause.status === 401 || cause.code === "CHARACTER_REQUIRED") {
        terminal = true;
        source.close();
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        onlineRef.current.connected = false;
        setConnection(cause.status === 401 ? "reauthentication" : "disconnected");
        setError(cause.status === 401
          ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để trở về sân trường."
          : "Nhân vật chưa được lưu trên máy chủ này. Hãy mở Nhân vật để tạo lại trước khi vào sân.");
        return;
      }
      if (cause.code === "CAMPUS_DISCONNECTED" || cause.code === "CAMPUS_TIMEOUT") {
        setError("Đang tự kết nối lại sân trường…");
        scheduleReconnect();
        return;
      }
      setError(cause.message);
    };
    recoverRef.current = recover;
    const send = async (force = false, duringAction = false) => {
      if (!alive || !onlineRef.current.connected || inFlight || (!duringAction && actionBusyRef.current) || !worldRef.current) return inFlight;
      const point = worldRef.current.where();
      const key = [point.x.toFixed(2), point.z.toFixed(2), point.heading.toFixed(2), Boolean(point.moving)].join(":");
      if (!force && key === lastPoint && Date.now() - lastSent < 1000) return undefined;
      lastPoint = key;
      lastSent = Date.now();
      inFlight = boundedRequest("input", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ x: point.x, z: point.z, heading: point.heading, moving: Boolean(point.moving) }),
      }).then((result) => {
        if (!alive || !result.player || !worldRef.current) return;
        reconnectAttemptRef.current = 0;
        // The server may correct a stale tab, collision, or an impossible jump.
        const current = worldRef.current.where();
        const sentGap = Math.hypot(result.player.x - point.x, result.player.z - point.z);
        if (sentGap > 2 && Math.hypot(current.x - point.x, current.z - point.z) < 4) worldRef.current.teleport(result.player);
      }).catch(recover).finally(() => { inFlight = null; });
      pendingRef.current = inFlight;
      return inFlight;
    };
    sendRef.current = send;
    const onWorld = (event) => {
      if (!alive || terminal || reconnectTimer !== null) return;
      try {
        const value = JSON.parse(event.data);
        if (!Array.isArray(value.players) || !value.selfId) return;
        const wasConnected = onlineRef.current.connected;
        onlineRef.current.snapshot = value;
        onlineRef.current.connected = true;
        setSnapshot(value);
        setConnection("connected");
        if (!wasConnected) { setError(""); void send(true); }
      } catch { /* Ignore one incomplete event; the next snapshot replaces it. */ }
    };
    source.addEventListener("world", onWorld);
    source.onerror = () => {
      if (!alive || terminal || reconnectTimer !== null) return;
      onlineRef.current.connected = false;
      setConnection("reconnecting");
      // EventSource hides HTTP status codes. Check once per failure so an expired
      // cookie or missing character does not become an endless reconnect loop.
      if (probing) return;
      probing = true;
      boundedRequest("profile").then((result) => {
        if (!alive || terminal) return;
        if (!result.profile) {
          recover(Object.assign(new Error("Nhân vật chưa được lưu."), { status: 409, code: "CHARACTER_REQUIRED" }));
        } else if (source.readyState === 2) {
          // HTTP failures can permanently close EventSource; transport failures
          // stay CONNECTING and retain the browser's automatic retry behavior.
          scheduleReconnect();
        }
      }).catch((cause) => {
        if (!alive || cause.name === "AbortError") return;
        recover(cause);
        if (!terminal && source.readyState === 2) scheduleReconnect();
      }).finally(() => { probing = false; });
    };
    const timer = window.setInterval(() => { void send(); }, 100);
    const resume = () => {
      if (document.hidden || terminal) return;
      if (onlineRef.current.connected) void send(true);
      else scheduleReconnect(true);
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      source.close();
      controller.abort();
      window.clearInterval(timer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", resume);
      onlineRef.current.connected = false;
      sendRef.current = null;
      pendingRef.current = null;
      recoverRef.current = null;
    };
  }, [profile, ready, retry, worldRef]);

  const action = useCallback(async (payload) => {
    if (!onlineRef.current.connected) throw new Error("Đang kết nối lại. Chờ có kết nối để chơi cùng mọi người.");
    if (actionBusyRef.current) return null;
    actionBusyRef.current = true;
    try {
      // Publish the latest facing and position before a kick or a throw.
      await pendingRef.current;
      await sendRef.current?.(true, true);
      const result = await campusRequest("action", { method: "POST", body: JSON.stringify(payload) });
      if (result.player && (payload.type === "join" || payload.type === "leave")) {
        const current = onlineRef.current.snapshot;
        if (current) {
          const next = { ...current, players: current.players.map((player) => player.id === result.player.id ? result.player : player) };
          onlineRef.current.snapshot = next;
          setSnapshot(next);
        }
        worldRef.current?.teleport(result.player);
      }
      setError("");
      return result;
    } catch (cause) {
      if (recoverRef.current) recoverRef.current(cause);
      else setError(cause.message);
      throw cause;
    } finally {
      actionBusyRef.current = false;
    }
  }, [worldRef]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setError("");
    setRetry((value) => value + 1);
  }, []);
  return { onlineRef, snapshot, connection, error, action, reconnect, clearError: () => setError("") };
};
