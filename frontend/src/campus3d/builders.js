/**
 * Everything you can see on the 3D campus, built from simple shapes: schools,
 * students, trees, the pitch… No model files and no image files are loaded.
 */
import * as THREE from "three";

const FONT = "'Lexend Variable', 'Lexend', system-ui, sans-serif";

/** A texture painted on a 2D canvas (signs, court lines, the clock face). */
export const canvasTexture = (width, height, draw) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

const rounded = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

/** Shrinks the font until the text fits the width. */
const fitText = (ctx, text, maxWidth, size, weight = 600) => {
  let fontSize = size;
  do {
    ctx.font = `${weight} ${fontSize}px ${FONT}`;
    fontSize -= 2;
  } while (ctx.measureText(text).width > maxWidth && fontSize > 12);
};

/** A roof with four slopes. With ridge === width the ends are upright, which gives a gable roof. */
const roofGeometry = (w, d, h, ridge) => {
  const A = [-w / 2, 0, -d / 2];
  const B = [w / 2, 0, -d / 2];
  const C = [w / 2, 0, d / 2];
  const D = [-w / 2, 0, d / 2];
  const R1 = [-ridge / 2, h, 0];
  const R2 = [ridge / 2, h, 0];
  const triangles = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2, A, B, C, A, C, D];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
};

const SKIN = ["#f6d3b3", "#eec39a", "#e0ac7e", "#f2cba5", "#d99f73"];
const HAIR = ["#1d1512", "#2b1d14", "#3b2a20", "#151515", "#4a3122"];
const PACKS = ["#2f6fed", "#e5484d", "#18a058", "#f5a524", "#7c5cff", "#0ea5e9", "#f472b6", "#ff8a3d"];
const SHIRTS = ["#ffffff", "#ffffff", "#ffffff", "#f3f7ff", "#e6f0ff"];

/** Random but repeatable looks for the other students. */
export const studentLook = (random) => {
  const girl = random() < 0.5;
  return {
    girl,
    skin: SKIN[Math.floor(random() * SKIN.length)],
    hair: HAIR[Math.floor(random() * HAIR.length)],
    hairStyle: girl ? ["bob", "ponytail", "bun"][Math.floor(random() * 3)] : "short",
    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
    bottom: random() < 0.85 ? "#1f2f66" : "#2b3a4d",
    pack: PACKS[Math.floor(random() * PACKS.length)],
    scarf: random() < 0.6,
    height: 0.9 + random() * 0.14,
  };
};

export const PLAYER_LOOK = { girl: false, skin: "#f3c7a1", hair: "#2b1d14", hairStyle: "short", shirt: "#ffc93c", bottom: "#27408b", pack: "#18a058", scarf: false, cap: "#2f6fed", height: 1 };

/** Stable appearance for a real account, identical on every player's screen. */
export const characterLook = (profile, sport = null, team = null) => {
  let hash = 0;
  for (const letter of String(profile?.id || "player")) hash = ((hash * 31) + letter.codePointAt(0)) >>> 0;
  const girl = profile?.gender === "female";
  return {
    ...PLAYER_LOOK,
    girl,
    skin: SKIN[hash % SKIN.length],
    hair: HAIR[hash % HAIR.length],
    hairStyle: girl ? "ponytail" : "short",
    cap: null,
    athletic: Boolean(sport),
    shirt: sport ? (team === 1 ? "#2f6fed" : "#e5484d") : (girl ? "#a78bfa" : "#ffc93c"),
    bottom: sport ? "#ffffff" : "#27408b",
    pack: PACKS[hash % PACKS.length],
  };
};

/**
 * One kit per world. It remembers the shapes and paints it has made so that
 * a hundred students share them, and so that everything can be thrown away
 * when the page closes.
 */
export const createKit = (sky) => {
  const paints = new Map();
  const shapes = new Map();
  const night = sky.night;

  const paint = (color, options = {}) => {
    const key = `${color}|${options.flat ? 1 : 0}|${options.basic ? 1 : 0}|${options.opacity ?? 1}|${options.side ?? 0}`;
    if (!paints.has(key)) {
      const Material = options.basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
      const material = new Material({ color, side: options.side ?? THREE.FrontSide });
      if (options.flat && !options.basic) material.flatShading = true;
      if (options.opacity !== undefined && options.opacity < 1) { material.transparent = true; material.opacity = options.opacity; }
      paints.set(key, material);
    }
    return paints.get(key);
  };

  const shape = (key, make) => {
    if (!shapes.has(key)) shapes.set(key, make());
    return shapes.get(key);
  };

  const mesh = (geometry, material, { x = 0, y = 0, z = 0, cast = true, receive = false } = {}) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = cast;
    object.receiveShadow = receive;
    return object;
  };

  const box = (w, h, d, material, at) => mesh(shape(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), material, at);

  /* ---------- people ---------- */

  const limb = (key, w, h, d) => shape(key, () => new THREE.BoxGeometry(w, h, d).translate(0, -h / 2, 0));

  const student = (look, { backpack = true } = {}) => {
    const group = new THREE.Group();
    const skin = paint(look.skin);
    const shirt = paint(look.shirt);
    const bottom = paint(look.bottom);
    const shoe = paint("#2a2a33");
    const parts = {};
    const skirted = look.girl && !look.athletic;

    for (const side of [-1, 1]) {
      const leg = mesh(limb("leg", 0.24, 0.8, 0.26), skirted ? skin : bottom, { x: side * 0.15, y: 0.84 });
      leg.add(mesh(shape("shoe", () => new THREE.BoxGeometry(0.26, 0.13, 0.38)), shoe, { y: -0.78, z: 0.06 }));
      if (skirted) leg.add(mesh(shape("sock", () => new THREE.BoxGeometry(0.25, 0.2, 0.27)), paint("#ffffff"), { y: -0.62 }));
      group.add(leg);
      parts[side < 0 ? "legL" : "legR"] = leg;

      const arm = mesh(limb("arm", 0.17, 0.62, 0.2), shirt, { x: side * 0.4, y: 1.5 });
      arm.add(mesh(shape("hand", () => new THREE.BoxGeometry(0.15, 0.14, 0.17)), skin, { y: -0.68 }));
      group.add(arm);
      parts[side < 0 ? "armL" : "armR"] = arm;
    }

    const body = new THREE.Group();
    body.add(mesh(shape("torso", () => new THREE.BoxGeometry(0.62, 0.72, 0.36)), shirt, { y: 1.18 }));
    if (skirted) body.add(mesh(shape("skirt", () => new THREE.CylinderGeometry(0.3, 0.46, 0.44, 8)), bottom, { y: 0.8 }));
    if (look.scarf) {
      const red = paint("#e5343a");
      body.add(mesh(shape("collar", () => new THREE.BoxGeometry(0.46, 0.09, 0.4)), red, { y: 1.52 }));
      const knot = mesh(shape("knot", () => new THREE.ConeGeometry(0.13, 0.3, 3)), red, { y: 1.36, z: 0.2 });
      knot.rotation.set(Math.PI, Math.PI / 6, 0);
      body.add(knot);
    }
    if (backpack) {
      body.add(mesh(shape("pack", () => new THREE.BoxGeometry(0.48, 0.54, 0.22)), paint(look.pack), { y: 1.2, z: -0.29 }));
      body.add(mesh(shape("pocket", () => new THREE.BoxGeometry(0.34, 0.22, 0.08)), paint("#ffffff", { opacity: 0.35 }), { y: 1.08, z: -0.42, cast: false }));
    }
    group.add(body);
    parts.body = body;

    const head = new THREE.Group();
    head.position.y = 1.83;
    head.add(mesh(shape("head", () => new THREE.SphereGeometry(0.29, 14, 10)), skin));
    const eye = paint("#2a2330");
    for (const side of [-1, 1]) head.add(mesh(shape("eye", () => new THREE.SphereGeometry(0.035, 6, 5)), eye, { x: side * 0.11, y: 0.03, z: 0.265, cast: false }));
    const hair = paint(look.cap || look.hair);
    const top = mesh(shape("hair", () => new THREE.SphereGeometry(0.315, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56)), hair);
    top.rotation.x = -0.32;
    head.add(top);
    if (look.cap) {
      head.add(mesh(shape("visor", () => new THREE.BoxGeometry(0.36, 0.04, 0.26)), hair, { y: 0.13, z: 0.33 }));
      head.add(mesh(shape("nape", () => new THREE.BoxGeometry(0.5, 0.16, 0.16)), paint(look.hair), { y: -0.06, z: -0.2 }));
    } else if (look.hairStyle === "bob") {
      head.add(mesh(shape("bob", () => new THREE.BoxGeometry(0.62, 0.42, 0.3)), hair, { y: -0.1, z: -0.14 }));
    } else if (look.hairStyle === "ponytail") {
      const tail = mesh(shape("tail", () => new THREE.CapsuleGeometry(0.09, 0.3, 3, 6)), hair, { y: -0.12, z: -0.36 });
      tail.rotation.x = 0.5;
      head.add(tail);
    } else if (look.hairStyle === "bun") {
      head.add(mesh(shape("bun", () => new THREE.SphereGeometry(0.14, 8, 6)), hair, { y: 0.28, z: -0.14 }));
    }
    group.add(head);
    parts.head = head;

    group.scale.setScalar(look.height);
    group.userData.parts = parts;
    return group;
  };

  /* ---------- nature and street furniture ---------- */

  const GREENS = night ? ["#2f6b4a", "#2a5f47", "#356f44"] : ["#3fa35c", "#4fb168", "#2f9153"];

  const tree = (x, z, size, index = 0) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(mesh(shape("trunk", () => new THREE.CylinderGeometry(0.28, 0.4, 2.6, 6)), paint("#8d5a3b", { flat: true }), { y: 1.3 }));
    const leaves = paint(GREENS[index % GREENS.length], { flat: true });
    const light = paint(GREENS[(index + 1) % GREENS.length], { flat: true });
    const crown = shape("crown", () => new THREE.IcosahedronGeometry(1, 0));
    const low = mesh(crown, leaves, { y: 3.6 });
    low.scale.set(2.1, 1.7, 2.1);
    low.rotation.y = index;
    const high = mesh(crown, light, { x: 0.4, y: 5.1, z: -0.2 });
    high.scale.set(1.45, 1.3, 1.45);
    high.rotation.y = index * 2.1;
    group.add(low, high);
    group.scale.setScalar(size * 1.15);
    group.userData.sway = index;
    group.userData.crown = [low, high].map((part) => ({ part, size: part.scale.clone(), at: part.position.clone() }));
    group.userData.reach = 2.3 * size * 1.15;
    group.userData.open = 1;
    return group;
  };

  const bush = (x, z, size = 1) => {
    const object = mesh(shape("crown", () => new THREE.IcosahedronGeometry(1, 0)), paint(GREENS[0], { flat: true }), { x, y: 0.55 * size, z });
    object.scale.set(1.1 * size, 0.75 * size, 1.1 * size);
    return object;
  };

  const lamp = (x, z) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const metal = paint("#3a4466");
    group.add(mesh(shape("pole", () => new THREE.CylinderGeometry(0.09, 0.13, 5.2, 8)), metal, { y: 2.6 }));
    group.add(mesh(shape("lampHead", () => new THREE.CylinderGeometry(0.42, 0.24, 0.3, 8)), metal, { y: 5.3 }));
    group.add(mesh(shape("bulb", () => new THREE.SphereGeometry(0.3, 10, 8)), paint(night ? "#ffe9a8" : "#fff8e0", { basic: true }), { y: 5.05, cast: false }));
    return group;
  };

  const bench = (x, z, rotation) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    const wood = paint("#c98d4f");
    const iron = paint("#3a4466");
    group.add(box(2.4, 0.14, 0.7, wood, { y: 0.62 }), box(2.4, 0.6, 0.12, wood, { y: 1.1, z: -0.32 }));
    group.add(box(0.14, 0.62, 0.6, iron, { x: -1, y: 0.31 }), box(0.14, 0.62, 0.6, iron, { x: 1, y: 0.31 }));
    return group;
  };

  /* ---------- buildings ---------- */

  const signTexture = (text, background, color = "#ffffff") => canvasTexture(1024, 176, (ctx, w, h) => {
    ctx.fillStyle = background;
    rounded(ctx, 0, 0, w, h, 26);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 8;
    rounded(ctx, 12, 12, w - 24, h - 24, 18);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, text, w - 90, 96, 650);
    ctx.fillText(text, w / 2, h / 2 + 4);
  });

  const emblemTexture = (text, background, round = true) => canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = background;
    if (round) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2); } else rounded(ctx, 6, 6, w - 12, h - 12, 44);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (text === "check") {
      ctx.lineWidth = 30;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(66, 134);
      ctx.lineTo(112, 180);
      ctx.lineTo(194, 82);
      ctx.stroke();
    } else {
      fitText(ctx, text, w - 70, 150, 700);
      ctx.fillText(text, w / 2, h / 2 + 8);
    }
  });

  const clockTexture = () => canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = "#fffdf5";
    ctx.beginPath();
    ctx.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1d2142";
    ctx.lineWidth = 12;
    ctx.stroke();
    for (let hour = 0; hour < 12; hour += 1) {
      const angle = (hour / 12) * Math.PI * 2;
      const inner = hour % 3 === 0 ? 86 : 98;
      ctx.lineWidth = hour % 3 === 0 ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.sin(angle) * inner, w / 2 - Math.cos(angle) * inner);
      ctx.lineTo(w / 2 + Math.sin(angle) * 110, w / 2 - Math.cos(angle) * 110);
      ctx.stroke();
    }
  });

  /**
   * A school. Local +z is the front (south). The building owns its paints so
   * that it can fade on its own when it stands between the camera and the player.
   */
  const building = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const own = new Map();
    const mine = (color, options = {}) => {
      const key = `${color}|${options.basic ? 1 : 0}|${options.flat ? 1 : 0}`;
      if (!own.has(key)) {
        const Material = options.basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
        const material = new Material({ color });
        if (options.flat) material.flatShading = true;
        own.set(key, material);
      }
      return own.get(key);
    };
    const textured = (texture) => {
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      own.set(`tex${own.size}`, material);
      return material;
    };

    const { w, d, h } = spec;
    const wall = mine(spec.wall);
    const trim = mine(spec.trim);
    const roofPaint = mine(spec.roof, { flat: true });
    const front = d / 2;

    group.add(box(w + 0.8, 0.5, d + 0.8, mine("#b9b2a6"), { y: 0.25, receive: true }));
    const body = box(w, h, d, wall, { y: h / 2 + 0.5, receive: true });
    group.add(body);
    group.add(box(w + 0.3, 0.35, d + 0.3, trim, { y: h + 0.5 }));

    let top = h + 0.68;
    if (spec.kind === "arcade" || spec.kind === "booth") {
      group.add(box(w + 1.2, 0.5, d + 1.2, roofPaint, { y: top + 0.25 }));
      top += 0.5;
    } else {
      const gable = spec.kind === "language" || spec.kind === "home";
      const rise = gable ? 3.4 : 3.8;
      const ridge = gable ? w + 1.6 : w * 0.56;
      const roof = mesh(roofGeometry(w + 1.6, d + 1.8, rise, ridge), roofPaint, { y: top });
      group.add(roof);
      top += rise;
    }

    // Windows: one instanced mesh for the frames, one for the glass.
    const low = spec.kind === "arcade" || spec.kind === "booth" || spec.kind === "home";
    const floors = low ? 1 : 2;
    const storey = h / floors;
    const doorWidth = spec.kind === "main" ? 4.4 : 3.4;
    const slots = [];
    const row = (count, length, place) => {
      const gap = length / count;
      for (let floor = 0; floor < floors; floor += 1) {
        for (let i = 0; i < count; i += 1) place(-length / 2 + gap * (i + 0.5), low ? 2.95 : 0.5 + storey * floor + storey * 0.56, floor);
      }
    };
    const columns = Math.max(2, Math.floor((w - 2) / 3.3));
    row(columns, w - 2, (x, y, floor) => {
      if (floor === 0 && Math.abs(x) < doorWidth / 2 + 1.1) return;
      if (floor === 1 && Math.abs(x) < 2.6 && spec.emblem === "check") return; // room for the big tick
      slots.push({ x, y, z: front, turn: 0 });
    });
    row(columns, w - 2, (x, y) => slots.push({ x, y, z: -front, turn: Math.PI }));
    const sideColumns = Math.max(1, Math.floor((d - 2) / 3.6));
    row(sideColumns, d - 2, (z, y) => {
      slots.push({ x: w / 2, y, z, turn: Math.PI / 2 });
      slots.push({ x: -w / 2, y, z, turn: -Math.PI / 2 });
    });
    const glassPaint = mine("#ffffff", { basic: true });
    const frames = new THREE.InstancedMesh(shape("frame", () => new THREE.BoxGeometry(1.9, 2.3, 0.16)), mine("#ffffff"), slots.length);
    const glass = new THREE.InstancedMesh(shape("glass", () => new THREE.BoxGeometry(1.54, 1.94, 0.24)), glassPaint, slots.length);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    slots.forEach((slot, index) => {
      dummy.position.set(slot.x, slot.y, slot.z);
      dummy.rotation.set(0, slot.turn, 0);
      dummy.updateMatrix();
      frames.setMatrixAt(index, dummy.matrix);
      glass.setMatrixAt(index, dummy.matrix);
      const lit = Math.sin(index * 12.9898 + spec.x) * 43758.5453 % 1;
      if (night) tint.set(Math.abs(lit) < 0.68 ? "#ffd98a" : "#2a3760");
      else tint.set(Math.abs(lit) < 0.5 ? "#a9d8f8" : "#8cc6f0");
      glass.setColorAt(index, tint);
    });
    glass.instanceColor.needsUpdate = true;
    group.add(frames, glass);

    // Door, steps and a small canopy.
    const doorHeight = spec.kind === "main" ? 4 : 3.4;
    group.add(box(doorWidth + 0.7, doorHeight + 0.4, 0.3, trim, { y: 0.5 + (doorHeight + 0.4) / 2, z: front + 0.05 }));
    const doorPaint = mine(night ? "#ffd98a" : "#5a3d2b", { basic: night });
    for (const side of [-1, 1]) {
      group.add(box(doorWidth / 2 - 0.08, doorHeight, 0.2, doorPaint, { x: side * doorWidth / 4, y: 0.5 + doorHeight / 2, z: front + 0.16, cast: false }));
      group.add(box(0.1, 0.5, 0.1, mine("#f5c542"), { x: side * 0.22, y: 2.1, z: front + 0.3, cast: false }));
    }
    group.add(box(doorWidth + 2.2, 0.25, 1.6, mine("#cfc8ba"), { y: 0.125, z: front + 1.1, receive: true }));
    group.add(box(doorWidth + 1.4, 0.5, 0.9, mine("#cfc8ba"), { y: 0.25, z: front + 0.6, receive: true }));
    if (spec.kind !== "arcade") {
      const canopy = box(doorWidth + 2, 0.2, 1.9, roofPaint, { y: doorHeight + 0.95, z: front + 0.9 });
      canopy.rotation.x = 0.16;
      group.add(canopy);
    }

    // Name board above the door.
    const signWidth = spec.kind === "main" ? 13 : spec.kind === "language" ? 8.6 : spec.kind === "home" ? 6.4 : Math.min(w - 2.5, 10.5);
    const signHeight = signWidth * (176 / 1024);
    const signY = spec.kind === "arcade" ? 6.55 : doorHeight + 1.2 + signHeight / 2 + 0.45;
    group.add(box(signWidth + 0.3, signHeight + 0.3, 0.2, mine("#ffffff"), { y: signY, z: front + 0.18 }));
    group.add(mesh(shape(`plane:${signWidth}`, () => new THREE.PlaneGeometry(signWidth, signHeight)), textured(signTexture(spec.name, spec.trim)), { y: signY, z: front + 0.32, cast: false }));

    const spinners = [];
    if (spec.kind === "main") {
      // Clock tower with hands that show the real time.
      const tower = 7.5;
      group.add(box(6.4, tower, 6.4, wall, { y: h + 0.5 + tower / 2, z: 1 }));
      group.add(box(7, 0.4, 7, trim, { y: h + 0.5 + tower, z: 1 }));
      const spire = mesh(shape("spire", () => new THREE.ConeGeometry(5, 4.6, 4)), roofPaint, { y: h + 0.9 + tower + 2.3, z: 1 });
      spire.rotation.y = Math.PI / 4;
      group.add(spire);
      const face = mesh(shape("clock", () => new THREE.CircleGeometry(2.3, 40)), textured(clockTexture()), { y: h + 0.5 + tower - 3, z: 4.24, cast: false });
      group.add(face);
      const hands = new THREE.Group();
      hands.position.copy(face.position);
      hands.position.z += 0.04;
      const ink = mine("#1d2142", { basic: true });
      const hour = mesh(shape("hourHand", () => new THREE.BoxGeometry(0.2, 1.2, 0.04).translate(0, 0.5, 0)), ink, { cast: false });
      const minute = mesh(shape("minuteHand", () => new THREE.BoxGeometry(0.13, 1.8, 0.04).translate(0, 0.8, 0)), ink, { z: 0.03, cast: false });
      hands.add(hour, minute);
      group.add(hands);
      group.userData.clock = { hour, minute };
      top = h + 0.9 + tower + 4.6;
      // Pillars on both sides of the entrance.
      for (const side of [-1, 1]) group.add(mesh(shape("pillar", () => new THREE.CylinderGeometry(0.34, 0.38, 5.2, 10)), mine("#ffffff"), { x: side * (doorWidth / 2 + 1.1), y: 3.1, z: front + 1.4 }));
    } else if (spec.emblem === "map") {
      // A little mind map on the roof: one idea in the middle, five around it.
      const sculpture = new THREE.Group();
      sculpture.position.set(0, top + 1.2, 0);
      sculpture.add(mesh(shape("idea", () => new THREE.IcosahedronGeometry(1, 1)), mine("#ffffff", { flat: true })));
      ["#e5484d", "#f5a524", "#18a058", "#7c5cff", "#0ea5e9"].forEach((color, index) => {
        const angle = (index / 5) * Math.PI * 2;
        const node = mesh(shape("ideaSmall", () => new THREE.IcosahedronGeometry(0.55, 1)), mine(color, { flat: true }), { x: Math.cos(angle) * 2.5, y: Math.sin(index * 1.7) * 0.5 + 0.4, z: Math.sin(angle) * 2.5 });
        const link = mesh(shape("ideaLink", () => new THREE.CylinderGeometry(0.08, 0.08, 2.5, 5).rotateZ(Math.PI / 2).translate(1.25, 0, 0)), mine(color), {});
        link.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), node.position.clone().normalize());
        sculpture.add(node, link);
      });
      group.add(mesh(shape("post", () => new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6)), mine("#ffffff"), { y: top + 0.3 }));
      group.add(sculpture);
      spinners.push({ object: sculpture, speed: 0.35 });
      top += 2.6;
    }
    if (spec.emblem === "check") {
      group.add(mesh(shape("tick", () => new THREE.PlaneGeometry(3, 3)), textured(emblemTexture("check", spec.roof, false)), { y: h + 0.5 - 1.85, z: front + 0.14, cast: false }));
    }
    if (spec.kind === "language") {
      // A round sign on the ridge with the first letters of the language.
      const disc = mesh(shape("disc", () => new THREE.CylinderGeometry(1.75, 1.75, 0.22, 32).rotateX(Math.PI / 2)), mine("#ffffff"), { y: top + 1.5 });
      const art = textured(emblemTexture(spec.emblem, spec.roof));
      for (const side of [-1, 1]) {
        const plate = mesh(shape("discFace", () => new THREE.CircleGeometry(1.6, 32)), art, { z: side * 0.12, cast: false });
        if (side < 0) plate.rotation.y = Math.PI;
        disc.add(plate);
      }
      group.add(disc, mesh(shape("discPost", () => new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6)), mine("#ffffff"), { y: top - 0.1 }));
      top += 3.4;
    }
    if (spec.kind === "arcade") {
      // An eight ball on the roof and a striped awning over the front.
      const ball = mesh(shape("eightBall", () => new THREE.SphereGeometry(1.5, 24, 16)), textured(canvasTexture(512, 256, (ctx, cw, ch) => {
        ctx.fillStyle = "#16161c";
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.ellipse(cw * 0.75, ch / 2, 46, 58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#16161c";
        ctx.font = `700 78px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("8", cw * 0.75, ch / 2 + 6);
      })), { x: w / 2 - 3, y: top + 1.5 });
      group.add(ball);
      spinners.push({ object: ball, speed: 0.5 });
      for (let i = 0; i < 9; i += 1) {
        const stripe = box((w - 1) / 9, 0.16, 2.2, mine(i % 2 ? "#ffffff" : spec.roof), { x: -(w - 1) / 2 + ((w - 1) / 9) * (i + 0.5), y: 4.75, z: front + 1 });
        stripe.rotation.x = 0.28;
        group.add(stripe);
      }
      top += 3;
    }
    if (spec.kind === "home") {
      // A chimney, a mailbox and a doormat: this one is yours.
      group.add(box(1.3, 3.4, 1.3, mine("#b9735a"), { x: w / 2 - 2.6, y: h + 2.6, z: -1 }));
      group.add(box(1.6, 0.3, 1.6, trim, { x: w / 2 - 2.6, y: h + 4.4, z: -1 }));
      group.add(box(0.14, 1.3, 0.14, mine("#6b7280"), { x: -doorWidth / 2 - 2.2, y: 0.65, z: front + 3.2 }));
      group.add(box(0.7, 0.45, 0.5, mine("#e5484d"), { x: -doorWidth / 2 - 2.2, y: 1.45, z: front + 3.2 }));
      group.add(box(doorWidth - 0.6, 0.06, 1.1, mine("#3f8f6b"), { y: 0.29, z: front + 2.3, cast: false }));
    }
    if (spec.kind === "booth") {
      // A counter window and a turning coin on the roof.
      group.add(box(4.4, 0.25, 1, mine("#ffffff"), { x: -w / 4 - 0.4, y: 2.2, z: front + 0.5 }));
      const coin = mesh(shape("coin", () => new THREE.CylinderGeometry(1.3, 1.3, 0.3, 28).rotateX(Math.PI / 2)), mine("#f5c542"), { y: top + 1.7 });
      for (const side of [-1, 1]) {
        const faceMesh = mesh(shape("coinFace", () => new THREE.CircleGeometry(1.1, 28)), textured(emblemTexture("₫", "#e0a81c")), { z: side * 0.16, cast: false });
        if (side < 0) faceMesh.rotation.y = Math.PI;
        coin.add(faceMesh);
      }
      group.add(coin);
      spinners.push({ object: coin, speed: 1.1 });
      top += 3;
    }

    group.userData.materials = [...own.values()];
    group.userData.spinners = spinners;
    group.userData.top = top;
    return group;
  };

  /** The name of a place, floating above it so it can be read from far away. */
  const label = (text, color) => {
    const texture = canvasTexture(512, 112, (ctx, w, h) => {
      ctx.fillStyle = "rgba(255,255,255,0.96)";
      rounded(ctx, 4, 4, w - 8, h - 8, 50);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(56, h / 2, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1d2142";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitText(ctx, text, w - 130, 54, 600);
      ctx.fillText(text, 92, h / 2 + 3);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
    sprite.scale.set(8.4, 8.4 * (112 / 512), 1);
    return sprite;
  };

  /** A speech bubble used when a student says hello. */
  const bubble = (text) => {
    const texture = canvasTexture(384, 128, (ctx, w, h) => {
      ctx.fillStyle = "#ffffff";
      rounded(ctx, 6, 6, w - 12, h - 34, 36);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w / 2 - 16, h - 30);
      ctx.lineTo(w / 2, h - 6);
      ctx.lineTo(w / 2 + 16, h - 30);
      ctx.fill();
      ctx.fillStyle = "#1d2142";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitText(ctx, text, w - 50, 50, 500);
      ctx.fillText(text, w / 2, (h - 28) / 2 + 6);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, fog: false }));
    sprite.scale.set(3.9, 1.3, 1);
    sprite.visible = false;
    return sprite;
  };

  /* ---------- sport ---------- */

  const pitch = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const texture = canvasTexture(1024, 640, (ctx, w, h) => {
      for (let i = 0; i < 10; i += 1) {
        ctx.fillStyle = i % 2 ? (night ? "#2f7a4c" : "#4fb863") : (night ? "#2a6f45" : "#45ab59");
        ctx.fillRect((w / 10) * i, 0, w / 10 + 1, h);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.92)";
      ctx.lineWidth = 7;
      ctx.strokeRect(26, 26, w - 52, h - 52);
      ctx.beginPath();
      ctx.moveTo(w / 2, 26);
      ctx.lineTo(w / 2, h - 26);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 78, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(26, h / 2 - 140, 120, 280);
      ctx.strokeRect(w - 146, h / 2 - 140, 120, 280);
    });
    const field = mesh(new THREE.PlaneGeometry(spec.w + 2, spec.d + 2), new THREE.MeshLambertMaterial({ map: texture }), { y: 0.04, cast: false, receive: true });
    field.rotation.x = -Math.PI / 2;
    group.add(field);
    const white = paint("#ffffff");
    for (const side of [-1, 1]) {
      const goal = new THREE.Group();
      goal.position.set(side * (spec.w / 2), 0, 0);
      goal.add(box(0.18, 2.6, 0.18, white, { y: 1.3, z: -3.2 }), box(0.18, 2.6, 0.18, white, { y: 1.3, z: 3.2 }), box(0.18, 0.18, 6.58, white, { y: 2.6 }));
      goal.add(box(1.6, 2.5, 6.4, paint("#ffffff", { opacity: 0.22 }), { x: side * 0.85, y: 1.25, cast: false }));
      group.add(goal);
    }
    // Stands on the south side.
    for (let step = 0; step < 3; step += 1) group.add(box(20, 0.6, 1, paint(step % 2 ? "#e9edf7" : "#cfd6ea"), { y: 0.3 + step * 0.6, z: spec.d / 2 + 3.2 + step, receive: true }));
    return group;
  };

  const court = (spec, hoopHeight) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const texture = canvasTexture(1024, 600, (ctx, w, h) => {
      ctx.fillStyle = night ? "#8a5a34" : "#e08a4a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = night ? "#28508a" : "#2f6fed";
      ctx.fillRect(22, h / 2 - 110, 210, 220);
      ctx.fillRect(w - 232, h / 2 - 110, 210, 220);
      ctx.strokeStyle = "rgba(255,255,255,0.94)";
      ctx.lineWidth = 7;
      ctx.strokeRect(22, 22, w - 44, h - 44);
      ctx.beginPath();
      ctx.moveTo(w / 2, 22);
      ctx.lineTo(w / 2, h - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
      ctx.stroke();
      for (const side of [0, 1]) {
        ctx.beginPath();
        ctx.arc(side ? w - 232 : 232, h / 2, 110, side ? Math.PI / 2 : -Math.PI / 2, side ? -Math.PI / 2 : Math.PI / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(side ? w - 22 : 22, h / 2, 270, side ? Math.PI / 2 : -Math.PI / 2, side ? -Math.PI / 2 : Math.PI / 2);
        ctx.stroke();
      }
    });
    const floor = mesh(new THREE.PlaneGeometry(spec.w + 2, spec.d + 2), new THREE.MeshLambertMaterial({ map: texture }), { y: 0.05, cast: false, receive: true });
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);
    for (const side of [-1, 1]) {
      const hoop = new THREE.Group();
      hoop.position.set(side * (spec.w / 2 + 0.6), 0, 0);
      hoop.add(mesh(shape("hoopPole", () => new THREE.CylinderGeometry(0.16, 0.2, hoopHeight + 1.2, 8)), paint("#3a4466"), { y: (hoopHeight + 1.2) / 2 }));
      hoop.add(box(1.5, 0.16, 0.16, paint("#3a4466"), { x: -side * 0.75, y: hoopHeight + 0.9 }));
      hoop.add(box(0.14, 1.9, 3, paint("#ffffff"), { x: -side * 1.45, y: hoopHeight + 0.75 }));
      hoop.add(box(0.16, 0.7, 1, paint("#e5484d"), { x: -side * 1.5, y: hoopHeight + 0.45, cast: false }));
      const ring = mesh(shape("ring", () => new THREE.TorusGeometry(0.55, 0.06, 6, 20).rotateX(Math.PI / 2)), paint("#ff6a2b"), { x: -side * 2.05, y: hoopHeight });
      const net = mesh(shape("net", () => new THREE.CylinderGeometry(0.55, 0.36, 0.8, 10, 1, true)), paint("#ffffff", { opacity: 0.5, side: THREE.DoubleSide }), { x: -side * 2.05, y: hoopHeight - 0.42, cast: false });
      hoop.add(ring, net);
      group.add(hoop);
    }
    return group;
  };

  const ball = (kind) => {
    if (kind === "football") {
      const texture = canvasTexture(256, 128, (ctx, w, h) => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#1d2142";
        for (let i = 0; i < 6; i += 1) for (let j = 0; j < 3; j += 1) {
          ctx.beginPath();
          ctx.arc(22 + i * 43 + (j % 2) * 21, 22 + j * 42, 11, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      return mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshLambertMaterial({ map: texture }));
    }
    const texture = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#e8742a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#3b1f10";
      ctx.lineWidth = 4;
      for (const x of [0, w / 4, w / 2, (3 * w) / 4]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    });
    return mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshLambertMaterial({ map: texture }));
  };

  /* ---------- set pieces ---------- */

  const gate = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const stone = paint("#f4efe6");
    const blue = paint("#2f6fed");
    for (const side of [-1, 1]) {
      group.add(box(2.2, 9, 2.2, stone, { x: side * (spec.w / 2), y: 4.5 }));
      group.add(box(2.7, 0.5, 2.7, blue, { x: side * (spec.w / 2), y: 9.25 }));
      group.add(mesh(shape("gateBall", () => new THREE.SphereGeometry(0.7, 12, 10)), paint("#f5c542"), { x: side * (spec.w / 2), y: 10.1 }));
    }
    group.add(box(spec.w + 2.2, 2, 1.5, blue, { y: 9.9 }));
    const cap = mesh(roofGeometry(spec.w + 4, 3, 1.5, spec.w + 4), paint("#1d4fc4", { flat: true }), { y: 10.9 });
    group.add(cap);
    const texture = signTexture("Trường Feynman", "#2f6fed");
    for (const side of [-1, 1]) {
      const board = mesh(new THREE.PlaneGeometry(10.4, 10.4 * (176 / 1024)), new THREE.MeshBasicMaterial({ map: texture, transparent: true }), { y: 9.9, z: side * 0.77, cast: false });
      if (side < 0) board.rotation.y = Math.PI;
      group.add(board);
    }
    return group;
  };

  const fountain = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const stone = paint("#d9d2c4");
    group.add(mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.9, 24), stone, { y: 0.45, receive: true }));
    const water = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.1, 24), new THREE.MeshLambertMaterial({ color: night ? "#3b6bb5" : "#63b8f2", transparent: true, opacity: 0.9 }), { y: 0.88, cast: false });
    group.add(water);
    group.add(mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 10), stone, { y: 1.3 }));
    group.add(mesh(new THREE.CylinderGeometry(1.3, 0.5, 0.4, 16), stone, { y: 2.6 }));
    // An open book on top: this is a school after all.
    for (const side of [-1, 1]) {
      const page = box(1.1, 0.12, 1.5, paint("#ffffff"), { x: side * 0.52, y: 3.1 });
      page.rotation.z = side * -0.28;
      group.add(page);
    }
    const drops = [];
    for (let i = 0; i < 14; i += 1) {
      const drop = mesh(shape("drop", () => new THREE.SphereGeometry(0.11, 6, 5)), paint("#c9e8ff", { basic: true }), { cast: false });
      drops.push(drop);
      group.add(drop);
    }
    group.userData.drops = drops;
    return group;
  };

  const flag = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 12, 8), paint("#e9edf7"), { y: 6 }));
    group.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.6, 12), paint("#d9d2c4"), { y: 0.3 }));
    const texture = canvasTexture(256, 160, (ctx, w, h) => {
      ctx.fillStyle = "#2f6fed";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 96px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("F", w / 2, h / 2 + 6);
    });
    const cloth = mesh(new THREE.PlaneGeometry(4, 2.5, 12, 4), new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }), { x: 2.1, y: 10.6 });
    cloth.userData.rest = cloth.geometry.attributes.position.array.slice();
    group.add(cloth);
    group.userData.cloth = cloth;
    return group;
  };

  const blackboard = (text) => {
    const group = new THREE.Group();
    const texture = canvasTexture(768, 384, (ctx, w, h) => {
      ctx.fillStyle = "#1f5a43";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "400 86px 'Patrick Hand', 'Lexend Variable', cursive";
      ctx.fillText(text, w / 2, h / 2 - 40);
      ctx.font = "400 56px 'Patrick Hand', 'Lexend Variable', cursive";
      ctx.fillStyle = "#ffe08a";
      ctx.fillText("1 + 1 = 2    a² + b² = c²", w / 2, h / 2 + 70);
    });
    group.add(box(6.6, 3.5, 0.2, paint("#8d5a3b"), { y: 2.9 }));
    group.add(mesh(new THREE.PlaneGeometry(6.2, 3.1), new THREE.MeshBasicMaterial({ map: texture }), { y: 2.9, z: 0.11, cast: false }));
    group.add(box(0.2, 1.2, 0.2, paint("#8d5a3b"), { x: -2.8, y: 0.6 }), box(0.2, 1.2, 0.2, paint("#8d5a3b"), { x: 2.8, y: 0.6 }));
    return group;
  };

  /** A plain house for the street outside the school. Its windows look north, at the campus. */
  const house = (x, z, w, h, d, wallColor, roofColor, face = -1) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(box(w, h, d, paint(wallColor), { y: h / 2 }));
    group.add(mesh(roofGeometry(w + 1, d + 1, h * 0.5, (w + 1) * 0.45), paint(roofColor, { flat: true }), { y: h }));
    const glass = paint(night ? "#ffd98a" : "#9fd0f5", { basic: true });
    const count = Math.max(2, Math.floor(w / 3.5));
    for (let i = 0; i < count; i += 1) {
      const wx = -w / 2 + (w / count) * (i + 0.5);
      const door = face > 0 && i === Math.floor(count / 2);
      if (door) group.add(box(1.7, 2.9, 0.2, paint("#6b4630"), { x: wx, y: 1.45, z: face * (d / 2 + 0.05), cast: false }));
      else group.add(box(1.4, 1.7, 0.2, glass, { x: wx, y: h * 0.58, z: face * (d / 2 + 0.05), cast: false }));
    }
    return group;
  };

  const bus = (x, z) => {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(box(10, 2.7, 2.9, paint("#ffc21f"), { y: 2.05 }));
    group.add(box(10.05, 0.3, 2.95, paint("#1d2142"), { y: 1.2 }));
    group.add(box(9.2, 1, 2.96, paint(night ? "#ffe9a8" : "#bfe3fb", { basic: true }), { x: -0.2, y: 2.7, cast: false }));
    for (const wx of [-3.2, 3.2]) for (const wz of [-1.4, 1.4]) group.add(mesh(shape("wheel", () => new THREE.CylinderGeometry(0.62, 0.62, 0.4, 14).rotateX(Math.PI / 2)), paint("#22242e"), { x: wx, y: 0.62, z: wz }));
    return group;
  };

  /* ---------- the lake ---------- */

  const lake = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    const outline = (w, d, r) => {
      const outlineShape = new THREE.Shape();
      const x = -w / 2;
      const y = -d / 2;
      outlineShape.moveTo(x + r, y);
      outlineShape.lineTo(x + w - r, y);
      outlineShape.quadraticCurveTo(x + w, y, x + w, y + r);
      outlineShape.lineTo(x + w, y + d - r);
      outlineShape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
      outlineShape.lineTo(x + r, y + d);
      outlineShape.quadraticCurveTo(x, y + d, x, y + d - r);
      outlineShape.lineTo(x, y + r);
      outlineShape.quadraticCurveTo(x, y, x + r, y);
      return new THREE.ShapeGeometry(outlineShape, 10);
    };
    const bank = mesh(outline(spec.w + 2.4, spec.d + 2.4, 9), paint(night ? "#8a8468" : "#e6d6a8"), { y: 0.04, cast: false, receive: true });
    bank.rotation.x = -Math.PI / 2;
    const water = mesh(outline(spec.w, spec.d, 8), new THREE.MeshLambertMaterial({ color: night ? "#1f4f8a" : "#3fa2e0", transparent: true, opacity: 0.93 }), { y: 0.07, cast: false, receive: true });
    water.rotation.x = -Math.PI / 2;
    group.add(bank, water);
    // Lily pads, reeds and stones, always at the same places.
    const spots = [[-20, -10], [-14, 8], [-22, 4], [16, -11], [22, 6], [12, 11], [-6, 13], [24, -4], [-24, -3], [8, -13]];
    spots.forEach(([x, z], index) => {
      const pad = mesh(shape("lily", () => new THREE.CircleGeometry(0.9, 9, 0.4, Math.PI * 1.8)), paint(night ? "#2f6b4a" : "#4fb168", { side: THREE.DoubleSide }), { x, y: 0.1, z, cast: false });
      pad.rotation.set(-Math.PI / 2, 0, index * 1.3);
      pad.scale.setScalar(0.7 + (index % 3) * 0.25);
      group.add(pad);
      if (index % 3 === 0) group.add(mesh(shape("lotus", () => new THREE.IcosahedronGeometry(0.28, 0)), paint("#ff9fc4", { flat: true }), { x: x + 0.2, y: 0.3, z }));
    });
    const reed = paint(night ? "#3d6b3a" : "#5c9a47");
    for (let i = 0; i < 36; i += 1) {
      const along = (i / 36) * 2 - 1;
      const side = i % 2 ? 1 : -1;
      const x = i % 4 < 2 ? along * (spec.w / 2 - 2) : side * (spec.w / 2 - 0.4);
      const z = i % 4 < 2 ? side * (spec.d / 2 - 0.4) : along * (spec.d / 2 - 2);
      if (z < 0 && Math.abs(x) < 6) continue; // keep the pier clear
      const stem = mesh(shape("reed", () => new THREE.CylinderGeometry(0.05, 0.07, 1.8, 4)), reed, { x, y: 0.9, z });
      stem.rotation.z = Math.sin(i * 2.7) * 0.2;
      group.add(stem);
      if (i % 3 === 0) group.add(mesh(shape("reedHead", () => new THREE.CapsuleGeometry(0.1, 0.36, 2, 5)), paint("#7a4a2c"), { x: x + stem.rotation.z * -0.9, y: 1.75, z }));
    }
    [[-29, -16], [29, 15], [-27, 17], [30, -15]].forEach(([x, z], index) => {
      const stone = mesh(shape("crown", () => new THREE.IcosahedronGeometry(1, 0)), paint("#9aa1ad", { flat: true }), { x, y: 0.4, z });
      stone.scale.set(1.3, 0.7, 1 + index * 0.15);
      stone.rotation.y = index;
      group.add(stone);
    });
    group.userData.water = water;
    return group;
  };

  /** The planks out over the water and the wider deck at the end. */
  const pier = (walk, deck) => {
    const group = new THREE.Group();
    const wood = paint("#b98152");
    const dark = paint("#8a5a37");
    const lay = (area, y) => {
      const count = Math.round(area.d / 0.8);
      for (let i = 0; i < count; i += 1) group.add(box(area.w, 0.16, area.d / count - 0.07, i % 2 ? wood : dark, { x: area.x, y, z: area.z - area.d / 2 + (area.d / count) * (i + 0.5), receive: true }));
      for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) group.add(mesh(shape("pile", () => new THREE.CylinderGeometry(0.18, 0.18, 1.5, 7)), dark, { x: area.x + sx * (area.w / 2 - 0.1), y: 0.1, z: area.z + sz * (area.d / 2 - 0.2) }));
    };
    lay(walk, 0.3);
    lay(deck, 0.3);
    // A bucket and a little bench for the angler.
    group.add(mesh(shape("bucket", () => new THREE.CylinderGeometry(0.34, 0.26, 0.5, 10)), paint("#4f86c6"), { x: deck.x + deck.w / 2 - 0.8, y: 0.63, z: deck.z - deck.d / 2 + 0.7 }));
    group.add(box(1.6, 0.14, 0.5, wood, { x: deck.x - deck.w / 2 + 1.2, y: 0.8, z: deck.z - deck.d / 2 + 0.6 }), box(0.14, 0.44, 0.44, dark, { x: deck.x - deck.w / 2 + 0.6, y: 0.58, z: deck.z - deck.d / 2 + 0.6 }), box(0.14, 0.44, 0.44, dark, { x: deck.x - deck.w / 2 + 1.8, y: 0.58, z: deck.z - deck.d / 2 + 0.6 }));
    return group;
  };

  /** The tackle stall: a counter under a striped roof. */
  const stall = (spec) => {
    const group = new THREE.Group();
    group.position.set(spec.x, 0, spec.z);
    group.add(box(4, 1.1, 1.6, paint("#c98d4f"), { y: 0.55 }), box(4.3, 0.14, 2, paint("#8a5a37"), { y: 1.17 }));
    for (const sx of [-1, 1]) group.add(box(0.16, 3.2, 0.16, paint("#8a5a37"), { x: sx * 1.95, y: 1.6, z: -0.7 }), box(0.16, 2.9, 0.16, paint("#8a5a37"), { x: sx * 1.95, y: 1.45, z: 0.8 }));
    for (let i = 0; i < 6; i += 1) {
      const stripe = box(4.6 / 6, 0.12, 2.6, paint(i % 2 ? "#ffffff" : "#0ea5a0"), { x: -2.3 + (4.6 / 6) * (i + 0.5), y: 3.1, z: 0.05 });
      stripe.rotation.x = 0.13;
      group.add(stripe);
    }
    const sign = mesh(new THREE.PlaneGeometry(3.4, 3.4 * (176 / 1024)), new THREE.MeshBasicMaterial({ map: signTexture("Tiệm câu", "#0b7f7a"), transparent: true }), { y: 2.45, z: 0.92, cast: false });
    group.add(sign);
    // Three rods leaning on the counter.
    for (let i = 0; i < 3; i += 1) {
      const leaning = mesh(shape("rodPole", () => new THREE.CylinderGeometry(0.03, 0.05, 3.4, 5)), paint(["#c9a35c", "#8a5a37", "#2b2f3a"][i]), { x: -1.4 + i * 0.45, y: 1.9, z: 1.05 });
      leaning.rotation.x = -0.2;
      group.add(leaning);
    }
    return group;
  };

  /** A fishing rod. Its `tip` is where the line starts. */
  const rod = () => {
    const group = new THREE.Group();
    group.add(mesh(shape("rodPole", () => new THREE.CylinderGeometry(0.03, 0.05, 3.4, 5)), paint("#8a5a37"), { y: 1.5 }));
    group.add(mesh(shape("rodGrip", () => new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6)), paint("#2b2f3a"), { y: 0 }));
    const tip = new THREE.Object3D();
    tip.position.y = 3.2;
    group.add(tip);
    group.userData.tip = tip;
    return group;
  };

  const bobber = () => {
    const group = new THREE.Group();
    group.add(mesh(shape("bobTop", () => new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), paint("#ff4d4d"), { cast: false }));
    group.add(mesh(shape("bobBottom", () => new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), paint("#ffffff"), { cast: false }));
    group.add(mesh(shape("bobPin", () => new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4)), paint("#2b2f3a"), { y: 0.3, cast: false }));
    return group;
  };

  const stool = (x, z) => mesh(shape("stool", () => new THREE.CylinderGeometry(0.34, 0.3, 0.5, 10)), paint("#c98d4f"), { x, y: 0.25, z });

  /** Ring on the ground that shows which door Enter will open. */
  const doorRing = () => {
    const ring = mesh(new THREE.RingGeometry(1.5, 1.9, 40), new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }), { y: 0.3, cast: false });
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    return ring;
  };

  /** The arrow that floats above your own head. */
  const marker = () => {
    const cone = mesh(new THREE.ConeGeometry(0.3, 0.55, 4), paint("#ffd23f", { basic: true }), { cast: false });
    cone.rotation.x = Math.PI;
    return cone;
  };

  const dispose = () => {
    paints.forEach((material) => material.dispose());
    shapes.forEach((geometry) => geometry.dispose());
  };

  return { paint, box, mesh, shape, student, tree, bush, lamp, bench, building, label, bubble, pitch, court, ball, gate, fountain, flag, blackboard, house, bus, lake, pier, stall, rod, bobber, stool, doorRing, marker, dispose };
};

/** Swings arms and legs. `stride` is the walk phase; `amount` runs from 0 (standing) to 1 (walking). */
export const poseStudent = (figure, stride, amount) => {
  const { legL, legR, armL, armR, body, head } = figure.userData.parts;
  const swing = Math.sin(stride) * 0.75 * amount;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.8;
  armR.rotation.x = swing * 0.8;
  const bob = Math.abs(Math.cos(stride)) * 0.07 * amount;
  body.position.y = bob;
  head.position.y = 1.83 + bob;
};

/** Sitting on a stool or the grass: knees forward, hands on the lap. */
export const seatStudent = (figure) => {
  const { legL, legR, armL, armR } = figure.userData.parts;
  legL.rotation.x = legR.rotation.x = -Math.PI / 2;
  armL.rotation.x = armR.rotation.x = -0.9;
  figure.position.y = -0.3 * figure.scale.y;
};
