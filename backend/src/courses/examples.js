import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "../config/env.js";
import { isLocalModeEnabled, LOCAL_USER } from "../auth/localMode.js";
import { getStore } from "../storage/index.js";

/** Keeps progress when an example course is replaced by a newer version (matched by chapter + lesson title). */
const carryProgress = (oldCourse, newCourse, progress) => {
  const key = (stageIndex, lesson) => `${stageIndex}|${lesson.title}`;
  const newIds = new Map();
  newCourse.stages.forEach((stage, index) => (stage.lessons || []).forEach((lesson) => newIds.set(key(index, lesson), lesson.id)));
  const lessons = {};
  oldCourse.stages.forEach((stage, index) => (stage.lessons || []).forEach((lesson) => {
    const record = progress.lessons?.[lesson.id];
    const target = newIds.get(key(index, lesson)) || (newCourse.stages[index]?.lessons?.some((item) => item.id === lesson.id) ? lesson.id : null);
    if (record && target) lessons[target] = record;
  }));
  return { ...progress, lessons };
};

/**
 * Example courses: any `*.json` course file in `<DATA_DIR>/examples/` is added
 * once to the local owner's library (local mode only). A file with a higher
 * `exampleVersion` replaces the stored copy (progress is carried over).
 * Deleting the course in the app keeps it deleted – imported ids are remembered.
 */
export const importExampleCourses = async ({ dir = path.join(DATA_DIR, "examples"), ownerId = LOCAL_USER.id, env = process.env } = {}) => {
  if (!isLocalModeEnabled(env)) return [];
  let files;
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const store = getStore();
  const marker = (await store.learners.get(ownerId, "examples")) || { imported: [] };
  const changed = [];
  for (const name of files) {
    try {
      const course = JSON.parse(await readFile(path.join(dir, name), "utf8"));
      if (!course?.id || !Array.isArray(course.stages)) continue;
      const existing = await store.courses.get(ownerId, course.id);
      if (marker.imported.includes(course.id)) {
        if (!existing || (course.exampleVersion || 1) <= (existing.exampleVersion || 1)) continue;
        const progress = await store.courseProgress.get(ownerId, course.id);
        if (progress) await store.courseProgress.save(ownerId, course.id, carryProgress(existing, course, progress));
        await store.courses.save(ownerId, course.id, { ...course, example: true, status: "ready", mindMapId: existing.mindMapId || "" });
        changed.push(`${course.title || course.id} (bản mới)`);
        continue;
      }
      if (!existing) {
        await store.courses.save(ownerId, course.id, { ...course, example: true, status: "ready" });
        changed.push(course.title || course.id);
      }
      marker.imported.push(course.id);
    } catch (error) {
      console.warn(`Bỏ qua khóa học ví dụ ${name}: ${error.message}`);
    }
  }
  await store.learners.save(ownerId, "examples", marker);
  return changed;
};
