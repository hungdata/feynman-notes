import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Copy, DoorOpen, Fish, House, MapPin, Moon, Rabbit, RefreshCw, Store, Sun, Sunrise, Sunset, Users, X } from "lucide-react";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/campus3d.css";
import "../styles/fishing.css";
import { timeOfDay } from "../campus/scene";
import { BOUNDS, BUILDINGS, COURT, DECK, LAKE, NEIGHBOURS, PATHS, PIER, PITCH, PLAZA, SPAWN, doorOf } from "../campus3d/world";
import { SoundToggle } from "../learn/LearnChrome";
import { playSound } from "../learn/sound";
import CharacterLobby from "../campus3d/CharacterLobby";
import { useCampusOnline } from "../campus3d/online";
import { idealBasketPower, hoopFor } from "../../../shared/campusSports.mjs";
import { buyRod, getWallet } from "../campus3d/fishingApi";
import { useFishing } from "../campus3d/useFishing";
import { CatchCard, ReelBar, TackleShop } from "../campus3d/FishingHud";

const PLACE_KEY = "feynman.campus3d.place";
const SKY_ORDER = ["morning", "day", "evening", "night"];
const SKY_LABELS = { morning: "Buổi sáng", day: "Ban ngày", evening: "Chiều tà", night: "Buổi tối" };
const SKY_ICONS = { morning: Sunrise, day: Sun, evening: Sunset, night: Moon };
const MOVE_KEYS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right" };

const readPlace = () => {
  try {
    const place = JSON.parse(sessionStorage.getItem(PLACE_KEY) || "null");
    if (place && Number.isFinite(place.x) && Number.isFinite(place.z) && place.x > BOUNDS.minX && place.x < BOUNDS.maxX && place.z > BOUNDS.minZ && place.z < BOUNDS.maxZ) return place;
  } catch { /* nothing saved */ }
  return null;
};
const savePlace = (place) => {
  try { sessionStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch { /* private mode */ }
};

/* ---------- mini map ---------- */

const MAP = { minX: -88, maxX: 88, minZ: -58, maxZ: 168, width: 150 };
MAP.scale = MAP.width / (MAP.maxX - MAP.minX);
MAP.height = Math.round((MAP.maxZ - MAP.minZ) * MAP.scale);
const mapX = (x) => (x - MAP.minX) * MAP.scale;
const mapY = (z) => (z - MAP.minZ) * MAP.scale;

/** Paints the parts of the map that never move, once. */
const paintMapBase = () => {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = MAP.width * ratio;
  canvas.height = MAP.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#8fd07c";
  ctx.fillRect(0, 0, MAP.width, MAP.height);
  ctx.fillStyle = "#f4e9d2";
  for (const [x, z, w, d] of PATHS) ctx.fillRect(mapX(x - w / 2), mapY(z - d / 2), w * MAP.scale, d * MAP.scale);
  ctx.beginPath();
  ctx.arc(mapX(PLAZA.x), mapY(PLAZA.z), PLAZA.r * MAP.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5fb4ee";
  ctx.fillRect(mapX(LAKE.x - LAKE.w / 2), mapY(LAKE.z - LAKE.d / 2), LAKE.w * MAP.scale, LAKE.d * MAP.scale);
  ctx.fillStyle = "#a9794d";
  for (const part of [PIER, DECK]) ctx.fillRect(mapX(part.x - part.w / 2), mapY(part.z - part.d / 2), part.w * MAP.scale, part.d * MAP.scale);
  ctx.fillStyle = "#c9c4b8";
  for (const [x, z, w, , d] of NEIGHBOURS) ctx.fillRect(mapX(x - w / 2), mapY(z - d / 2), w * MAP.scale, d * MAP.scale);
  ctx.fillStyle = "#57b96a";
  ctx.fillRect(mapX(PITCH.x - PITCH.w / 2), mapY(PITCH.z - PITCH.d / 2), PITCH.w * MAP.scale, PITCH.d * MAP.scale);
  ctx.fillStyle = "#e79457";
  ctx.fillRect(mapX(COURT.x - COURT.w / 2), mapY(COURT.z - COURT.d / 2), COURT.w * MAP.scale, COURT.d * MAP.scale);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.strokeRect(mapX(PITCH.x - PITCH.w / 2) + 1.5, mapY(PITCH.z - PITCH.d / 2) + 1.5, PITCH.w * MAP.scale - 3, PITCH.d * MAP.scale - 3);
  ctx.strokeRect(mapX(COURT.x - COURT.w / 2) + 1.5, mapY(COURT.z - COURT.d / 2) + 1.5, COURT.w * MAP.scale - 3, COURT.d * MAP.scale - 3);
  for (const building of BUILDINGS) {
    ctx.fillStyle = building.roof;
    ctx.beginPath();
    ctx.roundRect?.(mapX(building.x - building.w / 2), mapY(building.z - building.d / 2), building.w * MAP.scale, building.d * MAP.scale, 2.5);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  return canvas;
};

const MiniMap = ({ mapRef, near, onlineRef }) => {
  const canvasRef = useRef(null);
  const baseRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP.width * ratio;
    canvas.height = MAP.height * ratio;
    baseRef.current = paintMapBase();
    const ctx = canvas.getContext("2d");
    const draw = (snapshot) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(baseRef.current, 0, 0);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (!snapshot) return;
      ctx.fillStyle = "#1d2142";
      for (let i = 0; i < snapshot.students.length; i += 2) {
        ctx.beginPath();
        ctx.arc(mapX(snapshot.students[i]), mapY(snapshot.students[i + 1]), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const network = onlineRef.current.snapshot;
      ctx.fillStyle = "#24b87b";
      ctx.strokeStyle = "#ffffff";
      for (const other of network?.players || []) {
        if (other.id === network.selfId) continue;
        ctx.beginPath();
        ctx.arc(mapX(other.x), mapY(other.z), 3, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      // The player: a yellow arrow pointing the way they face.
      ctx.save();
      ctx.translate(mapX(snapshot.x), mapY(snapshot.z));
      ctx.rotate(Math.PI - snapshot.heading);
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fillStyle = "#ffd23f";
      ctx.strokeStyle = "#1d2142";
      ctx.lineWidth = 1.6;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    draw(null);
    mapRef.current = draw;
    return () => { mapRef.current = null; };
  }, [mapRef, onlineRef]);

  return (
    <figure className="c3-map">
      <canvas ref={canvasRef} style={{ width: MAP.width, height: MAP.height }} aria-hidden="true" />
      <figcaption>{near ? near.name : "Bản đồ trường"}</figcaption>
    </figure>
  );
};

/** One arrow button. Holding it down walks; letting go stops. */
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
    onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); onHold(name, true); } }}
    onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") onHold(name, false); }}
    onBlur={() => onHold(name, false)}
  >
    <Icon aria-hidden="true" />
  </button>
);

/* ---------- page ---------- */

const SPORT_NAMES = { football: "Bóng đá", basketball: "Bóng rổ" };
const basketPower = (player) => player ? idealBasketPower(player) : 0.7;
const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const FISHING_LABELS = { idle: "Thả câu", cast: "Đang thả câu…", wait: "Chờ cá cắn…", nibble: "Cá đang rỉa mồi…", bite: "Giật!", reel: "Giữ để kéo", landing: "Đang nhận cá…", caught: "Thả câu tiếp" };
const FISHING_HINTS = { idle: "Thả câu, chờ phao chìm hẳn rồi giật.", cast: "", wait: "Nhìn phao. Khi phao chìm hẳn thì nhấn Giật.", nibble: "Cá mới rỉa thôi, khoan giật!", bite: "Phao chìm rồi, giật ngay!", reel: "Giữ nút hoặc Space để nâng khung xanh, thả để hạ. Giữ con cá trong khung.", landing: "", caught: "" };

const Campus3DPage = () => {
  const navigate = useNavigate();
  const holderRef = useRef(null);
  const worldRef = useRef(null);
  const mapRef = useRef(null);
  const inputRef = useRef({ x: 0, y: 0, run: false });
  const heldRef = useRef({ keys: new Set(), pad: new Set(), shift: false, runLock: false, locked: false });
  const nearRef = useRef(null);
  const selfRef = useRef(null);
  const leavingRef = useRef(false);
  const stuckRef = useRef(0);
  const chargeStartRef = useRef(null);
  const autoJoinRef = useRef(false);
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sky, setSky] = useState(() => timeOfDay());
  const [status, setStatus] = useState("setup");
  const [near, setNear] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [moved, setMoved] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [charge, setCharge] = useState(null);
  const [copied, setCopied] = useState(false);
  const [environment, setEnvironment] = useState({ atLake: false, onDeck: false, nearShop: false });
  const [purse, setPurse] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const { onlineRef, snapshot, connection, error, action, reconnect, syncPosition } = useCampusOnline(profile, worldRef, Boolean(profile) && !editing);
  const self = snapshot?.players.find((player) => player.id === snapshot.selfId);
  selfRef.current = self;
  const sport = self?.sport;
  const connected = connection === "connected";
  const atLake = environment.onDeck && !sport && !editing;
  const updateWallet = useCallback((wallet) => setPurse((current) => current ? { ...current, wallet } : current), []);
  const fishing = useFishing({ worldRef, atLake, onWallet: updateWallet, beforeCast: syncPosition });
  const { press: fishPress, release: fishRelease } = fishing;

  useEffect(() => {
    if (!profile) return undefined;
    let active = true;
    getWallet().then((value) => { if (active) setPurse(value); }).catch(() => {});
    return () => { active = false; };
  }, [profile]);

  const syncInput = useCallback(() => {
    const held = heldRef.current;
    const on = (name) => (!held.locked && (held.keys.has(name) || held.pad.has(name)) ? 1 : 0);
    inputRef.current.x = on("right") - on("left");
    inputRef.current.y = on("up") - on("down");
    inputRef.current.run = held.shift || held.runLock;
    if (inputRef.current.x || inputRef.current.y) setMoved(true);
  }, []);

  useEffect(() => {
    heldRef.current.locked = fishing.busy || shopOpen;
    syncInput();
  }, [fishing.busy, shopOpen, syncInput]);

  const go = useCallback((building) => {
    if (!building || leavingRef.current) return;
    const leave = () => {
      const door = doorOf(building);
      savePlace({ x: door.x, z: door.z + 3.2, heading: 0, yaw: worldRef.current?.where().yaw ?? 0 });
      worldRef.current?.pause();
      navigate(building.route);
      stuckRef.current = window.setTimeout(() => {
        leavingRef.current = false;
        setLeaving(false);
        worldRef.current?.resume();
      }, 6000);
    };
    leavingRef.current = true;
    setLeaving(true);
    playSound("next");
    if (!worldRef.current?.enter(building.id, () => window.setTimeout(leave, 180))) leave();
  }, [navigate]);

  useEffect(() => () => window.clearTimeout(stuckRef.current), []);

  useEffect(() => {
    if (!profile || editing) return undefined;
    let cancelled = false;
    let world = null;
    setStatus("loading");
    const begin = async () => {
      try {
        const { startWorld } = await import("../campus3d/engine");
        await Promise.race([
          Promise.all([document.fonts?.load("600 48px 'Lexend Variable'"), document.fonts?.load("400 48px 'Patrick Hand'")]),
          new Promise((resolve) => { window.setTimeout(resolve, 1500); }),
        ]).catch(() => {});
        if (cancelled || !holderRef.current) return;
        world = startWorld(holderRef.current, {
          sky,
          profile,
          online: onlineRef.current,
          input: inputRef.current,
          start: readPlace() || SPAWN,
          onNear: (building) => { nearRef.current = building; setNear(building); },
          onMap: (value) => mapRef.current?.(value),
          onEnvironment: setEnvironment,
          onSound: playSound,
        });
        worldRef.current = world;
        if (import.meta.env.DEV) window.__campus3d = world;
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        console.error("Không khởi động được sân trường 3D", cause);
        setStatus("failed");
      }
    };
    void begin();
    const remember = () => { if (world && !leavingRef.current) savePlace(world.where()); };
    window.addEventListener("pagehide", remember);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", remember);
      if (world) {
        if (!leavingRef.current) savePlace(world.where());
        world.stop();
      }
      worldRef.current = null;
      nearRef.current = null;
    };
  }, [sky, profile, editing, onlineRef]);

  const perform = useCallback(async (payload) => {
    setActionBusy(true);
    try { return await action(payload); } catch { return null; }
    finally { setActionBusy(false); }
  }, [action]);

  const shoot = useCallback((power) => {
    const current = selfRef.current;
    if (!current?.sport) return;
    const at = worldRef.current?.where();
    const assisted = current.sport === "basketball" ? basketPower({ ...current, ...at }) : 0.78;
    void perform({ type: "shoot", power: Number.isFinite(power) ? power : assisted });
  }, [perform]);

  const beginCharge = useCallback(() => {
    if (!selfRef.current?.sport || !onlineRef.current.connected || chargeStartRef.current !== null) return;
    chargeStartRef.current = performance.now();
    setCharge(0);
  }, [onlineRef]);

  const finishCharge = useCallback(() => {
    if (chargeStartRef.current === null) return;
    const power = Math.max(0.05, Math.min(1, (performance.now() - chargeStartRef.current) / 1200));
    chargeStartRef.current = null;
    setCharge(null);
    shoot(power);
  }, [shoot]);

  useEffect(() => {
    if (charge === null) return undefined;
    const timer = window.setInterval(() => {
      if (chargeStartRef.current !== null) setCharge(Math.min(1, (performance.now() - chargeStartRef.current) / 1200));
    }, 35);
    return () => window.clearInterval(timer);
  }, [charge === null]);

  useEffect(() => {
    if (!profile || editing || status !== "ready") return undefined;
    const held = heldRef.current;
    const onKeyDown = (event) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey || shopOpen) return;
      if (event.key === "Shift") { held.shift = true; syncInput(); return; }
      const move = MOVE_KEYS[event.key];
      if (move) { event.preventDefault(); held.keys.add(move); syncInput(); return; }
      const onControl = event.target instanceof HTMLElement && event.target.closest("button, a, summary");
      if (event.code === "Space" && !onControl && atLake) {
        event.preventDefault();
        if (!event.repeat) fishPress();
        return;
      }
      if (event.code === "Space" && !onControl && selfRef.current?.sport) {
        event.preventDefault();
        if (!event.repeat) beginCharge();
        return;
      }
      if ((event.key === "Enter" && !onControl) || event.key === "e" || event.key === "E") {
        if (!selfRef.current?.sport && nearRef.current) { event.preventDefault(); go(nearRef.current); }
      }
      if (event.key === "Escape") { setPlacesOpen(false); setRosterOpen(false); setShopOpen(false); }
    };
    const onKeyUp = (event) => {
      if (event.code === "Space") { fishRelease(); finishCharge(); }
      if (event.key === "Shift") held.shift = false;
      const move = MOVE_KEYS[event.key];
      if (move) held.keys.delete(move);
      syncInput();
    };
    const release = () => {
      held.keys.clear(); held.pad.clear(); held.shift = false;
      chargeStartRef.current = null; setCharge(null);
      fishRelease();
      syncInput();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
      release();
    };
  }, [go, syncInput, profile, editing, status, beginCharge, finishCharge, atLake, fishPress, fishRelease, shopOpen]);

  useEffect(() => {
    if (!connected || status !== "ready" || autoJoinRef.current) return;
    const requested = new URLSearchParams(window.location.search).get("sport");
    if (!SPORT_NAMES[requested]) return;
    autoJoinRef.current = true;
    void perform({ type: "join", sport: requested });
  }, [connected, status, perform]);

  const hold = useCallback((name, down) => {
    if (down) heldRef.current.pad.add(name);
    else heldRef.current.pad.delete(name);
    syncInput();
  }, [syncInput]);

  const toggleRun = () => {
    heldRef.current.runLock = !heldRef.current.runLock;
    setRunning(heldRef.current.runLock);
    syncInput();
  };

  const acceptProfile = useCallback((value) => { setProfile(value); setEditing(false); }, []);
  const invite = async () => {
    try {
      const url = new URL("/san-truong-3d", window.location.origin);
      if (sport) url.searchParams.set("sport", sport);
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setCopied(false); }
  };
  const nextSky = SKY_ORDER[(SKY_ORDER.indexOf(sky) + 1) % SKY_ORDER.length];
  const SkyIcon = SKY_ICONS[sky];
  const game = sport ? snapshot?.[sport] : null;
  const activePlayers = snapshot?.players.filter((player) => player.sport === sport) || [];
  const idealPower = basketPower(self);
  const fishingHint = atLake ? (fishing.note || FISHING_HINTS[fishing.phase]) : "Đi ra cuối cầu gỗ để thả câu. Tiệm cần câu ở cạnh đầu cầu.";

  return (
    <div className={`c3-shell is-${sky} ${sport ? "has-sport" : ""}`}>
      <div className="c3-stage" ref={holderRef} />
      {(!profile || editing) ? <CharacterLobby onReady={acceptProfile} initialProfile={profile} editing={editing} onCancel={() => setEditing(false)} /> : <>
      <header className="c3-top">
        <Link className="c3-pill c3-back" to="/"><ArrowLeft aria-hidden="true" />Sân trường</Link>
        <div className="c3-places">
          <button type="button" className="c3-pill" aria-expanded={placesOpen} aria-controls="c3-places" onClick={() => setPlacesOpen((open) => !open)}><MapPin aria-hidden="true" />Đi nhanh tới</button>
          {placesOpen && <ul id="c3-places" className="c3-place-list">
            <li><Link to="/bong-da" onClick={() => setPlacesOpen(false)}>🏟️ Sân vận động · Đá 11 người kiểu FO4</Link></li>
            <li><button type="button" disabled={!connected || actionBusy} onClick={() => { setPlacesOpen(false); void perform({ type: "join", sport: "football" }); }}>⚽ Sân bóng đá · Chơi ngay</button></li>
            <li><button type="button" disabled={!connected || actionBusy} onClick={() => { setPlacesOpen(false); void perform({ type: "join", sport: "basketball" }); }}>🏀 Sân bóng rổ · Chơi ngay</button></li>
            {BUILDINGS.map((building) => <li key={building.id}><button type="button" onClick={() => { setPlacesOpen(false); go(building); }}><span className="c3-dot" style={{ background: building.roof }} aria-hidden="true" />{building.name}</button></li>)}
          </ul>}
        </div>
        <Link className="c3-pill" to="/nha" title="Về nhà: bàn học bên cửa sổ tầng 2, kệ sách, giường"><House aria-hidden="true" />Về nhà</Link>
        <div className="c3-top-right">
          {purse && <span className="c3-pill c3-purse" title="Vàng của bạn"><Coins aria-hidden="true" />{purse.wallet.gold}</span>}
          <button type="button" className="c3-pill c3-profile-pill" onClick={() => setEditing(true)} title="Sửa tên và nhân vật">{profile.gender === "female" ? "👩" : "👨"}<span>{profile.name}</span></button>
          <button type="button" className="c3-pill c3-sky-pill" disabled={fishing.phase === "landing"} onClick={() => { fishing.stop(); setSky(nextSky); }} title={`Đổi sang ${SKY_LABELS[nextSky].toLowerCase()}`}><SkyIcon aria-hidden="true" /><span>{SKY_LABELS[sky]}</span></button>
          <span className="c3-pill c3-sound"><SoundToggle /></span>
        </div>
      </header>
      {status === "ready" && <>
        <MiniMap mapRef={mapRef} near={near} onlineRef={onlineRef} />
        <aside className="c3-online-card" aria-label="Người chơi trực tuyến">
          <div className="c3-online-line"><span className={`c3-connection-dot ${connected ? "is-live" : ""}`} /><strong>{connected ? `${snapshot?.players.length || 1} người đang online` : connection === "connecting" ? "Đang vào sân online…" : "Đang kết nối lại…"}</strong><button type="button" aria-label={rosterOpen ? "Đóng danh sách người chơi" : "Xem người chơi"} aria-expanded={rosterOpen} onClick={() => setRosterOpen((open) => !open)}><Users size={17} /></button></div>
          <p>Người chơi thật có tên phía trên đầu.</p>
          {rosterOpen && <div className="c3-roster"><ul>{(connected ? snapshot?.players || [] : []).map((player) => <li key={player.id}><span>{player.gender === "female" ? "👩" : "👨"}</span><strong>{player.name}{player.id === snapshot?.selfId ? " (bạn)" : ""}</strong><small>{SPORT_NAMES[player.sport] || "Đi dạo"}</small></li>)}</ul><p>Các bạn đi dạo tự động trong cảnh là NPC.</p></div>}
          <div className="c3-online-actions"><button type="button" onClick={invite}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Đã chép link" : "Mời bạn vào sân"}</button>{!connected && <button type="button" onClick={reconnect}><RefreshCw size={14} />Kết nối lại</button>}</div>
        </aside>
      </>}
      {status === "loading" && <p className="c3-loading" role="status">Đang dựng sân trường cho {profile.name}…</p>}
      {status === "failed" && <div className="c3-failed" role="alert"><h1>Máy này chưa bật được đồ họa 3D</h1><p>Trình duyệt không tạo được khung vẽ WebGL. Bạn vẫn vào các trường được từ sân trường thường.</p><Link className="c3-enter" to="/">Về sân trường</Link></div>}
      {status === "ready" && <>
        <div className="c3-prompt" aria-live="polite">
          {!sport && !environment.atLake && (near ? <button type="button" className="c3-enter" onClick={() => go(near)}><DoorOpen aria-hidden="true" />Vào {near.name}<kbd>Enter</kbd></button> : !moved && <p className="c3-hint"><span className="c3-for-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> để đi · Shift để chạy</span><span className="c3-for-touch">Giữ mũi tên để đi</span><span>Kéo màn hình để xoay góc nhìn</span></p>)}
        </div>
        {(!environment.atLake || sport) && (
        <section className="c3-sports-hud" aria-label={sport ? `Trận ${SPORT_NAMES[sport].toLowerCase()}` : "Chọn môn thể thao"}>
          {sport ? <>
            <div className="c3-match-banner"><div className="c3-match-top"><span>{sport === "football" ? "⚽" : "🏀"} {SPORT_NAMES[sport]}<small>{activePlayers.length} người chơi thật</small></span><div className="c3-match-score" aria-label={`Đội đỏ ${game?.score?.[0] || 0}, đội xanh ${game?.score?.[1] || 0}`}><span className="is-red">Đỏ</span><strong>{game?.score?.[0] || 0}<em>:</em>{game?.score?.[1] || 0}</strong><span className="is-blue">Xanh</span></div><button type="button" className="c3-exit-match" disabled={!connected || actionBusy} onClick={() => { void perform({ type: "leave" }); }} aria-label="Rời sân chơi"><X size={18} /></button></div>
            <p className="c3-team-note">Bạn ở <strong className={self?.team === 1 ? "is-blue" : "is-red"}>đội {self?.team === 1 ? "Xanh" : "Đỏ"}</strong> · Tấn công {self?.team === 1 ? "về phía Tây ←" : "về phía Đông →"}</p></div>
            <details className="c3-match-instructions"><summary>Cách chơi <span>?</span></summary><div><p className="c3-match-help">{sport === "football" ? "Đến gần bóng, quay về hướng muốn sút. Đi gần bóng để rê bóng." : snapshot?.basketball?.holder === snapshot?.selfId ? "Bạn đang giữ bóng. Quay mặt về rổ đối phương rồi ném!" : "Đến gần bóng để nhặt; đến gần đối thủ rồi bấm để cướp bóng."}</p>
            {activePlayers.length < 2 && <p className="c3-practice-note">Bạn có thể tập ngay. Mời bạn bè vào cùng địa chỉ để thi đấu.</p>}
            <p className="c3-practice-note">Giữ rồi thả Space để chỉnh lực. Bấm nút để dùng lực gợi ý. Bóng rổ: vạch xanh là lực tới rổ.</p>{sport === "football" && <Link className="c3-fo4-link" to="/bong-da">🏟️ Đá 11 người kiểu FIFA Online 4 <span>→</span></Link>}</div></details>
            <div className={`c3-control-dock is-${sport}`}><div className="c3-shot-row">{sport === "basketball" && <button type="button" className="c3-aim" onClick={() => worldRef.current?.aimAt(hoopFor(self.team))} title="Quay nhân vật về phía rổ đối phương">🎯<span>Ngắm rổ</span></button>}<button className="c3-shoot" type="button" disabled={!connected || actionBusy} onClick={() => shoot()}><span aria-hidden="true">{sport === "football" ? "⚽" : "🏀"}</span><span>{sport === "football" ? "Sút bóng" : snapshot?.basketball?.holder === snapshot?.selfId ? "Ném bóng" : "Cướp / nhặt"}</span><kbd>Space</kbd></button><div className="c3-shot-detail"><span>{charge !== null ? `Lực ${Math.round(charge * 100)}% · thả Space để ${sport === "football" ? "sút" : "ném"}` : "Giữ rồi thả Space để chỉnh lực"}</span><div className="c3-power-track" role="meter" aria-label="Lực đánh bóng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((charge ?? (sport === "basketball" ? idealPower : 0.78)) * 100)}><i style={{ width: `${(charge ?? (sport === "basketball" ? idealPower : 0.78)) * 100}%` }} />{sport === "basketball" && <b style={{ left: `${idealPower * 100}%` }} title="Lực gợi ý để tới rổ" />}</div>{sport === "basketball" && <small>Vạch xanh: lực gợi ý · Bấm nút để dùng lực gợi ý.</small>}</div></div>
            </div>
          </> : <><div className="c3-play-heading"><strong>Ra sân chơi một chút?</strong><span>Chung bóng, chung tỉ số với mọi người.</span></div><div className="c3-sport-buttons"><button type="button" disabled={!connected || actionBusy} onClick={() => { void perform({ type: "join", sport: "football" }); }}><span>⚽</span><strong>Bóng đá<small>Vào sân và sút ngay</small></strong></button><button type="button" disabled={!connected || actionBusy} onClick={() => { void perform({ type: "join", sport: "basketball" }); }}><span>🏀</span><strong>Bóng rổ<small>Rê bóng và ném rổ</small></strong></button><Link className="c3-fo4-tile" to="/bong-da"><span>🏟️</span><strong>Đá 11 người<small>Kiểu FIFA Online 4</small></strong></Link></div></>}
          {error && <p className="c3-game-error" role="alert">{error}</p>}
          {!connected && <p className="c3-game-error" role="status">Kết nối đang gián đoạn. Trận đấu sẽ tiếp tục khi vào lại máy chủ.</p>}
          {!sport && <p className="c3-lake-directions"><Fish size={15} aria-hidden="true" />Hồ câu ngoài cổng trường: đi qua đường làng, rẽ phải tới cầu gỗ. Nhà của bạn ở bên trái.</p>}
        </section>
        )}
        {environment.atLake && !sport && (
          <section className="c3-fishing-hud" aria-label="Câu cá ngoài trường">
            {fishingHint && <p className="c3-hint" role="status">{fishingHint}</p>}
            <div className="c3-fishing-controls">
              {atLake && <button type="button" className={`c3-enter c3-fish-button ${fishing.phase === "bite" ? "is-hot" : ""}`} disabled={!connected || ["cast", "landing"].includes(fishing.phase)}
                onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); fishPress(); }}
                onPointerUp={fishRelease} onPointerCancel={fishRelease} onLostPointerCapture={fishRelease} onBlur={fishRelease}
                onKeyDown={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); if (!event.repeat) fishPress(); } }}
                onKeyUp={(event) => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); fishRelease(); } }}
                onContextMenu={(event) => event.preventDefault()}><Fish aria-hidden="true" />{FISHING_LABELS[fishing.phase]}<kbd>Space</kbd></button>}
              {fishing.busy && <button type="button" className="c3-pill" disabled={fishing.phase === "landing"} onClick={() => fishing.stop()}>Thu câu</button>}
              {purse && !fishing.busy && <button type="button" className="c3-pill" onClick={() => setShopOpen(true)}><Store aria-hidden="true" />Tiệm cần câu</button>}
            </div>
            {!connected && <p className="c3-game-error" role="status">Chờ kết nối lại để thả câu.</p>}
          </section>
        )}
        {atLake && fishing.phase === "reel" && <ReelBar barRef={fishing.barRef} />}
        {atLake && fishing.phase === "caught" && fishing.result && <CatchCard result={fishing.result} onClose={fishing.dismiss} />}
        {shopOpen && purse && <TackleShop wallet={purse.wallet} catalog={purse.catalog} onClose={() => setShopOpen(false)} onBuy={async (rod) => { const result = await buyRod(rod); updateWallet(result.wallet); }} />}
        <div className="c3-pad" role="group" aria-label="Nút di chuyển"><PadKey name="up" label="Đi lên" icon={ChevronUp} onHold={hold} /><PadKey name="left" label="Sang trái" icon={ChevronLeft} onHold={hold} /><PadKey name="down" label="Đi xuống" icon={ChevronDown} onHold={hold} /><PadKey name="right" label="Sang phải" icon={ChevronRight} onHold={hold} /></div>
        <button type="button" className={`c3-run ${running ? "is-on" : ""}`} aria-pressed={running} onClick={toggleRun}><Rabbit aria-hidden="true" />{running ? "Đang chạy" : "Chạy"}</button>
      </>}
      <div className={`c3-fade ${leaving ? "is-on" : ""}`} aria-hidden="true" />
      </>}
    </div>
  );
};

export default Campus3DPage;
