import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAssetId } from "./assetRouter.js";

test("asset ids are UUIDs and a missing upload id receives a fresh UUID", () => {
  const supplied = normalizeAssetId("D785DCB8-9F17-4A30-8649-9A5BFC582345");
  const generated = normalizeAssetId(undefined, { required: false });

  assert.equal(supplied, "d785dcb8-9f17-4a30-8649-9a5bfc582345");
  assert.match(generated, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => normalizeAssetId("not-an-asset-id"), /Mã ảnh không hợp lệ/);
});
