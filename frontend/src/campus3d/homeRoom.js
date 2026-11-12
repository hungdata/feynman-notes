/**
 * Inside your house: one room seen like a doll's house, with a desk to read
 * at, a bed, and shelves full of books. Built from the same simple shapes as
 * the campus; you walk around it with the same arrow keys.
 */
import * as THREE from "three";
import { headingOf, moveWithCollisions, nearestDoor, steer, turnToward } from "./movement.js";
import { PLAYER_LOOK, canvasTexture, createKit, poseStudent, seatStudent } from "./builders.js";
import { SKIES } from "./world.js";

export const ROOM = { w: 14, d: 10, h: 6 };
/** How far the upstairs floor is above the downstairs one. */
export const FLOOR_H = 7;
const WALK = 4.4;
const BOUNDS = { minX: -ROOM.w / 2 + 0.2, maxX: ROOM.w / 2 - 0.2, minZ: -ROOM.d / 2 + 0.2, maxZ: ROOM.d / 2 - 0.3 };
const STAIRS = { minX: -7, maxX: -5.3, minZ: -5, maxZ: 1.6 };

/** Places to do something, per floor (0 downstairs, 1 upstairs). Stand near one and press Enter. */
export const SPOTS = [
  [
    { id: "shelf", x: 3.6, z: -3.2, label: "Xem kệ sách" },
    { id: "bed", x: 3.3, z: -0.4, label: "Đi ngủ" },
    { id: "door", x: -5.6, z: 3.3, label: "Ra ngoài" },
    { id: "up", x: -6.1, z: 2.2, label: "Lên tầng 2" },
  ],
  [
    { id: "desk", x: 0, z: -2.6, label: "Ngồi học bên cửa sổ" },
    { id: "down", x: -4.6, z: 0.4, label: "Xuống tầng 1" },
  ],
];
const COLLIDERS = [
  {
    boxes: [
      STAIRS,
      { minX: 1.5, maxX: 5.7, minZ: -5, maxZ: -4 },         // bookshelf
      { minX: 4, maxX: 7, minZ: -3, maxZ: 1.6 },            // bed
      { minX: -3.6, maxX: 0.6, minZ: -5, maxZ: -4.5 },      // low shelf under the window
    ],
    circles: [{ x: 0.9, z: -4.2, r: 0.5 }, { x: 6.2, z: 3.9, r: 0.7 }],
  },
  {
    boxes: [
      STAIRS,                                               // the stairwell, behind its railing
      { minX: -1.9, maxX: 1.9, minZ: -5, maxZ: -3.45 },     // the desk at the window
      { minX: 6, maxX: 7, minZ: -3.6, maxZ: 0.6 },          // bookcase on the right wall
    ],
    circles: [{ x: 5.9, z: -4.2, r: 0.6 }, { x: -3.4, z: -4.3, r: 0.55 }, { x: 4.6, z: 3.6, r: 0.9 }],
  },
];
const BOOK_COLORS = ["#e5484d", "#2f6fed", "#18a058", "#f5a524", "#7c5cff", "#0ea5e9", "#f472b6", "#ff8a3d", "#3f8f6b", "#b5543a", "#4b6cb7", "#d9a441"];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// Where the camera sits: the whole room while walking, over your shoulder and out of the window
// while you study upstairs, close on the bed while you sleep. Heights are relative to the floor you are on.
const SHOTS = {
  room: { at: [0, 0.6, 0.8], look: [0, 1.2, 0.4] },
  // Up high behind the chair and tilted down, so it feels like looking out from the second floor:
  // the yard and the lamps of the lane are below you, the fields run out to the hills.
  desk: { from: [1.7, 4.5, 1.4], look: [-0.7, -1.6, -26], fov: 48 },
  bed: { from: [1.2, 5.2, 3.6], look: [5.3, 1, -0.8] },
};

/**
 * options.look   how you look (from the campus)   options.sky "morning" | "day" | "evening" | "night"
 * options.input { x, y }               options.floor 0 | 1 - where to start
 * options.onNear (spot | null)         options.onSound (name, level)
 * Returns { doing(what), floor(level), stop() } where what is null, "read" or "sleep".
 */
export const startRoom = (container, options) => {
  const skyName = SKIES[options.sky] ? options.sky : "day";
  const colors = SKIES[skyName];
  const night = skyName === "night";
  const dusk = night || skyName === "evening";
  const kit = createKit({ ...colors, night: false });
  const random = seeded(77);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "c3-canvas hm-canvas";
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const indoors = new THREE.Color(night ? "#141a38" : "#e9edf7");
  const horizon = new THREE.Color(colors.bottom);
  scene.background = indoors;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 700);

  const sky = new THREE.HemisphereLight("#ffffff", "#cbb89a", night ? 0.75 : 1.25);
  const lamp = new THREE.DirectionalLight(night ? "#ffd9a0" : "#fff4dd", night ? 1.5 : 2.3);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  Object.assign(lamp.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  lamp.shadow.bias = -0.0006;
  lamp.shadow.normalBias = 0.03;
  scene.add(sky, lamp, lamp.target);

  const { box, mesh, paint, shape } = kit;
  // Everything is built into one of three groups, so a whole floor can be shown or hidden at once.
  const ground = new THREE.Group();
  const upper = new THREE.Group();
  const outdoor = new THREE.Group();
  upper.position.y = FLOOR_H;
  scene.add(ground, upper, outdoor);
  let into = ground;
  const add = (...objects) => { into.add(...objects); return objects[0]; };

  const glowTexture = canvasTexture(128, 128, (ctx, w) => {
    const gradient = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gradient.addColorStop(0, "rgba(255,226,150,0.9)");
    gradient.addColorStop(1, "rgba(255,210,120,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, w);
  });
  const glows = [];
  /** A soft halo around a bulb. `power` is how bright it is by day; at dusk every bulb is at full glow. */
  const halo = (x, y, z, size, power = 0.4) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    // Full glow only at night; in the evening light a lamp shines softly instead of flaring.
    sprite.userData.power = night ? 1 : dusk ? Math.max(power, 0.42) : power;
    glows.push(sprite);
    return sprite;
  };

  /* ---------- floors and walls ---------- */

  const planks = canvasTexture(512, 512, (ctx, w, h) => {
    for (let row = 0; row < 8; row += 1) {
      for (let col = -1; col < 3; col += 1) {
        const tone = 150 + Math.round(random() * 26);
        ctx.fillStyle = `rgb(${tone + 50}, ${tone + 6}, ${tone - 46})`;
        ctx.fillRect(col * 220 + (row % 2) * 110, row * (h / 8), 216, h / 8 - 3);
      }
    }
    ctx.fillStyle = "rgba(90, 60, 30, 0.35)";
    for (let row = 1; row < 8; row += 1) ctx.fillRect(0, row * (w / 8) - 3, w, 3);
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(2.4, 1.7);
  const floorPaint = new THREE.MeshLambertMaterial({ map: planks });
  const wall = paint("#f6ead3");
  const skirting = paint("#ffffff");
  const wood = paint("#a9794d");
  const dark = paint("#8d5a3b");
  const back = -ROOM.d / 2;
  const left = -ROOM.w / 2;

  /** Floor boards, the two side walls and the skirting: the same on both floors. */
  const shell = () => {
    const floor = mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), floorPaint, { cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    add(floor, box(ROOM.w + 0.8, 0.5, ROOM.d + 0.8, paint("#8d6a4b"), { y: -0.26, cast: false }));
    add(box(0.4, ROOM.h, ROOM.d, wall, { x: left - 0.2, y: ROOM.h / 2, receive: true }), box(0.4, ROOM.h, ROOM.d, wall, { x: -left + 0.2, y: ROOM.h / 2, receive: true }));
    add(box(0.12, 0.35, ROOM.d, skirting, { x: left + 0.06, y: 0.18, cast: false }), box(0.12, 0.35, ROOM.d, skirting, { x: -left - 0.06, y: 0.18, cast: false }));
  };

  /* ---------- books ---------- */

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let bookSlots = [];
  /** A row of books standing on a shelf from x0 to x1. */
  const row = (x0, x1, y, z) => {
    let x = x0;
    while (x < x1 - 0.12) {
      const thick = 0.12 + random() * 0.14;
      const tall = 0.62 + random() * 0.3;
      bookSlots.push({ x: x + thick / 2, y: y + tall / 2, z, thick, tall, deep: 0.5 + random() * 0.12, lean: random() < 0.08 ? 0.22 : 0, turn: 0 });
      x += thick + 0.015;
    }
  };
  /** The same along a side wall, from z0 to z1. */
  const sideRow = (z0, z1, y, x) => {
    for (let z = z0; z < z1; z += 0.18 + random() * 0.12) bookSlots.push({ x, y: y + 0.36, z, thick: 0.13 + random() * 0.08, tall: 0.72, deep: 0.5, lean: 0, turn: Math.PI / 2 });
  };
  /** A pile of books lying flat. */
  const pile = (x, z, count, y = 0) => {
    for (let i = 0; i < count; i += 1) bookSlots.push({ x: x + (random() - 0.5) * 0.1, y: y + 0.09 + i * 0.17, z: z + (random() - 0.5) * 0.1, thick: 0.72, tall: 0.16, deep: 0.52, lean: 0, turn: random() * 0.6 - 0.3 });
  };
  /** Turns the books placed so far into one mesh of the floor being built. */
  const shelveBooks = () => {
    const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#ffffff" }), bookSlots.length);
    bookSlots.forEach((slot, index) => {
      dummy.position.set(slot.x, slot.y, slot.z);
      dummy.rotation.set(0, slot.turn, slot.lean);
      dummy.scale.set(slot.thick, slot.tall, slot.deep);
      dummy.updateMatrix();
      books.setMatrixAt(index, dummy.matrix);
      books.setColorAt(index, tint.set(BOOK_COLORS[Math.floor(random() * BOOK_COLORS.length)]));
    });
    books.castShadow = true;
    add(books);
    bookSlots = [];
  };

  /* ====================== downstairs: bed, bookshelf, the stairs ====================== */

  shell();
  add(box(ROOM.w + 0.8, ROOM.h, 0.4, wall, { y: ROOM.h / 2, z: back - 0.2, receive: true }));
  add(box(ROOM.w, 0.35, 0.12, skirting, { y: 0.18, z: back + 0.06, cast: false }));

  // A small window in the back wall: the sky outside matches the time of day.
  const outside = canvasTexture(256, 192, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, colors.top);
    gradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = night ? "#f4f6ff" : "#fff6c9";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.3, night ? 16 : 22, 0, Math.PI * 2);
    ctx.fill();
    if (night) for (let i = 0; i < 26; i += 1) ctx.fillRect(random() * w, random() * h * 0.6, 2, 2);
    ctx.fillStyle = night ? "#22405a" : "#7cc35a";
    ctx.fillRect(0, h * 0.78, w, h);
  });
  add(box(4.1, 3.1, 0.14, paint("#ffffff"), { x: -1.5, y: 3.5, z: back + 0.07, cast: false }));
  add(mesh(new THREE.PlaneGeometry(3.7, 2.7), new THREE.MeshBasicMaterial({ map: outside }), { x: -1.5, y: 3.5, z: back + 0.15, cast: false }));
  add(box(0.1, 2.7, 0.06, paint("#ffffff"), { x: -1.5, y: 3.5, z: back + 0.18, cast: false }), box(3.7, 0.1, 0.06, paint("#ffffff"), { x: -1.5, y: 3.5, z: back + 0.18, cast: false }));
  for (const side of [-1, 1]) add(box(0.7, 3.5, 0.12, paint("#ff8fa3"), { x: -1.5 + side * 2.35, y: 3.45, z: back + 0.24 }));
  add(box(5.6, 0.14, 0.2, dark, { x: -1.5, y: 5.25, z: back + 0.24 }));

  // The door back to the street, in the left wall.
  add(box(0.16, 4.3, 2.5, paint("#7a3b28"), { x: left + 0.08, y: 2.15, z: 3.3, cast: false }), box(0.2, 4, 2.2, paint("#b5754a"), { x: left + 0.12, y: 2, z: 3.3, cast: false }));
  add(mesh(shape("knob", () => new THREE.SphereGeometry(0.11, 10, 8)), paint("#f5c542"), { x: left + 0.3, y: 2, z: 2.5, cast: false }));
  add(box(1.5, 0.05, 2, paint("#3f8f6b"), { x: left + 1, y: 0.03, z: 3.3, cast: false, receive: true }));

  // The stairs along the left wall, up to the study.
  const steps = 12;
  for (let i = 0; i < steps; i += 1) {
    const rise = ((i + 1) / steps) * FLOOR_H;
    add(box(1.6, rise, (STAIRS.maxZ - STAIRS.minZ) / steps, i % 2 ? wood : dark, { x: left + 0.85, y: rise / 2, z: STAIRS.maxZ - ((i + 0.5) / steps) * (STAIRS.maxZ - STAIRS.minZ), receive: true }));
  }
  const rail = box(0.1, 0.12, 9.6, dark, { x: left + 1.68, y: FLOOR_H / 2 + 1.5, z: (STAIRS.minZ + STAIRS.maxZ) / 2 });
  rail.rotation.x = Math.atan2(FLOOR_H, STAIRS.maxZ - STAIRS.minZ);
  add(rail);
  const upArrow = mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTexture(128, 128, (ctx, w) => {
    ctx.strokeStyle = "#ffd23f";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(30, 78);
    ctx.lineTo(w / 2, 40);
    ctx.lineTo(w - 30, 78);
    ctx.stroke();
  }) }), { x: left + 0.85, y: 0.62, z: STAIRS.maxZ + 0.02, cast: false });
  add(upArrow);

  // A round rug in the middle.
  const rugTexture = canvasTexture(256, 256, (ctx, w) => {
    ["#2f6fed", "#f6ead3", "#f5a524", "#f6ead3", "#e5484d"].forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w / 2, w / 2, w / 2 - index * 24, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  const rugPaint = new THREE.MeshLambertMaterial({ map: rugTexture });
  const rug = mesh(new THREE.CircleGeometry(2.6, 40), rugPaint, { x: 0.6, y: 0.02, z: 1.2, cast: false, receive: true });
  rug.rotation.x = -Math.PI / 2;
  add(rug);

  // The tall bookshelf on the back wall, a low one under the window, and piles on the floor.
  const shelfX = 3.6;
  add(box(4.2, 5, 0.12, dark, { x: shelfX, y: 2.5, z: back + 0.08 }));
  for (const side of [-1, 1]) add(box(0.16, 5, 0.9, wood, { x: shelfX + side * 2.02, y: 2.5, z: back + 0.47 }));
  for (let level = 0; level < 5; level += 1) {
    const y = 0.12 + level * 1.18;
    add(box(4.2, 0.12, 0.9, wood, { x: shelfX, y, z: back + 0.47 }));
    if (level < 4) row(shelfX - 1.9, shelfX + (level === 2 ? 0.9 : 1.9), y + 0.06, back + 0.5);
  }
  add(box(4.2, 0.12, 0.9, wood, { x: shelfX, y: 4.96, z: back + 0.47 }));
  pile(shelfX + 1.45, back + 0.5, 3, 2.54);
  add(box(4, 1.1, 0.5, wood, { x: -1.5, y: 0.55, z: back + 0.27 }));
  row(-3.4, 0.4, 1.1, back + 0.3);
  pile(-3.1, -3.6, 5);
  pile(0.9, -4.2, 4);
  pile(-2.2, 3.6, 3);
  pile(2.2, 3.4, 6);
  pile(6.2, 3.9, 7);
  shelveBooks();

  const bedX = 5.5;
  add(box(2.9, 0.5, 4.5, dark, { x: bedX, y: 0.35, z: -0.7 }), box(2.9, 1.5, 0.2, dark, { x: bedX, y: 0.95, z: -2.9 }));
  add(box(2.7, 0.4, 4.3, paint("#ffffff"), { x: bedX, y: 0.8, z: -0.7, receive: true }));
  add(box(1.8, 0.26, 0.9, paint("#dfe9f7"), { x: bedX, y: 1.12, z: -2.25 }));
  const blanket = box(2.76, 0.62, 2.9, paint("#2f6fed"), { x: bedX, y: 1.26, z: 0 });
  add(blanket, box(2.76, 0.54, 0.5, paint("#ffffff"), { x: bedX, y: 1.2, z: -1.5 }));
  // A bedside lamp, lit in the evening.
  add(box(0.9, 1, 0.9, wood, { x: 3.4, y: 0.5, z: -3.4 }), mesh(shape("shade", () => new THREE.CylinderGeometry(0.26, 0.4, 0.5, 12)), paint("#fff0c2", { basic: true }), { x: 3.4, y: 1.65, z: -3.4, cast: false }), box(0.08, 0.5, 0.08, dark, { x: 3.4, y: 1.2, z: -3.4 }), halo(3.4, 1.7, -3.3, 3.4, 0.3));

  /* ====================== upstairs: the study at the big window ====================== */

  into = upper;
  shell();
  // The back wall is mostly window: a low wall under it, a beam over it, a pillar at each end.
  const WINDOW = { half: 4.6, sill: 1.45, top: 5 };
  add(box(ROOM.w + 0.8, WINDOW.sill, 0.4, wall, { y: WINDOW.sill / 2, z: back - 0.2, receive: true }));
  add(box(ROOM.w + 0.8, ROOM.h - WINDOW.top, 0.4, wall, { y: (ROOM.h + WINDOW.top) / 2, z: back - 0.2 }));
  for (const side of [-1, 1]) add(box(ROOM.w / 2 - WINDOW.half + 0.4, WINDOW.top - WINDOW.sill, 0.4, wall, { x: side * (ROOM.w / 2 + WINDOW.half + 0.4) / 2, y: (WINDOW.top + WINDOW.sill) / 2, z: back - 0.2 }));
  const framePaint = paint("#ffffff");
  add(box(WINDOW.half * 2 + 0.4, 0.2, 0.7, dark, { y: WINDOW.sill + 0.02, z: back - 0.05 }));                // the sill
  add(box(WINDOW.half * 2 + 0.3, 0.16, 0.5, framePaint, { y: WINDOW.top, z: back - 0.15, cast: false }));
  for (const x of [-WINDOW.half, -WINDOW.half / 3, WINDOW.half / 3, WINDOW.half]) add(box(0.14, WINDOW.top - WINDOW.sill, 0.3, framePaint, { x, y: (WINDOW.top + WINDOW.sill) / 2, z: back - 0.2, cast: false }));
  add(box(ROOM.w, 0.35, 0.12, skirting, { y: 0.18, z: back + 0.06, cast: false }));

  // The stairwell: a dark opening with a railing round it.
  const well = mesh(new THREE.PlaneGeometry(STAIRS.maxX - STAIRS.minX - 0.1, STAIRS.maxZ - STAIRS.minZ), paint("#3b2a20", { basic: true }), { x: (STAIRS.minX + STAIRS.maxX) / 2, y: 0.03, z: (STAIRS.minZ + STAIRS.maxZ) / 2, cast: false });
  well.rotation.x = -Math.PI / 2;
  add(well);
  add(box(0.1, 0.12, STAIRS.maxZ - STAIRS.minZ, dark, { x: STAIRS.maxX, y: 1.5, z: (STAIRS.minZ + STAIRS.maxZ) / 2 }));
  for (let z = STAIRS.minZ + 0.3; z <= STAIRS.maxZ; z += 1.05) add(box(0.1, 1.5, 0.1, dark, { x: STAIRS.maxX, y: 0.75, z }));

  // The desk, right under the window, and the chair facing out.
  add(box(3.6, 0.12, 1.4, wood, { y: 1.02, z: -4.2, receive: true }));
  for (const dx of [-1.7, 1.7]) add(box(0.12, 0.96, 1.3, dark, { x: dx, y: 0.48, z: -4.2 }));
  add(box(0.5, 0.06, 0.5, paint("#3a4466"), { x: -1.35, y: 1.11, z: -4.45 }));
  const arm = box(0.07, 1, 0.07, paint("#3a4466"), { x: -1.3, y: 1.6, z: -4.4 });
  arm.rotation.z = -0.35;
  const shade = mesh(new THREE.ConeGeometry(0.34, 0.4, 14, 1, true), new THREE.MeshLambertMaterial({ color: "#f5a524", side: THREE.DoubleSide }), { x: -1, y: 2.12, z: -4.3 });
  shade.rotation.set(0.2, 0, 0.5);
  add(arm, shade, mesh(new THREE.SphereGeometry(0.13, 10, 8), paint("#fff3c4", { basic: true }), { x: -0.95, y: 1.98, z: -4.28, cast: false }), halo(-0.7, 1.7, -4.1, 3.6, 0.45));
  pile(1.25, -4.3, 4, 1.08);
  pile(-0.75, -4.55, 2, 1.08);
  add(mesh(shape("cup", () => new THREE.CylinderGeometry(0.13, 0.11, 0.3, 10)), paint("#2f6fed"), { x: 0.75, y: 1.23, z: -4.5 }));
  // The open book; its top page turns while you read, and the wind keeps lifting its corner.
  const openBook = new THREE.Group();
  openBook.position.set(0, 1.1, -3.95);
  openBook.add(box(0.95, 0.05, 0.62, paint("#2f6fed"), { cast: false }));
  for (const side of [-1, 1]) openBook.add(box(0.44, 0.04, 0.56, paint("#fffdf5"), { x: side * 0.225, y: 0.04, cast: false }));
  const hinge = new THREE.Group();
  hinge.position.y = 0.07;
  hinge.add(box(0.42, 0.012, 0.54, paint("#ffffff"), { x: 0.21, cast: false }));
  openBook.add(hinge);
  add(openBook);
  const chair = new THREE.Group();
  chair.position.set(0, 0, -2.85);
  chair.add(box(0.95, 0.1, 0.95, paint("#e5484d"), { y: 0.5 }), box(0.95, 1.1, 0.1, paint("#e5484d"), { y: 1.05, z: 0.47 }));
  for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) chair.add(box(0.08, 0.5, 0.08, dark, { x: dx, y: 0.25, z: dz }));
  add(chair);

  // A bookcase on the right wall, plants, a floor cushion on a rug.
  add(box(0.1, 4.1, 3.9, dark, { x: -left - 0.06, y: 2.05, z: -1.5 }));
  for (const z of [-3.45, 0.45]) add(box(0.9, 4.1, 0.12, wood, { x: -left - 0.5, y: 2.05, z }));
  for (let shelf = 0; shelf < 5; shelf += 1) {
    add(box(0.9, 0.1, 3.9, wood, { x: -left - 0.5, y: 0.1 + shelf * 1, z: -1.5 }));
    if (shelf < 4) sideRow(-3.3, 0.3, 0.15 + shelf * 1, -left - 0.5);
  }
  pile(-3.4, 2.6, 5);
  pile(2.9, -4.2, 6);
  pile(5.6, 2.2, 4);
  shelveBooks();
  for (const [x, z] of [[5.9, -4.2], [-3.4, -4.3]]) {
    add(mesh(shape("pot", () => new THREE.CylinderGeometry(0.45, 0.34, 0.7, 12)), paint("#d9773d"), { x, y: 0.35, z }));
    for (let i = 0; i < 5; i += 1) {
      const leaf = mesh(shape("leaf", () => new THREE.IcosahedronGeometry(0.5, 0)), paint(i % 2 ? "#3fa35c" : "#2f9153", { flat: true }), { x: x + Math.cos(i * 1.3) * 0.3, y: 1 + i * 0.28, z: z + Math.sin(i * 1.3) * 0.3 });
      leaf.scale.set(0.9, 1.3, 0.9);
      add(leaf);
    }
  }
  const rug2 = mesh(new THREE.CircleGeometry(2.2, 40), rugPaint, { x: 3.6, y: 0.02, z: 2.6, cast: false, receive: true });
  rug2.rotation.x = -Math.PI / 2;
  const cushion = mesh(shape("cushion", () => new THREE.SphereGeometry(0.9, 14, 10)), paint("#f5a524"), { x: 4.6, y: 0.4, z: 3.6 });
  cushion.scale.y = 0.5;
  add(rug2, cushion);

  /* ---------- things the wind moves indoors: curtains, bulbs, a pinwheel ---------- */

  const curtainPaint = new THREE.MeshLambertMaterial({ color: "#fff6e0", side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  const curtains = [-1, 1].map((side) => {
    const cloth = mesh(new THREE.PlaneGeometry(1.7, WINDOW.top - WINDOW.sill + 0.5, 7, 10), curtainPaint, { x: side * (WINDOW.half + 0.2), y: (WINDOW.top + WINDOW.sill) / 2 - 0.1, z: back + 0.35, cast: false });
    cloth.userData = { rest: cloth.geometry.attributes.position.array.slice(), side };
    add(cloth);
    return cloth;
  });
  add(box(WINDOW.half * 2 + 2.6, 0.12, 0.12, dark, { y: WINDOW.top + 0.28, z: back + 0.36 }));

  // A string of bulbs across the top of the window.
  const strung = [];
  const wire = [];
  for (let i = 0; i <= 10; i += 1) {
    const u = i / 10;
    const at = new THREE.Vector3(-WINDOW.half + u * WINDOW.half * 2, WINDOW.top - 0.25 - Math.sin(Math.PI * u) * 0.45, back + 0.6);
    wire.push(at);
    if (i === 0 || i === 10) continue;
    const bulb = new THREE.Group();
    bulb.position.copy(at);
    bulb.add(box(0.03, 0.22, 0.03, paint("#3a4466"), { y: -0.11, cast: false }), mesh(shape("bulb", () => new THREE.SphereGeometry(0.13, 10, 8)), paint(["#ffe08a", "#ffb37a", "#fff3c4"][i % 3], { basic: true }), { y: -0.3, cast: false }), halo(0, -0.3, 0, 1.1, 0.3));
    strung.push(bulb);
    add(bulb);
  }
  add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: "#3a4466" })));

  // Three bulbs hanging from a beam, swaying a little. While you study they are put away,
  // so nothing hangs between you and the view.
  add(box(ROOM.w, 0.26, 0.3, dark, { y: ROOM.h - 0.2, z: -1.2 }));
  const pendants = [-3.2, 0.4, 3.9].map((x, index) => {
    const pendant = new THREE.Group();
    pendant.position.set(x, ROOM.h - 0.3, -1.2);
    const drop = 1.3 + (index % 2) * 0.5;
    pendant.add(box(0.035, drop, 0.035, paint("#2a2a33"), { y: -drop / 2, cast: false }), mesh(shape("cap", () => new THREE.CylinderGeometry(0.09, 0.12, 0.16, 8)), paint("#3a4466"), { y: -drop, cast: false }), mesh(shape("bigBulb", () => new THREE.SphereGeometry(0.2, 12, 10)), paint("#ffe9a8", { basic: true }), { y: -drop - 0.24, cast: false }), halo(0, -drop - 0.24, 0, 3.2, 0.3));
    add(pendant);
    return pendant;
  });

  // A paper pinwheel on the sill.
  const pinwheel = new THREE.Group();
  pinwheel.position.set(3.6, WINDOW.sill + 1.1, back + 0.05);
  ["#e5484d", "#f5a524", "#18a058", "#2f6fed"].forEach((color, index) => {
    const blade = mesh(shape("blade", () => new THREE.CircleGeometry(0.42, 3, 0, Math.PI * 0.6).translate(0.02, 0.02, 0)), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }), { cast: false });
    blade.rotation.z = (index / 4) * Math.PI * 2;
    pinwheel.add(blade);
  });
  add(pinwheel, box(0.05, 1.1, 0.05, dark, { x: 3.6, y: WINDOW.sill + 0.55, z: back }));

  /* ====================== outside: rice fields in the wind ====================== */

  into = outdoor;
  const wind = { value: 0 };
  /** Makes a material bend with the wind: the higher a point is above its root, the further it leans. */
  const windy = (material, bend) => {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind;
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`.replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 root = instanceMatrix[3].xz;
        #else
          vec2 root = modelMatrix[3].xz;
        #endif
        // A slow wave that travels across the field, plus a quick shiver of each plant.
        float gust = sin(uTime * 1.6 - root.x * 0.15 + root.y * 0.06) * 0.62 + sin(uTime * 3.3 + root.x * 0.9 + root.y * 1.3) * 0.2 + 0.4;
        transformed.x += gust * ${bend.toFixed(3)} * position.y * position.y;`);
    };
    return material;
  };

  // The paddies: plots in slightly different greens, some already turning gold.
  const PLOTS = night ? ["#2f6b4a", "#2a5f47", "#356f44", "#4b6b3a"] : ["#7cc35a", "#6ab84f", "#8fce62", "#b9c552", "#d2c257"];
  const plotOf = (x, z) => PLOTS[Math.abs(Math.floor(x / 24) * 7 + Math.floor(z / 20) * 13) % PLOTS.length];
  const LANE = { x0: -12, z0: -6, x1: 34, z1: -150 };
  const laneLength = Math.hypot(LANE.x1 - LANE.x0, LANE.z1 - LANE.z0);
  const laneAt = (t) => ({ x: LANE.x0 + (LANE.x1 - LANE.x0) * t, z: LANE.z0 + (LANE.z1 - LANE.z0) * t });
  const offLane = (x, z) => Math.abs((LANE.z1 - LANE.z0) * (x - LANE.x0) - (LANE.x1 - LANE.x0) * (z - LANE.z0)) / laneLength;

  const land = mesh(new THREE.PlaneGeometry(700, 340), new THREE.MeshLambertMaterial({ map: canvasTexture(1024, 512, (ctx, w, h) => {
    for (let x = 0; x < w; x += 4) for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = plotOf((x / w) * 700 - 350, -((1 - y / h) * 340) - 4);
      ctx.fillRect(x, y, 4, 4);
    }
    // The low banks between the plots.
    ctx.fillStyle = night ? "rgba(20,40,30,0.6)" : "rgba(86,120,62,0.75)";
    for (let x = -360; x < 360; x += 24) ctx.fillRect(((x + 350) / 700) * w, 0, 2, h);
    for (let z = 0; z < 340; z += 20) ctx.fillRect(0, h - (z / 340) * h, w, 2);
  }) }), { y: 0, z: -174, cast: false });
  land.rotation.x = -Math.PI / 2;
  add(land);
  const path = mesh(new THREE.PlaneGeometry(3.4, laneLength), paint(night ? "#6b6250" : "#d9c59a"), { x: (LANE.x0 + LANE.x1) / 2, y: 0.05, z: (LANE.z0 + LANE.z1) / 2, cast: false });
  path.rotation.set(-Math.PI / 2, 0, -Math.atan2(LANE.x1 - LANE.x0, -(LANE.z1 - LANE.z0)));
  add(path);

  // A small yard right under the window: lawn, a white picket fence with a gap where the lane leaves.
  const lawn = mesh(new THREE.PlaneGeometry(90, 7), paint(night ? "#2f5a43" : "#86c96a"), { y: 0.03, z: -8.4, cast: false });
  lawn.rotation.x = -Math.PI / 2;
  add(lawn);
  const pickets = [];
  for (let x = -44; x <= 44; x += 1.1) if (Math.abs(x + 10.2) > 2.4) pickets.push(x);
  const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 1.3, 0.12), paint(night ? "#c9cfe6" : "#ffffff"), pickets.length);
  pickets.forEach((x, index) => {
    dummy.position.set(x, 0.65, -11.8);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    fence.setMatrixAt(index, dummy.matrix);
  });
  add(fence);
  for (const [x0, x1] of [[-44, -12.6], [-7.8, 44]]) for (const y of [0.45, 1]) add(box(x1 - x0, 0.1, 0.08, paint(night ? "#c9cfe6" : "#ffffff"), { x: (x0 + x1) / 2, y, z: -11.72, cast: false }));
  for (const [x, z, size] of [[-24, -9, 1.1], [-16, -7.4, 0.8], [6, -8.8, 1.2], [14, -7.6, 0.9], [26, -9.4, 1.1], [-34, -8, 1]]) add(kit.bush(x, z, size));

  // Rice: thousands of blades, all leaning with the same wind.
  const bladeShape = new THREE.PlaneGeometry(0.42, 1.5, 1, 4).translate(0, 0.75, 0);
  const points = bladeShape.attributes.position;
  for (let i = 0; i < points.count; i += 1) points.setX(i, points.getX(i) * (1 - (points.getY(i) / 1.5) * 0.9));
  const spots = [];
  for (let z = -13; z > -150 && spots.length < 15000; z -= 0.55 + Math.abs(z) * 0.012) {
    const reach = 26 + Math.abs(z) * 0.95;
    const gap = 0.55 + Math.abs(z) * 0.011;
    for (let x = -reach; x < reach; x += gap) {
      const px = x + (random() - 0.5) * gap;
      const pz = z + (random() - 0.5) * 0.5;
      if (offLane(px, pz) < 2.4) continue;
      spots.push([px, pz]);
    }
  }
  const rice = new THREE.InstancedMesh(bladeShape, windy(new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide }), 0.17), spots.length);
  spots.forEach(([x, z], index) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, (random() - 0.5) * 0.5, 0);
    const size = 0.75 + random() * 0.7;
    dummy.scale.set(size * 1.6, size, size);
    dummy.updateMatrix();
    rice.setMatrixAt(index, dummy.matrix);
    rice.setColorAt(index, tint.set(plotOf(x, z)).offsetHSL(0, 0, 0.03 + random() * 0.09));
  });
  add(rice);

  // The lane through the fields with its lamps; from upstairs you look down on the bulbs.
  for (const t of [0.05, 0.13, 0.23, 0.35, 0.5, 0.68, 0.9]) {
    const at = laneAt(t);
    const post = new THREE.Group();
    post.position.set(at.x - 2.6, 0, at.z);
    post.add(mesh(shape("post", () => new THREE.CylinderGeometry(0.1, 0.14, 5.4, 8)), paint("#3a4466"), { y: 2.7 }), box(1.1, 0.1, 0.1, paint("#3a4466"), { x: 0.5, y: 5.3 }), mesh(shape("lampBulb", () => new THREE.SphereGeometry(0.3, 10, 8)), paint("#ffe9a8", { basic: true }), { x: 1, y: 5.05, cast: false }), halo(1, 5.05, 0, 5, 0.2));
    if (dusk) {
      const pool = mesh(shape("pool", () => new THREE.CircleGeometry(5.5, 24)), new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), { x: 1.6, y: 0.09, cast: false });
      pool.rotation.x = -Math.PI / 2;
      post.add(pool);
    }
    add(post);
  }

  // Far away: a line of trees, a few houses, soft hills.
  const swaying = [];
  const leafPaint = [paint(night ? "#234f3a" : "#3fa35c", { flat: true }), paint(night ? "#1f4634" : "#2f9153", { flat: true })];
  for (let i = 0; i < 34; i += 1) {
    const tree = new THREE.Group();
    const far = i % 3 === 0;
    tree.position.set(-150 + i * 9.4 + random() * 5, 0, far ? -92 - random() * 20 : -152 - random() * 16);
    tree.add(mesh(shape("trunk", () => new THREE.CylinderGeometry(0.35, 0.5, 4, 6)), paint("#8d5a3b", { flat: true }), { y: 2 }));
    const crown = mesh(shape("crown", () => new THREE.IcosahedronGeometry(1, 0)), leafPaint[i % 2], { y: 5.6 });
    crown.scale.set(3 + random(), 2.6 + random(), 3);
    tree.add(crown);
    tree.scale.setScalar(far ? 1 : 1.5 + random() * 0.6);
    tree.userData.phase = i;
    swaying.push(tree);
    add(tree);
  }
  for (const [x, z, wallColor, roofColor] of [[-52, -104, "#f6d8c2", "#c0563f"], [64, -118, "#dfe9f7", "#4b6cb7"], [-18, -140, "#f7edc9", "#b3562f"]]) {
    // The village houses turn their windows towards you.
    const village = kit.house(x, z, 12, 7, 9, wallColor, roofColor);
    village.rotation.y = Math.PI;
    add(village);
  }
  const hillPaint = new THREE.MeshLambertMaterial({ color: new THREE.Color(night ? "#27455a" : "#6fae8a").lerp(horizon, 0.45), flatShading: true });
  for (let i = 0; i < 7; i += 1) {
    const hill = mesh(shape("hill", () => new THREE.IcosahedronGeometry(1, 2)), hillPaint, { x: -260 + i * 86 + random() * 30, y: -8, z: -250 - random() * 40, cast: false });
    hill.scale.set(90 + random() * 50, 30 + random() * 26, 60);
    add(hill);
  }
  // A scarecrow keeping watch over the nearest plot.
  const scarecrow = new THREE.Group();
  scarecrow.position.set(-10, 0, -26);
  scarecrow.add(box(0.14, 3.6, 0.14, dark, { y: 1.8 }), box(2.6, 0.12, 0.12, dark, { y: 2.7 }), box(1.1, 1.2, 0.3, paint("#e5484d"), { y: 2.3 }), mesh(shape("strawHead", () => new THREE.SphereGeometry(0.42, 10, 8)), paint("#f2cf8a"), { y: 3.5 }), mesh(shape("strawHat", () => new THREE.ConeGeometry(0.8, 0.5, 12)), paint("#d9a441"), { y: 4 }));
  add(scarecrow);

  // The sky: a backdrop, clouds drifting, by day a kite and birds, at night fireflies.
  const backdrop = mesh(new THREE.PlaneGeometry(1100, 420), new THREE.MeshBasicMaterial({ fog: false, map: canvasTexture(512, 512, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, colors.top);
    gradient.addColorStop(0.72, colors.bottom);
    gradient.addColorStop(1, colors.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    if (night) { ctx.fillStyle = "#ffffff"; for (let i = 0; i < 160; i += 1) ctx.fillRect(random() * w, random() * h * 0.62, random() < 0.2 ? 2 : 1, random() < 0.2 ? 2 : 1); }
    const glow = ctx.createRadialGradient(w * 0.63, h * 0.42, 0, w * 0.63, h * 0.42, 60);
    glow.addColorStop(0, night ? "rgba(240,244,255,1)" : "rgba(255,250,220,1)");
    glow.addColorStop(0.22, night ? "rgba(240,244,255,1)" : "rgba(255,246,200,0.95)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }) }), { y: 110, z: -330, cast: false });
  add(backdrop);
  const cloudPaint = new THREE.MeshBasicMaterial({ color: night ? "#46527f" : "#ffffff", fog: false, transparent: true, opacity: night ? 0.75 : 0.95 });
  const clouds = [];
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 4; j += 1) {
      const puff = mesh(shape("puff", () => new THREE.IcosahedronGeometry(1, 1)), cloudPaint, { x: j * 9 - 13 + random() * 4, y: random() * 4, z: random() * 6, cast: false });
      puff.scale.set(9 + random() * 6, 4 + random() * 3, 6);
      cloud.add(puff);
    }
    cloud.position.set(-300 + random() * 600, 62 + random() * 60, -230 - random() * 70);
    cloud.userData.speed = 3 + random() * 3;
    clouds.push(cloud);
    add(cloud);
  }
  const kite = new THREE.Group();
  kite.add(mesh(new THREE.CircleGeometry(2.2, 4), new THREE.MeshBasicMaterial({ color: "#e5484d", side: THREE.DoubleSide, fog: false }), { cast: false }));
  const tails = [0, 1, 2, 3, 4].map((index) => {
    const ribbon = mesh(shape("ribbon", () => new THREE.PlaneGeometry(0.9, 0.5)), new THREE.MeshBasicMaterial({ color: index % 2 ? "#ffd23f" : "#2f6fed", side: THREE.DoubleSide, fog: false }), { cast: false });
    kite.add(ribbon);
    return ribbon;
  });
  const kiteString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7 }));
  kite.visible = kiteString.visible = !night;
  add(kite, kiteString);
  const birds = night ? [] : [0, 1, 2, 3, 4, 5].map((index) => {
    const bird = new THREE.Group();
    const wings = [-1, 1].map((side) => {
      const wing = mesh(shape(`wing${side}`, () => new THREE.PlaneGeometry(1.5, 0.4).translate(side * 0.75, 0, 0)), new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, fog: false }), { cast: false });
      bird.add(wing);
      return wing;
    });
    bird.position.set(-160 + index * 22, 26 + (index % 3) * 4, -95 - (index % 2) * 18);
    bird.userData = { wings, phase: index * 1.7 };
    add(bird);
    return bird;
  });
  const fireflies = night ? [0, 1, 2].map((group) => {
    const dots = [];
    for (let i = 0; i < 26; i += 1) dots.push(-28 + random() * 56, 0.8 + random() * 3.2, -14 - random() * 42);
    const cloud = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(dots, 3)), new THREE.PointsMaterial({ color: "#f4ff9a", size: 3.2, sizeAttenuation: false, transparent: true, fog: false }));
    cloud.userData.phase = group * 2.1;
    add(cloud);
    return cloud;
  }) : [];
  // Leaves carried past the window.
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshBasicMaterial({ color: night ? "#8fae7a" : "#f2c14e", side: THREE.DoubleSide }), 26);
  const leafAt = Array.from({ length: 26 }, () => ({ x: -36 + random() * 72, y: FLOOR_H + 0.4 + random() * 6, z: -7 - random() * 26, speed: 5 + random() * 5, phase: random() * 6 }));
  add(leaves);

  /* ---------- you ---------- */

  const hero = kit.student(options.look || PLAYER_LOOK, { backpack: false });
  const zzz = [0, 1, 2].map((index) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(64, 64, (ctx) => {
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 46px 'Lexend Variable', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("z", 32, 34);
    }), transparent: true, depthWrite: false }));
    sprite.scale.setScalar(0.5 + index * 0.18);
    sprite.visible = false;
    return sprite;
  });
  const ring = kit.doorRing();
  scene.add(hero, ring, ...zzz);

  const player = { x: -5.2, z: 3.3, heading: Math.PI / 2, stride: 0, amount: 0, step: 0 };
  let level = 0;           // 0 downstairs, 1 upstairs
  let doing = null;        // null | "read" | "sleep"
  let near = null;
  let elapsed = 0;
  let last = performance.now();
  let stopped = false;
  let flipped = false;
  const shot = { from: new THREE.Vector3(), look: new THREE.Vector3(), ready: false };
  const want = { from: new THREE.Vector3(), look: new THREE.Vector3() };

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

  /** Shows one floor (and, upstairs, the fields outside) and puts the light over it. */
  const showFloor = (next) => {
    level = next ? 1 : 0;
    const height = level * FLOOR_H;
    ground.visible = level === 0;
    upper.visible = outdoor.visible = level === 1;
    scene.background = level ? horizon : indoors;
    scene.fog = level ? new THREE.Fog(horizon, 90, 380) : null;
    lamp.position.set(5, height + 14, 9);
    lamp.target.position.set(0, height, 0);
    shot.ready = false;
  };

  const stand = () => {
    const { legL, legR, armL, armR, head, body } = hero.userData.parts;
    legL.rotation.x = legR.rotation.x = armL.rotation.x = armR.rotation.x = 0;
    head.rotation.x = 0;
    body.position.y = 0;
    hero.rotation.set(0, player.heading, 0);
    hero.position.set(player.x, level * FLOOR_H, player.z);
  };

  /** Everything the wind moves. Only runs while you are upstairs. */
  const blow = (dt) => {
    wind.value = elapsed;
    const gust = 0.6 + Math.sin(elapsed * 0.5) * 0.25 + Math.sin(elapsed * 1.3) * 0.15;
    for (const cloth of curtains) {
      const { rest, side } = cloth.userData;
      const position = cloth.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 1) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        // The top hangs from the rod; the inner, lower edge is free and flies into the room.
        const free = clamp((0.85 - x * side) / 1.7, 0, 1) * clamp((2.1 - y) / 4, 0, 1);
        position.setZ(i, free * (0.9 * gust + Math.sin(elapsed * 3.1 + y * 1.7 + x * 2.3) * 0.28));
        position.setX(i, x - side * free * 0.25 * gust);
      }
      position.needsUpdate = true;
      cloth.geometry.computeVertexNormals();
    }
    strung.forEach((bulb, index) => { bulb.rotation.z = Math.sin(elapsed * 2.1 + index * 0.9) * 0.2 * gust; bulb.rotation.x = Math.cos(elapsed * 1.7 + index) * 0.14 * gust; });
    pendants.forEach((pendant, index) => { pendant.rotation.z = Math.sin(elapsed * 1.25 + index * 1.4) * 0.09 * gust; pendant.rotation.x = Math.sin(elapsed * 0.9 + index) * 0.05; });
    pinwheel.rotation.z -= dt * (5 + gust * 9);
    scarecrow.rotation.z = Math.sin(elapsed * 1.6) * 0.05 * gust;
    for (const tree of swaying) tree.rotation.z = Math.sin(elapsed * 1.1 + tree.userData.phase) * 0.02 * gust;
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 330) cloud.position.x = -330;
    }
    if (kite.visible) {
      kite.position.set(22 + Math.sin(elapsed * 0.6) * 5, 40 + Math.sin(elapsed * 0.9) * 3, -78 + Math.cos(elapsed * 0.5) * 4);
      kite.rotation.z = 0.3 + Math.sin(elapsed * 1.4) * 0.18;
      tails.forEach((ribbon, index) => ribbon.position.set(Math.sin(elapsed * 3 - index * 0.8) * 0.5 * (index + 1) * 0.4, -2.6 - index * 0.9, 0));
      const line = kiteString.geometry.attributes.position;
      line.setXYZ(0, 14, 0, -34);
      line.setXYZ(1, kite.position.x, kite.position.y - 1.6, kite.position.z);
      line.needsUpdate = true;
    }
    for (const bird of birds) {
      bird.position.x += dt * 9;
      if (bird.position.x > 170) bird.position.x = -170;
      const flap = Math.sin(elapsed * 7 + bird.userData.phase) * 0.6;
      bird.userData.wings[0].rotation.z = -flap;
      bird.userData.wings[1].rotation.z = flap;
    }
    for (const cloud of fireflies) {
      cloud.material.opacity = 0.35 + Math.abs(Math.sin(elapsed * 1.4 + cloud.userData.phase)) * 0.65;
      cloud.position.set(Math.sin(elapsed * 0.3 + cloud.userData.phase) * 1.5, Math.sin(elapsed * 0.5 + cloud.userData.phase) * 0.4, 0);
    }
    leafAt.forEach((leaf, index) => {
      leaf.x += leaf.speed * gust * dt;
      if (leaf.x > 38) { leaf.x = -38; leaf.y = FLOOR_H + 0.4 + ((index * 37) % 60) / 10; }
      dummy.position.set(leaf.x, leaf.y + Math.sin(elapsed * 2 + leaf.phase) * 0.6, leaf.z);
      dummy.rotation.set(elapsed * 3 + leaf.phase, elapsed * 2.2, leaf.phase);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
    });
    leaves.instanceMatrix.needsUpdate = true;
    // The wind lifts the corner of the page even when nobody is reading.
    if (doing !== "read") hinge.rotation.z = Math.max(0, Math.sin(elapsed * 2.6)) * 0.22 * gust;
  };

  const frame = (now) => {
    if (stopped) return;
    const dt = clamp((now - last) / 1000, 0.001, 0.2);
    last = now;
    elapsed += dt;
    const height = level * FLOOR_H;

    if (!doing) {
      const direction = steer(options.input, 0);
      const moving = Math.hypot(direction.x, direction.z) > 0.05;
      const next = moveWithCollisions(player, direction.x * WALK * dt, direction.z * WALK * dt, 0.5, COLLIDERS[level], BOUNDS);
      player.x = next.x;
      player.z = next.z;
      if (moving) {
        player.heading = turnToward(player.heading, headingOf(direction.x, direction.z), 11 * dt);
        player.stride += dt * WALK * 1.75;
        const step = Math.floor(player.stride / Math.PI);
        if (step !== player.step) { player.step = step; options.onSound?.("step", 0.5); }
      }
      player.amount += ((moving ? 1 : 0) - player.amount) * ease(12, dt);
      hero.position.set(player.x, height, player.z);
      hero.rotation.set(0, player.heading, 0);
      poseStudent(hero, player.stride, player.amount);
    } else if (doing === "read") {
      // At the desk: eyes on the book, now and then a look out over the fields; a page turns every few seconds.
      const glance = Math.max(0, Math.sin(elapsed * 0.33 - 1));
      hero.userData.parts.head.rotation.x = 0.42 - glance * 0.5;
      const turn = (elapsed % 6) / 6;
      hinge.rotation.z = turn > 0.85 ? ((turn - 0.85) / 0.15) * Math.PI : 0;
      if (turn > 0.85 && !flipped) { flipped = true; options.onSound?.("chalk", 0.4); }
      if (turn < 0.5) flipped = false;
    } else {
      // Asleep: slow breathing under the blanket, little z's drifting up.
      blanket.scale.y = 1 + Math.sin(elapsed * 1.6) * 0.08;
      zzz.forEach((sprite, index) => {
        const life = (elapsed * 0.35 + index / 3) % 1;
        sprite.visible = true;
        sprite.position.set(bedX - 0.4 + life * 0.9, 1.9 + life * 1.6, -2.2 - life * 0.3);
        sprite.material.opacity = Math.sin(life * Math.PI);
      });
    }
    if (level === 1) blow(dt);
    const dim = doing === "sleep" ? 0.25 : 1;
    for (const sprite of glows) sprite.material.opacity = sprite.userData.power * dim * (0.92 + Math.sin(elapsed * 9 + sprite.position.x) * 0.04);
    sky.intensity += ((doing === "sleep" ? 0.28 : night ? 0.75 : 1.25) - sky.intensity) * ease(2.5, dt);
    lamp.intensity += ((doing === "sleep" ? 0.35 : night ? 1.5 : 2.3) - lamp.intensity) * ease(2.5, dt);

    const spot = doing ? null : nearestDoor(player, SPOTS[level], 2.1);
    if ((spot?.id || null) !== (near?.id || null)) { near = spot; options.onNear?.(spot); }
    ring.visible = Boolean(near);
    if (near) {
      ring.position.set(near.x, height + 0.04, near.z);
      ring.scale.setScalar(0.55 * (1 + Math.sin(elapsed * 4) * 0.08));
    }

    // Camera: the whole room while walking, a close shot while reading or sleeping.
    const view = SHOTS[doing === "read" ? "desk" : doing === "sleep" ? "bed" : "room"];
    if (view.at) {
      const fit = Math.max(20, 9.4 / (camera.aspect * Math.tan((camera.fov * Math.PI) / 360)));
      want.from.set(view.at[0] * fit, view.at[1] * fit + 1 + height, view.at[2] * fit);
    } else want.from.set(view.from[0], view.from[1] + height, view.from[2]);
    want.look.set(view.look[0], view.look[1] + height, view.look[2]);
    const fov = view.fov || 40;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov += (fov - camera.fov) * ease(2.6, dt);
      camera.updateProjectionMatrix();
    }
    if (!shot.ready) { shot.from.copy(want.from); shot.look.copy(want.look); shot.ready = true; }
    shot.from.lerp(want.from, ease(2.6, dt));
    shot.look.lerp(want.look, ease(2.6, dt));
    camera.position.copy(shot.from);
    camera.lookAt(shot.look);
    renderer.render(scene, camera);
  };
  showFloor(options.floor === 1);
  if (level === 1) { player.x = -4.6; player.z = 0.4; }
  renderer.setAnimationLoop(frame);

  return {
    /** Sit down to study, go to sleep, or (null) get up again. */
    doing(what) {
      const was = doing;
      doing = what || null;
      for (const pendant of pendants) pendant.visible = doing !== "read";
      zzz.forEach((sprite) => { sprite.visible = false; });
      hinge.rotation.z = 0;
      blanket.scale.y = 1;
      stand();
      if (doing === "read") {
        seatStudent(hero);
        hero.position.set(0, hero.position.y + FLOOR_H + 0.1, -2.85);
        hero.rotation.set(0, Math.PI, 0);
        hero.userData.parts.armL.rotation.x = hero.userData.parts.armR.rotation.x = -1.15;
      } else if (doing === "sleep") {
        // Lying on the back, head on the pillow.
        hero.rotation.set(-Math.PI / 2, 0, 0);
        hero.position.set(bedX, 1.2, -0.35);
      } else if (was) {
        // Getting up: stand next to where you were.
        const spot = SPOTS[level].find((item) => item.id === (was === "read" ? "desk" : "bed"));
        player.x = spot.x + (was === "read" ? 1.3 : 0);
        player.z = spot.z + (was === "read" ? 0.6 : 0);
        player.heading = 0;
        stand();
      }
      if (doing) { near = null; options.onNear?.(null); }
    },
    /** Takes the stairs: 0 is downstairs, 1 the study upstairs. */
    floor(next) {
      showFloor(next);
      // Upstairs you step out beside the stairwell; downstairs you arrive at the foot of the stairs.
      Object.assign(player, level ? { x: -4.4, z: 0.6, heading: Math.PI / 2 } : { x: -6.1, z: 2.5, heading: 0 });
      stand();
      near = null;
      options.onNear?.(null);
      return level;
    },
    /** Where you stand (used by the page's tests). */
    where() {
      return { x: player.x, z: player.z, floor: level };
    },
    stop() {
      stopped = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
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
