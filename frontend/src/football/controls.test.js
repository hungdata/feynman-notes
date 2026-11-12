/**
 * Kiểm tra từng phím theo bố cục FIFA Online 4, đi qua đúng đường bấm phím thật:
 * controller.press/release → act → mô phỏng. Mỗi test dựng một tình huống nhỏ trên sân.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FIELD } from "./constants.js";
import { createMatch, drainEvents, startSetPiece, stepMatch, userContext } from "./sim.js";
import { shapeTarget } from "./ai.js";
import { createController, keyName, padKey, touchButtons } from "./controls.js";

const BASIS = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
const FRAME = 1000 / 60;

/** Một “bàn phím” giả có đồng hồ riêng, bước mô phỏng theo từng khung hình. */
const rig = (match) => {
  const pad = createController();
  const log = [];
  let now = 1000;
  const tick = (ms = FRAME) => {
    for (let i = 0; i < Math.max(1, Math.round(ms / FRAME)); i += 1) {
      now += FRAME;
      pad.update(match, BASIS, now);
      stepMatch(match, 1 / 60);
      log.push(...drainEvents(match));
    }
  };
  const press = (key) => { pad.press(match, key, now); log.push(...drainEvents(match)); };
  const release = (key) => { pad.release(match, key, now); log.push(...drainEvents(match)); };
  const hit = (key, ms = 50) => { press(key); tick(ms); release(key); };
  const chord = (first, second, ms = 60) => { press(first); tick(FRAME); hit(second, ms); release(first); };
  const events = (type) => log.filter((event) => event.type === type);
  const clear = () => { log.length = 0; };
  return { pad, tick, press, release, hit, chord, events, clear, log, get now() { return now; } };
};

/** Trận đang đá, bỏ qua giao bóng; đội máy đứng dồn về một góc cho khỏi làm phiền. */
const live = (seed = 1) => {
  const match = createMatch({ seed });
  match.setPiece = null;
  match.phase = "play";
  const dir = match.teams[0].dir;
  match.players.filter((p) => p.team === 1 && p.role !== "GK").forEach((p, i) => Object.assign(p, { x: -dir * (30 + i), z: 30, vx: 0, vz: 0, state: "run", cooldown: 0 }));
  return match;
};

/** Đưa bóng cho cầu thủ `id` của đội nhà tại (x theo hướng tấn công, z). */
const giveBall = (match, id, ahead = 0, z = 0, face = 1) => {
  const dir = match.teams[0].dir;
  const p = match.players[id];
  Object.assign(p, { x: ahead * dir, z, vx: 0, vz: 0, heading: face * (Math.PI / 2) * dir, state: "run", cooldown: 0 });
  Object.assign(match.ball, { owner: id, pass: null, shot: null, offside: null, y: FIELD.ballRadius, inGoal: 0 });
  match.user.controlledId = id;
  p.touchStart = match.time - 1;
  stepMatch(match, 1 / 60);
  drainEvents(match);
  return p;
};

/** Đội máy cầm bóng ở (x, z); người chơi đang điều khiển cầu thủ `mine`. */
const cpuBall = (match, carrierId = 19, mine = 6, gap = 5, still = false) => {
  const carrier = match.players[carrierId];
  const dir = match.teams[0].dir;
  Object.assign(carrier, { x: -10 * dir, z: 0, vx: 0, vz: 0, heading: -dir * (Math.PI / 2), state: "run", cooldown: 0, nextThink: match.time + 99 });
  Object.assign(match.ball, { owner: carrierId, pass: null, shot: null, offside: null });
  carrier.touchStart = match.time;
  // still: người cầm bóng đứng yên (loạng choạng), để đo khoảng cách kèm người cho chính xác.
  if (still) { carrier.state = "stumble"; carrier.stateT = 99; }
  const me = match.players[mine];
  Object.assign(me, { x: (-10 - gap) * dir, z: 0, vx: 0, vz: 0, heading: dir * (Math.PI / 2), state: "run", cooldown: 0 });
  match.user.controlledId = mine;
  match.user.switchedAt = match.time;
  return { carrier, me };
};


/* ================= ngữ cảnh ================= */

test("ngữ cảnh phím đổi đúng: có bóng, phòng ngự, thủ môn ôm bóng, tình huống cố định", () => {
  const match = live();
  giveBall(match, 7);
  assert.equal(userContext(match), "ball");
  cpuBall(match);
  assert.equal(userContext(match), "defense");
  const keeper = match.players[0];
  giveBall(match, 0, -48);
  keeper.state = "hold";
  assert.equal(userContext(match), "keeper");
  startSetPiece(match, "corner", 0, { x: FIELD.halfL * match.teams[0].dir, z: FIELD.halfW });
  assert.equal(userContext(match), "sp:corner");
  startSetPiece(match, "freekick", 1, { x: 0, z: 0 });
  assert.equal(userContext(match), "def:freekick");
});

test("keyName đọc theo vị trí phím (không bị Unikey đổi chữ), có Ctrl, Shift, [ ]", () => {
  assert.equal(keyName({ code: "KeyS", key: "ư" }), "S");
  assert.equal(keyName({ code: "KeyD", key: "đ" }), "D");
  assert.equal(keyName({ code: "Space", key: " " }), "Space");
  assert.equal(keyName({ code: "ShiftLeft", key: "Shift" }), "Shift");
  assert.equal(keyName({ code: "ControlRight", key: "Control" }), "Ctrl");
  assert.equal(keyName({ code: "BracketLeft", key: "[" }), "[");
  assert.equal(keyName({ code: "ArrowUp", key: "ArrowUp" }), "up");
  assert.equal(keyName({ code: "KeyX", key: "x" }), null);
});

/* ================= có bóng: chuyền ================= */

test("S: chuyền ngắn và tự đổi sang người nhận; giữ S lâu thì bóng đi mạnh hơn", () => {
  const speeds = [];
  for (const ms of [60, 850]) {
    const match = live(2);
    const r = rig(match);
    giveBall(match, 6, -25);
    r.press("right"); r.hit("S", ms); r.release("right");
    const pass = r.events("pass")[0];
    assert.equal(pass?.kind, "short");
    assert.equal(pass.to, 9, "chuyền theo hướng phím → tiền đạo phía trước");
    assert.equal(match.user.controlledId, pass.to, "đổi người sang người nhận");
    speeds.push(pass.speed);
  }
  assert.ok(speeds[1] > speeds[0], `giữ S lâu ${speeds[1].toFixed(1)} > bấm nhanh ${speeds[0].toFixed(1)} m/s`);
});

test("Z+S chuyền mạnh tầm thấp nhanh hơn S thường; C+S chuyền bất ngờ", () => {
  const passes = {};
  for (const [label, mod] of [["S", null], ["Z+S", "Z"], ["C+S", "C"]]) {
    const match = live(3);
    const r = rig(match);
    giveBall(match, 6, -25);
    r.press("right");
    if (mod) r.chord(mod, "S", 300); else r.hit("S", 300);
    passes[label] = r.events("pass")[0];
    assert.ok(passes[label], `${label} có chuyền`);
  }
  assert.equal(passes["Z+S"].style, "driven");
  assert.equal(passes["C+S"].style, "quick");
  assert.ok(passes["Z+S"].speed > passes.S.speed, `Z+S ${passes["Z+S"].speed.toFixed(1)} > S ${passes.S.speed.toFixed(1)} m/s`);
});

test("Q+S rồi S: bật tường — người chuyền băng lên và nhận lại bóng", () => {
  const match = live(4);
  const r = rig(match);
  const passer = giveBall(match, 7, -20, 0);
  r.press("right");
  r.chord("Q", "S", 80);
  r.release("right");
  const first = r.events("pass")[0];
  assert.equal(first?.kind, "short", "đường chuyền đầu là chuyền sệt vào chân người làm tường");
  assert.ok(first, "có đường chuyền thứ nhất");
  assert.equal(match.user.oneTwo?.runnerId, passer.id);
  assert.ok(passer.runTo, "người chuyền băng lên");
  // Đợi người làm tường nhận bóng rồi bấm S lần nữa.
  for (let i = 0; i < 180 && match.ball.owner !== first.to; i += 1) r.tick();
  assert.equal(match.ball.owner, first.to);
  r.hit("S", 60);
  const back = r.events("oneTwo")[0];
  assert.equal(back?.to, passer.id, "bóng trả lại cho người vừa chuyền");
  assert.equal(match.user.controlledId, passer.id);
  assert.equal(r.events("pass").at(-1).kind, "through", "trả lại bằng chọc khe vào bước chạy");
});

test("A chuyền dài bổng, Z+A bổng cao hơn, A A tạt thấp, Q+A tạt nhanh", () => {
  const passes = {};
  for (const [label, run] of [
    ["A", (r) => r.hit("A", 300)],
    ["Z+A", (r) => r.chord("Z", "A", 300)],
    ["A A", (r) => { r.hit("A", 60); r.tick(40); r.hit("A", 40); }],
    ["Q+A", (r) => r.chord("Q", "A", 300)],
  ]) {
    const match = live(5);
    const r = rig(match);
    giveBall(match, 10, 30, 22);
    r.press("right");
    run(r);
    r.tick(250);
    r.release("right");
    passes[label] = r.events("pass")[0];
    assert.equal(passes[label]?.kind, "lob", `${label} là bóng bổng`);
  }
  assert.equal(passes.A.style, null);
  assert.equal(passes["Z+A"].style, "lofted");
  assert.equal(passes["A A"].style, "lowCross");
  assert.equal(passes["Q+A"].style, "earlyCross");
  assert.ok(passes["Z+A"].lift > passes.A.lift, "Z+A bổng cao hơn A");
  assert.ok(passes["A A"].lift < passes.A.lift, "A A thấp hơn A");
});

test("W chọc khe, Q+W chọc khe bổng, Z+W bật tường", () => {
  for (const [label, chord, kind] of [["W", null, "through"], ["Q+W", "Q", "lobThrough"], ["Z+W", "Z", "short"]]) {
    const match = live(6);
    const r = rig(match);
    const passer = giveBall(match, 6, -22, 0);
    r.press("right");
    if (chord) r.chord(chord, "W", 300); else r.hit("W", 300);
    r.release("right");
    const pass = r.events("pass")[0];
    assert.equal(pass?.kind, kind, `${label} → ${kind}`);
    if (label === "Z+W") assert.equal(match.user.oneTwo?.runnerId, passer.id, "Z+W là bật tường");
    else assert.ok(match.players[pass.to].runTo || match.ball.pass?.kind === kind, "người nhận chạy vào khoảng trống");
  }
});

/* ================= có bóng: dứt điểm ================= */

test("D sút, giữ D lâu thì lực mạnh hơn; D D sút sệt; Z+D xoáy; Q+D bấm bóng; C+D sút căng", () => {
  const shot = (setup) => {
    const match = live(7);
    const r = rig(match);
    giveBall(match, 9, 30, 0);
    setup(r);
    r.tick(300);
    return r.events("shot")[0];
  };
  const quick = shot((r) => r.hit("D", 150));
  const strong = shot((r) => r.hit("D", 700));
  assert.equal(quick?.kind, "normal");
  assert.ok(strong.power > quick.power + 0.3, `giữ lâu ${strong.power.toFixed(2)} > ${quick.power.toFixed(2)}`);
  assert.equal(shot((r) => { r.hit("D", 300); r.tick(40); r.hit("D", 40); })?.kind, "low", "D D");
  assert.equal(shot((r) => r.chord("Z", "D", 300))?.kind, "finesse", "Z+D");
  assert.equal(shot((r) => r.chord("Q", "D", 300))?.kind, "chip", "Q+D");
  assert.equal(shot((r) => r.chord("C", "D", 300))?.kind, "power", "C+D");
});

test("S+D giả sút, S+A giả chuyền: không có cú sút hay đường chuyền nào", () => {
  for (const [second, move] of [["D", "fakeShot"], ["A", "fakePass"]]) {
    const match = live(8);
    const r = rig(match);
    giveBall(match, 9, 28, 0);
    r.press("up");
    r.press("S"); r.tick(60); r.press(second); r.tick(60); r.release(second); r.release("S");
    r.tick(300);
    r.release("up");
    assert.equal(r.events("skill")[0]?.move, move);
    assert.equal(r.events("shot").length + r.events("pass").length, 0);
    assert.equal(match.ball.owner, 9, "vẫn giữ bóng");
  }
});

test("Ctrl+hướng đẩy bóng dài, Shift+hướng lách người, Z+hướng giật bóng", () => {
  for (const [modifier, move] of [["Ctrl", "knock"], ["Shift", "sidestep"], ["Z", "drag"]]) {
    const match = live(9);
    const r = rig(match);
    giveBall(match, 9, 10, 0);
    r.press(modifier); r.tick(FRAME); r.press("up"); r.tick(100); r.release("up"); r.release(modifier);
    assert.equal(r.events("skill")[0]?.move, move, `${modifier} + hướng → ${move}`);
    if (move === "knock") assert.ok(match.ball.owner === null || match.ball.owner === 9);
  }
});

test("E tăng tốc, C che bóng (quay lưng về hậu vệ), Q dừng bóng quan sát", () => {
  const match = live(10);
  const r = rig(match);
  const me = giveBall(match, 9, 10, 0);
  r.press("right"); r.press("E"); r.tick(1000);
  const sprinting = Math.hypot(me.vx, me.vz);
  assert.ok(match.input.sprint && sprinting > 7, `tăng tốc ${sprinting.toFixed(1)} m/s`);
  r.release("E");
  r.tick(600);
  const jogging = Math.hypot(me.vx, me.vz);
  assert.ok(jogging < sprinting - 0.8, "nhả E thì chạy chậm lại");
  r.press("Q"); r.tick(700);
  assert.ok(match.input.holdBall && Math.hypot(me.vx, me.vz) < 1.8, "Q: dừng bóng");
  r.release("Q");
  // Che bóng: hậu vệ đứng phía trước, cầu thủ quay lưng lại.
  const defender = match.players[15];
  const dir = match.teams[0].dir;
  Object.assign(defender, { x: me.x + dir * 1.5, z: me.z, vx: 0, vz: 0 });
  r.release("right");
  r.press("C"); r.tick(500);
  const face = { x: Math.sin(me.heading), z: Math.cos(me.heading) };
  const toDefender = { x: defender.x - me.x, z: defender.z - me.z };
  assert.ok(match.input.shield && face.x * toDefender.x + face.z * toDefender.z < 0, "C: quay lưng về phía hậu vệ");
  r.release("C");
});

/* ================= phòng ngự ================= */

test("S đổi cầu thủ (người hợp lý gần bóng); Shift+hướng đổi theo hướng", () => {
  const match = live(11);
  const r = rig(match);
  cpuBall(match, 19, 1, 25);
  const before = match.user.controlledId;
  r.hit("S", 40);
  assert.notEqual(match.user.controlledId, before);
  assert.equal(r.events("switch").length, 1);
  const now = match.players[match.user.controlledId];
  assert.notEqual(now.role, "GK");
  // Shift + ↑: đổi sang người phía trên màn hình (z nhỏ hơn).
  const from = match.players[match.user.controlledId];
  r.press("Shift"); r.tick(FRAME); r.press("up"); r.tick(40); r.release("up"); r.release("Shift");
  const picked = match.players[match.user.controlledId];
  assert.ok(picked.id !== from.id && picked.z < from.z, "người được chọn nằm phía trên");
});

test("giữ D áp sát: lao thẳng vào người cầm bóng; C kèm người: đứng cách ~2 m phía khung thành, không lao vào", () => {
  const pressing = live(12);
  const r = rig(pressing);
  const { carrier, me } = cpuBall(pressing, 19, 6, 9, true);
  r.press("D"); r.tick(700);
  assert.ok(pressing.input.press, "D đang giữ");
  const pressGap = Math.hypot(me.x - carrier.x, me.z - carrier.z);
  r.release("D");

  const marking = live(12);
  const r2 = rig(marking);
  const pair = cpuBall(marking, 19, 6, 9, true);
  r2.press("C"); r2.tick(700);
  assert.ok(marking.input.contain, "C đang giữ");
  const containGap = Math.hypot(pair.me.x - pair.carrier.x, pair.me.z - pair.carrier.z);
  assert.ok(pressGap < containGap, `áp sát gần hơn (${pressGap.toFixed(1)} m) so với kèm (${containGap.toFixed(1)} m)`);
  r2.tick(1500);
  const settled = Math.hypot(pair.me.x - pair.carrier.x, pair.me.z - pair.carrier.z);
  assert.ok(settled > 1.3 && settled < 3.2, `kèm giữ khoảng cách ${settled.toFixed(2)} m`);
  const goal = -FIELD.halfL * marking.teams[0].dir;
  assert.ok(Math.abs(pair.me.x - goal) < Math.abs(pair.carrier.x - goal), "đứng chắn phía khung thành nhà");
  r2.release("C");
});

test("C kèm người không tự cướp bóng; giữ D áp sát thì có thể cướp", () => {
  let containSteals = 0;
  let pressSteals = 0;
  for (let seed = 1; seed <= 8; seed += 1) {
    for (const key of ["C", "D"]) {
      const match = live(seed);
      const r = rig(match);
      const { carrier } = cpuBall(match, 19, 6, 1.2, true);
      carrier.attrs.dribble = 60;
      r.press(key); r.tick(2500); r.release(key);
      const stolen = r.events("tackle").some((e) => e.id === 6);
      if (key === "C") containSteals += stolen ? 1 : 0; else pressSteals += stolen ? 1 : 0;
    }
  }
  assert.equal(containSteals, 0, "C không lao vào tranh bóng");
  assert.ok(pressSteals >= 3, `D cướp được ${pressSteals}/8 lần`);
});

test("E+C kèm chặt (chạy theo nhanh hơn C thường)", () => {
  const speeds = [];
  for (const sprint of [false, true]) {
    const match = live(13);
    const r = rig(match);
    const { carrier, me } = cpuBall(match, 19, 6, 6);
    carrier.goal = null;
    if (sprint) r.press("E");
    r.press("C");
    let top = 0;
    for (let i = 0; i < 40; i += 1) { r.tick(); top = Math.max(top, Math.hypot(me.vx, me.vz)); }
    speeds.push(top);
  }
  assert.ok(speeds[1] > speeds[0], `E+C ${speeds[1].toFixed(1)} > C ${speeds[0].toFixed(1)} m/s`);
});

test("Space tắc bóng, giữ Space tì vai, A xoạc bóng", () => {
  const match = live(14);
  const r = rig(match);
  const { me } = cpuBall(match, 19, 6, 1.4);
  r.press("Space"); r.tick(FRAME);
  assert.ok(me.anim.tackle > 0 || r.events("tackle").length, "Space: có động tác tắc");
  r.tick(400);
  assert.ok(match.input.barge || match.ball.owner !== 19, "giữ Space: tì vai");
  r.release("Space");

  const sliding = live(15);
  const r2 = rig(sliding);
  const pair = cpuBall(sliding, 19, 6, 3);
  r2.hit("A", 30);
  assert.ok(pair.me.state === "slide" || r2.events("slide").length === 1, "A: xoạc bóng");
});

test("giữ Q gọi đồng đội áp sát; Z dâng đội hình; W thủ môn lao ra", () => {
  const match = live(16);
  const r = rig(match);
  const { carrier } = cpuBall(match, 19, 1, 20);
  // Một đồng đội đứng gần nhưng ngoài 4.5 m: bình thường không áp sát.
  const mate = match.players[5];
  Object.assign(mate, { x: carrier.x - match.teams[0].dir * 7, z: 0 });
  r.tick(100);
  assert.ok(!mate.pressing, "chưa gọi thì không áp sát");
  r.press("Q"); r.tick(200);
  assert.ok(match.input.callPress && teamPressing(match), "giữ Q: có đồng đội lao vào áp sát");
  r.release("Q");

  const base = shapeTarget(match, match.players[2], false);
  r.press("Z"); r.tick(FRAME);
  const pushed = shapeTarget(match, match.players[2], false);
  const dir = match.teams[0].dir;
  assert.ok((pushed.x - base.x) * dir > 5, "Z: hàng thủ dâng lên");
  r.release("Z");

  r.hit("W", 30);
  assert.ok(match.players[0].rushUntil > match.time, "W: thủ môn lao ra");
});

const teamPressing = (match) => match.players.some((p) => p.team === 0 && p.pressing && p.id !== match.user.controlledId);

test("D hoặc S phá bóng khi bóng bổng tới gần (không đổi người)", () => {
  for (const key of ["S", "D"]) {
    const match = live(17);
    const r = rig(match);
    const me = match.players[3];
    const dir = match.teams[0].dir;
    Object.assign(me, { x: -40 * dir, z: 0, vx: 0, vz: 0, state: "run", cooldown: 0 });
    match.user.controlledId = 3;
    match.user.switchedAt = match.time;
    // Đối thủ tạt bổng vào: bóng đang bay về phía hậu vệ của bạn.
    Object.assign(match.ball, { owner: null, x: me.x + dir * 6, y: 4, z: 0, vx: -dir * 8, vy: 0, vz: 0, lastTeam: 1, lastTouch: 19, pass: { from: 19, to: null, kind: "lob", target: { x: me.x, z: 0 }, time: match.time }, shot: null });
    r.press(key); r.tick(40); r.release(key);
    for (let i = 0; i < 90 && !r.events("clear").length; i += 1) r.tick();
    assert.equal(r.events("clear").length, 1, `${key}: phá bóng`);
    assert.equal(r.events("switch").length, 0, `${key}: không đổi người`);
  }
});

/* ================= thủ môn ôm bóng ================= */

const keeperBall = (seed) => {
  const match = live(seed);
  const keeper = giveBall(match, 0, -48, 0);
  keeper.state = "hold";
  keeper.holdSince = match.time;
  return { match, keeper };
};

test("thủ môn ôm bóng: W thả bóng, S ném ngắn, giữ S ném xa, Z+S ném thấp, A/D phát dài", () => {
  {
    const { match, keeper } = keeperBall(18);
    const r = rig(match);
    r.hit("W", 30);
    assert.equal(keeper.state, "run");
    assert.equal(match.ball.owner, keeper.id);
    assert.equal(r.events("drop").length, 1);
  }
  const kindOf = (setup) => {
    const { match } = keeperBall(18);
    const r = rig(match);
    setup(r);
    r.tick(60);
    const pass = r.events("pass")[0];
    return pass ? `${pass.kind}${pass.style ? `:${pass.style}` : ""}` : null;
  };
  assert.equal(kindOf((r) => r.hit("S", 100)), "short");
  assert.equal(kindOf((r) => r.hit("S", 700)), "throw:longThrow");
  assert.equal(kindOf((r) => r.chord("Z", "S", 100)), "short:driven");
  assert.equal(kindOf((r) => r.hit("A", 300)), "lob:lofted");
  assert.equal(kindOf((r) => r.hit("D", 300)), "lob:lofted");
});

/* ================= tình huống cố định ================= */

const ownCorner = (seed) => {
  const match = live(seed);
  startSetPiece(match, "corner", 0, { x: FIELD.halfL * match.teams[0].dir, z: FIELD.halfW });
  const r = rig(match);
  r.tick(1000);
  return { match, r };
};

test("phạt góc: A tạt mạnh (bổng), A A tạt vừa, A A A tạt sệt, S chuyền ngắn, C gọi người", () => {
  const styleOf = (taps) => {
    const { r } = ownCorner(19);
    for (let i = 0; i < taps; i += 1) { r.hit("A", 40); r.tick(60); }
    r.tick(400);
    const pass = r.events("pass")[0];
    return pass ? `${pass.kind}:${pass.style ?? "-"}` : null;
  };
  assert.equal(styleOf(1), "lob:lofted");
  assert.equal(styleOf(2), "lob:-");
  assert.equal(styleOf(3), "short:driven");
  {
    const { match, r } = ownCorner(19);
    r.hit("C", 30);
    assert.equal(r.events("second").length, 1, "C: gọi người tới gần");
    const helper = match.players[match.setPiece.secondId];
    assert.ok(Math.hypot(helper.x - match.ball.x, helper.z - match.ball.z) < 3);
    r.hit("S", 100);
    assert.equal(r.events("pass")[0]?.kind, "short");
  }
});

test("ném biên: S/D ném gần, A ném xa, W ném nhanh", () => {
  for (const [key, expect] of [["S", "throw:-"], ["D", "throw:-"], ["A", "throw:longThrow"], ["W", "throw:-"]]) {
    const match = live(20);
    startSetPiece(match, "throw", 0, { x: 0, z: FIELD.halfW + 0.25 });
    const r = rig(match);
    r.tick(800);
    r.press("up"); r.hit(key, 200); r.release("up");
    const pass = r.events("pass")[0];
    assert.equal(pass ? `${pass.kind}:${pass.style ?? "-"}` : null, expect, `ném biên ${key}`);
  }
});

test("đá phạt: E đổi người sút, D sút xoáy, Q+D sút căng, Z+D sút sệt, C rồi C+D người thứ hai sút", () => {
  const setUp = (seed = 21) => {
    const match = live(seed);
    startSetPiece(match, "freekick", 0, { x: 26 * match.teams[0].dir, z: 4 });
    const r = rig(match);
    r.tick(1000);
    return { match, r };
  };
  {
    const { match, r } = setUp();
    const first = match.setPiece.takerId;
    r.hit("E", 30);
    assert.notEqual(match.setPiece.takerId, first, "E: đổi người sút");
    assert.equal(match.user.controlledId, match.setPiece.takerId);
    assert.ok(match.players.some((p) => p.inWall), "đối thủ có hàng rào");
  }
  for (const [label, run, kind] of [["D", (r) => r.hit("D", 400), "finesse"], ["Q+D", (r) => r.chord("Q", "D", 400), "power"], ["Z+D", (r) => r.chord("Z", "D", 400), "low"]]) {
    const { r } = setUp();
    run(r);
    r.tick(60);
    assert.equal(r.events("shot")[0]?.kind, kind, `${label} → ${kind}`);
  }
  {
    const { match, r } = setUp();
    r.hit("C", 30);
    const second = match.setPiece.secondId;
    assert.ok(second !== undefined);
    r.chord("C", "D", 400);
    r.tick(60);
    assert.equal(r.events("shot")[0]?.id, second, "C+D: người thứ hai sút");
  }
});

test("phòng ngự đá phạt: W hàng rào nhảy, C/E dịch hàng rào", () => {
  const match = live(22);
  startSetPiece(match, "freekick", 1, { x: -24 * match.teams[0].dir, z: 0 });
  const r = rig(match);
  r.tick(300);
  const wall = match.players.filter((p) => p.inWall);
  assert.ok(wall.length >= 3);
  const before = wall.map((p) => p.z);
  r.hit("C", 30);
  const moved = wall.map((p) => p.z);
  assert.ok(moved.some((z, i) => Math.abs(z - before[i]) > 0.3), "C: hàng rào dịch");
  r.hit("E", 30);
  assert.ok(wall.every((p, i) => Math.abs(p.z - before[i]) < 0.05), "E: dịch ngược lại về chỗ cũ");
  r.hit("W", 30);
  assert.ok(match.setPiece.wallJump, "W: hàng rào sẽ nhảy");
});

test("penalty: E đổi người sút, ↑+D sút về phía trên, Q+D bấm bóng", () => {
  const take = (run) => {
    const match = live(23);
    startSetPiece(match, "penalty", 0, { x: 0, z: 0 });
    const r = rig(match);
    r.tick(1300);
    const taker = match.setPiece.takerId;
    run(r);
    r.tick(60);
    return { match, r, taker };
  };
  {
    const { match, r, taker } = take((rig2) => rig2.hit("E", 30));
    assert.notEqual(match.setPiece.takerId, taker);
    assert.equal(r.events("taker").length, 1);
  }
  {
    const { r, match } = take((r) => { r.press("up"); r.hit("D", 350); r.release("up"); });
    assert.equal(r.events("shot")[0]?.kind, "normal");
    assert.ok(match.ball.vz < 0, "bóng đi về phía trên màn hình (z âm)");
  }
  {
    const { r } = take((r) => r.chord("Q", "D", 350));
    assert.equal(r.events("shot")[0]?.kind, "chip");
  }
});

test("bắt penalty: giữ hướng + D chọn bên thủ môn bay người", () => {
  for (const [arrow, side] of [["up", -1], ["down", 1]]) {
    const match = live(24);
    startSetPiece(match, "penalty", 1, { x: 0, z: 0 });
    const r = rig(match);
    r.tick(500);
    r.press(arrow); r.hit("D", 40); r.release(arrow);
    assert.equal(match.user.keeperGuess?.side, side, `${arrow} → ${side}`);
    for (let i = 0; i < 240 && !r.events("dive").length; i += 1) r.tick();
    const keeper = match.players[0];
    assert.equal(keeper.dive?.side, side, "thủ môn bay đúng bên đã chọn");
  }
});

/* ================= chung ================= */

test("[ và ] đổi nhịp độ tấn công từ −2 đến +2", () => {
  const match = live(25);
  const r = rig(match);
  for (let i = 0; i < 4; i += 1) r.hit("]", 20);
  assert.equal(match.teams[0].mentality, 2);
  for (let i = 0; i < 6; i += 1) r.hit("[", 20);
  assert.equal(match.teams[0].mentality, -2);
});

test("tay cầm và nút cảm ứng đổi theo ngữ cảnh như FO4", () => {
  assert.equal(padKey(0, "ball"), "S");
  assert.equal(padKey(2, "ball"), "D");
  assert.equal(padKey(4, "defense"), "S", "LB đổi người");
  assert.equal(padKey(0, "defense"), "D", "A áp sát");
  assert.equal(padKey(6, "defense"), "C", "LT kèm");
  assert.equal(padKey(1, "defense"), "Space", "B tắc");
  assert.equal(padKey(2, "defense"), "A", "X xoạc");
  assert.deepEqual(touchButtons("defense").map(([key]) => key), ["S", "D", "C", "Space", "A", "E"]);
  assert.deepEqual(touchButtons("sp:corner").map(([key]) => key), ["A", "S", "C"]);
});

test("cả trận người chơi bấm phím ngẫu nhiên theo FO4: không lỗi, bóng luôn hợp lệ", () => {
  const match = createMatch({ seed: 31, halfMinutes: 2 });
  const r = rig(match);
  const keys = ["S", "A", "W", "D", "Q", "Z", "E", "C", "Space", "Shift", "Ctrl", "up", "down", "left", "right", "[", "]"];
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const down = new Set();
  for (let frame = 0; frame < 60 * 60 * 5 && match.phase !== "fulltime"; frame += 1) {
    if (random() < 0.08) {
      const key = keys[Math.floor(random() * keys.length)];
      if (down.has(key)) { r.release(key); down.delete(key); } else { r.press(key); down.add(key); }
    }
    r.tick();
    if (match.phase === "halftime" && match.phaseT < 0) { match.phase = "halftime"; break; }
    const { ball } = match;
    assert.ok([ball.x, ball.y, ball.z, ball.vx, ball.vz].every(Number.isFinite), "bóng hợp lệ");
    assert.ok(Math.abs(ball.x) < FIELD.halfL + 4 && Math.abs(ball.z) < FIELD.halfW + 3, `bóng không bay khỏi sân vận động: ${match.phase} ${match.setPiece?.type} ${ball.x.toFixed(1)},${ball.y.toFixed(1)},${ball.z.toFixed(1)} owner ${ball.owner} ${r.log.slice(-6).map((e) => e.type).join(",")}`);
  }
  assert.ok(r.events("pass").length > 10, "có nhiều đường chuyền");
});
