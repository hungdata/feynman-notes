import express from "express";
import { requireAuth } from "../auth/requireAuth.js";
import { getStore } from "../storage/index.js";
import {
  applyMetadataPatch,
  createBlankDocument,
  duplicateDocument,
  exportDocument,
  MindMapInputError,
  normalizeDocumentId,
  prepareDocumentForSave,
  readDocumentFromBody,
  safeDownloadName,
  summarizeDocument,
} from "../mindmaps/documents.js";

/**
 * Mind map REST API (all routes need a signed-in user or local mode):
 *
 *   GET    /api/mindmaps                     → { documents }   (?view=summary → { maps })
 *   POST   /api/mindmaps                     → 201 { document } body: { title?, topics?[] } or { document }
 *   GET    /api/mindmaps/:id                 → { document }
 *   PUT    /api/mindmaps/:id                 → { document }    body: { document } or the document itself
 *   PATCH  /api/mindmaps/:id                 → { document }    body: { title?, folder?, favorite?, description? }
 *   POST   /api/mindmaps/:id/duplicate       → 201 { document }
 *   DELETE /api/mindmaps/:id                 → { document }    moves to trash (?permanent=true → 204)
 *   POST   /api/mindmaps/:id/restore         → { document }
 *   GET    /api/mindmaps/:id/export?format=  → file (json | md | txt | opml)
 */
const router = express.Router();
router.use(requireAuth);

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const loadOwned = async (req) => {
  const documentId = normalizeDocumentId(req.params.documentId);
  const record = await getStore().mindMaps.get(req.user.id, documentId);
  if (!record) throw new MindMapInputError("Không tìm thấy mind map.", 404);
  return { documentId, record };
};

const save = (req, documentId, document, previous = null) =>
  getStore().mindMaps.save(req.user.id, documentId, prepareDocumentForSave(document, documentId, previous));

router.get("/", route(async (req, res) => {
  const records = await getStore().mindMaps.list(req.user.id);
  const documents = records.map((record) => record.document);
  if (req.query.view === "summary") return res.json({ maps: documents.map(summarizeDocument) });
  return res.json({ documents });
}));

router.post("/", route(async (req, res) => {
  const body = req.body || {};
  const source = (body.document || Array.isArray(body.nodes))
    ? readDocumentFromBody(body)
    : createBlankDocument({ title: body.title, topics: Array.isArray(body.topics) ? body.topics : [] });
  const documentId = source.id ? normalizeDocumentId(source.id) : createBlankDocument().id;
  if (await getStore().mindMaps.get(req.user.id, documentId)) {
    throw new MindMapInputError("Mind map với mã này đã tồn tại. Dùng PUT để cập nhật.", 409);
  }
  const saved = await save(req, documentId, { ...source, trashedAt: null });
  res.status(201).location(`/api/mindmaps/${encodeURIComponent(documentId)}`).json({ document: saved.document });
}));

router.get("/:documentId", route(async (req, res) => {
  const { record } = await loadOwned(req);
  res.json({ document: record.document });
}));

router.put("/:documentId", route(async (req, res) => {
  const documentId = normalizeDocumentId(req.params.documentId);
  const document = readDocumentFromBody(req.body);
  const previous = await getStore().mindMaps.get(req.user.id, documentId);
  const saved = await save(req, documentId, document, previous);
  res.status(previous ? 200 : 201).json({ document: saved.document });
}));

router.patch("/:documentId", route(async (req, res) => {
  const { documentId, record } = await loadOwned(req);
  const saved = await save(req, documentId, applyMetadataPatch(record.document, req.body), record);
  res.json({ document: saved.document });
}));

router.post("/:documentId/duplicate", route(async (req, res) => {
  const { record } = await loadOwned(req);
  const copy = duplicateDocument(record.document);
  const saved = await save(req, copy.id, copy);
  res.status(201).json({ document: saved.document });
}));

router.delete("/:documentId", route(async (req, res) => {
  const { documentId, record } = await loadOwned(req);
  const permanent = ["1", "true", "yes"].includes(String(req.query.permanent || "").toLowerCase());
  if (permanent) {
    await getStore().mindMaps.remove(req.user.id, documentId);
    return res.status(204).end();
  }
  const saved = await save(req, documentId, { ...record.document, trashedAt: new Date().toISOString() }, record);
  return res.json({ document: saved.document });
}));

router.post("/:documentId/restore", route(async (req, res) => {
  const { documentId, record } = await loadOwned(req);
  const saved = await save(req, documentId, { ...record.document, trashedAt: null }, record);
  res.json({ document: saved.document });
}));

router.get("/:documentId/export", route(async (req, res) => {
  const { record } = await loadOwned(req);
  const format = String(req.query.format || "json").toLowerCase();
  const file = exportDocument(record.document, format);
  const fileName = safeDownloadName(record.document.title, file.extension);
  res.set({
    "Content-Type": file.type,
    "Content-Disposition": `attachment; filename="${fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "mind-map"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  });
  res.send(file.body);
}));

export default router;
