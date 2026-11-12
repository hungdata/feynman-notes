import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Box, CheckSquare2, Flame, GraduationCap, Network, Star } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/campus.css";
import CampusScene from "../campus/CampusScene";
import { ArcadeZone, BasketballZone, BursarZone, CampusNav, FootballZone, LanguageZone, ZoneRoad } from "../campus/Zones";
import { SCHOOLS } from "../school/schools";
import { SPOTS, greetingFor, projectPoint, spotFor, timeOfDay } from "../campus/scene";
import { today } from "../learn/api";
import { playSound } from "../learn/sound";
import { useUiTheme } from "../learn/useUiTheme";

const ROUTES = { mindmap: "/mindmaps", learn: "/learn", tasks: "/tasks" };
const WALK_MS = 900;
const ENTER_MS = 650;

const getJson = async (url) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(String(response.status));
  return response.json();
};

/** Live numbers for each school; every source may fail on its own. */
const useCampusStats = () => {
  const [stats, setStats] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([getJson("/api/mindmaps?view=summary"), getJson(`/api/courses?day=${today()}`), getJson("/api/tasks")]).then(([maps, courses, tasks]) => {
      if (cancelled) return;
      const next = {};
      if (maps.status === "fulfilled") {
        const live = (maps.value.maps || []).filter((map) => !map.trashedAt);
        next.mindmap = { count: live.length, latest: live.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.title || "" };
      }
      if (courses.status === "fulfilled") {
        const list = courses.value.courses || [];
        const studying = [...list].filter((course) => course.learning?.nextLesson)
          .sort((a, b) => String(b.learning.lastStudiedAt || "").localeCompare(String(a.learning.lastStudiedAt || "")))[0];
        next.learn = { learner: courses.value.learner, courseCount: list.length, nextLesson: studying?.learning.nextLesson?.title || "" };
        next.schools = list.reduce((counts, course) => ({ ...counts, [course.school || "general"]: (counts[course.school || "general"] || 0) + 1 }), {});
      }
      if (tasks.status === "fulfilled") next.tasks = { active: tasks.value.activeCount ?? 0, done: tasks.value.completeCount ?? 0 };
      setStats(next);
    });
    return () => { cancelled = true; };
  }, []);
  return stats;
};

const lines = (stats) => ({
  mindmap: stats.mindmap ? (stats.mindmap.count ? `Có ${stats.mindmap.count} mind map đang chờ mình!` : "Vẽ mind map đầu tiên thôi!") : "Vẽ sơ đồ ý tưởng nào!",
  learn: stats.learn?.nextLesson ? `Bài tiếp: ${stats.learn.nextLesson}` : "Học một cuốn sách mới nhé!",
  tasks: stats.tasks ? (stats.tasks.active ? `Còn ${stats.tasks.active} việc cần làm` : "Hết việc rồi, tuyệt!") : "Xem việc cần làm hôm nay",
});

const GATES = [
  { id: "mindmap", icon: Network, title: "Trường Mind Map", text: "Vẽ sơ đồ tư duy, ghi chú và trình chiếu ý tưởng." },
  { id: "learn", icon: GraduationCap, title: "Trường Lộ trình học", text: "Biến sách PDF thành bài học 3 phút với câu trắc nghiệm." },
  { id: "tasks", icon: CheckSquare2, title: "Trường Checklist", text: "Danh sách việc cần làm, đánh dấu xong từng việc." },
];

const GateStat = ({ id, stats }) => {
  if (id === "mindmap") {
    if (!stats.mindmap) return <p className="cp-gate-stat">&nbsp;</p>;
    return <p className="cp-gate-stat"><strong>{stats.mindmap.count}</strong> mind map{stats.mindmap.latest && <span>Gần nhất: {stats.mindmap.latest}</span>}</p>;
  }
  if (id === "learn") {
    const learner = stats.learn?.learner;
    if (!learner) return <p className="cp-gate-stat">&nbsp;</p>;
    return (
      <p className="cp-gate-stat">
        <span className="cp-chip is-streak"><Flame /> {learner.streak || 0} ngày</span>
        <span className="cp-chip is-xp"><Star /> {learner.today || 0}/{learner.dailyGoal || 30} XP hôm nay</span>
      </p>
    );
  }
  if (!stats.tasks) return <p className="cp-gate-stat">&nbsp;</p>;
  return <p className="cp-gate-stat"><strong>{stats.tasks.active}</strong> việc chưa xong<span>{stats.tasks.done} việc đã xong</span></p>;
};

/** Size of an element, kept up to date with ResizeObserver. */
const useSize = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
};

const CampusPage = () => {
  useUiTheme();
  const navigate = useNavigate();
  const stats = useCampusStats();
  const [sky] = useState(() => timeOfDay());
  const [greeting] = useState(() => greetingFor());
  const [hovered, setHovered] = useState(null);
  const [target, setTarget] = useState(null);
  const [entering, setEntering] = useState(false);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState(1);
  const positionRef = useRef(SPOTS.center);
  const hoveredRef = useRef(null);
  const pickedRef = useRef(null);
  const timers = useRef([]);
  const [worldRef, worldSize] = useSize();

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const login = params.get("login");
    if (!login) return;
    let returnTo;
    try {
      returnTo = sessionStorage.getItem("feynman.campus3d.return");
      sessionStorage.removeItem("feynman.campus3d.return");
    } catch { /* browser storage may be disabled */ }
    if (returnTo && /^\/san-truong-3d(?:\?|$)/.test(returnTo)) {
      const destination = new URL(returnTo, window.location.origin);
      destination.searchParams.set("login", login);
      if (params.get("message")) destination.searchParams.set("message", params.get("message"));
      navigate(`${destination.pathname}${destination.search}`, { replace: true });
      return;
    }
    if (login !== "success") toast.error(params.get("message") || "Đăng nhập không thành công.");
    window.history.replaceState({}, "", window.location.pathname);
  }, [navigate]);

  // Coming from the 3D campus with a place in the address (#tai-vu): scroll to it.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return undefined;
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const later = (callback, delay) => { timers.current.push(window.setTimeout(callback, delay)); };

  /** Moves the student; faces the direction of travel and swings legs while moving. */
  const walkTo = useCallback((nextTarget, nextEntering = false) => {
    const from = positionRef.current;
    const to = spotFor(nextTarget, nextEntering);
    if (Math.abs(to.x - from.x) > 4) setFacing(to.x < from.x ? -1 : 1);
    positionRef.current = to;
    setTarget(nextTarget);
    setEntering(nextEntering);
    setWalking(true);
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    later(() => setWalking(false), nextEntering ? ENTER_MS : WALK_MS);
  }, []);

  const hover = useCallback((id) => {
    if (pickedRef.current) return;
    hoveredRef.current = id;
    setHovered(id);
    if (id) walkTo(id);
    // Back to the plaza when the pointer leaves every school for a moment.
    else later(() => { if (!hoveredRef.current && !pickedRef.current) walkTo(null); }, 500);
  }, [walkTo]);

  const pick = useCallback((id) => {
    if (pickedRef.current) return;
    pickedRef.current = id;
    setHovered(id);
    playSound("next");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { navigate(ROUTES[id]); return; }
    const alreadyThere = positionRef.current === spotFor(id, false);
    if (!alreadyThere) walkTo(id);
    later(() => {
      walkTo(id, true);
      later(() => navigate(ROUTES[id]), ENTER_MS);
    }, alreadyThere ? 0 : WALK_MS * 0.85);
  }, [navigate, walkTo]);

  const spot = spotFor(target, entering);
  // The speech bubble sits beside the head, on the side facing the middle of the campus.
  const bubbleSide = spot.x > 760 ? "left" : "right";
  const bubbleAt = projectPoint({ x: spot.x + (bubbleSide === "right" ? 20 : -16) * spot.scale, y: spot.y - 104 * spot.scale }, worldSize);
  const bubble = target ? lines(stats)[target] : "Hôm nay mình vào trường nào nhỉ?";
  const learner = stats.learn?.learner;

  return (
    <div className={`cp-shell is-${sky}`}>
      <section id="khu-hoc" className="cp-stage">
        <div className="cp-world" ref={worldRef}>
          <CampusScene sky={sky} active={hovered || target} target={target} entering={entering} walking={walking} facing={facing} onPick={pick} onHover={hover} />
          {worldSize.w > 0 && (
            <div className={`cp-bubble is-${bubbleSide} ${entering ? "is-hidden" : ""}`} aria-live="polite" style={{ left: bubbleAt.left, top: bubbleAt.top }}>
              {bubble}
            </div>
          )}
        </div>

        <header className="cp-hero">
          <p className="cp-brand"><span className="cp-brand-mark" aria-hidden="true" />Feynman Notes</p>
          <h1>{greeting}!</h1>
          <p>Chọn một ngôi trường để vào học.</p>
          <Link className="cp-walk" to="/san-truong-3d"><Box aria-hidden="true" />Đi dạo sân trường 3D</Link>
        </header>
        {learner && (
          <div className="cp-top-stats" aria-label="Thành tích học tập">
            <span className={`cp-chip is-streak ${learner.streak ? "is-on" : ""}`} title="Chuỗi ngày học liên tiếp"><Flame /> {learner.streak || 0}</span>
            <span className="cp-chip is-xp" title="Tổng điểm kinh nghiệm"><Star /> {learner.xp || 0} XP</span>
          </div>
        )}
      </section>

      <nav className="cp-gates" aria-label="Các ngôi trường">
        {GATES.map(({ id, icon: Icon, title, text }) => (
          <button
            key={id}
            type="button"
            className={`cp-gate is-${id} ${(hovered || target) === id ? "is-active" : ""}`}
            onClick={() => pick(id)}
            onMouseEnter={() => hover(id)}
            onMouseLeave={() => hover(null)}
            onFocus={() => hover(id)}
            onBlur={() => hover(null)}
          >
            <span className="cp-gate-icon"><Icon /></span>
            <span className="cp-gate-body">
              <strong>{title}</strong>
              <span className="cp-gate-text">{text}</span>
              <GateStat id={id} stats={stats} />
            </span>
            <span className="cp-gate-go">Vào trường</span>
          </button>
        ))}
      </nav>

      <ZoneRoad to="Sân bóng đá" />
      <FootballZone sky={sky} />
      <ZoneRoad to="Sân bóng rổ" />
      <BasketballZone sky={sky} />
      <ZoneRoad to="Nhà giải trí" />
      <ArcadeZone sky={sky} onOpen={() => { playSound("next"); navigate("/giai-tri"); }} />
      <ZoneRoad to="Khu ngoại ngữ" />
      <LanguageZone sky={sky} counts={{ english: stats.schools?.english || 0, japanese: stats.schools?.japanese || 0, korean: stats.schools?.korean || 0 }} onPick={(id) => { playSound("next"); navigate(SCHOOLS[id].path); }} />
      <ZoneRoad to="Phòng tài vụ" />
      <BursarZone sky={sky} />
      <footer className="cp-footer">Feynman Notes: học ít mà đều, mỗi ngày một bài.</footer>
      <CampusNav />
    </div>
  );
};

export default CampusPage;
