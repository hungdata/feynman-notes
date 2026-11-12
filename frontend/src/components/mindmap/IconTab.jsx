import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { EMOJIS, ICON_GROUPS, PRIORITY_ICONS, PROGRESS_ICONS } from "@/mindmap/icons";
import { TopicIcon } from "./TopicNode";

const IconTab = ({ selection, onApply }) => {
  const [query, setQuery] = useState("");
  const topics = selection.nodes.filter((node) => node.type === "topic");
  const current = topics[0]?.data.icon || "";
  const currentEmoji = topics[0]?.data.emoji || "";
  const groups = useMemo(() => {
    const value = query.trim().toLocaleLowerCase("vi");
    if (!value) return ICON_GROUPS;
    return ICON_GROUPS.map((group) => ({ ...group, icons: group.icons.filter((icon) => icon.label.toLocaleLowerCase("vi").includes(value) || icon.id.includes(value)) })).filter((group) => group.icons.length);
  }, [query]);

  if (!topics.length) {
    return <div className="panel-empty"><TopicIcon icon="star" /><strong>Chọn topic để gắn icon</strong><p>Mỗi topic có một icon và một emoji. Có thể chọn nhiều topic để gắn cùng lúc.</p></div>;
  }
  const apply = (updates) => onApply(topics.map((node) => node.id), updates);

  return (
    <div className="icon-tab">
      <div className="icon-tab-head">
        <label className="library-filter"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm icon…" aria-label="Tìm icon" /></label>
        {(current || currentEmoji) && <button type="button" className="btn-ghost" onClick={() => apply({ icon: "", emoji: "" })}><X /> Bỏ icon</button>}
      </div>
      {!query && (
        <>
          <h3>Ưu tiên & tiến độ</h3>
          <div className="icon-grid">
            {[...PRIORITY_ICONS, ...PROGRESS_ICONS].map((item) => (
              <button key={item.id} type="button" className={current === item.id ? "is-active" : ""} title={item.label} onClick={() => apply({ icon: current === item.id ? "" : item.id })}><TopicIcon icon={item.id} /></button>
            ))}
          </div>
        </>
      )}
      {groups.map((group) => (
        <section key={group.name}>
          <h3>{group.name}</h3>
          <div className="icon-grid">
            {group.icons.map((item) => (
              <button key={item.id} type="button" className={current === item.id ? "is-active" : ""} title={item.label} onClick={() => apply({ icon: current === item.id ? "" : item.id })}><TopicIcon icon={item.id} /></button>
            ))}
          </div>
        </section>
      ))}
      {!query && (
        <>
          <h3>Emoji</h3>
          <div className="icon-grid is-emoji">
            {EMOJIS.map((emoji) => (
              <button key={emoji} type="button" className={currentEmoji === emoji ? "is-active" : ""} onClick={() => apply({ emoji: currentEmoji === emoji ? "" : emoji })}>{emoji}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default IconTab;
