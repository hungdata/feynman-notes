import { ExternalLink, EyeOff, Focus, ImagePlus, Palette, Trash2, X } from "lucide-react";
import { NODE_COLORS } from "@/mindmap/constants";

const Inspector = ({ node, onUpdate, onDelete, onFocus, onHide, onAddImage, onClose }) => {
  if (!node) return null;
  const data = node.data;
  return (
    <aside className="inspector">
      <div className="inspector-heading"><div><span>THUỘC TÍNH</span><strong>Topic</strong></div><button onClick={onClose} aria-label="Đóng bảng thuộc tính"><X /></button></div>
      <label>Tiêu đề<textarea rows="3" value={data.label} onChange={(event) => onUpdate({ label: event.target.value })} /></label>
      <div className="field-row">
        <label>Emoji<input value={data.emoji || ""} maxLength="4" placeholder="✨" onChange={(event) => onUpdate({ emoji: event.target.value })} /></label>
        <label>Cỡ chữ<input type="number" min="11" max="30" value={data.fontSize} onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })} /></label>
      </div>
      <label>Kiểu chữ<select value={data.fontWeight} onChange={(event) => onUpdate({ fontWeight: Number(event.target.value) })}><option value="400">Regular</option><option value="600">Semi Bold</option><option value="700">Bold</option></select></label>
      <div className="field-row"><label>Connection<select value={data.relationStyle || "inherit"} onChange={(event) => onUpdate({ relationStyle: event.target.value })}><option value="inherit">Theo mind map</option><option value="curved">Curved</option><option value="straight">Straight</option><option value="rounded">Rounded</option><option value="angled">Angled</option></select></label><label>Layout nhánh<select value={data.layout || "inherit"} onChange={(event) => onUpdate({ layout: event.target.value })}><option value="inherit">Kế thừa</option><option value="freeForm">Free Form</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="radial">Radial</option><option value="list">List</option></select></label></div>
      <label><span className="label-with-icon"><Palette /> Màu nền</span><div className="color-swatches">{NODE_COLORS.map((color) => <button key={color} aria-label={`Màu ${color}`} className={data.color === color ? "active" : ""} style={{ background: color }} onClick={() => onUpdate({ color })} />)}<input type="color" value={data.color} onChange={(event) => onUpdate({ color: event.target.value })} /></div></label>
      <div className="field-row"><label>Màu chữ<input type="color" value={data.textColor} onChange={(event) => onUpdate({ textColor: event.target.value })} /></label><label>Màu nhánh<input type="color" value={data.branchColor} onChange={(event) => onUpdate({ branchColor: event.target.value, borderColor: event.target.value })} /></label></div>
      <label>Ghi chú<textarea rows="5" value={data.note || ""} placeholder="Thêm chi tiết, ý tưởng hoặc việc cần làm..." onChange={(event) => onUpdate({ note: event.target.value })} /></label>
      <label>Labels<input value={(data.labels || []).join(", ")} placeholder="Research, Important, AI" onChange={(event) => onUpdate({ labels: event.target.value.split(",").map((label) => label.trim()).filter(Boolean) })} /></label>
      <label>Ngày đến hạn<input type="date" value={data.dueDate || ""} onChange={(event) => onUpdate({ dueDate: event.target.value })} /></label>
      <label>Liên kết<div className="input-with-action"><input type="url" value={data.link || ""} placeholder="https://..." onChange={(event) => onUpdate({ link: event.target.value })} />{data.link && <a href={data.link} target="_blank" rel="noreferrer" aria-label="Mở liên kết"><ExternalLink /></a>}</div></label>
      <label className="checkbox-field"><input type="checkbox" checked={data.checked} onChange={(event) => onUpdate({ checked: event.target.checked })} /><span><strong>Đã hiểu</strong><small>Tích để đánh dấu nội dung đã hiểu và gạch ngang.</small></span></label>
      <button className="wide-secondary" onClick={onAddImage}><ImagePlus /> {data.imageAssetId ? "Thay ảnh topic" : "Gắn ảnh vào topic"}</button>
      {data.imageAssetId && <button className="wide-danger" onClick={() => onUpdate({ imageAssetId: null })}><Trash2 /> Gỡ ảnh khỏi topic</button>}
      <div className="inspector-actions"><button onClick={onFocus}><Focus /> Focus nhánh</button><button onClick={onHide}><EyeOff /> Ẩn nhánh</button>{data.parentId && <button className="danger" onClick={onDelete}><Trash2 /> Xóa topic</button>}</div>
    </aside>
  );
};

export default Inspector;
