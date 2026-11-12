/** The school football pitch at the front of the campus (bottom band of the scene). */

const TOP = { y: 652, left: 170, right: 1030 };
const BOTTOM = { y: 812, left: 66, right: 1134 };
const xAt = (edge, y) => {
  const t = (y - TOP.y) / (BOTTOM.y - TOP.y);
  return edge === "left" ? TOP.left + (BOTTOM.left - TOP.left) * t : TOP.right + (BOTTOM.right - TOP.right) * t;
};

const STRIPES = Array.from({ length: 12 }, (_, index) => {
  const a = index / 12;
  const b = (index + 1) / 12;
  const top = (t) => TOP.left + (TOP.right - TOP.left) * t;
  const bottom = (t) => BOTTOM.left + (BOTTOM.right - BOTTOM.left) * t;
  return `${top(a)},${TOP.y} ${top(b)},${TOP.y} ${bottom(b)},${BOTTOM.y} ${bottom(a)},${BOTTOM.y}`;
});

export const Athlete = ({ x, y, s = 1, jersey, shorts = "#ffffff", skin, hair, number, flip = false, running = false }) => (
  <g className={`pp-player ${running ? "is-running" : ""}`} transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
    <ellipse cx="0" cy="0" rx="16" ry="4.5" fill="rgb(0 0 0 / 22%)" />
    <g className="pp-leg is-back"><rect x="-7" y="-34" width="8" height="32" rx="4" fill={skin} /><rect x="-8" y="-6" width="13" height="7" rx="3.5" fill="#1b1f2e" /></g>
    <g className="pp-leg is-front"><rect x="1" y="-34" width="8" height="32" rx="4" fill={skin} /><rect x="1" y="-6" width="13" height="7" rx="3.5" fill="#1b1f2e" /></g>
    <rect x="-10" y="-40" width="20" height="12" rx="4" fill={shorts} />
    <rect x="-11" y="-70" width="22" height="34" rx="9" fill={jersey} />
    <text x="0" y="-47" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="var(--ln-display)" transform={flip ? "scale(-1 1)" : undefined}>{number}</text>
    <rect x="9" y="-68" width="7" height="22" rx="3.5" fill={jersey} transform="rotate(-25 12 -66)" />
    <circle cx="1" cy="-82" r="12" fill={skin} />
    <path d="M-11 -84 C-11 -98 12 -99 13 -86 C7 -90 -1 -90 -5 -86 C-7 -83 -9 -82 -11 -84 Z" fill={hair} />
    <circle cx="7" cy="-81" r="1.5" fill="#1d2142" />
  </g>
);

const Goal = ({ x, y, flip = false, shaking }) => (
  <g className={`pp-goal ${shaking ? "is-shaking" : ""}`} transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""}`}>
    <path d="M0 0 L0 -52 L44 -60 L44 6" fill="rgb(255 255 255 / 12%)" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
    <g stroke="rgb(255 255 255 / 55%)" strokeWidth="1.2">
      <path d="M11 -54 L11 2 M22 -56 L22 3 M33 -58 L33 5" />
      <path d="M0 -39 L44 -45 M0 -26 L44 -30 M0 -13 L44 -15" />
    </g>
  </g>
);

const Floodlight = ({ x, y }) => (
  <g className="pp-flood" transform={`translate(${x} ${y})`}>
    <circle className="pp-flood-glow" cx="0" cy="-150" r="60" />
    <rect x="-3" y="-146" width="6" height="146" rx="2" fill="#39405a" />
    <rect x="-20" y="-162" width="40" height="18" rx="4" fill="#4a5270" />
    <g fill="#fff6d6"><rect x="-16" y="-158" width="8" height="10" rx="2" /><rect x="-4" y="-158" width="8" height="10" rx="2" /><rect x="8" y="-158" width="8" height="10" rx="2" /></g>
  </g>
);

/** `score` = [blue, orange]; `shooting` plays the shot into the right goal. */
const Pitch = ({ score, shooting, onShoot }) => (
  <g
    className={`pp-pitch ${shooting ? "is-shooting" : ""}`}
    role="button"
    tabIndex={0}
    aria-label={`Sân bóng: bấm để sút bóng. Tỉ số Xanh ${score[0]}, Cam ${score[1]}`}
    onClick={onShoot}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onShoot(); } }}
  >
    <Floodlight x={28} y={720} />
    <Floodlight x={1172} y={720} />
    <polygon className="pp-turf" points={`${TOP.left - 14},${TOP.y - 8} ${TOP.right + 14},${TOP.y - 8} ${BOTTOM.right + 18},${BOTTOM.y + 10} ${BOTTOM.left - 18},${BOTTOM.y + 10}`} />
    {STRIPES.map((points, index) => <polygon key={index} className={index % 2 ? "pp-stripe is-light" : "pp-stripe"} points={points} />)}
    <g className="pp-lines">
      <polygon points={`${TOP.left},${TOP.y} ${TOP.right},${TOP.y} ${BOTTOM.right},${BOTTOM.y} ${BOTTOM.left},${BOTTOM.y}`} />
      <path d={`M600 ${TOP.y} L600 ${BOTTOM.y}`} />
      <ellipse cx="600" cy="730" rx="62" ry="21" />
      <circle cx="600" cy="730" r="3" className="pp-spot" />
      <path d={`M${xAt("left", 690)} 690 L${xAt("left", 690) + 104} 690 L${xAt("left", 772) + 104} 772 L${xAt("left", 772)} 772`} />
      <path d={`M${xAt("right", 690)} 690 L${xAt("right", 690) - 104} 690 L${xAt("right", 772) - 104} 772 L${xAt("right", 772)} 772`} />
    </g>
    <Goal x={xAt("left", 758) - 40} y={758} />
    <Goal x={xAt("right", 758) + 40} y={758} flip shaking={shooting} />

    <g className="pp-scoreboard" transform="translate(236 600)">
      <rect x="0" y="0" width="128" height="38" rx="7" />
      <text x="64" y="15" textAnchor="middle" className="pp-score-label">Sân bóng</text>
      <text x="64" y="32" textAnchor="middle" className="pp-score">Xanh {score[0]} – {score[1]} Cam</text>
    </g>

    <Athlete x={392} y={756} s={0.9} jersey="#2f6fed" skin="#f3c7a1" hair="#2b1d14" number="7" running />
    <Athlete x={520} y={712} s={0.84} jersey="#f5a524" skin="#8d5a3b" hair="#120c08" number="10" flip running />
    <Athlete x={700} y={774} s={0.94} jersey="#2f6fed" skin="#d9a27a" hair="#3b2a20" number="9" running />
    <Athlete x={830} y={720} s={0.86} jersey="#f5a524" skin="#f3c7a1" hair="#6b3d1f" number="4" flip running />
    <Athlete x={1058} y={762} s={0.9} jersey="#18a058" shorts="#1b1f2e" skin="#d9a27a" hair="#1f140e" number="1" flip />

    <g className="pp-ball-track">
      <g className="pp-ball">
        <ellipse className="pp-ball-shadow" cx="0" cy="2" rx="8" ry="2.5" />
        <g className="pp-ball-body">
          <circle cx="0" cy="-7" r="7.5" fill="#fff" stroke="#1d2142" strokeWidth="1.2" />
          <path d="M0 -10.5 L3 -8 L2 -4.5 L-2 -4.5 L-3 -8 Z" fill="#1d2142" />
        </g>
      </g>
    </g>
    {shooting && <g className="pp-goal-text" transform="translate(1000 690)"><rect x="-62" y="-26" width="124" height="34" rx="17" /><text x="0" y="-3" textAnchor="middle">VÀOOO!</text></g>}
  </g>
);

export default Pitch;
