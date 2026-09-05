import test from "node:test";
import assert from "node:assert/strict";
import {
  createDesktopLoginGrant,
  createDesktopOAuthContext,
  createGuestUser,
  createSessionToken,
  parseCookies,
  readDesktopLoginGrant,
  readDesktopOAuthContext,
  readSessionToken,
  serializeCookie,
  statesMatch,
} from "./session.js";

test("signed sessions round trip and reject tampering or expiry", () => {
  const token = createSessionToken({ id: "g:1", name: "Test" }, "a-very-long-test-secret", 1000);
  assert.equal(readSessionToken(token, "a-very-long-test-secret", 2000).id, "g:1");
  assert.equal(readSessionToken(`${token}x`, "a-very-long-test-secret", 2000), null);
  assert.equal(readSessionToken(token, "a-very-long-test-secret", 700_000_000), null);
});

test("cookies are HttpOnly, SameSite protected, and parse safely", () => {
  const cookie = serializeCookie("feynman_session", "signed.value", { maxAge: 60, secure: true });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookies("a=1; feynman_session=signed.value").feynman_session, "signed.value");
});

test("OAuth state comparison rejects mismatches", () => {
  assert.equal(statesMatch("same", "same"), true);
  assert.equal(statesMatch("one", "two"), false);
  assert.equal(statesMatch("", ""), false);
});

test("guest users receive an isolated, non-guessable owner id", () => {
  const first = createGuestUser("11111111-1111-4111-8111-111111111111");
  const second = createGuestUser("22222222-2222-4222-8222-222222222222");

  assert.equal(first.provider, "guest");
  assert.equal(first.isGuest, true);
  assert.match(first.id, /^guest:/);
  assert.notEqual(first.id, second.id);
});

test("desktop OAuth context is signed, short-lived, and validates loopback input", () => {
  const input = { state: "oauth-state", port: 43123, nonce: "abcdefghijklmnopqrstuvwxyz123456" };
  const token = createDesktopOAuthContext(input, "desktop-test-secret", 1000);
  const context = readDesktopOAuthContext(token, "desktop-test-secret", 2000);

  assert.deepEqual({ state: context.state, port: context.port, nonce: context.nonce }, input);
  assert.equal(readDesktopOAuthContext(token, "wrong-secret", 2000), null);
  assert.equal(readDesktopOAuthContext(token, "desktop-test-secret", 700_000), null);
  assert.equal(readDesktopOAuthContext(createDesktopOAuthContext({ ...input, port: 80 }, "desktop-test-secret", 1000), "desktop-test-secret", 2000), null);
});

test("desktop login grants carry a verified user and expire quickly", () => {
  const nonce = "abcdefghijklmnopqrstuvwxyz123456";
  const user = { id: "google:123", provider: "google", name: "Test" };
  const token = createDesktopLoginGrant(user, nonce, "desktop-test-secret", 1000);
  const grant = readDesktopLoginGrant(token, "desktop-test-secret", 2000);

  assert.equal(grant.user.id, user.id);
  assert.equal(grant.nonce, nonce);
  assert.ok(grant.jti);
  assert.equal(readDesktopLoginGrant(token, "desktop-test-secret", 122_000), null);
});
