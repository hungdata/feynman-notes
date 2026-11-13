import express from "express";
import { parseCookies, readSessionClaims } from "../auth/session.js";
import { SESSION_COOKIE } from "../auth/requireAuth.js";
import { getStore } from "../storage/index.js";
import { FootballError } from "../football/rooms.js";

/** Trận bóng đá online 1–1: cần đăng nhập Google hoặc khách (giống sân trường online). */
export const createFootballRouter = (rooms) => {
  const router = express.Router();
  // Held-input packets run at 20 Hz; display-name lookup must not do the same.
  const names = new Map();
  const displayName = async (user) => {
    const cached = names.get(user.id);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = Promise.resolve().then(async () => {
      let name;
      try { name = (await getStore().campusProfiles?.get(user.id))?.name; } catch { /* an optional campus name */ }
      const fallback = user.provider === "guest" ? `Khách ${user.id.replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase()}` : user.name;
      return String(name || fallback || "Người chơi").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || "Người chơi";
    });
    names.delete(user.id);
    names.set(user.id, { value, expiresAt: Date.now() + 30_000 });
    while (names.size > 512) names.delete(names.keys().next().value);
    return value;
  };
  router.use(async (req, res, next) => {
    let user;
    try { user = readSessionClaims(parseCookies(req.headers.cookie)[SESSION_COOKIE], process.env.AUTH_SESSION_SECRET || ""); } catch { /* cookie hỏng */ }
    if (!user?.id || !["google", "guest"].includes(user.provider)) {
      return res.status(401).json({ message: "Đăng nhập Google hoặc vào bằng tài khoản khách để đá online.", code: "FOOTBALL_AUTH_REQUIRED" });
    }
    req.footballUser = { id: user.id, name: await displayName(user) };
    req.footballExpiresAt = user.exp;
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const handle = (fn) => (req, res, next) => {
    try { res.json(fn(req)); } catch (error) { next(error); }
  };
  router.post("/rooms", handle((req) => rooms.create(req.footballUser, req.body)));
  router.post("/quick", handle((req) => rooms.quick(req.footballUser)));
  router.get("/rooms/:code", handle((req) => rooms.view(req.footballUser, req.params.code)));
  router.post("/rooms/:code/join", handle((req) => rooms.join(req.footballUser, req.params.code)));
  router.post("/rooms/:code/ready", handle((req) => rooms.ready(req.footballUser, req.params.code, req.body)));
  router.post("/rooms/:code/input", handle((req) => rooms.input(req.footballUser, req.params.code, req.body)));
  router.post("/rooms/:code/act", handle((req) => rooms.action(req.footballUser, req.params.code, req.body)));
  router.post("/rooms/:code/next", handle((req) => rooms.next(req.footballUser, req.params.code)));
  router.post("/rooms/:code/leave", handle((req) => rooms.leave(req.footballUser, req.params.code)));
  router.get("/rooms/:code/events", (req, res, next) => {
    try {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      req.socket.setTimeout(0);
      rooms.connect(req.footballUser, req.params.code, res, req.footballExpiresAt);
    } catch (error) { next(error); }
  });
  router.use((error, _req, res, next) => {
    if (!(error instanceof FootballError)) return next(error);
    return res.status(error.status).type("json").json({ message: error.message, code: error.code });
  });
  return router;
};
