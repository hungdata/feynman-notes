import test from "node:test";
import assert from "node:assert/strict";
import { checkStep, isFillCorrect, nextLessonAfter, normalizeAnswer, roadmapOrder, shuffledOrder } from "./answer.js";

test("fill answers ignore case, accents, punctuation and one typo", () => {
  const step = { answer: "Sao chép", accept: ["replication"] };
  assert.equal(normalizeAnswer("  Đồng bộ! "), "dong bo");
  assert.equal(isFillCorrect(step, "sao chep"), true);
  assert.equal(isFillCorrect(step, "Replication."), true);
  assert.equal(isFillCorrect(step, "replicaton"), true);
  assert.equal(isFillCorrect(step, "phân vùng"), false);
  assert.equal(isFillCorrect(step, ""), false);
  assert.equal(checkStep({ type: "mcq", answer: 2 }, 2), true);
  assert.equal(checkStep({ type: "truefalse", answer: false }, true), false);
});

test("roadmap unlocks lessons in order and skips chapters that are not ready", () => {
  const course = { stages: [
    { status: "ready", lessons: [{ id: "a" }, { id: "b" }] },
    { status: "error", lessons: [] },
    { status: "ready", lessons: [{ id: "c" }] },
  ] };
  const progress = { lessons: { a: { completedAt: "x" } } };
  assert.deepEqual(roadmapOrder(course, progress).map((item) => [item.lesson.id, item.state]), [["a", "done"], ["b", "current"], ["c", "locked"]]);
  assert.equal(roadmapOrder(course, progress, { free: true })[2].state, "open");
  assert.equal(nextLessonAfter(course, progress, "a").lesson.id, "b");
  assert.equal(nextLessonAfter(course, { lessons: { a: { completedAt: 1 }, b: { completedAt: 1 }, c: { completedAt: 1 } } }, "c"), null);
});

test("answer options are shuffled into a full permutation", () => {
  const values = [0.9, 0.1, 0.5];
  let call = 0;
  const order = shuffledOrder(4, () => values[call++ % values.length]);
  assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
  assert.notDeepEqual(order, [0, 1, 2, 3]);
  assert.deepEqual(shuffledOrder(0), []);
});
