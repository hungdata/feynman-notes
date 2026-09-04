import express from "express";
import "../config/env.js";
import { createGuestUser, createOAuthState, createSessionToken, parseCookies, readSessionToken, serializeCookie, statesMatch } from "../auth/session.js";

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";
const baseUrl = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 5051}`).replace(/\/$/, "");
const frontendUrl = (process.env.FRONTEND_URL || (isProduction ? baseUrl : "http://localhost:5173")).replace(/\/$/, "");
const sessionSecret = process.env.AUTH_SESSION_SECRET || "";
const sessionCookie = "feynman_session";

const providerConfig = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && sessionSecret),
  guest: Boolean(sessionSecret),
};

const redirectUri = (provider) => `${baseUrl}/api/auth/${provider}/callback`;
const stateCookie = (provider) => `feynman_oauth_${provider}`;
const appendCookie = (res, cookie) => res.append("Set-Cookie", cookie);
const clearCookie = (res, name, path = "/") => appendCookie(res, serializeCookie(name, "", { maxAge: 0, path, secure: isProduction }));
const loginResult = (res, status, provider, message = "") => {
  const url = new URL(frontendUrl);
  url.searchParams.set("login", status);
  if (provider) url.searchParams.set("provider", provider);
  if (message) url.searchParams.set("message", message);
  res.redirect(url.toString());
};

const beginOAuth = (provider, authorizationUrl, params) => (_req, res) => {
  if (!providerConfig[provider]) return res.status(503).json({ message: `${provider} login is not configured.` });
  const state = createOAuthState();
  appendCookie(res, serializeCookie(stateCookie(provider), state, { maxAge: 600, path: `/api/auth/${provider}/callback`, secure: isProduction }));
  const url = new URL(authorizationUrl);
  Object.entries({ ...params, state }).forEach(([key, value]) => url.searchParams.set(key, value));
  return res.redirect(url.toString());
};

const verifyState = (req, res, provider) => {
  const stored = parseCookies(req.headers.cookie)[stateCookie(provider)];
  clearCookie(res, stateCookie(provider), `/api/auth/${provider}/callback`);
  return statesMatch(String(req.query.state || ""), stored);
};

const finishLogin = (res, profile) => {
  appendCookie(res, serializeCookie(sessionCookie, createSessionToken(profile, sessionSecret), { maxAge: 7 * 24 * 60 * 60, secure: isProduction }));
  loginResult(res, "success", profile.provider);
};

const currentUser = (req) => sessionSecret
  ? readSessionToken(parseCookies(req.headers.cookie)[sessionCookie], sessionSecret)
  : null;

router.get("/providers", (_req, res) => res.json(providerConfig));

router.get("/me", (req, res) => {
  return res.json({ user: currentUser(req) });
});

router.post("/guest", (req, res) => {
  if (!providerConfig.guest) {
    return res.status(503).json({ message: "Chế độ dùng thử chưa được cấu hình." });
  }

  const existingUser = currentUser(req);
  if (existingUser?.provider === "guest") return res.json({ user: existingUser });
  if (existingUser) {
    return res.status(409).json({ message: "Hãy đăng xuất trước khi chuyển sang chế độ dùng thử." });
  }

  const user = createGuestUser();
  appendCookie(res, serializeCookie(sessionCookie, createSessionToken(user, sessionSecret), {
    maxAge: 7 * 24 * 60 * 60,
    secure: isProduction,
  }));
  return res.status(201).json({ user });
});

router.post("/logout", (_req, res) => {
  clearCookie(res, sessionCookie);
  res.status(204).end();
});

router.get("/google", beginOAuth("google", "https://accounts.google.com/o/oauth2/v2/auth", {
  client_id: process.env.GOOGLE_CLIENT_ID || "",
  redirect_uri: redirectUri("google"),
  response_type: "code",
  scope: "openid profile email",
  prompt: "select_account",
}));

router.get("/google/callback", async (req, res) => {
  try {
    if (!providerConfig.google || req.query.error || !req.query.code || !verifyState(req, res, "google")) return loginResult(res, "error", "google", "Đăng nhập Google không thành công.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: String(req.query.code), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri("google"), grant_type: "authorization_code" }),
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens = await tokenResponse.json();
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) throw new Error("Google profile request failed");
    const profile = await profileResponse.json();
    if (!profile.sub || !profile.email_verified) throw new Error("Google account is not verified");
    return finishLogin(res, { id: `google:${profile.sub}`, provider: "google", name: profile.name || profile.email, email: profile.email || "", picture: profile.picture || "" });
  } catch (error) {
    console.error("Google OAuth error:", error.message);
    return loginResult(res, "error", "google", "Không thể xác thực tài khoản Google.");
  }
});

export default router;
