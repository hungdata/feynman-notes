import { useState } from "react";
import { BriefcaseBusiness, CheckSquare2, Coffee, FilePlus2, GitBranch, LogIn, LogOut, Mail, Map, MoreHorizontal, Phone, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import CoffeeSupportModal from "./CoffeeSupportModal";

const MapSidebar = ({ documents, activeId, onOpen, onCreate, onDelete, query, onQueryChange, collapsed }) => {
  const { user, loading, logout } = useAuth();
  const [coffeeOpen, setCoffeeOpen] = useState(false);
  return <aside className={`map-sidebar ${collapsed ? "map-sidebar--collapsed" : ""}`}>
    <div className="brand-mark"><span>F</span><strong>Feynman Notes</strong></div>
    {user ? (
      <div className="sidebar-account">
        {user.picture ? <img src={user.picture} alt="Ảnh đại diện" referrerPolicy="no-referrer" /> : <span>{user.name?.slice(0, 1) || "U"}</span>}
        <div><strong>{user.name}</strong><small>{user.email || (user.isGuest ? "Chế độ dùng thử" : user.provider)}</small></div>
        <button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut /></button>
      </div>
    ) : (
      <Link className={`sidebar-login ${loading ? "loading" : ""}`} to="/login"><LogIn /> Đăng nhập hoặc dùng thử</Link>
    )}
    {user && <button className="coffee-support-button" type="button" onClick={() => setCoffeeOpen(true)}><Coffee /> Mời admin ly cà phê</button>}
    <button className="primary-action" onClick={() => onCreate("blank")}><FilePlus2 /> Mind map mới</button>
    <label className="sidebar-search"><Search /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm node..." /></label>
    <div className="sidebar-section-label">Mind maps</div>
    <div className="document-list">
      {documents.map((document) => (
        <button key={document.id} className={`document-row ${activeId === document.id ? "active" : ""}`} onClick={() => onOpen(document.id)}>
          <Map /><span><strong>{document.title}</strong><small>{document.nodes.length} topics</small></span>
          {documents.length > 1 && <Trash2 className="row-delete" onClick={(event) => { event.stopPropagation(); onDelete(document.id); }} />}
        </button>
      ))}
    </div>
    <Link className="todo-link" to="/tasks"><CheckSquare2 /> Danh sách công việc</Link>
    <section className="contact-card" aria-label="Thông tin liên hệ">
      <div className="contact-profile">
        <span>DH</span>
        <div><strong>Dương Tấn Hưng</strong><small>AI Engineer</small></div>
      </div>
      <a href="mailto:duongtanhung24@gmail.com" title="Gửi email cho Dương Tấn Hưng"><Mail /><span>duongtanhung24@gmail.com</span></a>
      <a href="tel:+84905559946" title="Gọi 0905 559 946"><Phone /><span>0905 559 946</span></a>
      <a href="https://github.com/hungdata" target="_blank" rel="noreferrer" title="GitHub hungdata"><GitBranch /><span>github.com/hungdata</span></a>
      <a className="work-contact" href="mailto:duongtanhung24@gmail.com?subject=Li%C3%AAn%20h%E1%BB%87%20c%C3%B4ng%20vi%E1%BB%87c%20AI%20Engineer"><BriefcaseBusiness /> Liên hệ công việc</a>
    </section>
    <button className="sidebar-more"><MoreHorizontal /> Trợ giúp & phím tắt</button>
    {coffeeOpen && <CoffeeSupportModal onClose={() => setCoffeeOpen(false)} />}
  </aside>;
};

export default MapSidebar;
