/** Small display helpers for the learning pages. */

export const courseStatusLabel = (course) => {
  if (course.status === "extracting") return { tone: "busy", text: `Đang đọc sách… ${Math.round((course.progress || 0) * 100)}%` };
  if (course.status === "generating") return { tone: "busy", text: `AI đang soạn bài: ${course.stagesReady}/${course.stageCount} chương` };
  if (course.status === "error") return { tone: "error", text: course.error || "Có lỗi khi xử lý sách" };
  if (course.status === "partial") return { tone: "warn", text: `${course.stagesFailed} chương lỗi – mở để thử lại` };
  return { tone: "ok", text: `${course.stageCount} chương, ${course.learning?.lessonCount || 0} bài` };
};

export const isBusy = (status) => status === "extracting" || status === "generating";

// Book cover colours: base, title ink, decorative band.
const PALETTES = [
  { base: "#2f5bd3", ink: "#ffffff", band: "#f5a524" },
  { base: "#14795a", ink: "#ffffff", band: "#b6f09c" },
  { base: "#b4233c", ink: "#fff6f0", band: "#ffd166" },
  { base: "#4c3fb5", ink: "#ffffff", band: "#7dd3fc" },
  { base: "#0f6e8c", ink: "#ffffff", band: "#fde68a" },
  { base: "#c2410c", ink: "#fffaf0", band: "#1e293b" },
  { base: "#1f2a44", ink: "#f8fafc", band: "#f472b6" },
  { base: "#6b4f1d", ink: "#fff8e7", band: "#93c5fd" },
];

export const coverPalette = (seed = "") => {
  let hash = 0;
  for (const char of String(seed)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
};

export const coverGradient = (seed = "") => coverPalette(seed).base;

export const initials = (title = "") => String(title).split(/\s+/).filter((word) => /^[\p{L}\p{N}]/u.test(word)).slice(0, 2).map((word) => word[0].toLocaleUpperCase("vi")).join("") || "📘";

export const pageRange = (stage) => (stage.pageStart ? `tr. ${stage.pageStart}${stage.pageEnd && stage.pageEnd !== stage.pageStart ? `–${stage.pageEnd}` : ""}` : "");

export const STEP_LABELS = { concept: "Ý chính", mcq: "Chọn đáp án đúng", truefalse: "Đúng hay sai?", fill: "Điền vào chỗ trống", explain: "Tự giải thích (Feynman)" };

export const relativeDay = (iso) => {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  return `${days} ngày trước`;
};
