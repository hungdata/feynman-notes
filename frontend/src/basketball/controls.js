/**
 * Bàn phím, tay cầm và nút cảm ứng → thao tác trong trận bóng rổ.
 * Bố cục phím theo kiểu FIFA Online 4 (S chuyền/đổi người, D ném/bám người, A bổng/cướp, W, Q, C, E tăng tốc),
 * cùng một phím làm việc khác nhau tuỳ ngữ cảnh:
 *
 * CÓ BÓNG
 *   ←↑↓→ rê bóng · E (hoặc Shift) chạy nhanh
 *   D ném rổ: giữ D để bật lên, thả D đúng lúc tay lên cao nhất (vạch xanh trên thanh ném) · gần rổ: lên rổ / úp rổ
 *   S chuyền (theo hướng mũi tên, không bấm hướng thì chuyền người trống nhất) · W chuyền đập đất · A chuyền bổng / alley-oop
 *   C đảo bóng qua người (theo hướng) · Q gọi đồng đội ra chắn (pick & roll)
 * PHÒNG NGỰ
 *   S đổi người (S + hướng: đổi sang người ở hướng đó) · giữ D bám sát người mình kèm · A cướp bóng
 *   W nhảy chắn bóng · Q gọi đồng đội kèm đôi · E chạy nhanh
 * BÓNG BẬT BẢNG / BÓNG TỰ DO: W nhảy tranh bóng · S đổi người
 * PHÁT BÓNG BIÊN: ←↑↓→ chọn hướng · S chuyền · A chuyền bổng · W đập đất
 * NÉM PHẠT: giữ D rồi thả đúng lúc
 * CHUNG: Esc / P tạm dừng · Backspace ẩn/hiện vòng dưới chân
 */
import { IDEAL_RELEASE, LATE_RELEASE, releaseQuality } from "./actions.js";
import { act as simAct, userContext } from "./sim.js";

const MOVES = new Set(["up", "down", "left", "right"]);
const KEY_NAMES = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Shift: "Shift", " ": "Space", Backspace: "Backspace" };
const LETTERS = new Set(["S", "A", "W", "D", "Q", "E", "C"]);

/** Tên nút ảo từ phím bấm. Dùng event.code cho chữ cái để bộ gõ tiếng Việt (Unikey) không làm sai phím. */
export const keyName = (event) => {
  if (event.code?.startsWith("Key")) {
    const letter = event.code.slice(3);
    if (LETTERS.has(letter)) return letter;
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") return "Shift";
  const named = KEY_NAMES[event.key];
  if (named) return named;
  const upper = typeof event.key === "string" ? event.key.toUpperCase() : "";
  return LETTERS.has(upper) ? upper : null;
};

const ATTACK = new Set(["ball", "inbound"]);
const DEFENSE_SWITCH = new Set(["defense", "loose", "rebound", "wait"]);

/** `act` mặc định chạy thẳng vào trận trên máy này; chế độ online truyền hàm gửi lệnh lên máy chủ. */
export const createController = ({ act = simAct } = {}) => {
  const held = new Set();
  const stick = { x: 0, y: 0 };
  let basis = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
  let shot = null;
  let feedback = null;

  /** Hướng phím đang giữ, đổi sang toạ độ sân theo góc camera. */
  const aimNow = () => {
    let sx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0) + stick.x;
    let sy = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0) + stick.y;
    const l = Math.hypot(sx, sy);
    if (l > 1) { sx /= l; sy /= l; }
    return { x: basis.right.x * sx + basis.up.x * sy, z: basis.right.z * sx + basis.up.z * sy };
  };
  const direction = () => {
    const aim = aimNow();
    return Math.hypot(aim.x, aim.z) > 0.2 ? { x: Math.round(aim.x * 100) / 100, z: Math.round(aim.z * 100) / 100 } : null;
  };

  const press = (match, key, now = performance.now()) => {
    if (!match) return;
    if (MOVES.has(key)) { held.add(key); return; }
    if (held.has(key)) return;
    held.add(key);
    const context = userContext(match);
    const dir = direction();
    switch (key) {
      case "D":
        if (context === "ball" || context === "ft") {
          if (act(match, "shoot", {}) !== false) shot = { start: now, ft: context === "ft" };
        }
        break;
      case "S":
        if (ATTACK.has(context)) act(match, "pass", { dir });
        else if (DEFENSE_SWITCH.has(context)) act(match, "switch", { dir });
        break;
      case "W":
        if (ATTACK.has(context)) act(match, "bounce", { dir });
        else act(match, "jump", {});
        break;
      case "A":
        if (ATTACK.has(context)) act(match, "lob", { dir });
        else if (context === "defense") act(match, "steal", {});
        break;
      case "C":
        if (context === "ball") act(match, "crossover", { dir });
        break;
      case "Q":
        if (context === "ball") act(match, "screen", {});
        else if (context === "defense") act(match, "double", {});
        break;
      default: break;
    }
  };

  const release = (match, key, now = performance.now()) => {
    held.delete(key);
    if (key === "D" && shot && match) {
      const hold = Math.max(0, (now - shot.start) / 1000);
      act(match, "shootRelease", { hold: Math.round(hold * 1000) / 1000 });
      feedback = { quality: releaseQuality(hold, match.user.assist), early: hold < IDEAL_RELEASE, at: now };
      shot = null;
    }
  };

  const update = (match, nextBasis, now = performance.now()) => {
    if (!match) return { meter: null, context: "idle", feedback: null };
    if (nextBasis) basis = nextBasis;
    const context = userContext(match);
    const aim = aimNow();
    const input = match.user.input;
    input.mx = aim.x;
    input.mz = aim.z;
    input.sprint = held.has("E") || held.has("Shift");
    input.guard = context === "defense" && held.has("D");
    // Giữ quá lâu: máy tự nhả bóng (muộn), thanh ném biến mất.
    if (shot && (now - shot.start) / 1000 > LATE_RELEASE + 0.15) {
      feedback = { quality: releaseQuality(LATE_RELEASE, match.user.assist), early: false, at: now };
      shot = null;
    }
    if (shot && context !== "ball" && context !== "ft" && !shot.ft && (now - shot.start) / 1000 > 0.05 && !match.players[match.user.controlledId]?.act) shot = null;
    if (feedback && now - feedback.at > 1100) feedback = null;
    return { meter: shot ? { hold: (now - shot.start) / 1000 } : null, context, feedback };
  };

  const setStick = (x, y) => { stick.x = x; stick.y = y; };
  const reset = () => { held.clear(); stick.x = 0; stick.y = 0; shot = null; };
  return { press, release, update, setStick, reset, isHeld: (key) => held.has(key) };
};

/** Tay cầm (bố cục chuẩn): A chuyền/đổi người, B bổng/cướp, X ném/bám người, Y đập đất/nhảy, LB gọi chắn/kèm đôi, RB đảo bóng, RT chạy. */
export const padKey = (index) => {
  switch (index) {
    case 0: return "S";
    case 1: return "A";
    case 2: return "D";
    case 3: return "W";
    case 4: return "Q";
    case 5: return "C";
    case 6: case 7: return "E";
    case 12: return "up";
    case 13: return "down";
    case 14: return "left";
    case 15: return "right";
    default: return null;
  }
};

/** Nút cảm ứng theo ngữ cảnh: [phím, nhãn]. */
export const touchButtons = (context) => {
  switch (context) {
    case "ball": return [["D", "Ném"], ["S", "Chuyền"], ["A", "Bổng"], ["W", "Đập đất"], ["C", "Đảo bóng"], ["Q", "Gọi chắn"], ["E", "Chạy"]];
    case "defense": return [["S", "Đổi người"], ["D", "Bám người"], ["A", "Cướp"], ["W", "Nhảy chắn"], ["Q", "Kèm đôi"], ["E", "Chạy"]];
    case "loose": case "rebound": return [["W", "Nhảy"], ["S", "Đổi người"], ["E", "Chạy"]];
    case "support": return [["W", "Nhảy"], ["E", "Chạy"]];
    case "inbound": return [["S", "Chuyền"], ["A", "Bổng"], ["W", "Đập đất"]];
    case "ft": return [["D", "Ném phạt"]];
    default: return [];
  }
};

export const HINTS = {
  ball: "D giữ rồi thả để ném · S chuyền · A chuyền bổng · C đảo bóng · Q gọi chắn",
  defense: "S đổi người · giữ D bám người · A cướp bóng · W nhảy chắn · Q kèm đôi",
  loose: "Lao vào bóng! W nhảy tranh bóng · S đổi người",
  rebound: "Tranh bóng bật bảng: W nhảy · S đổi người",
  support: "Đón bóng…",
  inbound: "Phát bóng biên: mũi tên chọn hướng, S chuyền, A chuyền bổng",
  ft: "Ném phạt: giữ D rồi thả khi thanh tới vạch xanh",
  wait: "",
  idle: "",
};
