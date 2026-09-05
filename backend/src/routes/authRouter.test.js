import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDesktopLoginGrant } from "../auth/session.js";

const secret = "desktop-router-integration-test-secret";
process.env.AUTH_SESSION_SECRET = secret;
process.env.APP_BASE_URL = "http://127.0.0.1:5051";
process.env.FRONTEND_URL = "https://app.example.test";
const { default: authRouter } = await import("./authRouter.js");

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});

test("desktop login grant is consumed once and creates an HttpOnly session", async (t) => {
  const app = express();
  app.use("/api/auth", authRouter);
  const server = await listen(app);
  t.after(() => server.close());

  const address = server.address();
  const nonce = "abcdefghijklmnopqrstuvwxyz123456";
  const grant = createDesktopLoginGrant({
    id: "google:desktop-user",
    provider: "google",
    name: "Desktop User",
    email: "desktop@example.test",
  }, nonce, secret);
  const url = new URL(`http://127.0.0.1:${address.port}/api/auth/desktop/consume`);
  url.searchParams.set("grant", grant);
  url.searchParams.set("desktop_nonce", nonce);

  const first = await fetch(url, { redirect: "manual" });
  assert.equal(first.status, 302);
  assert.match(first.headers.get("location"), /^https:\/\/app\.example\.test\/?\?login=success/);
  assert.match(first.headers.get("set-cookie"), /feynman_session=/);
  assert.match(first.headers.get("set-cookie"), /HttpOnly/);

  const replay = await fetch(url, { redirect: "manual" });
  assert.equal(replay.status, 302);
  assert.match(replay.headers.get("location"), /login=error/);
  assert.equal(replay.headers.get("set-cookie"), null);
});
