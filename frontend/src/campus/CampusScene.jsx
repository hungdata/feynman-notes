import { Bench, BookStack, Chalkboard, Listener, Reader, Teacher } from "./People";
import { STARS, VIEW, spotFor } from "./scene";

const Window = ({ x, y, w = 28, h = 34 }) => (
  <g className="cp-window">
    <rect x={x} y={y} width={w} height={h} rx="4" />
    <path d={`M${x + w / 2} ${y + 2}V${y + h - 2}M${x + 2} ${y + h / 2}H${x + w - 2}`} />
  </g>
);

const Door = ({ x, y, w = 50, h = 70, open }) => (
  <g className={`cp-door ${open ? "is-open" : ""}`}>
    <rect className="cp-door-gap" x={x} y={y} width={w} height={h} rx="6" />
    <rect className="cp-door-leaf" x={x} y={y} width={w / 2} height={h} rx="5" style={{ transformOrigin: `${x}px ${y}px` }} />
    <rect className="cp-door-leaf" x={x + w / 2} y={y} width={w / 2} height={h} rx="5" style={{ transformOrigin: `${x + w}px ${y}px` }} />
  </g>
);

const Sign = ({ x, y, w, label }) => (
  <g className="cp-sign">
    <rect x={x} y={y} width={w} height="26" rx="6" />
    <text x={x + w / 2} y={y + 17.5} textAnchor="middle">{label}</text>
  </g>
);

const Tree = ({ x, y, s = 1 }) => (
  <g className="cp-tree" transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-5" y="-26" width="10" height="28" rx="3" />
    <circle cx="0" cy="-48" r="28" />
    <circle cx="-18" cy="-36" r="18" />
    <circle cx="18" cy="-34" r="19" />
  </g>
);

const Lamp = ({ x, y }) => (
  <g className="cp-lamp" transform={`translate(${x} ${y})`}>
    <circle className="cp-lamp-glow" cx="0" cy="-74" r="26" />
    <rect x="-2.5" y="-70" width="5" height="70" rx="2" />
    <rect x="-8" y="-82" width="16" height="14" rx="4" className="cp-lamp-head" />
  </g>
);

/** Clickable school: SVG group that behaves like a link. */
const School = ({ id, label, active, onPick, onHover, children }) => (
  <g
    className={`cp-school is-${id} ${active ? "is-active" : ""}`}
    role="link"
    tabIndex={0}
    aria-label={label}
    onClick={() => onPick(id)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(id); } }}
    onMouseEnter={() => onHover(id)}
    onMouseLeave={() => onHover(null)}
    onFocus={() => onHover(id)}
    onBlur={() => onHover(null)}
  >
    {children}
  </g>
);

const Student = ({ target, entering, walking, facing }) => {
  const spot = spotFor(target, entering);
  return (
    <g className={`cp-student ${walking ? "is-walking" : ""} ${entering ? "is-entering" : ""}`} style={{ transform: `translate(${spot.x}px, ${spot.y}px) scale(${spot.scale})` }}>
      <ellipse className="cp-student-shadow" cx="0" cy="0" rx="22" ry="5.5" />
      <g className="cp-student-flip" style={{ transform: `scaleX(${facing})` }}>
        <g className="cp-student-body">
          <g className="cp-leg is-back"><rect x="-8" y="-40" width="10" height="36" rx="4.5" /><rect className="cp-shoe" x="-10" y="-8" width="15" height="8" rx="3.5" /></g>
          <g className="cp-arm is-back"><rect x="-6" y="-71" width="9" height="29" rx="4.5" /></g>
          <rect className="cp-backpack" x="-26" y="-75" width="17" height="32" rx="7" />
          <rect className="cp-backpack-pocket" x="-24" y="-58" width="12" height="11" rx="3" />
          <g className="cp-leg is-front"><rect x="0" y="-40" width="10" height="36" rx="4.5" /><rect className="cp-shoe" x="-1" y="-8" width="15" height="8" rx="3.5" /></g>
          <rect className="cp-hoodie" x="-13" y="-78" width="28" height="42" rx="11" />
          <path className="cp-strap" d="M-9 -74 L-6 -46" />
          <g className="cp-arm is-front"><rect x="-1" y="-72" width="9" height="30" rx="4.5" /><circle className="cp-skin" cx="3.5" cy="-41" r="5" /></g>
          <g className="cp-head">
            <circle className="cp-skin" cx="3" cy="-92" r="15.5" />
            <path className="cp-hair" d="M-13 -94 C-12 -110 14 -114 19 -97 C12 -101 2 -100 -3 -95 C-6 -92 -10 -90 -13 -94 Z" />
            <path className="cp-cap" d="M-12 -101 C-8 -114 16 -114 19 -99 L26 -97 C24 -94 18 -95 14 -96 C6 -103 -4 -103 -12 -101 Z" />
            <circle className="cp-eye" cx="11" cy="-92" r="1.9" />
            <path className="cp-smile" d="M8 -84 Q12 -81 16 -85" />
            <circle className="cp-cheek" cx="13" cy="-87" r="2.6" />
          </g>
        </g>
      </g>
    </g>
  );
};

const CampusScene = ({ sky, active, target, entering, walking, facing, onPick, onHover }) => (
  <svg overflow="visible" className={`cp-scene is-${sky}`} viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} preserveAspectRatio="xMidYMax meet" role="group" aria-label="Sân trường: chọn một ngôi trường để vào">
    <defs>
      <linearGradient id="cp-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="cp-sky-top" />
        <stop offset="1" className="cp-sky-bottom" />
      </linearGradient>
      <linearGradient id="cp-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="cp-grass-top" />
        <stop offset="1" className="cp-grass-bottom" />
      </linearGradient>
      <radialGradient id="cp-glow">
        <stop offset="0" stopColor="#ffd27a" stopOpacity="0.75" />
        <stop offset="1" stopColor="#ffd27a" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* sky, hills and grass extend past the view box so wide or tall screens stay filled */}
    <rect x="-1800" y="-1200" width="4800" height="1630" className="cp-sky-fill" />
    <rect x="-1800" y="0" width="4800" height="430" fill="url(#cp-sky)" />
    {sky === "night" && (
      <g className="cp-stars">
        {STARS.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} style={{ animationDelay: `${star.delay}s` }} />)}
      </g>
    )}
    {sky === "night" ? (
      <g className="cp-moon"><circle cx="1050" cy="92" r="34" /><circle cx="1038" cy="84" r="6" /><circle cx="1060" cy="104" r="4.5" /></g>
    ) : (
      <circle className="cp-sun" cx={sky === "evening" ? 1060 : 1040} cy={sky === "evening" ? 300 : sky === "morning" ? 170 : 96} r="42" />
    )}
    {sky !== "night" && (
      <g className="cp-clouds">
        <g transform="translate(468 104) scale(0.9)"><ellipse rx="54" ry="18" /><ellipse cx="-30" cy="6" rx="34" ry="14" /><ellipse cx="34" cy="7" rx="36" ry="13" /></g>
        <g transform="translate(860 56) scale(0.8)"><ellipse rx="54" ry="18" /><ellipse cx="-30" cy="6" rx="34" ry="14" /><ellipse cx="34" cy="7" rx="36" ry="13" /></g>
      </g>
    )}

    <path className="cp-hill is-far" d="M-1800 340 C-1200 300 -600 350 -260 330 C-120 320 -60 350 0 360 C140 300 260 330 380 320 C520 306 620 270 760 300 C900 330 1020 290 1200 318 C1500 340 1900 300 3000 330 V430 H-1800 Z" />
    <path className="cp-hill is-near" d="M-1800 384 C-900 370 -300 392 0 395 C180 360 330 380 470 372 C640 362 780 350 940 372 C1060 388 1140 370 1200 376 C1600 368 2200 390 3000 380 V430 H-1800 Z" />
    <rect x="-1800" y="398" width="4800" height="900" fill="url(#cp-grass)" />

    {/* paths from the plaza to each door */}
    <g className="cp-path">
      <path d="M440 548 Q330 522 212 466 L268 466 Q372 512 500 562 Z" />
      <path d="M760 548 Q870 522 988 466 L932 466 Q828 512 700 562 Z" />
      <path d="M572 532 L582 406 L618 406 L628 532 Z" />
      <ellipse cx="600" cy="572" rx="176" ry="48" />
      <ellipse className="cp-plaza-ring" cx="600" cy="572" rx="120" ry="30" />
    </g>

    <Tree x={-140} y={452} s={1.3} />
    <Tree x={-300} y={430} s={1} />
    <Tree x={1340} y={452} s={1.3} />
    <Tree x={1500} y={430} s={1} />
    <Tree x={52} y={438} s={1.1} />
    <Tree x={1150} y={440} s={1.15} />
    <Tree x={448} y={410} s={0.85} />
    <Tree x={752} y={410} s={0.85} />

    {/* Learning path school: clock tower, winding trail emblem */}
    <School id="learn" label="Trường Lộ trình học: học từ sách theo từng bài nhỏ" active={active === "learn"} onPick={onPick} onHover={onHover}>
      <ellipse className="cp-school-halo" cx="600" cy="300" rx="170" ry="150" />
      <rect className="cp-wall" x="572" y="96" width="56" height="80" rx="3" />
      <polygon className="cp-roof" points="562,98 600,58 638,98" />
      <line className="cp-pole" x1="600" y1="58" x2="600" y2="26" />
      <path className="cp-flag" d="M600 27 L628 34 L600 42 Z" />
      <circle className="cp-clock" cx="600" cy="128" r="16" />
      <path className="cp-clock-hands" d="M600 128 V117 M600 128 L608 132" />
      <rect className="cp-wall" x="488" y="214" width="224" height="192" rx="4" />
      <polygon className="cp-roof" points="470,218 600,150 730,218" />
      <circle className="cp-emblem-plate" cx="600" cy="196" r="20" />
      <path className="cp-emblem-trail" d="M586 207 C592 196 586 190 596 186 C606 182 606 196 614 189" />
      <circle className="cp-emblem-dot" cx="586" cy="207" r="3.2" />
      <circle className="cp-emblem-dot" cx="596" cy="186" r="3.2" />
      <path className="cp-emblem-flag" d="M614 177 V191 M614 177 L622 180 L614 184" />
      <Window x={506} y={236} /><Window x={548} y={236} /><Window x={624} y={236} /><Window x={666} y={236} />
      <Window x={506} y={296} /><Window x={666} y={296} />
      <Sign x={541} y={290} w={118} label="Lộ trình học" />
      <Door x={578} y={336} w={44} h={70} open={target === "learn" && entering} />
      <rect className="cp-step" x="566" y="405" width="68" height="7" rx="2" />
    </School>

    {/* Mind map school: gable with a mind map */}
    <School id="mindmap" label="Trường Mind Map: vẽ sơ đồ tư duy" active={active === "mindmap"} onPick={onPick} onHover={onHover}>
      <ellipse className="cp-school-halo" cx="240" cy="360" rx="190" ry="140" />
      <rect className="cp-wall" x="96" y="288" width="288" height="178" rx="4" />
      <polygon className="cp-roof" points="74,292 240,200 406,292" />
      <g className="cp-emblem-map">
        <path d="M240 254 L206 238 M240 254 L274 238 M240 254 L210 274 M240 254 L270 274" />
        <circle className="is-root" cx="240" cy="254" r="11" />
        <circle className="is-a" cx="206" cy="238" r="6.5" />
        <circle className="is-b" cx="274" cy="238" r="6.5" />
        <circle className="is-c" cx="210" cy="274" r="6.5" />
        <circle className="is-d" cx="270" cy="274" r="6.5" />
      </g>
      <Window x={114} y={310} /><Window x={156} y={310} /><Window x={296} y={310} /><Window x={338} y={310} />
      <Window x={114} y={372} /><Window x={156} y={372} /><Window x={296} y={372} /><Window x={338} y={372} />
      <Sign x={186} y={328} w={108} label="Mind Map" />
      <Door x={215} y={396} open={target === "mindmap" && entering} />
      <rect className="cp-step" x="203" y="465" width="74" height="7" rx="2" />
    </School>

    {/* Checklist school: clipboard on the roof */}
    <School id="tasks" label="Trường Checklist: danh sách việc cần làm" active={active === "tasks"} onPick={onPick} onHover={onHover}>
      <ellipse className="cp-school-halo" cx="960" cy="360" rx="190" ry="140" />
      <g className="cp-clipboard">
        <rect className="cp-board" x="916" y="186" width="88" height="98" rx="9" />
        <rect className="cp-paper" x="926" y="200" width="68" height="76" rx="4" />
        <rect className="cp-clip" x="943" y="178" width="34" height="16" rx="5" />
        <path className="cp-check" d="M934 216 l5 5 l9 -10 M934 238 l5 5 l9 -10" />
        <rect className="cp-box" x="933" y="254" width="13" height="13" rx="3" />
        <path className="cp-line" d="M954 218 H984 M954 240 H980 M954 261 H978" />
      </g>
      <rect className="cp-wall" x="816" y="288" width="288" height="178" rx="4" />
      <rect className="cp-roof" x="804" y="272" width="312" height="22" rx="4" />
      <Window x={834} y={310} /><Window x={876} y={310} /><Window x={1016} y={310} /><Window x={1058} y={310} />
      <Window x={834} y={372} /><Window x={876} y={372} /><Window x={1016} y={372} /><Window x={1058} y={372} />
      <Sign x={906} y={328} w={108} label="Checklist" />
      <Door x={935} y={396} open={target === "tasks" && entering} />
      <rect className="cp-step" x="923" y="465" width="74" height="7" rx="2" />
    </School>

    <Lamp x={462} y={520} />
    <Lamp x={738} y={520} />

    {/* friends reading on a bench, under the tree on the left */}
    <g className="cp-people" aria-hidden="true">
      <Bench x={40} y={548} w={124} />
      <Reader x={70} y={540} s={0.9} shirt="#7c5cff" skin="#f3c7a1" hair="#2b1d14" book="#e5674d" />
      <Reader x={134} y={540} s={0.9} flip shirt="#f472b6" skin="#d9a27a" hair="#3b2a20" book="#2f6fed" long />
      <BookStack x={186} y={576} />
      {/* a friend reading on the steps of the learning-path school */}
      <Reader x={652} y={404} s={0.62} flip shirt="#0ea5e9" skin="#8d5a3b" hair="#1a120c" book="#f5a524" />
      {/* outdoor lesson: teacher at the chalkboard, classmates listening */}
      <Chalkboard x={1012} y={470} />
      <Teacher x={1150} y={560} s={0.92} />
      <Listener x={1000} y={590} s={0.9} shirt="#ef4444" skin="#f3c7a1" hair="#3b2a20" />
      <Listener x={1052} y={594} s={0.9} shirt="#0ea5e9" skin="#d9a27a" hair="#1f140e" raise />
      <Listener x={1104} y={590} s={0.9} shirt="#f5a524" skin="#8d5a3b" hair="#120c08" bag="#18a058" />
    </g>

    <Student target={target} entering={entering} walking={walking} facing={facing} />
  </svg>
);

export default CampusScene;
