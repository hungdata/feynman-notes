/**
 * Mind map layout engine.
 *
 * Every auto layout is built from three composable "branch modes":
 *   h    – tree growing sideways (dir +1 right, -1 left)
 *   v    – tree growing vertically (dir +1 down, -1 up)
 *   list – indented list below the parent
 *   free – keep the user's own positions
 *
 * A subtree is laid out in its own coordinate system (subtree root at 0,0)
 * and returns its bounding box; parents stack child boxes without overlap.
 * A topic can override the mode of its own children (SimpleMind's
 * "apply a layout to a branch"), e.g. a List branch inside a horizontal map.
 */

export const TOPIC_NODE_WIDTH = 160;
export const HORIZONTAL_GAP = 220;
const IMAGE_FALLBACK = { width: 260, height: 160 };

export const AUTO_LAYOUTS = new Set(["horizontal", "right", "vertical", "topDown", "list", "linear", "radial", "matrix"]);
export const isAutoLayout = (layout) => AUTO_LAYOUTS.has(layout);

const SPACING = {
  compact: { h: 40, v: 8, level: 40, list: 6 },
  normal: { h: 60, v: 16, level: 56, list: 8 },
  spacious: { h: 96, v: 30, level: 84, list: 12 },
};

// ------------------------------------------------------------------- sizes --

const readSize = (value) => {
  const size = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(size) && size > 0 ? size : null;
};

const topicImageHeight = (data) => (data?.imageAssetId ? Math.min(145, Math.max(36, readSize(data.topicImageHeight) || 145)) : 0);

/** Size estimate for a topic React Flow has not measured yet. */
export const estimateTopicSize = (node) => {
  const data = node?.data || {};
  const isRoot = !data.parentId;
  const fontSize = readSize(data.fontSize) || (isRoot ? 20 : 14.5);
  const maxWidth = readSize(data.maxWidth) || (isRoot ? 300 : 260);
  const padX = isRoot ? 40 : 28;
  const padY = isRoot ? 24 : 16;
  const extras = (data.icon || data.emoji ? 24 : 0) + (data.checkbox ? 22 : 0) + (data.note || data.link ? 18 : 0);
  const charWidth = fontSize * 0.56;
  const lines = String(data.label || " ").split("\n");
  const longest = Math.max(...lines.map((line) => line.length)) * charWidth;
  let width = Math.min(maxWidth, Math.max(isRoot ? 120 : 56, longest + padX + extras));
  const usable = Math.max(40, width - padX - extras);
  const lineCount = lines.reduce((total, line) => total + Math.max(1, Math.ceil((line.length * charWidth) / usable)), 0);
  let height = lineCount * fontSize * 1.3 + padY;
  if (data.labels?.length || data.dueDate) height += 22;
  if (data.imageAssetId) {
    width = Math.max(width, 180);
    height += topicImageHeight(data) + 8;
  }
  if (data.aiGenerated && data.note) {
    width = 380;
    height += Math.min(640, Math.ceil(String(data.note).length / 52) * 19 + 24);
  }
  return { width, height };
};

const nodeWidth = (node) => readSize(node?.measured?.width) || readSize(node?.width) || readSize(node?.style?.width)
  || (node?.type === "image" ? IMAGE_FALLBACK.width : estimateTopicSize(node).width);

const nodeHeight = (node) => {
  const measured = readSize(node?.measured?.height);
  const explicit = readSize(node?.height) || readSize(node?.style?.height);
  if (node?.type === "image") return measured || explicit || IMAGE_FALLBACK.height;
  // React Flow can still report the pre-image height for one frame after a
  // picture is attached; never let that stale value win.
  const imageMinimum = node?.data?.imageAssetId ? topicImageHeight(node.data) + 30 : 0;
  return Math.max(measured || explicit || estimateTopicSize(node).height, imageMinimum);
};

/** Rotated images reserve their visual (axis-aligned) bounding box. */
const nodeVisualSize = (node) => {
  const width = nodeWidth(node);
  const height = nodeHeight(node);
  if (node?.type !== "image") return { width, height };
  const degrees = readSize(Math.abs(node?.data?.rotation || 0)) || 0;
  if (!degrees) return { width, height };
  const radians = (degrees * Math.PI) / 180;
  return {
    width: Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)),
    height: Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)),
  };
};

const visualBounds = (node, position = node.position) => {
  const baseWidth = nodeWidth(node);
  const baseHeight = nodeHeight(node);
  const visual = nodeVisualSize(node);
  return { x: position.x + (baseWidth - visual.width) / 2, y: position.y + (baseHeight - visual.height) / 2, width: visual.width, height: visual.height };
};

export const getNodeSize = (node) => ({ width: nodeWidth(node), height: nodeHeight(node) });

// -------------------------------------------------------------------- tree --

export const getDescendantIds = (nodes, nodeId) => {
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    const list = childrenByParent.get(node.data.parentId) || [];
    list.push(node);
    childrenByParent.set(node.data.parentId, list);
  });
  const descendants = new Set();
  const visit = (parentId) => (childrenByParent.get(parentId) || []).forEach((node) => {
    if (descendants.has(node.id)) return;
    descendants.add(node.id);
    visit(node.id);
  });
  visit(nodeId);
  return descendants;
};

export const canReparent = (nodes, nodeId, parentId) =>
  Boolean(nodeId && parentId && nodeId !== parentId && !getDescendantIds(nodes, nodeId).has(parentId));

export const canAcceptChildren = (node) => node?.type === "topic" || node?.type === "image";

export const findDropParent = (nodes, movingId, point, margin = 24) => {
  const descendants = getDescendantIds(nodes, movingId);
  return nodes
    .filter((node) => canAcceptChildren(node) && node.id !== movingId && !descendants.has(node.id))
    .map((node) => {
      const position = node.positionAbsolute || node.position;
      const bounds = visualBounds(node, position);
      const inside = point.x >= bounds.x - margin && point.x <= bounds.x + bounds.width + margin
        && point.y >= bounds.y - margin && point.y <= bounds.y + bounds.height + margin;
      const distance = Math.hypot(point.x - (bounds.x + bounds.width / 2), point.y - (bounds.y + bounds.height / 2));
      return { node, inside, distance };
    })
    .filter((candidate) => candidate.inside)
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
};

export const getVisibleNodes = (nodes, focusId = null) => {
  const hidden = new Set(nodes.filter((node) => node.data.hidden).map((node) => node.id));
  nodes.forEach((node) => {
    if (node.data.collapsed || node.data.hidden) getDescendantIds(nodes, node.id).forEach((id) => hidden.add(id));
  });
  if (focusId) {
    const visible = getDescendantIds(nodes, focusId);
    visible.add(focusId);
    return nodes.filter((node) => visible.has(node.id) && !hidden.has(node.id));
  }
  return nodes.filter((node) => !hidden.has(node.id));
};

// ------------------------------------------------------------ branch modes --

const OVERRIDE_MODES = { horizontal: "h", right: "h", topDown: "v", vertical: "v", list: "list", freeForm: "free" };
const ROOT_MODES = { horizontal: "h", right: "h", vertical: "v", topDown: "v", list: "list", linear: "h", radial: "radial", matrix: "v", freeForm: "free" };

/**
 * For every node: how its children are arranged ("h", "v", "list", "radial",
 * "free"). Used for edge anchors and the collapse button position.
 */
export const computeBranchModes = (nodes, layout = "horizontal") => {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map();
  nodes.forEach((node) => {
    const parent = ids.has(node.data?.parentId) ? node.data.parentId : null;
    children.set(parent, [...(children.get(parent) || []), node]);
  });
  const modes = new Map();
  const visit = (node, inherited, depth, seen) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const override = OVERRIDE_MODES[node.data?.layout];
    let mode = override || inherited;
    if (depth === 0 && !override) mode = ROOT_MODES[layout] || "h";
    if (depth === 1 && !override && (layout === "linear" || layout === "matrix")) mode = "list";
    if (mode === "radial" && depth > 0) mode = "h";
    modes.set(node.id, mode);
    (children.get(node.id) || []).forEach((child) => visit(child, mode, depth + 1, seen));
  };
  const seen = new Set();
  (children.get(null) || []).forEach((root) => visit(root, ROOT_MODES[layout] || "h", 0, seen));
  nodes.forEach((node) => { if (!modes.has(node.id)) modes.set(node.id, "h"); });
  return modes;
};

// ------------------------------------------------------------------ layout --

const emptyBox = (width, height) => ({ minX: 0, minY: 0, maxX: width, maxY: height });
const translate = (target, positions, dx, dy) => positions.forEach((point, id) => target.set(id, { x: point.x + dx, y: point.y + dy }));
const growBox = (box, other, dx, dy) => {
  box.minX = Math.min(box.minX, other.minX + dx);
  box.minY = Math.min(box.minY, other.minY + dy);
  box.maxX = Math.max(box.maxX, other.maxX + dx);
  box.maxY = Math.max(box.maxY, other.maxY + dy);
};

const createContext = (nodes, spacing) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();
  nodes.forEach((node) => {
    if (!node.data.parentId || !byId.has(node.data.parentId)) return;
    children.set(node.data.parentId, [...(children.get(node.data.parentId) || []), node.id]);
  });
  const gaps = SPACING[spacing] || SPACING.normal;
  return {
    byId,
    gaps,
    // Collapsed and hidden branches do not reserve any space.
    visibleChildren: (id) => {
      const node = byId.get(id);
      if (!node || node.data.collapsed) return [];
      return (children.get(id) || []).filter((childId) => !byId.get(childId)?.data.hidden);
    },
    size: (id) => nodeVisualSize(byId.get(id)),
    visiting: new Set(),
  };
};

/** Lays out the subtree of `id`; returns positions relative to `id` at (0, 0). */
const layoutSubtree = (id, inherited, ctx, depth) => {
  const node = ctx.byId.get(id);
  const { width, height } = ctx.size(id);
  const positions = new Map([[id, { x: 0, y: 0 }]]);
  const box = emptyBox(width, height);
  const kids = ctx.visibleChildren(id);
  if (!kids.length || ctx.visiting.has(id)) return { positions, box };
  ctx.visiting.add(id);

  const override = OVERRIDE_MODES[node.data.layout];
  const mode = override || inherited.mode;
  const dir = override === "h" || override === "v" ? (inherited.mode === override ? inherited.dir : 1) : inherited.dir;
  const { gaps } = ctx;

  if (mode === "free") {
    kids.forEach((childId) => {
      const child = ctx.byId.get(childId);
      const sub = layoutSubtree(childId, { mode: "free", dir }, ctx, depth + 1);
      const dx = child.position.x - node.position.x;
      const dy = child.position.y - node.position.y;
      translate(positions, sub.positions, dx, dy);
      growBox(box, sub.box, dx, dy);
    });
  } else if (mode === "list") {
    const indent = Math.min(28, width / 3);
    let cursor = height + gaps.list;
    kids.forEach((childId) => {
      const sub = layoutSubtree(childId, { mode: "list", dir }, ctx, depth + 1);
      const dx = dir > 0 ? indent - sub.box.minX : width - indent - sub.box.maxX;
      const dy = cursor - sub.box.minY;
      translate(positions, sub.positions, dx, dy);
      growBox(box, sub.box, dx, dy);
      cursor += sub.box.maxY - sub.box.minY + gaps.list;
    });
  } else {
    const vertical = mode === "v";
    const subs = kids.map((childId) => ({ childId, sub: layoutSubtree(childId, { mode: vertical ? "v" : "h", dir }, ctx, depth + 1) }));
    const along = depth === 0 ? (vertical ? gaps.level * 1.2 : gaps.h * 1.5) : vertical ? gaps.level : gaps.h;
    const placed = [];
    let cursor = 0;
    subs.forEach(({ childId, sub }) => {
      const childSize = ctx.size(childId);
      const isImage = ctx.byId.get(childId)?.type === "image";
      if (vertical) {
        const dx = cursor - sub.box.minX;
        const dy = dir > 0 ? height + along - sub.box.minY : -along - sub.box.maxY;
        placed.push({ sub, dx, dy, anchor: dx + childSize.width / 2 });
        cursor += sub.box.maxX - sub.box.minX + gaps.v * 2;
      } else {
        const dx = dir > 0 ? width + along - sub.box.minX : -along - sub.box.maxX;
        const dy = cursor - sub.box.minY;
        placed.push({ sub, dx, dy, anchor: dy + childSize.height / 2 });
        cursor += sub.box.maxY - sub.box.minY + gaps.v + (isImage ? 12 : 0);
      }
    });
    // Centre the parent between its first and last child (one child → same axis).
    const middle = (placed[0].anchor + placed.at(-1).anchor) / 2;
    const shift = middle - (vertical ? width : height) / 2;
    placed.forEach(({ sub, dx, dy }) => {
      const x = vertical ? dx - shift : dx;
      const y = vertical ? dy : dy - shift;
      translate(positions, sub.positions, x, y);
      growBox(box, sub.box, x, y);
    });
  }

  ctx.visiting.delete(id);
  return { positions, box };
};

const subtreeExtent = (sub, vertical) => (vertical ? sub.box.maxX - sub.box.minX : sub.box.maxY - sub.box.minY);

/** Two-sided root (SimpleMind "Horizontal"/"Vertical"): balance children by size. */
const layoutBalancedRoot = (rootId, ctx, vertical) => {
  const root = ctx.byId.get(rootId);
  const { width, height } = ctx.size(rootId);
  const mode = vertical ? "v" : "h";
  const kids = ctx.visibleChildren(rootId);
  const positions = new Map([[rootId, { x: 0, y: 0 }]]);
  const box = emptyBox(width, height);
  if (!kids.length) return { positions, box };
  const firstSide = vertical ? "bottom" : "right";
  const secondSide = vertical ? "top" : "left";
  const forward = kids.map((childId) => ({ childId, sub: layoutSubtree(childId, { mode, dir: 1 }, ctx, 1) }));
  const total = forward.reduce((sum, item) => sum + subtreeExtent(item.sub, vertical), 0);
  let firstExtent = forward.filter(({ childId }) => ctx.byId.get(childId).data.side === firstSide).reduce((sum, item) => sum + subtreeExtent(item.sub, vertical), 0);
  const sides = new Map();
  forward.forEach(({ childId, sub }) => {
    const preferred = ctx.byId.get(childId).data.side;
    if (preferred === firstSide || preferred === secondSide) { sides.set(childId, preferred); return; }
    const extent = subtreeExtent(sub, vertical);
    const goesFirst = firstExtent + extent / 2 <= total / 2 || firstExtent === 0;
    sides.set(childId, goesFirst ? firstSide : secondSide);
    if (goesFirst) firstExtent += extent;
  });
  const along = vertical ? ctx.gaps.level * 1.2 : ctx.gaps.h * 1.5;
  const placeSide = (ids, dir) => {
    if (!ids.length) return;
    const subs = ids.map((childId) => ({ childId, sub: dir > 0 ? forward.find((item) => item.childId === childId).sub : layoutSubtree(childId, { mode, dir }, ctx, 1) }));
    let cursor = 0;
    const placed = subs.map(({ childId, sub }) => {
      const size = ctx.size(childId);
      const item = vertical
        ? { sub, dx: cursor - sub.box.minX, dy: dir > 0 ? height + along - sub.box.minY : -along - sub.box.maxY, anchor: cursor - sub.box.minX + size.width / 2 }
        : { sub, dx: dir > 0 ? width + along - sub.box.minX : -along - sub.box.maxX, dy: cursor - sub.box.minY, anchor: cursor - sub.box.minY + size.height / 2 };
      cursor += subtreeExtent(sub, vertical) + (vertical ? ctx.gaps.v * 2 : ctx.gaps.v);
      return item;
    });
    const middle = (placed[0].anchor + placed.at(-1).anchor) / 2;
    const shift = middle - (vertical ? width : height) / 2;
    placed.forEach(({ sub, dx, dy }) => {
      const x = vertical ? dx - shift : dx;
      const y = vertical ? dy : dy - shift;
      translate(positions, sub.positions, x, y);
      growBox(box, sub.box, x, y);
    });
  };
  placeSide(kids.filter((childId) => sides.get(childId) === firstSide), 1);
  // Clockwise order: the second side lists its topics bottom-to-top.
  placeSide(kids.filter((childId) => sides.get(childId) === secondSide).reverse(), -1);
  void root;
  return { positions, box };
};

const layoutLinearRoot = (rootId, ctx) => {
  const { width, height } = ctx.size(rootId);
  const positions = new Map([[rootId, { x: 0, y: 0 }]]);
  const box = emptyBox(width, height);
  let cursor = width + ctx.gaps.h * 1.4;
  ctx.visibleChildren(rootId).forEach((childId) => {
    const sub = layoutSubtree(childId, { mode: "list", dir: 1 }, ctx, 1);
    const size = ctx.size(childId);
    const dx = cursor - sub.box.minX;
    const dy = height / 2 - size.height / 2;
    translate(positions, sub.positions, dx, dy);
    growBox(box, sub.box, dx, dy);
    cursor += sub.box.maxX - sub.box.minX + ctx.gaps.h;
  });
  return { positions, box };
};

const layoutMatrixRoot = (rootId, ctx) => {
  const { width, height } = ctx.size(rootId);
  const positions = new Map([[rootId, { x: 0, y: 0 }]]);
  const box = emptyBox(width, height);
  const subs = ctx.visibleChildren(rootId).map((childId) => ({ childId, sub: layoutSubtree(childId, { mode: "list", dir: 1 }, ctx, 1) }));
  if (!subs.length) return { positions, box };
  const columns = Math.ceil(Math.sqrt(subs.length));
  const columnWidths = Array(columns).fill(0);
  const rowHeights = Array(Math.ceil(subs.length / columns)).fill(0);
  subs.forEach(({ sub }, index) => {
    columnWidths[index % columns] = Math.max(columnWidths[index % columns], sub.box.maxX - sub.box.minX);
    rowHeights[Math.floor(index / columns)] = Math.max(rowHeights[Math.floor(index / columns)], sub.box.maxY - sub.box.minY);
  });
  const gapX = ctx.gaps.h;
  const gapY = ctx.gaps.level * 0.7;
  const totalWidth = columnWidths.reduce((sum, value) => sum + value, 0) + gapX * (columns - 1);
  const startX = width / 2 - totalWidth / 2;
  const startY = height + ctx.gaps.level * 1.2;
  subs.forEach(({ sub }, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = startX + columnWidths.slice(0, column).reduce((sum, value) => sum + value + gapX, 0);
    const y = startY + rowHeights.slice(0, row).reduce((sum, value) => sum + value + gapY, 0);
    translate(positions, sub.positions, x - sub.box.minX, y - sub.box.minY);
    growBox(box, sub.box, x - sub.box.minX, y - sub.box.minY);
  });
  return { positions, box };
};

const layoutRadialRoot = (rootId, ctx) => {
  const { width, height } = ctx.size(rootId);
  const positions = new Map([[rootId, { x: 0, y: 0 }]]);
  const box = emptyBox(width, height);
  const kids = ctx.visibleChildren(rootId);
  if (!kids.length) return { positions, box };
  const centerX = width / 2;
  const centerY = height / 2;
  const estimates = kids.map((childId) => layoutSubtree(childId, { mode: "h", dir: 1 }, ctx, 1));
  const circumference = estimates.reduce((sum, sub) => sum + (sub.box.maxY - sub.box.minY) + ctx.gaps.v * 3, 0);
  const radius = Math.max(Math.max(width, height) / 2 + 130, (circumference / (2 * Math.PI)) * 1.25);
  kids.forEach((childId, index) => {
    const angle = -Math.PI / 2 + (index / kids.length) * Math.PI * 2;
    const dir = Math.cos(angle) >= -1e-6 ? 1 : -1;
    const sub = dir > 0 ? estimates[index] : layoutSubtree(childId, { mode: "h", dir: -1 }, ctx, 1);
    const size = ctx.size(childId);
    const dx = centerX + Math.cos(angle) * radius - size.width / 2;
    const dy = centerY + Math.sin(angle) * radius - size.height / 2;
    translate(positions, sub.positions, dx, dy);
    growBox(box, sub.box, dx, dy);
  });
  return { positions, box };
};

const layoutRoot = (rootId, layout, ctx) => {
  const node = ctx.byId.get(rootId);
  const override = OVERRIDE_MODES[node.data.layout];
  if (override) return layoutSubtree(rootId, { mode: override, dir: 1 }, ctx, 0);
  switch (layout) {
    case "horizontal": return layoutBalancedRoot(rootId, ctx, false);
    case "vertical": return layoutBalancedRoot(rootId, ctx, true);
    case "topDown": return layoutSubtree(rootId, { mode: "v", dir: 1 }, ctx, 0);
    case "list": return layoutSubtree(rootId, { mode: "list", dir: 1 }, ctx, 0);
    case "linear": return layoutLinearRoot(rootId, ctx);
    case "matrix": return layoutMatrixRoot(rootId, ctx);
    case "radial": return layoutRadialRoot(rootId, ctx);
    default: return layoutSubtree(rootId, { mode: "h", dir: 1 }, ctx, 0);
  }
};

const boxesOverlap = (first, second, margin) => first.minX < second.maxX + margin && first.maxX + margin > second.minX
  && first.minY < second.maxY + margin && first.maxY + margin > second.minY;

/**
 * Arranges every tree around its own central topic. Central topics (and
 * detached images) keep their position, so several central themes can live
 * anywhere on the canvas; whole trees are only moved down when they would
 * overlap another tree.
 */
export const autoLayout = (nodes, mode = "horizontal", { spacing = "normal" } = {}) => {
  if (!isAutoLayout(mode) || !nodes.length) return nodes;
  const ctx = createContext(nodes, spacing);
  const roots = nodes.filter((node) => !node.data.parentId || !ctx.byId.has(node.data.parentId));
  if (!roots.length) return nodes;
  const positions = new Map();
  const placedBoxes = [];
  roots.forEach((root) => {
    const tree = layoutRoot(root.id, mode, ctx);
    const origin = { x: Number(root.position?.x) || 0, y: Number(root.position?.y) || 0 };
    let dy = 0;
    const box = () => ({ minX: tree.box.minX + origin.x, maxX: tree.box.maxX + origin.x, minY: tree.box.minY + origin.y + dy, maxY: tree.box.maxY + origin.y + dy });
    for (let guard = 0; guard < placedBoxes.length + 1; guard += 1) {
      const blocking = placedBoxes.filter((other) => boxesOverlap(box(), other, 40));
      if (!blocking.length) break;
      dy += Math.max(...blocking.map((other) => other.maxY)) + 80 - box().minY;
    }
    placedBoxes.push(box());
    translate(positions, tree.positions, origin.x, origin.y + dy);
  });
  return nodes.map((node) => {
    const next = positions.get(node.id);
    if (!next || (next.x === node.position.x && next.y === node.position.y)) return node;
    return { ...node, position: { x: Math.round(next.x * 10) / 10, y: Math.round(next.y * 10) / 10 } };
  });
};

/**
 * Where a dragged topic would land among its siblings. Returns the sibling
 * index (in document order) and, for children of a central topic in the
 * two-sided layouts, the side it was dropped on.
 */
export const dropSlotForPosition = (nodes, nodeId, point, layout = "horizontal") => {
  const node = nodes.find((item) => item.id === nodeId);
  const parent = node && nodes.find((item) => item.id === node.data.parentId);
  if (!node || !parent) return null;
  const vertical = computeBranchModes(nodes, layout).get(parent.id) === "v";
  const parentSize = getNodeSize(parent);
  const parentCenter = { x: parent.position.x + parentSize.width / 2, y: parent.position.y + parentSize.height / 2 };
  const isBalancedRoot = !parent.data.parentId && (layout === "horizontal" || layout === "vertical");
  const side = isBalancedRoot
    ? vertical ? (point.y < parentCenter.y ? "top" : "bottom") : (point.x < parentCenter.x ? "left" : "right")
    : node.data.side || "";
  const siblings = nodes.filter((item) => item.data.parentId === parent.id && item.id !== nodeId);
  const sameSide = siblings.filter((item) => {
    if (!isBalancedRoot) return true;
    const size = getNodeSize(item);
    const center = { x: item.position.x + size.width / 2, y: item.position.y + size.height / 2 };
    return vertical ? (center.y < parentCenter.y ? "top" : "bottom") === side : (center.x < parentCenter.x ? "left" : "right") === side;
  });
  const coordinate = (item) => {
    const size = getNodeSize(item);
    return vertical ? item.position.x + size.width / 2 : item.position.y + size.height / 2;
  };
  const target = vertical ? point.x : point.y;
  // Siblings keep document order; on the left/top side of a balanced map that
  // order runs bottom-to-top (clockwise), so the comparison flips.
  const reversed = isBalancedRoot && (side === "left" || side === "top");
  const remaining = nodes.filter((item) => item.id !== nodeId);
  const before = sameSide.find((item) => (reversed ? coordinate(item) < target : coordinate(item) > target));
  let index = remaining.length;
  if (before) index = remaining.indexOf(before);
  else if (sameSide.length) index = remaining.indexOf(sameSide.at(-1)) + 1;
  return { parentId: parent.id, index: Math.max(0, index), side };
};

// ------------------------------------------------------------------- edges --

const handlePair = (mode, sourceNode, targetNode) => {
  const sourceSize = getNodeSize(sourceNode);
  const targetSize = getNodeSize(targetNode);
  const dx = targetNode.position.x + targetSize.width / 2 - (sourceNode.position.x + sourceSize.width / 2);
  const dy = targetNode.position.y + targetSize.height / 2 - (sourceNode.position.y + sourceSize.height / 2);
  if (mode === "list") {
    const right = targetNode.position.x >= sourceNode.position.x;
    return right ? ["list-left", "left", "list"] : ["list-right", "right", "list"];
  }
  const vertical = mode === "v" || ((mode === "radial" || mode === "free" || mode === "cross") && Math.abs(dy) > Math.abs(dx) * 1.1);
  if (vertical) return dy >= 0 ? ["bottom", "top", "v"] : ["top", "bottom", "v"];
  return dx >= 0 ? ["right", "left", "h"] : ["left", "right", "h"];
};

const resolveRelationStyle = (node, relation, fallback) =>
  relation?.style || (node.data.relationStyle && node.data.relationStyle !== "inherit" ? node.data.relationStyle : null) || fallback || "curved";

const dashArray = (dash) => (dash === "dashed" ? "10 7" : dash === "dotted" ? "2 6" : undefined);

const createEdge = ({ id, sourceNode, targetNode, relation = {}, settings, style, mode, isCrossLink = false, crossLinkColor }) => {
  const [sourcePosition, targetPosition, orientation] = handlePair(isCrossLink ? "cross" : mode, sourceNode, targetNode);
  const line = style?.line || {};
  const color = relation.color || (isCrossLink ? crossLinkColor || "#8b5cf6" : line.color || targetNode.data.branchColor || settings.relationColor || "#64748b");
  const dash = relation.dash || (isCrossLink ? "dashed" : line.dash || settings.relationDash || "solid");
  const customWidth = Number(relation.width) > 0 ? Number(relation.width) : null;
  const width = customWidth || (isCrossLink ? 2 : line.startWidth || Number(settings.relationWidth) || 2.5);
  const pathStyle = resolveRelationStyle(targetNode, relation, isCrossLink ? "curved" : line.style || settings.relationStyle);
  return {
    id,
    source: sourceNode.id,
    target: targetNode.id,
    sourceHandle: `s-${sourcePosition}`,
    targetHandle: `t-${targetPosition}`,
    type: "relation",
    data: {
      relationId: id,
      isCrossLink,
      orientation,
      pathStyle,
      color,
      customColor: relation.color || "",
      width,
      endWidth: customWidth || (isCrossLink ? width : line.endWidth || width),
      taper: !isCrossLink && !customWidth && Boolean(line.taper) && pathStyle !== "straight",
      opacity: relation.opacity ?? line.opacity ?? settings.relationOpacity ?? 1,
      dash,
      arrow: relation.arrow || (isCrossLink ? "end" : "none"),
      label: relation.label || "",
      controlPoint: relation.controlPoint || null,
    },
    style: {
      stroke: color,
      strokeWidth: width,
      opacity: relation.opacity ?? line.opacity ?? settings.relationOpacity ?? 1,
      strokeDasharray: dashArray(dash),
    },
  };
};

/**
 * Builds React Flow edges for tree relations and cross links.
 * `options.styles` is the Map from `resolveNodeStyles`; `options.layout` the map layout.
 */
export const buildEdges = (nodes, settings = {}, relations = {}, crossLinks = [], options = {}) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const modes = options.modes || computeBranchModes(nodes, options.layout || "horizontal");
  const styles = options.styles || new Map();
  const treePairs = new Set();
  const treeEdges = nodes.filter((node) => node.data.parentId && byId.has(node.data.parentId)).map((node) => {
    const id = `${node.data.parentId}-${node.id}`;
    treePairs.add(`${node.data.parentId}|${node.id}`);
    treePairs.add(`${node.id}|${node.data.parentId}`);
    return createEdge({
      id,
      sourceNode: byId.get(node.data.parentId),
      targetNode: node,
      relation: relations[id],
      settings,
      style: styles.get(node.id),
      mode: modes.get(node.data.parentId) || "h",
    });
  });
  const seen = new Set();
  const crossEdges = crossLinks.filter((link) => {
    const pair = [link.source, link.target].sort().join("|");
    if (!byId.has(link.source) || !byId.has(link.target) || link.source === link.target || treePairs.has(`${link.source}|${link.target}`) || seen.has(pair)) return false;
    seen.add(pair);
    return true;
  }).map((link) => createEdge({
    id: link.id,
    sourceNode: byId.get(link.source),
    targetNode: byId.get(link.target),
    relation: link,
    settings,
    mode: "cross",
    isCrossLink: true,
    crossLinkColor: options.crossLinkColor,
  }));
  return [...treeEdges, ...crossEdges];
};
