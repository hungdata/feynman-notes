/**
 * Layout of the 3D campus. Plain data, no three.js, so it can be unit-tested.
 * Axes: x grows east, z grows south, y is up. One unit is roughly half a metre;
 * a student is about 1.9 units tall. Every door faces south, toward the gate.
 */

export const BOUNDS = { minX: -82, maxX: 82, minZ: -52, maxZ: 166 };
export const SPAWN = { x: 0, z: 58, heading: Math.PI };
export const PITCH = { x: -40, z: 48, w: 42, d: 26 };
export const COURT = { x: 40, z: 47, w: 28, d: 16 };

export const PLAYER_RADIUS = 0.55;
export const ENTER_RANGE = 5.2;

/** Buildings you can walk into. `x, z` is the centre of the footprint, `w` wide (x) and `d` deep (z). */
export const BUILDINGS = [
  { id: "mindmap", name: "Trường Mind Map", short: "Mind Map", route: "/mindmaps", kind: "school", x: -36, z: -38, w: 24, d: 14, h: 10, wall: "#f4efe6", roof: "#2f6fed", trim: "#1d4fc4", emblem: "map" },
  { id: "learn", name: "Trường Lộ trình học", short: "Lộ trình học", route: "/learn", kind: "main", x: 0, z: -40, w: 30, d: 16, h: 11, wall: "#f7f1e3", roof: "#18a058", trim: "#0f7a41", emblem: "clock" },
  { id: "tasks", name: "Trường Checklist", short: "Checklist", route: "/tasks", kind: "school", x: 36, z: -38, w: 24, d: 14, h: 10, wall: "#f6efe0", roof: "#f5a524", trim: "#c97c0a", emblem: "check" },
  { id: "english", name: "Trường Tiếng Anh", short: "Tiếng Anh", route: "/schools/english", kind: "language", x: -58, z: 8, w: 16, d: 11, h: 9, wall: "#fbeee6", roof: "#c0392b", trim: "#8f2a20", emblem: "ABC" },
  { id: "japanese", name: "Trường Tiếng Nhật", short: "Tiếng Nhật", route: "/schools/japanese", kind: "language", x: -36, z: 8, w: 16, d: 11, h: 9, wall: "#fdf3e3", roof: "#d9480f", trim: "#a5370c", emblem: "あ" },
  { id: "korean", name: "Trường Tiếng Hàn", short: "Tiếng Hàn", route: "/schools/korean", kind: "language", x: -14, z: 8, w: 16, d: 11, h: 9, wall: "#eef4fb", roof: "#1971c2", trim: "#145a9c", emblem: "가" },
  { id: "arcade", name: "Nhà giải trí", short: "Giải trí", route: "/giai-tri", kind: "arcade", x: 26, z: 8, w: 18, d: 11, h: 8, wall: "#efe9fb", roof: "#7c5cff", trim: "#5b3fe0", emblem: "8" },
  { id: "home", name: "Nhà của bạn", short: "Nhà của bạn", route: "/nha", kind: "home", x: -28, z: 105.5, w: 14, d: 10, h: 6.5, wall: "#fbf1dc", roof: "#b5543a", trim: "#7a3b28", emblem: "home" },
  { id: "bursar", name: "Phòng tài vụ", short: "Tài vụ", route: "/#tai-vu", kind: "booth", x: 52, z: 9, w: 13, d: 9, h: 6, wall: "#e9f6fb", roof: "#0ea5e9", trim: "#0b7fb3", emblem: "₫" },
];

/** The spot on the ground right in front of a building's door. */
export const doorOf = (building) => ({ x: building.x, z: building.z + building.d / 2 });

export const PLAZA = { x: 0, z: -8, r: 10 };
export const GATE = { x: 0, z: 81, w: 16 };
export const FLAG = { x: 9.5, z: 72 };
export const ROAD = { z: 90, d: 9 };
export const OUTDOOR_CLASS = { x: 72, z: -9 };

/* ---------- outside the school gate: a street, your house, and the lake ---------- */
export const FENCE = { minX: BOUNDS.minX - 1.4, maxX: BOUNDS.maxX + 1.4, minZ: BOUNDS.minZ - 1.4, maxZ: 81 };
export const LAKE = { x: 20, z: 143, w: 56, d: 34 };
export const PIER = { x: 20, z: 129, w: 3.2, d: 14 };          // planks from the bank out over the water
export const DECK = { x: 20, z: 137, w: 7, d: 4 };             // the wider end of the pier: stand here to fish
export const STALL = { x: 30.5, z: 122.6 };                    // the tackle stall next to the pier
/** Neighbours' houses on the street: [x, z, width, height, depth, wall, roof]. */
export const NEIGHBOURS = [
  [-50, 106, 13, 6.5, 9, "#e3f1df", "#3f8f6b"], [22, 106, 13, 7, 9, "#dfe9f7", "#4b6cb7"], [44, 106, 12, 6, 9, "#f3d9e6", "#8a5fbf"], [-58, 138, 12, 6.5, 10, "#f7edc9", "#b3562f"],
];
/** True on the fishing deck. */
export const onDeck = (point) => Math.abs(point.x - DECK.x) <= DECK.w / 2 && Math.abs(point.z - DECK.z) <= DECK.d / 2 + 0.3;

/** Paved strips as rectangles: [centre x, centre z, width (x), depth (z)]. */
export const PATHS = [
  [0, 31, 8, 110],       // main avenue, gate to the plaza
  [0, 84.5, 18, 5],      // apron outside the gate
  [0, 20, 132, 6],       // street of the language schools
  [0, -23, 100, 7],      // street of the three main schools
  [-36, -27.5, 6, 7], [0, -29, 8, 6], [36, -27.5, 6, 7],
  [-58, 15.5, 5, 5], [-36, 15.5, 5, 5], [-14, 15.5, 5, 5], [26, 15.5, 6, 5], [52, 16, 5, 6],
  [-12, 47, 16, 4], [16, 47, 20, 4],
  [62, -1, 5, 40],       // lane to the outdoor class
  [0, 101, 6, 29],       // crossing over the road and the lane down to the village street
  [0, 118, 116, 6],      // village street
  [-28, 113, 4, 5],      // walk to your front door
  [20, 122.6, 3.2, 3.4], // from the street to the pier
];

/** Trees as [x, z, size]. Kept off the paths and out of doorways. */
export const TREES = [
  [-74, 70, 1.2], [-58, 72, 1], [-30, 71, 1.1], [-14, 66, 0.9], [14, 66, 0.9], [30, 71, 1.1], [58, 72, 1], [74, 70, 1.2],
  [-72, 30, 1.1], [-70, 46, 1], [-70, 60, 1.2], [72, 30, 1.1], [70, 60, 1.2], [62, 44, 0.9],
  [-10, 34, 1], [10, 34, 1], [-10, 58, 0.9], [10, 58, 0.9],
  [-25, 0, 1], [-47, 0, 1.1], [-70, 2, 1.2], [15, 0, 1], [39, 0, 1], [-25, 26, 0.8], [-47, 26, 0.8], [14, 26, 0.8], [40, 26, 0.8],
  [-18, -12, 1.1], [18, -12, 1.1], [-18, -2, 0.9], [18, -2, 0.9],
  [-56, -14, 1.2], [-70, -30, 1.3], [-56, -40, 1.1], [56, -40, 1.1], [72, -34, 1.3], [48, -12, 1],
  [-64, 104, 1.1], [-12, 105, 1], [10, 105, 0.9], [60, 106, 1.2], [-40, 126, 1.1], [-16, 132, 1.2], [-24, 150, 1.3], [56, 132, 1], [58, 152, 1.2],
  [-10, 163, 1.1], [14, 164, 1], [40, 164, 1.2], [-44, 156, 1], [-70, 124, 1.2], [70, 122, 1.1], [-72, 158, 1.3], [72, 160, 1.2],
  [-18, -34, 0.9], [18, -34, 0.9], [-72, -14, 1], [76, 10, 1], [78, -24, 1.1], [50, -6, 0.9],
];

/** Street lamps as [x, z]. */
export const LAMPS = [
  [-5.5, 62], [5.5, 52], [-5.5, 38], [5.5, 30], [-5.5, 10], [5.5, 4],
  [-47, 24.5], [-25, 24.5], [14, 24.5], [39, 24.5],
  [-18, -18.5], [18, -18.5], [-48, -18.5], [48, -18.5],
  [-14, 113.6], [9, 113.6], [34, 113.6], [-44, 122.4], [24.5, 134.6],
];

/** Benches as [x, z, rotation]. */
export const BENCHES = [
  [-6.5, 54, Math.PI / 2], [6.5, 42, -Math.PI / 2], [-6.5, 28, Math.PI / 2],
  [-9, -1, Math.PI / 4], [9, -1, -Math.PI / 4], [-9, -15, (3 * Math.PI) / 4], [9, -15, (-3 * Math.PI) / 4],
  [-40, 33, 0], [-28, 33, 0], [40, 36.5, 0],
  [8, 123.2, Math.PI], [-4, 123.2, Math.PI], [42, 123.2, Math.PI],
];

const rect = (x, z, w, d, pad = 0) => ({ minX: x - w / 2 - pad, maxX: x + w / 2 + pad, minZ: z - d / 2 - pad, maxZ: z + d / 2 + pad });

/** Solid things the player cannot walk through. Boxes are AABBs, the rest are circles. */
export const buildColliders = () => {
  const boxes = BUILDINGS.map((b) => ({ ...rect(b.x, b.z, b.w, b.d, 0.2), height: b.h + 4, id: b.id }));
  // Gate pillars, bleachers, hoops, the blackboard of the outdoor class.
  boxes.push(rect(GATE.x - GATE.w / 2, GATE.z, 2.2, 2.2), rect(GATE.x + GATE.w / 2, GATE.z, 2.2, 2.2));
  boxes.push(rect(PITCH.x, PITCH.z + PITCH.d / 2 + 4.2, 20, 3));
  boxes.push(rect(OUTDOOR_CLASS.x, OUTDOOR_CLASS.z - 7.4, 7, 0.8));
  // The fence along the street, with the gate open in the middle.
  const fenceLength = (FENCE.maxX - FENCE.minX - GATE.w) / 2;
  for (const side of [-1, 1]) boxes.push(rect(side * (GATE.w / 2 + fenceLength / 2), FENCE.maxZ, fenceLength, 0.5));
  for (const [x, z, w, , d] of NEIGHBOURS) boxes.push(rect(x, z, w, d, 0.2));
  boxes.push(rect(STALL.x, STALL.z, 4.4, 2.4));
  // Water: everything of the lake except the pier and its deck.
  const lake = rect(LAKE.x, LAKE.z, LAKE.w, LAKE.d);
  const pier = rect(PIER.x, PIER.z, PIER.w, PIER.d);
  const deck = rect(DECK.x, DECK.z, DECK.w, DECK.d);
  boxes.push({ ...lake, maxX: deck.minX }, { ...lake, minX: deck.maxX });
  boxes.push({ minX: deck.minX, maxX: pier.minX, minZ: lake.minZ, maxZ: deck.minZ }, { minX: pier.maxX, maxX: deck.maxX, minZ: lake.minZ, maxZ: deck.minZ });
  boxes.push({ minX: deck.minX, maxX: deck.maxX, minZ: deck.maxZ, maxZ: lake.maxZ });
  const circles = [
    { x: PLAZA.x, z: PLAZA.z, r: 3.3 },
    { x: FLAG.x, z: FLAG.z, r: 0.5 },
    ...TREES.map(([x, z, s]) => ({ x, z, r: 0.55 * s })),
    ...LAMPS.map(([x, z]) => ({ x, z, r: 0.3 })),
    ...BENCHES.map(([x, z]) => ({ x, z, r: 1 })),
    { x: COURT.x - COURT.w / 2 - 0.6, z: COURT.z, r: 0.4 }, { x: COURT.x + COURT.w / 2 + 0.6, z: COURT.z, r: 0.4 },
  ];
  return { boxes, circles };
};

/**
 * Walkable graph for the other students. `door` nodes are places a student
 * disappears into (a classroom, or the street outside the gate).
 */
export const NODES = {
  apron: { x: 0, z: 85 },
  village: { x: 0, z: 118 },
  pierHead: { x: 20, z: 118 },
  lakeSide: { x: 20, z: 123.4, door: "lake" },
  outside: { x: 55, z: 118, door: "outside" },
  outsideWest: { x: -55, z: 118, door: "outside" },
  homeStreet: { x: -28, z: 118 },
  home: { x: -28, z: 111.3, door: "home" },
  gate: { x: 0, z: 72 },
  sport: { x: 0, z: 47 },
  pitchSide: { x: -17, z: 47, door: "pitch" },
  courtSide: { x: 23, z: 47, door: "court" },
  cross: { x: 0, z: 20 },
  langW: { x: -58, z: 20 }, langM: { x: -36, z: 20 }, langE: { x: -14, z: 20 },
  funSt: { x: 26, z: 20 }, paySt: { x: 52, z: 20 }, laneS: { x: 62, z: 20 },
  english: { x: -58, z: 14.2, door: "english" },
  japanese: { x: -36, z: 14.2, door: "japanese" },
  korean: { x: -14, z: 14.2, door: "korean" },
  arcade: { x: 26, z: 14.2, door: "arcade" },
  bursar: { x: 52, z: 14.2, door: "bursar" },
  plazaS: { x: 0, z: 2 },
  plazaW: { x: -7.5, z: -8 }, plazaE: { x: 7.5, z: -8 },
  plazaN: { x: 0, z: -18 },
  north: { x: 0, z: -23 },
  northW: { x: -36, z: -23 }, northE: { x: 36, z: -23 },
  learn: { x: 0, z: -31.3, door: "learn" },
  mindmap: { x: -36, z: -30.3, door: "mindmap" },
  tasks: { x: 36, z: -30.3, door: "tasks" },
  laneN: { x: 62, z: -9, door: "class" },
};

export const EDGES = [
  ["apron", "gate"], ["apron", "village"], ["village", "pierHead"], ["pierHead", "lakeSide"], ["pierHead", "outside"], ["village", "homeStreet"], ["homeStreet", "outsideWest"], ["homeStreet", "home"], ["gate", "sport"], ["sport", "pitchSide"], ["sport", "courtSide"], ["sport", "cross"],
  ["cross", "langE"], ["langE", "langM"], ["langM", "langW"], ["cross", "funSt"], ["funSt", "paySt"], ["paySt", "laneS"], ["laneS", "laneN"],
  ["langW", "english"], ["langM", "japanese"], ["langE", "korean"], ["funSt", "arcade"], ["paySt", "bursar"],
  ["cross", "plazaS"], ["plazaS", "plazaW"], ["plazaS", "plazaE"], ["plazaW", "plazaN"], ["plazaE", "plazaN"], ["plazaN", "north"],
  ["north", "northW"], ["north", "northE"], ["north", "learn"], ["northW", "mindmap"], ["northE", "tasks"],
];

/** How often students head for each door (the three main schools are the busiest). */
export const DOOR_WEIGHTS = { learn: 5, mindmap: 4, tasks: 4, english: 3, japanese: 3, korean: 3, arcade: 2, bursar: 1, pitch: 2, court: 2, class: 2, lake: 2, outside: 2, home: 1 };

/** Sky, light and fog for each time of day. */
export const SKIES = {
  morning: { top: "#7fb8f5", bottom: "#fde3c4", fog: "#f3dcc4", sun: "#ffe2b0", sunPower: 2.5, ambient: 1.2, ground: "#7fc46b", sunAt: [58, 40, 55], night: false },
  day: { top: "#4f9df0", bottom: "#cfe9ff", fog: "#cfe6f7", sun: "#fff6e0", sunPower: 2.75, ambient: 1.3, ground: "#74c365", sunAt: [-42, 62, 60], night: false },
  evening: { top: "#4a4f9a", bottom: "#ffb37a", fog: "#f0b08a", sun: "#ffb169", sunPower: 2.3, ambient: 1.05, ground: "#6fae62", sunAt: [-72, 30, 50], night: false },
  night: { top: "#0b1233", bottom: "#27356b", fog: "#1b2550", sun: "#9db4ff", sunPower: 0.8, ambient: 0.7, ground: "#3c6a52", sunAt: [-34, 60, 52], night: true },
};
