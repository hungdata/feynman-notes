import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderError,
  clearCloudflareDailyQuotaBlock,
  getCloudflareAiAvailability,
  runCloudflareModel,
} from "./cloudflareProvider.js";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "account-for-tests",
  CLOUDFLARE_AI_TOKEN: "token-for-tests",
  CLOUDFLARE_AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  AI_MAX_OUTPUT_TOKENS: "640",
};

test("Cloudflare provider sends chat messages and normalizes the response", async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          response: "  Câu hỏi Socratic đầu tiên?  ",
          usage: { prompt_tokens: 42, completion_tokens: 9 },
        },
      }),
    };
  };

  const result = await runCloudflareModel({
    env,
    fetchImpl,
    messages: [{ role: "user", content: "Dạy tôi" }],
  });

  assert.match(captured.url, /accounts\/account-for-tests\/ai\/run\/@cf\/meta\/llama-3\.3/);
  assert.equal(captured.options.headers.Authorization, "Bearer token-for-tests");
  assert.deepEqual(JSON.parse(captured.options.body).messages, [
    { role: "user", content: "Dạy tôi" },
  ]);
  assert.equal(JSON.parse(captured.options.body).max_tokens, 640);
  assert.equal(result.content, "Câu hỏi Socratic đầu tiên?");
  assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 9 });
});

test("Cloudflare provider blocks all later calls when the daily allocation is exhausted", async (t) => {
  clearCloudflareDailyQuotaBlock();
  t.after(clearCloudflareDailyQuotaBlock);
  let requests = 0;
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    json: async () => {
      requests += 1;
      return { errors: [{ code: 3036, message: "sensitive provider detail" }] };
    },
  });

  await assert.rejects(
    runCloudflareModel({
      env,
      fetchImpl,
      messages: [{ role: "user", content: "Dạy tôi" }],
    }),
    (error) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "AI_DAILY_QUOTA_EXHAUSTED");
      assert.match(error.message, /hết lượt miễn phí.*ngày mai/i);
      assert.ok(error.retryAt);
      assert.doesNotMatch(error.message, /sensitive provider detail|token-for-tests/);
      return true;
    }
  );

  assert.equal(getCloudflareAiAvailability().available, false);
  await assert.rejects(
    runCloudflareModel({
      env,
      fetchImpl: async () => assert.fail("blocked calls must not reach Cloudflare"),
      messages: [{ role: "user", content: "Thử lại" }],
    }),
    (error) => error.code === "AI_DAILY_QUOTA_EXHAUSTED"
  );
  assert.equal(requests, 1);
});

test("a temporary Cloudflare 429 is not mislabeled as exhausted daily quota", async () => {
  clearCloudflareDailyQuotaBlock();
  const fetchImpl = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ errors: [{ code: 3040, message: "out of capacity" }] }),
  });

  await assert.rejects(
    runCloudflareModel({
      env,
      fetchImpl,
      messages: [{ role: "user", content: "Dạy tôi" }],
    }),
    (error) => {
      assert.equal(error.code, "AI_UPSTREAM_BUSY");
      assert.doesNotMatch(error.message, /ngày mai/i);
      return true;
    }
  );
});

test("Cloudflare provider fails safely when server credentials are missing", async () => {
  await assert.rejects(
    runCloudflareModel({
      env: {},
      fetchImpl: async () => assert.fail("fetch must not run"),
      messages: [{ role: "user", content: "Dạy tôi" }],
    }),
    (error) => error instanceof AiProviderError && error.code === "AI_NOT_CONFIGURED"
  );
});
