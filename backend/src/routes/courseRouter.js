import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { requireAuth } from "../auth/requireAuth.js";
import { getStore } from "../storage/index.js";
import { createCourseFromPdf, retryStages, updateCourse } from "../courses/jobs.js";
import { isPdfBuffer, MAX_PDF_BYTES } from "../courses/pdfExtract.js";
import { buildGradeMessages, gradeByKeywords, normalizeGrade } from "../courses/generation.js";
import { addXp, completeLesson, currentStreak, emptyLearner, emptyProgress, summarizeProgress, todayFor } from "../courses/progress.js";
import { activeProvider, describeAi, runOpenAiChat } from "../ai/providers/index.js";
import { prepareDocumentForSave } from "../mindmaps/documents.js";
import { buildKnowledgeMap } from "../courses/knowledgeMap.js";

/**
 * Learning roadmaps generated from books.
 *
 *   GET    /api/courses                          → { courses, learner, ai }
 *   POST   /api/courses            (multipart)   → 202 { course }   fields: pdf, language (vi|en), title?, school (general|english|japanese|korean)
 *   GET    /api/courses/:id                      → { course, progress }
 *   PATCH  /api/courses/:id                      → { course }   { title }
 *   DELETE /api/courses/:id                      → 204
 *   POST   /api/courses/:id/retry                → { course }   { stageId? } (default: every failed chapter)
 *   POST   /api/courses/:id/lessons/:lessonId/complete → { progress, learner, xp }   { firstTryCorrect, mistakes, day }
 *   POST   /api/courses/:id/grade                → { result }   { stageId, lessonId, stepId, answer }
 *   POST   /api/courses/:id/report               → { course }   { stageId, lessonId, stepId }  hides a wrong question
 *   POST   /api/courses/:id/mindmap              → 201/200 { document, updated }  knowledge mind map (rebuilt in place)
 */
const router = express.Router();
router.use(requireAuth);

const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const fail = (res, status, message, code) => res.status(status).json({ message, ...(code ? { code } : {}) });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1, fields: 8 },
  fileFilter: (_req, file, callback) => callback(null, file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname || "")),
});

const learnerFor = async (ownerId) => ({ ...emptyLearner(), ...(await getStore().learners.get(ownerId, "stats")) });
const publicLearner = (learner, day) => ({ ...learner, streak: currentStreak(learner, day), today: learner.days?.[day] || 0 });

const summary = (course, progress) => ({
  id: course.id,
  title: course.title,
  author: course.author,
  fileName: course.fileName,
  pageCount: course.pageCount,
  language: course.language,
  school: course.school || "general",
  status: course.status,
  error: course.error || "",
  progress: course.progress,
  example: Boolean(course.example),
  mindMapId: course.mindMapId || "",
  createdAt: course.createdAt,
  updatedAt: course.updatedAt,
  stageCount: course.stages?.length || 0,
  stagesReady: course.stages?.filter((stage) => stage.status === "ready").length || 0,
  stagesFailed: course.stages?.filter((stage) => stage.status === "error").length || 0,
  learning: summarizeProgress(course, progress),
});

const loadCourse = async (req) => {
  const course = await getStore().courses.get(req.user.id, String(req.params.courseId));
  if (!course) {
    const error = new Error("Không tìm thấy khóa học.");
    error.status = 404;
    throw error;
  }
  return course;
};

const findLesson = (course, lessonId) => {
  for (const stage of course.stages || []) {
    const lesson = (stage.lessons || []).find((item) => item.id === lessonId);
    if (lesson) return { stage, lesson };
  }
  return {};
};

router.get("/", route(async (req, res) => {
  const store = getStore();
  const courses = await store.courses.list(req.user.id);
  const progressList = await Promise.all(courses.map((course) => store.courseProgress.get(req.user.id, course.id)));
  const day = todayFor(req.query.day);
  res.json({
    courses: courses.map((course, index) => summary(course, progressList[index])),
    learner: publicLearner(await learnerFor(req.user.id), day),
    ai: { ...describeAi(), canGenerate: activeProvider() === "openai" },
  });
}));

router.post("/", (req, res, next) => upload.single("pdf")(req, res, (error) => {
  if (error?.code === "LIMIT_FILE_SIZE") return fail(res, 413, `Sách vượt quá ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB.`);
  if (error) return next(error);
  return next();
}), route(async (req, res) => {
  if (!req.file?.buffer || !isPdfBuffer(req.file.buffer)) return fail(res, 400, "Hãy chọn một tệp PDF.");
  const course = await createCourseFromPdf(req.user.id, {
    buffer: req.file.buffer,
    fileName: Buffer.from(req.file.originalname || "book.pdf", "latin1").toString("utf8"),
    language: req.body?.language,
    title: req.body?.title,
    school: req.body?.school,
  });
  res.status(202).json({ course: summary(course, null) });
}));

router.get("/:courseId", route(async (req, res) => {
  const course = await loadCourse(req);
  const progress = (await getStore().courseProgress.get(req.user.id, course.id)) || emptyProgress(course.id);
  res.json({ course, progress });
}));

router.patch("/:courseId", route(async (req, res) => {
  await loadCourse(req);
  const title = String(req.body?.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!title) return fail(res, 400, "Tên khóa học không được trống.");
  const course = await updateCourse(req.user.id, req.params.courseId, (current) => ({ ...current, title }));
  res.json({ course });
}));

router.delete("/:courseId", route(async (req, res) => {
  await loadCourse(req);
  const store = getStore();
  await Promise.all([
    store.courses.remove(req.user.id, req.params.courseId),
    store.courseSources.remove(req.user.id, req.params.courseId),
    store.courseProgress.remove(req.user.id, req.params.courseId),
  ]);
  res.status(204).end();
}));

router.post("/:courseId/retry", route(async (req, res) => {
  await loadCourse(req);
  const course = await retryStages(req.user.id, req.params.courseId, req.body?.stageId ? String(req.body.stageId) : null);
  res.json({ course });
}));

router.post("/:courseId/lessons/:lessonId/complete", route(async (req, res) => {
  const course = await loadCourse(req);
  const { lesson } = findLesson(course, String(req.params.lessonId));
  if (!lesson) return fail(res, 404, "Không tìm thấy bài học.");
  const store = getStore();
  const day = todayFor(req.body?.day);
  const current = (await store.courseProgress.get(req.user.id, course.id)) || emptyProgress(course.id);
  const { progress, xp } = completeLesson(current, lesson, req.body || {});
  const learner = addXp(await learnerFor(req.user.id), xp, day);
  await store.courseProgress.save(req.user.id, course.id, progress);
  await store.learners.save(req.user.id, "stats", learner);
  res.json({ progress, learner: publicLearner(learner, day), xp });
}));

router.post("/:courseId/grade", route(async (req, res) => {
  const course = await loadCourse(req);
  const { stage, lesson } = findLesson(course, String(req.body?.lessonId || ""));
  const step = lesson?.steps.find((item) => item.id === String(req.body?.stepId || ""));
  const answer = String(req.body?.answer || "").trim();
  if (!step || step.type !== "explain") return fail(res, 404, "Không tìm thấy câu hỏi.");
  if (answer.length < 15) return fail(res, 400, "Hãy viết ít nhất một hai câu giải thích nhé.");
  let result;
  if (activeProvider() === "openai") {
    try {
      const ai = await runOpenAiChat({ messages: buildGradeMessages({ bookTitle: course.title, chapterTitle: stage.title, step, answer, language: course.language }), json: true, temperature: 0.2, timeoutMs: 60_000 });
      result = normalizeGrade(ai.data, step);
    } catch (error) {
      result = { ...gradeByKeywords(step, answer), feedback: `AI chưa chấm được (${error.message}). Đã chấm tạm theo từ khóa.` };
    }
  } else {
    result = gradeByKeywords(step, answer);
  }
  const store = getStore();
  const progress = (await store.courseProgress.get(req.user.id, course.id)) || emptyProgress(course.id);
  progress.explain = { ...progress.explain, [step.id]: { score: result.score, at: new Date().toISOString() } };
  await store.courseProgress.save(req.user.id, course.id, progress);
  res.json({ result });
}));

router.post("/:courseId/report", route(async (req, res) => {
  await loadCourse(req);
  const { lessonId, stepId } = req.body || {};
  const course = await updateCourse(req.user.id, req.params.courseId, (current) => {
    const { lesson } = findLesson(current, String(lessonId || ""));
    const step = lesson?.steps.find((item) => item.id === String(stepId || ""));
    if (step) step.reported = true;
    return current;
  });
  res.json({ course });
}));

router.post("/:courseId/mindmap", route(async (req, res) => {
  const course = await loadCourse(req);
  const store = getStore();
  const progress = (await store.courseProgress.get(req.user.id, course.id)) || emptyProgress(course.id);
  // Rebuild the same map when it still exists (keeps favorite / folder), otherwise create one.
  const existing = course.mindMapId ? await store.mindMaps.get(req.user.id, course.mindMapId) : null;
  const reuse = existing && !existing.document?.trashedAt;
  const documentId = reuse ? course.mindMapId : crypto.randomUUID();
  const built = buildKnowledgeMap(course, progress, { documentId });
  const document = prepareDocumentForSave(reuse ? { ...built, favorite: existing.document.favorite, folder: existing.document.folder || built.folder } : built, documentId, reuse ? existing : null);
  const saved = await store.mindMaps.save(req.user.id, documentId, document);
  if (!reuse) await updateCourse(req.user.id, course.id, (current) => ({ ...current, mindMapId: documentId }));
  res.status(reuse ? 200 : 201).json({ document: saved.document, updated: Boolean(reuse) });
}));

router.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.status && error.status < 500) return fail(res, error.status, error.message);
  return next(error);
});

export default router;
