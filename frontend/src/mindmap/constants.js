export const STORAGE_KEY = "todox.mindmaps.v1";
// Version 6 switches horizontal maps to the height-aware tree layout. Older
// documents are reflowed once on load so stored coordinates from the fixed-row
// engine cannot keep cards overlapped.
export const DOCUMENT_VERSION = 6;
export const IMAGE_NODE_WIDTH = 260;
export const IMAGE_NODE_HEIGHT = 160;

export const RELATION_STYLES = ["curved", "straight", "rounded", "angled"];
export const LAYOUTS = ["freeForm", "horizontal", "vertical", "topDown", "linear", "radial", "matrix", "list"];

export const BRANCH_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#059669",
  "#0891b2",
];

export const NODE_COLORS = [
  "#ffffff",
  "#eff6ff",
  "#f5f3ff",
  "#fdf2f8",
  "#fff7ed",
  "#ecfdf5",
  "#ecfeff",
];

export const createInitialDocument = () => ({
  version: DOCUMENT_VERSION,
  id: crypto.randomUUID(),
  title: "Bản đồ ý tưởng mới",
  layout: "horizontal",
  settings: {
    relationStyle: "straight",
    relationColor: "#64748b",
    relationWidth: 2.5,
    relationOpacity: 1,
    relationDash: "solid",
    background: "#f7f9fc",
    grid: "dots",
    snapToGrid: false,
    theme: "clean-light",
  },
  relations: {},
  crossLinks: [],
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: "root",
      type: "topic",
      position: { x: 80, y: 240 },
      data: {
        label: "Ý tưởng trung tâm",
        parentId: null,
        color: "#172554",
        textColor: "#ffffff",
        borderColor: "#2563eb",
        branchColor: "#2563eb",
        fontSize: 18,
        fontWeight: 700,
        note: "",
        link: "",
        emoji: "💡",
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
    },
  ],
});

export const TEMPLATES = [
  { id: "blank", name: "Mind map trống", emoji: "✦" },
  { id: "brainstorm", name: "Brainstorm", emoji: "💡", branches: ["Vấn đề", "Ý tưởng", "Cơ hội", "Bước tiếp theo"] },
  { id: "project", name: "Kế hoạch dự án", emoji: "🚀", branches: ["Mục tiêu", "Công việc", "Nguồn lực", "Rủi ro", "Tiến độ"] },
  { id: "study", name: "Ghi chú học tập", emoji: "📚", branches: ["Khái niệm", "Ví dụ", "Câu hỏi", "Tóm tắt"] },
];
