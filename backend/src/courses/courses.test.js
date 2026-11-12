import assert from "node:assert/strict";
import test from "node:test";
import { planChapters } from "./pdfExtract.js";
import { buildChapterMessages, gradeByKeywords, normalizeChapterResult, normalizeGrade, normalizeStep } from "./generation.js";
import { addXp, completeLesson, currentStreak, emptyLearner, emptyProgress, summarizeProgress } from "./progress.js";
import { buildKnowledgeMap } from "./knowledgeMap.js";
import { parseJsonLoose, runOpenAiChat } from "../ai/providers/openaiCompatibleProvider.js";
import { activeProvider } from "../ai/providers/index.js";

test("chapters come from 'Chapter N' bookmarks with their sections", () => {
  const entries = [
    { title: "Cover", page: 1, depth: 0 },
    { title: "Part I. Foundations", page: 21, depth: 0 },
    { title: "Chapter 1. Reliable Applications", page: 23, depth: 0 },
    { title: "Reliability", page: 26, depth: 1 },
    { title: "Summary", page: 42, depth: 1 },
    { title: "Chapter 2. Data Models", page: 47, depth: 0 },
    { title: "Index", page: 480, depth: 0 },
  ];
  const chapters = planChapters(entries, 491);
  assert.deepEqual(chapters.map((chapter) => [chapter.title, chapter.pageStart, chapter.pageEnd]), [
    ["Chapter 1. Reliable Applications", 23, 46],
    ["Chapter 2. Data Models", 47, 479],
  ]);
  assert.deepEqual(chapters[0].sections, ["Reliability"]);
});

test("books without chapter bookmarks use top-level entries, then fixed page parts", () => {
  const topLevel = planChapters([
    { title: "Lời nói đầu", page: 3, depth: 0 },
    { title: "Mở đầu về AI", page: 5, depth: 0 },
    { title: "Mô hình nền tảng", page: 30, depth: 0 },
  ], 60);
  assert.deepEqual(topLevel.map((chapter) => chapter.title), ["Mở đầu về AI", "Mô hình nền tảng"]);
  const parts = planChapters([], 45, { chunkPages: 20 });
  assert.deepEqual(parts.map((part) => [part.pageStart, part.pageEnd]), [[1, 20], [21, 40], [41, 45]]);
});

test("AI output is validated: broken steps are dropped, lessons need a question", () => {
  const chapter = { pageStart: 10, pageEnd: 20 };
  const result = normalizeChapterResult({
    summary: "  Tóm tắt  ",
    lessons: [
      { title: "Bài tốt", steps: [
        { type: "concept", title: "Ý", body: "Nội dung", page: 12 },
        { type: "mcq", question: "?", options: ["A", "B", "C"], answer: "C", page: 99 },
        { type: "mcq", question: "?", options: ["A"], answer: 0 },
        { type: "fill", sentence: "Thiếu chỗ trống", answer: "x" },
        { type: "truefalse", statement: "Đúng không?", answer: "sai" },
        { type: "explain", prompt: "Giải thích", keyPoints: ["a", "b"] },
        { type: "video", url: "x" },
      ] },
      { title: "Chỉ có lý thuyết", steps: [{ type: "concept", body: "Không có câu hỏi" }] },
    ],
  }, chapter);
  assert.equal(result.summary, "Tóm tắt");
  assert.equal(result.lessons.length, 1);
  const steps = result.lessons[0].steps;
  assert.deepEqual(steps.map((step) => step.type), ["concept", "mcq", "truefalse", "explain"]);
  assert.equal(steps[1].answer, 2, "a text answer is mapped to its option index");
  assert.equal(steps[1].page, null, "pages outside the chapter are discarded");
  assert.equal(steps[2].answer, false);
  assert.throws(() => normalizeChapterResult({ lessons: [] }, chapter), /không tạo được/);
  assert.equal(normalizeStep({ type: "fill", sentence: "A __ B", answer: "x" }).sentence, "A ___ B");
});

test("the chapter prompt carries the book, chapter, pages and language", () => {
  const messages = buildChapterMessages({ bookTitle: "DDIA", chapter: { title: "Replication", pageStart: 5, pageEnd: 9, sections: ["Leaders"], text: "[trang 5]\nabc" }, chapterIndex: 4, chapterCount: 11, language: "en" });
  assert.match(messages[0].content, /English/);
  assert.match(messages[1].content, /Chương 5\/11: "Replication" \(trang 5–9\)/);
  assert.match(messages[1].content, /Leaders/);
  assert.match(messages[1].content, /keyIdeas/);
  assert.doesNotMatch(messages[1].content, /"fill"|"explain"/, "new courses are multiple-choice first");
  assert.doesNotMatch(messages[1].content, /sách học tiếng/);
  const japanese = buildChapterMessages({ bookTitle: "Minna", chapter: { title: "Bài 1", pageStart: 1, pageEnd: 9, text: "abc" }, chapterIndex: 0, chapterCount: 25, school: "japanese" });
  assert.match(japanese[1].content, /sách học tiếng Nhật/);
  assert.match(japanese[1].content, /romaji/);
});

const mcq = (question, answer = 1) => ({ type: "mcq", question, options: ["A", "B", "C", "D"], answer, explanation: "vì vậy" });

test("chapters get key ideas and an automatic multiple-choice review lesson", () => {
  const chapter = { pageStart: 1, pageEnd: 50 };
  const raw = {
    summary: "Chương nói về sao chép.",
    keyIdeas: [{ title: "Leader nhận mọi lần ghi", detail: "Follower sao chép log.", page: 3 }, "Ý dạng chuỗi", { detail: "thiếu tiêu đề" }],
    lessons: [
      { title: "Bài 1", steps: [{ type: "concept", title: "Leader", body: "Một nút nhận ghi" }, mcq("q1"), mcq("q2"), { type: "truefalse", statement: "s1", answer: true }] },
      { title: "Bài 2", steps: [{ type: "concept", body: "Follower" }, mcq("q3"), mcq("q4")] },
    ],
  };
  const result = normalizeChapterResult(raw, chapter);
  assert.deepEqual(result.keyIdeas.map((idea) => idea.title), ["Leader nhận mọi lần ghi", "Ý dạng chuỗi"]);
  assert.equal(result.keyIdeas[0].page, 3);
  const review = result.lessons.at(-1);
  assert.equal(review.review, true);
  assert.equal(review.title, "Ôn tập chương");
  assert.equal(review.steps[0].type, "concept");
  const questions = review.steps.slice(1);
  assert.deepEqual(questions.map((step) => step.question || step.statement), ["q1", "q3", "q2", "q4", "s1"], "questions are taken round-robin across lessons");
  const originalIds = new Set(result.lessons.slice(0, 2).flatMap((lesson) => lesson.steps.map((step) => step.id)));
  assert.ok(questions.every((step) => !originalIds.has(step.id)), "review steps get their own ids");

  const noIdeas = normalizeChapterResult({ lessons: raw.lessons }, chapter);
  assert.deepEqual(noIdeas.keyIdeas.map((idea) => idea.title), ["Leader", "Follower"], "concepts become key ideas when the AI gives none");
});

test("progress summary points to the next lesson; knowledge map lists chapters, key ideas and lessons", () => {
  const course = {
    title: "Sách", author: "Tác giả", pageCount: 100,
    stages: [
      { id: "s1", title: "Chương 1", status: "ready", summary: "Tóm tắt", pageStart: 1, pageEnd: 9, keyIdeas: [{ title: "Ý A", detail: "Chi tiết A", page: 2 }],
        lessons: [{ id: "l1", title: "Bài 1", goal: "g", steps: [{ type: "concept", title: "Khái niệm", body: "Thân", example: "Ví dụ", page: 3 }, mcq("q")] }, { id: "l2", title: "Bài 2", steps: [mcq("q")] }] },
      { id: "s2", title: "Chương 2", status: "error", lessons: [] },
    ],
  };
  const progress = { lessons: { l1: { completedAt: "2026-01-01" } }, xp: 10 };
  const summary = summarizeProgress(course, progress);
  assert.deepEqual([summary.lessonsDone, summary.lessonCount, summary.percent], [1, 2, 50]);
  assert.deepEqual(summary.nextLesson, { id: "l2", title: "Bài 2", stageTitle: "Chương 1", stageIndex: 0 });

  const map = buildKnowledgeMap(course, progress, { documentId: "doc" });
  const byLabel = Object.fromEntries(map.nodes.map((node) => [node.data.label, node]));
  assert.equal(map.id, "doc");
  assert.equal(byLabel["Sách"].id, "root");
  assert.equal(byLabel["Chương 1"].data.parentId, "root");
  assert.equal(byLabel["Chương 2"], undefined, "chapters that are not ready are skipped");
  assert.equal(byLabel["Ý A"].data.parentId, byLabel["Chương 1"].id);
  assert.match(byLabel["Ý A"].data.note, /Chi tiết A[\s\S]*tr\. 2/);
  assert.equal(byLabel["Bài học (1/2)"].data.collapsed, true);
  assert.equal(byLabel["Bài 1"].data.checked, true);
  assert.equal(byLabel["Bài 2"].data.checked, false);
  assert.match(byLabel["Khái niệm"].data.note, /Thân[\s\S]*Ví dụ: Ví dụ/);
});

test("XP, review XP and daily streaks", () => {
  const lesson = { id: "l1", steps: [{ type: "concept" }, { type: "mcq" }, { type: "fill" }] };
  const first = completeLesson(emptyProgress("c"), lesson, { firstTryCorrect: 5, mistakes: 1 });
  assert.equal(first.xp, 14, "10 + 2 per question answered right first time (capped)");
  const again = completeLesson(first.progress, lesson, { firstTryCorrect: 2 });
  assert.equal(again.xp, 5);
  assert.equal(again.progress.lessons.l1.attempts, 2);

  let learner = addXp(emptyLearner(), 10, "2026-11-10");
  learner = addXp(learner, 10, "2026-11-11");
  learner = addXp(learner, 5, "2026-11-11");
  assert.equal(learner.streak, 2);
  assert.equal(learner.days["2026-11-11"], 15);
  assert.equal(currentStreak(learner, "2026-11-12"), 2);
  assert.equal(currentStreak(learner, "2026-11-14"), 0);
  assert.equal(addXp(learner, 1, "2026-11-20").streak, 1);
});

test("grading results are clamped and the keyword fallback works offline", () => {
  const step = { keyPoints: ["sao chép dữ liệu sang nhiều máy", "chịu lỗi khi một máy hỏng", "đọc nhanh hơn"] };
  assert.deepEqual(normalizeGrade({ score: 140, covered: [1, 9] }, step), { score: 100, passed: true, covered: [0], feedback: "Bạn đã nắm được ý chính.", tip: "" });
  const offline = gradeByKeywords(step, "Replication là sao chép dữ liệu sang nhiều máy để chịu lỗi khi một máy hỏng.");
  assert.deepEqual(offline.covered, [0, 1]);
  assert.equal(offline.passed, true);
});

test("JSON from chatty models is still parsed", () => {
  assert.deepEqual(parseJsonLoose("```json\n{\"a\":1}\n```"), { a: 1 });
  assert.deepEqual(parseJsonLoose("Đây là kết quả: {\"a\": [1]} chúc vui"), { a: [1] });
  assert.throws(() => parseJsonLoose("không có json"), /JSON/);
});

test("OpenAI-compatible client: auth header, JSON mode fallback and clear errors", async () => {
  const env = { AI_BASE_URL: "http://proxy.test/v1/", AI_API_KEY: "k", AI_MODEL: "gemini-3.8-flash-high" };
  const calls = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, auth: options.headers.Authorization, format: body.response_format });
    if (body.response_format) return { ok: false, status: 400, json: async () => ({ error: { message: "response_format unsupported" } }) };
    return { ok: true, status: 200, json: async () => ({ model: body.model, choices: [{ message: { content: "{\"ok\":true}" } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }) };
  };
  const result = await runOpenAiChat({ messages: [], json: true, env, fetchImpl });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(calls[0].url, "http://proxy.test/v1/chat/completions");
  assert.equal(calls[0].auth, "Bearer k");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].format, undefined);

  const denied = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(runOpenAiChat({ messages: [], env, fetchImpl: denied }), /API key/);
  await assert.rejects(runOpenAiChat({ messages: [], env: {} }), /AI_BASE_URL/);
  const offline = async () => { throw new TypeError("fetch failed"); };
  await assert.rejects(runOpenAiChat({ messages: [], env, fetchImpl: offline }), /proxy đã chạy chưa/);
});

test("provider choice: an OpenAI-compatible endpoint wins unless Cloudflare is forced", () => {
  assert.equal(activeProvider({ AI_BASE_URL: "http://x/v1", AI_MODEL: "m" }), "openai");
  assert.equal(activeProvider({ AI_PROVIDER: "cloudflare", AI_BASE_URL: "http://x/v1", AI_MODEL: "m", CLOUDFLARE_ACCOUNT_ID: "a", CLOUDFLARE_AI_TOKEN: "t" }), "cloudflare");
  assert.equal(activeProvider({ AI_PROVIDER: "cloudflare", AI_BASE_URL: "http://x/v1", AI_MODEL: "m" }), "openai");
  assert.equal(activeProvider({}), "none");
});

test("example courses are imported once for the local owner and stay deleted", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createFileStore } = await import("../storage/fileStore.js");
  const { setStore } = await import("../storage/index.js");
  const { importExampleCourses } = await import("./examples.js");
  const dir = await mkdtemp(path.join(os.tmpdir(), "examples-"));
  await mkdir(path.join(dir, "examples"));
  await writeFile(path.join(dir, "examples", "demo.json"), JSON.stringify({ id: "demo", title: "Demo", stages: [] }));
  const store = setStore(createFileStore(dir));
  const env = { LOCAL_MODE: "on" };
  assert.deepEqual(await importExampleCourses({ dir: path.join(dir, "examples"), env }), ["Demo"]);
  assert.equal((await store.courses.get("local:owner", "demo")).example, true);
  await store.courses.remove("local:owner", "demo");
  assert.deepEqual(await importExampleCourses({ dir: path.join(dir, "examples"), env }), []);
  assert.equal(await store.courses.get("local:owner", "demo"), null);
  assert.deepEqual(await importExampleCourses({ dir: path.join(dir, "examples"), env: { LOCAL_MODE: "off" } }), []);

  // A newer version replaces the stored copy and keeps progress by chapter + lesson title.
  const v1 = { id: "book", title: "Book", exampleVersion: 1, stages: [{ lessons: [{ id: "old-a", title: "A" }, { id: "old-b", title: "B" }] }] };
  await writeFile(path.join(dir, "examples", "book.json"), JSON.stringify(v1));
  await importExampleCourses({ dir: path.join(dir, "examples"), env });
  await store.courseProgress.save("local:owner", "book", { id: "book", lessons: { "old-a": { completedAt: "x" } }, xp: 10 });
  await writeFile(path.join(dir, "examples", "book.json"), JSON.stringify({ ...v1, exampleVersion: 2, stages: [{ lessons: [{ id: "new-a", title: "A" }, { id: "new-b", title: "B" }] }] }));
  assert.deepEqual(await importExampleCourses({ dir: path.join(dir, "examples"), env }), ["Book (bản mới)"]);
  assert.equal((await store.courses.get("local:owner", "book")).stages[0].lessons[0].id, "new-a");
  assert.deepEqual((await store.courseProgress.get("local:owner", "book")).lessons, { "new-a": { completedAt: "x" } });
  assert.deepEqual(await importExampleCourses({ dir: path.join(dir, "examples"), env }), [], "same version is not imported twice");
});
