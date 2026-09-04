import {
  AlignCenter, BringToFront, ChevronDown, Download, FileJson, FileText, Image,
  Bot, LayoutDashboard, Link2, ListTree, PanelLeftClose, PanelRightClose, Plus, Redo2, Save,
  Undo2,
} from "lucide-react";

const ToolButton = ({ label, children, ...props }) => <button className="tool-button" title={label} aria-label={label} {...props}>{children}</button>;

const MapToolbar = ({ title, saveStatus, onTitleChange, onAddChild, onAddSibling, onAddImage, onAddTopicImage, onCrossLink, crossLinkActive, onUndo, onRedo, canUndo, canRedo, onArrange, layout, relationStyle, onRelationStyleChange, onExportJson, onExportPng, onExportSvg, onExportPdf, onExportText, onExportHtml, onPrint, onToggleSidebar, onToggleOutline, onToggleInspector, onToggleTeacher, teacherOpen }) => (
  <header className="map-toolbar">
    <div className="toolbar-left"><ToolButton label="Ẩn/hiện thư viện" onClick={onToggleSidebar}><PanelLeftClose /></ToolButton><input className="map-title" value={title} onChange={(event) => onTitleChange(event.target.value)} aria-label="Tên mind map" /><span className={`save-state ${saveStatus}`}><Save /> {{ dirty: "Chưa lưu", saving: "Đang lưu…", saved: "Đã lưu", error: "Lỗi lưu", "load-error": "Lỗi tải" }[saveStatus] || "Đã lưu"}</span></div>
    <div className="toolbar-center">
      <ToolButton label="Thêm child topic (Tab)" onClick={onAddChild}><Plus /><span>Child</span></ToolButton>
      <ToolButton label="Thêm sibling topic (Enter)" onClick={onAddSibling}><BringToFront /><span>Sibling</span></ToolButton>
      <ToolButton label="Thêm ảnh" onClick={onAddImage}><Image /><span>Ảnh</span></ToolButton>
      <ToolButton label="Thêm topic có ảnh" onClick={onAddTopicImage}><Image /><Plus /></ToolButton>
      <ToolButton label={crossLinkActive ? "Hủy tạo cross link" : "Tạo cross link"} className={`tool-button ${crossLinkActive ? "active" : ""}`} onClick={onCrossLink}><Link2 /><span>Crosslink</span></ToolButton>
      <span className="tool-divider" />
      <ToolButton label="Hoàn tác (Ctrl/Cmd + Z)" disabled={!canUndo} onClick={onUndo}><Undo2 /></ToolButton>
      <ToolButton label="Làm lại" disabled={!canRedo} onClick={onRedo}><Redo2 /></ToolButton>
      <span className="tool-divider" />
      <div className="layout-control"><LayoutDashboard /><select value={layout} onChange={(event) => onArrange(event.target.value)} aria-label="Kiểu bố cục"><option value="freeForm">Free Form</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="topDown">Top Down</option><option value="linear">Linear</option><option value="radial">Radial</option><option value="matrix">Matrix</option><option value="list">List</option></select><ChevronDown /></div>
      <ToolButton label="Tự động căn chỉnh" onClick={() => onArrange(layout)}><AlignCenter /></ToolButton>
      <div className="layout-control relation-select"><Link2 /><select value={relationStyle} onChange={(event) => onRelationStyleChange(event.target.value)} aria-label="Kiểu đường nối mặc định"><option value="curved">Curved</option><option value="straight">Straight</option><option value="rounded">Rounded</option><option value="angled">Angled</option></select><ChevronDown /></div>
    </div>
    <div className="toolbar-right">
      <ToolButton label="Mở AI Teacher" className={`tool-button teacher-tool-button ${teacherOpen ? "active" : ""}`} onClick={onToggleTeacher}><Bot /><span>Teacher</span></ToolButton>
      <ToolButton label="Outline" onClick={onToggleOutline}><ListTree /></ToolButton>
      <div className="export-menu"><ToolButton label="Xuất mind map"><Download /><span>Xuất</span></ToolButton><div className="export-popover"><button onClick={onExportJson}><FileJson /> JSON</button><button onClick={onExportPng}><Image /> PNG</button><button onClick={onExportSvg}><FileText /> SVG</button><button onClick={onExportPdf}><FileText /> PDF</button><button onClick={onExportText}><FileText /> Outline TXT</button><button onClick={onExportHtml}><FileText /> Outline HTML</button><button onClick={onPrint}><FileText /> In mind map</button></div></div>
      <ToolButton label="Mở/đóng thuộc tính" onClick={onToggleInspector}><PanelRightClose /></ToolButton>
    </div>
  </header>
);

export default MapToolbar;
