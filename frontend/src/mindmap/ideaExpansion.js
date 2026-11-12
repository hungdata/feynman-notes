const MAX_BRANCHES = 6;
const MAX_CHILDREN = 3;

const labelOf = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 100) : "";

export const ideaExpansionRequest = ({ documentId, nodeId, explanation }) => ({
  documentId,
  nodeId,
  ...(String(explanation || "").trim() ? { explanation: String(explanation).trim().slice(0, 2_000) } : {}),
});

// Only labels from the preview become topics; no model IDs, styles, links or
// arbitrary nested objects are forwarded to the map mutation callback.
export const normalizeIdeaBranches = (branches) => {
  if (!Array.isArray(branches)) return [];
  const seen = new Set();
  return branches.slice(0, MAX_BRANCHES).flatMap((branch) => {
    const label = labelOf(branch?.label);
    const key = label.toLocaleLowerCase("vi");
    if (!label || seen.has(key)) return [];
    seen.add(key);
    const childLabels = new Set([key]);
    const children = (Array.isArray(branch.children) ? branch.children : []).slice(0, MAX_CHILDREN).flatMap((child) => {
      const childLabel = labelOf(child?.label);
      const childKey = childLabel.toLocaleLowerCase("vi");
      if (!childLabel || childLabels.has(childKey)) return [];
      childLabels.add(childKey);
      return [{ label: childLabel }];
    });
    return [{ label, children }];
  });
};

export const selectedIdeaBranches = (branches, selected) => branches.filter((_branch, index) => selected.has(index));
export const ideaTopicCount = (branches) => branches.reduce((count, branch) => count + 1 + branch.children.length, 0);
