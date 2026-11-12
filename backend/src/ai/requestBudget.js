// Optional test budget, shared by all OpenAI calls in this server process.
// It resets at UTC midnight or when the process restarts; it is not a billing cap.
export class AiBudgetError extends Error {
  constructor(retryAt) {
    super("Bản thử AI đã dùng hết lượt hôm nay. Bạn có thể thử lại vào ngày mai.");
    this.name = "AiBudgetError";
    this.status = 429;
    this.code = "AI_TEST_DAILY_LIMIT";
    this.retryAt = retryAt;
  }
}

export const createAiRequestBudget = ({ now = Date.now } = {}) => {
  let day = "";
  let used = 0;

  const status = (env = process.env) => {
    const date = new Date(now());
    const currentDay = date.toISOString().slice(0, 10);
    if (currentDay !== day) {
      day = currentDay;
      used = 0;
    }
    const parsed = Number.parseInt(env.AI_DAILY_REQUEST_LIMIT, 10);
    const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    const available = limit === null || used < limit;
    return {
      available,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      code: available ? null : "AI_TEST_DAILY_LIMIT",
      retryAt: available ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString(),
    };
  };

  return {
    status,
    reserve(env = process.env) {
      const current = status(env);
      if (!current.available) throw new AiBudgetError(current.retryAt);
      // Reservation happens synchronously before network I/O, so concurrent users
      // cannot exceed the limit within this process. Failed requests also count.
      if (current.limit !== null) used += 1;
    },
  };
};

const budget = createAiRequestBudget();
export const getAiRequestBudget = budget.status;
export const reserveAiRequest = budget.reserve;
