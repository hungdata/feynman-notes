/**
 * Phòng đấu bóng đá online 1 chọi 1 (mỗi người cầm một đội 11 người).
 * Máy chủ chạy trận (không tin trình duyệt): nhận phím + lệnh, gửi ảnh chụp trận 20 lần/giây qua SSE.
 */
import { createMatch, stepMatch, drainEvents, act, startSecondHalf } from "../../../frontend/src/football/sim.js";
import { FORMATIONS, KITS } from "../../../frontend/src/football/constants.js";
import { packMatch, cleanAction, cleanInput } from "../../../frontend/src/football/net.js";

export class FootballError extends Error {
  constructor(message, status = 400, code = "FOOTBALL_BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HALVES = [3, 4, 6, 8];
const ASSISTS = new Set(["assisted", "semi", "manual"]);

const pickSetting = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const createFootballRooms = ({ now = Date.now, tickMs = 50, seatTimeoutMs = 45_000, idleRoomMs = 120_000, maxRooms = 128, random = Math.random } = {}) => {
  const rooms = new Map();
  const memberships = new Map();
  const operationRates = new Map();
  const streamDeadlines = new WeakMap();
  let timer = null;

  const recordBody = (body) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new FootballError("Dữ liệu thao tác không hợp lệ.");
    return body;
  };
  const operationLimit = (user, name, count = 30) => {
    const timestamp = now();
    const key = `${user.id}:${name}`;
    const state = operationRates.get(key);
    if (!state || timestamp - state.start >= 60_000) {
      operationRates.delete(key);
      operationRates.set(key, { start: timestamp, count: 1 });
      while (operationRates.size > 2048) operationRates.delete(operationRates.keys().next().value);
      return;
    }
    if (++state.count > count) throw new FootballError("Bạn thao tác quá nhanh. Chờ một chút nhé.", 429, "FOOTBALL_RATE_LIMIT");
  };
  const existingRoom = (user) => rooms.get(memberships.get(user.id));
  const deleteRoom = (room) => {
    rooms.delete(room.code);
    for (const seat of room.seats) if (seat) {
      if (memberships.get(seat.userId) === room.code) memberships.delete(seat.userId);
      for (const stream of [...seat.streams]) { seat.streams.delete(stream); stream.end?.(); }
    }
  };

  const newCode = () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let code = "";
      for (let i = 0; i < 5; i += 1) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
      if (!rooms.has(code)) return code;
    }
    throw new FootballError("Không tạo được mã phòng. Thử lại nhé.", 503, "FOOTBALL_BUSY");
  };

  const seatOf = (room, userId) => room.seats.findIndex((seat) => seat?.userId === userId);

  const roomOf = (code) => {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) throw new FootballError("Không tìm thấy phòng. Kiểm tra lại mã phòng.", 404, "FOOTBALL_ROOM_NOT_FOUND");
    return room;
  };

  const lobbyView = (room, you) => ({
    code: room.code,
    status: room.status,
    public: room.public,
    you,
    settings: room.settings,
    seats: room.seats.map((seat) => seat && { name: seat.name, ready: seat.ready, formation: seat.formation, kit: seat.kit, assist: seat.assist, connected: seat.streams.size > 0, rematch: room.rematch.has(seat.userId) }),
  });

  const send = (stream, event, data) => {
    // Luồng đã đóng (người chơi vừa rời) thì bỏ qua, không được ghi nữa.
    if (stream.destroyed || stream.writableEnded) return;
    if (stream.writableLength > 512 * 1024) { stream.destroy?.(); return; }
    try { stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { stream.destroy?.(); }
  };

  const broadcastLobby = (room) => {
    room.seats.forEach((seat, index) => {
      if (!seat) return;
      for (const stream of seat.streams) send(stream, "lobby", lobbyView(room, index));
    });
  };

  const broadcast = (room, event, data) => {
    for (const seat of room.seats) if (seat) for (const stream of seat.streams) send(stream, event, data);
  };

  const ensureTimer = () => {
    if (timer) return;
    timer = setInterval(tick, tickMs);
    timer.unref?.();
  };

  const startMatch = (room) => {
    const [home, away] = room.seats;
    const seed = Math.floor(random() * 2 ** 31);
    let awayKit = away.kit;
    if (awayKit === home.kit) awayKit = home.kit === "white" ? "black" : "white";
    room.config = {
      seed,
      halfMinutes: room.settings.halfMinutes,
      homeFormation: home.formation,
      awayFormation: away.formation,
      homeKit: home.kit,
      awayKit,
      names: [home.name, away.name],
      homeOvr: 82,
      awayOvr: 82,
    };
    // Hai đội cân sức: cùng chỉ số tổng như nhau.
    room.match = createMatch({ ...room.config, humans: [0, 1] });
    room.match.humans[0].assist = home.assist;
    room.match.humans[1].assist = away.assist;
    room.match.teams[0].name = home.name;
    room.match.teams[1].name = away.name;
    room.status = "playing";
    room.lastStep = now();
    room.halftimeAt = null;
    room.packs = 0;
    room.rematch.clear();
    room.seats.forEach((seat, index) => { seat.ready = false; seat.human = room.match.humans[index]; seat.lastInput = now(); });
    broadcast(room, "start", { config: room.config });
    broadcastLobby(room);
    ensureTimer();
  };

  const endRoom = (room, reason, forfeitingTeam) => {
    if (room.status !== "playing") return;
    room.status = "ended";
    room.endReason = reason;
    if (room.match && (forfeitingTeam === 0 || forfeitingTeam === 1)) {
      const winner = room.match.teams[1 - forfeitingTeam];
      winner.score = Math.max(winner.score, 3, room.match.teams[forfeitingTeam].score + 1);
      room.match.phase = "fulltime";
      room.match.phaseT = 0;
      // Deliver the final score before the end event builds a report from the last snapshot.
      broadcast(room, "state", packMatch(room.match, [], { stats: true }));
    }
    broadcast(room, "end", { reason, score: room.match ? room.match.teams.map((team) => team.score) : [0, 0] });
    broadcastLobby(room);
  };

  function tick() {
    const timestamp = now();
    for (const room of rooms.values()) {
      for (const seat of room.seats) if (seat) {
        for (const stream of [...seat.streams]) {
          if (stream.destroyed || stream.writableEnded || streamDeadlines.get(stream) <= timestamp) {
            seat.streams.delete(stream);
            seat.lastSeen = timestamp;
            stream.end?.();
          }
        }
        // A live event stream does not mean the tab is still producing controls.
        if (seat.human && timestamp - seat.lastInput > 1000) Object.assign(seat.human.input, cleanInput({}));
      }
      // Dọn phòng không còn ai.
      const anyone = room.seats.some((seat) => seat && seat.streams.size);
      if (!anyone && timestamp - room.lastActive > idleRoomMs) { deleteRoom(room); continue; }
      if (anyone) room.lastActive = timestamp;
      if (timestamp - room.lastHeartbeat >= 15_000) {
        room.lastHeartbeat = timestamp;
        broadcast(room, "ping", { time: timestamp });
      }
      if (room.status !== "playing") {
        for (let index = room.seats.length - 1; index >= 0; index -= 1) {
          const seat = room.seats[index];
          if (seat && !seat.streams.size && timestamp - seat.lastSeen > seatTimeoutMs) removeSeat(room, index);
        }
        if (!room.seats.some(Boolean)) { deleteRoom(room); continue; }
      }
      if (room.status !== "playing" || !room.match) continue;
      const match = room.match;
      // Người mất kết nối: máy đá thay, quá lâu thì xử thua.
      room.seats.forEach((seat, team) => {
        if (!seat || room.status !== "playing") return;
        const online = seat.streams.size > 0 || timestamp - (seat.lastCommand || 0) < 1500;
        if (online) {
          seat.awaySince = null;
          if (!match.humans[team]) match.humans[team] = seat.human;
          return;
        }
        // Rớt mạng thoáng qua (trình duyệt tự nối lại) thì chờ 2 giây rồi mới để máy đá thay.
        seat.awaySince ??= timestamp;
        if (match.humans[team] && timestamp - seat.awaySince > 2000) match.humans[team] = null;
        if (timestamp - seat.awaySince > seatTimeoutMs) endRoom(room, `${seat.name} đã rời trận.`, team);
      });
      if (room.status !== "playing") continue;
      const dt = Math.min(0.25, Math.max(0, (timestamp - room.lastStep) / 1000));
      room.lastStep = timestamp;
      stepMatch(match, dt);
      const events = drainEvents(match);
      if (match.phase === "halftime") {
        room.halftimeAt ??= timestamp;
        if (timestamp - room.halftimeAt > 12_000) { startSecondHalf(match); room.halftimeAt = null; room.rematch.clear(); }
      }
      room.packs += 1;
      const phaseChanged = room.lastPhase !== match.phase;
      room.lastPhase = match.phase;
      broadcast(room, "state", packMatch(match, events, { stats: phaseChanged || room.packs % 10 === 0 }));
      if (match.phase === "fulltime" && room.status === "playing") {
        room.status = "finished";
        broadcastLobby(room);
      }
    }
    // Idle lobbies also need expiry and authenticated SSE heartbeats.
    if (!rooms.size) {
      clearInterval(timer);
      timer = null;
    }
  }

  const newSeat = (user) => ({ userId: user.id, name: user.name, ready: false, formation: "4-3-3", kit: "red", assist: "assisted", streams: new Set(), rate: new Map(), lastSeen: now(), lastInput: now() });

  function removeSeat(room, index) {
    const seat = room.seats[index];
    if (!seat) return;
    // Detach before ending streams: a synchronous or delayed close must not mutate a replacement seat.
    room.seats[index] = null;
    if (memberships.get(seat.userId) === room.code) memberships.delete(seat.userId);
    for (const stream of [...seat.streams]) { seat.streams.delete(stream); stream.end?.(); }
    if (index === 0 && room.seats[1]) { room.seats[0] = room.seats[1]; room.seats[1] = null; }
    room.status = "lobby";
    room.match = null;
    room.config = null;
    room.rematch.clear();
    room.seats.forEach((remaining) => { if (remaining) { remaining.ready = false; remaining.human = null; } });
    if (rooms.has(room.code)) broadcastLobby(room);
  }

  const limit = (seat, name, count) => {
    const timestamp = now();
    const state = seat.rate.get(name);
    if (!state || timestamp - state.start >= 1000) { seat.rate.set(name, { start: timestamp, count: 1 }); return; }
    state.count += 1;
    if (state.count > count) throw new FootballError("Bạn bấm quá nhanh. Chờ một chút nhé.", 429, "FOOTBALL_RATE_LIMIT");
  };

  const seated = (user, code) => {
    const room = roomOf(code);
    const index = seatOf(room, user.id);
    if (index < 0) throw new FootballError("Bạn chưa ở trong phòng này.", 403, "FOOTBALL_NOT_SEATED");
    return { room, index, seat: room.seats[index] };
  };

  return {
    rooms,
    tick,
    view(user, code) {
      operationLimit(user, "view", 60);
      const { room, index } = seated(user, code);
      return lobbyView(room, index);
    },
    create(user, body = {}) {
      recordBody(body);
      operationLimit(user, "create", 8);
      const existing = existingRoom(user);
      if (existing) return lobbyView(existing, seatOf(existing, user.id));
      if (rooms.size >= maxRooms) throw new FootballError("Các phòng đang đông. Hãy thử lại sau.", 503, "FOOTBALL_BUSY");
      const code = newCode();
      const halfMinutes = pickSetting(Number(body.halfMinutes), HALVES, 4);
      const room = {
        code, public: body.public === true, createdAt: now(), lastActive: now(), lastHeartbeat: now(),
        settings: { halfMinutes }, seats: [newSeat(user), null], match: null, config: null, status: "lobby", rematch: new Set(),
      };
      rooms.set(code, room);
      memberships.set(user.id, code);
      ensureTimer();
      return lobbyView(room, 0);
    },
    /** Tìm trận nhanh: vào phòng công khai đang chờ người, không có thì mở phòng mới. */
    quick(user) {
      operationLimit(user, "quick");
      const existing = existingRoom(user);
      if (existing) return lobbyView(existing, seatOf(existing, user.id));
      for (const room of rooms.values()) {
        if (room.public && room.status === "lobby" && !room.seats[1] && room.seats[0]?.userId !== user.id && room.seats[0]?.streams.size) {
          room.seats[1] = newSeat(user);
          memberships.set(user.id, room.code);
          broadcastLobby(room);
          return lobbyView(room, 1);
        }
        const mine = seatOf(room, user.id);
        if (mine >= 0 && room.status === "lobby") return lobbyView(room, mine);
      }
      return this.create(user, { public: true });
    },
    join(user, code) {
      operationLimit(user, "join");
      const room = roomOf(code);
      const index = seatOf(room, user.id);
      if (index >= 0) { room.seats[index].name = user.name; return lobbyView(room, index); }
      if (existingRoom(user)) throw new FootballError("Rời phòng hiện tại trước khi vào phòng khác.", 409, "FOOTBALL_ALREADY_SEATED");
      if (room.status === "playing") throw new FootballError("Trận đang diễn ra.", 409, "FOOTBALL_PLAYING");
      if (room.seats[1]) throw new FootballError("Phòng đã đủ hai người.", 409, "FOOTBALL_ROOM_FULL");
      room.seats[1] = newSeat(user);
      memberships.set(user.id, room.code);
      room.lastActive = now();
      broadcastLobby(room);
      return lobbyView(room, 1);
    },
    connect(user, code, stream, expiresAt = now() + 7 * 24 * 60 * 60 * 1000) {
      operationLimit(user, "connect");
      if (!Number.isFinite(expiresAt) || expiresAt <= now()) throw new FootballError("Phiên đăng nhập đã hết hạn.", 401, "FOOTBALL_AUTH_REQUIRED");
      const { room, index, seat } = seated(user, code);
      if (seat.streams.size >= 3) throw new FootballError("Bạn đang mở quá nhiều cửa sổ cho phòng này.", 429, "FOOTBALL_TOO_MANY_TABS");
      seat.streams.add(stream);
      streamDeadlines.set(stream, expiresAt);
      seat.lastSeen = now();
      room.lastActive = now();
      stream.on?.("close", () => {
        seat.streams.delete(stream);
        seat.lastSeen = now();
        if (rooms.get(room.code) === room && room.seats.includes(seat)) broadcastLobby(room);
      });
      send(stream, "lobby", lobbyView(room, index));
      if (room.match && room.config) {
        send(stream, "start", { config: room.config });
        send(stream, "state", packMatch(room.match, [], { stats: true }));
      }
      broadcastLobby(room);
      return lobbyView(room, index);
    },
    ready(user, code, body = {}) {
      recordBody(body);
      const { room, index, seat } = seated(user, code);
      limit(seat, "ready", 8);
      if (room.status === "playing") throw new FootballError("Trận đang diễn ra.", 409, "FOOTBALL_PLAYING");
      if (typeof body.formation === "string" && Object.hasOwn(FORMATIONS, body.formation)) seat.formation = body.formation;
      if (typeof body.kit === "string" && Object.hasOwn(KITS, body.kit)) seat.kit = body.kit;
      if (ASSISTS.has(body.assist)) seat.assist = body.assist;
      if (index === 0 && body.halfMinutes !== undefined) room.settings.halfMinutes = pickSetting(Number(body.halfMinutes), HALVES, room.settings.halfMinutes);
      if (typeof body.ready === "boolean") seat.ready = body.ready;
      if (room.status === "ended" || room.status === "finished") { room.status = "lobby"; room.match = null; }
      broadcastLobby(room);
      if (room.seats.every((s) => s?.ready)) startMatch(room);
      return lobbyView(room, index);
    },
    input(user, code, body) {
      recordBody(body);
      const { room, seat } = seated(user, code);
      limit(seat, "input", 70);
      if (room.status !== "playing" || !seat.human) return { ok: true };
      seat.lastCommand = now();
      seat.lastInput = now();
      // Người chơi vừa bấm phím: lấy lại quyền điều khiển nếu máy đang đá thay.
      if (!room.match.humans[seat.human.team]) room.match.humans[seat.human.team] = seat.human;
      const input = cleanInput(body);
      const size = Math.hypot(input.mx, input.mz);
      if (size > 1) { input.mx /= size; input.mz /= size; }
      Object.assign(seat.human.input, input);
      return { ok: true };
    },
    action(user, code, body) {
      recordBody(body);
      const { room, index, seat } = seated(user, code);
      limit(seat, "action", 30);
      const clean = cleanAction(body);
      if (!clean) throw new FootballError("Thao tác không hợp lệ.", 400, "FOOTBALL_BAD_ACTION");
      if (room.status !== "playing" || !room.match || !seat.human) return { ok: false };
      seat.lastCommand = now();
      if (!room.match.humans[index]) room.match.humans[index] = seat.human;
      return { ok: act(room.match, clean.action, clean.opts, index) };
    },
    /** “Đá tiếp” giữa hiệp (một người bấm là đủ khi cả hai đã bấm, hoặc tự sang sau 12 giây); “Đá lại” khi hết trận. */
    next(user, code) {
      const { room, seat } = seated(user, code);
      limit(seat, "next", 8);
      room.rematch.add(seat.userId);
      const both = room.seats.every((s) => s && room.rematch.has(s.userId));
      if (room.match?.phase === "halftime" && both) { startSecondHalf(room.match); room.halftimeAt = null; room.rematch.clear(); }
      else if ((room.status === "finished" || room.status === "ended") && both && room.seats.every(Boolean)) startMatch(room);
      broadcastLobby(room);
      return lobbyView(room, seatOf(room, user.id));
    },
    leave(user, code) {
      operationLimit(user, "leave");
      const room = roomOf(code);
      const index = seatOf(room, user.id);
      if (index < 0) return { ok: true };
      const seat = room.seats[index];
      // Báo kết thúc cho cả hai trước, rồi mới đóng luồng của người rời đi.
      if (room.status === "playing") endRoom(room, `${seat.name} đã rời trận.`, index);
      removeSeat(room, index);
      if (!room.seats.some(Boolean)) deleteRoom(room);
      else broadcastLobby(room);
      return { ok: true };
    },
    close() {
      if (timer) clearInterval(timer);
      timer = null;
      for (const room of [...rooms.values()]) deleteRoom(room);
      memberships.clear();
      operationRates.clear();
    },
  };
};
