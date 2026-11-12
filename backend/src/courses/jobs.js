import crypto from "node:crypto";
import { getStore } from "../storage/index.js";
import { activeProvider, describeAi, isAiConfigured, runOpenAiChat } from "../ai/providers/index.js";
import { extractBook } from "./pdfExtract.js";
import { buildChapterMessages, normalizeChapterResult, normalizeSchool } from "./generation.js";

/**
 * Background work for "PDF → learning roadmap":
 *   1. read the PDF and split it into chapters (seconds),
 *   2. ask the AI to turn each chapter into lessons (a few chapters at once).
 * Progress is saved after every chapter, so the UI can poll and a restart
 * resumes where it stopped.
 */

const CONCURRENCY = Math.max(1, Math.min(6, Number.parseInt(process.env.COURSE_AI_CONCURRENCY, 10) || 2));
const MAX_ATTEMPTS = 3;
const queue = [];
let running = 0;
const locks = new Map();

/** Serialises read-modify-write of one course across concurrent chapter jobs. */
export const updateCourse = (ownerId, courseId, mutate) => {
  const key = `${ownerId}|${courseId}`;
  const previous = locks.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const store = getStore();
    const course = await store.courses.get(ownerId, courseId);
    if (!course) return null;
    const updated = mutate(structuredClone(course)) || course;
    updated.status = deriveStatus(updated);
    updated.updatedAt = new Date().toISOString();
    return store.courses.save(ownerId, courseId, updated);
  });
  locks.set(key, next);
  next.finally(() => { if (locks.get(key) === next) locks.delete(key); });
  return next;
};

export const deriveStatus = (course) => {
  if (course.status === "extracting" || (course.status === "error" && !course.stages?.length)) return course.status;
  const stages = course.stages || [];
  if (!stages.length) return course.status || "extracting";
  if (stages.some((stage) => stage.status === "pending" || stage.status === "generating")) return "generating";
  if (stages.every((stage) => stage.status === "ready")) return "ready";
  if (stages.some((stage) => stage.status === "ready")) return "partial";
  return "error";
};

const pump = () => {
  while (running < CONCURRENCY && queue.length) {
    const job = queue.shift();
    running += 1;
    job().catch((error) => console.error("[courses] Lỗi tác vụ nền:", error.message)).finally(() => {
      running -= 1;
      pump();
    });
  }
};
const enqueue = (job) => { queue.push(job); pump(); };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const generateStage = async (ownerId, courseId, stageId) => {
  const store = getStore();
  const course = await store.courses.get(ownerId, courseId);
  const stageIndex = course?.stages?.findIndex((stage) => stage.id === stageId) ?? -1;
  if (stageIndex < 0) return;
  const source = await store.courseSources.get(ownerId, courseId);
  const chapter = source?.chapters?.[stageIndex];
  if (!chapter) {
    await updateCourse(ownerId, courseId, (current) => {
      current.stages[stageIndex] = { ...current.stages[stageIndex], status: "error", error: "Không còn nội dung gốc của chương, hãy tải lại sách." };
      return current;
    });
    return;
  }
  if (!isAiConfigured() || activeProvider() !== "openai") {
    await updateCourse(ownerId, courseId, (current) => {
      current.stages[stageIndex] = { ...current.stages[stageIndex], status: "error", error: "Chưa cấu hình AI (AI_BASE_URL, AI_API_KEY, AI_MODEL trong backend/.env). Cấu hình xong bấm “Thử lại”." };
      return current;
    });
    return;
  }

  await updateCourse(ownerId, courseId, (current) => {
    current.stages[stageIndex] = { ...current.stages[stageIndex], status: "generating", error: "" };
    return current;
  });

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const messages = buildChapterMessages({
        bookTitle: course.title,
        chapter,
        chapterIndex: stageIndex,
        chapterCount: course.stages.length,
        language: course.language,
        school: course.school,
      });
      const result = await runOpenAiChat({ messages, json: true, temperature: 0.5, timeoutMs: Number(process.env.COURSE_AI_TIMEOUT_MS) || 300_000 });
      const generated = normalizeChapterResult(result.data, chapter);
      await updateCourse(ownerId, courseId, (current) => {
        current.stages[stageIndex] = { ...current.stages[stageIndex], status: "ready", error: "", summary: generated.summary, keyIdeas: generated.keyIdeas, lessons: generated.lessons, generatedAt: new Date().toISOString(), model: result.model };
        current.usage = {
          inputTokens: (current.usage?.inputTokens || 0) + result.usage.inputTokens,
          outputTokens: (current.usage?.outputTokens || 0) + result.usage.outputTokens,
        };
        return current;
      });
      return;
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === MAX_ATTEMPTS) break;
      await sleep(2_000 * attempt);
    }
  }
  await updateCourse(ownerId, courseId, (current) => {
    current.stages[stageIndex] = { ...current.stages[stageIndex], status: "error", error: lastError?.message || "Không tạo được bài học." };
    return current;
  });
};

const queueStages = (ownerId, course) => {
  course.stages.filter((stage) => stage.status === "pending").forEach((stage) => enqueue(() => generateStage(ownerId, course.id, stage.id)));
};

/** Creates the course record immediately and does the heavy work in the background. */
export const createCourseFromPdf = async (ownerId, { buffer, fileName, language = "vi", title = "", school = "general" }) => {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const course = {
    id,
    title: String(title || "").trim().slice(0, 200) || String(fileName || "Sách").replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 200),
    author: "",
    fileName: String(fileName || "book.pdf").slice(0, 255),
    language: language === "en" ? "en" : "vi",
    school: normalizeSchool(school),
    status: "extracting",
    progress: 0,
    pageCount: 0,
    stages: [],
    model: describeAi().model,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await getStore().courses.save(ownerId, id, course);

  enqueue(async () => {
    try {
      const book = await extractBook(buffer, {
        onProgress: (fraction) => { void updateCourse(ownerId, id, (current) => ({ ...current, progress: Math.round(fraction * 100) / 100 })); },
      });
      if (!book.chapters.length) throw new Error("Không tìm thấy nội dung chữ trong PDF.");
      await getStore().courseSources.save(ownerId, id, {
        id,
        chapters: book.chapters.map(({ title: chapterTitle, pageStart, pageEnd, sections, text }) => ({ title: chapterTitle, pageStart, pageEnd, sections, text })),
      });
      const updated = await updateCourse(ownerId, id, (current) => ({
        ...current,
        // A real metadata title beats a file name like "Martin-Kleppmann---Designing…".
        title: title ? current.title : (book.title && book.title.length > 3 ? book.title.replace(/\b\w/g, (letter) => letter.toUpperCase()) : current.title),
        author: book.author,
        pageCount: book.pageCount,
        progress: 1,
        status: "generating",
        stages: book.chapters.map((chapter, index) => ({
          id: crypto.randomUUID().slice(0, 12),
          index,
          title: chapter.title,
          pageStart: chapter.pageStart,
          pageEnd: chapter.pageEnd,
          sections: chapter.sections,
          status: "pending",
          error: "",
          summary: "",
          lessons: [],
        })),
      }));
      if (updated) queueStages(ownerId, updated);
    } catch (error) {
      await updateCourse(ownerId, id, (current) => ({ ...current, status: "error", error: error.message || "Không đọc được PDF." }));
    }
  });
  return course;
};

export const retryStages = async (ownerId, courseId, stageId = null) => {
  const updated = await updateCourse(ownerId, courseId, (current) => {
    current.stages = current.stages.map((stage) => ((stageId ? stage.id === stageId : stage.status === "error") ? { ...stage, status: "pending", error: "" } : stage));
    return current;
  });
  if (updated) queueStages(ownerId, updated);
  return updated;
};

/** After a restart: continue unfinished chapters, fail interrupted PDF reads. */
export const resumeCourseJobs = async () => {
  const store = getStore();
  for (const status of ["generating", "extracting"]) {
    const items = await store.courses.listByStatus(status).catch(() => []);
    for (const { ownerId, data } of items) {
      if (status === "extracting") {
        await updateCourse(ownerId, data.id, (current) => ({ ...current, status: "error", error: "Máy chủ khởi động lại khi đang đọc PDF. Hãy xóa và tải lại sách." }));
        continue;
      }
      const updated = await updateCourse(ownerId, data.id, (current) => {
        current.stages = current.stages.map((stage) => (stage.status === "generating" ? { ...stage, status: "pending" } : stage));
        return current;
      });
      if (updated) queueStages(ownerId, updated);
    }
  }
};

export const pendingJobCount = () => queue.length + running;
