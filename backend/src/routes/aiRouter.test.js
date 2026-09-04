import assert from "node:assert/strict";
import test from "node:test";
import { createAiRateLimiter, normalizeTeacherRequest, ownedConversationFilter } from "./aiRouter.js";

test("teacher request validates scope, node and message boundaries", () => {
  assert.deepEqual(
    normalizeTeacherRequest({
      documentId: "map-1",
      nodeId: "node-1",
      message: "  Vì sao lực gây gia tốc?  ",
    }),
    {
      documentId: "map-1",
      conversationId: null,
      nodeId: "node-1",
      message: "Vì sao lực gây gia tốc?",
      mode: "socratic",
      scope: "node",
      webSearch: false,
    }
  );

  assert.throws(
    () => normalizeTeacherRequest({ documentId: "map-1", message: "test", scope: "node" }),
    /chọn một node/
  );
  assert.throws(
    () => normalizeTeacherRequest({ documentId: "map-1", message: "x".repeat(2_001), scope: "map" }),
    /2.000 ký tự/
  );

  assert.equal(
    normalizeTeacherRequest({
      documentId: "map-1",
      nodeId: "node-1",
      message: "Kiểm chứng note này.",
      mode: "verify",
      scope: "node",
    }).mode,
    "verify"
  );

  assert.equal(
    normalizeTeacherRequest({
      documentId: "map-1",
      nodeId: "node-1",
      message: "Hãy tranh luận về note này.",
      mode: "debate",
      scope: "node",
    }).mode,
    "debate"
  );

  assert.equal(
    normalizeTeacherRequest({
      documentId: "map-1",
      nodeId: "node-1",
      message: "Tìm thêm nguồn web.",
      webSearch: true,
    }).webSearch,
    true
  );

  const ragRequest = normalizeTeacherRequest({
    documentId: "map-1",
    nodeId: "node-1",
    message: "Giải thích bằng nguồn web.",
    mode: "explain_rag",
    webSearch: false,
  });
  assert.equal(ragRequest.mode, "explain_rag");
  assert.equal(ragRequest.webSearch, true);
});

test("conversation filters always include the authenticated owner", () => {
  assert.deepEqual(ownedConversationFilter("user-a", "conversation-a", "map-a"), {
    _id: "conversation-a",
    ownerId: "user-a",
    documentId: "map-a",
  });
});

test("AI rate limit is isolated per authenticated user", () => {
  const middleware = createAiRateLimiter({ limit: 1, windowMs: 60_000 });
  const response = () => ({
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  });

  let calls = 0;
  middleware({ user: { id: "user-a" } }, response(), () => calls++);
  const blocked = response();
  middleware({ user: { id: "user-a" } }, blocked, () => calls++);
  middleware({ user: { id: "user-b" } }, response(), () => calls++);

  assert.equal(calls, 2);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, "AI_LOCAL_RATE_LIMITED");
});
