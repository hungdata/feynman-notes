import { useMemo, useState } from "react";
import {
  ArchiveRestore, BriefcaseBusiness, CheckSquare2, ChevronDown, Clock3, Coffee, Copy, Ellipsis, Folder, FolderInput,
  FolderPlus, GitBranch, GraduationCap, School, Keyboard, Layers, LogIn, LogOut, Mail, Pencil, Phone, Plus, Search, Star, Trash2, UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/useAuth";
import CoffeeSupportModal from "./CoffeeSupportModal";
import { MapThumbnail } from "./previews";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

const FOLDERS_KEY = "feynman.library.folders";
const readFolders = () => {
  try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || "[]").filter((name) => typeof name === "string"); } catch { return []; }
};

const relativeTime = (value) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(time).toLocaleDateString("vi-VN");
};

const AuthorCard = () => (
  <div className="author-card">
    <div className="author-head"><span>DH</span><div><strong>Dương Tấn Hưng</strong><small>AI Engineer · tác giả Feynman Notes</small></div></div>
    <a href="mailto:duongtanhung24@gmail.com"><Mail /> duongtanhung24@gmail.com</a>
    <a href="tel:+84905559946"><Phone /> 0905 559 946</a>
    <a href="https://github.com/hungdata" target="_blank" rel="noreferrer"><GitBranch /> github.com/hungdata</a>
    <a className="author-cta" href="mailto:duongtanhung24@gmail.com?subject=Li%C3%AAn%20h%E1%BB%87%20c%C3%B4ng%20vi%E1%BB%87c%20AI%20Engineer"><BriefcaseBusiness /> Liên hệ công việc</a>
  </div>
);

const MapSidebar = ({ map, open, onNewMap, onShowShortcuts }) => {
  const { user, loading, logout } = useAuth();
  const [section, setSection] = useState("all");
  const [filter, setFilter] = useState("");
  const [folders, setFolders] = useState(readFolders);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [coffeeOpen, setCoffeeOpen] = useState(false);

  const live = map.documents.filter((document) => !document.trashedAt);
  const trashed = map.documents.filter((document) => document.trashedAt);
  const allFolders = useMemo(() => [...new Set([...folders, ...live.map((document) => document.folder).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "vi")), [folders, live]);

  const saveFolders = (next) => {
    setFolders(next);
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const visible = useMemo(() => {
    let list = section === "trash" ? trashed : live;
    if (section === "favorites") list = list.filter((document) => document.favorite);
    if (section === "recent") list = [...list].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 12);
    if (section.startsWith("folder:")) list = list.filter((document) => document.folder === section.slice(7));
    const query = filter.trim().toLocaleLowerCase("vi");
    if (query) list = list.filter((document) => document.title.toLocaleLowerCase("vi").includes(query));
    return list;
  }, [filter, live, section, trashed]);

  const navItem = (id, Icon, label, count = 0) => (
    <button key={id} type="button" className={`library-nav-item ${section === id ? "is-active" : ""}`} onClick={() => setSection(id)}>
      <Icon /> <span>{label}</span>{count > 0 && <em>{count}</em>}
    </button>
  );

  const createFolder = (name) => {
    const value = name.trim().slice(0, 80);
    setCreatingFolder(false);
    if (!value) return;
    if (!allFolders.includes(value)) saveFolders([...folders, value]);
    setSection(`folder:${value}`);
  };

  return (
    <aside className={`library ${open ? "" : "is-collapsed"}`} aria-label="Thư viện mind map">
      <div className="library-brand">
        <span className="brand-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2" /><path d="M14.8 10.6c2.2-1.4 2.6-4.4 5.2-4.6M14.8 13.4c2.2 1.4 2.6 4.4 5.2 4.6M9.2 10.6C7 9.2 6.6 6.2 4 6M9.2 13.4C7 14.8 6.6 17.8 4 18" /></svg></span>
        <strong>Feynman Notes</strong>
      </div>

      <div className="library-new">
        <button type="button" className="btn-primary" onClick={() => onNewMap(section.startsWith("folder:") ? section.slice(7) : "")}><Plus /> Mind map mới</button>
      </div>

      <label className="library-filter"><Search /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Lọc theo tên…" aria-label="Lọc mind map" /></label>

      <nav className="library-nav">
        {navItem("all", Layers, "Tất cả", live.length)}
        {navItem("favorites", Star, "Yêu thích", live.filter((document) => document.favorite).length)}
        {navItem("recent", Clock3, "Gần đây")}
        <div className="library-folders-head">
          <span>Thư mục</span>
          <button type="button" className="icon-btn is-small" title="Thư mục mới" aria-label="Thư mục mới" onClick={() => setCreatingFolder(true)}><FolderPlus /></button>
        </div>
        {creatingFolder && (
          <input className="library-inline-input" autoFocus placeholder="Tên thư mục" onBlur={(event) => createFolder(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createFolder(event.currentTarget.value); if (event.key === "Escape") setCreatingFolder(false); }} />
        )}
        {allFolders.map((name) => navItem(`folder:${name}`, Folder, name, live.filter((document) => document.folder === name).length))}
        {!allFolders.length && !creatingFolder && <p className="library-hint">Nhóm các mind map theo môn học hoặc dự án.</p>}
        {navItem("trash", Trash2, "Thùng rác", trashed.length)}
      </nav>

      <div className="library-list" role="list">
        {section === "trash" && trashed.length > 0 && (
          <button type="button" className="library-empty-trash" onClick={() => { if (window.confirm(`Xóa vĩnh viễn ${trashed.length} mind map trong thùng rác?`)) void map.emptyTrash(); }}><Trash2 /> Dọn sạch thùng rác</button>
        )}
        {visible.map((document) => {
          const active = document.id === map.document.id;
          const inTrash = Boolean(document.trashedAt);
          return (
            <div key={document.id} role="listitem" className={`library-item ${active ? "is-active" : ""}`}>
              <button type="button" className="library-item-main" onClick={() => (inTrash ? map.restoreDocument(document.id) : map.setActiveId(document.id))} title={inTrash ? "Khôi phục và mở" : document.title}>
                <MapThumbnail document={document} />
                <span className="library-item-text">
                  {renamingId === document.id ? (
                    <input
                      autoFocus
                      defaultValue={document.title}
                      onClick={(event) => event.stopPropagation()}
                      onBlur={(event) => { map.setDocumentMeta(document.id, { title: event.target.value.trim() || document.title }); setRenamingId(null); }}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setRenamingId(null); }}
                    />
                  ) : <strong>{document.title}</strong>}
                  <small>{document.nodes.filter((node) => node.type !== "image").length} topic · {relativeTime(inTrash ? document.trashedAt : document.updatedAt)}</small>
                </span>
              </button>
              {!inTrash && (
                <button type="button" className={`library-star ${document.favorite ? "is-on" : ""}`} aria-label={document.favorite ? "Bỏ yêu thích" : "Yêu thích"} title={document.favorite ? "Bỏ yêu thích" : "Yêu thích"} onClick={() => map.setDocumentMeta(document.id, { favorite: !document.favorite })}><Star /></button>
              )}
              <Menu align="end" width={220} trigger={({ toggle }) => <button type="button" className="library-more" aria-label="Tùy chọn mind map" onClick={toggle}><Ellipsis /></button>}>
                {(close) => inTrash ? (
                  <>
                    <MenuItem icon={ArchiveRestore} label="Khôi phục" close={close} onSelect={() => map.restoreDocument(document.id)} />
                    <MenuItem icon={Trash2} label="Xóa vĩnh viễn" danger close={close} onSelect={() => { if (window.confirm(`Xóa vĩnh viễn “${document.title}”? Không thể hoàn tác.`)) void map.deleteDocumentForever(document.id); }} />
                  </>
                ) : (
                  <>
                    <MenuItem icon={Pencil} label="Đổi tên" close={close} onSelect={() => setRenamingId(document.id)} />
                    <MenuItem icon={Copy} label="Nhân bản" close={close} onSelect={() => map.duplicateDocument(document.id)} />
                    <MenuItem icon={Star} label={document.favorite ? "Bỏ yêu thích" : "Thêm vào yêu thích"} close={close} onSelect={() => map.setDocumentMeta(document.id, { favorite: !document.favorite })} />
                    <MenuSeparator />
                    <MenuLabel>Chuyển vào thư mục</MenuLabel>
                    <MenuItem icon={FolderInput} label="Không thư mục" checked={!document.folder} close={close} onSelect={() => map.setDocumentMeta(document.id, { folder: "" })} />
                    {allFolders.map((name) => <MenuItem key={name} icon={Folder} label={name} checked={document.folder === name} close={close} onSelect={() => map.setDocumentMeta(document.id, { folder: name })} />)}
                    <MenuSeparator />
                    <MenuItem icon={Trash2} label="Chuyển vào thùng rác" danger close={close} onSelect={() => map.trashDocument(document.id)} />
                  </>
                )}
              </Menu>
            </div>
          );
        })}
        {!visible.length && <p className="library-empty">{section === "trash" ? "Thùng rác trống." : filter ? "Không có mind map phù hợp." : "Chưa có mind map nào ở đây."}</p>}
      </div>

      <footer className="library-footer">
        <Link className="library-link" to="/"><School /> Sân trường</Link>
        <Link className="library-link is-learn" to="/learn"><GraduationCap /> Học từ sách (lộ trình AI)</Link>
        <Link className="library-link" to="/tasks"><CheckSquare2 /> Danh sách công việc</Link>
        <button type="button" className="library-link" onClick={onShowShortcuts}><Keyboard /> Phím tắt & trợ giúp</button>
        {user && <button type="button" className="library-link is-coffee" onClick={() => setCoffeeOpen(true)}><Coffee /> Mời admin ly cà phê</button>}
        <div className="library-account">
          {user ? (
            <>
              {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{user.isLocal ? <UserRound /> : user.name?.slice(0, 1) || "U"}</span>}
              <div><strong>{user.name}</strong><small>{user.isLocal ? "Dữ liệu lưu trên máy này" : user.email || (user.isGuest ? "Chế độ dùng thử" : user.provider)}</small></div>
              <Menu align="end" width={260} className="account-menu" trigger={({ toggle }) => <button type="button" className="icon-btn is-small" aria-label="Tài khoản" onClick={toggle}><ChevronDown /></button>}>
                {(close) => (
                  <>
                    <AuthorCard />
                    {!user.isLocal && <><MenuSeparator /><MenuItem icon={LogOut} label="Đăng xuất" danger close={close} onSelect={logout} /></>}
                  </>
                )}
              </Menu>
            </>
          ) : (
            <Link className={`library-login ${loading ? "is-loading" : ""}`} to="/login"><LogIn /> Đăng nhập hoặc dùng thử</Link>
          )}
        </div>
      </footer>
      {coffeeOpen && <CoffeeSupportModal onClose={() => setCoffeeOpen(false)} />}
    </aside>
  );
};

export default MapSidebar;
