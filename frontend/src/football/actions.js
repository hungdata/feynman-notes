/**
 * Các cú chạm bóng: chuyền sệt, chọc khe, chuyền bổng/tạt, sút (thường, sệt, xoáy, bấm bóng),
 * đánh đầu và phá bóng. Dùng chung cho người chơi và máy.
 */
import { FIELD, PHYSICS } from "./constants.js";
import { angleBetween, attackGoal, clamp, dist, facing, forward, gaussian, headingOf, laneOpenness, len, nearestOpponent, norm, offsideLine, ownGoal, teamOf } from "./util.js";

export const emit = (match, type, data = {}) => {
  match.events.push({ type, t: match.time, ...data });
};

/** Tốc độ đầu để bóng sệt đi được `d` mét và còn `vEnd` m/s khi tới nơi. */
export const groundSpeed = (d, vEnd = 5) => Math.sqrt(vEnd * vEnd + 2 * PHYSICS.rolling * Math.max(0, d));

/** Thời gian bay khi có lực cản bậc hai: quãng đường d với tốc độ ngang v0. */
const flightTime = (d, v0) => (Math.exp(PHYSICS.airDrag * d) - 1) / (PHYSICS.airDrag * Math.max(1, v0));

const pressureOn = (match, player) => clamp((3.2 - nearestOpponent(match, player).d) / 3.2, 0, 1);

/** Bóng rời chân: ghi người chạm cuối, khoá chạm lại một chút để không “dính” bóng ngay. */
const release = (match, kicker, strength = 0.5) => {
  const { ball } = match;
  ball.owner = null;
  ball.spin = null;
  ball.lastTouch = kicker.id;
  ball.lastTeam = kicker.team;
  ball.touchTime = match.time;
  ball.pass = null;
  ball.shot = null;
  ball.offside = null;
  kicker.cooldown = match.time + 0.32;
  kicker.anim.kick = 1;
  kicker.anim.kickSide = kicker.anim.kickSide === 1 ? -1 : 1;
  if (kicker.state === "hold") kicker.state = "run";
  emit(match, "kick", { id: kicker.id, strength });
};

/** Điểm bóng xuất phát: ngay trước chân (hoặc trên tay thủ môn). */
const ballStart = (match) => ({ x: match.ball.x, y: Math.max(FIELD.ballRadius, match.ball.y), z: match.ball.z });

const launchGround = (match, kicker, direction, speed) => {
  const { ball } = match;
  const start = ballStart(match);
  Object.assign(ball, { x: start.x, z: start.z, y: FIELD.ballRadius, vx: direction.x * speed, vz: direction.z * speed, vy: 0 });
};

const launchAir = (match, target, flight, landHeight = FIELD.ballRadius) => {
  const { ball } = match;
  const start = ballStart(match);
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const horizontal = Math.max(0.1, Math.hypot(dx, dz));
  const vh = horizontal / flight;
  const time = flightTime(horizontal, vh);
  const vy = (landHeight - start.y + 0.5 * PHYSICS.gravity * time * time) / time;
  Object.assign(ball, { x: start.x, y: start.y, z: start.z, vx: (dx / horizontal) * vh, vz: (dz / horizontal) * vh, vy });
};

const rotate = (vector, angle) => ({ x: vector.x * Math.cos(angle) + vector.z * Math.sin(angle), z: -vector.x * Math.sin(angle) + vector.z * Math.cos(angle) });

/** Những cầu thủ đang việt vị tại thời điểm chuyền (luật việt vị chỉ phạt khi họ chạm bóng). */
const offsideSnapshot = (match, passer) => {
  const line = offsideLine(match, passer.team);
  const ids = new Set();
  for (const mate of teamOf(match, passer.team)) {
    if (mate.id === passer.id) continue;
    const ahead = forward(match, passer.team, mate.x);
    if (ahead > 0.4 && ahead > line + 0.35) ids.add(mate.id);
  }
  return ids.size ? { team: passer.team, ids } : null;
};

const PASS_RANGE = { short: 42, through: 55, lob: 68, lobThrough: 60, throw: 26 };

/**
 * Chọn người nhận như FO4: theo hướng phím, lực bấm (bấm nhẹ → người gần, giữ lâu → người xa)
 * và độ thoáng của đường chuyền.
 */
export const choosePassTarget = (match, passer, aim, kind = "short", power = 0.4) => {
  const look = aim && len(aim.x, aim.z) > 0.2 ? norm(aim.x, aim.z) : facing(passer.heading);
  const preferred = kind === "short" ? 7 + power * 26 : kind === "through" ? 14 + power * 26 : kind === "throw" ? 6 + power * 16 : 18 + power * 40;
  let best = null;
  let bestScore = -Infinity;
  for (const mate of teamOf(match, passer.team)) {
    if (mate.id === passer.id) continue;
    const dx = mate.x - passer.x;
    const dz = mate.z - passer.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5 || d > PASS_RANGE[kind]) continue;
    const angle = angleBetween(look.x, look.z, dx, dz);
    if (angle > 1.35) continue;
    if (mate.role === "GK" && (kind !== "short" || angle > 0.6)) continue;
    const open = kind === "lob" || kind === "lobThrough" ? nearestOpponent(match, mate).d : laneOpenness(match, passer, mate, passer.team);
    const progress = forward(match, passer.team, mate.x - passer.x);
    let score = -angle * 2.4 - Math.abs(d - preferred) * 0.035 + Math.min(open, 6) * 0.13 + progress * 0.008;
    if (kind === "through" || kind === "lobThrough") score += Math.max(0, forward(match, passer.team, mate.x)) * 0.01 + (["ST", "LW", "RW", "CAM"].includes(mate.role) ? 0.25 : 0);
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  return best;
};

/** Hướng chạy chọc khe cho người nhận: về phía khung thành, kéo theo hướng họ đang chạy. */
const throughRunDirection = (match, receiver) => {
  const goal = attackGoal(match, receiver.team);
  const toGoal = norm(goal.x - receiver.x, (goal.z - receiver.z) * 0.45);
  const moving = norm(receiver.vx, receiver.vz);
  return norm(toGoal.x * 0.75 + moving.x * 0.25, toGoal.z * 0.75 + moving.z * 0.25);
};

const keepInside = (point, margin = 1.5) => ({ x: clamp(point.x, -FIELD.halfL + margin, FIELD.halfL - margin), z: clamp(point.z, -FIELD.halfW + margin, FIELD.halfW - margin) });

/**
 * Chuyền bóng. kind: short (S), through (W), lob (A, tạt nếu ở biên), lobThrough (Q+W), throw (ném biên).
 * Trả về người nhận, hoặc null nếu phải chuyền vào khoảng trống.
 */
/** Đồng đội đứng trong vòng cấm đối phương gần điểm tạt nhất (cho tạt nhanh Q+A, phạt góc). */
export const boxTarget = (match, passer, spot = null) => {
  const goal = attackGoal(match, passer.team);
  const point = spot || { x: goal.x - Math.sign(goal.x) * 9, z: 0 };
  return teamOf(match, passer.team)
    .filter((p) => p.id !== passer.id && p.role !== "GK" && Math.abs(p.x - goal.x) < FIELD.boxDepth + 4)
    .sort((a, b) => dist(a, point) - dist(b, point))[0] || null;
};

export const passBall = (match, passer, { kind = "short", power = 0.45, aim = null, receiver = null, setPiece = null, style = null } = {}) => {
  const target = receiver || (style === "earlyCross" ? boxTarget(match, passer) : null) || choosePassTarget(match, passer, aim, kind, power);
  const look = aim && len(aim.x, aim.z) > 0.2 ? norm(aim.x, aim.z) : facing(passer.heading);
  const skill = passer.attrs.pass / 100;
  const pressure = pressureOn(match, passer);
  const offside = setPiece && setPiece !== "freekick" ? null : offsideSnapshot(match, passer);
  let destination;
  let receiverId = target ? target.id : null;

  if (!target) {
    // Không có ai theo hướng đó: đá vào khoảng trống, như FO4 khi chuyền về nơi không có đồng đội.
    destination = keepInside({ x: passer.x + look.x * (8 + power * 25), z: passer.z + look.z * (8 + power * 25) });
  } else if (kind === "through" || kind === "lobThrough") {
    const run = throughRunDirection(match, target);
    const lead = 5 + power * 13;
    destination = keepInside({ x: target.x + run.x * lead, z: target.z + run.z * lead }, 2);
    target.runTo = { x: destination.x, z: destination.z, until: match.time + 3.5 };
  } else {
    const travel = dist(passer, target) / (kind === "lob" ? 17 : 15);
    destination = keepInside({ x: target.x + target.vx * travel * 0.8, z: target.z + target.vz * travel * 0.8 }, 0.8);
  }

  const d = dist(match.ball, destination);
  const overhit = Math.max(0, power - 0.85) * 2.5;
  const spread = (1.18 - skill) * (0.05 + pressure * 0.06 + overhit * 0.08) * (passer.sprint ? 1.3 : 1);
  const direction = rotate(norm(destination.x - match.ball.x, destination.z - match.ball.z), gaussian(match.rng) * spread);
  release(match, passer, kind === "short" ? 0.45 : 0.7);

  if (kind === "short" || kind === "through") {
    let speed;
    if (kind === "through" && target) {
      const runTime = dist(target, destination) / (target.topSpeed || 8.5) + 0.15;
      const a = PHYSICS.rolling;
      const vEnd = clamp((d - (a * runTime * runTime) / 2) / Math.max(0.3, runTime), 1.2, 9);
      speed = Math.sqrt(vEnd * vEnd + 2 * a * d);
    } else speed = groundSpeed(d, style === "driven" ? 10 + power * 4 : 5 + power * 3.5);
    if (style === "quick") speed *= 1.15;
    speed = clamp(speed * (1 + gaussian(match.rng) * (1.1 - skill) * 0.06), 7, 33);
    launchGround(match, passer, direction, speed);
  } else {
    // Z+A bổng cao, A A tạt thấp, Q+A tạt nhanh (căng, quỹ đạo thấp).
    const arc = style === "lofted" ? 1.0 + d * 0.04 : style === "lowCross" ? 0.45 + d * 0.017 : style === "earlyCross" ? 0.55 + d * 0.02 : 0.72 + d * 0.026;
    const flight = kind === "throw" ? (style === "longThrow" ? 0.8 + d * 0.03 : 0.55 + d * 0.028) : kind === "lobThrough" ? 0.85 + d * 0.03 : arc;
    const landing = { x: match.ball.x + direction.x * d * 0.97, z: match.ball.z + direction.z * d * 0.97 };
    // Tạt vào vòng cấm: bóng tới ngang đầu. Chuyền dài thường: bóng rơi xuống chân.
    const goal = attackGoal(match, passer.team);
    const cross = kind === "lob" && target && Math.abs(destination.x - goal.x) < FIELD.boxDepth + 2 && Math.abs(destination.z) < FIELD.boxHalf;
    launchAir(match, landing, flight, cross ? (style === "lowCross" ? 0.7 : 1.4) : FIELD.ballRadius);
  }
  match.ball.pass = { from: passer.id, to: receiverId, kind, style, target: destination, time: match.time };
  match.ball.offside = offside;
  match.teams[passer.team].stats.passes += 1;
  if (target) target.expect = { x: destination.x, z: destination.z, until: match.time + 4 };
  emit(match, "pass", { id: passer.id, to: receiverId, kind, style, speed: Math.hypot(match.ball.vx, match.ball.vz), lift: match.ball.vy });
  return target;
};

/**
 * Sút bóng. kind: normal (D), low (D+D sút sệt), finesse (Z+D sút xoáy), chip (Q+D bấm bóng), header.
 * `aim` là hướng phím lúc sút, dùng để chọn góc khung thành.
 */
export const shootBall = (match, shooter, { power = 0.7, kind = "normal", aim = null, curlSide = 0 } = {}) => {
  const goal = attackGoal(match, shooter.team);
  const start = ballStart(match);
  const skill = shooter.attrs.shoot / 100;
  const pressure = pressureOn(match, shooter);
  const d = dist(start, goal);
  const side = Math.sign(goal.x) || 1;

  // Góc sút: phím lên/xuống chọn cột xa/gần; không bấm thì sút về cột xa.
  let aimZ;
  if (aim && Math.abs(aim.z) > 0.25) aimZ = Math.sign(aim.z) * (2.15 + Math.min(0.9, Math.abs(aim.z) * 0.6));
  else if (Math.abs(start.z) > 1.5) aimZ = -Math.sign(start.z) * (1.7 + match.rng() * 1.1);
  else aimZ = (match.rng() < 0.5 ? -1 : 1) * (1.6 + match.rng() * 1.1);
  let aimY = kind === "low" ? 0.2 : kind === "power" ? 0.5 + power * 0.9 : kind === "finesse" ? 1.15 : kind === "header" ? 0.45 + power * 0.9 : 0.3 + power * 1.45;
  if (aim && aim.x * side < -0.6 && kind === "normal") aimY = Math.max(aimY, 1.7); // ghìm phím lùi: nâng bóng

  const spreadZ = (1.4 - skill) * (0.55 + d / 14) * (1 + pressure * 0.7) * (shooter.sprint ? 1.2 : 1) * (kind === "finesse" ? 0.72 : kind === "header" ? 1.5 : kind === "power" ? 1.3 : 1);
  let tz = aimZ + gaussian(match.rng) * spreadZ;
  let ty = Math.max(0.12, aimY + gaussian(match.rng) * spreadZ * 0.45);
  if (power > 0.82 && kind !== "chip") ty += (power - 0.82) * 9 * (1.35 - skill); // quá lực: bóng bay vọt xà
  const tx = goal.x;
  const onTarget = Math.abs(tz) < FIELD.goalHalf - 0.05 && ty < FIELD.goalHeight - 0.05;

  release(match, shooter, 0.6 + power * 0.4);
  const { ball } = match;
  if (kind === "chip") {
    const keeper = match.players.find((p) => p.team !== shooter.team && p.role === "GK" && !p.sentOff);
    const over = keeper ? Math.max(4, dist(start, keeper) + 2.5) : d;
    const flight = 0.7 + over * 0.05;
    launchAir(match, { x: start.x + (tx - start.x) * (over / d), z: start.z + (tz - start.z) * (over / d) }, flight, 1.6);
    // Bóng bấm rơi sau thủ môn rồi lăn vào lưới.
    ball.vx *= 1.05; ball.vz *= 1.05;
  } else {
    const speed = kind === "header" ? 10 + power * 7 : (16 + power * 16 + (shooter.attrs.shoot - 75) * 0.06) * (kind === "low" ? 0.92 : kind === "finesse" ? 0.78 : kind === "power" ? 1.16 : 1);
    const dx = tx - start.x;
    const dz = tz - start.z;
    const horizontal = Math.hypot(dx, dz);
    const time = flightTime(horizontal, speed);
    let dirX = dx / horizontal;
    let dirZ = dz / horizontal;
    if (kind === "finesse") {
      // Bóng đi vòng: nhắm lệch ra ngoài, xoáy kéo bóng về góc chết.
      // Đá phạt D + hướng: bóng xoáy về phía mũi tên (curlSide), mặc định xoáy vào góc chết.
      const curl = (curlSide ? curlSide : -Math.sign(tz - start.z || 1)) * 7;
      const sideways = { x: -dirZ, z: dirX };
      const drift = 0.5 * curl * time * time;
      const aimed = norm(dx - sideways.x * drift, dz - sideways.z * drift);
      dirX = aimed.x; dirZ = aimed.z;
      ball.spin = { x: sideways.x * curl, z: sideways.z * curl, until: match.time + time + 0.2 };
    }
    const vy = (ty - start.y + 0.5 * PHYSICS.gravity * time * time) / time;
    Object.assign(ball, { x: start.x, y: start.y, z: start.z, vx: dirX * speed, vz: dirZ * speed, vy: kind === "low" ? Math.min(vy, 1.2) : vy });
    if (kind === "finesse") ball.spin = { ...ball.spin };
  }
  ball.shot = { by: shooter.id, team: shooter.team, time: match.time, onTarget, kind };
  const stats = match.teams[shooter.team].stats;
  stats.shots += 1;
  if (onTarget) stats.onTarget += 1;
  emit(match, "shot", { id: shooter.id, kind, power, onTarget });
  return { onTarget, target: { x: tx, y: ty, z: tz } };
};

/** Phá bóng: đá thật xa, hướng ra biên và lên phía trên. */
export const clearBall = (match, player) => {
  const ahead = forward(match, player.team, 1);
  const away = Math.abs(player.z) > 6 ? Math.sign(player.z) : (match.rng() < 0.5 ? -1 : 1);
  const target = keepInside({ x: player.x + ahead * (32 + match.rng() * 14), z: player.z + away * (8 + match.rng() * 12) }, 3);
  release(match, player, 0.9);
  launchAir(match, target, 1.7 + match.rng() * 0.5);
  emit(match, "clear", { id: player.id });
};

/** Đánh đầu khi bóng ngang tầm đầu. Gần khung thành thì đánh đầu ghi bàn, xa thì đánh đầu chuyền/phá. */
export const headBall = (match, player) => {
  const goal = attackGoal(match, player.team);
  const near = dist(player, goal) < 17 && Math.abs(player.z) < 13;
  if (near) return { kind: "shot", ...shootBall(match, player, { power: 0.55 + match.rng() * 0.3, kind: "header" }) };
  const danger = dist(player, ownGoal(match, player.team)) < 26;
  if (danger) {
    clearBall(match, player);
    return { kind: "clear" };
  }
  const mate = choosePassTarget(match, player, { x: forward(match, player.team, 1), z: 0 }, "short", 0.3);
  if (mate && dist(player, mate) < 22) {
    passBall(match, player, { kind: "short", receiver: mate, power: 0.3 });
    match.ball.vy = 2.2;
    return { kind: "pass" };
  }
  clearBall(match, player);
  return { kind: "clear" };
};

/** Thủ môn phát bóng: ném cho hậu vệ trống, hoặc phát dài lên tuyến trên. */
export const keeperDistribute = (match, keeper, prefer = null) => {
  const mates = teamOf(match, keeper.team).filter((p) => p.id !== keeper.id);
  const shortOptions = mates.filter((p) => dist(p, keeper) < 34 && nearestOpponent(match, p).d > 7 && laneOpenness(match, keeper, p, keeper.team) > 3.2);
  if (prefer !== "long" && shortOptions.length && (prefer === "short" || match.rng() < 0.75)) {
    const receiver = shortOptions.sort((a, b) => forward(match, keeper.team, b.x) - forward(match, keeper.team, a.x))[0];
    passBall(match, keeper, { kind: "short", receiver, power: 0.4, setPiece: "goalkick" });
    return receiver;
  }
  const front = mates.filter((p) => ["ST", "LW", "RW", "CAM", "LM", "RM"].includes(p.role)).sort((a, b) => nearestOpponent(match, b).d - nearestOpponent(match, a).d)[0];
  if (front) {
    passBall(match, keeper, { kind: "lob", receiver: front, power: 0.85, setPiece: "goalkick" });
    return front;
  }
  clearBall(match, keeper);
  return null;
};

export { headingOf };
