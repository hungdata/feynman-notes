import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { requireAuth } from "../auth/requireAuth.js";

const router = express.Router();
const qrImagePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../QR_code.jpg");

router.get("/qr", requireAuth, (_req, res, next) => {
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(qrImagePath, (error) => {
    if (error) next(error);
  });
});

export default router;
