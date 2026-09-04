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

test("debate mode challenges the selected note without arguing for its own sake", () => {
  assert.equal(VALID_TEACHER_MODES.has("debate"), true);

  const prompt = buildTeacherSystemPrompt({
    mode: "debate",
    scope: "node",
    context: "[node:one] | NOTE ĐƯỢC NGƯỜI DÙNG CHỌN\ntiêu đề: Một luận điểm",
  });

  assert.match(prompt, /Tranh luận học thuật/);
  assert.match(prompt, /phản biện hợp lý/);
  assert.match(prompt, /bằng chứng hoặc giả định còn thiếu/);
});
