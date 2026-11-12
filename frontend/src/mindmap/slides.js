import { getDescendantIds } from "./layout.js";

/** Slides: the whole map first, then every first-level branch. */
export const buildSlides = (nodes) => {
  const topics = nodes.filter((node) => !node.data.hidden);
  const roots = topics.filter((node) => !node.data.parentId);
  const slides = [{ id: "overview", title: "Toàn cảnh", ids: topics.map((node) => node.id) }];
  roots.forEach((root) => {
    topics.filter((node) => node.data.parentId === root.id).forEach((branch) => {
      const ids = getDescendantIds(topics, branch.id);
      ids.add(branch.id);
      ids.add(root.id);
      slides.push({ id: branch.id, title: branch.data.label || branch.data.caption || "Nhánh", ids: [...ids] });
    });
  });
  return slides;
};
