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

  useEffect(() => {
    if (!profile || !ready) return undefined;
    let alive = true;
    let inFlight = null;
    let lastSent = 0;
    let lastPoint = "";
    const controller = new AbortController();
    const source = new EventSource("/api/campus/events", { withCredentials: true });
    onlineRef.current.connected = false;
    setConnection("connecting");
    const send = async (force = false, duringAction = false) => {
      if (!alive || !onlineRef.current.connected || inFlight || (!duringAction && actionBusyRef.current) || !worldRef.current) return inFlight;
      const point = worldRef.current.where();
      const key = [point.x.toFixed(2), point.z.toFixed(2), point.heading.toFixed(2), Boolean(point.moving)].join(":");
      if (!force && key === lastPoint && Date.now() - lastSent < 1000) return undefined;
      lastPoint = key;
      lastSent = Date.now();
      inFlight = campusRequest("input", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ x: point.x, z: point.z, heading: point.heading, moving: Boolean(point.moving) }),
      }).then((result) => {
        if (!alive || !result.player || !worldRef.current) return;
        // The server may correct a stale tab, collision, or an impossible jump.
        const current = worldRef.current.where();
        const sentGap = Math.hypot(result.player.x - point.x, result.player.z - point.z);
        if (sentGap > 2 && Math.hypot(current.x - point.x, current.z - point.z) < 4) worldRef.current.teleport(result.player);
      }).catch((cause) => {
        if (!alive || cause.name === "AbortError") return;
        if (cause.status === 401 || cause.status === 409) {
          onlineRef.current.connected = false;
          source.close();
          setConnection("disconnected");
        }
        setError(cause.message);
      }).finally(() => { inFlight = null; });
      pendingRef.current = inFlight;
      return inFlight;
    };
    sendRef.current = send;
    const onWorld = (event) => {
      if (!alive) return;
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
      if (!alive) return;
      onlineRef.current.connected = false;
      setConnection("reconnecting");
    };
    const timer = window.setInterval(() => { void send(); }, 100);
    const resume = () => { if (!document.hidden) void send(true); };
    document.addEventListener("visibilitychange", resume);
    return () => {
      alive = false;
      source.close();
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      onlineRef.current.connected = false;
      sendRef.current = null;
      pendingRef.current = null;
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
      setError(cause.message);
      throw cause;
    } finally {
      actionBusyRef.current = false;
    }
  }, [worldRef]);

  const reconnect = useCallback(() => { setError(""); setRetry((value) => value + 1); }, []);
  return { onlineRef, snapshot, connection, error, action, reconnect, clearError: () => setError("") };
};
