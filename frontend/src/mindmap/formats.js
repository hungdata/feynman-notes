import { createInitialDocument, createTopicData } from "./constants.js";
import { autoLayout } from "./layout.js";

/**
 * Import/export formats shared with other mind-map apps:
 * OPML (SimpleMind, OmniOutliner, Workflowy…), FreeMind/Freeplane .mm,
 * Markdown, indented text and iCalendar (.ics) for topics with a date.
 */

const topicsOf = (nodes) => nodes.filter((node) => node.type !== "image");
const labelOf = (node) => String(node.data?.label || "").trim() || "(trống)";

/** Depth-first walk over topics: visit(node, depth, renderChildren). */
const walk = (nodes, visit) => {
  const topics = topicsOf(nodes);
  const ids = new Set(topics.map((node) => node.id));
  const children = new Map();
  topics.forEach((node) => {
    const parent = ids.has(node.data.parentId) ? node.data.parentId : null;
    children.set(parent, [...(children.get(parent) || []), node]);
  });
  const seen = new Set();
  const step = (node, depth) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    visit(node, depth, () => (children.get(node.id) || []).forEach((child) => step(child, depth + 1)));
  };
  (children.get(null) || []).forEach((root) => step(root, 0));
};

const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
const decodeXml = (value) => String(value ?? "")
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number(decimal)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// ----------------------------------------------------------------- export --

export const toMarkdown = (document) => {
  const lines = [`# ${document.title || "Mind map"}`, ""];
  walk(document.nodes, (node, depth, next) => {
    const box = node.data.checkbox || node.data.checked ? (node.data.checked ? "[x] " : "[ ] ") : "";
    const date = node.data.dueDate ? ` _(${node.data.dueDate})_` : "";
    lines.push(`${"  ".repeat(depth)}- ${box}${node.data.emoji ? `${node.data.emoji} ` : ""}${labelOf(node).replace(/\n/g, " ")}${date}`);
    if (node.data.note && !node.data.aiGenerated) String(node.data.note).split("\n").forEach((line) => lines.push(`${"  ".repeat(depth + 1)}> ${line}`));
    if (node.data.link) lines.push(`${"  ".repeat(depth + 1)}[Liên kết](${node.data.link})`);
    next();
  });
  return `${lines.join("\n")}\n`;
};

export const toTextOutline = (document) => {
  const lines = [];
  walk(document.nodes, (node, depth, next) => { lines.push(`${"\t".repeat(depth)}${labelOf(node).replace(/\n/g, " ")}`); next(); });
  return `${lines.join("\n")}\n`;
};

export const toOpml = (document) => {
  const parts = [];
  walk(document.nodes, (node, depth, next) => {
    const indent = "  ".repeat(depth + 2);
    const note = node.data.note ? ` _note="${escapeXml(node.data.note)}"` : "";
    const done = node.data.checked ? ' _status="checked"' : "";
    parts.push(`${indent}<outline text="${escapeXml(labelOf(node))}"${note}${done}>`);
    next();
    parts.push(`${indent}</outline>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>${escapeXml(document.title || "Mind map")}</title>\n    <dateCreated>${new Date().toUTCString()}</dateCreated>\n  </head>\n  <body>\n${parts.join("\n")}\n  </body>\n</opml>\n`;
};

export const toFreeMind = (document) => {
  const parts = [];
  walk(document.nodes, (node, depth, next) => {
    const indent = "  ".repeat(depth + 1);
    const position = depth === 1 ? ` POSITION="${node.position.x < (document.nodes.find((item) => item.id === node.data.parentId)?.position.x ?? 0) ? "left" : "right"}"` : "";
    const link = node.data.link ? ` LINK="${escapeXml(node.data.link)}"` : "";
    parts.push(`${indent}<node TEXT="${escapeXml(labelOf(node))}"${position}${link}>`);
    if (node.data.note) parts.push(`${indent}  <richcontent TYPE="NOTE"><html><body><p>${escapeXml(node.data.note)}</p></body></html></richcontent>`);
    next();
    parts.push(`${indent}</node>`);
  });
  return `<map version="1.0.1">\n${parts.join("\n")}\n</map>\n`;
};

const icsDate = (value) => value.replace(/-/g, "");
const icsText = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (character) => `\\${character}`);
const nextDay = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

export const toIcs = (document) => {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const events = topicsOf(document.nodes).filter((node) => /^\d{4}-\d{2}-\d{2}$/.test(node.data.dueDate || "")).map((node) => [
    "BEGIN:VEVENT",
    `UID:${node.id}@feynman-notes`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${icsDate(node.data.dueDate)}`,
    `DTEND;VALUE=DATE:${icsDate(nextDay(node.data.dueDate))}`,
    `SUMMARY:${icsText(labelOf(node))}`,
    node.data.note ? `DESCRIPTION:${icsText(node.data.note)}` : null,
    "END:VEVENT",
  ].filter(Boolean).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Feynman Notes//Mind map//VI", `X-WR-CALNAME:${icsText(document.title || "Mind map")}`, ...events, "END:VCALENDAR", ""].join("\r\n");
};

export const countDatedTopics = (document) => topicsOf(document.nodes).filter((node) => node.data.dueDate).length;

// ----------------------------------------------------------------- import --

/** A tree item: { label, note?, checked?, link?, children: [] } */

const BULLET = /^(?:[-*+•]|\d+[.)])\s+/;

/**
 * Indented text → tree. Tabs, 2/4 spaces, Markdown bullets, numbered lists,
 * checkboxes and `#` headings all work, like SimpleMind's "Paste as list".
 */
export const parseTextOutline = (text) => {
  const roots = [];
  const stack = [];
  let base = 0;
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach((rawLine) => {
    if (!rawLine.trim()) return;
    if (/^\s*>/.test(rawLine) && stack.length) {
      const item = stack.at(-1).item;
      item.note = [item.note, rawLine.replace(/^\s*>\s?/, "")].filter(Boolean).join("\n");
      return;
    }
    const heading = rawLine.match(/^(#{1,6})\s+(.*)$/);
    let level;
    let label;
    if (heading) {
      level = heading[1].length;
      label = heading[2];
      // A heading closes every list item and every heading at its level or deeper.
      while (stack.length && (!stack.at(-1).heading || stack.at(-1).level >= level)) stack.pop();
      base = level + 1;
    } else {
      const expanded = rawLine.replace(/\t/g, "    ");
      level = base + expanded.match(/^ */)[0].length;
      label = expanded.trim();
      if (BULLET.test(label)) { label = label.replace(BULLET, ""); level += 1; }
      while (stack.length && !stack.at(-1).heading && stack.at(-1).level >= level) stack.pop();
    }
    let checked;
    const box = label.match(/^\[( |x|X)\]\s+/);
    if (box) { checked = box[1].toLowerCase() === "x"; label = label.slice(box[0].length); }
    const link = label.match(/^\[([^\]]+)\]\((https?:[^)]+)\)$/);
    const item = { label: link ? link[1] : label.trim(), children: [], ...(typeof checked === "boolean" ? { checked } : {}), ...(link ? { link: link[2] } : {}) };
    if (stack.length) stack.at(-1).item.children.push(item);
    else roots.push(item);
    stack.push({ level, item, heading: Boolean(heading) });
  });
  return roots;
};

const readAttributes = (source) => {
  const attributes = {};
  source.replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_, name, double, single) => {
    attributes[name] = decodeXml(double ?? single ?? "");
    return "";
  });
  return attributes;
};

const parseXmlTree = (xml, tagName, toItem) => {
  const roots = [];
  const stack = [];
  const pattern = new RegExp(`<(/?)(${tagName})\\b([^>]*?)(/?)>|<richcontent\\b[^>]*TYPE="NOTE"[^>]*>([\\s\\S]*?)</richcontent>`, "gi");
  let match;
  while ((match = pattern.exec(String(xml || "")))) {
    const [, closing, tag, attributeSource, selfClosing, richNote] = match;
    if (richNote !== undefined) {
      if (stack.length) stack.at(-1).note = decodeXml(richNote.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
      continue;
    }
    if (!tag) continue;
    if (closing) { stack.pop(); continue; }
    const item = { ...toItem(readAttributes(attributeSource)), children: [] };
    if (stack.length) stack.at(-1).children.push(item);
    else roots.push(item);
    if (!selfClosing) stack.push(item);
  }
  return roots;
};

export const parseOpml = (xml) => {
  const title = (String(xml).match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
  const body = String(xml).split(/<body[^>]*>/i)[1] || xml;
  const tree = parseXmlTree(body, "outline", (attributes) => ({
    label: attributes.text || attributes.title || "",
    ...(attributes._note ? { note: attributes._note } : {}),
    ...(attributes._status === "checked" ? { checked: true } : {}),
  }));
  return { title: title ? decodeXml(title.trim()) : "", tree };
};

export const parseFreeMind = (xml) => {
  const tree = parseXmlTree(xml, "node", (attributes) => ({
    label: attributes.TEXT || attributes.text || "",
    ...(attributes.LINK ? { link: attributes.LINK } : {}),
  }));
  return { title: tree.length === 1 ? tree[0].label : "", tree };
};

const flattenTree = (tree, parentId, output = []) => {
  tree.forEach((item) => {
    const id = crypto.randomUUID();
    output.push({
      id,
      type: "topic",
      position: { x: 0, y: 0 },
      data: createTopicData({
        label: String(item.label || "").slice(0, 2_000),
        parentId,
        note: item.note || "",
        link: item.link || "",
        ...(typeof item.checked === "boolean" ? { checkbox: true, checked: item.checked } : {}),
      }),
    });
    flattenTree(item.children || [], id, output);
  });
  return output;
};

/** New topics for a tree, ready to append under `parentId`. */
export const nodesFromTree = (tree, parentId) => flattenTree(tree, parentId);

/** Builds a whole document from an imported tree (one root or many). */
export const documentFromTree = (title, tree, { layout = "horizontal", styleSheet = "default" } = {}) => {
  const single = tree.length === 1;
  const name = String(title || (single ? tree[0].label : "") || "Mind map nhập").slice(0, 200);
  const document = createInitialDocument({ title: name, layout, styleSheet });
  const root = document.nodes[0];
  root.data.label = single ? tree[0].label || name : name;
  if (single && tree[0].note) root.data.note = tree[0].note;
  document.nodes.push(...flattenTree(single ? tree[0].children || [] : tree, root.id));
  document.nodes = autoLayout(document.nodes, layout);
  return document;
};

/** Picks a parser from the file name/content. Returns a document or null. */
export const importFromFile = (fileName, content) => {
  const name = String(fileName || "").toLowerCase();
  const baseTitle = String(fileName || "").replace(/\.[^.]+$/, "");
  if (name.endsWith(".opml") || /<opml[\s>]/i.test(content)) {
    const { title, tree } = parseOpml(content);
    if (!tree.length) throw new Error("Tệp OPML không có mục nào.");
    return documentFromTree(title || baseTitle, tree);
  }
  if (name.endsWith(".mm") || /<map[\s>]/i.test(content)) {
    const { title, tree } = parseFreeMind(content);
    if (!tree.length) throw new Error("Tệp FreeMind không có topic nào.");
    return documentFromTree(title || baseTitle, tree);
  }
  if (name.endsWith(".md") || name.endsWith(".markdown") || name.endsWith(".txt")) {
    const tree = parseTextOutline(content);
    if (!tree.length) throw new Error("Tệp văn bản trống.");
    return documentFromTree(tree.length === 1 ? tree[0].label : baseTitle, tree);
  }
  return null;
};
