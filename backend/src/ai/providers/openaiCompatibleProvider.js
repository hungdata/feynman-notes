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

const explainHttpError = (status, detail) => {
  if (status === 401 || status === 403) return new AiRequestError("API key không hợp lệ hoặc không có quyền (kiểm tra AI_API_KEY trong backend/.env).", { status: 502, code: "AI_AUTH_FAILED" });
  if (status === 404) return new AiRequestError("Không tìm thấy endpoint hoặc model (kiểm tra AI_BASE_URL và AI_MODEL).", { status: 502, code: "AI_NOT_FOUND" });
  if (status === 429) return new AiRequestError("AI đang quá tải hoặc hết hạn mức, thử lại sau ít phút.", { status: 429, code: "AI_RATE_LIMITED", retryable: true });
  if (status >= 500) return new AiRequestError(`Máy chủ AI lỗi (${status}).`, { status: 502, code: "AI_UPSTREAM_ERROR", retryable: true });
  return new AiRequestError(`AI từ chối yêu cầu (${status})${detail ? `: ${detail}` : ""}.`, { status: 502, code: "AI_REJECTED" });
};

/**
 * Sends a chat completion. With `json: true` the model is asked for a JSON
 * object (response_format) and the parsed object is returned as `data`.
 */
export const runOpenAiChat = async ({ messages, json = false, temperature = 0.4, maxTokens, timeoutMs, env = process.env, fetchImpl = fetch } = {}) => {
  const config = getOpenAiConfig(env);
  if (!config.baseUrl || !config.model) {
    throw new AiRequestError("Chưa cấu hình AI: thêm AI_BASE_URL, AI_API_KEY và AI_MODEL vào backend/.env.", { status: 503, code: "AI_NOT_CONFIGURED" });
  }
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
          temperature,
          ...(maxTokens ? { max_tokens: maxTokens } : {}),
          ...(withFormat ? { response_format: { type: "json_object" } } : {}),
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

  let { response, payload } = await send(json);
  // Some proxies/models do not support response_format: retry once without it.
  if (json && response.status === 400) ({ response, payload } = await send(false));
  if (!response.ok) {
    const detail = String(payload?.error?.message || payload?.message || "").slice(0, 200);
    throw explainHttpError(response.status, detail);
  }
  const content = String(payload?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) throw new AiRequestError("AI không trả về nội dung.", { code: "AI_EMPTY_RESPONSE", retryable: true });
  return {
    content,
    data: json ? parseJsonLoose(content) : undefined,
    model: payload?.model || config.model,
    usage: {
      inputTokens: Number(payload?.usage?.prompt_tokens) || 0,
      outputTokens: Number(payload?.usage?.completion_tokens) || 0,
    },
  };
};
