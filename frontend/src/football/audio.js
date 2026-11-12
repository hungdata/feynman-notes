/**
 * Âm thanh sân vận động tổng hợp bằng Web Audio: tiếng khán giả nền (to lên khi có cơ hội, bàn thắng),
 * còi trọng tài, tiếng chạm bóng, bóng rung lưới. Tắt/bật theo nút âm thanh chung của ứng dụng.
 */
import { isSoundOn } from "../learn/sound.js";

let ctx = null;
let crowd = null;

const audio = () => {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
};

const noiseBuffer = (context, seconds, brown = false) => {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  return buffer;
};

/** Bật tiếng khán giả nền. Gọi lại khi đang chạy thì không sao. */
export const startCrowd = () => {
  if (!isSoundOn()) return;
  const context = audio();
  if (!context || crowd) return;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 4, true);
  source.loop = true;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 700;
  band.Q.value = 0.5;
  const gain = context.createGain();
  gain.gain.value = 0.0001;
  gain.gain.setTargetAtTime(0.11, context.currentTime, 0.8);
  source.connect(band).connect(gain).connect(context.destination);
  source.start();
  crowd = { source, gain, band };
};

export const stopCrowd = () => {
  if (!crowd || !ctx) return;
  const { source, gain } = crowd;
  crowd = null;
  gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
  window.setTimeout(() => { try { source.stop(); } catch { /* đã dừng */ } }, 1200);
};

/** Khán giả ồ lên: amount 0..1.5. */
export const roar = (amount = 1) => {
  if (!crowd || !ctx) return;
  const now = ctx.currentTime;
  crowd.gain.gain.cancelScheduledValues(now);
  crowd.gain.gain.setTargetAtTime(0.11 + amount * 0.32, now, 0.12);
  crowd.gain.gain.setTargetAtTime(0.11, now + 0.6 + amount * 2.2, 1.2);
  crowd.band.frequency.cancelScheduledValues(now);
  crowd.band.frequency.setTargetAtTime(700 + amount * 500, now, 0.15);
  crowd.band.frequency.setTargetAtTime(700, now + 1 + amount * 2, 1);
};

/** Còi trọng tài: count tiếng, tiếng cuối dài hơn nếu long. */
export const whistle = (count = 1, long = false) => {
  if (!isSoundOn()) return;
  const context = audio();
  if (!context) return;
  for (let i = 0; i < count; i += 1) {
    const start = context.currentTime + i * 0.42;
    const length = long && i === count - 1 ? 0.9 : 0.28;
    const osc = context.createOscillator();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    const gain = context.createGain();
    osc.type = "sine";
    osc.frequency.value = 2650;
    lfo.frequency.value = 38;
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.setValueAtTime(0.09, start + length - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(context.destination);
    osc.start(start); lfo.start(start);
    osc.stop(start + length + 0.05); lfo.stop(start + length + 0.05);
  }
};

/** Tiếng chạm bóng: strength 0..1. */
export const thud = (strength = 0.5) => {
  if (!isSoundOn()) return;
  const context = audio();
  if (!context) return;
  const at = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150 + strength * 60, at);
  osc.frequency.exponentialRampToValueAtTime(60, at + 0.12);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.12 + strength * 0.22, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
  osc.connect(gain).connect(context.destination);
  osc.start(at);
  osc.stop(at + 0.16);
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 0.05);
  const hp = context.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const g2 = context.createGain();
  g2.gain.setValueAtTime(0.05 + strength * 0.08, at);
  g2.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  source.connect(hp).connect(g2).connect(context.destination);
  source.start(at);
};

/** Bóng rung lưới. */
export const netSwish = () => {
  if (!isSoundOn()) return;
  const context = audio();
  if (!context) return;
  const at = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 0.5);
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.setValueAtTime(3200, at);
  band.frequency.exponentialRampToValueAtTime(900, at + 0.45);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.48);
  source.connect(band).connect(gain).connect(context.destination);
  source.start(at);
};
