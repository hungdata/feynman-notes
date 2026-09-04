import assert from "node:assert/strict";
import test from "node:test";
import {
  ImageValidationError,
  MAX_IMAGE_BYTES,
  validateImageUpload,
} from "./imageValidation.js";

const png = (width = 640, height = 480) => {
  const file = Buffer.alloc(24);
  Buffer.from("89504e470d0a1a0a", "hex").copy(file, 0);
  file.write("IHDR", 12, "ascii");
  file.writeUInt32BE(width, 16);
  file.writeUInt32BE(height, 20);
  return file;
};

test("accepts a real PNG and returns dimensions used by the mind map", () => {
  const asset = validateImageUpload({ buffer: png(1200, 675), mimeType: "image/png" });
  assert.equal(asset.mimeType, "image/png");
  assert.equal(asset.width, 1200);
  assert.equal(asset.height, 675);
});

test("rejects a claimed MIME type when the binary signature does not match", () => {
  assert.throws(
    () => validateImageUpload({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mimeType: "image/png" }),
    ImageValidationError
  );
});

test("rejects unsafe SVG payloads before GridFS receives them", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.throws(() => validateImageUpload({ buffer: svg, mimeType: "image/svg+xml" }), /không an toàn/);
});

test("rejects images over the 12 MB upload limit", () => {
  assert.throws(
    () => validateImageUpload({ buffer: Buffer.alloc(MAX_IMAGE_BYTES + 1), mimeType: "image/png" }),
    (error) => error instanceof ImageValidationError && error.status === 413
  );
});

test("rejects a dimension bomb even when its header is a valid PNG", () => {
  assert.throws(
    () => validateImageUpload({ buffer: png(16384, 16384), mimeType: "image/png" }),
    /kích thước quá lớn/
  );
});
