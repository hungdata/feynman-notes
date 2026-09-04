export const TOPIC_NODE_WIDTH = 450;
export const HORIZONTAL_GAP = 590;
const DEFAULT_NODE_WIDTH = TOPIC_NODE_WIDTH;
const DEFAULT_TOPIC_HEIGHT = 76;
// A normal 76px topic keeps the original 220px row rhythm.  Taller cards get
// more space only next to the branch that actually contains them.
const VERTICAL_GAP = 220;
const MINIMUM_BRANCH_GAP = VERTICAL_GAP - DEFAULT_TOPIC_HEIGHT;
const MINIMUM_COLUMN_GAP = HORIZONTAL_GAP - DEFAULT_NODE_WIDTH;

const readSize = (value) => {
  const size = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(size) && size > 0 ? size : null;
};

const nodeWidth = (node) =>
  readSize(node?.measured?.width) || readSize(node?.width) || readSize(node?.style?.width) || DEFAULT_NODE_WIDTH;

const nodeHeight = (node) => {
  const measuredHeight = readSize(node?.measured?.height);
  const explicitHeight = readSize(node?.height) || readSize(node?.style?.height);
  if (node?.type === "image") return measuredHeight || explicitHeight || 160;
  // A topic with an attached picture contains up to 145px of image content,
  // plus the topic card itself. Reserve that real visual height in layout.
  const topicImageHeight = Math.min(145, Math.max(36, readSize(node?.data?.topicImageHeight) || 145));
  const intrinsicHeight = node?.data?.imageAssetId ? DEFAULT_TOPIC_HEIGHT + topicImageHeight : DEFAULT_TOPIC_HEIGHT;
  // When an image was just attached React Flow can still report the old 76px
  // measurement for one frame. Never let that stale value win over the
  // intrinsic height we already know from the asset.
  return Math.max(measuredHeight || 0, explicitHeight || 0, intrinsicHeight);
};

// React Flow measures an image before the CSS rotation applied inside
// `ImageNode`. For spacing, use the image's rotated axis-aligned bounding box
// instead of the unrotated DOM dimensions. The returned dimensions are only
// used for layout; `nodeWidth`/`nodeHeight` remain the actual node box used by
// React Flow and its handles.
const nodeVisualSize = (node) => {
  const width = nodeWidth(node);
  const height = nodeHeight(node);
  if (node?.type !== "image") return { width, height };
  const degrees = readSize(node?.data?.rotation) || 0;
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
  return {
    x: position.x + (baseWidth - visual.width) / 2,
    y: position.y + (baseHeight - visual.height) / 2,
    width: visual.width,
    height: visual.height,
  };
};

const resolveRelationStyle = (node, relation, settings) =>
  relation?.style || (node.data.relationStyle !== "inherit" ? node.data.relationStyle : null) || settings.relationStyle || "curved";

const createEdge = ({ id, source, target, sourceNode, targetNode, relation = {}, settings, isCrossLink = false }) => {
  const isLeft = sourceNode && targetNode.position.x < sourceNode.position.x;
  const dash = relation.dash || settings.relationDash || "solid";
  return {
    id, source, target,
    sourceHandle: isLeft ? "source-left" : "source-right",
    targetHandle: isLeft ? "target-right" : "target-left",
    type: "relation",
    data: {
      relationId: id,
      isCrossLink,
      pathStyle: resolveRelationStyle(targetNode, relation, settings),
      color: relation.color || targetNode.data.branchColor || settings.relationColor,
      width: relation.width || settings.relationWidth,
      opacity: relation.opacity ?? settings.relationOpacity,
      dash,
      label: relation.label || "",
      controlPoint: relation.controlPoint || null,
    },
    style: {
      stroke: relation.color || targetNode.data.branchColor || settings.relationColor,
      strokeWidth: relation.width || settings.relationWidth,
      opacity: relation.opacity ?? settings.relationOpacity,
      strokeDasharray: dash === "dashed" ? "10 7" : dash === "dotted" ? "2 7" : undefined,
    },
  };
};

export const buildEdges = (nodes, settings = {}, relations = {}, crossLinks = []) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const treePairs = new Set();
  const treeEdges = nodes.filter((node) => node.data.parentId && byId.has(node.data.parentId)).map((node) => createEdge({
    id: `${node.data.parentId}-${node.id}`,
    source: node.data.parentId,
    target: node.id,
    sourceNode: byId.get(node.data.parentId),
    targetNode: node,
    relation: relations[`${node.data.parentId}-${node.id}`],
    settings,
  })).map((edge) => {
    treePairs.add(`${edge.source}|${edge.target}`);
    treePairs.add(`${edge.target}|${edge.source}`);
    return edge;
  });
  const seenCrossLinks = new Set();
  const validCrossLinks = crossLinks.filter((link) => {
    const pair = [link.source, link.target].sort().join("|");
    if (!byId.has(link.source) || !byId.has(link.target) || treePairs.has(`${link.source}|${link.target}`) || seenCrossLinks.has(pair)) return false;
    seenCrossLinks.add(pair);
    return true;
  }).map((link) => createEdge({
    id: link.id,
    source: link.source,
    target: link.target,
    sourceNode: byId.get(link.source),
    targetNode: byId.get(link.target),
    relation: link,
    settings,
    isCrossLink: true,
  }));
  return [...treeEdges, ...validCrossLinks];
};

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

export const findDropParent = (nodes, movingId, point, margin = 28) => {
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

export const alignSingleChildChains = (nodes) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();
  nodes.filter((node) => node.data.parentId).forEach((node) => {
    childrenByParent.set(node.data.parentId, [...(childrenByParent.get(node.data.parentId) || []), node.id]);
  });
  const resolvedAnchors = new Map();
  const anchorOffset = (node) => nodeHeight(node) / 2;
  const resolveAnchorY = (node, visiting = new Set()) => {
    if (resolvedAnchors.has(node.id)) return resolvedAnchors.get(node.id);
    if (visiting.has(node.id)) return node.position.y + anchorOffset(node);
    const parent = byId.get(node.data.parentId);
    if (!parent || childrenByParent.get(parent.id)?.length !== 1) {
      const anchorY = node.position.y + anchorOffset(node);
      resolvedAnchors.set(node.id, anchorY);
      return anchorY;
    }
    const nextVisiting = new Set(visiting).add(node.id);
    const anchorY = resolveAnchorY(parent, nextVisiting);
    resolvedAnchors.set(node.id, anchorY);
    return anchorY;
  };
  return nodes.map((node) => {
    const y = resolveAnchorY(node) - anchorOffset(node);
    return y === node.position.y ? node : { ...node, position: { ...node.position, y } };
  });
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

const depthFirst = (nodes, rootId) => {
  const ordered = [];
  const visit = (id, depth = 0) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return;
    ordered.push({ node, depth });
    nodes.filter((item) => item.data.parentId === id).forEach((child) => visit(child.id, depth + 1));
  };
  visit(rootId);
  return ordered;
};

/**
 * Height-aware tidy-tree layout.
 *
 * The old layout assigned every leaf a fixed Y row, then independently pushed
 * cards in each X column down.  That could split a branch apart: a parent in
 * the row above visually crossed descendants in the row below.  Here each
 * subtree owns a non-overlapping vertical block first, and every descendant
 * is placed inside that block.  Moving one row can therefore never cut into
 * another branch.
 */
const horizontalLayout = (nodes, root, positions) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map();
  nodes.forEach((node) => {
    if (!node.data.parentId) return;
    childrenByParent.set(node.data.parentId, [...(childrenByParent.get(node.data.parentId) || []), node.id]);
  });
  const metrics = new Map();
  const maxWidthByDepth = new Map();
  const trackColumns = (id, depth, visiting = new Set()) => {
    if (visiting.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    maxWidthByDepth.set(depth, Math.max(maxWidthByDepth.get(depth) || 0, nodeVisualSize(node).width));
    const nextVisiting = new Set(visiting).add(id);
    (childrenByParent.get(id) || []).forEach((childId) => trackColumns(childId, depth + 1, nextVisiting));
  };
  trackColumns(root.id, 0);
  const columnX = new Map();
  let cursorX = 0;
  for (let depth = 0; maxWidthByDepth.has(depth); depth += 1) {
    columnX.set(depth, cursorX);
    cursorX += (maxWidthByDepth.get(depth) || DEFAULT_NODE_WIDTH) + MINIMUM_COLUMN_GAP;
  }
  const gapBetween = (first, second) => Math.max(
    MINIMUM_BRANCH_GAP,
    first.maxVisualHeight / 2,
    second.maxVisualHeight / 2,
  );
  const measure = (id, visiting = new Set()) => {
    if (metrics.has(id)) return metrics.get(id);
    const node = byId.get(id);
    if (!node) return { height: 0, childrenHeight: 0, maxVisualHeight: DEFAULT_TOPIC_HEIGHT };
    const ownHeight = nodeVisualSize(node).height;
    if (visiting.has(id)) return { height: ownHeight, childrenHeight: 0, maxVisualHeight: ownHeight };
    const nextVisiting = new Set(visiting).add(id);
    const childMetrics = (childrenByParent.get(id) || []).map((childId) => ({ id: childId, metric: measure(childId, nextVisiting) }));
    const childrenHeight = childMetrics.reduce((total, child, index) => total + child.metric.height
      + (index ? gapBetween(childMetrics[index - 1].metric, child.metric) : 0), 0);
    const metric = {
      height: Math.max(ownHeight, childrenHeight),
      childrenHeight,
      maxVisualHeight: Math.max(ownHeight, ...childMetrics.map((child) => child.metric.maxVisualHeight)),
    };
    metrics.set(id, metric);
    return metric;
  };
  const place = (id, top, depth) => {
    const node = byId.get(id);
    if (!node) return;
    const metric = measure(id);
    const visual = nodeVisualSize(node);
    const baseWidth = nodeWidth(node);
    const baseHeight = nodeHeight(node);
    const x = columnX.get(depth) ?? depth * HORIZONTAL_GAP;
    positions.set(id, {
      // `position` is the unrotated React Flow box. Offset it so its visual
      // bounding box starts at the reserved column/row coordinates.
      x: x + (visual.width - baseWidth) / 2,
      y: top + (metric.height - visual.height) / 2 + (visual.height - baseHeight) / 2,
    });
    const children = childrenByParent.get(id) || [];
    let cursor = top + (metric.height - metric.childrenHeight) / 2;
    children.forEach((childId, index) => {
      const childMetric = measure(childId);
      place(childId, cursor, depth + 1);
      cursor += childMetric.height;
      if (index < children.length - 1) cursor += gapBetween(childMetric, measure(children[index + 1]));
    });
  };
  place(root.id, 0, 0);
};

const verticalLayout = (nodes, root, positions) => {
  let column = 0;
  const visit = (id, depth) => {
    const children = nodes.filter((node) => node.data.parentId === id);
    if (!children.length) { positions.set(id, { x: column++ * 330, y: depth * 150 }); return; }
    const start = column;
    children.forEach((child) => visit(child.id, depth + 1));
    positions.set(id, { x: ((start + column - 1) / 2) * 330, y: depth * 150 });
  };
  visit(root.id, 0);
};

const rectanglesIntersect = (first, second) =>
  first.x < second.x + second.width && first.x + first.width > second.x
  && first.y < second.y + second.height && first.y + first.height > second.y;

/**
 * Local branch layout choices are applied after the main tidy-tree pass. They
 * may intentionally place a subtree differently, but they must never put a
 * card on top of another card. Resolve only actual visual collisions and move
 * the lower branch as a unit; normal inherited branches already have no
 * collisions, so they retain their compact spacing.
 */
const resolveHorizontalCollisions = (nodes) => {
  let result = nodes;
  const maxPasses = Math.max(1, nodes.length * nodes.length);
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const entries = result.map((node) => ({ node, bounds: visualBounds(node) }))
      .sort((first, second) => first.bounds.y - second.bounds.y || first.node.id.localeCompare(second.node.id));
    let resolution = null;
    for (let firstIndex = 0; firstIndex < entries.length && !resolution; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
        const first = entries[firstIndex];
        const second = entries[secondIndex];
        if (second.bounds.y >= first.bounds.y + first.bounds.height) break;
        if (!rectanglesIntersect(first.bounds, second.bounds)) continue;
        const secondDescendants = getDescendantIds(result, second.node.id);
        // Keep the parent in place whenever the pair is an ancestor/child;
        // otherwise move the visually lower independent branch.
        const stationary = secondDescendants.has(first.node.id) ? second : first;
        const moving = secondDescendants.has(first.node.id) ? first : second;
        const minimumGap = Math.max(
          MINIMUM_BRANCH_GAP,
          stationary.bounds.height / 2,
          moving.bounds.height / 2,
        );
        const offset = stationary.bounds.y + stationary.bounds.height + minimumGap - moving.bounds.y;
        if (offset > 0) resolution = { id: moving.node.id, offset };
        break;
      }
    }
    if (!resolution) return result;
    const branch = getDescendantIds(result, resolution.id);
    branch.add(resolution.id);
    result = result.map((node) => branch.has(node.id)
      ? { ...node, position: { ...node.position, y: node.position.y + resolution.offset } }
      : node);
  }
  return result;
};

export const autoLayout = (nodes, mode = "horizontal") => {
  if (mode === "freeForm") return nodes;
  const knownIds = new Set(nodes.map((node) => node.id));
  // Detached images and imported nodes whose parent was removed are still
  // visual elements. Treat them as independent forest roots rather than
  // leaving them at an old coordinate where they can cover the map.
  const roots = nodes.filter((node) => !node.data.parentId || !knownIds.has(node.data.parentId));
  if (!roots.length) return nodes;
  const positions = new Map();
  let forestOffset = 0;
  roots.forEach((root) => {
    const descendantIds = getDescendantIds(nodes, root.id);
    const tree = nodes.filter((node) => node.id === root.id || descendantIds.has(node.id));
    const ordered = depthFirst(nodes, root.id);
    if (mode === "vertical" || mode === "topDown") verticalLayout(tree, root, positions);
    else if (mode === "linear") ordered.forEach(({ node }, index) => positions.set(node.id, { x: index * HORIZONTAL_GAP, y: 0 }));
    else if (mode === "list") ordered.forEach(({ node, depth }, index) => positions.set(node.id, { x: depth * 58, y: index * 76 }));
    else if (mode === "matrix") ordered.forEach(({ node }, index) => positions.set(node.id, { x: (index % 4) * 360, y: Math.floor(index / 4) * 150 }));
    else if (mode === "radial") {
      positions.set(root.id, { x: 0, y: 0 });
      ordered.slice(1).forEach(({ node, depth }, index, descendants) => {
        const angle = (index / Math.max(1, descendants.length)) * Math.PI * 2;
        const radius = 190 + (depth - 1) * 145;
        positions.set(node.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
      });
    } else horizontalLayout(tree, root, positions);
    const treePositions = tree.map((node) => ({ node, position: positions.get(node.id) })).filter((item) => item.position);
    const bounds = treePositions.map((item) => visualBounds(item.node, item.position));
    const minX = Math.min(...bounds.map((item) => item.x));
    const maxRight = Math.max(...bounds.map((item) => item.x + item.width));
    const width = maxRight - minX + MINIMUM_COLUMN_GAP;
    tree.forEach((node) => {
      const position = positions.get(node.id);
      if (position) positions.set(node.id, { x: position.x + forestOffset, y: position.y });
    });
    forestOffset += width;
  });
  let result = nodes.map((node) => ({
    ...node,
    position: positions.has(node.id) ? { x: positions.get(node.id).x + 180, y: positions.get(node.id).y + 120 } : node.position,
  }));
  result.filter((node) => node.data.layout && node.data.layout !== "inherit" && node.data.layout !== "freeForm").forEach((parent) => {
    const children = result.filter((node) => node.data.parentId === parent.id);
    children.forEach((child, index) => {
      const angle = (index / Math.max(1, children.length)) * Math.PI * 2;
      const desired = parent.data.layout === "radial"
        ? { x: parent.position.x + Math.cos(angle) * 220, y: parent.position.y + Math.sin(angle) * 150 }
        : parent.data.layout === "vertical"
          ? { x: parent.position.x + (index - (children.length - 1) / 2) * 330, y: parent.position.y + 150 }
          : parent.data.layout === "list"
            ? { x: parent.position.x + 220, y: parent.position.y + index * 76 }
            : { x: parent.position.x + HORIZONTAL_GAP, y: parent.position.y + (index - (children.length - 1) / 2) * VERTICAL_GAP };
      const dx = desired.x - child.position.x;
      const dy = desired.y - child.position.y;
      const branch = getDescendantIds(result, child.id);
      branch.add(child.id);
      result = result.map((node) => branch.has(node.id) ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } } : node);
    });
  });
  return mode === "horizontal" ? resolveHorizontalCollisions(result) : result;
};
