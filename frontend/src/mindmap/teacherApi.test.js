import assert from "node:assert/strict";
import test from "node:test";
import { expandTeacherIdeas, sendTeacherMessage, TeacherApiError } from "./teacherApi.js";

test("teacher client sends an authenticated JSON request", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 201,
      json: async () => ({ message: { role: "assistant", content: "Chào bạn" } }),
    };
  };

  await sendTeacherMessage({ documentId: "map-1", message: "Dạy tôi", scope: "map" });
  assert.equal(captured.url, "/api/ai/chat");
  assert.equal(captured.options.credentials, "include");
  assert.equal(captured.options.method, "POST");
  assert.equal(JSON.parse(captured.options.body).documentId, "map-1");
});

test("teacher client preserves the daily quota error for the UI lock", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({
      message: "Đã hết lượt miễn phí.",
      code: "AI_DAILY_QUOTA_EXHAUSTED",
      retryAt: "2026-09-05T00:00:00.000Z",
    }),
  });

  await assert.rejects(
    sendTeacherMessage({ documentId: "map-1", message: "Dạy tôi", scope: "map" }),
    (error) => {
      assert.ok(error instanceof TeacherApiError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "AI_DAILY_QUOTA_EXHAUSTED");
      assert.equal(error.retryAt, "2026-09-05T00:00:00.000Z");
      return true;
    }
  );
});

test("idea expansion sends an authenticated preview request without mutating the map", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ documentId: "map-a", nodeId: "node-a", branches: [{ label: "Training", children: [] }] }) };
  };
  const input = { documentId: "map-a", nodeId: "node-a", explanation: "Dùng dữ liệu có nhãn." };
  const result = await expandTeacherIdeas(input);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/ai/expand");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), input);
  assert.equal(result.branches[0].label, "Training");
});
