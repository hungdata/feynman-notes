import crypto from "node:crypto";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (value, secret) => crypto.createHmac("sha256", secret).update(value).digest("base64url");

export const createSessionToken = (user, secret, now = Date.now()) => {
  const payload = encode({ ...user, exp: now + 7 * 24 * 60 * 60 * 1000 });
  return `${payload}.${sign(payload, secret)}`;
};

export const readSessionToken = (token, secret, now = Date.now()) => {
  try {
    const [payload, signature] = String(token || "").split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload, secret);
    const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return null;
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!user.exp || user.exp <= now) return null;
    const { exp: _exp, ...profile } = user;
    return profile;
  } catch {
    return null;
  }
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
