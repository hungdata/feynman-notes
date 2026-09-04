import assert from "node:assert/strict";
import test from "node:test";
import { resizeTextareaToContent } from "./textareaSizing.js";

test("inline note editor expands to its full wrapped content height", () => {
  const textarea = { style: { height: "32px" }, scrollHeight: 126, scrollTop: 50 };
  assert.equal(resizeTextareaToContent(textarea), 126);
  assert.equal(textarea.style.height, "126px");
  assert.equal(textarea.scrollTop, 0);
});

test("inline note editor can shrink after text is deleted", () => {
  const textarea = { style: { height: "126px" }, scrollHeight: 28, scrollTop: 0 };
  resizeTextareaToContent(textarea);
  assert.equal(textarea.style.height, "28px");
});
