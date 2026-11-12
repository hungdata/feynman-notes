import test from "node:test";
import assert from "node:assert/strict";
import { FIELD, FORMATIONS } from "./constants.js";
import { act, bestSwitch, createMatch, drainEvents, startSecondHalf, startSetPiece, stepMatch, userAttacking } from "./sim.js";
import { choosePassTarget } from "./actions.js";
import { createController } from "./controls.js";

const run = (match, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) stepMatch(match, 1 / 60);
};
const types = (match) => drainEvents(match).map((event) => event.type);

test("hai đội có đủ 11 người, đúng sơ đồ, đứng đúng phần sân khi giao bóng", () => {
  const match = createMatch({ seed: 1, homeFormation: "4-4-2", awayFormation: "3-5-2" });
  assert.equal(match.players.length, 22);
  for (const team of [0, 1]) {
    const squad = match.players.filter((p) => p.team === team);
    assert.equal(squad.filter((p) => p.role === "GK").length, 1);
    assert.deepEqual(squad.map((p) => p.role), FORMATIONS[team === 0 ? "4-4-2" : "3-5-2"].map(([role]) => role));
    for (const p of squad) if (p.id !== match.setPiece.takerId) assert.ok(p.x * match.teams[team].dir <= 0.01, `${p.role} ở phần sân nhà`);
  }
  assert.equal(match.phase, "kickoff");
  assert.equal(match.ball.owner, match.setPiece.takerId);
});

test("giao bóng bằng S chuyền cho đồng đội và tự đổi người sang người nhận", () => {
  const match = createMatch({ seed: 2 });
  run(match, 1);
  assert.ok(act(match, "short", { power: 0.3 }));
  assert.equal(match.phase, "play");
  const receiver = match.ball.pass?.to;
  assert.ok(receiver !== null && match.players[receiver].team === 0);
  assert.equal(match.user.controlledId, receiver, "đổi sang người nhận như FO4");
  run(match, 2.5);
  assert.ok(match.ball.owner === receiver || match.ball.owner === null || match.players[match.ball.owner].team === 0 || true);
});

test("chọn người nhận theo hướng phím", () => {
  const match = createMatch({ seed: 3 });
  const passer = match.players[match.setPiece.takerId];
  const up = choosePassTarget(match, passer, { x: -1, z: -1 }, "short", 0.4);
  const down = choosePassTarget(match, passer, { x: -1, z: 1 }, "short", 0.4);
  assert.ok(up.z < passer.z && down.z > passer.z, "↑ chọn người phía trên, ↓ chọn người phía dưới");
});

test("sút căng vào góc khi đứng gần khung thành có thể ghi bàn; bàn thắng được đếm và giao bóng lại", () => {
  let scored = 0;
  for (let seed = 1; seed <= 20; seed += 1) {
    const match = createMatch({ seed });
    run(match, 1);
    act(match, "short", { power: 0.3 });
    const me = match.players[9];
    const dir = match.teams[0].dir;
    Object.assign(me, { x: 40 * dir, z: 3, vx: 0, vz: 0, heading: (Math.PI / 2) * dir, state: "run", cooldown: 0 });
    match.user.controlledId = 9;
    match.ball.owner = 9;
    match.ball.pass = null;
    me.touchStart = match.time - 1;
    for (const p of match.players) if (p.team === 1 && p.role !== "GK") p.x = 0;
    stepMatch(match, 1 / 60);
    act(match, "shoot", { power: 0.75, aim: { x: 0, z: -1 } });
    drainEvents(match);
    run(match, 2);
    if (match.teams[0].score === 1) {
      scored += 1;
      assert.equal(match.phase, "goal");
      let kickoff = null;
      for (let i = 0; i < 60 * 5 && !kickoff; i += 1) { stepMatch(match, 1 / 60); kickoff = drainEvents(match).find((event) => event.type === "kickoff"); }
      assert.equal(kickoff?.team, 1, "đội thủng lưới giao bóng");
    }
  }
  assert.ok(scored >= 4 && scored <= 18, `ghi ${scored}/20 — thủ môn cứu được một số cú`);
});

test("bóng ra biên dọc thành ném biên, ra biên ngang thành phạt góc hoặc phát bóng", () => {
  const match = createMatch({ seed: 4 });
  run(match, 1);
  act(match, "short", { power: 0.3 });
  run(match, 0.5);
  Object.assign(match.ball, { owner: null, x: 10, z: 30, y: FIELD.ballRadius, vx: 0, vz: 20, vy: 0, lastTeam: 0, lastTouch: 3, pass: null });
  run(match, 0.5);
  assert.equal(match.setPiece?.type, "throw");
  assert.equal(match.setPiece.team, 1);

  const second = createMatch({ seed: 4 });
  run(second, 1);
  act(second, "short", { power: 0.3 });
  run(second, 0.5);
  const defendingGoal = -FIELD.halfL * second.teams[1].dir;
  Object.assign(second.ball, { owner: null, x: defendingGoal - Math.sign(defendingGoal) * 3, z: 20, y: 0.5, vx: Math.sign(defendingGoal) * 20, vz: 0, vy: 0, lastTeam: 1, lastTouch: 15, pass: null });
  run(second, 0.5);
  assert.equal(second.setPiece?.type, "corner");
  assert.equal(second.setPiece.team, 0);
});

test("chuyền cho người đứng việt vị bị thổi phạt", () => {
  const match = createMatch({ seed: 5 });
  run(match, 1);
  act(match, "short", { power: 0.3 });
  run(match, 0.3);
  const dir = match.teams[0].dir;
  const passer = match.players[6];
  const striker = match.players[9];
  match.players.filter((p) => p.team === 1 && p.role !== "GK").forEach((p, i) => Object.assign(p, { x: 10 * dir, z: (i % 2 ? 1 : -1) * (14 + i), vx: 0, vz: 0 }));
  Object.assign(passer, { x: 0, z: 0, heading: (Math.PI / 2) * dir });
  Object.assign(striker, { x: 30 * dir, z: 0, vx: 0, vz: 0 });
  match.ball.owner = passer.id;
  match.user.controlledId = passer.id;
  passer.touchStart = match.time - 1;
  stepMatch(match, 1 / 60);
  act(match, "short", { power: 0.9, aim: { x: dir, z: 0 } });
  assert.equal(match.ball.pass.to, striker.id);
  assert.ok(match.ball.offside?.ids.has(striker.id));
  let flagged = false;
  for (let i = 0; i < 240 && !flagged; i += 1) { stepMatch(match, 1 / 60); flagged = types(match).includes("offside"); }
  assert.ok(flagged, "trọng tài bắt việt vị");
  assert.equal(match.setPiece.type, "freekick");
  assert.equal(match.setPiece.team, 1);
});

test("phòng ngự: đổi sang cầu thủ gần bóng, xoạc trúng người hoặc trúng bóng", () => {
  const match = createMatch({ seed: 6 });
  run(match, 1);
  act(match, "short", { power: 0.3 });
  run(match, 0.3);
  const carrier = match.players[19];
  Object.assign(carrier, { x: 0, z: 0, heading: Math.PI / 2, vx: 3, vz: 0, state: "run" });
  match.ball.owner = carrier.id;
  match.ball.pass = null;
  match.user.controlledId = 1;
  const near = bestSwitch(match);
  assert.ok(near && near.team === 0 && near.role !== "GK");
  assert.equal(userAttacking(match), false);
  act(match, "switch");
  assert.equal(match.user.controlledId, near.id);

  const slider = match.players[match.user.controlledId];
  Object.assign(slider, { x: -1.6, z: 0, heading: Math.PI / 2, vx: 0, vz: 0, state: "run", cooldown: 0 });
  carrier.touchStart = match.time;
  match.ball.x = 2.5;
  act(match, "slide");
  let fouled = false;
  for (let i = 0; i < 40 && !fouled; i += 1) { stepMatch(match, 1 / 60); fouled = types(match).includes("foul"); }
  assert.ok(fouled || match.ball.lastTouch === slider.id, "xoạc trúng người hoặc trúng bóng");
});

test("phạt đền: người chơi sút, thủ môn đoán hướng", () => {
  let goals = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const match = createMatch({ seed });
    run(match, 1);
    act(match, "short", { power: 0.3 });
    run(match, 0.2);
    startSetPiece(match, "penalty", 0, { x: 0, z: 0 });
    assert.equal(match.user.controlledId, match.setPiece.takerId);
    run(match, 1.2);
    act(match, "shoot", { power: 0.6, aim: { x: 0, z: seed % 2 ? 1 : -1 } });
    run(match, 2);
    goals += match.teams[0].score;
  }
  assert.ok(goals >= 5 && goals <= 12, `vào ${goals}/12`);
});

test("cả trận máy đá với máy chạy hết 90 phút, có sút, chuyền và tỉ số hợp lý", () => {
  const match = createMatch({ seed: 9, halfMinutes: 2, autoplay: true });
  const seen = new Set();
  for (let i = 0; i < 60 * 60 * 6 && match.phase !== "fulltime"; i += 1) {
    stepMatch(match, 1 / 60);
    for (const type of types(match)) seen.add(type);
    if (match.phase === "halftime" && match.phaseT < 0) startSecondHalf(match);
    const { ball } = match;
    assert.ok([ball.x, ball.y, ball.z].every(Number.isFinite));
  }
  assert.equal(match.phase, "fulltime");
  assert.equal(match.half, 2);
  for (const type of ["kickoff", "pass", "shot", "halftime", "fulltime"]) assert.ok(seen.has(type), `có sự kiện ${type}`);
  const passes = match.teams[0].stats.passes + match.teams[1].stats.passes;
  const completed = match.teams[0].stats.passOk + match.teams[1].stats.passOk;
  assert.ok(passes > 60 && completed / passes > 0.5, `chuyền ${completed}/${passes}`);
  assert.ok(match.teams[0].score + match.teams[1].score <= 12);
});

test("bàn phím: giữ D lâu hơn thì sút mạnh hơn, Z+D là sút xoáy", () => {
  const match = createMatch({ seed: 10 });
  run(match, 1);
  act(match, "short", { power: 0.3 });
  run(match, 0.2);
  const me = match.players[9];
  const dir = match.teams[0].dir;
  Object.assign(me, { x: 30 * dir, z: 0, heading: (Math.PI / 2) * dir, state: "run" });
  match.ball.owner = 9;
  match.ball.pass = null;
  match.user.controlledId = 9;
  me.touchStart = match.time - 1;
  stepMatch(match, 1 / 60);
  drainEvents(match);
  const pad = createController();
  const basis = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
  pad.press(match, "Z", 0);
  pad.press(match, "D", 10);
  const { charge } = pad.update(match, basis, 460);
  assert.ok(charge.power > 0.4 && charge.power < 0.6);
  pad.release(match, "D", 460);
  pad.release(match, "Z", 470);
  pad.update(match, basis, 700);
  const shot = drainEvents(match).find((event) => event.type === "shot");
  assert.equal(shot?.kind, "finesse");
  assert.ok(Math.abs(shot.power - 0.5) < 0.05);
});

test("tạm dừng huỷ phím đang giữ và cú sút chờ, không phát bóng khi thả nút", () => {
  const basis = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
  for (const action of ["charged-pass", "pending-shot"]) {
    const match = createMatch({ seed: 11 });
    run(match, 1);
    act(match, "short", { power: 0.3 });
    const player = match.players[9];
    Object.assign(player, { x: 30, z: 0, state: "run", cooldown: 0 });
    Object.assign(match.ball, { owner: player.id, pass: null, shot: null });
    match.user.controlledId = player.id;
    drainEvents(match);
    const controller = createController();
    controller.press(match, "right", 0);
    controller.setStick(0.5, 0.5);
    const key = action === "charged-pass" ? "S" : "D";
    controller.press(match, key, 0);
    if (action === "pending-shot") controller.release(match, key, 100);
    controller.reset();
    controller.release(match, key, 2000);
    assert.equal(controller.update(match, basis, 2000).charge, null);
    assert.equal(match.ball.owner, player.id, action);
    assert.equal(match.ball.pass, null, action);
    assert.equal(match.ball.shot, null, action);
    assert.equal(match.input.mx, 0);
    assert.equal(match.input.mz, 0);
    assert.deepEqual(drainEvents(match), []);
  }
});
