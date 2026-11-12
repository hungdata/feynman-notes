import { useEffect, useRef, useState } from "react";
import {
  CalendarDays, CircleAlert, Cloud, CloudOff, Download, FileCode, FileJson, FileText, FileType, Focus, GraduationCap, ImagePlus,
  LoaderCircle, Monitor, Moon, Palette, PanelLeft, PanelRight, Plus, Presentation, Printer, Redo2, Rows3, School,
  Search, Share2, Spline, Sun, Undo2, Upload, WandSparkles, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LAYOUT_LABELS, LAYOUTS } from "@/mindmap/constants";
import LayoutGlyph from "./LayoutGlyph";
import { IconButton, Menu, MenuItem, MenuLabel, MenuSeparator, ToolButton } from "./ui";

const SAVE_LABELS = {
  dirty: { label: "Chưa lưu", icon: Cloud },
  saving: { label: "Đang lưu…", icon: LoaderCircle },
  saved: { label: "Đã lưu", icon: Cloud },
  error: { label: "Lỗi lưu – thử lại", icon: CloudOff },
  "load-error": { label: "Không tải được", icon: CircleAlert },
};

const SaveStatus = ({ status, lastSavedAt, onRetry }) => {
  const { label, icon: Icon } = SAVE_LABELS[status] || SAVE_LABELS.saved;
  const title = status === "saved" && lastSavedAt ? `Đã lưu lúc ${lastSavedAt.toLocaleTimeString("vi-VN")}` : label;
  return (
    <button type="button" className={`save-status is-${status}`} title={title} onClick={onRetry} disabled={status === "saved" || status === "saving"}>
      <Icon className={status === "saving" ? "spin" : ""} /> <span>{label}</span>
    </button>
  );
};

const SearchBox = ({ query, onQueryChange, results, onPick, inputRef }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className="search-box" ref={boxRef}>
      <Search aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        placeholder="Tìm trong mind map…"
        aria-label="Tìm trong mind map"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onQueryChange(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) { onPick(results[0]); setOpen(false); }
          if (event.key === "Escape") { onQueryChange(""); event.currentTarget.blur(); }
        }}
      />
      {query && <button type="button" className="search-clear" aria-label="Xóa tìm kiếm" onClick={() => onQueryChange("")}><X /></button>}
      {open && query.trim() && (
        <div className="search-results" role="listbox">
          <div className="search-results-head">{results.length ? `${results.length} kết quả` : "Không tìm thấy"}</div>
          {results.map((node) => (
            <button key={node.id} type="button" role="option" onClick={() => { onPick(node); setOpen(false); }}>
              <span className="search-dot" style={{ background: node.color }} />
              <span><strong>{node.data.label || node.data.caption || "Ảnh"}</strong>{node.data.note && <small>{String(node.data.note).slice(0, 90)}</small>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABELS = { light: "Giao diện sáng", dark: "Giao diện tối", system: "Theo hệ thống" };

const MapToolbar = ({ map, ui, searchInputRef }) => {
  const ThemeIcon = THEME_ICONS[ui.uiTheme] || Monitor;
  return (
    <header className="app-toolbar">
      <div className="toolbar-start">
        <Link className="icon-btn" to="/mindmaps" title="Về hành lang trường Mind Map" aria-label="Về hành lang trường Mind Map"><School aria-hidden="true" /></Link>
        <IconButton icon={PanelLeft} label="Thư viện mind map (⌘\)" active={ui.sidebarOpen} onClick={ui.toggleSidebar} />
        <div className="title-block">
          <input className="map-title" value={map.document.title} aria-label="Tên mind map" onChange={(event) => map.setDocumentMeta(map.document.id, { title: event.target.value })} />
          <SaveStatus status={map.saveStatus} lastSavedAt={map.lastSavedAt} onRetry={() => (map.saveStatus === "load-error" ? map.reload() : map.saveNow())} />
        </div>
      </div>

      <nav className="toolbar-center" aria-label="Công cụ mind map">
        <ToolButton icon={Plus} label="Chủ đề con" shortcut="Tab" onClick={ui.addChild}>Con</ToolButton>
        <ToolButton icon={Rows3} label="Chủ đề cùng cấp" shortcut="Enter" onClick={ui.addSibling}>Cùng cấp</ToolButton>
        <ToolButton icon={Spline} label="Liên kết chéo" shortcut="⌘L" active={ui.crossLinkActive} onClick={ui.toggleCrossLink}>Liên kết</ToolButton>
        <ToolButton icon={ImagePlus} label="Thêm ảnh" onClick={ui.addImage}>Ảnh</ToolButton>
        <ToolButton icon={WandSparkles} label="Brainstorm – gõ nhanh nhiều ý" shortcut="⌘B" onClick={ui.openBrainstorm}>Brainstorm</ToolButton>
        <span className="toolbar-divider" />
        <ToolButton icon={Undo2} label="Hoàn tác" shortcut="⌘Z" disabled={!map.canUndo} onClick={map.undo}>Hoàn tác</ToolButton>
        <ToolButton icon={Redo2} label="Làm lại" shortcut="⇧⌘Z" disabled={!map.canRedo} onClick={map.redo}>Làm lại</ToolButton>
        <span className="toolbar-divider" />
        <Menu width={244} trigger={({ open, toggle }) => (
          <button type="button" className={`tool-btn ${open ? "is-active" : ""}`} onClick={toggle} title="Bố cục" aria-label="Bố cục">
            <LayoutGlyph layout={map.document.layout} /><span>Bố cục</span>
          </button>
        )}>
          {(close) => (
            <>
              <MenuLabel>Bố cục tự động</MenuLabel>
              <div className="layout-menu-grid">
                {LAYOUTS.map((layout) => (
                  <button key={layout} type="button" className={map.document.layout === layout ? "is-active" : ""} onClick={() => { ui.arrange(layout); close(); }}>
                    <LayoutGlyph layout={layout} /><span>{LAYOUT_LABELS[layout]}</span>
                  </button>
                ))}
              </div>
              <MenuSeparator />
              <MenuItem icon={Spline} label="Sắp xếp lại ngay" hint="⌘⇧R" close={close} onSelect={() => ui.arrange(map.document.layout === "freeForm" ? "horizontal" : map.document.layout)} />
            </>
          )}
        </Menu>
        <ToolButton icon={Palette} label="Style sheet" active={ui.inspectorTab === "sheets"} onClick={() => ui.toggleTab("sheets")}>Kiểu</ToolButton>
        <ToolButton icon={Focus} label="Tập trung vào nhánh đang chọn" active={Boolean(map.focusId)} onClick={ui.toggleFocus}>Tập trung</ToolButton>
        <ToolButton icon={Presentation} label="Trình chiếu" shortcut="F5" onClick={ui.present}>Trình chiếu</ToolButton>
      </nav>

      <div className="toolbar-end">
        <Link className="tool-btn is-learn" to="/learn" title="Học từ sách – lộ trình do AI soạn" aria-label="Học từ sách"><GraduationCap aria-hidden="true" /><span>Học</span></Link>
        <SearchBox query={ui.query} onQueryChange={ui.setQuery} results={ui.searchResults} onPick={ui.focusNode} inputRef={searchInputRef} />
        <Menu align="end" width={250} trigger={({ open, toggle }) => (
          <button type="button" className={`tool-btn ${open ? "is-active" : ""}`} onClick={toggle} title="Xuất, nhập và in" aria-label="Xuất, nhập và in">
            <Share2 /><span>Chia sẻ</span>
          </button>
        )}>
          {(close) => (
            <>
              <MenuLabel>Hình ảnh</MenuLabel>
              <MenuItem icon={Download} label="Ảnh PNG" close={close} onSelect={ui.exports.png} />
              <MenuItem icon={FileCode} label="Ảnh vector SVG" close={close} onSelect={ui.exports.svg} />
              <MenuItem icon={FileType} label="PDF" close={close} onSelect={ui.exports.pdf} />
              <MenuItem icon={Printer} label="In…" hint="⌘P" close={close} onSelect={ui.exports.print} />
              <MenuSeparator />
              <MenuLabel>Dàn ý & ứng dụng khác</MenuLabel>
              <MenuItem icon={FileText} label="Markdown (.md)" close={close} onSelect={ui.exports.markdown} />
              <MenuItem icon={FileText} label="OPML (SimpleMind, Workflowy…)" close={close} onSelect={ui.exports.opml} />
              <MenuItem icon={FileText} label="FreeMind / Freeplane (.mm)" close={close} onSelect={ui.exports.freemind} />
              <MenuItem icon={FileText} label="Văn bản thụt lề (.txt)" close={close} onSelect={ui.exports.text} />
              <MenuItem icon={FileText} label="Trang HTML dàn ý" close={close} onSelect={ui.exports.html} />
              <MenuItem icon={CalendarDays} label="Lịch (.ics) – topic có ngày" close={close} onSelect={ui.exports.ics} />
              <MenuItem icon={FileJson} label="Bản sao lưu Feynman (.json)" close={close} onSelect={ui.exports.json} />
              <MenuSeparator />
              <MenuItem icon={Upload} label="Nhập tệp (.json, .opml, .mm, .md, .txt)…" close={close} onSelect={ui.importFile} />
            </>
          )}
        </Menu>
        <IconButton icon={ThemeIcon} label={`${THEME_LABELS[ui.uiTheme]} – bấm để đổi`} onClick={ui.cycleTheme} />
        <IconButton icon={PanelRight} label="Bảng thuộc tính (⌘1–6)" active={Boolean(ui.inspectorTab)} onClick={ui.toggleInspector} />
      </div>
    </header>
  );
};

export default MapToolbar;
