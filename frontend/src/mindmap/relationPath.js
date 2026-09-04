export const roundedOrthogonalPath = (sourceX, sourceY, targetX, targetY, radius = 18) => {
  const middleX = (sourceX + targetX) / 2;
  const directionX = targetX >= sourceX ? 1 : -1;
  const directionY = targetY >= sourceY ? 1 : -1;
  const safeRadius = Math.min(radius, Math.abs(targetX - sourceX) / 4, Math.abs(targetY - sourceY) / 2);
  if (safeRadius < 1) return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
  return `M ${sourceX} ${sourceY} L ${middleX - safeRadius * directionX} ${sourceY} Q ${middleX} ${sourceY} ${middleX} ${sourceY + safeRadius * directionY} L ${middleX} ${targetY - safeRadius * directionY} Q ${middleX} ${targetY} ${middleX + safeRadius * directionX} ${targetY} L ${targetX} ${targetY}`;
};

export const straightRelationPath = (sourceX, sourceY, targetX, targetY) =>
  `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;

export const angledRelationPath = (sourceX, sourceY, targetX, targetY) =>
  roundedOrthogonalPath(sourceX, sourceY, targetX, targetY, 0);
