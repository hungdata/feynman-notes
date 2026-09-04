const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const DEFAULT_RESULT_COUNT = 3;
const MAX_RESULT_COUNT = 5;
const searchCache = new Map();

export class WebSearchProviderError extends Error {
  constructor(message, { status = 502, code = "WEB_SEARCH_ERROR" } = {}) {
    super(message);
    this.name = "WebSearchProviderError";
    this.status = status;
    this.code = code;
  }
}

const positiveInteger = (value, fallback, maximum) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const configFrom = (env) => ({
  token: String(env.BRAVE_SEARCH_API_KEY || "").trim(),
  resultCount: positiveInteger(env.BRAVE_SEARCH_RESULT_COUNT, DEFAULT_RESULT_COUNT, MAX_RESULT_COUNT),
  timeoutMs: positiveInteger(env.BRAVE_SEARCH_TIMEOUT_MS, 8_000, 30_000),
  cacheTtlMs: positiveInteger(env.BRAVE_SEARCH_CACHE_TTL_MS, 21_600_000, 86_400_000),
});

export const getBraveSearchAvailability = (env = process.env) => ({
  available: Boolean(configFrom(env).token),
  provider: "brave",
});

export const clearBraveSearchCache = () => searchCache.clear();

const cleanText = (value, maximum = 1_200) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);

const safeHttpUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
};

const normalizeResult = (result) => {
  const url = safeHttpUrl(result?.url);
  const title = cleanText(result?.title, 300);
  if (!url || !title) return null;

  const snippets = [result?.description, ...(Array.isArray(result?.extra_snippets) ? result.extra_snippets : [])]
    .map((snippet) => cleanText(snippet))
    .filter(Boolean);

  return {
    title,
    url,
    snippet: snippets.join(" ").slice(0, 2_000),
  };
};

const mapHttpError = (status) => {
  if (status === 401 || status === 403) {
    return new WebSearchProviderError("Brave Search API key không hợp lệ hoặc chưa được cấp quyền.", {
      status: 503,
      code: "WEB_SEARCH_AUTH_FAILED",
    });
  }
  if (status === 429) {
    return new WebSearchProviderError("Đã hết hạn mức tìm kiếm web hoặc Brave Search đang giới hạn yêu cầu.", {
      status: 429,
      code: "WEB_SEARCH_QUOTA_EXHAUSTED",
    });
  }
  return new WebSearchProviderError("Dịch vụ tìm kiếm web hiện không phản hồi bình thường.", {
    status: 502,
    code: "WEB_SEARCH_UPSTREAM_ERROR",
  });
};

export const searchBraveWeb = async ({
  query,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) => {
  const config = configFrom(env);
  const normalizedQuery = cleanText(query, 400);
  if (!config.token) {
    throw new WebSearchProviderError("Tìm kiếm web chưa được cấu hình trên server.", {
      status: 503,
      code: "WEB_SEARCH_NOT_CONFIGURED",
    });
  }
  if (!normalizedQuery) {
    throw new WebSearchProviderError("Không có nội dung phù hợp để tìm kiếm trên web.", {
      status: 400,
      code: "WEB_SEARCH_EMPTY_QUERY",
    });
  }
  if (typeof fetchImpl !== "function") {
    throw new WebSearchProviderError("Server không hỗ trợ kết nối đến dịch vụ tìm kiếm web.", {
      status: 503,
      code: "WEB_SEARCH_UNAVAILABLE",
    });
  }

  const cacheKey = `${config.resultCount}:${normalizedQuery.toLocaleLowerCase("vi")}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) searchCache.delete(cacheKey);

  const endpoint = new URL(BRAVE_SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", normalizedQuery);
  endpoint.searchParams.set("count", String(config.resultCount));
  endpoint.searchParams.set("safesearch", "moderate");
  endpoint.searchParams.set("text_decorations", "false");
  endpoint.searchParams.set("extra_snippets", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": config.token,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw mapHttpError(response.status);

    const sources = (Array.isArray(payload?.web?.results) ? payload.web.results : [])
      .map(normalizeResult)
      .filter(Boolean)
      .slice(0, config.resultCount);

    const value = { query: normalizedQuery, sources };
    searchCache.set(cacheKey, { value, expiresAt: now + config.cacheTtlMs });
    if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
    return value;
  } catch (error) {
    if (error instanceof WebSearchProviderError) throw error;
    if (error?.name === "AbortError") {
      throw new WebSearchProviderError("Tìm kiếm web phản hồi quá lâu. Vui lòng thử lại.", {
        status: 504,
        code: "WEB_SEARCH_TIMEOUT",
      });
    }
    throw new WebSearchProviderError("Không thể kết nối đến Brave Search.", {
      status: 502,
      code: "WEB_SEARCH_CONNECTION_FAILED",
    });
  } finally {
    clearTimeout(timeout);
  }
};

export { BRAVE_SEARCH_ENDPOINT };
