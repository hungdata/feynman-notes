/**
 * The running 3D campus: builds the scene, moves the player and the other
 * students every frame, and draws it. The page only passes in the arrow input
 * and listens for "you are at a door".
 */
import * as THREE from "three";
import { BENCHES, BOUNDS, BUILDINGS, COURT, DECK, DOOR_WEIGHTS, EDGES, ENTER_RANGE, FENCE, FLAG, GATE, LAKE, LAMPS, NEIGHBOURS, NODES, OUTDOOR_CLASS, PATHS, PIER, PITCH, PLAYER_RADIUS, PLAZA, ROAD, SKIES, SPAWN, STALL, TREES, buildColliders, doorOf, fieldAt, onDeck } from "./world.js";
import { angleDelta, headingOf, moveWithCollisions, nearestDoor, reconcilePosition, segmentHitsBox, steer, turnToward } from "./movement.js";
import { HOOP_HEIGHT, buildGraph, createBasketball, createFootball, createStudent, stepBasketball, stepFootball, stepStudent } from "./npc.js";
import { PLAYER_LOOK, canvasTexture, characterLook, createKit, poseStudent, seatStudent, studentLook } from "./builders.js";

const WALK_SPEED = 5.8;
const RUN_SPEED = 10;
const CAST_REACH = 7.5;
const GREETINGS = ["Chào bạn!", "Đi học thôi!", "Hôm nay học gì?", "Sắp vào lớp rồi!", "Cố lên nha!", "Học vui nhé!"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);

/** Repeatable random numbers, so the students look the same on every visit. */
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const glowTexture = (inner, outer = "rgba(255,255,255,0)") => canvasTexture(128, 128, (ctx, w) => {
  const gradient = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, w);
});

/**
 * Starts the world inside `container`. Returns handles to stop it, to walk
 * into a building, and to read where the player stands.
 *
 * options.input     { x, y, run } - changed by the page while keys are held
 * options.start     { x, z, heading } - where to stand (defaults to the gate)
 * options.onNear    (building | null) - the door Enter would open
 * options.onMap     ({ x, z, heading, students: [x, z, ...] }) - for the mini map
 * options.onEnvironment ({ atLake, onDeck, nearShop, field, nearField }) - changed outdoor interactions
 * options.onSound   (name, level) - footsteps, kicks, bounces
 * options.profile   { id, name, gender } - the server-reserved character
 * options.online    { connected, snapshot } - live, shared authoritative state
 */
export const startWorld = (container, options) => {
  const sky = SKIES[options.sky] || SKIES.day;
  const input = options.input;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "c3-canvas";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(sky.fog, 90, 330);
  const camera = new THREE.PerspectiveCamera(54, 1, 0.5, 900);
  const kit = createKit(sky);
  const look = seeded(20260112);

  /* ---------- sky and light ---------- */

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(520, 24, 14),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide, fog: false, depthWrite: false,
      map: canvasTexture(8, 256, (ctx, w, h) => {
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, sky.top);
        gradient.addColorStop(0.47, sky.bottom);
        gradient.addColorStop(0.5, sky.fog);
        gradient.addColorStop(1, sky.fog);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
      }),
    }),
  );
  const heaven = new THREE.Group();
  heaven.add(dome);
  scene.add(heaven);

  const sunDirection = new THREE.Vector3(...sky.sunAt).normalize();
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(sky.night ? "rgba(240,244,255,1)" : "rgba(255,250,225,1)", sky.night ? "rgba(190,205,255,0)" : "rgba(255,225,150,0)"), fog: false, depthWrite: false, transparent: true }));
  disc.scale.setScalar(sky.night ? 46 : 90);
  disc.position.copy(sunDirection).multiplyScalar(470);
  heaven.add(disc);
  if (sky.night) {
    const points = [];
    for (let i = 0; i < 320; i += 1) {
      const angle = look() * Math.PI * 2;
      const height = 0.12 + look() * 0.85;
      const flat = Math.sqrt(1 - height * height);
      points.push(Math.cos(angle) * flat * 500, height * 500, Math.sin(angle) * flat * 500);
    }
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3)), new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    heaven.add(stars);
  }

  const clouds = [];
  const cloudPaint = new THREE.MeshBasicMaterial({ color: sky.night ? "#46527f" : "#ffffff", fog: false, transparent: true, opacity: sky.night ? 0.7 : 0.94 });
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 10; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const part = new THREE.Mesh(puff, cloudPaint);
      part.position.set(j * 7 - 10 + look() * 3, look() * 3, look() * 5);
      part.scale.set(7 + look() * 5, 3.4 + look() * 2, 5 + look() * 3);
      cloud.add(part);
    }
    cloud.position.set(look() * 640 - 320, 70 + look() * 50, -260 + look() * 420);
    cloud.userData.speed = 1.2 + look() * 1.6;
    clouds.push(cloud);
    scene.add(cloud);
  }

  // Light from the sky is kept close to white, so cream walls stay cream instead of turning green.
  const above = new THREE.Color("#ffffff").lerp(new THREE.Color(sky.top), sky.night ? 0.75 : 0.3);
  const below = new THREE.Color(sky.night ? "#2a3157" : "#c9c1ad");
  scene.add(new THREE.HemisphereLight(above, below, sky.ambient));
  const sun = new THREE.DirectionalLight(sky.sun, sky.sunPower);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 1, far: 320 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  /* ---------- ground ---------- */

  const flat = (geometry, color, y, { x = 0, z = 0 } = {}) => {
    const object = new THREE.Mesh(geometry, kit.paint(color));
    object.rotation.x = -Math.PI / 2;
    object.position.set(x, y, z);
    object.receiveShadow = true;
    scene.add(object);
    return object;
  };
  flat(new THREE.PlaneGeometry(1400, 1400), sky.ground, 0);
  const paving = sky.night ? "#77779a" : "#eadcc2";
  for (const [x, z, w, d] of PATHS) flat(kit.shape(`path:${w}:${d}`, () => new THREE.PlaneGeometry(w, d)), paving, 0.03, { x, z });
  flat(new THREE.CircleGeometry(PLAZA.r, 48), sky.night ? "#8181a3" : "#f3e7d0", 0.045, PLAZA);
  flat(new THREE.RingGeometry(PLAZA.r - 0.7, PLAZA.r, 48), sky.night ? "#62628a" : "#d6c4a0", 0.05, PLAZA);
  flat(new THREE.RingGeometry(4.2, 4.8, 40), sky.night ? "#62628a" : "#d6c4a0", 0.05, PLAZA);
  flat(new THREE.PlaneGeometry(1400, ROAD.d), sky.night ? "#353a55" : "#5d6380", 0.02, { z: ROAD.z });
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.3), kit.paint("#ffffff", { basic: true }), 60);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 60; i += 1) {
    dummy.position.set(-240 + i * 8, 0.04, ROAD.z);
    dummy.rotation.set(-Math.PI / 2, 0, 0);
    dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  }
  scene.add(dashes);

  // Fence around the school, open at the gate.
  const fenceAt = FENCE;
  const posts = [];
  for (let x = fenceAt.minX; x <= fenceAt.maxX + 0.1; x += 4.2) {
    posts.push([x, fenceAt.minZ]);
    if (Math.abs(x - GATE.x) > GATE.w / 2 + 1) posts.push([x, fenceAt.maxZ]);
  }
  for (let z = fenceAt.minZ + 4.2; z < fenceAt.maxZ; z += 4.2) posts.push([fenceAt.minX, z], [fenceAt.maxX, z]);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), kit.paint("#ffffff"), posts.length);
  posts.forEach(([x, z], index) => {
    dummy.position.set(x, 1.1, z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    postMesh.setMatrixAt(index, dummy.matrix);
  });
  postMesh.castShadow = true;
  scene.add(postMesh);
  const fenceWidth = fenceAt.maxX - fenceAt.minX;
  const fenceDepth = fenceAt.maxZ - fenceAt.minZ;
  const sideWidth = (fenceWidth - GATE.w - 2.2) / 2;
  for (const y of [0.9, 1.8]) {
    scene.add(kit.box(fenceWidth, 0.16, 0.12, kit.paint("#ffffff"), { y, z: fenceAt.minZ }));
    scene.add(kit.box(0.12, 0.16, fenceDepth, kit.paint("#ffffff"), { x: fenceAt.minX, y, z: (fenceAt.minZ + fenceAt.maxZ) / 2 }));
    scene.add(kit.box(0.12, 0.16, fenceDepth, kit.paint("#ffffff"), { x: fenceAt.maxX, y, z: (fenceAt.minZ + fenceAt.maxZ) / 2 }));
    for (const side of [-1, 1]) scene.add(kit.box(sideWidth, 0.16, 0.12, kit.paint("#ffffff"), { x: side * (GATE.w / 2 + 1.1 + sideWidth / 2), y, z: fenceAt.maxZ }));
  }

  /* ---------- set pieces ---------- */

  const trees = TREES.map(([x, z, size], index) => kit.tree(x, z, size, index));
  // More trees outside the fence, so the school does not float in an empty field.
  for (let i = 0; i < 46; i += 1) {
    const angle = (i / 46) * Math.PI * 2;
    const reach = 1 + look() * 0.5;
    const x = Math.cos(angle) * 108 * reach;
    const z = 12 + Math.sin(angle) * 92 * reach;
    if (z > fenceAt.maxZ - 6 && z < ROAD.z + 30) continue;
    trees.push(kit.tree(x, z, 1.2 + look() * 0.9, i));
  }
  trees.forEach((tree) => scene.add(tree));
  LAMPS.forEach(([x, z]) => scene.add(kit.lamp(x, z)));
  BENCHES.forEach(([x, z, rotation]) => scene.add(kit.bench(x, z, rotation)));
  scene.add(kit.gate(GATE));
  const fountain = kit.fountain(PLAZA);
  const flag = kit.flag(FLAG);
  scene.add(fountain, flag, kit.pitch(PITCH), kit.court(COURT, HOOP_HEIGHT));
  scene.add(kit.bus(-26, ROAD.z - 2.3));

  const HOUSES = ["#f6d8c2", "#dfe9f7", "#f7edc9", "#e3f1df", "#f3d9e6"];
  const ROOFS = ["#c0563f", "#4b6cb7", "#b3562f", "#3f8f6b", "#8a5fbf"];
  for (let i = 0; i < 15; i += 1) {
    const w = 11 + look() * 7;
    const x = -190 + i * 27 + look() * 5;
    const z = ROAD.z + 15 + look() * 6;
    const tall = 7 + look() * 6;
    if (Math.abs(x) > 96) scene.add(kit.house(x, z, w, tall, 10, HOUSES[i % 5], ROOFS[(i * 2) % 5]));
  }
  // The street outside the gate: neighbours, the lake with its pier, and the tackle stall.
  for (const [x, z, w, tall, d, wall, roof] of NEIGHBOURS) scene.add(kit.house(x, z, w, tall, d, wall, roof, 1));
  const lake = kit.lake(LAKE);
  scene.add(lake, kit.pier(PIER, DECK), kit.stall(STALL));
  // Soft hills far away.
  const hillPaint = new THREE.MeshLambertMaterial({ color: new THREE.Color(sky.ground).lerp(new THREE.Color(sky.fog), 0.45), flatShading: true });
  for (let i = 0; i < 9; i += 1) {
    const hill = new THREE.Mesh(kit.shape("hill", () => new THREE.IcosahedronGeometry(1, 2)), hillPaint);
    const angle = Math.PI + (i / 8) * Math.PI;
    hill.position.set(Math.cos(angle) * 300, -6, -40 + Math.sin(angle) * 270);
    hill.scale.set(90 + look() * 60, 34 + look() * 30, 80 + look() * 40);
    scene.add(hill);
  }

  // Flower beds: around the plaza and along the avenue.
  const FLOWERS = ["#ff6b81", "#ffd23f", "#ffffff", "#ff9f43", "#c56cf0"];
  const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.15, 0), new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), 420);
  const tint = new THREE.Color();
  for (let i = 0; i < 420; i += 1) {
    let x;
    let z;
    if (i < 180) {
      const angle = look() * Math.PI * 2;
      const reach = PLAZA.r + 0.8 + look() * 1.8;
      x = PLAZA.x + Math.cos(angle) * reach;
      z = PLAZA.z + Math.sin(angle) * reach;
      if (Math.abs(x) < 5.2) x += Math.sign(x || 1) * 5.2;
    } else {
      x = (look() < 0.5 ? -1 : 1) * (4.9 + look() * 1.5);
      z = 24.5 + look() * 44;
      if (Math.abs(z - 47) < 3) z += 6;
    }
    dummy.position.set(x, 0.16 + look() * 0.1, z);
    dummy.rotation.set(look() * 3, look() * 3, 0);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, tint.set(FLOWERS[Math.floor(look() * FLOWERS.length)]));
  }
  scene.add(flowers);
  for (const building of BUILDINGS) {
    for (const side of [-1, 1]) scene.add(kit.bush(building.x + side * (building.w / 2 - 1.6), building.z + building.d / 2 + 1.1, 1 + look() * 0.3));
  }

  if (sky.night) {
    // Lamp light without real lamps: a glow in the air and a pool on the ground.
    const glow = glowTexture("rgba(255,224,140,0.95)", "rgba(255,200,90,0)");
    const pool = new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, z] of LAMPS) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.position.set(x, 5.05, z);
      halo.scale.setScalar(4.6);
      const light = new THREE.Mesh(kit.shape("pool", () => new THREE.CircleGeometry(6.5, 24)), pool);
      light.rotation.x = -Math.PI / 2;
      light.position.set(x, 0.07, z);
      scene.add(halo, light);
    }
  }

  /* ---------- schools ---------- */

  const colliders = buildColliders();
  const schools = BUILDINGS.map((spec) => {
    const group = kit.building(spec);
    scene.add(group);
    const sign = kit.label(spec.short, spec.roof);
    sign.position.set(spec.x, spec.h + (spec.kind === "main" ? 5.6 : 4.2), spec.z + spec.d / 2 + 2.4);
    sign.userData.size = sign.scale.clone();
    scene.add(sign);
    return { spec, group, sign, door: { id: spec.id, ...doorOf(spec) }, box: colliders.boxes.find((box) => box.id === spec.id), opacity: 1 };
  });
  const doors = schools.map((school) => school.door);
  const ring = kit.doorRing();
  scene.add(ring);

  /* ---------- people ---------- */

  const world = { graph: buildGraph(NODES, EDGES), weights: DOOR_WEIGHTS };
  const count = options.students ?? 28;
  const students = Array.from({ length: count }, (_, index) => {
    const state = createStudent(index, world, Math.random);
    // Run the clock forward so they start spread out along the paths.
    const warmUp = Math.random() * 30;
    for (let t = 0; t < warmUp; t += 0.1) stepStudent(state, 0.1, world, Math.random);
    const figure = kit.student(studentLook(look));
    figure.userData.size = figure.scale.x;
    scene.add(figure);
    return { state, figure, heading: state.heading, amount: 0, shown: state.hidden ? 0 : 1, greetIn: Math.random() * 8 };
  });

  const seated = (x, z, heading, lift = 0) => {
    const figure = kit.student(studentLook(look));
    seatStudent(figure);
    figure.position.x = x;
    figure.position.z = z;
    figure.position.y += lift;
    figure.rotation.y = heading;
    scene.add(figure);
    return figure;
  };

  // The outdoor class: a teacher at the board and six students on stools.
  const board = kit.blackboard("Hôm nay học gì?");
  board.position.set(OUTDOOR_CLASS.x, 0, OUTDOOR_CLASS.z - 7.4);
  scene.add(board);
  const teacher = kit.student({ girl: true, skin: "#eec39a", hair: "#1d1512", hairStyle: "bun", shirt: "#0ea5a0", bottom: "#1d2142", pack: "#000000", scarf: false, height: 1.12 }, { backpack: false });
  teacher.position.set(OUTDOOR_CLASS.x - 2.6, 0, OUTDOOR_CLASS.z - 5.9);
  teacher.rotation.y = 0.5;
  scene.add(teacher);
  for (let row = 0; row < 2; row += 1) {
    for (let seat = 0; seat < 3; seat += 1) {
      const x = OUTDOOR_CLASS.x + (seat - 1) * 2.3 + (row ? 0.6 : 0);
      const z = OUTDOOR_CLASS.z - 2.2 + row * 2.4;
      scene.add(kit.stool(x, z));
      seated(x, z, Math.PI);
      colliders.circles.push({ x, z, r: 0.6 });
    }
  }
  colliders.circles.push({ x: teacher.position.x, z: teacher.position.z, r: 0.6 });
  // Friends watching the match from the stands.
  [[-6, 0], [-3.5, 1], [1, 0], [3, 2], [6.5, 1]].forEach(([dx, step]) => seated(PITCH.x + dx, PITCH.z + PITCH.d / 2 + 3.2 + step, Math.PI, 0.1 + step * 0.6));

  const sporty = (shirt) => kit.student({ ...studentLook(look), girl: false, hairStyle: "short", shirt, bottom: "#ffffff", scarf: false, height: 0.96 }, { backpack: false });
  const football = createFootball(PITCH);
  const footballers = (options.online ? [] : football.players).map((player) => {
    const figure = sporty(player.team === 0 ? "#e5484d" : "#2f6fed");
    scene.add(figure);
    return figure;
  });
  const footballBall = kit.ball("football");
  const basketball = createBasketball(COURT, Math.random);
  const ballers = (options.online ? [] : basketball.players).map((player) => {
    const figure = sporty(player.slot % 2 ? "#7c5cff" : "#f5a524");
    scene.add(figure);
    return figure;
  });
  const basketBall = kit.ball("basketball");
  scene.add(footballBall, basketBall);

  const bubbles = GREETINGS.map((text) => ({ sprite: kit.bubble(text), owner: null, time: 0 }));
  bubbles.forEach((bubble) => scene.add(bubble.sprite));

  /* ---------- the player ---------- */

  const start = options.start || SPAWN;
  const player = { x: start.x, z: start.z, heading: start.heading ?? SPAWN.heading, stride: 0, amount: 0, vx: 0, vz: 0, lastStep: 0 };
  let hero = kit.student(options.profile ? characterLook(options.profile) : PLAYER_LOOK);
  let heroUniform = "";
  const nameTag = options.profile ? kit.label(options.profile.name, "#18a058") : null;
  if (nameTag) { nameTag.scale.multiplyScalar(0.62); scene.add(nameTag); }
  const marker = kit.marker();
  scene.add(hero, marker);
  const view = { yaw: options.start?.yaw ?? 0, pitch: 0.36, distance: 18, focus: new THREE.Vector3(player.x, 1.7, player.z) };
  let auto = null;

  /* ---------- fishing tackle: a rod in the hands, a line, a float on the water ---------- */

  const linePaint = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.85 });
  const tackleFor = (figure) => {
    const rod = kit.rod();
    rod.position.set(0.42, 1.2, 0.25);
    rod.rotation.x = 0.95;
    figure.add(rod);
    const float = kit.bobber();
    const line = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)), linePaint);
    line.frustumCulled = false;
    scene.add(float, line);
    return { rod, float, line, shown: false };
  };
  const tipSpot = new THREE.Vector3();
  /** Draws the tackle of one angler. `float` is where the float is, or null to put everything away. */
  const drawTackle = (tackle, figure, float) => {
    tackle.rod.visible = tackle.float.visible = tackle.line.visible = Boolean(float);
    if (!float) return;
    figure.userData.parts.armR.rotation.x = -1.25;
    figure.userData.parts.armL.rotation.x = -1.0;
    figure.updateMatrixWorld(true);
    tackle.rod.userData.tip.getWorldPosition(tipSpot);
    tackle.float.position.set(float.x, float.y, float.z);
    const points = tackle.line.geometry.attributes.position;
    points.setXYZ(0, tipSpot.x, tipSpot.y, tipSpot.z);
    points.setXYZ(1, float.x, float.y + 0.15, float.z);
    points.needsUpdate = true;
  };
  const myTackle = tackleFor(hero);
  drawTackle(myTackle, hero, null);
  const splash = kit.doorRing();
  splash.material = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  scene.add(splash);
  let fishing = null;      // { phase, since } while the player's line is out
  let splashAge = 9;

  // These figures represent signed-in browsers only. The strolling pupils
  // remain scenery and are never counted as connected people.
  const visitors = new Map();
  let lastSnapshot = null;
  let onlineScores = null;
  const scoreTags = new Map();
  const dropVisitor = (visitor) => {
    scene.remove(visitor.figure, visitor.tag);
    visitor.tag.material.map?.dispose();
    visitor.tag.material.dispose();
  };
  const makeVisitor = (state) => {
    const figure = kit.student(characterLook(state, state.sport, state.team), { backpack: !state.sport });
    const tag = kit.label(state.name, state.sport ? (state.team === 1 ? "#2f6fed" : "#e5484d") : "#18a058");
    tag.scale.multiplyScalar(0.62);
    figure.position.set(state.x, 0, state.z);
    figure.rotation.y = state.heading;
    scene.add(figure, tag);
    return { figure, tag, target: state, stride: 0, uniform: `${state.sport}:${state.team}:${state.gender}` };
  };
  // Biển trên sân: bước vào trong vạch là mở trận đầy đủ (11 người / 5 người).
  const showScore = (sport, _score, spec) => {
    const text = sport === "football" ? "Đá 11 người · bước vào sân" : "Bóng rổ 5 người · bước vào sân";
    const old = scoreTags.get(sport);
    if (old?.text === text) return;
    if (old) { scene.remove(old.tag); old.tag.material.map.dispose(); old.tag.material.dispose(); }
    const tag = kit.label(text, sport === "football" ? "#18a058" : "#f97316");
    tag.position.set(spec.x, 5.5, spec.z - spec.d / 2 - 1);
    scene.add(tag);
    scoreTags.set(sport, { tag, text });
  };

  /* ---------- camera control: drag to look around, wheel to zoom ---------- */

  let drag = null;
  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button > 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-dragging");
  };
  const onPointerMove = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    view.yaw -= (event.clientX - drag.x) * 0.006;
    view.pitch = clamp(view.pitch + (event.clientY - drag.y) * 0.004, 0.16, 1.25);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const onPointerUp = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    canvas.classList.remove("is-dragging");
  };
  const onWheel = (event) => {
    event.preventDefault();
    view.distance = clamp(view.distance * (event.deltaY > 0 ? 1.1 : 0.9), 8, 34);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  /* ---------- every frame ---------- */

  const sound = (name, at, reach = 46) => {
    if (!options.onSound) return;
    const far = Math.hypot(at.x - player.x, at.z - player.z);
    if (far < reach) options.onSound(name, clamp(1 - far / reach, 0.08, 1));
  };

  const cameraSpot = new THREE.Vector3();
  const headSpot = new THREE.Vector3();
  let near = null;
  let lastEnvironment = null;
  let mapTimer = 0;
  let clockTimer = 0;
  let elapsed = 0;
  let last = performance.now();
  let stopped = false;

  const setClock = () => {
    const now = new Date();
    for (const school of schools) {
      const hands = school.group.userData.clock;
      if (!hands) continue;
      hands.minute.rotation.z = -((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2;
      hands.hour.rotation.z = -(((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;
    }
  };
  setClock();

  const movePlayer = (dt) => {
    const before = { x: player.x, z: player.z };
    let direction = { x: 0, z: 0 };
    let speed = input.run ? RUN_SPEED : WALK_SPEED;
    if (auto) {
      // Walking through the door on its own after Enter.
      const dx = auto.x - player.x;
      const dz = auto.z - player.z;
      const gap = Math.hypot(dx, dz);
      auto.time += dt;
      if (gap < 0.25 || auto.time > 1.4) {
        const done = auto.done;
        auto.done = null;
        if (done) done();
      } else {
        direction = { x: dx / gap, z: dz / gap };
        const move = Math.min(gap, 6.5 * dt);
        player.x += direction.x * move;
        player.z += direction.z * move;
        speed = 6.5;
      }
    } else if (fishing) {
      // Keep the rod and line anchored while facing the open water.
      player.heading = turnToward(player.heading, 0, 9 * dt);
    } else {
      direction = steer(input, view.yaw);
      const next = moveWithCollisions(player, direction.x * speed * dt, direction.z * speed * dt, PLAYER_RADIUS, colliders, BOUNDS);
      player.x = next.x;
      player.z = next.z;
    }
    player.vx = (player.x - before.x) / dt;
    player.vz = (player.z - before.z) / dt;
    const own = options.online?.snapshot?.players.find((person) => person.id === options.online.snapshot.selfId);
    if (own?.sport) {
      const field = own.sport === "football" ? PITCH : COURT;
      player.x = clamp(player.x, field.x - field.w / 2 + PLAYER_RADIUS, field.x + field.w / 2 - PLAYER_RADIUS);
      player.z = clamp(player.z, field.z - field.d / 2 + PLAYER_RADIUS, field.z + field.d / 2 - PLAYER_RADIUS);
    }
    const moving = Math.hypot(direction.x, direction.z) > 0.05;
    if (moving) {
      player.heading = turnToward(player.heading, headingOf(direction.x, direction.z), 11 * dt);
      player.stride += dt * speed * 1.75;
      // A soft tap each time a foot lands.
      const step = Math.floor(player.stride / Math.PI);
      if (step !== player.lastStep) { player.lastStep = step; options.onSound?.("step", input.run ? 0.9 : 0.6); }
    }
    player.amount += ((moving ? 1 : 0) - player.amount) * ease(12, dt);
    hero.position.set(player.x, 0, player.z);
    hero.rotation.y = player.heading;
    hero.rotation.x = moving && input.run && !auto ? 0.12 : 0;
    if (auto) hero.scale.setScalar(Math.max(0.05, PLAYER_LOOK.height * (1 - auto.time / 1.1)));
    poseStudent(hero, player.stride, player.amount);
    marker.position.set(player.x, 2.95 + Math.sin(elapsed * 3.2) * 0.14, player.z);
    marker.rotation.y = elapsed * 2;
    marker.visible = !auto;
    if (nameTag) { nameTag.position.set(player.x, 3.65, player.z); nameTag.visible = !auto; }
  };

  const moveStudents = (dt) => {
    for (const student of students) {
      const { state, figure } = student;
      stepStudent(state, dt, world, Math.random);
      student.heading = turnToward(student.heading, state.heading, 7 * dt);
      student.amount += ((state.moving ? 1 : 0) - student.amount) * ease(10, dt);
      student.shown += ((state.hidden ? 0 : 1) - student.shown) * ease(9, dt);
      figure.visible = student.shown > 0.03;
      if (!figure.visible) continue;

      // Step aside a little rather than walk through the player.
      let x = state.x;
      let z = state.z;
      const dx = x - player.x;
      const dz = z - player.z;
      const gap = Math.hypot(dx, dz);
      if (gap < 1.3 && gap > 0.001) {
        x += (dx / gap) * (1.3 - gap);
        z += (dz / gap) * (1.3 - gap);
      }
      figure.position.set(x, 0, z);
      figure.rotation.y = student.heading;
      figure.scale.setScalar(figure.userData.size * student.shown);
      poseStudent(figure, state.stride, student.amount);

      // Say hello when the player walks close by.
      student.greetIn -= dt;
      if (gap < 3.4 && student.greetIn <= 0 && !state.hidden && !auto) {
        const free = bubbles.filter((bubble) => !bubble.owner);
        if (free.length) {
          const bubble = free[Math.floor(Math.random() * free.length)];
          bubble.owner = student;
          bubble.time = 2.4;
          bubble.sprite.visible = true;
          student.greetIn = 26 + Math.random() * 20;
          options.onSound?.("hello", 0.7);
        }
      }
      const head = figure.userData.parts.head;
      const talking = bubbles.some((bubble) => bubble.owner === student);
      const turn = talking ? clamp(angleDelta(student.heading, headingOf(-dx, -dz)), -1.1, 1.1) : 0;
      head.rotation.y += (turn - head.rotation.y) * ease(8, dt);
    }
    // Keep a little room between classmates, so a group does not melt into one blob.
    for (let i = 0; i < students.length; i += 1) {
      const a = students[i].state;
      if (a.hidden) continue;
      for (let j = i + 1; j < students.length; j += 1) {
        const b = students[j].state;
        if (b.hidden) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const gap = Math.hypot(dx, dz);
        if (gap >= 1.05 || gap < 0.001) continue;
        const push = Math.min(0.5, (1.05 - gap) * 5 * dt) / gap;
        a.x -= dx * push;
        a.z -= dz * push;
        b.x += dx * push;
        b.z += dz * push;
      }
    }
    for (const bubble of bubbles) {
      if (!bubble.owner) continue;
      bubble.time -= dt;
      const figure = bubble.owner.figure;
      bubble.sprite.position.set(figure.position.x, 3.25, figure.position.z);
      bubble.sprite.material.opacity = clamp(bubble.time * 3, 0, 1);
      if (bubble.time <= 0 || !figure.visible) { bubble.owner = null; bubble.sprite.visible = false; }
    }
  };

  const playOnline = (dt) => {
    const online = options.online;
    const snapshot = online.snapshot;
    const live = online.connected && snapshot;
    footballBall.visible = basketBall.visible = Boolean(live);
    if (!live) {
      for (const visitor of visitors.values()) dropVisitor(visitor);
      visitors.clear();
      for (const { tag } of scoreTags.values()) tag.visible = false;
      lastSnapshot = null;
      onlineScores = null;
      return;
    }
    for (const { tag } of scoreTags.values()) tag.visible = true;
    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      const alive = new Set();
      for (const state of snapshot.players) {
        if (state.id === snapshot.selfId) {
          const uniform = `${state.sport}:${state.team}:${state.gender}`;
          if (uniform !== heroUniform) {
            scene.remove(hero);
            hero = kit.student(characterLook(state, state.sport, state.team), { backpack: !state.sport });
            scene.add(hero);
            heroUniform = uniform;
          }
          continue;
        }
        alive.add(state.id);
        let visitor = visitors.get(state.id);
        const uniform = `${state.sport}:${state.team}:${state.gender}`;
        if (visitor && (visitor.uniform !== uniform || visitor.target.name !== state.name)) {
          dropVisitor(visitor);
          visitors.delete(state.id);
          visitor = null;
        }
        if (!visitor) { visitor = makeVisitor(state); visitors.set(state.id, visitor); }
        visitor.target = state;
        if (Math.hypot(visitor.figure.position.x - state.x, visitor.figure.position.z - state.z) > 12) visitor.figure.position.set(state.x, 0, state.z);
      }
      for (const [id, visitor] of visitors) if (!alive.has(id)) { dropVisitor(visitor); visitors.delete(id); }
      const scores = [snapshot.football.score, snapshot.basketball.score];
      if (onlineScores) {
        if (scores[0].some((value, i) => value > onlineScores[0][i])) sound("goal", PITCH);
        if (scores[1].some((value, i) => value > onlineScores[1][i])) sound("score", COURT);
      }
      onlineScores = scores.map((score) => [...score]);
      showScore("football", scores[0], PITCH);
      showScore("basketball", scores[1], COURT);
    }
    for (const visitor of visitors.values()) {
      const { figure, tag, target } = visitor;
      figure.position.x += (target.x - figure.position.x) * ease(18, dt);
      figure.position.z += (target.z - figure.position.z) * ease(18, dt);
      figure.rotation.y = turnToward(figure.rotation.y, target.heading, 12 * dt);
      visitor.stride += dt * (target.moving ? 15 : 0);
      poseStudent(figure, visitor.stride, target.moving ? 1 : 0);
      tag.position.set(figure.position.x, 3.35, figure.position.z);
    }
    const foot = snapshot.football.ball;
    const basket = snapshot.basketball.ball;
    const lerpBall = (ball, target, y) => {
      const position = new THREE.Vector3(target.x, y, target.z);
      if (ball.position.distanceTo(position) > 8) ball.position.copy(position);
      else ball.position.lerp(position, ease(22, dt));
    };
    lerpBall(footballBall, foot, foot.y ?? 0.36);
    lerpBall(basketBall, basket, basket.y ?? 0.36);
    footballBall.rotation.z -= (foot.vx || 0) * dt * 2.6;
    footballBall.rotation.x += (foot.vz || 0) * dt * 2.6;
    basketBall.rotation.x += dt * (snapshot.basketball.holder ? 2 : 6);
    const own = snapshot.players.find((item) => item.id === snapshot.selfId);
    if (own?.sport === "basketball" && snapshot.basketball.holder === own.id) {
      hero.userData.parts.armR.rotation.x = -1.2;
    }
  };

  const playGames = (dt) => {
    if (options.online) { playOnline(dt); return; }
    for (const name of stepFootball(football, dt, PITCH, Math.random, auto ? [] : [player])) sound(name === "goal" ? "goal" : "kick", football.ball);
    football.players.forEach((state, index) => {
      const figure = footballers[index];
      figure.position.set(state.x, 0, state.z);
      figure.rotation.y = turnToward(figure.rotation.y, state.heading, 9 * dt);
      poseStudent(figure, state.stride, state.moving ? 1 : 0);
    });
    footballBall.position.set(football.ball.x, 0.36, football.ball.z);
    footballBall.rotation.z -= football.ball.vx * dt * 2.6;
    footballBall.rotation.x += football.ball.vz * dt * 2.6;

    for (const name of stepBasketball(basketball, dt, COURT, Math.random)) {
      if (name === "bounce") sound("bounce", basketball.ball, 30);
      else if (name === "score") sound("score", basketball.ball, 36);
      else if (name === "rim") sound("rim", basketball.ball, 30);
    }
    basketball.players.forEach((state, index) => {
      const figure = ballers[index];
      figure.position.set(state.x, 0, state.z);
      figure.rotation.y = turnToward(figure.rotation.y, state.heading, 9 * dt);
      poseStudent(figure, state.stride, state.moving ? 1 : 0);
      const shooting = basketball.phase === "shot" && basketball.holder === index;
      if (shooting) figure.userData.parts.armL.rotation.x = figure.userData.parts.armR.rotation.x = -2.6;
    });
    basketBall.position.set(basketball.ball.x, basketball.ball.y, basketball.ball.z);
    basketBall.rotation.x += dt * 5;
  };

  /** The player's own line: flies out, floats, dips on a bite, zig-zags while reeling. */
  const drawFishing = (dt) => {
    if (myTackle.rod.parent !== hero) hero.add(myTackle.rod);
    splashAge += dt;
    splash.visible = splashAge < 0.7;
    if (splash.visible) {
      splash.scale.setScalar(0.25 + splashAge * 1.6);
      splash.material.opacity = 0.85 * (1 - splashAge / 0.7);
    }
    if (!fishing) { drawTackle(myTackle, hero, null); return; }
    const age = elapsed - fishing.since;
    const target = { x: player.x, y: 0.14, z: player.z + CAST_REACH };
    let float = target;
    if (fishing.phase === "cast") {
      const t = clamp(age / 0.55, 0, 1);
      float = { x: player.x, y: 0.14 + (1 - t) * 3 + Math.sin(Math.PI * t) * 2.2, z: player.z + 2.8 + (CAST_REACH - 2.8) * t };
      if (t >= 1 && !fishing.landed) { fishing.landed = true; splashAge = 0; splash.position.set(target.x, 0.12, target.z); sound("tick", target, 40); }
    } else if (fishing.phase === "wait") {
      float = { ...target, y: 0.14 + Math.sin(elapsed * 2.4) * 0.05 };
    } else if (fishing.phase === "nibble") {
      float = { ...target, y: 0.14 - Math.abs(Math.sin(age * 16)) * 0.12 };
    } else if (fishing.phase === "bite") {
      float = { ...target, y: -0.16 + Math.sin(age * 30) * 0.04 };
    } else if (fishing.phase === "reel") {
      const pull = clamp(fishing.progress ?? 0, 0, 1);
      float = { x: target.x + Math.sin(elapsed * 5.3) * 1.5 * (1 - pull * 0.5), y: -0.05 + Math.sin(elapsed * 11) * 0.06, z: player.z + CAST_REACH - pull * 4 };
      if (splashAge > 0.5) { splashAge = 0; splash.position.set(float.x, 0.12, float.z); }
    }
    drawTackle(myTackle, hero, float);
  };

  const dressScene = (dt) => {
    // Walls between the camera and the player turn see-through.
    headSpot.set(player.x, 1.6, player.z);
    for (const school of schools) {
      const hidden = segmentHitsBox(cameraSpot, headSpot, school.box);
      const target = hidden ? 0.1 : 1;
      if (Math.abs(target - school.opacity) > 0.004) {
        school.opacity += (target - school.opacity) * ease(9, dt);
        if (Math.abs(target - school.opacity) < 0.004) school.opacity = target;
        const clear = school.opacity < 0.995;
        for (const material of school.group.userData.materials) {
          if (!material.map && material.transparent !== clear) { material.transparent = clear; material.depthWrite = !clear; material.needsUpdate = true; }
          material.opacity = school.opacity;
        }
        school.group.traverse((object) => { if (object.isMesh) object.castShadow = !clear && object.userData.cast !== false; });
      }
      for (const spinner of school.group.userData.spinners) spinner.object.rotation.y += spinner.speed * dt;
      // Name tags help from far away; up close the board on the wall is enough.
      const far = Math.hypot(school.door.x - player.x, school.door.z - player.z);
      school.sign.material.opacity = clamp((far - 24) / 12, 0, 1);
      school.sign.visible = far > 24;
      school.sign.scale.copy(school.sign.userData.size).multiplyScalar(clamp(far / 44, 1, 2.1));
    }

    const environment = {
      atLake: !auto && Math.abs(player.x - LAKE.x) <= LAKE.w / 2 + 8 && Math.abs(player.z - LAKE.z) <= LAKE.d / 2 + 10,
      onDeck: !auto && onDeck(player),
      nearShop: !auto && Math.hypot(player.x - STALL.x, player.z - STALL.z) <= 5.5,
      // Stepping inside the lines of the pitch or the court opens the full match.
      field: auto ? null : fieldAt(player),
      nearField: auto ? null : fieldAt(player, -7),
    };
    if (!lastEnvironment || Object.keys(environment).some((key) => environment[key] !== lastEnvironment[key])) {
      lastEnvironment = environment;
      options.onEnvironment?.(environment);
    }

    const door = auto || fishing ? null : nearestDoor(player, doors, ENTER_RANGE);
    if ((door?.id || null) !== (near?.id || null)) {
      near = door;
      options.onNear?.(door ? schools.find((school) => school.door.id === door.id).spec : null);
    }
    ring.visible = Boolean(near);
    if (near) {
      ring.position.set(near.x, 0.1, near.z + 3.1);
      ring.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.08);
    }

    const cloth = flag.userData.cloth;
    const position = cloth.geometry.attributes.position;
    const rest = cloth.userData.rest;
    for (let i = 0; i < position.count; i += 1) {
      const reach = (rest[i * 3] + 2) / 4;
      position.setZ(i, Math.sin(elapsed * 3.4 - reach * 5) * 0.34 * reach);
    }
    position.needsUpdate = true;

    fountain.userData.drops.forEach((drop, index) => {
      const life = (elapsed * 0.9 + index / 14) % 1;
      const angle = (index / 14) * Math.PI * 2;
      const reach = life * 2.3;
      drop.position.set(Math.cos(angle) * reach, 3.1 + life * 2.2 - life * life * 4.3, Math.sin(angle) * reach);
    });

    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 340) cloud.position.x = -340;
    }
    // A tree standing between the camera and the player pulls its leaves in, so the player stays in view.
    const sx = headSpot.x - cameraSpot.x;
    const sz = headSpot.z - cameraSpot.z;
    const span = sx * sx + sz * sz || 1;
    for (const tree of trees) {
      tree.rotation.z = Math.sin(elapsed * 0.9 + tree.userData.sway) * 0.014;
      const along = ((tree.position.x - cameraSpot.x) * sx + (tree.position.z - cameraSpot.z) * sz) / span;
      let open = 1;
      if (along > 0.05 && along < 1.02) {
        const off = Math.hypot(cameraSpot.x + sx * along - tree.position.x, cameraSpot.z + sz * along - tree.position.z);
        if (off < tree.userData.reach) open = 0.28;
      }
      if (Math.abs(open - tree.userData.open) < 0.003) continue;
      tree.userData.open += (open - tree.userData.open) * ease(8, dt);
      // Both tufts shrink toward the top of the trunk, so they stay one small tree, not floating balls.
      for (const { part, size, at } of tree.userData.crown) {
        part.scale.copy(size).multiplyScalar(tree.userData.open);
        part.position.set(at.x * tree.userData.open, 2.75 + (at.y - 2.75) * tree.userData.open, at.z * tree.userData.open);
      }
    }

    clockTimer += dt;
    if (clockTimer > 5) { clockTimer = 0; setClock(); }
  };

  const moveCamera = (dt) => {
    const own = options.online?.snapshot?.players.find((person) => person.id === options.online.snapshot.selfId);
    const sport = own?.sport || null;
    if (sport !== view.sport) {
      view.sport = sport;
      view.pitch = sport ? 0.88 : 0.36;
      view.yaw = 0;
      view.distance = sport ? 40 : 18;
    }
    const field = sport === "football" ? PITCH : sport === "basketball" ? COURT : null;
    if (fishing && !field) view.yaw += angleDelta(view.yaw, Math.PI) * ease(2.2, dt);
    // A match uses a raised view of the whole field. Both goals, the other
    // players and the shared ball stay visible while the control dock is open.
    if (field) {
      const targetDistance = Math.max(30, (field.w + 8) / (Math.max(0.55, camera.aspect) * 0.88));
      view.distance += (targetDistance - view.distance) * ease(5, dt);
    }
    const focusX = field ? field.x : player.x;
    const focusZ = field ? field.z + field.d * 0.22 : player.z;
    view.focus.x += (focusX - view.focus.x) * ease(7, dt);
    view.focus.z += (focusZ - view.focus.z) * ease(7, dt);
    const flatReach = Math.cos(view.pitch) * view.distance;
    cameraSpot.set(view.focus.x + Math.sin(view.yaw) * flatReach, 1.7 + Math.sin(view.pitch) * view.distance, view.focus.z + Math.cos(view.yaw) * flatReach);
    camera.position.copy(cameraSpot);
    camera.lookAt(view.focus.x, 3.3, view.focus.z);
    heaven.position.set(cameraSpot.x, 0, cameraSpot.z);
    sun.target.position.set(player.x, 0, player.z);
    sun.position.copy(sunDirection).multiplyScalar(150).add(sun.target.position);
  };

  const frame = (now) => {
    if (stopped) return;
    // On a slow machine one drawn frame covers several short steps, so walking speed stays the same.
    let pending = clamp((now - last) / 1000, 0.001, 0.25);
    const total = pending;
    last = now;
    while (pending > 0.0005) {
      const dt = Math.min(pending, 0.05);
      pending -= dt;
      elapsed += dt;
      movePlayer(dt);
      moveStudents(dt);
      playGames(dt);
      moveCamera(dt);
    }
    drawFishing(total);
    dressScene(total);
    renderer.render(scene, camera);

    mapTimer += total;
    if (options.onMap && mapTimer > 0.1) {
      mapTimer = 0;
      const dots = [];
      for (const student of students) if (!student.state.hidden) dots.push(student.state.x, student.state.z);
      const people = options.online?.connected ? (options.online.snapshot?.players || []).filter((item) => item.id !== options.online.snapshot.selfId) : [];
      options.onMap({ x: player.x, z: player.z, heading: player.heading, yaw: view.yaw, students: dots, players: people });
    }
  };
  // Mark which meshes never cast shadows, so fading can restore the others.
  scene.traverse((object) => { if (object.isMesh && !object.castShadow) object.userData.cast = false; });
  renderer.setAnimationLoop(frame);

  return {
    /** Walks the player through the door of a building, then calls done(). */
    enter(id, done) {
      const school = schools.find((item) => item.spec.id === id);
      if (!school || auto) return false;
      auto = { x: school.door.x, z: school.door.z + 0.4, time: 0, done };
      near = null;
      ring.visible = false;
      return true;
    },
    /** The state of the player's fishing line: null, or { phase, progress }. */
    fishing(state) {
      if (!state) { fishing = null; return; }
      if (!fishing || fishing.phase !== state.phase) {
        if (state.phase === "bite" || state.phase === "nibble") { splashAge = 0; splash.position.set(player.x, 0.12, player.z + CAST_REACH); }
        fishing = { ...state, since: elapsed, landed: state.phase !== "cast" };
      } else fishing.progress = state.progress;
    },
    /** Stops drawing while the next page loads, so the browser is free to load it. */
    pause() {
      renderer.setAnimationLoop(null);
    },
    /** Back on the campus after an "enter" that did not leave the page: stand in front of the door again. */
    resume() {
      if (stopped) return;
      if (auto) {
        player.z = auto.z + 2.8;
        player.heading = 0;
        auto = null;
      }
      hero.scale.setScalar(PLAYER_LOOK.height);
      last = performance.now();
      renderer.setAnimationLoop(frame);
    },
    /** How much is being drawn (for checking performance while developing). */
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    },
    /** Where the player stands, to come back to the same spot later. */
    where() {
      return { x: player.x, z: player.z, heading: player.heading, yaw: view.yaw, moving: player.amount > 0.2 };
    },
    /** Correct an acknowledged move without changing the camera or discarding later input. */
    reconcile(accepted, sent) {
      if (auto) return;
      const safe = reconcilePosition(player, accepted, sent, PLAYER_RADIUS, colliders, BOUNDS);
      player.x = safe.x;
      player.z = safe.z;
      hero.position.set(player.x, 0, player.z);
    },
    /** Only server-approved joins/reconnects should move a character instantly. */
    teleport(at) {
      if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return;
      const safe = moveWithCollisions({ x: at.x, z: at.z }, 0, 0, PLAYER_RADIUS, colliders, BOUNDS);
      player.x = safe.x;
      player.z = safe.z;
      if (Number.isFinite(at.heading)) player.heading = at.heading;
      player.vx = player.vz = 0;
      auto = null;
      hero.position.set(player.x, 0, player.z);
      view.focus.set(player.x, 1.7, player.z);
      view.yaw = 0;
      view.distance = at.sport ? 23 : 18;
    },
    aimAt(at) {
      if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) player.heading = headingOf(at.x - player.x, at.z - player.z);
    },
    stop() {
      stopped = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      const seen = new Set();
      scene.traverse((object) => {
        if (object.geometry && !seen.has(object.geometry)) { seen.add(object.geometry); object.geometry.dispose(); }
        for (const material of [].concat(object.material || [])) {
          if (seen.has(material)) continue;
          seen.add(material);
          material.map?.dispose();
          material.dispose();
        }
      });
      kit.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
};
