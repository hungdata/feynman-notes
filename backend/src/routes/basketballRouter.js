import { BasketballError } from "../basketball/rooms.js";
import { createGameRouter } from "./gameRouter.js";

/** Trận bóng rổ online 1–1: cần đăng nhập Google hoặc khách (giống sân trường online). */
export const createBasketballRouter = (rooms) => createGameRouter(rooms, {
  ErrorClass: BasketballError,
  code: "BASKETBALL",
  authMessage: "Đăng nhập Google hoặc vào bằng tài khoản khách để chơi bóng rổ online.",
});
