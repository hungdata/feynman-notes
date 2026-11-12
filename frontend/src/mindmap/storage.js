import {
  createInitialDocument, createTopicData, DEFAULT_SETTINGS, DOCUMENT_VERSION, IMAGE_NODE_HEIGHT, IMAGE_NODE_WIDTH,
  LEGACY_BRANCH_COLORS, STORAGE_KEY, TEMPLATES,
} from "./constants.js";
import { autoLayout, isAutoLayout } from "./layout.js";
import { styleSheetForLegacyTheme } from "./styles.js";

export const loadDocuments = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) && value.length > 0 ? value.map(migrateDocument) : [createInitialDocument()];
  } catch {
    return [createInitialDocument()];
  }
};

export const saveDocuments = (documents) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
};

const LEGACY_TEMPLATE_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#059669", "#ea580c"];
const AUTOMATIC_BRANCH_COLORS = new Set([...LEGACY_BRANCH_COLORS, ...LEGACY_TEMPLATE_COLORS].map((color) => color.toLowerCase()));
const lower = (value) => String(value || "").toLowerCase();

/**
 * Before style sheets every topic stored explicit colours. Values that equal
 * the old defaults become automatic so the style sheet can style them; any
 * colour the user picked stays as an override.
 */
const clearLegacyDefaults = (data) => {
  const isRoot = !data.parentId;
  const next = { ...data };
  const defaults = isRoot
    ? { color: "#172554", textColor: "#ffffff", borderColor: "#2563eb", fontSize: 18, fontWeight: 700 }
    : { color: "#ffffff", textColor: "#172033", borderColor: "#dbe4f0", fontSize: 15, fontWeight: 600 };
  ["color", "textColor", "borderColor"].forEach((field) => { if (lower(next[field]) === defaults[field]) next[field] = ""; });
  if (Number(next.fontSize) === defaults.fontSize) next.fontSize = null;
  if (Number(next.fontWeight) === defaults.fontWeight) next.fontWeight = null;
  if (AUTOMATIC_BRANCH_COLORS.has(lower(next.branchColor))) next.branchColor = "";
  // A branch colour picked in the old inspector also set the border colour.
  if (next.branchColor && lower(next.borderColor) === lower(next.branchColor)) next.borderColor = "";
  if (next.checked) next.checkbox = true;
  return next;
};

const normalizeNode = (node, legacy) => {
  const type = node.type || "topic";
  if (type === "image") {
    return {
      ...node,
      type,
      data: {
        parentId: null, caption: "", note: "", rotation: 0, locked: false, collapsed: false, zIndex: 1, link: "",
        relationStyle: "inherit", layout: "inherit", branchColor: "", side: "",
        ...node.data,
        ...(legacy && AUTOMATIC_BRANCH_COLORS.has(lower(node.data?.branchColor)) ? { branchColor: "" } : {}),
      },
    };
  }
  const label = node.data?.label === "Chủ đề mới" ? "" : (node.data?.label ?? "Chủ đề");
  const data = createTopicData({ ...node.data, label });
  return { ...node, type, data: legacy ? clearLegacyDefaults(data) : data };
};

const migrateSettings = (settings = {}, legacy, nodes) => {
  const next = { ...DEFAULT_SETTINGS, ...settings };
  if (legacy) {
    next.styleSheet = settings.styleSheet || styleSheetForLegacyTheme(settings.theme);
    if (lower(settings.background) === "#f7f9fc") next.background = "";
    if (settings.relationStyle === "straight") next.relationStyle = "";
    if (lower(settings.relationColor) === "#64748b") next.relationColor = "";
    if (Number(settings.relationWidth) === 2.5) next.relationWidth = null;
    if (settings.grid === "dots") next.grid = "none";
    // The old app showed a "understood" check on every topic; keep it for maps that use it.
    if (typeof settings.checkboxes !== "boolean") next.checkboxes = nodes.some((node) => node.data?.checked === true);
    delete next.theme;
  }
  return next;
};

export const migrateDocument = (document) => {
  const defaults = createInitialDocument();
  const version = Number(document.version || 0);
  const legacy = version < 7;
  const rawLayout = document.layout || "horizontal";
  // Very old maps used "right" for what is now the two-sided horizontal map.
  const layout = legacy && rawLayout === "right" ? "horizontal" : rawLayout;
  let nodes = (Array.isArray(document.nodes) ? document.nodes : defaults.nodes).map((node) => normalizeNode(node, legacy));
  if (version < 5) {
    nodes = nodes.map((node) => node.type === "image" ? { ...node, style: { ...node.style, width: IMAGE_NODE_WIDTH, height: IMAGE_NODE_HEIGHT } } : node);
  }
  if (legacy) {
    // Topics no longer use fixed 450px cards: forget stale measurements and
    // reflow once with text-based sizes (React Flow re-measures right after).
    nodes = nodes.map((node) => {
      if (node.type === "image") return node;
      const rest = { ...node };
      delete rest.measured;
      delete rest.width;
      delete rest.height;
      return rest;
    });
  }
  const settings = migrateSettings(document.settings, legacy, nodes);
  if (legacy && isAutoLayout(layout)) nodes = autoLayout(nodes, layout, { spacing: settings.spacing });
  return {
    ...defaults,
    ...document,
    version: DOCUMENT_VERSION,
    layout,
    folder: document.folder || "",
    favorite: document.favorite === true,
    trashedAt: document.trashedAt || null,
    description: document.description || "",
    settings,
    relations: document.relations || {},
    // Version 3 allowed dragging node handles, which could create unintended links.
    crossLinks: version < 4 ? [] : (Array.isArray(document.crossLinks) ? document.crossLinks : []),
    nodes,
  };
};

const templateNodes = (branches, parentId) => branches.flatMap((branch) => {
  const [label, children = []] = Array.isArray(branch) ? branch : [branch];
  const id = crypto.randomUUID();
  return [
    { id, type: "topic", position: { x: 0, y: 0 }, data: createTopicData({ label, parentId }) },
    ...templateNodes(children, id),
  ];
});

export const createFromTemplate = (templateId) => {
  const template = TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[0];
  const document = createInitialDocument({
    title: template.id === "blank" ? "Bản đồ ý tưởng mới" : template.name,
    styleSheet: template.styleSheet || "default",
    layout: template.layout || "horizontal",
  });
  if (template.id !== "blank") document.nodes[0].data.label = template.name;
  document.nodes.push(...templateNodes(template.branches || [], "root"));
  document.nodes = autoLayout(document.nodes, document.layout);
  return document;
};

export const validateImportedDocument = (value) => {
  if (!value || typeof value !== "object" || !Array.isArray(value.nodes)) {
    throw new Error("Tệp không phải tài liệu mind map hợp lệ.");
  }
  if (!value.nodes.some((node) => !node.data?.parentId)) {
    throw new Error("Mind map phải có một root topic.");
  }
  return migrateDocument({
    ...value,
    // Imported files without a version are treated as pre-style-sheet maps,
    // but never old enough to drop their cross links.
    version: Math.max(4, Number(value.version) || 6),
    id: crypto.randomUUID(),
    title: `${value.title || "Mind map nhập"} (import)`,
    favorite: false,
    trashedAt: null,
    updatedAt: new Date().toISOString(),
  });
};
