/** Answer checking and roadmap order (pure, unit-tested). */

export const normalizeAnswer = (value) => String(value ?? "")
  .toLocaleLowerCase("vi")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const distance = (a, b) => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = saved;
    }
  }
  return previous[b.length];
};

/** Fill-in-the-blank: ignores case, accents and punctuation; allows one typo in longer words. */
export const isFillCorrect = (step, input) => {
  const given = normalizeAnswer(input);
  if (!given) return false;
  return [step.answer, ...(step.accept || [])].map(normalizeAnswer).filter(Boolean)
    .some((expected) => expected === given || (expected.length >= 5 && distance(expected, given) <= 1));
};

export const checkStep = (step, value) => {
  if (step.type === "mcq") return value === step.answer;
  if (step.type === "truefalse") return value === step.answer;
  if (step.type === "fill") return isFillCorrect(step, value);
  return true;
};

/** Lessons of ready chapters in order, with done / current / locked state. */
export const roadmapOrder = (course, progress, { free = false } = {}) => {
  const items = [];
  (course?.stages || []).forEach((stage) => {
    if (stage.status !== "ready") return;
    (stage.lessons || []).forEach((lesson) => items.push({ stage, lesson, done: Boolean(progress?.lessons?.[lesson.id]?.completedAt) }));
  });
  const currentIndex = items.findIndex((item) => !item.done);
  return items.map((item, index) => ({
    ...item,
    state: item.done ? "done" : index === currentIndex ? "current" : free ? "open" : "locked",
  }));
};

export const nextLessonAfter = (course, progress, lessonId) => {
  const order = roadmapOrder(course, progress, { free: true });
  const index = order.findIndex((item) => item.lesson.id === lessonId);
  return order.slice(index + 1).find((item) => !item.done) || order.find((item) => !item.done) || null;
};

/** Random order of option indexes (Fisher–Yates); `random` is injectable for tests. */
export const shuffledOrder = (length, random = Math.random) => {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
};

export const OPTION_LETTERS = ["A", "B", "C", "D", "E"];
