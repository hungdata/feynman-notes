import assert from "node:assert/strict";
import test from "node:test";
import { ASSESSMENT_SCHEMA } from "../explanationAssessment.js";
import { runTeacherModel } from "./index.js";

const environmentKeys = [
  "AI_PROVIDER", "AI_BASE_URL", "AI_API_KEY", "AI_MODEL", "AI_MAX_OUTPUT_TOKENS",
  "AI_DAILY_REQUEST_LIMIT", "AI_REQUEST_TIMEOUT_MS", "AI_TEACHER_TIMEOUT_MS",
  "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN", "CLOUDFLARE_AI_MODEL",
];
const withEnvironment = async (values, run) => {
  const previous = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) delete process.env[key];
    Object.assign(process.env, values);
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};
const openAiEnvironment = {
  AI_PROVIDER: "openai",
  AI_BASE_URL: "https://api.openai.com/v1",
  AI_API_KEY: "test-only-key",
  AI_MODEL: "gpt-5-nano",
};
const cloudflareEnvironment = {
  AI_PROVIDER: "cloudflare",
  CLOUDFLARE_ACCOUNT_ID: "test-only-account",
  CLOUDFLARE_AI_TOKEN: "test-only-token",
};
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const completion = (content) => ({
  model: "gpt-5-nano-2025-08-07",
  choices: [{ message: { content }, finish_reason: "stop" }],
  usage: { prompt_tokens: 80, completion_tokens: 120 },
});
const assessment = () => ({
  correctQuotes: ["dữ liệu có nhãn"],
  errors: [],
  uncertainQuotes: [],
  scores: { mainIdea: 40, mechanism: 30, example: 0, clarity: 10 },
  hasExample: false,
  missing: [{ criterion: "example", suggestion: "Thêm ví dụ email được gán nhãn spam/không spam." }],
  rewrittenExplanation: "Học từ dữ liệu có nhãn. Ví dụ email được gán nhãn spam hoặc không spam.",
});
const messages = [
  { role: "system", content: "Đánh giá lời giải thích bằng JSON." },
  { role: "user", content: "Một lời giải thích cũ không dùng để chấm." },
  { role: "assistant", content: "Hãy giải thích lại." },
  { role: "user", content: "Học có giám sát sử dụng dữ liệu có nhãn." },
];

test("verify requests strict assessment JSON and computes knowledge correctness separately from completeness", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    return response(completion(JSON.stringify(assessment())));
  });

  await withEnvironment({ ...openAiEnvironment, AI_MAX_OUTPUT_TOKENS: "900" }, async () => {
    const result = await runTeacherModel({ messages, mode: "verify" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.openai.com/v1/chat/completions");
    assert.deepEqual(requests[0].body.response_format, { type: "json_schema", json_schema: ASSESSMENT_SCHEMA });
    assert.equal(requests[0].body.model, "gpt-5-nano");
    assert.equal(requests[0].body.max_completion_tokens, 900);
    assert.deepEqual(JSON.parse(requests[0].body.messages.at(-1).content), { studentExplanation: messages.at(-1).content });
    assert.equal(requests[0].body.messages[1].content, messages[1].content);
    assert.equal(messages.at(-1).content, "Học có giám sát sử dụng dữ liệu có nhãn.");
    assert.match(result.content, /Độ đúng kiến thức: khoảng 100%/);
    assert.match(result.content, /Độ đầy đủ: khoảng 80%/);
    assert.match(result.content, /Không có lỗi kiến thức trong các ý đã viết/);
    for (const heading of ["Kết luận", "Điểm đúng", "Chỗ cần sửa", "Vì sao", "Còn thiếu gì", "Cách giải thích lại"]) {
      assert.ok(result.content.includes(heading));
    }
    assert.equal(result.model, "gpt-5-nano-2025-08-07");
    assert.deepEqual(result.usage, { inputTokens: 80, outputTokens: 120 });
  });
});

test("compatible providers use JSON mode and retain the existing default token cap", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, { type: "json_object" });
    assert.equal(body.max_completion_tokens, 1200);
    return response(completion(`\`\`\`json\n${JSON.stringify(assessment())}\n\`\`\``));
  });
  await withEnvironment({ ...openAiEnvironment, AI_BASE_URL: "http://127.0.0.1:8045/v1" }, async () => {
    const result = await runTeacherModel({ messages, mode: "verify" });
    assert.match(result.content, /Độ đúng kiến thức: khoảng 100%/);
  });
});

test("other teacher modes return ordinary chat without requesting assessment JSON", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal("response_format" in body, false);
    assert.deepEqual(body.messages, messages);
    return response(completion("Giải thích bằng ví dụ thông thường."));
  });
  await withEnvironment(openAiEnvironment, async () => {
    const result = await runTeacherModel({ messages, mode: "explain" });
    assert.equal(result.content, "Giải thích bằng ví dụ thông thường.");
  });
});

test("invalid assessment or evidence absent from the latest explanation rejects after one request", async (t) => {
  let calls = 0;
  let content;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return response(completion(content));
  });
  await withEnvironment(openAiEnvironment, async () => {
    const fabricatedEvidence = assessment();
    fabricatedEvidence.correctQuotes = ["Một lời giải thích cũ không dùng để chấm."];
    for (const payload of [{}, fabricatedEvidence]) {
      content = JSON.stringify(payload);
      const before = calls;
      await assert.rejects(runTeacherModel({ messages, mode: "verify" }), (error) => error.code === "AI_BAD_ASSESSMENT");
      assert.equal(calls, before + 1);
    }
  });
});

test("a rejected strict schema does not send a second request or change model", async (t) => {
  const bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return response({ error: { param: "response_format", message: "unsupported schema; private test-only-key" } }, 400);
  });
  await withEnvironment(openAiEnvironment, async () => {
    await assert.rejects(runTeacherModel({ messages, mode: "verify" }), (error) => {
      assert.equal(error.code, "AI_REJECTED");
      assert.doesNotMatch(error.message, /test-only-key/);
      return true;
    });
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].model, "gpt-5-nano");
    assert.equal(bodies[0].max_completion_tokens, 1200);
  });
});

test("Cloudflare verify parses assessment JSON while ordinary teaching stays plain text", async (t) => {
  let content = `\`\`\`json\n${JSON.stringify(assessment())}\n\`\`\``;
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(url, /^https:\/\/api\.cloudflare\.com\//);
    return response({ success: true, result: { response: content, usage: { prompt_tokens: 12, completion_tokens: 34 } } });
  });
  await withEnvironment(cloudflareEnvironment, async () => {
    const verified = await runTeacherModel({ messages, mode: "verify" });
    assert.match(verified.content, /Độ đúng kiến thức: khoảng 100%/);
    assert.match(verified.content, /Độ đầy đủ: khoảng 80%/);
    assert.deepEqual(verified.usage, { inputTokens: 12, outputTokens: 34 });
    content = "Một câu hỏi Socratic.";
    const plain = await runTeacherModel({ messages, mode: "socratic" });
    assert.equal(plain.content, content);
    content = "{}";
    await assert.rejects(runTeacherModel({ messages, mode: "verify" }), (error) => error.code === "AI_BAD_ASSESSMENT");
  });
});
