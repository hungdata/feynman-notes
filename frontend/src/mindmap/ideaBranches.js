import { createTopicData } from "./constants.js";
import { autoLayout, getNodeSize, isAutoLayout } from "./layout.js";

const MAX_IDEA_BRANCHES = 6;
const MAX_IDEA_CHILDREN = 3;
const MAX_LABEL_LENGTH = 100;
const MAX_MAP_NODES = 5_000;

const labelOf = (value) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, MAX_LABEL_LENGTH) : "";
const labelKey = (value) => labelOf(value).normalize("NFKC").toLocaleLowerCase("vi");
const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
const coordinate = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const defaultLayout = (document, nodes) => isAutoLayout(document.layout)
  ? autoLayout(nodes, document.layout, { spacing: document.settings?.spacing })
  : nodes;

const boundsOf = (node) => ({
  x: coordinate(node.position?.x),
  y: coordinate(node.position?.y),
  ...getNodeSize(node),
});
const overlap = (a, b) => a.x < b.x + b.width + 16 && a.x + a.width + 16 > b.x
  && a.y < b.y + b.height + 16 && a.y + a.height + 16 > b.y;

/** Build one immutable map update. Generated data supplies topic labels only. */
export const insertIdeaBranches = (document, { documentId, sourceNodeId, branches } = {}, {
  idFactory = () => crypto.randomUUID(),
  layout = defaultLayout,
  maxNodes = MAX_MAP_NODES,
} = {}) => {
  if (!document || document.id !== documentId || !Array.isArray(document.nodes)) return null;
  const source = document.nodes.find((node) => node.id === sourceNodeId && node.type === "topic");
  if (!source || !Array.isArray(branches)) return null;

  const nodes = [...document.nodes];
  const ids = new Set(nodes.map((node) => node.id));
  const addedIds = [];
  const branchIds = [];
  const expandedIds = new Set();
  let skippedCount = 0;

  const findOrAdd = (parent, suggestion) => {
    const label = labelOf(suggestion?.label);
    if (!label) return null;
    const existing = nodes.find((node) => node.type === "topic" && node.data?.parentId === parent.id && labelKey(node.data.label) === labelKey(label));
    if (existing) { skippedCount += 1; return existing; }

    let id = String(idFactory());
    if (!id || ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    const parentBounds = boundsOf(parent);
    const node = {
      id,
      type: "topic",
      position: { x: parentBounds.x + parentBounds.width + 80, y: parentBounds.y },
      data: createTopicData({ label, parentId: parent.id }),
    };
    // Free-form branches keep their manual positions, so reserve non-overlapping
    // initial positions instead of stacking all new topics on top of each other.
    const boxes = nodes.map(boundsOf).sort((first, second) => first.y - second.y);
    let bounds = boundsOf(node);
    for (const box of boxes) {
      if (overlap(bounds, box)) {
        node.position.y = box.y + box.height + 24;
        bounds = boundsOf(node);
      }
    }
    nodes.push(node);
    addedIds.push(id);
    expandedIds.add(parent.id);
    return node;
  };

  for (const branch of branches.filter(isRecord).filter((item) => labelOf(item.label)).slice(0, MAX_IDEA_BRANCHES)) {
    const parent = findOrAdd(source, branch);
    if (!parent) continue;
    branchIds.push(parent.id);
    const children = Array.isArray(branch.children) ? branch.children : [];
    for (const child of children.filter(isRecord).filter((item) => labelOf(item.label)).slice(0, MAX_IDEA_CHILDREN)) {
      findOrAdd(parent, child);
    }
  }

  const summary = { addedCount: addedIds.length, addedIds, branchIds: [...new Set(branchIds)], skippedCount };
  if (!addedIds.length) return { ...summary, document };
  if (nodes.length > maxNodes) return {
    document,
    addedCount: 0,
    addedIds: [],
    branchIds: [],
    skippedCount,
    errorCode: "IDEA_NODE_LIMIT",
    message: "Sơ đồ vượt quá giới hạn 5.000 topic. Hãy chọn ít nhánh hơn hoặc tạo sơ đồ mới.",
  };

  const visibleNodes = nodes.map((node) => expandedIds.has(node.id) && (node.data.collapsed || node.data.hidden)
    ? { ...node, data: { ...node.data, collapsed: false, hidden: false } }
    : node);
  return { ...summary, document: { ...document, nodes: layout(document, visibleNodes) } };
};
