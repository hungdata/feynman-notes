import { parseCookies, readSessionToken } from "./session.js";
import { localUserFor } from "./localMode.js";

export const SESSION_COOKIE = "feynman_session";

/** Returns the signed-in user, the local-mode owner, or null. */
export const resolveUser = (req) => {
  const secret = process.env.AUTH_SESSION_SECRET;
  const sessionUser = secret ? readSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE], secret) : null;
  if (sessionUser?.id) return sessionUser;
  return localUserFor(req);
};

export const requireAuth = (req, res, next) => {
  const user = resolveUser(req);
  if (!user?.id) {
    return res.status(401).json({ message: "Đăng nhập để truy cập dữ liệu cá nhân.", code: "AUTH_REQUIRED" });
  }
  req.user = user;
  next();
};
