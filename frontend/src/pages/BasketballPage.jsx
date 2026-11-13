import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Copy, Gamepad2, Globe, Keyboard, LogOut, Pause, Play, RotateCcw, Users, Video, Volume2, VolumeX } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/football.css";
import "../styles/basketball.css";
import { DIFFICULTIES, KITS, POSITION_NAMES, QUARTER_OPTIONS, TEAM_PRESETS } from "../basketball/constants";
import { IDEAL_RELEASE, LATE_RELEASE, releaseQuality } from "../basketball/actions";
import { clockText, createMatch, drainEvents, periodName, startNextPeriod, stepMatch, userContext } from "../basketball/sim";
import { HINTS, createController, keyName, padKey, touchButtons } from "../basketball/controls";
import { applyPack, inputState, smoothView } from "../basketball/net";
import { basketballCall, openRoom } from "../basketball/online";
import { netSwish, roar, startCrowd, stopCrowd, thud, whistle } from "../football/audio";
import { isSoundOn, setSoundOn } from "../learn/sound";

const SETTINGS_KEY = "feynman.basketball.settings";
const DEFAULTS = { difficulty: "normal", quarterMinutes: 3, homeKit: "orange", awayKit: "blue", camera: "tele", assist: "assisted" };
const ASSISTS = { assisted: "Cao", semi: "Vừa", manual: "Thủ công" };
const CAMERAS = { tele: "Truyền hình", close: "Cận cảnh", end: "Sau rổ" };

const readSettings = () => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
};
const saveSettings = (value) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); } catch { /* chế độ riêng tư */ }
};
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const awayKitOf = (settings) => (settings.awayKit === settings.homeKit ? (settings.homeKit === "white" ? "black" : "white") : settings.awayKit);

/* ---------- các màn hình phụ ---------- */

const KeyList = ({ rows }) => <dl>{rows.map(([key, label]) => <div key={key + label} className="fb-key-row"><dt>{key}</dt><dd>{label}</dd></div>)}</dl>;

const ControlsSheet = () => (
  <div className="fb-controls-sheet">
    <section>
      <h3><Keyboard size={16} /> Có bóng</h3>
      <KeyList rows={[
        ["← ↑ ↓ →", "Rê bóng"], ["E / Shift", "Chạy nhanh"],
        ["Giữ D, thả", "Ném rổ: thả khi thanh tới vạch xanh (tay lên cao nhất)"], ["D gần rổ", "Lên rổ / úp rổ"],
        ["S", "Chuyền (theo hướng; không bấm hướng: người trống nhất)"], ["W", "Chuyền đập đất (khó cắt hơn)"], ["A", "Chuyền bổng · alley-oop cho người lao vào rổ"],
        ["C + hướng", "Đảo bóng qua người"], ["Q", "Gọi đồng đội ra chắn (pick & roll)"],
      ]} />
    </section>
    <section>
      <h3><Keyboard size={16} /> Phòng ngự</h3>
      <KeyList rows={[
        ["S", "Đổi người (gần bóng nhất)"], ["S + hướng", "Đổi sang người ở hướng đó"], ["Giữ D", "Bám sát người mình kèm"],
        ["A", "Cướp bóng (với tay hụt dễ phạm lỗi)"], ["W", "Nhảy chắn bóng"], ["Q", "Gọi đồng đội kèm đôi"], ["E", "Chạy nhanh"],
      ]} />
      <h3><Keyboard size={16} /> Bóng bật bảng</h3>
      <KeyList rows={[["W", "Nhảy tranh bóng"], ["S", "Đổi người"]]} />
    </section>
    <section>
      <h3><Keyboard size={16} /> Tình huống</h3>
      <KeyList rows={[["Phát bóng biên", "Hướng + S chuyền · A bổng · W đập đất"], ["Ném phạt", "Giữ D rồi thả đúng lúc"]]} />
      <h3><Keyboard size={16} /> Chung</h3>
      <KeyList rows={[["Esc / P", "Tạm dừng"], ["Backspace", "Ẩn/hiện vòng dưới chân"], ["Alt + Enter", "Toàn màn hình"]]} />
      <h3><Gamepad2 size={16} /> Tay cầm</h3>
      <p>A chuyền / đổi người · B bổng / cướp · X ném / bám người · Y đập đất / nhảy · LB gọi chắn / kèm đôi · RB đảo bóng · RT chạy nhanh.</p>
    </section>
  </div>
);

const Choice = ({ value, current, onPick, children, style }) => (
  <button type="button" className={`fb-choice ${value === current ? "is-on" : ""}`} aria-pressed={value === current} onClick={() => onPick(value)} style={style}>{children}</button>
);

/** Chơi online: tìm trận nhanh, tạo phòng có mã mời, hoặc nhập mã phòng của bạn bè. */
const OnlinePanel = ({ onQuick, onCreate, onJoin, busy, error }) => {
  const [code, setCode] = useState("");
  return (
    <section className="fb-online-panel" aria-label="Chơi online">
      <h2><Globe size={18} />Chơi online với người thật</h2>
      <p>Mỗi người cầm một đội 5 người, máy chủ điều khiển trận đấu. Chưa đăng nhập thì vào bằng tài khoản khách.</p>
      <div className="fb-online-actions">
        <button type="button" className="fb-start" disabled={busy} onClick={onQuick}><Users size={17} />Tìm trận nhanh</button>
        <button type="button" className="fb-secondary" disabled={busy} onClick={onCreate}>Tạo phòng, mời bạn</button>
        <form className="fb-code-form" onSubmit={(event) => { event.preventDefault(); if (code.trim()) onJoin(code.trim().toUpperCase()); }}>
          <input aria-label="Mã phòng" placeholder="Mã phòng" maxLength={5} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <button type="submit" className="fb-secondary" disabled={busy || code.length < 5}>Vào</button>
        </form>
      </div>
      {error && <p className="fb-online-error" role="alert">{error}</p>}
    </section>
  );
};

const KitChoices = ({ current, onPick }) => (
  <div className="fb-choices">{Object.entries(KITS).map(([id, kit]) => <Choice key={id} value={id} current={current} onPick={onPick} style={{ "--swatch": kit.shirt }}><i className="fb-swatch" />{kit.name}</Choice>)}</div>
);

const MatchMenu = ({ settings, setSettings, onStart, onDemo, online }) => {
  const set = (key) => (value) => setSettings((old) => ({ ...old, [key]: value }));
  const home = KITS[settings.homeKit] || KITS.orange;
  const away = KITS[awayKitOf(settings)] || KITS.blue;
  return (
    <div className="fb-menu bb-menu">
      <div className="fb-menu-card">
        <header className="fb-menu-head">
          <Link className="fb-pill" to="/san-truong-3d"><ArrowLeft size={16} />Sân trường 3D</Link>
          <h1>Feynman Hoops <span>Bóng rổ 5 người</span></h1>
          <p>Bạn cầm cả đội 5 người: có bóng thì điều khiển người cầm bóng, phòng ngự bấm S để đổi người. Phím bố trí giống FIFA Online 4.</p>
        </header>
        <div className="fb-versus">
          <div className="fb-crest" style={{ "--kit": home.shirt, "--trim": home.trim }}><b>{TEAM_PRESETS.home.short}</b><span>{TEAM_PRESETS.home.name}</span></div>
          <strong>VS</strong>
          <div className="fb-crest" style={{ "--kit": away.shirt, "--trim": away.trim }}><b>{TEAM_PRESETS.away.short}</b><span>{TEAM_PRESETS.away.name}</span></div>
        </div>
        <div className="fb-options">
          <fieldset><legend>Đối thủ</legend><div className="fb-choices">{Object.entries(DIFFICULTIES).map(([id, level]) => <Choice key={id} value={id} current={settings.difficulty} onPick={set("difficulty")}>{level.name}</Choice>)}</div></fieldset>
          <fieldset><legend>Mỗi hiệp (4 hiệp)</legend><div className="fb-choices">{QUARTER_OPTIONS.map((minutes) => <Choice key={minutes} value={minutes} current={settings.quarterMinutes} onPick={set("quarterMinutes")}>{minutes} phút</Choice>)}</div></fieldset>
          <fieldset><legend>Áo đội nhà</legend><KitChoices current={settings.homeKit} onPick={set("homeKit")} /></fieldset>
          <fieldset><legend>Áo đội khách</legend><KitChoices current={settings.awayKit} onPick={set("awayKit")} /></fieldset>
          <fieldset><legend>Hỗ trợ ném &amp; chuyền</legend><div className="fb-choices">{Object.entries(ASSISTS).map(([id, name]) => <Choice key={id} value={id} current={settings.assist} onPick={set("assist")}>{name}</Choice>)}</div></fieldset>
          <fieldset><legend>Camera</legend><div className="fb-choices">{Object.entries(CAMERAS).map(([id, name]) => <Choice key={id} value={id} current={settings.camera} onPick={set("camera")}>{name}</Choice>)}</div></fieldset>
        </div>
        <details className="fb-how"><summary>Bảng phím</summary><ControlsSheet /></details>
        <div className="fb-menu-actions">
          <button type="button" className="fb-start" onClick={onStart}><Play size={18} />Vào trận</button>
          <button type="button" className="fb-secondary" onClick={onDemo}>Xem máy đấu với máy</button>
        </div>
        {online}
      </div>
    </div>
  );
};

/** Sảnh chờ phòng online: hai ghế, chọn áo/hỗ trợ, bấm sẵn sàng; chủ phòng chọn thời lượng hiệp. */
const OnlineLobby = ({ lobby, settings, setSettings, onReady, onLeave, connection, error }) => {
  const [copied, setCopied] = useState(false);
  const me = lobby.seats[lobby.you];
  const field = { homeKit: "kit", assist: "assist" };
  const choice = { kit: settings.homeKit, assist: settings.assist };
  const set = (key) => (value) => {
    setSettings((old) => ({ ...old, [key]: value }));
    onReady({ ...choice, [field[key]]: value, ready: me?.ready ?? false });
  };
  const link = typeof window !== "undefined" ? `${window.location.origin}/bong-ro?room=${lobby.code}` : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };
  return (
    <div className="fb-menu bb-menu">
      <div className="fb-menu-card fb-lobby">
        <header className="fb-menu-head">
          <button type="button" className="fb-pill" onClick={onLeave}><LogOut size={16} />Rời phòng</button>
          <h1>Phòng <span>{lobby.code}</span></h1>
          <p>{lobby.status === "playing" ? "Trận đang diễn ra…" : lobby.seats[1] ? "Hai người đã vào. Bấm “Sẵn sàng” để bắt đầu." : "Gửi mã phòng hoặc đường dẫn cho bạn bè để vào chơi cùng."} {connection && connection !== "connected" ? "· Đang kết nối lại…" : ""}</p>
          <button type="button" className="fb-secondary fb-copy" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Đã chép đường dẫn" : "Chép đường dẫn mời"}</button>
        </header>
        <div className="fb-seats">
          {lobby.seats.map((seat, index) => (
            <div key={index} className={`fb-seat ${seat?.ready ? "is-ready" : ""} ${index === lobby.you ? "is-you" : ""}`} style={{ "--kit": seat ? KITS[seat.kit]?.shirt : "#334" }}>
              <small>{index === 0 ? "Đội nhà" : "Đội khách"}{index === lobby.you ? " · bạn" : ""}</small>
              <strong>{seat ? seat.name : "Đang chờ người chơi…"}</strong>
              {seat && <span>{KITS[seat.kit]?.name} · Hỗ trợ {ASSISTS[seat.assist]}</span>}
              {seat && <em>{seat.ready ? "Sẵn sàng" : seat.connected ? "Chưa sẵn sàng" : "Mất kết nối"}</em>}
            </div>
          ))}
        </div>
        <div className="fb-options">
          <fieldset><legend>Áo đấu</legend><KitChoices current={settings.homeKit} onPick={set("homeKit")} /></fieldset>
          <fieldset><legend>Hỗ trợ ném &amp; chuyền</legend><div className="fb-choices">{Object.entries(ASSISTS).map(([id, name]) => <Choice key={id} value={id} current={settings.assist} onPick={set("assist")}>{name}</Choice>)}</div></fieldset>
          {lobby.you === 0 && <fieldset><legend>Mỗi hiệp (chủ phòng chọn)</legend><div className="fb-choices">{QUARTER_OPTIONS.map((minutes) => <Choice key={minutes} value={minutes} current={lobby.settings.quarterMinutes} onPick={(value) => onReady({ ...choice, quarterMinutes: value, ready: me?.ready ?? false })}>{minutes} phút</Choice>)}</div></fieldset>}
        </div>
        <div className="fb-menu-actions">
          <button type="button" className="fb-start" disabled={!lobby.seats[1] || lobby.status === "playing"} onClick={() => onReady({ ...choice, ready: !me?.ready })}><Play size={18} />{me?.ready ? "Huỷ sẵn sàng" : "Sẵn sàng"}</button>
        </div>
        {error && <p className="fb-online-error" role="alert">{error}</p>}
        <details className="fb-how"><summary>Bảng phím</summary><ControlsSheet /></details>
      </div>
    </div>
  );
};

const pct = (made, tried) => (tried ? `${made}/${tried} (${Math.round((made / tried) * 100)}%)` : "0/0");

const BoxScore = ({ report }) => {
  const [a, b] = report.teams;
  const rows = [
    ["Ném trúng", pct(a.stats.fgm, a.stats.fga), pct(b.stats.fgm, b.stats.fga)],
    ["3 điểm", pct(a.stats.tpm, a.stats.tpa), pct(b.stats.tpm, b.stats.tpa)],
    ["Ném phạt", pct(a.stats.ftm, a.stats.fta), pct(b.stats.ftm, b.stats.fta)],
    ["Bóng bật bảng", `${a.stats.reb} (${a.stats.oreb} tấn công)`, `${b.stats.reb} (${b.stats.oreb} tấn công)`],
    ["Kiến tạo", a.stats.ast, b.stats.ast],
    ["Cướp bóng", a.stats.stl, b.stats.stl],
    ["Chắn bóng", a.stats.blk, b.stats.blk],
    ["Mất bóng", a.stats.to, b.stats.to],
    ["Phạm lỗi", a.stats.pf, b.stats.pf],
  ];
  return (
    <>
      <table className="fb-stats">
        <thead><tr><th>{a.short}</th><th /><th>{b.short}</th></tr></thead>
        <tbody>{rows.map(([label, x, y]) => <tr key={label}><td>{x}</td><th scope="row">{label}</th><td>{y}</td></tr>)}</tbody>
      </table>
      {report.leaders.length > 0 && <ul className="bb-leaders">{report.leaders.map((p) => <li key={p.id} className={p.team === 0 ? "is-home" : "is-away"}><b>{p.number}</b> {p.name}<span>{p.pts} điểm · {p.reb} bật bảng · {p.ast} kiến tạo</span></li>)}</ul>}
    </>
  );
};

/** Ảnh chụp số liệu trận để hiện trên bảng (React không đọc trực tiếp trận đang chạy). */
const reportOf = (match) => ({
  you: match.user?.team ?? 0,
  teams: match.teams.map((team) => ({ short: team.short, score: team.score, stats: { ...team.stats } })),
  leaders: [0, 1].map((team) => match.players.filter((p) => p.team === team).sort((x, y) => y.stats.pts - x.stats.pts)[0])
    .filter((p) => p && p.stats.pts > 0)
    .map((p) => ({ id: p.id, team: p.team, number: p.number, name: p.name, pts: p.stats.pts, reb: p.stats.reb, ast: p.stats.ast })),
});

/** Đọc tay cầm đầu tiên: cần trái để chạy, nút đổi theo tình huống. */
const pollGamepad = (match, controller, now, padState, stickInUse, togglePause, pausedRef) => {
  const pads = navigator.getGamepads?.() || [];
  const pad = [...pads].find(Boolean);
  if (!pad) return;
  const [ax = 0, ay = 0] = pad.axes;
  const dead = (v) => (Math.abs(v) < 0.2 ? 0 : v);
  if (!pausedRef.current && !stickInUse) controller.setStick(dead(ax), -dead(ay));
  pad.buttons.forEach((button, index) => {
    const was = padState.get(index);
    if (button.pressed && !was) {
      if (index === 9) { togglePause(); padState.set(index, "pause"); return; }
      if (pausedRef.current) { padState.set(index, "none"); return; }
      const key = padKey(index);
      padState.set(index, key || "none");
      if (key) controller.press(match, key, now);
    } else if (!button.pressed && was) {
      if (!pausedRef.current && was !== "none" && was !== "pause") controller.release(match, was, now);
      padState.delete(index);
    }
  });
};

const QUALITY_TEXT = (feedback) => (feedback.quality > 0.85 ? "Nhả bóng hoàn hảo!" : feedback.quality > 0.5 ? (feedback.early ? "Hơi sớm" : "Hơi muộn") : feedback.early ? "Quá sớm" : "Quá muộn");

/* ---------- trang ---------- */

const BasketballPage = () => {
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
  const arenaRef = useRef(null);
  const ringRef = useRef(true);
  const [controller] = useState(() => createController());
  const controllerRef = useRef(controller);
  const onlineRef = useRef(null);
  const roomAttemptRef = useRef(0);
  const screenRef = useRef("menu");
  const [lobby, setLobby] = useState(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [connection, setConnection] = useState("");
  const [names, setNames] = useState(null);
  const meterRef = useRef(null);
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
  useEffect(() => { screenRef.current = screen; }, [screen]);

  const togglePause = useCallback(() => {
    const match = matchRef.current;
    if (!match || match.phase === "fulltime") return;
    const next = !pausedRef.current;
    if (next) setReport(reportOf(match));
    changePause(next);
  }, [changePause]);

  const showBanner = useCallback((text, tone = "info", ms = 1600) => {
    window.clearTimeout(bannerTimer.current);
    setBanner({ text, tone, key: Math.random() });
    bannerTimer.current = window.setTimeout(() => setBanner(null), ms);
  }, []);

  const handleEvents = useCallback((match, arena) => {
    for (const event of drainEvents(match)) {
      const p = event.id !== undefined && event.id !== null ? match.players[event.id] : null;
      switch (event.type) {
        case "bounce": thud(0.25 * (event.strength ?? 0.5)); break;
        case "pass": thud(0.18); break;
        case "rim": thud(0.6); arena.cheer(0.25); break;
        case "board": thud(0.45); break;
        case "shot": arena.cheer(0.3); roar(0.35); break;
        case "score": {
          const mine = event.team === match.user.team;
          const text = event.dunk ? `ÚP RỔ! ${p?.name ?? ""}` : event.points === 3 ? `3 ĐIỂM! ${p?.name ?? ""}` : `+2 · ${p?.name ?? ""}`;
          showBanner(event.andOne ? `${text} · Thêm 1 quả ném phạt` : text, mine ? "goal" : "goal-away", 1800);
          netSwish(); arena.cheer(event.points === 3 || event.dunk ? 1.3 : 0.8); roar(event.points === 3 || event.dunk ? 1.2 : 0.7);
          break;
        }
        case "block": showBanner(`Chắn bóng! ${p?.name ?? ""}`, "info", 1200); arena.cheer(0.9); roar(0.9); thud(0.6); break;
        case "steal": showBanner(`Cướp bóng! ${p?.name ?? ""}`, "info", 1100); arena.cheer(0.5); break;
        case "intercept": showBanner(`Cắt bóng! ${p?.name ?? ""}`, "info", 1100); arena.cheer(0.5); break;
        case "ankle": showBanner("Gãy cổ chân!", "warn", 1300); arena.cheer(1); roar(1); break;
        case "alleyOop": showBanner("Alley-oop!", "warn", 1300); break;
        case "airball": showBanner("Trượt cả vành!", "soft", 1100); break;
        case "foul": whistle(1); showBanner(event.shooting ? "Phạm lỗi khi ném · Ném phạt" : "Phạm lỗi", "warn", 1400); break;
        case "turnover": whistle(1); showBanner(event.reason === "shotClock" ? "Hết 24 giây!" : "Dẫm vạch · Mất bóng", "warn", 1400); break;
        case "out": whistle(1); showBanner("Bóng ra ngoài", "soft", 1000); break;
        case "ft": if (event.made) { netSwish(); arena.cheer(0.4); } break;
        case "tip": whistle(1); break;
        case "buzzer": whistle(2, true); break;
        case "period": showBanner(event.start ? periodName(event.quarter) : `Hết ${periodName(event.quarter).toLowerCase()}`, "soft", 1800); break;
        case "halftime": setReport(reportOf(match)); setScreen("halftime"); break;
        case "fulltime": whistle(3, true); setReport(reportOf(match)); setScreen("fulltime"); break;
        case "screen": showBanner("Gọi chắn!", "soft", 700); break;
        case "double": showBanner("Kèm đôi!", "soft", 700); break;
        default: break;
      }
    }
  }, [showBanner]);

  // Dựng trận và vòng lặp khung hình.
  useEffect(() => {
    if (screen === "menu" || screen === "lobby") return undefined;
    if (matchRef.current && arenaRef.current) return undefined;
    const online = onlineRef.current?.config ? onlineRef.current : null;
    const match = online
      ? createMatch({ ...online.config, humans: [0, 1], localTeam: online.you })
      : createMatch({ difficulty: settings.difficulty, quarterMinutes: settings.quarterMinutes, homeKit: settings.homeKit, awayKit: settings.awayKit, autoplay: demo, assist: settings.assist });
    if (online) {
      online.view = match;
      online.snapped = false;
      if (online.lastPack) { applyPack(match, online.lastPack, { snap: true }); online.snapped = true; online.lastPack = null; }
    }
    let arena = null;
    let cancelled = false;
    let frame = 0;
    let last = performance.now();
    let hudAt = 0;
    const controller = online ? createController({ act: (_view, action, opts) => online.session.action(action, opts) }) : createController();
    controllerRef.current = controller;

    const begin = async () => {
      try {
        const { createArena } = await import("../basketball/render");
        if (cancelled || !holderRef.current) return;
        arena = createArena(holderRef.current, match, { camera: settings.camera });
      } catch (cause) {
        console.error("Không dựng được nhà thi đấu 3D", cause);
        setFailed(true);
        return;
      }
      matchRef.current = match;
      arenaRef.current = arena;
      if (import.meta.env.DEV) window.__basketball = { match, arena };
      startCrowd();
      const onResize = () => arena.resize();
      window.addEventListener("resize", onResize);
      const loop = (now) => {
        if (cancelled) return;
        frame = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        pollGamepad(match, controller, now, padState.current, stickRef.current.id !== null, togglePause, pausedRef);
        const { meter, context, feedback } = pausedRef.current ? { meter: null, context: userContext(match), feedback: null } : controller.update(match, arena.basis(), now);
        if (online) {
          smoothView(match, dt);
          online.session.input(inputState(pausedRef.current ? { mx: 0, mz: 0 } : match.user.input));
          // Gói trạng thái khi nối lại không có lịch sử sự kiện: lấy màn hình từ pha trận.
          if (match.phase === "fulltime" && screenRef.current !== "fulltime") { changePause(false); setReport(reportOf(match)); setScreen("fulltime"); }
          else if (screenRef.current === "halftime" && match.phase !== "break") setScreen("playing");
        } else if (!pausedRef.current) {
          stepMatch(match, dt);
          if (screenRef.current === "halftime" && match.phase !== "break") setScreen("playing");
        }
        handleEvents(match, arena);
        arena.render(pausedRef.current && !online ? 0 : dt);
        // Thanh ném: vạch xanh là lúc nhả bóng đẹp nhất.
        const bar = meterRef.current;
        const me = match.players[match.user.controlledId];
        if (bar) {
          if ((meter || feedback) && me) {
            const at = arena.project({ x: me.x, y: me.height + 0.9 + me.y, z: me.z });
            bar.style.transform = `translate(${Math.round(at.x + 34)}px, ${Math.round(at.y - 40)}px)`;
            bar.style.opacity = "1";
            const fill = meter ? Math.min(1, meter.hold / LATE_RELEASE) : null;
            if (fill !== null) bar.firstChild.style.height = `${Math.round(fill * 100)}%`;
            bar.dataset.state = meter ? (releaseQuality(meter.hold, match.user.assist) > 0.85 ? "hot" : "") : feedback.quality > 0.85 ? "perfect" : "off";
            bar.lastChild.textContent = !meter && feedback ? QUALITY_TEXT(feedback) : "";
          } else bar.style.opacity = "0";
        }
        if (now - hudAt > 110) {
          hudAt = now;
          const controlled = match.players[match.user.controlledId];
          setHud({
            score: [match.teams[0].score, match.teams[1].score],
            clock: clockText(match),
            shot: Math.ceil(match.shotClock),
            showShot: match.phase === "live" || match.phase === "inbound",
            quarter: match.quarter,
            fouls: match.teams.map((team) => team.fouls),
            possession: match.possession,
            name: controlled?.name,
            number: controlled?.number,
            role: controlled ? POSITION_NAMES[controlled.pos] : "",
            stamina: controlled?.stamina ?? 1,
            context,
            hint: HINTS[context] || "",
            kits: match.teams.map((team) => team.kit.shirt),
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
      arena?.dispose();
      matchRef.current = null;
      arenaRef.current = null;
      if (online) online.view = null;
    };
    // Trận mới khi bấm “Đấu lại” (round) hoặc vào/ra menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen === "menu" || screen === "lobby", round]);

  useEffect(() => { arenaRef.current?.setCamera(settings.camera); }, [settings.camera]);

  // Bàn phím.
  useEffect(() => {
    if (screen === "menu" || screen === "lobby") return undefined;
    const down = (event) => {
      if (isTyping(event.target) || event.metaKey) return;
      if (event.altKey) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (document.fullscreenElement) document.exitFullscreen?.();
          else document.documentElement.requestFullscreen?.().catch(() => {});
        }
        return;
      }
      if (event.key === "Escape" || event.key === "p" || event.key === "P") {
        if (!event.repeat && (screen === "playing" || screen === "halftime")) togglePause();
        event.preventDefault();
        return;
      }
      const key = keyName(event);
      if (!key) return;
      event.preventDefault();
      if (event.repeat || pausedRef.current) return;
      if (key === "Backspace") {
        ringRef.current = !ringRef.current;
        arenaRef.current?.setRing(ringRef.current);
        return;
      }
      controllerRef.current.press(matchRef.current, key, event.timeStamp || performance.now());
    };
    const up = (event) => {
      if (pausedRef.current) return;
      const key = keyName(event);
      if (!key) return;
      controllerRef.current.release(matchRef.current, key, event.timeStamp || performance.now());
    };
    const blur = () => controllerRef.current.reset();
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
  const stickDown = (event) => {
    event.preventDefault();
    if (pausedRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    stickRef.current = { id: event.pointerId, base: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, r: rect.width / 2 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stickMove(event);
  };
  const stickUp = () => {
    stickRef.current = { id: null, base: null };
    controllerRef.current.setStick(0, 0);
    if (knobRef.current) knobRef.current.style.transform = "translate(0, 0)";
  };

  /* ----- online ----- */
  const leaveRoom = useCallback(() => {
    roomAttemptRef.current += 1;
    const online = onlineRef.current;
    onlineRef.current = null;
    if (online) { void online.session.leave(); online.session.close(); }
    setLobby(null);
    setNames(null);
    setConnection("");
    setOnlineBusy(false);
    changePause(false);
    setScreen("menu");
    if (window.location.search.includes("room=")) window.history.replaceState(null, "", "/bong-ro");
  }, [changePause]);

  const enterRoom = useCallback(async (request) => {
    const attempt = ++roomAttemptRef.current;
    setOnlineBusy(true);
    setOnlineError("");
    try {
      const joined = await request();
      if (attempt !== roomAttemptRef.current) return;
      onlineRef.current?.session.close();
      const online = { code: joined.code, you: joined.you, config: null, view: null, lastPack: null, snapped: false, session: null };
      online.session = openRoom(joined.code, {
        onLobby: (value) => { if (onlineRef.current !== online) return; online.you = value.you; setLobby(value); },
        onStart: ({ config }) => {
          if (onlineRef.current !== online) return;
          online.config = config;
          online.lastPack = null;
          setNames(config.names);
          setDemo(false);
          changePause(false);
          setRound((value) => value + 1);
          setScreen("playing");
        },
        onState: (pack) => {
          if (onlineRef.current !== online) return;
          if (online.view) { applyPack(online.view, pack, { snap: !online.snapped }); online.snapped = true; } else online.lastPack = pack;
        },
        onEnd: ({ reason }) => {
          if (onlineRef.current !== online) return;
          changePause(false);
          showBanner(reason || "Trận đấu kết thúc", "warn", 4000);
          if (online.view) {
            setReport(reportOf(online.view));
            setScreen("fulltime");
          } else {
            leaveRoom();
            setOnlineError(reason || "Phòng đấu đã kết thúc. Hãy tìm trận mới.");
          }
        },
        onError: (error) => {
          if (onlineRef.current !== online) return;
          leaveRoom();
          setOnlineError(error.status === 401
            ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi tạo phòng hoặc vào lại bằng mã phòng."
            : "Phòng đấu không còn khả dụng. Hãy tạo phòng mới hoặc nhập lại mã phòng để tiếp tục.");
        },
        onConnection: (state) => { if (onlineRef.current === online) setConnection(state); },
      });
      onlineRef.current = online;
      setLobby(joined);
      setScreen("lobby");
      window.history.replaceState(null, "", `/bong-ro?room=${joined.code}`);
    } catch (error) {
      if (attempt === roomAttemptRef.current) setOnlineError(error.message);
    } finally {
      if (attempt === roomAttemptRef.current) setOnlineBusy(false);
    }
  }, [changePause, leaveRoom, showBanner]);

  const readyUp = useCallback((body) => {
    const online = onlineRef.current;
    if (!online) return;
    online.session.ready(body).catch((error) => setOnlineError(error.message));
  }, []);

  // Mở đường dẫn mời /bong-ro?room=MÃ: tự vào phòng (hẹn giờ 0 ms để StrictMode chỉ vào một lần).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("room");
    if (!code) return undefined;
    const timer = window.setTimeout(() => { void enterRoom(() => basketballCall(`rooms/${code.toUpperCase()}/join`)); }, 0);
    return () => window.clearTimeout(timer);
  }, [enterRoom]);

  useEffect(() => () => { roomAttemptRef.current += 1; onlineRef.current?.session.close(); }, []);

  const start = (auto = false) => {
    roomAttemptRef.current += 1;
    setOnlineBusy(false);
    setDemo(auto);
    changePause(false);
    setRound((value) => value + 1);
    setScreen("playing");
  };
  const restart = () => {
    if (onlineRef.current) {
      onlineRef.current.session.next().catch((error) => setOnlineError(error.message));
      showBanner("Đang chờ đối thủ đồng ý đấu lại…", "soft", 3000);
      return;
    }
    setDemo(false);
    changePause(false);
    setRound((value) => value + 1);
    setScreen("playing");
  };
  const nextPeriod = () => {
    if (onlineRef.current) {
      onlineRef.current.session.next().catch(() => {});
      showBanner("Chờ đối thủ… (tự vào hiệp sau ít giây nữa)", "soft", 2500);
      return;
    }
    if (matchRef.current) startNextPeriod(matchRef.current);
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

  const homeKit = KITS[settings.homeKit] || KITS.orange;
  const awayKit = KITS[awayKitOf(settings)] || KITS.blue;
  const onlinePanel = <OnlinePanel busy={onlineBusy} error={onlineError} onQuick={() => enterRoom(() => basketballCall("quick"))} onCreate={() => enterRoom(() => basketballCall("rooms", { quarterMinutes: settings.quarterMinutes }))} onJoin={(code) => enterRoom(() => basketballCall(`rooms/${code}/join`))} />;
  if (screen === "menu") return <MatchMenu settings={settings} setSettings={setSettings} onStart={() => start(false)} onDemo={() => start(true)} online={onlinePanel} />;
  if (screen === "lobby" && lobby) return <OnlineLobby lobby={lobby} settings={settings} setSettings={setSettings} onReady={readyUp} onLeave={leaveRoom} connection={connection} error={onlineError} />;
  const isOnline = Boolean(names);
  const teamName = (i) => (isOnline ? names[i].slice(0, 12) : [TEAM_PRESETS.home.short, TEAM_PRESETS.away.short][i]);

  return (
    <div className={`fb-shell bb-shell ${touch ? "is-touch" : ""}`}>
      <div className="fb-stage" ref={holderRef} />
      {failed && <div className="fb-overlay" role="alert"><div className="fb-panel"><h2>Máy này chưa bật được đồ họa 3D</h2><p>Trình duyệt không tạo được WebGL.</p><Link className="fb-start" to="/san-truong-3d">Về sân trường</Link></div></div>}
      <header className="fb-scoreboard bb-scoreboard" aria-live="polite">
        <span className={`fb-team ${hud?.possession === 0 ? "has-ball" : ""}`} style={{ "--kit": hud?.kits?.[0] ?? homeKit.shirt }}>{teamName(0)}</span>
        <strong>{hud?.score[0] ?? 0}<em>-</em>{hud?.score[1] ?? 0}</strong>
        <span className={`fb-team ${hud?.possession === 1 ? "has-ball" : ""}`} style={{ "--kit": hud?.kits?.[1] ?? awayKit.shirt }}>{teamName(1)}</span>
        <span className="bb-q" aria-hidden="true">{(hud?.quarter ?? 1) <= 4 ? `H${hud?.quarter ?? 1}` : `HP${hud.quarter - 4}`}</span>
        <time>{hud?.clock ?? "00:00"}</time>
        <b className={`bb-shot-clock ${hud && hud.shot <= 5 ? "is-low" : ""}`} aria-label="Đồng hồ 24 giây">{hud?.showShot ? hud.shot : "–"}</b>
        <small>{periodName(hud?.quarter ?? 1)}{isOnline ? ` · Online${connection && connection !== "connected" ? " (đang nối lại)" : ""}` : ""}</small>
      </header>
      <div className="fb-top-actions">
        <button type="button" className="fb-icon" onClick={cycleCamera} title={`Camera: ${CAMERAS[settings.camera]}`} aria-label="Đổi góc camera"><Video size={18} /></button>
        <button type="button" className="fb-icon" onClick={toggleSound} aria-label={sound ? "Tắt âm thanh" : "Bật âm thanh"}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button type="button" className="fb-icon" onClick={() => setTouch((value) => !value)} aria-pressed={touch} title="Nút cảm ứng" aria-label="Bật/tắt nút cảm ứng"><Gamepad2 size={18} /></button>
        <button type="button" className="fb-icon" onClick={togglePause} aria-label="Tạm dừng"><Pause size={18} /></button>
      </div>
      {banner && <div key={banner.key} className={`fb-banner is-${banner.tone}`} role="status">{banner.text}</div>}
      {!demo && hud && <aside className="fb-player-card" aria-label="Cầu thủ đang điều khiển">
        <b>{hud.number}</b>
        <div><strong>{hud.name}</strong><small>{hud.role} · Lỗi đồng đội {hud.fouls?.[0] ?? 0}–{hud.fouls?.[1] ?? 0}</small><i className="fb-stamina"><span style={{ width: `${Math.round(hud.stamina * 100)}%` }} /></i></div>
      </aside>}
      {!demo && hud && !touch && hud.hint && <p className="fb-hint">{hud.hint}</p>}
      {demo && <p className="fb-hint">Máy đang đấu với máy. Bấm ⏸ rồi “Đấu lại” để tự cầm đội.</p>}
      <div className="bb-meter" ref={meterRef} aria-hidden="true"><span /><i style={{ bottom: `${Math.round((IDEAL_RELEASE / LATE_RELEASE) * 100)}%` }} /><em /></div>

      {touch && !demo && <>
        <div className="fb-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} aria-label="Cần điều khiển" role="application"><span ref={knobRef} /></div>
        <div className="fb-buttons">
          {touchButtons(hud?.context).map(([key, label]) => (
            <button key={`${hud?.context}-${key}`} type="button" className={`fb-touch is-${key}`} onPointerDown={touchPress(key)} onPointerUp={touchRelease(key)} onPointerCancel={touchRelease(key)} onLostPointerCapture={touchRelease(key)} onContextMenu={(event) => event.preventDefault()}>{label}</button>
          ))}
        </div>
      </>}

      {paused && (screen === "playing" || screen === "halftime") && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>{isOnline ? "Menu (trận online vẫn tiếp tục)" : "Tạm dừng"}</h2>
          <div className="fb-panel-actions">
            <button type="button" className="fb-start" onClick={() => changePause(false)}><Play size={18} />{isOnline ? "Quay lại trận" : "Chơi tiếp"}</button>
            {isOnline ? <button type="button" className="fb-secondary" onClick={leaveRoom}><LogOut size={16} />Rời trận (xử thua)</button> : <>
              <button type="button" className="fb-secondary" onClick={restart}><RotateCcw size={16} />Đấu lại</button>
              <button type="button" className="fb-secondary" onClick={() => { changePause(false); setScreen("menu"); }}>Đổi đội</button>
              <Link className="fb-secondary" to="/san-truong-3d">Về sân trường</Link>
            </>}
          </div>
          <div className="fb-choices fb-camera-row">{Object.entries(CAMERAS).map(([id, name]) => <Choice key={id} value={id} current={settings.camera} onPick={(value) => setSettings((old) => ({ ...old, camera: value }))}>{name}</Choice>)}</div>
          {report && <BoxScore report={report} />}
          <details className="fb-how"><summary>Bảng phím</summary><ControlsSheet /></details>
        </div>
      </div>}

      {screen === "halftime" && !paused && report && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>Hết hiệp 2 · Nghỉ giữa trận</h2>
          <p className="fb-final">{report.teams[0].short} {report.teams[0].score} - {report.teams[1].score} {report.teams[1].short}</p>
          <BoxScore report={report} />
          <p className="fb-note">Sang hiệp 3 hai đội đổi rổ. Trận tự đấu tiếp sau ít giây.</p>
          <div className="fb-panel-actions"><button type="button" className="fb-start" onClick={nextPeriod}><Play size={18} />Vào hiệp 3</button></div>
        </div>
      </div>}

      {screen === "fulltime" && report && <div className="fb-overlay">
        <div className="fb-panel">
          <h2>{report.teams[report.you].score > report.teams[1 - report.you].score ? "Chiến thắng!" : report.teams[report.you].score < report.teams[1 - report.you].score ? "Thua rồi…" : "Hoà"}</h2>
          <p className="fb-final">{report.teams[0].short} {report.teams[0].score} - {report.teams[1].score} {report.teams[1].short}</p>
          <BoxScore report={report} />
          <div className="fb-panel-actions">
            <button type="button" className="fb-start" onClick={restart}><RotateCcw size={18} />Đấu lại</button>
            {isOnline ? <button type="button" className="fb-secondary" onClick={leaveRoom}><LogOut size={16} />Rời phòng</button> : <button type="button" className="fb-secondary" onClick={() => setScreen("menu")}>Đổi đội</button>}
            <Link className="fb-secondary" to="/san-truong-3d">Về sân trường</Link>
          </div>
        </div>
      </div>}
    </div>
  );
};

export default BasketballPage;
