import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.AUTH_SESSION_SECRET = "campus-online-integration-secret-123456";
process.env.LOCAL_MODE = "on";
delete process.env.NODE_ENV;
const { createApp } = await import("../app.js");
const { createFileStore } = await import("../storage/fileStore.js");
const { setStore } = await import("../storage/index.js");
const { createCampusRuntime } = await import("../campus/runtime.js");
const { validateProfile, mongoProfiles } = await import("../campus/profiles.js");
const { createSessionToken } = await import("../auth/session.js");

const setup = async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "campus-online-"));
  const store = setStore(createFileStore(dataDir));
  const app = createApp();
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const streams = [];
  t.after(async () => {
    for (const stream of streams) stream.close();
    app.locals.campus.close();
    server.closeAllConnections();
    server.close();
    await store.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const call = async (method, route, body, cookie = "") => {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const guest = async () => {
    const response = await call("POST", "/api/auth/guest");
    assert.equal(response.status, 201);
    return response.cookie;
  };
  const events = async (cookie) => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/campus/events`, { headers: { Cookie: cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const reader = response.body.getReader();
    let buffer = "";
    const decoder = new TextDecoder();
    const stream = {
      close: () => { controller.abort(); void reader.cancel().catch(() => {}); },
      async until(predicate) {
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          while (true) {
            let index;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
              const chunk = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              if (!chunk.startsWith("event: world\n")) continue;
              const value = JSON.parse(chunk.slice(chunk.indexOf("data: ") + 6));
              if (predicate(value)) return value;
            }
            const next = await reader.read();
            if (next.done) throw new Error("SSE ended before expected world snapshot");
            buffer += decoder.decode(next.value, { stream: true });
          }
        } finally { clearTimeout(timeout); }
      },
    };
    streams.push(stream);
    return stream;
  };
  return { call, guest, events, dataDir, store, runtime: app.locals.campus };
};

test("campus requires a real guest/Google cookie, even when local notes work", async (t) => {
  const { call, guest } = await setup(t);
  assert.equal((await call("GET", "/api/auth/me")).body.user.provider, "local");
  assert.equal((await call("GET", "/api/campus/profile")).status, 401);
  const expired = createSessionToken({ id: "guest:expired", provider: "guest" }, process.env.AUTH_SESSION_SECRET, Date.now() - 8 * 24 * 60 * 60 * 1000);
  assert.equal((await call("GET", "/api/campus/profile", undefined, `feynman_session=${expired}`)).status, 401);
  assert.equal((await call("POST", "/api/campus/input", { x: 0, z: 58, heading: 0, moving: true })).status, 401);
  const cookie = await guest();
  assert.deepEqual((await call("GET", "/api/campus/profile", undefined, cookie)).body, { profile: null });
  assert.equal((await call("POST", "/api/campus/action", { type: "join", sport: "football" }, cookie)).body.code, "CHARACTER_REQUIRED");
});

test("character names are globally unique under simultaneous normalized claims and survive restart", async (t) => {
  const { call, guest, dataDir } = await setup(t);
  const [one, two] = await Promise.all([guest(), guest()]);
  const claims = await Promise.all([
    call("PUT", "/api/campus/profile", { name: "  BẠN   MỚI  ", gender: "female" }, one),
    call("PUT", "/api/campus/profile", { name: "bạn mới", gender: "male" }, two),
  ]);
  assert.deepEqual(claims.map((item) => item.status).sort(), [200, 409]);
  assert.equal(claims.find((item) => item.status === 409).body.code, "NAME_TAKEN");
  const winner = claims[0].status === 200 ? one : two;
  const profile = (await call("GET", "/api/campus/profile", undefined, winner)).body.profile;
  assert.ok(profile.id);
  assert.deepEqual(Object.keys(profile).sort(), ["gender", "id", "name"]);
  const reloaded = createFileStore(dataDir);
  const records = JSON.parse(fs.readFileSync(path.join(dataDir, "campus-profiles.json"), "utf8"));
  assert.equal(records.length, 1);
  assert.deepEqual(await reloaded.campusProfiles.get(records[0].ownerId), profile);
  for (const body of [{ name: "x", gender: "male" }, { name: "Tên!", gender: "male" }, { name: "Bạn Mới", gender: "other" }, { name: "Tên\u200bẨn", gender: "male" }]) {
    assert.equal((await call("PUT", "/api/campus/profile", body, winner)).status, 400);
  }
  const renamed = await call("PUT", "/api/campus/profile", { name: "Tên Mới", gender: "male" }, winner);
  assert.equal(renamed.body.profile.id, profile.id);
});

test("two independent browsers share presence, positions, sports and departure without private identities", async (t) => {
  const { call, guest, events } = await setup(t);
  const [one, two] = await Promise.all([guest(), guest()]);
  const first = (await call("PUT", "/api/campus/profile", { name: "Minh 01", gender: "male" }, one)).body.profile;
  const second = (await call("PUT", "/api/campus/profile", { name: "Linh 02", gender: "female" }, two)).body.profile;
  const a = await events(one);
  const b = await events(two);
  const [viewA, viewB] = await Promise.all([a.until((world) => world.players.length === 2), b.until((world) => world.players.length === 2)]);
  assert.equal(viewA.selfId, first.id);
  assert.equal(viewB.selfId, second.id);
  assert.deepEqual(viewA.players.map((player) => player.id).sort(), viewB.players.map((player) => player.id).sort());
  assert.doesNotMatch(JSON.stringify(viewA), /guest:|google:|ownerId|email|picture/);
  const moved = await call("POST", "/api/campus/input", { x: 2, z: 58, heading: 1, moving: true }, one);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.player.x, 2);
  const observed = await b.until((world) => world.players.find((player) => player.id === first.id)?.x === 2);
  assert.equal(observed.players.find((player) => player.id === first.id).heading, 1);
  assert.equal(observed.players.find((player) => player.id === second.id).x, 0);
  const teleport = await call("POST", "/api/campus/input", { x: 70, z: 70, heading: 1, moving: true }, one);
  assert.ok(teleport.body.player.x < 6, "later movement is limited by server speed");
  const joined = await call("POST", "/api/campus/action", { type: "join", sport: "football", team: 0, score: [999, 999] }, one);
  assert.equal(joined.status, 200);
  assert.equal(joined.body.player.sport, "football");
  const shared = await b.until((world) => world.players.find((player) => player.id === first.id)?.sport === "football");
  assert.deepEqual(shared.football.score, [0, 0], "clients cannot submit scores");
  assert.ok(Number.isFinite(shared.football.ball.x));
  const kick = await call("POST", "/api/campus/action", { type: "shoot", power: 0.5 }, one);
  assert.equal(kick.status, 200);
  assert.equal(kick.body.event, "kick");
  const kicked = await b.until((world) => world.football.lastEvent?.type === "kick");
  assert.equal(kicked.football.lastEvent.playerId, first.id);
  assert.ok(kicked.football.ball.vx > 0, "the other browser sees the ball kicked by the first browser");
  assert.equal((await call("POST", "/api/campus/action", { type: "join", sport: "basketball", team: 1 }, two)).status, 200);
  assert.equal((await call("POST", "/api/campus/action", { type: "shoot", power: 2 }, two)).status, 400);
  assert.equal((await call("POST", "/api/campus/input", { x: "0", z: 47, heading: 0, moving: true }, two)).status, 400);
  assert.equal((await call("POST", "/api/campus/action", { type: "join", sport: "unknown" }, two)).status, 400);
  const left = await call("POST", "/api/campus/action", { type: "leave" }, one);
  assert.equal(left.body.player.sport, null);
  a.close();
  const remaining = await b.until((world) => world.players.length === 1);
  assert.equal(remaining.players[0].id, second.id);
});

test("the same account in two tabs has one avatar; stale presences and held balls are cleaned", () => {
  let timestamp = 100;
  const runtime = createCampusRuntime({ now: () => timestamp, staleMs: 1000 });
  const stream = () => {
    const value = new EventEmitter();
    value.write = () => true;
    value.end = () => value.emit("close");
    return value;
  };
  const first = stream();
  const second = stream();
  const profile = { id: "public-avatar", name: "Bạn A", gender: "male" };
  try {
    runtime.connect(profile, first);
    runtime.connect(profile, second);
    assert.equal(runtime.snapshot(profile.id).players.length, 1);
    first.emit("close");
    assert.equal(runtime.players.size, 1);
    runtime.action(profile.id, { type: "join", sport: "basketball" });
    timestamp += 1001;
    runtime.tick();
    assert.equal(runtime.players.size, 0);
    assert.equal(runtime.snapshot(profile.id).players.length, 0);
  } finally { runtime.close(); }
});

test("Mongo profile claims refuse writes unless both unique indexes can be enforced", async () => {
  let writes = 0;
  const unavailable = {
    collection: () => ({ createIndex: async () => { throw new Error("permission denied"); }, updateOne: async () => { writes += 1; } }),
  };
  await assert.rejects(() => mongoProfiles(() => unavailable).save("guest:test", validateProfile({ name: "Bạn A", gender: "male" })),
    (error) => error.status === 503);
  assert.equal(writes, 0);
});

test("SSE sessions expire independently per tab and the final expired stream drops possession", () => {
  let timestamp = 100;
  const runtime = createCampusRuntime({ now: () => timestamp });
  const stream = () => {
    const value = new EventEmitter();
    value.ended = false;
    value.write = () => true;
    value.end = () => { value.ended = true; value.emit("close"); };
    return value;
  };
  const first = stream();
  const renewed = stream();
  const profile = { id: "public-session-avatar", name: "Bạn A", gender: "female" };
  try {
    assert.throws(() => runtime.connect(profile, stream(), 100), (error) => error.status === 401);
    runtime.connect(profile, first, 200);
    runtime.connect(profile, renewed, 400);
    runtime.action(profile.id, { type: "join", sport: "basketball" });
    assert.equal(runtime.sports.basketball.holder, profile.id);
    timestamp = 200;
    runtime.tick();
    assert.equal(first.ended, true);
    assert.equal(renewed.ended, false);
    assert.equal(runtime.players.size, 1, "a renewed session keeps the same avatar connected");
    timestamp = 400;
    runtime.tick();
    assert.equal(renewed.ended, true);
    assert.equal(runtime.players.size, 0);
    assert.equal(runtime.sports.basketball.holder, null);
  } finally { runtime.close(); }
});

test("delayed close from a stale stream cannot remove a reconnected avatar with the same profile", () => {
  let timestamp = 100;
  const runtime = createCampusRuntime({ now: () => timestamp, staleMs: 1000 });
  const stream = () => {
    const value = new EventEmitter();
    value.ended = false;
    value.write = () => true;
    // Node's response close notification arrives later than end().
    value.end = () => { value.ended = true; };
    return value;
  };
  const previousStream = stream();
  const newStream = stream();
  const profile = { id: "reconnecting-avatar", name: "Bạn Kết Nối", gender: "male" };
  try {
    const previousPlayer = runtime.connect(profile, previousStream);
    timestamp += 1001;
    runtime.tick();
    assert.equal(previousStream.ended, true);
    assert.equal(runtime.players.size, 0);
    const replacement = runtime.connect(profile, newStream);
    assert.notEqual(replacement, previousPlayer);
    runtime.action(profile.id, { type: "join", sport: "basketball" });
    previousStream.emit("close");
    assert.equal(runtime.players.get(profile.id), replacement);
    assert.equal(newStream.ended, false);
    assert.equal(runtime.sports.basketball.holder, profile.id);
    assert.equal(runtime.input(profile.id, { x: replacement.x, z: replacement.z, heading: replacement.heading, moving: false }).id, profile.id);
    newStream.emit("close");
    assert.equal(runtime.players.size, 0);
  } finally { runtime.close(); }
});
