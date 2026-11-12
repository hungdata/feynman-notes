/**
 * Pool table physics (pure, deterministic).
 *
 * Each ball has a velocity and a spin (wx, wy = rolling axes, wz = side spin).
 * The cloth acts on the contact point: while it slips the ball SLIDES (strong
 * friction, spin and speed converge), then it ROLLS (weak resistance). This
 * gives real cue-ball behaviour without special cases:
 *   - hit while still sliding → stops dead on a full hit (stun);
 *   - hit while rolling → keeps its top spin and follows the object ball;
 *   - struck low → back spin pulls it back after the hit (draw);
 *   - side spin changes the angle off a cushion.
 * Ball–ball impacts are frictionless (velocities swap along the line of
 * centres, spins are kept). Cushions lose energy and rub against side spin.
 *
 * World units: the felt is 1000 × 500 (a 100" × 50" table, 1 unit ≈ 2.54 mm)
 * with (0,0) at its top-left corner.
 */

export const TABLE = { w: 1000, h: 500, r: 11, rail: 46 };
export const POCKETS = [
  { x: 0, y: 0, r: 25 }, { x: 500, y: -5, r: 21 }, { x: 1000, y: 0, r: 25 },
  { x: 0, y: 500, r: 25 }, { x: 500, y: 505, r: 21 }, { x: 1000, y: 500, r: 25 },
];
export const HEAD_X = 250;
export const FOOT = { x: 750, y: 250 };
export const MAX_SPEED = 2700; // ≈ 6.9 m/s, a firm break
export const DT = 1 / 400;

const GRAVITY = 3858; // 9.8 m/s² in table units
const SLIDE_DECEL = 0.2 * GRAVITY; // ball sliding on cloth (μ ≈ 0.2)
export const ROLL_DECEL = 70; // rolling resistance (μ ≈ 0.018)
const SPIN_DECEL = 14; // side spin decay (rad/s²)
const SLIP_EPS = 1.5; // contact-point speed below which the ball is rolling
const BALL_RESTITUTION = 0.94;
const CUSHION_GRIP = 0.18; // share of the rubbing speed a cushion takes away
const SIDE_SIGN = -1; // right-hand english is negative wz in this frame
const MOUTH = TABLE.r * 0.5; // how far outside a pocket the cushion is open

const ball = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, potted: false });

/** Cue ball (id 0) on the head spot and the 15 balls racked at the foot spot. */
export const createRack = () => {
  const rows = [[1], [9, 2], [3, 8, 10], [11, 4, 5, 12], [6, 13, 14, 7, 15]];
  const gap = TABLE.r * 2 + 0.3;
  const balls = [ball(0, HEAD_X, TABLE.h / 2)];
  rows.forEach((row, i) => row.forEach((id, j) => balls.push(ball(id, FOOT.x + i * gap * 0.866, FOOT.y + (j - i / 2) * gap))));
  return balls;
};

export const isMoving = (balls) => balls.some((item) => !item.potted && (item.vx !== 0 || item.vy !== 0 || (item.wx || 0) !== 0 || (item.wy || 0) !== 0));

const rest = (b) => { b.vx = 0; b.vy = 0; b.wx = 0; b.wy = 0; b.wz = 0; };

/** Cloth friction for one ball over `dt`: sliding until the contact point stops slipping, then rolling. */
const applyCloth = (b, dt) => {
  const r = TABLE.r;
  b.wx ||= 0; b.wy ||= 0; b.wz ||= 0;
  const ux = b.vx - r * b.wy;
  const uy = b.vy + r * b.wx;
  const slip = Math.hypot(ux, uy);
  if (slip > SLIP_EPS) {
    const dv = SLIDE_DECEL * dt;
    if (slip <= 3.5 * dv) {
      b.vx -= (2 / 7) * ux; b.vy -= (2 / 7) * uy;
      b.wy = b.vx / r; b.wx = -b.vy / r;
    } else {
      const nx = ux / slip;
      const ny = uy / slip;
      b.vx -= dv * nx; b.vy -= dv * ny;
      b.wy += (2.5 * dv * nx) / r; b.wx -= (2.5 * dv * ny) / r;
    }
  } else {
    const speed = Math.hypot(b.vx, b.vy);
    const next = speed - ROLL_DECEL * dt;
    if (next <= 0) { rest(b); return; }
    b.vx *= next / speed; b.vy *= next / speed;
    b.wy = b.vx / r; b.wx = -b.vy / r;
  }
  if (b.wz !== 0) {
    const spin = Math.abs(b.wz) - SPIN_DECEL * dt;
    b.wz = spin <= 0 ? 0 : Math.sign(b.wz) * spin;
  }
};

/** Bounce off a cushion with inward normal (nx, ny); returns the impact speed (0 if moving away). */
const bounceOffCushion = (b, nx, ny) => {
  const r = TABLE.r;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  const tx = -ny;
  const ty = nx;
  let vt = b.vx * tx + b.vy * ty;
  const rub = vt - r * b.wz; // tangential speed of the point touching the cushion
  vt -= CUSHION_GRIP * rub;
  b.wz += ((5 * CUSHION_GRIP) / (2 * r)) * rub;
  const restitution = 0.86 - 0.14 * Math.min(1, -vn / 2500); // rubber is deader on hard hits
  const out = -restitution * vn;
  b.vx = out * nx + vt * tx;
  b.vy = out * ny + vt * ty;
  // The cushion nose sits above centre: most of the old forward roll is lost.
  const rollX = 0.4 * out * nx + vt * tx;
  const rollY = 0.4 * out * ny + vt * ty;
  b.wy = rollX / r; b.wx = -rollY / r;
  return -vn;
};

/** Advances the table by `dt` seconds; appends { type: "hit" | "cushion" | "pot" } events. */
export const stepPhysics = (balls, dt = DT, events = []) => {
  const { w, h, r } = TABLE;
  for (const b of balls) {
    if (b.potted) continue;
    if (b.vx === 0 && b.vy === 0 && !b.wx && !b.wy) continue;
    applyCloth(b, dt);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }

  for (let i = 0; i < balls.length; i += 1) {
    const a = balls[i];
    if (a.potted) continue;
    for (let j = i + 1; j < balls.length; j += 1) {
      const b = balls[j];
      if (b.potted) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 4 * r * r || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (2 * r - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (closing <= 0) continue;
      const impulse = ((1 + BALL_RESTITUTION) * closing) / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny;
      b.vx += impulse * nx; b.vy += impulse * ny;
      events.push({ type: "hit", a: a.id, b: b.id, speed: closing });
    }
  }

  for (const b of balls) {
    if (b.potted) continue;
    let inMouth = false;
    let pocketIndex = -1;
    for (let index = 0; index < POCKETS.length; index += 1) {
      const pocket = POCKETS[index];
      const distance = Math.hypot(b.x - pocket.x, b.y - pocket.y);
      if (distance < pocket.r) { pocketIndex = index; break; }
      if (distance < pocket.r + MOUTH) inMouth = true;
    }
    const escaped = b.x < -r || b.x > w + r || b.y < -r || b.y > h + r;
    if (pocketIndex < 0 && escaped) {
      pocketIndex = POCKETS.reduce((best, pocket, index) => (Math.hypot(b.x - pocket.x, b.y - pocket.y) < Math.hypot(b.x - POCKETS[best].x, b.y - POCKETS[best].y) ? index : best), 0);
    }
    if (pocketIndex >= 0) {
      b.potted = true; rest(b);
      b.x = POCKETS[pocketIndex].x; b.y = POCKETS[pocketIndex].y;
      events.push({ type: "pot", id: b.id, pocket: pocketIndex });
      continue;
    }
    if (inMouth) continue;
    let bounced = 0;
    if (b.x < r) { b.x = r; bounced = bounceOffCushion(b, 1, 0); }
    else if (b.x > w - r) { b.x = w - r; bounced = bounceOffCushion(b, -1, 0); }
    if (b.y < r) { b.y = r; bounced = Math.max(bounced, bounceOffCushion(b, 0, 1)); }
    else if (b.y > h - r) { b.y = h - r; bounced = Math.max(bounced, bounceOffCushion(b, 0, -1)); }
    if (bounced > 0) events.push({ type: "cushion", id: b.id, speed: bounced });
  }
  return events;
};

export const speedForPower = (power) => MAX_SPEED * (0.04 + 0.96 * Math.max(0, Math.min(1, power)) ** 1.2);
export const powerForSpeed = (speed) => Math.max(0, Math.min(1, ((speed / MAX_SPEED - 0.04) / 0.96))) ** (1 / 1.2);

/**
 * Strikes the cue ball. `power` is 0..1. `spin` is where the tip touches the
 * ball, as a fraction of its radius: `top` > 0 above centre (follow), < 0
 * below (draw); `side` > 0 right of centre, as seen by the shooter.
 * A centre hit starts with no spin, so the ball slides first and then rolls.
 */
export const strike = (balls, angle, power, spin = {}) => {
  const cue = balls[0];
  const speed = speedForPower(power);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const reach = Math.hypot(spin.side || 0, spin.top || 0);
  const scale = reach > 0.55 ? 0.55 / reach : 1; // further out would be a miscue
  const k = (2.5 * speed) / TABLE.r;
  cue.vx = dx * speed;
  cue.vy = dy * speed;
  cue.wx = -dy * k * (spin.top || 0) * scale;
  cue.wy = dx * k * (spin.top || 0) * scale;
  cue.wz = SIDE_SIGN * k * (spin.side || 0) * scale;
};

/**
 * Where the cue ball goes along `angle`: the first ball it touches (with the
 * directions both balls leave in) or the cushion point.
 */
export const aimPreview = (balls, angle) => {
  const { w, h, r } = TABLE;
  const cue = balls[0];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let best = Infinity;
  let hit = null;
  for (const b of balls) {
    if (b.potted || b.id === 0) continue;
    const mx = b.x - cue.x;
    const my = b.y - cue.y;
    const along = mx * dx + my * dy;
    if (along <= 0) continue;
    const perp2 = mx * mx + my * my - along * along;
    if (perp2 >= 4 * r * r) continue;
    const t = along - Math.sqrt(4 * r * r - perp2);
    if (t < best) { best = t; hit = b; }
  }
  const tx = dx > 0 ? (w - r - cue.x) / dx : dx < 0 ? (r - cue.x) / dx : Infinity;
  const ty = dy > 0 ? (h - r - cue.y) / dy : dy < 0 ? (r - cue.y) / dy : Infinity;
  const wall = Math.min(tx, ty);
  if (!hit || wall < best) {
    return { ghost: { x: cue.x + dx * wall, y: cue.y + dy * wall }, hitId: null, distance: wall, bounce: tx < ty ? { x: -dx, y: dy } : { x: dx, y: -dy } };
  }
  const ghost = { x: cue.x + dx * best, y: cue.y + dy * best };
  const nx = (hit.x - ghost.x) / (2 * r);
  const ny = (hit.y - ghost.y) / (2 * r);
  const dot = dx * nx + dy * ny;
  return { ghost, hitId: hit.id, distance: best, target: { x: hit.x, y: hit.y }, objectDir: { x: nx, y: ny }, cueDir: { x: dx - dot * nx, y: dy - dot * ny }, fullness: dot };
};

/** A legal resting place for a ball: on the felt and touching no other ball. */
export const isFree = (balls, x, y, ignoreId = -1) => {
  const { w, h, r } = TABLE;
  if (x < r || x > w - r || y < r || y > h - r) return false;
  return balls.every((b) => b.potted || b.id === ignoreId || Math.hypot(b.x - x, b.y - y) >= 2 * r + 0.5);
};

/** Nearest free spot to (x, y), searching outwards in rings. */
export const freeSpotNear = (balls, x, y, ignoreId = -1) => {
  if (isFree(balls, x, y, ignoreId)) return { x, y };
  for (let radius = TABLE.r; radius < TABLE.w; radius += TABLE.r) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (step / 16) * Math.PI * 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (isFree(balls, px, py, ignoreId)) return { x: px, y: py };
    }
  }
  return { x, y };
};
