import assert from "node:assert/strict";
import test from "node:test";
import { buildTeacherSystemPrompt, VALID_TEACHER_MODES, WEB_RAG_MODES } from "./teacherPrompt.js";

test("verify mode reviews the latest explanation fairly with specific errors, reasons and a rewrite", () => {
  assert.equal(VALID_TEACHER_MODES.has("verify"), true);

  const prompt = buildTeacherSystemPrompt({
    mode: "verify",
    scope: "node",
    context: "[node:one]\ntiêu đề: Trái Đất phẳng",
  });

  assert.match(prompt, /Kết luận/);
  for (const heading of ["Kết luận", "Điểm đúng", "Chỗ cần sửa", "Vì sao", "Cách giải thích lại"]) {
    assert.ok(prompt.includes(heading));
  }
  assert.match(prompt, /tin nhắn mới nhất/);
  assert.match(prompt, /trích nguyên văn/);
  assert.match(prompt, /lỗi kiến thức hay diễn đạt còn mơ hồ/);
  assert.match(prompt, /Không bịa lỗi/);
  assert.match(prompt, /Không chấm điểm số hay phần trăm/);
  assert.match(prompt, /Không kết thúc bằng câu hỏi/);
  assert.match(prompt, /không phải đáp án chuẩn/);
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
