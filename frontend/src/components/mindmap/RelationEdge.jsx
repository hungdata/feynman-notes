import { memo, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from "@xyflow/react";
import { angledRelationPath, roundedOrthogonalPath, straightRelationPath } from "@/mindmap/relationPath";

const getPath = (style, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, controlPoint) => {
  if (controlPoint && style !== "straight") {
    if (style === "curved") return [`M ${sourceX} ${sourceY} Q ${controlPoint.x} ${controlPoint.y} ${targetX} ${targetY}`, controlPoint.x, controlPoint.y];
    return [`M ${sourceX} ${sourceY} L ${controlPoint.x} ${sourceY} L ${controlPoint.x} ${targetY} L ${targetX} ${targetY}`, controlPoint.x, controlPoint.y];
  }
  if (style === "straight") return [straightRelationPath(sourceX, sourceY, targetX, targetY), (sourceX + targetX) / 2, (sourceY + targetY) / 2];
  if (style === "angled") return [angledRelationPath(sourceX, sourceY, targetX, targetY), (sourceX + targetX) / 2, (sourceY + targetY) / 2];
  if (style === "rounded") return [roundedOrthogonalPath(sourceX, sourceY, targetX, targetY), (sourceX + targetX) / 2, (sourceY + targetY) / 2];
  return getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.32 });
};

const RelationEdge = memo((props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data, style } = props;
  const flow = useReactFlow();
  const [path, labelX, labelY] = useMemo(
    () => getPath(data.pathStyle, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data.controlPoint),
    [data.controlPoint, data.pathStyle, sourcePosition, sourceX, sourceY, targetPosition, targetX, targetY]
  );

  const startControlDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    data.onPathStart?.(id);
    const move = (moveEvent) => data.onControlPoint?.(id, flow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY }));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          ...style,
          stroke: selected ? "#0f172a" : style.stroke,
          strokeWidth: selected ? Number(style.strokeWidth || 2.5) + 1.5 : style.strokeWidth,
          filter: selected ? "drop-shadow(0 0 3px rgba(37,99,235,.45))" : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div className={`relation-label nodrag nopan ${selected ? "selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>
          {data.label && <span>{data.label}</span>}
          {selected && data.pathStyle !== "straight" && <button className="relation-control" aria-label="Kéo để chỉnh đường nối" onPointerDown={startControlDrag} />}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

RelationEdge.displayName = "RelationEdge";
export default RelationEdge;
