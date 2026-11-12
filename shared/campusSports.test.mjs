import test from "node:test";
import assert from "node:assert/strict";
import { COURT, PITCH, SPORT_CONFIG, actSport, createSports, hoopFor, idealBasketPower, joinSport, leaveSport, stepSports } from "./campusSports.mjs";
import { HOOP_HEIGHT as RENDER_HOOP_HEIGHT } from "../frontend/src/campus3d/npc.js";
import { HOOP_HEIGHT } from "./campusSports.mjs";

const player = (id) => ({ id, x: 0, z: 58, heading: Math.PI, moving: false, sport: null, team: null });
const advance = (sports, players, seconds) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...stepSports(sports, 1 / 60, players));
  return events;
};
const aimAtHoop = (person) => {
  const hoop = hoopFor(person.team);
  person.heading = Math.atan2(hoop.x - person.x, hoop.z - person.z);
};

test("joins balance real players, teleport them, and repeated joins cannot reset possession", () => {
  const sports = createSports();
  const people = Array.from({ length: 7 }, (_, i) => player(`real-${i}`));
  people.forEach((person) => assert.equal(joinSport(sports, person, "football", 0).ok, true));
  assert.deepEqual(people.map((person) => person.team), [0, 1, 0, 1, 0, 1, 0]);
  assert.equal(sports.football.players, undefined, "there are no artificial human players");
  for (const person of people) {
    assert.ok(Math.abs(person.x - PITCH.x) < PITCH.w / 2);
    assert.ok(Math.abs(person.z - PITCH.z) < PITCH.d / 2);
  }
  people[0].x -= 1;
  const before = people[0].x;
  assert.equal(joinSport(sports, people[0], "football").ok, true);
  assert.equal(people[0].x, before);
  assert.equal(joinSport(sports, people[0], "hockey").code, "INVALID_SPORT");
  assert.equal(joinSport(sports, people[0], "basketball", 2).code, "INVALID_TEAM");
  assert.equal(people[0].sport, "football", "invalid request preserves current game");
});

test("football kicks require reach, finite force and a cooldown; ordinary kicking can score east and west", () => {
  const sports = createSports();
  const people = [player("a"), player("b")];
  people.forEach((person) => joinSport(sports, person, "football"));
  assert.equal(actSport(sports, people[0], Infinity).code, "INVALID_POWER");
  assert.equal(actSport(sports, people[0], -1).code, "INVALID_POWER");
  assert.equal(actSport(sports, people[0], 1).event, "kick");
  assert.equal(actSport(sports, people[0], 1).code, "ACTION_COOLDOWN");
  const events = advance(sports, people, 1);
  assert.equal(sports.football.score[0], 1);
  assert.ok(events.some((event) => event.type === "goal" && event.team === 0));
  assert.equal(sports.football.ball.x, PITCH.x);
  assert.equal(actSport(sports, people[1], 1).code, "BALL_RESETTING");
  advance(sports, people, 2);
  assert.equal(actSport(sports, people[1], 1).event, "kick");
  advance(sports, people, 1);
  assert.deepEqual(sports.football.score, [1, 1]);
  advance(sports, people, 2);
  people[0].x = PITCH.x - 10;
  assert.equal(actSport(sports, people[0], 1).code, "BALL_TOO_FAR");
});

test("a full 128-person match has separate, balanced spawn positions inside the court", () => {
  for (const sport of ["football", "basketball"]) {
    const sports = createSports();
    const people = Array.from({ length: 128 }, (_, index) => player(`real-${index}`));
    for (const person of people) assert.equal(joinSport(sports, person, sport).ok, true);
    const field = SPORT_CONFIG[sport];
    assert.equal(new Set(people.map((person) => `${person.x}:${person.z}`)).size, 128);
    assert.equal(people.filter((person) => person.team === 0).length, 64);
    for (const person of people) {
      assert.ok(Math.abs(person.x - field.x) <= field.w / 2 - 0.55);
      assert.ok(Math.abs(person.z - field.z) <= field.d / 2 - 0.55);
    }
  }
});

test("football has bounded rebounds and misses outside the goal mouth", () => {
  const sports = createSports();
  const person = player("a");
  joinSport(sports, person, "football");
  person.z = PITCH.z + 8;
  Object.assign(sports.football.ball, { x: person.x + 1, z: person.z });
  actSport(sports, person, 1);
  advance(sports, [person], 2);
  assert.deepEqual(sports.football.score, [0, 0]);
  assert.ok(Math.abs(sports.football.ball.x - PITCH.x) <= PITCH.w / 2);
  sports.football.ball.vz = 80;
  advance(sports, [person], 8);
  assert.ok(Math.abs(sports.football.ball.z - PITCH.z) <= PITCH.d / 2);
});

test("a human can dribble a loose football and is kept within the playing field", () => {
  const sports = createSports();
  const person = player("dribbler");
  joinSport(sports, person, "football");
  person.x = PITCH.x - 0.8;
  person.moving = true;
  advance(sports, [person], 0.1);
  assert.ok(sports.football.ball.x > PITCH.x);
  person.x = 10000;
  person.z = -10000;
  stepSports(sports, 0.01, [person]);
  assert.ok(person.x < PITCH.x + PITCH.w / 2);
  assert.ok(person.z > PITCH.z - PITCH.d / 2);
});

test("basketball possession follows a real player, proximity picks up, and opponents can steal", () => {
  const sports = createSports();
  const people = [player("a"), player("b")];
  people.forEach((person) => joinSport(sports, person, "basketball"));
  assert.equal(sports.basketball.holder, people[0].id);
  people[0].x += 2;
  advance(sports, people, 0.1);
  assert.ok(Math.abs(sports.basketball.ball.x - people[0].x) < 1);
  people[1].x = people[0].x + 1;
  assert.equal(actSport(sports, people[1]).event, "steal");
  assert.equal(sports.basketball.holder, people[1].id);
  assert.equal(actSport(sports, people[0]).code, "POSSESSION_PROTECTED");
  leaveSport(sports, people[1]);
  assert.equal(sports.basketball.holder, null);
  assert.equal(sports.basketball.phase, "loose");
  advance(sports, people, 0.5);
  assert.equal(sports.basketball.holder, people[0].id);
});

test("basketball rewards accurate aim and force, including close layups, with 2 or 3 points on either side", () => {
  for (const team of [0, 1]) {
    for (const range of [0.3, 1.2, 3, 5.5, 10]) {
      const sports = createSports();
      const person = player(`shoot-${team}-${range}`);
      joinSport(sports, person, "basketball", team);
      person.team = team;
      const hoop = hoopFor(team);
      person.x = hoop.x + (team === 0 ? -1 : 1) * range;
      person.z = COURT.z;
      aimAtHoop(person);
      assert.equal(actSport(sports, person, idealBasketPower(person)).event, "shoot");
      assert.equal(sports.basketball.holder, null);
      const events = advance(sports, [person], 2);
      const points = range < SPORT_CONFIG.basketball.threePointDistance ? 2 : 3;
      assert.equal(sports.basketball.score[team], points, `${team} from range ${range}`);
      assert.ok(events.some((event) => event.type === "score" && event.points === points));
      advance(sports, [person], 3);
      assert.equal(sports.basketball.score[team], points, "score counted exactly once");
      assert.equal(sports.basketball.ball.x, COURT.x, "made shot resets at centre court");
    }
  }
});

test("the online ball passes through the visible 3D hoop at its actual height", () => {
  assert.equal(HOOP_HEIGHT, RENDER_HOOP_HEIGHT);
});

test("basketball misses for wrong aim or force and rebounds for the next possession", () => {
  for (const wrong of ["aim", "force"]) {
    const sports = createSports();
    const person = player(wrong);
    joinSport(sports, person, "basketball");
    const power = idealBasketPower(person);
    person.heading += wrong === "aim" ? 0.4 : 0;
    assert.equal(actSport(sports, person, wrong === "force" ? 0.1 : power).event, "shoot");
    const events = advance(sports, [person], 3);
    assert.deepEqual(sports.basketball.score, [0, 0]);
    assert.ok(events.some((event) => event.type === "rim"));
    assert.ok(Math.abs(sports.basketball.ball.x - COURT.x) <= COURT.w / 2);
    assert.ok(Math.abs(sports.basketball.ball.z - COURT.z) <= COURT.d / 2);
    assert.ok(sports.basketball.ball.y >= 0.32);
  }
});

test("disconnects release held basketballs, remove stale players, and exclude private runtime maps from snapshots", () => {
  const sports = createSports();
  const person = player("gone");
  joinSport(sports, person, "basketball");
  stepSports(sports, 1 / 30, []);
  assert.equal(sports.basketball.holder, null);
  assert.equal(sports.basketball.phase, "loose");
  assert.equal(sports._runtime.roster.size, 0);
  assert.equal(JSON.parse(JSON.stringify(sports))._runtime, undefined);
  assert.equal(actSport(sports, person).code, "NOT_PLAYING");
});

test("invalid simulation inputs cannot create non-finite coordinates", () => {
  const sports = createSports();
  const person = player("a");
  joinSport(sports, person, "football");
  assert.deepEqual(stepSports(sports, NaN, [person]), []);
  assert.deepEqual(stepSports(sports, Infinity, [person]), []);
  assert.deepEqual(stepSports(sports, -1, [person]), []);
  sports.football.ball.x = NaN;
  sports.basketball.ball.y = Infinity;
  advance(sports, [person], 1);
  for (const ball of [sports.football.ball, sports.basketball.ball]) assert.ok(Object.values(ball).every(Number.isFinite));
  assert.equal(joinSport(sports, { ...person, x: Infinity }, "basketball").code, "INVALID_PLAYER");
});
