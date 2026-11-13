import { createRoomClient } from "../games/roomClient.js";

/** Phòng đấu bóng đá online: dùng chung phần kết nối với các môn khác. */
const client = createRoomClient({
  base: "football",
  code: "FOOTBALL",
  unreachable: "Chưa kết nối được máy chủ bóng đá. Hãy thử lại.",
  guestHint: "Máy chủ chưa bật đăng nhập khách. Hãy đăng nhập Google để đá online.",
});
export const footballRequest = client.request;
export const footballCall = client.call;
export const openRoom = client.openRoom;

export const inputState = (input) => ({
  mx: Math.round(input.mx * 100) / 100,
  mz: Math.round(input.mz * 100) / 100,
  sprint: input.sprint, shield: input.shield, contain: input.contain, press: input.press,
  barge: input.barge, holdBall: input.holdBall, callPress: input.callPress, pushUp: input.pushUp,
});
