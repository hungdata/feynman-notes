import test from "node:test";
import assert from "node:assert/strict";
import { DT, POCKETS, TABLE, aimPreview, createRack, freeSpotNear, isFree, isMoving, stepPhysics, strike } from "./physics.js";
import { isOnEight, newGame, resolveShot } from "./rules.js";
import { chooseShot } from "./ai.js";

const ball = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, potted: false });
const run = (balls, limit = 20000) => {
  const events = [];
  for (let i = 0; i < limit && isMoving(balls); i += 1) stepPhysics(balls, DT, events);
  return events;
};

test("the rack has 16 balls that do not overlap, with the 8 in the middle", () => {
  const balls = createRack();
  assert.equal(balls.length, 16);
  assert.deepEqual([balls[0].x, balls[0].y], [250, 250]);
  for (const a of balls) for (const b of balls) if (a.id < b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= TABLE.r * 2, `${a.id}/${b.id}`);
  const eight = balls.find((item) => item.id === 8);
  assert.equal(eight.y, 250);
});

test("a struck ball slides, then rolls at 5/7 of its speed, bounces and stops", () => {
  const balls = [ball(0, 200, 250)];
  strike(balls, 0, 0.3);
  const start = balls[0].vx;
  assert.equal(balls[0].wy, 0, "a centre hit starts without spin");
  for (let i = 0; i < 400; i += 1) stepPhysics(balls, DT); // one second later it is rolling
  assert.ok(Math.abs(balls[0].wy - balls[0].vx / TABLE.r) < 1e-6, "rolling without slipping");
  assert.ok(balls[0].vx < start * (5 / 7) && balls[0].vx > start * 0.6);
  const events = run(balls);
  assert.equal(isMoving(balls), false);
  assert.ok(events.some((event) => event.type === "cushion"));
  assert.ok(balls[0].x >= TABLE.r && balls[0].x <= TABLE.w - TABLE.r);
  assert.ok(Math.abs(balls[0].y - 250) < 1e-6);
});

const fullHit = (distance, spin) => {
  const balls = [ball(0, 100, 250), ball(3, 100 + distance, 250)];
  strike(balls, 0, 0.35, spin);
  const events = [];
  while (!events.length) stepPhysics(balls, DT, events);
  const impactX = balls[0].x;
  const objectSpeed = balls[1].vx;
  for (let i = 0; i < 280; i += 1) stepPhysics(balls, DT); // 0.7 s after the hit, before anything comes back
  return { events, moved: balls[0].x - impactX, objectSpeed };
};

test("full hits: stun up close, follow from far away, draw with a low hit", () => {
  const stun = fullHit(60);
  assert.deepEqual([stun.events[0].type, stun.events[0].a, stun.events[0].b], ["hit", 0, 3]);
  assert.ok(stun.objectSpeed > 500);
  assert.ok(Math.abs(stun.moved) < 25, `stun moved ${stun.moved}`);
  const follow = fullHit(500);
  assert.ok(follow.moved > 60, `follow moved ${follow.moved}`);
  const draw = fullHit(120, { top: -0.5 });
  assert.ok(draw.moved < -60, `draw moved ${draw.moved}`);
  const topspin = fullHit(120, { top: 0.5 });
  assert.ok(topspin.moved > follow.moved * 0.5);
});

test("side spin changes the angle off a cushion; plain balls come straight back", () => {
  const plain = [ball(0, 700, 250)];
  strike(plain, 0, 0.3);
  const english = [ball(0, 700, 250)];
  strike(english, 0, 0.3, { side: 0.5 });
  const untilBounce = (balls) => { const events = []; while (!events.some((event) => event.type === "cushion")) stepPhysics(balls, DT, events); return balls[0]; };
  const a = untilBounce(plain);
  const b = untilBounce(english);
  assert.ok(a.vx < 0 && Math.abs(a.vy) < 1e-6);
  assert.ok(b.vx < 0 && b.vy > 20, "right-hand english comes off to the shooter's right");
});

test("balls drop into corner and side pockets", () => {
  const corner = [ball(0, 200, 200), ball(5, 100, 100)];
  strike(corner, Math.atan2(-1, -1), 0.5);
  const events = run(corner);
  assert.ok(events.some((event) => event.type === "pot" && event.id === 5 && event.pocket === 0));
  const side = [ball(0, 500, 300)];
  strike(side, -Math.PI / 2, 0.3);
  assert.ok(run(side).some((event) => event.type === "pot" && event.id === 0 && event.pocket === 1));
  assert.equal(side[0].potted, true);
});

test("the aim preview finds the first ball or the cushion", () => {
  const balls = [ball(0, 200, 250), ball(4, 600, 250), ball(9, 800, 250)];
  const straight = aimPreview(balls, 0);
  assert.equal(straight.hitId, 4);
  assert.ok(Math.abs(straight.ghost.x - (600 - 2 * TABLE.r)) < 1e-6);
  assert.ok(Math.abs(straight.objectDir.x - 1) < 1e-6 && Math.abs(straight.cueDir.x) < 1e-6);
  const wall = aimPreview(balls, Math.PI);
  assert.equal(wall.hitId, null);
  assert.equal(wall.ghost.x, TABLE.r);
  assert.equal(isFree(balls, 610, 250), false);
  const spot = freeSpotNear(balls, 600, 250);
  assert.equal(isFree(balls, spot.x, spot.y), true);
});

test("eight-ball rules: groups, fouls, keeping the turn, winning and losing", () => {
  const balls = createRack();
  let game = newGame("two");
  // Break with nothing potted: turn passes, table stays open.
  game = resolveShot(game, balls, { firstHit: 1, potted: [] });
  assert.deepEqual([game.turn, game.groups, game.breakShot, game.ballInHand], [1, [null, null], false, false]);
  // Player 2 pots a stripe: gets stripes and shoots again.
  balls.find((item) => item.id === 9).potted = true;
  game = resolveShot(game, balls, { firstHit: 9, potted: [9] });
  assert.deepEqual([game.turn, game.groups], [1, ["solid", "stripe"]]);
  // Hits a solid first: foul, ball in hand for player 1.
  game = resolveShot(game, balls, { firstHit: 2, potted: [] });
  assert.deepEqual([game.turn, game.ballInHand], [0, true]);
  assert.match(game.message, /Lỗi: chạm bi của đối thủ trước/);
  // Scratch: cue ball comes back on the table, opponent gets ball in hand.
  balls[0].potted = true;
  game = resolveShot(game, balls, { firstHit: 1, potted: [0] });
  assert.equal(balls[0].potted, false);
  assert.deepEqual([game.turn, game.ballInHand, game.foul], [1, true, "bi cái rơi lỗ"]);
  // Potting the 8 early loses.
  const early = resolveShot({ ...game, turn: 1 }, balls, { firstHit: 10, potted: [8] });
  assert.equal(early.winner, 0);
  // Clearing the group, then the 8, wins.
  balls.filter((item) => item.id > 8).forEach((item) => { item.potted = true; });
  assert.equal(isOnEight({ ...game, turn: 1 }, balls), true);
  const win = resolveShot({ ...game, turn: 1 }, balls, { firstHit: 8, potted: [8] });
  assert.equal(win.winner, 1);
  // The 8 on the break is put back on the foot spot.
  const fresh = createRack();
  fresh.find((item) => item.id === 8).potted = true;
  const afterBreak = resolveShot(newGame("two"), fresh, { firstHit: 1, potted: [8, 3] });
  assert.equal(afterBreak.winner, null);
  assert.equal(fresh.find((item) => item.id === 8).potted, false);
  assert.equal(afterBreak.turn, 0);
});

test("the computer breaks at the rack and then plays a makeable straight shot", () => {
  const rack = createRack();
  const opening = chooseShot(rack, newGame("ai"), { random: () => 0.5 });
  assert.equal(opening.power, 1);
  assert.ok(Math.abs(opening.angle) < 0.02);

  const pocket = POCKETS[2];
  const balls = [ball(0, 600, 400), ball(11, 800, 200), ball(8, 300, 100)];
  const game = { ...newGame("ai"), turn: 1, groups: ["solid", "stripe"], breakShot: false, ballInHand: false };
  const shot = chooseShot(balls, game, { random: () => 0.5 });
  strike(balls, shot.angle, shot.power);
  const events = run(balls);
  assert.equal(events.find((event) => event.type === "hit").b, 11);
  assert.ok(events.some((event) => event.type === "pot" && event.id === 11 && event.pocket === 2), `pocket ${pocket.x},${pocket.y}`);

  const inHand = chooseShot(balls.map((item) => ({ ...item, potted: false, vx: 0, vy: 0, ...(item.id === 11 ? { x: 800, y: 200 } : item.id === 0 ? { x: 100, y: 450 } : {}) })), { ...game, ballInHand: true }, { random: () => 0.5 });
  assert.ok(inHand.place, "places the cue ball when it has ball in hand");
});
