import { Moon, Sun } from "lucide-react";
import { STYLE_SHEETS } from "@/mindmap/styles";
import { StyleSheetPreview } from "./previews";

const StyleSheetTab = ({ current, onApply }) => {
  const groups = [
    { title: "Sáng", icon: Sun, sheets: STYLE_SHEETS.filter((sheet) => !sheet.dark) },
    { title: "Tối", icon: Moon, sheets: STYLE_SHEETS.filter((sheet) => sheet.dark) },
  ];
  return (
    <div className="sheet-gallery">
      <p className="panel-hint is-info">Style sheet quyết định màu, hình dạng topic và đường nối của cả mind map. Kiểu bạn chỉnh riêng cho từng topic vẫn được giữ.</p>
      {groups.map(({ title, icon: Icon, sheets }) => (
        <section key={title}>
          <h3><Icon /> {title}</h3>
          <div className="sheet-grid">
            {sheets.map((sheet) => (
              <button key={sheet.id} type="button" className={`sheet-card ${current === sheet.id ? "is-active" : ""}`} onClick={() => onApply(sheet.id)} aria-pressed={current === sheet.id}>
                <StyleSheetPreview sheetId={sheet.id} />
                <span>{sheet.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default StyleSheetTab;
