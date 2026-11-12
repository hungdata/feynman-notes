import "./config/env.js";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import taskRouter from "./routes/taskRouters.js";
import authRouter from "./routes/authRouter.js";
import mindMapRouter from "./routes/mindMapRouter.js";
import assetRouter from "./routes/assetRouter.js";
import aiRouter from "./routes/aiRouter.js";
import supportRouter from "./routes/supportRouter.js";
import courseRouter from "./routes/courseRouter.js";
import { describeAi } from "./ai/providers/index.js";
import { getStorageInfo } from "./storage/index.js";
import { MindMapInputError } from "./mindmaps/documents.js";
import { createCampusRuntime } from "./campus/runtime.js";
import { createCampusRouter } from "./routes/campusRouter.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND_DIST = path.resolve(currentDirectory, "../../frontend/dist");

export const API_INDEX = {
  name: "Feynman Notes API",
  docs: "Xem README.md › API để có ví dụ curl đầy đủ.",
  endpoints: {
    "GET /api/health": "Trạng thái server, kiểu lưu trữ và các tính năng đang bật",
    "GET /api/auth/me": "Người dùng hiện tại (hoặc chủ máy ở chế độ local)",
    "GET /api/auth/providers": "Các cách đăng nhập đang bật",
    "POST /api/auth/guest": "Tạo phiên dùng thử",
    "POST /api/auth/logout": "Đăng xuất",
    "GET /api/campus/profile": "Nhân vật online của phiên Google/khách hiện tại",
    "PUT /api/campus/profile": "Đặt tên duy nhất và chọn nhân vật { name, gender: male|female }",
    "GET /api/campus/events": "Luồng SSE world: người chơi, bóng và tỉ số dùng chung",
    "POST /api/campus/input": "Cập nhật vị trí nhân vật { x, z, heading, moving }",
    "POST /api/campus/action": "Vào sân, rời sân, sút/ném { type: join|leave|shoot, sport?, team?, power? }",
    "GET /api/mindmaps": "Danh sách mind map đầy đủ (?view=summary để lấy bản tóm tắt)",
    "POST /api/mindmaps": "Tạo mind map: { title, topics[] } hoặc { document }",
    "GET /api/mindmaps/:id": "Một mind map",
    "PUT /api/mindmaps/:id": "Lưu toàn bộ mind map: { document } hoặc document",
    "PATCH /api/mindmaps/:id": "Đổi title / folder / favorite / description",
    "POST /api/mindmaps/:id/duplicate": "Nhân bản",
    "DELETE /api/mindmaps/:id": "Chuyển vào thùng rác (?permanent=true để xóa hẳn)",
    "POST /api/mindmaps/:id/restore": "Khôi phục từ thùng rác",
    "GET /api/mindmaps/:id/export?format=json|md|txt|opml": "Tải về",
    "POST /api/assets/images": "Tải ảnh (multipart: image, assetId?)",
    "GET /api/assets/images/:assetId": "Xem ảnh",
    "DELETE /api/assets/images/:assetId": "Xóa ảnh không còn dùng",
    "GET /api/ai/status": "Trạng thái AI Teacher",
    "POST /api/ai/chat": "Hỏi AI Teacher",
    "POST /api/ai/expand": "Gợi ý nhánh kiến thức: { documentId, nodeId, explanation? }; xem trước trước khi vẽ vào sơ đồ",
    "GET /api/courses": "Khóa học tạo từ sách + XP/streak của người học",
    "POST /api/courses": "Tải PDF (multipart: pdf, language) → AI tạo lộ trình theo chương",
    "GET /api/courses/:id": "Lộ trình + tiến độ",
    "POST /api/courses/:id/lessons/:lessonId/complete": "Hoàn thành bài: { firstTryCorrect, mistakes, day }",
    "POST /api/courses/:id/grade": "AI chấm bài tự giải thích (Feynman)",
    "POST /api/courses/:id/retry": "Tạo lại chương bị lỗi",
    "POST /api/courses/:id/mindmap": "Tạo mind map từ lộ trình",
    "GET /api/tasks": "Danh sách công việc",
    "POST /api/tasks": "Tạo công việc { title }",
    "PUT /api/tasks/:id": "Sửa công việc { title?, status? }",
    "DELETE /api/tasks/:id": "Xóa công việc",
  },
};

const featureStatus = (env = process.env) => ({
  googleLogin: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.AUTH_SESSION_SECRET),
  guestLogin: Boolean(env.AUTH_SESSION_SECRET),
  campusOnline: Boolean(env.AUTH_SESSION_SECRET),
  aiTeacher: describeAi(env).configured,
  aiModel: describeAi(env).model,
  courseGeneration: describeAi(env).provider === "openai",
  webSearch: Boolean(env.BRAVE_SEARCH_API_KEY),
});

export const createApp = ({ env = process.env, campusRuntime } = {}) => {
  const app = express();
  app.locals.campus = campusRuntime || createCampusRuntime();
  const isProduction = env.NODE_ENV === "production";
  const allowedOrigins = String(env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);

  app.disable("x-powered-by");
  // Large maps with long AI notes can exceed 1 MB; images use multipart.
  app.use(express.json({ limit: env.JSON_BODY_LIMIT || "10mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  if (!isProduction || allowedOrigins.length > 0) {
    app.use(cors({
      credentials: true,
      origin: isProduction ? allowedOrigins : [/^http:\/\/(localhost|127\.0\.0\.1):\d+$/],
    }));
  }

  app.get("/api", (_req, res) => res.json(API_INDEX));
  app.get("/api/health", (_req, res) => {
    const storage = getStorageInfo();
    res.status(storage.kind === "none" ? 503 : 200).json({
      status: storage.kind === "none" ? "starting" : "ok",
      storage,
      features: featureStatus(env),
      time: new Date().toISOString(),
    });
  });
  app.use("/api/auth", authRouter);
  app.use("/api/campus", createCampusRouter(app.locals.campus));
  app.use("/api/mindmaps", mindMapRouter);
  app.use("/api/assets", assetRouter);
  app.use("/api/ai", aiRouter);
  app.use("/api/support", supportRouter);
  app.use("/api/tasks", taskRouter);
  app.use("/api/courses", courseRouter);
  app.use("/api", (req, res) => res.status(404).json({
    message: `Không có API ${req.method} ${req.originalUrl}. Xem GET /api để biết danh sách.`,
    code: "NOT_FOUND",
  }));

  // Serve the built web app whenever it exists, so `npm run build && npm start`
  // gives one address for both the UI and the API (also outside production).
  if (fs.existsSync(path.join(FRONTEND_DIST, "index.html"))) {
    app.use(express.static(FRONTEND_DIST, { index: false, maxAge: isProduction ? "1h" : 0 }));
    app.get("*", (_req, res) => res.sendFile(path.join(FRONTEND_DIST, "index.html")));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.parse.failed") {
      return res.status(400).json({ message: "JSON gửi lên không hợp lệ.", code: "INVALID_JSON" });
    }
    if (error?.type === "entity.too.large") {
      return res.status(413).json({ message: "Dữ liệu gửi lên quá lớn.", code: "PAYLOAD_TOO_LARGE" });
    }
    if (error instanceof MindMapInputError) return res.status(error.status).json({ message: error.message });
    if (error?.status === 503) return res.status(503).json({ message: error.message, code: error.code || "UNAVAILABLE" });
    console.error("Unhandled request error:", error?.message || error);
    return res.status(500).json({ message: "Lỗi máy chủ. Vui lòng thử lại.", code: "INTERNAL_ERROR" });
  });

  return app;
};

export { featureStatus };
