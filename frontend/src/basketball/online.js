import { createRoomClient } from "../games/roomClient.js";

/** Phòng bóng rổ online: dùng chung phần kết nối với bóng đá. */
const client = createRoomClient({
  base: "basketball",
  code: "BASKETBALL",
  unreachable: "Chưa kết nối được máy chủ bóng rổ. Hãy thử lại.",
  guestHint: "Máy chủ chưa bật đăng nhập khách. Hãy đăng nhập Google để chơi online.",
});
export const basketballCall = client.call;
export const openRoom = client.openRoom;
