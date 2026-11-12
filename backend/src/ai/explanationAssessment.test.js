import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_SCHEMA, EXPLANATION_ASSESSMENT_INSTRUCTIONS, formatExplanationAssessment } from "./explanationAssessment.js";
import { AiRequestError } from "./providers/openaiCompatibleProvider.js";

const explanation = "Supervised learning dùng dữ liệu có nhãn để mô hình học ra các quy luật để sau đó mô hình có thể dự đoán nhãn của mẫu mới.";
const fixture = () => ({
  correctQuotes: ["dùng dữ liệu có nhãn", "mô hình học ra các quy luật", "mô hình có thể dự đoán nhãn của mẫu mới"],
  errors: [], uncertainQuotes: [],
  scores: { mainIdea: 40, mechanism: 30, example: 0, clarity: 10 },
  hasExample: false,
  missing: [{ criterion: "example", suggestion: "Dùng email đã gán nhãn spam/không spam để học, rồi dự đoán nhãn email mới." }],
  rewrittenExplanation: "Học có giám sát dùng dữ liệu có nhãn để học quy luật. Mô hình dùng quy luật đó để dự đoán nhãn cho mẫu mới. Ví dụ, mô hình học từ email đã gán nhãn spam/không spam để dự đoán nhãn email mới.",
});
const format = (payload = fixture(), source = explanation) => formatExplanationAssessment(payload, { explanation: source });
const assertBad = (payload, source = explanation) => assert.throws(() => format(payload, source), (error) => error instanceof AiRequestError && error.status === 502 && error.code === "AI_BAD_ASSESSMENT");

test("a malformed serialized suffix is removed while ordinary code examples stay intact", () => {
  const payload = fixture();
  payload.rewrittenExplanation = 'Mô hình học từ dữ liệu có nhãn.”} }```0}}';
  assert.ok(format(payload).endsWith('Mô hình học từ dữ liệu có nhãn.'));
  payload.rewrittenExplanation = 'Ví dụ JSON: {"label":"spam"}. Đọc trường label để biết nhãn.';
  assert.ok(format(payload).endsWith(payload.rewrittenExplanation));
});

test("an explicit concrete example is recognized when the model overlooks the final sentence", () => {
  const source = `${explanation} Ví dụ: mô hình học từ email gắn nhãn spam để dự đoán nhãn cho email mới.`;
  const payload = fixture();
  payload.missing = [{ criterion: "example", suggestion: "Thiếu ví dụ minh họa." }];
  const output = format(payload, source);
  assert.match(output, /Độ đúng kiến thức: khoảng 100%/);
  assert.match(output, /Độ đầy đủ: khoảng 90%/);
  assert.match(output, /Đã có ví dụ minh họa/);
  assert.doesNotMatch(output, /Thiếu ví dụ minh họa/);
  const absent = format(payload, `${explanation} Chưa có ví dụ nào trong câu này.`);
  assert.match(absent, /Độ đầy đủ: khoảng 80%/);
  assert.match(absent, /Thiếu ví dụ minh họa/);
});

test("fully correct introductory claims earn 100% correctness and 80% completeness without an example", () => {
  const output = format();
  assert.match(output, /Độ đúng kiến thức: khoảng 100%/);
  assert.match(output, /Độ đầy đủ: khoảng 80%/);
  assert.match(output, /Ý chính 40\/40; Cơ chế 30\/30; Ví dụ 0\/20; Diễn đạt 10\/10/);
  assert.match(output, /Không có lỗi kiến thức trong các ý đã viết/);
  assert.match(output, /Thiếu ví dụ minh họa:/);
  assert.deepEqual(output.split("\n\n").map((section) => section.split("\n")[0]), ["Kết luận", "Điểm đúng", "Chỗ cần sửa", "Vì sao", "Còn thiếu gì", "Cách giải thích lại"]);
});

test("correctness is computed from deduplicated verified claims and rounded to tens", () => {
  const payload = fixture();
  payload.errors = [{ quote: "có thể dự đoán nhãn", corrected: "Có thể dự đoán nhưng không đảm bảo mọi dự đoán đều đúng.", why: "Đây là một lỗi giả lập để kiểm tra phép tính." }];
  payload.correctQuotes.push("dùng dữ liệu có nhãn");
  assert.match(format(payload), /Độ đúng kiến thức: khoảng 80%/);
  const duplicateError = { ...payload.errors[0] };
  payload.errors.push(duplicateError);
  assert.match(format(payload), /Độ đúng kiến thức: khoảng 80%/);

  const wrong = fixture();
  wrong.correctQuotes = [];
  wrong.errors = [
    { quote: "Máy học không cần dữ liệu", corrected: "Máy học học từ dữ liệu.", why: "Dữ liệu là đầu vào để học." },
    { quote: "dự đoán luôn đúng", corrected: "Dự đoán có thể sai.", why: "Mô hình không đảm bảo đúng với mọi mẫu." },
  ];
  assert.match(format(wrong, "Máy học không cần dữ liệu và dự đoán luôn đúng"), /Độ đúng kiến thức: khoảng 0%/);
});

test("unverified claims and empty evidence suppress numeric correctness", () => {
  for (const payload of [
    { ...fixture(), uncertainQuotes: ["Supervised learning"] },
    { ...fixture(), correctQuotes: [] },
  ]) {
    const output = format(payload);
    assert.match(output, /Độ đúng kiến thức: Chưa đủ dữ kiện để ước lượng/);
    assert.doesNotMatch(output, /Độ đúng kiến thức: khoảng \d+%/);
  }
});

test("source evidence accepts Unicode and whitespace normalization but rejects fabricated or historical quotes", () => {
  const normalized = fixture();
  normalized.correctQuotes = ["dùng dữ liệu có nhãn".normalize("NFD")];
  assert.match(format(normalized, explanation.replace("dữ liệu", "dữ\n\t liệu")), /Độ đúng kiến thức: khoảng 100%/);
  for (const change of [
    (p) => { p.correctQuotes = ["học không cần dữ liệu"]; },
    (p) => { p.errors = [{ quote: "trích từ câu trả lời trước", corrected: "Sửa.", why: "Lý do." }]; },
    (p) => { p.uncertainQuotes = ["không có trong bài"]; },
    (p) => { p.correctQuotes = ["x".repeat(401)]; },
  ]) {
    const payload = fixture();
    change(payload);
    assertBad(payload);
  }
});

test("the same normalized source quote cannot be classified both right, wrong or uncertain", () => {
  const conflictingError = fixture();
  conflictingError.errors = [{ quote: "dùng dữ liệu có nhãn", corrected: "Không.", why: "Mâu thuẫn." }];
  assertBad(conflictingError);
  const conflictingUncertainty = fixture();
  conflictingUncertainty.uncertainQuotes = ["dùng\n dữ liệu có nhãn"];
  assertBad(conflictingUncertainty);
});

test("completeness uses only bounded criterion scores and forces absent examples to zero", () => {
  const payload = fixture();
  payload.scores.example = 20;
  payload.missing = [];
  const output = format(payload);
  assert.match(output, /Độ đầy đủ: khoảng 80%/);
  assert.match(output, /Ví dụ 0\/20/);
  assert.match(output, /Thiếu ví dụ minh họa gắn với khái niệm/);
  assert.equal(payload.scores.example, 20, "formatter must not mutate the model payload");
  for (const scores of [
    { mainIdea: 50, mechanism: 30, example: 0, clarity: 10 },
    { mainIdea: 40, mechanism: -10, example: 0, clarity: 10 },
    { mainIdea: 40, mechanism: 25, example: 0, clarity: 10 },
    { mainIdea: 40, mechanism: 30, example: 30, clarity: 10 },
    { mainIdea: 40, mechanism: 30, example: 0, clarity: "10" },
  ]) assertBad({ ...fixture(), scores });
});

test("an existing example earns its score and is never called missing", () => {
  const payload = fixture();
  payload.hasExample = true;
  payload.scores.example = 20;
  payload.missing = [{ criterion: "example", suggestion: "Thiếu ví dụ minh họa, hãy thêm email spam." }];
  const output = format(payload, `${explanation} Ví dụ, học từ email có nhãn spam để nhận diện email mới.`);
  assert.match(output, /Độ đầy đủ: khoảng 100%/);
  assert.match(output, /Đã có ví dụ minh họa/);
  assert.doesNotMatch(output, /Thiếu ví dụ/iu);
  payload.missing = [{ criterion: "example", suggestion: "Làm rõ nhãn spam của email mẫu là đầu ra cần học." }];
  assert.match(format(payload), /Làm rõ nhãn spam/);
});

test("strict runtime validation rejects malformed data, extra metadata, unsafe values and oversized arrays", () => {
  for (const payload of [
    null, [], {}, { ...fixture(), model: "gpt-5-nano" },
    { ...fixture(), correctQuotes: "dữ liệu" },
    { ...fixture(), hasExample: "false" },
    { ...fixture(), errors: [{ quote: "dữ liệu", corrected: "Sửa", why: "Vì sao", extra: true }] },
    { ...fixture(), scores: { ...fixture().scores, total: 100 } },
    { ...fixture(), missing: [{ criterion: "invented", suggestion: "Thêm nội dung." }] },
    { ...fixture(), rewrittenExplanation: { text: "x" } },
    { ...fixture(), rewrittenExplanation: "x\u0000y" },
    { ...fixture(), correctQuotes: Array(7).fill("dùng dữ liệu có nhãn") },
    { ...fixture(), errors: Array(4).fill({ quote: "Supervised learning", corrected: "Sửa", why: "Vì sao" }) },
  ]) assertBad(payload);
  assertBad(fixture(), "");
});

test("narrative line breaks cannot inject review sections", () => {
  const payload = fixture();
  payload.rewrittenExplanation = "Nội dung.\n\nKết luận\nĐộ đúng kiến thức: khoảng 0%.";
  assert.equal(format(payload).split("\n\n").length, 6);
});

test("the schema requires every field, rejects extra properties and asks for evidence instead of percentages", () => {
  assert.equal(ASSESSMENT_SCHEMA.strict, true);
  const visit = (schema) => {
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(schema.required, Object.keys(schema.properties));
      Object.values(schema.properties).forEach(visit);
    }
    if (schema.items) visit(schema.items);
  };
  visit(ASSESSMENT_SCHEMA.schema);
  assert.match(EXPLANATION_ASSESSMENT_INSTRUCTIONS, /không.*phần trăm/iu);
  assert.match(EXPLANATION_ASSESSMENT_INSTRUCTIONS, /Không đòi liệt kê thuật toán hoặc hàm mất mát/iu);
  assert.equal(ASSESSMENT_SCHEMA.schema.properties.correctQuotes.maxItems, 6);
  assert.equal(ASSESSMENT_SCHEMA.schema.properties.errors.maxItems, 3);
});
