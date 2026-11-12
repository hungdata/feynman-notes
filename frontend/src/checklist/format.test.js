import test from "node:test";
import assert from "node:assert/strict";
import { inDateRange, whenLabel } from "./format.js";

test("task dates read naturally and filter by creation day", () => {
  const now = new Date(2026, 10, 11, 22, 0);
  assert.match(whenLabel(new Date(2026, 10, 11, 8, 5).toISOString(), now), /^Hôm nay, /);
  assert.match(whenLabel(new Date(2026, 10, 10, 8, 5).toISOString(), now), /^Hôm qua, /);
  assert.equal(whenLabel("not a date", now), "");
  const task = { createdAt: new Date(2026, 10, 9, 12).toISOString() };
  assert.equal(inDateRange(task, { from: "", to: "" }), true);
  assert.equal(inDateRange(task, { from: "2026-11-09", to: "2026-11-09" }), true);
  assert.equal(inDateRange(task, { from: "2026-11-10", to: "" }), false);
  assert.equal(inDateRange({ createdAt: "x" }, { from: "2026-11-10", to: "" }), false);
});
