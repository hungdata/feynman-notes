import test from "node:test";
import assert from "node:assert/strict";
import { assertPanelLayout, panelIsInside, panelLayoutManager, panelsOverlap, validatePanelLayout } from "./panelLayout.js";

const viewport = { x: 0, y: 0, width: 960, height: 700 };
const size = { width: 280, height: 360 };

test("one property panel keeps its preferred canvas position", () => {
  const result = panelLayoutManager([{ id: "topic", width: 280, height: 360, preferredX: 320, preferredY: 140 }], viewport, size, 20);
  assert.deepEqual(result.panels.map(({ id, x, y, placement }) => ({ id, x, y, placement })), [
    { id: "topic", x: 320, y: 140, placement: "preferred" },
  ]);
  assert.equal(result.validation.valid, true);
  assert.equal(result.requiresScroll, false);
});

test("two panels sharing an anchor are separated by the requested gap", () => {
  const gap = 24;
  const result = panelLayoutManager([
    { id: "topic", width: 280, height: 300, preferredX: 40, preferredY: 40 },
    { id: "image", width: 280, height: 300, preferredX: 40, preferredY: 40 },
  ], viewport, size, gap);
  const [topic, image] = result.panels;
  assert.equal(result.validation.valid, true);
  assert.equal(panelsOverlap(topic, image, gap), false);
  assert.ok(image.x >= topic.x + topic.width + gap || image.y >= topic.y + topic.height + gap);
});

test("a full Image inspector never covers a full Topic inspector", () => {
  const result = panelLayoutManager([
    { id: "topic", width: 286, height: 650, preferredX: 520, preferredY: 60 },
    { id: "image", width: 286, height: 620, preferredX: 520, preferredY: 60 },
  ], { x: 0, y: 0, width: 1080, height: 760 }, size, 16);
  const [topic, image] = result.panels;
  assert.equal(result.validation.valid, true);
  assert.equal(panelsOverlap(topic, image, 16), false);
  assert.equal(panelIsInside(topic, result.contentViewport), true);
  assert.equal(panelIsInside(image, result.contentViewport), true);
});

test("when there is no room on the right, the manager tries a different side then grid slots", () => {
  const result = panelLayoutManager([
    { id: "first", width: 280, height: 220, preferredX: 320, preferredY: 30 },
    { id: "second", width: 280, height: 220, preferredX: 320, preferredY: 30 },
  ], { x: 0, y: 0, width: 620, height: 520 }, size, 20);
  const [first, second] = result.panels;
  assert.equal(result.validation.valid, true);
  assert.equal(second.placement === "right", false);
  assert.equal(panelsOverlap(first, second, 20), false);
  result.panels.forEach((panel) => assert.equal(panelIsInside(panel, result.contentViewport), true));
});

test("existing panels remain stable while a new panel finds a free position", () => {
  const first = panelLayoutManager([
    { id: "topic", width: 280, height: 280, preferredX: 120, preferredY: 100 },
  ], viewport, size, 16).panels[0];
  const result = panelLayoutManager([
    first,
    { id: "image", width: 280, height: 320, preferredX: 120, preferredY: 100 },
  ], viewport, size, 16);
  assert.deepEqual(
    result.panels[0] && { x: result.panels[0].x, y: result.panels[0].y },
    { x: first.x, y: first.y },
  );
  assert.equal(result.validation.valid, true);
});

test("panels that exceed the visible height get collision-free virtual rows for a scroll host", () => {
  const smallViewport = { x: 0, y: 0, width: 640, height: 420 };
  const result = panelLayoutManager([
    { id: "a", width: 280, height: 300, preferredX: 20, preferredY: 20 },
    { id: "b", width: 280, height: 300, preferredX: 20, preferredY: 20 },
    { id: "c", width: 280, height: 300, preferredX: 20, preferredY: 20 },
    { id: "d", width: 280, height: 300, preferredX: 20, preferredY: 20 },
  ], smallViewport, size, 16);
  assert.equal(result.requiresScroll, true);
  assert.ok(result.contentHeight > smallViewport.height);
  assert.equal(result.validation.valid, true);
});

test("a narrow responsive viewport constrains a panel instead of placing it outside bounds", () => {
  const narrowViewport = { x: 10, y: 20, width: 240, height: 320 };
  const result = panelLayoutManager([
    { id: "wide", width: 420, height: 500, preferredX: 100, preferredY: 100 },
  ], narrowViewport, size, 16);
  const [panel] = result.panels;
  assert.equal(panel.constrained, true);
  assert.equal(panel.width, narrowViewport.width);
  assert.equal(panel.height, narrowViewport.height);
  assert.equal(panelIsInside(panel, result.contentViewport), true);
  assert.deepEqual(validatePanelLayout(result.panels, result.contentViewport, 16), result.validation);
});

test("a viewport resize recomputes valid positions without overlapping panels", () => {
  const panels = [
    { id: "topic", width: 260, height: 320, preferredX: 560, preferredY: 40 },
    { id: "image", width: 260, height: 360, preferredX: 560, preferredY: 40 },
    { id: "relation", width: 260, height: 240, preferredX: 560, preferredY: 40 },
  ];
  const result = panelLayoutManager(panels, { x: 0, y: 0, width: 540, height: 620 }, size, 18);
  assert.equal(result.validation.valid, true);
  result.panels.forEach((panel) => assert.equal(panelIsInside(panel, result.contentViewport), true));
});

test("ten mixed property panels remain collision-free, including a tall image editor", () => {
  const result = panelLayoutManager(
    Array.from({ length: 10 }, (_, index) => ({
      id: `panel-${index}`,
      width: index % 3 === 0 ? 286 : 260,
      height: index % 3 === 0 ? 620 : index % 2 === 0 ? 470 : 650,
      preferredX: 480,
      preferredY: 80,
    })),
    { x: 0, y: 0, width: 1280, height: 760 },
    size,
    16,
  );
  assert.equal(result.validation.valid, true);
  assert.equal(result.panels.length, 10);
  result.panels.forEach((panel) => assert.equal(panelIsInside(panel, result.contentViewport), true));
  result.panels.forEach((panel, index) => result.panels.slice(index + 1).forEach((other) => {
    assert.equal(panelsOverlap(panel, other, 16), false);
  }));
});

test("development assertions explain both collision and viewport failures", () => {
  assert.throws(
    () => assertPanelLayout([
      { id: "a", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", x: 50, y: 0, width: 100, height: 100 },
    ], { x: 0, y: 0, width: 200, height: 120 }, 16),
    /Invalid property-panel layout:.*overlaps=a\/b/,
  );
});
