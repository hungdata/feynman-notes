import { BringToFront, Copy, ImageUp, Lock, LockOpen, Plus, RotateCcw, RotateCw, SendToBack, Trash2 } from "lucide-react";
import { getImageNoteHeight } from "@/mindmap/imageSizing";
import { Field, Section } from "./ui";

const ImageInspector = ({ node, onUpdate, onAddChild, onDuplicate, onDelete, onReplace }) => {
  const data = node.data;
  const width = Number(node.measured?.width || node.style?.width || 260);
  const height = Number(node.measured?.height || node.style?.height || 180);
  const updateNote = (note) => {
    const previous = getImageNoteHeight(data.note, width);
    const next = getImageNoteHeight(note, width);
    onUpdate({ note }, { height: Math.max(60, height - previous + next) });
  };
  return (
    <>
      <div className="image-preview">{data.assetUrl ? <img src={data.assetUrl} alt="" /> : null}</div>
      <div className="button-row">
        <button type="button" className="btn-ghost" onClick={onReplace}><ImageUp /> Thay ảnh</button>
        <button type="button" className="btn-ghost" onClick={onAddChild}><Plus /> Topic con</button>
      </div>
      <Section title="Kích thước">
        <div className="field-pair">
          <Field label="Rộng"><input type="number" min="80" value={Math.round(width)} onChange={(event) => onUpdate({ customSize: true }, { width: Number(event.target.value) })} /></Field>
          <Field label="Cao"><input type="number" min="60" value={Math.round(height)} onChange={(event) => onUpdate({ customSize: true }, { height: Number(event.target.value) })} /></Field>
        </div>
        <Field label="Ghi chú phía trên ảnh"><textarea rows={4} value={data.note || ""} onChange={(event) => updateNote(event.target.value)} placeholder="Ý chính, giải thích hoặc nguồn ảnh…" /></Field>
      </Section>
      <div className="button-grid">
        <button type="button" className="btn-ghost" onClick={() => onUpdate({ rotation: (data.rotation || 0) - 90 })}><RotateCcw /> Xoay trái</button>
        <button type="button" className="btn-ghost" onClick={() => onUpdate({ rotation: (data.rotation || 0) + 90 })}><RotateCw /> Xoay phải</button>
        <button type="button" className="btn-ghost" onClick={() => onUpdate({ locked: !data.locked })}>{data.locked ? <LockOpen /> : <Lock />}{data.locked ? "Mở khóa" : "Khóa vị trí"}</button>
        <button type="button" className="btn-ghost" onClick={onDuplicate}><Copy /> Nhân bản</button>
        <button type="button" className="btn-ghost" onClick={() => onUpdate({ zIndex: (data.zIndex || 1) + 10 })}><BringToFront /> Lên trên</button>
        <button type="button" className="btn-ghost" onClick={() => onUpdate({ zIndex: Math.max(0, (data.zIndex || 1) - 10) })}><SendToBack /> Xuống dưới</button>
      </div>
      <button type="button" className="btn-danger-ghost" onClick={onDelete}><Trash2 /> Xóa ảnh</button>
    </>
  );
};

export default ImageInspector;
