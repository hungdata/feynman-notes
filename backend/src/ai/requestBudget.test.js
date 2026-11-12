import assert from "node:assert/strict";
import test from "node:test";
import { AiBudgetError, createAiRequestBudget } from "./requestBudget.js";

test("test budget is shared across users and stops before another upstream request", () => {
  const budget = createAiRequestBudget({ now: () => Date.parse("2026-11-12T12:00:00Z") });
  const env = { AI_DAILY_REQUEST_LIMIT: "2" };
  budget.reserve(env);
  budget.reserve(env);
  assert.equal(budget.status(env).remaining, 0);
  assert.throws(() => budget.reserve(env), (error) => {
    assert.ok(error instanceof AiBudgetError);
    assert.equal(error.status, 429);
    assert.equal(error.retryAt, "2026-11-13T00:00:00.000Z");
    return true;
  });
});

test("test budget replenishes at UTC midnight, without a restart", () => {
  let clock = Date.parse("2026-11-12T23:59:59Z");
  const budget = createAiRequestBudget({ now: () => clock });
  const env = { AI_DAILY_REQUEST_LIMIT: "1" };
  budget.reserve(env);
  assert.equal(budget.status(env).available, false);
  clock += 1_000;
  assert.equal(budget.status(env).remaining, 1);
  budget.reserve(env);
  assert.equal(budget.status(env).available, false);
});

test("unset or zero test budget preserves existing provider usage", () => {
  const budget = createAiRequestBudget();
  for (let index = 0; index < 100; index++) budget.reserve({});
  assert.equal(budget.status({}).limit, null);
  assert.equal(budget.status({ AI_DAILY_REQUEST_LIMIT: "0" }).available, true);
});
