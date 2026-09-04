const VALID_SCOPES = new Set(["node", "branch", "map"]);
const MAX_FIELD_LENGTH = 2_000;

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value, maxLength = MAX_FIELD_LENGTH) => {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
};

const normalizeNodes = (document) => {
  if (!isRecord(document) || !Array.isArray(document.nodes)) return [];

  return document.nodes
    .filter((node) => isRecord(node) && node.id != null && isRecord(node.data))
    .map((node) => ({
      ...node,
      id: String(node.id),
      data: { ...node.data },
    }));
};

const parentIdOf = (node) => {
  const parentId = node?.data?.parentId;
  return parentId == null || parentId === "" ? null : String(parentId);
};

export const collectContextNodes = (document, { scope = "node", nodeId } = {}) => {
  if (!VALID_SCOPES.has(scope)) {
    throw new Error("Phạm vi AI Teacher không hợp lệ.");
  }

  const nodes = normalizeNodes(document);
  if (scope === "map") return nodes;

  const selectedId = nodeId == null ? "" : String(nodeId);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = byId.get(selectedId);
  if (!selected) throw new Error("Không tìm thấy node được chọn trong mind map.");

  const childrenByParent = new Map();
  for (const node of nodes) {
    const parentId = parentIdOf(node);
    if (!parentId) continue;
    const children = childrenByParent.get(parentId) || [];
    children.push(node);
    childrenByParent.set(parentId, children);
  }

  if (scope === "branch") {
    const result = [];
    const queue = [selected];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.id)) continue;
      visited.add(current.id);
      result.push(current);
      queue.push(...(childrenByParent.get(current.id) || []));
    }

    return result;
  }

  const ancestors = [];
  const visited = new Set([selected.id]);
  let parentId = parentIdOf(selected);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parentIdOf(parent);
  }

  return [...ancestors, selected, ...(childrenByParent.get(selected.id) || [])];
};

const describeNode = (node, { selected = false } = {}) => {
  const data = node.data || {};
  const type = cleanText(node.type || data.type || "topic", 40);
  const lines = [`[node:${cleanText(node.id, 128)}] loại=${type}${selected ? " | NOTE ĐƯỢC NGƯỜI DÙNG CHỌN" : ""}`];
  const parentId = parentIdOf(node);
  if (parentId) lines.push(`node cha: ${cleanText(parentId, 128)}`);

  if (type === "image") {
    const caption = cleanText(data.caption || data.label);
    if (caption) lines.push(`chú thích ảnh: ${caption}`);
  } else {
    const title = cleanText(data.label || data.title);
    if (title) lines.push(`tiêu đề: ${title}`);
  }

  const note = cleanText(data.note || data.notes || data.description);
  if (note) lines.push(`ghi chú: ${note}`);

  if (Array.isArray(data.labels)) {
    const labels = data.labels.map((label) => cleanText(label, 80)).filter(Boolean).slice(0, 20);
    if (labels.length) lines.push(`nhãn: ${labels.join(", ")}`);
  }

  if (data.checked === true || data.completed === true) lines.push("trạng thái: hoàn thành");
  if (data.checked === false || data.completed === false) lines.push("trạng thái: chưa hoàn thành");
  const dueDate = cleanText(data.dueDate, 80);
  if (dueDate) lines.push(`hạn: ${dueDate}`);

  return lines.join("\n");
};

export const buildTeacherContext = (
  document,
  { scope = "node", nodeId, maxChars = 12_000 } = {}
) => {
  const safeLimit = Math.max(500, Math.min(Number(maxChars) || 12_000, 30_000));
  const candidates = collectContextNodes(document, { scope, nodeId });
  const sections = [];
  const referencedNodeIds = [];
  let remaining = safeLimit;

  for (const node of candidates) {
    const prefix = sections.length ? "\n\n" : "";
    const section = describeNode(node, {
      selected: scope !== "map" && String(node.id) === String(nodeId),
    });
    if (!section || remaining <= prefix.length) break;

    const available = remaining - prefix.length;
    const included = section.slice(0, available);
    sections.push(included);
    referencedNodeIds.push(node.id);
    remaining -= prefix.length + included.length;
    if (included.length < section.length) break;
  }

  return {
    text: sections.join("\n\n") || "Mind map chưa có nội dung chữ để phân tích.",
    referencedNodeIds,
  };
};

export { VALID_SCOPES };
