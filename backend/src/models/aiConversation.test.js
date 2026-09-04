import assert from "node:assert/strict";
import test from "node:test";
import { VALID_TEACHER_MODES } from "../ai/teacherPrompt.js";
import AiConversation from "./aiConversation.js";

const conversationFor = (mode) => new AiConversation({
  ownerId: "test-owner",
  documentId: "test-document",
  title: "Test conversation",
  mode,
  scope: "node",
  nodeId: "test-node",
});

test("conversation schema accepts every mode exposed by AI Teacher", async () => {
  for (const mode of VALID_TEACHER_MODES) {
    await assert.doesNotReject(conversationFor(mode).validate(), `mode ${mode} should persist`);
  }
});

test("conversation schema still rejects unknown modes", async () => {
  await assert.rejects(conversationFor("unknown-mode").validate(), /not a valid enum value/);
});
