import { ArrowLeft, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { useAuth } from "@/auth/useAuth";
import "@/styles/auth.css";

const GoogleButton = ({ enabled, onClick }) => (
  <button className="oauth-button google" disabled={!enabled} onClick={onClick}>
    <span aria-hidden="true">G</span>
    <strong>Tiếp tục với Google</strong>
    {!enabled && <small>Chưa cấu hình</small>}
  </button>
);

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, providers, loading, login, continueAsGuest, logout } = useAuth();

  const startGuestTrial = async () => {
    try {
      await continueAsGuest();
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(error.message || "Không thể bắt đầu chế độ dùng thử.");
    }
  };

  return (
    <main className="login-page">
      <div className="login-glow one" /><div className="login-glow two" />
      <section className="login-card">
        <Link className="login-back" to="/"><ArrowLeft /> Quay lại mind map</Link>
        <div className="login-logo">F</div>
        <h1>Đăng nhập Feynman Notes</h1>
        <p>Đăng nhập bằng Google để lưu lâu dài, hoặc dùng thử ngay không cần tài khoản.</p>
        {user ? (
          <div className="signed-account">
            {user.picture ? <img src={user.picture} alt="Ảnh đại diện" referrerPolicy="no-referrer" /> : <span>{user.name?.slice(0, 1) || "U"}</span>}
            <div><strong>{user.name}</strong><small>{user.email || (user.isGuest ? "Chế độ dùng thử" : `Đăng nhập bằng ${user.provider}`)}</small></div>
            <button onClick={logout}>Đăng xuất</button>
          </div>
        ) : (
          <div className="oauth-stack">
            <GoogleButton enabled={!loading && providers.google} onClick={() => login("google")} />
            <div className="login-divider"><span>hoặc</span></div>
            <button className="trial-button" disabled={loading || !providers.guest} onClick={startGuestTrial}>
              <UserRound />
              <span><strong>Dùng thử không cần đăng nhập</strong><small>Dữ liệu được tách riêng trên trình duyệt này trong 7 ngày.</small></span>
            </button>
          </div>
        )}
        <div className="login-security"><ShieldCheck /><span><strong>Đăng nhập bảo mật</strong><small>Mật khẩu không đi qua hoặc được lưu bởi Feynman Notes.</small></span></div>
        <div className="login-session"><LockKeyhole /> Phiên đăng nhập dùng cookie HttpOnly, SameSite và chữ ký HMAC.</div>
        {!user && <p className="trial-notice">Dùng thử sẽ mất quyền truy cập dữ liệu nếu bạn xóa cookie hoặc chuyển sang trình duyệt khác.</p>}
      </section>
    </main>
  );
};

export default LoginPage;
