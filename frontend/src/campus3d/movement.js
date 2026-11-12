/** Moving the player around the campus: camera-relative steering and collisions. Pure maths, no three.js. */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Turns arrow input into a ground direction. The camera sits at angle `yaw`
 * around the player (yaw 0 = south of the player, looking north), so "up"
 * always means "away from the camera".
 */
export const steer = (input, yaw) => {
  const length = Math.hypot(input.x, input.y);
  if (length < 0.001) return { x: 0, z: 0 };
  const ix = input.x / Math.max(1, length);
  const iy = input.y / Math.max(1, length);
  return { x: ix * Math.cos(yaw) - iy * Math.sin(yaw), z: -ix * Math.sin(yaw) - iy * Math.cos(yaw) };
};

/** Angle a character must face to look along a ground direction (model faces +z at heading 0). */
export const headingOf = (dx, dz) => Math.atan2(dx, dz);

/** Shortest signed difference between two angles. */
export const angleDelta = (from, to) => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

/** Turns `from` toward `to` by at most `maxStep` radians. */
export const turnToward = (from, to, maxStep) => {
  const delta = angleDelta(from, to);
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep;
};

const insideBox = (x, z, radius, box) => x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius;

/**
 * Moves a circle by (dx, dz). Each axis is tried on its own, so walking into a
 * wall at an angle slides along it instead of stopping dead.
 */
export const moveWithCollisions = (position, dx, dz, radius, colliders, bounds) => {
  let { x, z } = position;
  const blocked = (px, pz) => colliders.boxes.some((box) => insideBox(px, pz, radius, box));

  const nextX = clamp(x + dx, bounds.minX + radius, bounds.maxX - radius);
  if (!blocked(nextX, z)) x = nextX;
  const nextZ = clamp(z + dz, bounds.minZ + radius, bounds.maxZ - radius);
  if (!blocked(x, nextZ)) z = nextZ;

  // Round obstacles push the player out along the line between the centres.
  for (const circle of colliders.circles) {
    const ox = x - circle.x;
    const oz = z - circle.z;
    const reach = circle.r + radius;
    const distance = Math.hypot(ox, oz);
    if (distance >= reach) continue;
    if (distance < 0.0001) { x = circle.x + reach; continue; }
    x = circle.x + (ox / distance) * reach;
    z = circle.z + (oz / distance) * reach;
  }
  if (blocked(x, z)) return { x: position.x, z: position.z };
  return { x: clamp(x, bounds.minX + radius, bounds.maxX - radius), z: clamp(z, bounds.minZ + radius, bounds.maxZ - radius) };
};

/** Replay movement since a packet was sent from the position the server accepted.
 * Small rejected moves matter at narrow corners, including the fishing deck.
 */
export const reconcilePosition = (position, accepted, sent, radius, colliders, bounds) => {
  if (!accepted || !sent || ![accepted.x, accepted.z, sent.x, sent.z].every(Number.isFinite)) return { x: position.x, z: position.z };
  const dx = position.x - sent.x;
  const dz = position.z - sent.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
  let next = moveWithCollisions(accepted, 0, 0, radius, colliders, bounds);
  for (let step = 0; step < steps; step += 1) next = moveWithCollisions(next, dx / steps, dz / steps, radius, colliders, bounds);
  return next;
};

/** Does the straight line from a to b pass through a box of the given height? Used to fade walls that hide the player. */
export const segmentHitsBox = (a, b, box) => {
  let tMin = 0;
  let tMax = 1;
  const axes = [[a.x, b.x, box.minX, box.maxX], [a.y, b.y, 0, box.height], [a.z, b.z, box.minZ, box.maxZ]];
  for (const [from, to, min, max] of axes) {
    const delta = to - from;
    if (Math.abs(delta) < 1e-9) {
      if (from < min || from > max) return false;
      continue;
    }
    let t1 = (min - from) / delta;
    let t2 = (max - from) / delta;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
};

/** The nearest door within reach, or null. */
export const nearestDoor = (position, doors, range) => {
  let best = null;
  let bestDistance = range;
  for (const door of doors) {
    const distance = Math.hypot(door.x - position.x, door.z - position.z);
    if (distance <= bestDistance) { best = door; bestDistance = distance; }
  }
  return best;
};
