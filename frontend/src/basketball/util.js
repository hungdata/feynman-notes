/** Hàm toán và hình học sân dùng chung cho mô phỏng, AI và đồ hoạ bóng rổ. */
import { COURT } from "./constants.js";

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (x, z) => {
  const l = Math.hypot(x, z);
  return l > 1e-9 ? { x: x / l, z: z / l, l } : { x: 0, z: 0, l: 0 };
};
export const headingOf = (x, z) => Math.atan2(x, z);
export const facing = (heading) => ({ x: Math.sin(heading), z: Math.cos(heading) });
export const wrapAngle = (angle) => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Khoảng cách từ điểm p tới đoạn a→b, cùng vị trí u (0..1) của điểm gần nhất trên đoạn. */
export const segmentPoint = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const u = l2 > 1e-9 ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l2, 0, 1) : 0;
  const x = a.x + dx * u;
  const z = a.z + dz * u;
  return { u, x, z, d: Math.hypot(p.x - x, p.z - z) };
};

/** Bộ sinh số ngẫu nhiên có hạt giống: cùng hạt giống thì trận lặp lại y hệt. */
export const seededRandom = (seed = 1) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
export const gaussian = (random) => {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Rổ mà đội `team` đang tấn công (dir = +1: rổ bên phải, x dương). */
export const attackHoop = (match, team) => ({ x: COURT.hoopX * match.teams[team].dir, y: COURT.rimY, z: 0 });
export const defendHoop = (match, team) => attackHoop(match, 1 - team);
export const hoopDistance = (match, team, point) => dist(point, attackHoop(match, team));

/** Ném từ điểm này (về rổ ở hoopX) có được 3 điểm không. */
export const isThree = (point, hoopX) => {
  const fromBaseline = COURT.halfL - Math.abs(point.x);
  const sameSide = Math.sign(point.x) === Math.sign(hoopX) || Math.abs(point.x) < 1e-6;
  if (!sameSide) return true;
  // Ở góc: đoạn thẳng cách biên dọc 0.9 m, kéo tới chỗ gặp cung tròn.
  if (Math.abs(point.z) >= COURT.cornerZ && fromBaseline <= COURT.halfL - COURT.hoopX + Math.sqrt(COURT.three ** 2 - COURT.cornerZ ** 2)) return true;
  return Math.hypot(point.x - hoopX, point.z) > COURT.three;
};

export const insideCourt = (point, margin = 0) => Math.abs(point.x) <= COURT.halfL + margin && Math.abs(point.z) <= COURT.halfW + margin;

export const teamPlayers = (match, team) => match.players.filter((p) => p.team === team);
export const holder = (match) => (match.ball.owner === null ? null : match.players[match.ball.owner]);
export const humanOf = (match, team) => (team === 0 || team === 1 ? match.humans?.[team] || null : null);
export const isUser = (match, player) => {
  const human = humanOf(match, player.team);
  return Boolean(human && !human.auto && human.controlledId === player.id);
};
/** Cầu thủ đối phương gần một điểm nhất (mặc định: gần cầu thủ đó). */
export const nearestOpponent = (match, player, point = player) => {
  let best = null;
  let bestD = Infinity;
  for (const other of match.players) {
    if (other.team === player.team) continue;
    const d = dist(other, point);
    if (d < bestD) { bestD = d; best = other; }
  }
  return { player: best, d: bestD };
};
/** Thời gian (s) để chạy tới một điểm. */
export const timeTo = (player, point) => dist(player, point) / Math.max(3, player.topSpeed || 6.5);
