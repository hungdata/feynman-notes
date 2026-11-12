import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Users, UserRound } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { campusRequest } from "./online";

const Avatar = ({ gender }) => (
  <svg viewBox="0 0 160 166" className="c3-avatar-art" aria-hidden="true">
    <ellipse cx="80" cy="153" rx="44" ry="8" fill="#152448" opacity=".12" />
    {gender === "female" && <path d="M47 65Q37 21 80 18Q123 21 113 76L105 90H53Z" fill="#302b40" />}
    <path d="M61 113L57 146Q64 152 70 146L78 116M82 116L90 146Q96 152 103 146L99 113" fill="#f4c7a2" />
    <path d="M55 145L71 145V152H51Q47 149 55 145M90 145H105L112 151Q109 155 90 152Z" fill="#2c3554" />
    <path d={gender === "female" ? "M59 76L101 76L111 125Q80 134 49 125Z" : "M58 77L102 77L103 117H57Z"} fill={gender === "female" ? "#7972ed" : "#3a8cdd"} />
    {gender === "male" && <path d="M57 111H103L101 128H83L80 117L77 128H59Z" fill="#2d3758" />}
    <path d="M60 80Q45 80 41 106Q42 114 48 110L62 89M100 80Q115 80 119 106Q118 114 112 110L98 89" fill="#f4c7a2" />
    <path d="M71 69H89V82Q80 91 71 82Z" fill="#e7b18d" />
    <ellipse cx="80" cy="51" rx="27" ry="30" fill="#f4c7a2" />
    <path d={gender === "female" ? "M52 48Q48 17 80 17Q113 17 108 51Q93 47 80 31Q69 45 52 48Z" : "M51 47Q46 15 80 18Q114 13 109 48L102 39L92 34L64 39Z"} fill="#302b40" />
    {gender === "female" && <path d="M105 29L119 22L119 41L106 35Z" fill="#ffb14e" />}
    <ellipse cx="70" cy="53" rx="2.6" ry="3.1" fill="#27304b" /><ellipse cx="90" cy="53" rx="2.6" ry="3.1" fill="#27304b" />
    <path d="M74 65Q80 70 86 65" fill="none" stroke="#a95f51" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M73 82L80 98L87 82" fill="#fff" /><path d="M80 87L76 103L80 108L84 103Z" fill="#ffd23f" />
  </svg>
);

const CharacterLobby = ({ onReady, initialProfile = null, editing = false, onCancel }) => {
  const { user, providers, loading, continueAsGuest, login } = useAuth();
  const [name, setName] = useState(initialProfile?.name || "");
  const [gender, setGender] = useState(initialProfile?.gender || "male");
  const [checking, setChecking] = useState(Boolean(user && !user.isLocal && !editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("login") === "error" ? params.get("message") || "Đăng nhập Google chưa thành công. Bạn có thể thử lại hoặc chơi với tài khoản khách." : "";
  });
  const savingRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (loading || !user || user.isLocal || editing) { setChecking(false); return undefined; }
    const controller = new AbortController();
    let active = true;
    setChecking(true);
    campusRequest("profile", { signal: controller.signal }).then((result) => {
      if (!active || savingRef.current) return;
      if (result.profile) onReadyRef.current(result.profile);
    }).catch((cause) => { if (active && cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; controller.abort(); };
  }, [user, loading, editing]);

  const submit = async (event) => {
    event.preventDefault();
    const displayName = name.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N} _-]{2,20}$/u.test(displayName)) {
      setError("Tên cần 2–20 chữ cái hoặc số; có thể dùng dấu cách, _ và -. Tên được kiểm tra với toàn bộ sân trường.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (!user || user.isLocal) await continueAsGuest();
      const result = await campusRequest("profile", { method: "PUT", body: JSON.stringify({ name: displayName, gender }) });
      onReadyRef.current(result.profile);
    } catch (cause) {
      setError(cause.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const google = () => {
    try { sessionStorage.setItem("feynman.campus3d.return", `${window.location.pathname}${window.location.search}`); } catch { /* Cookies still allow login. */ }
    login("google");
  };

  return (
    <div className="c3-lobby-wrap">
      <div className="c3-lobby-orb is-one" aria-hidden="true" /><div className="c3-lobby-orb is-two" aria-hidden="true" />
      <div className="c3-lobby">
        <div className="c3-lobby-top"><Link to="/"><ArrowLeft size={17} />Sân trường</Link><span><Users size={15} />Chơi cùng bạn thật</span></div>
        <div className="c3-lobby-heading"><span className="c3-eyebrow">SÂN TRƯỜNG ONLINE</span><h1>{editing ? "Nhân vật của bạn" : "Hẹn nhau ở sân trường."}</h1><p>Chọn nhân vật, đặt một cái tên riêng, rồi cùng đi dạo, đá bóng và chơi bóng rổ.</p></div>
        {(loading || checking) ? <div className="c3-lobby-wait" role="status">Đang tìm nhân vật của bạn…</div> : (
          <form onSubmit={submit} className="c3-character-form">
            <fieldset disabled={saving}><legend>Chọn nhân vật</legend><div className="c3-avatar-options">
              {[{ value: "male", label: "Nam" }, { value: "female", label: "Nữ" }].map((option) => (
                <button key={option.value} type="button" className={`c3-avatar-option ${gender === option.value ? "is-selected" : ""}`} aria-pressed={gender === option.value} onClick={() => setGender(option.value)}>
                  <Avatar gender={option.value} /><span>{option.label}{gender === option.value && <Check size={16} />}</span>
                </button>
              ))}
            </div></fieldset>
            <label className="c3-name-label" htmlFor="c3-character-name">Tên nhân vật<span>Không trùng với người chơi khác</span></label>
            <input id="c3-character-name" value={name} onChange={(event) => { setName(event.target.value); setError(""); }} maxLength={20} minLength={2} autoComplete="nickname" placeholder="Ví dụ: Mèo Đi Học" required disabled={saving} aria-describedby="c3-name-help c3-profile-error" autoFocus />
            <p id="c3-name-help" className="c3-name-help">2–20 ký tự · Không phân biệt chữ hoa, chữ thường.</p>
            {error && <p id="c3-profile-error" className="c3-form-error" role="alert">{error}</p>}
            <button className="c3-start" type="submit" disabled={saving || loading || ((!user || user.isLocal) && !providers.guest)}><UserRound size={19} />{saving ? "Đang giữ tên và vào sân…" : editing ? "Lưu nhân vật" : user?.provider === "google" ? "Vào sân cùng mọi người" : "Chơi với tài khoản khách"}</button>
            {!editing && user?.provider !== "google" && <><div className="c3-or"><span>hoặc lưu nhân vật bằng</span></div><button type="button" className="c3-google" onClick={google} disabled={!providers.google || saving}><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.2h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c2-1.9 2.9-4.5 2.9-7.5Z" /><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.5a6 6 0 0 1-8.9-3.1H3.1v2.6A10 10 0 0 0 12 22Z" /><path fill="#fbbc05" d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.1a10 10 0 0 0 0 9.4Z" /><path fill="#ea4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.9 5.3l3.4 2.6A6 6 0 0 1 12 6Z" /></svg>Tiếp tục với Google</button>{!providers.google && <p className="c3-google-note">Google chưa được bật trên máy chủ này. Bạn vẫn có thể chọn tên và vào bằng tài khoản khách.</p>}</>}
            {user?.provider === "google" && <p className="c3-account-note">Đã đăng nhập Google. Nhân vật được lưu theo tài khoản của bạn.</p>}
            {user?.provider !== "google" && <p className="c3-account-note">Khách được nhớ trên trình duyệt này. Giữ cookie để trở lại đúng nhân vật.</p>}
            {editing && <button type="button" className="c3-lobby-cancel" onClick={onCancel} disabled={saving}>Quay lại sân</button>}
          </form>
        )}
      </div>
    </div>
  );
};

export default CharacterLobby;
