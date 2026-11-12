#!/usr/bin/env node
/** Read-only logical backup of one authenticated account. No migration or deployment. */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE = /^[A-Za-z0-9_-]{20,128}$/;
const MAX_JSON_BYTES = 128 * 1024 * 1024;
const MAX_ASSET_BYTES = 13 * 1024 * 1024;
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export class BackupError extends Error {
  constructor(message, code = "BACKUP_FAILED", status) {
    super(message);
    this.name = "BackupError";
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

export class BackupIncompleteError extends BackupError {
  constructor(manifestPath) {
    super("Backup is incomplete. Review its private manifest before any migration.", "BACKUP_INCOMPLETE");
    this.manifestPath = manifestPath;
  }
}

export const validateOrigin = (input) => {
  let url;
  try { url = new URL(input); } catch { throw new BackupError("Provide a valid app origin.", "INVALID_ORIGIN"); }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password
    || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new BackupError("Use an HTTPS app origin; HTTP is allowed only for local tests.", "INVALID_ORIGIN");
  }
  return url.origin;
};

export const validateAssetUrl = (input, origin) => {
  const base = validateOrigin(origin);
  let url;
  try { url = new URL(input, `${base}/`); } catch { throw new BackupError("Invalid asset reference.", "INVALID_ASSET_URL"); }
  const match = url.pathname.match(/^\/api\/assets\/images\/([^/]+)$/);
  if (url.origin !== base || url.username || url.password || url.search || url.hash || !match || !UUID.test(match[1])) {
    throw new BackupError("Asset references must remain on the app origin.", "INVALID_ASSET_URL");
  }
  return url;
};

const readBody = async (response, limit) => {
  const announced = Number(response.headers.get("content-length"));
  if (Number.isFinite(announced) && announced > limit) throw new BackupError("Response exceeds the backup limit.", "RESPONSE_TOO_LARGE");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const pieces = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.length;
      if (total > limit) throw new BackupError("Response exceeds the backup limit.", "RESPONSE_TOO_LARGE");
      pieces.push(Buffer.from(result.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(pieces);
};

const createReader = ({ origin, cookie, fetchImpl = fetch, requestTimeoutMs = 30_000 }) => {
  const base = validateOrigin(origin);
  return async (route, { binary = false } = {}) => {
    const url = new URL(route, `${base}/`);
    if (url.origin !== base || url.username || url.password) throw new BackupError("Cross-origin backup request refused.", "INVALID_ORIGIN");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET", redirect: "manual", signal: controller.signal,
        headers: { Cookie: cookie, Accept: binary ? "*/*" : "application/json" },
      });
      // Do not reflect server bodies or fetch error messages: they can contain credentials.
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new BackupError("A backup endpoint failed.", "HTTP_ERROR", response.status); }
      const bytes = await readBody(response, binary ? MAX_ASSET_BYTES : MAX_JSON_BYTES);
      if (binary) return { bytes, contentType: response.headers.get("content-type") || "application/octet-stream" };
      try {
        const value = JSON.parse(bytes.toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unexpected JSON shape");
        return value;
      } catch { throw new BackupError("A backup endpoint returned invalid JSON.", "INVALID_RESPONSE"); }
    } catch (error) {
      if (error instanceof BackupError) throw error;
      throw new BackupError("A backup request could not complete.", controller.signal.aborted ? "REQUEST_TIMEOUT" : "NETWORK_ERROR");
    } finally { clearTimeout(timer); }
  };
};

const sessionCookieFrom = (headers) => {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") || ""];
  for (const value of values) {
    const match = value.match(/(?:^|,\s*)feynman_session=([^;,\s]+)/);
    if (match?.[1]) return `feynman_session=${match[1]}`;
  }
  throw new BackupError("The app did not issue a session.", "AUTH_COOKIE_MISSING");
};

/** Normal, existing desktop OAuth: the browser signs in; this new client consumes its own grant. */
export const startDesktopAuthentication = async ({
  origin, fetchImpl = fetch, timeoutMs = 10 * 60_000, requestTimeoutMs = 30_000,
  nonce = crypto.randomBytes(32).toString("base64url"),
} = {}) => {
  const base = validateOrigin(origin);
  if (!NONCE.test(nonce)) throw new BackupError("Invalid local authentication nonce.", "INVALID_NONCE");
  let settle;
  let reject;
  let claiming = false;
  let closed = false;
  let timer;
  const result = new Promise((resolve, fail) => { settle = resolve; reject = fail; });
  // The caller can attach its handler after receiving loginUrl without an unhandled timeout.
  void result.catch(() => {});
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections?.();
  };
  const fail = (error) => { close(); reject(error); };
  const server = http.createServer(async (request, response) => {
    let callback;
    try { callback = new URL(request.url || "/", "http://127.0.0.1"); } catch { response.writeHead(400).end(); return; }
    if (callback.pathname !== "/oauth/callback") { response.writeHead(404).end(); return; }
    if (request.method !== "GET") { response.writeHead(405, { Allow: "GET" }).end(); return; }
    const returned = callback.searchParams.get("desktop_nonce") || "";
    if (!NONCE.test(returned) || Buffer.byteLength(returned) !== Buffer.byteLength(nonce)
      || !crypto.timingSafeEqual(Buffer.from(returned), Buffer.from(nonce))) {
      response.writeHead(400).end("Invalid local authentication response.");
      return;
    }
    if (claiming || closed) { response.writeHead(409).end(); return; }
    if (callback.searchParams.has("error")) {
      response.writeHead(400).end("Google sign-in did not finish.");
      fail(new BackupError("Google sign-in did not finish.", "AUTH_DECLINED"));
      return;
    }
    const grant = callback.searchParams.get("grant") || "";
    if (!grant || grant.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(grant)) { response.writeHead(400).end("Invalid local authentication response."); return; }
    claiming = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const consumeUrl = new URL("/api/auth/desktop/consume", base);
      consumeUrl.searchParams.set("grant", grant);
      consumeUrl.searchParams.set("desktop_nonce", nonce);
      const consumed = await fetchImpl(consumeUrl, { method: "GET", redirect: "manual", signal: controller.signal });
      if (consumed.status !== 302) throw new BackupError("The sign-in grant could not be consumed.", "AUTH_GRANT_REJECTED");
      const cookie = sessionCookieFrom(consumed.headers);
      await consumed.body?.cancel().catch(() => {});
      const read = createReader({ origin: base, cookie, fetchImpl, requestTimeoutMs });
      const account = await read("/api/auth/me");
      if (!account.user?.id || account.user.provider !== "google" || !account.user.id.startsWith("google:")) {
        throw new BackupError("The app did not validate a Google account.", "AUTH_OWNER_INVALID");
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
      response.end("<!doctype html><meta charset='utf-8'><title>Đăng nhập hoàn tất</title><p>Đăng nhập hoàn tất. Bạn có thể quay lại tiến trình sao lưu.</p>");
      close();
      settle({ cookie, user: account.user });
    } catch (error) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }).end("Sign-in verification failed. Return to the backup process.");
      fail(error instanceof BackupError ? error : new BackupError("Sign-in verification failed.", "AUTH_FAILED"));
    } finally { clearTimeout(deadline); }
  });
  await new Promise((resolve, failListen) => {
    server.once("error", () => failListen(new BackupError("Could not open the local sign-in callback.", "AUTH_LISTEN_FAILED")));
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const loginUrl = new URL("/api/auth/google", base);
  loginUrl.searchParams.set("desktop_port", String(address.port));
  loginUrl.searchParams.set("desktop_nonce", nonce);
  timer = setTimeout(() => fail(new BackupError("Google sign-in timed out.", "AUTH_TIMEOUT")), timeoutMs);
  return {
    loginUrl: loginUrl.toString(), result,
    close: () => fail(new BackupError("Local sign-in was canceled.", "AUTH_CANCELED")),
  };
};

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};
const fingerprint = (value) => sha256(JSON.stringify(canonical(value)));
const defaultOutput = () => path.join(os.homedir(), ".codex", "backups", "feynman-notes", `remote-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`);
const safeId = (value) => typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);

export const backupOwner = async ({
  origin, cookie, user, outputDir = defaultOutput(), strict = true, fetchImpl = fetch, requestTimeoutMs = 30_000,
} = {}) => {
  const base = validateOrigin(origin);
  if (!cookie || !user?.id || user.provider !== "google") throw new BackupError("A validated Google session is required.", "AUTH_REQUIRED");
  const target = path.resolve(outputDir);
  const previous = await fs.lstat(target).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink())) throw new BackupError("Choose a new empty backup directory.", "INVALID_OUTPUT_PATH");
  if (previous && (await fs.readdir(target)).length) throw new BackupError("Choose a new empty backup directory.", "OUTPUT_NOT_EMPTY");
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  await fs.chmod(target, 0o700);
  const read = createReader({ origin: base, cookie, fetchImpl, requestTimeoutMs });
  const manifest = {
    format: "feynman-remote-owner-backup/v1", origin: base, startedAt: new Date().toISOString(),
    owner: { id: user.id, provider: user.provider }, status: "IN_PROGRESS",
    scope: "One authenticated owner's data exposed by the existing read-only APIs",
    serverWideBackup: false, fullFilesystemBackup: false,
    boundaries: ["Other accounts are not exported.", "Unreferenced assets cannot be enumerated by the API.", "Browser-only settings and legacy local caches are not included."],
    coverage: {}, counts: { maps: 0, trashedMaps: 0, assets: 0, tasks: 0, courses: 0, conversations: 0, messages: 0, profiles: 0 },
    gaps: [], files: [],
  };
  const gap = (domain, code, route, status) => {
    manifest.gaps.push({ domain, code, ...(route ? { route } : {}), ...(status !== undefined ? { status } : {}) });
  };
  const write = async (name, data, binary = false) => {
    const destination = path.join(target, name);
    if (!destination.startsWith(`${target}${path.sep}`)) throw new BackupError("Unsafe backup filename refused.", "INVALID_OUTPUT_PATH");
    const directory = path.dirname(destination);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    const bytes = binary ? data : Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
    await fs.writeFile(destination, bytes, { mode: 0o600, flag: "wx" });
    await fs.chmod(destination, 0o600);
    manifest.files.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
  };
  const obtain = async (domain, route, options) => {
    try { return await read(route, options); }
    catch (error) { gap(domain, error.code || "READ_FAILED", route, error.status); return null; }
  };
  // Revalidate ownership rather than trusting a decoded grant or a supplied account label.
  const verified = await obtain("account", "/api/auth/me");
  if (!verified?.user || verified.user.id !== user.id || verified.user.provider !== "google") {
    gap("account", "OWNER_MISMATCH");
  } else {
    const { id, provider, name, email, picture } = verified.user;
    await write("account.json", { id, provider, name, email, picture });
    manifest.coverage.account = "verified";
  }
  if (!manifest.gaps.length) {
    const mapsResponse = await obtain("maps", "/api/mindmaps");
    const maps = Array.isArray(mapsResponse?.documents) ? mapsResponse.documents : null;
    if (!maps && mapsResponse) gap("maps", "INVALID_RESPONSE", "/api/mindmaps");
    if (maps) {
      manifest.counts.maps = maps.length;
      manifest.counts.trashedMaps = maps.filter((item) => item.trashedAt).length;
      await write("mindmaps.json", mapsResponse);
      manifest.coverage.maps = "all returned documents including trash";
      const assetIds = new Set();
      for (const document of maps) for (const node of document.nodes || []) {
        for (const value of [node.data?.assetId, node.data?.imageAssetId]) {
          if (!value) continue;
          if (typeof value !== "string" || !UUID.test(value)) gap("assets", "INVALID_ASSET_REFERENCE");
          else assetIds.add(value.toLowerCase());
        }
      }
      const assetIndex = [];
      for (const id of assetIds) {
        const url = validateAssetUrl(`/api/assets/images/${id}`, base);
        const asset = await obtain("assets", url.pathname, { binary: true });
        if (!asset) continue;
        const name = `assets/${id}.bin`;
        await write(name, asset.bytes, true);
        assetIndex.push({ id, path: name, contentType: asset.contentType, bytes: asset.bytes.length, sha256: sha256(asset.bytes) });
      }
      await write("assets.json", { assets: assetIndex });
      manifest.counts.assets = assetIndex.length;
      manifest.coverage.assets = { referenced: assetIds.size, downloaded: assetIndex.length, originalMetadata: "Only fields already present in the map and HTTP headers are available." };
    }

    const tasks = await obtain("tasks", "/api/tasks");
    if (tasks && !Array.isArray(tasks.tasks)) gap("tasks", "INVALID_RESPONSE", "/api/tasks");
    if (Array.isArray(tasks?.tasks)) { await write("tasks.json", tasks); manifest.counts.tasks = tasks.tasks.length; manifest.coverage.tasks = "all returned tasks with original fields"; }

    const profile = await obtain("profile", "/api/campus/profile");
    if (profile && Object.hasOwn(profile, "profile")) { await write("profile.json", profile); manifest.counts.profiles = profile.profile ? 1 : 0; manifest.coverage.profile = "own public profile; internal timestamps are not exposed"; }
    else if (profile) gap("profile", "INVALID_RESPONSE", "/api/campus/profile");

    const courseList = await obtain("courses", "/api/courses");
    if (courseList && !Array.isArray(courseList.courses)) gap("courses", "INVALID_RESPONSE", "/api/courses");
    if (Array.isArray(courseList?.courses)) {
      await write("courses.json", courseList);
      manifest.counts.courses = courseList.courses.length;
      const courseIndex = [];
      for (const summary of courseList.courses) {
        if (!safeId(summary.id)) { gap("courses", "INVALID_COURSE_REFERENCE"); continue; }
        const route = `/api/courses/${encodeURIComponent(summary.id)}`;
        const course = await obtain("courses", route);
        if (!course?.course || !course.progress) { if (course) gap("courses", "INVALID_RESPONSE", route); continue; }
        const name = `courses/${sha256(summary.id).slice(0, 24)}.json`;
        await write(name, course);
        courseIndex.push({ id: summary.id, path: name });
      }
      await write("course-index.json", { courses: courseIndex });
      manifest.coverage.courses = { listed: courseList.courses.length, downloaded: courseIndex.length };
      if (courseList.courses.length) {
        gap("courseSources", "NOT_EXPOSED_BY_EXISTING_API");
        manifest.coverage.courseSources = "missing: extracted original chapter text has no export endpoint";
      } else manifest.coverage.courseSources = "no courses listed for this owner; orphaned sources cannot be enumerated";
      let learner = courseList.learner;
      if (/^\d{4}-\d{2}-\d{2}$/.test(learner?.lastDay || "")) {
        const raw = await obtain("learner", `/api/courses?day=${encodeURIComponent(learner.lastDay)}`);
        if (raw?.learner && raw.learner.lastDay === learner.lastDay) learner = raw.learner;
        else if (raw) gap("learner", "SNAPSHOT_CHANGED");
      }
      if (learner && typeof learner === "object") {
        const { today: _today, ...storedFields } = learner;
        await write("learner.json", storedFields);
        manifest.coverage.learner = "public fields; requested last active day to preserve stored streak";
      } else gap("learner", "INVALID_RESPONSE", "/api/courses");
    }

    const historyIndex = [];
    for (const document of maps || []) {
      if (!safeId(document.id)) { gap("history", "INVALID_MAP_REFERENCE"); continue; }
      const route = `/api/ai/conversations?documentId=${encodeURIComponent(document.id)}`;
      const history = await obtain("history", route);
      if (!Array.isArray(history?.conversations)) { if (history) gap("history", "INVALID_RESPONSE", route); continue; }
      if (history.conversations.length >= 50) gap("history", "CONVERSATION_LIMIT_REACHED", route);
      manifest.counts.conversations += history.conversations.length;
      const messages = [];
      for (const conversation of history.conversations) {
        if (!safeId(conversation._id)) { gap("history", "INVALID_CONVERSATION_REFERENCE"); continue; }
        const messageRoute = `/api/ai/conversations/${encodeURIComponent(conversation._id)}/messages`;
        const result = await obtain("history", messageRoute);
        if (!Array.isArray(result?.messages)) { if (result) gap("history", "INVALID_RESPONSE", messageRoute); continue; }
        if (result.messages.length >= 200) gap("history", "MESSAGE_LIMIT_REACHED", messageRoute);
        manifest.counts.messages += result.messages.length;
        messages.push(result);
      }
      const name = `history/${sha256(document.id).slice(0, 24)}.json`;
      await write(name, { documentId: document.id, conversations: history.conversations, messages });
      historyIndex.push({ documentId: document.id, path: name });
    }
    await write("history-index.json", { history: historyIndex });
    manifest.coverage.history = "only records exposed by existing APIs; no pagination beyond their caps";

    // A logical backup is not a filesystem snapshot. Detect edits during collection.
    if (mapsResponse) {
      const again = await obtain("maps", "/api/mindmaps");
      if (again && fingerprint(again) !== fingerprint(mapsResponse)) gap("maps", "SNAPSHOT_CHANGED");
    }
    if (tasks) {
      const again = await obtain("tasks", "/api/tasks");
      if (again && fingerprint(again) !== fingerprint(tasks)) gap("tasks", "SNAPSHOT_CHANGED");
    }
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.status = manifest.gaps.length ? "INCOMPLETE" : "COMPLETE_FOR_EXPOSED_OWNER_DATA";
  const manifestPath = path.join(target, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await fs.chmod(manifestPath, 0o600);
  if (strict && manifest.gaps.length) throw new BackupIncompleteError(manifestPath);
  return { manifest, outputDir: target, manifestPath };
};

const HELP = `Usage: node scripts/backup-remote.mjs [--origin HTTPS_ORIGIN] [--output PRIVATE_EMPTY_DIR] [--strict]

Opens an existing desktop Google sign-in flow through a printed URL.
The browser is controlled by you; this program never reads browser cookies.
All data endpoints are GET-only. No app data, environment, deployment or database is changed.
Defaults: https://feynman-notes.onrender.com and ~/.codex/backups/feynman-notes/remote-<date>.
Strict completeness is enabled by default. Exit 2 means a private backup was written but
some data is unavailable (for example course source text or capped/inaccessible AI history).
Even a successful backup covers only the authenticated owner's exposed API data,
not other users, unreferenced files, browser caches or a complete server filesystem.
`;

export const runCli = async (args = process.argv.slice(2), { stdout = console.log, stderr = console.error } = {}) => {
  if (args.includes("--help") || args.includes("-h")) { stdout(HELP); return 0; }
  let origin = "https://feynman-notes.onrender.com";
  let outputDir;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--strict") continue;
    if (["--origin", "--output"].includes(args[index]) && args[index + 1]) {
      const key = args[index++];
      if (key === "--origin") origin = args[index]; else outputDir = args[index];
    } else { stderr("Unknown or incomplete option. Use --help."); return 1; }
  }
  let login;
  try {
    login = await startDesktopAuthentication({ origin });
    stdout(`AUTH_URL ${login.loginUrl}`);
    stdout("Open that URL and choose the Google account whose data must be preserved. Waiting for sign-in…");
    const { cookie, user } = await login.result;
    stdout(`Authenticated Google owner fingerprint: ${sha256(user.id).slice(0, 12)}`);
    const result = await backupOwner({ origin, cookie, user, outputDir, strict: true });
    stdout(JSON.stringify({ status: result.manifest.status, outputDir: result.outputDir, counts: result.manifest.counts, serverWideBackup: false }));
    return 0;
  } catch (error) {
    if (error instanceof BackupIncompleteError) {
      stderr(JSON.stringify({ status: "INCOMPLETE", manifestPath: error.manifestPath, message: error.message }));
      return 2;
    }
    stderr(error instanceof BackupError ? `${error.code}: ${error.message}` : "BACKUP_FAILED: Backup could not finish. Credentials were not logged.");
    return 1;
  } finally { login?.close(); }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runCli();
}
