const cleanText = (value, maximum = 2_000) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);

const limitSearchQuery = (value) =>
  cleanText(value, 400).split(" ").filter(Boolean).slice(0, 50).join(" ").slice(0, 400);

const selectedNodeText = (document, nodeId) => {
  const node = Array.isArray(document?.nodes)
    ? document.nodes.find((candidate) => String(candidate?.id) === String(nodeId))
    : null;
  if (!node) return "";
  const data = node.data || {};
  return [data.label, data.title, data.caption, data.note, data.description]
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ");
};

export const buildWebSearchQuery = ({ document, nodeId, message, mode } = {}) => {
  const noteText = selectedNodeText(document, nodeId);
  const userText = cleanText(message);
  const selectedOnlyMode = ["explain", "debate", "verify"].includes(String(mode || "").replace(/_rag$/, ""));
  return limitSearchQuery(selectedOnlyMode && noteText ? noteText : [noteText, userText].filter(Boolean).join(" "));
};

export const buildWebContext = (sources, maxChars = 6_000) => {
  const safeSources = Array.isArray(sources) ? sources.slice(0, 5) : [];
  const sections = safeSources.map((source, index) => [
    `[${index + 1}] ${cleanText(source.title, 300)}`,
    `URL: ${cleanText(source.url, 1_000)}`,
    `Trích đoạn: ${cleanText(source.snippet, 1_500)}`,
  ].join("\n"));
  return sections.join("\n\n").slice(0, Math.max(500, Math.min(Number(maxChars) || 6_000, 10_000)));
};

export const appendSourceList = (content, sources) => {
  const safeSources = Array.isArray(sources) ? sources.slice(0, 5) : [];
  if (!safeSources.length) return String(content || "").trim();
  const references = safeSources.map((source, index) =>
    `[${index + 1}] ${cleanText(source.title, 300)} — ${cleanText(source.url, 1_000)}`
  );
  return `${String(content || "").trim()}\n\nNguồn tham khảo:\n${references.join("\n")}`.trim();
};
