export const EXPLANATION_LIMIT = 2_000;

export const explanationDraftKey = (documentId, nodeId) => JSON.stringify([documentId || "", nodeId || ""]);

export const nodeExplanation = (node) => {
  const title = String(node?.data?.label || node?.data?.caption || "").trim();
  const note = String(node?.data?.note || "").trim();
  return [...new Set([title, note].filter(Boolean))].join("\n\n").slice(0, EXPLANATION_LIMIT);
};

export const explanationReviewRequest = ({ documentId, explanation, node }) => ({
  documentId,
  message: String(explanation || "").trim().slice(0, EXPLANATION_LIMIT),
  mode: "verify",
  scope: node?.id ? "node" : "map",
  webSearch: false,
  ...(node?.id ? { nodeId: node.id } : {}),
});

// Render model text as text nodes only; headings may have Markdown decoration.
export const feedbackBlocks = (content) => String(content || "")
  .split(/\n\s*\n/)
  .map((block) => block.trim())
  .filter(Boolean)
  .map((block) => {
    const [first, ...rest] = block.split("\n");
    const headingLine = first.replace(/^\s*#{1,6}\s*/, "").replace(/\*\*/g, "").replace(/^\d+[.)]\s*/, "").trim();
    const heading = headingLine.match(/^(Kết luận|Điểm đúng|Chỗ cần sửa|Vì sao|Cách giải thích lại)(?:\s*:\s*(.*))?$/i);
    if (heading) {
      return { heading: heading[1], text: [heading[2] || "", ...rest].filter(Boolean).join("\n") };
    }
    return { heading: "", text: block };
  });
