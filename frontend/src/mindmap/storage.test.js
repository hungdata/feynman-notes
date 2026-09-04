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
