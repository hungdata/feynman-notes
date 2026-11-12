import crypto from "node:crypto";

/**
 * Turning one chapter into bite-sized lessons (Coddy/Duolingo style).
 *
 * Step types:
 *   concept   { title, body, example? }                 one idea, ≤ 80 words
 *   mcq       { question, options[2-5], answer, explanation }
 *   truefalse { statement, answer: boolean, explanation }
 *   fill      { sentence with "___", answer, accept[], explanation }
 *   explain   { prompt, keyPoints[] }                   Feynman: explain in your own words (AI graded)
 * New courses are generated multiple-choice first (concept + mcq, a little
 * true/false); fill and explain stay supported for older courses.
 * Every step can carry `page` (source page in the book). Each chapter also gets
 * `keyIdeas` (for the knowledge mind map) and an automatic review lesson.
 */

export const STEP_TYPES = new Set(["concept", "mcq", "truefalse", "fill", "explain"]);
export const MAX_CHAPTER_CHARACTERS = 180_000;
const LANGUAGE_NAMES = { vi: "tiếng Việt", en: "English" };

/** Schools a course can belong to; language schools get a language-learning prompt. */
export const SCHOOLS = ["general", "english", "japanese", "korean"];
export const normalizeSchool = (value) => (SCHOOLS.includes(value) ? value : "general");
const LANGUAGE_SCHOOLS = {
  english: { name: "tiếng Anh", reading: "phiên âm IPA khi hữu ích" },
  japanese: { name: "tiếng Nhật", reading: "cách đọc hiragana và romaji cho kanji" },
  korean: { name: "tiếng Hàn", reading: "phiên âm Latin (romanization)" },
};

export const buildChapterMessages = ({ bookTitle, chapter, chapterIndex, chapterCount, language = "vi", school = "general" }) => {
  const output = LANGUAGE_NAMES[language] || LANGUAGE_NAMES.vi;
  const text = chapter.text.length > MAX_CHAPTER_CHARACTERS ? `${chapter.text.slice(0, MAX_CHAPTER_CHARACTERS)}\n[…phần còn lại bị lược bớt…]` : chapter.text;
  const system = [
    "Bạn là nhà thiết kế khóa học micro-learning giống Coddy/Duolingo:",
    "mỗi bài chỉ MỘT ý chính, mỗi bước rất nhỏ, dễ vượt qua nhưng buộc người học phải hiểu.",
    "Câu hỏi chủ yếu là trắc nghiệm nhiều lựa chọn để người học chỉ cần bấm, không phải gõ.",
    `Viết toàn bộ nội dung bằng ${output}, giọng thân thiện, câu ngắn, ví dụ đời thường.`,
    "Giữ nguyên thuật ngữ chuyên ngành tiếng Anh trong ngoặc khi cần, ví dụ: sao chép (replication).",
    "Không chép nguyên văn sách quá một câu ngắn; diễn giải bằng lời của bạn.",
    "Chỉ dùng kiến thức có trong đoạn sách được cung cấp. Trả về DUY NHẤT một object JSON hợp lệ.",
  ].join(" ");
  const sections = chapter.sections?.length ? `Các mục trong chương: ${chapter.sections.join(" | ")}` : "";
  const target = LANGUAGE_SCHOOLS[school];
  const languageRules = target ? `
- Đây là sách học ${target.name}. Mỗi bài dạy một nhóm từ vựng, một mẫu câu hoặc một điểm ngữ pháp có trong chương.
- Giữ nguyên từ và câu ${target.name} gốc, kèm ${target.reading} và nghĩa tiếng Việt.
- Câu hỏi trắc nghiệm kiểu: chọn nghĩa đúng của từ, chọn từ/trợ từ điền vào câu, chọn câu dịch đúng, chọn câu đúng ngữ pháp.
- "keyIdeas" là các từ vựng, mẫu câu và điểm ngữ pháp quan trọng nhất của chương.` : "";
  const user = `Sách: "${bookTitle}"
Chương ${chapterIndex + 1}/${chapterCount}: "${chapter.title}" (trang ${chapter.pageStart}–${chapter.pageEnd})
${sections}

Yêu cầu:
- "keyIdeas": 6 đến 12 ý chính của CẢ chương (đủ để vẽ mind map kiến thức), theo thứ tự trong chương. Mỗi ý có "title" tối đa 10 từ, "detail" 1–2 câu (tối đa 45 từ), "page".
- "lessons": 3 đến 6 bài theo thứ tự trong chương, mỗi bài một ý chính, 4 đến 7 bước (steps).
- Mỗi bài: 1–2 bước "concept" (body tối đa 80 từ, có "example" đời thường nếu được) và 3–4 câu hỏi.
- Câu hỏi: hầu hết là "mcq" — 4 lựa chọn ngắn, đúng 1 đáp án, đáp án sai phải hợp lý (lỗi hiểu lầm thường gặp), vị trí đáp án đúng thay đổi giữa các câu. Tối đa 1 câu "truefalse" mỗi bài. Không dùng loại câu hỏi nào khác.
- Mỗi câu hỏi có "explanation" 1–2 câu giải thích vì sao đáp án đúng.
- KHÔNG tạo bài ôn tập cuối chương (hệ thống tự tạo).
- Mỗi bước và mỗi ý chính có "page": số trang trong sách (lấy từ nhãn [trang N]).${languageRules}

Định dạng JSON:
{
  "summary": "tóm tắt chương trong 1–2 câu",
  "keyIdeas": [ { "title": "…", "detail": "…", "page": 25 } ],
  "lessons": [
    {
      "title": "tên bài ngắn",
      "goal": "sau bài này bạn sẽ hiểu …",
      "steps": [
        { "type": "concept", "title": "…", "body": "…", "example": "…", "page": 25 },
        { "type": "mcq", "question": "…", "options": ["…", "…", "…", "…"], "answer": 2, "explanation": "…", "page": 25 },
        { "type": "truefalse", "statement": "…", "answer": false, "explanation": "…", "page": 26 }
      ]
    }
  ]
}

Nội dung chương:
"""
${text}
"""`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
};

const text = (value, max = 1_200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const page = (value, chapter) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number >= (chapter?.pageStart || 1) && number <= (chapter?.pageEnd || Number.MAX_SAFE_INTEGER) ? number : null;
};
const stepId = () => crypto.randomUUID().slice(0, 12);

/** Validates one AI step; returns a clean step or null when unusable. */
export const normalizeStep = (raw, chapter) => {
  if (!raw || typeof raw !== "object" || !STEP_TYPES.has(raw.type)) return null;
  const base = { id: stepId(), type: raw.type, page: page(raw.page, chapter) };
  if (raw.type === "concept") {
    const body = text(raw.body || raw.text || raw.content, 900);
    if (!body) return null;
    return { ...base, title: text(raw.title, 120), body, example: text(raw.example, 500) };
  }
  if (raw.type === "mcq") {
    const options = (Array.isArray(raw.options) ? raw.options : []).map((option) => text(option, 240)).filter(Boolean).slice(0, 5);
    let answer = Number.parseInt(raw.answer, 10);
    if (!Number.isInteger(answer) && typeof raw.answer === "string") answer = options.indexOf(text(raw.answer, 240));
    const question = text(raw.question, 400);
    if (!question || options.length < 2 || !(answer >= 0 && answer < options.length) || new Set(options).size !== options.length) return null;
    return { ...base, question, options, answer, explanation: text(raw.explanation, 600) };
  }
  if (raw.type === "truefalse") {
    const statement = text(raw.statement || raw.question, 400);
    const answer = typeof raw.answer === "boolean" ? raw.answer : ["true", "đúng", "dung", "yes"].includes(String(raw.answer).toLowerCase()) ? true : ["false", "sai", "no"].includes(String(raw.answer).toLowerCase()) ? false : null;
    if (!statement || answer === null) return null;
    return { ...base, statement, answer, explanation: text(raw.explanation, 600) };
  }
  if (raw.type === "fill") {
    const sentence = text(raw.sentence || raw.question, 400).replace(/_{2,}/g, "___");
    const answer = text(raw.answer, 80);
    if (!answer || (sentence.match(/___/g) || []).length !== 1) return null;
    const accept = (Array.isArray(raw.accept) ? raw.accept : []).map((value) => text(value, 80)).filter(Boolean).slice(0, 6);
    return { ...base, sentence, answer, accept, explanation: text(raw.explanation, 600) };
  }
  const prompt = text(raw.prompt || raw.question, 500);
  const keyPoints = (Array.isArray(raw.keyPoints) ? raw.keyPoints : []).map((point) => text(point, 200)).filter(Boolean).slice(0, 6);
  if (!prompt || keyPoints.length < 2) return null;
  return { ...base, prompt, keyPoints };
};

/** Validates the AI answer for a chapter; throws when nothing usable is left. */
const REVIEW_QUESTIONS = 6;

const normalizeKeyIdeas = (raw, chapter) => (Array.isArray(raw) ? raw : [])
  .map((idea) => (typeof idea === "string" ? { title: idea } : idea))
  .map((idea) => ({ title: text(idea?.title, 140), detail: text(idea?.detail || idea?.body, 400), page: page(idea?.page, chapter) }))
  .filter((idea) => idea.title)
  .slice(0, 14);

/** Chapter review built from copies of the chapter's own questions (spread across lessons). */
export const buildReviewLesson = (lessons, { summary = "", keyIdeas = [] } = {}) => {
  const pools = lessons.map((lesson) => lesson.steps.filter((step) => step.type === "mcq" || step.type === "truefalse"));
  const picked = [];
  for (let round = 0; picked.length < REVIEW_QUESTIONS && pools.some((pool) => pool.length > round); round += 1) {
    pools.forEach((pool) => { if (pool[round] && picked.length < REVIEW_QUESTIONS) picked.push(pool[round]); });
  }
  if (picked.length < 3) return null;
  const recap = keyIdeas.length
    ? { id: stepId(), type: "concept", page: keyIdeas[0].page ?? null, title: "Nhìn lại chương", body: keyIdeas.slice(0, 6).map((idea) => `• ${idea.title}`).join("\n"), example: summary }
    : summary ? { id: stepId(), type: "concept", page: null, title: "Nhìn lại chương", body: summary, example: "" } : null;
  const steps = [...(recap ? [recap] : []), ...picked.map((step) => ({ ...step, id: stepId() }))];
  return { id: crypto.randomUUID().slice(0, 12), title: "Ôn tập chương", goal: "Ôn nhanh các ý chính bằng câu hỏi trắc nghiệm.", minutes: Math.max(2, Math.round(steps.length * 0.6)), review: true, steps };
};

export const normalizeChapterResult = (raw, chapter) => {
  const lessons = (Array.isArray(raw?.lessons) ? raw.lessons : []).map((lesson) => {
    const steps = (Array.isArray(lesson?.steps) ? lesson.steps : []).map((step) => normalizeStep(step, chapter)).filter(Boolean).slice(0, 10);
    const hasQuestion = steps.some((step) => step.type !== "concept");
    if (!steps.length || !hasQuestion) return null;
    const minutes = Math.max(2, Math.min(10, Math.round(steps.length * 0.8)));
    return { id: crypto.randomUUID().slice(0, 12), title: text(lesson.title, 120) || "Bài học", goal: text(lesson.goal, 240), minutes, steps };
  }).filter(Boolean).slice(0, 8);
  if (!lessons.length) {
    const error = new Error("AI không tạo được bài học hợp lệ cho chương này.");
    error.retryable = true;
    throw error;
  }
  const summary = text(raw?.summary, 400);
  let keyIdeas = normalizeKeyIdeas(raw?.keyIdeas, chapter);
  // Older or terse answers: fall back to the lesson concepts as key ideas.
  if (!keyIdeas.length) {
    keyIdeas = lessons.flatMap((lesson) => lesson.steps.filter((step) => step.type === "concept" && (step.title || step.body)))
      .map((step) => ({ title: step.title || text(step.body, 80), detail: text(step.body, 300), page: step.page })).slice(0, 12);
  }
  const review = lessons.length > 1 ? buildReviewLesson(lessons, { summary, keyIdeas }) : null;
  return { summary, keyIdeas, lessons: review ? [...lessons, review] : lessons };
};

// ------------------------------------------------------------------ grading --

export const buildGradeMessages = ({ bookTitle, chapterTitle, step, answer, language = "vi" }) => [
  {
    role: "system",
    content: `Bạn là giáo viên chấm bài theo phương pháp Feynman, nhận xét bằng ${LANGUAGE_NAMES[language] || LANGUAGE_NAMES.vi}, ngắn gọn, khích lệ nhưng trung thực. Chỉ trả về JSON.`,
  },
  {
    role: "user",
    content: `Sách "${bookTitle}", chương "${chapterTitle}".
Yêu cầu cho người học: ${step.prompt}
Các ý chính cần có: ${step.keyPoints.map((point, index) => `${index + 1}. ${point}`).join(" ")}
Câu trả lời của người học:
"""
${String(answer).slice(0, 3_000)}
"""
Chấm điểm 0–100 theo mức độ hiểu đúng và giải thích đơn giản. Trả về:
{ "score": 0-100, "passed": true/false (passed khi score >= 60), "covered": [số thứ tự ý đã nêu], "feedback": "2–3 câu nhận xét", "tip": "1 câu gợi ý cải thiện" }`,
  },
];

export const normalizeGrade = (raw, step) => {
  const score = Math.max(0, Math.min(100, Math.round(Number(raw?.score) || 0)));
  const covered = (Array.isArray(raw?.covered) ? raw.covered : []).map((value) => Number.parseInt(value, 10) - 1).filter((index) => index >= 0 && index < step.keyPoints.length);
  return {
    score,
    passed: typeof raw?.passed === "boolean" ? raw.passed && score >= 50 : score >= 60,
    covered: [...new Set(covered)],
    feedback: text(raw?.feedback, 600) || (score >= 60 ? "Bạn đã nắm được ý chính." : "Câu trả lời còn thiếu vài ý quan trọng."),
    tip: text(raw?.tip, 300),
  };
};

/** Local fallback when no AI is configured: compares key words. */
export const gradeByKeywords = (step, answer) => {
  const normalize = (value) => String(value || "").toLocaleLowerCase("vi").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
  const words = normalize(answer);
  const covered = step.keyPoints.map((point, index) => {
    const keys = normalize(point).split(/[^a-z0-9]+/).filter((word) => word.length > 3);
    const hits = keys.filter((key) => words.includes(key)).length;
    return keys.length && hits / keys.length >= 0.4 ? index : -1;
  }).filter((index) => index >= 0);
  const score = Math.round((covered.length / step.keyPoints.length) * 100);
  return { score, passed: score >= 50, covered, feedback: "Chấm tự động theo từ khóa (AI chưa được cấu hình). Hãy tự so với các ý chính bên dưới.", tip: "", offline: true };
};
