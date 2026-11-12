import test from "node:test";
import assert from "node:assert/strict";
import {
  autoLayout, buildEdges, canReparent, computeBranchModes, dropSlotForPosition, estimateTopicSize,
  findDropParent, getDescendantIds, getNodeSize, getVisibleNodes,
} from "./layout.js";

const node = (id, parentId = null, extra = {}) => ({
  id, type: "topic", position: { x: 0, y: 0 },
  data: { label: `Topic ${id}`, parentId, relationStyle: "inherit", layout: "inherit", ...extra },
});
const sized = (item, width, height) => ({ ...item, measured: { width, height } });
const nodes = [node("root"), node("a", "root"), node("b", "root"), node("c", "a")];
const settings = { relationStyle: "curved", relationColor: "#64748b", relationWidth: 2, relationOpacity: 1, relationDash: "solid" };
const ALL_LAYOUTS = ["horizontal", "right", "vertical", "topDown", "list", "linear", "radial", "matrix"];

const boxOf = (item) => {
  const { width, height } = getNodeSize(item);
  return { id: item.id, x: item.position.x, y: item.position.y, width, height };
};
const assertNoOverlap = (items, message = "") => {
  const boxes = items.map(boxOf);
  boxes.forEach((first, index) => boxes.slice(index + 1).forEach((second) => {
    const overlaps = first.x < second.x + second.width && first.x + first.width > second.x
      && first.y < second.y + second.height && first.y + first.height > second.y;
    assert.equal(overlaps, false, `${message} ${first.id} overlaps ${second.id}`);
  }));
};
const bigTree = () => {
  const items = [sized(node("root"), 180, 52)];
  ["a", "b", "c", "d", "e"].forEach((branch, index) => {
    items.push(sized(node(branch, "root"), 120 + index * 10, 34));
    for (let child = 0; child < index + 1; child += 1) items.push(sized(node(`${branch}${child}`, branch), 100, 28 + child * 6));
  });
  return items;
};

test("descendants are complete and cycle-safe reparenting is enforced", () => {
  assert.deepEqual([...getDescendantIds(nodes, "a")], ["c"]);
  assert.equal(canReparent(nodes, "a", "c"), false);
  assert.equal(canReparent(nodes, "c", "b"), true);
});

test("pointer drop finds a topic or image parent and keeps cycle protection", () => {
  const target = sized({ ...node("target"), position: { x: 400, y: 200 } }, 240, 60);
  const image = { id: "image", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 160 }, data: { parentId: "root" } };
  const graph = [sized(node("root"), 180, 50), node("moving", "root"), target, image];
  assert.equal(findDropParent(graph, "moving", { x: 520, y: 230 })?.id, "target");
  assert.equal(findDropParent(graph, "image", { x: 520, y: 230 })?.id, "target");
  assert.equal(findDropParent(graph, "root", { x: 2000, y: 2000 }), null);
  const imageParent = { id: "image-parent", type: "image", position: { x: 400, y: 200 }, style: { width: 260, height: 320 }, data: { parentId: "root" } };
  const child = sized({ ...node("child", "image-parent"), position: { x: 800, y: 200 } }, 200, 40);
  const withImage = [sized(node("root"), 180, 50), imageParent, child, node("moving", "root")];
  assert.equal(findDropParent(withImage, "moving", { x: 520, y: 360 })?.id, "image-parent");
  assert.equal(findDropParent(withImage, "image-parent", { x: 900, y: 220 }), null);
});

test("unmeasured topics are sized from their text instead of a fixed card", () => {
  const short = estimateTopicSize(node("short", "root", { label: "Hi" }));
  const long = estimateTopicSize(node("long", "root", { label: "Một ý tưởng rất dài cần xuống dòng để không chiếm quá nhiều chỗ" }));
  assert.ok(short.width < 120);
  assert.ok(long.width <= 260);
  assert.ok(long.height > short.height);
});

test("every automatic layout returns finite positions for every node", () => {
  ALL_LAYOUTS.concat("freeForm").forEach((layout) => {
    const output = autoLayout(bigTree(), layout);
    assert.equal(output.length, bigTree().length);
    output.forEach((item) => {
      assert.equal(Number.isFinite(item.position.x), true, layout);
      assert.equal(Number.isFinite(item.position.y), true, layout);
    });
  });
});

test("tree layouts never overlap topics", () => {
  ["horizontal", "right", "vertical", "topDown", "list", "linear", "matrix"].forEach((layout) => {
    assertNoOverlap(autoLayout(bigTree(), layout), layout);
  });
});

test("horizontal layout grows on both sides and keeps the central topic in place", () => {
  const tree = bigTree().map((item) => (item.id === "root" ? { ...item, position: { x: 500, y: 300 } } : item));
  const output = autoLayout(tree, "horizontal");
  const root = output.find((item) => item.id === "root");
  assert.deepEqual(root.position, { x: 500, y: 300 });
  const level1 = output.filter((item) => item.data.parentId === "root");
  assert.ok(level1.some((item) => item.position.x > root.position.x + 180));
  assert.ok(level1.some((item) => item.position.x + getNodeSize(item).width < root.position.x));
  const right = autoLayout(tree, "right").filter((item) => item.data.parentId === "root");
  right.forEach((item) => assert.ok(item.position.x > 500 + 180));
});

test("an explicit side wins over automatic balancing", () => {
  const tree = [sized(node("root"), 160, 50), sized(node("a", "root", { side: "left" }), 100, 30), sized(node("b", "root", { side: "left" }), 100, 30)];
  const output = autoLayout(tree, "horizontal");
  output.filter((item) => item.data.parentId).forEach((item) => assert.ok(item.position.x < 0));
});

test("a single child stays on its parent's axis", () => {
  const output = autoLayout([sized(node("root"), 160, 50), sized(node("a", "root"), 100, 30), sized(node("b", "a"), 90, 30)], "right");
  const center = (id) => { const item = output.find((entry) => entry.id === id); return item.position.y + getNodeSize(item).height / 2; };
  assert.equal(center("root"), center("a"));
  assert.equal(center("a"), center("b"));
});

test("tall images and attached topic images reserve their real height", () => {
  const image = { id: "image", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 360 }, data: { parentId: "root" } };
  const illustrated = node("illustrated", "root", { imageAssetId: "asset", topicImageHeight: 145 });
  const output = autoLayout([sized(node("root"), 160, 50), image, illustrated, node("sibling", "root")], "right");
  assertNoOverlap(output);
  assert.ok(getNodeSize(output.find((item) => item.id === "illustrated")).height >= 145);
});

test("a rotated image reserves its visual bounding box", () => {
  const image = { id: "rotated", type: "image", position: { x: 0, y: 0 }, style: { width: 600, height: 160 }, data: { parentId: "root", rotation: 90 } };
  const output = autoLayout([sized(node("root"), 160, 50), image, sized(node("sibling", "root"), 100, 30)], "right");
  const placed = output.find((item) => item.id === "rotated");
  const sibling = output.find((item) => item.id === "sibling");
  const visualTop = placed.position.y + (160 - 600) / 2;
  assert.ok(sibling.position.y >= visualTop + 600 || sibling.position.y + 30 <= visualTop);
});

test("collapsed and hidden branches do not reserve space", () => {
  const expanded = autoLayout(bigTree(), "right");
  const collapsed = autoLayout(bigTree().map((item) => (item.id === "e" ? { ...item, data: { ...item.data, collapsed: true } } : item)), "right");
  const span = (items) => Math.max(...items.map((item) => item.position.y + getNodeSize(item).height)) - Math.min(...items.map((item) => item.position.y));
  const visible = (items) => getVisibleNodes(items);
  assert.ok(span(visible(collapsed)) < span(visible(expanded)));
});

test("detached images and extra central topics form separate, non-overlapping trees", () => {
  const detached = { id: "detached", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 300 }, data: { parentId: null } };
  const output = autoLayout([...bigTree(), detached], "horizontal");
  assertNoOverlap(output);
});

test("a branch can use its own layout (list inside a horizontal map)", () => {
  const tree = [sized(node("root"), 160, 50), sized(node("branch", "root", { layout: "list" }), 120, 32), sized(node("x", "branch"), 90, 28), sized(node("y", "branch"), 90, 28)];
  const output = autoLayout(tree, "horizontal");
  const branch = output.find((item) => item.id === "branch");
  const x = output.find((item) => item.id === "x");
  const y = output.find((item) => item.id === "y");
  assert.ok(x.position.y > branch.position.y + 32 - 1, "list children are below the branch");
  assert.ok(y.position.y > x.position.y);
  assert.equal(computeBranchModes(tree, "horizontal").get("branch"), "list");
  assertNoOverlap(output);
});

test("dropping a topic between siblings reorders it and picks the side", () => {
  const laid = autoLayout(bigTree(), "right");
  const position = (id) => laid.find((item) => item.id === id).position;
  const slot = dropSlotForPosition(laid, "e", { x: position("a").x + 10, y: position("a").y - 20 }, "right");
  assert.equal(slot.parentId, "root");
  const reordered = laid.filter((item) => item.id !== "e");
  reordered.splice(slot.index, 0, laid.find((item) => item.id === "e"));
  const level1 = reordered.filter((item) => item.data.parentId === "root").map((item) => item.id);
  assert.equal(level1[0], "e");

  const balanced = autoLayout(bigTree(), "horizontal");
  const root = balanced.find((item) => item.id === "root");
  assert.equal(dropSlotForPosition(balanced, "a", { x: root.position.x - 300, y: root.position.y }, "horizontal").side, "left");
  assert.equal(dropSlotForPosition(balanced, "a", { x: root.position.x + 500, y: root.position.y }, "horizontal").side, "right");
});

test("edges pick anchors from the branch mode", () => {
  const horizontal = autoLayout(bigTree(), "horizontal");
  buildEdges(horizontal, settings, {}, [], { layout: "horizontal" }).forEach((edge) => {
    const target = horizontal.find((item) => item.id === edge.target);
    const source = horizontal.find((item) => item.id === edge.source);
    const toRight = target.position.x > source.position.x;
    assert.equal(edge.sourceHandle, toRight ? "s-right" : "s-left");
    assert.equal(edge.targetHandle, toRight ? "t-left" : "t-right");
  });
  const topDown = autoLayout(bigTree(), "topDown");
  buildEdges(topDown, settings, {}, [], { layout: "topDown" }).forEach((edge) => {
    assert.equal(edge.sourceHandle, "s-bottom");
    assert.equal(edge.targetHandle, "t-top");
  });
  const list = autoLayout(bigTree(), "list");
  buildEdges(list, settings, {}, [], { layout: "list" }).forEach((edge) => assert.equal(edge.data.orientation, "list"));
});

test("relation precedence is element then branch then map", () => {
  const styledNodes = nodes.map((item) => item.id === "a" ? { ...item, data: { ...item.data, relationStyle: "straight" } } : item);
  const edges = buildEdges(styledNodes, settings, { "root-b": { style: "angled" } }, []);
  assert.equal(edges.find((edge) => edge.id === "root-a").data.pathStyle, "straight");
  assert.equal(edges.find((edge) => edge.id === "root-b").data.pathStyle, "angled");
  assert.equal(edges.find((edge) => edge.id === "a-c").data.pathStyle, "curved");
});

test("dangling and duplicate crosslinks are not rendered", () => {
  const edges = buildEdges(nodes, settings, {}, [
    { id: "valid", source: "a", target: "b" },
    { id: "bad", source: "a", target: "missing" },
    { id: "duplicate", source: "root", target: "a" },
    { id: "reverse-copy", source: "b", target: "a" },
  ]);
  assert.ok(edges.some((edge) => edge.id === "valid"));
  assert.ok(!edges.some((edge) => edge.id === "bad"));
  assert.equal(edges.filter((edge) => edge.data.isCrossLink).length, 1);
  assert.equal(edges.find((edge) => edge.id === "valid").data.arrow, "end");
});

test("images take part in tree edges and crosslinks", () => {
  const image = { id: "image", type: "image", position: { x: 380, y: 0 }, data: { parentId: "root", relationStyle: "inherit" } };
  const imageChild = node("image-child", "image");
  const peer = node("peer", "root");
  const edges = buildEdges([node("root"), image, imageChild, peer], settings, {}, [{ id: "image-peer", source: "image", target: "peer" }]);
  assert.ok(edges.some((edge) => edge.source === "root" && edge.target === "image" && !edge.data.isCrossLink));
  assert.ok(edges.some((edge) => edge.source === "image" && edge.target === "image-child" && !edge.data.isCrossLink));
  assert.ok(edges.some((edge) => edge.source === "image" && edge.target === "peer" && edge.data.isCrossLink));
});
