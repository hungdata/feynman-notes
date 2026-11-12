import assert from "node:assert/strict";
import test from "node:test";
import { AiRequestError, runOpenAiChat } from "./openaiCompatibleProvider.js";

const config = (model = "gpt-5-nano") => ({
  AI_BASE_URL: "https://api.openai.com/v1",
  AI_API_KEY: "test-only-key",
  AI_MODEL: model,
});
const response = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const completion = (content = "Nhận xét hoàn chỉnh.", extra = {}) => ({
  model: "gpt-5-nano-2025-08-07",
  choices: [{ message: { content }, finish_reason: "stop", ...extra }],
  usage: { prompt_tokens: 80, completion_tokens: 120 },
});

test("GPT-5 nano uses bounded completion tokens and minimal reasoning without unsupported sampling fields", async () => {
  for (const model of ["gpt-5-nano", "gpt-5-nano-2025-08-07"]) {
    let request;
    const messages = [{ role: "user", content: "Giải thích của em" }];
    const result = await runOpenAiChat({
      messages,
      env: config(model),
      temperature: 0.2,
      maxTokens: 700,
      fetchImpl: async (url, options) => {
        request = { url, headers: options.headers, body: JSON.parse(options.body) };
        return response(completion());
      },
    });
    assert.equal(request.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(request.headers.Authorization, "Bearer test-only-key");
    assert.deepEqual(request.body.messages, messages);
    assert.equal(request.body.model, model);
    assert.equal(request.body.max_completion_tokens, 700);
    assert.equal(request.body.reasoning_effort, "minimal");
    assert.equal("temperature" in request.body, false);
    assert.equal("max_tokens" in request.body, false);
    assert.deepEqual(result.usage, { inputTokens: 80, outputTokens: 120 });
    assert.equal(result.model, "gpt-5-nano-2025-08-07");
  }
});

test("GPT-5 nano requests remain bounded when callers omit or misconfigure their token limit", async () => {
  for (const [maxTokens, expected] of [[undefined, 1200], [-1, 1200], [999999, 4096]]) {
    await runOpenAiChat({
      messages: [], env: config(), maxTokens,
      fetchImpl: async (_url, options) => {
        assert.equal(JSON.parse(options.body).max_completion_tokens, expected);
        return response(completion());
      },
    });
  }
});

test("non-reasoning compatible models retain temperature, max_tokens and JSON output parsing", async () => {
  const result = await runOpenAiChat({
    messages: [], json: true, temperature: 0.3, maxTokens: 500, env: config("local-model"),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.temperature, 0.3);
      assert.equal(body.max_tokens, 500);
      assert.equal("max_completion_tokens" in body, false);
      assert.equal("reasoning_effort" in body, false);
      assert.deepEqual(body.response_format, { type: "json_object" });
      return response(completion('{"ok":true}'));
    },
  });
  assert.deepEqual(result.data, { ok: true });
});

test("insufficient quota is permanent while a temporary rate limit can be retried", async () => {
  for (const error of [{ code: "insufficient_quota" }, { type: "insufficient_quota" }, { code: "billing_hard_limit_reached" }]) {
    await assert.rejects(runOpenAiChat({
      messages: [], env: config(),
      fetchImpl: async () => response({ error: { ...error, message: "private account information" } }, 429),
    }), (failure) => {
      assert.ok(failure instanceof AiRequestError);
      assert.equal(failure.code, "AI_QUOTA_EXHAUSTED");
      assert.equal(failure.retryable, false);
      assert.doesNotMatch(failure.message, /private account information/);
      return true;
    });
  }
  await assert.rejects(runOpenAiChat({
    messages: [], env: config(),
    fetchImpl: async () => response({ error: { code: "rate_limit_exceeded" } }, 429),
  }), (failure) => failure.code === "AI_RATE_LIMITED" && failure.retryable === true);
});

test("partial or empty reasoning output is never returned as a completed review or retried", async () => {
  for (const content of ["", "Kết luận\nĐúng một phần\nĐiểm đúng\nChưa viết xong"]) {
    let calls = 0;
    await assert.rejects(runOpenAiChat({
      messages: [], env: config(),
      fetchImpl: async () => {
        calls += 1;
        return response(completion(content, { finish_reason: "length" }));
      },
    }), (failure) => failure.code === "AI_OUTPUT_TRUNCATED" && failure.retryable === false);
    assert.equal(calls, 1);
  }
});

test("JSON format fallback retries only the unsupported format and keeps model and token cap", async () => {
  const bodies = [];
  const result = await runOpenAiChat({
    messages: [], json: true, maxTokens: 800, env: config(),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      return bodies.length === 1
        ? response({ error: { param: "response_format", message: "unsupported" } }, 400)
        : response(completion('{"ok":true}'));
    },
  });
  assert.equal(bodies.length, 2);
  assert.deepEqual(result.data, { ok: true });
  assert.deepEqual(bodies.map(({ model, max_completion_tokens }) => ({ model, max_completion_tokens })), [
    { model: "gpt-5-nano", max_completion_tokens: 800 },
    { model: "gpt-5-nano", max_completion_tokens: 800 },
  ]);
  assert.equal("response_format" in bodies[1], false);

  let rejectedCalls = 0;
  await assert.rejects(runOpenAiChat({
    messages: [], json: true, env: config(),
    fetchImpl: async () => {
      rejectedCalls += 1;
      return response({ error: { param: "messages", message: "sensitive test-only-key" } }, 400);
    },
  }), (failure) => failure.code === "AI_REJECTED" && !failure.message.includes("test-only-key"));
  assert.equal(rejectedCalls, 1);
});
