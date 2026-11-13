/**
 * Đóng gói trạng thái trận để máy chủ gửi cho hai người chơi online (≈20 lần/giây),
 * và áp lại vào bản trận “chỉ để vẽ” ở trình duyệt. Thuần JS, dùng chung cho backend và frontend.
 */
import { possessionShare } from "./sim.js";

const STATES = ["run", "slide", "down", "stumble", "dive", "hold", "celebrate"];
const r2 = (value) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;

/** Những sự kiện cần cho âm thanh và chữ trên màn hình (bỏ bớt cho gọn). */
const KEEP = new Set(["kick", "shot", "goal", "save", "post", "offside", "foul", "card", "penalty", "corner", "freekick", "throw", "goalkick", "kickoff", "halftime", "fulltime", "mentality", "oneTwo", "block", "taker", "wallJump", "switch", "pass", "skill", "tackle", "slide", "dive"]);

export const packMatch = (match, events = [], { stats = false } = {}) => {
  const { ball } = match;
  const sp = match.setPiece;
  const pack = {
    t: r2(match.time),
    c: Math.round(match.clock),
    h: match.half,
    ph: match.phase,
    pt: r2(match.phaseT),
    sc: match.teams.map((team) => team.score),
    dir: match.teams.map((team) => team.dir),
    men: match.teams.map((team) => team.mentality || 0),
    sp: sp ? { ty: sp.type, tm: sp.team, x: r2(sp.x), z: r2(sp.z), tk: sp.takerId, t: r2(sp.t), sec: sp.secondId ?? -1, wj: sp.wallJump ? 1 : 0 } : null,
    b: [r2(ball.x), r2(ball.y), r2(ball.z), r2(ball.vx), r2(ball.vy), r2(ball.vz), ball.owner ?? -1, ball.inGoal || 0, ball.pass?.to ?? -1, ball.pass?.from ?? -1],
    p: match.players.map((p) => [
      r2(p.x), r2(p.z), r2(p.vx), r2(p.vz), r2(p.heading), Math.max(0, STATES.indexOf(p.state)),
      r2(p.anim.kick), p.anim.kickSide, r2(p.anim.tackle), r2(p.anim.header || 0), r2(p.anim.stride), r2(p.stamina), p.sentOff ? 1 : 0,
      p.state === "dive" && p.dive ? [p.dive.side, r2(p.dive.y), r2(p.dive.at - match.time)] : 0,
      p.yellow, p.inWall ? 1 : 0,
    ]),
    ctl: [match.humans?.[0]?.controlledId ?? -1, match.humans?.[1]?.controlledId ?? -1],
    gs: match.goalScorer ?? -1,
    gt: match.goalTeam ?? -1,
    ev: events.filter((event) => KEEP.has(event.type)).map((event) => {
      const copy = { ...event };
      for (const key of Object.keys(copy)) if (typeof copy[key] === "number") copy[key] = r2(copy[key]);
      return copy;
    }),
  };
  if (stats) {
    pack.st = match.teams.map((team) => ({ ...team.stats }));
    pack.pos = possessionShare(match);
    pack.gl = match.scorers.map((goal) => ({ ...goal }));
  }
  return pack;
};

/**
 * Áp gói trạng thái vào bản trận ở trình duyệt. Vị trí được lưu làm “đích”, `smoothView`
 * kéo dần tới đó mỗi khung hình cho mượt; lần đầu (snap) thì đặt thẳng.
 */
export const applyPack = (view, pack, { snap = false } = {}) => {
  view.time = pack.t;
  view.clock = pack.c;
  view.half = pack.h;
  view.phase = pack.ph;
  view.phaseT = pack.pt;
  pack.sc.forEach((score, i) => { view.teams[i].score = score; });
  pack.dir.forEach((dir, i) => { view.teams[i].dir = dir; });
  pack.men.forEach((value, i) => { view.teams[i].mentality = value; });
  view.setPiece = pack.sp ? { type: pack.sp.ty, team: pack.sp.tm, x: pack.sp.x, z: pack.sp.z, takerId: pack.sp.tk, t: pack.sp.t, ready: 0, auto: Infinity, secondId: pack.sp.sec >= 0 ? pack.sp.sec : undefined, wallJump: Boolean(pack.sp.wj) } : null;
  const [x, y, z, vx, vy, vz, owner, inGoal, passTo, passFrom] = pack.b;
  const ball = view.ball;
  ball.net = { x, y, z, at: performanceNow() };
  Object.assign(ball, { vx, vy, vz, owner: owner >= 0 ? owner : null, inGoal });
  ball.pass = passTo >= 0 || passFrom >= 0 ? { to: passTo >= 0 ? passTo : null, from: passFrom >= 0 ? passFrom : passTo, kind: "short", target: { x, z } } : null;
  if (snap) Object.assign(ball, { x, y, z });
  pack.p.forEach((row, index) => {
    const p = view.players[index];
    const [px, pz, pvx, pvz, heading, state, kick, kickSide, tackle, header, stride, stamina, sentOff, dive, yellow, inWall] = row;
    p.net = { x: px, z: pz, heading };
    if (snap || Math.hypot(px - p.x, pz - p.z) > 8) { p.x = px; p.z = pz; p.heading = heading; }
    Object.assign(p, { vx: pvx, vz: pvz, state: STATES[state] || "run", stamina, sentOff: Boolean(sentOff), yellow, inWall: Boolean(inWall) });
    Object.assign(p.anim, { kick, kickSide, tackle, header });
    // Nhịp bước chạy tự chạy ở máy khách; chỉ chỉnh lại khi lệch nhiều.
    if (snap || Math.abs((p.anim.stride || 0) - stride) > 6) p.anim.stride = stride;
    p.dive = dive ? { side: dive[0], y: dive[1], at: view.time + dive[2] } : null;
  });
  pack.ctl.forEach((id, team) => { if (view.humans?.[team] && id >= 0) view.humans[team].controlledId = id; });
  view.goalScorer = pack.gs >= 0 ? pack.gs : null;
  view.goalTeam = pack.gt >= 0 ? pack.gt : null;
  for (const event of pack.ev) view.events.push(event);
  if (pack.st) {
    pack.st.forEach((stats, i) => Object.assign(view.teams[i].stats, stats));
    view.netPossession = pack.pos;
    view.scorers = pack.gl;
  }
};

const performanceNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const angleLerp = (from, to, t) => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
};

/** Kéo vị trí đang vẽ về gói mới nhất; cầu thủ còn được đoán trước theo vận tốc cho đỡ trễ. */
export const smoothView = (view, dt) => {
  const k = 1 - Math.exp(-dt * 16);
  for (const p of view.players) {
    if (!p.net) continue;
    p.net.x += p.vx * dt * 0.5;
    p.net.z += p.vz * dt * 0.5;
    p.x += (p.net.x - p.x) * k;
    p.z += (p.net.z - p.z) * k;
    p.heading = angleLerp(p.heading, p.net.heading, k);
    p.anim.stride += Math.hypot(p.vx, p.vz) * dt * 1.9;
  }
  const ball = view.ball;
  if (ball.net) {
    const age = Math.min(0.12, (performanceNow() - ball.net.at) / 1000);
    const target = { x: ball.net.x + ball.vx * age, y: Math.max(0.11, ball.net.y + ball.vy * age), z: ball.net.z + ball.vz * age };
    const kb = 1 - Math.exp(-dt * 24);
    ball.x += (target.x - ball.x) * kb;
    ball.y += (target.y - ball.y) * kb;
    ball.z += (target.z - ball.z) * kb;
  }
};

/** Kiểm tra và làm sạch phím người chơi gửi lên (máy chủ không tin dữ liệu từ trình duyệt). */
export const cleanInput = (body) => {
  const number = (value) => (Number.isFinite(value) ? Math.max(-1.5, Math.min(1.5, value)) : 0);
  const flag = (value) => value === true;
  return {
    mx: number(body?.mx), mz: number(body?.mz),
    sprint: flag(body?.sprint), shield: flag(body?.shield), contain: flag(body?.contain), press: flag(body?.press),
    barge: flag(body?.barge), holdBall: flag(body?.holdBall), callPress: flag(body?.callPress), pushUp: flag(body?.pushUp),
  };
};

export const ONLINE_ACTIONS = new Set([
  "short", "through", "lob", "lobThrough", "driven", "quick", "lofted", "lowCross", "earlyCross", "oneTwo",
  "shoot", "finesse", "chip", "low", "power", "clear", "knock", "sidestep", "drag", "fakeShot", "fakePass",
  "switch", "switchDir", "switchOrClear", "pressOrClear", "tackle", "slide", "gkRush",
  "gkDrop", "punt", "longThrow", "lowThrow", "cycleTaker", "callSecond", "wallJump", "wallLeft", "wallRight", "keeperGuess", "mentality",
]);

export const cleanAction = (body) => {
  if (!body || !ONLINE_ACTIONS.has(body.action)) return null;
  const opts = body.opts || {};
  const aim = opts.aim && Number.isFinite(opts.aim.x) && Number.isFinite(opts.aim.z) ? { x: Math.max(-1.5, Math.min(1.5, opts.aim.x)), z: Math.max(-1.5, Math.min(1.5, opts.aim.z)) } : undefined;
  return {
    action: body.action,
    opts: {
      ...(Number.isFinite(opts.power) ? { power: Math.max(0, Math.min(1, opts.power)) } : {}),
      ...(aim ? { aim } : {}),
      ...(Number.isInteger(opts.taps) ? { taps: Math.max(1, Math.min(3, opts.taps)) } : {}),
      ...(opts.second === true ? { second: true } : {}),
      ...(opts.delta === 1 || opts.delta === -1 ? { delta: opts.delta } : {}),
    },
  };
};
