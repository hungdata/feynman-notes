import { Link2, RotateCcw, Trash2, X } from "lucide-react";
import { RELATION_STYLES } from "@/mindmap/constants";

const STYLE_LABELS = { curved: "Curved", straight: "Straight", rounded: "Rounded", angled: "Angled" };

const RelationInspector = ({ edge, onUpdate, onClearPath, onDelete, onClose }) => {
  if (!edge) return null;
  return (
    <aside className="inspector relation-inspector">
      <div className="inspector-heading"><div><span>THUỘC TÍNH</span><strong><Link2 /> {edge.data.isCrossLink ? "Cross link" : "Connection"}</strong></div><button onClick={onClose} aria-label="Đóng"><X /></button></div>
      <label>Kiểu đường nối<div className="relation-style-grid">{RELATION_STYLES.map((style) => <button key={style} className={edge.data.pathStyle === style ? "active" : ""} onClick={() => onUpdate({ style })}><i className={`relation-preview ${style}`} />{STYLE_LABELS[style]}</button>)}</div></label>
      <div className="field-row"><label>Màu<input type="color" value={edge.data.color} onChange={(event) => onUpdate({ color: event.target.value })} /></label><label>Độ dày<input type="number" min="1" max="10" step="0.5" value={edge.data.width} onChange={(event) => onUpdate({ width: Number(event.target.value) })} /></label></div>
      <label>Kiểu nét<select value={edge.data.dash} onChange={(event) => onUpdate({ dash: event.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
      <label>Độ mờ<input type="range" min="0.15" max="1" step="0.05" value={edge.data.opacity} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} /></label>
      <label>Nhãn<input value={edge.data.label} placeholder="Mô tả quan hệ..." onChange={(event) => onUpdate({ label: event.target.value })} /></label>
      <div className="inspector-actions"><button onClick={onClearPath}><RotateCcw /> Reset path</button>{edge.data.isCrossLink && <button className="danger" onClick={onDelete}><Trash2 /> Xóa link</button>}</div>
      {!edge.data.isCrossLink && <p className="inspector-hint">Xóa connection cha–con không được cho phép để bảo toàn cấu trúc cây.</p>}
    </aside>
  );
};

export default RelationInspector;
