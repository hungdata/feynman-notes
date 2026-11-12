import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: new URL("../../.env", import.meta.url), quiet: true });
// Backward-compatible local path. Both locations are ignored by Git.
dotenv.config({ path: new URL("../.env", import.meta.url), quiet: true });

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Folder used by the zero-config file storage and the generated dev secret. */
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(backendDirectory, "data"));
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Local development should work without editing `.env`. When no session
 * secret is configured outside production, create one once and keep it in the
 * private data folder so sign-ins survive a restart. Production still requires
 * an explicit secret because a generated file may not survive a redeploy.
 */
const ensureDevelopmentSecret = () => {
  if (process.env.AUTH_SESSION_SECRET || IS_PRODUCTION) return;
  if (process.env.NODE_TEST_CONTEXT) {
    // `node --test` must not write into the real data folder.
    process.env.AUTH_SESSION_SECRET = crypto.randomBytes(48).toString("base64url");
    return;
  }
  const secretFile = path.join(DATA_DIR, ".session-secret");
  try {
    const existing = fs.existsSync(secretFile) ? fs.readFileSync(secretFile, "utf8").trim() : "";
    if (existing.length >= 32) {
      process.env.AUTH_SESSION_SECRET = existing;
      return;
    }
    const generated = crypto.randomBytes(48).toString("base64url");
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretFile, generated, { mode: 0o600 });
    process.env.AUTH_SESSION_SECRET = generated;
    process.env.AUTH_SESSION_SECRET_GENERATED = "true";
  } catch {
    // Read-only checkouts still work for this process; sessions simply reset
    // after a restart.
    process.env.AUTH_SESSION_SECRET = crypto.randomBytes(48).toString("base64url");
    process.env.AUTH_SESSION_SECRET_GENERATED = "memory";
  }
};

ensureDevelopmentSecret();
