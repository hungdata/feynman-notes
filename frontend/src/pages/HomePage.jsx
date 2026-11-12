import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BedDouble, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown, ChevronsUp, DoorOpen, Library, Sunrise, X } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/campus3d.css";
import "../styles/home.css";
import { timeOfDay } from "../campus/scene";
import { characterLook } from "../campus3d/builders";
import { campusRequest } from "../campus3d/online";
import { fetchCourses } from "../learn/api";
import BookCover from "../learn/BookCover";
import { SoundToggle } from "../learn/LearnChrome";
import { playSound, setWind } from "../learn/sound";

const MOVE_KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };
const SPOT_ICONS = { desk: BookOpen, shelf: Library, bed: BedDouble, door: DoorOpen, up: ChevronsUp, down: ChevronsDown };
const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const PadKey = ({ name, label, icon: Icon, onHold }) => (
  <button
    type="button"
    className={`c3-key is-${name}`}
    aria-label={label}
    onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); onHold(name, true); }}
    onPointerUp={() => onHold(name, false)}
    onPointerCancel={() => onHold(name, false)}
    onLostPointerCapture={() => onHold(name, false)}
    onContextMenu={(event) => event.preventDefault()}
    onBlur={() => onHold(name, false)}
  >
    <Icon aria-hidden="true" />
  </button>
);

/** Your house, outside the school gate: a desk to read at, a bed, and shelves of books. */
const HomePage = () => {
  const navigate = useNavigate();
  const holderRef = useRef(null);
  const roomRef = useRef(null);
  const inputRef = useRef({ x: 0, y: 0 });
  const heldRef = useRef(new Set());
  const nearRef = useRef(null);
  const doingRef = useRef(null);
  const [status, setStatus] = useState("loading");
  const [character, setCharacter] = useState(undefined);
  const [near, setNear] = useState(null);
  const [doing, setDoing] = useState(null);     // null | "read" | "sleep"
  const [floor, setFloor] = useState(0);        // 0 downstairs, 1 the study upstairs
  const [shelfOpen, setShelfOpen] = useState(false);
  const [courses, setCourses] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [note, setNote] = useState("");
  const [sky] = useState(() => timeOfDay());

  useEffect(() => {
    let active = true;
    // The character from the 3D campus, if you made one (signed in with Google or as a guest).
    campusRequest("profile").then((result) => { if (active) setCharacter(result.profile || null); }).catch(() => { if (active) setCharacter(null); });
    fetchCourses().then((result) => { if (active) setCourses(result.courses || []); }).catch(() => { if (active) setCourses([]); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (character === undefined) return undefined;
    let cancelled = false;
    let room = null;
    import("../campus3d/homeRoom").then(({ startRoom }) => {
      if (cancelled || !holderRef.current) return;
      try {
        room = startRoom(holderRef.current, {
          sky, look: character ? characterLook(character) : undefined, input: inputRef.current,
          onNear: (spot) => { nearRef.current = spot; setNear(spot); },
          onSound: playSound,
        });
        roomRef.current = room;
        if (import.meta.env.DEV) window.__home = room;
        setStatus("ready");
      } catch (error) {
        console.error("Không dựng được căn phòng 3D", error);
        setStatus("failed");
      }
    }).catch((error) => {
      if (cancelled) return;
      console.error("Không tải được căn phòng 3D", error);
      setStatus("failed");
    });
    return () => { cancelled = true; room?.stop(); roomRef.current = null; };
  }, [character, sky]);

  const change = useCallback((what) => {
    doingRef.current = what;
    setDoing(what);
    roomRef.current?.doing(what);
  }, []);

  const openSpot = useCallback((spot) => {
    if (!spot) return;
    playSound("select");
    if (spot.id === "door") navigate("/san-truong-3d");
    else if (spot.id === "up" || spot.id === "down") { playSound("next"); setFloor(roomRef.current?.floor(spot.id === "up" ? 1 : 0) ?? 0); }
    else if (spot.id === "shelf") setShelfOpen(true);
    else if (spot.id === "desk") { setSeconds(0); setNote(""); change("read"); }
    else if (spot.id === "bed") { setNote(""); change("sleep"); }
  }, [change, navigate]);

  const getUp = useCallback(() => {
    const was = doingRef.current;
    change(null);
    if (was === "sleep") { playSound("finish"); setNote("Chào buổi sáng! Hôm nay đọc thêm vài trang nhé."); }
  }, [change]);

  // Upstairs the window is open: a soft wind blows as long as you are there (and sound is on).
  useEffect(() => {
    if (floor !== 1) return undefined;
    setWind(true);
    const timer = window.setInterval(() => setWind(true), 1500);
    return () => { window.clearInterval(timer); setWind(false); };
  }, [floor]);

  // The reading clock.
  useEffect(() => {
    if (doing !== "read") return undefined;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [doing]);
  useEffect(() => {
    if (!note) return undefined;
    const timer = window.setTimeout(() => setNote(""), 4000);
    return () => window.clearTimeout(timer);
  }, [note]);

  const sync = useCallback(() => {
    const held = heldRef.current;
    const on = (name) => (held.has(name) ? 1 : 0);
    inputRef.current.x = on("right") - on("left");
    inputRef.current.y = on("up") - on("down");
  }, []);
  const hold = useCallback((name, down) => {
    if (down) heldRef.current.add(name);
    else heldRef.current.delete(name);
    sync();
  }, [sync]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const onControl = event.target instanceof HTMLElement && event.target.closest("button, a, input");
      const move = MOVE_KEYS[event.key];
      if (move) { event.preventDefault(); heldRef.current.add(move); sync(); return; }
      if (event.key === "Escape") { setShelfOpen(false); if (doingRef.current) getUp(); }
      if ((event.key === "Enter" && !onControl) || event.key === "e" || event.key === "E") {
        // Without this the same Enter press would also click the shelf's close button as soon as it opens.
        event.preventDefault();
        if (doingRef.current) getUp();
        else if (nearRef.current) openSpot(nearRef.current);
      }
    };
    const onKeyUp = (event) => {
      const move = MOVE_KEYS[event.key];
      if (move) { heldRef.current.delete(move); sync(); }
    };
    const release = () => { heldRef.current.clear(); sync(); };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
    };
  }, [getUp, sync, openSpot]);

  const reading = (courses || []).filter((course) => course.learning?.nextLesson).slice(0, 3);
  const SpotIcon = near ? SPOT_ICONS[near.id] : null;

  return (
    <div className={`c3-shell hm-shell is-${sky} ${doing === "sleep" ? "is-asleep" : ""}`}>
      <div className="c3-stage" ref={holderRef} />

      <header className="c3-top">
        <Link className="c3-pill" to="/san-truong-3d"><ArrowLeft aria-hidden="true" />Ra sân trường</Link>
        <span className="c3-pill hm-title">{character ? `Nhà của ${character.name}` : "Nhà của bạn"}<small>{floor === 1 ? "Tầng 2" : "Tầng 1"}</small></span>
        <div className="c3-top-right">
          <span className="c3-pill c3-sound"><SoundToggle /></span>
        </div>
      </header>

      {status === "loading" && <p className="c3-loading" role="status">Đang mở cửa nhà…</p>}
      {status === "failed" && (
        <div className="c3-failed" role="alert">
          <h1>Máy này chưa bật được đồ họa 3D</h1>
          <p>Sách của bạn vẫn ở Trường Lộ trình học.</p>
          <Link className="c3-enter" to="/learn">Tới Trường Lộ trình học</Link>
        </div>
      )}
      {note && <p className="hm-banner" role="status">{note}</p>}

      {status === "ready" && !doing && (
        <>
          <div className="c3-prompt" aria-live="polite">
            {near ? (
              <button type="button" className="c3-enter" onClick={() => openSpot(near)}><SpotIcon aria-hidden="true" />{near.label}<kbd>Enter</kbd></button>
            ) : (
              <p className="c3-hint">{floor === 1 ? "Bàn học ở ngay cửa sổ. Đi tới ghế rồi nhấn Enter để ngồi học." : "Bàn học ở tầng 2: đi tới cầu thang bên trái. Dưới này có kệ sách và giường."}</p>
            )}
          </div>
          <div className="c3-pad" role="group" aria-label="Nút di chuyển">
            <PadKey name="up" label="Đi lên" icon={ChevronUp} onHold={hold} />
            <PadKey name="left" label="Sang trái" icon={ChevronLeft} onHold={hold} />
            <PadKey name="down" label="Đi xuống" icon={ChevronDown} onHold={hold} />
            <PadKey name="right" label="Sang phải" icon={ChevronRight} onHold={hold} />
          </div>
        </>
      )}

      {doing === "read" && (
        <aside className="hm-card" aria-label="Đang đọc sách">
          <h1><BookOpen aria-hidden="true" />Bạn đang học bên cửa sổ</h1>
          <p className="hm-clock" role="timer">{clock(seconds)}</p>
          {reading.length > 0 ? (
            <>
              <h2>Đọc tiếp bài học</h2>
              <ul className="hm-next">
                {reading.map((course) => (
                  <li key={course.id}>
                    <Link to={`/learn/${course.id}/${course.learning.nextLesson.id}`}>
                      <BookCover course={course} size="sm" />
                      <span><strong>{course.learning.nextLesson.title}</strong><small>{course.title}</small></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="hm-empty">Kệ chưa có cuốn sách nào để học. Tải một cuốn sách PDF lên ở <Link to="/learn">Trường Lộ trình học</Link>, nó sẽ nằm trên kệ này.</p>
          )}
          <button type="button" className="c3-pill hm-up" onClick={getUp}>Đứng dậy<kbd>Enter</kbd></button>
        </aside>
      )}

      {doing === "sleep" && (
        <div className="hm-sleep">
          <p>Đang ngủ… zzz</p>
          <button type="button" className="c3-enter" onClick={getUp}><Sunrise aria-hidden="true" />Thức dậy<kbd>Enter</kbd></button>
        </div>
      )}

      {shelfOpen && (
        <div className="hm-veil" onClick={(event) => { if (event.target === event.currentTarget) setShelfOpen(false); }}>
          <section className="hm-dialog hm-shelf" role="dialog" aria-modal="true" aria-label="Kệ sách">
            <button type="button" className="hm-close" onClick={() => setShelfOpen(false)} aria-label="Đóng" autoFocus><X aria-hidden="true" /></button>
            <h1>Kệ sách của bạn</h1>
            {courses === null ? <p className="hm-lead">Đang xếp sách…</p> : courses.length === 0 ? (
              <p className="hm-lead">Chưa có cuốn nào. Tải một cuốn sách PDF lên ở <Link to="/learn">Trường Lộ trình học</Link> để có lộ trình học theo từng chương.</p>
            ) : (
              <>
                <p className="hm-lead">{courses.length} cuốn. Chọn một cuốn để mở lộ trình học của nó.</p>
                <ul className="hm-books">
                  {courses.map((course) => (
                    <li key={course.id}>
                      <Link to={`/learn/${course.id}`}>
                        <BookCover course={course} />
                        <span>{course.title}</span>
                        {course.learning?.lessonCount ? <small>{course.learning.lessonsDone}/{course.learning.lessonCount} bài</small> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default HomePage;
