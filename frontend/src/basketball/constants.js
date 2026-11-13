/**
 * Sân, luật và đội cho trận bóng rổ 5 người.
 * Đơn vị là mét. Trục x chạy dọc sân (−14 → 14), z chạy ngang sân (−7.5 → 7.5), y hướng lên.
 * Kích thước theo luật FIBA. Dữ liệu thuần, không dùng three.js, để test được bằng node --test.
 */

export const COURT = Object.freeze({
  length: 28,
  width: 15,
  halfL: 14,
  halfW: 7.5,
  hoopX: 12.425,      // tâm vòng rổ cách đường biên ngang 1.575 m
  rimY: 3.05,
  rimR: 0.225,
  boardX: 12.8,       // mặt bảng rổ cách đường biên ngang 1.2 m
  boardHalf: 0.9,
  boardBottom: 2.9,
  boardTop: 3.95,
  three: 6.75,        // cung 3 điểm tính từ tâm rổ
  cornerZ: 6.6,       // đoạn thẳng của vạch 3 điểm ở hai góc
  keyHalf: 2.45,      // khu vực 3 giây rộng 4.9 m
  keyDepth: 5.8,      // vạch ném phạt cách biên ngang 5.8 m
  circle: 1.8,
  restricted: 1.25,
  ballR: 0.12,
});

export const PHYS = Object.freeze({
  gravity: 9.81,
  dt: 1 / 60,
  bounce: 0.68,       // bóng nảy trên sàn gỗ
  grip: 0.86,         // mất tốc độ ngang mỗi lần nảy
  roll: 1.6,          // hãm lăn trên sàn
});

export const RULES = Object.freeze({
  shotClock: 24,
  offensiveReset: 14, // bóng chạm vành, đội tấn công bắt bật bảng: còn 14 giây
  bonusFouls: 4,      // từ lỗi đồng đội thứ 5 trong hiệp: bị phạt 2 quả
  inboundSeconds: 5,
  quarterBreak: 4,
  halftimeBreak: 10,
});

export const QUARTER_OPTIONS = [2, 3, 5];
export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
export const POSITION_NAMES = { PG: "Hậu vệ dẫn bóng", SG: "Hậu vệ ghi điểm", SF: "Tiền phong phụ", PF: "Tiền phong chính", C: "Trung phong" };

export const KITS = Object.freeze({
  orange: { name: "Cam", shirt: "#f26b1d", trim: "#ffffff", number: "#ffffff", shorts: "#d9550f" },
  blue: { name: "Xanh dương", shirt: "#1f5fd1", trim: "#ffd23f", number: "#ffffff", shorts: "#1a4fb0" },
  white: { name: "Trắng", shirt: "#f4f5f7", trim: "#1f5fd1", number: "#1c2440", shorts: "#e6e8ee" },
  black: { name: "Đen", shirt: "#1d2027", trim: "#f2c94c", number: "#f2c94c", shorts: "#15171c" },
  green: { name: "Xanh lá", shirt: "#178a4c", trim: "#ffffff", number: "#ffffff", shorts: "#11703c" },
  purple: { name: "Tím", shirt: "#6b3fd4", trim: "#ffd23f", number: "#ffffff", shorts: "#5732b3" },
});

export const DIFFICULTIES = Object.freeze({
  easy: { name: "Dễ", ovr: 64, react: 0.42, iq: 0.35 },
  normal: { name: "Vừa", ovr: 74, react: 0.28, iq: 0.65 },
  hard: { name: "Khó", ovr: 84, react: 0.16, iq: 0.92 },
});

/** Chiều cao (m) và cộng/trừ chỉ số theo vị trí. Chỉ số: 0..99. */
const SHAPE = {
  PG: { height: 1.86, speed: 9, three: 4, mid: 3, inside: 0, dunk: -26, pass: 11, handle: 11, defense: 0, steal: 7, block: -22, rebound: -18, ft: 6 },
  SG: { height: 1.95, speed: 6, three: 8, mid: 6, inside: 2, dunk: -10, pass: 2, handle: 5, defense: 1, steal: 4, block: -14, rebound: -12, ft: 7 },
  SF: { height: 2.01, speed: 3, three: 2, mid: 3, inside: 4, dunk: 3, pass: 0, handle: 0, defense: 3, steal: 1, block: -5, rebound: -3, ft: 2 },
  PF: { height: 2.06, speed: -3, three: -8, mid: 0, inside: 6, dunk: 7, pass: -4, handle: -8, defense: 4, steal: -6, block: 6, rebound: 7, ft: -4 },
  C: { height: 2.12, speed: -7, three: -24, mid: -8, inside: 8, dunk: 11, pass: -6, handle: -16, defense: 5, steal: -10, block: 13, rebound: 13, ft: -10 },
};
const ATTRS = ["speed", "three", "mid", "inside", "dunk", "pass", "handle", "defense", "steal", "block", "rebound", "ft"];

/** Tên cầu thủ đều là tên tự đặt. */
export const TEAM_PRESETS = Object.freeze({
  home: { name: "Feynman Owls", short: "OWL", names: ["Khoa", "Huy", "Đức", "Bảo", "Long"] },
  away: { name: "Newton Comets", short: "NEW", names: ["Kiệt", "Nam", "Lâm", "Nhân", "Hải"] },
});

const NUMBERS = [3, 7, 11, 23, 34];

/** Năm cầu thủ của một đội. `random` phải là hàm của trận (để mô phỏng lặp lại được). */
export const buildRoster = ({ team, ovr = 74, names = TEAM_PRESETS.home.names, random = Math.random }) => POSITIONS.map((pos, slot) => {
  const shape = SHAPE[pos];
  const attr = {};
  for (const key of ATTRS) {
    const value = ovr + shape[key] + Math.round((random() - 0.5) * 8);
    attr[key] = Math.max(25, Math.min(99, value)) / 100;
  }
  return {
    team,
    slot,
    pos,
    name: names[slot] || `Số ${NUMBERS[slot]}`,
    number: NUMBERS[slot] + (team ? 10 : 0),
    height: Math.round((shape.height + (random() - 0.5) * 0.06) * 100) / 100,
    attr,
  };
});
