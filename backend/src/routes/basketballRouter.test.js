import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";

process.env.AUTH_SESSION_SECRET = "basketball-online-integration-secret-123456";
process.env.LOCAL_MODE = "on";
delete process.env.NODE_ENV;
const { createApp } = await import("../app.js");
const { createFileStore } = await import("../storage/fileStore.js");
const { setStore } = await import("../storage/index.js");
const { createBasketballRooms } = await import("../basketball/rooms.js");

const setup = async (t, roomOptions = {}) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "basketball-online-"));
  const store = setStore(createFileStore(dataDir));
  const app = createApp({ basketballRooms: createBasketballRooms(roomOptions) });
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const streams = [];
  t.after(async () => {
    for (const stream of streams) stream.close();
    app.locals.campus.close();
    app.locals.football.close();
    app.locals.basketball.close();
    server.closeAllConnections();
    server.close();
    await store.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const call = async (method, route, body, cookie = "") => {
    const response = await fetch(`${base}${route}`, { method, headers: { Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await response.json().catch(() => null);
    return { status: response.status, body: json, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  };
  const guest = async () => (await call("POST", "/api/auth/guest")).cookie;
  /** Đọc luồng SSE của phòng; until(event, predicate) chờ sự kiện thoả điều kiện. */
  const events = async (cookie, code) => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/basketball/rooms/${code}/events`, { headers: { Cookie: cookie }, signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const stream = {
      close: () => { controller.abort(); void reader.cancel().catch(() => {}); },
      async until(name, predicate = () => true, ms = 6000) {
        const timeout = setTimeout(() => controller.abort(), ms);
        try {
          while (true) {
            let index;
            while ((index = buffer.indexOf("\n\n")) >= 0) {
              const chunk = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const event = chunk.match(/^event: (\w+)/)?.[1];
              const data = JSON.parse(chunk.slice(chunk.indexOf("data: ") + 6));
              if (event === name && predicate(data)) return data;
            }
            const next = await reader.read();
            if (next.done) throw new Error(`SSE ended before ${name}`);
            buffer += decoder.decode(next.value, { stream: true });
          }
        } finally { clearTimeout(timeout); }
      },
    };
    streams.push(stream);
    return stream;
  };
  return { call, guest, events, store, rooms: app.locals.basketball };
};

test("bóng rổ online cần đăng nhập Google hoặc khách", async (t) => {
  const { call } = await setup(t);
  const response = await call("POST", "/api/basketball/quick");
  assert.equal(response.status, 401);
  assert.equal(response.body.code, "BASKETBALL_AUTH_REQUIRED");
});

test("hai người bóng rổ: tạo phòng, vào bằng mã, sẵn sàng → máy chủ chạy trận 5 đấu 5 và gửi ảnh chụp cho cả hai", async (t) => {
  const { call, guest, events, rooms } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const created = await call("POST", "/api/basketball/rooms", { quarterMinutes: 2 }, a);
  assert.equal(created.status, 200);
  assert.equal(created.body.settings.quarterMinutes, 2);
  const code = created.body.code;
  const streamA = await events(a, code);
  await streamA.until("lobby", (lobby) => lobby.you === 0);
  const joined = await call("POST", `/api/basketball/rooms/${code}/join`, {}, b);
  assert.equal(joined.body.you, 1);
  const streamB = await events(b, code);
  await streamA.until("lobby", (lobby) => lobby.seats[1]?.connected);
  assert.equal((await call("POST", `/api/basketball/rooms/${code}/join`, {}, await guest())).status, 409, "phòng chỉ có hai chỗ");

  await call("POST", `/api/basketball/rooms/${code}/ready`, { ready: true, kit: "green", assist: "manual", formation: "4-4-2" }, a);
  await call("POST", `/api/basketball/rooms/${code}/ready`, { ready: true, kit: "green" }, b);
  const startA = await streamA.until("start");
  const startB = await streamB.until("start");
  assert.deepEqual(startA.config, startB.config);
  assert.equal(startA.config.homeKit, "green");
  assert.notEqual(startA.config.awayKit, "green", "trùng màu áo thì đội khách đổi áo");
  assert.equal(startA.config.quarterMinutes, 2);
  assert.equal(startA.config.homeFormation, undefined, "bóng rổ không có sơ đồ bóng đá");
  const state = await streamB.until("state");
  assert.equal(state.p.length, 10);
  assert.equal(state.ph, "tipoff");
  assert.deepEqual(state.ctl.map((id) => id >= 0), [true, true]);

  // Sau nhảy tranh bóng, bóng sống: phím của đội khách được máy chủ dùng, rác bị bỏ.
  const live = await streamA.until("state", (pack) => pack.ph === "live", 8000);
  assert.ok(live.q === 1);
  const input = await call("POST", `/api/basketball/rooms/${code}/input`, { mx: 1, mz: 0, sprint: true, guard: true, hack: 99 }, b);
  assert.equal(input.body.ok, true);
  const match = rooms.rooms.get(code).match;
  assert.equal(match.humans[1].input.sprint, true);
  assert.equal(match.humans[1].input.guard, true);
  assert.equal(match.humans[1].input.hack, undefined);
  assert.equal(match.humans[0].assist, "manual");
  // Lệnh hợp lệ theo tình huống: đội đang phòng ngự bấm đổi người được, đội tấn công thì không.
  const defending = 1 - match.possession;
  const cookie = defending === 0 ? a : b;
  const switched = await call("POST", `/api/basketball/rooms/${code}/act`, { action: "switch", opts: {} }, cookie);
  assert.equal(switched.status, 200);
  assert.equal((await call("POST", `/api/basketball/rooms/${code}/act`, { action: "teleport" }, a)).status, 400);
});

test("bóng rổ: rời trận giữa chừng thì người kia thắng, phòng báo kết thúc", async (t) => {
  const { call, guest, events } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const { body } = await call("POST", "/api/basketball/rooms", {}, a);
  const streamA = await events(a, body.code);
  await call("POST", `/api/basketball/rooms/${body.code}/join`, {}, b);
  const streamB = await events(b, body.code);
  await streamA.until("lobby", (lobby) => lobby.seats[1]?.connected);
  await call("POST", `/api/basketball/rooms/${body.code}/ready`, { ready: true }, a);
  await call("POST", `/api/basketball/rooms/${body.code}/ready`, { ready: true }, b);
  await streamB.until("state");
  assert.equal((await call("POST", `/api/basketball/rooms/${body.code}/leave`, {}, a)).body.ok, true);
  const end = await streamB.until("end");
  assert.match(end.reason, /rời trận/);
  assert.ok(end.score[1] > end.score[0], "người ở lại thắng");
});

test("bóng rổ: tìm trận nhanh ghép hai người, phòng bóng rổ và bóng đá tách riêng", async (t) => {
  const { call, guest, events } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const first = await call("POST", "/api/basketball/quick", {}, a);
  assert.equal(first.body.you, 0);
  await events(a, first.body.code);
  const second = await call("POST", "/api/basketball/quick", {}, b);
  assert.equal(second.body.code, first.body.code);
  assert.equal(second.body.you, 1);
  // Cùng mã nhưng là phòng bóng rổ: bên bóng đá không thấy.
  assert.equal((await call("POST", `/api/football/rooms/${first.body.code}/join`, {}, b)).status, 404);
});

test("period votes expire after automatic resume, ignore active play, and still allow a two-player rematch", (t) => {
  let clock = 10_000;
  const runtime = createBasketballRooms({ now: () => clock });
  t.after(() => runtime.close());
  const home = { id: "period-home", name: "Home" };
  const away = { id: "period-away", name: "Away" };
  const stream = () => Object.assign(new EventEmitter(), { write() {}, end() {}, writableLength: 0 });
  const { code } = runtime.create(home);
  runtime.join(away, code);
  runtime.connect(home, code, stream());
  runtime.connect(away, code, stream());
  runtime.ready(home, code, { ready: true });
  runtime.ready(away, code, { ready: true });
  const room = runtime.rooms.get(code);

  runtime.next(home, code);
  assert.equal(room.rematch.size, 0, "commands during active play cannot pre-vote for a later break");
  Object.assign(room.match, { phase: "break", phaseT: 3.99, breakKind: "quarter" });
  runtime.next(home, code);
  assert.equal(room.rematch.size, 1);
  clock += 50;
  runtime.tick();
  assert.notEqual(room.match.phase, "break", "the simulation automatically resumes the first break");
  assert.equal(room.rematch.size, 0, "that break's vote is cleared even when the simulation resumes it");

  Object.assign(room.match, { phase: "break", phaseT: 0, breakKind: "half", quarter: 2 });
  runtime.next(away, code);
  assert.equal(room.match.phase, "break", "one fresh vote cannot combine with the previous period's vote");
  runtime.next(home, code);
  assert.notEqual(room.match.phase, "break");
  assert.equal(room.match.quarter, 3);
  assert.equal(room.rematch.size, 0);

  room.match.phase = "fulltime";
  room.status = "finished";
  const completed = room.match;
  runtime.next(home, code);
  assert.equal(room.status, "finished");
  runtime.next(away, code);
  assert.equal(room.status, "playing");
  assert.notEqual(room.match, completed, "both completed-game votes still create a new match");
  assert.equal(room.match.quarter, 1);
});
