import { memo, useMemo } from "react";
import { getNodeSize } from "@/mindmap/layout";
import { resolveNodeStyles, getStyleSheet, mixColors } from "@/mindmap/styles";
import { taperedCurvePath } from "@/mindmap/relationPath";

const tokenColor = (token, branch, sheet) => {
  if (!token || token === "none") return "none";
  if (token === "branch") return branch;
  if (token === "tint") return mixColors(branch, sheet.background, sheet.dark ? 0.8 : 0.86);
  if (token === "tint2") return mixColors(branch, sheet.background, sheet.dark ? 0.7 : 0.62);
  if (token === "shade") return mixColors(branch, sheet.background, 0.78);
  if (token === "auto") return "#ffffff";
  return token;
};

const radiusFor = (shape, height) => (shape === "pill" || shape === "circle" ? height / 2 : shape === "rect" ? 1.5 : shape === "rounded" ? 4 : 0);

/** Small picture of a style sheet for the Style Sheet gallery. */
export const StyleSheetPreview = memo(({ sheetId }) => {
  const sheet = getStyleSheet(sheetId);
  const color = (index) => (sheet.colorMode === "level" ? sheet.levelColors[1] : sheet.palette[index % sheet.palette.length]);
  const lineColor = (index) => sheet.line.color || color(index);
  const branches = [
    { x: 104, y: 18, index: 0, dir: 1 }, { x: 104, y: 54, index: 1, dir: 1 },
    { x: 16, y: 18, index: 2, dir: -1 }, { x: 16, y: 54, index: 3, dir: -1 },
  ];
  const central = sheet.central;
  return (
    <svg viewBox="0 0 120 72" className="sheet-preview" aria-hidden="true">
      <rect width="120" height="72" fill={sheet.background} />
      {sheet.pattern === "grid" && <path d="M0 12H120M0 24H120M0 36H120M0 48H120M0 60H120M12 0V72M24 0V72M36 0V72M48 0V72M60 0V72M72 0V72M84 0V72M96 0V72M108 0V72" stroke="#ffffff22" strokeWidth=".5" />}
      {branches.map(({ x, y, index, dir }) => {
        const startX = 60 + dir * 16;
        const endX = x - dir * 12;
        const width = sheet.line.width;
        return sheet.line.taper
          ? <path key={index} d={taperedCurvePath(startX, 36, endX, y, width * 1.4, width * 0.5, false, 10)} fill={lineColor(index)} />
          : <path key={index} d={`M${startX} 36 C ${startX + dir * 14} 36 ${endX - dir * 14} ${y} ${endX} ${y}`} stroke={lineColor(index)} strokeWidth={Math.max(1, width * 0.5)} fill="none" />;
      })}
      {branches.map(({ x, y, index }) => {
        const branch = color(index);
        const level1 = sheet.level1;
        const fill = tokenColor(level1.fill, branch, sheet);
        const stroke = tokenColor(level1.border, branch, sheet);
        if (level1.shape === "underline" || level1.shape === "none") {
          return <g key={index}><rect x={x - 12} y={y - 3} width="24" height="3" rx="1.5" fill={tokenColor(level1.text === "auto" ? "#333" : level1.text, branch, sheet)} opacity=".55" />{level1.shape === "underline" && <rect x={x - 13} y={y + 3} width="26" height="1.4" fill={stroke === "none" ? branch : stroke} />}</g>;
        }
        const width = level1.shape === "circle" ? 16 : 26;
        const height = level1.shape === "circle" ? 16 : 11;
        return <rect key={index} x={x - width / 2} y={y - height / 2} width={width} height={height} rx={radiusFor(level1.shape, height)} fill={fill} stroke={stroke} strokeWidth={stroke === "none" ? 0 : Math.max(0.8, level1.borderWidth * 0.6)} />;
      })}
      {(() => {
        const width = central.shape === "circle" ? 26 : 34;
        const height = central.shape === "circle" ? 26 : 15;
        const fill = tokenColor(central.fill, color(0), sheet);
        const stroke = tokenColor(central.border, color(0), sheet);
        return <rect x={60 - width / 2} y={36 - height / 2} width={width} height={height} rx={radiusFor(central.shape, height)} fill={fill === "none" ? sheet.background : fill} stroke={stroke} strokeWidth={stroke === "none" ? 0 : Math.max(1, central.borderWidth * 0.6)} />;
      })()}
    </svg>
  );
});
StyleSheetPreview.displayName = "StyleSheetPreview";

/** Tiny overview of a map's shape for the library list. */
export const MapThumbnail = memo(({ document }) => {
  const shape = useMemo(() => {
    const nodes = (document.nodes || []).slice(0, 160);
    if (!nodes.length) return null;
    const { styles, background } = resolveNodeStyles(nodes, document.settings || {});
    const boxes = nodes.map((node) => ({ node, ...getNodeSize(node), x: node.position?.x || 0, y: node.position?.y || 0 }));
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const maxX = Math.max(...boxes.map((box) => box.x + box.width));
    const maxY = Math.max(...boxes.map((box) => box.y + box.height));
    const scale = Math.min(0.22, 56 / Math.max(1, maxX - minX), 36 / Math.max(1, maxY - minY));
    const offsetX = (64 - (maxX - minX) * scale) / 2;
    const offsetY = (44 - (maxY - minY) * scale) / 2;
    const project = (box) => ({ x: (box.x - minX) * scale + offsetX, y: (box.y - minY) * scale + offsetY, width: Math.max(2, box.width * scale), height: Math.max(1.5, box.height * scale) });
    const byId = new Map(boxes.map((box) => [box.node.id, project(box)]));
    return {
      background,
      lines: boxes.filter((box) => byId.has(box.node.data?.parentId)).map((box) => {
        const child = byId.get(box.node.id);
        const parent = byId.get(box.node.data.parentId);
        return { id: box.node.id, x1: parent.x + parent.width / 2, y1: parent.y + parent.height / 2, x2: child.x + child.width / 2, y2: child.y + child.height / 2, color: styles.get(box.node.id)?.line.color || "#94a3b8" };
      }),
      rects: boxes.map((box) => ({ id: box.node.id, ...byId.get(box.node.id), color: box.node.data?.parentId ? styles.get(box.node.id)?.branchColor : "#1f2937", root: !box.node.data?.parentId })),
    };
  }, [document]);
  if (!shape) return <span className="map-thumb" />;
  return (
    <svg viewBox="0 0 64 44" className="map-thumb" aria-hidden="true">
      <rect width="64" height="44" rx="6" fill={shape.background} />
      {shape.lines.map((line) => <line key={line.id} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth=".9" strokeLinecap="round" />)}
      {shape.rects.map((rect) => <rect key={rect.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="1" fill={rect.root ? rect.color : "#ffffff"} stroke={rect.color} strokeWidth=".6" />)}
    </svg>
  );
});
MapThumbnail.displayName = "MapThumbnail";
