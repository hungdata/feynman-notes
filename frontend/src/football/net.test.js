/**
 * Online: hai người cùng một trận trên máy chủ; gói ảnh chụp đủ để trình duyệt vẽ lại
 * và biết ngữ cảnh phím (có bóng / phòng ngự / tình huống cố định) cho từng người.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { act, createMatch, drainEvents, stepMatch, userContext } from "./sim.js";
import { applyPack, cleanAction, cleanInput, packMatch, smoothView } from "./net.js";
import { createController } from "./controls.js";

const CONFIG = { seed: 77, halfMinutes: 3, homeFormation: "4-4-2", awayFormation: "4-3-3", homeKit: "red", awayKit: "blue", homeOvr: 82, awayOvr: 82 };
const run = (match, seconds) => { for (let i = 0; i < seconds * 60; i += 1) stepMatch(match, 1 / 60); };

test("trận hai người: mỗi đội một người điều khiển, lệnh của đội nào chỉ tác động đội đó", () => {
  const server = createMatch({ ...CONFIG, humans: [0, 1] });
  assert.ok(server.humans[0] && server.humans[1]);
  run(server, 1);
  assert.equal(act(server, "short", { power: 0.3 }, 1), false, "đội khách không được giao bóng thay đội nhà");
  assert.equal(act(server, "short", { power: 0.3 }, 0), true);
  run(server, 0.5);
  assert.equal(server.phase, "play");
  // Đội khách phòng ngự: S đổi người của đội khách, không đụng tới đội nhà.
  const homeBefore = server.humans[0].controlledId;
  const awayBefore = server.humans[1].controlledId;
  act(server, "switch", {}, 1);
  assert.notEqual(server.humans[1].controlledId, awayBefore);
  assert.equal(server.players[server.humans[1].controlledId].team, 1);
  assert.equal(server.humans[0].controlledId, homeBefore);
  // Phím giữ của từng người tách riêng.
  server.humans[1].input.press = true;
  assert.equal(server.humans[0].input.press, false);
});

test("hai người chơi cả trận bằng lệnh ngẫu nhiên: không lỗi, bóng luôn hợp lệ, cả hai đội đều chạm bóng", () => {
  const server = createMatch({ ...CONFIG, humans: [0, 1] });
  let seed = 5;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const actions = ["short", "through", "lob", "shoot", "switch", "tackle", "slide", "switchOrClear", "pressOrClear", "knock", "finesse"];
  const touches = [0, 0];
  for (let frame = 0; frame < 60 * 60 * 3; frame += 1) {
    for (const team of [0, 1]) {
      const input = server.humans[team].input;
      if (random() < 0.05) { input.mx = random() * 2 - 1; input.mz = random() * 2 - 1; input.sprint = random() < 0.5; input.press = random() < 0.3; }
      if (random() < 0.02) act(server, actions[Math.floor(random() * actions.length)], { power: random(), aim: { x: input.mx, z: input.mz } }, team);
    }
    stepMatch(server, 1 / 60);
    for (const event of drainEvents(server)) if (event.type === "touch") touches[server.players[event.id].team] += 1;
    const { ball } = server;
    assert.ok([ball.x, ball.y, ball.z].every(Number.isFinite));
    if (server.phase === "halftime") break;
  }
  assert.ok(touches[0] > 5 && touches[1] > 5, `chạm bóng: ${touches.join(" / ")}`);
});

test("gói ảnh chụp: trình duyệt vẽ lại đúng vị trí, tỉ số, tình huống cố định và biết ngữ cảnh phím", () => {
  const server = createMatch({ ...CONFIG, humans: [0, 1] });
  run(server, 1);
  act(server, "short", { power: 0.3 }, 0);
  run(server, 2);
  const pack = packMatch(server, drainEvents(server), { stats: true });
  const json = JSON.stringify(pack);
  assert.ok(json.length < 4000, `gói nhỏ (${json.length} byte)`);
  const view = createMatch({ ...CONFIG, humans: [0, 1], localTeam: 1 });
  assert.equal(view.user.team, 1);
  applyPack(view, JSON.parse(json), { snap: true });
  for (let i = 0; i < 22; i += 1) {
    assert.ok(Math.abs(view.players[i].x - server.players[i].x) < 0.01);
    assert.ok(Math.abs(view.players[i].z - server.players[i].z) < 0.01);
  }
  assert.equal(view.ball.owner, server.ball.owner);
  assert.equal(view.humans[1].controlledId, server.humans[1].controlledId);
  assert.equal(userContext(view, 1), userContext(server, 1));
  assert.equal(userContext(view, 0), userContext(server, 0));
  assert.deepEqual(view.teams.map((t) => t.stats.passes), server.teams.map((t) => t.stats.passes));
  // Cầu thủ chạy mượt về vị trí mới.
  const moved = JSON.parse(json);
  moved.p[5][0] += 2;
  applyPack(view, moved);
  const before = view.players[5].x;
  smoothView(view, 1 / 60);
  assert.ok(view.players[5].x > before && view.players[5].x < before + 2);
});

test("trình duyệt: phím FO4 biến thành lệnh gửi lên máy chủ (không chạy trận ở máy khách)", () => {
  const server = createMatch({ ...CONFIG, humans: [0, 1] });
  run(server, 1);
  const view = createMatch({ ...CONFIG, humans: [0, 1], localTeam: 0 });
  applyPack(view, packMatch(server), { snap: true });
  const sent = [];
  const pad = createController({ act: (_view, action, opts) => { sent.push({ action, opts }); return true; } });
  const basis = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
  pad.press(view, "S", 0);
  pad.update(view, basis, 100);
  pad.release(view, "S", 200);
  assert.equal(sent[0]?.action, "short");
  assert.ok(sent[0].opts.power > 0.1);
  assert.equal(view.phase, "kickoff", "máy khách không tự chạy trận");
  // Máy chủ chỉ nhận lệnh/phím hợp lệ.
  assert.deepEqual(cleanAction({ action: "short", opts: { power: 5, aim: { x: 9, z: 0 }, evil: 1 } }), { action: "short", opts: { power: 1, aim: { x: 1.5, z: 0 } } });
  assert.equal(cleanAction({ action: "eval" }), null);
  assert.deepEqual(Object.keys(cleanInput({ mx: 1, rogue: 2 })).includes("rogue"), false);
});

test("bấm S đổi người xong, máy không tự đổi ngược lại ngay khi đối thủ chạm bóng", () => {
  let flips = 0;
  for (let seed = 1; seed <= 25; seed += 1) {
    const server = createMatch({ ...CONFIG, seed, humans: [0, 1] });
    run(server, 1);
    act(server, "short", { power: 0.3 }, 0);
    run(server, 0.6);
    act(server, "switch", {}, 1);
    const picked = server.humans[1].controlledId;
    run(server, 1.5);
    if (server.humans[1].controlledId !== picked) flips += 1;
  }
  assert.equal(flips, 0, `bị đổi ngược ${flips}/25 lần`);
});

test("S khi phòng ngự: bóng sệt lăn gần chân vẫn là đổi người; chỉ bóng bổng tới mới là phá bóng", () => {
  const server = createMatch({ ...CONFIG, humans: [0, 1] });
  run(server, 1);
  act(server, "short", { power: 0.3 }, 0);
  run(server, 0.3);
  const me = server.players[server.humans[1].controlledId];
  Object.assign(server.ball, { owner: null, x: me.x + 2, y: 0.11, z: me.z, vx: 6, vy: 0, vz: 0, pass: { from: 8, to: 6, kind: "short", target: { x: me.x + 10, z: me.z } } });
  const before = me.id;
  act(server, "switchOrClear", {}, 1);
  assert.notEqual(server.humans[1].controlledId, before, "bóng sệt: S đổi người");
  const mine = server.players[server.humans[1].controlledId];
  Object.assign(server.ball, { owner: null, x: mine.x + 2, y: 2.5, z: mine.z, vx: -6, vy: 0, vz: 0, pass: { from: 8, to: 6, kind: "lob", target: { x: mine.x, z: mine.z } } });
  const now = server.humans[1].controlledId;
  act(server, "switchOrClear", {}, 1);
  assert.equal(server.humans[1].controlledId, now, "bóng bổng: S là phá bóng, không đổi người");
  assert.equal(server.humans[1].buffer?.action, "clear");
});
