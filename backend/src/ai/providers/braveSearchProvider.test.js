import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBraveSearchCache,
  getBraveSearchAvailability,
  searchBraveWeb,
  WebSearchProviderError,
} from "./braveSearchProvider.js";

const env = {
  BRAVE_SEARCH_API_KEY: "brave-key-for-tests",
  BRAVE_SEARCH_RESULT_COUNT: "3",
};

test.afterEach(clearBraveSearchCache);

test("Brave provider sends a safe query and normalizes web sources", async () => {
  let captured;
  const result = await searchBraveWeb({
    env,
    query: "  vì sao bầu trời màu xanh?  ",
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          web: {
            results: [
              {
                title: " Rayleigh scattering ",
                url: "https://example.edu/rayleigh",
                description: " Ánh sáng xanh bị tán xạ. ",
                extra_snippets: ["Bước sóng ngắn tán xạ mạnh hơn."],
              },
              { title: "Unsafe", url: "javascript:alert(1)", description: "bad" },
            ],
          },
        }),
      };
    },
  });

  const requestUrl = new URL(captured.url);
  assert.equal(requestUrl.searchParams.get("q"), "vì sao bầu trời màu xanh?");
  assert.equal(requestUrl.searchParams.get("count"), "3");
  assert.equal(captured.options.headers["X-Subscription-Token"], env.BRAVE_SEARCH_API_KEY);
  assert.deepEqual(result.sources, [{
    title: "Rayleigh scattering",
    url: "https://example.edu/rayleigh",
    snippet: "Ánh sáng xanh bị tán xạ. Bước sóng ngắn tán xạ mạnh hơn.",
  }]);
});

test("Brave provider exposes configuration status without leaking the key", () => {
  assert.deepEqual(getBraveSearchAvailability(env), { available: true, provider: "brave" });
  assert.deepEqual(getBraveSearchAvailability({}), { available: false, provider: "brave" });
});

test("Brave quota errors are explicit and never expose provider payloads", async () => {
  await assert.rejects(
    searchBraveWeb({
      env,
      query: "một truy vấn",
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        json: async () => ({ message: "secret provider detail" }),
      }),
    }),
    (error) => {
      assert.ok(error instanceof WebSearchProviderError);
      assert.equal(error.status, 429);
      assert.equal(error.code, "WEB_SEARCH_QUOTA_EXHAUSTED");
      assert.doesNotMatch(error.message, /secret provider detail|brave-key-for-tests/);
      return true;
    }
  );
});

test("Brave provider fails safely when the key is missing", async () => {
  await assert.rejects(
    searchBraveWeb({ query: "test", env: {}, fetchImpl: async () => assert.fail("must not fetch") }),
    (error) => error.code === "WEB_SEARCH_NOT_CONFIGURED"
  );
});

test("Brave provider caches repeated queries to preserve the free quota", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ web: { results: [{ title: "Nguồn", url: "https://example.edu", description: "Nội dung" }] } }),
    };
  };

  await searchBraveWeb({ env, query: "cùng một truy vấn", fetchImpl, now: 1_000 });
  await searchBraveWeb({ env, query: "cùng một truy vấn", fetchImpl, now: 2_000 });
  assert.equal(calls, 1);
});
