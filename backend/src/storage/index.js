import { DATA_DIR, IS_PRODUCTION } from "../config/env.js";
import { connectDB } from "../config/db.js";
import { createFileStore } from "./fileStore.js";
import { createMongoStore, StorageUnavailableError } from "./mongoStore.js";

let activeStore = null;
let storageNote = "";

export { StorageUnavailableError };

/** Routes call this per request so tests and late Mongo connections work. */
export const getStore = () => {
  if (!activeStore) throw new StorageUnavailableError();
  return activeStore;
};

export const setStore = (store) => {
  activeStore = store;
  return store;
};

export const getStorageInfo = () => ({
  kind: activeStore?.kind || "none",
  description: activeStore?.describe?.() || "Chưa sẵn sàng",
  note: storageNote,
});

const retryMongo = (delayMs = 30_000) => {
  const timer = setTimeout(async () => {
    try {
      await connectDB();
      storageNote = "";
      console.log("[storage] Đã kết nối lại MongoDB.");
    } catch (error) {
      console.error("[storage] MongoDB vẫn chưa kết nối được:", error.message);
      retryMongo(Math.min(delayMs * 2, 5 * 60_000));
    }
  }, delayMs);
  timer.unref?.();
};

/**
 * Picks the storage automatically:
 * - MONGODB_CONNECTION_STRING set  → MongoDB (production/hosted).
 * - not set                        → JSON files in backend/data (zero config).
 * - set but unreachable in dev     → falls back to files so the app still opens.
 */
export const initStorage = async ({ dataDir = DATA_DIR, env = process.env } = {}) => {
  const storageSetting = String(env.STORAGE || "auto").toLowerCase();
  const wantsMongo = storageSetting === "mongo" || (storageSetting === "auto" && Boolean(env.MONGODB_CONNECTION_STRING));

  if (!wantsMongo) {
    if (IS_PRODUCTION && !env.DATA_DIR) {
      storageNote = "Đang lưu bằng tệp trong môi trường production. Hãy đặt MONGODB_CONNECTION_STRING hoặc DATA_DIR trỏ tới ổ đĩa bền vững.";
    }
    return setStore(createFileStore(dataDir));
  }

  try {
    await connectDB();
    return setStore(createMongoStore());
  } catch (error) {
    if (IS_PRODUCTION || storageSetting === "mongo") {
      // Never silently split production data across two stores. Keep the API
      // up (it returns 503) and keep retrying in the background.
      storageNote = `MongoDB chưa kết nối được: ${error.message}`;
      console.error("[storage]", storageNote);
      retryMongo();
      return setStore(createMongoStore());
    }
    storageNote = `MongoDB chưa kết nối được (${error.message}). Đang dùng tệp trong ${dataDir}.`;
    console.warn("[storage]", storageNote);
    return setStore(createFileStore(dataDir));
  }
};
