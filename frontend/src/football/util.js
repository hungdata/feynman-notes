/** Hàm toán và truy vấn trận đấu dùng chung cho luật, AI và thao tác. */
import { FIELD } from "./constants.js";

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const len = (x, z) => Math.hypot(x, z);
export const norm = (x, z) => {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? { x: x / l, z: z / l } : { x: 0, z: 0 };
};
export const headingOf = (x, z) => Math.atan2(x, z);
export const facing = (heading) => ({ x: Math.sin(heading), z: Math.cos(heading) });
export const wrapAngle = (angle) => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const angleBetween = (ax, az, bx, bz) => {
  const la = Math.hypot(ax, az);
  const lb = Math.hypot(bx, bz);
  if (la < 1e-9 || lb < 1e-9) return 0;
  return Math.acos(clamp((ax * bx + az * bz) / (la * lb), -1, 1));
};

/** Khoảng cách từ điểm p đến đoạn thẳng a→b, kèm vị trí t (0..1) của điểm gần nhất. */
export const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1) : 0;
  return { d: Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)), t };
};

/** Bộ sinh số ngẫu nhiên có hạt giống, để test và để trận đấu lặp lại được. */
export const seededRandom = (seed = 1) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};
export const gaussian = (random) => {
  const u = Math.max(1e-9, random());
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
};

/* ---------- truy vấn ---------- */

export const dirOf = (match, team) => match.teams[team].dir;
/** Khung thành đội `team` đang tấn công. */
export const attackGoal = (match, team) => ({ x: FIELD.halfL * dirOf(match, team), z: 0 });
/** Khung thành đội `team` đang bảo vệ. */
export const ownGoal = (match, team) => ({ x: -FIELD.halfL * dirOf(match, team), z: 0 });
/** Toạ độ x quy về hướng tấn công của đội (dương là đang ở phần sân đối phương). */
export const forward = (match, team, x) => x * dirOf(match, team);
export const teamOf = (match, team) => match.players.filter((p) => p.team === team && !p.sentOff);
export const keeperOf = (match, team) => match.players.find((p) => p.team === team && p.role === "GK" && !p.sentOff);
export const owner = (match) => (match.ball.owner === null ? null : match.players[match.ball.owner]);
export const possessionTeam = (match) => {
  const holder = owner(match);
  if (holder) return holder.team;
  if (match.setPiece) return match.setPiece.team;
  return null;
};
/** Người chơi điều khiển đội `team` (null nếu đội đó do máy đá). Chế độ online có hai người. */
export const humanOf = (match, team) => (team === 0 || team === 1 ? match.humans?.[team] || null : null);
export const isUser = (match, player) => {
  if (!player) return false;
  const human = humanOf(match, player.team);
  return Boolean(human) && human.controlledId === player.id;
};

/** Vạch việt vị của đội `attacking`: hậu vệ áp chót của đối phương (hoặc bóng, hoặc giữa sân). */
export const offsideLine = (match, attacking) => {
  const defenders = teamOf(match, 1 - attacking).map((p) => forward(match, attacking, p.x)).sort((a, b) => b - a);
  const secondLast = defenders[1] ?? FIELD.halfL;
  return Math.max(0, secondLast, forward(match, attacking, match.ball.x));
};

export const inPenaltyBox = (match, team, point) => {
  const goal = ownGoal(match, team);
  return Math.abs(point.x - goal.x) <= FIELD.boxDepth && Math.abs(point.z) <= FIELD.boxHalf;
};

/** Thời gian (giây) để cầu thủ chạy tới điểm, ước lượng thô cho AI. */
export const timeTo = (player, point) => dist(player, point) / Math.max(4, player.topSpeed || 7);

/** Đối thủ gần nhất của cầu thủ. */
export const nearestOpponent = (match, player, point = player) => {
  let best = null;
  let bestD = Infinity;
  for (const other of match.players) {
    if (other.team === player.team || other.sentOff) continue;
    const d = dist(other, point);
    if (d < bestD) { bestD = d; best = other; }
  }
  return { player: best, d: bestD };
};

/** Mức “thoáng” của đường chuyền: khoảng cách nhỏ nhất từ đối thủ tới đường bóng (mét). */
export const laneOpenness = (match, from, to, team) => {
  let worst = 30;
  for (const other of match.players) {
    if (other.team === team || other.sentOff) continue;
    const { d, t } = segmentDistance(other, from, to);
    // Đối thủ đứng gần người nhận nguy hiểm hơn: họ có thêm thời gian chạy tới.
    const reach = d - t * dist(from, to) * 0.12;
    if (reach < worst) worst = reach;
  }
  return worst;
};
