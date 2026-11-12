import "../config/env.js";

/**
 * "Local mode" lets one person use the app on their own computer without
 * creating an account: requests that come straight from this machine are
 * treated as the same private owner, so maps never disappear when a guest
 * cookie expires.
 *
 * It is deliberately narrow:
 * - never in production (`NODE_ENV=production`),
 * - only for requests whose socket is the loopback interface and that did not
 *   pass through a reverse proxy (no X-Forwarded-For / Forwarded header),
 * - `LOCAL_MODE=off` disables it, `LOCAL_MODE=on` keeps it even when Google
 *   login is configured (still loopback-only and never in production).
 */
export const LOCAL_USER = Object.freeze({
  id: "local:owner",
  provider: "local",
  name: "Máy của bạn",
  email: "",
  picture: "",
  isLocal: true,
});

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export const isLocalModeEnabled = (env = process.env) => {
  const setting = String(env.LOCAL_MODE || "auto").trim().toLowerCase();
  if (env.NODE_ENV === "production" || ["off", "false", "0", "no"].includes(setting)) return false;
  if (["on", "true", "1", "yes"].includes(setting)) return true;
  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return !googleConfigured;
};

export const isLoopbackRequest = (req) => {
  const address = req?.socket?.remoteAddress || "";
  const headers = req?.headers || {};
  if (headers["x-forwarded-for"] || headers.forwarded || headers["x-real-ip"]) return false;
  return LOOPBACK_ADDRESSES.has(address);
};

export const localUserFor = (req, env = process.env) =>
  isLocalModeEnabled(env) && isLoopbackRequest(req) ? { ...LOCAL_USER } : null;
