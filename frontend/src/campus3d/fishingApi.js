import { campusRequest } from "./online";

export const getWallet = () => campusRequest("wallet");
export const castLine = () => campusRequest("fishing/cast", { method: "POST" });
export const landFish = (castId) => campusRequest("fishing/catch", { method: "POST", body: JSON.stringify({ castId }) });
export const releaseLine = (castId) => campusRequest("fishing/release", { method: "POST", body: JSON.stringify({ castId }) }).catch(() => {});
export const buyRod = (rod) => campusRequest("shop/rod", { method: "POST", body: JSON.stringify({ rod }) });
