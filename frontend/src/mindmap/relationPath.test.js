import test from "node:test";
import assert from "node:assert/strict";
import { angledRelationPath, roundedOrthogonalPath, straightRelationPath } from "./relationPath.js";

test("straight relation is always exactly one line segment", () => {
  const path = straightRelationPath(10, 20, 300, 90);
  assert.equal(path, "M 10 20 L 300 90");
  assert.doesNotMatch(path, /[CQ]/);
  assert.equal((path.match(/\bL\b/g) || []).length, 1);
});

test("angled relation uses line segments only", () => {
  const path = angledRelationPath(0, 0, 200, 100);
  assert.match(path, /^M /);
  assert.doesNotMatch(path, /[CQ]/);
});

test("rounded relation contains quadratic corner commands", () => {
  assert.match(roundedOrthogonalPath(0, 0, 200, 100), /Q/);
});

test("tapered branch is a closed filled shape that starts thick and ends thin", async () => {
  const { taperedCurvePath, elbowPath } = await import("./relationPath.js");
  const path = taperedCurvePath(0, 0, 200, 80, 8, 2);
  assert.match(path, /^M /);
  assert.match(path, / Z$/);
  const numbers = path.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
  assert.ok(numbers.every(Number.isFinite));
  // First and last outline points sit 8px apart at the parent end.
  const [x1, y1] = numbers.slice(0, 2);
  const [x2, y2] = numbers.slice(-2);
  assert.ok(Math.abs(Math.hypot(x1 - x2, y1 - y2) - 8) < 0.01);
  assert.equal(elbowPath(10, 10, 60, 90, 0), "M 10 10 L 10 90 L 60 90");
});
