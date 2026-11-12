/**
 * Background characters of the campus: friends reading, a class listening and
 * a teacher at a chalkboard. All original drawings; each one is placed with
 * its origin at the seat (sitting) or the feet (standing).
 */

const OpenBook = ({ x, y, cover = "#2f6fed", flip = false }) => (
  <g transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""}`}>
    <path d="M0 0 L11 -5 L12 6 L1 10 Z" fill={cover} />
    <path d="M1 -1 L11 -6 L11 4 L1 8 Z" fill="#fff" />
    <path d="M1 -1 L-8 -5 L-8 5 L1 8 Z" fill="#f4f1ea" />
    <path className="pp-page" d="M1 -1 L-6 -4 L-6 5 L1 8 Z" fill="#ffffff" />
    <path d="M3 1 H9 M3 3.5 H8" stroke="#c9cede" strokeWidth="0.9" />
  </g>
);

/** Friend sitting (on a bench or step) and reading, facing right; flip to face left. */
export const Reader = ({ x, y, s = 1, flip = false, shirt = "#7c5cff", pants = "#2b3555", skin = "#f3c7a1", hair = "#2b1d14", book = "#e5674d", long = false }) => (
  <g className="pp-person pp-reader" transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <rect x="-2" y="-6" width="26" height="10" rx="5" fill={pants} />
    <rect x="18" y="-2" width="9" height="26" rx="4.5" fill={pants} />
    <rect x="16" y="20" width="15" height="7" rx="3.5" fill="#1b1f2e" />
    {long && <path d="M-11 -48 C-14 -36 -12 -26 -6 -24 L-4 -46 Z" fill={hair} />}
    <rect x="-10" y="-40" width="20" height="38" rx="9" fill={shirt} />
    <g className="pp-head">
      <circle cx="2" cy="-51" r="12" fill={skin} />
      <path d="M-10 -52 C-10 -66 12 -68 14 -54 C8 -58 0 -58 -4 -54 C-6 -51 -8 -50 -10 -52 Z" fill={hair} />
      <circle cx="8.5" cy="-49" r="1.4" fill="#1d2142" />
      <path d="M7 -43 Q9.5 -41.5 12 -43.5" fill="none" stroke="#1d2142" strokeWidth="1.2" strokeLinecap="round" />
    </g>
    <rect x="2" y="-36" width="7" height="22" rx="3.5" fill={shirt} transform="rotate(-50 5 -34)" />
    <OpenBook x={20} y={-26} cover={book} />
    <circle cx="20" cy="-20" r="3.6" fill={skin} />
  </g>
);

/** Student sitting cross-legged on the grass, seen from behind (watching the board). */
export const Listener = ({ x, y, s = 1, shirt = "#0ea5e9", skin = "#d9a27a", hair = "#1f140e", raise = false, bag }) => (
  <g className="pp-person pp-listener" transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="-3" rx="20" ry="7" fill="#2b3555" />
    <rect x="-12" y="-42" width="24" height="40" rx="11" fill={shirt} />
    {bag && <rect x="-9" y="-36" width="18" height="22" rx="6" fill={bag} />}
    {raise && <g className="pp-raise"><rect x="8" y="-74" width="7" height="34" rx="3.5" fill={shirt} /><circle cx="11.5" cy="-76" r="4.5" fill={skin} /></g>}
    <rect x="-4.5" y="-44" width="9" height="6" rx="2" fill={skin} />
    <circle cx="-12.5" cy="-51" r="3.2" fill={skin} />
    <circle cx="12.5" cy="-51" r="3.2" fill={skin} />
    <circle cx="0" cy="-53" r="12.8" fill={hair} />
  </g>
);

/** Teacher standing and pointing at the board on her left. */
export const Teacher = ({ x, y, s = 1 }) => (
  <g className="pp-person pp-teacher" transform={`translate(${x} ${y}) scale(${s})`}>
    <ellipse cx="0" cy="0" rx="20" ry="5" fill="rgb(0 0 0 / 22%)" />
    <rect x="-8" y="-38" width="7" height="36" rx="3.5" fill="#3b3f58" />
    <rect x="2" y="-38" width="7" height="36" rx="3.5" fill="#3b3f58" />
    <rect x="-11" y="-5" width="12" height="6" rx="3" fill="#1b1f2e" />
    <rect x="1" y="-5" width="12" height="6" rx="3" fill="#1b1f2e" />
    <path d="M-15 -36 L-12 -82 C-11 -88 11 -88 12 -82 L15 -36 Z" fill="#14795a" />
    <path d="M-5 -84 L0 -62 L5 -84 Z" fill="#fff8ec" />
    <g className="pp-pointer-arm">
      <rect x="-30" y="-80" width="24" height="7" rx="3.5" fill="#14795a" />
      <circle cx="-31" cy="-76.5" r="4" fill="#e8b48f" />
      <line x1="-31" y1="-77" x2="-66" y2="-96" stroke="#8a5a3b" strokeWidth="2.6" strokeLinecap="round" />
    </g>
    <rect x="6" y="-80" width="7" height="30" rx="3.5" fill="#14795a" />
    <circle cx="9.5" cy="-49" r="4" fill="#e8b48f" />
    <circle cx="0" cy="-97" r="13" fill="#e8b48f" />
    <path d="M-13 -97 C-14 -113 13 -114 13 -99 C9 -104 0 -105 -6 -101 C-9 -99 -11 -96 -13 -97 Z" fill="#6b6f80" />
    <circle cx="6" cy="-112" r="6.5" fill="#6b6f80" />
    <g fill="none" stroke="#1d2142" strokeWidth="1.4">
      <circle cx="-6" cy="-96" r="4" />
      <circle cx="4" cy="-96" r="4" />
      <path d="M-2 -96 H0" />
    </g>
    <path d="M-5 -88 Q-2 -86 1 -88" fill="none" stroke="#1d2142" strokeWidth="1.3" strokeLinecap="round" />
  </g>
);

/** Easel chalkboard with a small chalk mind map. */
export const Chalkboard = ({ x, y }) => (
  <g className="pp-board" transform={`translate(${x} ${y})`}>
    <path d="M10 66 L22 0 M90 66 L78 0 M50 70 L50 40" stroke="#8a5a3b" strokeWidth="4" strokeLinecap="round" />
    <rect x="0" y="0" width="100" height="62" rx="5" fill="#8a5a3b" />
    <rect x="5" y="5" width="90" height="52" rx="3" fill="#2f4f3f" />
    <g stroke="#eef3ea" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.92">
      <circle cx="50" cy="30" r="8" />
      <path d="M42 28 L26 18 M42 33 L24 42 M58 28 L74 18 M58 33 L76 42" />
      <circle cx="21" cy="16" r="4.5" /><circle cx="19" cy="44" r="4.5" /><circle cx="79" cy="16" r="4.5" /><circle cx="81" cy="44" r="4.5" />
    </g>
    <rect x="66" y="56" width="12" height="3" rx="1.5" fill="#f5f5f0" />
  </g>
);

export const Bench = ({ x, y, w = 120 }) => (
  <g className="pp-bench" transform={`translate(${x} ${y})`}>
    <rect x="0" y="-30" width={w} height="6" rx="3" fill="#a06a40" />
    <rect x="0" y="-20" width={w} height="6" rx="3" fill="#a06a40" />
    <rect x="-2" y="0" width={w + 4} height="7" rx="3" fill="#b77a4a" />
    <rect x="8" y="6" width="6" height="22" rx="2" fill="#6b4a2f" />
    <rect x={w - 14} y="6" width="6" height="22" rx="2" fill="#6b4a2f" />
  </g>
);

export const BookStack = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-14" y="-8" width="30" height="8" rx="2" fill="#2f6fed" />
    <rect x="-12" y="-16" width="26" height="8" rx="2" fill="#f5a524" />
    <rect x="-16" y="-24" width="28" height="8" rx="2" fill="#18a058" />
    <path d="M-12 -12 H10 M-14 -4 H12" stroke="rgb(255 255 255 / 55%)" strokeWidth="1.2" />
  </g>
);
