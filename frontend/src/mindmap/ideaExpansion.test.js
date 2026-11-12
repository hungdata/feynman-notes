import assert from "node:assert/strict";
import test from "node:test";
import { ideaExpansionRequest, ideaTopicCount, normalizeIdeaBranches, selectedIdeaBranches } from "./ideaExpansion.js";

test("idea expansion sends only the chosen map, topic and current explanation", () => {
  assert.deepEqual(ideaExpansionRequest({ documentId: "map-a", nodeId: "topic-a", explanation: "  Học từ dữ liệu có nhãn.  " }), {
    documentId: "map-a", nodeId: "topic-a", explanation: "Học từ dữ liệu có nhãn.",
  });
  assert.deepEqual(ideaExpansionRequest({ documentId: "map-a", nodeId: "topic-a", explanation: "  " }), { documentId: "map-a", nodeId: "topic-a" });
  assert.equal(ideaExpansionRequest({ documentId: "m", nodeId: "n", explanation: "x".repeat(2_500) }).explanation.length, 2_000);
});

test("preview keeps bounded label-only trees and drops duplicate or malformed ideas", () => {
  const branches = normalizeIdeaBranches([
    { id: "untrusted", label: " Huấn luyện  (Training) ", url: "https://example.com", children: [
      { label: "Tối ưu hàm mất mát", children: [{ label: "too deep" }] },
      { label: "tối ưu hàm mất mát" },
      { label: 123 },
    ] },
    { label: "huấn luyện (training)", children: [] },
    { label: "", children: [{ label: "Ignored" }] },
    { label: "Dự đoán", children: [{ label: "<script>alert(1)</script>" }] },
  ]);
  assert.deepEqual(branches, [
    { label: "Huấn luyện (Training)", children: [{ label: "Tối ưu hàm mất mát" }] },
    { label: "Dự đoán", children: [{ label: "<script>alert(1)</script>" }] },
  ]);
  const bounded = normalizeIdeaBranches(Array.from({ length: 10 }, (_, index) => ({ label: `Branch ${index}`, children: Array.from({ length: 10 }, (_child, child) => ({ label: `Child ${child}` })) })));
  assert.equal(bounded.length, 6);
  assert.equal(ideaTopicCount(bounded), 24);
  assert.deepEqual(normalizeIdeaBranches(null), []);
});

test("drawing selected main branches includes their children and excludes unchecked branches", () => {
  const branches = normalizeIdeaBranches([
    { label: "Training", children: [{ label: "Loss function" }, { label: "Optimization" }] },
    { label: "Predicting", children: [{ label: "New sample" }] },
  ]);
  const selected = selectedIdeaBranches(branches, new Set([1]));
  assert.deepEqual(selected, [{ label: "Predicting", children: [{ label: "New sample" }] }]);
  assert.equal(ideaTopicCount(selected), 2);
  assert.deepEqual(selectedIdeaBranches(branches, new Set()), []);
});
