import { FOOT, HEAD_X, POCKETS, TABLE } from "./physics.js";

/** Canvas drawing for the pool table. World (0,0) is the felt's top-left corner. */

export const BALL_COLORS = { 1: "#f2c230", 2: "#2b63d9", 3: "#d93a2b", 4: "#7a3fb8", 5: "#f08a24", 6: "#1f9a57", 7: "#8c2f39", 8: "#1b1b1f" };
export const colorOf = (id) => (id === 0 ? "#fbfaf4" : BALL_COLORS[id > 8 ? id - 8 : id]);
export const VIEW = { w: TABLE.w + TABLE.rail * 2, h: TABLE.h + TABLE.rail * 2 };

const roundRect = (ctx, x, y, w, h, radius) => {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const drawTable = (ctx) => {
  const { w, h, rail } = TABLE;
  const wood = ctx.createLinearGradient(0, -rail, 0, h + rail);
  wood.addColorStop(0, "#9a6a40"); wood.addColorStop(0.5, "#7b4f2c"); wood.addColorStop(1, "#5f3b20");
  roundRect(ctx, -rail, -rail, w + rail * 2, h + rail * 2, 30);
  ctx.fillStyle = wood; ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 2; ctx.stroke();

  roundRect(ctx, -16, -16, w + 32, h + 32, 10);
  ctx.fillStyle = "#1d4a36"; ctx.fill();
  const felt = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.62);
  felt.addColorStop(0, "#3a8163"); felt.addColorStop(1, "#27604a");
  ctx.fillStyle = felt; ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(HEAD_X, 0); ctx.lineTo(HEAD_X, h); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.3)";
  [[HEAD_X, h / 2], [FOOT.x, FOOT.y]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });

  ctx.fillStyle = "#f3e7c9";
  for (let i = 1; i < 8; i += 1) {
    if (i === 4) continue;
    [-rail / 2 - 4, h + rail / 2 + 4].forEach((y) => { ctx.beginPath(); ctx.arc((w / 8) * i, y, 3, 0, Math.PI * 2); ctx.fill(); });
  }
  for (let i = 1; i < 4; i += 1) [-rail / 2 - 4, w + rail / 2 + 4].forEach((x) => { ctx.beginPath(); ctx.arc(x, (h / 4) * i, 3, 0, Math.PI * 2); ctx.fill(); });

  POCKETS.forEach((pocket) => {
    ctx.beginPath(); ctx.arc(pocket.x, pocket.y, pocket.r + 5, 0, Math.PI * 2);
    ctx.fillStyle = "#3b2a1c"; ctx.fill();
    ctx.beginPath(); ctx.arc(pocket.x, pocket.y, pocket.r, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0d10"; ctx.fill();
  });
};

export const drawBall = (ctx, id, x, y, radius = TABLE.r) => {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(x + radius * 0.22, y + radius * 0.3, radius, radius * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = id > 8 ? "#fbfaf4" : colorOf(id); ctx.fill();
  if (id > 8) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = colorOf(id); ctx.fillRect(x - radius, y - radius * 0.56, radius * 2, radius * 1.12);
    ctx.restore();
  }
  if (id > 0) {
    ctx.beginPath(); ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "#fbfaf4"; ctx.fill();
    ctx.fillStyle = "#1b1b1f";
    ctx.font = `700 ${radius * (id > 9 ? 0.6 : 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(String(id), x, y + radius * 0.05);
  }
  const shine = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.4, 0, x - radius * 0.35, y - radius * 0.4, radius * 0.9);
  shine.addColorStop(0, "rgba(255,255,255,.55)"); shine.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = shine; ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.restore();
};

const drawGuide = (ctx, cue, preview) => {
  const { r } = TABLE;
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(cue.x, cue.y); ctx.lineTo(preview.ghost.x, preview.ghost.y); ctx.stroke();
  ctx.beginPath(); ctx.arc(preview.ghost.x, preview.ghost.y, r, 0, Math.PI * 2); ctx.stroke();
  if (preview.hitId != null) {
    const push = 30 + 90 * Math.abs(preview.fullness);
    ctx.strokeStyle = "rgba(255,226,138,.95)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(preview.target.x, preview.target.y); ctx.lineTo(preview.target.x + preview.objectDir.x * push, preview.target.y + preview.objectDir.y * push); ctx.stroke();
    const glance = Math.hypot(preview.cueDir.x, preview.cueDir.y);
    if (glance > 0.05) {
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(preview.ghost.x, preview.ghost.y); ctx.lineTo(preview.ghost.x + (preview.cueDir.x / glance) * 46 * glance, preview.ghost.y + (preview.cueDir.y / glance) * 46 * glance); ctx.stroke();
    }
  } else if (preview.bounce) {
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.setLineDash([5, 6]);
    ctx.beginPath(); ctx.moveTo(preview.ghost.x, preview.ghost.y); ctx.lineTo(preview.ghost.x + preview.bounce.x * 70, preview.ghost.y + preview.bounce.y * 70); ctx.stroke();
  }
  ctx.restore();
};

const drawCueStick = (ctx, cue, angle, power) => {
  const start = TABLE.r + 5 + power * 95;
  const length = 430;
  ctx.save();
  ctx.translate(cue.x, cue.y);
  ctx.rotate(angle + Math.PI);
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.moveTo(start, 2); ctx.lineTo(start + length, 0); ctx.lineTo(start + length, 14); ctx.lineTo(start, 9); ctx.fill();
  const shaft = ctx.createLinearGradient(start, 0, start + length, 0);
  shaft.addColorStop(0, "#f0d9a8"); shaft.addColorStop(0.58, "#d9b775"); shaft.addColorStop(0.6, "#3a2a20"); shaft.addColorStop(1, "#1f1612");
  ctx.fillStyle = shaft;
  ctx.beginPath(); ctx.moveTo(start, -2.6); ctx.lineTo(start + length, -5.2); ctx.lineTo(start + length, 5.2); ctx.lineTo(start, 2.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#fbfaf4"; ctx.fillRect(start + 5, -2.7, 9, 5.4);
  ctx.fillStyle = "#3f8fd0"; ctx.fillRect(start, -2.6, 5, 5.2);
  ctx.fillStyle = "#c9a227"; ctx.fillRect(start + length * 0.6 - 3, -4.4, 4, 8.8);
  ctx.restore();
};

/**
 * Draws one frame. `view` = { balls, sinking: [{id,x,y,t}], angle, power, showAim, preview, inHand, inHandValid, time }.
 */
export const drawScene = (ctx, pixelsPerUnit, view) => {
  ctx.setTransform(pixelsPerUnit, 0, 0, pixelsPerUnit, TABLE.rail * pixelsPerUnit, TABLE.rail * pixelsPerUnit);
  ctx.clearRect(-TABLE.rail, -TABLE.rail, VIEW.w, VIEW.h);
  drawTable(ctx);
  view.sinking.forEach((item) => drawBall(ctx, item.id, item.x, item.y, TABLE.r * Math.max(0.15, item.t)));
  const cue = view.balls[0];
  if (view.showAim && view.preview && !cue.potted) drawGuide(ctx, cue, view.preview);
  view.balls.forEach((ball) => { if (!ball.potted) drawBall(ctx, ball.id, ball.x, ball.y); });
  if (view.inHand && !cue.potted) {
    ctx.save();
    ctx.strokeStyle = view.inHandValid ? "rgba(255,226,138,.95)" : "rgba(255,120,120,.95)";
    ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.lineDashOffset = -view.time * 14;
    ctx.beginPath(); ctx.arc(cue.x, cue.y, TABLE.r * 2 + Math.sin(view.time * 4) * 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  if (view.showAim && !cue.potted) drawCueStick(ctx, cue, view.angle, view.power);
};
