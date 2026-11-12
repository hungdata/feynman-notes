import express from "express";
import { parseCookies, readSessionClaims } from "../auth/session.js";
import { SESSION_COOKIE } from "../auth/requireAuth.js";
import { getStore } from "../storage/index.js";
import { CampusError, validateProfile } from "../campus/profiles.js";
import { createProfileCache } from "../campus/profileCache.js";
import { EconomyError, FISH, RARITY_NAMES, RODS, buyRod, dropCast, finishCast, getWallet, startCast } from "../campus/economy.js";
import { onDeck } from "../../../frontend/src/campus3d/world.js";

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const CATALOG = { rods: RODS, fish: FISH.map(({ id, name, rarity }) => ({ id, name, rarity })), rarities: RARITY_NAMES };

export const createCampusRouter = (runtime) => {
  const router = express.Router();
  const profileLimits = new Map();
  const profiles = createProfileCache({ load: (ownerId) => getStore().campusProfiles.get(ownerId) });
  router.use((req, res, next) => {
    let user;
    try { user = readSessionClaims(parseCookies(req.headers.cookie)[SESSION_COOKIE], process.env.AUTH_SESSION_SECRET || ""); } catch { /* malformed cookie */ }
    if (!user?.id || !["google", "guest"].includes(user.provider)) {
      return res.status(401).json({ message: "Đăng nhập Google hoặc vào bằng tài khoản khách để chơi online.", code: "CAMPUS_AUTH_REQUIRED" });
    }
    req.campusUser = user;
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/profile", asyncRoute(async (req, res) => {
    const profile = await getStore().campusProfiles.get(req.campusUser.id);
    res.json({ profile });
  }));
  router.put("/profile", asyncRoute(async (req, res) => {
    const timestamp = Date.now();
    for (const [key, state] of profileLimits) if (timestamp - state.start >= 60_000) profileLimits.delete(key);
    const state = profileLimits.get(req.campusUser.id) || { start: timestamp, count: 0 };
    state.count += 1;
    profileLimits.set(req.campusUser.id, state);
    if (state.count > 20) throw new CampusError("Đổi tên quá nhiều lần. Hãy chờ một phút.", 429, "CAMPUS_RATE_LIMIT");
    const profile = await getStore().campusProfiles.save(req.campusUser.id, validateProfile(req.body));
    profiles.remember(req.campusUser.id, profile);
    runtime.updateProfile(profile);
    res.json({ profile });
  }));
  router.get("/wallet", asyncRoute(async (req, res) => {
    res.json({ wallet: await getWallet(req.campusUser.id), catalog: CATALOG });
  }));
  router.post("/shop/rod", asyncRoute(async (req, res) => {
    res.json(await buyRod(req.campusUser.id, String(req.body?.rod || "")));
  }));
  router.use((req, _res, next) => {
    profiles.get(req.campusUser.id).then((profile) => {
      if (!profile) throw new CampusError("Tạo nhân vật trước khi vào sân trường.", 409, "CHARACTER_REQUIRED");
      req.campusProfile = profile;
      next();
    }).catch(next);
  });
  router.get("/events", (req, res, next) => {
    try {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      req.socket.setTimeout(0);
      runtime.connect(req.campusProfile, res, req.campusUser.exp);
    } catch (error) { next(error); }
  });
  router.post("/input", (req, res, next) => {
    try { res.json({ ok: true, player: runtime.input(req.campusProfile.id, req.body) }); } catch (error) { next(error); }
  });
  router.post("/action", (req, res, next) => {
    try { res.json(runtime.action(req.campusProfile.id, req.body)); } catch (error) { next(error); }
  });
  const requireDeck = (req) => {
    const player = runtime.players.get(req.campusProfile.id);
    if (!player || !player.streams.size) throw new CampusError("Kết nối lại sân trường trước khi câu cá.", 409, "CAMPUS_DISCONNECTED");
    if (player.sport || !onDeck(player)) throw new EconomyError("Đến sàn câu ở cuối cầu gỗ để thả câu.", "FISHING_DECK_REQUIRED", 409);
  };
  router.post("/fishing/cast", asyncRoute(async (req, res) => {
    requireDeck(req);
    res.status(201).json(await startCast(req.campusUser.id));
  }));
  router.post("/fishing/catch", asyncRoute(async (req, res) => {
    requireDeck(req);
    res.json(await finishCast(req.campusUser.id, String(req.body?.castId || "")));
  }));
  router.post("/fishing/release", asyncRoute(async (req, res) => {
    await dropCast(req.campusUser.id, String(req.body?.castId || ""));
    res.status(204).end();
  }));
  router.use((error, _req, res, next) => {
    if (!(error instanceof CampusError) && !(error instanceof EconomyError)) return next(error);
    return res.status(error.status).type("json").json({ message: error.message, code: error.code });
  });
  return router;
};
