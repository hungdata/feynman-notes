import { CalendarDays, CheckCircle2, Circle, ListTree, X } from "lucide-react";

const buildOutline = (nodes) => {
  const result = [];
  const visit = (parentId, depth) => nodes.filter((node) => node.type === "topic" && node.data.parentId === parentId).forEach((node) => {
    result.push({ node, depth }); visit(node.id, depth + 1);
  });
  visit(null, 0);
  return result;
};

const OutlinePanel = ({ nodes, mode, onModeChange, onSelect, onCheck, onReparent, onClose }) => {
  let items = buildOutline(nodes);
  if (mode === "checklist") items = items.filter(({ node }) => typeof node.data.checked === "boolean");
  if (mode === "todo") items = items.filter(({ node }) => !node.data.checked);
  if (mode === "done") items = items.filter(({ node }) => node.data.checked);
  if (mode === "date") items = items.filter(({ node }) => node.data.dueDate).sort((a, b) => a.node.data.dueDate.localeCompare(b.node.data.dueDate));
  return (
    <aside className="outline-panel inspector">
      <div className="inspector-heading"><div><span>DOCUMENT</span><strong><ListTree /> Outline</strong></div><button onClick={onClose}><X /></button></div>
      <div className="outline-modes">{["tree", "checklist", "todo", "done", "date"].map((value) => <button key={value} className={mode === value ? "active" : ""} onClick={() => onModeChange(value)}>{value === "tree" ? "Cây" : value === "checklist" ? "Checklist" : value === "todo" ? "To Do" : value === "done" ? "Done" : "Ngày"}</button>)}</div>
      <div className="outline-list">
        {items.map(({ node, depth }) => <div key={node.id} className="outline-row" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-novamind-node", node.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const source = event.dataTransfer.getData("application/x-novamind-node"); if (source) onReparent(source, node.id); }} style={{ paddingLeft: `${8 + depth * 16}px` }}>
          <button className="outline-check" onClick={() => onCheck(node.id, !node.data.checked)}>{node.data.checked ? <CheckCircle2 /> : <Circle />}</button>
          <button className="outline-title" onClick={() => onSelect(node)}>{node.data.emoji && <span>{node.data.emoji}</span>}{node.data.label}</button>
          {node.data.dueDate && <span className="outline-date"><CalendarDays />{new Date(`${node.data.dueDate}T00:00:00`).toLocaleDateString("vi-VN")}</span>}
        </div>)}
        {!items.length && <p className="outline-empty">Không có topic phù hợp chế độ này.</p>}
      </div>
    </aside>
  );
};

export default OutlinePanel;
