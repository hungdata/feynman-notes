import test from "node:test";
import assert from "node:assert/strict";
import { createOutline, escapeHtml, safeFileName } from "./outline.js";

const topic = (id, parentId, label, extra = {}) => ({ id, type: "topic", data: { parentId, label, checked: false, emoji: "", dueDate: "", ...extra } });

test("text outline preserves hierarchy, task state, and due date", () => {
  const output = createOutline([
    topic("root", null, "Kế hoạch", { emoji: "💡" }),
    topic("child", "root", "Phát hành", { checked: true, dueDate: "2026-09-01" }),
  ]);
  assert.match(output, /- ☐ 💡 Kế hoạch/);
  assert.match(output, / {2}- ☑ Phát hành \[2026-09-01\]/);
});

test("HTML outline escapes user content and cycles stay finite", () => {
  const output = createOutline([
    topic("a", "b", "<script>alert(1)</script>"),
    topic("b", "a", "B"),
  ], "html");
  assert.doesNotMatch(output, /<script>/);
  assert.match(output, /&lt;script&gt;/);
  assert.ok(output.length < 500);
});

test("filenames and HTML attributes are sanitized", () => {
  assert.equal(safeFileName('Road/map:*?"<>|'), "Road-map-");
  assert.equal(escapeHtml('A&B"'), "A&amp;B&quot;");
});
