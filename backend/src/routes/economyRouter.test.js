import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.AUTH_SESSION_SECRET = "campus-economy-integration-secret-123456";
process.env.LOCAL_MODE = "on";
delete process.env.NODE_ENV;
const { createApp } = await import("../app.js");
const { createFileStore } = await import("../storage/fileStore.js");
const { setStore } = await import("../storage/index.js");
const { createSessionToken } = await import("../auth/session.js");
const { startCast } = await import("../campus/economy.js");
const { DECK } = await import("../../../frontend/src/campus3d/world.js");

const cookie = (owner) => `feynman_session=${createSessionToken({ id: owner, provider: "guest" }, process.env.AUTH_SESSION_SECRET)}`;
const setup = async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "economy-router-"));
  const store = setStore(createFileStore(dataDir));
  const app = createApp();
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(async () => {
    app.locals.campus.close();
    server.closeAllConnections();
    server.close();
    await store.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const call = async (method, route, body, owner = "") => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
      method, headers: { Cookie: owner ? cookie(owner) : "", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const connect = async (owner, name) => {
    const profile = (await call("PUT", "/api/campus/profile", { name, gender: "male" }, owner)).body.profile;
    const stream = Object.assign(new EventEmitter(), { write() {}, end() {}, writableLength: 0 });
    return app.locals.campus.connect(profile, stream);
  };
  return { store, call, connect };
};

test("fishing APIs require a campus account and an online player on the deck", async (t) => {
  const { call, connect } = await setup(t);
  for (const [method, route] of [["GET", "/wallet"], ["POST", "/shop/rod"], ["POST", "/fishing/cast"], ["POST", "/fishing/catch"], ["POST", "/fishing/release"]]) {
    assert.equal((await call(method, `/api/campus${route}`)).status, 401);
  }
  const wallet = await call("GET", "/api/campus/wallet", undefined, "guest:one");
  assert.equal(wallet.status, 200);
  assert.equal(wallet.body.catalog.rods[1].price, 150);
  assert.equal(wallet.body.wallet.gold, 0);
  const player = await connect("guest:one", "Bạn Câu Cá");
  assert.equal((await call("POST", "/api/campus/fishing/cast", {}, "guest:one")).body.code, "FISHING_DECK_REQUIRED");
  Object.assign(player, { x: DECK.x, z: DECK.z });
  const cast = await call("POST", "/api/campus/fishing/cast", { fish: "chepvang", gold: 999999 }, "guest:one");
  assert.equal(cast.status, 201);
  assert.equal((await call("POST", "/api/campus/fishing/catch", { castId: cast.body.castId }, "guest:one")).body.code, "TOO_EARLY");
  assert.equal((await call("POST", "/api/campus/fishing/release", { castId: cast.body.castId }, "guest:one")).status, 204);
  const mature = await startCast("guest:one", { now: Date.now() - 15_000, random: () => 0.2 });
  player.x = 0;
  assert.equal((await call("POST", "/api/campus/fishing/catch", { castId: mature.castId }, "guest:one")).body.code, "FISHING_DECK_REQUIRED");
  Object.assign(player, { x: DECK.x, z: DECK.z });
  const catches = await Promise.all([call("POST", "/api/campus/fishing/catch", { castId: mature.castId, gold: 999999 }, "guest:one"), call("POST", "/api/campus/fishing/catch", { castId: mature.castId }, "guest:one")]);
  assert.deepEqual(catches.map((result) => result.status).sort(), [200, 409]);
  const result = catches.find((value) => value.status === 200).body;
  assert.equal(result.wallet.gold, result.fish.gold);
  assert.equal(result.wallet.caught, 1);
  const poorPurchase = await call("POST", "/api/campus/shop/rod", { rod: "carbon", price: 0, gold: 10000 }, "guest:one");
  assert.equal(poorPurchase.body.code, "GOLD_SHORT");
});

test("lesson completion awards 10 gold once under concurrent retries, with isolated accounts", async (t) => {
  const { store, call } = await setup(t);
  const course = { id: "course", title: "Book", stages: [{ status: "ready", lessons: [{ id: "lesson", title: "One", steps: [{ type: "mcq", id: "question" }] }] }] };
  await store.courses.save("guest:one", course.id, course);
  await store.courses.save("guest:two", course.id, course);
  const route = "/api/courses/course/lessons/lesson/complete";
  const completions = await Promise.all([call("POST", route, { firstTryCorrect: 1, gold: 999999 }, "guest:one"), call("POST", route, { firstTryCorrect: 1 }, "guest:one")]);
  assert.deepEqual(completions.map((result) => result.status), [200, 200]);
  assert.deepEqual(completions.map((result) => result.body.gold).sort((a, b) => a - b), [0, 10]);
  const progress = await store.courseProgress.get("guest:one", course.id);
  assert.equal(progress.lessons.lesson.attempts, 2);
  assert.equal(progress.xp, 17, "first completion and review XP are serialized too");
  assert.equal((await call("GET", "/api/campus/wallet", undefined, "guest:one")).body.wallet.gold, 10);
  assert.equal((await call("GET", "/api/campus/wallet", undefined, "guest:two")).body.wallet.gold, 0);
  assert.equal((await call("POST", route, {}, "guest:two")).body.gold, 10);
  assert.equal((await call("POST", route, {}, "guest:one")).body.gold, 0);
});

test("a failed wallet write leaves first-completion gold retryable", async (t) => {
  const { store, call } = await setup(t);
  const course = { id: "course", title: "Book", stages: [{ status: "ready", lessons: [{ id: "lesson", title: "One", steps: [] }] }] };
  await store.courses.save("guest:one", course.id, course);
  const save = store.learners.save;
  let fail = true;
  store.learners.save = async (owner, id, data) => {
    if (id === "wallet" && fail) {
      fail = false;
      throw Object.assign(new Error("wallet temporarily unavailable"), { status: 503 });
    }
    return save(owner, id, data);
  };
  const route = "/api/courses/course/lessons/lesson/complete";
  assert.equal((await call("POST", route, {}, "guest:one")).status, 503);
  assert.equal(await store.courseProgress.get("guest:one", course.id), null);
  assert.equal((await call("POST", route, {}, "guest:one")).body.gold, 10);
  assert.equal((await call("POST", route, {}, "guest:one")).body.gold, 0);
  assert.equal((await call("GET", "/api/campus/wallet", undefined, "guest:one")).body.wallet.gold, 10);
});
