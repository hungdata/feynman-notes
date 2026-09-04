import { ArrowLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import "@/styles/auth.css";

const ProviderButton = ({ provider, enabled, onClick }) => (
  <button className={`oauth-button ${provider}`} disabled={!enabled} onClick={onClick}>
    <span aria-hidden="true">{provider === "google" ? "G" : "f"}</span>
    <strong>Tiếp tục với {provider === "google" ? "Google" : "Facebook"}</strong>
    {!enabled && <small>Chưa cấu hình</small>}
  </button>
);

const LoginPage = () => {
  const { user, providers, loading, login, logout } = useAuth();
  return (
    <main className="login-page">
      <div className="login-glow one" /><div className="login-glow two" />
      <section className="login-card">
        <Link className="login-back" to="/"><ArrowLeft /> Quay lại mind map</Link>
        <div className="login-logo">F</div>
        <h1>Đăng nhập Feynman Notes</h1>
        <p>Lưu phiên đăng nhập an toàn và sử dụng hồ sơ Google hoặc Facebook của bạn.</p>
        {user ? (
          <div className="signed-account">
            {user.picture ? <img src={user.picture} alt="Ảnh đại diện" referrerPolicy="no-referrer" /> : <span>{user.name?.slice(0, 1) || "U"}</span>}
            <div><strong>{user.name}</strong><small>{user.email || `Đăng nhập bằng ${user.provider}`}</small></div>
            <button onClick={logout}>Đăng xuất</button>
          </div>
        ) : (
          <div className="oauth-stack">
            <ProviderButton provider="google" enabled={!loading && providers.google} onClick={() => login("google")} />
            <ProviderButton provider="facebook" enabled={!loading && providers.facebook} onClick={() => login("facebook")} />
          </div>
        )}
        <div className="login-security"><ShieldCheck /><span><strong>Đăng nhập bảo mật</strong><small>Mật khẩu không đi qua hoặc được lưu bởi Feynman Notes.</small></span></div>
        <div className="login-session"><LockKeyhole /> Phiên đăng nhập dùng cookie HttpOnly, SameSite và chữ ký HMAC.</div>
      </section>
    </main>
  );
};

export default LoginPage;
