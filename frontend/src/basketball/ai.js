/**
 * AI bóng rổ: chiến thuật tấn công 5 người (giãn đội hình, cắt vào rổ, pick & roll),
 * phòng ngự kèm người (áp sát người cầm bóng, chặn đường chuyền, bọc lót khi bị vượt qua, nhảy chắn),
 * tranh bóng bật bảng và người cầm bóng tự quyết: ném, đột phá, chuyền, đảo bóng.
 */
import { COURT, RULES } from "./constants.js";
import { attemptSteal, callScreen, choosePassTarget, contestOf, crossover, jump, laneRisk, passBall, shotChance, shotKind, shotPoints, startShot } from "./actions.js";
import { attackHoop, clamp, dist, holder, isUser, nearestOpponent, norm, segmentPoint } from "./util.js";

/** Vị trí đứng khi tấn công theo khung của rổ: [cách rổ về phía giữa sân, lệch ngang]. */
export const SPOTS = [
  [7.3, 0.4],    // PG: đỉnh vòng 3 điểm
  [5.0, 5.15],   // SG: cánh phải (3 điểm)
  [0.7, -6.95],  // SF: góc trái (3 điểm góc)
  [4.7, 2.2],    // PF: khuỷu tay phải (tầm trung)
  [1.1, -2.1],   // C: cột thấp bên trái
];

/** Đổi toạ độ [dọc, ngang] theo khung rổ tấn công của đội ra toạ độ sân. */
export const spotPoint = (match, team, [along, across]) => {
  const hoop = attackHoop(match, team);
  const flip = match.teams[team].flip || 1;
  return { x: hoop.x - Math.sign(hoop.x) * along, z: across * flip };
};

const forwardOf = (match, team, point) => point.x * match.teams[team].dir;

/** Dự đoán chỗ bóng tự do rơi xuống ngang tầm tay (để chạy tới tranh). */
export const predictLanding = (match, reachY = 2.3) => {
  const b = match.ball;
  if (b.flight) return { x: b.flight.ex, z: b.flight.ez, t: Math.max(0, b.flight.T - b.flight.t) };
  let { x, y, z, vx, vy, vz } = b;
  const step = 1 / 30;
  for (let t = 0; t < 2.5; t += step) {
    vy -= 9.81 * step;
    x += vx * step; y += vy * step; z += vz * step;
    if (vy < 0 && y < reachY) return { x, z, t };
    if (y < 0.12) { vy = Math.abs(vy) * 0.6; y = 0.12; vx *= 0.85; vz *= 0.85; }
  }
  return { x, z, t: 2.5 };
};

/** Đặt mục tiêu di chuyển cho cầu thủ (sim sẽ lái tới đó). */
const goTo = (player, point, speed = 0.75) => {
  player.goal = { x: clamp(point.x, -COURT.halfL + 0.45, COURT.halfL - 0.45), z: clamp(point.z, -COURT.halfW + 0.45, COURT.halfW - 0.45), speed };
};

/* ---------- tấn công ---------- */

const offBall = (match, player, carrier) => {
  const team = player.team;
  const hoop = attackHoop(match, team);
  const plan = player.plan;
  // Pick & roll: người chắn ra đứng cạnh hậu vệ, giữ chân, rồi lăn vào rổ.
  const screen = match.screen;
  if (screen && screen.by === player.id) {
    const defender = match.players[screen.defender];
    const carrierNow = holder(match);
    if (!carrierNow || carrierNow.team !== team) { match.screen = null; return; }
    const age = match.time - screen.t;
    if (age < 2.2 && !screen.rolled) {
      const line = norm(hoop.x - carrierNow.x, hoop.z - carrierNow.z);
      const side = Math.sign((player.x - defender.x) * -line.z + (player.z - defender.z) * line.x) || 1;
      const spot = { x: defender.x - line.z * side * 0.62, z: defender.z + line.x * side * 0.62 };
      if (!screen.set && dist(player, spot) < 0.45) { screen.set = true; screen.setAt = match.time; screen.side = side; }
      if (screen.set) { player.goal = null; player.screening = true; if (match.time - screen.setAt > 1.3) screen.rolled = match.time; }
      else goTo(player, spot, 1);
      return;
    }
    player.screening = false;
    if (match.time - (screen.rolled || screen.t) < 1.6) { goTo(player, { x: hoop.x - Math.sign(hoop.x) * 1.4, z: (screen.side || 1) * -0.8 }, 1); return; }
    match.screen = null;
  }
  player.screening = false;
  if (plan.until <= match.time) {
    // Thỉnh thoảng cắt vào rổ (nhất là khi hậu vệ đứng chặn đường chuyền), rồi trở ra.
    const guard = match.players.find((p) => match.guard[p.id] === player.id);
    const denied = guard && dist(guard, hoop) > dist(player, hoop) - 0.2;
    if (plan.kind === "spot" && player.slot !== 4 && match.rng() < (denied ? 0.5 : 0.22)) {
      plan.kind = "cut";
      plan.until = match.time + 1.3 + match.rng() * 0.4;
      plan.side = match.rng() < 0.5 ? -1 : 1;
    } else {
      plan.kind = "spot";
      plan.until = match.time + 2.8 + match.rng() * 3.5;
    }
  }
  if (plan.kind === "cut") { goTo(player, { x: hoop.x - Math.sign(hoop.x) * 1.2, z: plan.side * 1.1 }, 1); return; }
  let spot = spotPoint(match, team, SPOTS[player.slot]);
  // Giãn đội hình: tránh đứng chồng lên đồng đội và người cầm bóng.
  for (const mate of match.players) {
    if (mate.team !== team || mate.id === player.id) continue;
    const near = dist(mate, spot);
    const room = mate === carrier ? 3.6 : 2.6;
    if (near < room) {
      const away = norm(spot.x - mate.x, spot.z - mate.z);
      spot = { x: spot.x + away.x * (room - near), z: spot.z + away.z * (room - near) };
    }
  }
  // Người cầm bóng còn ở phần sân nhà: chạy lên nhanh.
  const behind = carrier && forwardOf(match, team, carrier) < 0;
  goTo(player, spot, behind ? 1 : 0.7);
};

/** Người cầm bóng do máy điều khiển: ném, đột phá, chuyền, đảo bóng hoặc gọi chắn. */
const onBall = (match, carrier, h) => {
  const team = carrier.team;
  const hoop = attackHoop(match, team);
  const iq = match.teams[team].iq;
  carrier.think -= h;
  const toHoop = dist(carrier, hoop);
  // Đang ở sân nhà: dẫn bóng lên, chuyền vượt tuyến nếu đồng đội trống.
  if (forwardOf(match, team, carrier) < -1) {
    goTo(carrier, spotPoint(match, team, SPOTS[0]), 0.9);
    if (carrier.think <= 0) {
      carrier.think = 0.35;
      const ahead = match.players.find((p) => p.team === team && p !== carrier && forwardOf(match, team, p) > 5 && nearestOpponent(match, p).d > 4.5 && laneRisk(match, carrier, p) < 0.2);
      if (ahead && match.rng() < 0.6) passBall(match, carrier, { to: ahead, kind: "chest" });
    }
    return;
  }
  const lane = laneClear(match, carrier, hoop);
  // Đường vào rổ trống: thường đột phá, nhưng cầu thủ ném xa giỏi có lúc đứng lại ném 3 điểm.
  if (lane && !carrier.driving && toHoop < 8.5 && carrier.holdT > 0.3 && carrier.think <= 0) carrier.driving = toHoop < 5 || match.rng() < 0.75 - carrier.attr.three * 0.35;
  if (carrier.driving) {
    carrier.driving = lane || carrier.driving;
    goTo(carrier, hoop, 1);
    if (toHoop < (carrier.attr.dunk > 0.62 ? 2.3 : 2.6)) { carrier.driving = false; startShot(match, carrier); return; }
    if (!lane && nearestOpponent(match, carrier).d < 0.9) carrier.driving = false;
  } else if (!carrier.goal || dist(carrier, carrier.goal) < 0.6 || carrier.think <= 0) {
    // Rê bóng quanh vị trí của mình, lệch về phía rổ.
    const base = spotPoint(match, team, SPOTS[carrier.slot]);
    goTo(carrier, { x: base.x + (match.rng() - 0.5) * 2.4, z: base.z + (match.rng() - 0.5) * 2.4 }, 0.55);
  }
  if (carrier.think > 0) return;
  carrier.think = 0.22 + match.rng() * 0.1;
  const kind = shotKind(match, carrier, hoop);
  const contest = contestOf(match, carrier, hoop);
  const ev = shotChance(match, carrier, { kind, quality: 0.78, contest, hoop }) * shotPoints(carrier, hoop);
  const clock = match.shotClock;
  // Các phương án chuyền.
  let best = null;
  let bestValue = -Infinity;
  for (const mate of match.players) {
    if (mate.team !== team || mate === carrier) continue;
    const mateContest = contestOf(match, mate, hoop);
    const risk = laneRisk(match, carrier, mate);
    const value = shotChance(match, mate, { kind: shotKind(match, mate, hoop), quality: 0.78, contest: mateContest, hoop }) * shotPoints(mate, hoop) * (1 - risk * 1.6);
    if (value > bestValue) { bestValue = value; best = mate; }
  }
  const late = clock < 1.8 || (match.clock < 1.8 && match.clock < clock);
  if (late) { startShot(match, carrier); return; }
  const threshold = 1.02 - iq * 0.1;
  if ((ev >= threshold && carrier.holdT > 0.45) || (clock < 4 && ev > 0.62)) { startShot(match, carrier); return; }
  if (best && carrier.holdT > 0.55 && (bestValue > ev + 0.22 || (carrier.holdT > 2.6 && bestValue > 0.7) || clock < 4)) {
    const oop = dist(best, hoop) < 2.8 && best.attr.dunk > 0.62 && best.plan.kind === "cut";
    const risk = laneRisk(match, carrier, best);
    passBall(match, carrier, { to: best, kind: oop && match.rng() < 0.35 ? "lob" : risk > 0.15 ? "bounce" : "chest" });
    return;
  }
  const { d } = nearestOpponent(match, carrier);
  if (d < 1.3 && carrier.cool <= 0 && match.rng() < 0.04 + carrier.attr.handle * 0.06) { crossover(match, carrier); carrier.driving = laneClear(match, carrier, hoop, 0.8); return; }
  if (carrier.holdT > 1.1 && !match.screen && match.rng() < 0.05 + iq * 0.04) callScreen(match, carrier);
};

/** Đường vào rổ có trống không (không hậu vệ nào đứng chắn gần đường thẳng tới rổ). */
export const laneClear = (match, carrier, hoop, width = 1.05) => {
  for (const d of match.players) {
    if (d.team === carrier.team) continue;
    const at = segmentPoint(d, carrier, hoop);
    if (at.u > 0.05 && at.u < 0.97 && at.d < width && d.stun <= 0) return false;
  }
  return true;
};

/* ---------- phòng ngự ---------- */

/** Chỗ đứng phòng ngự của một hậu vệ, theo người mình kèm. */
export const guardSpot = (match, defender) => {
  const team = defender.team;
  const man = match.players[match.guard[defender.id]];
  const carrier = holder(match);
  const basket = attackHoop(match, 1 - team);
  if (!man) return { x: basket.x - Math.sign(basket.x) * 3, z: 0 };
  const toBasket = norm(basket.x - man.x, basket.z - man.z);
  const flight = match.ball.flight;
  // Bóng đang bay vào rổ: chèn người (box out).
  if (flight?.kind === "shot") return { x: man.x + toBasket.x * 0.9, z: man.z + toBasket.z * 0.9 };
  if (carrier && carrier === man) {
    // Phản xạ có độ trễ: hậu vệ theo vị trí của người cầm bóng một nhịp trước (đột phá nhanh thì vượt qua được).
    const lag = (match.teams[team].react || 0.25) * 0.55;
    const seen = { x: man.x - man.vx * lag, z: man.z - man.vz * lag };
    const line = norm(basket.x - seen.x, basket.z - seen.z);
    const gap = clamp(0.95 + (line.l - 6.5) * 0.14, 0.9, 2.2);
    return { x: seen.x + line.x * gap, z: seen.z + line.z * gap };
  }
  const ball = carrier || match.ball;
  const fromBall = dist(man, ball);
  if (fromBall < 8.5) {
    // Một đường chuyền: đứng chặn đường chuyền, lệch về rổ.
    const toBall = norm(ball.x - man.x, ball.z - man.z);
    return { x: man.x + toBasket.x * 0.9 + toBall.x * 0.7, z: man.z + toBasket.z * 0.9 + toBall.z * 0.7 };
  }
  // Phía xa bóng: lùi vào giữa để bọc lót.
  return { x: man.x + (basket.x - man.x) * 0.4 + (ball.x - man.x) * 0.15, z: man.z + (basket.z - man.z) * 0.4 + (ball.z - man.z) * 0.15 };
};

const defend = (match, defender) => {
  const team = defender.team;
  const carrier = holder(match);
  const basket = attackHoop(match, 1 - team);
  let spot = guardSpot(match, defender);
  let speed = 0.85;
  if (carrier && carrier.team !== team) {
    const onBall = match.guard[defender.id] === carrier.id;
    // Kèm đôi theo lệnh.
    if (match.double?.team === team && match.double.by === defender.id && match.time < match.double.until) {
      const side = norm(carrier.x - basket.x, carrier.z - basket.z);
      spot = { x: carrier.x - side.x * 0.9 + side.z * 0.7, z: carrier.z - side.z * 0.9 - side.x * 0.7 };
      speed = 1;
    }
    // Bọc lót: người cầm bóng đã vượt qua hậu vệ của mình và lao vào rổ.
    const ownGuard = match.players.find((p) => match.guard[p.id] === carrier.id);
    const beaten = ownGuard && (dist(ownGuard, basket) > dist(carrier, basket) + 0.3 || ownGuard.stun > 0);
    if (!onBall && beaten && dist(carrier, basket) < 5.5 && match.helper === defender.id) {
      const cut = norm(basket.x - carrier.x, basket.z - carrier.z);
      spot = { x: carrier.x + cut.x * 1.0, z: carrier.z + cut.z * 1.0 };
      speed = 1;
    }
    if (onBall) {
      speed = dist(defender, spot) > 2 ? 1 : 0.8;
      const gap = dist(defender, carrier);
      const level = match.teams[team].iq;
      // Thỉnh thoảng thò tay cướp bóng.
      if (gap < 1.15 && defender.cool <= 0 && !carrier.act && match.rng() < match.dtStep * 0.11 * (0.5 + defender.attr.steal) * (0.5 + level)) attemptSteal(match, defender);
    }
  }
  // Lùi về phòng ngự nhanh khi vừa mất bóng.
  if (dist(defender, spot) > 5) speed = 1;
  goTo(defender, spot, speed);
  // Nhảy chắn khi đối thủ ném gần mình (có độ trễ phản xạ theo độ khó).
  const shooter = match.players.find((p) => p.team !== team && p.act?.type === "shot");
  if (shooter && defender.y === 0 && defender.cool <= 0) {
    const gap = dist(defender, shooter);
    const react = match.teams[team].react;
    const nearRim = dist(defender, basket) < 2.4 && shooter.act.kind !== "jumper";
    // Mỗi cú ném, mỗi hậu vệ chỉ quyết định một lần: nhảy chắn hay giơ tay đứng chắn.
    const seen = (shooter.act.seenBy ||= {});
    if ((gap < 1.7 || (nearRim && gap < 2.6)) && shooter.act.t > react && !seen[defender.id]) {
      seen[defender.id] = true;
      if (match.rng() < 0.45 + defender.attr.block * 0.3) jump(match, defender);
    }
  }
};

/* ---------- bóng tự do & bóng bật bảng ---------- */

const chase = (match, players) => {
  const landing = predictLanding(match);
  const flight = match.ball.flight;
  const shotInAir = flight?.kind === "shot";
  for (const team of [0, 1]) {
    const mates = players.filter((p) => p.team === team);
    // Hai người gần nhất mỗi đội lao vào bóng; bóng ném đang bay thì trung phong và tiền phong chính tranh bật bảng.
    const order = mates.slice().sort((a, b) => dist(a, landing) - dist(b, landing));
    const chasers = new Set(order.slice(0, shotInAir ? 0 : 2).map((p) => p.id));
    for (const p of mates) {
      if (chasers.has(p.id)) {
        goTo(p, landing, 1);
        const b = match.ball;
        if (!b.flight && b.vy < 0.5 && dist(p, b) < 1.1 && b.y > p.height + 0.35 && b.y < p.height + 1.3 && match.rng() < 0.25) jump(match, p);
        continue;
      }
      const attacking = match.possession === team;
      if (shotInAir && attacking && p.slot >= 3) {
        const hoop = attackHoop(match, team);
        goTo(p, { x: hoop.x - Math.sign(hoop.x) * 1.6, z: p.slot === 3 ? 1.6 : -1.6 }, 1);
      } else if (shotInAir && !attacking) goTo(p, guardSpot(match, p), 1);
      else if (attacking && p.slot <= 1 && shotInAir) goTo(p, { x: -attackHoop(match, team).x * 0.15, z: p.slot ? 3 : -3 }, 0.8);
      else if (attacking) goTo(p, spotPoint(match, team, SPOTS[p.slot]), 0.8);
      else goTo(p, guardSpot(match, p), 0.9);
    }
  }
};

/** Mỗi bước: đặt mục tiêu cho mọi cầu thủ máy điều khiển. */
export const think = (match, h) => {
  const f = match.ball.flight;
  const passing = f && (f.kind === "pass" || f.kind === "tip");
  // Bóng đang được chuyền: coi người nhận như người cầm bóng để cả đội đứng đúng chỗ.
  const carrier = holder(match) || (passing ? match.players[f.to] : null);
  // Người bọc lót: hậu vệ cao to gần rổ nhất (không phải người đang kèm bóng).
  if (carrier) {
    const team = 1 - carrier.team;
    const basket = attackHoop(match, carrier.team);
    let best = null;
    let bestD = Infinity;
    for (const p of match.players) {
      if (p.team !== team || match.guard[p.id] === carrier.id) continue;
      const d = dist(p, basket) - p.slot * 0.6;
      if (d < bestD) { bestD = d; best = p; }
    }
    match.helper = best?.id ?? null;
  }
  // Máy điều khiển mọi cầu thủ, trừ người đang được người chơi cầm (khi giữ phím kèm người thì máy dẫn chỗ đứng giúp).
  const free = match.players.filter((p) => !isUser(match, p) || match.humans[p.team]?.input.guard);
  if (!carrier) { chase(match, free.filter((p) => !p.act)); }
  for (const p of free) {
    if (p.act || p.stun > 0) continue;
    if (passing && p.id === f.catcher) { goTo(p, { x: f.ex, z: f.ez }, 1); continue; }
    if (!carrier) continue;
    if (p.team === carrier.team) {
      if (p === carrier) { if (!passing && !isUser(match, p)) onBall(match, p, h); }
      else offBall(match, p, carrier);
    } else defend(match, p);
  }
};

/** Người phát bóng biên do máy điều khiển: chọn người trống rồi chuyền. */
export const inboundThink = (match, taker, { force = false } = {}) => {
  const ib = match.inbound;
  if (!force && match.phaseT - (ib.readyAt ?? 0) < (ib.wait ?? 1.1)) return;
  const target = choosePassTarget(match, taker, null, "chest");
  if (target) passBall(match, taker, { to: target, kind: laneRisk(match, taker, target) > 0.3 ? "lob" : "chest" });
};

export const INBOUND_LIMIT = RULES.inboundSeconds;
