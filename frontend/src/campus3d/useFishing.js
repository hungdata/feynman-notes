import { useCallback, useEffect, useRef, useState } from "react";
import { castLine, landFish, releaseLine } from "./fishingApi";
import { createReel, stepReel } from "./fishing";
import { playSound } from "../learn/sound";

const BITE_WINDOW_MS = 1300;

/** One cast, with its timers and requests cancelled together when leaving the deck. */
export const useFishing = ({ worldRef, atLake, onWallet, beforeCast }) => {
  const [view, setView] = useState({ phase: "idle", note: "", result: null });
  const barRef = useRef(null);
  const run = useRef({ phase: "idle", castId: null, timers: [], frame: 0, holding: false, generation: 0 });

  const show = useCallback((phase, extra = {}) => {
    run.current.phase = phase;
    setView({ phase, note: "", result: null, ...extra });
    worldRef.current?.fishing(["idle", "caught"].includes(phase) ? null : { phase, progress: 0 });
  }, [worldRef]);

  const clear = useCallback(() => {
    const state = run.current;
    state.generation += 1;
    state.timers.forEach(window.clearTimeout);
    state.timers = [];
    window.cancelAnimationFrame(state.frame);
    if (state.castId) void releaseLine(state.castId);
    state.castId = null;
    state.holding = false;
  }, []);

  const stop = useCallback((note = "") => { clear(); show("idle", { note }); }, [clear, show]);

  const reel = useCallback(() => {
    const state = run.current;
    const generation = state.generation;
    state.timers.forEach(window.clearTimeout);
    state.timers = [];
    const game = createReel(state.info.pull, state.info.zone);
    show("reel");
    playSound("cue");
    let last = performance.now();
    const frame = (now) => {
      if (state.generation !== generation) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepReel(game, dt, state.holding);
      const bar = barRef.current;
      if (bar) {
        bar.style.setProperty("--fish", game.fish);
        bar.style.setProperty("--zone-at", game.at);
        bar.style.setProperty("--zone", game.zone);
        bar.style.setProperty("--progress", game.progress);
        bar.classList.toggle("is-on", game.fish >= game.at && game.fish <= game.at + game.zone);
      }
      worldRef.current?.fishing({ phase: "reel", progress: game.progress });
      if (!game.result) { state.frame = window.requestAnimationFrame(frame); return; }
      if (game.result === "lost") { playSound("wrong"); stop("Cá sổng mất rồi! Giữ con cá trong khung xanh nhé."); return; }
      const castId = state.castId;
      show("landing");
      landFish(castId).then((result) => {
        if (state.generation !== generation) return;
        state.castId = null;
        onWallet(result.wallet);
        playSound(result.fish.rarity === "junk" ? "erase" : "finish");
        show("caught", { result });
      }).catch((error) => { if (state.generation === generation) stop(error.message); });
    };
    state.frame = window.requestAnimationFrame(frame);
  }, [onWallet, show, stop, worldRef]);

  const cast = useCallback(async () => {
    const state = run.current;
    const generation = ++state.generation;
    show("cast");
    playSound("chalk");
    try {
      await beforeCast?.();
      if (state.generation !== generation) return;
      const info = await castLine();
      if (state.generation !== generation) { void releaseLine(info.castId); return; }
      state.castId = info.castId;
      state.info = info;
      const later = (ms, action) => state.timers.push(window.setTimeout(() => { if (state.generation === generation) action(); }, ms));
      later(900, () => { if (state.phase === "cast") show("wait"); });
      for (const at of info.nibbles) later(at, () => {
        if (state.phase !== "wait") return;
        show("nibble"); playSound("tick");
        later(480, () => { if (state.phase === "nibble") show("wait"); });
      });
      later(info.biteIn, () => {
        if (!["cast", "wait", "nibble"].includes(state.phase)) return;
        show("bite"); playSound("combo");
        later(BITE_WINDOW_MS, () => { if (state.phase === "bite") stop("Chậm mất rồi, cá ăn hết mồi. Thả câu lại nhé."); });
      });
    } catch (error) { if (state.generation === generation) stop(error.message); }
  }, [beforeCast, show, stop]);

  const press = useCallback(() => {
    if (!atLake) return;
    const state = run.current;
    if (["idle", "caught"].includes(state.phase)) void cast();
    else if (state.phase === "bite") { state.holding = true; reel(); }
    else if (state.phase === "reel") state.holding = true;
    else if (["wait", "nibble"].includes(state.phase)) { playSound("wrong"); stop("Giật sớm quá, cá sợ bơi mất. Chờ phao chìm hẳn rồi hãy giật."); }
  }, [atLake, cast, reel, stop]);
  const release = useCallback(() => { run.current.holding = false; }, []);

  useEffect(() => { if (!atLake && run.current.phase !== "idle") stop(); }, [atLake, stop]);
  useEffect(() => clear, [clear]);

  return { ...view, barRef, press, release, stop, busy: !["idle", "caught"].includes(view.phase), dismiss: () => show("idle") };
};
