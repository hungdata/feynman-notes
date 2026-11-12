/**
 * Kích thước sân, đội hình và đội bóng cho trận 11 người kiểu FIFA Online 4.
 * Đơn vị là mét. Trục x chạy dọc sân (−52.5 → 52.5), z chạy ngang sân (−34 → 34), y hướng lên.
 * Dữ liệu thuần, không dùng three.js, để test được bằng node --test.
 */

export const FIELD = Object.freeze({
  length: 105,
  width: 68,
  halfL: 52.5,
  halfW: 34,
  goalHalf: 3.66,
  goalHeight: 2.44,
  goalDepth: 2.2,
  boxDepth: 16.5,
  boxHalf: 20.16,
  sixDepth: 5.5,
  sixHalf: 9.16,
  penaltySpot: 11,
  circle: 9.15,
  ballRadius: 0.11,
  postRadius: 0.06,
});

export const PHYSICS = Object.freeze({
  gravity: 9.81,
  rolling: 2.8,     // m/s² hãm lăn trên cỏ
  airDrag: 0.007,   // lực cản không khí (bậc hai)
  bounce: 0.5,
  bounceGrip: 0.82,
  dt: 1 / 60,
});

/** Mỗi ô: [vai trò, độ sâu 0..1 tính từ khung thành nhà, độ rộng −1 (cánh trái) .. 1 (cánh phải)]. */
export const FORMATIONS = Object.freeze({
  "4-3-3": [["GK", 0, 0], ["LB", 0.24, -0.78], ["CB", 0.19, -0.27], ["CB", 0.19, 0.27], ["RB", 0.24, 0.78], ["CDM", 0.37, 0], ["CM", 0.48, -0.38], ["CM", 0.48, 0.38], ["LW", 0.7, -0.78], ["ST", 0.76, 0], ["RW", 0.7, 0.78]],
  "4-2-3-1": [["GK", 0, 0], ["LB", 0.24, -0.78], ["CB", 0.19, -0.27], ["CB", 0.19, 0.27], ["RB", 0.24, 0.78], ["CDM", 0.37, -0.22], ["CDM", 0.37, 0.22], ["LM", 0.6, -0.72], ["CAM", 0.6, 0], ["RM", 0.6, 0.72], ["ST", 0.77, 0]],
  "4-4-2": [["GK", 0, 0], ["LB", 0.24, -0.78], ["CB", 0.19, -0.27], ["CB", 0.19, 0.27], ["RB", 0.24, 0.78], ["LM", 0.5, -0.78], ["CM", 0.45, -0.24], ["CM", 0.45, 0.24], ["RM", 0.5, 0.78], ["ST", 0.73, -0.2], ["ST", 0.73, 0.2]],
  "3-5-2": [["GK", 0, 0], ["CB", 0.2, -0.45], ["CB", 0.18, 0], ["CB", 0.2, 0.45], ["LM", 0.48, -0.85], ["CDM", 0.38, 0], ["CM", 0.5, -0.32], ["CM", 0.5, 0.32], ["RM", 0.48, 0.85], ["ST", 0.74, -0.2], ["ST", 0.74, 0.2]],
});

/** Trọng số chỉ số theo vị trí: [tốc độ, sút, chuyền, rê, phòng ngự, thể lực, thủ môn]. */
const ROLE_SHAPE = {
  GK: [-12, -40, -10, -30, -30, 0, 8],
  CB: [-4, -22, -6, -12, 8, 6, -60],
  LB: [4, -16, -2, -2, 2, 2, -60],
  RB: [4, -16, -2, -2, 2, 2, -60],
  CDM: [-2, -8, 2, -2, 5, 6, -60],
  CM: [0, -2, 6, 3, -2, 2, -60],
  LM: [5, -2, 3, 5, -10, 0, -60],
  RM: [5, -2, 3, 5, -10, 0, -60],
  CAM: [2, 3, 6, 7, -18, -4, -60],
  LW: [7, 2, 0, 7, -24, -4, -60],
  RW: [7, 2, 0, 7, -24, -4, -60],
  ST: [5, 8, -4, 4, -28, 4, -60],
};

export const ROLE_NAMES = { GK: "Thủ môn", CB: "Trung vệ", LB: "Hậu vệ trái", RB: "Hậu vệ phải", CDM: "Tiền vệ phòng ngự", CM: "Tiền vệ trung tâm", LM: "Tiền vệ trái", RM: "Tiền vệ phải", CAM: "Tiền vệ tấn công", LW: "Tiền đạo cánh trái", RW: "Tiền đạo cánh phải", ST: "Tiền đạo cắm" };

/** Tên cầu thủ đều là tên tự đặt. */
const HOME_NAMES = ["Minh Khoa", "Gia Bảo", "Đức Anh", "Quang Huy", "Tuấn Kiệt", "Hoàng Nam", "Thành Đạt", "Bảo Long", "Văn Phúc", "Hải Đăng", "Nhật Minh", "Trọng Nhân", "Khánh Duy", "Anh Quân", "Hữu Tài", "Phúc Hưng"];
const AWAY_NAMES = ["Isaac", "Galileo", "Kepler", "Euler", "Gauss", "Pascal", "Leibniz", "Fermat", "Laplace", "Bernoulli", "Hooke", "Huygens", "Boyle", "Halley", "Faraday", "Ampère"];
const NUMBERS = [1, 3, 4, 5, 2, 6, 8, 10, 11, 9, 7];

export const KITS = Object.freeze({
  red: { name: "Đỏ", shirt: "#d7263d", shorts: "#ffffff", socks: "#d7263d", number: "#ffffff", gk: "#1fb36b" },
  blue: { name: "Xanh dương", shirt: "#1f5fd1", shorts: "#0d1f4d", socks: "#1f5fd1", number: "#ffffff", gk: "#f4c430" },
  white: { name: "Trắng", shirt: "#f4f5f7", shorts: "#1c1f2b", socks: "#f4f5f7", number: "#1c1f2b", gk: "#ff7a1a" },
  yellow: { name: "Vàng", shirt: "#ffcc1f", shorts: "#14355e", socks: "#ffcc1f", number: "#14355e", gk: "#7c3aed" },
  black: { name: "Đen", shirt: "#20232c", shorts: "#20232c", socks: "#20232c", number: "#ffd23f", gk: "#22c55e" },
});

export const DIFFICULTIES = Object.freeze({
  easy: { name: "Nghiệp dư", ovr: 68, think: 0.75, noise: 0.35, reaction: 0.34, press: 0.75, tackle: 0.6 },
  normal: { name: "Chuyên nghiệp", ovr: 77, think: 0.5, noise: 0.18, reaction: 0.24, press: 1, tackle: 1 },
  hard: { name: "Huyền thoại", ovr: 86, think: 0.32, noise: 0.07, reaction: 0.16, press: 1.2, tackle: 1.35 },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Tạo một đội 11 người với chỉ số theo vị trí, quanh chỉ số tổng `ovr`. */
export const buildSquad = ({ team, formation, ovr, names, random }) => FORMATIONS[formation].map(([role, depth, width], index) => {
  const shape = ROLE_SHAPE[role];
  const roll = () => (random() - 0.5) * 8;
  const stat = (i) => clamp(Math.round(ovr + shape[i] + roll()), 25, 99);
  return {
    id: team * 11 + index,
    team,
    index,
    role,
    slot: { depth, width },
    number: NUMBERS[index],
    name: names[index % names.length],
    attrs: { pace: stat(0), shoot: stat(1), pass: stat(2), dribble: stat(3), defend: stat(4), physical: stat(5), keeper: role === "GK" ? clamp(Math.round(ovr + 6 + roll()), 40, 99) : 30 },
  };
});

export const TEAM_PRESETS = Object.freeze({
  home: { name: "Feynman FC", short: "FEY", names: HOME_NAMES },
  away: { name: "Học viện Newton", short: "NEW", names: AWAY_NAMES },
});
