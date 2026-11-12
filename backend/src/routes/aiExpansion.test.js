import assert from "node:assert/strict";
import express from "express";
import test from "node:test";

process.env.AUTH_SESSION_SECRET = "ai-expansion-test-session-secret-123456";
process.env.LOCAL_MODE = "off";
process.env.AI_PROVIDER = "openai";
process.env.AI_BASE_URL = "https://api.openai.com/v1";
process.env.AI_MODEL = "gpt-5-nano";
process.env.AI_API_KEY = "test-only-key";
process.env.AI_RATE_LIMIT_PER_MINUTE = "3";
process.env.AI_MAX_OUTPUT_TOKENS = "1200";
delete process.env.AI_DAILY_REQUEST_LIMIT;
const { default: aiRouter } = await import("./aiRouter.js");
const { setStore } = await import("../storage/index.js");
const { createSessionToken } = await import("../auth/session.js");

const document = { id: "map-1", nodes: [
  { id: "root", type: "topic", data: { label: "Supervised learning", parentId: null } },
  { id: "old", type: "topic", data: { label: "Huấn luyện", parentId: "root" } },
] };
let nextUser = 0;
const setup = async (t) => {
  const requests = [];
  const nativeFetch = globalThis.fetch;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith("https://api.openai.com/")) {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200, json: async () => ({
        model: "gpt-5-nano", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ branches: [
          { label: "Huấn luyện", children: [] },
          { label: "Dự đoán", parentId: "bad", children: [{ label: "Mẫu mới" }] },
        ] }) } }],
      }) };
    }
    return nativeFetch(url, options);
  });
  const ownerId = `guest:test-${++nextUser}`;
  let reads = 0;
  setStore({ mindMaps: { get: async (owner, id) => {
    reads++;
    return owner === ownerId && id === "map-1" ? { document } : null;
  } } });
  const app = express();
  app.use(express.json());
  app.use("/api/ai", aiRouter);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => { server.closeAllConnections(); server.close(); });
  const cookie = (id = ownerId) => `feynman_session=${createSessionToken({ id, provider: "guest" }, process.env.AUTH_SESSION_SECRET)}`;
  const call = async (path, body, credentials = cookie()) => {
    const response = await nativeFetch(`http://127.0.0.1:${server.address().port}/api/ai/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: credentials }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  return { call, cookie, requests, reads: () => reads };
};

test("idea expansion requires signed authentication and ownership before calling AI", async (t) => {
  const { call, cookie, requests, reads } = await setup(t);
  const input = { documentId: "map-1", nodeId: "root" };
  assert.equal((await call("expand", input, "")).status, 401);
  assert.equal(reads(), 0);
  assert.equal((await call("expand", input, cookie("guest:another-owner"))).status, 404);
  assert.equal((await call("expand", { ...input, nodeId: "missing" })).status, 404);
  assert.equal(requests.length, 0);
});

test("idea endpoint returns only validated preview nodes without writing a mind map", async (t) => {
  const { call, requests } = await setup(t);
  const result = await call("expand", { documentId: "map-1", nodeId: "root", explanation: "Dữ liệu có nhãn giúp học quy luật" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { documentId: "map-1", nodeId: "root", branches: [{ label: "Dự đoán", children: [{ label: "Mẫu mới" }] }], model: "gpt-5-nano" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].response_format.type, "json_schema");
  assert.equal(requests[0].response_format.json_schema.strict, true);
  assert.equal(requests[0].max_completion_tokens, 1200);
  assert.equal(document.nodes.length, 2);
});

test("chat and expansion share one per-user request allowance", async (t) => {
  const { call, requests } = await setup(t);
  const input = { documentId: "map-1", nodeId: "root" };
  assert.equal((await call("expand", input)).status, 200);
  // Invalid chat input still consumes the existing local anti-spam allowance,
  // but never reaches a provider or needs a fake conversation store.
  assert.equal((await call("chat", { ...input, message: "" })).status, 400);
  assert.equal((await call("expand", input)).status, 200);
  const blocked = await call("chat", { ...input, message: "Học từ dữ liệu" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, "AI_LOCAL_RATE_LIMITED");
  assert.equal(requests.length, 2);
});
