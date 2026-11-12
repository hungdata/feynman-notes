import { POCKETS, ROLL_DECEL, TABLE, isFree, powerForSpeed } from "./physics.js";
import { groupOf, isOnEight } from "./rules.js";

/** Computer opponent: picks the easiest ball–pocket pair using ghost-ball aiming. */

const R2 = TABLE.r * 2;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const unit = (v) => { const d = len(v) || 1; return { x: v.x / d, y: v.y / d }; };

const segmentDistance = (p, a, b) => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1)));
  return Math.hypot(p.x - (a.x + ab.x * t), p.y - (a.y + ab.y * t));
};
/**
 * Power that lets the object ball reach the pocket with a little pace: the
 * object ball needs `objectTravel` (+ margin) of rolling, a cut passes on only
 * cos(cut) of the speed, and a struck ball loses 2/7 of its speed going from
 * sliding to rolling.
 */
const powerFor = (cueTravel, objectTravel, cut) => {
  const objectSpeed = 1.4 * Math.sqrt(2 * ROLL_DECEL * (objectTravel + 240));
  const impact = objectSpeed / Math.max(0.3, Math.cos(cut)) / 0.97;
  const start = 1.4 * Math.sqrt(impact * impact + 2 * ROLL_DECEL * cueTravel);
  return Math.max(0.12, Math.min(0.95, powerForSpeed(start)));
};

const pathClear = (balls, from, to, ignore) => balls.every((ball) => ball.potted || ignore.includes(ball.id) || segmentDistance(ball, from, to) >= R2 - 0.5);

const legalTargets = (balls, game) => {
  const live = balls.filter((ball) => !ball.potted && ball.id !== 0);
  const group = game.groups[game.turn];
  if (!group) return live.filter((ball) => ball.id !== 8);
  if (isOnEight(game, balls)) return live.filter((ball) => ball.id === 8);
  return live.filter((ball) => groupOf(ball.id) === group);
};

const candidates = (balls, targets, cue) => {
  const list = [];
  targets.forEach((ball) => POCKETS.forEach((pocket, index) => {
    const toPocket = unit(sub(pocket, ball));
    // Side pockets cannot be entered at a shallow angle.
    if ((index === 1 || index === 4) && Math.abs(toPocket.y) < 0.5) return;
    const ghost = { x: ball.x - toPocket.x * R2, y: ball.y - toPocket.y * R2 };
    if (!pathClear(balls, ball, pocket, [0, ball.id])) return;
    const cut = cue ? Math.acos(Math.max(-1, Math.min(1, unit(sub(ghost, cue)).x * toPocket.x + unit(sub(ghost, cue)).y * toPocket.y))) : 0;
    if (cue && (cut > 1.2 || !pathClear(balls, cue, ghost, [0, ball.id]))) return;
    const travel = (cue ? len(sub(ghost, cue)) : 160) + len(sub(pocket, ball));
    list.push({ ball, pocket, toPocket, ghost, cut, travel, objectTravel: len(sub(pocket, ball)), score: cut * 1.6 + travel / 1000 });
  }));
  return list.sort((a, b) => a.score - b.score);
};

/**
 * Returns { angle, power, place? } for the player to move. `random` is
 * injectable so tests are deterministic; `skill` 0..1 shrinks the aiming error.
 */
export const chooseShot = (balls, game, { random = Math.random, skill = 0.75 } = {}) => {
  const cue = balls[0];
  if (game.breakShot) {
    const apex = balls.find((ball) => ball.id === 1) || balls[1];
    return { angle: Math.atan2(apex.y - cue.y, apex.x - cue.x) + (random() - 0.5) * 0.01, power: 1 };
  }
  const targets = legalTargets(balls, game);
  const wobble = (random() - 0.5) * 0.05 * (1 - skill);

  if (game.ballInHand) {
    for (const option of candidates(balls, targets, null)) {
      for (const back of [170, 120, 80, 260]) {
        const place = { x: option.ball.x - option.toPocket.x * (R2 + back), y: option.ball.y - option.toPocket.y * (R2 + back) };
        if (!isFree(balls, place.x, place.y, 0) || !pathClear(balls, place, option.ghost, [0, option.ball.id])) continue;
        return { place, angle: Math.atan2(option.toPocket.y, option.toPocket.x) + wobble, power: powerFor(back, option.objectTravel, 0) };
      }
    }
  }

  const [best] = candidates(balls, targets, cue);
  if (best) {
    return { angle: Math.atan2(best.ghost.y - cue.y, best.ghost.x - cue.x) + wobble, power: powerFor(best.travel - best.objectTravel, best.objectTravel, best.cut) };
  }
  // No makeable shot: at least hit a legal ball that can be reached.
  const reachable = targets.filter((ball) => pathClear(balls, cue, ball, [0, ball.id]));
  const fallback = (reachable.length ? reachable : targets).sort((a, b) => len(sub(a, cue)) - len(sub(b, cue)))[0];
  if (!fallback) return { angle: 0, power: 0.4 };
  return { angle: Math.atan2(fallback.y - cue.y, fallback.x - cue.x) + wobble, power: powerFor(len(sub(fallback, cue)), 300, 0) };
};
