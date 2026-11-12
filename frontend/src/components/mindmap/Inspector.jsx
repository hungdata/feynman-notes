import {
  AlignCenter, AlignLeft, AlignRight, Bold, ClipboardPaste, Copy, Italic, Minus, Paintbrush, Plus, RotateCcw, SquareDashed,
} from "lucide-react";
import { BRANCH_LAYOUTS, LAYOUT_LABELS, RELATION_STYLE_LABELS, RELATION_STYLES, TOPIC_SHAPES } from "@/mindmap/constants";
import { getStyleSheet } from "@/mindmap/styles";
import { ColorField, Field, Section, Segmented, Toggle } from "./ui";

const BRANCH_LAYOUT_LABELS = { inherit: "Theo mind map", horizontal: "Ngang", topDown: "Từ trên xuống", list: "Danh sách", freeForm: "Tự do" };

const ShapeIcon = ({ shape }) => <i className={`shape-swatch shape-${shape || "auto"}`} aria-hidden="true" />;

/** Element style for one or more selected topics (SimpleMind "Element style"). */
const Inspector = ({ map, nodes, edit, onCopyStyle, onPasteStyle }) => {
  const ids = nodes.map((node) => node.id);
  const [first] = nodes;
  const data = first.data;
  const view = data.view || {};
  const set = (updates) => edit(ids, updates);
  const sheet = getStyleSheet(map.document.settings.styleSheet);
  const fontSize = Number(data.fontSize) || view.fontSize || 15;

  return (
    <>
      {nodes.length > 1 && <p className="panel-hint is-info">Đang chỉnh {nodes.length} topic cùng lúc.</p>}
      <Section title="Hình dạng">
        <div className="shape-grid" role="radiogroup" aria-label="Hình dạng topic">
          {TOPIC_SHAPES.map((shape) => (
            <button key={shape.id || "auto"} type="button" role="radio" aria-checked={(data.shape || "") === shape.id} className={(data.shape || "") === shape.id ? "is-active" : ""} title={shape.label} onClick={() => set({ shape: shape.id })}>
              <ShapeIcon shape={shape.id} /><span>{shape.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Màu">
        <Field label="Nền"><ColorField value={data.color} onChange={(color) => set({ color })} /></Field>
        <Field label="Viền"><ColorField compact value={data.borderColor} onChange={(borderColor) => set({ borderColor })} /></Field>
        <Field label="Độ dày viền" hint={data.borderWidth === null || data.borderWidth === undefined || data.borderWidth === "" ? "tự động" : `${data.borderWidth}px`}>
          <input type="range" min="0" max="6" step="0.5" value={data.borderWidth ?? view.borderWidth ?? 2} onChange={(event) => set({ borderWidth: Number(event.target.value) })} />
        </Field>
        <Field label="Màu nhánh" hint="đổi cả nhánh con"><ColorField compact value={data.branchColor} palette={sheet.palette.concat(["#64748b", "#111827"])} onChange={(branchColor) => set({ branchColor })} /></Field>
      </Section>

      <Section title="Chữ">
        <div className="text-style-row">
          <div className="stepper" aria-label="Cỡ chữ">
            <button type="button" aria-label="Giảm cỡ chữ" onClick={() => set({ fontSize: Math.max(10, fontSize - 1) })}><Minus /></button>
            <span>{fontSize}</span>
            <button type="button" aria-label="Tăng cỡ chữ" onClick={() => set({ fontSize: Math.min(48, fontSize + 1) })}><Plus /></button>
          </div>
          <button type="button" className={`icon-btn ${(Number(data.fontWeight) || view.fontWeight) >= 700 ? "is-active" : ""}`} title="Đậm" aria-label="Đậm" onClick={() => set({ fontWeight: (Number(data.fontWeight) || view.fontWeight) >= 700 ? 500 : 700 })}><Bold /></button>
          <button type="button" className={`icon-btn ${data.fontStyle === "italic" ? "is-active" : ""}`} title="Nghiêng" aria-label="Nghiêng" onClick={() => set({ fontStyle: data.fontStyle === "italic" ? "" : "italic" })}><Italic /></button>
          <Segmented value={data.textAlign || ""} ariaLabel="Căn chữ" onChange={(textAlign) => set({ textAlign })} options={[
            { value: "left", icon: AlignLeft, iconOnly: true, title: "Căn trái" },
            { value: "", icon: AlignCenter, iconOnly: true, title: "Căn giữa" },
            { value: "right", icon: AlignRight, iconOnly: true, title: "Căn phải" },
          ]} />
        </div>
        <Field label="Màu chữ"><ColorField compact value={data.textColor} onChange={(textColor) => set({ textColor })} /></Field>
        <Field label="Độ rộng tối đa" hint={`${Number(data.maxWidth) || view.maxWidth || 260}px`}>
          <input type="range" min="120" max="640" step="10" value={Number(data.maxWidth) || view.maxWidth || 260} onChange={(event) => set({ maxWidth: Number(event.target.value) })} />
        </Field>
      </Section>

      <Section title="Nhánh">
        {first.type === "topic" && data.parentId && (
          <Field label="Đường nối tới topic cha">
            <select value={data.relationStyle || "inherit"} onChange={(event) => set({ relationStyle: event.target.value })}>
              <option value="inherit">Theo mind map</option>
              {RELATION_STYLES.map((style) => <option key={style} value={style}>{RELATION_STYLE_LABELS[style]}</option>)}
            </select>
          </Field>
        )}
        <Field label="Bố cục các topic con">
          <select value={data.layout || "inherit"} onChange={(event) => set({ layout: event.target.value })}>
            {BRANCH_LAYOUTS.map((layout) => <option key={layout} value={layout}>{BRANCH_LAYOUT_LABELS[layout] || LAYOUT_LABELS[layout]}</option>)}
          </select>
        </Field>
        <Toggle label="Viền bao nhánh" description="Vẽ khung nhóm quanh cả nhánh" checked={data.branchBorder} onChange={(branchBorder) => set({ branchBorder })} />
      </Section>

      <div className="button-row">
        <button type="button" className="btn-ghost" onClick={onCopyStyle}><Copy /> Sao chép kiểu</button>
        <button type="button" className="btn-ghost" onClick={onPasteStyle}><ClipboardPaste /> Dán kiểu</button>
        <button type="button" className="btn-ghost" onClick={() => map.resetStyle(ids)}><RotateCcw /> Mặc định</button>
      </div>
      <p className="panel-hint"><Paintbrush /> Ô “A” = để style sheet tự chọn màu. <SquareDashed /> Kiểu riêng được giữ khi đổi style sheet.</p>
    </>
  );
};

export default Inspector;
