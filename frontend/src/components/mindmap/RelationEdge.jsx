import { memo, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, useReactFlow } from "@xyflow/react";
import { angledRelationPath, curvedPath, elbowPath, roundedOrthogonalPath, straightRelationPath, taperedCurvePath } from "@/mindmap/relationPath";

const buildPath = ({ pathStyle, orientation, controlPoint }, sourceX, sourceY, targetX, targetY) => {
  const vertical = orientation === "v";
  const middle = [(sourceX + targetX) / 2, (sourceY + targetY) / 2];
  if (orientation === "list" && pathStyle !== "straight") {
    return [elbowPath(sourceX, sourceY, targetX, targetY, pathStyle === "angled" ? 0 : 8), sourceX, targetY];
  }
  if (controlPoint && pathStyle !== "straight") {
    if (pathStyle === "curved") return [`M ${sourceX} ${sourceY} Q ${controlPoint.x} ${controlPoint.y} ${targetX} ${targetY}`, controlPoint.x, controlPoint.y];
    return vertical
      ? [`M ${sourceX} ${sourceY} L ${sourceX} ${controlPoint.y} L ${targetX} ${controlPoint.y} L ${targetX} ${targetY}`, controlPoint.x, controlPoint.y]
      : [`M ${sourceX} ${sourceY} L ${controlPoint.x} ${sourceY} L ${controlPoint.x} ${targetY} L ${targetX} ${targetY}`, controlPoint.x, controlPoint.y];
  }
  if (pathStyle === "straight") return [straightRelationPath(sourceX, sourceY, targetX, targetY), ...middle];
  if (pathStyle === "angled") return [angledRelationPath(sourceX, sourceY, targetX, targetY, vertical), ...middle];
  if (pathStyle === "rounded") return [roundedOrthogonalPath(sourceX, sourceY, targetX, targetY, 16, vertical), ...middle];
  return [curvedPath(sourceX, sourceY, targetX, targetY, vertical), ...middle];
};

const RelationEdge = memo(({ id, sourceX, sourceY, targetX, targetY, selected, data, style, markerEnd, markerStart }) => {
  const flow = useReactFlow();
  const [path, labelX, labelY] = useMemo(() => buildPath(data, sourceX, sourceY, targetX, targetY), [data, sourceX, sourceY, targetX, targetY]);
  const tapered = useMemo(() => {
    if (!data.taper || data.controlPoint || data.orientation === "list" || data.pathStyle !== "curved") return null;
    return taperedCurvePath(sourceX, sourceY, targetX, targetY, data.width, data.endWidth, data.orientation === "v");
  }, [data, sourceX, sourceY, targetX, targetY]);

  const startControlDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    data.onPathStart?.(id);
    const move = (moveEvent) => data.onControlPoint?.(id, flow.screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY }));
    const stop = () => window.removeEventListener("pointermove", move);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <>
      {selected && <path d={path} className="edge-halo" style={{ strokeWidth: Number(data.width || 2) + 8 }} />}
      {tapered && <path d={tapered} className="edge-taper" style={{ fill: style.stroke, opacity: style.opacity }} />}
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={18}
        style={{
          ...style,
          stroke: tapered ? "transparent" : style.stroke,
          // List trunks share one vertical line: use the average width.
          strokeWidth: tapered ? 1 : data.orientation === "list" && !data.isCrossLink ? (Number(data.width) + Number(data.endWidth)) / 2 : style.strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          fill: "none",
        }}
      />
      {(data.label || (selected && data.pathStyle !== "straight")) && (
        <EdgeLabelRenderer>
          <div className={`relation-label nodrag nopan ${selected ? "selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}>
            {data.label && <span style={{ borderColor: style.stroke }}>{data.label}</span>}
            {selected && data.pathStyle !== "straight" && <button type="button" className="relation-control" title="Kéo để uốn đường nối" aria-label="Kéo để uốn đường nối" onPointerDown={startControlDrag} />}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

RelationEdge.displayName = "RelationEdge";
export default RelationEdge;
