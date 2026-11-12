import { Athlete } from "./Pitch";

/** Basketball court with bleachers. Clicking takes a shot at the right hoop. */
const TOP = { y: 170, left: 230, right: 970 };
const BOTTOM = { y: 440, left: 96, right: 1104 };
const xLeft = (y) => TOP.left + (BOTTOM.left - TOP.left) * ((y - TOP.y) / (BOTTOM.y - TOP.y));
const xRight = (y) => TOP.right + (BOTTOM.right - TOP.right) * ((y - TOP.y) / (BOTTOM.y - TOP.y));

const PLANKS = [190, 215, 242, 271, 302, 335, 370, 405];

const FANS = [
  [300, 64, "#ef4444"], [338, 64, "#f5a524"], [376, 64, "#2f6fed"], [452, 64, "#18a058"], [490, 64, "#7c5cff"], [566, 64, "#ef4444"], [642, 64, "#0ea5e9"], [718, 64, "#f472b6"], [794, 64, "#f5a524"], [870, 64, "#18a058"],
  [282, 96, "#7c5cff"], [358, 96, "#0ea5e9"], [434, 96, "#ef4444"], [510, 96, "#f5a524"], [586, 96, "#18a058"], [662, 96, "#2f6fed"], [738, 96, "#ef4444"], [814, 96, "#7c5cff"], [890, 96, "#0ea5e9"],
  [320, 128, "#f472b6"], [396, 128, "#18a058"], [548, 128, "#7c5cff"], [624, 128, "#f5a524"], [700, 128, "#0ea5e9"], [852, 128, "#ef4444"],
];
const SKINS = ["#f3c7a1", "#d9a27a", "#8d5a3b", "#f3c7a1", "#e8b48f"];

const Hoop = ({ flip = false }) => (
  <g className="bb-hoop" transform={flip ? "translate(1200 0) scale(-1 1)" : undefined}>
    <ellipse cx="150" cy="352" rx="22" ry="6" fill="rgb(0 0 0 / 22%)" />
    <rect x="144" y="196" width="10" height="156" rx="3" fill="#39405a" />
    <rect x="148" y="196" width="34" height="7" rx="3" fill="#39405a" />
    <path d="M178 176 L196 168 L196 226 L178 234 Z" fill="#ffffff" stroke="#c9cede" strokeWidth="2" />
    <path d="M183 196 L192 192 L192 210 L183 214 Z" fill="none" stroke="#e5484d" strokeWidth="2.5" />
    <ellipse cx="210" cy="222" rx="17" ry="5.5" fill="none" stroke="#f97316" strokeWidth="3.5" />
    <path className="bb-net" d="M194 223 L199 246 M203 226 L205 249 M212 227 L212 250 M221 226 L219 249 M227 223 L224 246 M198 237 L224 237" stroke="#ffffff" strokeWidth="1.6" fill="none" />
  </g>
);

const Basketball = ({ score, shooting, onShoot }) => (
  <svg className="cp-zone-svg bb-scene" viewBox="0 0 1200 470" role="button" tabIndex={0}
    aria-label={`Sân bóng rổ: bấm để ném bóng. Tỉ số Đỏ ${score[0]}, Tím ${score[1]}`}
    onClick={onShoot} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onShoot(); } }}>
    {/* bleachers */}
    <g className={`bb-stands ${shooting ? "is-cheering" : ""}`}>
      <rect x="250" y="70" width="700" height="24" rx="4" className="bb-tier" />
      <rect x="236" y="102" width="728" height="24" rx="4" className="bb-tier" />
      <rect x="222" y="134" width="756" height="24" rx="4" className="bb-tier" />
      {FANS.map(([x, y, shirt], index) => (
        <g key={index} className="bb-fan" style={{ animationDelay: `${(index % 5) * 0.06}s` }}>
          <rect x={x - 9} y={y - 2} width="18" height="20" rx="7" fill={shirt} />
          <circle cx={x} cy={y - 10} r="9" fill={SKINS[index % SKINS.length]} />
          <path d={`M${x - 9} ${y - 11} C${x - 9} ${y - 22} ${x + 9} ${y - 22} ${x + 9} ${y - 11} Z`} fill="#2b1d14" />
        </g>
      ))}
      <g transform="translate(540 16)">
        <rect width="120" height="40" rx="7" className="bb-board" />
        <text x="60" y="15" textAnchor="middle" className="pp-score-label">Sân bóng rổ</text>
        <text x="60" y="33" textAnchor="middle" className="pp-score">Đỏ {score[0]} – {score[1]} Tím</text>
      </g>
    </g>

    {/* court */}
    <polygon className="bb-apron" points={`${TOP.left - 16},${TOP.y - 8} ${TOP.right + 16},${TOP.y - 8} ${BOTTOM.right + 22},${BOTTOM.y + 12} ${BOTTOM.left - 22},${BOTTOM.y + 12}`} />
    <polygon className="bb-floor" points={`${TOP.left},${TOP.y} ${TOP.right},${TOP.y} ${BOTTOM.right},${BOTTOM.y} ${BOTTOM.left},${BOTTOM.y}`} />
    <g className="bb-planks">{PLANKS.map((y) => <line key={y} x1={xLeft(y)} y1={y} x2={xRight(y)} y2={y} />)}</g>
    <polygon className="bb-key" points={`${xLeft(262)},262 ${xLeft(262) + 168},262 ${xLeft(348) + 168},348 ${xLeft(348)},348`} />
    <polygon className="bb-key" points={`${xRight(262)},262 ${xRight(262) - 168},262 ${xRight(348) - 168},348 ${xRight(348)},348`} />
    <g className="bb-lines">
      <polygon points={`${TOP.left},${TOP.y} ${TOP.right},${TOP.y} ${BOTTOM.right},${BOTTOM.y} ${BOTTOM.left},${BOTTOM.y}`} />
      <path d={`M600 ${TOP.y} L600 ${BOTTOM.y}`} />
      <ellipse cx="600" cy="305" rx="66" ry="27" />
      <path d={`M${xLeft(196)} 196 C${xLeft(196) + 330} 210 ${xLeft(414) + 330} 400 ${xLeft(414)} 414`} />
      <path d={`M${xRight(196)} 196 C${xRight(196) - 330} 210 ${xRight(414) - 330} 400 ${xRight(414)} 414`} />
      <ellipse cx={xLeft(305) + 168} cy="305" rx="24" ry="43" />
      <ellipse cx={xRight(305) - 168} cy="305" rx="24" ry="43" />
    </g>
    <Hoop />
    <Hoop flip />

    <Athlete x={360} y={380} s={0.92} jersey="#7c5cff" shorts="#7c5cff" skin="#8d5a3b" hair="#120c08" number="5" running />
    <Athlete x={520} y={300} s={0.86} jersey="#e5484d" shorts="#e5484d" skin="#f3c7a1" hair="#2b1d14" number="23" running />
    <Athlete x={700} y={400} s={0.95} jersey="#7c5cff" shorts="#7c5cff" skin="#d9a27a" hair="#3b2a20" number="11" flip running />
    <Athlete x={790} y={286} s={0.85} jersey="#7c5cff" shorts="#7c5cff" skin="#f3c7a1" hair="#6b3d1f" number="8" flip />
    <Athlete x={880} y={366} s={0.92} jersey="#e5484d" shorts="#e5484d" skin="#e8b48f" hair="#1f140e" number="3" flip running />

    <g className={`bb-ball ${shooting ? "is-shooting" : ""}`}>
      <g className="bb-ball-body">
        <circle r="10" fill="#f97316" stroke="#7c2d12" strokeWidth="1.3" />
        <path d="M-10 0 H10 M0 -10 V10 M-7 -7 C-2 -2 -2 2 -7 7 M7 -7 C2 -2 2 2 7 7" stroke="#7c2d12" strokeWidth="1.1" fill="none" />
      </g>
    </g>
    {shooting && <g className="bb-swish"><rect x="-56" y="-24" width="112" height="32" rx="16" /><text x="0" y="-2" textAnchor="middle">Swish!</text></g>}
  </svg>
);

export default Basketball;
