/**
 * Bàn phím, tay cầm và nút cảm ứng → thao tác trong trận, theo bố cục phím mặc định của FIFA Online 4.
 *
 * Tấn công: ←↑↓→ chạy · S chuyền ngắn · W chọc khe · A chuyền bổng/tạt · D sút (giữ để lấy lực)
 *           E tăng tốc · C che bóng · Z+D sút xoáy · Q+D bấm bóng · D D sút sệt · Q+W chọc khe bổng · Z giật bóng
 * Phòng ngự: Q đổi người · giữ D áp sát · giữ A gọi đồng đội áp sát · Space tắc bóng · S xoạc · W thủ môn lao ra
 */
import { act, userAttacking } from "./sim.js";

export const CHARGE_MS = 900;
const DOUBLE_TAP_MS = 150;
const KEY_NAMES = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  s: "S", S: "S", a: "A", A: "A", w: "W", W: "W", d: "D", D: "D", q: "Q", Q: "Q", z: "Z", Z: "Z", e: "E", E: "E", c: "C", C: "C",
  " ": "Space", Shift: "E",
};

/** Tên nút ảo từ phím bấm (theo event.key, không phụ thuộc bộ gõ tiếng Việt nếu đã tắt). */
export const keyName = (event) => KEY_NAMES[event.key] || (event.code === "Space" ? "Space" : event.code?.startsWith("Key") ? KEY_NAMES[event.code.slice(3)] : null);

export const createController = () => {
  const held = new Set();
  let charge = null;
  let pendingShot = null;
  let zDown = null;
  const stick = { x: 0, y: 0 };
  let lastAim = { x: 0, z: 0 };

  const aimOf = (match) => ({ x: match.input.mx, z: match.input.mz });

  const shotKind = (q, z) => (z ? "finesse" : q ? "chip" : "shoot");

  const press = (match, key, now = performance.now()) => {
    if (!match || held.has(key)) return;
    held.add(key);
    const attacking = userAttacking(match);
    if (attacking) {
      if (key === "Z") zDown = { t: now, usedD: false };
      if (["S", "A", "W", "D"].includes(key)) {
        if (key === "D" && pendingShot && !pendingShot.low && now - pendingShot.releasedAt < DOUBLE_TAP_MS + 60) {
          pendingShot.low = true;
          return;
        }
        if (key === "D" && zDown) zDown.usedD = true;
        if (!charge) charge = { key, start: now, q: held.has("Q"), z: held.has("Z") };
      }
      return;
    }
    if (key === "Q") act(match, "switch");
    else if (key === "Space") act(match, "tackle");
    else if (key === "S") act(match, "slide", { aim: aimOf(match) });
    else if (key === "W") act(match, "gkRush");
  };

  const release = (match, key, now = performance.now()) => {
    if (!held.has(key)) return;
    held.delete(key);
    if (!match) return;
    if (charge && charge.key === key) {
      const power = Math.min(1, Math.max(0.05, (now - charge.start) / CHARGE_MS));
      const q = charge.q || held.has("Q");
      const z = charge.z || held.has("Z");
      charge = null;
      if (userAttacking(match)) {
        if (key === "D") pendingShot = { power, kind: shotKind(q, z), fireAt: now + DOUBLE_TAP_MS, releasedAt: now, low: false };
        else {
          const action = key === "S" ? "short" : key === "A" ? "lob" : q ? "lobThrough" : "through";
          act(match, action, { power, aim: aimOf(match) });
        }
      }
      return;
    }
    if (key === "D" && pendingShot?.low) {
      act(match, "low", { power: pendingShot.power, aim: aimOf(match) });
      pendingShot = null;
      return;
    }
    if (key === "Z" && zDown) {
      const quick = now - zDown.t < 400 && !zDown.usedD;
      zDown = null;
      const me = match.players[match.user.controlledId];
      if (quick && me && match.ball.owner === me.id && !match.setPiece) act(match, "knock", { aim: lastAim });
    }
  };

  /** Gọi mỗi khung hình: đổi phím hướng thành hướng chạy trên sân theo góc camera. */
  const update = (match, basis, now = performance.now()) => {
    if (!match) return { charge: null };
    let sx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0) + stick.x;
    let sy = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0) + stick.y;
    const l = Math.hypot(sx, sy);
    if (l > 1) { sx /= l; sy /= l; }
    const mx = basis.right.x * sx + basis.up.x * sy;
    const mz = basis.right.z * sx + basis.up.z * sy;
    match.input.mx = mx;
    match.input.mz = mz;
    if (Math.hypot(mx, mz) > 0.2) lastAim = { x: mx, z: mz };
    const attacking = userAttacking(match);
    match.input.sprint = held.has("E");
    match.input.shield = attacking && held.has("C");
    match.input.contain = !attacking && held.has("D");
    match.input.callPress = !attacking && held.has("A");
    if (pendingShot && !pendingShot.low && now >= pendingShot.fireAt) {
      const shot = pendingShot;
      pendingShot = null;
      if (userAttacking(match)) act(match, shot.kind, { power: shot.power, aim: { x: mx, z: mz } });
    }
    if (charge && !attacking) charge = null;
    return { charge: charge ? { key: charge.key, power: Math.min(1, (now - charge.start) / CHARGE_MS) } : null };
  };

  const setStick = (x, y) => { stick.x = x; stick.y = y; };

  const reset = () => {
    held.clear();
    charge = null;
    pendingShot = null;
    zDown = null;
    stick.x = 0;
    stick.y = 0;
  };

  return { press, release, update, setStick, reset, isHeld: (key) => held.has(key) };
};

/* ---------- tay cầm (chuẩn Xbox) ---------- */

/** Nút tay cầm đổi theo tình huống, giống FIFA: A chuyền/áp sát, B bổng/tắc, X sút/xoạc, Y chọc khe/thủ môn ra. */
export const padKey = (index, attacking) => {
  switch (index) {
    case 0: return attacking ? "S" : "D";
    case 1: return attacking ? "A" : "Space";
    case 2: return attacking ? "D" : "S";
    case 3: return "W";
    case 4: return "Q";
    case 5: return attacking ? "Z" : "A";
    case 6: return "C";
    case 7: return "E";
    case 12: return "up";
    case 13: return "down";
    case 14: return "left";
    case 15: return "right";
    default: return null;
  }
};
