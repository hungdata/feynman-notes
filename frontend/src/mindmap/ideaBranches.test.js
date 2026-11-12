import assert from "node:assert/strict";
import test from "node:test";
import { createTopicData } from "./constants.js";
import { getNodeSize } from "./layout.js";
import { insertIdeaBranches } from "./ideaBranches.js";

const topic = (id, label, parentId = null, extra = {}) => ({
  id, type: "topic", position: { x: 0, y: 0 },
  data: createTopicData({ label, parentId, ...extra }),
});
const map = (nodes = [topic("root", "Supervised learning")], layout = "horizontal") => ({
  id: "map-1", layout, nodes, settings: { spacing: "normal", styleSheet: "rainbow" },
  relations: {}, crossLinks: [], title: "Học máy",
});
const request = (branches) => ({ documentId: "map-1", sourceNodeId: "root", branches });
const factory = () => { let next = 0; return () => `new-${++next}`; };
const sample = () => [
  { label: "Huấn luyện (Training)", children: [{ label: "Hàm mất mát" }, { label: "Tối ưu tham số" }] },
  { label: "Dự đoán (Predicting)", children: [{ label: "Mẫu chưa thấy" }, { label: "Nhãn dự đoán" }] },
];
const assertNoOverlap = (nodes, label) => {
  for (let first = 0; first < nodes.length; first++) {
    for (let second = first + 1; second < nodes.length; second++) {
      const a = nodes[first];
      const b = nodes[second];
      const as = getNodeSize(a);
      const bs = getNodeSize(b);
      const collision = a.position.x < b.position.x + bs.width && a.position.x + as.width > b.position.x
        && a.position.y < b.position.y + bs.height && a.position.y + as.height > b.position.y;
      assert.equal(collision, false, `${label}: ${a.id} overlaps ${b.id}`);
    }
  }
};

test("a selected idea tree becomes one immutable snapshot with real parent ownership", () => {
  const document = map([topic("root", "Supervised learning", null, { note: "My explanation", collapsed: true, color: "#ff0000" })]);
  const original = structuredClone(document);
  const branches = sample();
  branches[0] = { ...branches[0], id: "root", parentId: "rogue", color: "red", data: { note: "injected" } };
  const result = insertIdeaBranches(document, request(branches), { idFactory: factory() });
  assert.equal(result.addedCount, 6);
  assert.deepEqual(document, original);
  assert.notEqual(result.document, document);
  assert.equal(result.document.nodes.length, 7);
  assert.equal(result.document.nodes[0].data.collapsed, false);
  assert.equal(result.document.nodes[0].data.note, "My explanation");
  assert.equal(result.document.nodes[0].data.color, "#ff0000");
  assert.equal(result.document.crossLinks, document.crossLinks);
  assert.equal(result.document.settings, document.settings);
  assert.deepEqual(result.branchIds, ["new-1", "new-4"]);
  assert.equal(result.document.nodes.find((node) => node.id === "new-1").data.parentId, "root");
  assert.equal(result.document.nodes.find((node) => node.id === "new-2").data.parentId, "new-1");
  const added = result.document.nodes.filter((node) => result.addedIds.includes(node.id));
  assert.ok(added.every((node) => node.data.color === "" && node.data.note === "" && node.data.layout === "inherit"));
  // Restoring the original snapshot removes the entire operation together.
  assert.equal(original.nodes.length, 1);
  assert.equal(original.nodes[0].data.collapsed, true);
});

test("existing sibling topics are reused and only missing children are inserted", () => {
  const document = map([
    topic("root", "Supervised learning"),
    topic("training", "  Huấn luyện   (TRAINING) ", "root", { collapsed: true, hidden: true, note: "Keep this note", borderColor: "#abc123" }),
    topic("loss", "Hàm mất mát", "training"),
  ]);
  const result = insertIdeaBranches(document, request(sample()), { idFactory: factory() });
  assert.equal(result.addedCount, 4);
  assert.equal(result.skippedCount, 2);
  assert.ok(result.branchIds.includes("training"));
  const reused = result.document.nodes.find((node) => node.id === "training");
  assert.equal(reused.data.note, "Keep this note");
  assert.equal(reused.data.borderColor, "#abc123");
  assert.equal(reused.data.collapsed, false);
  assert.equal(reused.data.hidden, false);
  assert.equal(result.document.nodes.filter((node) => node.data.label === "Hàm mất mát").length, 1);
  const repeated = insertIdeaBranches(result.document, request(sample()), { idFactory: factory() });
  assert.equal(repeated.addedCount, 0);
  assert.equal(repeated.document, result.document);
  assert.deepEqual(repeated.addedIds, []);
});

test("untrusted extra fields, malformed branches and deep descendants never become map data", () => {
  const branches = Array.from({ length: 9 }, (_, index) => ({
    label: `${index}: ${"Long ".repeat(40)}`,
    children: Array.from({ length: 6 }, (_, child) => ({
      label: `${child}: leaf`, id: "rogue", parentId: "root", note: "rogue",
      children: [{ label: "Too deep" }],
    })),
  }));
  const result = insertIdeaBranches(map(), request([null, [], { label: {} }, { label: " " }, ...branches]), { idFactory: factory() });
  assert.equal(result.addedCount, 24);
  assert.equal(result.branchIds.length, 6);
  assert.ok(result.document.nodes.every((node) => node.data.label.length <= 100));
  assert.ok(result.document.nodes.every((node) => node.data.label !== "Too deep"));
  assert.equal(result.document.nodes.filter((node) => node.id === "rogue").length, 0);
  assert.ok(result.document.nodes.every((node) => node.data.note === ""));
});

test("an insertion over the map limit rejects the entire operation", () => {
  const document = map();
  const result = insertIdeaBranches(document, request(sample()), { idFactory: factory(), maxNodes: 5 });
  assert.equal(result.errorCode, "IDEA_NODE_LIMIT");
  assert.equal(result.addedCount, 0);
  assert.equal(result.document, document);
  assert.equal(document.nodes.length, 1);
  assert.deepEqual(result.addedIds, []);
});

test("all layouts receive finite, separated nodes and free-form keeps manual positions", () => {
  for (const layout of ["horizontal", "right", "vertical", "topDown", "list", "linear", "radial", "matrix", "freeForm"]) {
    const document = map(undefined, layout);
    const originalPosition = { ...document.nodes[0].position };
    const result = insertIdeaBranches(document, request(sample()), { idFactory: factory() });
    assert.ok(result.document.nodes.every((node) => Number.isFinite(node.position.x) && Number.isFinite(node.position.y)), layout);
    assertNoOverlap(result.document.nodes, layout);
    if (layout === "freeForm") assert.deepEqual(result.document.nodes[0].position, originalPosition);
  }
});

test("stale documents and invalid sources never attach ideas to another topic", () => {
  const document = map([topic("root", "Root"), { id: "photo", type: "image", position: { x: 0, y: 0 }, data: {} }]);
  assert.equal(insertIdeaBranches(document, { ...request(sample()), documentId: "other-map" }), null);
  assert.equal(insertIdeaBranches(document, { ...request(sample()), sourceNodeId: "missing" }), null);
  assert.equal(insertIdeaBranches(document, { ...request(sample()), sourceNodeId: "photo" }), null);
  assert.equal(insertIdeaBranches(document, request(null)), null);
  assert.equal(insertIdeaBranches(document, request([{ label: " " }] )).document, document);
});
