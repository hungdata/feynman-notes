import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronRight, StickyNote } from "lucide-react";

const MODES = [
  { id: "tree", label: "Tất cả" },
  { id: "todo", label: "Chưa xong" },
  { id: "done", label: "Đã xong" },
  { id: "date", label: "Có ngày" },
  { id: "notes", label: "Có ghi chú" },
];

const buildOutline = (nodes) => {
  const result = [];
  const visit = (parentId, depth) => nodes
    .filter((node) => node.type === "topic" && node.data.parentId === parentId)
    .forEach((node) => { result.push({ node, depth }); visit(node.id, depth + 1); });
  visit(null, 0);
  return result;
};

/** SimpleMind-like outline: the whole map as an editable, filterable list. */
const OutlinePanel = ({ nodes, numbers, selectedId, onSelect, onCheck, onRename, onReparent, onToggle }) => {
  const [mode, setMode] = useState("tree");
  const [editingId, setEditingId] = useState(null);
  const items = useMemo(() => {
    const all = buildOutline(nodes);
    const hiddenBy = new Set();
    if (mode === "tree") {
      return all.filter(({ node }) => {
        if (hiddenBy.has(node.data.parentId)) { hiddenBy.add(node.id); return false; }
        if (node.data.collapsed) hiddenBy.add(node.id);
        return true;
      });
    }
    if (mode === "todo") return all.filter(({ node }) => (node.data.checkbox || node.data.checked) && !node.data.checked);
    if (mode === "done") return all.filter(({ node }) => node.data.checked);
    if (mode === "notes") return all.filter(({ node }) => node.data.note);
    return all.filter(({ node }) => node.data.dueDate).sort((a, b) => a.node.data.dueDate.localeCompare(b.node.data.dueDate));
  }, [mode, nodes]);
  const childCount = (id) => nodes.filter((node) => node.data.parentId === id).length;
  const flat = mode !== "tree";

  return (
    <div className="outline-view">
      <div className="outline-modes" role="tablist">
        {MODES.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} className={mode === item.id ? "is-active" : ""} onClick={() => setMode(item.id)}>{item.label}</button>)}
      </div>
      <div className="outline-list">
        {items.map(({ node, depth }) => (
          <div
            key={node.id}
            className={`outline-row ${selectedId === node.id ? "is-selected" : ""} ${node.data.checked ? "is-done" : ""}`}
            style={{ paddingLeft: `${6 + (flat ? 0 : depth) * 16}px` }}
            draggable={Boolean(node.data.parentId)}
            onDragStart={(event) => event.dataTransfer.setData("application/x-feynman-node", node.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("application/x-feynman-node"); if (source && source !== node.id) onReparent(source, node.id); }}
          >
            {!flat && childCount(node.id) > 0
              ? <button type="button" className="outline-toggle" aria-label={node.data.collapsed ? "Mở" : "Thu gọn"} onClick={() => onToggle(node.id, !node.data.collapsed)}>{node.data.collapsed ? <ChevronRight /> : <ChevronDown />}</button>
              : <span className="outline-toggle" />}
            <span className="outline-dot" style={{ background: node.data.view?.branchColor }} />
            {(node.data.checkbox || node.data.checked) && (
              <button type="button" className={`outline-check ${node.data.checked ? "checked" : ""}`} aria-label="Đánh dấu hoàn thành" onClick={() => onCheck(node.id, !node.data.checked)}>{node.data.checked && <Check />}</button>
            )}
            {editingId === node.id ? (
              <input
                autoFocus
                defaultValue={node.data.label}
                onBlur={(event) => { onRename(node.id, event.target.value); setEditingId(null); }}
                onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingId(null); }}
              />
            ) : (
              <button type="button" className="outline-title" onClick={() => onSelect(node)} onDoubleClick={() => setEditingId(node.id)} title="Bấm để tới topic · bấm đúp để sửa">
                {numbers?.get(node.id) && <em>{numbers.get(node.id)}</em>}
                {node.data.emoji && <span>{node.data.emoji}</span>}
                {node.data.label || <i>(trống)</i>}
              </button>
            )}
            {node.data.note && <StickyNote className="outline-meta" />}
            {node.data.dueDate && <span className="outline-date"><CalendarDays />{new Date(`${node.data.dueDate}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span>}
          </div>
        ))}
        {!items.length && <p className="panel-empty-text">Không có topic phù hợp.</p>}
      </div>
      <p className="panel-hint">Kéo một dòng thả lên dòng khác để đổi topic cha. Bấm đúp để sửa tên.</p>
    </div>
  );
};

export default OutlinePanel;
