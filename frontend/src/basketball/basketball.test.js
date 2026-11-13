import test from "node:test";
import assert from "node:assert/strict";
import { COURT, POSITIONS, RULES } from "./constants.js";
import { IDEAL_RELEASE, releaseQuality, shotChance, contestOf } from "./actions.js";
import { act, createMatch, drainEvents, startNextPeriod, stepMatch, userContext } from "./sim.js";
import { attackHoop, dist, holder, isThree } from "./util.js";
import { applyPack, cleanAction, cleanInput, packMatch, smoothView } from "./net.js";
import { createController, keyName, touchButtons } from "./controls.js";

const run = (match, seconds, step = 1 / 30) => {
  const events = [];
  for (let t = 0; t < seconds; t += step) {
    stepMatch(match, step);
    events.push(...drainEvents(match));
  }
  return events;
};
const runUntil = (match, predicate, limit = 60, step = 1 / 60) => {
  const events = [];
  for (let t = 0; t < limit; t += step) {
    stepMatch(match, step);
    events.push(...drainEvents(match));
    if (predicate(match, events)) return events;
  }
  throw new Error(`condition not reached in ${limit}s (phase ${match.phase})`);
};
/** Đưa trận tới lúc đội của người chơi cầm bóng trong lúc bóng sống. */
const userHasBall = (match) => match.phase === "live" && holder(match)?.team === match.user.team && !holder(match).act;

test("hai đội 5 người đủ vị trí, trận mở bằng nhảy tranh bóng ở vòng giữa sân", () => {
  const match = createMatch({ seed: 5 });
  assert.equal(match.players.length, 10);
  for (const team of [0, 1]) assert.deepEqual(match.players.filter((p) => p.team === team).map((p) => p.pos), POSITIONS);
  assert.equal(match.phase, "tipoff");
  const centers = match.players.filter((p) => p.pos === "C");
  for (const c of centers) assert.ok(Math.hypot(c.x, c.z) < 1, "hai trung phong đứng ở vòng tròn giữa sân");
  assert.equal(match.clock, 3 * 60);
  assert.equal(match.shotClock, RULES.shotClock);
  const events = runUntil(match, (m) => m.phase === "live" && m.ball.owner !== null, 6);
  assert.ok(events.some((e) => e.type === "tip"));
  assert.equal(match.arrow, 1 - match.possession, "đội thua nhảy bóng được phát bóng hiệp sau");
});

test("vạch 3 điểm: cung 6.75 m, góc 6.6 m tính từ giữa; ném từ phần sân bên kia cũng 3 điểm", () => {
  const hoopX = COURT.hoopX;
  assert.equal(isThree({ x: hoopX - 6.6, z: 0 }, hoopX), false);
  assert.equal(isThree({ x: hoopX - 6.9, z: 0 }, hoopX), true);
  assert.equal(isThree({ x: COURT.halfL - 0.5, z: 6.7 }, hoopX), true, "góc");
  assert.equal(isThree({ x: COURT.halfL - 0.5, z: 6.4 }, hoopX), false, "sát góc nhưng trong vạch");
  assert.equal(isThree({ x: hoopX - 1, z: 2 }, hoopX), false);
  assert.equal(isThree({ x: -3, z: 0 }, hoopX), true);
});

test("tỉ lệ vào rổ: lên rổ cao hơn ném xa, bị kèm sát và nhả bóng sai nhịp thì thấp hơn", () => {
  const match = createMatch({ seed: 2 });
  const shooter = match.players[1];
  const hoop = attackHoop(match, shooter.team);
  const far = { ...shooter, x: hoop.x - Math.sign(hoop.x) * 7.2, z: 0, vx: 0, vz: 0 };
  const near = { ...shooter, x: hoop.x - Math.sign(hoop.x) * 1.5, z: 0, vx: 0, vz: 0 };
  const openThree = shotChance(match, far, { kind: "jumper", quality: 1, contest: 0, hoop });
  const layup = shotChance(match, near, { kind: "layup", quality: 1, contest: 0, hoop });
  assert.ok(layup > openThree, `lên rổ ${layup} > ném xa ${openThree}`);
  assert.ok(shotChance(match, far, { kind: "jumper", quality: 1, contest: 0.9, hoop }) < openThree * 0.7);
  assert.ok(shotChance(match, far, { kind: "jumper", quality: 0, contest: 0, hoop }) < openThree * 0.6);
  assert.ok(releaseQuality(IDEAL_RELEASE) > 0.99);
  assert.ok(releaseQuality(IDEAL_RELEASE + 0.2, "manual") === 0, "thủ công: cửa sổ nhả bóng hẹp");
  assert.ok(releaseQuality(IDEAL_RELEASE + 0.2, "assisted") > 0, "hỗ trợ cao: cửa sổ rộng hơn");
  // Hậu vệ đứng chắn giữa người ném và rổ làm tăng mức kèm.
  const defender = match.players.find((p) => p.team !== shooter.team);
  Object.assign(defender, { x: far.x + Math.sign(hoop.x) * 0.9, z: 0, y: 0 });
  for (const p of match.players) if (p !== defender && p.team !== shooter.team) Object.assign(p, { x: -hoop.x, z: 5 });
  assert.ok(contestOf(match, far, hoop) > 0.4);
});

test("máy đấu với máy: đủ 4 hiệp, có người thắng, điểm khớp với số liệu", () => {
  for (const seed of [11, 12]) {
    const match = createMatch({ seed, autoplay: true, quarterMinutes: 2 });
    const events = run(match, 900);
    assert.equal(match.phase, "fulltime", `seed ${seed}: hết trận`);
    assert.ok(match.quarter >= 4);
    const [a, b] = match.teams;
    assert.notEqual(a.score, b.score, "không hoà (có hiệp phụ)");
    for (const team of match.teams) {
      const s = team.stats;
      assert.equal(team.score, s.pts);
      assert.equal(s.pts, (s.fgm - s.tpm) * 2 + s.tpm * 3 + s.ftm, "điểm = 2×(trúng 2) + 3×(trúng 3) + ném phạt");
      assert.ok(s.fga >= 15 && s.fga <= 60, `số lần ném hợp lý (${s.fga})`);
      assert.ok(s.fgm / s.fga > 0.2 && s.fgm / s.fga < 0.75, `tỉ lệ ném trúng hợp lý (${s.fgm}/${s.fga})`);
      assert.ok(s.to < 20, `mất bóng không quá nhiều (${s.to})`);
    }
    assert.ok(events.some((e) => e.type === "halftime"));
    assert.equal(events.filter((e) => e.type === "buzzer").length, match.quarter);
    for (const p of match.players) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  }
});

test("cùng hạt giống thì trận lặp lại y hệt (để máy chủ và máy khách khớp nhau)", () => {
  const a = createMatch({ seed: 99, autoplay: true });
  const b = createMatch({ seed: 99, autoplay: true });
  run(a, 40);
  run(b, 40);
  assert.deepEqual(a.teams.map((t) => t.score), b.teams.map((t) => t.score));
  assert.deepEqual(a.players.map((p) => [p.x.toFixed(4), p.z.toFixed(4)]), b.players.map((p) => [p.x.toFixed(4), p.z.toFixed(4)]));
});

test("có bóng: S chuyền làm đổi người điều khiển sang người nhận, D giữ–thả ném rổ đúng nhịp", () => {
  const match = createMatch({ seed: 21, difficulty: "easy" });
  runUntil(match, userHasBall, 40);
  assert.equal(userContext(match), "ball");
  const passer = holder(match);
  assert.equal(match.user.controlledId, passer.id);
  assert.ok(act(match, "pass", {}));
  assert.equal(match.ball.flight.kind, "pass");
  const receiver = match.ball.flight.to;
  assert.notEqual(receiver, passer.id);
  stepMatch(match, 1 / 60);
  assert.equal(match.user.controlledId, receiver, "điều khiển chuyển sang người nhận bóng ngay");
  runUntil(match, userHasBall, 40);
  const shooter = holder(match);
  assert.ok(act(match, "shoot", {}));
  assert.equal(shooter.act.type, "shot");
  assert.ok(act(match, "shootRelease", { hold: IDEAL_RELEASE }));
  const events = runUntil(match, (m, ev) => ev.some((e) => e.type === "shot"), 2);
  const shot = events.find((e) => e.type === "shot");
  assert.equal(shot.id, shooter.id);
  if (shot.kind === "jumper") assert.ok(shot.quality > 0.95, "thả đúng lúc: nhả bóng hoàn hảo");
});

test("phòng ngự: S đổi người, giữ D bám người, A cướp bóng, Q kèm đôi", () => {
  const match = createMatch({ seed: 8 });
  runUntil(match, (m) => m.phase === "live" && holder(m) && holder(m).team !== m.user.team && !holder(m).act, 60);
  assert.equal(userContext(match), "defense");
  const before = match.user.controlledId;
  assert.ok(act(match, "switch", {}));
  const carrier = holder(match);
  const now = match.players[match.user.controlledId];
  assert.ok(now.id !== before || dist(now, carrier) < 4);
  // Đổi theo hướng: chọn người ở phía đó.
  const pick = match.players.filter((p) => p.team === match.user.team && p.id !== match.user.controlledId).sort((a, b) => b.x - a.x)[0];
  const me = match.players[match.user.controlledId];
  act(match, "switch", { dir: { x: Math.sign(pick.x - me.x) || 1, z: 0 } });
  assert.ok(match.players[match.user.controlledId].x * Math.sign(pick.x - me.x) >= me.x * Math.sign(pick.x - me.x) - 0.01);
  // Giữ D: máy dẫn người mình đang cầm về chỗ kèm.
  match.user.input.guard = true;
  match.user.input.mx = 0; match.user.input.mz = 0;
  const guarded = match.players[match.user.controlledId];
  run(match, 0.5);
  assert.ok(guarded.goal, "giữ D: có điểm kèm người do máy tính");
  match.user.input.guard = false;
  act(match, "steal", {});
  assert.ok(match.players[match.user.controlledId].cool > 0, "vừa với tay cướp thì phải chờ một nhịp");
  if (holder(match) && holder(match).team !== match.user.team) {
    act(match, "double", {});
    assert.ok(match.double?.team === match.user.team);
  }
});

test("đồng hồ 24 giây: ôm bóng đứng yên quá 24 giây thì mất bóng", () => {
  const match = createMatch({ seed: 31 });
  runUntil(match, userHasBall, 40);
  const team = match.user.team;
  const events = runUntil(match, (m, ev) => ev.some((e) => e.type === "shotClock"), RULES.shotClock + 3);
  assert.ok(events.some((e) => e.type === "turnover" && e.reason === "shotClock"));
  assert.equal(match.possession, 1 - team);
  assert.equal(match.phase, "inbound");
});

test("rê bóng ra ngoài đường biên là mất bóng, đối phương phát bóng biên", () => {
  const match = createMatch({ seed: 41 });
  runUntil(match, userHasBall, 40);
  const team = match.user.team;
  match.user.input.mx = 0;
  match.user.input.mz = 1;
  match.user.input.sprint = true;
  const events = runUntil(match, (m, ev) => ev.some((e) => e.type === "turnover"), 10);
  assert.ok(events.some((e) => e.type === "turnover" && e.reason === "out"));
  assert.equal(match.inbound.team, 1 - team);
  assert.ok(Math.abs(match.inbound.z) > COURT.halfW, "phát bóng từ ngoài biên dọc");
});

test("ném phạt: người chơi giữ–thả D, mỗi quả vào được 1 điểm, quả cuối trượt thì tranh bóng bật bảng", () => {
  const match = createMatch({ seed: 51 });
  runUntil(match, userHasBall, 40);
  const shooter = holder(match);
  const defender = match.players.find((p) => p.team !== shooter.team);
  match.pendingFoul = { by: defender.id, on: shooter.id, shooting: false, t: match.time };
  match.teams[defender.team].fouls = RULES.bonusFouls; // lỗi thứ 5: bị phạt ném 2 quả
  stepMatch(match, 1 / 60);
  assert.equal(match.phase, "freethrow");
  assert.equal(match.ft.total, 2);
  assert.equal(userContext(match), "ft");
  const before = match.teams[shooter.team].score;
  let attempts = 0;
  while (match.phase === "freethrow" && attempts < 4) {
    runUntil(match, (m) => m.phase !== "freethrow" || (m.phaseT >= m.ft.ready && !m.ft.flying), 5);
    if (match.phase !== "freethrow") break;
    assert.ok(act(match, "shoot", {}));
    assert.ok(act(match, "shootRelease", { hold: IDEAL_RELEASE }));
    attempts += 1;
    runUntil(match, (m) => m.phase !== "freethrow" || !m.ft.flying, 3);
  }
  assert.equal(attempts, 2);
  const made = match.teams[shooter.team].stats.ftm;
  assert.equal(match.teams[shooter.team].score - before, made);
  assert.equal(match.teams[shooter.team].stats.fta, 2);
});

test("hết hiệp: nghỉ, sang hiệp sau đổi quyền phát bóng; sau hiệp 2 hai đội đổi rổ", () => {
  const match = createMatch({ seed: 61, autoplay: true, quarterMinutes: 2 });
  runUntil(match, (m) => m.phase === "live", 5);
  match.clock = 0.05;
  runUntil(match, (m) => m.phase === "break", 10);
  assert.equal(match.breakKind, "quarter");
  const arrow = match.arrow;
  assert.ok(startNextPeriod(match));
  assert.equal(match.quarter, 2);
  assert.equal(match.inbound.team, arrow, "phát bóng luân phiên");
  const dirs = match.teams.map((t) => t.dir);
  runUntil(match, (m) => m.phase === "live", 5);
  match.clock = 0.05;
  runUntil(match, (m) => m.phase === "break", 10);
  assert.equal(match.breakKind, "half");
  runUntil(match, (m) => m.phase !== "break", RULES.halftimeBreak + 2);
  assert.equal(match.quarter, 3);
  assert.deepEqual(match.teams.map((t) => t.dir), dirs.map((d) => -d));
});

test("hoà sau hiệp 4 thì đá hiệp phụ", () => {
  const match = createMatch({ seed: 71, autoplay: true, quarterMinutes: 2 });
  runUntil(match, (m) => m.phase === "live", 5);
  match.quarter = 4;
  match.teams[0].score = 50;
  match.teams[1].score = 50;
  match.clock = 0.05;
  runUntil(match, (m) => m.phase === "break" || m.phase === "fulltime", 10);
  if (match.teams[0].score === match.teams[1].score) {
    assert.equal(match.phase, "break");
    startNextPeriod(match);
    assert.equal(match.quarter, 5);
    assert.equal(match.clock, 60);
  } else assert.equal(match.phase, "fulltime");
});

test("đóng gói trạng thái online: áp lại ra đúng vị trí, điểm, đồng hồ, người đang điều khiển", () => {
  const server = createMatch({ seed: 81, humans: [0, 1] });
  run(server, 12);
  const pack = JSON.parse(JSON.stringify(packMatch(server, drainEvents(server), { stats: true })));
  const view = createMatch({ seed: 81, humans: [0, 1], localTeam: 1 });
  applyPack(view, pack, { snap: true });
  assert.equal(view.phase, server.phase);
  assert.deepEqual(view.teams.map((t) => t.score), server.teams.map((t) => t.score));
  assert.ok(Math.abs(view.clock - server.clock) < 0.11);
  assert.ok(Math.abs(view.shotClock - server.shotClock) < 0.11);
  view.players.forEach((p, i) => { assert.ok(Math.abs(p.x - server.players[i].x) < 0.01 && Math.abs(p.z - server.players[i].z) < 0.01); });
  assert.equal(view.humans[1].controlledId, server.humans[1].controlledId);
  assert.equal(view.ball.owner, server.ball.owner);
  assert.deepEqual(view.teams[0].stats, server.teams[0].stats);
  smoothView(view, 1 / 60);
  for (const p of view.players) assert.ok(Number.isFinite(p.x));
  // Gói tin rác từ trình duyệt bị lọc.
  assert.deepEqual(cleanInput({ mx: 5, mz: "x", sprint: "yes", guard: true }), { mx: 1, mz: 0, sprint: false, guard: true });
  assert.equal(cleanAction({ action: "teleport" }), null);
  assert.deepEqual(cleanAction({ action: "pass", opts: { dir: { x: 3, z: -0.5 }, hold: 9 } }), { action: "pass", opts: { dir: { x: 1, z: -0.5 }, hold: 2 } });
  assert.deepEqual(cleanAction({ action: "jump", opts: [] }), { action: "jump", opts: {} });
});

test("online match config preserves both players' assist windows in client shot meters", async () => {
  const { basketballEngine } = await import("../../../backend/src/basketball/rooms.js");
  const { config, match: server } = basketballEngine.start({
    settings: { quarterMinutes: 3 },
    seats: [{ name: "One", kit: "orange", assist: "manual" }, { name: "Two", kit: "blue", assist: "semi" }],
  }, 82);
  const wireConfig = JSON.parse(JSON.stringify(config));
  assert.deepEqual([wireConfig.homeAssist, wireConfig.awayAssist], ["manual", "semi"]);
  for (const localTeam of [0, 1]) {
    const view = createMatch({ ...wireConfig, humans: [0, 1], localTeam });
    assert.equal(view.user.assist, server.humans[localTeam].assist);
    for (const hold of [0.35, 0.42, IDEAL_RELEASE, 0.62]) {
      assert.equal(releaseQuality(hold, view.user.assist), releaseQuality(hold, server.humans[localTeam].assist));
    }
  }
  assert.equal(createMatch({ assist: "manual" }).user.assist, "manual", "offline assist setting keeps its default behavior");
});

test("bàn phím kiểu FO4: phím theo event.code (gõ tiếng Việt không sai), mỗi phím làm việc khác nhau tuỳ tình huống", () => {
  assert.equal(keyName({ code: "KeyS", key: "s" }), "S");
  assert.equal(keyName({ code: "KeyD", key: "đ" }), "D", "Unikey đổi chữ nhưng giữ mã phím");
  assert.equal(keyName({ code: "ArrowLeft", key: "ArrowLeft" }), "left");
  assert.equal(keyName({ code: "ShiftLeft", key: "Shift" }), "Shift");
  const calls = [];
  const fake = { phase: "live", user: { team: 0, input: { mx: 0, mz: 0 }, assist: "assisted", controlledId: 0 }, humans: [{ team: 0, controlledId: 0, input: {} }, null], players: [{ act: null }] };
  let context = "ball";
  const controller = createController({ act: (_m, action, opts) => { calls.push([action, opts]); return true; } });
  // Ngữ cảnh lấy từ userContext; giả lập bằng trận nhỏ với holder.
  const withContext = (ctx) => {
    context = ctx;
    fake.ball = ctx === "ball" ? { owner: 0, flight: null } : { owner: 1, flight: null };
    fake.players = [{ id: 0, team: 0, act: null }, { id: 1, team: ctx === "ball" ? 0 : 1, act: null }];
  };
  withContext("ball");
  controller.press(fake, "S", 0); controller.release(fake, "S", 50);
  controller.press(fake, "D", 100); controller.release(fake, "D", 600);
  controller.press(fake, "A", 700); controller.release(fake, "A", 720);
  controller.press(fake, "C", 800); controller.release(fake, "C", 820);
  assert.deepEqual(calls.map(([a]) => a), ["pass", "shoot", "shootRelease", "lob", "crossover"]);
  assert.equal(calls[2][1].hold, 0.5);
  calls.length = 0;
  withContext("defense");
  controller.press(fake, "S", 0); controller.release(fake, "S", 10);
  controller.press(fake, "A", 20); controller.release(fake, "A", 30);
  controller.press(fake, "W", 40); controller.release(fake, "W", 50);
  controller.press(fake, "Q", 60); controller.release(fake, "Q", 70);
  controller.press(fake, "D", 80);
  const { context: seen } = controller.update(fake, null, 90);
  assert.equal(seen, context);
  assert.equal(fake.user.input.guard, true, "giữ D khi phòng ngự = bám người");
  assert.deepEqual(calls.map(([a]) => a), ["switch", "steal", "jump", "double"]);
  assert.ok(touchButtons("ball").some(([key]) => key === "D"));
  assert.ok(touchButtons("defense").some(([key, label]) => key === "S" && label === "Đổi người"));
});
