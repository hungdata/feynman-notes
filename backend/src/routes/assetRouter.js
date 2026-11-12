import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { requireAuth } from "../auth/requireAuth.js";
import { getStore } from "../storage/index.js";
import { ASSET_BUCKET_NAME } from "../storage/mongoStore.js";
import {
  ImageValidationError,
  MAX_IMAGE_BYTES,
  SUPPORTED_IMAGE_TYPES,
  safeImageFilename,
  validateImageUpload,
} from "../assets/imageValidation.js";

const router = express.Router();
const BUCKET_NAME = ASSET_BUCKET_NAME;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class AssetRouteError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AssetRouteError";
    this.status = status;
  }
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
    files: 1,
    fields: 8,
    fieldSize: 64 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.mimetype)) {
      callback(new ImageValidationError("Chỉ hỗ trợ PNG, JPG, WEBP, GIF và SVG an toàn."));
      return;
    }
    callback(null, true);
  },
});

const normalizeAssetId = (value, { required = true } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (!required) return crypto.randomUUID();
    throw new AssetRouteError("Mã ảnh không hợp lệ.");
  }

  const assetId = String(value).trim().toLowerCase();
  if (!UUID_PATTERN.test(assetId)) throw new AssetRouteError("Mã ảnh không hợp lệ.");
  return assetId;
};

const assetPayload = (file) => ({
  id: file.metadata.assetId,
  url: `/api/assets/images/${encodeURIComponent(file.metadata.assetId)}`,
  width: Number(file.metadata.width) || 400,
  height: Number(file.metadata.height) || 300,
  name: file.metadata.originalName || file.filename || "image",
  mimeType: file.contentType || file.metadata.mimeType,
  createdAt: file.uploadDate?.toISOString?.() || new Date().toISOString(),
});

router.use(requireAuth);

router.post("/images", imageUpload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) throw new AssetRouteError("Hãy chọn một tệp ảnh để tải lên.");

    const store = getStore();
    const assetId = normalizeAssetId(req.body?.assetId, { required: false });
    const existing = await store.assets.find(req.user.id, assetId);
    // Retries and the browser-to-server migration can safely send the same
    // UUID. Returning the original immutable asset prevents duplicate blobs.
    if (existing) return res.status(200).json({ asset: assetPayload(existing), reused: true });

    const image = validateImageUpload({ buffer: req.file.buffer, mimeType: req.file.mimetype });
    const { file, reused } = await store.assets.save(req.user.id, assetId, image.buffer, {
      ownerId: req.user.id,
      assetId,
      originalName: safeImageFilename(req.file.originalname),
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
    });
    return res.status(reused ? 200 : 201).json({ asset: assetPayload(file), reused });
  } catch (error) {
    return next(error);
  }
});

router.get("/images/:assetId", async (req, res, next) => {
  try {
    const store = getStore();
    const assetId = normalizeAssetId(req.params.assetId);
    const file = await store.assets.find(req.user.id, assetId);
    // Return the same result for an unknown or another user's asset, so UUIDs
    // cannot be used to discover somebody else's uploads.
    if (!file) return res.status(404).json({ message: "Không tìm thấy ảnh." });

    const mimeType = file.contentType || file.metadata?.mimeType;
    if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) return res.status(404).json({ message: "Không tìm thấy ảnh." });

    res.set({
      "Content-Type": mimeType,
      "Content-Length": String(file.length),
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-site",
      // GridFS assets are also reachable as a direct URL. Sandboxing keeps a
      // malicious SVG from gaining script privileges if it is opened directly.
      "Content-Security-Policy": "sandbox",
    });

    const downloadStream = store.assets.openReadStream(file);
    downloadStream.once("error", (error) => {
      if (!res.headersSent) next(error);
      else res.destroy(error);
    });
    downloadStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

router.delete("/images/:assetId", async (req, res, next) => {
  try {
    const store = getStore();
    const assetId = normalizeAssetId(req.params.assetId);
    const file = await store.assets.find(req.user.id, assetId);
    if (!file) return res.status(404).json({ message: "Không tìm thấy ảnh." });

    // An image can be referenced by a full image node or attached to a topic.
    // Refuse deletion while it is referenced so a direct API call cannot leave
    // a saved mind map with a broken image.
    const referenced = await store.mindMaps.referencesAsset(req.user.id, assetId);
    if (referenced) return res.status(409).json({ message: "Ảnh đang được sử dụng trong mind map và chưa thể xóa." });

    await store.assets.remove(file);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

router.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Ảnh vượt quá giới hạn 12 MB."
      : "Dữ liệu tải ảnh không hợp lệ.";
    return res.status(status).json({ message });
  }
  if (error instanceof ImageValidationError || error instanceof AssetRouteError) {
    return res.status(error.status || 400).json({ message: error.message });
  }
  return next(error);
});

export { BUCKET_NAME, normalizeAssetId };
export default router;
