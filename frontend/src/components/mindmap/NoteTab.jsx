import { useState } from "react";
import { CalendarDays, ExternalLink, Image as ImageIcon, Link2, Map as MapIcon, StickyNote, Tag, X } from "lucide-react";
import { Field, Section, Toggle } from "./ui";

const LabelEditor = ({ labels = [], onChange }) => {
  const [draft, setDraft] = useState("");
  const add = () => {
    const values = draft.split(",").map((value) => value.trim()).filter(Boolean);
    if (values.length) onChange([...new Set([...labels, ...values])].slice(0, 12));
    setDraft("");
  };
  return (
    <div className="chip-input">
      {labels.map((label) => (
        <span key={label} className="chip">{label}<button type="button" aria-label={`Bỏ nhãn ${label}`} onClick={() => onChange(labels.filter((item) => item !== label))}><X /></button></span>
      ))}
      <input value={draft} placeholder={labels.length ? "Thêm…" : "Quan trọng, Ôn thi…"} onChange={(event) => setDraft(event.target.value)} onBlur={add} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add(); } if (event.key === "Backspace" && !draft && labels.length) onChange(labels.slice(0, -1)); }} />
    </div>
  );
};

const stats = (nodes) => {
  const topics = nodes.filter((node) => node.type === "topic");
  const withBox = topics.filter((node) => node.data.checkbox || node.data.checked);
  return {
    topics: topics.length,
    notes: topics.filter((node) => node.data.note).length,
    images: nodes.length - topics.length,
    done: withBox.length ? Math.round((withBox.filter((node) => node.data.checked).length / withBox.length) * 100) : null,
  };
};

const NoteTab = ({ map, selection, edit, noteRef }) => {
  const [node] = selection.nodes;
  if (selection.edge) {
    return (
      <Section title={selection.edge.data.isCrossLink ? "Liên kết chéo" : "Đường nối"}>
        <Field label="Nhãn trên đường nối"><input value={selection.edge.data.label} placeholder="vd: dẫn đến, mâu thuẫn với…" onChange={(event) => map.updateRelation(selection.edge.id, { label: event.target.value })} /></Field>
      </Section>
    );
  }
  if (selection.nodes.length > 1) {
    return <div className="panel-empty"><StickyNote /><strong>Đã chọn {selection.nodes.length} topic</strong><p>Chọn một topic để viết ghi chú. Tab “Kiểu” và “Icon” áp dụng cho tất cả topic đang chọn.</p></div>;
  }
  if (!node) {
    const info = stats(map.allNodes);
    return (
      <>
        <Section title="Mind map">
          <Field label="Tên"><input value={map.document.title} onChange={(event) => map.setDocumentMeta(map.document.id, { title: event.target.value })} /></Field>
          <Field label="Mô tả"><textarea rows={5} value={map.document.description || ""} placeholder="Mục đích, nguồn tài liệu, ghi chú chung…" onChange={(event) => map.setDocumentMeta(map.document.id, { description: event.target.value })} /></Field>
        </Section>
        <div className="stat-grid">
          <div><strong>{info.topics}</strong><span>topic</span></div>
          <div><strong>{info.notes}</strong><span>ghi chú</span></div>
          <div><strong>{info.images}</strong><span>ảnh</span></div>
          <div><strong>{info.done === null ? "–" : `${info.done}%`}</strong><span>hoàn thành</span></div>
        </div>
        <p className="panel-hint"><MapIcon /> Chọn một topic để viết ghi chú, gắn liên kết, ngày và nhãn.</p>
      </>
    );
  }
  const data = node.data;
  if (node.type === "image") {
    return (
      <Section title={<><ImageIcon /> Ảnh</>}>
        <Field label="Chú thích"><input value={data.caption || ""} placeholder="Chú thích hiển thị trên ảnh" onChange={(event) => edit([node.id], { caption: event.target.value }, "caption")} /></Field>
        <Field label="Ghi chú phía trên ảnh"><textarea rows={6} value={data.note || ""} placeholder="Ý chính, giải thích hoặc nguồn ảnh…" onChange={(event) => edit([node.id], { note: event.target.value }, "note")} /></Field>
        <Field label="Liên kết"><div className="input-action"><input type="url" value={data.link || ""} placeholder="https://…" onChange={(event) => edit([node.id], { link: event.target.value }, "link")} />{data.link && <a href={data.link} target="_blank" rel="noreferrer" aria-label="Mở liên kết"><ExternalLink /></a>}</div></Field>
      </Section>
    );
  }
  return (
    <>
      <Section>
        <Field label="Chủ đề"><textarea className="title-input" rows={2} value={data.label || ""} onChange={(event) => edit([node.id], { label: event.target.value }, "label")} /></Field>
        <Field label="Ghi chú" hint="Hiện dấu 📝 trên topic">
          <textarea ref={noteRef} className="note-input" rows={10} value={data.note || ""} placeholder="Giải thích bằng lời của bạn, ví dụ, câu hỏi còn thắc mắc…" onChange={(event) => edit([node.id], { note: event.target.value }, "note")} />
        </Field>
      </Section>
      <Section>
        <Field label={<><Link2 /> Liên kết</>}><div className="input-action"><input type="url" value={data.link || ""} placeholder="https://…" onChange={(event) => edit([node.id], { link: event.target.value }, "link")} />{data.link && <a href={data.link} target="_blank" rel="noreferrer" aria-label="Mở liên kết"><ExternalLink /></a>}</div></Field>
        <Field label={<><CalendarDays /> Ngày</>}><div className="input-action"><input type="date" value={data.dueDate || ""} onChange={(event) => edit([node.id], { dueDate: event.target.value })} />{data.dueDate && <button type="button" aria-label="Bỏ ngày" onClick={() => edit([node.id], { dueDate: "" })}><X /></button>}</div></Field>
        <Field label={<><Tag /> Nhãn</>}><LabelEditor labels={data.labels} onChange={(labels) => edit([node.id], { labels })} /></Field>
      </Section>
      <Section>
        <Toggle label="Ô đánh dấu" description="Hiện checkbox trên topic này" checked={data.checkbox || map.document.settings.checkboxes} onChange={(checkbox) => edit([node.id], { checkbox })} />
        <Toggle label="Đã hoàn thành / đã hiểu" description="Gạch ngang và tính vào tiến độ nhánh cha" checked={data.checked} onChange={(checked) => edit([node.id], { checked, ...(checked ? { checkbox: true } : {}) })} />
      </Section>
    </>
  );
};

export default NoteTab;
