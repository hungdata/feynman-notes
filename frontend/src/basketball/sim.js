/**
 * Mô phỏng trận bóng rổ 5 người: nhảy tranh bóng, 4 hiệp (+ hiệp phụ), đồng hồ 24 giây, 2/3 điểm,
 * bóng bật bảng, cướp bóng, chắn bóng, phạm lỗi và ném phạt, bóng ra ngoài, phát bóng biên.
 * Bước thời gian cố định 1/60 s, thuần JS: chạy được ở trình duyệt (chơi với máy) và ở máy chủ (đấu online).
 */
import { COURT, DIFFICULTIES, KITS, PHYS, RULES, TEAM_PRESETS, buildRoster } from "./constants.js";
import { IDEAL_RELEASE, LATE_RELEASE, assistOf, attemptSteal, callDouble, callScreen, choosePassTarget, crossover, emit, flightPoint, jump, launchShot, loose, passBall, releaseQuality, releaseShot, startShot } from "./actions.js";
import { SPOTS, guardSpot, inboundThink, predictLanding, spotPoint, think } from "./ai.js";
import { attackHoop, clamp, dist, gaussian, headingOf, holder, isUser, norm, seededRandom, wrapAngle } from "./util.js";

const ACCEL = 17;
const RADIUS = 0.36;
const blankStats = () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });

export const newHuman = (team) => ({ team, controlledId: team * 5, input: { mx: 0, mz: 0, sprint: false, guard: false }, assist: "assisted", auto: false, manualAt: -10 });

export const createMatch = (options = {}) => {
  const {
    seed = Math.floor(Math.random() * 2 ** 31), quarterMinutes = 3, difficulty = "normal",
    homeKit = "orange", awayKit = "blue", humans = [0], localTeam, assist = "assisted", autoplay = false,
    names, homeOvr, awayOvr, homeAssist = assist, awayAssist = assist,
  } = options;
  const rng = seededRandom(seed);
  const level = DIFFICULTIES[difficulty] || DIFFICULTIES.normal;
  const humanTeams = autoplay ? [] : humans;
  const kitB = awayKit === homeKit ? (homeKit === "white" ? "black" : "white") : awayKit;
  const presets = [TEAM_PRESETS.home, TEAM_PRESETS.away];
  const teams = [0, 1].map((team) => {
    const cpu = !humanTeams.includes(team);
    const preset = presets[team];
    return {
      name: names?.[team] || preset.name,
      short: (names?.[team] || preset.short).slice(0, 12),
      kitId: team ? kitB : homeKit,
      kit: KITS[team ? kitB : homeKit] || KITS.orange,
      score: 0,
      dir: team ? -1 : 1,
      fouls: 0,
      flip: 1,
      iq: cpu ? level.iq : 0.72,
      react: cpu ? level.react : 0.22,
      stats: blankStats(),
      ovr: team ? (awayOvr ?? (cpu ? level.ovr : 76)) : (homeOvr ?? (cpu ? level.ovr : 76)),
    };
  });
  const players = [];
  for (const team of [0, 1]) {
    for (const base of buildRoster({ team, ovr: teams[team].ovr, names: presets[team].names, random: rng })) {
      players.push({
        ...base, id: players.length,
        x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, heading: team ? -Math.PI / 2 : Math.PI / 2,
        topSpeed: 5.4 + base.attr.speed * 2.1,
        act: null, cool: 0, stun: 0, burst: null, goal: null, plan: { kind: "spot", until: 0 }, think: 0, holdT: 0,
        driving: false, screening: false, stamina: 1, celebrate: 0, state: "run",
        anim: { stride: 0, dribble: 0, pass: 0, reach: 0, jump: 0, cross: 0 },
        stats: blankStats(),
      });
    }
  }
  const match = {
    seed, rng, time: 0, acc: 0, phase: "tipoff", phaseT: 0, quarter: 1,
    quarterLength: quarterMinutes * 60, clock: quarterMinutes * 60, shotClock: RULES.shotClock,
    teams, players, events: [],
    ball: { x: 0, y: 1.3, z: 0, vx: 0, vy: 0, vz: 0, owner: null, flight: null, lastTouch: null, dead: true },
    possession: null, arrow: 0, guard: {}, screen: null, double: null, helper: null,
    lastShot: null, lastPass: null, rimTouched: false, pendingFoul: null, inbound: null, ft: null, tip: null,
    humans: [null, null], assist, autoplay, difficulty, breakKind: null,
  };
  for (const team of humanTeams) { match.humans[team] = newHuman(team); match.humans[team].assist = team === 0 ? homeAssist : awayAssist; }
  match.user = match.humans[localTeam ?? humanTeams[0] ?? 0] || newHuman(localTeam ?? 0);
  if (!match.humans.includes(match.user)) match.user.auto = true;
  assignGuards(match);
  setupTip(match);
  return match;
};

export const drainEvents = (match) => {
  const events = match.events;
  match.events = [];
  return events;
};

/* ---------- vị trí, kèm người ---------- */

const assignGuards = (match) => {
  match.guard = {};
  for (const p of match.players) match.guard[p.id] = match.players.find((o) => o.team !== p.team && o.slot === p.slot).id;
};

const place = (p, x, z, heading) => {
  Object.assign(p, { x, z, vx: 0, vz: 0, y: 0, vy: 0, act: null, burst: null, goal: null, driving: false, screening: false });
  if (heading !== undefined) p.heading = heading;
};

const setupTip = (match) => {
  match.phase = "tipoff";
  match.phaseT = 0;
  match.tip = { tossed: false };
  const layout = [[3.4, 3.2], [3.4, -3.2], [5.2, 0.8], [2.2, -1.2], [0.55, 0]];
  for (const p of match.players) {
    const d = match.teams[p.team].dir;
    const [back, side] = layout[p.slot];
    place(p, -d * back, side * (p.team ? -1 : 1) + (p.slot < 4 ? (p.team ? 0.6 : -0.6) : 0), d > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  Object.assign(match.ball, { x: 0, y: 1.3, z: 0, vx: 0, vy: 0, vz: 0, owner: null, flight: null, dead: true });
};

const bench = (match) => {
  for (const p of match.players) {
    p.goal = { x: (p.team ? 1 : -1) * (1.8 + p.slot * 1.1), z: -COURT.halfW - 1.2, speed: 0.45 };
  }
};

/* ---------- kiểm soát bóng ---------- */

const changePossession = (match, team) => {
  match.possession = team;
  match.shotClock = RULES.shotClock;
  match.screen = null;
  match.double = null;
  match.teams[team].flip = match.rng() < 0.5 ? 1 : -1;
  assignGuards(match);
  for (const p of match.players) { p.plan.until = 0; p.driving = false; p.screening = false; }
};

const possess = (match, player, how = "catch") => {
  const b = match.ball;
  const before = match.possession;
  Object.assign(b, { owner: player.id, flight: null, vx: 0, vy: 0, vz: 0, lastTouch: player.team, dead: false });
  player.holdT = 0;
  player.think = 0.15 + match.rng() * 0.25;
  player.driving = false;
  const shot = match.lastShot;
  if (shot && !shot.rebounded && !shot.made && match.time - shot.t < 8) {
    shot.rebounded = true;
    how = "rebound";
    player.stats.reb += 1;
    match.teams[player.team].stats.reb += 1;
    if (player.team === shot.team) { match.teams[player.team].stats.oreb += 1; }
  }
  // Cắt bóng, hoặc đội cướp bóng nhặt được bóng vừa bị đánh rơi: tính cướp bóng và mất bóng.
  const stealer = how === "intercept" ? player : b.stolenBy !== null && b.stolenBy !== undefined ? match.players[b.stolenBy] : null;
  if (stealer && stealer.team === player.team && before !== null && before !== player.team) {
    stealer.stats.stl += 1;
    match.teams[player.team].stats.stl += 1;
    match.teams[before].stats.to += 1;
    if (how === "intercept") emit(match, "intercept", { id: player.id });
  }
  b.stolenBy = null;
  if (before !== player.team) changePossession(match, player.team);
  else if (match.rimTouched && how === "rebound") match.shotClock = Math.max(match.shotClock, RULES.offensiveReset);
  match.rimTouched = false;
  const human = match.humans[player.team];
  if (human) human.controlledId = player.id;
  // Bên phòng ngự: tự chuyển sang người kèm cầu thủ vừa có bóng (trừ chế độ thủ công / vừa đổi tay).
  const other = match.humans[1 - player.team];
  if (other && other.assist !== "manual" && match.time - other.manualAt > 1.5) {
    const guardId = Object.keys(match.guard).find((id) => match.guard[id] === player.id && match.players[id].team !== player.team);
    if (guardId !== undefined) other.controlledId = Number(guardId);
  }
  emit(match, how, { id: player.id, team: player.team });
};

/* ---------- phát bóng biên ---------- */

const inboundSpot = (point) => {
  const gapX = COURT.halfL - Math.abs(point.x);
  const gapZ = COURT.halfW - Math.abs(point.z);
  if (gapX < gapZ && Math.abs(point.x) > COURT.halfL - 3) {
    let z = clamp(point.z, -COURT.halfW + 1, COURT.halfW - 1);
    if (Math.abs(z) < 1.8) z = (Math.sign(z) || 1) * 2.2;
    return { x: Math.sign(point.x) * (COURT.halfL + 0.45), z, baseline: true };
  }
  return { x: clamp(point.x, -COURT.halfL + 1.5, COURT.halfL - 1.5), z: (Math.sign(point.z) || -1) * (COURT.halfW + 0.45), baseline: false };
};

export const setupInbound = (match, team, point, { keepClock = false } = {}) => {
  if (match.clock <= 0) { endPeriod(match); return; }
  const spot = inboundSpot(point);
  const same = match.possession === team;
  if (!same) changePossession(match, team);
  else if (keepClock) match.shotClock = Math.max(match.shotClock, RULES.offensiveReset);
  else match.shotClock = RULES.shotClock;
  match.phase = "inbound";
  match.phaseT = 0;
  const mates = match.players.filter((p) => p.team === team);
  // Người gần chỗ phát nhất ra phát (trừ hậu vệ dẫn bóng, người sẽ nhận bóng).
  const taker = mates.filter((p) => p.slot !== 0).sort((a, b) => dist(a, spot) - dist(b, spot))[0];
  match.inbound = { team, x: spot.x, z: spot.z, taker: taker.id, arrived: false, readyAt: null, wait: 0.45 + match.rng() * 0.5 };
  Object.assign(match.ball, { owner: null, flight: null, dead: true });
  for (const p of match.players) { p.act = null; p.burst = null; p.driving = false; p.screening = false; }
  match.lastShot = null;
  const human = match.humans[team];
  if (human) human.controlledId = taker.id;
};

const tickInbound = (match) => {
  const ib = match.inbound;
  const taker = match.players[ib.taker];
  const b = match.ball;
  if (!ib.arrived) {
    taker.goal = { x: ib.x, z: ib.z, speed: 1 };
    if (dist(taker, ib) < 0.35 || match.phaseT > 1.8) {
      ib.arrived = true;
      ib.readyAt = match.phaseT;
      place(taker, ib.x, ib.z, headingOf(-ib.x, -ib.z));
      Object.assign(b, { owner: taker.id, flight: null, dead: false, lastTouch: taker.team });
    } else if (b.owner === null && !b.flight) {
      // Bóng nằm chờ ở chỗ phát.
      b.dead = true;
    }
  }
  // Đồng đội ra chỗ nhận bóng, đối phương kèm người.
  for (const p of match.players) {
    if (p === taker) continue;
    if (p.team === ib.team) {
      let spot = spotPoint(match, p.team, SPOTS[p.slot]);
      if (p.slot === 0) spot = { x: clamp(ib.x * 0.82, -COURT.halfL + 1.5, COURT.halfL - 1.5), z: clamp(ib.z * 0.55, -5, 5) };
      // Phát bóng ở sân nhà: chạy lên sân trước.
      if (ib.x * match.teams[p.team].dir < -COURT.halfL + 2) spot = p.slot === 0 ? spot : { x: spot.x * 0.6, z: spot.z };
      if (!isUser(match, p)) p.goal = { x: spot.x, z: spot.z, speed: 0.8 };
    } else if (!isUser(match, p) || match.humans[p.team]?.input.guard) p.goal = { ...guardSpot(match, p), speed: 0.85 };
  }
  if (!ib.arrived) return;
  taker.goal = null;
  const since = match.phaseT - ib.readyAt;
  const human = match.humans[ib.team];
  const userTakes = human && !human.auto && human.controlledId === taker.id;
  if (!userTakes) inboundThink(match, taker);
  // 5 giây: người chơi chưa chuyền thì máy chuyền giúp cho khỏi phạm luật.
  else if (since > RULES.inboundSeconds - 0.4) inboundThink(match, taker, { force: true });
  if (b.flight) { match.phase = "live"; match.phaseT = 0; match.inbound = null; b.dead = false; }
};

/* ---------- ném phạt ---------- */

const ftLine = (match, team) => {
  const hoop = attackHoop(match, team);
  return { x: hoop.x - Math.sign(hoop.x) * (COURT.hoopX - (COURT.halfL - COURT.keyDepth) + 0.25), z: 0 };
};

const setupFreeThrows = (match, team, shooterId, total) => {
  match.phase = "freethrow";
  match.phaseT = 0;
  match.ft = { team, shooter: shooterId, total, index: 0, ready: 1.3, holdAt: null, flying: false };
  match.lastShot = null;
  Object.assign(match.ball, { owner: null, flight: null, dead: true });
  for (const p of match.players) { p.act = null; p.burst = null; p.driving = false; p.screening = false; }
  if (match.possession !== team) changePossession(match, team);
  const human = match.humans[team];
  if (human) human.controlledId = shooterId;
  arrangeFreeThrow(match);
};

const arrangeFreeThrow = (match) => {
  const ft = match.ft;
  const hoop = attackHoop(match, ft.team);
  const s = Math.sign(hoop.x);
  const line = ftLine(match, ft.team);
  const lane = [[COURT.halfL - 2.15, 1], [COURT.halfL - 2.15, -1], [COURT.halfL - 3.25, 1], [COURT.halfL - 3.25, -1], [COURT.halfL - 4.35, 1]];
  const defenders = match.players.filter((p) => p.team !== ft.team).sort((a, b) => b.slot - a.slot);
  const shooters = match.players.filter((p) => p.team === ft.team && p.id !== ft.shooter).sort((a, b) => b.slot - a.slot);
  const spots = new Map();
  // Phòng ngự đứng ô gần rổ nhất ở hai bên, tấn công ô kế tiếp, phòng ngự ô thứ ba.
  spots.set(defenders[0].id, lane[0]); spots.set(defenders[1].id, lane[1]);
  spots.set(shooters[0].id, lane[2]); spots.set(shooters[1].id, lane[3]);
  spots.set(defenders[2].id, lane[4]);
  let outside = 0;
  for (const p of match.players) {
    if (p.id === ft.shooter) { place(p, line.x, 0, headingOf(hoop.x - line.x, 0)); continue; }
    const spot = spots.get(p.id);
    let x;
    let z;
    if (spot) { x = s * spot[0]; z = spot[1] * (COURT.keyHalf + 0.45); }
    else { x = s * (COURT.halfL - 7.6) - s * 0.4 * outside; z = (outside % 2 ? 1 : -1) * (3.2 + outside * 0.6); outside += 1; }
    p.goal = { x, z, speed: 0.7 };
    if (match.phaseT === 0 && dist(p, { x, z }) > 6) place(p, x, z);
  }
  Object.assign(match.ball, { owner: ft.shooter, flight: null, dead: false });
};

/** Ném phạt: `hold` là thời gian giữ nút (người chơi) hoặc null (máy tự ném). */
export const shootFreeThrow = (match, hold = null) => {
  const ft = match.ft;
  if (!ft || ft.flying || match.phaseT < ft.ready) return false;
  const shooter = match.players[ft.shooter];
  const hoop = attackHoop(match, ft.team);
  const controlled = hold !== null;
  const quality = controlled ? releaseQuality(hold, assistOf(match, ft.team)) : clamp(0.65 + 0.3 * shooter.attr.ft + gaussian(match.rng) * 0.12, 0, 1);
  const chance = clamp((0.34 + 0.58 * shooter.attr.ft) * (0.55 + 0.45 * quality), 0.05, 0.97);
  const made = match.rng() < chance;
  const angle = match.rng() * Math.PI * 2;
  const off = 0.22 + match.rng() * 0.12;
  const end = made ? { x: hoop.x, y: COURT.rimY - 0.02, z: 0 } : { x: hoop.x + Math.cos(angle) * off, y: COURT.rimY + 0.06, z: Math.sin(angle) * off };
  const sy = shooter.height + 0.35;
  ft.flying = true;
  ft.holdAt = null;
  shooter.anim.pass = 0;
  shooter.act = null;
  shooter.ftShot = 0.5;
  match.ball.owner = null;
  match.ball.flight = { kind: "ft", from: shooter.id, made, t: 0, T: 0.95, sx: shooter.x + Math.sign(hoop.x) * 0.25, sy, sz: 0, ex: end.x, ey: end.y, ez: end.z, lift: 1.3 };
  shooter.stats.fta += 1;
  match.teams[ft.team].stats.fta += 1;
  emit(match, "ftShot", { id: shooter.id, chance, quality });
  return true;
};

const tickFreeThrow = (match) => {
  const ft = match.ft;
  arrangeFreeThrowGoals(match);
  if (ft.flying || match.phaseT < ft.ready) return;
  const human = match.humans[ft.team];
  const userShoots = human && !human.auto && human.controlledId === ft.shooter;
  if (!userShoots && match.phaseT > ft.ready + 0.7) shootFreeThrow(match, null);
  // Người chơi giữ quá lâu: tự nhả bóng (muộn).
  if (userShoots && ft.holdAt !== null && match.time - ft.holdAt > LATE_RELEASE) shootFreeThrow(match, match.time - ft.holdAt);
  if (userShoots && match.phaseT > ft.ready + 8) shootFreeThrow(match, null);
};

const arrangeFreeThrowGoals = (match) => {
  for (const p of match.players) if (p.goal && dist(p, p.goal) < 0.2) { p.vx *= 0.5; p.vz *= 0.5; }
};

const resolveFreeThrow = (match, f) => {
  const ft = match.ft;
  const shooter = match.players[f.from];
  const hoop = attackHoop(match, ft.team);
  if (f.made) {
    match.teams[ft.team].score += 1;
    match.teams[ft.team].stats.pts += 1;
    match.teams[ft.team].stats.ftm += 1;
    shooter.stats.pts += 1;
    shooter.stats.ftm += 1;
    emit(match, "ft", { made: true, team: ft.team, id: shooter.id });
  } else emit(match, "ft", { made: false, team: ft.team, id: shooter.id });
  ft.index += 1;
  const last = ft.index >= ft.total;
  if (!last) {
    ft.flying = false;
    ft.ready = match.phaseT + 0.8;
    Object.assign(match.ball, { owner: ft.shooter, flight: null });
    return;
  }
  match.ft = null;
  if (f.made) { setupInbound(match, 1 - ft.team, { x: hoop.x, z: 0 }); return; }
  // Trượt quả cuối: bóng bật vành, tranh bóng bật bảng.
  match.phase = "live";
  match.phaseT = 0;
  match.lastShot = { team: ft.team, id: shooter.id, points: 1, made: false, kind: "ft", t: match.time };
  rimBounce(match, f);
};

/* ---------- hiệp đấu ---------- */

const endPeriod = (match) => {
  emit(match, "buzzer", { quarter: match.quarter });
  Object.assign(match.ball, { owner: null, flight: null, dead: true });
  for (const p of match.players) { p.act = null; p.burst = null; }
  match.inbound = null;
  match.ft = null;
  const [a, b] = match.teams.map((team) => team.score);
  if (match.quarter >= 4 && a !== b) {
    match.phase = "fulltime";
    match.phaseT = 0;
    bench(match);
    emit(match, "fulltime", { score: [a, b] });
    return;
  }
  match.phase = "break";
  match.phaseT = 0;
  match.breakKind = match.quarter === 2 ? "half" : "quarter";
  bench(match);
  emit(match, match.breakKind === "half" ? "halftime" : "period", { quarter: match.quarter });
};

/** Sang hiệp sau (giữa hiệp tự sang sau vài giây; người chơi có thể bấm sang ngay). */
export const startNextPeriod = (match) => {
  if (match.phase !== "break") return false;
  match.quarter += 1;
  if (match.quarter === 3) for (const team of match.teams) team.dir *= -1;
  match.clock = match.quarter <= 4 ? match.quarterLength : Math.min(match.quarterLength, 60);
  for (const team of match.teams) team.fouls = 0;
  match.breakKind = null;
  match.lastShot = null;
  const team = match.arrow;
  match.arrow = 1 - team;
  match.possession = null;
  for (const p of match.players) {
    const d = match.teams[p.team].dir;
    place(p, clamp(-d * (2 + p.slot * 1.2), -12, 12), (p.slot % 2 ? 1 : -1) * (1 + p.slot * 0.6));
  }
  setupInbound(match, team, { x: 0, z: -COURT.halfW });
  emit(match, "period", { quarter: match.quarter, start: true });
  return true;
};

/* ---------- luật trong lúc bóng sống ---------- */

const foul = (match, by, on, { shooting = false, made = false, points = 2 } = {}) => {
  const offender = match.players[by];
  const victim = match.players[on];
  offender.stats.pf += 1;
  match.teams[offender.team].stats.pf += 1;
  match.teams[offender.team].fouls += 1;
  emit(match, "foul", { by, on, shooting });
  if (shooting) {
    setupFreeThrows(match, victim.team, victim.id, made ? 1 : points);
    return;
  }
  if (match.teams[offender.team].fouls > RULES.bonusFouls) setupFreeThrows(match, victim.team, victim.id, 2);
  else setupInbound(match, victim.team, victim, { keepClock: true });
};

const turnover = (match, team, reason, at) => {
  match.teams[team].stats.to += 1;
  const p = holder(match);
  if (p && p.team === team) p.stats.to += 1;
  emit(match, "turnover", { team, reason });
  setupInbound(match, 1 - team, at);
};

/** Bóng chạm vành: bật ra theo hướng ra xa tâm rổ. */
const rimBounce = (match, f) => {
  const hoop = { x: Math.sign(f.ex) * COURT.hoopX, z: 0 };
  const out = norm(f.ex - hoop.x + (match.rng() - 0.5) * 0.2, f.ez - hoop.z + (match.rng() - 0.5) * 0.2);
  const push = 1.3 + match.rng() * 2.6;
  loose(match, { x: f.ex, y: f.ey, z: f.ez }, { vx: out.x * push, vy: 1.3 + match.rng() * 2.4, vz: out.z * push });
  match.rimTouched = true;
  emit(match, "rim", {});
};

const resolveFlight = (match) => {
  const b = match.ball;
  const f = b.flight;
  if (f.kind === "pass" || f.kind === "tip") {
    const catcher = match.players[f.catcher];
    const end = { x: f.ex, z: f.ez };
    const reach = 1.1 + (isUser(match, catcher) ? 0.35 : 0);
    if (catcher && dist(catcher, end) < reach && catcher.act === null) {
      possess(match, catcher, f.cut ? "intercept" : "catch");
      // Alley-oop: bắt bóng bổng sát rổ là úp luôn trên không.
      const hoop = attackHoop(match, catcher.team);
      if (f.style === "lob" && !f.cut && dist(catcher, hoop) < 2.7 && catcher.attr.dunk > 0.6) {
        startShot(match, catcher, { auto: true });
        if (catcher.act) { catcher.act.kind = "dunk"; catcher.act.t = 0.2; catcher.act.oop = true; catcher.vy = 3.2; catcher.y = 0.05; emit(match, "alleyOop", { id: catcher.id }); }
      }
      return;
    }
    const v = { vx: (f.ex - f.sx) / f.T, vy: -1, vz: (f.ez - f.sz) / f.T };
    loose(match, { x: f.ex, y: f.ey, z: f.ez }, v);
    return;
  }
  if (f.kind === "toss") return;
  if (f.kind === "blocked") {
    const by = match.players[f.by];
    by.stats.blk += 1;
    match.teams[by.team].stats.blk += 1;
    loose(match, { x: f.ex, y: f.ey, z: f.ez }, f.out, by.team);
    emit(match, "block", { id: by.id, on: f.from });
    if (match.lastShot?.foul) { const { by: offender, on } = match.lastShot.foul; foul(match, offender, on, { shooting: true, points: match.lastShot.points }); }
    return;
  }
  if (f.kind === "ft") { resolveFreeThrow(match, f); return; }
  // Cú ném rổ.
  const shooter = match.players[f.from];
  const shot = match.lastShot;
  if (f.made) {
    const team = shooter.team;
    const stats = match.teams[team].stats;
    match.teams[team].score += f.points;
    stats.pts += f.points;
    stats.fgm += 1;
    shooter.stats.pts += f.points;
    shooter.stats.fgm += 1;
    if (f.points === 3) { stats.tpm += 1; shooter.stats.tpm += 1; }
    if (shot?.assistBy !== null && shot?.assistBy !== undefined) { match.players[shot.assistBy].stats.ast += 1; stats.ast += 1; }
    shooter.celebrate = 1.4;
    loose(match, { x: f.ex, y: f.ey - 0.1, z: f.ez }, { vx: 0, vy: -2.2, vz: 0 }, team);
    match.ball.dead = true;
    emit(match, "score", { team, id: shooter.id, points: f.points, dunk: Boolean(f.dunk), assist: shot?.assistBy ?? null, andOne: Boolean(shot?.foul) });
    match.shotClock = RULES.shotClock;
    if (shot?.foul) { const { by, on } = shot.foul; foul(match, by, on, { shooting: true, made: true }); return; }
    match.scoredAt = match.time;
    match.phase = "scored";
    match.phaseT = 0;
    match.scoredHoop = { x: f.ex, z: 0 };
    match.possession = team;
    return;
  }
  if (shot?.foul) { const { by, on } = shot.foul; foul(match, by, on, { shooting: true, points: shot.points }); return; }
  if (f.airball) {
    loose(match, { x: f.ex, y: f.ey, z: f.ez }, { vx: (f.ex - f.sx) / f.T * 0.5, vy: -2, vz: (f.ez - f.sz) / f.T * 0.5 });
    emit(match, "airball", { id: shooter.id });
    return;
  }
  rimBounce(match, f);
};

/** Một hậu vệ va chạm người đang ném thì có thể bị thổi lỗi (đặc biệt khi lên rổ). */
const shootingFoulCheck = (match, shooter) => {
  for (const d of match.players) {
    if (d.team === shooter.team) continue;
    const gap = dist(d, shooter);
    if (gap > 0.95) continue;
    const to = norm(shooter.x - d.x, shooter.z - d.z);
    const closing = Math.max(0, d.vx * to.x + d.vz * to.z);
    const p = 0.012 + 0.1 * clamp(closing / 4, 0, 1) + (d.y > 0.1 && gap < 0.6 ? 0.05 : 0) + (shooter.act.kind !== "jumper" ? 0.03 : 0) - d.attr.defense * 0.02;
    if (match.rng() < p) return { by: d.id, on: shooter.id };
  }
  return null;
};

const tickShot = (match, p, h) => {
  const act = p.act;
  act.t += h;
  const hoop = attackHoop(match, p.team);
  const human = match.humans[p.team];
  const controlled = human && !human.auto && human.controlledId === p.id;
  if (act.kind === "jumper") {
    if (act.t > 0.1 && !act.jumped) { act.jumped = true; p.vy = 2.6 + p.attr.mid * 0.6; p.y = 0.01; }
    if (!controlled && act.aiRelease === undefined) act.aiRelease = IDEAL_RELEASE + gaussian(match.rng) * 0.05;
    const due = controlled && !act.auto ? (act.hold !== null && act.t >= Math.max(act.hold, 0.22)) || act.t >= LATE_RELEASE : act.t >= act.aiRelease;
    if (due) {
      if (controlled && act.hold === null) act.hold = act.t;
      release(match, p);
    }
    return;
  }
  // Lên rổ / úp rổ: bước tới rổ rồi bật lên.
  const to = norm(hoop.x - p.x, hoop.z - p.z);
  if (to.l > 0.75 && p.y < 0.3) { p.goal = null; p.vx += (to.x * p.topSpeed * 0.75 - p.vx) * Math.min(1, h * 8); p.vz += (to.z * p.topSpeed * 0.75 - p.vz) * Math.min(1, h * 8); }
  const jumpAt = act.kind === "dunk" ? 0.2 : 0.26;
  if (act.t > jumpAt && !act.jumped) { act.jumped = true; p.vy = act.kind === "dunk" ? 3.4 + p.attr.dunk * 0.6 : 3.0; p.y = Math.max(p.y, 0.01); }
  if (act.t >= (act.kind === "dunk" ? 0.46 : 0.5)) release(match, p);
};

const release = (match, p) => {
  const foulCall = shootingFoulCheck(match, p);
  launchShot(match, p);
  if (foulCall && match.lastShot) match.lastShot.foul = foulCall;
  if (match.pendingFoul?.on === p.id) {
    if (match.lastShot) match.lastShot.foul = { by: match.pendingFoul.by, on: p.id };
    match.pendingFoul = null;
  }
  p.act = null;
  p.anim.shoot = 1;
};

/* ---------- di chuyển ---------- */

const desiredVelocity = (match, p) => {
  const human = match.humans[p.team];
  const user = isUser(match, p) && !human.input.guard;
  // Người ném phạt và người phát bóng biên (đã vào chỗ) đứng yên.
  if (match.phase === "freethrow" && match.ft?.shooter === p.id) return { x: 0, z: 0, sprint: false };
  if (match.phase === "inbound" && match.inbound?.arrived && match.inbound.taker === p.id) return { x: 0, z: 0, sprint: false };
  const top = p.topSpeed * (0.8 + 0.2 * p.stamina) * (match.ball.owner === p.id ? 0.92 : 1);
  if (p.stun > 0 || p.celebrate > 1.2) return { x: 0, z: 0, sprint: false };
  if (p.burst) return { x: p.burst.x * top * 1.12, z: p.burst.z * top * 1.12, sprint: true };
  if (user) {
    const { mx, mz, sprint } = human.input;
    const size = Math.hypot(mx, mz);
    // Bóng đang chuyền tới mình và không bấm hướng: tự chạy đón bóng.
    const f = match.ball.flight;
    if (size < 0.15 && f && f.catcher === p.id && f.kind !== "shot") {
      const to = norm(f.ex - p.x, f.ez - p.z);
      const speed = Math.min(top, to.l * 4);
      return { x: to.x * speed, z: to.z * speed, sprint: false };
    }
    const speed = (sprint ? top : top * 0.72) * Math.min(1, size);
    const dir = size > 0 ? { x: mx / size, z: mz / size } : { x: 0, z: 0 };
    return { x: dir.x * speed, z: dir.z * speed, sprint };
  }
  if (!p.goal) return { x: 0, z: 0, sprint: false };
  const to = norm(p.goal.x - p.x, p.goal.z - p.z);
  if (to.l < 0.18) return { x: 0, z: 0, sprint: false };
  const speed = Math.min(top * p.goal.speed, to.l * 3.4);
  return { x: to.x * speed, z: to.z * speed, sprint: p.goal.speed > 0.9 };
};

const movePlayers = (match, h) => {
  const carrier = holder(match);
  for (const p of match.players) {
    p.cool = Math.max(0, p.cool - h);
    p.celebrate = Math.max(0, p.celebrate - h);
    if (p.stun > 0) { p.stun = Math.max(0, p.stun - h); if (p.stun === 0 && p.state === "fall") p.state = "run"; }
    for (const key of ["pass", "reach", "jump", "cross", "shoot"]) if (p.anim[key] > 0) p.anim[key] = Math.max(0, p.anim[key] - h * 2.6);
    if (p.ftShot > 0) p.ftShot = Math.max(0, p.ftShot - h);
    if (p.burst) { p.burst.t -= h; if (p.burst.t <= 0) p.burst = null; }
    if (p.act?.type === "shot") tickShot(match, p, h);
    const airborne = p.y > 0 || p.vy > 0;
    if (airborne) {
      p.vy -= PHYS.gravity * h;
      p.y += p.vy * h;
      if (p.y <= 0) { p.y = 0; p.vy = 0; }
    }
    if (p.act?.type === "shot") {
      // Nhảy ném: dừng lại để bật lên; lên rổ/úp rổ đã tự lao về rổ trong tickShot.
      if (p.act.kind === "jumper" && !airborne) { p.vx *= Math.max(0, 1 - h * 10); p.vz *= Math.max(0, 1 - h * 10); }
    } else if (!airborne) {
      const want = desiredVelocity(match, p);
      const dvx = want.x - p.vx;
      const dvz = want.z - p.vz;
      const dv = Math.hypot(dvx, dvz);
      const step = ACCEL * h;
      if (dv > step) { p.vx += (dvx / dv) * step; p.vz += (dvz / dv) * step; } else { p.vx = want.x; p.vz = want.z; }
      const sprinting = want.sprint && Math.hypot(p.vx, p.vz) > p.topSpeed * 0.8;
      p.stamina = clamp(p.stamina + (sprinting ? -0.04 : 0.025) * h, 0.35, 1);
    } else if (airborne) { p.vx *= 1 - h * 0.6; p.vz *= 1 - h * 0.6; }
    p.x += p.vx * h;
    p.z += p.vz * h;
    p.x = clamp(p.x, -COURT.halfL - 1.4, COURT.halfL + 1.4);
    p.z = clamp(p.z, -COURT.halfW - 1.4, COURT.halfW + 1.4);
    const speed = Math.hypot(p.vx, p.vz);
    p.anim.stride += speed * h * 1.7;
    // Hướng nhìn: hậu vệ kèm bóng nhìn người cầm bóng; còn lại nhìn theo hướng chạy.
    let face = null;
    if (carrier && carrier.team !== p.team && match.guard[p.id] === carrier.id && dist(p, carrier) < 4) face = headingOf(carrier.x - p.x, carrier.z - p.z);
    else if (p.act?.type === "shot") face = headingOf(attackHoop(match, p.team).x - p.x, -p.z);
    else if (speed > 0.6) face = headingOf(p.vx, p.vz);
    else if (match.phase === "live" && !p.goal && carrier) face = headingOf(carrier.x - p.x, carrier.z - p.z);
    if (face !== null && p.state !== "fall") p.heading += wrapAngle(face - p.heading) * Math.min(1, h * 11);
    if (p.state !== "fall") p.state = p.celebrate > 0 ? "celebrate" : "run";
  }
  separate(match);
};

/** Hai người không đứng chồng lên nhau; va vào người đang đứng chắn (screen) thì bị khựng lại. */
const separate = (match) => {
  const list = match.players;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = RADIUS * 2;
      if (d >= min || d < 1e-6) continue;
      const overlap = min - d;
      const nx = dx / d;
      const nz = dz / d;
      // Người đứng vững (đang chắn, hậu vệ đứng yên) bị đẩy ít hơn.
      const firm = (p) => (p.screening ? 3 : 1) * (Math.hypot(p.vx, p.vz) < 1 ? 1.6 : 1) * (p.y > 0 ? 0.5 : 1);
      const fa = firm(a);
      const fb = firm(b);
      const share = fb / (fa + fb);
      a.x -= nx * overlap * share; a.z -= nz * overlap * share;
      b.x += nx * overlap * (1 - share); b.z += nz * overlap * (1 - share);
      // Bị đẩy thì không tính là dẫm vạch: giữ người cầm bóng ở trong sân.
      for (const p of [a, b]) if (match.ball.owner === p.id && match.phase === "live") { p.x = clamp(p.x, -COURT.halfL + 0.05, COURT.halfL - 0.05); p.z = clamp(p.z, -COURT.halfW + 0.05, COURT.halfW - 0.05); }
      for (const [screener, other] of [[a, b], [b, a]]) {
        if (!screener.screening || !match.screen || other.team === screener.team || other.stun > 0 || match.screen.hit?.includes(other.id)) continue;
        other.stun = 0.5;
        match.screen.hit = [...(match.screen.hit || []), other.id];
        emit(match, "screened", { id: other.id, by: screener.id });
        // Đổi người kèm (switch): người kèm người chắn nhận người cầm bóng.
        const carrier = holder(match);
        if (carrier && match.guard[other.id] === carrier.id) {
          const helper = match.players.find((p) => p.team === other.team && match.guard[p.id] === screener.id);
          if (helper) { match.guard[helper.id] = carrier.id; match.guard[other.id] = screener.id; }
        }
      }
    }
  }
};

/* ---------- bóng ---------- */

const moveBall = (match, h) => {
  const b = match.ball;
  if (b.owner !== null) {
    const o = match.players[b.owner];
    const f = { x: Math.sin(o.heading), z: Math.cos(o.heading) };
    const r = { x: f.z, z: -f.x };
    if (o.act?.type === "shot" || match.phase === "freethrow") {
      Object.assign(b, { x: o.x + f.x * 0.22, y: o.height + 0.25 + o.y - (match.phase === "freethrow" ? 0.75 : 0), z: o.z + f.z * 0.22 });
    } else if (match.phase === "inbound") {
      Object.assign(b, { x: o.x + f.x * 0.3, y: 1.25, z: o.z + f.z * 0.3 });
    } else {
      const speed = Math.hypot(o.vx, o.vz);
      o.anim.dribble += h * (5.5 + speed * 0.9);
      const hand = o.anim.cross > 0 ? -1 : 1;
      Object.assign(b, { x: o.x + f.x * (0.3 + speed * 0.03) + r.x * 0.24 * hand, y: 0.14 + Math.abs(Math.sin(o.anim.dribble)) * 0.8, z: o.z + f.z * (0.3 + speed * 0.03) + r.z * 0.24 * hand });
    }
    b.vx = o.vx; b.vy = 0; b.vz = o.vz;
    o.holdT += h;
    return;
  }
  if (b.flight) {
    const f = b.flight;
    f.t += h;
    const u = Math.min(1, f.t / f.T);
    const at = flightPoint(f, u);
    if (f.bounce) at.y = u < 0.55 ? 1.25 * (1 - u / 0.55) + COURT.ballR : COURT.ballR + (1.25 - COURT.ballR) * ((u - 0.55) / 0.45);
    b.vx = (at.x - b.x) / h; b.vy = (at.y - b.y) / h; b.vz = (at.z - b.z) / h;
    Object.assign(b, { x: at.x, y: at.y, z: at.z });
    if (u >= 1) resolveFlight(match);
    return;
  }
  // Bóng tự do.
  b.vy -= PHYS.gravity * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h;
  if (b.y < COURT.ballR) {
    b.y = COURT.ballR;
    if (b.vy < -1) {
      if (b.vy < -2.5) emit(match, "bounce", { strength: Math.min(1, -b.vy / 7) });
      b.vy = -b.vy * PHYS.bounce;
      b.vx *= PHYS.grip;
      b.vz *= PHYS.grip;
    } else {
      b.vy = 0;
      const sp = Math.hypot(b.vx, b.vz);
      const slow = Math.max(0, sp - PHYS.roll * h);
      if (sp > 0) { b.vx *= slow / sp; b.vz *= slow / sp; }
    }
  }
  // Bảng rổ.
  const side = Math.sign(b.x);
  if (Math.abs(b.x) > COURT.boardX - 0.12 && Math.abs(b.x) < COURT.boardX + 0.05 && Math.abs(b.z) < COURT.boardHalf && b.y > COURT.boardBottom && b.y < COURT.boardTop && b.vx * side > 0) {
    b.vx = -b.vx * 0.55;
    emit(match, "board", {});
  }
};

const pickups = (match) => {
  const b = match.ball;
  if (b.owner !== null || b.flight || b.dead) return;
  let best = null;
  let bestScore = -Infinity;
  for (const p of match.players) {
    if (p.act || p.stun > 0.6) continue;
    const d = Math.hypot(p.x - b.x, p.z - b.z);
    const range = 0.62 + p.attr.rebound * 0.22;
    const reach = p.height * 1.27 + p.y * 1.15 + 0.12;
    if (d > range || b.y > reach) continue;
    const score = p.attr.rebound * 0.6 + match.rng() * 0.45 - d + (p.y > 0 ? 0.2 : 0);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (best) possess(match, best, "loose");
};

const outOfBounds = (match) => {
  const b = match.ball;
  const carrier = holder(match);
  if (carrier) {
    if (Math.abs(carrier.x) > COURT.halfL || Math.abs(carrier.z) > COURT.halfW) turnover(match, carrier.team, "out", carrier);
    return;
  }
  if (b.flight || b.dead) return;
  if ((Math.abs(b.x) > COURT.halfL + 0.05 || Math.abs(b.z) > COURT.halfW + 0.05) && b.y < 2.2) {
    const last = b.lastTouch ?? match.possession ?? 0;
    emit(match, "out", { team: last });
    if (match.possession === last) match.teams[last].stats.to += 1;
    setupInbound(match, 1 - last, b);
  }
};

/* ---------- vòng lặp ---------- */

const autoSwitch = (match) => {
  const b = match.ball;
  for (const human of match.humans) {
    if (!human || human.auto) continue;
    const team = human.team;
    const carrier = holder(match);
    if (carrier?.team === team) { human.controlledId = carrier.id; continue; }
    if (b.flight?.kind === "pass" && match.players[b.flight.from].team === team) { human.controlledId = b.flight.to; continue; }
    if (match.time - human.manualAt < 1.6 || human.assist === "manual") continue;
    // Bóng tự do: cầm người gần chỗ bóng rơi nhất.
    if (!carrier && !b.flight && !b.dead) {
      const landing = predictLanding(match);
      const mates = match.players.filter((p) => p.team === team);
      const nearest = mates.sort((a, c) => dist(a, landing) - dist(c, landing))[0];
      if (nearest && human.controlledId !== nearest.id && dist(match.players[human.controlledId], landing) > dist(nearest, landing) + 1) human.controlledId = nearest.id;
    }
  }
};

const tickLive = (match, h) => {
  const b = match.ball;
  const shotInAir = b.flight && (b.flight.kind === "shot" || b.flight.kind === "blocked");
  match.clock = Math.max(0, match.clock - h);
  if (b.owner !== null || b.flight?.kind === "pass") match.shotClock = Math.max(0, match.shotClock - h);
  if (match.clock <= 0 && !shotInAir && !holder(match)?.act) { endPeriod(match); return; }
  if (match.shotClock <= 0 && !shotInAir && (b.owner !== null || b.flight?.kind === "pass") && !holder(match)?.act) {
    emit(match, "shotClock", { team: match.possession });
    turnover(match, match.possession, "shotClock", b);
    return;
  }
  think(match, h);
  autoSwitch(match);
  movePlayers(match, h);
  if (match.phase !== "live") return;
  moveBall(match, h);
  if (match.phase !== "live") return;
  pickups(match);
  // Lỗi với tay khi cướp bóng: thổi ngay; nếu người bị phạm lỗi đang ném thì tính khi nhả bóng.
  const pending = match.pendingFoul;
  if (pending && (match.time - pending.t > 1 || holder(match)?.id !== pending.on && !match.players[pending.on].act)) match.pendingFoul = null;
  else if (pending && !match.players[pending.on].act) { match.pendingFoul = null; foul(match, pending.by, pending.on); return; }
  outOfBounds(match);
};

const tickTip = (match, h) => {
  const tip = match.tip;
  const b = match.ball;
  movePlayers(match, h);
  if (!tip.tossed && match.phaseT > 1.0) {
    tip.tossed = true;
    b.dead = false;
    b.flight = { kind: "toss", t: 0, T: 0.8, sx: 0, sy: 1.4, sz: 0, ex: 0, ey: 2.95, ez: 0, lift: 1.1 };
    emit(match, "toss", {});
  }
  const centers = match.players.filter((p) => p.slot === 4);
  if (tip.tossed && !tip.jumped && match.phaseT > 1.35) { tip.jumped = true; for (const c of centers) jump(match, c); }
  if (b.flight?.kind === "toss") {
    b.flight.t += h;
    const u = Math.min(1, b.flight.t / b.flight.T);
    Object.assign(b, flightPoint(b.flight, u));
    if (u >= 1) {
      const [a, c] = centers;
      const score = (p) => p.attr.rebound + p.height * 0.6 + match.rng() * 0.5;
      const winner = score(a) >= score(c) ? a : c;
      const target = match.players.find((p) => p.team === winner.team && p.slot === 0);
      match.arrow = 1 - winner.team;
      changePossession(match, winner.team);
      const T = 0.55;
      b.flight = { kind: "tip", from: winner.id, to: target.id, catcher: target.id, t: 0, T, sx: b.x, sy: b.y, sz: b.z, ex: target.x, ey: 1.3, ez: target.z, lift: 0.4 };
      match.lastPass = null;
      emit(match, "tip", { id: winner.id, team: winner.team });
      match.phase = "live";
      match.phaseT = 0;
      const human = match.humans[winner.team];
      if (human) human.controlledId = target.id;
    }
  }
};

const tick = (match, h) => {
  match.dtStep = h;
  match.time += h;
  match.phaseT += h;
  switch (match.phase) {
    case "tipoff": tickTip(match, h); break;
    case "live": tickLive(match, h); break;
    case "inbound":
      movePlayers(match, h);
      if (match.phase === "inbound") tickInbound(match);
      if (match.phase === "inbound" || match.phase === "live") moveBall(match, h);
      break;
    case "freethrow":
      movePlayers(match, h);
      tickFreeThrow(match);
      if (match.phase === "freethrow" || match.phase === "live") moveBall(match, h);
      break;
    case "scored": {
      movePlayers(match, h);
      moveBall(match, h);
      // Đội vừa ghi điểm lui về phòng ngự; đội kia ra phát bóng.
      if (match.phaseT > 0.9) setupInbound(match, 1 - match.possession, match.scoredHoop);
      break;
    }
    case "break":
      movePlayers(match, h);
      if (match.phaseT > (match.breakKind === "half" ? RULES.halftimeBreak : RULES.quarterBreak)) startNextPeriod(match);
      break;
    default:
      movePlayers(match, h);
      break;
  }
};

export const stepMatch = (match, dt) => {
  match.acc = Math.min(match.acc + dt, 0.25);
  while (match.acc >= PHYS.dt) {
    match.acc -= PHYS.dt;
    tick(match, PHYS.dt);
  }
};

/* ---------- điều khiển của người chơi ---------- */

/** Ngữ cảnh điều khiển của người chơi `team`: quyết định phím nào làm gì. */
export const userContext = (match, team = match.user.team) => {
  const human = match.humans[team];
  if (!human || human.auto) return "idle";
  switch (match.phase) {
    case "inbound": return match.inbound?.team === team ? (match.inbound.arrived && human.controlledId === match.inbound.taker ? "inbound" : "wait") : "defense";
    case "freethrow": return match.ft?.team === team && human.controlledId === match.ft.shooter ? "ft" : "wait";
    case "live": {
      const carrier = holder(match);
      if (carrier) return carrier.team === team ? (carrier.id === human.controlledId ? "ball" : "support") : "defense";
      const f = match.ball.flight;
      if (f?.kind === "pass") return match.players[f.from].team === team ? "support" : "defense";
      if (f?.kind === "shot" || f?.kind === "blocked") return "rebound";
      return "loose";
    }
    default: return "idle";
  }
};

/** Đổi người điều khiển (phòng ngự): theo hướng bấm, hoặc người kèm bóng / gần bóng nhất. */
export const bestSwitch = (match, team, dir = null) => {
  const human = match.humans[team];
  const current = match.players[human.controlledId];
  const mates = match.players.filter((p) => p.team === team && p.id !== current.id);
  if (dir && Math.hypot(dir.x, dir.z) > 0.2) {
    const want = norm(dir.x, dir.z);
    let best = null;
    let bestScore = -Infinity;
    for (const p of mates) {
      const to = norm(p.x - current.x, p.z - current.z);
      const score = (to.x * want.x + to.z * want.z) * 3 - to.l * 0.15;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  const carrier = holder(match);
  const target = carrier || predictLanding(match);
  if (carrier && carrier.team !== team) {
    const guard = mates.find((p) => match.guard[p.id] === carrier.id);
    if (guard && dist(guard, carrier) < 3.5) return guard;
  }
  return mates.sort((a, b) => dist(a, target) - dist(b, target))[0];
};

/**
 * Lệnh của người chơi. `opts.dir` là hướng trên sân {x, z} (đã đổi theo góc camera), `opts.hold` là số giây giữ nút ném.
 * Trả về true nếu lệnh có tác dụng.
 */
export const act = (match, action, opts = {}, team = match.user.team) => {
  const human = match.humans[team];
  if (!human || human.auto) return false;
  const p = match.players[human.controlledId];
  const context = userContext(match, team);
  const dir = opts.dir && Number.isFinite(opts.dir.x) && Number.isFinite(opts.dir.z) ? opts.dir : null;
  switch (action) {
    case "shoot":
      if (context === "ft") { if (match.ft.holdAt === null && !match.ft.flying && match.phaseT >= match.ft.ready) { match.ft.holdAt = match.time; return true; } return false; }
      return context === "ball" ? startShot(match, p) : false;
    case "shootRelease": {
      const hold = Number.isFinite(opts.hold) ? clamp(opts.hold, 0, 2) : null;
      if (context === "ft") return match.ft.holdAt !== null || hold !== null ? shootFreeThrow(match, hold ?? (match.time - match.ft.holdAt)) : false;
      return context === "ball" || p.act?.type === "shot" ? releaseShot(match, p, hold) : false;
    }
    case "pass": case "lob": case "bounce": {
      if (context !== "ball" && context !== "inbound") return false;
      if (p.act) return false;
      const kind = action === "pass" ? "chest" : action;
      const target = human.assist === "manual" && dir ? choosePassTarget(match, p, dir, kind, true) : null;
      const done = passBall(match, p, { kind, dir, to: target });
      if (done && context === "inbound") { match.phase = "live"; match.phaseT = 0; match.inbound = null; }
      return Boolean(done);
    }
    case "crossover": return context === "ball" ? crossover(match, p, dir) : false;
    case "screen": return context === "ball" ? callScreen(match, p) : false;
    case "steal": return context === "defense" ? attemptSteal(match, p) || true : false;
    case "jump": return ["defense", "loose", "rebound", "support"].includes(context) ? jump(match, p) : false;
    case "double": return context === "defense" ? callDouble(match, team) : false;
    case "switch": {
      if (!["defense", "loose", "rebound", "wait"].includes(context)) return false;
      const next = bestSwitch(match, team, dir);
      if (!next) return false;
      human.controlledId = next.id;
      human.manualAt = match.time;
      emit(match, "switch", { id: next.id, team });
      return true;
    }
    case "next": return startNextPeriod(match);
    default: return false;
  }
};

/* ---------- hiển thị ---------- */

export const clockText = (match) => {
  const t = Math.max(0, match.clock);
  if (t < 10 && match.phase === "live") return t.toFixed(1);
  const m = Math.floor(Math.ceil(t) / 60);
  const s = Math.ceil(t) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
export const periodName = (quarter) => (quarter <= 4 ? `Hiệp ${quarter}` : `Hiệp phụ ${quarter - 4}`);
