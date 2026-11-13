import { FootballError } from "../football/rooms.js";
import { createGameRouter } from "./gameRouter.js";

/** Trận bóng đá online 1–1: cần đăng nhập Google hoặc khách (giống sân trường online). */
export const createFootballRouter = (rooms) => createGameRouter(rooms, {
  ErrorClass: FootballError,
  code: "FOOTBALL",
  authMessage: "Đăng nhập Google hoặc vào bằng tài khoản khách để đá online.",
});
