const { app, BrowserWindow, dialog, shell, session } = require("electron");
const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");

const APP_URL = process.env.FEYNMAN_WEB_URL || "https://feynman-notes.onrender.com";
const APP_ORIGIN = new URL(APP_URL).origin;
const isInternalNavigation = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return url.origin === APP_ORIGIN;
  } catch {
    return false;
  }
};

const isGoogleLoginUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    return url.origin === APP_ORIGIN && url.pathname === "/api/auth/google";
  } catch {
    return false;
  }
};

let pendingOAuthServer = null;

const stopOAuthServer = () => {
  if (!pendingOAuthServer) return;
  try {
    pendingOAuthServer.close();
  } catch {
    // The server may fail before it starts listening.
  }
  pendingOAuthServer = null;
};

const beginGoogleLogin = (window) => {
  stopOAuthServer();
  const nonce = crypto.randomBytes(32).toString("base64url");
  const server = http.createServer((req, res) => {
    const callbackUrl = new URL(req.url || "/", "http://127.0.0.1");
    if (callbackUrl.pathname !== "/oauth/callback") {
      res.writeHead(404).end();
      return;
    }

    const returnedNonce = callbackUrl.searchParams.get("desktop_nonce") || "";
    const grant = callbackUrl.searchParams.get("grant") || "";
    const error = callbackUrl.searchParams.get("error") || "";
    const validNonce = returnedNonce.length === nonce.length
      && crypto.timingSafeEqual(Buffer.from(returnedNonce), Buffer.from(nonce));

    res.writeHead(validNonce && grant ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(validNonce && grant
      ? "<!doctype html><meta charset='utf-8'><title>Đăng nhập thành công</title><p style='font:18px system-ui;padding:32px'>Đăng nhập thành công. Bạn có thể đóng tab này và quay lại Feynman Notes.</p>"
      : "<!doctype html><meta charset='utf-8'><title>Không thể đăng nhập</title><p style='font:18px system-ui;padding:32px'>Không thể đăng nhập. Hãy quay lại Feynman Notes và thử lại.</p>");

    stopOAuthServer();
    if (!validNonce || !grant || error || window.isDestroyed()) {
      if (error) void dialog.showMessageBox({ type: "error", title: "Đăng nhập Google", message: error });
      return;
    }
    const consumeUrl = new URL("/api/auth/desktop/consume", APP_ORIGIN);
    consumeUrl.searchParams.set("grant", grant);
    consumeUrl.searchParams.set("desktop_nonce", nonce);
    void window.loadURL(consumeUrl.toString());
  });

  pendingOAuthServer = server;
  server.on("error", () => {
    stopOAuthServer();
    void dialog.showMessageBox({ type: "error", title: "Đăng nhập Google", message: "Không thể khởi tạo đăng nhập trên máy Mac." });
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (!address || typeof address === "string") return;
    const loginUrl = new URL("/api/auth/google", APP_ORIGIN);
    loginUrl.searchParams.set("desktop_port", String(address.port));
    loginUrl.searchParams.set("desktop_nonce", nonce);
    void shell.openExternal(loginUrl.toString());
  });
  setTimeout(() => {
    if (pendingOAuthServer === server) stopOAuthServer();
  }, 10 * 60 * 1000).unref();
};

const openExternalSafely = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    if (["https:", "http:", "mailto:", "tel:"].includes(url.protocol)) {
      void shell.openExternal(url.href);
    }
  } catch {
    // Ignore malformed URLs supplied by remote content.
  }
};

const createWindow = () => {
  const window = new BrowserWindow({
    title: "Feynman Notes",
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#f7faff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalNavigation(url)) void window.loadURL(url);
    else openExternalSafely(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isGoogleLoginUrl(url)) {
      event.preventDefault();
      beginGoogleLogin(window);
      return;
    }
    if (isInternalNavigation(url)) return;
    event.preventDefault();
    openExternalSafely(url);
  });

  window.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === -3 || window.isDestroyed()) return;
    void window.loadFile(path.join(__dirname, "offline.html"), {
      query: { appUrl: APP_URL },
    });
  });

  void window.loadURL(APP_URL);
  return window;
};

app.setName("Feynman Notes");

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  stopOAuthServer();
  if (process.platform !== "darwin") app.quit();
});
