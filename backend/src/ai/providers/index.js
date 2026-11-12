import { runCloudflareModel } from "./cloudflareProvider.js";
import { AiRequestError, getOpenAiConfig, isOpenAiConfigured, runOpenAiChat } from "./openaiCompatibleProvider.js";

/**
 * Which AI backs the app:
 * - AI_PROVIDER=cloudflare                       → Cloudflare Workers AI
 * - AI_PROVIDER=openai, or AI_BASE_URL + AI_MODEL → any OpenAI-compatible API (e.g. a local proxy)
 */
export const activeProvider = (env = process.env) => {
  const setting = String(env.AI_PROVIDER || "").trim().toLowerCase();
  if (setting === "openai" || setting === "openai-compatible") return "openai";
  if (setting === "cloudflare") return env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN ? "cloudflare" : isOpenAiConfigured(env) ? "openai" : "none";
  if (isOpenAiConfigured(env)) return "openai";
  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) return "cloudflare";
  return "none";
};

export const isAiConfigured = (env = process.env) => activeProvider(env) !== "none";

export const describeAi = (env = process.env) => {
  const provider = activeProvider(env);
  if (provider === "openai") {
    const { baseUrl, model } = getOpenAiConfig(env);
    return { provider, configured: true, model, endpoint: baseUrl };
  }
  if (provider === "cloudflare") return { provider, configured: true, model: env.CLOUDFLARE_AI_MODEL || "cloudflare" };
  return { provider, configured: false, model: "" };
};

/** Chat for the AI Teacher: same result shape for every provider. */
export const runTeacherModel = async ({ messages }) => {
  if (activeProvider() === "openai") {
    const configuredLimit = Number.parseInt(process.env.AI_MAX_OUTPUT_TOKENS, 10);
    const maxTokens = Number.isFinite(configuredLimit) && configuredLimit > 0
      ? Math.min(configuredLimit, 4_096)
      : 1_200;
    const result = await runOpenAiChat({ messages, maxTokens, timeoutMs: Number(process.env.AI_TEACHER_TIMEOUT_MS) || 90_000 });
    return { content: result.content, model: result.model, usage: result.usage };
  }
  return runCloudflareModel({ messages });
};

export { AiRequestError, runOpenAiChat };
