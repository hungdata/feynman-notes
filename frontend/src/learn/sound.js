/**
 * Small game-like sound effects synthesised with the Web Audio API
 * (no audio files). Muting is remembered per browser.
 */
const KEY = "feynman.learn.sound";
let context = null;

export const isSoundOn = () => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
};
export const setSoundOn = (on) => {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* private mode */ }
};

const audio = () => {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!context) context = new AudioContext();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
};

/** One soft note: frequency (Hz), start offset and length (s). */
const tone = (ctx, { freq, start = 0, length = 0.14, type = "sine", volume = 0.18, slideTo }) => {
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
};

/** Short burst of filtered noise: chalk on a board, an eraser wiping. */
const noise = (ctx, { start = 0, length = 0.12, freq = 2400, q = 1.2, volume = 0.18, sweep }) => {
  const at = ctx.currentTime + start;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin(i / 90));
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, at);
  if (sweep) filter.frequency.exponentialRampToValueAtTime(sweep, at + length);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(at);
  source.stop(at + length + 0.02);
};

const SOUNDS = {
  // pool: cue tip on the cue ball, balls clacking, a cushion, a ball dropping into a pocket
  cue: (ctx, level) => { tone(ctx, { freq: 320, length: 0.07, type: "triangle", volume: 0.2 * level, slideTo: 180 }); noise(ctx, { length: 0.04, freq: 1800, q: 1, volume: 0.16 * level }); },
  clack: (ctx, level) => { tone(ctx, { freq: 2300, length: 0.03, type: "triangle", volume: 0.15 * level }); noise(ctx, { length: 0.028, freq: 4600, q: 1.4, volume: 0.22 * level }); },
  cushion: (ctx, level) => tone(ctx, { freq: 150, length: 0.08, type: "sine", volume: 0.16 * level, slideTo: 90 }),
  pocket: (ctx) => { tone(ctx, { freq: 130, length: 0.16, type: "sine", volume: 0.24, slideTo: 60 }); [0.09, 0.17, 0.24].forEach((start, index) => noise(ctx, { start, length: 0.05, freq: 900 - index * 150, q: 1.2, volume: 0.1 })); },
  // 3D campus: a footstep, a friend saying hello, a kicked football, a goal, a basketball
  step: (ctx, level) => noise(ctx, { length: 0.04, freq: 480, q: 0.8, volume: 0.07 * level }),
  hello: (ctx, level) => { tone(ctx, { freq: 740, length: 0.08, type: "sine", volume: 0.07 * level }); tone(ctx, { freq: 988, start: 0.08, length: 0.13, type: "sine", volume: 0.07 * level }); },
  kick: (ctx, level) => { tone(ctx, { freq: 190, length: 0.09, type: "sine", volume: 0.22 * level, slideTo: 85 }); noise(ctx, { length: 0.035, freq: 1200, q: 0.9, volume: 0.12 * level }); },
  goal: (ctx, level) => { tone(ctx, { freq: 2100, length: 0.28, type: "triangle", volume: 0.09 * level, slideTo: 2250 }); [784, 988, 1175].forEach((freq, index) => tone(ctx, { freq, start: 0.3 + index * 0.08, length: 0.16, type: "triangle", volume: 0.1 * level })); },
  bounce: (ctx, level) => tone(ctx, { freq: 215, length: 0.06, type: "sine", volume: 0.13 * level, slideTo: 120 }),
  score: (ctx, level) => { noise(ctx, { length: 0.2, freq: 3000, q: 1.1, volume: 0.13 * level, sweep: 900 }); tone(ctx, { freq: 880, start: 0.12, length: 0.14, type: "triangle", volume: 0.08 * level }); },
  rim: (ctx, level) => tone(ctx, { freq: 620, length: 0.13, type: "triangle", volume: 0.1 * level, slideTo: 560 }),
  // chalk writing: three quick scratches
  chalk: (ctx) => [0, 0.09, 0.2].forEach((start, index) => noise(ctx, { start, length: 0.08 + index * 0.02, freq: 3200 - index * 300, q: 2.4, volume: 0.12 })),
  // chalk tick on the board
  tick: (ctx) => { noise(ctx, { length: 0.06, freq: 3600, q: 3, volume: 0.14 }); noise(ctx, { start: 0.07, length: 0.11, freq: 2800, q: 2.5, volume: 0.13, sweep: 4200 }); },
  // eraser wiping the board
  erase: (ctx) => [0, 0.16].forEach((start) => noise(ctx, { start, length: 0.15, freq: 900, q: 0.7, volume: 0.2, sweep: 500 })),
  // light tick when an answer is picked
  select: (ctx) => tone(ctx, { freq: 660, length: 0.06, type: "triangle", volume: 0.08 }),
  // bright two-note chime
  correct: (ctx) => {
    tone(ctx, { freq: 880, length: 0.12, type: "triangle", volume: 0.16 });
    tone(ctx, { freq: 1318.5, start: 0.09, length: 0.22, type: "triangle", volume: 0.16 });
  },
  // low "bonk"
  wrong: (ctx) => {
    tone(ctx, { freq: 220, length: 0.18, type: "square", volume: 0.07, slideTo: 150 });
    tone(ctx, { freq: 196, start: 0.12, length: 0.22, type: "square", volume: 0.06, slideTo: 130 });
  },
  // next card
  next: (ctx) => tone(ctx, { freq: 520, length: 0.07, type: "sine", volume: 0.07, slideTo: 700 }),
  // rising run for a combo of correct answers
  combo: (ctx) => [784, 988, 1175, 1568].forEach((freq, index) => tone(ctx, { freq, start: index * 0.05, length: 0.1, type: "triangle", volume: 0.1 })),
  // small fanfare when a lesson is finished
  finish: (ctx) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => tone(ctx, { freq, start: index * 0.11, length: 0.18, type: "triangle", volume: 0.15 }));
    [1046.5, 1318.5, 1568].forEach((freq) => tone(ctx, { freq, start: 0.5, length: 0.6, type: "sine", volume: 0.1 }));
  },
};

/** `level` (0..1) scales the loudness of sounds that support it (pool impacts). */
export const playSound = (name, level = 1) => {
  if (!isSoundOn() || !SOUNDS[name]) return;
  try {
    const ctx = audio();
    if (ctx) SOUNDS[name](ctx, Math.max(0.06, Math.min(1, level)));
  } catch { /* audio not available */ }
  if (name === "wrong") navigator.vibrate?.(60);
};
