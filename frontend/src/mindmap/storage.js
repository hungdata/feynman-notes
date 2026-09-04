import { createInitialDocument, DOCUMENT_VERSION, IMAGE_NODE_HEIGHT, IMAGE_NODE_WIDTH, STORAGE_KEY, TEMPLATES } from "./constants.js";
import { autoLayout } from "./layout.js";

export const loadDocuments = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(value) && value.length > 0
      ? value.map(migrateDocument)
      : [createInitialDocument()];
  } catch {
    return [createInitialDocument()];
  }
};

const normalizeNode = (node) => ({
  ...node,
  type: node.type || "topic",
  data: {
    parentId: null,
    color: "#ffffff",
    textColor: "#172033",
    borderColor: "#dbe4f0",
    branchColor: "#2563eb",
    fontSize: 15,
    fontWeight: 600,
    note: "",
    link: "",
    emoji: "",
    checked: false,
    collapsed: false,
    hidden: false,
    labels: [],
    dueDate: "",
    relationStyle: "inherit",
    layout: "inherit",
    imageAssetId: null,
    topicImageHeight: 0,
    imagePosition: "above",
    ...node.data,
    label: node.data?.label === "Chủ đề mới" ? "" : (node.data?.label ?? "Chủ đề"),
  },
});

export const migrateDocument = (document) => {
  const defaults = createInitialDocument();
  const layout = document.layout === "right" ? "horizontal" : document.layout || "horizontal";
  const normalizedNodes = (Array.isArray(document.nodes) ? document.nodes.map(normalizeNode) : defaults.nodes).map((node) =>
    node.type === "image" && Number(document.version || 0) < 5
      ? { ...node, style: { ...node.style, width: IMAGE_NODE_WIDTH, height: IMAGE_NODE_HEIGHT } }
      : node
  );
  const spacedNodes = Number(document.version || 0) < DOCUMENT_VERSION && layout === "horizontal"
    ? autoLayout(normalizedNodes, "horizontal")
    : normalizedNodes;
  return {
    ...defaults,
    ...document,
    version: DOCUMENT_VERSION,
    layout,
    settings: { ...defaults.settings, ...document.settings },
    relations: document.relations || {},
    // Version 3 allowed dragging node handles, which could create unintended secondary links.
    // Clear those legacy links once; version 4 links are created explicitly from the toolbar.
    crossLinks: Number(document.version || 0) < 4 ? [] : (Array.isArray(document.crossLinks) ? document.crossLinks : []),
    // `autoLayout` already keeps one-child chains on the same connection
    // axis. A second post-layout alignment could move a tall card back into
    // a sibling's reserved row.
    nodes: spacedNodes,
  };
};

export const saveDocuments = (documents) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
};

export const createFromTemplate = (templateId) => {
  const template = TEMPLATES.find((item) => item.id === templateId) || TEMPLATES[0];
  const document = createInitialDocument();
  document.title = template.name;
  document.nodes[0].data.label = template.name;
  document.nodes[0].data.emoji = template.emoji;

  const branches = template.branches || [];
  document.nodes.push(
    ...branches.map((label, index) => ({
      id: crypto.randomUUID(),
      type: "topic",
      position: { x: 0, y: 0 },
      data: {
        label,
        parentId: "root",
        color: "#ffffff",
        textColor: "#172033",
        borderColor: "#dbe4f0",
        branchColor: ["#2563eb", "#7c3aed", "#db2777", "#059669", "#ea580c"][index % 5],
        fontSize: 15,
        fontWeight: 600,
        note: "",
        link: "",
        emoji: "",
        checked: false,
        collapsed: false,
        hidden: false,
        labels: [],
        dueDate: "",
        relationStyle: "inherit",
        layout: "inherit",
        imageAssetId: null,
        topicImageHeight: 0,
        imagePosition: "above",
      },
    }))
  );

  document.nodes = autoLayout(document.nodes, "horizontal");
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
    version: DOCUMENT_VERSION,
    id: crypto.randomUUID(),
    title: `${value.title || "Mind map nhập"} (import)`,
    updatedAt: new Date().toISOString(),
  });
};
