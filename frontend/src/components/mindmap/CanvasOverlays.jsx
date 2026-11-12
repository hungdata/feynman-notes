import { useEffect, useMemo } from "react";
import { useReactFlow, useViewport, ViewportPortal } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, X } from "lucide-react";
import { getDescendantIds, getNodeSize } from "@/mindmap/layout";
import { mixColors } from "@/mindmap/styles";

/** SimpleMind "branch border": a soft rounded frame around a whole branch. */
export const BranchBorders = ({ nodes, resolved }) => {
  const frames = useMemo(() => nodes.filter((node) => node.data.branchBorder).map((owner) => {
    const ids = getDescendantIds(nodes, owner.id);
    ids.add(owner.id);
    const members = nodes.filter((node) => ids.has(node.id));
    const boxes = members.map((node) => ({ ...getNodeSize(node), ...node.position }));
    const padding = 14;
    const minX = Math.min(...boxes.map((box) => box.x)) - padding;
    const minY = Math.min(...boxes.map((box) => box.y)) - padding;
    const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
    const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding;
    const color = resolved.styles.get(owner.id)?.branchColor || "#2f80ed";
    return { id: owner.id, x: minX, y: minY, width: maxX - minX, height: maxY - minY, color, fill: mixColors(color, resolved.background, 0.93) };
  }), [nodes, resolved]);
  if (!frames.length) return null;
  return (
    <ViewportPortal>
      {frames.map((frame) => (
        <div key={frame.id} className="branch-border" style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.width, height: frame.height, borderColor: frame.color, background: frame.fill }} />
      ))}
    </ViewportPortal>
  );
};

export const ZoomControls = () => {
  const flow = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="zoom-controls" role="group" aria-label="Thu phóng">
      <button type="button" onClick={() => flow.zoomOut({ duration: 160 })} aria-label="Thu nhỏ" title="Thu nhỏ (−)"><Minus /></button>
      <button type="button" className="zoom-value" onClick={() => flow.zoomTo(1, { duration: 200 })} title="Về 100%">{Math.round(zoom * 100)}%</button>
      <button type="button" onClick={() => flow.zoomIn({ duration: 160 })} aria-label="Phóng to" title="Phóng to (+)"><Plus /></button>
      <span />
      <button type="button" onClick={() => flow.fitView({ padding: 0.18, duration: 360 })} aria-label="Vừa màn hình" title="Vừa màn hình (⌘0)"><Maximize2 /></button>
    </div>
  );
};

export const PresentationBar = ({ slides, index, onIndex, onExit }) => {
  const flow = useReactFlow();
  const slide = slides[index];
  useEffect(() => {
    if (!slide) return;
    const timer = window.setTimeout(() => flow.fitView({ nodes: slide.ids.map((id) => ({ id })), padding: 0.22, duration: 650, maxZoom: 1.6 }), 30);
    return () => window.clearTimeout(timer);
  }, [flow, slide]);
  useEffect(() => {
    const onKey = (event) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) { event.preventDefault(); onIndex(Math.min(slides.length - 1, index + 1)); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) { event.preventDefault(); onIndex(Math.max(0, index - 1)); }
      else if (event.key === "Escape") { event.preventDefault(); onExit(); }
      else if (event.key === "Home") onIndex(0);
      else if (event.key === "End") onIndex(slides.length - 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, onExit, onIndex, slides.length]);
  return (
    <div className="presentation-bar" role="toolbar" aria-label="Trình chiếu">
      <button type="button" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Trang trước"><ChevronLeft /></button>
      <div><strong>{slide?.title}</strong><small>{index + 1} / {slides.length}</small></div>
      <button type="button" onClick={() => onIndex(Math.min(slides.length - 1, index + 1))} disabled={index >= slides.length - 1} aria-label="Trang sau"><ChevronRight /></button>
      <button type="button" className="presentation-exit" onClick={onExit} aria-label="Thoát trình chiếu"><X /> Thoát</button>
      <div className="presentation-progress"><i style={{ width: `${((index + 1) / slides.length) * 100}%` }} /></div>
    </div>
  );
};
