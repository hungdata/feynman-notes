import { createSports, joinSport, leaveSport, actSport, stepSports, BOUNDS, SPAWN, PITCH, COURT } from "../../../shared/campusSports.mjs";
import { buildColliders, PLAYER_RADIUS } from "../../../frontend/src/campus3d/world.js";
import { moveWithCollisions } from "../../../frontend/src/campus3d/movement.js";
import { CampusError } from "./profiles.js";

const colliders = buildColliders();
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const publicPlayer = (player) => ({
  id: player.id, name: player.name, gender: player.gender,
  x: player.x, z: player.z, heading: player.heading,
  moving: player.moving, sport: player.sport, team: player.team,
});

/** One authoritative campus per Node process. No client can submit scores,
 * ball positions, another player's identity, or a shot outcome. */
export const createCampusRuntime = ({ now = Date.now, staleMs = 35_000, maxPlayers = 128 } = {}) => {
  const players = new Map();
  const sports = createSports();
  const streamDeadlines = new WeakMap();
  let timer = null;
  let frame = 0;
  let lastTick = now();

  const snapshot = (selfId) => ({
    selfId,
    players: [...players.values()].map(publicPlayer),
    football: sports.football,
    basketball: sports.basketball,
  });

  const remove = (id, expectedPlayer = players.get(id)) => {
    const player = players.get(id);
    if (!player || player !== expectedPlayer) return;
    leaveSport(sports, player);
    players.delete(id);
    for (const stream of player.streams) stream.end();
    player.streams.clear();
    if (!players.size && timer) { clearInterval(timer); timer = null; }
  };

  const broadcast = () => {
    for (const player of players.values()) {
      const data = `event: world\ndata: ${JSON.stringify(snapshot(player.id))}\n\n`;
      for (const stream of player.streams) {
        if (stream.destroyed || stream.writableLength > 256 * 1024) stream.destroy();
        else stream.write(data);
      }
    }
  };

  const tick = () => {
    const timestamp = now();
    for (const player of players.values()) {
      for (const stream of [...player.streams]) {
        if (streamDeadlines.get(stream) <= timestamp) {
          player.streams.delete(stream);
          stream.end();
        }
      }
      if (!player.streams.size || timestamp - player.lastInput > staleMs) remove(player.id, player);
      else if (timestamp - player.lastInput > 500) player.moving = false;
    }
    if (!players.size) return;
    // Fixed-size physics substeps keep goal/hoop checks correct after a pause.
    let pending = Math.min(0.15, Math.max(0, (timestamp - lastTick) / 1000));
    lastTick = timestamp;
    while (pending > 0) {
      const dt = Math.min(pending, 1 / 30);
      stepSports(sports, dt, [...players.values()]);
      pending -= dt;
    }
    frame += 1;
    if (frame % 3 === 0) broadcast();
  };

  const connect = (profile, stream, sessionExpiresAt = now() + 7 * 24 * 60 * 60 * 1000) => {
    if (!Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= now()) {
      throw new CampusError("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.", 401, "CAMPUS_AUTH_REQUIRED");
    }
    let player = players.get(profile.id);
    if (!player) {
      if (players.size >= maxPlayers) throw new CampusError("Sân trường đang đông. Hãy thử lại sau.", 503, "CAMPUS_FULL");
      player = {
        ...profile, ...SPAWN, moving: false, sport: null, team: null,
        lastInput: now(), lastMove: now(), initialPosition: true,
        streams: new Set(), rate: new Map(),
      };
      players.set(player.id, player);
    }
    if (player.streams.size >= 4) throw new CampusError("Bạn đang mở quá nhiều cửa sổ sân trường.", 429, "TOO_MANY_TABS");
    Object.assign(player, profile);
    player.lastInput = now();
    player.streams.add(stream);
    streamDeadlines.set(stream, Math.min(sessionExpiresAt, now() + 7 * 24 * 60 * 60 * 1000));
    if (!timer) {
      lastTick = now();
      timer = setInterval(tick, 1000 / 30);
      timer.unref?.();
    }
    stream.on("close", () => {
      player.streams.delete(stream);
      // A terminated stream can emit close after this profile has reconnected.
      // Its callback may only remove the presence to which it originally belonged.
      if (!player.streams.size && players.get(player.id) === player) { remove(player.id, player); broadcast(); }
    });
    broadcast();
    return player;
  };

  const current = (id) => {
    const player = players.get(id);
    if (!player) throw new CampusError("Kết nối lại sân trường trước khi chơi.", 409, "CAMPUS_DISCONNECTED");
    return player;
  };
  const limit = (player, name, count, period = 1000) => {
    const timestamp = now();
    const state = player.rate.get(name);
    if (!state || timestamp - state.start >= period) { player.rate.set(name, { start: timestamp, count: 1 }); return; }
    state.count += 1;
    if (state.count > count) throw new CampusError("Bạn thao tác quá nhanh. Chờ một chút nhé.", 429, "CAMPUS_RATE_LIMIT");
  };

  return {
    sports, players, snapshot, tick, broadcast, connect,
    updateProfile(profile) {
      const player = players.get(profile.id);
      if (player) { Object.assign(player, profile); broadcast(); }
    },
    input(id, input) {
      const player = current(id);
      limit(player, "input", 30);
      if (!input || ![input.x, input.z, input.heading].every(Number.isFinite) || typeof input.moving !== "boolean"
        || input.x < BOUNDS.minX + PLAYER_RADIUS || input.x > BOUNDS.maxX - PLAYER_RADIUS
        || input.z < BOUNDS.minZ + PLAYER_RADIUS || input.z > BOUNDS.maxZ - PLAYER_RADIUS) {
        throw new CampusError("Vị trí di chuyển không hợp lệ.");
      }
      const timestamp = now();
      let target = { x: input.x, z: input.z };
      if (player.initialPosition && !player.sport) {
        // Restore a saved location once, but never inside a building.
        const blocked = colliders.boxes.some((box) => target.x > box.minX - PLAYER_RADIUS && target.x < box.maxX + PLAYER_RADIUS
          && target.z > box.minZ - PLAYER_RADIUS && target.z < box.maxZ + PLAYER_RADIUS);
        if (blocked) throw new CampusError("Vị trí lưu nằm trong vật cản. Hãy trở về cổng trường.");
        target = moveWithCollisions(target, 0, 0, PLAYER_RADIUS, colliders, BOUNDS);
      } else {
        let dx = target.x - player.x;
        let dz = target.z - player.z;
        const distance = Math.hypot(dx, dz);
        const allowance = 12 * Math.min(0.25, Math.max(0, (timestamp - player.lastMove) / 1000)) + 0.12;
        if (distance > allowance) { dx *= allowance / distance; dz *= allowance / distance; }
        // Substeps prevent moving through a narrow wall between packets.
        target = { x: player.x, z: player.z };
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.3));
        for (let step = 0; step < steps; step += 1) {
          target = moveWithCollisions(target, dx / steps, dz / steps, PLAYER_RADIUS, colliders, BOUNDS);
        }
      }
      if (player.sport) {
        const field = player.sport === "football" ? PITCH : COURT;
        target.x = clamp(target.x, field.x - field.w / 2 + PLAYER_RADIUS, field.x + field.w / 2 - PLAYER_RADIUS);
        target.z = clamp(target.z, field.z - field.d / 2 + PLAYER_RADIUS, field.z + field.d / 2 - PLAYER_RADIUS);
      }
      Object.assign(player, target, { heading: Math.atan2(Math.sin(input.heading), Math.cos(input.heading)), moving: input.moving,
        initialPosition: false, lastInput: timestamp, lastMove: timestamp });
      return publicPlayer(player);
    },
    action(id, action) {
      const player = current(id);
      limit(player, "action", 8);
      if (!action || !["join", "leave", "shoot"].includes(action.type)) throw new CampusError("Thao tác chơi không hợp lệ.");
      if (action.type === "join" && (!["football", "basketball"].includes(action.sport)
        || (action.team !== undefined && action.team !== 0 && action.team !== 1))) throw new CampusError("Chọn sân và đội hợp lệ.");
      if (action.type === "shoot" && action.power !== undefined && (!Number.isFinite(action.power) || action.power < 0 || action.power > 1)) {
        throw new CampusError("Lực sút hoặc ném phải từ 0 đến 1.");
      }
      let result;
      if (action.type === "join") result = joinSport(sports, player, action.sport, action.team);
      else if (action.type === "leave") result = leaveSport(sports, player);
      else result = actSport(sports, player, action.power);
      if (result?.ok === false) throw new CampusError(result.message || "Chưa thực hiện được thao tác này.", 409, result.code);
      player.lastInput = now();
      player.lastMove = now();
      if (action.type === "join") player.initialPosition = false;
      broadcast();
      return { ok: true, player: publicPlayer(player), event: result?.event };
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const id of [...players.keys()]) remove(id);
    },
  };
};
