/** Shared, server-authoritative sports rules. No rendering or browser state. */
import { BOUNDS, COURT, PITCH, SPAWN } from "../frontend/src/campus3d/world.js";

export { BOUNDS, COURT, PITCH, SPAWN };
export const HOOP_HEIGHT = 5.2;
export const SPORT_CONFIG = Object.freeze({
  football: { ...PITCH, name: "Bóng đá", reach: 2.2, goalHalfWidth: 3.2 },
  basketball: { ...COURT, name: "Bóng rổ", reach: 1.7, threePointDistance: 7.4 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const usablePlayer = (player) => typeof player?.id === "string" && player.id.length > 0 && Number.isFinite(player.x) && Number.isFinite(player.z) && Number.isFinite(player.heading);
const fail = (code, message) => ({ ok: false, code, message });
const good = (event) => ({ ok: true, ...(event ? { event } : {}) });
const direction = (player) => ({ x: Math.sin(player.heading), z: Math.cos(player.heading) });

/** Team 0 attacks the east hoop; team 1 attacks the west hoop. Matches builders.js. */
export const hoopFor = (team = 0) => ({ x: COURT.x + (team === 1 ? -1 : 1) * (COURT.w / 2 - 1.45), z: COURT.z });

/** The green mark on the shot meter; direction is still chosen by the player. */
export const idealBasketPower = (player) => {
  if (!usablePlayer(player)) return 0.65;
  return clamp(distance(player, hoopFor(player.team)) / 22, 0, 1);
};

export const createSports = () => {
  const sports = {
    time: 0,
    football: { ball: { x: PITCH.x, z: PITCH.z, vx: 0, vz: 0 }, score: [0, 0], pause: 0, lastEvent: null },
    basketball: { ball: { x: COURT.x, y: 0.32, z: COURT.z, vx: 0, vy: 0, vz: 0 }, score: [0, 0], holder: null, phase: "loose", shot: null, pause: 0, lastEvent: null },
  };
  // Live references and cooldowns never appear in the public JSON snapshot.
  Object.defineProperty(sports, "_runtime", { value: { roster: new Map(), canActAt: new Map(), eventId: 0 } });
  return sports;
};

const recordEvent = (sports, game, type, player = null, extra = {}) => {
  const event = { id: ++sports._runtime.eventId, type, ...(player ? { playerId: player.id, team: player.team } : {}), ...extra };
  game.lastEvent = event;
  return event;
};

const holdBasketball = (sports, player) => {
  const game = sports.basketball;
  const aim = direction(player);
  game.holder = player.id;
  game.phase = "carry";
  game.shot = null;
  Object.assign(game.ball, { x: player.x + aim.x * 0.6, y: 1, z: player.z + aim.z * 0.6, vx: 0, vy: 0, vz: 0 });
};

export const joinSport = (sports, player, sport, requestedTeam) => {
  if (!usablePlayer(player)) return fail("INVALID_PLAYER", "Nhân vật chưa sẵn sàng.");
  if (!Object.hasOwn(SPORT_CONFIG, sport)) return fail("INVALID_SPORT", "Môn thể thao không hợp lệ.");
  if (requestedTeam !== undefined && requestedTeam !== 0 && requestedTeam !== 1) return fail("INVALID_TEAM", "Hãy chọn đội Xanh hoặc Đỏ.");
  if (player.sport === sport && sports._runtime.roster.has(player.id)) return good();

  const counts = [0, 0];
  for (const member of sports._runtime.roster.values()) {
    if (member.id !== player.id && member.sport === sport) counts[member.team] += 1;
  }
  // An explicit side is allowed only while it keeps the two teams within one player.
  const automatic = counts[0] <= counts[1] ? 0 : 1;
  const team = requestedTeam !== undefined && counts[requestedTeam] <= counts[1 - requestedTeam] ? requestedTeam : automatic;
  leaveSport(sports, player);
  const field = SPORT_CONFIG[sport];
  const teammates = counts[team];
  const sign = team === 0 ? 1 : -1;
  // Spread a busy match over each team's half instead of stacking every later
  // arrival at the same two points. Supports the runtime's 128-player campus.
  const rows = Math.max(1, Math.floor((field.d - 3) / 1.4));
  const row = Math.max(0, teammates - 1) % rows;
  const column = Math.floor(Math.max(0, teammates - 1) / rows);
  Object.assign(player, {
    sport,
    team,
    x: field.x - sign * (teammates === 0 ? 1.3 : Math.min(field.w / 2 - 1.8, 3 + column * 1.5)),
    z: field.z + (teammates === 0 ? 0 : (row - (rows - 1) / 2) * 1.4),
    heading: sign * Math.PI / 2,
    moving: false,
  });
  sports._runtime.roster.set(player.id, player);
  const basket = sports.basketball;
  if (sport === "basketball" && basket.phase === "loose" && !basket.holder && distance(player, basket.ball) <= 1.7 && basket.ball.y < 1.8) holdBasketball(sports, player);
  return good();
};

export const leaveSport = (sports, player) => {
  if (!player?.id) return fail("INVALID_PLAYER", "Nhân vật chưa sẵn sàng.");
  if (sports.basketball.holder === player.id) {
    const game = sports.basketball;
    game.holder = null;
    game.phase = "loose";
    game.shot = null;
    Object.assign(game.ball, { x: Number.isFinite(player.x) ? clamp(player.x, COURT.x - COURT.w / 2 + 0.4, COURT.x + COURT.w / 2 - 0.4) : COURT.x, y: 0.8, z: Number.isFinite(player.z) ? clamp(player.z, COURT.z - COURT.d / 2 + 0.4, COURT.z + COURT.d / 2 - 0.4) : COURT.z, vx: 0, vy: 0, vz: 0 });
  }
  sports._runtime.roster.delete(player.id);
  player.sport = null;
  player.team = null;
  return good();
};

export const actSport = (sports, player, power = 0.65) => {
  if (!usablePlayer(player) || !Object.hasOwn(SPORT_CONFIG, player.sport) || !sports._runtime.roster.has(player.id)) return fail("NOT_PLAYING", "Hãy vào sân trước khi sút hoặc ném bóng.");
  if (!Number.isFinite(power) || power < 0 || power > 1) return fail("INVALID_POWER", "Lực sút hoặc ném phải từ 0 đến 100%.");
  if ((sports._runtime.canActAt.get(player.id) || 0) > sports.time) return fail("ACTION_COOLDOWN", "Đợi một chút để thực hiện lượt tiếp theo.");
  const game = sports[player.sport];
  if (game.pause > 0) return fail("BALL_RESETTING", "Đang đưa bóng về giữa sân.");
  const aim = direction(player);
  if (player.sport === "football") {
    if (distance(player, game.ball) > SPORT_CONFIG.football.reach) return fail("BALL_TOO_FAR", "Đến gần bóng rồi nhấn sút.");
    const speed = 8 + power * 24;
    Object.assign(game.ball, { vx: aim.x * speed, vz: aim.z * speed });
    sports._runtime.canActAt.set(player.id, sports.time + 0.28);
    recordEvent(sports, game, "kick", player);
    return good("kick");
  }

  if (game.holder !== player.id) {
    if (game.holder) {
      const holder = sports._runtime.roster.get(game.holder);
      if (!holder || holder.team === player.team || distance(holder, player) > 1.6) return fail("NO_BALL", "Đến gần người cầm bóng của đội bạn để cướp bóng.");
      if ((sports._runtime.canActAt.get(holder.id) || 0) > sports.time) return fail("POSSESSION_PROTECTED", "Đối thủ vừa nhận bóng. Hãy đợi một chút.");
      holdBasketball(sports, player);
      sports._runtime.canActAt.set(player.id, sports.time + 0.45);
      recordEvent(sports, game, "steal", player);
      return good("steal");
    }
    if (game.phase !== "loose" || game.ball.y > 1.8 || distance(player, game.ball) > 1.7) return fail("NO_BALL", "Đến gần bóng để nhặt rồi nhấn ném.");
    holdBasketball(sports, player);
    recordEvent(sports, game, "pickup", player);
    return good("pickup");
  }

  const hoop = hoopFor(player.team);
  const reach = power * 22;
  const from = { x: player.x, y: 2.1, z: player.z };
  const target = { x: from.x + aim.x * reach, y: HOOP_HEIGHT, z: from.z + aim.z * reach };
  game.shot = { from, target, elapsed: 0, duration: 0.85 + reach * 0.018, shooterId: player.id, team: player.team, points: distance(player, hoop) >= SPORT_CONFIG.basketball.threePointDistance ? 3 : 2 };
  game.holder = null;
  game.phase = "shot";
  Object.assign(game.ball, { ...from, vx: 0, vy: 0, vz: 0 });
  sports._runtime.canActAt.set(player.id, sports.time + 0.65);
  recordEvent(sports, game, "shoot", player);
  return good("shoot");
};

const rebound = (ball, field) => {
  const minX = field.x - field.w / 2 + 0.32;
  const maxX = field.x + field.w / 2 - 0.32;
  const minZ = field.z - field.d / 2 + 0.32;
  const maxZ = field.z + field.d / 2 - 0.32;
  if (ball.x < minX || ball.x > maxX) {
    ball.x = clamp(ball.x, minX, maxX);
    ball.vx = Math.abs(ball.vx) * (ball.x === minX ? 0.55 : -0.55);
  }
  if (ball.z < minZ || ball.z > maxZ) {
    ball.z = clamp(ball.z, minZ, maxZ);
    ball.vz = Math.abs(ball.vz) * (ball.z === minZ ? 0.55 : -0.55);
  }
};

const stepFootball = (sports, dt, players, events) => {
  const game = sports.football;
  const ball = game.ball;
  if (![ball.x, ball.z, ball.vx, ball.vz].every(Number.isFinite)) Object.assign(ball, { x: PITCH.x, z: PITCH.z, vx: 0, vz: 0 });
  if (game.pause > 0) { game.pause = Math.max(0, game.pause - dt); return; }
  // Controlled dribbling never changes the direction of an already travelling shot.
  if (Math.hypot(ball.vx, ball.vz) < 8) {
    const dribbler = players.filter((player) => player.sport === "football" && player.moving && distance(player, ball) < 1.15 && (sports._runtime.canActAt.get(player.id) || 0) <= sports.time).sort((a, b) => distance(a, ball) - distance(b, ball))[0];
    if (dribbler) {
      const aim = direction(dribbler);
      ball.vx = aim.x * 8.5;
      ball.vz = aim.z * 8.5;
    }
  }
  const previous = { x: ball.x, z: ball.z };
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  const speed = Math.hypot(ball.vx, ball.vz);
  const slower = Math.max(0, speed - 2.8 * dt);
  if (speed > 0) { ball.vx *= slower / speed; ball.vz *= slower / speed; }
  const halfW = PITCH.w / 2;
  const crossedEast = previous.x <= PITCH.x + halfW && ball.x > PITCH.x + halfW;
  const crossedWest = previous.x >= PITCH.x - halfW && ball.x < PITCH.x - halfW;
  if (crossedEast || crossedWest) {
    const line = PITCH.x + (crossedEast ? halfW : -halfW);
    const fraction = (line - previous.x) / (ball.x - previous.x);
    const crossingZ = previous.z + (ball.z - previous.z) * fraction;
    if (Math.abs(crossingZ - PITCH.z) < SPORT_CONFIG.football.goalHalfWidth - 0.18) {
      const team = crossedEast ? 0 : 1;
      game.score[team] += 1;
      game.pause = 1.6;
      Object.assign(ball, { x: PITCH.x, z: PITCH.z, vx: 0, vz: 0 });
      events.push(recordEvent(sports, game, "goal", null, { team, points: 1 }));
      return;
    }
  }
  // Football goals are on the exact field edge; side walls sit at that edge too.
  if (Math.abs(ball.x - PITCH.x) > halfW) { ball.x = PITCH.x + Math.sign(ball.x - PITCH.x) * halfW; ball.vx *= -0.55; }
  if (Math.abs(ball.z - PITCH.z) > PITCH.d / 2) { ball.z = PITCH.z + Math.sign(ball.z - PITCH.z) * PITCH.d / 2; ball.vz *= -0.55; }
};

const stepBasketball = (sports, dt, players, events) => {
  const game = sports.basketball;
  const ball = game.ball;
  if (![ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz].every(Number.isFinite)) {
    Object.assign(ball, { x: COURT.x, y: 0.32, z: COURT.z, vx: 0, vy: 0, vz: 0 });
    game.holder = null;
    game.phase = "loose";
    game.shot = null;
  }
  if (game.pause > 0) {
    game.pause = Math.max(0, game.pause - dt);
    if (game.pause === 0) { game.phase = "loose"; Object.assign(ball, { x: COURT.x, y: 0.32, z: COURT.z, vx: 0, vy: 0, vz: 0 }); }
    return;
  }
  if (game.phase === "carry") {
    const holder = players.find((player) => player.id === game.holder && player.sport === "basketball");
    if (!holder) { game.holder = null; game.phase = "loose"; ball.vy = 0; return; }
    const aim = direction(holder);
    ball.x = holder.x + aim.x * 0.6;
    ball.z = holder.z + aim.z * 0.6;
    ball.y = 0.32 + Math.abs(Math.sin(sports.time * 8)) * 1.05;
    return;
  }
  if (game.phase === "shot" && game.shot) {
    const shot = game.shot;
    shot.elapsed += dt;
    const t = clamp(shot.elapsed / shot.duration, 0, 1);
    ball.x = shot.from.x + (shot.target.x - shot.from.x) * t;
    ball.z = shot.from.z + (shot.target.z - shot.from.z) * t;
    ball.y = shot.from.y + (HOOP_HEIGHT - shot.from.y) * t + Math.sin(Math.PI * t) * 3.1;
    if (t >= 1) {
      const hoop = hoopFor(shot.team);
      const made = distance(ball, hoop) < 0.48;
      if (made) {
        game.score[shot.team] += shot.points;
        events.push(recordEvent(sports, game, "score", { id: shot.shooterId, team: shot.team }, { points: shot.points }));
      } else events.push(recordEvent(sports, game, "rim", { id: shot.shooterId, team: shot.team }));
      game.phase = "fall";
      shot.scored = made;
      // A made ball drops through the rim. A miss rebounds and can be picked up.
      const dx = ball.x - hoop.x;
      const dz = ball.z - hoop.z;
      const gap = Math.hypot(dx, dz);
      Object.assign(ball, { vy: -1.5, vx: made ? 0 : (gap > 0.01 ? dx / gap : -Math.sign(hoop.x - COURT.x)) * 3.6, vz: made ? 0 : (gap > 0.01 ? dz / gap : 0.8) * 3.6 });
    }
    return;
  }
  ball.vy -= 12 * dt;
  ball.x += ball.vx * dt;
  ball.z += ball.vz * dt;
  ball.y += ball.vy * dt;
  rebound(ball, COURT);
  const drag = Math.exp(-1.5 * dt);
  ball.vx *= drag;
  ball.vz *= drag;
  if (ball.y < 0.32) {
    ball.y = 0.32;
    const bounce = Math.abs(ball.vy);
    ball.vy = bounce > 1 ? bounce * 0.45 : 0;
    if (game.phase === "fall") {
      if (game.shot?.scored) {
        game.pause = 0.8;
        game.shot = null;
        return;
      }
      game.phase = "loose";
      game.shot = null;
    }
  }
  if (game.phase === "loose" && ball.y < 1.8) {
    const nearest = players.filter((player) => player.sport === "basketball" && (sports._runtime.canActAt.get(player.id) || 0) <= sports.time && distance(player, ball) < 1.7).sort((a, b) => distance(a, ball) - distance(b, ball))[0];
    if (nearest) { holdBasketball(sports, nearest); sports._runtime.canActAt.set(nearest.id, sports.time + 0.15); events.push(recordEvent(sports, game, "pickup", nearest)); }
  }
};

/** Run on the server. Accept live public players, not a client-controlled ball. */
export const stepSports = (sports, dt, players) => {
  if (!Number.isFinite(dt) || dt <= 0 || !Array.isArray(players)) return [];
  const active = players.filter(usablePlayer);
  const activeIds = new Set(active.map((player) => player.id));
  for (const [id, member] of sports._runtime.roster) {
    if (!activeIds.has(id)) { leaveSport(sports, member); sports._runtime.canActAt.delete(id); }
  }
  for (const player of active) {
    const field = SPORT_CONFIG[player.sport];
    if (!field || !sports._runtime.roster.has(player.id)) continue;
    sports._runtime.roster.set(player.id, player);
    player.x = clamp(player.x, field.x - field.w / 2 + 0.55, field.x + field.w / 2 - 0.55);
    player.z = clamp(player.z, field.z - field.d / 2 + 0.55, field.z + field.d / 2 - 0.55);
  }
  const events = [];
  let remaining = Math.min(dt, 0.25);
  while (remaining > 0.000001) {
    const step = Math.min(remaining, 1 / 60);
    sports.time += step;
    stepFootball(sports, step, active, events);
    stepBasketball(sports, step, active, events);
    remaining -= step;
  }
  for (const [id, readyAt] of sports._runtime.canActAt) {
    if (!sports._runtime.roster.has(id) && readyAt <= sports.time) sports._runtime.canActAt.delete(id);
  }
  return events;
};
