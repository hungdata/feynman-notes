import crypto from "node:crypto";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (value, secret) => crypto.createHmac("sha256", secret).update(value).digest("base64url");

const createSignedToken = (payload, secret) => {
  const encodedPayload = encode(payload);
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
};

const readSignedToken = (token, secret) => {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature || !secret) return null;
    const expected = sign(payload, secret);
    const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

export const createSessionToken = (user, secret, now = Date.now()) => {
  return createSignedToken({ ...user, exp: now + 7 * 24 * 60 * 60 * 1000 }, secret);
};

export const readSessionToken = (token, secret, now = Date.now()) => {
  const user = readSignedToken(token, secret);
  if (!user?.exp || user.exp <= now) return null;
  const { exp: _exp, ...profile } = user;
  return profile;
};

export const createDesktopOAuthContext = ({ state, port, nonce }, secret, now = Date.now()) => createSignedToken({
  purpose: "desktop-oauth-context",
  state,
  port,
  nonce,
  exp: now + 10 * 60 * 1000,
}, secret);

export const readDesktopOAuthContext = (token, secret, now = Date.now()) => {
  const context = readSignedToken(token, secret);
  if (context?.purpose !== "desktop-oauth-context" || !context.exp || context.exp <= now) return null;
  if (!Number.isInteger(context.port) || context.port < 1024 || context.port > 65535) return null;
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(context.nonce || "") || !context.state) return null;
  return context;
};

export const createDesktopLoginGrant = (user, nonce, secret, now = Date.now()) => createSignedToken({
  purpose: "desktop-login-grant",
  user,
  nonce,
  jti: crypto.randomUUID(),
  exp: now + 2 * 60 * 1000,
}, secret);

export const readDesktopLoginGrant = (token, secret, now = Date.now()) => {
  const grant = readSignedToken(token, secret);
  if (grant?.purpose !== "desktop-login-grant" || !grant.exp || grant.exp <= now) return null;
  if (!grant.user?.id || !grant.jti || !/^[A-Za-z0-9_-]{20,128}$/.test(grant.nonce || "")) return null;
  return grant;
};

export const parseCookies = (header = "") => Object.fromEntries(header.split(";").map((part) => {
  const index = part.indexOf("=");
  if (index < 0) return ["", ""];
  return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1).trim())];
}).filter(([key]) => key));

export const serializeCookie = (name, value, { maxAge, path = "/", secure = false } = {}) => [
  `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
  `Path=${path}`,
  "HttpOnly",
  "SameSite=Lax",
  secure ? "Secure" : null,
  Number.isFinite(maxAge) ? `Max-Age=${Math.max(0, Math.floor(maxAge))}` : null,
].filter(Boolean).join("; ");

export const createOAuthState = () => crypto.randomBytes(32).toString("base64url");

export const createGuestUser = (id = crypto.randomUUID()) => ({
  id: `guest:${id}`,
  provider: "guest",
  name: "Người dùng thử",
  email: "",
  picture: "",
  isGuest: true,
});

export const statesMatch = (received, stored) => {
  if (!received || !stored || received.length !== stored.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(stored));
};
