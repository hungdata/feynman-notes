import { Bench, BookStack, Reader } from "./People";

/** Clickable building group, same behaviour as the schools on the main campus. */
const Building = ({ id, label, color, deep, onPick, children }) => (
  <g
    className={`cp-school is-lang is-${id}`}
    style={{ "--school": color, "--school-deep": deep }}
    role="link"
    tabIndex={0}
    aria-label={label}
    onClick={() => onPick(id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(id); } }}
  >
    {children}
  </g>
);

const Sign = ({ x, y, w, label }) => (
  <g className="cp-sign">
    <rect x={x} y={y} width={w} height="26" rx="6" />
    <text x={x + w / 2} y={y + 17.5} textAnchor="middle">{label}</text>
  </g>
);

const Win = ({ x, y, w = 26, h = 32 }) => (
  <g className="cp-window"><rect x={x} y={y} width={w} height={h} rx="3" /><path d={`M${x + w / 2} ${y + 2}V${y + h - 2}M${x + 2} ${y + h / 2}H${x + w - 2}`} /></g>
);

const Sakura = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} className="lq-sakura">
    <path d="M-4 0 L-3 -38 L-14 -54 M-3 -38 L6 -58" stroke="#6b4a2f" strokeWidth="6" strokeLinecap="round" fill="none" />
    <circle cx="-16" cy="-60" r="20" /><circle cx="8" cy="-70" r="24" /><circle cx="22" cy="-52" r="17" /><circle cx="-4" cy="-46" r="16" />
    <circle cx="-22" cy="-44" r="3" className="is-petal" /><circle cx="26" cy="-36" r="2.5" className="is-petal" />
  </g>
);

const Pine = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-4" y="-22" width="8" height="24" fill="#6b4a2f" />
    <path d="M0 -92 L26 -50 L12 -50 L32 -18 L-32 -18 L-12 -50 L-26 -50 Z" className="lq-pine" />
  </g>
);

const LanguageQuarter = ({ onPick, counts }) => (
  <svg className="cp-zone-svg lq-scene" viewBox="0 150 1200 372" role="group" aria-label="Khu ngoại ngữ: chọn trường để vào">
    <path className="lq-walk" d="M0 478 H1200 V506 H0 Z" />
    <path className="lq-walk" d="M196 430 H226 L232 478 H190 Z M586 432 H614 L620 478 H580 Z M976 432 H1004 L1010 478 H970 Z" />

    {/* English: brick building with a white portico */}
    <Building id="english" label={`Trường Tiếng Anh: ${counts.english} lớp`} color="#c0392b" deep="#922b21" onPick={onPick}>
      <ellipse className="cp-school-halo" cx="210" cy="320" rx="190" ry="150" />
      <rect x="64" y="236" width="292" height="196" rx="3" className="lq-brick" />
      <path d="M64 268 H356 M64 300 H356 M64 332 H356 M64 364 H356 M64 396 H356" className="lq-brick-lines" />
      <polygon points="84,238 210,176 336,238" className="lq-pediment" />
      <text x="210" y="226" textAnchor="middle" className="lq-emblem">ABC</text>
      <rect x="78" y="236" width="264" height="10" className="lq-cornice" />
      {[104, 150, 258, 304].map((x) => <rect key={x} x={x} y="246" width="14" height="186" rx="2" className="lq-column" />)}
      <Win x={124} y={276} /><Win x={270} y={276} /><Win x={124} y={348} /><Win x={270} y={348} />
      <Sign x={156} y={266} w={108} label="Tiếng Anh" />
      <rect x="186" y="360" width="48" height="72" rx="4" className="lq-door is-navy" />
      <circle cx="226" cy="398" r="3" fill="#f5c542" />
      <rect x="170" y="430" width="80" height="8" rx="2" className="cp-step" />
      <g transform="translate(372 432)"><rect x="-10" y="-46" width="20" height="46" rx="4" fill="#c0392b" /><path d="M-10 -44 Q0 -58 10 -44 Z" fill="#c0392b" /><rect x="-6" y="-34" width="12" height="3" fill="#2b1d14" /></g>
    </Building>

    {/* Japanese: wooden school with layered roofs */}
    <Building id="japanese" label={`Trường Tiếng Nhật: ${counts.japanese} lớp`} color="#d9480f" deep="#a63a0c" onPick={onPick}>
      <ellipse className="cp-school-halo" cx="600" cy="320" rx="190" ry="160" />
      <rect x="536" y="186" width="128" height="62" className="lq-wood-wall" />
      <path d="M512 196 Q600 168 688 196 L676 182 Q600 156 524 182 Z" className="lq-tile-roof" />
      <circle cx="600" cy="218" r="17" className="lq-emblem-plate" /><text x="600" y="225" textAnchor="middle" className="lq-emblem is-dark">あ</text>
      <rect x="466" y="262" width="268" height="170" className="lq-wood-wall" />
      <path d="M440 270 Q600 236 760 270 L744 250 Q600 220 456 250 Z" className="lq-tile-roof" />
      {[474, 530, 670, 726].map((x) => <rect key={x} x={x - 4} y="262" width="8" height="170" className="lq-beam" />)}
      <g className="lq-shoji"><rect x="486" y="292" width="40" height="52" /><rect x="674" y="292" width="40" height="52" /><rect x="486" y="360" width="40" height="52" /><rect x="674" y="360" width="40" height="52" /></g>
      <Sign x={548} y={282} w={104} label="Tiếng Nhật" />
      <rect x="566" y="350" width="10" height="84" fill="#c92a2a" /><rect x="624" y="350" width="10" height="84" fill="#c92a2a" />
      <rect x="576" y="356" width="48" height="76" className="lq-door" />
      <rect x="572" y="352" width="56" height="26" rx="2" className="lq-noren" /><text x="600" y="370" textAnchor="middle" className="lq-noren-text">日本語</text>
      <rect x="560" y="430" width="80" height="8" rx="2" className="cp-step" />
    </Building>
    <Sakura x={428} y={470} s={1.05} />
    <Sakura x={776} y={470} s={0.95} />

    {/* Korean: hanok-style school */}
    <Building id="korean" label={`Trường Tiếng Hàn: ${counts.korean} lớp`} color="#1971c2" deep="#1864ab" onPick={onPick}>
      <ellipse className="cp-school-halo" cx="990" cy="330" rx="190" ry="140" />
      <rect x="862" y="290" width="256" height="142" className="lq-hanok-wall" />
      {[870, 930, 1050, 1110].map((x) => <rect key={x} x={x - 4} y="290" width="8" height="142" className="lq-beam is-brown" />)}
      <path d="M826 300 Q990 268 1154 300 Q1162 286 1150 282 Q990 236 830 282 Q818 286 826 300 Z" className="lq-hanok-roof" />
      <path d="M880 270 Q990 246 1100 270" className="lq-ridge" />
      <g className="lq-lattice"><rect x="882" y="322" width="38" height="44" /><rect x="1060" y="322" width="38" height="44" /></g>
      <Sign x={938} y={302} w={104} label="Tiếng Hàn" />
      <rect x="966" y="356" width="48" height="76" rx="2" className="lq-door is-brown" />
      <path d="M970 362 V428 M990 362 V428 M1010 362 V428 M970 384 H1010 M970 406 H1010" className="lq-door-grid" />
      <g transform="translate(990 214)"><circle r="20" className="lq-emblem-plate" /><text y="7" textAnchor="middle" className="lq-emblem is-dark">가</text></g>
      <rect x="950" y="430" width="80" height="8" rx="2" className="cp-step" />
    </Building>
    <Pine x={1160} y={470} />
    <Pine x={820} y={474} />

    <g aria-hidden="true">
      <Bench x={300} y={500} w={96} />
      <Reader x={326} y={492} s={0.8} shirt="#c0392b" skin="#f3c7a1" hair="#2b1d14" book="#2f6fed" />
      <Reader x={376} y={492} s={0.8} flip shirt="#1971c2" skin="#8d5a3b" hair="#120c08" book="#f5a524" />
      <BookStack x={410} y={516} />
    </g>
  </svg>
);

export default LanguageQuarter;
