/**
 * Đóng gói trạng thái trận bóng rổ để máy chủ gửi cho hai người chơi online (≈20 lần/giây),
 * và áp lại vào bản trận “chỉ để vẽ” ở trình duyệt. Thuần JS, dùng chung cho backend và frontend.
 */
import { flightPoint } from "./actions.js";
import { COURT } from "./constants.js";

const r2 = (value) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const STATES = ["run", "fall", "celebrate"];
const ACTS = [null, "jumper", "layup", "dunk"];
const FLIGHTS = [null, "pass", "shot", "blocked", "ft", "toss", "tip"];

/** Sự kiện cần cho âm thanh và chữ trên màn hình. */
const KEEP = new Set(["tip", "pass", "shot", "score", "rim", "board", "block", "steal", "intercept", "turnover", "foul", "ft", "ftShot", "buzzer", "period", "halftime", "fulltime", "shotClock", "out", "ankle", "alleyOop", "screen", "double", "switch", "airball", "bounce", "crossover", "gather"]);

const statLine = (s) => [s.pts, s.fgm, s.fga, s.tpm, s.tpa, s.ftm, s.fta, s.reb, s.oreb, s.ast, s.stl, s.blk, s.to, s.pf];
const STAT_KEYS = ["pts", "fgm", "fga", "tpm", "tpa", "ftm", "fta", "reb", "oreb", "ast", "stl", "blk", "to", "pf"];
const readStats = (line) => Object.fromEntries(STAT_KEYS.map((key, i) => [key, line[i] || 0]));

export const packMatch = (match, events = [], { stats = false } = {}) => {
  const b = match.ball;
  const f = b.flight;
  const pack = {
    t: r2(match.time),
    ph: match.phase,
    pt: r2(match.phaseT),
    q: match.quarter,
    c: Math.round(match.clock * 10),
    sc: Math.round(match.shotClock * 10),
    s: match.teams.map((team) => team.score),
    dir: match.teams.map((team) => team.dir),
    tf: match.teams.map((team) => team.fouls),
    pos: match.possession ?? -1,
    bk: match.breakKind,
    b: [r2(b.x), r2(b.y), r2(b.z), r2(b.vx), r2(b.vy), r2(b.vz), b.owner ?? -1, b.dead ? 1 : 0],
    fl: f ? [FLIGHTS.indexOf(f.kind), r2(f.t), r2(f.T), r2(f.sx), r2(f.sy), r2(f.sz), r2(f.ex), r2(f.ey), r2(f.ez), r2(f.lift), f.bounce ? 1 : 0, f.catcher ?? -1, f.from ?? -1] : null,
    p: match.players.map((p) => [
      r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.heading), r2(p.y),
      Math.max(0, STATES.indexOf(p.state)), p.act?.type === "shot" ? Math.max(0, ACTS.indexOf(p.act.kind)) : 0, r2(p.act?.t || 0),
      r2(p.anim.pass), r2(p.anim.reach), r2(p.anim.cross), r2(p.anim.shoot || 0), r2(p.stamina), p.screening ? 1 : 0, r2(p.ftShot || 0),
    ]),
    ctl: [match.humans?.[0]?.controlledId ?? -1, match.humans?.[1]?.controlledId ?? -1],
    ib: match.inbound ? [match.inbound.team, r2(match.inbound.x), r2(match.inbound.z), match.inbound.taker, match.inbound.arrived ? 1 : 0] : null,
    ft: match.ft ? [match.ft.team, match.ft.shooter, match.ft.total, match.ft.index, r2(match.ft.ready - match.phaseT), match.ft.flying ? 1 : 0, match.ft.holdAt !== null ? 1 : 0] : null,
    ev: events.filter((event) => KEEP.has(event.type)).map((event) => {
      const copy = { ...event };
      for (const key of Object.keys(copy)) if (typeof copy[key] === "number") copy[key] = r2(copy[key]);
      return copy;
    }),
  };
  if (stats) {
    pack.st = match.teams.map((team) => statLine(team.stats));
    pack.ps = match.players.map((p) => statLine(p.stats));
  }
  return pack;
};

const performanceNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Áp gói trạng thái vào bản trận ở trình duyệt. Vị trí là “đích”, smoothView kéo dần tới đó; lần đầu (snap) đặt thẳng. */
export const applyPack = (view, pack, { snap = false } = {}) => {
  view.time = pack.t;
  view.phase = pack.ph;
  view.phaseT = pack.pt;
  view.quarter = pack.q;
  view.clock = pack.c / 10;
  view.shotClock = pack.sc / 10;
  pack.s.forEach((score, i) => { view.teams[i].score = score; });
  pack.dir.forEach((dir, i) => { view.teams[i].dir = dir; });
  pack.tf.forEach((fouls, i) => { view.teams[i].fouls = fouls; });
  view.possession = pack.pos >= 0 ? pack.pos : null;
  view.breakKind = pack.bk;
  const ball = view.ball;
  const [x, y, z, vx, vy, vz, owner, dead] = pack.b;
  ball.net = { x, y, z, vx, vy, vz, at: performanceNow() };
  ball.owner = owner >= 0 ? owner : null;
  ball.dead = Boolean(dead);
  if (pack.fl) {
    const [kind, t, T, sx, sy, sz, ex, ey, ez, lift, bounce, catcher, from] = pack.fl;
    const same = ball.flight && ball.flight.kind === FLIGHTS[kind] && Math.abs(ball.flight.ex - ex) < 0.01 && Math.abs(ball.flight.ez - ez) < 0.01 && Math.abs(ball.flight.sx - sx) < 0.01;
    if (!same) ball.flight = { kind: FLIGHTS[kind], t, T, sx, sy, sz, ex, ey, ez, lift, bounce: Boolean(bounce), catcher: catcher >= 0 ? catcher : null, from: from >= 0 ? from : null };
    // Đồng hồ đường bay chạy ở máy khách; chỉ chỉnh khi lệch nhiều.
    else if (Math.abs(ball.flight.t - t) > 0.12) ball.flight.t = t;
  } else ball.flight = null;
  if (snap) Object.assign(ball, { x, y, z, vx, vy, vz });
  pack.p.forEach((row, index) => {
    const p = view.players[index];
    const [px, pz, pvx, pvz, heading, py, state, actKind, actT, pass, reach, cross, shoot, stamina, screening, ftShot] = row;
    p.net = { x: px, z: pz, heading, y: py };
    if (snap || Math.hypot(px - p.x, pz - p.z) > 6) { p.x = px; p.z = pz; p.heading = heading; p.y = py; }
    Object.assign(p, { vx: pvx, vz: pvz, state: STATES[state] || "run", stamina, screening: Boolean(screening), ftShot });
    p.act = actKind ? { type: "shot", kind: ACTS[actKind], t: actT } : null;
    Object.assign(p.anim, { pass, reach, cross, shoot });
  });
  if (view.humans) pack.ctl.forEach((id, team) => { if (view.humans[team] && id >= 0) view.humans[team].controlledId = id; });
  view.inbound = pack.ib ? { team: pack.ib[0], x: pack.ib[1], z: pack.ib[2], taker: pack.ib[3], arrived: Boolean(pack.ib[4]) } : null;
  view.ft = pack.ft ? { team: pack.ft[0], shooter: pack.ft[1], total: pack.ft[2], index: pack.ft[3], ready: view.phaseT + pack.ft[4], flying: Boolean(pack.ft[5]), holdAt: pack.ft[6] ? view.time : null } : null;
  for (const event of pack.ev) view.events.push(event);
  if (pack.st) {
    pack.st.forEach((line, i) => { view.teams[i].stats = readStats(line); });
    pack.ps?.forEach((line, i) => { view.players[i].stats = readStats(line); });
  }
};

/** Mỗi khung hình: kéo cầu thủ và bóng về vị trí máy chủ gửi (nội suy cho mượt). */
export const smoothView = (view, dt) => {
  const k = 1 - Math.exp(-dt * 12);
  for (const p of view.players) {
    const net = p.net;
    if (!net) continue;
    p.x += (net.x + p.vx * 0.05 - p.x) * k;
    p.z += (net.z + p.vz * 0.05 - p.z) * k;
    let dh = net.heading - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += dh * k;
    p.y += (net.y - p.y) * Math.min(1, k * 1.5);
    p.anim.stride += Math.hypot(p.vx, p.vz) * dt * 1.7;
    if (p.act) p.act.t += dt;
  }
  const ball = view.ball;
  if (ball.owner !== null) {
    const o = view.players[ball.owner];
    const f = { x: Math.sin(o.heading), z: Math.cos(o.heading) };
    const r = { x: f.z, z: -f.x };
    if (o.act || view.phase === "freethrow") Object.assign(ball, { x: o.x + f.x * 0.22, y: o.height + 0.25 + o.y - (view.phase === "freethrow" ? 0.75 : 0), z: o.z + f.z * 0.22 });
    else if (view.phase === "inbound") Object.assign(ball, { x: o.x + f.x * 0.3, y: 1.25, z: o.z + f.z * 0.3 });
    else {
      const speed = Math.hypot(o.vx, o.vz);
      o.anim.dribble += dt * (5.5 + speed * 0.9);
      const hand = o.anim.cross > 0 ? -1 : 1;
      Object.assign(ball, { x: o.x + f.x * (0.3 + speed * 0.03) + r.x * 0.24 * hand, y: 0.14 + Math.abs(Math.sin(o.anim.dribble)) * 0.8, z: o.z + f.z * (0.3 + speed * 0.03) + r.z * 0.24 * hand });
    }
    return;
  }
  if (ball.flight) {
    const fl = ball.flight;
    fl.t = Math.min(fl.T, fl.t + dt);
    const u = fl.T > 0 ? fl.t / fl.T : 1;
    const at = flightPoint(fl, u);
    if (fl.bounce) at.y = u < 0.55 ? 1.25 * (1 - u / 0.55) + COURT.ballR : COURT.ballR + (1.25 - COURT.ballR) * ((u - 0.55) / 0.45);
    Object.assign(ball, at);
    return;
  }
  const net = ball.net;
  if (!net) return;
  // Bóng tự do: ngoại suy theo vận tốc + trọng lực từ gói gần nhất, rồi kéo về.
  const age = Math.min(0.2, (performanceNow() - net.at) / 1000);
  const tx = net.x + net.vx * age;
  const tz = net.z + net.vz * age;
  const ty = Math.max(COURT.ballR, net.y + net.vy * age - 4.9 * age * age);
  ball.x += (tx - ball.x) * Math.min(1, k * 1.6);
  ball.y += (ty - ball.y) * Math.min(1, k * 1.6);
  ball.z += (tz - ball.z) * Math.min(1, k * 1.6);
};

export const cleanInput = (body = {}) => {
  const num = (value) => (Number.isFinite(Number(value)) ? Math.max(-1, Math.min(1, Number(value))) : 0);
  return { mx: num(body.mx), mz: num(body.mz), sprint: body.sprint === true, guard: body.guard === true };
};

export const ONLINE_ACTIONS = new Set(["shoot", "shootRelease", "pass", "lob", "bounce", "crossover", "screen", "steal", "jump", "double", "switch"]);

export const cleanAction = (body = {}) => {
  if (typeof body.action !== "string" || !ONLINE_ACTIONS.has(body.action)) return null;
  const raw = body.opts && typeof body.opts === "object" && !Array.isArray(body.opts) ? body.opts : {};
  const opts = {};
  if (raw.dir && typeof raw.dir === "object" && Number.isFinite(Number(raw.dir.x)) && Number.isFinite(Number(raw.dir.z))) {
    opts.dir = { x: Math.max(-1, Math.min(1, Number(raw.dir.x))), z: Math.max(-1, Math.min(1, Number(raw.dir.z))) };
  }
  if (Number.isFinite(Number(raw.hold)) && raw.hold !== null) opts.hold = Math.max(0, Math.min(2, Number(raw.hold)));
  return { action: body.action, opts };
};

export const inputState = (input) => ({
  mx: Math.round(input.mx * 100) / 100,
  mz: Math.round(input.mz * 100) / 100,
  sprint: Boolean(input.sprint),
  guard: Boolean(input.guard),
});
