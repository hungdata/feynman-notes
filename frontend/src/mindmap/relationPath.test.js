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
