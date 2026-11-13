/**
 * Hỗ trợ chuyền/sút: bấm thiếu lực vẫn tới chân đồng đội, sút tự chọn góc trống,
 * chọc khe tìm chỗ đồng đội tới trước hậu vệ. So sánh với chế độ thủ công.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { FIELD } from "./constants.js";
import { act, createMatch, drainEvents, stepMatch } from "./sim.js";

const scene = (seed, mode, { cpuAway = true } = {}) => {
  const match = createMatch({ seed });
  match.assist = mode;
  match.setPiece = null;
  match.phase = "play";
  const dir = match.teams[0].dir;
  if (cpuAway) match.players.filter((p) => p.team === 1 && p.role !== "GK").forEach((p, i) => Object.assign(p, { x: -dir * (30 + i), z: 32, vx: 0, vz: 0 }));
  return match;
};
const give = (match, id, ahead, z = 0) => {
  const dir = match.teams[0].dir;
  const p = match.players[id];
  Object.assign(p, { x: ahead * dir, z, vx: 0, vz: 0, heading: (Math.PI / 2) * dir, state: "run", cooldown: 0 });
  Object.assign(match.ball, { owner: id, pass: null, shot: null, offside: null, y: FIELD.ballRadius });
  match.user.controlledId = id;
  p.touchStart = match.time - 1;
  stepMatch(match, 1 / 60);
  drainEvents(match);
  return p;
};
const run = (match, seconds) => { const all = []; for (let i = 0; i < seconds * 60; i += 1) { stepMatch(match, 1 / 60); all.push(...drainEvents(match)); } return all; };

test("hỗ trợ cao: bấm S rất nhẹ cho đồng đội ở xa 25 m vẫn tới chân; thủ công thì bóng đi không tới", () => {
  let assistedArrive = 0;
  let manualArrive = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    for (const mode of ["assisted", "manual"]) {
      const match = scene(seed, mode);
      const dir = match.teams[0].dir;
      give(match, 6, -25);
      const mate = match.players[9];
      Object.assign(mate, { x: 0, z: 0, vx: 0, vz: 0 });
      act(match, "short", { power: 0.05, aim: { x: dir, z: 0 } });
      // Người nhận đứng yên chờ (không chạy ra đón) để đo đúng lực bóng.
      mate.cooldown = 0;
      const events = run(match, 4);
      const got = events.some((event) => event.type === "touch" && event.id === 9);
      if (mode === "assisted") assistedArrive += got ? 1 : 0; else manualArrive += got ? 1 : 0;
    }
  }
  assert.ok(assistedArrive >= 5, `hỗ trợ cao: ${assistedArrive}/6 đường chuyền tới chân`);
  assert.ok(manualArrive < assistedArrive, `thủ công bấm nhẹ: ${manualArrive}/6`);
});

test("hỗ trợ cao: chuyền dẫn bóng tới chỗ đồng đội đang chạy tới", () => {
  const match = scene(3, "assisted");
  const dir = match.teams[0].dir;
  give(match, 6, -20);
  const mate = match.players[9];
  Object.assign(mate, { x: -5 * dir, z: -6, vx: 0, vz: 5 });
  act(match, "short", { power: 0.3, aim: { x: dir, z: 0 } });
  assert.equal(match.ball.pass.to, 9);
  assert.ok(match.ball.pass.target.z > mate.z + 1, "nhắm vào chỗ người nhận sẽ tới, không phải chỗ đang đứng");
});

test("hỗ trợ cao: không bấm hướng thì sút về góc thủ môn để trống", () => {
  for (const keeperZ of [1.6, -1.6]) {
    const match = scene(4, "assisted");
    give(match, 9, 36, 0);
    const keeper = match.players[11];
    keeper.z = keeperZ;
    act(match, "shoot", { power: 0.6, aim: { x: 0, z: 0 } });
    const shot = drainEvents(match).find((event) => event.type === "shot");
    assert.ok(Math.sign(shot.tz) === -Math.sign(keeperZ), `thủ môn đứng ${keeperZ} → sút về ${shot.tz.toFixed(2)}`);
  }
});

test("hỗ trợ cao: lỡ giữ D gần đầy thanh lực vẫn ít khi bay vọt xà hơn chế độ vừa", () => {
  const rate = (mode) => {
    let inFrame = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const match = scene(seed, mode);
      give(match, 9, 33, 4);
      act(match, "shoot", { power: 0.9, aim: { x: 0, z: 0 } });
      const shot = drainEvents(match).find((event) => event.type === "shot");
      if (shot.ty < FIELD.goalHeight) inFrame += 1;
    }
    return inFrame;
  };
  const assisted = rate("assisted");
  const semi = rate("semi");
  assert.ok(assisted > semi, `dưới xà: hỗ trợ cao ${assisted}/40, vừa ${semi}/40`);
  assert.ok(assisted >= 30);
});

test("hỗ trợ cao: chọc khe chọn điểm đồng đội tới trước hậu vệ", () => {
  let wins = 0;
  for (let seed = 1; seed <= 10; seed += 1) {
    const match = scene(seed, "assisted", { cpuAway: false });
    const dir = match.teams[0].dir;
    give(match, 6, -5, 0);
    const striker = match.players[9];
    Object.assign(striker, { x: 12 * dir, z: 4, vx: 3 * dir, vz: 0 });
    act(match, "through", { power: 1, aim: { x: dir, z: 0 } });
    if (match.ball.pass?.to !== 9) continue;
    const events = run(match, 4);
    const first = events.find((event) => event.type === "touch");
    if (first && match.players[first.id].team === 0) wins += 1;
  }
  assert.ok(wins >= 5, `đồng đội đón được ${wins}/10 đường chọc khe`);
});
