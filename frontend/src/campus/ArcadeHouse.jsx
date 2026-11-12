import { Athlete } from "./Pitch";

/** The recreation house on campus: a building with a big window onto the pool room. */
const ArcadeHouse = ({ onOpen }) => (
  <svg className="cp-zone-svg ah-scene" viewBox="0 70 1200 372" role="link" tabIndex={0} aria-label="Nhà giải trí: bấm để vào, bên trong có phòng bida"
    onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <path className="lq-walk" d="M0 404 H1200 V432 H0 Z" />
    <g className="cp-school is-arcade" style={{ "--school": "#7c3aed", "--school-deep": "#5b21b6" }}>
      <ellipse className="cp-school-halo" cx="600" cy="250" rx="320" ry="180" />
      <rect x="330" y="150" width="540" height="254" rx="6" className="ah-wall" />
      <path d="M312 156 Q600 84 888 156 L888 170 L312 170 Z" className="cp-roof" />
      <g className="ah-marquee">
        <rect x="470" y="104" width="260" height="46" rx="10" />
        <text x="600" y="135" textAnchor="middle">Nhà giải trí</text>
        {[482, 512, 542, 572, 602, 632, 662, 692, 718].map((x, index) => <circle key={x} cx={x} cy="104" r="4" style={{ animationDelay: `${index * 0.12}s` }} />)}
      </g>
      {/* big window onto the pool room */}
      <rect x="366" y="200" width="300" height="150" rx="6" className="ah-window" />
      <path d="M476 200 L556 200 L540 232 L492 232 Z" className="ah-lamp" />
      <path d="M430 350 L492 232 L540 232 L602 350 Z" className="ah-light" />
      <rect x="410" y="286" width="212" height="46" rx="10" className="ah-pool-frame" />
      <rect x="420" y="294" width="192" height="30" rx="4" className="ah-pool-felt" />
      <circle cx="462" cy="309" r="6" fill="#fbfaf4" /><circle cx="540" cy="303" r="6" fill="#d93a2b" /><circle cx="556" cy="313" r="6" fill="#f2c230" /><circle cx="572" cy="303" r="6" fill="#1b1b1f" /><circle cx="586" cy="314" r="6" fill="#2b63d9" />
      <line x1="386" y1="290" x2="458" y2="308" className="ah-cue" />
      <path d="M366 275 H666 M516 200 V350" className="ah-mullion" />
      <rect x="720" y="286" width="72" height="118" rx="5" className="lq-door is-navy" />
      <rect x="730" y="298" width="52" height="40" rx="3" className="ah-door-glass" />
      <circle cx="782" cy="352" r="3.5" fill="#f5c542" />
      <g className="cp-sign"><rect x="702" y="246" width="108" height="26" rx="6" /><text x="756" y="263.5" textAnchor="middle">Phòng bida</text></g>
      <rect x="704" y="402" width="104" height="8" rx="2" className="cp-step" />
      <g transform="translate(832 300)" className="ah-poster"><rect width="26" height="34" rx="3" /><circle cx="13" cy="14" r="7" fill="#1b1b1f" /><circle cx="13" cy="14" r="3.4" fill="#fbfaf4" /></g>
    </g>
    <g aria-hidden="true">
      <Athlete x={930} y={408} s={0.86} jersey="#7c3aed" shorts="#1d2142" skin="#f3c7a1" hair="#2b1d14" number="" flip />
      <line x1="914" y1="336" x2="900" y2="410" className="ah-cue" />
      <Athlete x={990} y={410} s={0.86} jersey="#f5a524" shorts="#1d2142" skin="#8d5a3b" hair="#120c08" number="" flip />
    </g>
  </svg>
);

export default ArcadeHouse;
