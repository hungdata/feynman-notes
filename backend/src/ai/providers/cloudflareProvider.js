const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
let dailyQuotaBlockedUntil = 0;

export class AiProviderError extends Error {
  constructor(message, { status = 502, code = "AI_PROVIDER_ERROR", retryAt = null } = {}) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

const nextUtcMidnight = (now = Date.now()) => {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
};

const dailyQuotaError = () =>
  new AiProviderError(
    "Hôm nay AI Teacher đã hết lượt miễn phí. Bạn không thể tiếp tục sử dụng cho đến ngày mai.",
    {
      status: 429,
      code: "AI_DAILY_QUOTA_EXHAUSTED",
      retryAt: new Date(dailyQuotaBlockedUntil).toISOString(),
    }
  );

export const getCloudflareAiAvailability = (now = Date.now()) => {
  if (dailyQuotaBlockedUntil && now >= dailyQuotaBlockedUntil) dailyQuotaBlockedUntil = 0;
  return {
    available: dailyQuotaBlockedUntil === 0,
    code: dailyQuotaBlockedUntil ? "AI_DAILY_QUOTA_EXHAUSTED" : null,
    retryAt: dailyQuotaBlockedUntil ? new Date(dailyQuotaBlockedUntil).toISOString() : null,
  };
};

export const assertCloudflareAiAvailable = (now = Date.now()) => {
  const availability = getCloudflareAiAvailability(now);
  if (!availability.available) throw dailyQuotaError();
};

// Exported so tests can isolate module-level quota state without restarting Node.
export const clearCloudflareDailyQuotaBlock = () => {
  dailyQuotaBlockedUntil = 0;
};

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const providerConfig = (env) => ({
  accountId: String(env.CLOUDFLARE_ACCOUNT_ID || "").trim(),
  token: String(env.CLOUDFLARE_AI_TOKEN || "").trim(),
  model: String(env.CLOUDFLARE_AI_MODEL || DEFAULT_MODEL).trim(),
  maxTokens: positiveInteger(env.AI_MAX_OUTPUT_TOKENS, 700, 2_000),
  timeoutMs: positiveInteger(env.AI_REQUEST_TIMEOUT_MS, 30_000, 120_000),
});

const assertConfig = ({ accountId, token, model }) => {
  if (!accountId || !token || !model.startsWith("@cf/")) {
    throw new AiProviderError("AI Teacher chưa được cấu hình trên server.", {
      status: 503,
      code: "AI_NOT_CONFIGURED",
    });
  }
};

const cloudflareErrorCodes = (payload) => {
  if (!Array.isArray(payload?.errors)) return new Set();
  return new Set(
    payload.errors
      .map((error) => Number(error?.code))
      .filter((code) => Number.isFinite(code))
  );
};

const mapHttpError = (status, payload) => {
  const errorCodes = cloudflareErrorCodes(payload);
  if (errorCodes.has(3036)) {
    dailyQuotaBlockedUntil = nextUtcMidnight();
    return dailyQuotaError();
  }
  if (status === 429) {
    return new AiProviderError("AI Teacher đang bận. Vui lòng thử lại sau ít phút.", {
      status: 429,
      code: "AI_UPSTREAM_BUSY",
    });
  }
  if (status === 401 || status === 403) {
    return new AiProviderError("Cloudflare AI từ chối thông tin xác thực của server.", {
      status: 503,
      code: "AI_AUTH_FAILED",
    });
  }
  return new AiProviderError("Cloudflare AI hiện không phản hồi bình thường.", {
    status: 502,
    code: "AI_UPSTREAM_ERROR",
  });
};

export const runCloudflareModel = async ({
  messages,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) => {
  const config = providerConfig(env);
  assertConfig(config);
  assertCloudflareAiAvailable();
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AiProviderError("Không có hội thoại để gửi đến AI Teacher.", {
      status: 400,
      code: "AI_EMPTY_MESSAGES",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new AiProviderError("Server không hỗ trợ kết nối đến AI Teacher.", { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/run/${config.model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          max_tokens: config.maxTokens,
          temperature: 0.35,
          top_p: 0.9,
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw mapHttpError(response.status, payload);

    if (!payload?.success || typeof payload?.result?.response !== "string") {
      throw new AiProviderError("Cloudflare AI trả về dữ liệu không hợp lệ.", {
        status: 502,
        code: "AI_INVALID_RESPONSE",
      });
    }

    const usage = payload.result.usage || {};
    return {
      content: payload.result.response.trim(),
      usage: {
        inputTokens: Number(usage.prompt_tokens || usage.input_tokens) || 0,
        outputTokens: Number(usage.completion_tokens || usage.output_tokens) || 0,
      },
      model: config.model,
    };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error?.name === "AbortError") {
      throw new AiProviderError("AI Teacher phản hồi quá lâu. Vui lòng thử lại.", {
        status: 504,
        code: "AI_TIMEOUT",
      });
    }
    throw new AiProviderError("Không thể kết nối đến Cloudflare AI.", {
      status: 502,
      code: "AI_CONNECTION_FAILED",
    });
  } finally {
    clearTimeout(timeout);
  }
};

export { DEFAULT_MODEL };
