export const STORAGE_KEY = "todox.mindmaps.v1";
// Version 7 introduces style sheets: colours, shapes and fonts that still equal
// the old hard-coded defaults become "automatic" so the chosen style sheet can
// style them, while real user choices stay as per-topic overrides.
export const DOCUMENT_VERSION = 7;
export const IMAGE_NODE_WIDTH = 260;
export const IMAGE_NODE_HEIGHT = 160;

export const RELATION_STYLES = ["curved", "straight", "rounded", "angled"];
export const RELATION_STYLE_LABELS = { curved: "Cong", straight: "Thẳng", rounded: "Bo góc", angled: "Gấp khúc" };

/** Auto layouts, in the order shown in the Layout menu. */
export const LAYOUTS = ["horizontal", "right", "vertical", "topDown", "list", "linear", "radial", "matrix", "freeForm"];
export const LAYOUT_LABELS = {
  horizontal: "Ngang (2 phía)",
  right: "Sang phải",
  vertical: "Dọc (2 phía)",
  topDown: "Sơ đồ tổ chức",
  list: "Danh sách",
  linear: "Dòng thời gian",
  radial: "Hướng tâm",
  matrix: "Ma trận",
  freeForm: "Tự do",
};
export const BRANCH_LAYOUTS = ["inherit", "horizontal", "topDown", "list", "freeForm"];

/** Palette used by the very first versions; kept to recognise "automatic" colours. */
export const LEGACY_BRANCH_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#059669", "#0891b2"];
export const BRANCH_COLORS = ["#2f80ed", "#9b51e0", "#eb5757", "#f2994a", "#27ae60", "#2d9cdb", "#f2c94c", "#56ccf2"];

export const SWATCHES = [
  "#ffffff", "#f8fafc", "#e2e8f0", "#94a3b8", "#475569", "#1e293b", "#000000",
  "#fee2e2", "#fecaca", "#ef4444", "#b91c1c",
  "#ffedd5", "#fdba74", "#f97316", "#c2410c",
  "#fef9c3", "#fde047", "#eab308", "#a16207",
  "#dcfce7", "#86efac", "#22c55e", "#15803d",
  "#cffafe", "#67e8f9", "#06b6d4", "#0e7490",
  "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8",
  "#ede9fe", "#c4b5fd", "#8b5cf6", "#6d28d9",
  "#fce7f3", "#f9a8d4", "#ec4899", "#be185d",
];

export const TOPIC_SHAPES = [
  { id: "", label: "Tự động" },
  { id: "rounded", label: "Bo góc" },
  { id: "rect", label: "Chữ nhật" },
  { id: "pill", label: "Viên thuốc" },
  { id: "circle", label: "Tròn" },
  { id: "underline", label: "Gạch chân" },
  { id: "none", label: "Không viền" },
];

export const NUMBERING_OPTIONS = [
  { id: "none", label: "Không đánh số" },
  { id: "level1", label: "1. 2. 3. (cấp 1)" },
  { id: "decimal", label: "1. 1.1. 1.1.1." },
  { id: "alpha", label: "A. B. C. (cấp 1)" },
];

export const DEFAULT_SETTINGS = Object.freeze({
  styleSheet: "default",
  background: "",
  relationStyle: "",
  relationColor: "",
  relationWidth: null,
  relationOpacity: 1,
  relationDash: "solid",
  lineTaper: null,
  grid: "none",
  snapToGrid: false,
  numbering: "none",
  checkboxes: false,
  spacing: "normal",
});

export const createTopicData = (overrides = {}) => ({
  label: "",
  parentId: null,
  // Empty values mean "use the style sheet".
  color: "",
  textColor: "",
  borderColor: "",
  borderWidth: null,
  shape: "",
  fontSize: null,
  fontWeight: null,
  fontStyle: "",
  textAlign: "",
  maxWidth: null,
  branchColor: "",
  note: "",
  link: "",
  emoji: "",
  icon: "",
  checkbox: false,
  checked: false,
  collapsed: false,
  hidden: false,
  labels: [],
  dueDate: "",
  relationStyle: "inherit",
  layout: "inherit",
  side: "",
  branchBorder: false,
  imageAssetId: null,
  topicImageHeight: 0,
  imagePosition: "above",
  ...overrides,
});

export const createInitialDocument = ({ title = "Bản đồ ý tưởng mới", styleSheet = "default", layout = "horizontal" } = {}) => ({
  version: DOCUMENT_VERSION,
  id: crypto.randomUUID(),
  title,
  layout,
  folder: "",
  favorite: false,
  trashedAt: null,
  description: "",
  settings: { ...DEFAULT_SETTINGS, styleSheet },
  relations: {},
  crossLinks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  nodes: [
    {
      id: "root",
      type: "topic",
      position: { x: 0, y: 0 },
      data: createTopicData({ label: title === "Bản đồ ý tưởng mới" ? "Ý tưởng trung tâm" : title }),
    },
  ],
});

/**
 * Templates for "Mind map mới". A branch is a label or `[label, children]`.
 */
export const TEMPLATES = [
  { id: "blank", name: "Trống", emoji: "✦", description: "Bắt đầu từ một ý tưởng trung tâm" },
  { id: "brainstorm", name: "Brainstorm", emoji: "💡", styleSheet: "rainbow", description: "Thu thập ý tưởng nhanh", branches: ["Vấn đề", "Ý tưởng", "Cơ hội", "Bước tiếp theo"] },
  { id: "feynman", name: "Phương pháp Feynman", emoji: "🎓", styleSheet: "default", description: "Học sâu bằng cách tự giải thích",
    branches: [["1. Khái niệm", ["Định nghĩa bằng lời của mình"]], ["2. Giải thích như cho trẻ 12 tuổi", ["Ví dụ đời thường"]], ["3. Lỗ hổng kiến thức", ["Chỗ còn mơ hồ"]], ["4. Đơn giản hóa", ["Phép so sánh", "Tóm tắt 1 câu"]]] },
  { id: "study", name: "Ghi chú học tập", emoji: "📚", styleSheet: "pastel", description: "Khái niệm, ví dụ, câu hỏi", branches: ["Khái niệm", "Ví dụ", "Câu hỏi", "Tóm tắt"] },
  { id: "project", name: "Kế hoạch dự án", emoji: "🚀", styleSheet: "professional", description: "Mục tiêu, việc cần làm, rủi ro",
    branches: [["Mục tiêu", ["Kết quả mong muốn"]], ["Công việc", ["Giai đoạn 1", "Giai đoạn 2"]], "Nguồn lực", "Rủi ro", "Tiến độ"] },
  { id: "swot", name: "Phân tích SWOT", emoji: "🧭", styleSheet: "ocean", layout: "matrix", description: "Điểm mạnh, yếu, cơ hội, thách thức",
    branches: ["Điểm mạnh", "Điểm yếu", "Cơ hội", "Thách thức"] },
  { id: "meeting", name: "Biên bản họp", emoji: "🗓️", styleSheet: "minimal", layout: "right", description: "Nội dung, quyết định, việc cần làm",
    branches: ["Mục tiêu cuộc họp", "Thành phần", "Nội dung chính", "Quyết định", ["Việc cần làm", ["Ai – làm gì – khi nào"]]] },
  { id: "book", name: "Tóm tắt sách", emoji: "📖", styleSheet: "sepia", description: "Ý chính, trích dẫn, bài học",
    branches: ["Ý chính", "Khái niệm quan trọng", "Trích dẫn hay", "Bài học áp dụng"] },
  { id: "decision", name: "Ra quyết định", emoji: "⚖️", styleSheet: "forest", description: "So sánh các lựa chọn",
    branches: [["Lựa chọn A", ["Ưu điểm", "Nhược điểm"]], ["Lựa chọn B", ["Ưu điểm", "Nhược điểm"]], "Tiêu chí", "Kết luận"] },
  { id: "week", name: "Kế hoạch tuần", emoji: "📅", styleSheet: "sunset", layout: "linear", description: "Mỗi ngày một nhánh",
    branches: ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Cuối tuần"] },
];
