import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherSystemPrompt, VALID_TEACHER_MODES } from "./teacherPrompt.js";

test("verify mode asks for a verdict, errors, corrected logic and a rewritten note", () => {
  assert.equal(VALID_TEACHER_MODES.has("verify"), true);

  const prompt = buildTeacherSystemPrompt({
    mode: "verify",
    scope: "node",
    context: "[node:one]\ntiêu đề: Trái Đất phẳng",
  });

  assert.match(prompt, /Kết luận/);
  assert.match(prompt, /chỗ sai/);
  assert.match(prompt, /lập luận đúng từng bước/);
  assert.match(prompt, /phiên bản note đã sửa/);
  assert.match(prompt, /Chưa đủ dữ kiện/);
});
