import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

process.env.AUTH_SESSION_SECRET = "mind-map-router-integration-secret-123456";
process.env.LOCAL_MODE = "on";
delete process.env.NODE_ENV;

const { createApp } = await import("../app.js");
const { createFileStore } = await import("../storage/fileStore.js");
const { setStore } = await import("../storage/index.js");

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});

const setup = async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "feynman-store-"));
  const store = setStore(createFileStore(dataDir));
  const server = await listen(createApp());
  t.after(async () => {
    server.close();
    await store.flush();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, body) => {
    const response = await fetch(`${base}${url}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: response.status, body: json, headers: response.headers };
  };
  return { call, dataDir, store };
};

test("local mode works without login and a map can be created, read and listed", async (t) => {
  const { call } = await setup(t);
  const me = await call("GET", "/api/auth/me");
  assert.equal(me.body.user.provider, "local");

  const created = await call("POST", "/api/mindmaps", { title: "Ôn thi Vật lý", topics: ["Động học", "Động lực học"] });
  assert.equal(created.status, 201);
  assert.equal(created.body.document.title, "Ôn thi Vật lý");
  assert.equal(created.body.document.nodes.length, 3);

  const id = created.body.document.id;
  const read = await call("GET", `/api/mindmaps/${id}`);
  assert.equal(read.body.document.nodes[1].data.label, "Động học");

  const summary = await call("GET", "/api/mindmaps?view=summary");
  assert.deepEqual(summary.body.maps.map((map) => [map.title, map.topicCount]), [["Ôn thi Vật lý", 3]]);
});

test("PUT accepts the raw document, PATCH edits metadata and validation errors are clear", async (t) => {
  const { call } = await setup(t);
  const document = { title: "Raw", nodes: [{ id: "root", type: "topic", data: { label: "Raw", parentId: null } }] };
  const saved = await call("PUT", "/api/mindmaps/my-map", document);
  assert.equal(saved.status, 201);
  assert.equal(saved.body.document.id, "my-map");

  const again = await call("PUT", "/api/mindmaps/my-map", { document: { ...document, title: "Raw 2" } });
  assert.equal(again.status, 200);
  assert.ok(again.body.document.createdAt);

  const patched = await call("PATCH", "/api/mindmaps/my-map", { favorite: true, folder: "  Học tập  ", nodes: [] });
  assert.equal(patched.body.document.favorite, true);
  assert.equal(patched.body.document.folder, "Học tập");
  assert.equal(patched.body.document.nodes.length, 1, "PATCH must never replace topics");

  assert.equal((await call("PUT", "/api/mindmaps/bad%20id", document)).status, 400);
  assert.match((await call("PUT", "/api/mindmaps/x", { title: "no nodes" })).body.message, /nodes/);
  assert.equal((await call("GET", "/api/mindmaps/missing")).status, 404);
  assert.equal((await call("GET", "/api/nope")).body.code, "NOT_FOUND");
});

test("delete goes to trash first, restore brings it back and permanent delete removes it", async (t) => {
  const { call } = await setup(t);
  const { body } = await call("POST", "/api/mindmaps", { title: "Thùng rác" });
  const id = body.document.id;

  const trashed = await call("DELETE", `/api/mindmaps/${id}`);
  assert.ok(trashed.body.document.trashedAt);
  const restored = await call("POST", `/api/mindmaps/${id}/restore`);
  assert.equal(restored.body.document.trashedAt, null);

  assert.equal((await call("DELETE", `/api/mindmaps/${id}?permanent=true`)).status, 204);
  assert.equal((await call("GET", `/api/mindmaps/${id}`)).status, 404);
});

test("duplicate creates independent topic ids and export renders an outline", async (t) => {
  const { call } = await setup(t);
  const { body } = await call("POST", "/api/mindmaps", { title: "Gốc", topics: ["A", "B"] });
  const copy = await call("POST", `/api/mindmaps/${body.document.id}/duplicate`);
  assert.equal(copy.status, 201);
  assert.notEqual(copy.body.document.id, body.document.id);
  assert.match(copy.body.document.title, /bản sao/);
  const originalIds = new Set(body.document.nodes.filter((node) => node.data.parentId).map((node) => node.id));
  copy.body.document.nodes.filter((node) => node.data.parentId).forEach((node) => assert.equal(originalIds.has(node.id), false));

  const markdown = await call("GET", `/api/mindmaps/${body.document.id}/export?format=md`);
  assert.equal(markdown.status, 200);
  assert.match(markdown.body, /^# Gốc/);
  assert.match(markdown.body, /  - A/);
  const opml = await call("GET", `/api/mindmaps/${body.document.id}/export?format=opml`);
  assert.match(opml.body, /<outline text="B">/);
});

test("file storage persists to disk and survives a reload", async (t) => {
  const { call, dataDir, store } = await setup(t);
  await call("POST", "/api/mindmaps", { title: "Bền vững" });
  await store.flush();
  const reloaded = createFileStore(dataDir);
  const maps = await reloaded.mindMaps.list("local:owner");
  assert.equal(maps[0].title, "Bền vững");
});

test("tasks work on file storage with validation", async (t) => {
  const { call } = await setup(t);
  assert.equal((await call("POST", "/api/tasks", { title: "  " })).status, 400);
  const created = await call("POST", "/api/tasks", { title: "Đọc chương 3" });
  assert.equal(created.status, 201);
  const done = await call("PUT", `/api/tasks/${created.body._id}`, { status: "completed" });
  assert.equal(done.body.status, "completed");
  assert.ok(done.body.completedAt);
  assert.equal((await call("PUT", `/api/tasks/${created.body._id}`, { status: "weird" })).status, 400);
  const list = await call("GET", "/api/tasks");
  assert.equal(list.body.completedCount, 1);
  assert.equal((await call("DELETE", `/api/tasks/${created.body._id}`)).status, 200);
});
