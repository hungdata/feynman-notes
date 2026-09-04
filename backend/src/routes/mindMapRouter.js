import express from "express";
import MindMap from "../models/mindMap.js";
import { requireAuth } from "../auth/requireAuth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const maps = await MindMap.find({ ownerId: req.user.id }).sort({ updatedAt: -1 }).lean();
    res.json({ documents: maps.map((map) => map.document) });
  } catch (error) { next(error); }
});

router.put("/:documentId", async (req, res, next) => {
  try {
    const document = req.body?.document;
    if (!document || typeof document !== "object" || Array.isArray(document) || !Array.isArray(document.nodes)) {
      return res.status(400).json({ message: "Mind map không hợp lệ." });
    }
    const documentId = String(req.params.documentId);
    const safeDocument = { ...document, id: documentId, updatedAt: new Date().toISOString() };
    const saved = await MindMap.findOneAndUpdate(
      { ownerId: req.user.id, documentId },
      { ownerId: req.user.id, documentId, title: String(safeDocument.title || "Mind map").slice(0, 200), document: safeDocument },
      { upsert: true, new: true, runValidators: true }
    ).lean();
    res.json({ document: saved.document });
  } catch (error) { next(error); }
});

router.delete("/:documentId", async (req, res, next) => {
  try {
    await MindMap.deleteOne({ ownerId: req.user.id, documentId: String(req.params.documentId) });
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
