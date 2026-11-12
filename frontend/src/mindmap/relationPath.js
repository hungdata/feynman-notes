/** Orthogonal path with rounded corners; `vertical` bends top-to-bottom first. */
export const roundedOrthogonalPath = (sourceX, sourceY, targetX, targetY, radius = 18, vertical = false) => {
  if (vertical) {
    const middleY = (sourceY + targetY) / 2;
    const directionX = targetX >= sourceX ? 1 : -1;
    const directionY = targetY >= sourceY ? 1 : -1;
    const safeRadius = Math.min(radius, Math.abs(targetY - sourceY) / 4, Math.abs(targetX - sourceX) / 2);
    if (safeRadius < 1) return `M ${sourceX} ${sourceY} L ${sourceX} ${middleY} L ${targetX} ${middleY} L ${targetX} ${targetY}`;
    return `M ${sourceX} ${sourceY} L ${sourceX} ${middleY - safeRadius * directionY} Q ${sourceX} ${middleY} ${sourceX + safeRadius * directionX} ${middleY} L ${targetX - safeRadius * directionX} ${middleY} Q ${targetX} ${middleY} ${targetX} ${middleY + safeRadius * directionY} L ${targetX} ${targetY}`;
  }
  const middleX = (sourceX + targetX) / 2;
  const directionX = targetX >= sourceX ? 1 : -1;
  const directionY = targetY >= sourceY ? 1 : -1;
  const safeRadius = Math.min(radius, Math.abs(targetX - sourceX) / 4, Math.abs(targetY - sourceY) / 2);
  if (safeRadius < 1) return `M ${sourceX} ${sourceY} L ${middleX} ${sourceY} L ${middleX} ${targetY} L ${targetX} ${targetY}`;
  return `M ${sourceX} ${sourceY} L ${middleX - safeRadius * directionX} ${sourceY} Q ${middleX} ${sourceY} ${middleX} ${sourceY + safeRadius * directionY} L ${middleX} ${targetY - safeRadius * directionY} Q ${middleX} ${targetY} ${middleX + safeRadius * directionX} ${targetY} L ${targetX} ${targetY}`;
};

export const straightRelationPath = (sourceX, sourceY, targetX, targetY) =>
  `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

export const angledRelationPath = (sourceX, sourceY, targetX, targetY, vertical = false) => {
  if (vertical) {
    const middleY = (sourceY + targetY) / 2;
    return `M ${sourceX} ${sourceY} L ${sourceX} ${middleY} L ${targetX} ${middleY} L ${targetX} ${targetY}`;
  }
  const middleX = (sourceX + targetX) / 2;
  return `M ${sourceX} ${sourceY} L ${middleX} ${sourceY} L ${middleX} ${targetY} L ${targetX} ${targetY}`;
};

/** List layouts: drop straight down from the parent, then turn into the child. */
export const elbowPath = (sourceX, sourceY, targetX, targetY, radius = 8) => {
  const directionX = targetX >= sourceX ? 1 : -1;
  const safeRadius = Math.min(radius, Math.abs(targetY - sourceY), Math.abs(targetX - sourceX));
  if (safeRadius < 1) return `M ${sourceX} ${sourceY} L ${sourceX} ${targetY} L ${targetX} ${targetY}`;
  return `M ${sourceX} ${sourceY} L ${sourceX} ${targetY - safeRadius} Q ${sourceX} ${targetY} ${sourceX + safeRadius * directionX} ${targetY} L ${targetX} ${targetY}`;
};

/** Smooth S-curve between two anchors (horizontal or vertical tangents). */
export const curvedPath = (sourceX, sourceY, targetX, targetY, vertical = false) => {
  if (vertical) {
    const offset = (targetY - sourceY) * 0.5;
    return `M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + offset} ${targetX} ${targetY - offset} ${targetX} ${targetY}`;
  }
  const offset = (targetX - sourceX) * 0.5;
  return `M ${sourceX} ${sourceY} C ${sourceX + offset} ${sourceY} ${targetX - offset} ${targetY} ${targetX} ${targetY}`;
};

const cubic = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/**
 * SimpleMind-style tapered branch: a filled shape that is thick at the parent
 * and thin at the child. Works on the same S-curve as `curvedPath`.
 */
export const taperedCurvePath = (sourceX, sourceY, targetX, targetY, startWidth, endWidth, vertical = false, samples = 24) => {
  const control = vertical
    ? [[sourceX, sourceY], [sourceX, sourceY + (targetY - sourceY) * 0.5], [targetX, targetY - (targetY - sourceY) * 0.5], [targetX, targetY]]
    : [[sourceX, sourceY], [sourceX + (targetX - sourceX) * 0.5, sourceY], [targetX - (targetX - sourceX) * 0.5, targetY], [targetX, targetY]];
  const points = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    points.push([cubic(control[0][0], control[1][0], control[2][0], control[3][0], t), cubic(control[0][1], control[1][1], control[2][1], control[3][1], t)]);
  }
  const left = [];
  const right = [];
  points.forEach(([x, y], index) => {
    const [px, py] = points[Math.max(0, index - 1)];
    const [nx, ny] = points[Math.min(points.length - 1, index + 1)];
    let dx = nx - px;
    let dy = ny - py;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const t = index / samples;
    const half = (startWidth + (endWidth - startWidth) * t) / 2;
    left.push([x - dy * half, y + dx * half]);
    right.push([x + dy * half, y - dx * half]);
  });
  const format = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return `M ${left.map(format).join(" L ")} L ${right.reverse().map(format).join(" L ")} Z`;
};
