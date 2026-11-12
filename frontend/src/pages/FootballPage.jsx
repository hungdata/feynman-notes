import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gamepad2, Keyboard, Pause, Play, RotateCcw, Video, Volume2, VolumeX } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/football.css";
import { DIFFICULTIES, FIELD, FORMATIONS, KITS, ROLE_NAMES, TEAM_PRESETS } from "../football/constants";
import { clockText, createMatch, drainEvents, possessionShare, startSecondHalf, stepMatch, userAttacking } from "../football/sim";
import { createController, keyName, padKey } from "../football/controls";
import { netSwish, roar, startCrowd, stopCrowd, thud, whistle } from "../football/audio";
import { isSoundOn, setSoundOn } from "../learn/sound";

const SETTINGS_KEY = "feynman.football.settings";
const DEFAULTS = { formation: "4-3-3", awayFormation: "4-2-3-1", difficulty: "normal", halfMinutes: 4, homeKit: "red", awayKit: "blue", night: false, camera: "tele" };
const CAMERAS = { tele: "Truyền hình", close: "Cận cảnh", end: "Dọc sân" };
const HALF_OPTIONS = [3, 4, 6, 8];

const readSettings = () => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
};
const saveSettings = (value) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* chế độ riêng tư */ }
};
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const BANNERS = {
  corner: "Phạt góc",
  throw: "Ném biên",
  goalkick: "Phát bóng lên",
  freekick: "Đá phạt",
  penalty: "PHẠT ĐỀN!",
  offside: "Việt vị",
  post: "Dội cột dọc!",
  save: "Cứu thua!",
};

/** Gợi ý phím theo tình huống, hiện dưới màn hình. */
const hintFor = (match) => {
  if (!match) return "";
  const sp = match.setPiece;
  if (sp && sp.team === match.user.team) {
    if (sp.type === "kickoff") return "Giao bóng: S chuyền ngắn · ←↑↓→ chọn hướng";
    if (sp.type === "corner") return "Phạt góc: A tạt bóng (↑/↓ chọn cột gần/xa) · S chuyền ngắn";
    if (sp.type === "throw") return "Ném biên: S ném gần · A ném xa · W ném cho đồng đội băng lên";
    if (sp.type === "goalkick") return "Phát bóng: S phát ngắn cho hậu vệ · A phát dài";
    if (sp.type === "penalty") return "Phạt đền: ↑/↓ chọn góc · giữ D lấy lực rồi thả (đừng quá lực!) · Z+D sút xoáy · Q+D bấm bóng";
    if (sp.type === "freekick") return "Đá phạt: D sút (mặc định sút xoáy) · S/A chuyền · ←↑↓→ chọn hướng";
  }
  if (sp) return "Đối thủ đang thực hiện tình huống cố định…";
  if (userAttacking(match)) return "S chuyền · W chọc khe · A bổng/tạt · D sút · E tăng tốc · C che bóng · Z+D sút xoáy · Q+D bấm bóng";
  return "Q đổi người · giữ D áp sát · Space tắc · S xoạc · giữ A gọi đồng đội áp sát · W thủ môn lao ra";
};

/* ---------- radar thu nhỏ ---------- */

const RADAR = { w: 220, h: Math.round((220 * FIELD.width) / FIELD.length) };

const drawRadar = (canvas, match) => {
  if (!canvas || !match) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== RADAR.w * ratio) { canvas.width = RADAR.w * ratio; canvas.height = RADAR.h * ratio; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, RADAR.w, RADAR.h);
  ctx.fillStyle = "rgba(14, 60, 30, 0.72)";
  ctx.fillRect(0, 0, RADAR.w, RADAR.h);
  const sx = (x) => ((x + FIELD.halfL) / FIELD.length) * RADAR.w;
  const sz = (z) => ((z + FIELD.halfW) / FIELD.width) * RADAR.h;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, RADAR.w - 3, RADAR.h - 3);
  ctx.beginPath(); ctx.moveTo(RADAR.w / 2, 0); ctx.lineTo(RADAR.w / 2, RADAR.h); ctx.stroke();
  ctx.beginPath(); ctx.arc(RADAR.w / 2, RADAR.h / 2, (FIELD.circle / FIELD.length) * RADAR.w, 0, Math.PI * 2); ctx.stroke();
  for (const side of [-1, 1]) {
    const x = side < 0 ? 1.5 : RADAR.w - 1.5 - (FIELD.boxDepth / FIELD.length) * RADAR.w;
    ctx.strokeRect(x, sz(-FIELD.boxHalf), (FIELD.boxDepth / FIELD.length) * RADAR.w, (FIELD.boxHalf * 2 / FIELD.width) * RADAR.h);
  }
  for (const p of match.players) {
    if (p.sentOff) continue;
    const kit = match.teams[p.team].kit;
    ctx.fillStyle = p.role === "GK" ? kit.gk : kit.shirt;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(sx(p.x), sz(p.z), p.id === match.user.controlledId && !match.user.auto ? 4.6 : 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (p.id === match.user.controlledId && !match.user.auto) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx(p.x), sz(p.z), 7, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 1;
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(sx(match.ball.x), sz(match.ball.z), 2.6, 0, Math.PI * 2); ctx.fill();
};

/* ---------- các màn hình phụ ---------- */

const ControlsSheet = () => (
  <div className="fb-controls-sheet">
    <section>
      <h3><Keyboard size={16} /> Tấn công</h3>
      <dl>
        <dt>← ↑ ↓ →</dt><dd>Di chuyển</dd>
        <dt>S</dt><dd>Chuyền ngắn (giữ lâu: chuyền xa hơn)</dd>
        <dt>W</dt><dd>Chọc khe</dd>
        <dt>A</dt><dd>Chuyền bổng / tạt bóng</dd>
        <dt>D</dt><dd>Sút (giữ để lấy lực)</dd>
        <dt>D, D</dt><dd>Sút sệt</dd>
        <dt>Z + D</dt><dd>Sút xoáy (ZD)</dd>
        <dt>Q + D</dt><dd>Bấm bóng qua thủ môn</dd>
        <dt>Q + W</dt><dd>Chọc khe bổng</dd>
        <dt>E / Shift</dt><dd>Tăng tốc</dd>
        <dt>C</dt><dd>Che bóng</dd>
        <dt>Z (chạm nhanh)</dt><dd>Giật bóng theo hướng</dd>
      </dl>
    </section>
    <section>
      <h3><Keyboard size={16} /> Phòng ngự</h3>
      <dl>
        <dt>Q</dt><dd>Đổi người</dd>
        <dt>Giữ D</dt><dd>Áp sát người cầm bóng</dd>
        <dt>Giữ A</dt><dd>Gọi đồng đội áp sát</dd>
        <dt>Space</dt><dd>Tắc bóng</dd>
        <dt>S</dt><dd>Xoạc bóng (dễ phạm lỗi từ phía sau)</dd>
        <dt>W</dt><dd>Thủ môn lao ra</dd>
        <dt>Esc / P</dt><dd>Tạm dừng</dd>
      </dl>
      <h3><Gamepad2 size={16} /> Tay cầm</h3>
      <p>A chuyền · X sút · B bổng · Y chọc khe · RT tăng tốc · LB đổi người · RB sút xoáy. Phòng ngự: A áp sát · B tắc · X xoạc.</p>
    </section>
  </div>
);

const Choice = ({ value, current, onPick, children, style }) => (
  <button type="button" className={`fb-choice ${value === current ? "is-on" : ""}`} aria-pressed={value === current} onClick={() => onPick(value)} style={style}>{children}</button>
);

const MatchMenu = ({ settings, setSettings, onStart, onDemo }) => {
  const set = (key) => (value) => setSettings((old) => ({ ...old, [key]: value }));
  const home = KITS[settings.homeKit];
  const away = KITS[settings.awayKit === settings.homeKit ? (settings.homeKit === "white" ? "black" : "white") : settings.awayKit];
  return (
    <div className="fb-menu">
      <div className="fb-menu-card">
        <header className="fb-menu-head">
          <Link className="fb-pill" to="/san-truong-3d"><ArrowLeft size={16} />Sân trường 3D</Link>
          <h1>Feynman Cup <span>Đá 11 người</span></h1>
          <p>Bạn cầm cả đội 11 người như FIFA Online 4: điều khiển cầu thủ gần bóng nhất, chuyền là tự đổi sang người nhận, phòng ngự bấm Q để đổi người.</p>
        </header>
        <div className="fb-versus">
          <div className="fb-crest" style={{ "--kit": home.shirt, "--trim": home.number }}><b>{TEAM_PRESETS.home.short}</b><span>{TEAM_PRESETS.home.name}</span></div>
          <strong>VS</strong>
          <div className="fb-crest" style={{ "--kit": away.shirt, "--trim": away.number }}><b>{TEAM_PRESETS.away.short}</b><span>{TEAM_PRESETS.away.name}</span></div>
        </div>
        <div className="fb-options">
          <fieldset><legend>Sơ đồ của bạn</legend><div className="fb-choices">{Object.keys(FORMATIONS).map((name) => <Choice key={name} value={name} current={settings.formation} onPick={set("formation")}>{name}</Choice>)}</div></fieldset>
          <fieldset><legend>Đối thủ</legend><div className="fb-choices">{Object.entries(DIFFICULTIES).map(([id, level]) => <Choice key={id} value={id} current={settings.difficulty} onPick={set("difficulty")}>{level.name}</Choice>)}</div></fieldset>
          <fieldset><legend>Mỗi hiệp</legend><div className="fb-choices">{HALF_OPTIONS.map((minutes) => <Choice key={minutes} value={minutes} current={settings.halfMinutes} onPick={set("halfMinutes")}>{minutes} phút</Choice>)}</div></fieldset>
          <fieldset><legend>Áo đội nhà</legend><div className="fb-choices">{Object.entries(KITS).map(([id, kit]) => <Choice key={id} value={id} current={settings.homeKit} onPick={set("homeKit")} style={{ "--swatch": kit.shirt }}><i className="fb-swatch" />{kit.name}</Choice>)}</div></fieldset>
          <fieldset><legend>Áo đội khách</legend><div className="fb-choices">{Object.entries(KITS).map(([id, kit]) => <Choice key={id} value={id} current={settings.awayKit} onPick={set("awayKit")} style={{ "--swatch": kit.shirt }}><i className="fb-swatch" />{kit.name}</Choice>)}</div></fieldset>
          <fieldset><legend>Sân &amp; camera</legend><div className="fb-choices"><Choice value={false} current={settings.night} onPick={set("night")}>Ban ngày</Choice><Choice value={true} current={settings.night} onPick={set("night")}>Đá đêm</Choice>{Object.entries(CAMERAS).map(([id, name]) => <Choice key={id} value={id} current={settings.camera} onPick={set("camera")}>{name}</Choice>)}</div></fieldset>
        </div>
        <details className="fb-how"><summary>Bảng phím (giống FO4)</summary><ControlsSheet /></details>
        <div className="fb-menu-actions">
          <button type="button" className="fb-start" onClick={onStart}><Play size={18} />Vào trận</button>
          <button type="button" className="fb-secondary" onClick={onDemo}>Xem máy đá với máy</button>
        </div>
      </div>
    </div>
  );
};

const StatsTable = ({ report }) => {
  const [a, b] = report.teams;
  const share = report.possession;
  const rows = [
    ["Kiểm soát bóng", `${share}%`, `${100 - share}%`],
    ["Sút", a.stats.shots, b.stats.shots],
    ["Sút trúng đích", a.stats.onTarget, b.stats.onTarget],
    ["Chuyền thành công", `${a.stats.passOk}/${a.stats.passes}`, `${b.stats.passOk}/${b.stats.passes}`],
    ["Tắc bóng", a.stats.tackles, b.stats.tackles],
    ["Phạt góc", a.stats.corners, b.stats.corners],
    ["Việt vị", a.stats.offsides, b.stats.offsides],
    ["Phạm lỗi", a.stats.fouls, b.stats.fouls],
    ["Thẻ vàng / đỏ", `${a.stats.yellows}/${a.stats.reds}`, `${b.stats.yellows}/${b.stats.reds}`],
    ["Cứu thua", a.stats.saves, b.stats.saves],
  ];
  return (
    <table className="fb-stats">
      <thead><tr><th>{a.short}</th><th /><th>{b.short}</th></tr></thead>
      <tbody>{rows.map(([label, x, y]) => <tr key={label}><td>{x}</td><th scope="row">{label}</th><td>{y}</td></tr>)}</tbody>
    </table>
  );
};

/** Đọc tay cầm đầu tiên: cần trái để chạy, nút đổi theo tình huống tấn công/phòng ngự. */
const pollGamepad = (match, controller, now, padState, stickInUse, togglePause, pausedRef) => {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find(Boolean);
  if (!pad) return;
  const [ax = 0, ay = 0] = pad.axes;
  const dead = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  if (!pausedRef.current && !stickInUse) controller.setStick(dead(ax), -dead(ay));
  const attacking = userAttacking(match);
  pad.buttons.forEach((button, index) => {
    const was = padState.get(index);
    if (button.pressed && !was) {
      if (index === 9) { togglePause(); padState.set(index, "pause"); return; }
      if (pausedRef.current) { padState.set(index, "none"); return; }
      const key = padKey(index, attacking);
      padState.set(index, key || "none");
      if (key) controller.press(match, key, now);
    } else if (!button.pressed && was) {
      if (!pausedRef.current && was !== "none" && was !== "pause") controller.release(match, was, now);
      padState.delete(index);
    }
  });
};

/** Ảnh chụp số liệu trận để hiện trên bảng (React không đọc trực tiếp trận đang chạy). */
const reportOf = (match) => ({
  teams: match.teams.map((team) => ({ short: team.short, score: team.score, stats: { ...team.stats } })),
  possession: possessionShare(match),
  scorers: match.scorers.map((goal) => ({ ...goal })),
});

/* ---------- trang ---------- */

const FootballPage = () => {
  const [settings, setSettings] = useState(readSettings);
  const [screen, setScreen] = useState("menu");
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState(null);
  const [banner, setBanner] = useState(null);
  const [failed, setFailed] = useState(false);
  const [sound, setSound] = useState(isSoundOn);
  const [demo, setDemo] = useState(false);
  const [report, setReport] = useState(null);
  const [round, setRound] = useState(0);
  const [touch, setTouch] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches);
  const holderRef = useRef(null);
  const matchRef = useRef(null);
  const stadiumRef = useRef(null);
  const controllerRef = useRef(createController());
  const radarRef = useRef(null);
  const powerRef = useRef(null);
  const edgeRef = useRef(null);
  const pausedRef = useRef(false);
  const bannerTimer = useRef(0);
  const padState = useRef(new Map());
  const stickRef = useRef({ id: null, x: 0, y: 0, base: null });
  const knobRef = useRef(null);

  useEffect(() => { saveSettings(settings); }, [settings]);
  const changePause = useCallback((next) => {
    pausedRef.current = next;
    if (next) controllerRef.current.reset();
    setPaused(next);
  }, []);

  const togglePause = useCallback(() => {
    const match = matchRef.current;
    if (!match || match.phase === "halftime" || match.phase === "fulltime") return;
    const next = !pausedRef.current;
    if (next) setReport(reportOf(match));
    changePause(next);
  }, [changePause]);

  const showBanner = useCallback((text, tone = "info", ms = 1600) => {
    window.clearTimeout(bannerTimer.current);
    setBanner({ text, tone, key: Math.random() });
    bannerTimer.current = window.setTimeout(() => setBanner(null), ms);
  }, []);

  const handleEvents = useCallback((match, stadium) => {
    for (const event of drainEvents(match)) {
      switch (event.type) {
        case "kick": thud(event.strength ?? 0.5); break;
        case "shot": stadium.cheer(0.35); roar(0.5); break;
        case "goal": {
          const team = match.teams[event.team];
          const scorer = event.scorer !== null ? match.players[event.scorer] : null;
          showBanner(`VÀOOOO! ${team.short} ${event.own ? "(phản lưới nhà)" : scorer ? `· ${scorer.number} ${scorer.name}` : ""}`, event.team === match.user.team ? "goal" : "goal-away", 3600);
          stadium.cheer(1.4); roar(1.5); netSwish(); whistle(1);
          break;
        }
        case "save": showBanner(BANNERS.save, "info", 1100); stadium.cheer(0.5); roar(0.8); break;
        case "post": showBanner(BANNERS.post, "info", 1200); roar(0.9); thud(0.9); break;
        case "offside": showBanner(BANNERS.offside, "warn"); whistle(1); break;
        case "foul": whistle(1); break;
        case "card": {
          const p = match.players[event.id];
          showBanner(`${event.color === "red" ? "Thẻ đỏ" : "Thẻ vàng"} · ${p.number} ${p.name}`, event.color === "red" ? "red" : "yellow", 2200);
          break;
        }
        case "penalty": showBanner(BANNERS.penalty, "warn", 2200); whistle(1); roar(0.8); break;
        case "corner": case "freekick": showBanner(BANNERS[event.type], "info", 1300); break;
        case "throw": case "goalkick": showBanner(BANNERS[event.type], "soft", 1000); break;
        case "kickoff": whistle(1); break;
        case "halftime": whistle(2, true); setReport(reportOf(match)); setScreen("halftime"); break;
        case "fulltime": whistle(3, true); setReport(reportOf(match)); setScreen("fulltime"); break;
        default: break;
      }
    }
  }, [showBanner]);

  // Dựng trận và vòng lặp khung hình.
  useEffect(() => {
    if (screen !== "playing" && screen !== "halftime" && screen !== "fulltime") return undefined;
    if (matchRef.current && stadiumRef.current) return undefined;
    const match = createMatch({ difficulty: settings.difficulty, halfMinutes: settings.halfMinutes, homeFormation: settings.formation, awayFormation: settings.awayFormation, homeKit: settings.homeKit, awayKit: settings.awayKit, autoplay: demo });
    let stadium = null;
    let cancelled = false;
    let frame = 0;
    let last = performance.now();
    let hudAt = 0;
    const controller = controllerRef.current;
    controller.reset();

    const begin = async () => {
      try {
        const { createStadium } = await import("../football/render");
        if (cancelled || !holderRef.current) return;
        stadium = createStadium(holderRef.current, match, { night: settings.night, camera: settings.camera });
      } catch (cause) {
        console.error("Không dựng được sân 3D", cause);
        setFailed(true);
        return;
      }
      matchRef.current = match;
      stadiumRef.current = stadium;
      if (import.meta.env.DEV) window.__football = { match, stadium };
      startCrowd();
      const onResize = () => stadium.resize();
      window.addEventListener("resize", onResize);
      const loop = (now) => {
        if (cancelled) return;
        frame = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        pollGamepad(match, controller, now, padState.current, stickRef.current.id !== null, togglePause, pausedRef);
        const basis = stadium.basis();
        const { charge } = pausedRef.current ? { charge: null } : controller.update(match, basis, now);
        if (!pausedRef.current) stepMatch(match, dt);
        handleEvents(match, stadium);
        stadium.render(pausedRef.current ? 0 : dt, { charging: Boolean(charge) });
        // Thanh lực dưới chân cầu thủ đang điều khiển.
        const me = match.players[match.user.controlledId];
        const bar = powerRef.current;
        if (bar) {
          if (charge && me) {
            const at = stadium.project({ x: me.x, y: -0.1, z: me.z });
            bar.style.transform = `translate(${at.x - 40}px, ${at.y + 10}px)`;
            bar.style.opacity = "1";
            bar.firstChild.style.width = `${Math.round(charge.power * 100)}%`;
            bar.dataset.key = charge.key;
          } else bar.style.opacity = "0";
        }
        // Mũi tên ở mép màn hình khi cầu thủ của bạn ở ngoài khung hình.
        const edge = edgeRef.current;
        if (edge && me && !match.user.auto) {
          const at = stadium.project({ x: me.x, y: 1, z: me.z });
          if (at.visible) edge.style.opacity = "0";
          else {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const x = Math.max(28, Math.min(w - 28, at.x));
            const y = Math.max(80, Math.min(h - 28, at.y));
            edge.style.opacity = "1";
            edge.style.transform = `translate(${x - 18}px, ${y - 18}px)`;
          }
        }
        if (now - hudAt > 110) {
          hudAt = now;
          drawRadar(radarRef.current, match);
          const controlled = match.players[match.user.controlledId];
          setHud({
            score: [match.teams[0].score, match.teams[1].score],
            clock: clockText(match),
            half: match.half,
            name: controlled?.name,
            number: controlled?.number,
            role: controlled ? ROLE_NAMES[controlled.role] : "",
            stamina: controlled?.stamina ?? 1,
            attacking: userAttacking(match),
            hint: hintFor(match),
            phase: match.phase,
          });
        }
      };
      frame = requestAnimationFrame(loop);
      cleanupResize = () => window.removeEventListener("resize", onResize);
    };
    let cleanupResize = () => {};
    void begin();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      cleanupResize();
      stopCrowd();
      stadium?.dispose();
      matchRef.current = null;
      stadiumRef.current = null;
    };
    // Trận mới khi bấm “Đá lại” (round) hoặc vào/ra menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen === "menu", round]);

  useEffect(() => { stadiumRef.current?.setCamera(settings.camera); }, [settings.camera]);

  // Bàn phím.
  useEffect(() => {
    if (screen === "menu") return undefined;
    const controller = controllerRef.current;
    const down = (event) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        if (!event.repeat && screen === "playing") togglePause();
        event.preventDefault();
        return;
      }
      const key = keyName(event);
      if (!key) return;
      event.preventDefault();
      if (event.repeat || pausedRef.current) return;
      controller.press(matchRef.current, key);
    };
    const up = (event) => {
      if (pausedRef.current) return;
      const key = keyName(event);
      if (!key) return;
      controller.release(matchRef.current, key);
    };
    const blur = () => controller.reset();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [screen, togglePause]);

  /* ----- nút cảm ứng ----- */
  const touchPress = (key) => (event) => { event.preventDefault(); if (pausedRef.current) return; event.currentTarget.setPointerCapture?.(event.pointerId); controllerRef.current.press(matchRef.current, key); };
  const touchRelease = (key) => () => { if (!pausedRef.current) controllerRef.current.release(matchRef.current, key); };
  const stickDown = (event) => {
    event.preventDefault();
    if (pausedRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    stickRef.current = { id: event.pointerId, base: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, r: rect.width / 2 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stickMove(event);
  };
  const stickMove = (event) => {
    if (pausedRef.current) return;
    const stick = stickRef.current;
    if (stick.id !== event.pointerId || !stick.base) return;
    let dx = (event.clientX - stick.base.x) / stick.r;
    let dy = (event.clientY - stick.base.y) / stick.r;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    controllerRef.current.setStick(dx, -dy);
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
  };
  const stickUp = () => {
    stickRef.current = { id: null, base: null };
    controllerRef.current.setStick(0, 0);
    if (knobRef.current) knobRef.current.style.transform = "translate(0, 0)";
  };

  const start = (auto = false) => {
    setDemo(auto);
    changePause(false);
    setRound((value) => value + 1);
    setScreen("playing");
  };
  const restart = () => {
    setDemo(false);
    changePause(false);
    setRound((value) => value + 1);
    setScreen("playing");
  };
  const secondHalf = () => {
    if (matchRef.current) startSecondHalf(matchRef.current);
    setScreen("playing");
  };
  const toggleSound = () => {
    const next = !sound;
    setSoundOn(next);
    setSound(next);
    if (next) startCrowd(); else stopCrowd();
  };
  const cycleCamera = () => {
    const ids = Object.keys(CAMERAS);
    setSettings((old) => ({ ...old, camera: ids[(ids.indexOf(old.camera) + 1) % ids.length] }));
  };

  const homeKit = KITS[settings.homeKit];
  const awayKit = KITS[settings.awayKit === settings.homeKit ? (settings.homeKit === "white" ? "black" : "white") : settings.awayKit];

  if (screen === "menu") return <MatchMenu settings={settings} setSettings={setSettings} onStart={() => start(false)} onDemo={() => start(true)} />;

  return (
    <div className={`fb-shell ${touch ? "is-touch" : ""}`}>
      <div className="fb-stage" ref={holderRef} />
      {failed && <div className="fb-overlay" role="alert"><div className="fb-panel"><h2>Máy này chưa bật được đồ họa 3D</h2><p>Trình duyệt không tạo được WebGL.</p><Link className="fb-start" to="/san-truong-3d">Về sân trường</Link></div></div>}
      <header className="fb-scoreboard" aria-live="polite">
        <span className="fb-team" style={{ "--kit": homeKit.shirt }}>{TEAM_PRESETS.home.short}</span>
        <strong>{hud?.score[0] ?? 0}<em>-</em>{hud?.score[1] ?? 0}</strong>
        <span className="fb-team" style={{ "--kit": awayKit.shirt }}>{TEAM_PRESETS.away.short}</span>
        <time>{hud?.clock ?? "00:00"}</time>
        <small>{hud?.half === 2 ? "Hiệp 2" : "Hiệp 1"}</small>
      </header>
      <div className="fb-top-actions">
        <button type="button" className="fb-icon" onClick={cycleCamera} title={`Camera: ${CAMERAS[settings.camera]}`} aria-label="Đổi góc camera"><Video size={18} /></button>
        <button type="button" className="fb-icon" onClick={toggleSound} aria-label={sound ? "Tắt âm thanh" : "Bật âm thanh"}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button type="button" className="fb-icon" onClick={() => setTouch((value) => !value)} aria-pressed={touch} title="Nút cảm ứng" aria-label="Bật/tắt nút cảm ứng"><Gamepad2 size={18} /></button>
        <button type="button" className="fb-icon" onClick={togglePause} aria-label="Tạm dừng"><Pause size={18} /></button>
      </div>
      {banner && <div key={banner.key} className={`fb-banner is-${banner.tone}`} role="status">{banner.text}</div>}
      <canvas className="fb-radar" ref={radarRef} style={{ width: RADAR.w, height: RADAR.h }} aria-hidden="true" />
      {!demo && hud && <aside className="fb-player-card" aria-label="Cầu thủ đang điều khiển">
        <b>{hud.number}</b>
        <div><strong>{hud.name}</strong><small>{hud.role} · {hud.attacking ? "Tấn công" : "Phòng ngự"}</small><i className="fb-stamina"><span style={{ width: `${Math.round(hud.stamina * 100)}%` }} /></i></div>
      </aside>}
      {!demo && hud && !touch && <p className="fb-hint">{hud.hint}</p>}
      {demo && <p className="fb-hint">Máy đang đá với máy. Bấm ⏸ rồi “Đá lại” để tự cầm đội.</p>}
      <div className="fb-power" ref={powerRef} aria-hidden="true"><span /></div>
      <div className="fb-edge" ref={edgeRef} aria-hidden="true">▼</div>

      {touch && !demo && <>
        <div className="fb-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} aria-label="Cần điều khiển" role="application"><span ref={knobRef} /></div>
        <div className="fb-buttons">
          {(hud?.attacking ? [["D", "Sút"], ["S", "Chuyền"], ["W", "Chọc khe"], ["A", "Bổng"], ["E", "Tốc"], ["C", "Che"]] : [["D", "Áp sát"], ["S", "Xoạc"], ["Space", "Tắc"], ["Q", "Đổi"], ["E", "Tốc"], ["A", "Gọi"]]).map(([key, label]) => (
            <button key={`${hud?.attacking}-${key}`} type="button" className={`fb-touch is-${key}`} onPointerDown={touchPress(key)} onPointerUp={touchRelease(key)} onPointerCancel={touchRelease(key)} onLostPointerCapture={touchRelease(key)} onContextMenu={(event) => event.preventDefault()}>{label}</button>
          ))}
        </div>
      </>}

      {paused && screen === "playing" && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>Tạm dừng</h2>
          <div className="fb-panel-actions">
            <button type="button" className="fb-start" onClick={() => changePause(false)}><Play size={18} />Đá tiếp</button>
            <button type="button" className="fb-secondary" onClick={restart}><RotateCcw size={16} />Đá lại</button>
            <button type="button" className="fb-secondary" onClick={() => { changePause(false); setScreen("menu"); }}>Đổi đội hình</button>
            <Link className="fb-secondary" to="/san-truong-3d">Về sân trường</Link>
          </div>
          <div className="fb-choices fb-camera-row">{Object.entries(CAMERAS).map(([id, name]) => <Choice key={id} value={id} current={settings.camera} onPick={(value) => setSettings((old) => ({ ...old, camera: value }))}>{name}</Choice>)}</div>
          {report && <StatsTable report={report} />}
          <details className="fb-how"><summary>Bảng phím</summary><ControlsSheet /></details>
        </div>
      </div>}

      {screen === "halftime" && report && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>Hết hiệp 1</h2>
          <p className="fb-final">{report.teams[0].short} {report.teams[0].score} - {report.teams[1].score} {report.teams[1].short}</p>
          <StatsTable report={report} />
          <p className="fb-note">Sang hiệp 2 hai đội đổi sân.</p>
          <div className="fb-panel-actions"><button type="button" className="fb-start" onClick={secondHalf}><Play size={18} />Đá hiệp 2</button></div>
        </div>
      </div>}

      {screen === "fulltime" && report && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>{report.teams[0].score > report.teams[1].score ? "Chiến thắng!" : report.teams[0].score < report.teams[1].score ? "Thua rồi…" : "Hòa"}</h2>
          <p className="fb-final">{report.teams[0].short} {report.teams[0].score} - {report.teams[1].score} {report.teams[1].short}</p>
          {report.scorers.length > 0 && <ul className="fb-scorers">{report.scorers.map((goal, i) => <li key={i} className={goal.team === 0 ? "is-home" : "is-away"}>⚽ {goal.minute}' {goal.name}{goal.own ? " (phản lưới)" : ""}</li>)}</ul>}
          <StatsTable report={report} />
          <div className="fb-panel-actions">
            <button type="button" className="fb-start" onClick={restart}><RotateCcw size={18} />Đá lại</button>
            <button type="button" className="fb-secondary" onClick={() => setScreen("menu")}>Đổi đội hình</button>
            <Link className="fb-secondary" to="/san-truong-3d">Về sân trường</Link>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default FootballPage;
