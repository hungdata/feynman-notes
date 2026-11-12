/**
 * Bàn phím, tay cầm và nút cảm ứng → thao tác trong trận, theo bố cục phím mặc định của FIFA Online 4 (FC Online).
 * Cùng một phím làm việc khác nhau tuỳ ngữ cảnh, đúng như FO4:
 *
 * CÓ BÓNG
 *   ←↑↓→ chạy · E tăng tốc · C che bóng · Q giữ bóng quan sát (dừng bóng)
 *   S chuyền ngắn · Z+S chuyền mạnh tầm thấp · C+S chuyền bất ngờ · Q+S rồi S bật tường
 *   A chuyền dài/tạt · Z+A chuyền bổng · A A tạt thấp · Q+A tạt nhanh
 *   W chọc khe · Q+W chọc khe bổng · Z+W bật tường
 *   D sút (giữ lấy lực) · D D sút sệt · Z+D sút xoáy (cứa lòng) · Q+D bấm bóng · C+D sút căng
 *   S+D+hướng giả sút · S+A+hướng giả chuyền · Ctrl+hướng đẩy bóng dài · Shift+hướng lách người · Z+hướng giật bóng
 * PHÒNG NGỰ
 *   S đổi cầu thủ · Shift+hướng đổi người theo hướng · giữ D áp sát · C kèm người (E+C kèm chặt, C+hướng tranh chấp)
 *   Space tắc bóng · giữ Space tì vai · A xoạc bóng · giữ Q gọi đồng đội áp sát · D hoặc S phá bóng (bóng bổng tới)
 *   E tăng tốc · Z dâng đội hình · W thủ môn lao ra
 * THỦ MÔN ÔM BÓNG: W thả bóng · S ném ngắn · giữ S ném xa · Z+S ném thấp · A/D phát dài
 * TÌNH HUỐNG CỐ ĐỊNH
 *   Phạt góc: A tạt mạnh · A A tạt vừa · A A A tạt sệt · S chuyền ngắn · C gọi người gần · ↑↓ chọn cột
 *   Ném biên: S/D ném gần · A ném xa · W ném nhanh
 *   Đá phạt: D sút (D+hướng xoáy theo mũi tên) · Q+D sút căng · Z+D sút sệt · C gọi người thứ 2, C+D người thứ 2 sút · E đổi người sút
 *   Phòng ngự đá phạt: W hàng rào nhảy · C/E dịch hàng rào · Z dâng hàng thủ
 *   Penalty: ←↑↓→ chỉnh hướng · D sút · Q+D bấm bóng · E đổi người sút · bắt penalty: D (hoặc Ctrl) + hướng để thủ môn bay
 * CHUNG: [ ] giảm/tăng nhịp độ tấn công · Backspace ẩn/hiện vòng dưới chân · Esc tạm dừng
 */
import { act, clearanceChance, userContext } from "./sim.js";

export const CHARGE_MS = 900;
const TAP_MS = 170;
const MOVES = new Set(["up", "down", "left", "right"]);
const ACTION_KEYS = new Set(["S", "A", "W", "D"]);

const KEY_NAMES = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Shift: "Shift", Control: "Ctrl", " ": "Space", "[": "[", "]": "]", Backspace: "Backspace",
};
const LETTERS = new Set(["S", "A", "W", "D", "Q", "Z", "E", "C"]);

/** Tên nút ảo từ phím bấm. Dùng event.code cho chữ cái để bộ gõ tiếng Việt (Unikey) không làm sai phím. */
export const keyName = (event) => {
  if (event.code?.startsWith("Key")) {
    const letter = event.code.slice(3);
    if (LETTERS.has(letter)) return letter;
  }
  if (event.code === "Space") return "Space";
  if (event.code === "BracketLeft") return "[";
  if (event.code === "BracketRight") return "]";
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") return "Shift";
  if (event.code === "ControlLeft" || event.code === "ControlRight") return "Ctrl";
  const named = KEY_NAMES[event.key];
  if (named) return named;
  const upper = typeof event.key === "string" ? event.key.toUpperCase() : "";
  return LETTERS.has(upper) ? upper : null;
};

const isAttack = (context) => context === "ball" || context === "support";

export const createController = ({ onUi = () => {} } = {}) => {
  const held = new Set();
  let charge = null;
  let tap = null;
  let zDown = null;
  let spaceAt = 0;
  const stick = { x: 0, y: 0 };
  let basis = { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
  let aim = { x: 0, z: 0 };

  /** Hướng phím đang giữ, đổi sang toạ độ sân theo camera. */
  const aimNow = () => {
    let sx = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0) + stick.x;
    let sy = (held.has("up") ? 1 : 0) - (held.has("down") ? 1 : 0) + stick.y;
    const l = Math.hypot(sx, sy);
    if (l > 1) { sx /= l; sy /= l; }
    return { x: basis.right.x * sx + basis.up.x * sy, z: basis.right.z * sx + basis.up.z * sy };
  };
  const hasDirection = () => Math.hypot(aimNow().x, aimNow().z) > 0.2;
  const mods = () => ({ q: held.has("Q"), z: held.has("Z"), c: held.has("C") });

  const fire = (match, action, options = {}) => act(match, action, { aim: aimNow(), ...options });

  /* ----- có bóng / chờ bóng tới ----- */
  const attackPress = (match, key, now) => {
    if (MOVES.has(key)) {
      if (held.has("Ctrl")) fire(match, "knock");
      else if (held.has("Shift")) fire(match, "sidestep");
      else if (held.has("Z") && !charge) { fire(match, "drag"); if (zDown) zDown.used = true; }
      return;
    }
    if (key === "Ctrl" && hasDirection()) { fire(match, "knock"); return; }
    if (key === "Shift" && hasDirection()) { fire(match, "sidestep"); return; }
    if (key === "Z") { zDown = { t: now, used: false }; return; }
    if (!ACTION_KEYS.has(key)) return;
    if (zDown) zDown.used = true;
    // Giả sút / giả chuyền: S kết hợp D hoặc A.
    if (charge && ((charge.key === "S" && (key === "D" || key === "A")) || ((charge.key === "D" || charge.key === "A") && key === "S"))) {
      const feint = key === "A" || charge.key === "A" ? "fakePass" : "fakeShot";
      charge = null;
      tap = null;
      fire(match, feint);
      return;
    }
    // D D (sút sệt), A A (tạt thấp): lần bấm thứ hai trong lúc chờ.
    if (tap && tap.key === key && now - tap.releasedAt < TAP_MS + 80) {
      tap.count += 1;
      return;
    }
    if (!charge) charge = { key, start: now, ...mods() };
  };

  const attackRelease = (match, key, now) => {
    if (charge && charge.key === key) {
      const power = Math.min(1, Math.max(0.05, (now - charge.start) / CHARGE_MS));
      const m = { q: charge.q || held.has("Q"), z: charge.z || held.has("Z"), c: charge.c || held.has("C") };
      charge = null;
      if (key === "D") tap = { key, power, count: 1, releasedAt: now, kind: m.c ? "power" : m.z ? "finesse" : m.q ? "chip" : "shoot" };
      else if (key === "A") tap = { key, power, count: 1, releasedAt: now, kind: m.q ? "earlyCross" : m.z ? "lofted" : "lob" };
      else if (key === "S") fire(match, m.q ? "oneTwo" : m.z ? "driven" : m.c ? "quick" : "short", { power });
      else if (key === "W") fire(match, m.q ? "lobThrough" : m.z ? "oneTwo" : "through", { power });
      return;
    }
    if (tap && tap.key === key && tap.count >= 2) {
      const action = key === "D" ? "low" : "lowCross";
      const { power } = tap;
      tap = null;
      fire(match, action, { power });
      return;
    }
    if (key === "Z" && zDown) {
      const quick = now - zDown.t < 350 && !zDown.used;
      zDown = null;
      if (quick && hasDirection() && userContext(match) === "ball") fire(match, "drag");
    }
  };

  /* ----- thủ môn ôm bóng ----- */
  const keeperPress = (match, key, now) => {
    if (key === "W") { fire(match, "gkDrop"); return; }
    if (ACTION_KEYS.has(key) && !charge) charge = { key, start: now, ...mods() };
  };
  const keeperRelease = (match, key, now) => {
    if (!charge || charge.key !== key) return;
    const power = Math.min(1, Math.max(0.05, (now - charge.start) / CHARGE_MS));
    const z = charge.z || held.has("Z");
    charge = null;
    if (key === "A" || key === "D") fire(match, "punt", { power });
    else if (key === "S") fire(match, z ? "lowThrow" : power > 0.45 ? "longThrow" : "short", { power });
  };

  /* ----- phòng ngự ----- */
  const defensePress = (match, key, now) => {
    if (MOVES.has(key)) { if (held.has("Shift")) fire(match, "switchDir"); return; }
    if (key === "Shift") { if (hasDirection()) fire(match, "switchDir"); return; }
    if (key === "S") { fire(match, clearanceChance(match) ? "clear" : "switch"); return; }
    if (key === "D") { if (clearanceChance(match)) fire(match, "clear"); return; }
    if (key === "A") { fire(match, "slide"); return; }
    if (key === "Space") { spaceAt = now; fire(match, "tackle"); return; }
    if (key === "W") fire(match, "gkRush");
  };

  /* ----- tình huống cố định của mình ----- */
  const setPiecePress = (match, key, now, type) => {
    if (key === "E" && (type === "freekick" || type === "penalty")) { fire(match, "cycleTaker"); return; }
    if (key === "C" && (type === "freekick" || type === "corner" || type === "throw")) { fire(match, "callSecond"); return; }
    if (!ACTION_KEYS.has(key)) return;
    if (type === "corner" && key === "A") {
      if (tap && tap.key === "A" && now - tap.releasedAt < TAP_MS + 140) { tap.count = Math.min(3, tap.count + 1); tap.releasedAt = now; return; }
      tap = { key: "A", count: 1, releasedAt: now, power: 0.75, corner: true };
      return;
    }
    if (!charge) charge = { key, start: now, ...mods() };
  };
  const setPieceRelease = (match, key, now, type) => {
    if (type === "corner" && key === "A" && tap?.corner) { tap.releasedAt = now; return; }
    if (!charge || charge.key !== key) return;
    const power = Math.min(1, Math.max(0.05, (now - charge.start) / CHARGE_MS));
    const m = { q: charge.q || held.has("Q"), z: charge.z || held.has("Z"), c: charge.c || held.has("C") };
    charge = null;
    if (key === "D") {
      if (type === "throw" || type === "kickoff") { fire(match, "short", { power }); return; }
      if (type === "goalkick") { fire(match, "lob", { power }); return; }
      const kind = type === "freekick" ? (m.q ? "chip" : m.z ? "low" : "shoot") : m.q ? "chip" : m.z ? "finesse" : m.c ? "power" : "shoot";
      fire(match, kind, { power, second: type === "freekick" && m.c });
      return;
    }
    if (key === "S") fire(match, "short", { power });
    else if (key === "A") fire(match, m.z ? "lofted" : "lob", { power });
    else if (key === "W") fire(match, m.q ? "lobThrough" : "through", { power });
  };

  /* ----- tình huống cố định của đối thủ ----- */
  const defendSetPiecePress = (match, key, type) => {
    if (type === "freekick") {
      if (key === "W") fire(match, "wallJump");
      else if (key === "C") fire(match, "wallLeft");
      else if (key === "E") fire(match, "wallRight");
      return;
    }
    if (type === "penalty" && (key === "D" || key === "Ctrl" || (MOVES.has(key) && (held.has("D") || held.has("Ctrl"))))) fire(match, "keeperGuess");
  };

  const press = (match, key, now = performance.now()) => {
    if (!match || !key || held.has(key)) return;
    held.add(key);
    if (key === "[" || key === "]") { act(match, "mentality", { delta: key === "]" ? 1 : -1 }); return; }
    if (key === "Backspace") { onUi("ring"); return; }
    const context = userContext(match);
    if (isAttack(context)) attackPress(match, key, now);
    else if (context === "keeper") keeperPress(match, key, now);
    else if (context === "defense") defensePress(match, key, now);
    else if (context.startsWith("sp:")) setPiecePress(match, key, now, context.slice(3));
    else if (context.startsWith("def:")) defendSetPiecePress(match, key, context.slice(4));
  };

  const release = (match, key, now = performance.now()) => {
    if (!held.has(key)) return;
    held.delete(key);
    if (!match) return;
    const context = userContext(match);
    if (isAttack(context)) attackRelease(match, key, now);
    else if (context === "keeper") keeperRelease(match, key, now);
    else if (context.startsWith("sp:")) setPieceRelease(match, key, now, context.slice(3));
    else if (charge && charge.key === key) charge = null;
    if (key === "Z" && zDown && !isAttack(context)) zDown = null;
  };

  /** Gọi mỗi khung hình: hướng chạy theo camera, các phím giữ, và cú sút/tạt đang chờ bấm đúp. */
  const update = (match, nextBasis, now = performance.now()) => {
    if (!match) return { charge: null, context: "idle" };
    if (nextBasis) basis = nextBasis;
    aim = aimNow();
    const context = userContext(match);
    const attack = isAttack(context);
    const defense = context === "defense";
    match.input.mx = aim.x;
    match.input.mz = aim.z;
    match.input.sprint = held.has("E");
    match.input.shield = context === "ball" && held.has("C") && !charge;
    match.input.holdBall = context === "ball" && held.has("Q") && !charge;
    match.input.press = defense && held.has("D");
    match.input.contain = defense && held.has("C");
    match.input.barge = defense && held.has("Space") && now - spaceAt > 220;
    match.input.callPress = defense && held.has("Q");
    match.input.pushUp = (defense || context.startsWith("def:")) && held.has("Z");
    if (tap && now - tap.releasedAt > (tap.corner ? TAP_MS + 140 : TAP_MS)) {
      const pending = tap;
      tap = null;
      if (pending.corner) fire(match, "lob", { power: pending.power, taps: pending.count });
      else if (attack || context.startsWith("sp:")) {
        const action = pending.count >= 2 ? (pending.key === "D" ? "low" : "lowCross") : pending.kind;
        fire(match, action, { power: pending.power });
      }
    }
    if (charge && (defense || context.startsWith("def:"))) charge = null;
    return { charge: charge ? { key: charge.key, power: Math.min(1, (now - charge.start) / CHARGE_MS) } : null, context };
  };

  const setStick = (x, y) => { stick.x = x; stick.y = y; };

  const reset = () => {
    held.clear();
    charge = null;
    tap = null;
    zDown = null;
    stick.x = 0;
    stick.y = 0;
  };

  return { press, release, update, setStick, reset, isHeld: (key) => held.has(key) };
};

/* ---------- tay cầm (chuẩn Xbox) ---------- */

/**
 * Nút tay cầm → phím FO4 theo ngữ cảnh.
 * Tấn công: A chuyền (S) · B bổng (A) · X sút (D) · Y chọc khe (W) · LB (Q) · RB (Z) · LT che bóng (C) · RT tăng tốc (E).
 * Phòng ngự: A áp sát (D) · B tắc (Space) · X xoạc (A) · Y thủ môn ra (W) · LB đổi người (S) · RB gọi đồng đội (Q) · LT kèm (C).
 */
export const padKey = (index, context) => {
  const defense = context === "defense";
  const defending = context?.startsWith?.("def:");
  switch (index) {
    case 0: return defense ? "D" : "S";
    case 1: return defense ? "Space" : "A";
    case 2: return defense ? "A" : "D";
    case 3: return "W";
    case 4: return defense ? "S" : "Q";
    case 5: return defense ? "Q" : defending ? "E" : "Z";
    case 6: return "C";
    case 7: return "E";
    case 12: return "up";
    case 13: return "down";
    case 14: return "left";
    case 15: return "right";
    default: return null;
  }
};

/** Nút cảm ứng theo ngữ cảnh: [phím, nhãn]. */
export const touchButtons = (context) => {
  if (context === "defense") return [["S", "Đổi người"], ["D", "Áp sát"], ["C", "Kèm"], ["Space", "Tắc"], ["A", "Xoạc"], ["E", "Tốc"]];
  if (context === "keeper") return [["S", "Ném"], ["A", "Phát dài"], ["W", "Thả bóng"]];
  if (context === "def:freekick") return [["W", "Rào nhảy"], ["C", "Rào trái"], ["E", "Rào phải"]];
  if (context === "def:penalty") return [["D", "Bay người"]];
  if (context?.startsWith?.("def:")) return [];
  if (context === "sp:corner") return [["A", "Tạt"], ["S", "Chuyền"], ["C", "Gọi người"]];
  if (context === "sp:freekick") return [["D", "Sút"], ["S", "Chuyền"], ["A", "Bổng"], ["E", "Đổi người"], ["C", "Người 2"]];
  if (context === "sp:penalty") return [["D", "Sút"], ["E", "Đổi người"]];
  return [["D", "Sút"], ["S", "Chuyền"], ["W", "Chọc khe"], ["A", "Bổng"], ["E", "Tốc"], ["C", "Che"]];
};
