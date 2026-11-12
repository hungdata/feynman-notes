/**
 * Trận đấu 11 chọi 11 kiểu FIFA Online 4: một bước mô phỏng cố định 1/60 giây.
 * Người chơi điều khiển một cầu thủ của đội nhà và đổi người như FO4; mọi cầu thủ còn lại
 * (cả đội nhà lẫn đội máy) do AI điều khiển. Có luật: giao bóng, ném biên, phạt góc,
 * phát bóng, việt vị, phạm lỗi, thẻ, phạt đền, hết hiệp, đổi sân.
 */
import { DIFFICULTIES, FIELD, KITS, PHYSICS, TEAM_PRESETS, buildSquad } from "./constants.js";
import { clearBall, choosePassTarget, emit, headBall, keeperDistribute, passBall, shootBall } from "./actions.js";
import { keeperWithBall, predictBall, shapeTarget, thinkTeams } from "./ai.js";
import { angleBetween, attackGoal, clamp, dist, facing, forward, gaussian, headingOf, humanTeam, inPenaltyBox, isUser, keeperOf, len, nearestOpponent, norm, owner, ownGoal, seededRandom, teamOf, wrapAngle } from "./util.js";

const HALF_SECONDS = 45 * 60;
const R = FIELD.ballRadius;

const newStats = () => ({ shots: 0, onTarget: 0, passes: 0, passOk: 0, fouls: 0, corners: 0, offsides: 0, yellows: 0, reds: 0, saves: 0, tackles: 0 });

const jogSpeed = (p) => (5 + p.attrs.pace * 0.02) * (0.82 + 0.18 * p.stamina);
const sprintSpeed = (p) => (6.2 + p.attrs.pace * 0.034) * (0.78 + 0.22 * p.stamina);

const makePlayer = (spec) => ({
  ...spec,
  x: 0, z: 0, vx: 0, vz: 0,
  heading: 0,
  stamina: 1,
  topSpeed: 6.2 + spec.attrs.pace * 0.034,
  state: "run",
  stateT: 0,
  cooldown: 0,
  sprint: false,
  goal: null,
  anim: { kick: 0, kickSide: 1, stride: Math.random() * 6, tackle: 0 },
  yellow: 0,
  sentOff: false,
  nextThink: 0,
  touchStart: 0,
});

/**
 * Tạo trận mới. options: { difficulty, halfMinutes, homeFormation, awayFormation, homeKit, awayKit, seed }.
 */
export const createMatch = (options = {}) => {
  const rng = seededRandom(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const difficulty = DIFFICULTIES[options.difficulty] || DIFFICULTIES.normal;
  const homeFormation = options.homeFormation || "4-3-3";
  const awayFormation = options.awayFormation || "4-2-3-1";
  const home = buildSquad({ team: 0, formation: homeFormation, ovr: options.homeOvr ?? 82, names: TEAM_PRESETS.home.names, random: rng });
  const away = buildSquad({ team: 1, formation: awayFormation, ovr: difficulty.ovr, names: TEAM_PRESETS.away.names, random: rng });
  let homeKit = options.homeKit || "red";
  let awayKit = options.awayKit || "blue";
  if (homeKit === awayKit) awayKit = homeKit === "white" ? "black" : "white";
  const match = {
    rng,
    difficulty,
    halfMinutes: options.halfMinutes || 4,
    clockRate: HALF_SECONDS / ((options.halfMinutes || 4) * 60),
    time: 0,
    clock: 0,
    half: 1,
    phase: "kickoff",
    phaseT: 0,
    setPiece: null,
    teams: [
      { ...TEAM_PRESETS.home, names: undefined, kit: KITS[homeKit], kitId: homeKit, formation: homeFormation, dir: 1, score: 0, stats: newStats() },
      { ...TEAM_PRESETS.away, names: undefined, kit: KITS[awayKit], kitId: awayKit, formation: awayFormation, dir: -1, score: 0, stats: newStats() },
    ],
    players: [...home, ...away].map(makePlayer),
    ball: { x: 0, y: R, z: 0, vx: 0, vy: 0, vz: 0, spin: null, owner: null, lastTouch: null, lastTeam: null, touchTime: 0, pass: null, shot: null, offside: null, inGoal: 0 },
    events: [],
    scorers: [],
    user: { team: 0, controlledId: 9, buffer: null, switchedAt: 0, auto: Boolean(options.autoplay) },
    input: { mx: 0, mz: 0, sprint: false, shield: false, contain: false, callPress: false },
    possession: [0, 0],
    firstKickoff: 0,
    accumulator: 0,
    pendingEnd: null,
  };
  startKickoff(match, 0);
  return match;
};

/* ---------- đặt người cho các tình huống cố định ---------- */

const place = (p, x, z, face = { x: 0, z: 0 }) => {
  p.x = clamp(x, -FIELD.halfL - 1.5, FIELD.halfL + 1.5);
  p.z = clamp(z, -FIELD.halfW - 1.5, FIELD.halfW + 1.5);
  p.vx = 0;
  p.vz = 0;
  p.state = "run";
  p.stateT = 0;
  p.goal = { x: p.x, z: p.z, sprint: false, face };
  p.heading = headingOf(face.x - p.x, face.z - p.z);
  p.runTo = null;
  p.expect = null;
  p.runPlan = null;
};

const resetBall = (match, x, z, y = R) => {
  Object.assign(match.ball, { x, y, z, vx: 0, vy: 0, vz: 0, spin: null, owner: null, pass: null, shot: null, offside: null, inGoal: 0 });
};

const kickoffSpot = (match, p) => {
  const dir = match.teams[p.team].dir;
  if (p.role === "GK") return { x: -51 * dir, z: 0 };
  const fx = Math.min(-1.2, -50 + p.slot.depth * 62);
  return { x: fx * dir, z: p.slot.width * FIELD.halfW * 0.75 * dir };
};

/** Giao bóng giữa sân cho đội `team`. */
export const startKickoff = (match, team) => {
  match.phase = "kickoff";
  match.phaseT = 0;
  resetBall(match, 0, 0);
  for (const p of match.players) {
    if (p.sentOff) continue;
    const spot = kickoffSpot(match, p);
    // Đội không giao bóng đứng ngoài vòng tròn giữa sân.
    if (p.team !== team && Math.hypot(spot.x, spot.z) < FIELD.circle + 0.5) {
      const away = norm(spot.x || -match.teams[p.team].dir, spot.z);
      spot.x = away.x * (FIELD.circle + 0.6);
      spot.z = away.z * (FIELD.circle + 0.6);
    }
    place(p, spot.x, spot.z, { x: 0, z: 0 });
  }
  const mates = teamOf(match, team);
  const taker = mates.find((p) => p.role === "ST") || mates[mates.length - 1];
  const dir = match.teams[team].dir;
  place(taker, -0.45 * dir, 0, { x: 5 * dir, z: 0 });
  match.setPiece = { type: "kickoff", team, x: 0, z: 0, takerId: taker.id, t: 0, ready: 0.6, auto: team === match.user.team ? 12 : 1.4 };
  match.ball.owner = taker.id;
  match.ball.lastTouch = taker.id;
  match.ball.lastTeam = team;
  if (team === match.user.team) setControlled(match, taker.id);
  emit(match, "kickoff", { team });
};

const pushOut = (match, team, center, radius) => {
  for (const p of teamOf(match, team)) {
    const d = dist(p, center);
    if (d < radius) {
      const away = d > 0.01 ? norm(p.x - center.x, p.z - center.z) : { x: -match.teams[team].dir, z: 0 };
      place(p, center.x + away.x * (radius + 0.4), center.z + away.z * (radius + 0.4), center);
    }
  }
};

/**
 * Bắt đầu tình huống cố định: throw | corner | goalkick | freekick | penalty.
 */
export const startSetPiece = (match, type, team, spot) => {
  match.phase = "setpiece";
  match.phaseT = 0;
  const dir = match.teams[team].dir;
  const goal = attackGoal(match, team);
  const own = ownGoal(match, team);
  const defending = 1 - team;
  const mates = teamOf(match, team);
  let taker;
  let ballY = R;
  let face = goal;

  if (type === "goalkick") {
    taker = keeperOf(match, team) || mates[0];
    spot = { x: own.x + dir * FIELD.sixDepth, z: Math.sign(spot.z || 1) * 4.5 };
    face = { x: spot.x + dir * 10, z: spot.z };
  } else if (type === "corner") {
    const wide = mates.filter((p) => ["LW", "RW", "LM", "RM", "CAM", "CM"].includes(p.role));
    taker = wide.sort((a, b) => dist(a, spot) - dist(b, spot))[0] || mates[1];
    face = { x: goal.x - dir * 11, z: 0 };
  } else if (type === "penalty") {
    taker = mates.filter((p) => p.role !== "GK").sort((a, b) => b.attrs.shoot - a.attrs.shoot)[0];
    spot = { x: goal.x - dir * FIELD.penaltySpot, z: 0 };
  } else if (type === "throw") {
    taker = mates.filter((p) => p.role !== "GK").sort((a, b) => dist(a, spot) - dist(b, spot))[0];
    ballY = 2.1;
    face = { x: spot.x + dir * 6, z: spot.z * 0.6 };
  } else {
    taker = mates.filter((p) => p.role !== "GK").sort((a, b) => dist(a, spot) - dist(b, spot) + (b.attrs.pass - a.attrs.pass) * 0.05)[0];
  }

  resetBall(match, spot.x, spot.z, ballY);
  const toFace = norm(face.x - spot.x, face.z - spot.z);
  const back = type === "throw" ? 0 : 0.55;
  place(taker, spot.x - toFace.x * back, spot.z - toFace.z * back, face);
  match.ball.owner = taker.id;
  match.ball.lastTouch = taker.id;
  match.ball.lastTeam = team;

  // Cầu thủ khác vào vị trí. Ném biên thì họ tự chạy; còn lại “cắt cảnh” như FO4.
  const teleport = type !== "throw";
  const attackers = mates.filter((p) => p !== taker && p.role !== "GK").sort((a, b) => b.attrs.physical + b.attrs.shoot - (a.attrs.physical + a.attrs.shoot));
  const defenders = teamOf(match, defending);
  const keeper = keeperOf(match, defending);
  if (keeper) place(keeper, goal.x - dir * 0.6, 0, spot);
  const nearGoal = dist(spot, goal) < 36;

  if (type === "corner" || type === "penalty" || (type === "freekick" && nearGoal)) {
    const boxSpots = [[-5.5, -2.5], [-7.5, 2.5], [-10.5, 0], [-6, 5.5], [-12, -5], [-16.5, 8], [-17, -9]];
    attackers.forEach((p, i) => {
      if (type === "penalty") place(p, goal.x - dir * (19 + (i % 3)), -15 + i * 3.4, spot);
      else if (i < boxSpots.length - (type === "freekick" ? 2 : 0)) place(p, goal.x + dir * boxSpots[i][0], boxSpots[i][1] * (spot.z < 0 ? -1 : 1), spot);
      else { const base = shapeTarget(match, p, true); place(p, base.x, base.z, spot); }
    });
    const field = defenders.filter((p) => p !== keeper);
    const wall = [];
    if (type === "freekick") {
      const toGoal = norm(goal.x - spot.x, goal.z - spot.z);
      const across = { x: -toGoal.z, z: toGoal.x };
      const count = dist(spot, goal) < 25 ? 4 : 3;
      for (let i = 0; i < count && i < field.length; i += 1) {
        const offset = (i - (count - 1) / 2) * 0.62;
        wall.push(field[i]);
        place(field[i], spot.x + toGoal.x * FIELD.circle + across.x * offset, spot.z + toGoal.z * FIELD.circle + across.z * offset, spot);
        field[i].inWall = true;
      }
    }
    const markers = field.filter((p) => !wall.includes(p));
    markers.forEach((p, i) => {
      if (type === "penalty") { place(p, goal.x - dir * (19 + (i % 3)), 15 - i * 3.4, spot); return; }
      const mark = attackers[i];
      if (mark && i < 7) {
        const side = norm(goal.x - mark.x, goal.z - mark.z);
        place(p, mark.x + side.x * 1.1, mark.z + side.z * 1.1, spot);
      } else if (i === 7 && type === "corner") place(p, goal.x - dir * 0.8, spot.z < 0 ? -3.2 : 3.2, spot);
      else { const base = shapeTarget(match, p, false); place(p, base.x, base.z, spot); }
    });
  } else if (teleport) {
    for (const p of match.players) {
      if (p === taker || p.sentOff || p === keeper) continue;
      const base = shapeTarget(match, p, p.team === team);
      place(p, base.x, base.z, spot);
    }
    if (type === "goalkick") {
      const box = { x: own.x + dir * 8, z: 0 };
      for (const p of teamOf(match, defending)) if (Math.abs(p.x - own.x) < FIELD.boxDepth + 1 && Math.abs(p.z) < FIELD.boxHalf + 1) place(p, own.x + dir * (FIELD.boxDepth + 2), p.z, box);
      const gk = keeperOf(match, team);
      if (gk && gk !== taker) place(gk, own.x + dir * 0.6, 0, spot);
    }
  }
  if (type !== "throw" && type !== "penalty") pushOut(match, defending, spot, FIELD.circle);
  if (type === "throw") pushOut(match, defending, spot, 2.2);

  const userSide = team === match.user.team;
  match.setPiece = { type, team, x: spot.x, z: spot.z, takerId: taker.id, t: 0, ready: type === "throw" ? 0.5 : 0.9, auto: userSide ? (type === "penalty" ? 20 : 10) : type === "penalty" ? 1.8 : 1.3 + match.rng() * 0.6 };
  if (userSide) setControlled(match, taker.id);
  if (type === "corner") match.teams[team].stats.corners += 1;
  emit(match, type, { team, x: spot.x, z: spot.z });
};

const setControlled = (match, id) => {
  if (match.user.controlledId === id) return;
  match.user.controlledId = id;
  match.user.switchedAt = match.time;
  emit(match, "switch", { id });
};

/* ---------- lỗi, thẻ, việt vị ---------- */

const callFoul = (match, offender, victim, { fromBehind = false } = {}) => {
  match.teams[offender.team].stats.fouls += 1;
  emit(match, "foul", { id: offender.id, victim: victim.id });
  const roll = match.rng();
  const card = fromBehind ? roll < 0.65 : roll < 0.18;
  if (card) {
    offender.yellow += 1;
    match.teams[offender.team].stats.yellows += 1;
    emit(match, "card", { id: offender.id, color: offender.yellow >= 2 ? "red" : "yellow" });
    if (offender.yellow >= 2) {
      offender.sentOff = true;
      match.teams[offender.team].stats.reds += 1;
      place(offender, offender.x, FIELD.halfW + 6);
      if (match.user.controlledId === offender.id) setControlled(match, teamOf(match, offender.team).find((p) => p.role !== "GK")?.id ?? offender.id);
    }
  }
  if (inPenaltyBox(match, offender.team, victim)) startSetPiece(match, "penalty", victim.team, victim);
  else startSetPiece(match, "freekick", victim.team, { x: clamp(victim.x, -FIELD.halfL + 1, FIELD.halfL - 1), z: clamp(victim.z, -FIELD.halfW + 1, FIELD.halfW - 1) });
};

const callOffside = (match, player) => {
  match.teams[player.team].stats.offsides += 1;
  emit(match, "offside", { id: player.id });
  startSetPiece(match, "freekick", 1 - player.team, { x: player.x, z: player.z });
};

/* ---------- giành bóng ---------- */

const gainBall = (match, p, { hands = false } = {}) => {
  const { ball } = match;
  if (ball.offside && ball.offside.team === p.team && ball.offside.ids.has(p.id)) {
    callOffside(match, p);
    return;
  }
  const pass = ball.pass;
  if (pass && match.players[pass.from].team === p.team && pass.from !== p.id) match.teams[p.team].stats.passOk += 1;
  if (ball.shot && ball.shot.team !== p.team && p.role === "GK") {
    match.teams[p.team].stats.saves += 1;
    emit(match, "save", { id: p.id, caught: true });
  }
  ball.owner = p.id;
  ball.lastTouch = p.id;
  ball.lastTeam = p.team;
  ball.touchTime = match.time;
  ball.pass = null;
  ball.shot = null;
  ball.offside = null;
  ball.spin = null;
  ball.vy = 0;
  p.touchStart = match.time;
  p.expect = null;
  p.runTo = null;
  p.nextThink = match.time + 0.25 + match.rng() * 0.3;
  if (hands) {
    p.state = "hold";
    p.holdSince = match.time;
    ball.y = 1.1;
  }
  emit(match, "touch", { id: p.id });
  // Đối thủ vừa có bóng: tự đổi sang hậu vệ hợp lý nếu người bạn đang cầm ở quá xa (như FO4).
  if (p.team !== match.user.team && !match.user.auto) {
    const mine = match.players[match.user.controlledId];
    if (mine && (mine.role === "GK" || dist(mine, p) > 12)) {
      const next = bestSwitch(match);
      if (next && dist(next, p) < dist(mine, p) - 3) setControlled(match, next.id);
    }
  }
  if (p.team === match.user.team) {
    setControlled(match, p.id);
    const buffered = match.user.buffer;
    match.user.buffer = null;
    if (buffered && buffered.until >= match.time && !hands) performAttack(match, p, buffered.action, buffered.opts);
  }
};

const footPoint = (p) => {
  const f = facing(p.heading);
  return { x: p.x + f.x * 0.35, z: p.z + f.z * 0.35 };
};

const tryPickup = (match) => {
  const { ball } = match;
  if (ball.owner !== null || ball.inGoal) return;
  const speed = Math.hypot(ball.vx, ball.vz, ball.vy);
  const pass = ball.pass;
  const crossInBox = pass && pass.kind === "lob";
  const candidates = [];
  let header = null;
  for (const p of match.players) {
    if (p.sentOff || match.time < p.cooldown || p.state === "down" || p.state === "slide" || p.state === "dive") continue;
    const foot = footPoint(p);
    const d = Math.hypot(ball.x - foot.x, ball.z - foot.z);
    const body = Math.hypot(ball.x - p.x, ball.z - p.z);
    const backPass = pass && match.players[pass.from].team === p.team && pass.kind !== "lob";
    if (p.role === "GK" && inPenaltyBox(match, p.team, ball) && !backPass && ball.y < 2.6 && body < 1.25) {
      candidates.push({ p, d: body, hands: true });
      continue;
    }
    const reach = 0.72 + p.attrs.dribble * 0.003;
    // Bóng sệt: đỡ bằng chân. Bóng ngang ngực đang rơi: khống chế bằng ngực/đùi (trừ tạt bổng vào vòng cấm).
    const chest = ball.y < 1.75 && ball.vy <= 0.5 && speed < 24 && !(crossInBox && inPenaltyBox(match, 1 - p.team, ball) && (pass.to === p.id || match.players[pass.from].team !== p.team) && ball.y > 0.95);
    if (d < reach && (ball.y < 0.95 || chest)) candidates.push({ p, d, hands: false });
    else if (ball.y >= 0.95 && ball.y < 2.75 && body < 0.9 && speed > 3 && !header) header = p;
  }
  // Người được chuyền tới được ưu tiên khi cùng tranh bóng.
  const priority = (c) => c.d - (pass && pass.to === c.p.id ? 0.35 : 0);
  candidates.sort((a, b) => priority(a) - priority(b));
  for (const { p: best, hands } of candidates) {
    // Bóng căng đi ngang qua đối thủ: không phải lúc nào cũng cắt được.
    const fresh = match.time - ball.touchTime < 1.6;
    if (!hands && fresh && best.team !== ball.lastTeam && speed > 9) {
      let cut = clamp(0.4 + best.attrs.defend / 220 - (speed - 9) * 0.035, 0.12, 0.85);
      if (match.time - ball.touchTime < 0.15) cut *= 0.35;
      if (match.rng() > cut) { best.cooldown = match.time + 0.3; continue; }
    }
    // Đỡ bước một: bóng quá mạnh và kỹ thuật kém thì bóng bật ra.
    if (!hands && speed > 15) {
      const miss = ((speed - 15) / 28) * (1.25 - best.attrs.dribble / 100);
      if (match.rng() < miss) {
        const angle = (match.rng() - 0.5) * 2.4;
        const along = norm(ball.vx, ball.vz);
        const out = { x: along.x * Math.cos(angle) - along.z * Math.sin(angle), z: along.x * Math.sin(angle) + along.z * Math.cos(angle) };
        ball.vx = out.x * speed * 0.32;
        ball.vz = out.z * speed * 0.32;
        ball.vy = 1.2;
        ball.lastTouch = best.id;
        ball.lastTeam = best.team;
        ball.pass = null;
        ball.shot = null;
        ball.offside = null;
        best.cooldown = match.time + 0.35;
        emit(match, "touch", { id: best.id, heavy: true });
        return;
      }
    }
    if (hands && speed > 27 && match.rng() < 0.5) {
      // Bóng quá căng: thủ môn chỉ đẩy ra được.
      parry(match, best);
      return;
    }
    gainBall(match, best, { hands });
    return;
  }
  if (header) {
    const buffered = match.user.buffer && match.user.buffer.until >= match.time && isUser(match, header) ? match.user.buffer : null;
    match.user.buffer = null;
    if (buffered && buffered.action === "shoot") shootBall(match, header, { power: buffered.opts?.power ?? 0.6, kind: "header", aim: buffered.opts?.aim });
    else if (buffered && ["short", "through", "lob"].includes(buffered.action)) { passBall(match, header, { kind: "short", aim: buffered.opts?.aim, power: 0.3 }); match.ball.vy = 2; }
    else headBall(match, header);
    header.anim.header = 1;
    if (header.team === match.user.team) setControlled(match, header.id);
  }
};

const parry = (match, keeper) => {
  const { ball } = match;
  const out = Math.sign(ball.z || (match.rng() - 0.5)) || 1;
  const away = -Math.sign(ownGoal(match, keeper.team).x);
  if (match.rng() < 0.45) {
    // Đẩy bóng chịu phạt góc: bóng đi ra ngoài đường biên ngang.
    ball.vx = -away * (2 + match.rng() * 3);
    ball.vz = out * (6 + match.rng() * 4);
  } else {
    ball.vx = away * (3 + match.rng() * 5);
    ball.vz = out * (5 + match.rng() * 7);
  }
  ball.vy = 2 + match.rng() * 3;
  ball.spin = null;
  ball.lastTouch = keeper.id;
  ball.lastTeam = keeper.team;
  ball.shot = null;
  ball.pass = null;
  keeper.cooldown = match.time + 0.5;
  match.teams[keeper.team].stats.saves += 1;
  emit(match, "save", { id: keeper.id, caught: false });
};

/* ---------- tranh chấp và tắc bóng ---------- */

const contest = (match, dt) => {
  const holder = owner(match);
  if (!holder || holder.state === "hold" || match.phase !== "play") return;
  if (match.time - holder.touchStart < 0.3) return;
  for (const o of match.players) {
    if (o.team === holder.team || o.sentOff || o.state !== "run" || match.time < o.cooldown) continue;
    const d = Math.hypot(o.x - match.ball.x, o.z - match.ball.z);
    if (d > 0.95) continue;
    let rate;
    if (isUser(match, o)) rate = match.input.contain ? 0.95 : 0.2;
    else rate = o.team === match.user.team ? 0.85 : 1.45 * match.difficulty.tackle;
    rate *= (o.attrs.defend + 20) / (Math.max(35, holder.attrs.dribble) + 20);
    if (holder.sprint) rate *= 1.35;
    if (isUser(match, holder) && match.input.shield) rate *= 0.45;
    if (match.rng() < rate * dt) {
      winTackle(match, o, holder, match.rng() < 0.55);
      return;
    }
  }
};

const winTackle = (match, tackler, victim, keep) => {
  victim.cooldown = match.time + 0.6;
  victim.state = "stumble";
  victim.stateT = 0.45;
  match.teams[tackler.team].stats.tackles += 1;
  emit(match, "tackle", { id: tackler.id, victim: victim.id });
  if (keep) {
    match.ball.owner = null;
    gainBall(match, tackler);
  } else {
    const { ball } = match;
    const f = facing(tackler.heading);
    ball.owner = null;
    ball.vx = f.x * (3 + match.rng() * 4) + (match.rng() - 0.5) * 3;
    ball.vz = f.z * (3 + match.rng() * 4) + (match.rng() - 0.5) * 3;
    ball.vy = 0.8;
    ball.lastTouch = tackler.id;
    ball.lastTeam = tackler.team;
    tackler.cooldown = match.time + 0.12;
  }
};

const standingTackle = (match, p) => {
  const holder = owner(match);
  p.anim.tackle = 1;
  if (!holder || holder.team === p.team) {
    // Bóng lăn tự do sát chân: đá bóng đi.
    if (!holder && Math.hypot(match.ball.x - p.x, match.ball.z - p.z) < 1.5 && match.ball.y < 0.8) {
      const f = facing(p.heading);
      Object.assign(match.ball, { vx: f.x * 7, vz: f.z * 7, vy: 0.5, lastTouch: p.id, lastTeam: p.team, pass: null, shot: null, offside: null });
      emit(match, "kick", { id: p.id, strength: 0.4 });
    }
    p.cooldown = match.time + 0.35;
    return;
  }
  const reach = Math.hypot(match.ball.x - p.x, match.ball.z - p.z);
  if (reach > 1.8) { p.cooldown = match.time + 0.45; p.state = "stumble"; p.stateT = 0.3; return; }
  const toTackler = norm(p.x - holder.x, p.z - holder.z);
  const holderFace = facing(holder.heading);
  const behind = angleBetween(holderFace.x, holderFace.z, toTackler.x, toTackler.z) > 2.2;
  // Phải quay mặt về phía bóng mới tắc được.
  const toBall = norm(match.ball.x - p.x, match.ball.z - p.z);
  const look = facing(p.heading);
  const aimed = angleBetween(look.x, look.z, toBall.x, toBall.z) < 1.2;
  let chance = clamp(0.36 + (p.attrs.defend - holder.attrs.dribble) * 0.012 + (1.8 - reach) * 0.12 - (behind ? 0.2 : 0), 0.1, 0.85) * (aimed ? 1 : 0.35);
  if (isUser(match, holder) && match.input.shield) chance *= 0.6;
  if (match.rng() < chance) winTackle(match, p, holder, match.rng() < 0.62);
  else {
    p.cooldown = match.time + 0.8;
    p.state = "stumble";
    p.stateT = 0.5;
    if (behind && match.rng() < 0.4) callFoul(match, p, holder, { fromBehind: true });
  }
};

const startSlide = (match, p) => {
  const f = facing(p.heading);
  const speed = Math.max(8, Math.hypot(p.vx, p.vz) + 2);
  p.state = "slide";
  p.stateT = 0.62;
  p.vx = f.x * speed;
  p.vz = f.z * speed;
  p.slide = { clean: false, fouled: false };
  emit(match, "slide", { id: p.id });
};

const updateSlide = (match, p) => {
  if (p.slide.clean || p.slide.fouled) return;
  const { ball } = match;
  const f = facing(p.heading);
  const foot = { x: p.x + f.x * 0.75, z: p.z + f.z * 0.75 };
  const holder = owner(match);
  if (ball.y < 0.6 && Math.hypot(ball.x - foot.x, ball.z - foot.z) < 1.05 && !ball.inGoal) {
    p.slide.clean = true;
    if (holder) {
      holder.cooldown = match.time + 0.8;
      holder.state = "down";
      holder.stateT = 0.8;
      match.teams[p.team].stats.tackles += 1;
      emit(match, "tackle", { id: p.id, victim: holder.id, slide: true });
    }
    Object.assign(ball, { owner: null, vx: f.x * 8 + (match.rng() - 0.5) * 3, vz: f.z * 8 + (match.rng() - 0.5) * 3, vy: 0.6, lastTouch: p.id, lastTeam: p.team, pass: null, shot: null, offside: null, spin: null });
    p.cooldown = match.time + 0.6;
    return;
  }
  if (holder && holder.team !== p.team && dist(holder, p) < 0.85) {
    p.slide.fouled = true;
    const toSlider = norm(p.x - holder.x, p.z - holder.z);
    const holderFace = facing(holder.heading);
    const behind = angleBetween(holderFace.x, holderFace.z, toSlider.x, toSlider.z) > 2.1;
    holder.state = "down";
    holder.stateT = 0.9;
    callFoul(match, p, holder, { fromBehind: behind });
  }
};

/* ---------- thủ môn bay người ---------- */

const keeperSaves = (match) => {
  const { ball } = match;
  if (ball.owner !== null || ball.inGoal) return;
  const speed = Math.hypot(ball.vx, ball.vz);
  if (speed < 7) return;
  for (const team of [0, 1]) {
    const keeper = keeperOf(match, team);
    if (!keeper || keeper.state === "dive" || keeper.state === "hold" || match.time < keeper.cooldown) continue;
    const goal = ownGoal(match, team);
    const toward = (goal.x - ball.x) * ball.vx > 0;
    if (!toward || Math.abs(goal.x - ball.x) > 40) continue;
    // Thời điểm bóng đi qua mặt phẳng của thủ môn.
    const planeX = keeper.x;
    const t = (planeX - ball.x) / ball.vx;
    if (t <= 0 || t > 1.6) continue;
    const zAt = ball.z + ball.vz * t;
    const yAt = Math.max(R, ball.y + ball.vy * t - 0.5 * PHYSICS.gravity * t * t);
    // Chỉ phản ứng với bóng đi về phía khung thành.
    const lineT = (goal.x - ball.x) / ball.vx;
    const zLine = ball.z + ball.vz * lineT;
    const yLine = ball.y + ball.vy * lineT - 0.5 * PHYSICS.gravity * lineT * lineT;
    if (Math.abs(zLine) > FIELD.goalHalf + 1.2 || yLine > FIELD.goalHeight + 0.8) continue;
    const reaction = team === match.user.team ? 0.2 : match.difficulty.reaction;
    const need = Math.abs(zAt - keeper.z) + Math.max(0, yAt - 1.9) * 0.9;
    const reach = Math.min(3.4, 1 + keeper.attrs.keeper / 100 * 1.1 + Math.max(0, t - reaction) * 2.2);
    if (t < reaction && need > 0.55) continue;
    let chance = 0;
    if (need <= reach) chance = clamp(0.95 - Math.pow(need / reach, 2) * 0.72 - Math.max(0, speed - 20) * 0.025 + (keeper.attrs.keeper - 80) * 0.01, 0.05, 0.96);
    const success = match.rng() < chance;
    keeper.state = "dive";
    keeper.stateT = Math.max(0.55, t + 0.5);
    keeper.dive = { z: zAt, y: yAt, side: Math.sign(zAt - keeper.z) || 1, success, at: match.time + t, from: { x: keeper.x, z: keeper.z } };
    emit(match, "dive", { id: keeper.id });
  }
};

const updateDive = (match, keeper, dt) => {
  const { dive } = keeper;
  const { ball } = match;
  const left = dive.at - match.time;
  if (left > 0) {
    const pull = Math.min(1, dt / Math.max(dt, left));
    keeper.z += (dive.z - keeper.z) * pull * (dive.success ? 1 : 0.75);
  }
  if (dive.success && ball.owner === null && !dive.done) {
    const hands = { x: keeper.x, z: keeper.z };
    if (Math.hypot(ball.x - hands.x, ball.z - hands.z) < 1.2 && Math.abs(ball.y - dive.y) < 1.3) {
      dive.done = true;
      const speed = Math.hypot(ball.vx, ball.vz);
      if (speed < 21 && Math.abs(dive.z - dive.from.z) < 1.6 && keeper.attrs.keeper > 70 && match.rng() < 0.75) {
        gainBall(match, keeper, { hands: true });
        keeper.stateT = 0.4;
      } else parry(match, keeper);
    }
  }
};

/* ---------- di chuyển ---------- */

const steerTo = (p, desiredX, desiredZ, accel, dt) => {
  let dvx = desiredX - p.vx;
  let dvz = desiredZ - p.vz;
  const dv = Math.hypot(dvx, dvz);
  const max = accel * dt;
  if (dv > max) { dvx *= max / dv; dvz *= max / dv; }
  p.vx += dvx;
  p.vz += dvz;
};

const turnTo = (p, target, rate, dt) => {
  const diff = wrapAngle(target - p.heading);
  p.heading = wrapAngle(p.heading + clamp(diff, -rate * dt, rate * dt));
};

const movePlayer = (match, p, dt) => {
  const hasBall = match.ball.owner === p.id;
  if (p.state === "slide") {
    const decay = Math.max(0, 1 - dt * 1.6);
    p.vx *= decay; p.vz *= decay;
  } else if (p.state === "down" || p.state === "stumble" || p.state === "hold") {
    p.vx *= Math.max(0, 1 - dt * 8); p.vz *= Math.max(0, 1 - dt * 8);
  } else if (p.state === "dive") {
    p.vx *= 0.8; p.vz = 0;
  } else if (p.state === "celebrate" || p.state === "run") {
    let wantX = 0;
    let wantZ = 0;
    let sprint = false;
    let face = null;
    const user = isUser(match, p) && match.phase === "play";
    if (user) {
      const input = match.input;
      const amount = Math.min(1, len(input.mx, input.mz));
      sprint = input.sprint && amount > 0.1;
      const holder = owner(match);
      if (input.contain && holder && holder.team !== p.team) {
        // Giữ D: tự áp sát, đứng chắn giữa người cầm bóng và khung thành.
        const goal = ownGoal(match, p.team);
        const side = norm(goal.x - holder.x, goal.z - holder.z);
        const spot = { x: holder.x + side.x * 1.15 + holder.vx * 0.15, z: holder.z + side.z * 1.15 + holder.vz * 0.15 };
        const toward = norm(spot.x - p.x, spot.z - p.z);
        const gap = dist(p, spot);
        const speed = gap > 5 ? sprintSpeed(p) : Math.min(jogSpeed(p) * 1.05, gap * 4 + Math.hypot(holder.vx, holder.vz));
        wantX = toward.x * speed + input.mx * 1.5;
        wantZ = toward.z * speed + input.mz * 1.5;
        face = holder;
        sprint = gap > 5;
      } else if (amount > 0.05) {
        const dir = norm(input.mx, input.mz);
        let speed = (sprint ? sprintSpeed(p) : jogSpeed(p)) * amount;
        if (hasBall) speed *= 0.88 + p.attrs.dribble * 0.0012;
        if (input.shield) speed = Math.min(speed, 2.6);
        wantX = dir.x * speed;
        wantZ = dir.z * speed;
      }
    } else if (p.goal) {
      const dx = p.goal.x - p.x;
      const dz = p.goal.z - p.z;
      const d = Math.hypot(dx, dz);
      sprint = Boolean(p.goal.sprint) && d > 2.5;
      let speed = sprint ? sprintSpeed(p) : jogSpeed(p) * (p.state === "celebrate" ? 1.1 : 1);
      if (hasBall) speed *= 0.86 + p.attrs.dribble * 0.0012;
      if (d < 2.4) speed *= d / 2.4;
      if (d > 0.15) { wantX = (dx / d) * speed; wantZ = (dz / d) * speed; }
      face = p.goal.face;
    }
    p.sprint = sprint;
    const accel = (hasBall ? 13 : 17) + p.attrs.pace * 0.05;
    steerTo(p, wantX, wantZ, accel, dt);
    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 0.6 && !(face && speed < 3.2)) turnTo(p, headingOf(p.vx, p.vz), hasBall ? (sprint ? 6 : 9) : 12, dt);
    else if (face) turnTo(p, headingOf(face.x - p.x, face.z - p.z), 8, dt);
    else if (speed < 0.6 && match.ball && !hasBall) turnTo(p, headingOf(match.ball.x - p.x, match.ball.z - p.z), 5, dt);
  }
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  if (!p.sentOff) {
    p.x = clamp(p.x, -FIELD.halfL - 3, FIELD.halfL + 3);
    p.z = clamp(p.z, -FIELD.halfW - 3, FIELD.halfW + 3);
  }
  // Thể lực: chạy nước rút thì tụt, đi bộ thì hồi.
  p.stamina = clamp(p.stamina + (p.sprint ? -0.011 : 0.004) * dt, 0.25, 1);
  p.anim.kick = Math.max(0, p.anim.kick - dt * 3.2);
  p.anim.tackle = Math.max(0, p.anim.tackle - dt * 3);
  p.anim.header = Math.max(0, (p.anim.header || 0) - dt * 2.5);
  p.anim.stride += Math.hypot(p.vx, p.vz) * dt * 1.9;

  if (p.stateT > 0) {
    p.stateT -= dt;
    if (p.stateT <= 0) {
      if (p.state === "slide") { p.state = "down"; p.stateT = 0.5; }
      else if (p.state === "dive") { p.state = match.ball.owner === p.id ? "hold" : "run"; p.dive = null; if (p.state === "hold") p.holdSince = match.time; }
      else if (p.state === "down" || p.state === "stumble") p.state = "run";
    }
  }
};

const separate = (match) => {
  const list = match.players;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (a.sentOff) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (b.sentOff) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 0.64 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const push = (0.8 - d) / 2;
      const weightA = a.attrs.physical / (a.attrs.physical + b.attrs.physical);
      a.x -= (dx / d) * push * (1 - weightA) * 2;
      a.z -= (dz / d) * push * (1 - weightA) * 2;
      b.x += (dx / d) * push * weightA * 2;
      b.z += (dz / d) * push * weightA * 2;
    }
  }
};

/* ---------- bóng ---------- */

const carryBall = (match, holder) => {
  const { ball } = match;
  if (holder.state === "hold") {
    const f = facing(holder.heading);
    Object.assign(ball, { x: holder.x + f.x * 0.35, z: holder.z + f.z * 0.35, y: match.setPiece?.type === "throw" ? 2.15 : 1.05, vx: holder.vx, vz: holder.vz, vy: 0 });
    return;
  }
  if (match.setPiece) {
    Object.assign(ball, { vx: 0, vz: 0, vy: 0 });
    return;
  }
  const f = facing(holder.heading);
  const speed = Math.hypot(holder.vx, holder.vz);
  const touch = 0.42 + speed * 0.055 + (holder.sprint ? 0.28 : 0) - holder.attrs.dribble * 0.0016;
  // Bóng nhịp theo bước chạy: chạm, bóng lăn ra một chút, chạm lại.
  const rhythm = Math.abs(Math.sin(holder.anim.stride * 1.1)) * Math.min(0.35, speed * 0.04);
  ball.x = holder.x + f.x * (touch + rhythm);
  ball.z = holder.z + f.z * (touch + rhythm);
  ball.y = R;
  ball.vx = holder.vx;
  ball.vz = holder.vz;
  ball.vy = 0;
};

const postHit = (match, prev) => {
  const { ball } = match;
  for (const sx of [-1, 1]) {
    const gx = sx * FIELD.halfL;
    if (Math.abs(ball.x - gx) > 0.4) continue;
    for (const sz of [-1, 1]) {
      const pz = sz * FIELD.goalHalf;
      const dx = ball.x - gx;
      const dz = ball.z - pz;
      const d = Math.hypot(dx, dz);
      if (d < R + FIELD.postRadius && ball.y < FIELD.goalHeight + R) {
        const nx = dx / (d || 1);
        const nz = dz / (d || 1);
        const dot = ball.vx * nx + ball.vz * nz;
        if (dot < 0) {
          ball.vx -= 1.6 * dot * nx;
          ball.vz -= 1.6 * dot * nz;
          ball.x = gx + nx * (R + FIELD.postRadius + 0.01);
          ball.z = pz + nz * (R + FIELD.postRadius + 0.01);
          emit(match, "post", { x: ball.x, z: ball.z });
        }
      }
    }
    // Xà ngang.
    if (Math.abs(ball.z) < FIELD.goalHalf && Math.abs(ball.y - FIELD.goalHeight) < R + FIELD.postRadius && Math.abs(ball.x - gx) < R + FIELD.postRadius) {
      const ny = Math.sign(ball.y - FIELD.goalHeight) || 1;
      const nx = Math.sign(ball.x - gx) || -sx;
      if (ball.vy * ny < 0 || ball.vx * nx < 0) {
        if (Math.abs(prev.x - gx) > Math.abs(prev.y - FIELD.goalHeight)) ball.vx = -ball.vx * 0.6;
        else ball.vy = -ball.vy * 0.6;
        emit(match, "post", { x: ball.x, z: ball.z, bar: true });
      }
    }
  }
};

const moveBall = (match, dt) => {
  const { ball } = match;
  const holder = owner(match);
  if (holder) { carryBall(match, holder); return; }
  const prev = { x: ball.x, y: ball.y, z: ball.z };
  const airborne = ball.y > R + 0.005 || ball.vy > 0.05;
  if (airborne) {
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
    ball.vx -= PHYSICS.airDrag * speed * ball.vx * dt;
    ball.vz -= PHYSICS.airDrag * speed * ball.vz * dt;
    ball.vy -= PHYSICS.gravity * dt;
    if (ball.spin && match.time < (ball.spin.until ?? Infinity)) { ball.vx += ball.spin.x * dt; ball.vz += ball.spin.z * dt; }
  } else {
    const speed = Math.hypot(ball.vx, ball.vz);
    const slower = Math.max(0, speed - PHYSICS.rolling * dt);
    if (speed > 0) { ball.vx *= slower / speed; ball.vz *= slower / speed; }
    ball.spin = null;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.z += ball.vz * dt;
  if (ball.y < R) {
    ball.y = R;
    if (ball.vy < -1.4) {
      ball.vy = -ball.vy * PHYSICS.bounce;
      ball.vx *= PHYSICS.bounceGrip;
      ball.vz *= PHYSICS.bounceGrip;
      ball.spin = null;
      if (Math.abs(ball.vy) > 2.5) emit(match, "bounce", { strength: Math.min(1, Math.abs(ball.vy) / 9) });
    } else ball.vy = 0;
  }
  if (ball.inGoal) {
    // Lưới giữ bóng lại.
    const side = ball.inGoal;
    const back = side * (FIELD.halfL + FIELD.goalDepth - 0.15);
    if (ball.x * side > back * side) { ball.x = back; ball.vx *= -0.15; ball.vz *= 0.4; }
    if (Math.abs(ball.z) > FIELD.goalHalf - 0.15) { ball.z = Math.sign(ball.z) * (FIELD.goalHalf - 0.15); ball.vz *= -0.2; }
    if (ball.y > FIELD.goalHeight - 0.15) { ball.y = FIELD.goalHeight - 0.15; ball.vy = -Math.abs(ball.vy) * 0.2; }
    if (ball.x * side < FIELD.halfL + 0.15) { ball.x = side * (FIELD.halfL + 0.15); ball.vx = Math.abs(ball.vx) * side * 0.2; }
    return;
  }
  postHit(match, prev);
  checkGoalAndOut(match, prev);
};

const checkGoalAndOut = (match, prev) => {
  const { ball } = match;
  if (match.phase !== "play") return;
  for (const side of [-1, 1]) {
    const line = side * FIELD.halfL;
    if ((prev.x - line) * side <= 0 && (ball.x - line) * side > R) {
      const f = (line - prev.x) / (ball.x - prev.x || 1);
      const z = prev.z + (ball.z - prev.z) * f;
      const y = prev.y + (ball.y - prev.y) * f;
      if (Math.abs(z) < FIELD.goalHalf - R && y < FIELD.goalHeight - R) {
        scoreGoal(match, side);
        return;
      }
    }
  }
  if (Math.abs(ball.x) > FIELD.halfL + R) {
    const side = Math.sign(ball.x);
    const defending = match.teams[0].dir === -side ? 0 : 1;
    const lastTeam = ball.lastTeam ?? 1 - defending;
    if (lastTeam === defending) startSetPiece(match, "corner", 1 - defending, { x: side * (FIELD.halfL - 0.6), z: Math.sign(ball.z || 1) * (FIELD.halfW - 0.6) });
    else startSetPiece(match, "goalkick", defending, { x: side * FIELD.halfL, z: ball.z });
    emit(match, "out", { side });
    return;
  }
  if (Math.abs(ball.z) > FIELD.halfW + R) {
    const team = 1 - (ball.lastTeam ?? 0);
    startSetPiece(match, "throw", team, { x: clamp(ball.x, -FIELD.halfL + 1, FIELD.halfL - 1), z: Math.sign(ball.z) * (FIELD.halfW + 0.25) });
    emit(match, "out", { side: 0 });
  }
};

const scoreGoal = (match, side) => {
  const { ball } = match;
  const team = match.teams[0].dir === side ? 0 : 1;
  match.teams[team].score += 1;
  const scorer = ball.lastTouch !== null ? match.players[ball.lastTouch] : null;
  const ownGoalScored = scorer && scorer.team !== team;
  match.scorers.push({ team, name: scorer ? scorer.name : "?", minute: Math.min(match.half * 45, Math.floor(match.clock / 60) + 1), own: ownGoalScored });
  ball.inGoal = side;
  ball.owner = null;
  ball.shot = null;
  ball.pass = null;
  match.phase = "goal";
  match.phaseT = 4.2;
  match.goalTeam = team;
  match.goalScorer = scorer && !ownGoalScored ? scorer.id : null;
  for (const p of match.players) if (p.state === "dive" || p.state === "slide") { p.state = "run"; p.stateT = 0; }
  emit(match, "goal", { team, scorer: scorer?.id ?? null, own: ownGoalScored });
};

/* ---------- người chơi bấm nút ---------- */

/** Đội người chơi đang tấn công (cầm bóng hoặc được hưởng tình huống cố định)? */
export const userAttacking = (match) => {
  if (match.setPiece) return match.setPiece.team === match.user.team;
  const holder = owner(match);
  if (holder) return holder.team === match.user.team;
  const pass = match.ball.pass;
  return Boolean(pass && match.players[pass.from].team === match.user.team);
};

const performAttack = (match, p, action, opts = {}) => {
  const aim = opts.aim && len(opts.aim.x, opts.aim.z) > 0.2 ? opts.aim : null;
  const power = clamp(opts.power ?? 0.5, 0, 1);
  if (p.state === "hold" && p.role === "GK" && !match.setPiece) {
    if (action === "lob" || action === "through" || action === "lobThrough") keeperDistribute(match, p, "long");
    else {
      const receiver = choosePassTarget(match, p, aim, "short", power);
      if (receiver) passBall(match, p, { kind: "short", receiver, power, setPiece: "goalkick" });
      else keeperDistribute(match, p, "short");
    }
    switchToReceiver(match);
    return;
  }
  if (action === "shoot" || action === "finesse" || action === "chip" || action === "low") {
    shootBall(match, p, { power, kind: action === "shoot" ? "normal" : action, aim });
    return;
  }
  if (action === "knock") {
    const dir = aim ? norm(aim.x, aim.z) : facing(p.heading);
    const { ball } = match;
    ball.owner = null;
    Object.assign(ball, { vx: dir.x * 9.5, vz: dir.z * 9.5, vy: 0.4, lastTouch: p.id, lastTeam: p.team, pass: null, shot: null, offside: null });
    p.cooldown = match.time + 0.18;
    p.anim.kick = 0.6;
    emit(match, "kick", { id: p.id, strength: 0.35 });
    return;
  }
  const kind = action === "lob" ? "lob" : action === "through" ? "through" : action === "lobThrough" ? "lobThrough" : "short";
  passBall(match, p, { kind, power, aim });
  switchToReceiver(match);
};

const switchToReceiver = (match) => {
  const pass = match.ball.pass;
  if (pass && pass.to !== null && match.players[pass.to].team === match.user.team) setControlled(match, pass.to);
};

/** Chọn cầu thủ để đổi sang khi phòng ngự (Q): gần bóng nhất, ưu tiên người đứng chắn phía khung thành. */
export const bestSwitch = (match) => {
  const { ball } = match;
  const goal = ownGoal(match, match.user.team);
  const current = match.user.controlledId;
  let best = null;
  let bestScore = Infinity;
  for (const p of teamOf(match, match.user.team)) {
    if (p.role === "GK" || p.id === current) continue;
    const goalSide = Math.abs(p.x - goal.x) < Math.abs(ball.x - goal.x) ? 0 : 4;
    const score = dist(p, ball) + goalSide;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return best;
};

const takeSetPiece = (match, action, opts) => {
  const sp = match.setPiece;
  const taker = match.players[sp.takerId];
  if (sp.t < sp.ready) return false;
  const aim = opts.aim && len(opts.aim.x, opts.aim.z) > 0.2 ? opts.aim : null;
  const power = clamp(opts.power ?? 0.5, 0, 1);
  match.setPiece = null;
  match.phase = "play";
  taker.state = "run";
  if (sp.type === "throw") {
    const kind = "throw";
    const receiver = choosePassTarget(match, taker, aim, kind, action === "lob" ? 1 : action === "through" ? 0.7 : power * 0.6);
    passBall(match, taker, { kind, receiver, power: action === "lob" ? 1 : 0.5, aim, setPiece: "throw" });
    if (action === "through" && receiver) receiver.runTo = { x: receiver.x + forward(match, taker.team, 1) * 6, z: receiver.z, until: match.time + 1.5 };
  } else if (sp.type === "goalkick") {
    if (action === "lob" || action === "through") keeperDistribute(match, taker, "long");
    else keeperDistribute(match, taker, "short");
  } else if (sp.type === "penalty") {
    shootBall(match, taker, { power: action === "shoot" ? power : 0.7, kind: action === "chip" ? "chip" : action === "finesse" ? "finesse" : "normal", aim: aim || { x: 0, z: (match.rng() - 0.5) * 2 } });
    penaltyKeeper(match, taker);
  } else if (action === "shoot" || action === "finesse" || action === "chip" || action === "low") {
    shootBall(match, taker, { power, kind: action === "shoot" ? (sp.type === "freekick" ? "finesse" : "normal") : action, aim });
  } else if (sp.type === "corner" && action === "lob") {
    const goal = attackGoal(match, taker.team);
    const zone = aim ? (Math.abs(aim.z) > 0.3 ? Math.sign(aim.z) : 0) : 0;
    const spot = { x: goal.x - Math.sign(goal.x) * (zone === 0 ? 10 : 6), z: zone * 3.5 * (sp.z < 0 ? -1 : 1) * -1 };
    const mates = teamOf(match, taker.team).filter((p) => p !== taker && p.role !== "GK");
    const receiver = mates.sort((a, b) => dist(a, spot) - dist(b, spot))[0];
    passBall(match, taker, { kind: "lob", receiver, power: 0.75, setPiece: "corner" });
  } else {
    const kind = action === "lob" ? "lob" : action === "through" ? "through" : action === "lobThrough" ? "lobThrough" : "short";
    // Giao bóng không bấm hướng: chuyền về cho tiền vệ gần nhất.
    const receiver = sp.type === "kickoff" && !aim ? teamOf(match, taker.team).filter((p) => p !== taker && p.role !== "GK").sort((a, b) => dist(a, taker) - dist(b, taker))[0] : undefined;
    passBall(match, taker, { kind, power, aim, receiver, setPiece: sp.type });
  }
  if (sp.team === match.user.team) switchToReceiver(match);
  for (const p of match.players) p.inWall = false;
  return true;
};

/** Thủ môn đoán hướng khi bị sút phạt đền. */
const penaltyKeeper = (match, taker) => {
  const keeper = keeperOf(match, 1 - taker.team);
  if (!keeper) return;
  const { ball } = match;
  const t = (keeper.x - ball.x) / (ball.vx || 1);
  const zAt = ball.z + ball.vz * t;
  const guess = match.rng() < 0.55 ? Math.sign(zAt) || 1 : (match.rng() < 0.5 ? -1 : 1);
  const right = guess === (Math.sign(zAt) || 1);
  const yAt = ball.y + ball.vy * t - 0.5 * PHYSICS.gravity * t * t;
  const reachable = Math.abs(zAt) < 2.9 && yAt < 2.1;
  const success = right && reachable && match.rng() < 0.55 + (keeper.attrs.keeper - 80) * 0.01 - Math.max(0, Math.hypot(ball.vx, ball.vz) - 24) * 0.03;
  keeper.state = "dive";
  keeper.stateT = Math.max(0.6, t + 0.5);
  keeper.dive = { z: right ? zAt : guess * 2.2, y: Math.max(0.3, yAt), side: guess, success, at: match.time + t, from: { x: keeper.x, z: keeper.z } };
  emit(match, "dive", { id: keeper.id });
};

/**
 * Hành động của người chơi. Phím FO4: S chuyền ngắn, W chọc khe, A chuyền bổng/tạt,
 * D sút, Q+W chọc khe bổng, Z+D sút xoáy, Q+D bấm bóng, D+D sút sệt, Z giật bóng.
 * Phòng ngự: Q đổi người, Space tắc bóng, S xoạc bóng, W thủ môn lao ra.
 */
export const act = (match, action, opts = {}) => {
  if (match.phase === "fulltime" || match.phase === "halftime" || match.phase === "goal") return false;
  const p = match.players[match.user.controlledId];
  if (match.setPiece) {
    if (match.setPiece.team !== match.user.team) return false;
    return takeSetPiece(match, action, opts);
  }
  if (action === "switch") {
    const next = bestSwitch(match);
    if (next) setControlled(match, next.id);
    return Boolean(next);
  }
  if (action === "gkRush") {
    const keeper = keeperOf(match, match.user.team);
    if (keeper) keeper.rushUntil = match.time + 1.6;
    return true;
  }
  if (!p || p.state !== "run" && p.state !== "hold") return false;
  if (match.ball.owner === p.id) {
    performAttack(match, p, action, opts);
    return true;
  }
  if (action === "tackle") { standingTackle(match, p); return true; }
  if (action === "slide") { startSlide(match, p); return true; }
  // Bấm trước khi bóng tới: chạm một chạm (chuyền/sút ngay khi nhận bóng).
  if (["short", "through", "lob", "lobThrough", "shoot", "finesse", "chip", "low"].includes(action)) {
    match.user.buffer = { action, opts, until: match.time + 0.7 };
    // Không có bóng và không ai chuyền tới: S/A là phá bóng nếu bóng ở sát chân.
    if (!match.ball.pass && match.ball.owner === null && dist(p, match.ball) < 1.4 && match.ball.y < 1) {
      match.user.buffer = null;
      if (dist(p, ownGoal(match, p.team)) < 30 && (action === "lob" || action === "shoot")) { clearBall(match, p); return true; }
    }
    return true;
  }
  return false;
};

/* ---------- vòng lặp ---------- */

const autoSwitch = (match) => {
  const current = match.players[match.user.controlledId];
  if (match.time - match.user.switchedAt < 0.8) return;
  const holder = owner(match);
  if (holder && holder.team === match.user.team) return;
  if (match.ball.pass && match.players[match.ball.pass.from].team === match.user.team) return;
  const near = bestSwitch(match);
  if (!near || !current) return;
  // Đổi người tự động khi bạn ở quá xa bóng so với đồng đội gần nhất.
  const mine = dist(current, match.ball);
  if (current.role === "GK" || current.sentOff || mine > dist(near, match.ball) + 14 || (mine > 28 && dist(near, match.ball) < mine - 6)) setControlled(match, near.id);
};

const setPieceStep = (match, dt) => {
  const sp = match.setPiece;
  sp.t += dt;
  const taker = match.players[sp.takerId];
  taker.vx = 0;
  taker.vz = 0;
  if (sp.type === "throw" || sp.type === "goalkick") taker.state = sp.type === "throw" ? "hold" : "run";
  if (sp.type === "throw") {
    // Mọi người tự chạy về vị trí; đối thủ đứng xa người ném.
    for (const p of match.players) {
      if (p === taker || p.sentOff || isUser(match, p)) continue;
      if (p.role === "GK") { p.goal = { x: ownGoal(match, p.team).x + match.teams[p.team].dir * 2, z: clamp(match.ball.z * 0.15, -3, 3), face: match.ball }; continue; }
      const base = shapeTarget(match, p, p.team === sp.team);
      p.goal = { x: base.x, z: base.z, sprint: false, face: match.ball };
    }
  }
  if (sp.t >= sp.auto || (match.user.auto && sp.t >= 1.3)) {
    if (sp.team === humanTeam(match)) {
      takeSetPiece(match, sp.type === "corner" ? "lob" : "short", { power: 0.45 });
    } else cpuSetPiece(match);
  }
};

const cpuSetPiece = (match) => {
  const sp = match.setPiece;
  const taker = match.players[sp.takerId];
  const goal = attackGoal(match, sp.team);
  if (sp.type === "penalty") {
    // Máy sút phạt đền: chọn góc ngẫu nhiên.
    takeSetPiece(match, "shoot", { power: 0.55 + match.rng() * 0.3, aim: { x: 0, z: match.rng() < 0.5 ? -1 : 1 } });
    return;
  }
  if (sp.type === "freekick" && dist(sp, goal) < 28 && Math.abs(sp.z) < 18) {
    takeSetPiece(match, "shoot", { power: 0.62 + match.rng() * 0.15, aim: { x: 0, z: match.rng() < 0.5 ? -1 : 1 } });
    return;
  }
  if (sp.type === "corner") { takeSetPiece(match, match.rng() < 0.85 ? "lob" : "short", { power: 0.6, aim: { x: 0, z: (match.rng() - 0.5) * 2 } }); return; }
  if (sp.type === "goalkick") { takeSetPiece(match, match.rng() < 0.6 ? "short" : "lob", {}); return; }
  if (sp.type === "kickoff") {
    const back = teamOf(match, sp.team).filter((p) => ["CM", "CDM", "CAM"].includes(p.role)).sort((a, b) => dist(a, taker) - dist(b, taker))[0];
    match.setPiece = null; match.phase = "play";
    passBall(match, taker, { kind: "short", receiver: back, power: 0.3, setPiece: "kickoff" });
    return;
  }
  const look = { x: forward(match, sp.team, 1), z: -Math.sign(sp.z) * 0.3 };
  takeSetPiece(match, "short", { power: 0.45, aim: look });
};

const celebrate = (match, dt) => {
  match.phaseT -= dt;
  const scorer = match.goalScorer !== null ? match.players[match.goalScorer] : null;
  const corner = { x: Math.sign(match.ball.inGoal || 1) * (FIELD.halfL - 4), z: scorer && scorer.z < 0 ? -FIELD.halfW + 5 : FIELD.halfW - 5 };
  for (const p of match.players) {
    if (p.sentOff) continue;
    if (p.team === match.goalTeam && p.role !== "GK") {
      p.state = "celebrate";
      const target = p === scorer ? corner : scorer ? { x: scorer.x + (p.index % 3 - 1) * 1.2, z: scorer.z + ((p.index >> 1) % 3 - 1) * 1.2 } : corner;
      p.goal = { x: target.x, z: target.z, sprint: p === scorer || dist(p, target) > 12, face: null };
    } else {
      p.state = "run";
      const base = kickoffSpot(match, p);
      p.goal = { x: base.x * 0.6 + p.x * 0.4, z: base.z, sprint: false, face: null };
    }
  }
  if (match.phaseT <= 0) {
    for (const p of match.players) if (p.state === "celebrate") p.state = "run";
    if (endOfHalf(match)) return;
    startKickoff(match, 1 - match.goalTeam);
  }
};

const endOfHalf = (match) => {
  if (match.clock < match.half * HALF_SECONDS) return false;
  if (match.half === 1) {
    match.phase = "halftime";
    match.phaseT = 3;
    match.setPiece = null;
    emit(match, "halftime");
  } else {
    match.phase = "fulltime";
    match.setPiece = null;
    emit(match, "fulltime");
  }
  resetBall(match, 0, 0);
  return true;
};

/** Sang hiệp 2: đổi sân, đội còn lại giao bóng. Trang gọi hàm này khi bấm “Đá tiếp”. */
export const startSecondHalf = (match) => {
  if (match.phase !== "halftime") return;
  match.half = 2;
  match.clock = HALF_SECONDS;
  for (const team of match.teams) team.dir *= -1;
  for (const p of match.players) p.stamina = Math.min(1, p.stamina + 0.35);
  startKickoff(match, 1 - match.firstKickoff);
};

const fixedStep = (match, dt) => {
  match.time += dt;
  const phase = match.phase;
  if (phase === "fulltime") {
    for (const p of match.players) { p.goal = { x: p.x, z: p.z, face: match.ball }; movePlayer(match, p, dt); }
    return;
  }
  if (phase === "halftime") {
    match.phaseT -= dt;
    for (const p of match.players) { p.goal = { x: p.x * 0.98, z: p.z, face: null }; movePlayer(match, p, dt); }
    return;
  }
  if (phase === "goal") {
    celebrate(match, dt);
    for (const p of match.players) movePlayer(match, p, dt);
    moveBall(match, dt);
    return;
  }
  if (phase === "kickoff" || phase === "setpiece") {
    if (phase === "setpiece") match.clock += dt * match.clockRate;
    setPieceStep(match, dt);
    if (match.setPiece) {
      for (const p of match.players) if (p.id !== match.setPiece.takerId) movePlayer(match, p, dt);
      const taker = match.players[match.setPiece.takerId];
      const look = match.setPiece.type === "throw" ? { x: match.ball.x + match.teams[taker.team].dir * 5, z: match.ball.z * 0.5 } : attackGoal(match, taker.team);
      if (match.setPiece.type !== "goalkick" && match.setPiece.type !== "corner") taker.heading = headingOf(look.x - taker.x, look.z - taker.z);
      carryBall(match, taker);
      if (match.setPiece.type === "throw") match.ball.y = 2.15;
      return;
    }
  }

  // Đang đá.
  match.clock += dt * match.clockRate;
  const holder = owner(match);
  if (holder) match.possession[holder.team] += dt;
  else if (match.ball.lastTeam !== null) match.possession[match.ball.lastTeam] += dt * 0.5;
  thinkTeams(match);
  for (const p of match.players) {
    if (p.sentOff) continue;
    if (p.state === "slide") updateSlide(match, p);
    if (p.state === "dive" && p.dive) updateDive(match, p, dt);
    if (match.phase !== "play") return;
  }
  const keeperHolding = holder && holder.state === "hold" && holder.role === "GK";
  if (keeperHolding) keeperWithBall(match, holder);
  else if (holder && holder.role === "GK" && holder.team !== humanTeam(match) && match.time - holder.touchStart > 0.6) keeperDistribute(match, holder, "short");
  // Máy thỉnh thoảng xoạc khi đuổi theo từ bên cạnh.
  const now = owner(match);
  if (now && now.team === match.user.team) {
    for (const p of teamOf(match, 1 - match.user.team)) {
      if (!p.pressing || p.state !== "run" || match.time < p.cooldown) continue;
      const d = dist(p, now);
      if (d < 2.3 && d > 1.1 && now.sprint && match.rng() < 0.004 * match.difficulty.tackle) { p.heading = headingOf(match.ball.x - p.x, match.ball.z - p.z); startSlide(match, p); }
    }
  }
  for (const p of match.players) if (!p.sentOff) movePlayer(match, p, dt);
  separate(match);
  moveBall(match, dt);
  if (match.phase !== "play") return;
  tryPickup(match);
  if (match.phase !== "play") return;
  contest(match, dt);
  keeperSaves(match);
  autoSwitch(match);
  if (match.clock >= match.half * HALF_SECONDS && !match.ball.shot && match.phase === "play") endOfHalf(match);
};

/** Chạy mô phỏng theo thời gian thực của khung hình (giây). */
export const stepMatch = (match, frameSeconds) => {
  match.accumulator = Math.min(match.accumulator + Math.max(0, frameSeconds), 0.25);
  let steps = 0;
  while (match.accumulator >= PHYSICS.dt && steps < 15) {
    fixedStep(match, PHYSICS.dt);
    match.accumulator -= PHYSICS.dt;
    steps += 1;
  }
  return steps;
};

/** Lấy (và xoá) các sự kiện mới cho âm thanh, chữ trên màn hình. */
export const drainEvents = (match) => match.events.splice(0, match.events.length);

/** Phút hiển thị trên đồng hồ, ví dụ “45+” không dùng: dừng ở 45:00 và 90:00. */
export const clockText = (match) => {
  const seconds = Math.min(match.half * HALF_SECONDS, match.clock);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const possessionShare = (match) => {
  const total = match.possession[0] + match.possession[1];
  return total > 0 ? Math.round((match.possession[0] / total) * 100) : 50;
};

export { HALF_SECONDS, predictBall, gaussian, nearestOpponent };
