import test from "node:test";
import assert from "node:assert/strict";
import { createGuestUser, createSessionToken, parseCookies, readSessionToken, serializeCookie, statesMatch } from "./session.js";

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
