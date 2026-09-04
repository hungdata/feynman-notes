import { memo, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { BadgeCheck, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Circle, Link2, StickyNote } from "lucide-react";
import { resizeTextareaToContent } from "@/mindmap/textareaSizing";

const TopicNode = memo(({ id, data, selected }) => {
  const [editing, setEditing] = useState(!data.label);
  const [draft, setDraft] = useState(data.label || "");
  const editorRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();

  useLayoutEffect(() => {
    if (!editing) return;
    resizeTextareaToContent(editorRef.current);
    updateNodeInternals(id);
  }, [draft, editing, id, updateNodeInternals]);

  const save = () => {
    const label = draft.trim();
    if (data.onUpdate) data.onUpdate({ label });
    setEditing(false);
  };

  return (
    <div
      className={`mind-node ${selected ? "mind-node--selected" : ""} ${data.checked ? "mind-node--done" : ""}`}
      style={{
        background: data.color,
        color: data.textColor,
        borderColor: data.borderColor,
        fontSize: data.fontSize,
        fontWeight: data.fontWeight,
        "--branch-color": data.branchColor,
      }}
      onDoubleClick={() => { setDraft(data.label || ""); setEditing(true); }}
    >
      <Handle id="target-left" type="target" position={Position.Left} className="mind-handle" />
      <Handle id="source-left" type="source" position={Position.Left} className="mind-handle" />
      {data.imageUrl && <img className="topic-image nodrag" src={data.imageUrl} alt="Topic attachment" draggable="false" />}
      <div className="topic-content">
        <div className="topic-title-row">
          <button className="node-check nodrag" title={data.checked ? "Bỏ đánh dấu đã hiểu" : "Đánh dấu đã hiểu"} aria-label={data.checked ? "Bỏ đánh dấu đã hiểu" : "Đánh dấu đã hiểu"} onClick={() => data.onUpdate?.({ checked: !data.checked })}>
            {data.checked ? <CheckCircle2 /> : <Circle />}
          </button>
          {data.emoji && <span className="node-emoji">{data.emoji}</span>}
          {editing ? (
        <textarea
          ref={editorRef}
          autoFocus
          className="node-editor nodrag"
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
            if (event.key === "Escape") { setDraft(data.label || ""); setEditing(false); }
          }}
        />
          ) : (
        <span className="node-label">{data.label || ""}</span>
          )}
          <span className="node-meta">
            {data.note && <StickyNote aria-label="Có ghi chú" />}
            {data.link && <Link2 aria-label="Có liên kết" />}
          </span>
          <button
            type="button"
            className="node-ai-check nodrag nowheel"
            title="Nhờ AI kiểm tra note đúng hay sai"
            aria-label={`AI kiểm tra note ${data.label || "chưa có tiêu đề"}`}
            onClick={(event) => {
              event.stopPropagation();
              data.onAiCheck?.(id);
            }}
          >
            <BadgeCheck />
            <span>Kiểm tra</span>
          </button>
        </div>
        {(data.labels?.length > 0 || data.dueDate || data.progress !== null) && <div className="topic-extras">
          {data.labels?.map((label) => <span key={label} className="topic-label">{label}</span>)}
          {data.dueDate && <span className="topic-date"><CalendarDays />{new Date(`${data.dueDate}T00:00:00`).toLocaleDateString("vi-VN")}</span>}
          {data.progress !== null && <span className="topic-progress"><i style={{ width: `${data.progress}%` }} />{data.progress}%</span>}
        </div>}
      </div>
      {data.childCount > 0 && (
        <button className="node-collapse nodrag" aria-label={data.collapsed ? "Mở nhánh" : "Thu gọn nhánh"} onClick={() => data.onUpdate?.({ collapsed: !data.collapsed })}>
          {data.collapsed ? <ChevronRight /> : <ChevronDown />}
          <span>{data.childCount}</span>
        </button>
      )}
      <Handle id="target-right" type="target" position={Position.Right} className="mind-handle" />
      <Handle id="source-right" type="source" position={Position.Right} className="mind-handle" />
    </div>
  );
});

TopicNode.displayName = "TopicNode";
export default TopicNode;
