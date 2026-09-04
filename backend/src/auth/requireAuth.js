import { parseCookies, readSessionToken } from "./session.js";

export const requireAuth = (req, res, next) => {
  const secret = process.env.AUTH_SESSION_SECRET;
  const user = secret && readSessionToken(parseCookies(req.headers.cookie).feynman_session, secret);
  if (!user?.id) return res.status(401).json({ message: "Đăng nhập để truy cập dữ liệu cá nhân." });
  req.user = user;
  next();
};
