/** Geometry and sky palettes of the campus scene (SVG viewBox 1200 × 640). */

export const VIEW = { width: 1200, height: 640 };

// Where the student stands: in the plaza, waiting at a school, or walking in through its door.
export const SPOTS = {
  center: { x: 600, y: 574, scale: 1 },
  mindmap: { wait: { x: 300, y: 492, scale: 0.84 }, door: { x: 240, y: 462, scale: 0.6 } },
  learn: { wait: { x: 600, y: 438, scale: 0.72 }, door: { x: 600, y: 404, scale: 0.5 } },
  tasks: { wait: { x: 900, y: 492, scale: 0.84 }, door: { x: 960, y: 462, scale: 0.6 } },
};

export const spotFor = (target, entering) => {
  if (!target) return SPOTS.center;
  return entering ? SPOTS[target].door : SPOTS[target].wait;
};

export const timeOfDay = (hour = new Date().getHours()) => {
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 17) return "day";
  if (hour >= 17 && hour < 19) return "evening";
  return "night";
};

export const greetingFor = (hour = new Date().getHours()) => {
  if (hour >= 5 && hour < 11) return "Chào buổi sáng";
  if (hour >= 11 && hour < 13) return "Chào buổi trưa";
  if (hour >= 13 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
};

// Deterministic star field so the night sky does not jump between renders.
export const STARS = Array.from({ length: 90 }, (_, index) => {
  const seed = Math.sin(index * 12.9898) * 43758.5453;
  const random = seed - Math.floor(seed);
  const seed2 = Math.sin(index * 78.233) * 12543.123;
  const random2 = seed2 - Math.floor(seed2);
  return { x: Math.round(random * 2400 - 600), y: Math.round(random2 * 600 - 300), r: index % 7 === 0 ? 1.8 : 1.1, delay: (index % 5) * 0.7 };
});

/** Pixel position of a scene point inside a box of size w × h (preserveAspectRatio xMidYMax meet). */
export const projectPoint = ({ x, y }, { w, h }) => {
  const scale = Math.min(w / VIEW.width, h / VIEW.height) || 0;
  return { left: (w - VIEW.width * scale) / 2 + x * scale, top: h - VIEW.height * scale + y * scale };
};
