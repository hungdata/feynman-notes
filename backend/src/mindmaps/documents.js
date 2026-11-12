import crypto from "node:crypto";

export const MAX_NODES = 5_000;
export const MAX_TITLE_LENGTH = 200;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

export class MindMapInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MindMapInputError";
    this.status = status;
  }
}

export const normalizeDocumentId = (value) => {
  const id = String(value ?? "").trim();
  if (!DOCUMENT_ID_PATTERN.test(id)) throw new MindMapInputError("Mã mind map không hợp lệ (chỉ gồm chữ, số, - _ . : và tối đa 128 ký tự).");
  return id;
};

const cleanText = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Accepts `{ document: {...} }` (app format) or the document itself (API convenience). */
export const readDocumentFromBody = (body) => {
  const document = isPlainObject(body?.document) ? body.document : body;
  if (!isPlainObject(document) || !Array.isArray(document.nodes)) {
    throw new MindMapInputError("Mind map không hợp lệ: cần một object có mảng `nodes`.");
  }
  if (document.nodes.length > MAX_NODES) throw new MindMapInputError(`Mind map vượt quá ${MAX_NODES} topic.`, 413);
  if (document.nodes.some((node) => !isPlainObject(node) || typeof node.id !== "string" || !node.id)) {
    throw new MindMapInputError("Mỗi topic cần có `id` dạng chuỗi.");
  }
  return document;
};

export const prepareDocumentForSave = (document, documentId, previous = null) => ({
  ...document,
  id: documentId,
  title: cleanText(document.title, MAX_TITLE_LENGTH) || "Mind map",
  createdAt: previous?.document?.createdAt || document.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const META_FIELDS = {
  title: (value) => cleanText(value, MAX_TITLE_LENGTH) || "Mind map",
  folder: (value) => cleanText(value, 80),
  favorite: (value) => value === true,
  description: (value) => String(value ?? "").slice(0, 2_000),
};

/** Only metadata can be changed through PATCH; topics are saved with PUT. */
export const applyMetadataPatch = (document, body = {}) => {
  const updates = Object.fromEntries(Object.entries(META_FIELDS)
    .filter(([field]) => Object.hasOwn(body, field))
    .map(([field, normalize]) => [field, normalize(body[field])]));
  if (!Object.keys(updates).length) throw new MindMapInputError("Không có thay đổi. Có thể sửa: title, folder, favorite, description.");
  return { ...document, ...updates };
};

/** Minimal valid document; the web app fills in every visual default. */
export const createBlankDocument = ({ title = "Bản đồ ý tưởng mới", id = crypto.randomUUID(), topics = [] } = {}) => {
  const name = cleanText(title, MAX_TITLE_LENGTH) || "Bản đồ ý tưởng mới";
  const rootId = "root";
  return {
    id,
    title: name,
    layout: "horizontal",
    settings: { styleSheet: "default" },
    relations: {},
    crossLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [
      { id: rootId, type: "topic", position: { x: 0, y: 0 }, data: { label: name, parentId: null } },
      ...topics.slice(0, 200).map((label) => ({
        id: crypto.randomUUID(),
        type: "topic",
        position: { x: 0, y: 0 },
        data: { label: cleanText(label, 500), parentId: rootId },
      })),
    ],
  };
};

/** Copies a map with fresh topic ids so it can live next to the original. */
export const duplicateDocument = (document) => {
  const idMap = new Map((document.nodes || []).map((node) => [node.id, node.id === "root" ? "root" : crypto.randomUUID()]));
  const mapId = (id) => idMap.get(id) || id;
  return {
    ...structuredClone(document),
    id: crypto.randomUUID(),
    title: `${document.title || "Mind map"} (bản sao)`.slice(0, MAX_TITLE_LENGTH),
    favorite: false,
    trashedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: (document.nodes || []).map((node) => ({
      ...structuredClone(node),
      id: mapId(node.id),
      data: { ...structuredClone(node.data || {}), parentId: node.data?.parentId ? mapId(node.data.parentId) : null },
    })),
    crossLinks: (document.crossLinks || []).map((link) => ({ ...link, id: `cross-${crypto.randomUUID()}`, source: mapId(link.source), target: mapId(link.target) })),
    // Relation keys are `${parentId}-${childId}` and ids may contain dashes,
    // so rebuild them from the tree instead of splitting strings.
    relations: Object.fromEntries((document.nodes || [])
      .filter((node) => node.data?.parentId && document.relations?.[`${node.data.parentId}-${node.id}`])
      .map((node) => [`${mapId(node.data.parentId)}-${mapId(node.id)}`, structuredClone(document.relations[`${node.data.parentId}-${node.id}`])])),
  };
};

export const summarizeDocument = (document) => ({
  id: document.id,
  title: document.title || "Mind map",
  folder: document.folder || "",
  favorite: document.favorite === true,
  trashedAt: document.trashedAt || null,
  topicCount: Array.isArray(document.nodes) ? document.nodes.filter((node) => node.type !== "image").length : 0,
  layout: document.layout || "horizontal",
  createdAt: document.createdAt || null,
  updatedAt: document.updatedAt || null,
});

// ---------------------------------------------------------------- exports --

const buildTree = (document) => {
  const topics = (document.nodes || []).filter((node) => node.type !== "image");
  const ids = new Set(topics.map((node) => node.id));
  const children = new Map();
  topics.forEach((node) => {
    const parent = ids.has(node.data?.parentId) ? node.data.parentId : null;
    children.set(parent, [...(children.get(parent) || []), node]);
  });
  return children;
};

const walk = (document, visit) => {
  const children = buildTree(document);
  const seen = new Set();
  const step = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    visit(node, depth, () => (children.get(node.id) || []).forEach((child) => step(child, depth + 1)));
  };
  (children.get(null) || []).forEach((root) => step(root, 0));
};

const labelOf = (node) => String(node.data?.label || "").replace(/\s+/g, " ").trim() || "(trống)";
const escapeXml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);

export const exportDocument = (document, format) => {
  if (format === "json") {
    return { body: JSON.stringify(document, null, 2), type: "application/json", extension: "feynman.json" };
  }
  if (format === "md" || format === "markdown") {
    const lines = [`# ${document.title || "Mind map"}`, ""];
    walk(document, (node, depth, next) => {
      const check = node.data?.checkbox || node.data?.checked ? (node.data?.checked ? "[x] " : "[ ] ") : "";
      lines.push(`${"  ".repeat(depth)}- ${check}${labelOf(node)}`);
      if (node.data?.note) String(node.data.note).split("\n").forEach((line) => lines.push(`${"  ".repeat(depth + 1)}> ${line}`));
      next();
    });
    return { body: `${lines.join("\n")}\n`, type: "text/markdown; charset=utf-8", extension: "md" };
  }
  if (format === "txt" || format === "text") {
    const lines = [];
    walk(document, (node, depth, next) => { lines.push(`${"\t".repeat(depth)}${labelOf(node)}`); next(); });
    return { body: `${lines.join("\n")}\n`, type: "text/plain; charset=utf-8", extension: "txt" };
  }
  if (format === "opml") {
    const parts = [];
    const render = (node, depth, next) => {
      const note = node.data?.note ? ` _note="${escapeXml(node.data.note)}"` : "";
      parts.push(`${"  ".repeat(depth + 2)}<outline text="${escapeXml(labelOf(node))}"${note}>`);
      next();
      parts.push(`${"  ".repeat(depth + 2)}</outline>`);
    };
    walk(document, render);
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${escapeXml(document.title || "Mind map")}</title></head>\n  <body>\n${parts.join("\n")}\n  </body>\n</opml>\n`;
    return { body, type: "text/x-opml; charset=utf-8", extension: "opml" };
  }
  throw new MindMapInputError("Định dạng xuất không hỗ trợ. Dùng: json, md, txt, opml.");
};

export const safeDownloadName = (title, extension) =>
  `${String(title || "mind-map").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().slice(0, 120) || "mind-map"}.${extension}`;
