import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url) });

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDB } from "./config/db.js";
import taskRouter from "./routes/taskRouters.js";
import cors from "cors";

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

if (!isProduction || allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: isProduction
        ? allowedOrigins
        : ["http://localhost:5173", "http://localhost:5174"],
    })
  );
}

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
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

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to connect to the database:", error.message);
    process.exit(1);
  });
