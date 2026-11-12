import { Loader2 } from "lucide-react";
import { coverPalette } from "./format";

/** A course drawn as a book: coloured cover, spine on the left, title set in Lexend. */
const BookCover = ({ course, size = "md", busy = false }) => {
  const palette = coverPalette(course.title);
  const percent = course.learning?.percent ?? null;
  return (
    <div className={`ln-book is-${size}`} style={{ "--book": palette.base, "--book-ink": palette.ink, "--book-band": palette.band }} aria-hidden="true">
      <span className="ln-book-spine" />
      <span className="ln-book-band" />
      <span className="ln-book-title">{course.title}</span>
      {course.author && size !== "sm" && <span className="ln-book-author">{course.author}</span>}
      {busy && <span className="ln-book-busy"><Loader2 className="spin" /></span>}
      {percent !== null && size !== "sm" && percent > 0 && <span className="ln-book-progress"><span style={{ width: `${percent}%` }} /></span>}
    </div>
  );
};

export default BookCover;
