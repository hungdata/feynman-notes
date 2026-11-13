/**
 * Phòng bóng rổ online 1 chọi 1 (mỗi người cầm một đội 5 người).
 * Phần phòng/kết nối dùng chung nằm ở games/matchRooms.js; ở đây là luật riêng của bóng rổ.
 */
import { act, createMatch, drainEvents, startNextPeriod, stepMatch } from "../../../frontend/src/basketball/sim.js";
import { KITS, QUARTER_OPTIONS } from "../../../frontend/src/basketball/constants.js";
import { cleanAction, cleanInput, packMatch } from "../../../frontend/src/basketball/net.js";
import { createMatchRooms } from "../games/matchRooms.js";

export class BasketballError extends Error {
  constructor(message, status = 400, code = "BASKETBALL_BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const ASSISTS = new Set(["assisted", "semi", "manual"]);
const pickQuarter = (value, fallback) => (QUARTER_OPTIONS.includes(value) ? value : fallback);

export const basketballEngine = {
  Error: BasketballError,
  code: "BASKETBALL",
  // Mô phỏng tự sang hiệp sau vài giây; máy chủ chỉ cần chờ phòng hờ.
  breakMs: 12_000,
  seatDefaults: () => ({ kit: "orange", assist: "assisted" }),
  seatView: (seat) => ({ kit: seat.kit, assist: seat.assist }),
  roomSettings: (body) => ({ quarterMinutes: pickQuarter(Number(body.quarterMinutes), 3) }),
  applySeat(seat, body) {
    if (typeof body.kit === "string" && Object.hasOwn(KITS, body.kit)) seat.kit = body.kit;
    if (ASSISTS.has(body.assist)) seat.assist = body.assist;
  },
  applySettings(settings, body) {
    if (body.quarterMinutes !== undefined) settings.quarterMinutes = pickQuarter(Number(body.quarterMinutes), settings.quarterMinutes);
  },
  start(room, seed) {
    const [home, away] = room.seats;
    let awayKit = away.kit;
    if (awayKit === home.kit) awayKit = home.kit === "white" ? "black" : "white";
    // Hai đội cân sức: cùng chỉ số tổng như nhau.
    const config = { seed, quarterMinutes: room.settings.quarterMinutes, homeKit: home.kit, awayKit, names: [home.name, away.name], homeOvr: 78, awayOvr: 78, homeAssist: home.assist, awayAssist: away.assist };
    const match = createMatch({ ...config, humans: [0, 1] });
    match.humans[0].assist = home.assist;
    match.humans[1].assist = away.assist;
    return { config, match };
  },
  forfeit(match, team) {
    const winner = match.teams[1 - team];
    winner.score = Math.max(winner.score, match.teams[team].score + 1);
    match.phase = "fulltime";
    match.phaseT = 0;
  },
  step: stepMatch,
  drain: drainEvents,
  isBreak: (match) => match.phase === "break",
  resume: startNextPeriod,
  isOver: (match) => match.phase === "fulltime",
  pack: packMatch,
  cleanInput,
  cleanAction,
  act,
};

export const createBasketballRooms = (options = {}) => createMatchRooms(basketballEngine, options);
