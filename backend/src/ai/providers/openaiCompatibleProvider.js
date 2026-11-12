import { reserveAiRequest } from "../requestBudget.js";

/**
 * Any OpenAI-compatible chat API: a local proxy (http://127.0.0.1:8045/v1),
 * OpenAI, OpenRouter, Gemini's OpenAI endpoint, LM Studio, Ollama…
 *
 *   AI_BASE_URL=http://127.0.0.1:8045/v1
 *   AI_API_KEY=sk-...
 *   AI_MODEL=gemini-3.8-flash-high
 */
export class AiRequestError extends Error {
  constructor(message, { status = 502, code = "AI_REQUEST_FAILED", retryable = false } = {}) {
    super(message);
    this.name = "AiRequestError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
};

export const getOpenAiConfig = (env = process.env) => ({
  baseUrl: String(env.AI_BASE_URL || "").trim().replace(/\/+$/, ""),
  apiKey: String(env.AI_API_KEY || "").trim(),
  model: String(env.AI_MODEL || "").trim(),
  timeoutMs: positiveInteger(env.AI_REQUEST_TIMEOUT_MS, 120_000, 600_000),
});

export const isOpenAiConfigured = (env = process.env) => {
  const config = getOpenAiConfig(env);
  return Boolean(config.baseUrl && config.model);
};

/** Removes ```json fences and surrounding prose, then parses the JSON object. */
export const parseJsonLoose = (text) => {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(raw); } catch { /* try the outermost object below */ }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new AiRequestError("AI trả về dữ liệu không phải JSON hợp lệ.", { code: "AI_BAD_JSON", retryable: true });
};

const explainHttpError = (status, payload) => {
  const providerCode = payload?.error?.code || payload?.error?.type;
  if (status === 401 || status === 403) return new AiRequestError("API key của máy chủ không hợp lệ hoặc chưa có quyền dùng model này.", { status: 502, code: "AI_AUTH_FAILED" });
  if (status === 404) return new AiRequestError("Không tìm thấy endpoint hoặc model (kiểm tra AI_BASE_URL và AI_MODEL).", { status: 502, code: "AI_NOT_FOUND" });
  if (status === 429 && ["insufficient_quota", "billing_hard_limit_reached"].includes(providerCode)) {
    return new AiRequestError("Tài khoản OpenAI đã hết hạn mức hoặc chưa có tín dụng API. Chủ ứng dụng cần kiểm tra hạn mức trước khi thử lại.", { status: 429, code: "AI_QUOTA_EXHAUSTED" });
  }
  if (status === 429) return new AiRequestError("AI đang nhận quá nhiều yêu cầu, thử lại sau ít phút.", { status: 429, code: "AI_RATE_LIMITED", retryable: true });
  if (status >= 500) return new AiRequestError(`Máy chủ AI lỗi (${status}).`, { status: 502, code: "AI_UPSTREAM_ERROR", retryable: true });
  // Provider error text can contain request data or secrets; never forward it.
  return new AiRequestError(`AI từ chối yêu cầu (${status}).`, { status: 502, code: "AI_REJECTED" });
};

// The original GPT-5 reasoning models reject temperature and max_tokens.
// Keep compatible proxies and non-reasoning models on their existing contract.
const isOriginalGpt5 = (model) => /^gpt-5(?:-(?:mini|nano))?(?:-\d{4}-\d{2}-\d{2})?$/.test(model);

/**
 * Sends a chat completion. With `json: true` the model is asked for a JSON
 * object (response_format) and the parsed object is returned as `data`.
 */
export const runOpenAiChat = async ({ messages, json = false, jsonSchema, temperature = 0.4, maxTokens, timeoutMs, env = process.env, fetchImpl = fetch } = {}) => {
  const config = getOpenAiConfig(env);
  if (!config.baseUrl || !config.model) {
    throw new AiRequestError("Chưa cấu hình AI: thêm AI_BASE_URL, AI_API_KEY và AI_MODEL vào backend/.env.", { status: 503, code: "AI_NOT_CONFIGURED" });
  }
  reserveAiRequest(env);
  const requestedTokens = positiveInteger(maxTokens, 1_200, 4_096);
  const send = async (withFormat) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          ...(isOriginalGpt5(config.model)
            ? {
                reasoning_effort: "minimal",
                max_completion_tokens: requestedTokens,
              }
            : { temperature, ...(maxTokens ? { max_tokens: maxTokens } : {}) }),
          ...(withFormat ? { response_format: jsonSchema ? { type: "json_schema", json_schema: jsonSchema } : { type: "json_object" } } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      return { response, payload };
    } catch (error) {
      if (error.name === "AbortError") throw new AiRequestError("AI phản hồi quá lâu (hết thời gian chờ).", { status: 504, code: "AI_TIMEOUT", retryable: true });
      throw new AiRequestError(`Không kết nối được AI tại ${config.baseUrl} (proxy đã chạy chưa?).`, { status: 502, code: "AI_UNREACHABLE", retryable: true });
    } finally {
      clearTimeout(timer);
    }
  };

  let { response, payload } = await send(json || Boolean(jsonSchema));
  // Retry only a rejected JSON-format option, not unrelated 400 errors.
  const formatRejected = payload?.error?.param === "response_format"
    || /response[_ ]format|json[_ ]object|json mode/i.test(String(payload?.error?.message || ""));
  if (json && !jsonSchema && response.status === 400 && formatRejected) ({ response, payload } = await send(false));
  if (!response.ok) {
    throw explainHttpError(response.status, payload);
  }
  if (payload?.choices?.[0]?.finish_reason === "length") {
    // Do not save a cut-off explanation or silently spend on another request.
    throw new AiRequestError("Nhận xét chưa hoàn thành. Hãy rút gọn lời giải thích rồi thử lại.", { code: "AI_OUTPUT_TRUNCATED" });
  }
  const content = String(payload?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new AiRequestError("AI không trả về nội dung.", { code: "AI_EMPTY_RESPONSE", retryable: true });
  return {
    content,
    data: json || jsonSchema ? parseJsonLoose(content) : undefined,
    model: payload?.model || config.model,
    usage: {
      inputTokens: Number(payload?.usage?.prompt_tokens) || 0,
      outputTokens: Number(payload?.usage?.completion_tokens) || 0,
    },
  };
};
