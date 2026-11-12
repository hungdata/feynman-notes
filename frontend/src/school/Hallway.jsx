import { useState } from "react";
import { MoreHorizontal, Pin, Plus, Star } from "lucide-react";
import ClassroomInside from "./ClassroomInside";

/**
 * School interior: corridors (one per floor) lined with classroom doors.
 * A room is { id, number, title, subtitle, color, progress, board, doodle, lit, busy, favorite }.
 */
export const Room = ({ room, entering, onEnter, menu }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`hl-unit ${entering ? "is-entering" : ""}`}>
      <span className="hl-lamp" aria-hidden="true" />
      <button type="button" className={`hl-room ${room.lit ? "is-lit" : ""}`} style={{ "--door": room.color }} onClick={() => onEnter(room)} aria-label={`Vào ${room.label || `phòng ${room.number}`}: ${room.title}`}>
        <span className="hl-sign">
          <small>{room.label || `Phòng ${room.number}`}{room.favorite && <Star className="hl-fav" />}</small>
          <strong>{room.title}</strong>
        </span>
        <span className="hl-front">
          <span className="hl-doorway">
            <span className="hl-inside"><ClassroomInside board={room.board} doodle={room.doodle} lit /></span>
            <span className="hl-door">
              <span className="hl-door-pane"><ClassroomInside board={room.board} doodle={room.doodle} view="window" lit={room.lit} /></span>
              <span className="hl-knob" />
              {room.busy && <span className="hl-door-note">Đang soạn…</span>}
            </span>
          </span>
          <span className="hl-side">
            <span className="hl-plaque">{room.subtitle}</span>
            {room.progress != null && <span className="hl-meter" aria-label={`Tiến độ ${Math.round(room.progress * 100)}%`}><span style={{ width: `${Math.round(room.progress * 100)}%` }} /></span>}
          </span>
        </span>
      </button>
      {menu && (
        <div className="hl-menu">
          <button type="button" className="hl-menu-btn" aria-label={`Tùy chọn phòng ${room.number}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)} onBlur={() => window.setTimeout(() => setMenuOpen(false), 150)}><MoreHorizontal /></button>
          {menuOpen && (
            <div className="ln-popover hl-popover" role="menu">
              {menu.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? "is-danger" : ""} onClick={() => item.onSelect(room)}>{item.icon}{item.label}</button>)}
            </div>
          )}
        </div>
      )}
      <span className="hl-floorboard" aria-hidden="true" />
    </div>
  );
};

export const EmptyRoom = ({ label, hint, onClick, busy }) => (
  <div className="hl-unit is-empty-room">
    <span className="hl-lamp is-off" aria-hidden="true" />
    <button type="button" className="hl-room is-empty" onClick={onClick} disabled={busy}>
      <span className="hl-sign"><small>Phòng trống</small><strong>{label}</strong></span>
      <span className="hl-front">
        <span className="hl-doorway">
          <span className="hl-inside"><ClassroomInside empty /></span>
          <span className="hl-door"><Plus className="hl-plus" /><span className="hl-knob" /></span>
        </span>
        <span className="hl-side"><span className="hl-plaque">{hint}</span></span>
      </span>
    </button>
    <span className="hl-floorboard" aria-hidden="true" />
  </div>
);

/** Cork notice board with pinned notes. */
export const NoticeBoard = ({ title = "Bảng tin", children }) => (
  <div className="hl-unit is-board">
    <span className="hl-lamp" aria-hidden="true" />
    <section className="hl-notice" aria-label={title}>
      <h2>{title}</h2>
      <div className="hl-notes">{children}</div>
    </section>
    <span className="hl-floorboard" aria-hidden="true" />
  </div>
);

export const Note = ({ tone = "yellow", tilt = 0, children }) => (
  <article className={`hl-note is-${tone}`} style={{ "--tilt": `${tilt}deg` }}>
    <Pin className="hl-pin" aria-hidden="true" />
    {children}
  </article>
);

/** Decorative row of school lockers to fill the corridor wall. */
export const Lockers = ({ count = 16, start = 1 }) => (
  <div className="hl-unit is-decor" aria-hidden="true">
    <span className="hl-lamp is-off" />
    <span className="hl-lockers">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="hl-locker"><small>{String(start + index).padStart(2, "0")}</small></span>
      ))}
    </span>
    <span className="hl-floorboard" />
  </div>
);

export const Corridor = ({ label, children }) => (
  <section className="hl-corridor" aria-label={label}>
    <h2 className="hl-corridor-label">{label}</h2>
    <div className="hl-wall">{children}</div>
  </section>
);
