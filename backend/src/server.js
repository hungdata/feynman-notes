import "./config/env.js";

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB } from "./config/db.js";
import taskRouter from "./routes/taskRouters.js";
import authRouter from "./routes/authRouter.js";
import mindMapRouter from "./routes/mindMapRouter.js";
import assetRouter from "./routes/assetRouter.js";
import aiRouter from "./routes/aiRouter.js";
import supportRouter from "./routes/supportRouter.js";
import cors from "cors";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

if (!isProduction || allowedOrigins.length > 0) {
  app.use(
    cors({
      credentials: true,
      origin: isProduction
        ? allowedOrigins
        : [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
          ],
    })
  );
}

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use("/api/auth", authRouter);
app.use("/api/mindmaps", mindMapRouter);
app.use("/api/assets", assetRouter);
app.use("/api/ai", aiRouter);
app.use("/api/support", supportRouter);
app.use("/api/tasks", taskRouter);

if (isProduction) {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  const frontendDirectory = path.resolve(currentDirectory, "../../frontend/dist");

  app.use(express.static(frontendDirectory));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDirectory, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error("Unhandled request error:", error.message);
  res.status(500).json({ message: "Internal server error" });
});

const port = Number(process.env.PORT) || 5051;

const startServer = async () => {
  try {
    await connectDB();
  } catch (error) {
    // Authentication does not depend on MongoDB. Keep the server available so
    // OAuth callbacks can complete while the task database is being restored.
    console.error("Failed to connect to the database; task API is unavailable:", error.message);
  }

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
};

startServer();
