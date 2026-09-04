import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherContext, collectContextNodes } from "./teacherContext.js";

const document = {
  nodes: [
    { id: "root", type: "topic", data: { label: "Vật lý", parentId: null } },
    { id: "motion", type: "topic", data: { label: "Chuyển động", parentId: "root" } },
    {
      id: "diagram",
      type: "image",
      data: {
        caption: "Đồ thị vận tốc theo thời gian",
        note: "Diện tích bên dưới là quãng đường.",
        parentId: "motion",
        assetUrl: "/api/assets/images/private-secret-id",
        src: "data:image/png;base64,SHOULD_NOT_LEAK",
      },
    },
    { id: "deep", type: "topic", data: { label: "Gia tốc", parentId: "diagram" } },
    { id: "other", type: "topic", data: { label: "Nhiệt học", parentId: "root" } },
  ],
};

test("node scope includes ancestors, selected node and direct children only", () => {
  const nodes = collectContextNodes(document, { scope: "node", nodeId: "motion" });
  assert.deepEqual(nodes.map(({ id }) => id), ["root", "motion", "diagram"]);

  const context = buildTeacherContext(document, { scope: "node", nodeId: "motion" });
  const selectedMarkers = context.text.match(/NOTE ĐƯỢC NGƯỜI DÙNG CHỌN/g) || [];
  assert.equal(selectedMarkers.length, 1);
  assert.match(context.text, /\[node:motion\].*NOTE ĐƯỢC NGƯỜI DÙNG CHỌN/);
});

test("selected-only context isolates the note being verified", () => {
  const context = buildTeacherContext(document, {
    scope: "node",
    nodeId: "motion",
    selectedOnly: true,
  });

  assert.deepEqual(context.referencedNodeIds, ["motion"]);
  assert.match(context.text, /Chuyển động/);
  assert.doesNotMatch(context.text, /Vật lý|Đồ thị vận tốc/);
});

test("branch scope includes every descendant and remains cycle safe", () => {
  const cyclicDocument = {
    nodes: [
      { id: "a", data: { label: "A", parentId: "c" } },
      { id: "b", data: { label: "B", parentId: "a" } },
      { id: "c", data: { label: "C", parentId: "b" } },
      { id: "outside", data: { label: "Outside" } },
    ],
  };

  const nodes = collectContextNodes(cyclicDocument, { scope: "branch", nodeId: "a" });
  assert.deepEqual(nodes.map(({ id }) => id), ["a", "b", "c"]);
});

test("image context keeps educational text but never leaks image storage data", () => {
  const context = buildTeacherContext(document, { scope: "branch", nodeId: "motion" });

  assert.match(context.text, /Đồ thị vận tốc theo thời gian/);
  assert.match(context.text, /Diện tích bên dưới là quãng đường/);
  assert.doesNotMatch(context.text, /private-secret-id|base64|SHOULD_NOT_LEAK|assetUrl/);
  assert.deepEqual(context.referencedNodeIds, ["motion", "diagram", "deep"]);
});

test("context rejects an invalid scope or a missing selected node", () => {
  assert.throws(
    () => collectContextNodes(document, { scope: "unknown", nodeId: "motion" }),
    /không hợp lệ/
  );
  assert.throws(
    () => collectContextNodes(document, { scope: "node", nodeId: "missing" }),
    /Không tìm thấy node/
  );
});

test("map context respects its maximum size", () => {
  const context = buildTeacherContext(document, { scope: "map", maxChars: 500 });
  assert.ok(context.text.length <= 500);
});
