/** XP, streak and per-lesson progress (pure functions, easy to test). */

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const LESSON_XP = 10;
export const REVIEW_XP = 5;
export const PERFECT_BONUS_PER_QUESTION = 2;

export const emptyProgress = (courseId) => ({ id: courseId, lessons: {}, lastLessonId: "", xp: 0, explain: {}, reported: [] });
export const emptyLearner = () => ({ xp: 0, streak: 0, bestStreak: 0, lastDay: "", days: {}, dailyGoal: 30 });

const previousDay = (day) => {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

export const todayFor = (value) => (DAY_PATTERN.test(String(value || "")) ? value : new Date().toISOString().slice(0, 10));

/** Adds XP to the learner for `day` and keeps the daily streak. */
export const addXp = (learner, xp, day) => {
  const next = { ...emptyLearner(), ...learner, days: { ...(learner?.days || {}) } };
  next.xp += xp;
  next.days[day] = (next.days[day] || 0) + xp;
  if (next.lastDay !== day) {
    next.streak = next.lastDay === previousDay(day) ? next.streak + 1 : 1;
    next.lastDay = day;
  }
  next.bestStreak = Math.max(next.bestStreak, next.streak);
  // Keep the last 90 days only.
  next.days = Object.fromEntries(Object.entries(next.days).sort(([a], [b]) => b.localeCompare(a)).slice(0, 90));
  return next;
};

/** Effective streak shown to the user: broken if the last active day is older than yesterday. */
export const currentStreak = (learner, day) => {
  if (!learner?.lastDay) return 0;
  return learner.lastDay === day || learner.lastDay === previousDay(day) ? learner.streak : 0;
};

/** Records a finished lesson and returns the XP earned. */
export const completeLesson = (progress, lesson, { firstTryCorrect = 0, mistakes = 0 } = {}) => {
  const questions = lesson.steps.filter((step) => step.type !== "concept").length;
  const already = Boolean(progress.lessons[lesson.id]?.completedAt);
  const perfect = Math.max(0, Math.min(questions, Number(firstTryCorrect) || 0));
  const xp = already ? REVIEW_XP : LESSON_XP + perfect * PERFECT_BONUS_PER_QUESTION;
  const previous = progress.lessons[lesson.id] || {};
  return {
    xp,
    progress: {
      ...progress,
      xp: (progress.xp || 0) + xp,
      lastLessonId: lesson.id,
      lastStudiedAt: new Date().toISOString(),
      lessons: {
        ...progress.lessons,
        [lesson.id]: {
          completedAt: previous.completedAt || new Date().toISOString(),
          lastReviewedAt: new Date().toISOString(),
          attempts: (previous.attempts || 0) + 1,
          bestMistakes: Math.min(previous.bestMistakes ?? Number.MAX_SAFE_INTEGER, Math.max(0, Number(mistakes) || 0)),
          xp: (previous.xp || 0) + xp,
        },
      },
    },
  };
};

export const summarizeProgress = (course, progress) => {
  const ordered = (course.stages || []).filter((stage) => stage.status === "ready")
    .flatMap((stage) => (stage.lessons || []).map((lesson) => ({ stage, lesson })));
  const done = ordered.filter(({ lesson }) => progress?.lessons?.[lesson.id]?.completedAt).length;
  const next = ordered.find(({ lesson }) => !progress?.lessons?.[lesson.id]?.completedAt);
  return {
    lessonCount: ordered.length,
    lessonsDone: done,
    percent: ordered.length ? Math.round((done / ordered.length) * 100) : 0,
    xp: progress?.xp || 0,
    lastStudiedAt: progress?.lastStudiedAt || "",
    nextLesson: next ? { id: next.lesson.id, title: next.lesson.title, stageTitle: next.stage.title, stageIndex: course.stages.indexOf(next.stage) } : null,
  };
};
