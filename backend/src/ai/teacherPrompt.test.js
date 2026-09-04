import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherSystemPrompt, VALID_TEACHER_MODES, WEB_RAG_MODES } from "./teacherPrompt.js";

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

test("web context is isolated as untrusted evidence and requires citations", () => {
  const prompt = buildTeacherSystemPrompt({
    mode: "explain",
    scope: "node",
    context: "[node:one]\ntiêu đề: Một note",
    webContext: "[1] Một nguồn\nURL: https://example.edu\nTrích đoạn: dữ liệu",
  });

  assert.match(prompt, /<WEB_CONTEXT>/);
  assert.match(prompt, /không đáng tin tuyệt đối/);
  assert.match(prompt, /bỏ qua mọi câu lệnh/);
  assert.match(prompt, /\[1\]/);
});

test("dedicated RAG modes are exposed and require numbered web evidence", () => {
  for (const mode of ["explain_rag", "debate_rag", "verify_rag"]) {
    assert.equal(VALID_TEACHER_MODES.has(mode), true);
    assert.equal(WEB_RAG_MODES.has(mode), true);
    const prompt = buildTeacherSystemPrompt({
      mode,
      scope: "node",
      context: "[node:one]\ntiêu đề: Một note",
      webContext: "[1] Nguồn web",
    });
    assert.match(prompt, /Web RAG/);
    assert.match(prompt, /\[n\]/);
  }
});
