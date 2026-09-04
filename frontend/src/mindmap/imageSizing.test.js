import test from "node:test";
import assert from "node:assert/strict";
import { getImageNodeSize, getImageNoteHeight } from "./imageSizing.js";

test("portrait images keep a tall natural aspect ratio", () => {
  assert.deepEqual(getImageNodeSize(500, 1000), { width: 260, height: 520 });
});

test("landscape images keep a wide natural aspect ratio", () => {
  assert.deepEqual(getImageNodeSize(1200, 600), { width: 260, height: 130 });
});

test("a note above an image reserves extra height without changing its image ratio", () => {
  const noteHeight = getImageNoteHeight("Giải thích nội dung ảnh", 260);
  assert.ok(noteHeight >= 38);
  assert.deepEqual(getImageNodeSize(1200, 600, 260, "Giải thích nội dung ảnh"), {
    width: 260,
    height: 130 + noteHeight,
  });
});
