import { Athlete } from "./Pitch";

/** The bursar's office: a cashier window where students pay tuition. */
const Bursar = ({ onOpen }) => (
  <svg className="cp-zone-svg bs-scene" viewBox="0 96 1200 344" role="button" tabIndex={0} aria-label="Phòng tài vụ: bấm để đóng học phí"
    onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}>
    <path className="lq-walk" d="M0 404 H1200 V432 H0 Z" />
    <g className="cp-school is-bursar" style={{ "--school": "#4c5a75", "--school-deep": "#38445c" }}>
      <ellipse className="cp-school-halo" cx="600" cy="260" rx="280" ry="170" />
      <rect x="360" y="132" width="480" height="272" rx="4" className="bs-wall" />
      <rect x="348" y="112" width="504" height="34" rx="5" className="bs-band" />
      <text x="600" y="136" textAnchor="middle" className="bs-title">Phòng tài vụ</text>
      {[392, 452, 512, 628, 688, 748].map((x) => <g key={x} className="cp-window"><rect x={x} y="166" width="40" height="44" rx="3" /><path d={`M${x + 20} 168 V208 M${x + 2} 188 H${x + 38}`} /></g>)}
      <rect x="470" y="248" width="196" height="118" rx="6" className="bs-booth" />
      <rect x="486" y="262" width="164" height="78" rx="4" className="bs-glass" />
      <g className="bs-clerk">
        <rect x="550" y="300" width="40" height="40" rx="12" fill="#2f6fed" />
        <circle cx="570" cy="290" r="13" fill="#e8b48f" />
        <path d="M557 289 C556 274 584 273 584 289 C578 283 566 283 557 289 Z" fill="#3b2a20" />
        <g fill="none" stroke="#1d2142" strokeWidth="1.3"><circle cx="565" cy="291" r="3.4" /><circle cx="575" cy="291" r="3.4" /></g>
        <path d="M566 298 Q570 300.5 574 298" fill="none" stroke="#1d2142" strokeWidth="1.2" strokeLinecap="round" />
      </g>
      <path d="M506 264 V338 M526 264 V338 M610 264 V338 M630 264 V338" className="bs-grille" />
      <rect x="478" y="340" width="180" height="14" rx="3" className="bs-counter" />
      <rect x="520" y="226" width="96" height="22" rx="5" className="bs-sign" />
      <text x="568" y="241.5" textAnchor="middle" className="bs-sign-text">Thu học phí</text>
      <rect x="732" y="300" width="56" height="104" rx="4" className="lq-door is-navy" />
      <circle cx="780" cy="354" r="3" fill="#f5c542" />
      <g transform="translate(392 282)" className="bs-notice"><rect width="62" height="74" rx="4" /><path d="M10 16 H52 M10 30 H48 M10 44 H50 M10 58 H40" /></g>
    </g>
    <g aria-hidden="true">
      <Athlete x={448} y={404} s={0.82} jersey="#ffffff" shorts="#1d2142" skin="#f3c7a1" hair="#2b1d14" number="" />
      <rect x="462" y="346" width="16" height="11" rx="2" fill="#fff6b8" stroke="#c9a227" />
      <Athlete x={392} y={406} s={0.82} jersey="#ffffff" shorts="#1d2142" skin="#8d5a3b" hair="#120c08" number="" />
      <Athlete x={336} y={408} s={0.82} jersey="#ffffff" shorts="#1d2142" skin="#d9a27a" hair="#3b2a20" number="" />
    </g>
  </svg>
);

export default Bursar;
