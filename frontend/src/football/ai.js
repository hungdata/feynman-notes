/**
 * Trí tuệ của hai đội: giữ đội hình theo bóng, áp sát – bọc lót – kèm người khi phòng ngự,
 * chạy chỗ, đỡ bóng và quyết định của người cầm bóng (máy). Thủ môn chọn vị trí và lao ra.
 */
import { FIELD, PHYSICS } from "./constants.js";
import { clearBall, keeperDistribute, passBall, shootBall } from "./actions.js";
import { angleBetween, attackGoal, clamp, dist, dirOf, forward, gaussian, humanOf, keeperOf, laneOpenness, nearestOpponent, norm, offsideLine, ownGoal, owner, teamOf } from "./util.js";

const FORWARDS = new Set(["ST", "LW", "RW", "CAM"]);

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

const DEFENDERS = new Set(["CB", "LB", "RB"]);
const MIDFIELD = new Set(["CDM", "CM", "LM", "RM"]);
const FULLBACKS = new Set(["LB", "RB"]);
const WINGERS = new Set(["LW", "RW", "LM", "RM"]);

/** Cầu thủ đối phương dâng cao nhất (gần khung thành đội `team` nhất), theo toạ độ của `team`. */
const deepestAttacker = (match, team) => {
  let deepest = FIELD.halfL;
  for (const other of match.players) {
    if (other.team === team || other.sentOff || other.role === "GK") continue;
    deepest = Math.min(deepest, forward(match, team, other.x));
  }
  return deepest;
};

/**
 * Vị trí theo vai trò (toạ độ của đội, dương là phía khung thành đối phương):
 * hậu vệ giữ một hàng và luôn ở sau bóng, tiền vệ trụ làm điểm tựa trước hàng thủ,
 * tiền vệ giữa sân nối bóng, tiền đạo đứng sát vạch việt vị, cánh bám biên khi tấn công.
 */
export const shapeTarget = (match, player, attacking) => {
  const dir = dirOf(match, player.team);
  const { ball } = match;
  const bx = forward(match, player.team, ball.x);
  const { depth, width } = player.slot;
  const role = player.role;
  // Chiến thuật [ ] (−2 phòng ngự sâu … +2 tấn công tổng lực) và Z giữ để dâng đội hình.
  const team = match.teams[player.team];
  const push = (team.mentality || 0) * 3.5;
  const pushUp = humanOf(match, player.team)?.input.pushUp ? 8 : 0;
  let line;
  if (attacking) line = clamp(bx * 0.5 - 14 + push + pushUp, -38, 14);
  else {
    line = clamp(bx * 0.6 - 18 + push, -44, 8);
    // Không để tiền đạo đối phương thoát xuống sau lưng: hàng thủ lùi theo người dâng cao nhất của họ.
    // Z (dâng đội hình) vẫn đẩy hàng thủ lên, chấp nhận rủi ro như FO4.
    line = Math.max(-44, Math.min(line, deepestAttacker(match, player.team) + 1.5)) + pushUp;
  }
  const offside = offsideLine(match, player.team);
  let fx;
  if (DEFENDERS.has(role)) {
    fx = line;
    if (attacking && FULLBACKS.has(role)) {
      // Hậu vệ biên dâng lên khi đội cầm bóng ở phần sân đối phương, nhưng chỉ bên có bóng mới chồng biên.
      const ballSide = Math.sign(ball.z * dir) === Math.sign(width);
      fx = line + (bx > 5 ? (ballSide ? 20 : 9) : 4);
    }
    if (attacking && role === "CB") fx = Math.min(fx, bx - 8);
  } else if (role === "CDM") {
    fx = attacking ? Math.min(line + 13, bx - 2) : line + 9;
  } else if (MIDFIELD.has(role)) {
    const lean = (depth - 0.45) * 22;
    fx = attacking ? clamp(bx - 3 + lean, line + 15, line + 36) : line + 13 + lean * 0.4;
  } else if (role === "CAM") {
    fx = attacking ? clamp(bx + 7, line + 22, offside - 3) : line + 20;
  } else {
    // Tiền đạo: sát vạch việt vị khi tấn công; khi phòng ngự đứng cao chờ phản công.
    fx = attacking ? Math.min(offside - 0.8, Math.max(bx + 14, line + 30)) : line + (role === "ST" ? 30 : 24);
  }
  if (attacking && FORWARDS.has(role)) fx = Math.min(fx, offside - 0.7);
  // Chiều ngang: tấn công thì dàn rộng (cánh bám biên), phòng ngự thì co cụm về phía bóng.
  const spread = attacking ? (WINGERS.has(role) || FULLBACKS.has(role) ? 0.92 : 0.62) : 0.55;
  let z = width * FIELD.halfW * spread * dir;
  z += (ball.z - z) * (attacking ? (WINGERS.has(role) ? 0.06 : 0.16) : 0.4);
  return inside({ x: fx * dir, z }, 1.5);
};

/**
 * Tìm khoảng trống quanh vị trí gốc: xa đối thủ, đường chuyền từ người cầm bóng thoáng,
 * không việt vị, không lệch quá xa vị trí. Kết quả nhớ 0,6 giây cho đỡ tốn tính toán.
 */
export const findSpace = (match, player, base, holder, radius = 6) => {
  if (player.space && player.space.until > match.time && dist(player.space.base, base) < 3) return player.space.point;
  const line = offsideLine(match, player.team);
  let best = base;
  let bestScore = -Infinity;
  for (let i = 0; i <= 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const r = i === 12 ? 0 : radius * (i % 2 ? 0.55 : 1);
    const point = inside({ x: base.x + Math.cos(angle) * r, z: base.z + Math.sin(angle) * r }, 2);
    let near = 9;
    for (const other of match.players) {
      if (other.team === player.team || other.sentOff) continue;
      near = Math.min(near, dist(other, point));
    }
    const lane = holder ? Math.min(laneOpenness(match, holder, point, player.team), 6) : 3;
    const tooClose = holder && dist(holder, point) < 7 ? 2 : 0;
    const offsideRisk = forward(match, player.team, point.x) > line - 0.5 ? 4 : 0;
    const score = near * 0.6 + lane * 0.55 - dist(base, point) * 0.12 - tooClose - offsideRisk;
    if (score > bestScore) { bestScore = score; best = point; }
  }
  player.space = { point: best, base: { x: base.x, z: base.z }, until: match.time + 0.6 };
  return best;
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

const supportCarrier = (match, holder, player, helpers) => {
  const base = shapeTarget(match, player, true);
  if (player.runTo && player.runTo.until > match.time) return setGoal(player, player.runTo, true);
  if (match.ball.pass && match.ball.pass.to === player.id) return setGoal(player, match.ball.pass.target, true);
  const dir = dirOf(match, player.team);
  const holderAhead = forward(match, player.team, holder.x);
  // Tiền đạo/cánh băng xuống sau lưng hàng thủ khi người cầm bóng có thời gian chuyền.
  if (FORWARDS.has(player.role) && player.runPlan && player.runPlan.until > match.time) return setGoal(player, player.runPlan, true);
  const line = offsideLine(match, player.team);
  const room = FIELD.halfL - line;
  if (FORWARDS.has(player.role) && room > 12 && nearestOpponent(match, holder).d > 4 && match.rng() < 0.01) {
    const diagonal = clamp(player.z * 0.6 + (match.rng() - 0.5) * 10, -FIELD.halfW + 4, FIELD.halfW - 4);
    // Đôi khi băng hơi sớm (như người thật) → có thể việt vị.
    const early = match.rng() < 0.15 ? 2 : -0.6;
    player.runPlan = { ...inside({ x: (line + early) * dir, z: diagonal }), until: match.time + 1.4 };
  }
  // Hai người gần nhất (thường là tiền vệ) chủ động tìm khoảng trống để nhận bóng, tạo tam giác chuyền.
  if (helpers.includes(player)) {
    const toward = norm(holder.x - base.x, holder.z - base.z);
    const gap = dist(holder, base);
    const pull = gap > 18 ? gap - 14 : 0;
    const offer = { x: base.x + toward.x * pull, z: base.z + toward.z * pull };
    return setGoal(player, findSpace(match, player, offer, holder, 7), dist(player, offer) > 10);
  }
  // Hậu vệ biên chồng biên khi cánh cùng phía đang cầm bóng ở phần sân đối phương.
  if (FULLBACKS.has(player.role) && WINGERS.has(holder.role) && Math.sign(holder.z) === Math.sign(player.z) && holderAhead > 8) {
    return setGoal(player, inside({ x: holder.x + 10 * dir, z: Math.sign(player.z) * (FIELD.halfW - 4) }), true);
  }
  // Những người khác giữ vị trí nhưng dịch nhẹ vào chỗ trống quanh đó.
  const spot = DEFENDERS.has(player.role) ? base : findSpace(match, player, base, holder, 4);
  return setGoal(player, spot, dist(player, spot) > 12);
};

const defend = (match, holder, team, userTeam) => {
  const goal = ownGoal(match, team);
  const players = teamOf(match, team).filter((p) => p.role !== "GK");
  const human = humanOf(match, team);
  const controlled = human ? match.players[human.controlledId] : null;
  const goalSide = norm(goal.x - holder.x, goal.z - holder.z);
  const press = match.difficulty.press;
  const holderDepth = forward(match, team, holder.x);
  // Áp sát theo khu vực: chỉ người có vị trí gần bóng lên áp sát; trung vệ chỉ lên khi bóng ở 1/3 sân nhà.
  const bases = new Map(players.map((p) => [p, shapeTarget(match, p, false)]));
  const ranked = players
    .filter((p) => p !== controlled)
    .map((p) => {
      const zone = dist(bases.get(p), holder);
      const allowed = p.role !== "CB" || holderDepth < -18 || dist(p, holder) < 7;
      return { p, d: dist(p, holder), score: dist(p, holder) * 0.7 + zone * 0.5 + (allowed ? 0 : 50) };
    })
    .sort((a, b) => a.score - b.score);
  let presser = null;
  let cover;
  if (userTeam) {
    // Đội người chơi: đồng đội chỉ áp sát khi được gọi (giữ Q) hoặc khi đứng sát người cầm bóng.
    const nearest = [...ranked].sort((a, b) => a.d - b.d)[0];
    if (human?.input.callPress) presser = ranked[0]?.p;
    else if (nearest && nearest.d < 4.5) presser = nearest.p;
    cover = ranked.find((r) => r.p !== presser)?.p;
  } else {
    presser = ranked[0]?.p;
    cover = ranked[1]?.p;
  }
  for (const p of players) {
    if (p === controlled) continue;
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
    const base = bases.get(p);
    // Kèm người trong khu vực của mình, không bị kéo khỏi vị trí quá 8 m.
    let mark = null;
    let markD = DEFENDERS.has(p.role) ? 11 : 9;
    for (const other of match.players) {
      if (other.team === team || other.sentOff || other === holder || other.role === "GK") continue;
      const d = dist(other, base);
      if (d < markD) { markD = d; mark = other; }
    }
    if (FORWARDS.has(p.role) && !mark) {
      // Tiền đạo đứng chặn đường chuyền về cho tiền vệ trụ đối phương, chờ phản công.
      setGoal(p, base, dist(p, base) > 14);
      continue;
    }
    if (mark) {
      const side = norm(goal.x - mark.x, goal.z - mark.z);
      let point = { x: mark.x + side.x * 1.8, z: mark.z + side.z * 1.8 };
      // Hậu vệ giữ hàng: chỉ kèm theo chiều ngang, không bỏ hàng lên trên.
      if (DEFENDERS.has(p.role) && forward(match, team, point.x) > forward(match, team, base.x)) point = { x: base.x, z: point.z };
      const blend = { x: (point.x * 2 + base.x) / 3, z: (point.z * 2 + base.z) / 3 };
      const leash = dist(blend, base);
      const target = leash > 8 ? { x: base.x + ((blend.x - base.x) / leash) * 8, z: base.z + ((blend.z - base.z) / leash) * 8 } : blend;
      setGoal(p, target, dist(p, target) > 9);
    } else setGoal(p, base, dist(p, base) > 12);
  }
};

const looseBall = (match, team, userTeam, path) => {
  const players = teamOf(match, team).filter((p) => p.role !== "GK");
  const human = humanOf(match, team);
  const controlled = human ? match.players[human.controlledId] : null;
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
  for (const team of [0, 1]) {
    const human = humanOf(match, team);
    const isUserTeam = Boolean(human);
    if (holder) {
      if (holder.team === team) {
        const mates = teamOf(match, team).filter((p) => p !== holder && p.role !== "GK" && p.id !== human?.controlledId);
        // Hai người gần nhất (trừ trung vệ đang đá chốt) làm điểm chuyền.
        const helpers = mates.filter((p) => p.role !== "CB" || forward(match, team, holder.x) < -25).sort((a, b) => dist(a, holder) - dist(b, holder)).slice(0, 2);
        for (const p of mates) {
          p.pressing = false;
          supportCarrier(match, holder, p, helpers);
        }
      } else defend(match, holder, team, isUserTeam);
    } else looseBall(match, team, isUserTeam, path);
    keeperThink(match, keeperOf(match, team), path || predictBall(match, 1.5));
  }
  if (holder && !humanOf(match, holder.team) && holder.role !== "GK" && holder.state === "run") {
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
  const userTeam = Boolean(humanOf(match, keeper.team));
  if (waited < (userTeam ? 3 : 1.3)) return;
  keeperDistribute(match, keeper);
};

export { decideCarrier };
