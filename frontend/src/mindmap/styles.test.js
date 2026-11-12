import test from "node:test";
import assert from "node:assert/strict";
import { computeNumbering, getStyleSheet, mixColors, readableTextOn, resolveNodeStyles, STYLE_SHEETS } from "./styles.js";

const node = (id, parentId = null, data = {}) => ({ id, type: "topic", position: { x: 0, y: 0 }, data: { label: id, parentId, ...data } });
const tree = [node("root"), node("a", "root"), node("b", "root"), node("a1", "a"), node("a2", "a"), node("b1", "b")];

test("there are 15+ style sheets with unique ids, light and dark", () => {
  assert.ok(STYLE_SHEETS.length >= 15);
  assert.equal(new Set(STYLE_SHEETS.map((sheet) => sheet.id)).size, STYLE_SHEETS.length);
  assert.ok(STYLE_SHEETS.some((sheet) => sheet.dark));
  assert.equal(getStyleSheet("missing").id, "default");
});

test("branch colours follow the first-level topic and descendants inherit them", () => {
  const { styles } = resolveNodeStyles(tree, { styleSheet: "default" });
  const sheet = getStyleSheet("default");
  assert.equal(styles.get("a").branchColor, sheet.palette[0]);
  assert.equal(styles.get("b").branchColor, sheet.palette[1]);
  assert.equal(styles.get("a2").branchColor, styles.get("a").branchColor);
  assert.equal(styles.get("root").depth, 0);
  assert.equal(styles.get("a1").shape, "underline");
  assert.ok(styles.get("a").line.startWidth > styles.get("a").line.endWidth, "first-level branches taper");
});

test("per-topic overrides win over the style sheet and flow down the branch", () => {
  const custom = tree.map((item) => (item.id === "b" ? { ...item, data: { ...item.data, branchColor: "#ff0000", color: "#00ff00", shape: "pill", fontSize: 22 } } : item));
  const { styles } = resolveNodeStyles(custom, { styleSheet: "rainbow" });
  assert.equal(styles.get("b").fill, "#00ff00");
  assert.equal(styles.get("b").shape, "pill");
  assert.equal(styles.get("b").fontSize, 22);
  assert.equal(styles.get("b1").branchColor, "#ff0000");
});

test("level-based sheets colour by depth and readable text is chosen automatically", () => {
  const { styles } = resolveNodeStyles(tree, { styleSheet: "professional" });
  assert.equal(styles.get("a").branchColor, styles.get("b").branchColor);
  assert.equal(readableTextOn("#111111"), "#ffffff");
  assert.equal(readableTextOn("#fafafa"), "#1f2937");
  assert.equal(mixColors("#000000", "#ffffff", 0.5), "#808080");
});

test("auto numbering supports first level, decimal outline and letters", () => {
  assert.equal(computeNumbering(tree, "none").size, 0);
  assert.deepEqual([...computeNumbering(tree, "level1")], [["a", "1."], ["b", "2."]]);
  const decimal = computeNumbering(tree, "decimal");
  assert.equal(decimal.get("a2"), "1.2.");
  assert.equal(decimal.get("b1"), "2.1.");
  assert.equal(computeNumbering(tree, "alpha").get("b"), "B.");
});
