import crypto from "node:crypto";
import { getStore } from "../storage/index.js";

/**
 * Gold, the fishing rod and the fish book of one player.
 *
 * The lake is refereed here, not in the browser: the server picks the fish
 * when the line is cast, enforces bite/reel timing, and refuses catch replays.
 */
export const FISH = [
  { id: "shoe", name: "Chiếc giày cũ", rarity: "junk", weight: 7, size: [22, 30], gold: [1, 2], pull: 0.3 },
  { id: "ro", name: "Cá rô đồng", rarity: "common", weight: 30, size: [8, 16], gold: [5, 9], pull: 0.45 },
  { id: "diec", name: "Cá diếc", rarity: "common", weight: 26, size: [10, 20], gold: [6, 11], pull: 0.5 },
  { id: "me", name: "Cá mè", rarity: "common", weight: 18, size: [20, 40], gold: [9, 15], pull: 0.58 },
  { id: "chep", name: "Cá chép", rarity: "uncommon", weight: 13, size: [25, 50], gold: [16, 28], pull: 0.7 },
  { id: "tre", name: "Cá trê", rarity: "uncommon", weight: 10, size: [25, 45], gold: [18, 30], pull: 0.76 },
  { id: "loc", name: "Cá lóc", rarity: "rare", weight: 5, size: [35, 70], gold: [40, 65], pull: 0.88 },
  { id: "koi", name: "Cá koi", rarity: "rare", weight: 3, size: [30, 60], gold: [60, 95], pull: 0.94 },
  { id: "chepvang", name: "Cá chép vàng", rarity: "legendary", weight: 1, size: [50, 80], gold: [180, 260], pull: 1.08 },
];
export const RARITY_NAMES = { junk: "Đồ bỏ", common: "Thường gặp", uncommon: "Ít gặp", rare: "Hiếm", legendary: "Huyền thoại" };

/** `zone` is how tall the catch zone of the reeling game is; `luck` makes better fish bite more often. */
export const RODS = [
  { id: "bamboo", name: "Cần tre", price: 0, zone: 0.3, luck: 0 },
  { id: "oak", name: "Cần gỗ sồi", price: 150, zone: 0.36, luck: 0.6 },
  { id: "carbon", name: "Cần carbon", price: 600, zone: 0.44, luck: 1.3 },
];

const MIN_REEL_MS = 1200;      // nobody lands a fish faster than this after the bite
const MAX_AFTER_BITE_MS = 60_000;
// A store has its own pending casts and locks (also isolates independent test stores).
const states = new WeakMap();
const stateFor = (store) => {
  if (!states.has(store)) states.set(store, { pending: new Map(), queues: new Map() });
  return states.get(store);
};

export class EconomyError extends Error {
  constructor(message, code, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const emptyWallet = () => ({ gold: 0, rod: "bamboo", rods: ["bamboo"], caught: 0, fish: {}, lessonRewards: {} });
const rodOf = (wallet) => RODS.find((rod) => rod.id === wallet.rod) || RODS[0];
const publicWallet = ({ gold, rod, rods, caught, fish }) => ({ gold, rod, rods, caught, fish });

const readWallet = async (store, userId) => {
  const saved = await store.learners.get(userId, "wallet");
  const wallet = { ...emptyWallet(), ...(saved || {}) };
  wallet.gold = Math.max(0, Math.floor(Number(wallet.gold) || 0));
  wallet.rods = [...new Set(["bamboo", ...(Array.isArray(wallet.rods) ? wallet.rods.filter((id) => RODS.some((rod) => rod.id === id)) : [])])];
  if (!wallet.rods.includes(wallet.rod)) wallet.rod = "bamboo";
  wallet.fish = { ...(wallet.fish || {}) };
  wallet.lessonRewards = { ...(wallet.lessonRewards || {}) };
  return wallet;
};
export const getWallet = async (userId) => publicWallet(await readWallet(getStore(), userId));

/** Serialize all wallet and lesson-completion changes for one authenticated owner. */
export const withEconomyOwner = (userId, action) => {
  const store = getStore();
  const { queues } = stateFor(store);
  const run = () => action(store);
  const next = (queues.get(userId) || Promise.resolve()).then(run, run);
  queues.set(userId, next);
  const cleanup = () => { if (queues.get(userId) === next) queues.delete(userId); };
  void next.then(cleanup, cleanup);
  return next;
};

const change = (userId, update) => withEconomyOwner(userId, async (store) => {
  const wallet = await readWallet(store, userId);
  const result = await update(wallet);
  await store.learners.save(userId, "wallet", wallet);
  return { ...result, wallet: publicWallet(wallet) };
});

/** Picks the fish on the hook. Better rods make the heavier fish more likely. */
export const rollFish = (rod, random = Math.random) => {
  const weightOf = (fish) => fish.weight * (["uncommon", "rare", "legendary"].includes(fish.rarity) ? 1 + rod.luck : 1);
  let roll = random() * FISH.reduce((sum, fish) => sum + weightOf(fish), 0);
  const kind = FISH.find((fish) => (roll -= weightOf(fish)) <= 0) || FISH[1];
  const grown = random();
  const size = Math.round(kind.size[0] + (kind.size[1] - kind.size[0]) * grown);
  const gold = Math.round(kind.gold[0] + (kind.gold[1] - kind.gold[0]) * grown);
  return { id: kind.id, name: kind.name, rarity: kind.rarity, size, gold, pull: kind.pull };
};

/** The line goes into the water. The reply says when the fish bites, not which fish it is. */
export const startCast = (userId, { now = Date.now(), random = Math.random } = {}) => withEconomyOwner(userId, async (store) => {
  const { pending } = stateFor(store);
  // Expired, abandoned casts cannot accumulate forever in a long-running server.
  for (const [ownerId, cast] of pending) if (now > cast.biteAt + MAX_AFTER_BITE_MS) pending.delete(ownerId);
  // A deliberate new cast replaces an abandoned line, including after reload.
  // Every later catch/release must still match this new opaque cast id.
  const wallet = await readWallet(store, userId);
  const rod = rodOf(wallet);
  const fish = rollFish(rod, random);
  const biteIn = Math.round(2600 + random() * 6200);
  // One or two harmless nibbles before the real bite; pulling on a nibble loses the fish.
  const nibbles = [0.35, 0.68].filter(() => random() < 0.55).map((part) => Math.round(biteIn * (part + random() * 0.12)));
  const cast = { castId: crypto.randomUUID(), fish, castAt: now, biteAt: now + biteIn };
  pending.set(userId, cast);
  return { castId: cast.castId, biteIn, nibbles, pull: fish.pull, zone: rod.zone };
});

/** The fish is landed: pays the gold and writes it into the fish book. */
export const finishCast = (userId, castId, { now = Date.now() } = {}) => withEconomyOwner(userId, async (store) => {
  const { pending } = stateFor(store);
  const cast = pending.get(userId);
  if (!cast || cast.castId !== castId) throw new EconomyError("Lần thả câu này đã hết hạn. Hãy thả câu lại.", "CAST_UNKNOWN", 409);
  if (now < cast.biteAt + MIN_REEL_MS) throw new EconomyError("Cá chưa cắn câu.", "TOO_EARLY", 409);
  if (now > cast.biteAt + MAX_AFTER_BITE_MS) {
    pending.delete(userId);
    throw new EconomyError("Cá đã bơi đi mất.", "TOO_LATE", 409);
  }
  const wallet = await readWallet(store, userId);
  if (wallet.lastCatchId === castId) {
    pending.delete(userId);
    throw new EconomyError("Lần câu này đã nhận thưởng rồi.", "CAST_UNKNOWN", 409);
  }
  const { fish } = cast;
  const entry = wallet.fish[fish.id] || { count: 0, best: 0 };
  const first = entry.count === 0;
  const record = !first && fish.size > entry.best;
  wallet.fish[fish.id] = { count: entry.count + 1, best: Math.max(entry.best, fish.size) };
  wallet.caught += 1;
  wallet.gold += fish.gold;
  wallet.lastCatchId = castId;
  await store.learners.save(userId, "wallet", wallet);
  pending.delete(userId);
  return { fish: { id: fish.id, name: fish.name, rarity: fish.rarity, size: fish.size, gold: fish.gold }, first, record, wallet: publicWallet(wallet) };
});

/** Gold paid for finishing a lesson for the first time. */
export const LESSON_GOLD = 10;
/** Called while holding withEconomyOwner; the ledger survives retries and restarts. */
export const rewardLesson = async (store, userId, courseId, lessonId, firstCompletion) => {
  const wallet = await readWallet(store, userId);
  const key = crypto.createHash("sha256").update(JSON.stringify([courseId, lessonId])).digest("hex");
  if (!firstCompletion || wallet.lessonRewards[key]) return 0;
  wallet.lessonRewards[key] = true;
  wallet.gold += LESSON_GOLD;
  await store.learners.save(userId, "wallet", wallet);
  return LESSON_GOLD;
};

/** The fish got away (or the player walked off): forget the cast. */
export const dropCast = (userId, castId) => withEconomyOwner(userId, (store) => {
  const { pending } = stateFor(store);
  if (pending.get(userId)?.castId === castId) pending.delete(userId);
});

export const buyRod = (userId, rodId) => change(userId, (wallet) => {
  const rod = RODS.find((item) => item.id === rodId);
  if (!rod) throw new EconomyError("Không có cần câu này.", "ROD_UNKNOWN", 404);
  if (!wallet.rods.includes(rod.id)) {
    if (wallet.gold < rod.price) throw new EconomyError(`Chưa đủ vàng: cần ${rod.price}, bạn có ${wallet.gold}.`, "GOLD_SHORT", 409);
    wallet.gold -= rod.price;
    wallet.rods.push(rod.id);
  }
  wallet.rod = rod.id;
  return { wallet };
});
