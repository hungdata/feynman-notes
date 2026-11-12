import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, RotateCcw, Trophy, Users } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/pool.css";
import { LearnTopBar, SoundToggle } from "../learn/LearnChrome";
import { playSound } from "../learn/sound";
import { useUiTheme } from "../learn/useUiTheme";
import { chooseShot } from "../pool/ai";
import { DT, HEAD_X, TABLE, aimPreview, createRack, isFree, isMoving, stepPhysics, strike } from "../pool/physics";
import { VIEW, colorOf, drawScene } from "../pool/render";
import { GROUP_LABELS, isOnEight, newGame, playerName, resolveShot } from "../pool/rules";

const GROUP_IDS = { solid: [1, 2, 3, 4, 5, 6, 7], stripe: [9, 10, 11, 12, 13, 14, 15] };

const snapshot = (sim) => ({
  ...sim.game,
  moving: sim.moving,
  potted: sim.balls.filter((ball) => ball.potted).map((ball) => ball.id),
  onEight: [0, 1].map((index) => isOnEight(sim.game, sim.balls, index)),
});

const MiniBall = ({ id, gone }) => (
  <span className={`pl-mini ${id > 8 ? "is-stripe" : ""} ${gone ? "is-gone" : ""}`} style={{ "--ball": colorOf(id) }} title={`Bi ${id}`}>{gone ? "" : id}</span>
);

const PlayerPanel = ({ hud, index }) => {
  const group = hud.groups[index];
  const active = hud.turn === index && hud.winner == null;
  return (
    <div className={`pl-player ${active ? "is-active" : ""} ${index === 1 ? "is-right" : ""}`} aria-current={active ? "true" : undefined}>
      <div className="pl-player-name">
        <strong>{playerName(hud, index)}</strong>
        <small>{group ? GROUP_LABELS[group] : "Chưa chia nhóm bi"}</small>
      </div>
      <div className="pl-tray" aria-label={group ? `Bi còn lại của ${playerName(hud, index)}` : undefined}>
        {group ? GROUP_IDS[group].map((id) => <MiniBall key={id} id={id} gone={hud.potted.includes(id)} />) : Array.from({ length: 7 }, (_, slot) => <span key={slot} className="pl-mini is-empty" />)}
        <MiniBall id={8} gone={hud.potted.includes(8) || !hud.onEight[index]} />
      </div>
    </div>
  );
};

const PoolPage = () => {
  useUiTheme();
  const canvasRef = useRef(null);
  const powerRef = useRef(null);
  const powerFillRef = useRef(null);
  const spinRef = useRef(null);
  const spinDotRef = useRef(null);
  const simRef = useRef(null);
  const [hud, setHud] = useState(null);

  const refresh = useCallback(() => { if (simRef.current) setHud(snapshot(simRef.current)); }, []);

  const start = useCallback((mode) => {
    simRef.current = { balls: createRack(), game: newGame(mode), angle: 0, power: 0, spin: { side: 0, top: 0 }, moving: false, shot: null, sinking: [], drag: null, ai: null, charging: false, chargeT: 0, time: 0, lastClack: 0, aiTimer: 0 };
    playSound("next");
    setHud(snapshot(simRef.current));
  }, []);

  const humanCanAct = (sim) => sim && !sim.moving && sim.game.winner == null && !(sim.game.mode === "ai" && sim.game.turn === 1);

  const shoot = useCallback((power) => {
    const sim = simRef.current;
    if (!sim || sim.moving || sim.game.winner != null || sim.balls[0].potted) return;
    strike(sim.balls, sim.angle, power, sim.spin);
    sim.moving = true;
    sim.shot = { firstHit: null, potted: [] };
    sim.power = 0;
    sim.charging = false;
    sim.game = { ...sim.game, ballInHand: false };
    playSound("cue", 0.4 + power * 0.6);
    refresh();
  }, [refresh]);

  // Simulation + drawing loop.
  useEffect(() => {
    if (!hud) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let frame = 0;
    let last = performance.now();
    let accumulator = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = canvas.clientWidth;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round((width * VIEW.h / VIEW.w) * ratio);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const finishShot = (sim) => {
      sim.moving = false;
      sim.game = resolveShot(sim.game, sim.balls, sim.shot);
      sim.shot = null;
      if (sim.game.winner != null) playSound("finish");
      else if (sim.game.foul) playSound("wrong");
      const cue = sim.balls[0];
      const nearest = sim.balls.filter((ball) => !ball.potted && ball.id !== 0).sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
      if (nearest) sim.angle = Math.atan2(nearest.y - cue.y, nearest.x - cue.x);
      setHud(snapshot(sim));
    };

    const loop = (now) => {
      const sim = simRef.current;
      if (!sim) return;
      const elapsed = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.time += elapsed;

      if (sim.moving) {
        accumulator += elapsed;
        const events = [];
        while (accumulator >= DT) { stepPhysics(sim.balls, DT, events); accumulator -= DT; }
        for (const event of events) {
          if (event.type === "hit") {
            if (sim.shot.firstHit == null && (event.a === 0 || event.b === 0)) sim.shot.firstHit = event.a === 0 ? event.b : event.a;
            if (sim.time - sim.lastClack > 0.035) { playSound("clack", event.speed / 900); sim.lastClack = sim.time; }
          } else if (event.type === "cushion") {
            if (event.speed > 120 && sim.time - sim.lastClack > 0.05) { playSound("cushion", event.speed / 1200); sim.lastClack = sim.time; }
          } else if (event.type === "pot") {
            sim.shot.potted.push(event.id);
            const ball = sim.balls.find((item) => item.id === event.id);
            sim.sinking.push({ id: event.id, x: ball.x, y: ball.y, t: 1 });
            playSound("pocket");
            setHud(snapshot(sim));
          }
        }
        if (!isMoving(sim.balls)) finishShot(sim);
      } else {
        accumulator = 0;
        const aiTurn = sim.game.mode === "ai" && sim.game.turn === 1 && sim.game.winner == null;
        if (aiTurn && !sim.ai) {
          sim.aiTimer += elapsed;
          if (sim.aiTimer > 0.9) {
            const plan = chooseShot(sim.balls, sim.game);
            if (plan.place) Object.assign(sim.balls[0], plan.place);
            sim.spin = { side: 0, top: 0 };
            sim.ai = { ...plan, from: sim.angle, t: 0 };
            sim.aiTimer = 0;
          }
        } else if (sim.ai) {
          sim.ai.t += elapsed;
          const turn = Math.min(1, sim.ai.t / 0.55);
          const delta = Math.atan2(Math.sin(sim.ai.angle - sim.ai.from), Math.cos(sim.ai.angle - sim.ai.from));
          sim.angle = sim.ai.from + delta * turn;
          sim.power = sim.ai.power * Math.max(0, Math.min(1, (sim.ai.t - 0.55) / 0.5));
          if (sim.ai.t > 1.2) { const { angle, power } = sim.ai; sim.ai = null; sim.angle = angle; shoot(power); }
        } else if (sim.charging) {
          sim.chargeT += elapsed;
          const phase = (sim.chargeT / 1.3) % 2;
          sim.power = phase <= 1 ? phase : 2 - phase;
        }
      }

      sim.sinking = sim.sinking.map((item) => ({ ...item, t: item.t - elapsed * 5 })).filter((item) => item.t > 0);
      const showAim = !sim.moving && sim.game.winner == null && sim.drag !== "cue";
      const cue = sim.balls[0];
      drawScene(ctx, canvas.width / VIEW.w, {
        balls: sim.balls,
        sinking: sim.sinking,
        angle: sim.angle,
        power: sim.power,
        showAim,
        preview: showAim ? aimPreview(sim.balls, sim.angle) : null,
        inHand: sim.game.ballInHand && !sim.moving && sim.game.winner == null,
        inHandValid: isFree(sim.balls, cue.x, cue.y, 0),
        time: sim.time,
      });
      if (powerFillRef.current) powerFillRef.current.style.height = `${Math.round(sim.power * 100)}%`;
      if (spinDotRef.current) { spinDotRef.current.style.left = `${50 + sim.spin.side * 50}%`; spinDotRef.current.style.top = `${50 - sim.spin.top * 50}%`; }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
    // The loop reads everything from simRef; it only needs to start once a game exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(hud), shoot]);

  const toWorld = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * VIEW.w - TABLE.rail, y: ((event.clientY - rect.top) / rect.height) * VIEW.h - TABLE.rail };
  };

  const aimAt = (sim, point) => {
    const cue = sim.balls[0];
    if (Math.hypot(point.x - cue.x, point.y - cue.y) > 4) sim.angle = Math.atan2(point.y - cue.y, point.x - cue.x);
  };

  /** True when the point is on the cue stick (which lies behind the cue ball). */
  const onStick = (sim, point, slack) => {
    const cue = sim.balls[0];
    const dx = point.x - cue.x;
    const dy = point.y - cue.y;
    const along = -(dx * Math.cos(sim.angle) + dy * Math.sin(sim.angle));
    const across = Math.abs(dx * Math.sin(sim.angle) - dy * Math.cos(sim.angle));
    return along > TABLE.r && along < 450 && across < slack;
  };

  const onTableDown = (event) => {
    const sim = simRef.current;
    if (!humanCanAct(sim)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toWorld(event);
    const cue = sim.balls[0];
    if (sim.game.ballInHand && Math.hypot(point.x - cue.x, point.y - cue.y) < TABLE.r * 3) sim.drag = "cue";
    else if (onStick(sim, point, event.pointerType === "mouse" ? 14 : 30)) {
      // Holding the stick: it turns around the cue ball with the hand.
      sim.drag = "stick";
      sim.grab = { pointer: Math.atan2(point.y - cue.y, point.x - cue.x), angle: sim.angle };
      event.currentTarget.style.cursor = "grabbing";
    } else { sim.drag = "aim"; aimAt(sim, point); }
  };

  const onTableMove = (event) => {
    const sim = simRef.current;
    if (!sim) return;
    const point = toWorld(event);
    if (!sim.drag) {
      if (event.pointerType === "mouse") event.currentTarget.style.cursor = humanCanAct(sim) && onStick(sim, point, 14) ? "grab" : "crosshair";
      return;
    }
    if (sim.drag === "aim") { aimAt(sim, point); return; }
    const cue = sim.balls[0];
    if (sim.drag === "stick") {
      if (Math.hypot(point.x - cue.x, point.y - cue.y) > TABLE.r) sim.angle = sim.grab.angle + Math.atan2(point.y - cue.y, point.x - cue.x) - sim.grab.pointer;
      return;
    }
    const maxX = sim.game.breakShot ? HEAD_X : TABLE.w - TABLE.r;
    const x = Math.max(TABLE.r, Math.min(maxX, point.x));
    const y = Math.max(TABLE.r, Math.min(TABLE.h - TABLE.r, point.y));
    if (isFree(sim.balls, x, y, 0)) Object.assign(cue, { x, y });
  };

  const onTableUp = (event) => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.drag === "cue") {
      const cue = sim.balls[0];
      const nearest = sim.balls.filter((ball) => !ball.potted && ball.id !== 0).sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0];
      if (nearest) sim.angle = Math.atan2(nearest.y - cue.y, nearest.x - cue.x);
    }
    if (sim.drag === "stick" && event?.currentTarget) event.currentTarget.style.cursor = "grab";
    sim.drag = null;
  };

  // Where the tip touches the cue ball: up = follow, down = draw, left/right = side spin.
  const setSpin = (event) => {
    const sim = simRef.current;
    if (!sim) return;
    const rect = spinRef.current.getBoundingClientRect();
    let side = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    let top = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
    const reach = Math.hypot(side, top);
    if (reach > 0.55) { side *= 0.55 / reach; top *= 0.55 / reach; }
    if (reach < 0.08) { side = 0; top = 0; }
    sim.spin = { side, top };
  };
  const onSpinDown = (event) => { if (!humanCanAct(simRef.current)) return; event.currentTarget.setPointerCapture(event.pointerId); simRef.current.spinning = true; setSpin(event); };
  const onSpinMove = (event) => { if (simRef.current?.spinning) setSpin(event); };
  const onSpinUp = () => { if (simRef.current) simRef.current.spinning = false; };

  const powerFrom = (event) => {
    const rect = powerRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  };
  const onPowerDown = (event) => {
    const sim = simRef.current;
    if (!humanCanAct(sim)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    sim.pulling = true;
    sim.power = powerFrom(event);
  };
  const onPowerMove = (event) => { const sim = simRef.current; if (sim?.pulling) sim.power = powerFrom(event); };
  const onPowerUp = () => {
    const sim = simRef.current;
    if (!sim?.pulling) return;
    sim.pulling = false;
    if (sim.power > 0.04) shoot(sim.power); else sim.power = 0;
  };

  // Keyboard: ←/→ aim (Shift = fine), hold Space to charge, release to shoot.
  useEffect(() => {
    const down = (event) => {
      const sim = simRef.current;
      if (!humanCanAct(sim) || ["INPUT", "TEXTAREA", "BUTTON", "A"].includes(event.target?.tagName)) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        sim.angle += (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.002 : 0.012);
      } else if (event.code === "Space") {
        event.preventDefault();
        if (!sim.charging) { sim.charging = true; sim.chargeT = 0; }
      }
    };
    const up = (event) => {
      const sim = simRef.current;
      if (event.code !== "Space" || !sim?.charging) return;
      event.preventDefault();
      sim.charging = false;
      if (sim.power > 0.04) shoot(sim.power);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [shoot]);

  const lastGroupPotted = hud?.winner != null;

  return (
    <div className="ln-shell pl-shell">
      <LearnTopBar back="/giai-tri" backLabel="Nhà giải trí" title="Phòng bida">
        {hud && <button type="button" className="btn-ghost" onClick={() => { simRef.current = null; setHud(null); }}><RotateCcw /> Ván mới</button>}
        <SoundToggle />
      </LearnTopBar>

      <main className="pl-main">
        {!hud ? (
          <section className="pl-menu" aria-labelledby="pool-title">
            <div className="pl-menu-art" aria-hidden="true">
              {[1, 10, 3, 8, 13, 6].map((id) => <MiniBall key={id} id={id} />)}
            </div>
            <h1 id="pool-title">Bida 8 bi</h1>
            <p>Đưa hết 7 bi của nhóm mình vào lỗ, rồi đưa bi số 8 vào để thắng.</p>
            <div className="pl-menu-actions">
              <button type="button" className="btn-primary ln-big-cta" onClick={() => start("ai")}><Bot /> Chơi với máy</button>
              <button type="button" className="btn-ghost pl-big-ghost" onClick={() => start("two")}><Users /> Hai người chơi</button>
            </div>
            <ul className="pl-rules">
              <li><strong>Ngắm:</strong> nắm cây cơ kéo để xoay, hoặc bấm/kéo trên bàn về hướng muốn đánh (phím ← → để chỉnh, giữ Shift để chỉnh thật nhỏ).</li>
              <li><strong>Đánh:</strong> kéo thanh lực xuống rồi thả tay (hoặc giữ phím Space rồi thả).</li>
              <li><strong>Xoáy:</strong> chọn điểm đánh trên bi trắng nhỏ. Đánh cao thì bi cái đi theo, đánh thấp thì giật lùi, lệch trái phải thì đổi góc khi chạm băng.</li>
              <li><strong>Lỗi:</strong> bi cái rơi lỗ, không chạm bi nào, hoặc chạm bi của đối thủ trước. Đối thủ được đặt bi cái ở bất kỳ đâu.</li>
              <li><strong>Bi 8:</strong> vào lỗ khi chưa hết bi của mình là thua.</li>
            </ul>
          </section>
        ) : (
          <>
            <div className="pl-hud">
              <PlayerPanel hud={hud} index={0} />
              <span className="pl-versus" aria-hidden="true">8</span>
              <PlayerPanel hud={hud} index={1} />
            </div>

            <div className="pl-play">
              <div className="pl-side">
              <div className="pl-power" ref={powerRef} role="slider" aria-label="Lực đánh: kéo xuống rồi thả để đánh" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} tabIndex={-1}
                onPointerDown={onPowerDown} onPointerMove={onPowerMove} onPointerUp={onPowerUp} onPointerCancel={onPowerUp}>
                <span className="pl-power-fill" ref={powerFillRef} />
                <span className="pl-power-label">Lực</span>
              </div>
              <div className="pl-spin" ref={spinRef} role="img" aria-label="Điểm đánh trên bi cái: trên là đẩy, dưới là giật lùi, trái phải là xoáy ngang. Bấm đúp để về giữa." title="Điểm đánh (xoáy). Bấm đúp để về giữa."
                onPointerDown={onSpinDown} onPointerMove={onSpinMove} onPointerUp={onSpinUp} onPointerCancel={onSpinUp} onDoubleClick={() => { if (simRef.current) simRef.current.spin = { side: 0, top: 0 }; }}>
                <span className="pl-spin-dot" ref={spinDotRef} />
              </div>
              <span className="pl-spin-label">Xoáy</span>
              </div>
              <div className="pl-table">
                <canvas ref={canvasRef} className="pl-canvas" aria-label="Bàn bida. Nắm cây cơ kéo để xoay hoặc kéo trên bàn để ngắm; kéo bi cái để đặt khi được đặt bi."
                  onPointerDown={onTableDown} onPointerMove={onTableMove} onPointerUp={onTableUp} onPointerCancel={onTableUp} />
                {lastGroupPotted && (
                  <div className="pl-over" role="dialog" aria-label="Kết thúc ván">
                    <Trophy />
                    <h2>{playerName(hud, hud.winner)} thắng!</h2>
                    <p>{hud.message}</p>
                    <div className="pl-menu-actions">
                      <button type="button" className="btn-primary ln-big-cta" onClick={() => start(hud.mode)} autoFocus><RotateCcw /> Chơi ván mới</button>
                      <Link className="btn-ghost pl-big-ghost" to="/giai-tri">Về nhà giải trí</Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p className={`pl-message ${hud.foul ? "is-foul" : ""}`} aria-live="polite">{hud.message}</p>
            <p className="pl-help">Nắm <strong>cây cơ</strong> kéo để xoay (hoặc bấm trên bàn), kéo thanh <strong>Lực</strong> xuống rồi thả để đánh. Chấm đỏ ở ô <strong>Xoáy</strong> là điểm đánh trên bi cái.</p>
          </>
        )}
      </main>
    </div>
  );
};

export default PoolPage;
