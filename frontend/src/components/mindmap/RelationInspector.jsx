import { ArrowLeftRight, ArrowRight, Minus, RotateCcw, Trash2 } from "lucide-react";
import { RELATION_STYLE_LABELS, RELATION_STYLES } from "@/mindmap/constants";
import { ColorField, Field, Section, Segmented } from "./ui";

const RelationInspector = ({ edge, onUpdate, onClearPath, onDelete }) => (
  <>
    <Section title={edge.data.isCrossLink ? "Liên kết chéo" : "Đường nối cha – con"}>
      <Field label="Kiểu đường">
        <div className="relation-style-grid">
          {RELATION_STYLES.map((style) => (
            <button key={style} type="button" className={edge.data.pathStyle === style ? "is-active" : ""} onClick={() => onUpdate({ style })}>
              <i className={`relation-preview is-${style}`} />{RELATION_STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Màu"><ColorField compact value={edge.data.customColor || ""} autoLabel="Tự động" palette={["#64748b", "#1f2937", "#2f80ed", "#8b5cf6", "#eb5757", "#f2994a", "#27ae60", "#d946ef"]} onChange={(color) => onUpdate({ color: color || undefined })} /></Field>
      <Field label="Độ dày" hint={`${edge.data.width}px`}><input type="range" min="1" max="10" step="0.5" value={edge.data.width} onChange={(event) => onUpdate({ width: Number(event.target.value) })} /></Field>
      <Field label="Nét">
        <Segmented value={edge.data.dash} ariaLabel="Kiểu nét" onChange={(dash) => onUpdate({ dash })} options={[{ value: "solid", label: "Liền" }, { value: "dashed", label: "Gạch" }, { value: "dotted", label: "Chấm" }]} />
      </Field>
      <Field label="Mũi tên">
        <Segmented value={edge.data.arrow || "none"} ariaLabel="Mũi tên" onChange={(arrow) => onUpdate({ arrow })} options={[{ value: "none", icon: Minus, title: "Không" }, { value: "end", icon: ArrowRight, title: "Một chiều" }, { value: "both", icon: ArrowLeftRight, title: "Hai chiều" }]} />
      </Field>
      <Field label="Độ đậm"><input type="range" min="0.15" max="1" step="0.05" value={edge.data.opacity} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} /></Field>
      <Field label="Nhãn"><input value={edge.data.label} placeholder="Mô tả quan hệ…" onChange={(event) => onUpdate({ label: event.target.value })} /></Field>
    </Section>
    <div className="button-row">
      <button type="button" className="btn-ghost" onClick={onClearPath}><RotateCcw /> Bỏ uốn cong</button>
      {edge.data.isCrossLink && <button type="button" className="btn-danger-ghost" onClick={onDelete}><Trash2 /> Xóa liên kết</button>}
    </div>
    {!edge.data.isCrossLink && <p className="panel-hint">Đường nối cha – con không thể xóa để giữ cấu trúc cây. Kéo topic sang topic khác để đổi cha.</p>}
  </>
);

export default RelationInspector;
