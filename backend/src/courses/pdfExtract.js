/**
 * Reads a PDF book and splits it into chapters.
 *
 * Chapters come from the PDF bookmarks (outline) when possible: entries named
 * "Chapter …"/"Chương …", otherwise the top-level bookmarks without front
 * matter. Books without bookmarks are split into ~20-page parts.
 */

export const MAX_PDF_BYTES = 80 * 1024 * 1024;
const FRONT_MATTER = /^(cover|bìa|copyright|table of contents|contents|mục lục|index|chỉ mục|about (this|the) (book|author)s?|preface|lời nói đầu|foreword|dedication|acknowledg|colophon|title page|praise|also by|bibliography|glossary|references|tài liệu tham khảo)/i;
const CHAPTER_PATTERN = /^(chapter|chương|chuong|chap\.?|bài|lesson|unit)\s*[\divxlc]+/i;
const NUMBERED_PATTERN = /^\d{1,2}[.:)\s-]+\S/;

export class PdfReadError extends Error {
  constructor(message) {
    super(message);
    this.name = "PdfReadError";
    this.status = 400;
  }
}

export const isPdfBuffer = (buffer) => Buffer.isBuffer(buffer) && buffer.subarray(0, 1024).toString("latin1").includes("%PDF-");

const cleanTitle = (value) => String(value || "").replace(/\s+/g, " ").trim().slice(0, 200);

/**
 * Pure planner: outline entries `{ title, page, depth }` (1-based pages) →
 * chapters `{ title, pageStart, pageEnd, sections: [titles] }`.
 */
export const planChapters = (entries, pageCount, { chunkPages = 20 } = {}) => {
  const valid = entries
    .filter((entry) => Number.isInteger(entry.page) && entry.page >= 1 && entry.page <= pageCount && cleanTitle(entry.title))
    .map((entry) => ({ ...entry, title: cleanTitle(entry.title) }));

  const pickLevel = () => {
    const named = valid.filter((entry) => CHAPTER_PATTERN.test(entry.title));
    if (named.length >= 2) {
      const depth = Math.min(...named.map((entry) => entry.depth));
      return named.filter((entry) => entry.depth === depth);
    }
    for (let depth = 0; depth <= 2; depth += 1) {
      const level = valid.filter((entry) => entry.depth === depth && !FRONT_MATTER.test(entry.title) && !/^part\s|^phần\s/i.test(entry.title));
      if (level.length >= 2) return level;
    }
    const numbered = valid.filter((entry) => NUMBERED_PATTERN.test(entry.title));
    return numbered.length >= 2 ? numbered : [];
  };

  const chosen = pickLevel().sort((a, b) => a.page - b.page);
  const unique = chosen.filter((entry, index) => index === 0 || entry.page !== chosen[index - 1].page);
  if (unique.length >= 2) {
    return unique.map((entry, index) => {
      const next = unique[index + 1];
      // The last chapter ends at the next top-level bookmark (e.g. "Index") or the book end.
      const following = valid.filter((item) => item.page > entry.page && item.depth <= entry.depth).sort((a, b) => a.page - b.page)[0];
      const pageEnd = next ? Math.max(entry.page, next.page - 1) : following ? Math.max(entry.page, following.page - 1) : pageCount;
      const sections = valid
        .filter((item) => item.depth === entry.depth + 1 && item.page >= entry.page && item.page <= pageEnd && !/^summary$|^tóm tắt$/i.test(item.title))
        .map((item) => item.title);
      return { title: entry.title, pageStart: entry.page, pageEnd, sections };
    });
  }

  const parts = [];
  for (let start = 1; start <= pageCount; start += chunkPages) {
    parts.push({ title: `Phần ${parts.length + 1} (trang ${start}–${Math.min(pageCount, start + chunkPages - 1)})`, pageStart: start, pageEnd: Math.min(pageCount, start + chunkPages - 1), sections: [] });
  }
  return parts;
};

const loadPdfjs = async () => {
  try {
    return await import("unpdf");
  } catch (error) {
    throw new PdfReadError(`Không tải được bộ đọc PDF (cần Node.js 22 trở lên): ${error.message}`);
  }
};

const flattenOutline = async (pdf, items, depth = 0, output = []) => {
  for (const item of items || []) {
    let page = null;
    try {
      const destination = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      if (Array.isArray(destination) && destination[0]) {
        page = typeof destination[0] === "number" ? destination[0] + 1 : (await pdf.getPageIndex(destination[0])) + 1;
      }
    } catch { /* bookmark without a usable target */ }
    output.push({ title: item.title, page, depth });
    if (item.items?.length) await flattenOutline(pdf, item.items, depth + 1, output);
  }
  return output;
};

const pageText = async (pdf, pageNumber) => {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  let text = "";
  for (const item of content.items) {
    if (typeof item.str !== "string") continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  // Join words that were hyphenated across lines ("com‐ putation").
  return text.replace(/[‐-]\n(\p{Ll})/gu, "$1").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
};

/**
 * Extracts metadata, chapters and the text of every chapter.
 * `onProgress(fraction)` is called while pages are read.
 */
export const extractBook = async (buffer, { onProgress } = {}) => {
  if (!isPdfBuffer(buffer)) throw new PdfReadError("Tệp không phải PDF hợp lệ.");
  const { getDocumentProxy } = await loadPdfjs();
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch (error) {
    throw new PdfReadError(/password/i.test(error.message) ? "PDF có mật khẩu, hãy mở khóa rồi tải lại." : "Không đọc được PDF này.");
  }
  const pageCount = pdf.numPages;
  let title = "";
  let author = "";
  try {
    const meta = await pdf.getMetadata();
    title = cleanTitle(meta?.info?.Title);
    author = cleanTitle(meta?.info?.Author);
  } catch { /* metadata is optional */ }

  const outline = await pdf.getOutline().catch(() => null);
  const entries = outline ? await flattenOutline(pdf, outline) : [];
  const chapters = planChapters(entries, pageCount);

  const texts = new Array(pageCount + 1).fill("");
  let characters = 0;
  for (let page = 1; page <= pageCount; page += 1) {
    texts[page] = await pageText(pdf, page);
    characters += texts[page].length;
    if (page % 20 === 0) onProgress?.(page / pageCount);
  }
  await pdf.destroy?.();
  if (characters < pageCount * 80) {
    throw new PdfReadError("PDF gần như không có chữ (có thể là sách scan dạng ảnh). Hãy dùng bản PDF có thể bôi đen chữ.");
  }

  return {
    pageCount,
    title,
    author,
    chapters: chapters
      .map((chapter) => ({
        ...chapter,
        text: texts.slice(chapter.pageStart, chapter.pageEnd + 1)
          .map((text, index) => `[trang ${chapter.pageStart + index}]\n${text}`)
          .join("\n\n"),
      }))
      .filter((chapter) => chapter.text.replace(/\[trang \d+\]/g, "").trim().length > 400),
  };
};
