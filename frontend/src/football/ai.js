/**
 * Trí tuệ của hai đội: giữ đội hình theo bóng, áp sát – bọc lót – kèm người khi phòng ngự,
 * chạy chỗ, đỡ bóng và quyết định của người cầm bóng (máy). Thủ môn chọn vị trí và lao ra.
 */
import { FIELD, PHYSICS } from "./constants.js";
import { clearBall, keeperDistribute, passBall, shootBall } from "./actions.js";
import { angleBetween, attackGoal, clamp, dist, dirOf, forward, gaussian, humanId, humanTeam, keeperOf, laneOpenness, nearestOpponent, norm, offsideLine, ownGoal, owner, teamOf } from "./util.js";

const FORWARDS = new Set(["ST", "LW", "RW", "CAM"]);
const WIDE = new Set(["LW", "RW", "LM", "RM", "LB", "RB"]);

/** Dự đoán đường bóng trong vài giây tới (không tính va chạm), để chạy đón bóng. */
export const predictBall = (match, seconds = 2.6, step = 0.1) => {
  const { ball } = match;
  let { x, y, z, vx, vy, vz } = ball;
  const points = [];
  let t = 0;
  const sub = 4;
  const dt = step / sub;
  while (t < seconds) {
    for (let i = 0; i < sub; i += 1) {
      if (y > FIELD.ballRadius + 0.01 || vy > 0.1) {
        const speed = Math.hypot(vx, vy, vz);
        vx -= PHYSICS.airDrag * speed * vx * dt;
        vz -= PHYSICS.airDrag * speed * vz * dt;
        vy -= PHYSICS.gravity * dt;
        y += vy * dt;
        if (y < FIELD.ballRadius) { y = FIELD.ballRadius; vy = Math.abs(vy) > 1.5 ? -vy * PHYSICS.bounce : 0; vx *= PHYSICS.bounceGrip; vz *= PHYSICS.bounceGrip; }
      } else {
        const speed = Math.hypot(vx, vz);
        const slower = Math.max(0, speed - PHYSICS.rolling * dt);
        if (speed > 0) { vx *= slower / speed; vz *= slower / speed; }
      }
      x += vx * dt;
      z += vz * dt;
    }
    t += step;
    points.push({ t, x, y, z });
  }
  return points;
};

/** Điểm sớm nhất cầu thủ có thể chạm bóng (chân hoặc đầu). */
export const interceptPoint = (player, path, reaction = 0.15, maxY = 2.4) => {
  for (const point of path) {
    if (point.y > maxY) continue;
    const need = Math.max(0, Math.hypot(point.x - player.x, point.z - player.z) - 0.6) / (player.topSpeed || 8) + reaction;
    if (need <= point.t) return { ...point, need };
  }
  const last = path[path.length - 1];
  return last ? { ...last, need: Math.hypot(last.x - player.x, last.z - player.z) / (player.topSpeed || 8) + reaction } : null;
};

const inside = (point, margin = 1) => ({ x: clamp(point.x, -FIELD.halfL + margin, FIELD.halfL - margin), z: clamp(point.z, -FIELD.halfW + margin, FIELD.halfW - margin) });

/** Vị trí đội hình theo bóng: dâng cao khi cầm bóng, co cụm khi phòng ngự. */
export const shapeTarget = (match, player, attacking) => {
  const dir = dirOf(match, player.team);
  const { ball } = match;
  const bx = forward(match, player.team, ball.x);
  const { depth, width } = player.slot;
  // Chiến thuật [ ] (−2 phòng ngự sâu … +2 tấn công tổng lực) và Z giữ để dâng đội hình.
  const team = match.teams[player.team];
  const push = (team.mentality || 0) * 3.5 + (player.team === humanTeam(match) && match.input.pushUp ? 8 : 0);
  const back = attacking ? clamp(bx * 0.55 - 12 + push, -36, 18) : clamp(bx * 0.62 - 17 + push, -43, 10);
  const front = attacking ? Math.min(46, back + 40) : back + 27;
  const t = (depth - 0.19) / 0.58;
  let fx = back + t * (front - back);
  if (attacking && FORWARDS.has(player.role)) fx = Math.min(fx, offsideLine(match, player.team) - 0.7);
  let z = width * FIELD.halfW * (attacking ? 0.9 : 0.6) * dir;
  z += (ball.z - z) * (attacking ? 0.18 : 0.36);
  return inside({ x: fx * dir, z }, 1.5);
};

/** Mục tiêu của thủ môn: trên đường phân giác góc sút, lùi về khi bóng gần. */
const keeperTarget = (match, keeper) => {
  const goal = ownGoal(match, keeper.team);
  const { ball } = match;
  const toBall = norm(ball.x - goal.x, ball.z - goal.z);
  const far = dist(ball, goal);
  const depth = far > 55 ? 12 : clamp(far * 0.11, 0.7, 5.2);
  return { x: goal.x + toBall.x * depth, z: clamp(goal.z + toBall.z * depth, -FIELD.goalHalf + 0.4, FIELD.goalHalf - 0.4) };
};

const setGoal = (player, point, sprint = false, face = null) => {
  player.goal = { x: point.x, z: point.z, sprint, face };
};

/* ---------- quyết định của người cầm bóng (máy) ---------- */

/** Xác suất ghi bàn ước lượng (xG) từ vị trí cầu thủ. */
export const expectedGoal = (match, player) => {
  const goal = attackGoal(match, player.team);
  const d = dist(player, goal);
  const a1 = Math.atan2(FIELD.goalHalf - player.z, Math.abs(goal.x - player.x));
  const a2 = Math.atan2(-FIELD.goalHalf - player.z, Math.abs(goal.x - player.x));
  const opening = Math.abs(a1 - a2);
  let xg = Math.max(0, Math.pow(opening, 1.3) * 0.9 - d * 0.004);
  const lane = laneOpenness(match, player, goal, player.team);
  if (lane < 0.9) xg *= 0.45;
  return xg;
};

const dribbleDirection = (match, player) => {
  const goal = attackGoal(match, player.team);
  const toGoal = norm(goal.x - player.x, (goal.z - player.z) * (Math.abs(forward(match, player.team, player.x)) > 30 ? 1 : 0.35));
  let x = toGoal.x;
  let z = toGoal.z;
  for (const other of match.players) {
    if (other.team === player.team || other.sentOff) continue;
    const dx = player.x - other.x;
    const dz = player.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d > 7 || d < 0.01) continue;
    const ahead = (other.x - player.x) * toGoal.x + (other.z - player.z) * toGoal.z;
    if (ahead < -1) continue;
    const push = (7 - d) / 7;
    x += (dx / d) * push * 1.3;
    z += (dz / d) * push * 1.3;
  }
  // Tránh đường biên.
  if (Math.abs(player.z) > FIELD.halfW - 4) z -= Math.sign(player.z) * 0.8;
  return norm(x, z);
};

const decideCarrier = (match, player) => {
  const level = match.difficulty;
  const noise = () => gaussian(match.rng) * level.noise;
  const pressure = nearestOpponent(match, player).d;
  const progressNow = forward(match, player.team, player.x);
  const options = [];

  const xg = expectedGoal(match, player);
  const goalDistance = dist(player, attackGoal(match, player.team));
  if (xg > 0.025) options.push({ kind: "shoot", value: xg * 7 - 0.2 + (goalDistance < 24 ? 0.2 : 0) + (pressure < 2 ? 0.15 : 0) + noise() });

  for (const mate of teamOf(match, player.team)) {
    if (mate.id === player.id) continue;
    const d = dist(player, mate);
    if (d < 4 || d > 52) continue;
    if (mate.role === "GK" && (pressure > 2.5 || progressNow > -20)) continue;
    const lane = laneOpenness(match, player, mate, player.team);
    const space = nearestOpponent(match, mate).d;
    const gain = forward(match, player.team, mate.x) - progressNow;
    const mateXg = expectedGoal(match, mate);
    let value = gain * 0.035 + Math.min(space, 9) * 0.07 + mateXg * 2.5 - d * 0.009 + noise();
    let kind = "short";
    if (lane < 1.3) {
      if (space > 7 && d > 18) { kind = "lob"; value -= 0.45; } else value -= 1.6;
    }
    const line = offsideLine(match, player.team);
    if (FORWARDS.has(mate.role) && gain > 6 && forward(match, player.team, mate.x) > line - 3 && line < 44 && match.rng() < 0.65) { kind = "through"; value += 0.35; }
    const wide = Math.abs(player.z) > 18 && progressNow > 30;
    if (wide && Math.abs(mate.z) < 12 && forward(match, player.team, mate.x) > 36) { kind = "lob"; value += 0.3; }
    if (pressure < 2.2) value += 0.25;
    options.push({ kind: "pass", mate, passKind: kind, value });
  }

  const way = dribbleDirection(match, player);
  let blocked = 0;
  for (const other of match.players) {
    if (other.team === player.team || other.sentOff) continue;
    const dx = other.x - player.x;
    const dz = other.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 6 && angleBetween(way.x, way.z, dx, dz) < 0.8) blocked = Math.max(blocked, (6 - d) / 6);
  }
  options.push({ kind: "dribble", way, value: 0.55 - blocked * 0.9 + (player.attrs.dribble - 70) * 0.01 + (progressNow < 25 ? 0.1 : 0) + noise() });

  // Hậu vệ bị ép sát gần khung thành nhà: phá bóng cho chắc.
  if (progressNow < -36 && pressure < 1.6) options.push({ kind: "clear", value: 0.7 + noise() });

  const best = options.sort((a, b) => b.value - a.value)[0];
  if (best.kind === "shoot") {
    const roll = match.rng();
    const kind = dist(player, attackGoal(match, player.team)) < 16 && roll < 0.35 ? "finesse" : roll < 0.5 ? "low" : "normal";
    shootBall(match, player, { power: clamp(0.55 + match.rng() * 0.3, 0, 1), kind });
  } else if (best.kind === "pass") {
    passBall(match, player, { kind: best.passKind, receiver: best.mate, power: clamp(dist(player, best.mate) / 45, 0.2, 0.95) });
  } else if (best.kind === "clear") {
    clearBall(match, player);
  } else {
    player.dribbleWay = best.way;
    player.nextThink = match.time + level.think * (0.5 + match.rng() * 0.6);
    return;
  }
  player.nextThink = match.time + level.think;
};

/* ---------- từng tình huống ---------- */

const supportCarrier = (match, holder, player) => {
  const base = shapeTarget(match, player, true);
  if (player.runTo && player.runTo.until > match.time) return setGoal(player, player.runTo, true);
  if (match.ball.pass && match.ball.pass.to === player.id) return setGoal(player, match.ball.pass.target, true);
  // Tiền đạo thỉnh thoảng băng xuống khi đồng đội cầm bóng ở giữa sân.
  if (FORWARDS.has(player.role) && player.runPlan && player.runPlan.until > match.time) return setGoal(player, player.runPlan, true);
  if (FORWARDS.has(player.role) && match.rng() < 0.006) {
    const line = offsideLine(match, player.team);
    const dir = dirOf(match, player.team);
    player.runPlan = { ...inside({ x: (line - 0.9) * dir, z: player.z * 0.8 }), until: match.time + 1.6 };
  }
  // Người gần nhất lùi lại nhận bóng, mở góc chuyền.
  const d = dist(holder, player);
  if (d < 14 && d > 4) {
    const away = nearestOpponent(match, player);
    if (away.d < 3 && away.player) {
      const step = norm(player.x - away.player.x, player.z - away.player.z);
      return setGoal(player, inside({ x: base.x + step.x * 3, z: base.z + step.z * 3 }), false);
    }
  }
  if (WIDE.has(player.role) && ["LB", "RB"].includes(player.role) && forward(match, player.team, holder.x) > 15) {
    // Hậu vệ biên dâng cao chồng biên.
    const dir = dirOf(match, player.team);
    return setGoal(player, inside({ x: base.x + 9 * dir, z: base.z }), false);
  }
  return setGoal(player, base, dist(player, base) > 12);
};

const defend = (match, holder, team, userTeam) => {
  const goal = ownGoal(match, team);
  const players = teamOf(match, team).filter((p) => p.role !== "GK");
  const ranked = players.map((p) => ({ p, d: dist(p, holder) })).sort((a, b) => a.d - b.d);
  const controlled = userTeam ? match.players[humanId(match)] : null;
  const ai = ranked.filter((r) => r.p !== controlled);
  const goalSide = norm(goal.x - holder.x, goal.z - holder.z);
  const press = match.difficulty.press;
  let presser = null;
  let cover;
  if (userTeam) {
    // Đội người chơi: đồng đội chỉ áp sát khi được gọi (giữ Q) hoặc khi đứng sát người cầm bóng.
    if (match.input.callPress || (ai[0] && ai[0].d < 4.5)) presser = ai[0]?.p;
    cover = ai.find((r) => r.p !== presser)?.p;
  } else {
    presser = ai[0]?.p;
    cover = ai[1]?.p;
  }
  for (const { p } of ai) {
    if (p === presser) {
      const close = dist(p, holder) < 3;
      const spot = close ? { x: holder.x + goalSide.x * 0.6, z: holder.z + goalSide.z * 0.6 } : { x: holder.x + goalSide.x * 1.4 + holder.vx * 0.3, z: holder.z + goalSide.z * 1.4 + holder.vz * 0.3 };
      setGoal(p, spot, !close && press >= 1, holder);
      p.pressing = true;
      continue;
    }
    p.pressing = false;
    if (p === cover) {
      const gap = 6.5;
      setGoal(p, inside({ x: holder.x + goalSide.x * gap, z: holder.z + goalSide.z * gap }), dist(p, holder) > 14, holder);
      continue;
    }
    const base = shapeTarget(match, p, false);
    // Kèm người: tìm đối thủ gần vị trí của mình, đứng chắn giữa họ và khung thành.
    let mark = null;
    let markD = 9;
    for (const other of match.players) {
      if (other.team === team || other.sentOff || other === holder || other.role === "GK") continue;
      const d = dist(other, base);
      if (d < markD) { markD = d; mark = other; }
    }
    if (mark) {
      const side = norm(goal.x - mark.x, goal.z - mark.z);
      const point = { x: mark.x + side.x * 1.8, z: mark.z + side.z * 1.8 };
      setGoal(p, { x: (point.x * 2 + base.x) / 3, z: (point.z * 2 + base.z) / 3 }, dist(p, point) > 9);
    } else setGoal(p, base, dist(p, base) > 12);
  }
};

const looseBall = (match, team, userTeam, path) => {
  const players = teamOf(match, team).filter((p) => p.role !== "GK");
  const controlled = userTeam ? match.players[humanId(match)] : null;
  const pass = match.ball.pass;
  const timing = players.map((p) => ({ p, hit: interceptPoint(p, path, userTeam ? 0.12 : match.difficulty.reaction) })).filter((r) => r.hit).sort((a, b) => a.hit.need - b.hit.need);
  const attacking = match.ball.lastTeam === team;
  let chaser = null;
  if (pass && pass.to !== null && match.players[pass.to].team === team) chaser = match.players[pass.to];
  else {
    const first = timing[0];
    if (first && first.p !== controlled) {
      // Đội người chơi: máy chỉ đuổi bóng khi bạn ở quá xa.
      const ownTime = controlled ? interceptPoint(controlled, path, 0.1)?.need ?? 99 : 99;
      if (!userTeam || ownTime > first.hit.need + 0.9) chaser = first.p;
    }
  }
  // Đối thủ cần một nhịp để đọc đường chuyền rồi mới lao vào cắt.
  const reading = pass && match.players[pass.from].team !== team && match.time - match.ball.touchTime < 0.3 + (userTeam ? 0.15 : match.difficulty.reaction);
  if (reading && chaser && chaser.team === team) chaser = null;
  for (const p of players) {
    if (p === controlled) continue;
    if (p === chaser) {
      const intended = pass && pass.to === p.id;
      const hit = (intended ? interceptPoint(p, path, 0.05, 1.6) : timing.find((r) => r.p === p)?.hit) || match.ball;
      setGoal(p, inside(hit, 0.3), true);
      continue;
    }
    if (p.runTo && p.runTo.until > match.time && attacking) { setGoal(p, p.runTo, true); continue; }
    const base = shapeTarget(match, p, attacking);
    setGoal(p, base, dist(p, base) > 14);
  }
};

const keeperThink = (match, keeper, path) => {
  if (!keeper || keeper.state === "hold" || keeper.state === "dive" || keeper.state === "down") return;
  const holder = owner(match);
  const goal = ownGoal(match, keeper.team);
  if (keeper.rushUntil > match.time && holder && holder.team !== keeper.team) {
    setGoal(keeper, holder, true);
    return;
  }
  if (!holder && !match.ball.shot) {
    const hit = interceptPoint(keeper, path, 0.1);
    if (hit && Math.abs(hit.x - goal.x) < FIELD.boxDepth - 0.5 && Math.abs(hit.z) < FIELD.boxHalf - 0.5) {
      let rival = 99;
      for (const other of match.players) if (other.team !== keeper.team && !other.sentOff) rival = Math.min(rival, interceptPoint(other, path, 0.15)?.need ?? 99);
      if (hit.need < rival - 0.15) { setGoal(keeper, hit, true); return; }
    }
  }
  // Một chọi một trong vòng cấm: thủ môn lao ra khép góc.
  if (holder && holder.team !== keeper.team && dist(holder, goal) < 15 && Math.abs(holder.z) < 12) {
    const toward = norm(holder.x - goal.x, holder.z - goal.z);
    const depth = clamp(dist(holder, goal) - 3.5, 1, 7);
    setGoal(keeper, { x: goal.x + toward.x * depth, z: goal.z + toward.z * depth }, true, holder);
    return;
  }
  setGoal(keeper, keeperTarget(match, keeper), false, match.ball);
};

/** Gọi mỗi bước khi bóng đang lăn: đặt mục tiêu di chuyển cho mọi cầu thủ máy điều khiển. */
export const thinkTeams = (match) => {
  const holder = owner(match);
  const path = holder ? null : predictBall(match);
  const userTeam = humanTeam(match);
  for (const team of [0, 1]) {
    const isUserTeam = team === userTeam;
    if (holder) {
      if (holder.team === team) {
        for (const p of teamOf(match, team)) {
          if (p === holder || p.role === "GK" || p.id === humanId(match)) continue;
          p.pressing = false;
          supportCarrier(match, holder, p);
        }
      } else defend(match, holder, team, isUserTeam);
    } else looseBall(match, team, isUserTeam, path);
    keeperThink(match, keeperOf(match, team), path || predictBall(match, 1.5));
  }
  if (holder && holder.team !== userTeam && holder.role !== "GK" && holder.state === "run") {
    // Bị áp sát thì phản ứng sớm hơn (chuyền thoát pressing).
    const squeezed = nearestOpponent(match, holder).d < 1.9 && match.time - holder.touchStart > 0.2 && match.time - (holder.lastThinkAt || 0) > 0.28;
    if (match.time >= (holder.nextThink || 0) || squeezed) { holder.lastThinkAt = match.time; decideCarrier(match, holder); }
    if (match.ball.owner === holder.id) {
      const way = holder.dribbleWay || dribbleDirection(match, holder);
      const space = nearestOpponent(match, holder).d;
      setGoal(holder, { x: holder.x + way.x * 6, z: holder.z + way.z * 6 }, space > 4.5 && forward(match, holder.team, holder.x) < 40);
    }
  }
};

/** Thủ môn đang ôm bóng: máy tự phát bóng. Người chơi có 3 giây để tự chuyền. */
export const keeperWithBall = (match, keeper) => {
  const waited = match.time - (keeper.holdSince || match.time);
  const userTeam = keeper.team === humanTeam(match);
  if (waited < (userTeam ? 3 : 1.3)) return;
  keeperDistribute(match, keeper);
};

export { decideCarrier };
