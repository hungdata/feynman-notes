import { IMAGE_NODE_WIDTH } from "./constants.js";

export const getImageNoteHeight = (note, width = IMAGE_NODE_WIDTH) => {
  const value = String(note || "").trim();
  if (!value) return 0;
  const charactersPerLine = Math.max(12, Math.floor((Math.max(80, Number(width) || IMAGE_NODE_WIDTH) - 24) / 7));
  const lines = value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
  return 20 + Math.min(6, lines) * 18;
};

export const getImageNodeSize = (naturalWidth, naturalHeight, width = IMAGE_NODE_WIDTH, note = "") => {
  const safeWidth = Math.max(1, Number(naturalWidth) || 4);
  const safeHeight = Math.max(1, Number(naturalHeight) || 3);
  return {
    width,
    height: Math.min(1200, Math.max(60, width * safeHeight / safeWidth)) + getImageNoteHeight(note, width),
  };
};
