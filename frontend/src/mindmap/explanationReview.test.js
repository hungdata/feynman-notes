import assert from "node:assert/strict";
import test from "node:test";
import { EXPLANATION_LIMIT, explanationDraftKey, explanationReviewRequest, feedbackBlocks, nodeExplanation } from "./explanationReview.js";

test("drafts in separate maps and unselected map drafts cannot share a key", () => {
  assert.notEqual(explanationDraftKey("map-1", "node-1"), explanationDraftKey("map-2", "node-1"));
  assert.notEqual(explanationDraftKey("map-1", "map"), explanationDraftKey("map-1"));
  assert.notEqual(explanationDraftKey("a:b", "c"), explanationDraftKey("a", "b:c"));
});

test("a selected explanation includes the topic and its student's note without duplicating them", () => {
  assert.equal(nodeExplanation({ data: { label: "Học máy", note: "Máy học từ dữ liệu." } }), "Học máy\n\nMáy học từ dữ liệu.");
  assert.equal(nodeExplanation({ data: { label: "Cùng một ý", note: "Cùng một ý" } }), "Cùng một ý");
  assert.equal(nodeExplanation({ type: "image", data: { caption: "Mô hình", note: "Phần giải thích" } }), "Mô hình\n\nPhần giải thích");
  assert.equal(nodeExplanation(null), "");
});

test("an assessment uses one feedback mode without web search or previous conversation", () => {
  assert.deepEqual(explanationReviewRequest({ documentId: "map-1", explanation: "  Máy học từ dữ liệu.  ", node: { id: "node-1" } }), {
    documentId: "map-1", message: "Máy học từ dữ liệu.", mode: "verify", scope: "node", webSearch: false, nodeId: "node-1",
  });
  const request = explanationReviewRequest({ documentId: "map-1", explanation: "a".repeat(3_000) });
  assert.equal(request.scope, "map");
  assert.equal(request.message.length, EXPLANATION_LIMIT);
  assert.equal("nodeId" in request, false);
  assert.equal("conversationId" in request, false);
});

test("feedback headings become text sections while arbitrary model markup remains inert text", () => {
  assert.deepEqual(feedbackBlocks("## Kết luận\nĐúng một phần.\n\n**Chỗ cần sửa**\n“Máy luôn đúng” là sai.\n\n<script>alert(1)</script>"), [
    { heading: "Kết luận", text: "Đúng một phần." },
    { heading: "Chỗ cần sửa", text: "“Máy luôn đúng” là sai." },
    { heading: "", text: "<script>alert(1)</script>" },
  ]);
});

test("a real response can put the verdict and correct point beside their headings", () => {
  assert.deepEqual(feedbackBlocks("Kết luận: Đúng\n\nĐiểm đúng: Học sinh nêu đúng cách máy học từ dữ liệu.\n\nChỗ cần sửa:\n- Chưa nêu ví dụ.\n\nVì sao:\n- Ví dụ giúp làm rõ khái niệm.\n\nCách giải thích lại:\n- Máy học tìm quy luật trong dữ liệu."), [
    { heading: "Kết luận", text: "Đúng" },
    { heading: "Điểm đúng", text: "Học sinh nêu đúng cách máy học từ dữ liệu." },
    { heading: "Chỗ cần sửa", text: "- Chưa nêu ví dụ." },
    { heading: "Vì sao", text: "- Ví dụ giúp làm rõ khái niệm." },
    { heading: "Cách giải thích lại", text: "- Máy học tìm quy luật trong dữ liệu." },
  ]);
});
