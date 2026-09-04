import { BringToFront, Copy, ExternalLink, Lock, Plus, RotateCcw, RotateCw, SendToBack, Trash2, Unlock, X } from "lucide-react";
import { getImageNoteHeight } from "@/mindmap/imageSizing";

const ImageInspector = ({ node, onUpdate, onAddChild, onDuplicate, onDelete, onReplace, onClose }) => {
  if (!node) return null;
  const data = node.data;
  const width = Number(node.width || node.style?.width || 260);
  const height = Number(node.height || node.style?.height || 180);
  const updateNote = (note) => {
    const previousNoteHeight = getImageNoteHeight(data.note, width);
    const nextNoteHeight = getImageNoteHeight(note, width);
    onUpdate({ note }, { height: Math.max(60, height - previousNoteHeight + nextNoteHeight) });
  };
  return (
    <aside className="inspector image-inspector">
      <div className="inspector-heading"><div><span>THUỘC TÍNH</span><strong>Image</strong></div><button onClick={onClose} aria-label="Đóng"><X /></button></div>
      <div className="image-preview">{data.assetUrl ? <img src={data.assetUrl} alt="Preview" /> : null}</div>
      <button className="wide-secondary" onClick={onReplace}>Thay ảnh</button>
      <label>Ghi chú phía trên ảnh<textarea rows="4" value={data.note || ""} onChange={(event) => updateNote(event.target.value)} placeholder="Ghi lại ý chính, giải thích hoặc nguồn của ảnh..." /></label>
      <label>Caption<input value={data.caption || ""} onChange={(event) => onUpdate({ caption: event.target.value })} placeholder="Thêm chú thích..." /></label>
      <div className="field-row"><label>Rộng<input type="number" min="80" value={Math.round(node.width || node.style?.width || 240)} onChange={(event) => onUpdate({}, { width: Number(event.target.value) })} /></label><label>Cao<input type="number" min="60" value={Math.round(node.height || node.style?.height || 180)} onChange={(event) => onUpdate({}, { height: Number(event.target.value) })} /></label></div>
      <label>Liên kết<div className="input-with-action"><input type="url" value={data.link || ""} onChange={(event) => onUpdate({ link: event.target.value })} placeholder="https://..." />{data.link && <a href={data.link} target="_blank" rel="noreferrer"><ExternalLink /></a>}</div></label>
      <div className="field-row"><label>Connection<select value={data.relationStyle || "inherit"} onChange={(event) => onUpdate({ relationStyle: event.target.value })}><option value="inherit">Theo mind map</option><option value="curved">Curved</option><option value="straight">Straight</option><option value="rounded">Rounded</option><option value="angled">Angled</option></select></label><label>Layout nhánh<select value={data.layout || "inherit"} onChange={(event) => onUpdate({ layout: event.target.value })}><option value="inherit">Kế thừa</option><option value="freeForm">Free Form</option><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="radial">Radial</option><option value="list">List</option></select></label></div>
      <button className="wide-secondary" onClick={onAddChild}><Plus /> Thêm note con từ ảnh</button>
      <div className="image-action-grid">
        <button onClick={() => onUpdate({ rotation: (data.rotation || 0) - 90 })}><RotateCcw /> Xoay trái</button>
        <button onClick={() => onUpdate({ rotation: (data.rotation || 0) + 90 })}><RotateCw /> Xoay phải</button>
        <button onClick={() => onUpdate({ locked: !data.locked })}>{data.locked ? <Unlock /> : <Lock />}{data.locked ? "Mở khóa" : "Khóa"}</button>
        <button onClick={() => onUpdate({ zIndex: (data.zIndex || 1) + 10 })}><BringToFront /> Lên trên</button>
        <button onClick={() => onUpdate({ zIndex: Math.max(0, (data.zIndex || 1) - 10) })}><SendToBack /> Xuống dưới</button>
        <button onClick={onDuplicate}><Copy /> Nhân bản</button>
      </div>
      <button className="wide-danger" onClick={onDelete}><Trash2 /> Xóa ảnh</button>
    </aside>
  );
};

export default ImageInspector;
