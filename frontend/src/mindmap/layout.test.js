import test from "node:test";
import assert from "node:assert/strict";
import { alignSingleChildChains, autoLayout, buildEdges, canReparent, findDropParent, getDescendantIds } from "./layout.js";

const node = (id, parentId = null) => ({ id, type: "topic", position: { x: 0, y: 0 }, data: { parentId, branchColor: "#2563eb", relationStyle: "inherit", layout: "inherit" } });
const nodes = [node("root"), node("a", "root"), node("b", "root"), node("c", "a")];
const settings = { relationStyle: "curved", relationColor: "#64748b", relationWidth: 2, relationOpacity: 1, relationDash: "solid" };

test("descendants are complete and cycle-safe reparenting is enforced", () => {
  assert.deepEqual([...getDescendantIds(nodes, "a")], ["c"]);
  assert.equal(canReparent(nodes, "a", "c"), false);
  assert.equal(canReparent(nodes, "c", "b"), true);
});

test("pointer drop finds a topic parent for both topic and image nodes", () => {
  const target = { ...node("target"), position: { x: 400, y: 200 } };
  const image = { id: "image", type: "image", position: { x: 0, y: 0 }, data: { parentId: "root" } };
  const graph = [node("root"), node("moving", "root"), target, image];
  assert.equal(findDropParent(graph, "moving", { x: 520, y: 238 })?.id, "target");
  assert.equal(findDropParent(graph, "image", { x: 520, y: 238 })?.id, "target");
  assert.equal(findDropParent(graph, "root", { x: 20, y: 20 }), null);
});

test("pointer drop accepts an image as parent for a note and keeps cycle protection", () => {
  const imageParent = {
    id: "image-parent", type: "image", position: { x: 400, y: 200 }, style: { width: 260, height: 320 },
    data: { parentId: "root", branchColor: "#2563eb" },
  };
  const child = { ...node("child", "image-parent"), position: { x: 800, y: 200 } };
  const graph = [node("root"), imageParent, child, node("moving", "root")];
  assert.equal(findDropParent(graph, "moving", { x: 520, y: 360 })?.id, "image-parent");
  assert.equal(findDropParent(graph, "image-parent", { x: 520, y: 360 }), null);
  assert.equal(findDropParent(graph, "image-parent", { x: 930, y: 238 }), null);
});

test("all supported automatic layouts return every node with finite positions", () => {
  ["freeForm", "horizontal", "vertical", "topDown", "linear", "radial", "matrix", "list"].forEach((layout) => {
    const output = autoLayout(nodes, layout);
    assert.equal(output.length, nodes.length);
    output.forEach((item) => { assert.equal(Number.isFinite(item.position.x), true); assert.equal(Number.isFinite(item.position.y), true); });
  });
});

test("horizontal layout leaves usable space between 450px topic cards", () => {
  const output = autoLayout([node("root"), node("child", "root")], "horizontal");
  const root = output.find((item) => item.id === "root");
  const child = output.find((item) => item.id === "child");
  assert.ok(child.position.x - root.position.x - 450 >= 100);
});

test("a tall image does not overlap a topic in the lane below", () => {
  const image = { id: "image", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 360 }, data: { parentId: "root", branchColor: "#2563eb" } };
  const sibling = node("sibling", "root");
  const output = autoLayout([node("root"), image, sibling], "horizontal");
  const lane = output.filter((item) => item.position.x === output.find((item) => item.id === "image").position.x).sort((a, b) => a.position.y - b.position.y);
  assert.ok(lane[1].position.y >= lane[0].position.y + 360 + 180);
});

test("only branches beside a tall card receive its additional clearance", () => {
  const illustrated = { ...node("illustrated", "root"), data: { ...node("illustrated", "root").data, imageAssetId: "asset-1", topicImageHeight: 145 } };
  const sibling = node("sibling", "root");
  const tallElsewhere = { id: "tall-image", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 400 }, data: { parentId: "root" } };
  const output = autoLayout([node("root"), illustrated, sibling, tallElsewhere], "horizontal");
  const lane = output.filter((item) => item.position.x === output.find((item) => item.id === "illustrated").position.x).sort((a, b) => a.position.y - b.position.y);
  assert.ok(lane[1].position.y >= lane[0].position.y + 221 + 144);
  assert.ok(lane[2].position.y >= lane[1].position.y + 76 + 200);
});

test("measured multiline topics reserve their real height before the row below", () => {
  const tallTopic = { ...node("tall", "root"), measured: { width: 260, height: 420 } };
  const below = node("below", "root");
  const output = autoLayout([node("root"), tallTopic, below], "horizontal");
  const top = output.find((item) => item.id === "tall");
  const bottom = output.find((item) => item.id === "below");
  assert.ok(bottom.position.y >= top.position.y + 420 + 210);
  assert.ok(top.position.y + 420 < bottom.position.y);
});

test("an attached topic image reserves its intrinsic height before React Flow remeasures it", () => {
  const attached = {
    ...node("attached", "root"),
    measured: { width: 260, height: 76 },
    data: { ...node("attached", "root").data, imageAssetId: "asset-1", topicImageHeight: 145 },
  };
  const below = node("below", "root");
  const output = autoLayout([node("root"), attached, below], "horizontal");
  const top = output.find((item) => item.id === "attached");
  const bottom = output.find((item) => item.id === "below");
  assert.ok(bottom.position.y >= top.position.y + 221 + 144);
});

test("a wide image creates a wider following column instead of covering its child", () => {
  const image = {
    id: "wide-image", type: "image", position: { x: 0, y: 0 }, style: { width: 1000, height: 160 },
    data: { parentId: "root", branchColor: "#2563eb" },
  };
  const child = node("after-image", "wide-image");
  const output = autoLayout([node("root"), image, child], "horizontal");
  const placedImage = output.find((item) => item.id === "wide-image");
  const placedChild = output.find((item) => item.id === "after-image");
  assert.ok(placedChild.position.x >= placedImage.position.x + 1000 + 120);
});

test("a rotated image reserves its visual bounding box in both directions", () => {
  const image = {
    id: "rotated-image", type: "image", position: { x: 0, y: 0 }, style: { width: 1000, height: 160 },
    data: { parentId: "root", branchColor: "#2563eb", rotation: 90 },
  };
  const child = node("after-rotation", "rotated-image");
  const sibling = node("sibling", "root");
  const output = autoLayout([node("root"), image, child, sibling], "horizontal");
  const placedImage = output.find((item) => item.id === "rotated-image");
  const placedChild = output.find((item) => item.id === "after-rotation");
  const placedSibling = output.find((item) => item.id === "sibling");
  // At 90°, the 1000×160 image has an approximately 160×1000 visual box.
  const visualLeft = placedImage.position.x + (1000 - 160) / 2;
  const visualTop = placedImage.position.y + (160 - 1000) / 2;
  assert.ok(placedChild.position.x >= visualLeft + 160 + 119);
  assert.ok(placedSibling.position.y >= visualTop + 1000 + 499);
});

test("detached images become a separate forest instead of being left on the root", () => {
  const detachedImage = {
    id: "detached-image", type: "image", position: { x: 0, y: 0 }, style: { width: 260, height: 300 },
    data: { parentId: null, branchColor: "#2563eb" },
  };
  const output = autoLayout([node("root"), detachedImage], "horizontal");
  const root = output.find((item) => item.id === "root");
  const image = output.find((item) => item.id === "detached-image");
  assert.ok(image.position.x >= root.position.x + 260 + 120);
});

test("CSS-like image dimensions remain finite and do not poison the layout", () => {
  const image = {
    id: "css-sized-image", type: "image", position: { x: 0, y: 0 }, style: { width: "260px", height: "360px" },
    data: { parentId: "root", branchColor: "#2563eb" },
  };
  const sibling = node("sibling", "root");
  const output = autoLayout([node("root"), image, sibling], "horizontal");
  output.forEach((item) => {
    assert.equal(Number.isFinite(item.position.x), true);
    assert.equal(Number.isFinite(item.position.y), true);
  });
  const placedImage = output.find((item) => item.id === "css-sized-image");
  const placedSibling = output.find((item) => item.id === "sibling");
  assert.ok(placedSibling.position.y >= placedImage.position.y + 360 + 180);
});

test("a local branch layout cannot reintroduce a collision beside a tall card", () => {
  const branch = { ...node("branch", "root"), data: { ...node("branch", "root").data, layout: "list" } };
  const tall = { ...node("tall", "branch"), measured: { width: 260, height: 420 } };
  const below = node("below", "branch");
  const output = autoLayout([node("root"), branch, tall, below, node("sibling", "root")], "horizontal");
  const bounds = (item) => ({
    x: item.position.x,
    y: item.position.y,
    width: Number(item.measured?.width || item.style?.width || 260),
    height: Number(item.measured?.height || item.style?.height || 76),
  });
  const cards = output.map((item) => ({ id: item.id, ...bounds(item) }));
  cards.forEach((first, index) => cards.slice(index + 1).forEach((second) => {
    const overlaps = first.x < second.x + second.width && first.x + first.width > second.x
      && first.y < second.y + second.height && first.y + first.height > second.y;
    assert.equal(overlaps, false, `${first.id} overlaps ${second.id}`);
  }));
});

test("relation precedence is element then branch then map", () => {
  const styledNodes = nodes.map((item) => item.id === "a" ? { ...item, data: { ...item.data, relationStyle: "straight" } } : item);
  const edges = buildEdges(styledNodes, settings, { "root-b": { style: "angled" } }, []);
  assert.equal(edges.find((edge) => edge.id === "root-a").data.pathStyle, "straight");
  assert.equal(edges.find((edge) => edge.id === "root-b").data.pathStyle, "angled");
  assert.equal(edges.find((edge) => edge.id === "a-c").data.pathStyle, "curved");
});

test("dangling crosslinks are removed from rendering", () => {
  const edges = buildEdges(nodes, settings, {}, [{ id: "valid", source: "a", target: "b" }, { id: "bad", source: "a", target: "missing" }]);
  assert.ok(edges.some((edge) => edge.id === "valid"));
  assert.ok(!edges.some((edge) => edge.id === "bad"));
});

test("tree relations never render a duplicate crosslink", () => {
  const edges = buildEdges(nodes, settings, {}, [
    { id: "duplicate", source: "root", target: "a" },
    { id: "reverse-duplicate", source: "a", target: "root" },
    { id: "unique", source: "a", target: "b" },
    { id: "unique-copy", source: "b", target: "a" },
  ]);
  assert.equal(edges.filter((edge) => ["root", "a"].includes(edge.source) && ["root", "a"].includes(edge.target)).length, 1);
  assert.equal(edges.filter((edge) => edge.data.isCrossLink).length, 1);
});

test("single-child chains are locked to one horizontal axis", () => {
  const chain = [
    { ...node("root"), position: { x: 0, y: 120 } },
    { ...node("a", "root"), position: { x: 260, y: 153 } },
    { ...node("c", "a"), position: { x: 520, y: 91 } },
  ];
  const aligned = alignSingleChildChains(chain);
  assert.deepEqual(aligned.map((item) => item.position.y), [120, 120, 120]);
});

test("siblings keep separate rows instead of overlapping", () => {
  const branches = [
    { ...node("root"), position: { x: 0, y: 120 } },
    { ...node("a", "root"), position: { x: 260, y: 80 } },
    { ...node("b", "root"), position: { x: 260, y: 180 } },
  ];
  const aligned = alignSingleChildChains(branches);
  assert.deepEqual(aligned.map((item) => item.position.y), [120, 80, 180]);
});

test("connected image elements receive a normal tree edge", () => {
  const image = { id: "image", type: "image", position: { x: 380, y: 0 }, data: { parentId: "root", branchColor: "#f59e0b", relationStyle: "inherit" } };
  const edges = buildEdges([node("root"), image], settings, {}, []);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].source, "root");
  assert.equal(edges[0].target, "image");
});

test("a note can be linked as an image child and an image can participate in a crosslink", () => {
  const image = { id: "image", type: "image", position: { x: 380, y: 0 }, data: { parentId: "root", branchColor: "#f59e0b", relationStyle: "inherit" } };
  const imageChild = node("image-child", "image");
  const peer = node("peer", "root");
  const edges = buildEdges([node("root"), image, imageChild, peer], settings, {}, [{ id: "image-peer", source: "image", target: "peer" }]);
  assert.ok(edges.some((edge) => edge.source === "image" && edge.target === "image-child" && !edge.data.isCrossLink));
  assert.ok(edges.some((edge) => edge.source === "image" && edge.target === "peer" && edge.data.isCrossLink));
});

test("a topic-image-topic chain aligns every connection anchor", () => {
  const chain = [
    { ...node("root"), position: { x: 0, y: 100 } },
    { id: "image", type: "image", position: { x: 380, y: 220 }, style: { width: 260, height: 160 }, data: { parentId: "root" } },
    { ...node("after"), position: { x: 760, y: 10 }, data: { ...node("after").data, parentId: "image" } },
  ];
  const aligned = alignSingleChildChains(chain);
  const anchors = aligned.map((item) => item.position.y + Number(item.style?.height || (item.type === "image" ? 160 : 76)) / 2);
  assert.deepEqual(anchors, [138, 138, 138]);
  assert.deepEqual(aligned.map((item) => item.position.y), [100, 58, 100]);
});
