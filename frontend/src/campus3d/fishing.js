/**
 * The reeling game, as pure logic.
 *
 * A fish darts up and down a bar. Holding the button lifts the catch zone,
 * letting go lets it sink. While the fish is inside the zone the catch fills
 * up; outside it drains. Full: the fish is landed. Empty: it got away.
 * Everything is in bar units: 0 is the bottom, 1 the top.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const REEL = { start: 0.32, gain: 0.34, lift: 2.2, sink: 1.7, fastest: 0.9 };

/** `pull` is how hard the fish fights (about 0.3 to 1.1); `zone` is the height of the catch zone. */
export const createReel = (pull, zone) => ({
  pull, zone,
  fish: 0.5, target: 0.5, rest: 0.4,
  at: 0.5 - zone / 2, speed: 0,
  progress: REEL.start, result: null, time: 0,
});

export const fishInZone = (reel) => reel.fish >= reel.at && reel.fish <= reel.at + reel.zone;

export const stepReel = (reel, dt, holding, random = Math.random) => {
  if (reel.result) return reel;
  reel.time += dt;

  // The fish picks a new spot now and then; a stronger fish does it sooner and swims faster.
  reel.rest -= dt;
  if (reel.rest <= 0) {
    // Anywhere within reach that is still on the bar (so the fish does not get stuck at an end).
    const reach = 0.2 + reel.pull * 0.35;
    const low = Math.max(0.04, reel.fish - reach);
    const high = Math.min(0.96, reel.fish + reach);
    reel.target = low + random() * (high - low);
    reel.rest = (0.5 + random()) / (0.6 + reel.pull);
  }
  const swim = (0.22 + reel.pull * 0.5) * dt;
  reel.fish += clamp(reel.target - reel.fish, -swim, swim);

  // The zone has weight: it speeds up while the button is held and falls back when it is not.
  reel.speed += (holding ? REEL.lift : -REEL.sink) * dt;
  reel.speed = clamp(reel.speed, -REEL.fastest, REEL.fastest);
  reel.at += reel.speed * dt;
  if (reel.at <= 0) { reel.at = 0; reel.speed = Math.max(0, -reel.speed * 0.3); }
  if (reel.at >= 1 - reel.zone) { reel.at = 1 - reel.zone; reel.speed = Math.min(0, -reel.speed * 0.3); }

  reel.progress += (fishInZone(reel) ? REEL.gain : -(0.13 + reel.pull * 0.12)) * dt;
  if (reel.progress >= 1) { reel.progress = 1; reel.result = "caught"; }
  if (reel.progress <= 0) { reel.progress = 0; reel.result = "lost"; }
  return reel;
};
