import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BackupIncompleteError, backupOwner, runCli, sha256, startDesktopAuthentication, validateAssetUrl, validateOrigin } from "./backup-remote.mjs";

const user = { id: "google:test-owner", provider: "google", name: "Test Owner", email: "owner@example.invalid" };
const sessionCookie = "feynman_session=do-not-print-this-session";
const assetId = "12345678-1234-4234-8234-123456789012";
const binary = Buffer.from("private-image-bytes");
const nonce = "local_test_nonce_abcdefghijklmnopqrstuvwxyz";

const setup = async (t, override = () => false) => {
  const requests = [];
  const maps = { documents: [
    { id: "map-one", title: "One", favorite: true, folder: "Books", nodes: [{ id: "image", data: { assetId } }, { id: "topic", data: { imageAssetId: assetId } }] },
    { id: "map-trash", title: "Trash", trashedAt: "2026-11-01T00:00:00.000Z", nodes: [] },
  ] };
  const tasks = { tasks: [{ _id: "uuid-task", title: "Read", status: "completed", completedAt: "2026-11-01", createdAt: "2026-10-01" }], activeCount: 0, completedCount: 1 };
  const send = (response, value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    requests.push({ method: request.method, path: url.pathname, search: url.search, cookie: request.headers.cookie });
    if (override({ request, response, url, send, maps, tasks, requests })) return;
    if (url.pathname === "/api/auth/desktop/consume") {
      response.writeHead(302, { "Set-Cookie": `${sessionCookie}; Path=/; HttpOnly; SameSite=Lax`, Location: "/?login=success" }); response.end(); return;
    }
    if (request.headers.cookie !== sessionCookie) { send(response, { message: "secret response must not be logged" }, 401); return; }
    if (url.pathname === "/api/auth/me") { send(response, { user }); return; }
    if (url.pathname === "/api/mindmaps") { send(response, maps); return; }
    if (url.pathname === "/api/tasks") { send(response, tasks); return; }
    if (url.pathname === "/api/campus/profile") { send(response, { profile: { id: "public-profile-id", name: "Mây", gender: "female" } }); return; }
    if (url.pathname === "/api/courses") { send(response, { courses: [], learner: { xp: 0, streak: 0, bestStreak: 0, lastDay: "", days: {}, dailyGoal: 30, today: 0 } }); return; }
    if (url.pathname === "/api/ai/conversations") { send(response, { conversations: [] }); return; }
    if (url.pathname === `/api/assets/images/${assetId}`) { response.writeHead(200, { "Content-Type": "image/png" }); response.end(binary); return; }
    send(response, { message: "not found" }, 404);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "feynman-backup-test-"));
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fs.rm(temporary, { recursive: true, force: true }); });
  return { origin: `http://127.0.0.1:${server.address().port}`, outputDir: path.join(temporary, "backup"), temporary, maps, tasks, requests };
};

test("origin/asset checks refuse remote HTTP, credentials and off-site asset URLs", () => {
  assert.equal(validateOrigin("https://example.test/"), "https://example.test");
  assert.equal(validateOrigin("http://127.0.0.1:5051"), "http://127.0.0.1:5051");
  for (const origin of ["http://example.test", "https://user:secret@example.test", "https://example.test/path", "https://example.test/?token=secret"]) assert.throws(() => validateOrigin(origin));
  assert.equal(validateAssetUrl(`/api/assets/images/${assetId}`, "https://example.test").origin, "https://example.test");
  for (const value of [`https://elsewhere.test/api/assets/images/${assetId}`, `//elsewhere.test/api/assets/images/${assetId}`, "data:image/png;base64,eA==", "/api/assets/images/../auth/me"]) assert.throws(() => validateAssetUrl(value, "https://example.test"));
});

test("desktop OAuth ignores bad nonce/path/method, consumes one grant manually and verifies the owner", async (t) => {
  const context = await setup(t);
  const observedRedirects = [];
  const login = await startDesktopAuthentication({ origin: context.origin, nonce, fetchImpl: (url, options) => { observedRedirects.push(options.redirect); return fetch(url, options); } });
  t.after(() => login.close());
  const url = new URL(login.loginUrl);
  assert.equal(url.pathname, "/api/auth/google");
  const callback = new URL(`http://127.0.0.1:${url.searchParams.get("desktop_port")}/oauth/callback`);
  callback.searchParams.set("desktop_nonce", "incorrect_nonce_abcdefghijklmnopqrstuvwxyz");
  callback.searchParams.set("grant", "test.signed.grant");
  assert.equal((await fetch(callback)).status, 400);
  callback.searchParams.set("desktop_nonce", nonce);
  assert.equal((await fetch(callback, { method: "POST" })).status, 405);
  const wrongPath = new URL(callback); wrongPath.pathname = "/other";
  assert.equal((await fetch(wrongPath)).status, 404);
  assert.equal(context.requests.filter((request) => request.path === "/api/auth/desktop/consume").length, 0);
  assert.equal((await fetch(callback)).status, 200);
  const authenticated = await login.result;
  assert.equal(authenticated.cookie, sessionCookie);
  assert.equal(authenticated.user.id, user.id);
  assert.equal(context.requests.filter((request) => request.path === "/api/auth/desktop/consume").length, 1);
  assert.ok(observedRedirects.every((value) => value === "manual"));
});

test("desktop authentication has a bounded timeout and closes its listener", async () => {
  const login = await startDesktopAuthentication({ origin: "http://127.0.0.1:1", timeoutMs: 25, nonce });
  const url = new URL(login.loginUrl);
  await assert.rejects(login.result, (error) => error.code === "AUTH_TIMEOUT");
  await assert.rejects(fetch(`http://127.0.0.1:${url.searchParams.get("desktop_port")}/oauth/callback`));
});

test("complete exposed-owner backup is GET-only, includes trash, deduplicates binaries and protects files", async (t) => {
  const context = await setup(t);
  const result = await backupOwner({ ...context, cookie: sessionCookie, user });
  assert.equal(result.manifest.status, "COMPLETE_FOR_EXPOSED_OWNER_DATA");
  assert.equal(result.manifest.serverWideBackup, false);
  assert.equal(result.manifest.fullFilesystemBackup, false);
  assert.deepEqual(result.manifest.counts, { maps: 2, trashedMaps: 1, assets: 1, tasks: 1, courses: 0, conversations: 0, messages: 0, profiles: 1 });
  assert.ok(context.requests.every((request) => request.method === "GET"));
  assert.equal(context.requests.filter((request) => request.path.includes("/api/assets/images/")).length, 1);
  assert.equal((await fs.stat(context.outputDir)).mode & 0o777, 0o700);
  for (const file of result.manifest.files) {
    const bytes = await fs.readFile(path.join(context.outputDir, file.path));
    assert.equal(sha256(bytes), file.sha256);
    assert.equal(bytes.length, file.bytes);
    assert.equal((await fs.stat(path.join(context.outputDir, file.path))).mode & 0o777, 0o600);
    assert.ok(!bytes.includes(Buffer.from("do-not-print-this-session")));
  }
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(context.outputDir, "mindmaps.json"), "utf8")), context.maps);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(context.outputDir, "tasks.json"), "utf8")), context.tasks);
  assert.deepEqual(await fs.readFile(path.join(context.outputDir, `assets/${assetId}.bin`)), binary);
  assert.equal((await fs.stat(result.manifestPath)).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(result.manifest), /do-not-print-this-session/);
});

test("course source gaps and UUID conversation errors remain INCOMPLETE; lastDay preserves raw streak", async (t) => {
  const lastDay = "2026-10-01";
  const context = await setup(t, ({ url, response, send }) => {
    if (url.pathname === "/api/courses") {
      send(response, { courses: [{ id: "course-one", title: "Book" }], learner: { xp: 100, streak: url.searchParams.get("day") === lastDay ? 7 : 0, bestStreak: 7, lastDay, days: { [lastDay]: 10 }, dailyGoal: 30, today: 10 } }); return true;
    }
    if (url.pathname === "/api/courses/course-one") { send(response, { course: { id: "course-one", stages: [] }, progress: { id: "course-one", lessons: {} } }); return true; }
    if (url.pathname === "/api/ai/conversations") { send(response, { conversations: url.searchParams.get("documentId") === "map-one" ? [{ _id: "12345678-1234-4234-8234-123456789012", documentId: "map-one" }] : [] }); return true; }
    if (url.pathname.endsWith("/messages")) { send(response, { message: "do-not-print-this-session signed.grant.secret" }, 400); return true; }
    return false;
  });
  await assert.rejects(backupOwner({ ...context, cookie: sessionCookie, user }), BackupIncompleteError);
  const manifest = JSON.parse(await fs.readFile(path.join(context.outputDir, "manifest.json"), "utf8"));
  assert.equal(manifest.status, "INCOMPLETE");
  assert.ok(manifest.gaps.some((gap) => gap.domain === "courseSources" && gap.code === "NOT_EXPOSED_BY_EXISTING_API"));
  assert.ok(manifest.gaps.some((gap) => gap.domain === "history" && gap.status === 400));
  assert.doesNotMatch(JSON.stringify(manifest), /signed\.grant\.secret|do-not-print-this-session/);
  const learner = JSON.parse(await fs.readFile(path.join(context.outputDir, "learner.json"), "utf8"));
  assert.equal(learner.streak, 7);
  assert.equal("today" in learner, false);
});

test("AI API caps are explicit gaps rather than silently complete history", async (t) => {
  const ids = Array.from({ length: 50 }, (_, index) => index.toString(16).padStart(24, "0"));
  const context = await setup(t, ({ url, response, send }) => {
    if (url.pathname === "/api/ai/conversations") { send(response, { conversations: url.searchParams.get("documentId") === "map-one" ? ids.map((_id) => ({ _id, documentId: "map-one" })) : [] }); return true; }
    if (url.pathname.endsWith("/messages")) { send(response, { conversation: { _id: url.pathname.split("/")[4] }, messages: url.pathname.includes(ids[0]) ? Array.from({ length: 200 }, (_, index) => ({ role: "user", content: `Message ${index}` })) : [] }); return true; }
    return false;
  });
  await assert.rejects(backupOwner({ ...context, cookie: sessionCookie, user }), BackupIncompleteError);
  const manifest = JSON.parse(await fs.readFile(path.join(context.outputDir, "manifest.json"), "utf8"));
  assert.equal(manifest.counts.conversations, 50);
  assert.equal(manifest.counts.messages, 200);
  assert.ok(manifest.gaps.some((gap) => gap.code === "CONVERSATION_LIMIT_REACHED"));
  assert.ok(manifest.gaps.some((gap) => gap.code === "MESSAGE_LIMIT_REACHED"));
});

test("failed binary requests and concurrent edits are recorded and block strict completion", async (t) => {
  let mapReads = 0;
  const context = await setup(t, ({ url, response, send, maps }) => {
    if (url.pathname.includes("/api/assets/images/")) { send(response, { message: "do-not-print-this-session" }, 404); return true; }
    if (url.pathname === "/api/mindmaps" && ++mapReads === 2) { send(response, { documents: [...maps.documents, { id: "created-during-backup", nodes: [] }] }); return true; }
    return false;
  });
  await assert.rejects(backupOwner({ ...context, cookie: sessionCookie, user }), BackupIncompleteError);
  const manifest = JSON.parse(await fs.readFile(path.join(context.outputDir, "manifest.json"), "utf8"));
  assert.ok(manifest.gaps.some((gap) => gap.domain === "assets" && gap.status === 404));
  assert.ok(manifest.gaps.some((gap) => gap.domain === "maps" && gap.code === "SNAPSHOT_CHANGED"));
  assert.equal(manifest.counts.assets, 0);
  assert.doesNotMatch(JSON.stringify(manifest), /do-not-print-this-session/);
});

test("invalid JSON shapes and a different authenticated owner fail closed", async (t) => {
  const context = await setup(t, ({ url, response, send }) => {
    if (url.pathname === "/api/auth/me") { send(response, { user: { ...user, id: "google:someone-else" } }); return true; }
    return false;
  });
  await assert.rejects(backupOwner({ ...context, cookie: sessionCookie, user }), BackupIncompleteError);
  assert.deepEqual(context.requests.map((request) => request.path), ["/api/auth/me"]);
  const second = await setup(t, ({ url, response, send }) => {
    if (url.pathname === "/api/tasks") { send(response, null); return true; }
    return false;
  });
  await assert.rejects(backupOwner({ ...second, cookie: sessionCookie, user }), BackupIncompleteError);
  const manifest = JSON.parse(await fs.readFile(path.join(second.outputDir, "manifest.json"), "utf8"));
  assert.ok(manifest.gaps.some((gap) => gap.domain === "tasks" && gap.code === "INVALID_RESPONSE"));
});

test("existing backup contents are never overwritten or chmodded and --help needs no network", async (t) => {
  const context = await setup(t);
  await fs.mkdir(context.outputDir, { mode: 0o755 });
  await fs.chmod(context.outputDir, 0o755);
  await fs.writeFile(path.join(context.outputDir, "keep.txt"), "keep");
  await assert.rejects(backupOwner({ ...context, cookie: sessionCookie, user }), (error) => error.code === "OUTPUT_NOT_EMPTY");
  assert.equal((await fs.stat(context.outputDir)).mode & 0o777, 0o755);
  assert.equal(await fs.readFile(path.join(context.outputDir, "keep.txt"), "utf8"), "keep");
  const output = [];
  assert.equal(await runCli(["--help"], { stdout: (value) => output.push(value) }), 0);
  assert.match(output.join("\n"), /GET-only/);
  assert.match(output.join("\n"), /Exit 2/);
  assert.equal(context.requests.length, 0);
});
