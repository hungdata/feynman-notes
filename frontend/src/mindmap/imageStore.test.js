import test from "node:test";
import assert from "node:assert/strict";
import { getImageAssetUrl, MAX_IMAGE_BYTES, migrateLegacyImageAsset, uploadImageFile, validateImageFile } from "./imageStore.js";

test("server asset URLs retain opaque UUIDs and encode unsafe path characters", () => {
  assert.equal(getImageAssetUrl("asset-123"), "/api/assets/images/asset-123");
  assert.equal(getImageAssetUrl("legacy/id"), "/api/assets/images/legacy%2Fid");
});

test("image file validation keeps the client limit before upload", () => {
  assert.doesNotThrow(() => validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES, name: "diagram.png" }));
  assert.throws(() => validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1, name: "large.png" }), /12 MB/);
  assert.throws(() => validateImageFile({ type: "application/pdf", size: 20, name: "notes.pdf" }), /Không hỗ trợ/);
});

test("upload sends the map's stable assetId instead of a storage ObjectId", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  const requestedId = "5e4a4fb7-854c-456e-a9f2-cd4b76c2e240";
  const file = new Blob(["image"], { type: "image/png" });
  Object.defineProperty(file, "name", { value: "diagram.png" });

  class TestImage {
    naturalWidth = 640;
    naturalHeight = 480;
    set src(_value) { queueMicrotask(() => this.onload()); }
  }

  try {
    globalThis.Image = TestImage;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/assets/images");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "include");
      assert.equal(options.body.get("assetId"), requestedId);
      assert.equal(options.body.get("image").name, "diagram.png");
      return new Response(JSON.stringify({ asset: { assetId: requestedId, width: 640, height: 480 } }), { status: 201 });
    };
    const asset = await uploadImageFile(file, { assetId: requestedId });
    assert.equal(asset.id, requestedId);
    assert.equal(asset.url, `/api/assets/images/${requestedId}`);
    assert.equal(asset.storage, "server");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Image = originalImage;
  }
});

test("legacy browser image migration preserves the UUID already in the map", async () => {
  const originalFetch = globalThis.fetch;
  const legacyId = "a5e5a6a7-854c-456e-a9f2-cd4b76c2e240";
  const legacyAsset = {
    blob: new Blob(["legacy"], { type: "image/png" }),
    name: "yesterday.png",
    mimeType: "image/png",
    width: 800,
    height: 600,
  };
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options.body.get("assetId"), legacyId);
      return new Response(JSON.stringify({ asset: { assetId: legacyId } }), { status: 201 });
    };
    const asset = await migrateLegacyImageAsset(legacyId, legacyAsset);
    assert.equal(asset.id, legacyId);
    assert.equal(asset.width, 800);
    assert.equal(asset.height, 600);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
