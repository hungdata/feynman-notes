import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { EventEmitter } from "node:events";

process.env.AUTH_SESSION_SECRET = "football-online-integration-secret-123456";
process.env.LOCAL_MODE = "on";
delete process.env.NODE_ENV;
const { createApp } = await import("../app.js");
const { createFileStore } = await import("../storage/fileStore.js");
const { setStore } = await import("../storage/index.js");
const { createFootballRooms } = await import("../football/rooms.js");

const setup = async (t, roomOptions = {}) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "football-online-"));
  const store = setStore(createFileStore(dataDir));
  const app = createApp({ footballRooms: createFootballRooms(roomOptions) });
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const streams = [];
  t.after(async () => {
    for (const stream of streams) stream.close();
    app.locals.campus.close();
    app.locals.football.close();
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
    const response = await fetch(`${base}/api/football/rooms/${code}/events`, { headers: { Cookie: cookie }, signal: controller.signal });
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
  return { call, guest, events, store, rooms: app.locals.football };
};

test("đá online cần đăng nhập Google hoặc khách", async (t) => {
  const { call } = await setup(t);
  const response = await call("POST", "/api/football/quick");
  assert.equal(response.status, 401);
  assert.equal(response.body.code, "FOOTBALL_AUTH_REQUIRED");
});

test("hai người: tạo phòng, vào bằng mã, sẵn sàng → máy chủ chạy trận và gửi ảnh chụp cho cả hai", async (t) => {
  const { call, guest, events, rooms } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const created = await call("POST", "/api/football/rooms", { halfMinutes: 3 }, a);
  assert.equal(created.status, 200);
  const code = created.body.code;
  assert.match(code, /^[A-Z2-9]{5}$/);
  const streamA = await events(a, code);
  await streamA.until("lobby", (lobby) => lobby.you === 0);
  const joined = await call("POST", `/api/football/rooms/${code}/join`, {}, b);
  assert.equal(joined.body.you, 1);
  const streamB = await events(b, code);
  await streamA.until("lobby", (lobby) => lobby.seats[1]?.connected);
  // Người thứ ba không vào được.
  const c = await guest();
  assert.equal((await call("POST", `/api/football/rooms/${code}/join`, {}, c)).status, 409);

  await call("POST", `/api/football/rooms/${code}/ready`, { ready: true, formation: "4-4-2", kit: "yellow", assist: "manual" }, a);
  await call("POST", `/api/football/rooms/${code}/ready`, { ready: true, formation: "3-5-2", kit: "yellow" }, b);
  const startA = await streamA.until("start");
  const startB = await streamB.until("start");
  assert.deepEqual(startA.config, startB.config);
  assert.equal(startA.config.homeFormation, "4-4-2");
  assert.equal(startA.config.awayFormation, "3-5-2");
  assert.notEqual(startA.config.awayKit, startA.config.homeKit, "trùng màu áo thì đội khách đổi áo");
  const state = await streamB.until("state");
  assert.equal(state.p.length, 22);
  assert.equal(state.ph, "kickoff");
  assert.deepEqual(state.ctl.map((id) => id >= 0), [true, true]);

  // Đội nhà giao bóng: chuyền S; đội khách bấm cũng không làm gì được.
  assert.equal((await call("POST", `/api/football/rooms/${code}/act`, { action: "short", opts: { power: 0.3 } }, b)).body.ok, false);
  await new Promise((resolve) => setTimeout(resolve, 800));
  assert.equal((await call("POST", `/api/football/rooms/${code}/act`, { action: "short", opts: { power: 0.3, aim: { x: 0, z: 0 } } }, a)).body.ok, true);
  const playing = await streamA.until("state", (pack) => pack.ph === "play");
  assert.ok(playing.ev.some((event) => event.type === "pass") || playing.b[8] >= 0 || playing.ph === "play");

  // Phím đang giữ của đội khách được máy chủ dùng.
  const input = await call("POST", `/api/football/rooms/${code}/input`, { mx: 1, mz: 0, sprint: true, press: true, hack: 99 }, b);
  assert.equal(input.body.ok, true);
  const match = rooms.rooms.get(code).match;
  assert.equal(match.humans[1].input.sprint, true);
  assert.equal(match.humans[1].input.press, true);
  assert.equal(match.humans[1].input.hack, undefined, "chỉ nhận phím hợp lệ");
  assert.equal(match.humans[0].assist, "manual");
  assert.equal(match.humans[1].assist, "assisted");
});

test("máy chủ kiểm tra lệnh: sai tên lệnh bị từ chối, chưa vào phòng thì không gửi được", async (t) => {
  const { call, guest } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const { body } = await call("POST", "/api/football/rooms", {}, a);
  assert.equal((await call("POST", `/api/football/rooms/${body.code}/act`, { action: "teleportBall" }, a)).status, 400);
  assert.equal((await call("POST", `/api/football/rooms/${body.code}/act`, { action: "short" }, b)).status, 403);
  assert.equal((await call("POST", "/api/football/rooms/ZZZZZ/join", {}, b)).status, 404);
});

test("tìm trận nhanh ghép hai người vào cùng một phòng công khai", async (t) => {
  const { call, guest, events } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const first = await call("POST", "/api/football/quick", {}, a);
  assert.equal(first.body.you, 0);
  const stream = await events(a, first.body.code);
  await stream.until("lobby");
  const second = await call("POST", "/api/football/quick", {}, b);
  assert.equal(second.body.code, first.body.code);
  assert.equal(second.body.you, 1);
});

test("mất kết nối: máy đá thay; quá lâu thì trận kết thúc, người còn lại được báo", async (t) => {
  const { call, guest, events, rooms } = await setup(t, { seatTimeoutMs: 3000 });
  const [a, b] = await Promise.all([guest(), guest()]);
  const { body } = await call("POST", "/api/football/rooms", {}, a);
  await call("POST", `/api/football/rooms/${body.code}/join`, {}, b);
  const streamA = await events(a, body.code);
  const streamB = await events(b, body.code);
  await call("POST", `/api/football/rooms/${body.code}/ready`, { ready: true }, a);
  await call("POST", `/api/football/rooms/${body.code}/ready`, { ready: true }, b);
  await streamA.until("start");
  streamB.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const room = rooms.rooms.get(body.code);
  rooms.tick();
  assert.ok(room.match.humans[1], "rớt mạng thoáng qua: vẫn giữ quyền điều khiển");
  await new Promise((resolve) => setTimeout(resolve, 2200));
  rooms.tick();
  assert.equal(room.match.humans[1], null, "mất kết nối hơn 2 giây: máy đá thay");
  const end = await streamA.until("end", () => true, 6000);
  assert.match(end.reason, /rời trận/);
});

test("rời trận khi đang đá: máy chủ không sập, người còn lại được báo kết thúc", async (t) => {
  const { call, guest, events } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const { body } = await call("POST", "/api/football/rooms", {}, a);
  await call("POST", `/api/football/rooms/${body.code}/join`, {}, b);
  const streamA = await events(a, body.code);
  const streamB = await events(b, body.code);
  await call("POST", `/api/football/rooms/${body.code}/ready`, { ready: true }, a);
  await call("POST", `/api/football/rooms/${body.code}/ready`, { ready: true }, b);
  await streamA.until("start");
  await streamB.until("state");
  assert.equal((await call("POST", `/api/football/rooms/${body.code}/leave`, {}, b)).status, 200);
  const end = await streamA.until("end");
  assert.match(end.reason, /rời trận/);
  // Máy chủ vẫn sống và trả lời bình thường.
  assert.equal((await call("POST", "/api/football/quick", {}, a)).status, 200);
});

test("hai khách cùng phòng có tên khác nhau", async (t) => {
  const { call, guest } = await setup(t);
  const [a, b] = await Promise.all([guest(), guest()]);
  const { body } = await call("POST", "/api/football/rooms", {}, a);
  const joined = await call("POST", `/api/football/rooms/${body.code}/join`, {}, b);
  const [first, second] = joined.body.seats.map((seat) => seat.name);
  assert.match(first, /^Khách /);
  assert.notEqual(first, second);
});

test("room probes validate account ownership without joining, and cached names never bypass authentication", async (t) => {
  const { call, guest, store, rooms } = await setup(t);
  const original = store.campusProfiles.get.bind(store.campusProfiles);
  let reads = 0;
  store.campusProfiles.get = (...args) => { reads += 1; return original(...args); };
  const [a, b] = await Promise.all([guest(), guest()]);
  const created = await call("POST", "/api/football/rooms", {}, a);
  const route = `/api/football/rooms/${created.body.code}`;
  assert.equal((await call("GET", route)).status, 401);
  assert.equal((await call("GET", route, undefined, b)).status, 403);
  assert.equal(rooms.rooms.get(created.body.code).seats[1], null);
  for (let packet = 0; packet < 15; packet += 1) {
    assert.equal((await call("POST", `${route}/input`, { mx: 0, mz: 0 }, a)).status, 200);
  }
  const probe = await call("GET", route, undefined, a);
  assert.deepEqual(probe.body, created.body);
  assert.equal(reads, 2, "one optional display-name lookup per authenticated account, not per movement packet");
  assert.equal((await call("GET", route, undefined, `${a}tampered`)).status, 401);
  assert.equal((await call("GET", "/api/football/rooms/ZZZZZ", undefined, b)).status, 404);
  assert.doesNotMatch(JSON.stringify(probe.body), /guest:|userId|ownerId|email/);
  assert.equal((await call("POST", `${route}/ready`, { formation: "constructor", kit: "__proto__", ready: true }, a)).status, 200);
  const safe = (await call("GET", route, undefined, a)).body.seats[0];
  assert.equal(safe.formation, "4-3-3");
  assert.equal(safe.kit, "red");
  assert.equal((await call("POST", `${route}/ready`, [], a)).status, 400);
});

const fakeStream = () => Object.assign(new EventEmitter(), {
  writableLength: 0, writableEnded: false, messages: [],
  write(message) { this.messages.push(message); },
  end() { if (this.writableEnded) return; this.writableEnded = true; this.emit("close"); },
  destroy() { this.destroyed = true; this.emit("close"); },
});
const home = { id: "fixture-home", name: "Home" };
const away = { id: "fixture-away", name: "Away" };

test("room capacity, one-room membership and abandoned lobby expiry bound server resources", (t) => {
  let clock = 10_000;
  const runtime = createFootballRooms({ now: () => clock, maxRooms: 1, idleRoomMs: 2000 });
  t.after(() => runtime.close());
  const first = runtime.create(home);
  assert.equal(runtime.create(home).code, first.code, "a repeated create restores the same seat");
  assert.equal(runtime.rooms.size, 1);
  assert.throws(() => runtime.create(away), (error) => error.code === "FOOTBALL_BUSY");
  clock += 2001;
  runtime.tick();
  assert.equal(runtime.rooms.size, 0, "lobbies expire even if no match ever started");
  const second = runtime.create(away);
  runtime.join(home, second.code);
  assert.equal(runtime.quick(home).code, second.code);
  runtime.leave(home, second.code);
  runtime.leave(away, second.code);
  assert.equal(runtime.rooms.size, 0);
  assert.ok(runtime.create(home).code, "expired and removed memberships do not block future play");
});

test("held controls expire independently of a live SSE stream and actions, and packet rates are bounded", (t) => {
  let clock = 10_000;
  const runtime = createFootballRooms({ now: () => clock });
  t.after(() => runtime.close());
  const { code } = runtime.create(home);
  runtime.join(away, code);
  runtime.connect(home, code, fakeStream());
  runtime.connect(away, code, fakeStream());
  runtime.ready(home, code, { ready: true });
  runtime.ready(away, code, { ready: true });
  runtime.input(home, code, { mx: 1.5, mz: 1.5, sprint: true, press: true, callPress: true, hack: 999 });
  const human = runtime.rooms.get(code).match.humans[0];
  assert.ok(Math.hypot(human.input.mx, human.input.mz) <= 1 + 1e-12);
  assert.equal(human.input.hack, undefined);
  clock += 800;
  runtime.action(home, code, { action: "switch" });
  clock += 201;
  runtime.tick();
  assert.equal(human.input.mx, 0);
  assert.equal(human.input.sprint, false);
  assert.equal(human.input.press, false);
  assert.equal(human.input.callPress, false);
  assert.ok(runtime.rooms.get(code).seats[0].streams.size, "connection remains live while stale keys release");
  for (let packet = 0; packet < 70; packet += 1) runtime.input(home, code, {});
  assert.throws(() => runtime.input(home, code, {}), (error) => error.status === 429);
});

test("SSE sessions expire independently, and stale seat callbacks cannot disturb a rejoin or promotion", (t) => {
  let clock = 10_000;
  const runtime = createFootballRooms({ now: () => clock });
  t.after(() => runtime.close());
  const { code } = runtime.create(home);
  runtime.join(away, code);
  const old = fakeStream();
  const current = fakeStream();
  runtime.connect(home, code, old, clock + 100);
  runtime.connect(home, code, current, clock + 5000);
  clock += 101;
  runtime.tick();
  assert.equal(old.writableEnded, true);
  assert.equal(current.writableEnded, false);
  assert.equal(runtime.rooms.get(code).seats[0].streams.size, 1);
  assert.throws(() => runtime.connect(home, code, fakeStream(), clock - 1), (error) => error.status === 401);
  runtime.leave(home, code);
  const promoted = runtime.rooms.get(code).seats[0];
  assert.equal(promoted.userId, away.id);
  runtime.join(home, code);
  const rejoined = fakeStream();
  runtime.connect(home, code, rejoined, clock + 5000);
  old.emit("close");
  current.emit("close");
  assert.equal(runtime.rooms.get(code).seats[1].streams.size, 1);
  assert.equal(runtime.view(home, code).you, 1);
  assert.equal(runtime.view(away, code).you, 0);
});

test("forfeit sends an authoritative winning score before end, and one account cannot occupy another room", (t) => {
  const runtime = createFootballRooms();
  t.after(() => runtime.close());
  const { code } = runtime.create(home);
  const other = runtime.create({ id: "fixture-other", name: "Other" });
  assert.throws(() => runtime.join(home, other.code), (error) => error.code === "FOOTBALL_ALREADY_SEATED");
  runtime.join(away, code);
  const watcher = fakeStream();
  runtime.connect(home, code, watcher);
  runtime.connect(away, code, fakeStream());
  runtime.ready(home, code, { ready: true });
  runtime.ready(away, code, { ready: true });
  runtime.rooms.get(code).match.teams[1].score = 5;
  runtime.leave(away, code);
  const end = watcher.messages.findIndex((message) => message.startsWith("event: end"));
  assert.ok(end > 0);
  const final = JSON.parse(watcher.messages[end - 1].split("data: ")[1]);
  assert.equal(final.ph, "fulltime");
  assert.deepEqual(final.sc, [6, 5]);
  const result = JSON.parse(watcher.messages[end].split("data: ")[1]);
  assert.deepEqual(result.score, [6, 5], "forfeit winner beats even a previously higher opponent score");
  assert.equal(runtime.view(home, code).status, "lobby", "remaining player can invite a replacement");
});
