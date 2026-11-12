import crypto from "node:crypto";

const short = (value, max) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};
const pageNote = (page) => (page ? `\n(Sách tr. ${page})` : "");

/**
 * Knowledge mind map of a course:
 *   book → chapter (summary in the note)
 *        → key ideas of the chapter (detail in the note)
 *        → "Bài học" (collapsed) → lesson ☑ → concepts (full text in the note)
 */
export const buildKnowledgeMap = (course, progress, { documentId = crypto.randomUUID() } = {}) => {
  const nodes = [];
  const add = (label, parentId, { id = crypto.randomUUID(), ...data } = {}) => {
    nodes.push({ id, type: "topic", position: { x: 0, y: 0 }, data: { label: short(label, 160) || "…", parentId, ...data } });
    return id;
  };
  const doneCount = (lessons) => lessons.filter((lesson) => progress?.lessons?.[lesson.id]?.completedAt).length;

  const rootId = add(course.title, null, { id: "root", icon: "book", note: [course.author && `Tác giả: ${course.author}`, `${course.stages.length} chương · ${course.pageCount || "?"} trang`, "Mind map kiến thức tạo từ lộ trình học."].filter(Boolean).join("\n") });

  course.stages.filter((stage) => stage.status === "ready").forEach((stage) => {
    const lessons = (stage.lessons || []).filter((lesson) => !lesson.review);
    const allLessons = stage.lessons || [];
    const finished = doneCount(allLessons);
    const chapterId = add(stage.title, rootId, {
      note: [stage.summary, stage.pageStart ? `Trang ${stage.pageStart}–${stage.pageEnd}` : "", `Đã học ${finished}/${allLessons.length} bài`].filter(Boolean).join("\n\n"),
      ...(allLessons.length && finished === allLessons.length ? { icon: "check" } : {}),
    });
    const ideas = stage.keyIdeas?.length ? stage.keyIdeas : [];
    ideas.forEach((idea) => add(idea.title, chapterId, { note: `${idea.detail || ""}${pageNote(idea.page)}`.trim() }));

    if (lessons.length) {
      const groupId = add(`Bài học (${doneCount(lessons)}/${lessons.length})`, chapterId, { collapsed: ideas.length > 0, icon: "graduation" });
      lessons.forEach((lesson) => {
        const lessonId = add(lesson.title, groupId, { note: lesson.goal || "", checkbox: true, checked: Boolean(progress?.lessons?.[lesson.id]?.completedAt) });
        lesson.steps.filter((step) => step.type === "concept" && !step.reported).forEach((step) => {
          add(step.title || short(step.body, 70), lessonId, { note: [step.body, step.example && `Ví dụ: ${step.example}`].filter(Boolean).join("\n\n") + pageNote(step.page) });
        });
      });
    }
  });

  return {
    version: 7,
    id: documentId,
    title: `Kiến thức: ${course.title}`.slice(0, 200),
    layout: "horizontal",
    folder: "Khóa học",
    settings: { styleSheet: "ocean", checkboxes: true, spacing: "normal" },
    relations: {},
    crossLinks: [],
    nodes,
  };
};
