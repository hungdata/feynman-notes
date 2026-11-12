import { FOOT, HEAD_X, TABLE, freeSpotNear } from "./physics.js";

/** Eight-ball rules (casual): groups, fouls with ball in hand, win/lose on the 8. */

export const groupOf = (id) => (id === 8 ? "eight" : id < 8 ? "solid" : "stripe");
export const GROUP_LABELS = { solid: "Bi màu (1–7)", stripe: "Bi sọc (9–15)" };
export const remaining = (balls, group) => balls.filter((ball) => !ball.potted && groupOf(ball.id) === group).length;

export const playerName = (game, index) => (game.mode === "ai" ? (index === 0 ? "Bạn" : "Máy") : `Người chơi ${index + 1}`);

export const newGame = (mode = "two") => {
  const game = { mode, turn: 0, groups: [null, null], breakShot: true, ballInHand: true, winner: null, foul: "", message: "" };
  game.message = `${playerName(game, 0)} khai cuộc. Kéo bi cái để đặt sau vạch, rồi ngắm và đánh.`;
  return game;
};

/** True when the player at `index` has cleared their group and shoots at the 8. */
export const isOnEight = (game, balls, index = game.turn) => Boolean(game.groups[index]) && remaining(balls, game.groups[index]) === 0;

/**
 * Applies the result of one shot. `shot` = { firstHit: ball id | null, potted: [ids in order] }.
 * `balls` is the table after the shot; the cue ball and (on the break) the 8 are re-spotted in place.
 * Returns the next game state.
 */
export const resolveShot = (game, balls, shot) => {
  const shooter = game.turn;
  const other = 1 - shooter;
  const myGroup = game.groups[shooter];
  const pottedCue = shot.potted.includes(0);
  const pottedEight = shot.potted.includes(8);
  const others = shot.potted.filter((id) => id !== 0 && id !== 8);
  const mine = myGroup ? others.filter((id) => groupOf(id) === myGroup).length : 0;
  const wasOnEight = Boolean(myGroup) && remaining(balls, myGroup) + mine === 0;

  let foul = "";
  if (pottedCue) foul = "bi cái rơi lỗ";
  else if (shot.firstHit == null) foul = "không chạm bi nào";
  else {
    const first = groupOf(shot.firstHit);
    if (first === "eight" && !wasOnEight) foul = "chạm bi 8 trước";
    else if (myGroup && first !== "eight" && first !== myGroup) foul = "chạm bi của đối thủ trước";
  }

  const next = { ...game, groups: [...game.groups], breakShot: false, foul };
  const me = playerName(game, shooter);
  const them = playerName(game, other);

  if (pottedCue) {
    const spot = freeSpotNear(balls, HEAD_X, TABLE.h / 2, 0);
    Object.assign(balls[0], { potted: false, x: spot.x, y: spot.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 });
  }

  if (pottedEight) {
    if (game.breakShot) {
      const eight = balls.find((ball) => ball.id === 8);
      const spot = freeSpotNear(balls, FOOT.x, FOOT.y, 8);
      Object.assign(eight, { potted: false, x: spot.x, y: spot.y, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0 });
    } else {
      const won = wasOnEight && !foul;
      next.winner = won ? shooter : other;
      next.ballInHand = false;
      next.message = won ? `${me} đưa bi 8 vào lỗ và thắng ván này!` : `${me} làm rơi bi 8 ${foul ? `và phạm lỗi (${foul})` : "quá sớm"}. ${them} thắng!`;
      return next;
    }
  }

  let keepTurn = false;
  let note = "";
  if (!foul) {
    if (game.breakShot) keepTurn = others.length > 0;
    else if (!myGroup) {
      if (others.length) {
        next.groups[shooter] = groupOf(others[0]);
        next.groups[other] = next.groups[shooter] === "solid" ? "stripe" : "solid";
        keepTurn = true;
        note = `${me} nhận ${GROUP_LABELS[next.groups[shooter]].toLowerCase()}.`;
      }
    } else keepTurn = mine > 0;
  }

  next.turn = keepTurn ? shooter : other;
  next.ballInHand = Boolean(foul);
  const nextName = playerName(game, next.turn);
  if (foul) next.message = `Lỗi: ${foul}. ${them} được đặt bi cái ở bất kỳ đâu.`;
  else if (keepTurn) next.message = `${note || "Bi vào lỗ!"} ${me} đánh tiếp.${isOnEight(next, balls) ? " Giờ đánh bi 8." : ""}`.trim();
  else next.message = `Đến lượt ${nextName}.${isOnEight(next, balls) ? " Đánh bi 8 để thắng." : ""}`;
  return next;
};
