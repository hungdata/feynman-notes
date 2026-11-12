import test from "node:test";
import assert from "node:assert/strict";
import { createInitialDocument, DOCUMENT_VERSION, STORAGE_KEY } from "./constants.js";
import { loadDocuments, migrateDocument, saveDocuments } from "./storage.js";

const useMemoryStorage = () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return values;
};

test("documents survive a save and reload round trip", () => {
  const values = useMemoryStorage();
  const document = createInitialDocument();
  document.title = "Bản đồ đã lưu";
  document.nodes[0].data.note = "persisted";
  saveDocuments([document]);
  assert.ok(values.has(STORAGE_KEY));
  const loaded = loadDocuments();
  assert.equal(loaded[0].title, "Bản đồ đã lưu");
  assert.equal(loaded[0].nodes[0].data.note, "persisted");
});

test("legacy documents migrate relation, layout, and node defaults", () => {
  useMemoryStorage();
  const migrated = migrateDocument({
    id: "old",
    title: "Old",
    layout: "right",
    nodes: [{ id: "root", position: { x: 0, y: 0 }, data: { label: "Root", parentId: null } }],
  });
  assert.equal(migrated.version, DOCUMENT_VERSION);
  assert.equal(migrated.layout, "horizontal");
  assert.deepEqual(migrated.crossLinks, []);
  assert.deepEqual(migrated.relations, {});
  assert.equal(migrated.nodes[0].data.relationStyle, "inherit");
  assert.equal(migrated.nodes[0].data.hidden, false);
});

test("legacy default topic text is removed", () => {
  const migrated = migrateDocument({
    id: "legacy-label",
    nodes: [{ id: "root", type: "topic", position: { x: 0, y: 0 }, data: { label: "Chủ đề mới", parentId: null } }],
  });
  assert.equal(migrated.nodes[0].data.label, "");
});

test("legacy accidental crosslinks are removed during version 4 migration", () => {
  const migrated = migrateDocument({
    version: 3,
    id: "legacy-crosslinks",
    nodes: [
      { id: "root", type: "topic", position: { x: 0, y: 0 }, data: { label: "Root", parentId: null } },
      { id: "child", type: "topic", position: { x: 380, y: 0 }, data: { label: "Child", parentId: "root" } },
    ],
    crossLinks: [{ id: "accidental", source: "root", target: "child" }],
  });
  assert.deepEqual(migrated.crossLinks, []);
});

test("version 6 maps hand their default colours to the style sheet but keep user choices", () => {
  const migrated = migrateDocument({
    version: 6,
    id: "v6",
    title: "V6",
    layout: "horizontal",
    settings: { theme: "pastel", background: "#f7f9fc", relationStyle: "straight", relationWidth: 2.5, grid: "dots" },
    nodes: [
      { id: "root", type: "topic", position: { x: 80, y: 240 }, measured: { width: 450, height: 76 }, data: { label: "Root", parentId: null, color: "#172554", textColor: "#ffffff", borderColor: "#2563eb", branchColor: "#2563eb", fontSize: 18, fontWeight: 700 } },
      { id: "a", type: "topic", position: { x: 670, y: 100 }, data: { label: "A", parentId: "root", color: "#ffffff", textColor: "#172033", borderColor: "#dbe4f0", branchColor: "#7c3aed", fontSize: 15, fontWeight: 600, checked: true } },
      { id: "ai", type: "topic", position: { x: 670, y: 300 }, data: { label: "Teacher", parentId: "root", color: "#f5f3ff", textColor: "#4c1d95", borderColor: "#a78bfa", branchColor: "#ff00aa" } },
    ],
  });
  const [root, a, ai] = migrated.nodes;
  assert.equal(migrated.settings.styleSheet, "pastel");
  assert.equal(migrated.settings.background, "");
  assert.equal(migrated.settings.relationStyle, "");
  assert.equal(migrated.settings.grid, "none");
  assert.equal(migrated.settings.checkboxes, true);
  assert.equal(root.data.color, "");
  assert.equal(root.data.fontSize, null);
  assert.equal(root.measured, undefined);
  assert.deepEqual(root.position, { x: 80, y: 240 });
  assert.equal(a.data.branchColor, "");
  assert.equal(a.data.checkbox, true);
  assert.equal(ai.data.color, "#f5f3ff");
  assert.equal(ai.data.branchColor, "#ff00aa");
});

test("templates create nested branches with their own style sheet", async () => {
  const { createFromTemplate } = await import("./storage.js");
  const document = createFromTemplate("feynman");
  assert.equal(document.title, "Phương pháp Feynman");
  assert.ok(document.nodes.length > 5);
  assert.ok(document.nodes.some((node) => node.data.parentId && node.data.parentId !== "root"));
});
