import test from "node:test";
import assert from "node:assert/strict";
import { createInitialDocument, createTopicData } from "./constants.js";
import { documentFromTree, importFromFile, parseFreeMind, parseOpml, parseTextOutline, toFreeMind, toIcs, toMarkdown, toOpml, toTextOutline } from "./formats.js";

const sample = () => {
  const document = createInitialDocument({ title: "Vật lý & <Cơ học>" });
  document.nodes[0].data.label = "Cơ học";
  document.nodes.push(
    { id: "a", type: "topic", position: { x: 200, y: 0 }, data: createTopicData({ label: "Động học", parentId: "root", note: "v = s/t", dueDate: "2026-11-20" }) },
    { id: "a1", type: "topic", position: { x: 400, y: 0 }, data: createTopicData({ label: "Gia tốc", parentId: "a", checkbox: true, checked: true }) },
    { id: "b", type: "topic", position: { x: -200, y: 0 }, data: createTopicData({ label: "Động lực học", parentId: "root" }) },
  );
  return document;
};

test("indented text, bullets, headings and checkboxes become a tree", () => {
  const tree = parseTextOutline("# Dự án\n## Mục tiêu\n- Ra mắt\n  - [x] Thiết kế\n  - [ ] Code\n> ghi chú code\n## Rủi ro\nThiếu người");
  assert.equal(tree.length, 1);
  assert.equal(tree[0].label, "Dự án");
  assert.deepEqual(tree[0].children.map((item) => item.label), ["Mục tiêu", "Rủi ro"]);
  const goal = tree[0].children[0];
  assert.equal(goal.children[0].label, "Ra mắt");
  assert.deepEqual(goal.children[0].children.map((item) => [item.label, item.checked]), [["Thiết kế", true], ["Code", false]]);
  assert.equal(goal.children[0].children[1].note, "ghi chú code");
  assert.equal(tree[0].children[1].children[0].label, "Thiếu người");
  assert.deepEqual(parseTextOutline("A\n\tB\n\t\tC\nD").map((item) => item.label), ["A", "D"]);
});

test("OPML round-trips labels, notes and escaping", () => {
  const opml = toOpml(sample());
  assert.match(opml, /<title>Vật lý &amp; &lt;Cơ học&gt;<\/title>/);
  const parsed = parseOpml(opml);
  assert.equal(parsed.title, "Vật lý & <Cơ học>");
  assert.equal(parsed.tree[0].label, "Cơ học");
  assert.equal(parsed.tree[0].children[0].note, "v = s/t");
  assert.equal(parsed.tree[0].children[0].children[0].checked, true);
});

test("FreeMind export and import keep the hierarchy and sides", () => {
  const xml = toFreeMind(sample());
  assert.match(xml, /POSITION="left"/);
  const parsed = parseFreeMind(xml);
  assert.equal(parsed.title, "Cơ học");
  assert.deepEqual(parsed.tree[0].children.map((item) => item.label), ["Động học", "Động lực học"]);
});

test("markdown, text outline and calendar exports", () => {
  const markdown = toMarkdown(sample());
  assert.match(markdown, /^# Vật lý/);
  assert.match(markdown, / {4}- \[x\] Gia tốc/);
  assert.match(toTextOutline(sample()), /^Cơ học\n\tĐộng học\n\t\tGia tốc/);
  const ics = toIcs(sample());
  assert.match(ics, /DTSTART;VALUE=DATE:20261120/);
  assert.match(ics, /DTEND;VALUE=DATE:20261121/);
  assert.match(ics, /SUMMARY:Động học/);
});

test("imported files become laid-out documents", () => {
  const fromOpml = importFromFile("map.opml", toOpml(sample()));
  assert.equal(fromOpml.nodes.length, 4);
  assert.equal(fromOpml.nodes.filter((node) => !node.data.parentId).length, 1);
  const fromText = importFromFile("notes.txt", "A\nB\n  B1");
  assert.equal(fromText.nodes[0].data.label, "notes");
  assert.equal(fromText.nodes.length, 4);
  assert.equal(importFromFile("x.json", "{}"), null);
  const doc = documentFromTree("", [{ label: "Root", children: [{ label: "Child", children: [] }] }]);
  assert.equal(doc.title, "Root");
});
