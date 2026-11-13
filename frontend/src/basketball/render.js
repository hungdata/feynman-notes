/**
 * Nhà thi đấu bóng rổ 3D: sàn gỗ kẻ vạch đúng luật FIBA (28 × 15 m), hai cột rổ có bảng, vành và lưới,
 * khán đài kín người, 10 cầu thủ có số áo và động tác rê bóng – ném – úp rổ – nhảy chắn – cướp bóng,
 * camera truyền hình dọc biên bám theo bóng. Dựng bằng hình khối, không tải tệp ngoài.
 */
import * as THREE from "three";
import { COURT } from "./constants.js";

const FONT = "'Lexend Variable', 'Lexend', system-ui, sans-serif";
const APRON = 2.6;

const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/* ---------- mặt sàn ---------- */

const courtTexture = (kits, maxAnisotropy) => {
  const L = COURT.length + APRON * 2;
  const W = COURT.width + APRON * 2;
  const width = 2800;
  const height = Math.round((width * W) / L);
  const s = width / L;
  const px = (x) => width / 2 + x * s;
  const pz = (z) => height / 2 + z * s;
  const texture = canvasTexture(width, height, (ctx) => {
    // Ván gỗ: dải sáng tối xen kẽ theo chiều dọc sân.
    ctx.fillStyle = "#c98d4f";
    ctx.fillRect(0, 0, width, height);
    const plank = 0.12 * s;
    for (let y = 0, i = 0; y < height; y += plank, i += 1) {
      const tone = 196 + ((i * 37) % 23) - 11;
      ctx.fillStyle = `rgb(${tone + 18}, ${Math.round(tone * 0.7)}, ${Math.round(tone * 0.4)})`;
      ctx.fillRect(0, y, width, plank - 1);
      ctx.fillStyle = "rgba(90, 50, 20, 0.12)";
      for (let x = ((i * 173) % 400); x < width; x += 420 + ((i * 59) % 140)) ctx.fillRect(x, y, 2, plank);
    }
    // Viền ngoài sân sơn sẫm.
    ctx.fillStyle = "#2a3354";
    ctx.fillRect(0, 0, px(-COURT.halfL), height);
    ctx.fillRect(px(COURT.halfL), 0, width - px(COURT.halfL), height);
    ctx.fillRect(0, 0, width, pz(-COURT.halfW));
    ctx.fillRect(0, pz(COURT.halfW), width, height - pz(COURT.halfW));
    const line = (draw) => { ctx.beginPath(); draw(); ctx.stroke(); };
    // Khu vực 3 giây và vòng giữa sân sơn màu hai đội.
    for (const side of [-1, 1]) {
      const kit = kits[side < 0 ? 0 : 1];
      ctx.fillStyle = kit.shirt;
      ctx.globalAlpha = 0.82;
      const x0 = side < 0 ? px(-COURT.halfL) : px(COURT.halfL - COURT.keyDepth);
      ctx.fillRect(x0, pz(-COURT.keyHalf), COURT.keyDepth * s, COURT.keyHalf * 2 * s);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#2a3354";
    ctx.beginPath(); ctx.arc(px(0), pz(0), COURT.circle * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffd23f";
    ctx.font = `700 ${Math.round(0.62 * s)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("FEYNMAN", px(0), pz(0) - 0.25 * s);
    ctx.font = `600 ${Math.round(0.32 * s)}px ${FONT}`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText("HOOPS", px(0), pz(0) + 0.42 * s);
    // Vạch trắng 5 cm.
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = Math.max(3, 0.05 * s);
    ctx.strokeRect(px(-COURT.halfL), pz(-COURT.halfW), COURT.length * s, COURT.width * s);
    line(() => { ctx.moveTo(px(0), pz(-COURT.halfW)); ctx.lineTo(px(0), pz(COURT.halfW)); });
    line(() => ctx.arc(px(0), pz(0), COURT.circle * s, 0, Math.PI * 2));
    for (const side of [-1, 1]) {
      const hoopX = side * COURT.hoopX;
      const base = side * COURT.halfL;
      const ft = side * (COURT.halfL - COURT.keyDepth);
      ctx.strokeRect(Math.min(px(base), px(ft)), pz(-COURT.keyHalf), COURT.keyDepth * s, COURT.keyHalf * 2 * s);
      // Vòng ném phạt.
      line(() => ctx.arc(px(ft), pz(0), COURT.circle * s, side < 0 ? -Math.PI / 2 : Math.PI / 2, side < 0 ? Math.PI / 2 : Math.PI * 1.5));
      ctx.setLineDash([0.3 * s, 0.25 * s]);
      line(() => ctx.arc(px(ft), pz(0), COURT.circle * s, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2));
      ctx.setLineDash([]);
      // Vạch 3 điểm: hai đoạn thẳng ở góc + cung tròn.
      const reach = Math.sqrt(COURT.three ** 2 - COURT.cornerZ ** 2);
      const join = hoopX - side * reach;
      line(() => { ctx.moveTo(px(base), pz(-COURT.cornerZ)); ctx.lineTo(px(join), pz(-COURT.cornerZ)); });
      line(() => { ctx.moveTo(px(base), pz(COURT.cornerZ)); ctx.lineTo(px(join), pz(COURT.cornerZ)); });
      const a = Math.asin(COURT.cornerZ / COURT.three);
      line(() => (side > 0 ? ctx.arc(px(hoopX), pz(0), COURT.three * s, Math.PI - a, Math.PI + a) : ctx.arc(px(hoopX), pz(0), COURT.three * s, -a, a)));
      // Vòng cấm đứng chặn (no-charge).
      line(() => (side > 0 ? ctx.arc(px(hoopX), pz(0), COURT.restricted * s, Math.PI / 2, Math.PI * 1.5) : ctx.arc(px(hoopX), pz(0), COURT.restricted * s, -Math.PI / 2, Math.PI / 2)));
      // Ô đứng ném phạt dọc hai bên khu 3 giây.
      for (const d of [1.75, 2.85, 3.95]) {
        for (const zSide of [-1, 1]) line(() => { ctx.moveTo(px(side * (COURT.halfL - d)), pz(zSide * COURT.keyHalf)); ctx.lineTo(px(side * (COURT.halfL - d)), pz(zSide * (COURT.keyHalf + 0.1))); });
      }
    }
  });
  texture.anisotropy = maxAnisotropy;
  return { texture, L, W };
};

const ballTexture = () => canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = "#e06a1b";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "120, 40, 0" : "255, 170, 90"}, 0.25)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  ctx.strokeStyle = "#1a0f08";
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  for (const x of [w / 4, (w * 3) / 4]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w * 0.17, h * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, h / 2, w * 0.17, h * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w, h / 2, w * 0.17, h * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
});

const labelTexture = (text, color) => canvasTexture(256, 64, (ctx, w, h) => {
  ctx.fillStyle = "rgba(12, 16, 32, 0.78)";
  const r = 22;
  ctx.beginPath(); ctx.roundRect?.(8, 8, w - 16, h - 16, r); if (!ctx.roundRect) ctx.rect(8, 8, w - 16, h - 16); ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `600 28px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);
});

const numberTexture = (number, color, shirt) => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = `800 78px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), w / 2, h / 2 + 4);
});

/* ---------- cầu thủ ---------- */

const SKINS = ["#f1c8a4", "#e2b48c", "#c98f62", "#f5d3b5", "#a8714a", "#ebbf95", "#7d5236"];
const HAIRS = ["#1b1410", "#2f2018", "#4a3020", "#0f0f10", "#6b4a2a"];

const makePlayer = (shared, kit, player) => {
  const skin = shared.mat(SKINS[(player.id * 5 + 2) % SKINS.length]);
  const hair = shared.mat(HAIRS[(player.id * 3) % HAIRS.length]);
  const jersey = shared.mat(kit.shirt, 0.7);
  const trim = shared.mat(kit.trim, 0.7);
  const shorts = shared.mat(kit.shorts, 0.72);
  const sock = shared.mat("#f4f5f7", 0.8);
  const shoe = shared.mat(player.team ? "#1d2027" : "#f4f5f7", 0.45);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.94;
  body.add(hips);
  const mesh = (geometry, material, x = 0, y = 0, z = 0, parent = hips) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // Quần đùi dài, áo ba lỗ có viền.
  mesh(shared.geo("bshorts", () => new THREE.BoxGeometry(0.4, 0.3, 0.26)), shorts, 0, -0.02, 0);
  const torso = mesh(shared.geo("btorso", () => new THREE.CapsuleGeometry(0.17, 0.32, 4, 10)), jersey, 0, 0.37, 0);
  torso.scale.set(1.2, 1, 0.72);
  mesh(shared.geo("bcollar", () => new THREE.TorusGeometry(0.1, 0.018, 6, 14)), trim, 0, 0.6, 0).rotation.x = Math.PI / 2;
  for (const face of [1, -1]) {
    const number = new THREE.Mesh(shared.geo("bnumber", () => new THREE.PlaneGeometry(0.24, 0.24)), new THREE.MeshStandardMaterial({ map: numberTexture(player.number, kit.number, kit.shirt), roughness: 0.85 }));
    number.position.set(0, 0.38, face * 0.128);
    if (face < 0) number.rotation.y = Math.PI;
    hips.add(number);
  }
  mesh(shared.geo("bneck", () => new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8)), skin, 0, 0.66, 0);
  const head = mesh(shared.geo("bhead", () => new THREE.SphereGeometry(0.115, 14, 12)), skin, 0, 0.79, 0.01);
  const cap = new THREE.Mesh(shared.geo("bhair", () => new THREE.SphereGeometry(0.121, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), hair);
  cap.position.set(0, 0.015, -0.01);
  cap.rotation.x = -0.2;
  head.add(cap);
  const limb = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.25, 0.53, 0);
    hips.add(shoulder);
    mesh(shared.geo("bupper", () => new THREE.CylinderGeometry(0.05, 0.045, 0.3, 8)), skin, 0, -0.15, 0, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    mesh(shared.geo("bfore", () => new THREE.CylinderGeometry(0.042, 0.035, 0.27, 8)), skin, 0, -0.13, 0, elbow);
    mesh(shared.geo("bhand", () => new THREE.SphereGeometry(0.048, 8, 6)), skin, 0, -0.29, 0, elbow);
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.08, 0);
    hips.add(hip);
    mesh(shared.geo("bleg", () => new THREE.CylinderGeometry(0.095, 0.09, 0.16, 9)), shorts, 0, -0.06, 0, hip);
    mesh(shared.geo("bthigh", () => new THREE.CylinderGeometry(0.075, 0.062, 0.4, 9)), skin, 0, -0.22, 0, hip);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    mesh(shared.geo("bshin", () => new THREE.CylinderGeometry(0.058, 0.046, 0.26, 9)), skin, 0, -0.12, 0, knee);
    mesh(shared.geo("bsock", () => new THREE.CylinderGeometry(0.05, 0.048, 0.16, 9)), sock, 0, -0.32, 0, knee);
    mesh(shared.geo("bshoe", () => new THREE.BoxGeometry(0.11, 0.09, 0.27)), shoe, 0, -0.45, 0.05, knee);
    return { shoulder, elbow, hip, knee };
  };
  const left = limb(-1);
  const right = limb(1);
  root.userData.parts = { body, hips, head, left, right };
  root.scale.setScalar(player.height / 1.86);
  return root;
};

const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

/** Đặt tư thế theo trạng thái trong mô phỏng. */
const pose = (figure, player, match, dt) => {
  const { body, head, left, right } = figure.userData.parts;
  const ball = match.ball;
  const speed = Math.hypot(player.vx, player.vz);
  const amount = Math.min(1, speed / 6.5);
  const phase = player.anim.stride * 2.4;
  const hasBall = ball.owner === player.id;
  const target = {
    lean: 0.06 + amount * 0.14, roll: 0, lift: Math.abs(Math.sin(phase)) * 0.05 * amount,
    hipL: -Math.sin(phase) * 0.8 * amount, hipR: Math.sin(phase) * 0.8 * amount,
    kneeL: 0.15 + Math.max(0, Math.cos(phase)) * 1.1 * amount, kneeR: 0.15 + Math.max(0, -Math.cos(phase)) * 1.1 * amount,
    armL: Math.sin(phase) * 0.7 * amount, armR: -Math.sin(phase) * 0.7 * amount,
    armLz: 0.14, armRz: -0.14, elbowL: -0.35 - amount * 0.6, elbowR: -0.35 - amount * 0.6, headX: 0, crouch: 0,
  };
  const carrier = ball.owner !== null ? match.players[ball.owner] : null;
  // Thế phòng ngự: hạ trọng tâm, dang tay khi kèm người cầm bóng.
  if (carrier && carrier.team !== player.team && Math.hypot(carrier.x - player.x, carrier.z - player.z) < 2.2) {
    target.crouch = 0.12; target.kneeL += 0.35; target.kneeR += 0.35; target.hipL -= 0.25; target.hipR -= 0.25;
    target.armLz = 0.9; target.armRz = -0.9; target.armL = -0.5; target.armR = -0.5; target.elbowL = -0.3; target.elbowR = -0.3;
  }
  if (hasBall && !player.act && match.phase !== "freethrow" && match.phase !== "inbound") {
    // Rê bóng tay phải (hoặc tay trái khi vừa đảo bóng).
    const dribble = Math.abs(Math.sin(player.anim.dribble));
    const crossing = player.anim.cross > 0;
    if (crossing) { target.armL = -0.5 - (1 - dribble) * 0.4; target.elbowL = -0.9; target.armLz = 0.25; }
    else { target.armR = -0.5 - (1 - dribble) * 0.4; target.elbowR = -0.9; target.armRz = -0.25; }
    target.lean += 0.08; target.crouch = 0.05;
  }
  if (hasBall && (match.phase === "inbound" || match.phase === "freethrow") && !player.act) {
    target.armL = -1.2; target.armR = -1.2; target.elbowL = -1.0; target.elbowR = -1.0; target.armLz = 0.35; target.armRz = -0.35;
  }
  if (player.act?.type === "shot") {
    const kind = player.act.kind;
    if (kind === "jumper") {
      target.armL = -2.7; target.armR = -2.9; target.elbowL = -1.4; target.elbowR = -1.3; target.armLz = 0.25; target.armRz = -0.1;
      target.lean = -0.04; target.kneeL = 0.2; target.kneeR = 0.2;
    } else {
      target.armR = -3.0; target.elbowR = -0.2; target.armL = -0.9; target.armLz = 0.4;
      target.hipL = -1.2; target.kneeL = 1.5; target.hipR = 0.1; target.kneeR = 0.2; target.lean = -0.06;
      if (kind === "dunk") { target.armL = -2.8; target.elbowL = -0.3; }
    }
  } else if (player.anim.shoot > 0) {
    // Vừa nhả bóng: tay vẫn giơ (follow-through).
    target.armL = -2.8; target.armR = -3.0; target.elbowL = -0.4; target.elbowR = -0.15; target.armLz = 0.2; target.armRz = -0.05;
  }
  if (player.ftShot > 0) { target.armL = -2.7; target.armR = -3.0; target.elbowL = -0.4; target.elbowR = -0.15; }
  if (player.anim.pass > 0) { target.armL = -1.4; target.armR = -1.4; target.elbowL = -0.1; target.elbowR = -0.1; target.armLz = 0.2; target.armRz = -0.2; }
  if (player.anim.reach > 0) { target.armR = -1.1; target.elbowR = -0.05; target.armRz = 0.25; target.lean = 0.35; }
  if (player.y > 0.05 && !player.act && !hasBall) { target.armL = -2.9; target.armR = -2.9; target.elbowL = -0.1; target.elbowR = -0.1; target.armLz = 0.15; target.armRz = -0.15; target.kneeL = 0.5; target.kneeR = 0.5; }
  if (player.screening) { target.armL = -0.6; target.armR = -0.6; target.elbowL = -1.9; target.elbowR = -1.9; target.armLz = -0.3; target.armRz = 0.3; target.crouch = 0.08; }
  if (player.state === "fall") { target.lean = -1.35; target.lift = -0.72; target.hipL = -0.6; target.hipR = -0.3; target.kneeL = 0.9; target.kneeR = 0.5; target.armLz = 1.2; target.armRz = -1.2; }
  else if (player.state === "celebrate") {
    const hop = Math.abs(Math.sin(match.time * 7 + player.id));
    target.armL = -2.7; target.armR = -2.7; target.armLz = 0.5; target.armRz = -0.5; target.elbowL = -0.2; target.elbowR = -0.2;
    if (speed < 1.2) target.lift = hop * 0.18;
  }
  const rate = 16;
  body.rotation.x = smooth(body.rotation.x, target.lean, rate, dt);
  body.rotation.z = smooth(body.rotation.z, target.roll, rate, dt);
  body.position.y = smooth(body.position.y, target.lift - target.crouch + player.y / figure.scale.y, rate * 1.6, dt);
  left.hip.rotation.x = smooth(left.hip.rotation.x, target.hipL, rate * 1.4, dt);
  right.hip.rotation.x = smooth(right.hip.rotation.x, target.hipR, rate * 1.4, dt);
  left.knee.rotation.x = smooth(left.knee.rotation.x, target.kneeL, rate * 1.4, dt);
  right.knee.rotation.x = smooth(right.knee.rotation.x, target.kneeR, rate * 1.4, dt);
  left.shoulder.rotation.x = smooth(left.shoulder.rotation.x, target.armL, rate, dt);
  right.shoulder.rotation.x = smooth(right.shoulder.rotation.x, target.armR, rate, dt);
  left.shoulder.rotation.z = smooth(left.shoulder.rotation.z, -target.armLz, rate, dt);
  right.shoulder.rotation.z = smooth(right.shoulder.rotation.z, -target.armRz, rate, dt);
  left.elbow.rotation.x = smooth(left.elbow.rotation.x, target.elbowL, rate, dt);
  right.elbow.rotation.x = smooth(right.elbow.rotation.x, target.elbowR, rate, dt);
  head.rotation.x = smooth(head.rotation.x, target.headX, rate, dt);
};

/* ---------- cột rổ ---------- */

const buildHoop = (shared, side) => {
  const group = new THREE.Group();
  const s = side;
  const pad = shared.mat("#1f2a52", 0.7);
  const steel = shared.mat("#9aa3b5", 0.4);
  // Chân đế bọc đệm đặt sau đường biên ngang, tay đòn vươn ra đỡ bảng.
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.6), pad);
  base.position.set(s * (COURT.halfL + 1.6), 0.55, 0);
  base.castShadow = true;
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), pad);
  post.position.set(s * (COURT.halfL + 1.3), 2.5, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(COURT.halfL + 1.3 - COURT.boardX, 0.18, 0.18), steel);
  arm.position.set(s * ((COURT.halfL + 1.3 + COURT.boardX) / 2), 3.35, 0);
  arm.rotation.z = s * 0.06;
  const boardTex = canvasTexture(360, 210, (ctx, w, h) => {
    ctx.fillStyle = "rgba(255,255,255,0.32)";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.lineWidth = 8;
    ctx.strokeRect(w / 2 - 59 * 0.5 * 2, h - 45 * 2 - 40, 59 * 2, 45 * 2);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.04, COURT.boardTop - COURT.boardBottom, COURT.boardHalf * 2), [
    new THREE.MeshStandardMaterial({ map: boardTex, transparent: true, roughness: 0.15 }),
    new THREE.MeshStandardMaterial({ map: boardTex, transparent: true, roughness: 0.15 }),
    shared.mat("#e8edf5"), shared.mat("#e8edf5"), shared.mat("#e8edf5"), shared.mat("#e8edf5"),
  ]);
  board.position.set(s * COURT.boardX, (COURT.boardTop + COURT.boardBottom) / 2, 0);
  board.rotation.y = s > 0 ? Math.PI : 0;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(COURT.rimR, 0.012, 8, 28), shared.mat("#ff5a1f", 0.4));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(s * COURT.hoopX, COURT.rimY, 0);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(COURT.boardX - COURT.hoopX - COURT.rimR + 0.02, 0.03, 0.12), shared.mat("#ff5a1f", 0.4));
  bracket.position.set(s * (COURT.boardX - (COURT.boardX - COURT.hoopX - COURT.rimR) / 2), COURT.rimY, 0);
  // Lưới: các sợi chéo nối vành với vòng nhỏ phía dưới.
  const points = [];
  const n = 12;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1.5) / n) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a0) * COURT.rimR, 0, Math.sin(a0) * COURT.rimR), new THREE.Vector3(Math.cos(a1) * 0.14, -0.42, Math.sin(a1) * 0.14));
    points.push(new THREE.Vector3(Math.cos(a1) * COURT.rimR, 0, Math.sin(a1) * COURT.rimR), new THREE.Vector3(Math.cos(a0) * 0.14, -0.42, Math.sin(a0) * 0.14));
  }
  const net = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 }));
  net.position.set(s * COURT.hoopX, COURT.rimY, 0);
  group.add(base, post, arm, board, rim, bracket, net);
  group.userData.net = net;
  return group;
};

/* ---------- khán đài ---------- */

const buildStands = (scene, shared) => {
  const seat = shared.mat("#2b3150");
  const rows = 9;
  const step = { rise: 0.48, run: 0.85 };
  const stands = [
    { length: 36, x: 0, z: -(COURT.halfW + APRON + 2.4), rot: 0 },
    { length: 36, x: 0, z: COURT.halfW + APRON + 2.4, rot: Math.PI },
    { length: 22, x: COURT.halfL + APRON + 4.2, z: 0, rot: -Math.PI / 2 },
    { length: 22, x: -(COURT.halfL + APRON + 4.2), z: 0, rot: Math.PI / 2 },
  ];
  const crowd = [];
  for (const stand of stands) {
    const group = new THREE.Group();
    group.position.set(stand.x, 0, stand.z);
    group.rotation.y = stand.rot;
    for (let row = 0; row < rows; row += 1) {
      const step3 = new THREE.Mesh(new THREE.BoxGeometry(stand.length, (row + 1) * step.rise, step.run), seat);
      step3.position.set(0, ((row + 1) * step.rise) / 2, -row * step.run - step.run / 2);
      step3.receiveShadow = true;
      group.add(step3);
    }
    scene.add(group);
    group.updateMatrixWorld(true);
    for (let row = 0; row < rows; row += 1) {
      const count = Math.floor(stand.length / 0.6);
      for (let i = 0; i < count; i += 1) {
        if (Math.random() < 0.1) continue;
        const local = new THREE.Vector3(-stand.length / 2 + 0.3 + i * 0.6 + (Math.random() - 0.5) * 0.1, (row + 1) * step.rise + 0.3, -(row * step.run + step.run * 0.5));
        crowd.push({ position: local.applyMatrix4(group.matrixWorld), rot: stand.rot, phase: Math.random() * Math.PI * 2 });
      }
    }
  }
  const palette = ["#f26b1d", "#f26b1d", "#1f5fd1", "#1f5fd1", "#f4f5f7", "#ffd23f", "#20232c", "#2bb673", "#f1c8a4", "#c98f62", "#8a5cf6"];
  const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.6, 0.32), new THREE.MeshLambertMaterial(), crowd.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  crowd.forEach((fan, index) => {
    quat.setFromAxisAngle(up, fan.rot);
    matrix.compose(fan.position, quat, new THREE.Vector3(1, 0.85 + Math.random() * 0.3, 1));
    fans.setMatrixAt(index, matrix);
    fans.setColorAt(index, color.set(palette[Math.floor(Math.random() * palette.length)]));
  });
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fans);
  return { fans, crowd };
};

/* ---------- nhà thi đấu ---------- */

export const createArena = (container, match, { camera: cameraMode = "tele" } = {}) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = "fb-canvas";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0f1424");
  scene.fog = new THREE.Fog("#0f1424", 46, 90);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.3, 200);

  const materials = new Map();
  const geometries = new Map();
  const shared = {
    mat: (color, roughness = 0.8) => {
      const key = `${color}|${roughness}`;
      if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }));
      return materials.get(key);
    },
    geo: (key, make) => {
      if (!geometries.has(key)) geometries.set(key, make());
      return geometries.get(key);
    },
  };

  // Đèn nhà thi đấu: ánh sáng trần + một đèn đổ bóng từ trên cao.
  scene.add(new THREE.HemisphereLight("#fff6e8", "#3a2a1c", 1.25));
  const top = new THREE.DirectionalLight("#fff3e0", 2.1);
  top.position.set(4, 26, 8);
  top.castShadow = true;
  top.shadow.mapSize.set(2048, 2048);
  Object.assign(top.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14, near: 5, far: 60 });
  top.shadow.bias = -0.0004;
  top.shadow.normalBias = 0.02;
  scene.add(top, top.target);
  for (const x of [-9, 9]) {
    const spot = new THREE.PointLight("#ffe9c4", 26, 30, 1.6);
    spot.position.set(x, 11, 0);
    scene.add(spot);
  }

  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const { texture: wood, L, W } = courtTexture(match.teams.map((team) => team.kit), maxAnisotropy);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.42, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), shared.mat("#1a1f33", 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  scene.add(ground);
  const hoops = [buildHoop(shared, -1), buildHoop(shared, 1)];
  scene.add(...hoops);
  const { fans, crowd } = buildStands(scene, shared);
  // Ghế dự bị hai đội ở biên gần bàn trọng tài.
  for (const side of [-1, 1]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 0.45, 0.6), shared.mat(match.teams[side < 0 ? 0 : 1].kit.shirt, 0.6));
    bench.position.set(side * 5, 0.22, -(COURT.halfW + 1.9));
    scene.add(bench);
  }
  const table = new THREE.Mesh(new THREE.BoxGeometry(5, 0.8, 0.7), shared.mat("#151a2c"));
  table.position.set(0, 0.4, -(COURT.halfW + 1.9));
  scene.add(table);

  const figures = match.players.map((player) => {
    const figure = makePlayer(shared, match.teams[player.team].kit, player);
    scene.add(figure);
    return figure;
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(COURT.ballR, 24, 16), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.65 }));
  ball.castShadow = true;
  scene.add(ball);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Vòng dưới chân + mũi tên trên đầu cầu thủ đang điều khiển.
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  scene.add(ring);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 4), new THREE.MeshBasicMaterial({ color: "#ffd23f" }));
  cone.rotation.x = Math.PI;
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  nameSprite.scale.set(1.3, 0.33, 1);
  nameSprite.position.y = 0.36;
  const cursor = new THREE.Group();
  cursor.add(cone, nameSprite);
  scene.add(cursor);
  let labelFor = null;
  let ringOn = true;
  let mode = cameraMode;
  let excitement = 0;
  let firstFrame = true;
  const eye = new THREE.Vector3(0, 10, 20);
  const look = new THREE.Vector3();
  const netKick = [0, 0];

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const cameraTarget = () => {
    const b = match.ball;
    const narrow = Math.max(0.95, Math.min(1.9, 1.75 / camera.aspect));
    const lx = Math.max(-8.5, Math.min(8.5, b.x * 0.8));
    if (match.phase === "freethrow" && match.ft) {
      const hoopX = Math.sign(match.players[match.ft.shooter].x || 1) * COURT.hoopX;
      return { eye: new THREE.Vector3(hoopX * 0.45, 5.2 * narrow, 8.5 * narrow), look: new THREE.Vector3(hoopX * 0.85, 2.2, 0), fov: 40 };
    }
    if (mode === "close") return { eye: new THREE.Vector3(lx, 7 * narrow, 13 * narrow), look: new THREE.Vector3(lx * 1.05, 1.1, -0.5), fov: 42 };
    if (mode === "end") {
      const dir = match.teams[match.user.team].dir;
      const bx = Math.max(-COURT.halfL, Math.min(COURT.halfL, b.x));
      return { eye: new THREE.Vector3(bx - dir * 11 * narrow, 7.5 * narrow, b.z * 0.4), look: new THREE.Vector3(bx + dir * 6, 1.2, b.z * 0.5), fov: 52 };
    }
    return { eye: new THREE.Vector3(lx * 0.9, 10.5 * narrow, 19 * narrow), look: new THREE.Vector3(lx, 0.6, -0.6), fov: 36 };
  };

  const updateCamera = (dt) => {
    const target = cameraTarget();
    const rate = firstFrame ? 1 : 1 - Math.exp(-dt * 3.4);
    eye.lerp(target.eye, rate);
    look.lerp(target.look, rate);
    camera.fov += (target.fov - camera.fov) * rate;
    camera.updateProjectionMatrix();
    camera.position.copy(eye);
    camera.lookAt(look);
    firstFrame = false;
  };

  let crowdTime = 0;
  const fanMatrix = new THREE.Matrix4();
  const fanScale = new THREE.Vector3(1, 1, 1);
  const fanQuat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const fanPos = new THREE.Vector3();
  const animateCrowd = (dt) => {
    excitement = Math.max(0, excitement - dt * 0.4);
    crowdTime += dt;
    if (excitement <= 0.01 && crowdTime % 0.25 > dt) return;
    const amount = 0.06 + excitement * 0.5;
    for (let i = 0; i < crowd.length; i += 1) {
      const fan = crowd[i];
      fanPos.copy(fan.position);
      fanPos.y += Math.max(0, Math.sin(crowdTime * (6 + (i % 5)) + fan.phase)) * amount * (excitement > 0.05 ? 1 : 0.2);
      fanQuat.setFromAxisAngle(yAxis, fan.rot);
      fanMatrix.compose(fanPos, fanQuat, fanScale);
      fans.setMatrixAt(i, fanMatrix);
    }
    fans.instanceMatrix.needsUpdate = true;
  };

  const temp = new THREE.Vector3();
  const render = (dt) => {
    match.players.forEach((player, index) => {
      const figure = figures[index];
      figure.position.set(player.x, 0, player.z);
      figure.rotation.y = player.heading;
      pose(figure, player, match, dt);
    });
    const b = match.ball;
    ball.position.set(b.x, b.y, b.z);
    const spin = Math.hypot(b.vx || 0, b.vz || 0) * dt / (COURT.ballR * 1.6);
    if (spin > 0) { temp.set(b.vz, 0, -b.vx).normalize(); ball.rotateOnWorldAxis(temp, spin); }
    blob.position.set(b.x, 0.015, b.z);
    const height = Math.max(0, b.y - COURT.ballR);
    blob.scale.setScalar(1 + height * 0.25);
    blob.material.opacity = Math.max(0.04, 0.3 - height * 0.06);
    // Lưới rung khi bóng lọt rổ.
    hoops.forEach((hoop, i) => {
      const side = i === 0 ? -1 : 1;
      const near = Math.hypot(b.x - side * COURT.hoopX, b.z) < 0.3 && b.y < COURT.rimY && b.y > COURT.rimY - 0.5;
      if (near) netKick[i] = 1;
      netKick[i] = Math.max(0, netKick[i] - dt * 2.5);
      const net = hoop.userData.net;
      net.scale.set(1 - netKick[i] * 0.2, 1 + netKick[i] * 0.25, 1 - netKick[i] * 0.2);
      net.rotation.y += netKick[i] * dt * 4;
    });
    const controlled = match.players[match.user.controlledId];
    const show = controlled && !match.user.auto && match.phase !== "fulltime" && match.phase !== "break";
    cursor.visible = Boolean(show);
    ring.visible = Boolean(show) && ringOn;
    if (show) {
      const bob = Math.sin(match.time * 6) * 0.06;
      cursor.position.set(controlled.x, controlled.height + 0.45 + controlled.y + bob, controlled.z);
      ring.position.set(controlled.x, 0.02, controlled.z);
      if (labelFor !== controlled.id) {
        labelFor = controlled.id;
        nameSprite.material.map?.dispose();
        nameSprite.material.map = labelTexture(`${controlled.number} · ${controlled.name}`, "#ffd23f");
        nameSprite.material.needsUpdate = true;
      }
    }
    animateCrowd(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
  };

  const project = (point) => {
    temp.set(point.x, point.y ?? 0, point.z).project(camera);
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    return { x: (temp.x * 0.5 + 0.5) * width, y: (-temp.y * 0.5 + 0.5) * height, visible: temp.z < 1 && Math.abs(temp.x) <= 1 && Math.abs(temp.y) <= 1 };
  };

  /** Hướng “phải” và “lên” của màn hình trên mặt sân, để đổi phím mũi tên thành hướng chạy. */
  const basis = () => {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    return { up: { x: forward.x, z: forward.z }, right: { x: -forward.z, z: forward.x } };
  };

  const dispose = () => {
    renderer.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose?.();
      const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of list) { material.map?.dispose?.(); material.dispose?.(); }
    });
    materials.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
    renderer.domElement.remove();
  };

  return {
    render,
    resize,
    project,
    basis,
    cheer: (amount = 1) => { excitement = Math.min(1.4, excitement + amount); },
    dispose,
    setCamera: (next) => { mode = next; },
    setRing: (on) => { ringOn = on; },
  };
};
