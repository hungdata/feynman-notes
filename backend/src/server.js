import "./config/env.js";

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config/env.js";
import { createApp, featureStatus, FRONTEND_DIST } from "./app.js";
import { isLocalModeEnabled } from "./auth/localMode.js";
import { getStorageInfo, getStore, initStorage } from "./storage/index.js";
import { resumeCourseJobs } from "./courses/jobs.js";
import { importExampleCourses } from "./courses/examples.js";
import { describeAi } from "./ai/providers/index.js";

const port = Number(process.env.PORT) || 5051;
const on = (value) => (value ? "bật" : "tắt");

const printBanner = () => {
  const storage = getStorageInfo();
  const features = featureStatus();
  const hasFrontend = fs.existsSync(path.join(FRONTEND_DIST, "index.html"));
  const lines = [
    "",
    "  Feynman Notes API đang chạy",
    `  • Địa chỉ:        http://localhost:${port}${hasFrontend ? "  (giao diện + API)" : "/api"}`,
    `  • Lưu trữ:        ${storage.description}`,
    `  • Chế độ local:   ${on(isLocalModeEnabled())}${isLocalModeEnabled() ? " (mở trên máy này là dùng ngay, không cần đăng nhập)" : ""}`,
    `  • Google login:   ${on(features.googleLogin)}`,
    `  • Dùng thử:       ${on(features.guestLogin)}`,
    `  • AI:             ${features.aiTeacher ? `bật – ${describeAi().provider === "openai" ? `${describeAi().model} qua ${describeAi().endpoint}` : "Cloudflare"}` : "tắt (thêm AI_BASE_URL, AI_API_KEY, AI_MODEL vào backend/.env)"}`,
    `  • Sách → lộ trình: ${features.courseGeneration ? "bật" : "tắt (cần AI chuẩn OpenAI: AI_BASE_URL + AI_MODEL)"}`,
    `  • Web search:     ${on(features.webSearch)}`,
    storage.note ? `  ! ${storage.note}` : null,
    process.env.AUTH_SESSION_SECRET_GENERATED === "true" ? `  • Đã tự tạo AUTH_SESSION_SECRET cho môi trường dev (${path.join(DATA_DIR, ".session-secret")}).` : null,
    !hasFrontend ? "  • Giao diện dev: chạy `npm run dev` ở thư mục gốc rồi mở http://localhost:5173" : null,
    "",
  ].filter(Boolean);
  console.log(lines.join("\n"));
};

const start = async () => {
  await initStorage();
  const examples = await importExampleCourses().catch((error) => { console.warn("[courses] Không nạp được khóa học ví dụ:", error.message); return []; });
  const app = createApp();
  const server = app.listen(port, () => {
    printBanner();
    if (examples.length) console.log(`  • Khóa học ví dụ: ${examples.join(", ")} (mục “Học”).\n`);
    resumeCourseJobs().catch((error) => console.error("[courses] Không tiếp tục được tác vụ:", error.message));
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n  Cổng ${port} đang được dùng. Tắt tiến trình kia hoặc đặt PORT khác trong backend/.env.\n`);
      process.exit(1);
    }
    throw error;
  });

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n  Đang tắt server (${signal})…`);
    app.locals.campus.close();
    app.locals.football.close();
    server.close();
    try { await getStore().flush(); } catch { /* storage may be unavailable */ }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("exit", () => { try { getStore().flushSync(); } catch { /* nothing to flush */ } });
};

start().catch((error) => {
  console.error("Không thể khởi động server:", error);
  process.exit(1);
});
