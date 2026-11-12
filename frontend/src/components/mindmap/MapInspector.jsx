import { ChevronsDownUp, ChevronsUpDown, Eye, Plus } from "lucide-react";
import { LAYOUT_LABELS, LAYOUTS, NUMBERING_OPTIONS, RELATION_STYLE_LABELS, RELATION_STYLES } from "@/mindmap/constants";
import { getStyleSheet } from "@/mindmap/styles";
import LayoutGlyph from "./LayoutGlyph";
import { ColorField, Field, Section, Segmented, Toggle } from "./ui";

const BACKGROUNDS = ["#ffffff", "#f8fafc", "#f5f7fa", "#fffaf3", "#f6efe2", "#f2f9fc", "#f4f8f1", "#fff7f2", "#1b1d23", "#0b0c10", "#23352b", "#0f3d75"];

/** Map style: shown in the Style tab when nothing is selected. */
const MapInspector = ({ map, onArrange, onOpenSheets }) => {
  const { settings, layout } = map.document;
  const sheet = getStyleSheet(settings.styleSheet);
  const set = (updates) => map.updateSettings(updates);
  const taper = typeof settings.lineTaper === "boolean" ? (settings.lineTaper ? "on" : "off") : "auto";

  return (
    <>
      <Section title="Style sheet" actions={<button type="button" className="link-btn" onClick={onOpenSheets}>Xem tất cả</button>}>
        <button type="button" className="sheet-current" onClick={onOpenSheets}><span style={{ background: sheet.background }}>{sheet.palette.slice(0, 5).map((color) => <i key={color} style={{ background: color }} />)}</span><strong>{sheet.name}</strong></button>
      </Section>

      <Section title="Bố cục">
        <div className="layout-grid">
          {LAYOUTS.map((item) => (
            <button key={item} type="button" className={layout === item ? "is-active" : ""} title={LAYOUT_LABELS[item]} onClick={() => onArrange(item)}>
              <LayoutGlyph layout={item} /><span>{LAYOUT_LABELS[item]}</span>
            </button>
          ))}
        </div>
        <Field label="Khoảng cách">
          <Segmented value={settings.spacing || "normal"} ariaLabel="Khoảng cách" onChange={(spacing) => set({ spacing })} options={[{ value: "compact", label: "Gọn" }, { value: "normal", label: "Vừa" }, { value: "spacious", label: "Thoáng" }]} />
        </Field>
      </Section>

      <Section title="Đường nối">
        <Field label="Kiểu">
          <select value={settings.relationStyle || ""} onChange={(event) => set({ relationStyle: event.target.value })}>
            <option value="">Theo style sheet ({RELATION_STYLE_LABELS[sheet.line.style]})</option>
            {RELATION_STYLES.map((style) => <option key={style} value={style}>{RELATION_STYLE_LABELS[style]}</option>)}
          </select>
        </Field>
        <Field label="Độ dày" hint={settings.relationWidth ? `${settings.relationWidth}px` : "tự động"}>
          <input type="range" min="1" max="8" step="0.5" value={settings.relationWidth || sheet.line.width} onChange={(event) => set({ relationWidth: Number(event.target.value) })} />
        </Field>
        <Field label="Thon dần từ gốc">
          <Segmented value={taper} ariaLabel="Đường thon" onChange={(value) => set({ lineTaper: value === "auto" ? null : value === "on" })} options={[{ value: "auto", label: "Tự động" }, { value: "on", label: "Bật" }, { value: "off", label: "Tắt" }]} />
        </Field>
        <Field label="Màu"><ColorField compact value={settings.relationColor} autoLabel="Theo màu nhánh" palette={["#64748b", "#94a3b8", "#1f2937", "#2f80ed", "#9b51e0", "#eb5757"]} onChange={(relationColor) => set({ relationColor })} /></Field>
      </Section>

      <Section title="Nền">
        <ColorField value={settings.background} autoLabel="Theo style sheet" palette={BACKGROUNDS} onChange={(background) => set({ background })} />
        <Field label="Lưới">
          <Segmented value={settings.grid || "none"} ariaLabel="Lưới nền" onChange={(grid) => set({ grid })} options={[{ value: "none", label: "Không" }, { value: "dots", label: "Chấm" }, { value: "lines", label: "Kẻ ô" }]} />
        </Field>
        {settings.grid !== "none" && <Toggle label="Bám lưới khi kéo" checked={settings.snapToGrid} onChange={(snapToGrid) => set({ snapToGrid })} />}
      </Section>

      <Section title="Topic">
        <Field label="Đánh số tự động">
          <select value={settings.numbering || "none"} onChange={(event) => set({ numbering: event.target.value })}>
            {NUMBERING_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </Field>
        <Toggle label="Ô đánh dấu trên mọi topic" description="Theo dõi tiến độ “đã hiểu / đã xong”" checked={settings.checkboxes} onChange={(checkboxes) => set({ checkboxes })} />
      </Section>

      <div className="button-grid">
        <button type="button" className="btn-ghost" onClick={map.expandAll}><ChevronsUpDown /> Mở tất cả</button>
        <button type="button" className="btn-ghost" onClick={map.collapseAll}><ChevronsDownUp /> Thu gọn tất cả</button>
        <button type="button" className="btn-ghost" onClick={map.showHidden}><Eye /> Hiện topic ẩn</button>
        <button type="button" className="btn-ghost" onClick={() => map.addRootNode()}><Plus /> Chủ đề trung tâm</button>
      </div>
    </>
  );
};

export default MapInspector;
