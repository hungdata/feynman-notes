const DATABASE_NAME = "novamind-assets";
const STORE_NAME = "images";
const DATABASE_VERSION = 1;
const IMAGE_ASSET_ENDPOINT = "/api/assets/images";

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

// Browser storage was used by the first version of the mind map. Keep it
// read-compatible so existing local images do not disappear while they are
// gradually replaced by assets stored on the server.
const inMemoryAssets = new Map();
const legacyMigrationRequests = new Map();

export class ImageAssetRequestError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ImageAssetRequestError";
    this.status = status;
  }
}

const hasIndexedDb = () => typeof indexedDB !== "undefined";

const openDatabase = () => new Promise((resolve, reject) => {
  if (!hasIndexedDb()) {
    reject(new Error("Trình duyệt này không hỗ trợ bộ nhớ ảnh cũ."));
    return;
  }
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const sanitizeSvg = async (file) => {
  const document = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
  if (document.querySelector("parsererror")) throw new Error("SVG không hợp lệ.");
  document.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "xlink:href") && !value.startsWith("#") && !value.startsWith("data:image/"))) element.removeAttribute(attribute.name);
    });
  });
  return new Blob([new XMLSerializer().serializeToString(document)], { type: "image/svg+xml" });
};

const getDimensions = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => { resolve({ width: image.naturalWidth || 400, height: image.naturalHeight || 300 }); URL.revokeObjectURL(url); };
  image.onerror = () => { reject(new Error("Không thể đọc ảnh.")); URL.revokeObjectURL(url); };
  image.src = url;
});

const readErrorMessage = async (response, fallback) => {
  try {
    const payload = await response.clone().json();
    return payload?.message || payload?.error || fallback;
  } catch {
    return fallback;
  }
};

const getContentDispositionName = (value) => {
  const match = value?.match(/filename\*?=(?:UTF-8''|")?([^;"]+)/i);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1].replace(/^"|"$/g, "")); } catch { return match[1]; }
};

const localGetImageAsset = async (id) => {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
};

const prepareAsset = async (file) => {
  validateImageFile(file);
  const blob = file.type === "image/svg+xml" ? await sanitizeSvg(file) : file;
  const dimensions = await getDimensions(blob);
  return {
    blob,
    mimeType: blob.type || file.type,
    width: dimensions.width,
    height: dimensions.height,
    name: file.name || "clipboard-image",
  };
};

const normalizeServerAsset = (payload, fallback, requestedId) => {
  const nestedAsset = payload?.asset || payload?.data || payload;
  const returnedId = nestedAsset?.assetId || nestedAsset?.id || nestedAsset?._id || payload?.assetId || payload?.id || payload?._id;
  // The document references this client-generated opaque UUID, not GridFS's
  // internal ObjectId. That keeps an existing map stable even if storage is
  // migrated from MongoDB to another provider later.
  const id = requestedId || returnedId;
  if (!id) throw new ImageAssetRequestError("Máy chủ trả về ảnh không hợp lệ.");
  return {
    id: String(id),
    url: nestedAsset?.url || payload?.url || getImageAssetUrl(id),
    width: Number(nestedAsset?.width || payload?.width) || fallback.width,
    height: Number(nestedAsset?.height || payload?.height) || fallback.height,
    name: nestedAsset?.name || nestedAsset?.filename || payload?.name || fallback.name,
    mimeType: nestedAsset?.mimeType || nestedAsset?.contentType || payload?.mimeType || fallback.mimeType,
    createdAt: nestedAsset?.createdAt || payload?.createdAt || new Date().toISOString(),
    storage: "server",
  };
};

const uploadPreparedAsset = async (prepared, assetId) => {
  const formData = new FormData();
  formData.append("image", prepared.blob, prepared.name);
  formData.append("assetId", assetId);

  let response;
  try {
    response = await fetch(IMAGE_ASSET_ENDPOINT, { method: "POST", credentials: "include", body: formData });
  } catch (error) {
    throw new ImageAssetRequestError("Không thể kết nối máy chủ để lưu ảnh.", 0, { cause: error });
  }
  if (!response.ok) {
    throw new ImageAssetRequestError(await readErrorMessage(response, "Không thể lưu ảnh trên máy chủ."), response.status);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ImageAssetRequestError("Máy chủ trả về dữ liệu ảnh không hợp lệ.", response.status);
  }
  return normalizeServerAsset(payload, prepared, assetId);
};

export const getImageAssetUrl = (id) => `${IMAGE_ASSET_ENDPOINT}/${encodeURIComponent(String(id))}`;

export const validateImageFile = (file) => {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error(`Không hỗ trợ ${file.name || "định dạng tệp này"}.`);
  if (file.size > MAX_IMAGE_BYTES) throw new Error(`${file.name || "Ảnh"} vượt quá giới hạn 12 MB.`);
};

/**
 * Upload a sanitized image to the authenticated server. Mind-map documents
 * only store the returned id; the binary itself is kept by GridFS/server
 * storage and therefore survives browser cache clears and a different device.
 */
export const uploadImageFile = async (file, { assetId = crypto.randomUUID() } = {}) => {
  const prepared = await prepareAsset(file);
  return uploadPreparedAsset(prepared, assetId);
};

/**
 * The public image entry point. New files must be confirmed by the server
 * before a node can reference them. We intentionally do not create a new
 * browser-only fallback here: that would make an upload look successful yet
 * let it disappear when browser data is cleared.
 */
export const storeImageFile = (file) => uploadImageFile(file);

/**
 * Promote an image saved by the old browser-only app to server storage without
 * changing the ID already stored in every mind-map node. It is intentionally
 * called only after GET returned a confirmed 404 for that ID.
 */
export const migrateLegacyImageAsset = async (id, localAsset) => {
  if (legacyMigrationRequests.has(id)) return legacyMigrationRequests.get(id);

  const request = (async () => {
    const legacy = localAsset?.blob ? localAsset : await localGetImageAsset(id);
    if (!legacy?.blob) return null;
    const mimeType = legacy.mimeType || legacy.blob.type;
    const name = legacy.name || "legacy-image";
    validateImageFile({ type: mimeType, size: legacy.blob.size, name });
    const dimensions = Number.isFinite(Number(legacy.width)) && Number.isFinite(Number(legacy.height))
      ? { width: Number(legacy.width), height: Number(legacy.height) }
      : await getDimensions(legacy.blob);
    const uploaded = await uploadPreparedAsset({
      blob: legacy.blob,
      mimeType,
      name,
      ...dimensions,
    }, id);
    // Do not delete the old cache until a later explicit cleanup. It remains
    // a recovery copy if the map save is interrupted after this upload.
    inMemoryAssets.delete(id);
    return uploaded;
  })();
  legacyMigrationRequests.set(id, request);
  try {
    return await request;
  } catch (error) {
    legacyMigrationRequests.delete(id);
    throw error;
  }
};

/**
 * Resolve both new server assets and assets created by the earlier
 * browser-only implementation. The returned blob is intentionally consumed
 * by useImageAssets, which owns and revokes the temporary object URL.
 */
export const getImageAsset = async (id) => {
  const cached = inMemoryAssets.get(id);
  if (cached?.blob) return cached;

  try {
    let response;
    try {
      response = await fetch(getImageAssetUrl(id), { credentials: "include" });
    } catch (error) {
      throw new ImageAssetRequestError("Không thể kết nối máy chủ để tải ảnh.", 0, { cause: error });
    }
    if (!response.ok) throw new ImageAssetRequestError(await readErrorMessage(response, "Không tìm thấy ảnh trên máy chủ."), response.status);
    const blob = await response.blob();
    const asset = {
      id,
      blob,
      mimeType: response.headers.get("content-type") || blob.type,
      name: getContentDispositionName(response.headers.get("content-disposition")),
      storage: "server",
    };
    inMemoryAssets.set(id, asset);
    return asset;
  } catch (serverError) {
    // A confirmed 404 can mean this is a legacy IndexedDB id. Only then read
    // local storage; an auth or network error must not masquerade as a valid
    // persistent asset.
    if (!(serverError instanceof ImageAssetRequestError) || serverError.status !== 404) throw serverError;
    try {
      const localAsset = await localGetImageAsset(id);
      if (localAsset) {
        const asset = { ...localAsset, storage: "local", legacy: true };
        inMemoryAssets.set(id, asset);
        return asset;
      }
    } catch {
      // Keep the original server error: it explains why the image cannot be
      // loaded and is more useful than an IndexedDB capability error.
    }
    throw serverError;
  }
};

// This is retained for code using the previous image-store API. Server assets
// are deliberately not deleted when a node is removed: the same image can be
// referenced by duplicated nodes or another map. Server-side cleanup can
// safely remove unreferenced files later.
export const deleteImageAsset = async (id) => {
  inMemoryAssets.delete(id);
  if (!hasIndexedDb()) return;
  const database = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};
