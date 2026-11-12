/** Small line drawings for the layout picker (same idea as SimpleMind's layout icons). */
const GLYPHS = {
  horizontal: "M10 12h4M14 12c3 0 3-5 6-5M14 12c3 0 3 5 6 5M10 12c-3 0-3-5-6-5M10 12c-3 0-3 5-6 5",
  right: "M4 12h4M8 12c4 0 4-6 8-6M8 12h8M8 12c4 0 4 6 8 6",
  vertical: "M12 10v4M12 14c0 3-6 3-6 6M12 14c0 3 6 3 6 6M12 10c0-3-6-3-6-6M12 10c0-3 6-3 6-6",
  topDown: "M12 4v5M12 9H5v5M12 9h7v5M12 9v5",
  list: "M5 5h8M7 5v14M7 10h9M7 15h9M7 19h6",
  linear: "M3 8h18M7 8v10M13 8v10M19 8v10",
  radial: "M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 9V4M12 15v5M9 12H4M15 12h5",
  matrix: "M10 3h4M12 3v3M5 7h5v5H5zM14 7h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z",
  freeForm: "M6 7l5 4M13 13l5-3M12 13l-2 6M5 6.5a1 1 0 1 0 0 .1M19 9.5a1 1 0 1 0 0 .1M9 19.5a1 1 0 1 0 0 .1",
};

const LayoutGlyph = ({ layout, className = "" }) => (
  <svg viewBox="0 0 24 24" className={`layout-glyph ${className}`} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={GLYPHS[layout] || GLYPHS.horizontal} />
  </svg>
);

export default LayoutGlyph;
