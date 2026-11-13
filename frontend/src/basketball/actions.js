/**
 * Các động tác có bóng và phòng ngự: ném rổ (nhảy ném, lên rổ, úp rổ), chuyền (bật, đập đất, bổng/alley-oop),
 * cướp bóng, đảo bóng qua người, nhảy chắn, gọi chắn (pick & roll), kèm đôi.
 * Hàm thuần JS, sửa trực tiếp `match` và đẩy sự kiện vào match.events.
 */
import { COURT } from "./constants.js";
import { attackHoop, clamp, dist, facing, gaussian, headingOf, holder, insideCourt, isThree, nearestOpponent, norm, segmentPoint } from "./util.js";

export const emit = (match, type, data = {}) => { match.events.push({ type, t: match.time, ...data }); };

/** Thời điểm nhả bóng đẹp nhất của cú nhảy ném (giây tính từ lúc bấm). */
export const IDEAL_RELEASE = 0.5;
export const LATE_RELEASE = 0.95;

export const assistOf = (match, team) => match.humans?.[team]?.assist || match.assist || "assisted";

/** Độ chính xác nhả bóng 0..1 theo thời gian giữ nút (cửa sổ rộng hơn khi hỗ trợ cao). */
export const releaseQuality = (hold, assist = "assisted") => {
  const window = assist === "manual" ? 0.16 : assist === "semi" ? 0.22 : 0.3;
  return clamp(1 - Math.abs(hold - IDEAL_RELEASE) / window, 0, 1);
};

/** Mức bị kèm khi ném: 0 (trống) .. 1 (bị chắn sát mặt). */
export const contestOf = (match, shooter, hoop = attackHoop(match, shooter.team)) => {
  const toHoop = norm(hoop.x - shooter.x, hoop.z - shooter.z);
  let worst = 0;
  for (const d of match.players) {
    if (d.team === shooter.team) continue;
    const gap = dist(d, shooter);
    if (gap > 2.4) continue;
    const to = norm(d.x - shooter.x, d.z - shooter.z);
    const front = to.x * toHoop.x + to.z * toHoop.z; // 1: đứng chắn giữa người ném và rổ
    const reach = 0.75 + (d.height - 1.85) * 1.4 + (d.y > 0.15 ? 0.3 : 0);
    const value = (1 - gap / 2.4) * (0.45 + 0.55 * Math.max(0, front)) * reach * (d.stun > 0 ? 0.3 : 1);
    worst = Math.max(worst, value);
  }
  return clamp(worst, 0, 1);
};

/** Loại cú ném theo khoảng cách tới rổ và cách di chuyển. */
export const shotKind = (match, player, hoop = attackHoop(match, player.team)) => {
  const d = dist(player, hoop);
  const speed = Math.hypot(player.vx, player.vz);
  const toward = speed > 0.5 ? ((hoop.x - player.x) * player.vx + (hoop.z - player.z) * player.vz) / (d * speed) : 0;
  if (d < 2.3 && player.attr.dunk > 0.62 && (toward > 0.4 || d < 1.4)) return "dunk";
  if (d < 3.2) return "layup";
  return "jumper";
};

/** Xác suất vào rổ của một cú ném (chưa tính bị chắn bóng). */
export const shotChance = (match, player, { kind = shotKind(match, player), quality = 0.75, contest = contestOf(match, player), hoop = attackHoop(match, player.team) } = {}) => {
  const d = dist(player, hoop);
  const a = player.attr;
  let base;
  if (kind === "dunk") base = 0.86 + 0.1 * a.dunk;
  else if (kind === "layup") base = 0.42 + 0.38 * a.inside;
  else if (isThree(player, hoop.x)) base = 0.16 + 0.32 * a.three - Math.max(0, d - 7.6) * 0.07;
  else if (d < 4.6) base = 0.3 + 0.32 * a.mid;
  else base = 0.26 + 0.3 * a.mid;
  if (d > 10) base *= 0.35;
  let p = base * (1 - 0.5 * contest);
  if (kind === "jumper") p *= 0.5 + 0.5 * quality;
  else p *= 0.85 + 0.15 * quality;
  const speed = Math.hypot(player.vx, player.vz);
  if (kind === "jumper" && speed > 3.2) p *= 0.82;
  p *= 0.84 + 0.16 * player.stamina;
  return clamp(p, 0.01, 0.98);
};

export const shotPoints = (player, hoop) => (isThree(player, hoop.x) ? 3 : 2);

/** Bắt đầu động tác ném: người chơi nhảy lên, bóng giơ lên tay. Nhả bóng ở releaseShot. */
export const startShot = (match, player, { auto = false } = {}) => {
  if (match.ball.owner !== player.id || player.act) return false;
  const hoop = attackHoop(match, player.team);
  const kind = shotKind(match, player, hoop);
  player.act = { type: "shot", kind, t: 0, auto, hold: null, from: { x: player.x, z: player.z } };
  player.heading = headingOf(hoop.x - player.x, hoop.z - player.z);
  if (kind === "jumper") { player.vx *= 0.3; player.vz *= 0.3; }
  emit(match, "gather", { id: player.id, kind });
  return true;
};

/** Thả nút ném: ghi lại thời gian giữ (để chấm điểm nhả bóng). Lên rổ/úp rổ tự nhả bóng ở trên vành. */
export const releaseShot = (match, player, hold) => {
  const act = player.act;
  if (!act || act.type !== "shot") {
    // Lệnh nhả đến trước lệnh bắt đầu (online): ném luôn với thời gian giữ đã đo.
    if (match.ball.owner === player.id && startShot(match, player)) {
      player.act.hold = Number.isFinite(hold) ? hold : IDEAL_RELEASE;
      return true;
    }
    return false;
  }
  if (act.hold === null) act.hold = Number.isFinite(hold) ? clamp(hold, 0, 2) : act.t;
  return true;
};

/** Đường bay parabol: x, z tuyến tính; y qua điểm đầu, điểm cuối và cao thêm `lift` ở giữa. */
export const flightPoint = (f, u) => ({
  x: f.sx + (f.ex - f.sx) * u,
  z: f.sz + (f.ez - f.sz) * u,
  y: f.sy + (f.ey - f.sy) * u + 4 * f.lift * u * (1 - u),
});

/** Nhả bóng: tính vào/trượt, bị chắn hay không, và cho bóng bay. */
export const launchShot = (match, player) => {
  const act = player.act;
  const hoop = attackHoop(match, player.team);
  const assist = assistOf(match, player.team);
  const human = match.humans?.[player.team];
  const controlled = Boolean(human && !human.auto && human.controlledId === player.id);
  let quality;
  if (act.kind !== "jumper") quality = controlled ? 0.85 : 0.8;
  else if (controlled && act.hold !== null && !act.auto) quality = releaseQuality(act.hold, assist);
  else quality = clamp(0.62 + 0.3 * player.attr[isThree(player, hoop.x) ? "three" : "mid"] + gaussian(match.rng) * 0.12, 0, 1);
  const contest = contestOf(match, player, hoop);
  const points = act.kind === "jumper" || act.kind === "ft" ? shotPoints(act.from || player, hoop) : 2;
  const chance = shotChance(match, player, { kind: act.kind, quality, contest, hoop });
  const made = match.rng() < chance;
  // Chắn bóng: hậu vệ đang nhảy, sát người ném, tay cao hơn.
  let blocker = null;
  const toHoop = norm(hoop.x - player.x, hoop.z - player.z);
  for (const d of match.players) {
    if (d.team === player.team || d.y < 0.12) continue;
    const gap = dist(d, player);
    if (gap > 1.3) continue;
    const front = ((d.x - player.x) * toHoop.x + (d.z - player.z) * toHoop.z) / Math.max(0.01, gap);
    if (front < -0.1) continue;
    const reach = d.height + d.y * 1.4 - (player.height + player.y);
    const p = ((act.kind === "jumper" ? 0.03 : 0.08) + 0.2 * d.attr.block * clamp(0.5 + reach * 0.8, 0, 1.2)) * (1.15 - gap * 0.5);
    if (match.rng() < p) { blocker = d; break; }
  }
  const release = { x: player.x + Math.sin(player.heading) * 0.25, y: player.height + 0.35 + player.y, z: player.z + Math.cos(player.heading) * 0.25 };
  const d = Math.hypot(hoop.x - release.x, hoop.z - release.z);
  const stats = match.teams[player.team].stats;
  stats.fga += 1;
  player.stats.fga += 1;
  if (points === 3) { stats.tpa += 1; player.stats.tpa += 1; }
  match.ball.owner = null;
  match.ball.lastTouch = player.team;
  match.lastShot = { team: player.team, id: player.id, points, made: made && !blocker, kind: act.kind, t: match.time, assistBy: recentPasser(match, player) };
  emit(match, "shot", { id: player.id, team: player.team, kind: act.kind, points, chance, quality, contest });
  if (blocker) {
    // Bóng bị đập ra ngoài sau 0.12 s.
    const away = norm(release.x - hoop.x, release.z - hoop.z);
    match.ball.flight = {
      kind: "blocked", by: blocker.id, from: player.id, t: 0, T: 0.12,
      sx: release.x, sy: release.y, sz: release.z, ex: release.x + away.x * 0.3, ey: release.y + 0.25, ez: release.z + away.z * 0.3, lift: 0.05,
      out: { vx: away.x * (3 + match.rng() * 2.5) + (match.rng() - 0.5) * 2, vy: 1 + match.rng() * 2, vz: away.z * (3 + match.rng() * 2.5) + (match.rng() - 0.5) * 2 },
    };
    match.lastShot.made = false;
    return;
  }
  const arc = act.kind === "dunk" ? 0.15 : act.kind === "layup" ? 0.45 : 0.9 + d * 0.17;
  const T = act.kind === "dunk" ? 0.18 : act.kind === "layup" ? 0.42 : 0.55 + d * 0.075;
  let end;
  if (made) end = { x: hoop.x, y: COURT.rimY - 0.02, z: hoop.z };
  else {
    // Trượt: chạm vành ở một điểm lệch tâm (hoặc hụt hẳn khi bị kèm rất sát từ xa).
    const airball = contest > 0.7 && d > 6 && match.rng() < 0.25;
    const angle = match.rng() * Math.PI * 2;
    const off = airball ? 0 : 0.2 + match.rng() * 0.18;
    const short = airball ? norm(hoop.x - release.x, hoop.z - release.z) : null;
    end = airball
      ? { x: hoop.x - short.x * 0.7, y: 2.7, z: hoop.z - short.z * 0.7 }
      : { x: hoop.x + Math.cos(angle) * off, y: COURT.rimY + 0.06, z: hoop.z + Math.sin(angle) * off };
    match.lastShot.airball = airball;
  }
  const ey = act.kind === "dunk" ? COURT.rimY + 0.05 : end.y;
  const lift = Math.max(0.05, Math.max(release.y, ey) + arc - (release.y + ey) / 2);
  match.ball.flight = { kind: "shot", from: player.id, made, points, t: 0, T, sx: release.x, sy: release.y, sz: release.z, ex: end.x, ey, ez: end.z, lift, dunk: act.kind === "dunk", airball: Boolean(match.lastShot.airball) };
};

/** Người chuyền gần nhất cho cầu thủ này (trong 4 giây) – để tính kiến tạo. */
export const recentPasser = (match, player) => {
  const pass = match.lastPass;
  if (!pass || pass.to !== player.id || match.time - pass.t > 4 || pass.from === player.id) return null;
  return match.players[pass.from].team === player.team ? pass.from : null;
};

/** Độ trống của một đồng đội: khoảng cách tới hậu vệ gần nhất. */
export const openness = (match, player) => nearestOpponent(match, player).d;

/**
 * Chọn người nhận theo hướng bấm (hoặc tự chọn người trống nhất khi không bấm hướng).
 * `strict` (hỗ trợ thủ công): chỉ theo đúng hướng bấm, không tự né đường chuyền nguy hiểm.
 */
export const choosePassTarget = (match, passer, dir = null, kind = "chest", strict = false) => {
  const hoop = attackHoop(match, passer.team);
  let best = null;
  let bestScore = -Infinity;
  const want = dir && Math.hypot(dir.x, dir.z) > 0.2 ? norm(dir.x, dir.z) : null;
  for (const mate of match.players) {
    if (mate.team !== passer.team || mate.id === passer.id || !insideCourt(mate, -0.25)) continue;
    const to = norm(mate.x - passer.x, mate.z - passer.z);
    const open = openness(match, mate);
    const lane = laneRisk(match, passer, mate, kind);
    let score = Math.min(open, 4) * 0.5 - lane * 3 - Math.abs(to.l - 6) * 0.08;
    // Đồng đội đang lao vào rổ: chuyền bổng cho úp rổ.
    if (kind === "lob") score += Math.max(0, 4 - dist(mate, hoop)) * 0.6;
    if (want) {
      const align = to.x * want.x + to.z * want.z;
      score = strict ? align * 6 - to.l * 0.05 : align * 6 + score * 0.6;
      if (align < 0.2) score -= 8;
    }
    if (score > bestScore) { bestScore = score; best = mate; }
  }
  return best;
};

/** Hậu vệ với tới đường bóng xa bao nhiêu (m) nếu bóng tới đó sau `arrive` giây. */
const interceptReach = (d, arrive) => {
  const react = 0.16 + (1 - d.attr.steal) * 0.2;
  return 0.4 + d.attr.steal * 0.35 + Math.max(0, arrive - react) * (d.topSpeed || 6) * 0.22;
};
const interceptChance = (d, gap, reach, passer, kind) => clamp((1 - gap / reach) * (0.16 + 0.38 * d.attr.steal) * (kind === "bounce" ? 0.55 : 1) - passer.attr.pass * 0.08, 0, 0.7);

/** Rủi ro bị cắt đường chuyền 0..1 (cùng cách tính với lúc chuyền thật, dùng cho AI chọn người). */
export const laneRisk = (match, from, to, kind = "chest") => {
  let safe = 1;
  const speed = kind === "lob" ? 9 : kind === "bounce" ? 9.5 : 13.5;
  const length = dist(from, to);
  for (const d of match.players) {
    if (d.team === from.team) continue;
    const at = segmentPoint(d, from, to);
    if (at.u < 0.12 || (kind === "lob" && at.u < 0.85)) continue;
    const reach = interceptReach(d, (at.u * length) / speed);
    if (at.d > reach) continue;
    safe *= 1 - interceptChance(d, at.d, reach, from, kind);
  }
  return 1 - safe;
};

/** Chuyền bóng. `kind`: chest (bật thẳng), bounce (đập đất), lob (bổng / alley-oop). */
export const passBall = (match, passer, { to = null, kind = "chest", dir = null } = {}) => {
  if (match.ball.owner !== passer.id) return false;
  const receiver = to ?? choosePassTarget(match, passer, dir, kind);
  if (!receiver || receiver.team !== passer.team || receiver.id === passer.id) return false;
  const speed = kind === "lob" ? 9 : kind === "bounce" ? 9.5 : 12.5 + passer.attr.pass * 2;
  const gap = dist(passer, receiver);
  let T = kind === "lob" ? 0.35 + gap / speed : gap / speed;
  // Đón đầu: chuyền tới chỗ người nhận sẽ chạy tới.
  const lead = kind === "lob" ? 0.9 : 0.6;
  let ex = receiver.x + receiver.vx * T * lead;
  let ez = receiver.z + receiver.vz * T * lead;
  ex = clamp(ex, -COURT.halfL + 0.4, COURT.halfL - 0.4);
  ez = clamp(ez, -COURT.halfW + 0.4, COURT.halfW - 0.4);
  T = Math.max(0.18, (kind === "lob" ? 0.35 : 0) + Math.hypot(ex - passer.x, ez - passer.z) / speed);
  const sy = 1.25;
  const ey = kind === "lob" ? (dist({ x: ex, z: ez }, attackHoop(match, passer.team)) < 2.6 && receiver.attr.dunk > 0.6 ? 3.0 : 1.9) : 1.25;
  const lift = kind === "lob" ? 1.6 + gap * 0.08 : 0.05;
  const flight = { kind: "pass", style: kind, from: passer.id, to: receiver.id, t: 0, T, sx: passer.x, sy, sz: passer.z, ex, ey, ez, lift, bounce: kind === "bounce", catcher: receiver.id };
  // Ai đứng trên đường bóng và kịp với tới thì cắt được.
  let earliest = Infinity;
  for (const d of match.players) {
    if (d.team === passer.team) continue;
    const at = segmentPoint(d, passer, { x: ex, z: ez });
    if (at.u < 0.12) continue;
    if (kind === "lob" && at.u < 0.85) continue;
    const arrive = at.u * T;
    const reach = interceptReach(d, arrive);
    if (at.d > reach) continue;
    const chance = interceptChance(d, at.d, reach, passer, kind);
    if (arrive < earliest && match.rng() < chance) { earliest = arrive; flight.cut = { id: d.id, u: at.u }; }
  }
  if (flight.cut) {
    const p = flightPoint(flight, flight.cut.u);
    flight.T *= flight.cut.u;
    flight.ex = p.x; flight.ez = p.z; flight.ey = Math.min(2.2, p.y);
    flight.lift *= flight.cut.u;
    flight.catcher = flight.cut.id;
  }
  match.ball.owner = null;
  match.ball.flight = flight;
  match.ball.lastTouch = passer.team;
  match.lastPass = { from: passer.id, to: receiver.id, t: match.time };
  passer.anim.pass = 1;
  passer.heading = headingOf(ex - passer.x, ez - passer.z);
  passer.holdT = 0;
  emit(match, "pass", { id: passer.id, to: receiver.id, kind });
  return receiver;
};

/** Cướp bóng: trúng thì bóng văng ra, trượt có thể phạm lỗi với tay. */
export const attemptSteal = (match, defender) => {
  if (defender.cool > 0 || defender.act) return false;
  defender.cool = 0.8;
  defender.anim.reach = 1;
  const carrier = holder(match);
  if (!carrier || carrier.team === defender.team) return false;
  const gap = dist(defender, carrier);
  if (gap > 1.45) return false;
  const to = norm(defender.x - carrier.x, defender.z - carrier.z);
  const face = facing(carrier.heading);
  const front = to.x * face.x + to.z * face.z;
  const chance = clamp(0.1 + 0.36 * defender.attr.steal - 0.24 * carrier.attr.handle + (front < -0.3 ? 0.08 : 0) + (carrier.act ? 0.12 : 0) - gap * 0.06, 0.03, 0.55);
  const roll = match.rng();
  if (roll < chance) {
    const away = norm(defender.x - carrier.x + (match.rng() - 0.5), defender.z - carrier.z + (match.rng() - 0.5));
    loose(match, { x: carrier.x, y: 0.9, z: carrier.z }, { vx: away.x * 3.2, vy: 1.5, vz: away.z * 3.2 }, carrier.team);
    match.ball.stolenBy = defender.id;
    carrier.act = null;
    emit(match, "steal", { id: defender.id, from: carrier.id });
    return true;
  }
  // Với tay từ phía sau hay quá xa: dễ thổi phạt.
  const foul = roll > 1 - (0.14 + (front < -0.2 ? 0.2 : 0) + (gap > 1.2 ? 0.08 : 0));
  if (foul) match.pendingFoul = { by: defender.id, on: carrier.id, shooting: Boolean(carrier.act?.type === "shot"), t: match.time };
  return false;
};

/** Ném bóng thành bóng tự do (sau cướp, chắn, bật vành). */
export const loose = (match, at, v, touchTeam) => {
  Object.assign(match.ball, { owner: null, flight: null, x: at.x, y: at.y, z: at.z, vx: v.vx, vy: v.vy, vz: v.vz });
  if (touchTeam === 0 || touchTeam === 1) match.ball.lastTouch = touchTeam;
};

/** Đảo bóng qua người: bứt tốc theo hướng bấm, hậu vệ sát người có thể bị “gãy cổ chân”. */
export const crossover = (match, carrier, dir = null) => {
  if (carrier.cool > 0 || carrier.act || match.ball.owner !== carrier.id) return false;
  carrier.cool = 0.9;
  const { player: defender, d } = nearestOpponent(match, carrier);
  let move = dir && Math.hypot(dir.x, dir.z) > 0.2 ? norm(dir.x, dir.z) : null;
  if (!move) {
    const hoop = attackHoop(match, carrier.team);
    const to = norm(hoop.x - carrier.x, hoop.z - carrier.z);
    const side = match.rng() < 0.5 ? 1 : -1;
    move = norm(to.x - to.z * side * 0.9, to.z + to.x * side * 0.9);
  }
  carrier.burst = { x: move.x, z: move.z, t: 0.38 };
  carrier.anim.cross = 1;
  emit(match, "crossover", { id: carrier.id });
  if (defender && d < 1.8) {
    const beat = 0.22 + 0.45 * carrier.attr.handle - 0.32 * defender.attr.defense;
    const roll = match.rng();
    if (roll < beat * 0.16) { defender.stun = 1.1; defender.state = "fall"; emit(match, "ankle", { id: defender.id, by: carrier.id }); }
    else if (roll < beat) defender.stun = Math.max(defender.stun, 0.55);
    else if (roll > 0.97 - defender.attr.steal * 0.05) attemptSteal(match, defender);
  }
  return true;
};

/** Nhảy (chắn bóng, tranh bóng bật bảng). */
export const jump = (match, player) => {
  if (player.y > 0.02 || player.cool > 0.4 || player.act) return false;
  player.vy = 2.7 + 1.5 * Math.max(player.attr.block, player.attr.rebound);
  player.y = 0.01;
  player.anim.jump = 1;
  return true;
};

/** Gọi đồng đội cao to ra chắn (pick & roll). */
export const callScreen = (match, carrier) => {
  if (match.ball.owner !== carrier.id || (match.screen && match.time - match.screen.t < 2.5)) return false;
  const defender = match.players.find((p) => p.team !== carrier.team && match.guard[p.id] === carrier.id) || nearestOpponent(match, carrier).player;
  if (!defender) return false;
  const bigs = match.players.filter((p) => p.team === carrier.team && p.id !== carrier.id).sort((a, b) => (dist(a, carrier) - a.slot * 0.8) - (dist(b, carrier) - b.slot * 0.8));
  const screener = bigs[0];
  if (!screener) return false;
  match.screen = { by: screener.id, defender: defender.id, carrier: carrier.id, t: match.time, set: false };
  emit(match, "screen", { id: screener.id });
  return true;
};

/** Kèm đôi người cầm bóng (đồng đội gần nhất bỏ người của mình). */
export const callDouble = (match, team) => {
  const carrier = holder(match);
  if (!carrier || carrier.team === team) return false;
  const guard = match.players.find((p) => p.team === team && match.guard[p.id] === carrier.id);
  const helper = match.players
    .filter((p) => p.team === team && p !== guard)
    .sort((a, b) => dist(a, carrier) - dist(b, carrier))[0];
  if (!helper) return false;
  match.double = { team, by: helper.id, until: match.time + 3 };
  emit(match, "double", { id: helper.id });
  return true;
};
