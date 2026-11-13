/**
 * Phòng đấu bóng đá online 1 chọi 1 (mỗi người cầm một đội 11 người).
 * Phần phòng/kết nối dùng chung nằm ở games/matchRooms.js; ở đây là luật riêng của bóng đá.
 */
import { createMatch, stepMatch, drainEvents, act, startSecondHalf } from "../../../frontend/src/football/sim.js";
import { FORMATIONS, KITS } from "../../../frontend/src/football/constants.js";
import { packMatch, cleanAction, cleanInput } from "../../../frontend/src/football/net.js";
import { createMatchRooms } from "../games/matchRooms.js";

export class FootballError extends Error {
  constructor(message, status = 400, code = "FOOTBALL_BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const HALVES = [3, 4, 6, 8];
const ASSISTS = new Set(["assisted", "semi", "manual"]);
const pickSetting = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

export const footballEngine = {
  Error: FootballError,
  code: "FOOTBALL",
  breakMs: 12_000,
  seatDefaults: () => ({ formation: "4-3-3", kit: "red", assist: "assisted" }),
  seatView: (seat) => ({ formation: seat.formation, kit: seat.kit, assist: seat.assist }),
  roomSettings: (body) => ({ halfMinutes: pickSetting(Number(body.halfMinutes), HALVES, 4) }),
  applySeat(seat, body) {
    if (typeof body.formation === "string" && Object.hasOwn(FORMATIONS, body.formation)) seat.formation = body.formation;
    if (typeof body.kit === "string" && Object.hasOwn(KITS, body.kit)) seat.kit = body.kit;
    if (ASSISTS.has(body.assist)) seat.assist = body.assist;
  },
  applySettings(settings, body) {
    if (body.halfMinutes !== undefined) settings.halfMinutes = pickSetting(Number(body.halfMinutes), HALVES, settings.halfMinutes);
  },
  start(room, seed) {
    const [home, away] = room.seats;
    let awayKit = away.kit;
    if (awayKit === home.kit) awayKit = home.kit === "white" ? "black" : "white";
    const config = {
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
    const match = createMatch({ ...config, humans: [0, 1] });
    match.humans[0].assist = home.assist;
    match.humans[1].assist = away.assist;
    match.teams[0].name = home.name;
    match.teams[1].name = away.name;
    return { config, match };
  },
  forfeit(match, team) {
    const winner = match.teams[1 - team];
    winner.score = Math.max(winner.score, 3, match.teams[team].score + 1);
    match.phase = "fulltime";
    match.phaseT = 0;
  },
  step: stepMatch,
  drain: drainEvents,
  isBreak: (match) => match.phase === "halftime",
  resume: startSecondHalf,
  isOver: (match) => match.phase === "fulltime",
  pack: packMatch,
  cleanInput,
  cleanAction,
  act,
};

export const createFootballRooms = (options = {}) => createMatchRooms(footballEngine, options);
