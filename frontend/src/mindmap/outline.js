export const safeFileName = (value) => (value || "mind-map").replace(/[\\/:*?"<>|]+/g, "-").trim() || "mind-map";

export const escapeHtml = (value = "") => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;",
})[character]);

export const createOutline = (nodes, format = "text") => {
  const topics = nodes.filter((node) => node.type === "topic");
  const children = new Map();
  topics.forEach((node) => children.set(node.data.parentId, [...(children.get(node.data.parentId) || []), node]));
  const visited = new Set();
  const render = (node, depth) => {
    if (visited.has(node.id)) return "";
    visited.add(node.id);
    const label = `${node.data.checked ? "☑" : "☐"} ${node.data.emoji || ""} ${node.data.label || "Chủ đề"}`.replace(/\s+/g, " ").trim();
    const descendants = (children.get(node.id) || []).map((child) => render(child, depth + 1)).join("");
    if (format === "html") return `<li><span>${escapeHtml(label)}</span>${descendants ? `<ul>${descendants}</ul>` : ""}</li>`;
    return `${"  ".repeat(depth)}- ${label}${node.data.dueDate ? ` [${node.data.dueDate}]` : ""}\n${descendants}`;
  };
  const roots = topics.filter((node) => !node.data.parentId || !topics.some((parent) => parent.id === node.data.parentId));
  const output = roots.map((root) => render(root, 0)).join(format === "html" ? "" : "\n");

  // Corrupt or legacy data can contain a cycle with no detectable root. Keep export finite and include it once.
  const orphans = topics.filter((node) => !visited.has(node.id)).map((node) => render(node, 0)).join(format === "html" ? "" : "\n");
  return `${output}${output && orphans && format !== "html" ? "\n" : ""}${orphans}`;
};
