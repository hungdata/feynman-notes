/** What you see through a classroom door or window: blackboard, desks and light. */
const ClassroomInside = ({ board = "", doodle = "text", lit = true, empty = false, view = "door" }) => (
  <svg className={`hl-inside-svg ${lit ? "is-lit" : ""}`} viewBox={view === "door" ? "0 0 110 190" : "0 0 80 64"} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    {view === "door" ? (
      <>
        <rect width="110" height="190" className="hl-in-wall" />
        <rect x="0" y="150" width="110" height="40" className="hl-in-floor" />
        {!empty && doodle === "pool" && (
          <>
            <path d="M40 22 L70 22 L64 40 L46 40 Z" className="hl-in-lamp" />
            <rect x="10" y="84" width="90" height="54" rx="8" className="hl-in-pool-frame" />
            <rect x="17" y="91" width="76" height="40" rx="3" className="hl-in-pool-felt" />
            <circle cx="38" cy="111" r="4" fill="#fbfaf4" /><circle cx="66" cy="104" r="4" fill="#d93a2b" /><circle cx="72" cy="116" r="4" fill="#f2c230" /><circle cx="60" cy="118" r="4" fill="#1b1b1f" />
            <rect x="16" y="138" width="6" height="16" className="hl-in-leg" /><rect x="88" y="138" width="6" height="16" className="hl-in-leg" />
          </>
        )}
        {!empty && doodle !== "pool" && (
          <>
            <rect x="14" y="30" width="82" height="50" rx="3" className="hl-in-board" />
            {doodle === "map" ? (
              <g className="hl-in-chalk"><circle cx="55" cy="55" r="7" /><path d="M48 53 L32 44 M48 58 L33 68 M62 53 L78 44 M62 58 L77 68" /><circle cx="29" cy="42" r="3.5" /><circle cx="30" cy="70" r="3.5" /><circle cx="81" cy="42" r="3.5" /><circle cx="80" cy="70" r="3.5" /></g>
            ) : (
              <text x="55" y="60" textAnchor="middle" className="hl-in-text">{board}</text>
            )}
            <rect x="34" y="96" width="42" height="20" rx="2" className="hl-in-desk is-teacher" />
            <rect x="8" y="132" width="34" height="12" rx="2" className="hl-in-desk" />
            <rect x="68" y="132" width="34" height="12" rx="2" className="hl-in-desk" />
            <rect x="14" y="144" width="4" height="12" className="hl-in-leg" /><rect x="32" y="144" width="4" height="12" className="hl-in-leg" />
            <rect x="74" y="144" width="4" height="12" className="hl-in-leg" /><rect x="92" y="144" width="4" height="12" className="hl-in-leg" />
          </>
        )}
      </>
    ) : (
      <>
        <rect width="80" height="64" className="hl-in-wall" />
        {!empty && doodle === "pool" && <><rect x="10" y="18" width="60" height="30" rx="5" className="hl-in-pool-frame" /><rect x="14" y="22" width="52" height="22" rx="2" className="hl-in-pool-felt" /><circle cx="30" cy="33" r="3" fill="#fbfaf4" /><circle cx="50" cy="30" r="3" fill="#d93a2b" /><circle cx="52" cy="38" r="3" fill="#f2c230" /></>}
        {!empty && doodle !== "pool" && <rect x="8" y="10" width="64" height="36" rx="2" className="hl-in-board" />}
        {!empty && doodle !== "pool" && (doodle === "map"
          ? <g className="hl-in-chalk"><circle cx="40" cy="28" r="5" /><path d="M35 27 L22 20 M35 30 L22 36 M45 27 L58 20 M45 30 L58 36" /></g>
          : <text x="40" y="33" textAnchor="middle" className="hl-in-text is-small">{board}</text>)}
        <rect x="0" y="52" width="80" height="12" className="hl-in-floor" />
        {!empty && doodle !== "pool" && <><rect x="6" y="50" width="26" height="7" rx="1.5" className="hl-in-desk" /><rect x="48" y="50" width="26" height="7" rx="1.5" className="hl-in-desk" /></>}
      </>
    )}
  </svg>
);

export default ClassroomInside;
