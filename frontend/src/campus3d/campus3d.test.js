import test from "node:test";
import assert from "node:assert/strict";
import { BOUNDS, BUILDINGS, COURT, DECK, DOOR_WEIGHTS, EDGES, GATE, LAKE, NODES, PATHS, PIER, PITCH, PLAYER_RADIUS, PLAZA, SPAWN, TREES, buildColliders, doorOf, onDeck } from "./world.js";
import { angleDelta, moveWithCollisions, nearestDoor, reconcilePosition, segmentHitsBox, steer, turnToward } from "./movement.js";
import { buildGraph, createBasketball, createFootball, createStudent, findPath, pickDestination, stepBasketball, stepFootball, stepStudent } from "./npc.js";

// Small deterministic random so the simulations repeat exactly.
const seeded = (seed = 7) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const colliders = buildColliders();
const graph = buildGraph(NODES, EDGES);
const world = { graph, weights: DOOR_WEIGHTS };
const onPath = (x, z) => Math.hypot(x - PLAZA.x, z - PLAZA.z) <= PLAZA.r || PATHS.some(([px, pz, w, d]) => Math.abs(x - px) <= w / 2 + 0.01 && Math.abs(z - pz) <= d / 2 + 0.01);

test("arrow keys steer relative to the camera", () => {
  const up = steer({ x: 0, y: 1 }, 0);
  assert.ok(Math.abs(up.x) < 1e-9 && up.z === -1, "up walks north when the camera is south");
  const right = steer({ x: 1, y: 0 }, 0);
  assert.ok(right.x === 1 && Math.abs(right.z) < 1e-9, "right walks east");
  const turned = steer({ x: 0, y: 1 }, Math.PI / 2);
  assert.ok(Math.abs(turned.x + 1) < 1e-9 && Math.abs(turned.z) < 1e-9, "camera in the east: up walks west");
  const diagonal = steer({ x: 1, y: 1 }, 0);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-9, "diagonals are not faster");
  assert.deepEqual(steer({ x: 0, y: 0 }, 1), { x: 0, z: 0 });
});

test("turning takes the short way round", () => {
  assert.ok(Math.abs(angleDelta(3, -3) - (Math.PI * 2 - 6)) < 1e-9);
  assert.equal(turnToward(0, 1, 0.25), 0.25);
  assert.equal(turnToward(0, 0.1, 0.25), 0.1);
});

test("the player cannot walk through walls, trees or the fence", () => {
  const school = BUILDINGS.find((b) => b.id === "learn");
  const door = doorOf(school);
  let position = { x: door.x, z: door.z + 3 };
  for (let i = 0; i < 200; i += 1) position = moveWithCollisions(position, 0, -0.1, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(position.z >= door.z + PLAYER_RADIUS, `stopped at the wall (z=${position.z.toFixed(2)})`);

  // Walking into the wall at an angle slides along it.
  const before = position.x;
  for (let i = 0; i < 20; i += 1) position = moveWithCollisions(position, 0.1, -0.1, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(position.x > before + 1.5, "slides sideways along the wall");

  const [tx, tz, size] = TREES[0];
  let walker = { x: tx - 3, z: tz };
  for (let i = 0; i < 80; i += 1) walker = moveWithCollisions(walker, 0.1, 0, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(Math.hypot(walker.x - tx, walker.z - tz) >= 0.55 * size + PLAYER_RADIUS - 1e-6, "pushed out of the tree trunk");

  let runner = { x: 16, z: 70 };
  for (let i = 0; i < 400; i += 1) runner = moveWithCollisions(runner, 0, 0.2, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(runner.z <= GATE.z - 0.25 - PLAYER_RADIUS + 1e-9, "the fence blocks walking outside the gate");
});

test("the start point and every door are free to stand on", () => {
  const free = (point) => {
    const moved = moveWithCollisions(point, 0, 0, PLAYER_RADIUS, colliders, BOUNDS);
    return Math.hypot(moved.x - point.x, moved.z - point.z) < 1e-6 && !colliders.boxes.some((box) => point.x > box.minX - PLAYER_RADIUS && point.x < box.maxX + PLAYER_RADIUS && point.z > box.minZ - PLAYER_RADIUS && point.z < box.maxZ + PLAYER_RADIUS);
  };
  assert.ok(free(SPAWN), "spawn");
  for (const building of BUILDINGS) {
    const door = doorOf(building);
    assert.ok(free({ x: door.x, z: door.z + 1.2 }), `in front of ${building.id}`);
    assert.ok(onPath(door.x, door.z + 1.2), `${building.id} has a paved walk to its door`);
    assert.equal(nearestDoor({ x: door.x + 1, z: door.z + 2 }, BUILDINGS.map((b) => ({ id: b.id, ...doorOf(b) })), 5).id, building.id);
  }
  assert.equal(nearestDoor(SPAWN, BUILDINGS.map((b) => ({ id: b.id, ...doorOf(b) })), 5), null);
});

test("walls between the camera and the player are detected", () => {
  const box = { minX: -5, maxX: 5, minZ: 0, maxZ: 10, height: 12 };
  assert.ok(segmentHitsBox({ x: 0, y: 11, z: 25 }, { x: 0, y: 1, z: -4 }, box));
  assert.ok(!segmentHitsBox({ x: 0, y: 11, z: 25 }, { x: 0, y: 1, z: 14 }, box), "player in front of the building");
  assert.ok(!segmentHitsBox({ x: 20, y: 11, z: 25 }, { x: 20, y: 1, z: -4 }, box), "beside the building");
  assert.ok(!segmentHitsBox({ x: 0, y: 40, z: 6 }, { x: 0, y: 14, z: 5 }, box), "above the roof");
});

test("every door can be reached from the gate along paved paths", () => {
  for (const [a, b] of EDGES) assert.ok(NODES[a] && NODES[b], `edge ${a}-${b}`);
  for (const id of Object.keys(NODES)) {
    const path = findPath(graph, "gate", id);
    assert.ok(path.length >= 1 && path[0] === "gate" && path.at(-1) === id, `route to ${id}`);
  }
  for (const [id, node] of Object.entries(NODES)) {
    if (id === "outside") continue;
    assert.ok(onPath(node.x, node.z), `${id} stands on a path`);
  }
  assert.deepEqual(findPath(graph, "gate", "gate"), ["gate"]);
  assert.deepEqual(findPath(graph, "english", "japanese"), ["english", "langW", "langM", "japanese"]);
  // Around the fountain, not through it.
  assert.ok(!findPath(graph, "cross", "learn").includes("plaza"));
  for (const building of BUILDINGS) assert.ok(NODES[building.id]?.door === building.id, `${building.id} has a door node`);
});

test("destinations follow the weights and never repeat the current door", () => {
  const random = seeded(3);
  const counts = {};
  for (let i = 0; i < 4000; i += 1) {
    const id = pickDestination(NODES, DOOR_WEIGHTS, random, "learn");
    counts[id] = (counts[id] || 0) + 1;
  }
  assert.equal(counts.learn, undefined);
  assert.ok(counts.mindmap > counts.bursar * 2, "busy schools get more students");
});

test("students keep walking to class, go in, and come back out", () => {
  const random = seeded(11);
  const students = Array.from({ length: 24 }, (_, index) => createStudent(index, world, random));
  let entered = 0;
  let left = 0;
  let watching = 0;
  for (let frame = 0; frame < 60 * 240; frame += 1) {
    for (const student of students) {
      const before = student.state;
      const from = { x: student.x, z: student.z };
      stepStudent(student, 1 / 60, world, random);
      const moved = Math.hypot(student.x - from.x, student.z - from.z);
      assert.ok(moved <= student.speed / 60 + 1e-6, "never teleports");
      if (before === "walk" && student.state === "inside") entered += 1;
      if (before === "walk" && student.state === "watch") watching += 1;
      if (before !== "walk" && student.state === "walk") left += 1;
      assert.ok(Number.isFinite(student.x) && Number.isFinite(student.z));
      if (student.state === "walk") {
        const inWall = colliders.boxes.some((box) => box.id && student.x > box.minX + 0.4 && student.x < box.maxX - 0.4 && student.z > box.minZ + 0.4 && student.z < box.maxZ - 0.4);
        assert.ok(!inWall, `student ${student.index} walked through a building at ${student.x.toFixed(1)}, ${student.z.toFixed(1)}`);
      }
    }
  }
  assert.ok(entered > 60, `students entered buildings ${entered} times`);
  assert.ok(watching > 5, `students stopped to watch ${watching} times`);
  assert.ok(left > 60, `students came back out ${left} times`);
  assert.ok(students.some((student) => !student.hidden), "someone is always around");
});

test("the football stays on the pitch, gets kicked, and goals are counted", () => {
  const random = seeded(5);
  const game = createFootball(PITCH);
  let kicks = 0;
  let goals = 0;
  for (let frame = 0; frame < 60 * 600; frame += 1) {
    const events = stepFootball(game, 1 / 60, PITCH, random);
    kicks += events.filter((name) => name === "kick").length;
    goals += events.filter((name) => name === "goal").length;
    assert.ok(Math.abs(game.ball.x - PITCH.x) <= PITCH.w / 2 + 1e-6 && Math.abs(game.ball.z - PITCH.z) <= PITCH.d / 2 + 1e-6, "ball inside the lines");
  }
  assert.ok(kicks > 100, `${kicks} kicks`);
  assert.ok(goals >= 1 && goals === game.score[0] + game.score[1], `${goals} goals`);

  // Walking into the ball kicks it away in the walking direction.
  const fresh = createFootball(PITCH);
  fresh.pause = 0;
  fresh.players.forEach((player) => { player.cooldown = 99; });
  const events = stepFootball(fresh, 1 / 60, PITCH, random, [{ x: PITCH.x - 0.6, z: PITCH.z, vx: 4, vz: 0 }]);
  assert.ok(events.includes("kick") && fresh.ball.vx > 8 && Math.abs(fresh.ball.vz) < 1e-9);
});

test("the basketball friends dribble, shoot and fetch the ball in turns", () => {
  const random = seeded(9);
  const game = createBasketball(COURT, random);
  const seen = new Set();
  const holders = new Set();
  for (let frame = 0; frame < 60 * 180; frame += 1) {
    stepBasketball(game, 1 / 60, COURT, random).forEach((name) => seen.add(name));
    holders.add(game.holder);
    assert.ok(game.ball.y >= 0.29 && game.ball.y < 9, "ball height is sane");
    for (const player of game.players) assert.ok(Math.abs(player.x - COURT.x) <= COURT.w / 2 + 2 && Math.abs(player.z - COURT.z) <= COURT.d / 2 + 2, "players stay around the court");
  }
  for (const name of ["shoot", "score", "rim", "bounce"]) assert.ok(seen.has(name), `saw ${name}`);
  assert.ok(holders.size >= 3, "the ball changes hands");
  assert.ok(game.made > 5);
});

test("outside the school: out through the gate, down to the street, onto the pier, but not into the water", () => {
  const walk = (from, dx, dz, steps) => {
    let position = { ...from };
    for (let i = 0; i < steps; i += 1) position = moveWithCollisions(position, dx, dz, PLAYER_RADIUS, colliders, BOUNDS);
    return position;
  };
  // Straight south from the spawn point: through the gate, over the road, to the village street.
  const street = walk(SPAWN, 0, 0.2, 300);
  assert.ok(street.z > 117.9 && Math.abs(street.x) < 0.01, `reached the street (z=${street.z.toFixed(1)})`);

  // Along the pier to the deck: free. One more step south is water.
  const deck = walk({ x: PIER.x, z: 120 }, 0, 0.2, 200);
  assert.ok(onDeck(deck) && deck.z <= DECK.z + DECK.d / 2 - PLAYER_RADIUS + 1e-6, `on the deck (z=${deck.z.toFixed(2)})`);
  const sideways = walk(deck, 0.2, 0, 100);
  assert.ok(sideways.x <= DECK.x + DECK.w / 2 - PLAYER_RADIUS + 1e-6, "the deck has an edge");

  // From the bank, the lake cannot be walked into anywhere.
  for (const x of [LAKE.x - 20, LAKE.x - 6, LAKE.x + 8, LAKE.x + 22]) {
    const wet = walk({ x, z: 122 }, 0, 0.2, 200);
    assert.ok(wet.z <= LAKE.z - LAKE.d / 2 - PLAYER_RADIUS + 1e-6, `stopped at the bank at x=${x} (z=${wet.z.toFixed(2)})`);
  }
  // Halfway along the pier, stepping off sideways is not possible either.
  const off = walk({ x: PIER.x, z: 130 }, 0.2, 0, 60);
  assert.ok(off.x <= PIER.x + PIER.w / 2 - PLAYER_RADIUS + 1e-6);
  assert.ok(!onDeck({ x: 0, z: 118 }));
});

test("a small server correction aligns fishing-deck eligibility and preserves later safe movement", () => {
  // The former two-unit correction threshold left these two sides disagreeing indefinitely.
  const sent = { x: PIER.x, z: 134.8 };
  const accepted = { x: PIER.x, z: 134.6 };
  assert.ok(onDeck(sent) && !onDeck(accepted));
  assert.deepEqual(reconcilePosition(sent, accepted, sent, PLAYER_RADIUS, colliders, BOUNDS), accepted);

  const continued = { x: 20.8, z: 135.8 };
  const corrected = reconcilePosition(continued, accepted, sent, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(Math.abs(corrected.x - continued.x) < 1e-9);
  assert.ok(Math.abs(corrected.z - 135.6) < 1e-9, "movement after the sent packet is retained");
  assert.ok(onDeck(corrected));

  // Replaying westward movement from an earlier point must not cut through the water at the pier elbow.
  const corner = reconcilePosition({ x: 17.2, z: 135.8 }, { x: PIER.x, z: 135.2 }, { x: PIER.x, z: 135.8 }, PLAYER_RADIUS, colliders, BOUNDS);
  assert.ok(corner.x >= PIER.x - PIER.w / 2 + PLAYER_RADIUS - 1e-9);
  assert.deepEqual(moveWithCollisions(corner, 0, 0, PLAYER_RADIUS, colliders, BOUNDS), corner, "the correction finishes on dry planks");
});

/* ---------- the reeling game ---------- */
const { REEL, createReel, fishInZone, stepReel } = await import("./fishing.js");

test("reeling: following the fish lands it, doing nothing or only holding loses it", () => {
  const play = (pull, zone, decide, seed = 21) => {
    const random = seeded(seed);
    const reel = createReel(pull, zone);
    for (let frame = 0; frame < 60 * 120 && !reel.result; frame += 1) {
      stepReel(reel, 1 / 60, decide(reel), random);
      assert.ok(reel.fish >= 0 && reel.fish <= 1 && reel.at >= 0 && reel.at <= 1 - reel.zone + 1e-9, "everything stays on the bar");
    }
    return reel;
  };
  // A careful player: lift when the fish is above the middle of the zone.
  const careful = (reel) => reel.fish > reel.at + reel.zone / 2;
  for (const pull of [0.3, 0.5, 0.76, 0.94]) {
    const reel = play(pull, 0.3, careful);
    assert.equal(reel.result, "caught", `a careful player lands a fish that pulls ${pull}`);
    assert.ok(reel.time >= (1 - REEL.start) / REEL.gain - 1e-6, "which always takes a moment");
  }
  // Without watching the fish it mostly gets away (it can still wander into the zone by luck).
  const seeds = Array.from({ length: 60 }, (_, index) => index * 7 + 3);
  const lost = (decide) => seeds.filter((seed) => play(0.7, 0.3, decide, seed).result === "lost").length;
  assert.ok(lost(() => false) >= 42, "never lifting loses the fish most of the time");
  assert.ok(lost(() => true) >= 42, "holding all the time loses it too");

  // The legendary fish is hard on the bamboo rod and easier on a better one.
  const landed = (zone) => [3, 5, 8, 13, 21, 34, 55, 89].filter((seed) => play(1.08, zone, careful, seed).result === "caught").length;
  assert.ok(landed(0.44) >= landed(0.3));
  assert.ok(landed(0.44) >= 7);

  const fresh = createReel(0.5, 0.3);
  assert.ok(fishInZone(fresh) && fresh.progress === REEL.start);
});
