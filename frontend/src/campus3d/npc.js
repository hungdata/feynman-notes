/**
 * The other students on campus: where they walk, when they go into class, and
 * the two ball games. Pure logic with an injected random(), so it runs in tests.
 */

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const pick = (random, min, max) => min + random() * (max - min);

export const buildGraph = (nodes, edges) => {
  const links = Object.fromEntries(Object.keys(nodes).map((id) => [id, []]));
  for (const [a, b] of edges) {
    const length = distance(nodes[a], nodes[b]);
    links[a].push({ to: b, length });
    links[b].push({ to: a, length });
  }
  return { nodes, links };
};

/** Shortest route between two nodes as a list of node ids (Dijkstra; the graph is tiny). */
export const findPath = (graph, from, to) => {
  if (!graph.links[from] || !graph.links[to]) return [];
  const cost = { [from]: 0 };
  const previous = {};
  const open = new Set([from]);
  const done = new Set();
  while (open.size) {
    let current = null;
    for (const id of open) if (current === null || cost[id] < cost[current]) current = id;
    if (current === to) break;
    open.delete(current);
    done.add(current);
    for (const { to: next, length } of graph.links[current]) {
      if (done.has(next)) continue;
      const total = cost[current] + length;
      if (cost[next] === undefined || total < cost[next]) {
        cost[next] = total;
        previous[next] = current;
        open.add(next);
      }
    }
  }
  if (from !== to && previous[to] === undefined) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(previous[path[0]]);
  return path;
};

/** Picks a door to walk to, weighted, never the one the student is standing at. */
export const pickDestination = (nodes, weights, random, current) => {
  const options = Object.keys(nodes).filter((id) => nodes[id].door && id !== current);
  const total = options.reduce((sum, id) => sum + (weights[nodes[id].door] || 1), 0);
  let roll = random() * total;
  for (const id of options) {
    roll -= weights[nodes[id].door] || 1;
    if (roll <= 0) return id;
  }
  return options[options.length - 1];
};

/** Where a student aims for at a node: a little to the right of travel, so two streams pass each other. */
const waypoint = (graph, path, index, lane) => {
  const node = graph.nodes[path[index]];
  const before = graph.nodes[path[Math.max(0, index - 1)]];
  const after = graph.nodes[path[Math.min(path.length - 1, index + 1)]];
  const dx = after.x - before.x;
  const dz = after.z - before.z;
  const length = Math.hypot(dx, dz) || 1;
  const side = node.door && node.door !== "outside" ? Math.min(lane, 0.35) : lane;
  return { x: node.x + (-dz / length) * side, z: node.z + (dx / length) * side };
};

// Students vanish into buildings; at the pitch, the court and the outdoor class they stay and watch.
const WATCHING = new Set(["pitch", "court", "class"]);

const setOff = (student, world, random) => {
  const destination = pickDestination(world.graph.nodes, world.weights, random, student.node);
  student.path = findPath(world.graph, student.node, destination);
  student.step = 1;
  student.state = "walk";
  student.hidden = false;
};

export const createStudent = (index, world, random) => {
  const ids = Object.keys(world.graph.nodes);
  const node = ids[Math.floor(random() * ids.length)];
  const at = world.graph.nodes[node];
  const student = {
    index, node, path: [], step: 0, state: "walk", hidden: false, wait: 0,
    x: at.x, z: at.z, heading: 0, moving: false,
    speed: pick(random, 2.5, 3.9), lane: pick(random, 0.7, 2.1), stride: random() * Math.PI * 2,
  };
  setOff(student, world, random);
  return student;
};

/** Advances one student by dt seconds. */
export const stepStudent = (student, dt, world, random) => {
  if (student.state !== "walk") {
    student.moving = false;
    student.wait -= dt;
    if (student.wait <= 0) setOff(student, world, random);
    return student;
  }
  let left = student.speed * dt;
  while (left > 0 && student.step < student.path.length) {
    const target = waypoint(world.graph, student.path, student.step, student.lane);
    const dx = target.x - student.x;
    const dz = target.z - student.z;
    const gap = Math.hypot(dx, dz);
    if (gap > 0.001) student.heading = Math.atan2(dx, dz);
    if (gap <= left) {
      student.x = target.x;
      student.z = target.z;
      student.node = student.path[student.step];
      student.step += 1;
      left -= gap;
    } else {
      student.x += (dx / gap) * left;
      student.z += (dz / gap) * left;
      left = 0;
    }
  }
  student.moving = true;
  student.stride += dt * student.speed * 2.6;
  if (student.step >= student.path.length) {
    const door = world.graph.nodes[student.node].door;
    student.moving = false;
    if (WATCHING.has(door)) {
      student.state = "watch";
      student.wait = pick(random, 6, 14);
      student.heading = door === "pitch" ? -Math.PI / 2 : door === "court" ? Math.PI / 2 : 1.75;
    } else {
      student.state = "inside";
      student.hidden = true;
      student.wait = door === "outside" ? pick(random, 1.5, 6) : pick(random, 4, 13);
    }
  }
  return student;
};

/* ---------- football: three against three, and anyone may kick the ball ---------- */

const GOAL_HALF = 3.2;
const HOMES = [[-0.34, 0], [-0.14, -0.26], [-0.14, 0.26]];

export const createFootball = (pitch) => ({
  ball: { x: pitch.x, z: pitch.z, vx: 0, vz: 0 },
  score: [0, 0],
  pause: 1,
  players: [0, 1].flatMap((team) => HOMES.map(([fx, fz], slot) => {
    const sign = team === 0 ? 1 : -1;
    const home = { x: pitch.x + sign * fx * pitch.w, z: pitch.z + fz * pitch.d };
    return { team, slot, home, x: home.x, z: home.z, heading: team === 0 ? Math.PI / 2 : -Math.PI / 2, moving: false, cooldown: 0, stride: slot * 2 };
  })),
});

const runTo = (player, target, speed, dt) => {
  const dx = target.x - player.x;
  const dz = target.z - player.z;
  const gap = Math.hypot(dx, dz);
  player.moving = gap > 0.25;
  if (!player.moving) return;
  const move = Math.min(gap, speed * dt);
  player.x += (dx / gap) * move;
  player.z += (dz / gap) * move;
  player.heading = Math.atan2(dx, dz);
  player.stride += dt * speed * 2.4;
};

/**
 * One step of the kick-about. `walkers` are passers-by (the player) as
 * { x, z, vx, vz }: walking into the ball kicks it. Returns events for sounds.
 */
export const stepFootball = (game, dt, pitch, random, walkers = []) => {
  const events = [];
  const { ball } = game;
  const half = { w: pitch.w / 2, d: pitch.d / 2 };

  if (game.pause > 0) {
    game.pause -= dt;
    for (const player of game.players) runTo(player, player.home, 3.4, dt);
    if (game.pause > 0) return events;
  }

  for (const team of [0, 1]) {
    const mates = game.players.filter((player) => player.team === team);
    const chaser = mates.reduce((best, player) => (distance(player, ball) < distance(best, ball) ? player : best));
    for (const player of mates) {
      player.cooldown = Math.max(0, player.cooldown - dt);
      if (player === chaser) {
        runTo(player, ball, 5.4, dt);
        if (distance(player, ball) < 0.95 && player.cooldown === 0) {
          const goal = { x: pitch.x + (team === 0 ? half.w : -half.w), z: pitch.z + pick(random, -2, 2) };
          const angle = Math.atan2(goal.x - ball.x, goal.z - ball.z) + pick(random, -0.4, 0.4);
          const power = pick(random, 10, 16);
          ball.vx = Math.sin(angle) * power;
          ball.vz = Math.cos(angle) * power;
          player.cooldown = 0.7;
          events.push("kick");
        }
      } else {
        runTo(player, { x: player.home.x + (ball.x - pitch.x) * 0.38, z: player.home.z + (ball.z - pitch.z) * 0.3 }, 3.6, dt);
      }
    }
  }

  for (const walker of walkers) {
    const speed = Math.hypot(walker.vx, walker.vz);
    if (speed < 0.5 || distance(walker, ball) > 1.05) continue;
    ball.vx = (walker.vx / speed) * (speed * 1.5 + 5);
    ball.vz = (walker.vz / speed) * (speed * 1.5 + 5);
    events.push("kick");
  }

  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed > 0) {
    const slowed = Math.max(0, speed - 4.6 * dt);
    ball.vx *= slowed / speed;
    ball.vz *= slowed / speed;
  }
  if (Math.abs(ball.z - pitch.z) > half.d) {
    ball.z = pitch.z + Math.sign(ball.z - pitch.z) * half.d;
    ball.vz *= -0.6;
  }
  if (Math.abs(ball.x - pitch.x) > half.w) {
    const east = ball.x > pitch.x;
    if (Math.abs(ball.z - pitch.z) < GOAL_HALF) {
      game.score[east ? 0 : 1] += 1;
      game.pause = 2;
      Object.assign(ball, { x: pitch.x, z: pitch.z, vx: 0, vz: 0 });
      events.push("goal");
    } else {
      ball.x = pitch.x + (east ? half.w : -half.w);
      ball.vx *= -0.6;
    }
  }
  return events;
};

/* ---------- basketball: four friends taking turns to shoot ---------- */

export const HOOP_HEIGHT = 5.2;

const hoopOf = (court, side) => ({ x: court.x + side * (court.w / 2 - 1.3), z: court.z });
const spotNear = (court, side, random) => {
  const hoop = hoopOf(court, side);
  const angle = pick(random, -1.1, 1.1);
  const reach = pick(random, 4.5, 7);
  return { x: hoop.x - side * Math.cos(angle) * reach, z: hoop.z + Math.sin(angle) * reach };
};

export const createBasketball = (court, random) => ({
  side: 1,
  phase: "carry",
  holder: 0,
  target: spotNear(court, 1, random),
  time: 0,
  made: 0,
  ball: { x: court.x, y: 1, z: court.z },
  from: null,
  players: [0, 1, 2, 3].map((slot) => {
    const x = court.x + (slot % 2 ? 4 : -4);
    const z = court.z + (slot < 2 ? -3 : 3);
    return { slot, x, z, heading: 0, moving: false, stride: slot, spot: { x, z }, rest: 0 };
  }),
});

export const stepBasketball = (game, dt, court, random) => {
  const events = [];
  const hoop = hoopOf(court, game.side);
  const holder = game.players[game.holder];
  game.time += dt;

  for (const player of game.players) {
    if (player === holder && (game.phase === "carry" || game.phase === "fetch")) continue;
    player.rest -= dt;
    if (player.rest <= 0) {
      player.spot = { x: court.x + pick(random, -0.42, 0.42) * court.w, z: court.z + pick(random, -0.4, 0.4) * court.d };
      player.rest = pick(random, 2, 5);
    }
    runTo(player, player.spot, 3.2, dt);
    if (!player.moving) player.heading = Math.atan2(game.ball.x - player.x, game.ball.z - player.z);
  }

  if (game.phase === "carry") {
    runTo(holder, game.target, 4.2, dt);
    const bounce = Math.abs(Math.sin(game.time * 9));
    game.ball.x = holder.x + Math.sin(holder.heading + 0.7) * 0.55;
    game.ball.z = holder.z + Math.cos(holder.heading + 0.7) * 0.55;
    game.ball.y = 0.3 + bounce * 0.95;
    if (bounce < 0.12 && !game.bounced) { events.push("bounce"); game.bounced = true; }
    if (bounce > 0.5) game.bounced = false;
    if (!holder.moving) {
      holder.heading = Math.atan2(hoop.x - holder.x, hoop.z - holder.z);
      game.phase = "shot";
      game.time = 0;
      game.from = { x: holder.x, y: 2.2, z: holder.z };
      game.scores = random() < 0.65;
      events.push("shoot");
    }
  } else if (game.phase === "shot") {
    const t = Math.min(1, game.time / 1.05);
    const miss = game.scores ? 0 : 0.7;
    game.ball.x = game.from.x + (hoop.x + miss * game.side - game.from.x) * t;
    game.ball.z = game.from.z + (hoop.z - game.from.z) * t;
    game.ball.y = game.from.y + (HOOP_HEIGHT - game.from.y) * t + Math.sin(Math.PI * t) * 2.6;
    if (t >= 1) {
      if (game.scores) { game.made += 1; events.push("score"); } else events.push("rim");
      game.phase = "fall";
      game.time = 0;
      game.drop = { x: game.ball.x - game.side * (game.scores ? 0.2 : 2.4), z: game.ball.z + pick(random, -1.5, 1.5) };
      game.from = { ...game.ball };
    }
  } else if (game.phase === "fall") {
    const t = Math.min(1, game.time / 0.7);
    game.ball.x = game.from.x + (game.drop.x - game.from.x) * t;
    game.ball.z = game.from.z + (game.drop.z - game.from.z) * t;
    game.ball.y = Math.max(0.3, game.from.y * (1 - t * t));
    if (t >= 1) {
      // The nearest friend who did not just shoot goes to fetch the ball.
      const others = game.players.filter((player) => player !== holder);
      const next = others.reduce((best, player) => (distance(player, game.ball) < distance(best, game.ball) ? player : best));
      game.holder = next.slot;
      game.phase = "fetch";
      events.push("bounce");
    }
  } else {
    runTo(holder, game.ball, 4.6, dt);
    game.ball.y = 0.3;
    if (distance(holder, game.ball) < 0.7) {
      game.side = -game.side;
      game.target = spotNear(court, game.side, random);
      game.phase = "carry";
    }
  }
  return events;
};
