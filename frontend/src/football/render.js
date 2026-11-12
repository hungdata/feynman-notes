/**
 * Sân vận động 3D cho trận 11 người: mặt cỏ kẻ vạch đúng kích thước 105 × 68 m, khung thành có lưới,
 * biển quảng cáo, khán đài đầy cổ động viên, 22 cầu thủ có số áo và hoạt ảnh chạy – sút – xoạc – bay người,
 * camera truyền hình bám bóng như FIFA Online 4. Mọi thứ dựng bằng hình khối, không tải tệp ngoài.
 */
import * as THREE from "three";
import { FIELD } from "./constants.js";

const FONT = "'Lexend Variable', 'Lexend', system-ui, sans-serif";
const PITCH_PAD = { x: 7.5, z: 8 };

const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d"), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/* ---------- mặt sân ---------- */

const pitchTexture = (night, maxAnisotropy) => {
  const L = FIELD.length + PITCH_PAD.x * 2;
  const W = FIELD.width + PITCH_PAD.z * 2;
  const width = 3072;
  const height = Math.round((width * W) / L);
  const s = width / L;
  const px = (x) => width / 2 + x * s;
  const pz = (z) => height / 2 + z * s;
  const texture = canvasTexture(width, height, (ctx) => {
    const light = night ? "#3f8f45" : "#4caa48";
    const dark = night ? "#377f3d" : "#429a40";
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, width, height);
    const stripe = FIELD.length / 18;
    for (let i = -2; i < 22; i += 1) {
      ctx.fillStyle = i % 2 ? light : dark;
      ctx.fillRect(px(-FIELD.halfL + i * stripe), 0, stripe * s + 1, height);
    }
    // Cỏ lấm tấm cho đỡ phẳng.
    for (let i = 0; i < 26000; i += 1) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.035)";
      ctx.fillRect(Math.random() * width, Math.random() * height, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.93)";
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.lineWidth = 0.12 * s;
    const rect = (x1, z1, x2, z2) => ctx.strokeRect(px(Math.min(x1, x2)), pz(Math.min(z1, z2)), Math.abs(x2 - x1) * s, Math.abs(z2 - z1) * s);
    const circle = (x, z, r, a0 = 0, a1 = Math.PI * 2) => { ctx.beginPath(); ctx.arc(px(x), pz(z), r * s, a0, a1); ctx.stroke(); };
    const dot = (x, z, r) => { ctx.beginPath(); ctx.arc(px(x), pz(z), r * s, 0, Math.PI * 2); ctx.fill(); };
    rect(-FIELD.halfL, -FIELD.halfW, FIELD.halfL, FIELD.halfW);
    ctx.beginPath(); ctx.moveTo(px(0), pz(-FIELD.halfW)); ctx.lineTo(px(0), pz(FIELD.halfW)); ctx.stroke();
    circle(0, 0, FIELD.circle);
    dot(0, 0, 0.22);
    for (const side of [-1, 1]) {
      const line = side * FIELD.halfL;
      rect(line, -FIELD.boxHalf, line - side * FIELD.boxDepth, FIELD.boxHalf);
      rect(line, -FIELD.sixHalf, line - side * FIELD.sixDepth, FIELD.sixHalf);
      const spot = line - side * FIELD.penaltySpot;
      dot(spot, 0, 0.2);
      const a = Math.acos((FIELD.boxDepth - FIELD.penaltySpot) / FIELD.circle);
      if (side > 0) circle(spot, 0, FIELD.circle, Math.PI - a, Math.PI + a);
      else circle(spot, 0, FIELD.circle, -a, a);
      for (const corner of [-1, 1]) {
        const cz = corner * FIELD.halfW;
        const start = side > 0 ? (corner > 0 ? Math.PI : Math.PI / 2) : (corner > 0 ? 1.5 * Math.PI : 0);
        circle(line, cz, 1, start, start + Math.PI / 2);
      }
    }
  });
  texture.anisotropy = maxAnisotropy;
  return { texture, L, W };
};

const adTexture = () => {
  const texture = canvasTexture(1024, 96, (ctx, w, h) => {
    const slogans = [["#0b1f4d", "#ffd23f", "FEYNMAN NOTES"], ["#d7263d", "#ffffff", "HỌC MÀ CHƠI"], ["#12804a", "#ffffff", "TRƯỜNG FEYNMAN CUP"], ["#1d2142", "#7ee0ff", "MIND MAP • CHECKLIST"]];
    const part = w / slogans.length;
    slogans.forEach(([bg, fg, text], i) => {
      ctx.fillStyle = bg;
      ctx.fillRect(i * part, 0, part, h);
      ctx.fillStyle = fg;
      ctx.font = `800 42px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, i * part + part / 2, h / 2 + 2, part - 20);
    });
  });
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
};

const ballTexture = () => canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = "#f7f7f2";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#1a1d26";
  const spots = [[0.1, 0.5], [0.35, 0.5], [0.6, 0.5], [0.85, 0.5], [0.22, 0.18], [0.72, 0.18], [0.47, 0.82], [0.97, 0.82], [0.47, 0.12], [0.22, 0.85]];
  for (const [u, v] of spots) {
    ctx.beginPath();
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(u * w + Math.cos(a) * 26, v * h + Math.sin(a) * 30);
    }
    ctx.closePath();
    ctx.fill();
  }
});

const labelTexture = (lines, color) => canvasTexture(256, 96, (ctx, w, h) => {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(10,14,30,0.78)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(8, 10, w - 16, 54, 14); else ctx.rect(8, 10, w - 16, 54);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillRect(8, 10, 10, 54);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(lines, w / 2 + 4, 38, w - 40);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 14, 66);
  ctx.lineTo(w / 2 + 14, 66);
  ctx.lineTo(w / 2, 88);
  ctx.closePath();
  ctx.fill();
});

const numberTexture = (number, color, shirt) => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = shirt;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = `800 92px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), w / 2, h / 2 + 6);
});

/* ---------- cầu thủ ---------- */

const SKINS = ["#f1c8a4", "#e2b48c", "#c98f62", "#f5d3b5", "#a8714a", "#ebbf95"];
const HAIRS = ["#1b1410", "#2f2018", "#4a3020", "#0f0f10", "#6b4a2a", "#c9a15b"];

const makeFootballer = (shared, kit, player) => {
  const keeper = player.role === "GK";
  const shirtColor = keeper ? kit.gk : kit.shirt;
  const materials = shared.kitMaterials(kit, keeper);
  const skin = shared.mat(SKINS[(player.id * 7) % SKINS.length]);
  const hair = shared.mat(HAIRS[(player.id * 5) % HAIRS.length]);
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
  mesh(shared.geo("shorts", () => new THREE.BoxGeometry(0.36, 0.24, 0.24)), materials.shorts, 0, 0.02, 0);
  const torso = mesh(shared.geo("torso", () => new THREE.CapsuleGeometry(0.17, 0.3, 4, 10)), materials.shirt, 0, 0.36, 0);
  torso.scale.set(1.22, 1, 0.74);
  const number = new THREE.Mesh(shared.geo("number", () => new THREE.PlaneGeometry(0.26, 0.26)), new THREE.MeshStandardMaterial({ map: numberTexture(player.number, kit.number, shirtColor), roughness: 0.85 }));
  number.position.set(0, 0.4, -0.13);
  number.rotation.y = Math.PI;
  hips.add(number);
  mesh(shared.geo("neck", () => new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8)), skin, 0, 0.64, 0);
  const head = mesh(shared.geo("head", () => new THREE.SphereGeometry(0.115, 14, 12)), skin, 0, 0.77, 0.01);
  const cap = new THREE.Mesh(shared.geo("hair", () => new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), hair);
  cap.position.set(0, 0.015, -0.012);
  cap.rotation.x = -0.25;
  head.add(cap);
  const limb = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 0.52, 0);
    hips.add(shoulder);
    mesh(shared.geo("sleeve", () => new THREE.CylinderGeometry(0.058, 0.052, 0.17, 8)), materials.shirt, 0, -0.08, 0, shoulder);
    mesh(shared.geo("upper", () => new THREE.CylinderGeometry(0.046, 0.042, 0.14, 8)), keeper ? materials.shirt : skin, 0, -0.22, 0, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -0.29;
    shoulder.add(elbow);
    mesh(shared.geo("fore", () => new THREE.CylinderGeometry(0.04, 0.034, 0.25, 8)), keeper ? materials.glove : skin, 0, -0.12, 0, elbow);
    mesh(shared.geo("hand", () => new THREE.SphereGeometry(0.045, 8, 6)), keeper ? materials.glove : skin, 0, -0.27, 0, elbow);
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.06, 0);
    hips.add(hip);
    mesh(shared.geo("thigh", () => new THREE.CylinderGeometry(0.08, 0.065, 0.42, 9)), skin, 0, -0.22, 0, hip);
    mesh(shared.geo("legShort", () => new THREE.CylinderGeometry(0.088, 0.084, 0.12, 9)), materials.shorts, 0, -0.06, 0, hip);
    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    mesh(shared.geo("shin", () => new THREE.CylinderGeometry(0.062, 0.045, 0.42, 9)), materials.socks, 0, -0.21, 0, knee);
    const boot = mesh(shared.geo("boot", () => new THREE.BoxGeometry(0.1, 0.07, 0.25)), materials.boot, 0, -0.45, 0.05, knee);
    boot.castShadow = true;
    return { shoulder, elbow, hip, knee };
  };
  const left = limb(-1);
  const right = limb(1);
  root.userData.parts = { body, hips, head, left, right };
  root.traverse((object) => { object.matrixAutoUpdate = true; });
  return root;
};

const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));

/** Đặt tư thế cho một cầu thủ theo trạng thái trong mô phỏng. */
const pose = (figure, player, ball, time, dt) => {
  const { body, hips, head, left, right } = figure.userData.parts;
  const speed = Math.hypot(player.vx, player.vz);
  const amount = Math.min(1, speed / 7.5);
  const phase = player.anim.stride * 2.2;
  const target = {
    lean: 0.05 + amount * 0.16, roll: 0, lift: Math.abs(Math.sin(phase)) * 0.05 * amount,
    hipL: -Math.sin(phase) * 0.85 * amount, hipR: Math.sin(phase) * 0.85 * amount,
    kneeL: 0.12 + Math.max(0, Math.cos(phase)) * 1.15 * amount, kneeR: 0.12 + Math.max(0, -Math.cos(phase)) * 1.15 * amount,
    armL: Math.sin(phase) * 0.75 * amount, armR: -Math.sin(phase) * 0.75 * amount,
    armLz: 0.12, armRz: -0.12, elbow: -0.35 - amount * 0.7, headX: 0,
  };
  const kick = player.anim.kick;
  if (kick > 0) {
    const t = 1 - kick;
    const swing = t < 0.3 ? (t / 0.3) * 0.9 : 0.9 - ((t - 0.3) / 0.7) * 2.4;
    const knee = t < 0.3 ? 1.3 : Math.max(0.05, 1.3 - (t - 0.3) * 4);
    if (player.anim.kickSide > 0) { target.hipR = swing; target.kneeR = knee; target.hipL = 0.15; target.kneeL = 0.25; }
    else { target.hipL = swing; target.kneeL = knee; target.hipR = 0.15; target.kneeR = 0.25; }
    target.armL = -0.5; target.armR = -0.5; target.armLz = 0.6; target.armRz = -0.6;
    target.lean = 0.12;
  }
  if (player.anim.tackle > 0) { target.hipR = -1.1; target.kneeR = 0.1; target.lean = -0.1; target.armLz = 0.7; target.armRz = -0.7; }
  if (player.anim.header > 0) {
    const t = player.anim.header;
    target.lift = Math.sin(Math.PI * t) * 0.45;
    target.lean = -0.35 * t;
    target.headX = -0.4 * t;
    target.armLz = 0.9; target.armRz = -0.9;
  }
  if (player.state === "slide") {
    target.roll = 1.25; target.lean = -0.25; target.lift = -0.62;
    target.hipR = -1.45; target.kneeR = 0.05; target.hipL = -0.5; target.kneeL = 1.4;
    target.armL = -0.4; target.armLz = 1.2; target.armR = 0.3; target.armRz = -0.4;
  } else if (player.state === "down") {
    target.lean = -1.45; target.lift = -0.7; target.hipL = -0.3; target.hipR = -0.1; target.kneeL = 0.6; target.kneeR = 0.2; target.armLz = 1.3; target.armRz = -1.3;
  } else if (player.state === "stumble") {
    target.lean = 0.35; target.armLz = 0.9; target.armRz = -0.9; target.armL = -0.6;
  } else if (player.state === "dive" && player.dive) {
    const side = player.dive.side;
    const progress = Math.min(1, Math.max(0, 1 - (player.dive.at - time) / 0.45));
    target.roll = (Math.sign(side * Math.sin(player.heading)) || side) * 1.25 * progress;
    target.lift = Math.min(1.3, Math.max(0, player.dive.y - 0.7)) * progress + 0.2 * progress;
    target.armL = -2.9; target.armR = -2.9; target.armLz = 0.2; target.armRz = -0.2; target.elbow = -0.05;
    target.hipL = -0.3; target.hipR = 0.2; target.kneeL = 0.5; target.kneeR = 0.4; target.lean = -0.1;
  } else if (player.state === "hold") {
    const throwIn = ball.y > 1.8;
    target.armL = throwIn ? -2.9 : -1.25; target.armR = target.armL; target.elbow = throwIn ? -0.5 : -0.6;
    target.armLz = 0.05; target.armRz = -0.05;
  } else if (player.state === "celebrate") {
    const jump = Math.abs(Math.sin(time * 7 + player.id));
    target.armL = -2.6; target.armR = -2.6; target.armLz = 0.6; target.armRz = -0.6; target.elbow = -0.2;
    if (speed < 1.5) target.lift = jump * 0.22;
  }
  const rate = 16;
  body.rotation.x = smooth(body.rotation.x, target.lean, rate, dt);
  body.rotation.z = smooth(body.rotation.z, target.roll, rate, dt);
  body.position.y = smooth(body.position.y, target.lift, rate * 1.4, dt);
  left.hip.rotation.x = smooth(left.hip.rotation.x, target.hipL, rate * 1.5, dt);
  right.hip.rotation.x = smooth(right.hip.rotation.x, target.hipR, rate * 1.5, dt);
  left.knee.rotation.x = smooth(left.knee.rotation.x, target.kneeL, rate * 1.5, dt);
  right.knee.rotation.x = smooth(right.knee.rotation.x, target.kneeR, rate * 1.5, dt);
  left.shoulder.rotation.x = smooth(left.shoulder.rotation.x, target.armL, rate, dt);
  right.shoulder.rotation.x = smooth(right.shoulder.rotation.x, target.armR, rate, dt);
  left.shoulder.rotation.z = smooth(left.shoulder.rotation.z, -target.armLz, rate, dt);
  right.shoulder.rotation.z = smooth(right.shoulder.rotation.z, -target.armRz, rate, dt);
  left.elbow.rotation.x = smooth(left.elbow.rotation.x, target.elbow, rate, dt);
  right.elbow.rotation.x = smooth(right.elbow.rotation.x, target.elbow, rate, dt);
  head.rotation.x = smooth(head.rotation.x, target.headX, rate, dt);
  hips.position.y = 0.94;
};

/* ---------- sân vận động ---------- */

const buildStands = (scene, shared, night) => {
  const seat = shared.mat(night ? "#2a2f45" : "#3b4562");
  const concrete = shared.mat(night ? "#4a4f60" : "#9aa1ad");
  const rows = 16;
  const step = { rise: 0.55, run: 0.95 };
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  for (let i = 0; i < rows; i += 1) {
    profile.lineTo(i * step.run, (i + 1) * step.rise);
    profile.lineTo((i + 1) * step.run, (i + 1) * step.rise);
  }
  profile.lineTo(rows * step.run, 0);
  profile.lineTo(0, 0);
  const stands = [
    { length: 128, x: 0, z: -(FIELD.halfW + 7.5), rot: 0 },
    { length: 128, x: 0, z: FIELD.halfW + 7.5, rot: Math.PI },
    { length: 82, x: FIELD.halfL + 9, z: 0, rot: -Math.PI / 2 },
    { length: 82, x: -(FIELD.halfL + 9), z: 0, rot: Math.PI / 2 },
  ];
  const crowd = [];
  for (const stand of stands) {
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: stand.length, bevelEnabled: false });
    geometry.translate(0, 0, -stand.length / 2);
    const mesh = new THREE.Mesh(geometry, seat);
    mesh.receiveShadow = true;
    // Mặt cắt nằm trong mặt phẳng x–y: quay để bậc ghế lùi xa khỏi sân.
    const group = new THREE.Group();
    group.position.set(stand.x, 0.9, stand.z);
    group.rotation.y = stand.rot;
    mesh.rotation.y = Math.PI / 2;
    mesh.position.z = 0;
    group.add(mesh);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(stand.length, 0.9, 0.4), concrete);
    wall.position.set(0, -0.45, 0.2);
    group.add(wall);
    if (stand.rot === 0) {
      // Mái che khán đài chính.
      const roof = new THREE.Mesh(new THREE.BoxGeometry(stand.length + 4, 0.5, 13), shared.mat(night ? "#20263a" : "#dfe4ec"));
      roof.position.set(0, rows * step.rise + 6, -rows * step.run * 0.55);
      group.add(roof);
      for (let i = -3; i <= 3; i += 1) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, rows * step.rise + 6, 8), concrete);
        post.position.set(i * 20, (rows * step.rise + 6) / 2, -rows * step.run - 0.5);
        group.add(post);
      }
    }
    scene.add(group);
    group.updateMatrixWorld(true);
    for (let row = 0; row < rows; row += 1) {
      const count = Math.floor(stand.length / 0.62);
      for (let i = 0; i < count; i += 1) {
        if (Math.random() < 0.12) continue;
        const local = new THREE.Vector3(-stand.length / 2 + 0.31 + i * 0.62 + (Math.random() - 0.5) * 0.1, (row + 1) * step.rise + 0.28, -(row * step.run + step.run * 0.55));
        crowd.push({ position: local.applyMatrix4(group.matrixWorld), rot: stand.rot });
      }
    }
  }
  const palette = ["#d7263d", "#d7263d", "#f4f5f7", "#1f5fd1", "#1f5fd1", "#ffcc1f", "#20232c", "#2bb673", "#ff7a1a", "#f1c8a4", "#c98f62", "#8a5cf6"];
  const geometry = new THREE.BoxGeometry(0.42, 0.62, 0.34);
  const material = new THREE.MeshLambertMaterial();
  const fans = new THREE.InstancedMesh(geometry, material, crowd.length);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  crowd.forEach((fan, index) => {
    rotation.setFromAxisAngle(up, fan.rot);
    matrix.compose(fan.position, rotation, new THREE.Vector3(1, 0.85 + Math.random() * 0.3, 1));
    fans.setMatrixAt(index, matrix);
    fans.setColorAt(index, color.set(palette[Math.floor(Math.random() * palette.length)]));
    fan.phase = Math.random() * Math.PI * 2;
  });
  fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(fans);
  return { fans, crowd };
};

const buildGoal = (shared, side) => {
  const group = new THREE.Group();
  group.position.x = side * FIELD.halfL;
  const white = shared.mat("#ffffff", 0.35);
  const post = shared.geo("post", () => new THREE.CylinderGeometry(0.06, 0.06, FIELD.goalHeight + 0.06, 12));
  for (const z of [-FIELD.goalHalf, FIELD.goalHalf]) {
    const m = new THREE.Mesh(post, white);
    m.position.set(0, (FIELD.goalHeight + 0.06) / 2, z);
    m.castShadow = true;
    group.add(m);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, FIELD.goalHalf * 2 + 0.12, 12), white);
  bar.rotation.x = Math.PI / 2;
  bar.position.y = FIELD.goalHeight;
  bar.castShadow = true;
  group.add(bar);
  const depth = FIELD.goalDepth;
  const frame = shared.mat("#d9dde3", 0.6);
  for (const z of [-FIELD.goalHalf, FIELD.goalHalf]) {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.hypot(depth, FIELD.goalHeight - 0.4), 6), frame);
    back.position.set(side * depth / 2, (FIELD.goalHeight + 0.4) / 2, z);
    back.rotation.z = side * Math.atan2(depth, FIELD.goalHeight - 0.4);
    group.add(back);
  }
  // Lưới: các ô 0.16 m trên mặt sau, nóc và hai bên.
  const points = [];
  const cell = 0.16;
  const backX = side * depth;
  const topY = (x) => FIELD.goalHeight - (Math.abs(x) / depth) * (FIELD.goalHeight - 0.4 - 1.6);
  for (let z = -FIELD.goalHalf; z <= FIELD.goalHalf + 1e-6; z += cell) {
    points.push(backX, 0, z, backX, 1.6 + 0.4, z);
    points.push(0, FIELD.goalHeight, z, backX, topY(depth), z);
  }
  for (let y = 0; y <= 2.0 + 1e-6; y += cell) points.push(backX, y, -FIELD.goalHalf, backX, y, FIELD.goalHalf);
  for (let x = 0; Math.abs(x) <= depth + 1e-6; x += side * cell) points.push(x, topY(x), -FIELD.goalHalf, x, topY(x), FIELD.goalHalf);
  for (const z of [-FIELD.goalHalf, FIELD.goalHalf]) {
    for (let x = 0; Math.abs(x) <= depth + 1e-6; x += side * cell) points.push(x, 0, z, x, topY(x), z);
    for (let y = 0; y <= FIELD.goalHeight + 1e-6; y += cell) {
      const reach = y < 2.0 ? depth : depth * (FIELD.goalHeight - y) / (FIELD.goalHeight - 2.0);
      points.push(0, y, z, side * Math.max(0, reach), y, z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const net = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 }));
  group.add(net);
  group.userData.net = net;
  return group;
};

const buildFloodlight = (shared, x, z, night) => {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 34, 8), shared.mat("#8a909c"));
  pole.position.y = 17;
  group.add(pole);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.6), new THREE.MeshBasicMaterial({ color: night ? "#fffbe6" : "#e9edf5" }));
  panel.position.y = 35;
  panel.lookAt(new THREE.Vector3(-x, -40, -z).add(group.position));
  group.add(panel);
  return group;
};

/* ---------- toàn cảnh ---------- */

export const createStadium = (container, match, { night = false, camera: cameraMode = "tele" } = {}) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.05 : 1.0;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = "fb-canvas";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? "#0b1230" : "#8cc4f2");
  scene.fog = new THREE.Fog(night ? "#0b1230" : "#bcdcf5", 140, 260);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

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
    kitMaterials: (kit, keeper) => ({
      shirt: shared.mat(keeper ? kit.gk : kit.shirt, 0.75),
      shorts: shared.mat(keeper ? "#1c1f2b" : kit.shorts, 0.75),
      socks: shared.mat(keeper ? kit.gk : kit.socks, 0.8),
      boot: shared.mat("#15171d", 0.5),
      glove: shared.mat("#f4f5f7", 0.6),
    }),
  };

  // Ánh sáng.
  const hemi = new THREE.HemisphereLight(night ? "#9fb4ff" : "#dff1ff", night ? "#1e3a22" : "#4b7a3a", night ? 0.85 : 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(night ? "#fff4dc" : "#fff3dc", night ? 1.9 : 2.4);
  sun.position.set(night ? 20 : -40, 70, night ? 30 : 45);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -66, right: 66, top: 46, bottom: -46, near: 10, far: 200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  if (night) {
    const fill = new THREE.DirectionalLight("#dfe8ff", 0.7);
    fill.position.set(-30, 60, -40);
    scene.add(fill);
  }

  // Mặt cỏ và phần đất quanh sân.
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const { texture: grass, L, W } = pitchTexture(night, maxAnisotropy);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  scene.add(pitch);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(260, 200), shared.mat(night ? "#1d2a24" : "#5d7a58", 1));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  apron.receiveShadow = true;
  scene.add(apron);

  const goals = [buildGoal(shared, -1), buildGoal(shared, 1)];
  scene.add(...goals);

  // Cờ góc.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(shared.geo("flagPole", () => new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6)), shared.mat("#ffd23f"));
    pole.position.set(sx * FIELD.halfL, 0.75, sz * FIELD.halfW);
    const flag = new THREE.Mesh(shared.geo("flag", () => new THREE.PlaneGeometry(0.4, 0.28)), new THREE.MeshStandardMaterial({ color: "#d7263d", side: THREE.DoubleSide }));
    flag.position.set(sx * FIELD.halfL + 0.2, 1.36, sz * FIELD.halfW);
    scene.add(pole, flag);
  }

  // Biển quảng cáo quanh sân.
  const ads = adTexture();
  const board = (length, x, z, rot) => {
    const texture = ads.clone();
    texture.needsUpdate = true;
    texture.repeat.x = length / 24;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(length, 0.9), new THREE.MeshBasicMaterial({ map: texture }));
    face.position.set(x, 0.45, z);
    face.rotation.y = rot;
    const back = new THREE.Mesh(new THREE.BoxGeometry(length, 0.9, 0.12), shared.mat("#11131a"));
    back.position.set(x, 0.45, z);
    back.rotation.y = rot;
    back.translateZ(-0.07);
    scene.add(back, face);
    return texture;
  };
  const boards = [
    board(112, 0, -(FIELD.halfW + 4.5), 0),
    board(112, 0, FIELD.halfW + 4.5, Math.PI),
    board(28, FIELD.halfL + 5, -20, -Math.PI / 2), board(28, FIELD.halfL + 5, 20, -Math.PI / 2),
    board(28, -(FIELD.halfL + 5), -20, Math.PI / 2), board(28, -(FIELD.halfL + 5), 20, Math.PI / 2),
  ];

  const { fans, crowd } = buildStands(scene, shared, night);
  for (const [x, z] of [[-66, -52], [66, -52], [-66, 52], [66, 52]]) scene.add(buildFloodlight(shared, x, z, night));

  // Hai băng ghế kỹ thuật.
  for (const sx of [-1, 1]) {
    const dug = new THREE.Mesh(new THREE.BoxGeometry(9, 2.1, 2.2), new THREE.MeshStandardMaterial({ color: "#1d2c4a", transparent: true, opacity: 0.85 }));
    dug.position.set(sx * 13, 1.05, FIELD.halfW + 2.8);
    scene.add(dug);
  }

  // Cầu thủ.
  const figures = match.players.map((player) => {
    const figure = makeFootballer(shared, match.teams[player.team].kit, player);
    figure.scale.setScalar(1.06 + (player.attrs.physical % 7) * 0.012);
    scene.add(figure);
    return figure;
  });

  // Bóng và bóng đổ giả dưới bóng khi bóng bay.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(FIELD.ballRadius * 1.7, 20, 14), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
  ball.castShadow = true;
  scene.add(ball);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.3, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.02;
  scene.add(blob);

  // Con trỏ cầu thủ đang điều khiển: tam giác trên đầu, tên, vòng dưới chân.
  const cursor = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 3), new THREE.MeshBasicMaterial({ color: "#ffd23f" }));
  cone.rotation.x = Math.PI;
  cursor.add(cone);
  const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
  nameSprite.scale.set(2.4, 0.9, 1);
  nameSprite.position.y = 0.85;
  nameSprite.renderOrder = 10;
  cursor.add(nameSprite);
  scene.add(cursor);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  scene.add(ring);
  const receiverRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 28), new THREE.MeshBasicMaterial({ color: "#7ee0ff", transparent: true, opacity: 0.8, depthWrite: false }));
  receiverRing.rotation.x = -Math.PI / 2;
  receiverRing.position.y = 0.03;
  scene.add(receiverRing);
  let labelFor = -1;

  // Camera.
  let mode = cameraMode;
  const look = new THREE.Vector3(0, 0, 0);
  const eye = new THREE.Vector3(0, 30, 50);
  let firstFrame = true;
  let excitement = 0;

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();

  const cameraTarget = (dt) => {
    const b = match.ball;
    const sp = match.setPiece;
    const aspect = camera.aspect;
    const narrow = clampNum(1.7 / aspect, 0.92, 2);
    const spGoalX = sp ? match.teams[sp.team].dir * FIELD.halfL : 0;
    if (sp && (sp.type === "penalty" || (sp.type === "freekick" && Math.hypot(spGoalX - sp.x, sp.z) < 32))) {
      const goalX = spGoalX;
      const toGoal = new THREE.Vector3(goalX - b.x, 0, -b.z).normalize();
      return { eye: new THREE.Vector3(b.x - toGoal.x * 8, 3.2, b.z - toGoal.z * 8), look: new THREE.Vector3(goalX, 1.2, 0), fov: 42 };
    }
    if (match.phase === "goal" && match.goalScorer !== null) {
      const scorer = match.players[match.goalScorer];
      return { eye: new THREE.Vector3(scorer.x * 0.9, 9, scorer.z + 16), look: new THREE.Vector3(scorer.x, 1, scorer.z), fov: 34 };
    }
    const lx = clampNum(b.x, -42, 42);
    const lz = clampNum(b.z * 0.78, -22, 20);
    if (mode === "close") return { eye: new THREE.Vector3(lx, 15 * narrow, lz + 25 * narrow), look: new THREE.Vector3(lx, 0, lz + 1), fov: 36 };
    if (mode === "end") {
      const dir = match.teams[match.user.team].dir;
      const bx = clampNum(b.x, -48, 48);
      return { eye: new THREE.Vector3(bx - dir * 24 * narrow, 14 * narrow, clampNum(b.z, -26, 26) * 0.7), look: new THREE.Vector3(bx + dir * 8, 0, clampNum(b.z, -26, 26) * 0.85), fov: 48 };
    }
    void dt;
    return { eye: new THREE.Vector3(lx * 0.92, 25 * narrow, lz + 50 * narrow), look: new THREE.Vector3(lx, 0, lz - 1), fov: 30 };
  };

  const updateCamera = (dt) => {
    const target = cameraTarget(dt);
    const rate = firstFrame ? 1 : 1 - Math.exp(-dt * (match.setPiece ? 4 : 3.2));
    eye.lerp(target.eye, rate);
    look.lerp(target.look, rate);
    camera.fov += (target.fov - camera.fov) * rate;
    camera.updateProjectionMatrix();
    camera.position.copy(eye);
    camera.lookAt(look);
    firstFrame = false;
  };

  const temp = new THREE.Vector3();
  let crowdTime = 0;
  const fanMatrix = new THREE.Matrix4();
  const fanScale = new THREE.Vector3(1, 1, 1);
  const fanQuat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const fanPos = new THREE.Vector3();

  const animateCrowd = (dt) => {
    excitement = Math.max(0, excitement - dt * 0.35);
    crowdTime += dt;
    if (excitement <= 0.01 && crowdTime % 0.25 > dt) return;
    const amount = 0.08 + excitement * 0.55;
    for (let i = 0; i < crowd.length; i += 1) {
      const fan = crowd[i];
      const hop = Math.max(0, Math.sin(crowdTime * (6 + (i % 5)) + fan.phase)) * amount * (excitement > 0.05 ? 1 : 0.2);
      fanPos.copy(fan.position);
      fanPos.y += hop;
      fanQuat.setFromAxisAngle(yAxis, fan.rot);
      fanMatrix.compose(fanPos, fanQuat, fanScale);
      fans.setMatrixAt(i, fanMatrix);
    }
    fans.instanceMatrix.needsUpdate = true;
  };

  const render = (dt, extra = {}) => {
    const time = match.time;
    match.players.forEach((player, index) => {
      const figure = figures[index];
      figure.visible = !player.sentOff;
      if (!figure.visible) return;
      figure.position.set(player.x, 0, player.z);
      figure.rotation.y = player.heading;
      pose(figure, player, match.ball, time, dt);
    });
    const b = match.ball;
    ball.position.set(b.x, b.y + FIELD.ballRadius * 0.7, b.z);
    const spin = Math.hypot(b.vx, b.vz) * dt / (FIELD.ballRadius * 1.7);
    if (spin > 0) {
      temp.set(b.vz, 0, -b.vx).normalize();
      ball.rotateOnWorldAxis(temp, spin);
    }
    blob.position.set(b.x, 0.02, b.z);
    const height = Math.max(0, b.y - FIELD.ballRadius);
    blob.scale.setScalar(1 + height * 0.12);
    blob.material.opacity = Math.max(0.05, 0.32 - height * 0.03);

    const controlled = match.players[match.user.controlledId];
    const showCursor = controlled && !controlled.sentOff && !match.user.auto && match.phase !== "fulltime";
    cursor.visible = ring.visible = Boolean(showCursor);
    if (showCursor) {
      const bob = Math.sin(time * 6) * 0.08;
      cursor.position.set(controlled.x, 2.35 + bob + (controlled.state === "dive" ? 1 : 0), controlled.z);
      ring.position.set(controlled.x, 0.03, controlled.z);
      if (labelFor !== controlled.id) {
        labelFor = controlled.id;
        nameSprite.material.map?.dispose();
        nameSprite.material.map = labelTexture(`${controlled.number} · ${controlled.name}`, "#ffd23f");
        nameSprite.material.needsUpdate = true;
      }
      cone.material.color.set(extra.charging ? "#ff9f1c" : "#ffd23f");
    }
    const pass = match.ball.pass;
    const receiver = pass && pass.to !== null ? match.players[pass.to] : null;
    receiverRing.visible = Boolean(receiver && receiver.team === match.user.team && receiver.id !== match.user.controlledId);
    if (receiverRing.visible) receiverRing.position.set(receiver.x, 0.03, receiver.z);

    // Lưới rung khi có bàn thắng.
    goals.forEach((goal, i) => {
      const side = i === 0 ? -1 : 1;
      const hit = match.ball.inGoal === side && match.phase === "goal" ? Math.max(0, match.phaseT - 3.2) : 0;
      goal.userData.net.scale.x = 1 + hit * 0.25;
    });
    boards.forEach((texture) => { texture.offset.x = (texture.offset.x + dt * 0.02) % 1; });
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

  const cheer = (amount = 1) => { excitement = Math.min(1.4, excitement + amount); };

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
    cheer,
    dispose,
    setCamera: (next) => { mode = next; },
    get camera() { return camera; },
  };
};

function clampNum(value, min, max) { return Math.max(min, Math.min(max, value)); }
