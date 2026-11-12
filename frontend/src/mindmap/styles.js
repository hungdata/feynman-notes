import { BRANCH_COLORS, LEGACY_BRANCH_COLORS } from "./constants.js";

// ------------------------------------------------------------------ colours --

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHexColor = (value) => typeof value === "string" && HEX.test(value.trim());

export const hexToRgb = (hex) => {
  let value = String(hex || "").trim().replace("#", "");
  if (value.length === 3) value = value.split("").map((character) => character + character).join("");
  const number = Number.parseInt(value, 16);
  if (!Number.isFinite(number) || value.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
};

const toHex = (value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, "0");
export const rgbToHex = ({ r, g, b }) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

/** Linear mix: `amount` 0 → first colour, 1 → second colour. */
export const mixColors = (first, second, amount) => {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
};

export const luminance = (hex) => {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export const readableTextOn = (background, dark = "#1f2937", light = "#ffffff") =>
  luminance(background) > 0.42 ? dark : light;

// ------------------------------------------------------------ style sheets --

const level = (shape, fill, border, borderWidth, text, fontSize, fontWeight) => ({ shape, fill, border, borderWidth, text, fontSize, fontWeight });

/**
 * A style sheet defines the whole look of a map, like SimpleMind's style
 * sheets. Colour tokens: "branch" (branch colour), "tint"/"tint2" (light mix of
 * the branch colour with the background), "shade" (dark-mode mix), "none"
 * (transparent) and "auto" (readable text on the fill).
 */
export const STYLE_SHEETS = [
  {
    id: "default", name: "Mặc định", background: "#ffffff", palette: BRANCH_COLORS, colorMode: "branch",
    line: { style: "curved", taper: true, width: 3 },
    central: level("rounded", "#ffffff", "#2b2d42", 2.5, "#1f2937", 20, 700),
    level1: level("rounded", "tint", "branch", 2, "#1f2937", 15, 600),
    level2: level("underline", "none", "branch", 2, "#334155", 14, 500),
  },
  {
    id: "pastel", name: "Pastel", background: "#fffaf3", palette: ["#7fb3e6", "#c49ce6", "#f29c9c", "#f5b97a", "#86cfa3", "#7fd0d8", "#e6cd6e", "#f0a5c8"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3.4 },
    central: level("pill", "#ffffff", "#e8d9c5", 2, "#5b4636", 20, 700),
    level1: level("pill", "tint2", "none", 0, "#3f3a36", 15, 600),
    level2: level("none", "none", "none", 0, "#5b5550", 14, 500),
  },
  {
    id: "rainbow", name: "Cầu vồng", background: "#ffffff", palette: ["#ff6b6b", "#ffa94d", "#fcc419", "#51cf66", "#339af0", "#845ef7", "#f06595", "#20c997"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 4 },
    central: level("pill", "#212529", "none", 0, "#ffffff", 20, 800),
    level1: level("pill", "branch", "none", 0, "auto", 15, 700),
    level2: level("underline", "none", "branch", 2, "#343a40", 14, 500),
  },
  {
    id: "professional", name: "Chuyên nghiệp", background: "#f5f7fa", palette: ["#3b6ea5"], colorMode: "level", levelColors: ["#1f3a5f", "#3b6ea5", "#7a93b2"],
    line: { style: "rounded", taper: false, width: 1.6, color: "#9aa8ba" },
    central: level("rect", "#1f3a5f", "none", 0, "#ffffff", 19, 700),
    level1: level("rect", "#ffffff", "#3b6ea5", 1.5, "#1f3a5f", 14, 600),
    level2: level("rect", "#ffffff", "#d5dde8", 1, "#334155", 13, 500),
  },
  {
    id: "circles", name: "Vòng tròn màu", background: "#fdfdfd", palette: ["#ff7675", "#74b9ff", "#55efc4", "#fdcb6e", "#a29bfe", "#fab1a0", "#81ecec", "#fd79a8"], colorMode: "branch",
    line: { style: "straight", taper: false, width: 2.5 }, preferredLayout: "radial",
    central: level("circle", "#2d3436", "none", 0, "#ffffff", 17, 700),
    level1: level("circle", "branch", "none", 0, "auto", 13, 700),
    level2: level("pill", "tint", "none", 0, "#2d3436", 13, 500),
  },
  {
    id: "minimal", name: "Tối giản", background: "#ffffff", palette: ["#111827"], colorMode: "level", levelColors: ["#111827", "#374151", "#6b7280"],
    line: { style: "curved", taper: false, width: 1.4, color: "#9ca3af" },
    central: level("none", "none", "none", 0, "#111111", 22, 800),
    level1: level("underline", "none", "#111827", 1.6, "#111111", 15, 600),
    level2: level("none", "none", "none", 0, "#374151", 14, 400),
  },
  {
    id: "ocean", name: "Đại dương", background: "#f2f9fc", palette: ["#0077b6", "#00a6c8", "#0096c7", "#3f37c9", "#023e8a", "#2ec4b6"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3 },
    central: level("pill", "#023e8a", "none", 0, "#ffffff", 20, 700),
    level1: level("rounded", "tint", "branch", 2, "#03045e", 15, 600),
    level2: level("underline", "none", "branch", 2, "#1d3557", 14, 500),
  },
  {
    id: "forest", name: "Rừng xanh", background: "#f4f8f1", palette: ["#2d6a4f", "#bc6c25", "#40916c", "#606c38", "#1b4332", "#dda15e"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3 },
    central: level("rounded", "#1b4332", "none", 0, "#f1faee", 20, 700),
    level1: level("rounded", "tint", "branch", 2, "#1b2e22", 15, 600),
    level2: level("underline", "none", "branch", 2, "#2f3e34", 14, 500),
  },
  {
    id: "sunset", name: "Hoàng hôn", background: "#fff7f2", palette: ["#ff7b54", "#e85d75", "#ffb26b", "#c06c84", "#f6c453", "#6c5b7b"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3.2 },
    central: level("pill", "#6c5b7b", "none", 0, "#ffffff", 20, 700),
    level1: level("pill", "tint", "branch", 2, "#3d2c3e", 15, 600),
    level2: level("underline", "none", "branch", 2, "#4a3b4b", 14, 500),
  },
  {
    id: "sepia", name: "Giấy cổ", background: "#f6efe2", palette: ["#8d6e63", "#6d8b74", "#b5838d", "#c08552", "#5e6472", "#a98467"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3 },
    central: level("rounded", "#fffaf0", "#6b4f3a", 2.5, "#3e2c20", 20, 700),
    level1: level("rounded", "tint", "branch", 1.8, "#3e2c20", 15, 600),
    level2: level("underline", "none", "branch", 1.8, "#5a4636", 14, 500),
  },
  {
    id: "mono", name: "Đơn sắc", background: "#fafafa", palette: ["#424242"], colorMode: "level", levelColors: ["#212121", "#424242", "#757575"],
    line: { style: "curved", taper: true, width: 2.6, color: "#757575" },
    central: level("rounded", "#212121", "none", 0, "#ffffff", 20, 700),
    level1: level("rounded", "#ffffff", "#424242", 1.5, "#212121", 15, 600),
    level2: level("none", "none", "none", 0, "#424242", 14, 500),
  },
  {
    id: "classic", name: "Feynman cổ điển", background: "#f7f9fc", palette: LEGACY_BRANCH_COLORS, colorMode: "branch",
    line: { style: "straight", taper: false, width: 2.5 },
    central: level("rounded", "#172554", "#2563eb", 2, "#ffffff", 18, 700),
    level1: level("rounded", "#ffffff", "#dbe4f0", 2, "#172033", 15, 600),
    level2: level("rounded", "#ffffff", "#dbe4f0", 2, "#172033", 15, 600),
  },
  {
    id: "dark", name: "Ban đêm", dark: true, background: "#1b1d23", palette: ["#5aa9ff", "#b388ff", "#ff7a90", "#ffb35a", "#4cd98a", "#3fd0e0", "#ffd85a", "#ff8ad8"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 3 },
    central: level("rounded", "#2a2d36", "#e6e8ee", 2, "#f1f3f8", 20, 700),
    level1: level("rounded", "shade", "branch", 2, "#f1f3f8", 15, 600),
    level2: level("underline", "none", "branch", 2, "#c9cdd8", 14, 500),
  },
  {
    id: "chalk", name: "Bảng phấn", dark: true, background: "#23352b", palette: ["#f8f9fa", "#ffe066", "#8ce99a", "#74c0fc", "#ffa8a8", "#e599f7"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 2.6 },
    central: level("rounded", "none", "#f8f9fa", 2.5, "#f8f9fa", 21, 700),
    level1: level("rounded", "none", "branch", 2, "#f8f9fa", 15, 600),
    level2: level("underline", "none", "branch", 1.8, "#e9ecef", 14, 500),
  },
  {
    id: "neon", name: "Neon", dark: true, glow: true, background: "#0b0c10", palette: ["#00e5ff", "#ff2bd6", "#c6ff00", "#ffea00", "#ff6d00", "#7c4dff"], colorMode: "branch",
    line: { style: "curved", taper: true, width: 2.6 },
    central: level("pill", "#0b0c10", "#00e5ff", 2, "#e6fbff", 20, 700),
    level1: level("pill", "none", "branch", 2, "branch", 15, 600),
    level2: level("none", "none", "none", 0, "#cfd8dc", 14, 500),
  },
  {
    id: "blueprint", name: "Bản thiết kế", dark: true, background: "#0f3d75", pattern: "grid", palette: ["#cfe3ff"], colorMode: "level", levelColors: ["#ffffff", "#cfe3ff", "#a9c8f0"],
    line: { style: "angled", taper: false, width: 1.4, color: "#cfe3ff" },
    central: level("rect", "none", "#ffffff", 2, "#ffffff", 19, 700),
    level1: level("rect", "#14508f", "#cfe3ff", 1.2, "#ffffff", 14, 600),
    level2: level("none", "none", "none", 0, "#e3efff", 13, 500),
  },
];

export const STYLE_SHEET_BY_ID = new Map(STYLE_SHEETS.map((sheet) => [sheet.id, sheet]));
export const getStyleSheet = (id) => STYLE_SHEET_BY_ID.get(id) || STYLE_SHEETS[0];
const THEME_TO_SHEET = { "clean-light": "default", pastel: "pastel", professional: "professional", monochrome: "mono", "dark-neon": "neon" };
export const styleSheetForLegacyTheme = (theme) => THEME_TO_SHEET[theme] || "default";

// ---------------------------------------------------------------- resolver --

const childrenByParent = (nodes) => {
  const ids = new Set(nodes.map((node) => node.id));
  const map = new Map();
  nodes.forEach((node) => {
    const parent = ids.has(node.data?.parentId) ? node.data.parentId : null;
    map.set(parent, [...(map.get(parent) || []), node]);
  });
  return map;
};

const resolveToken = (token, { branch, background, sheet }) => {
  if (!token || token === "none") return "transparent";
  if (token === "branch") return branch;
  if (token === "tint") return mixColors(branch, background, sheet.dark ? 0.8 : 0.86);
  if (token === "tint2") return mixColors(branch, background, sheet.dark ? 0.7 : 0.62);
  if (token === "shade") return mixColors(branch, background, 0.78);
  if (token === "bg") return background;
  return token;
};

/** Line width at the start and end of a branch line to a node at `depth`. */
export const lineWidths = (depth, base, taper) => {
  if (!taper) return depth <= 1 ? [base * 1.15, base * 1.15] : [base * 0.85, base * 0.85];
  if (depth <= 1) return [base * 2.1, base * 0.8];
  if (depth === 2) return [base * 0.95, base * 0.55];
  return [base * 0.7, base * 0.45];
};

/**
 * Resolves the final visual style of every node from the style sheet, the map
 * settings and per-topic overrides. Returns Map(nodeId → style).
 */
export const resolveNodeStyles = (nodes, settings = {}) => {
  const sheet = getStyleSheet(settings.styleSheet);
  const background = isHexColor(settings.background) ? settings.background : sheet.background;
  const baseWidth = Number(settings.relationWidth) > 0 ? Number(settings.relationWidth) : sheet.line.width;
  const taper = typeof settings.lineTaper === "boolean" ? settings.lineTaper : sheet.line.taper;
  const lineStyle = settings.relationStyle || sheet.line.style;
  const result = new Map();
  const children = childrenByParent(nodes);

  const visit = (node, depth, inheritedBranch, l1Index, seen) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const data = node.data || {};
    const automaticBranch = sheet.colorMode === "level"
      ? sheet.levelColors[Math.min(depth, sheet.levelColors.length - 1)]
      : depth === 0 ? (sheet.palette[0] || "#2f80ed") : sheet.palette[Math.max(0, l1Index) % sheet.palette.length];
    const branch = isHexColor(data.branchColor) ? data.branchColor : (depth > 1 && sheet.colorMode !== "level" && inheritedBranch) || automaticBranch;
    const levelStyle = depth === 0 ? sheet.central : depth === 1 ? sheet.level1 : sheet.level2;
    const context = { branch, background, sheet };
    const fill = isHexColor(data.color) ? data.color : resolveToken(levelStyle.fill, context);
    const [lineStart, lineEnd] = lineWidths(depth, baseWidth, taper);
    const shape = data.shape || levelStyle.shape;
    const opaqueFill = fill === "transparent" ? background : fill;
    const textToken = levelStyle.text === "auto" ? readableTextOn(opaqueFill) : resolveToken(levelStyle.text, context);
    const text = isHexColor(data.textColor) ? data.textColor : textToken;
    const border = isHexColor(data.borderColor) ? data.borderColor : resolveToken(levelStyle.border, context);
    const borderWidth = Number.isFinite(Number(data.borderWidth)) && data.borderWidth !== null && data.borderWidth !== ""
      ? Number(data.borderWidth)
      : shape === "underline" ? Math.max(1.5, lineEnd) : levelStyle.borderWidth;
    result.set(node.id, {
      depth,
      branchColor: branch,
      shape,
      fill,
      border: border === "transparent" && shape === "underline" ? branch : border,
      borderWidth,
      text,
      fontSize: Number(data.fontSize) > 0 ? Number(data.fontSize) : levelStyle.fontSize,
      fontWeight: Number(data.fontWeight) > 0 ? Number(data.fontWeight) : levelStyle.fontWeight,
      fontStyle: data.fontStyle || "normal",
      textAlign: data.textAlign || "",
      maxWidth: Number(data.maxWidth) > 0 ? Number(data.maxWidth) : depth === 0 ? 300 : 260,
      line: {
        color: isHexColor(data.branchColor) ? branch : isHexColor(settings.relationColor) ? settings.relationColor : sheet.line.color || branch,
        startWidth: lineStart,
        endWidth: lineEnd,
        style: lineStyle,
        taper,
        dash: settings.relationDash || "solid",
        opacity: settings.relationOpacity ?? 1,
      },
    });
    (children.get(node.id) || []).forEach((child, index) => visit(child, depth + 1, branch, depth === 0 ? index : l1Index, seen));
  };

  const seen = new Set();
  (children.get(null) || []).forEach((root) => visit(root, 0, null, -1, seen));
  // Corrupt documents can contain cycles without a root: style them as level 1.
  nodes.filter((node) => !seen.has(node.id)).forEach((node, index) => visit(node, 1, null, index, seen));
  return { sheet, background, styles: result, glow: Boolean(sheet.glow), dark: Boolean(sheet.dark), crossLinkColor: sheet.dark ? "#c4b5fd" : "#8b5cf6" };
};

// --------------------------------------------------------------- numbering --

const alpha = (index) => {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
};

/** SimpleMind-style auto numbering. Returns Map(nodeId → "1.2."). */
export const computeNumbering = (nodes, mode = "none") => {
  const numbers = new Map();
  if (!mode || mode === "none") return numbers;
  const children = childrenByParent(nodes.filter((node) => node.type !== "image"));
  const visit = (parentId, prefix, depth) => (children.get(parentId) || []).forEach((node, index) => {
    if (depth === 1) {
      const own = mode === "alpha" ? alpha(index) : String(index + 1);
      numbers.set(node.id, `${own}.`);
      if (mode === "decimal") visit(node.id, own, depth + 1);
      return;
    }
    const own = `${prefix}.${index + 1}`;
    numbers.set(node.id, `${own}.`);
    visit(node.id, own, depth + 1);
  });
  (children.get(null) || []).forEach((root) => visit(root.id, "", 1));
  return numbers;
};
