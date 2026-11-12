import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { CalendarDays, Check, Link2, StickyNote } from "lucide-react";
import { resizeTextareaToContent } from "@/mindmap/textareaSizing";
import { ICON_BY_ID } from "@/mindmap/icons";

const POSITIONS = { left: Position.Left, right: Position.Right, top: Position.Top, bottom: Position.Bottom, "list-left": Position.Bottom, "list-right": Position.Bottom };

/** Source and target handles for every anchor the layout engine can use. */
export const NodeHandles = () => Object.entries(POSITIONS).flatMap(([name, position]) => [
  <Handle key={`s-${name}`} id={`s-${name}`} type="source" position={position} className={`mind-handle handle-${name}`} isConnectable={false} />,
  <Handle key={`t-${name}`} id={`t-${name}`} type="target" position={position} className={`mind-handle handle-${name}`} isConnectable={false} />,
]);

export const TopicIcon = ({ icon }) => {
  if (!icon) return null;
  if (icon.startsWith("priority-")) return <span className="topic-icon priority" data-value={icon.slice(9)}>{icon.slice(9)}</span>;
  if (icon.startsWith("progress-")) {
    const value = Number(icon.slice(9));
    return <span className="topic-icon progress-pie" style={{ "--value": `${value * 3.6}deg` }} title={`${value}%`} />;
  }
  const item = ICON_BY_ID.get(icon);
  if (!item) return null;
  const { Component } = item;
  return <span className="topic-icon" style={{ color: item.color }} title={item.label}><Component /></span>;
};

const formatDate = (value) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
};

const TopicNode = memo(({ id, data, selected }) => {
  const [editing, setEditing] = useState(Boolean(data.editRequest));
  const [draft, setDraft] = useState(data.editSeed ?? data.label ?? "");
  const [handledRequest, setHandledRequest] = useState(data.editRequest);
  const editorRef = useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const view = data.view || {};

  useLayoutEffect(() => {
    if (!editing) return;
    resizeTextareaToContent(editorRef.current);
    updateNodeInternals(id);
  }, [draft, editing, id, updateNodeInternals]);

  // React Flow keeps a new node invisible until it is measured, so autoFocus
  // alone is not enough: keep trying for a few frames until the editor has focus.
  useEffect(() => {
    if (!editing) return undefined;
    let frame = 0;
    let tries = 0;
    const focus = () => {
      const editor = editorRef.current;
      if (!editor) return;
      if (document.activeElement !== editor) editor.focus({ preventScroll: true });
      if (document.activeElement !== editor && tries < 30) { tries += 1; frame = requestAnimationFrame(focus); }
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [editing, data.editRequest]);

  // The page can ask a topic to start editing (new topic, F2, Space or typing).
  if (data.editRequest && data.editRequest !== handledRequest) {
    setHandledRequest(data.editRequest);
    setDraft(data.editSeed ?? data.label ?? "");
    setEditing(true);
  }

  const finish = (commit = true, next = null) => {
    // Enter/Escape unmount the editor; a late blur must not finish twice.
    if (!editorRef.current || editorRef.current.dataset.done === "true") return;
    editorRef.current.dataset.done = "true";
    const label = draft.replace(/\s+$/, "");
    if (commit && label !== (data.label || "")) data.onUpdate?.({ label });
    setEditing(false);
    data.onEditDone?.(id, { committed: commit, label: commit ? label : data.label || "", next });
  };

  const style = {
    "--topic-fill": view.fill,
    "--topic-border": view.border,
    "--topic-border-width": `${view.borderWidth ?? 2}px`,
    "--topic-text": view.text,
    "--topic-font-size": `${view.fontSize || 15}px`,
    "--topic-font-weight": view.fontWeight || 600,
    "--topic-max-width": `${view.maxWidth || 260}px`,
    "--branch-color": view.branchColor,
    fontStyle: view.fontStyle,
    textAlign: view.textAlign || undefined,
  };
  const hasBadges = data.labels?.length > 0 || data.dueDate;
  const showCheckbox = data.showCheckbox;

  return (
    <div
      className={[
        "topic",
        `shape-${view.shape || "rounded"}`,
        `depth-${Math.min(view.depth ?? 1, 2)}`,
        selected && "is-selected",
        data.checked && showCheckbox && "is-done",
        data.dropTarget && "is-drop-target",
        data.aiGenerated && "is-ai",
        data.searchMatch && "is-match",
        data.childSide && `children-${data.childSide}`,
      ].filter(Boolean).join(" ")}
      style={style}
      onDoubleClick={(event) => { event.stopPropagation(); setDraft(data.label || ""); setEditing(true); }}
    >
      <NodeHandles />
      {data.imageUrl && <img className="topic-image nodrag" src={data.imageUrl} alt="" draggable="false" />}
      <div className="topic-body">
        {showCheckbox && (
          <button
            type="button"
            className={`topic-check nodrag ${data.checked ? "checked" : ""}`}
            aria-label={data.checked ? "Bỏ đánh dấu hoàn thành" : "Đánh dấu hoàn thành"}
            onClick={(event) => { event.stopPropagation(); data.onUpdate?.({ checked: !data.checked }); }}
          >
            {data.checked && <Check />}
          </button>
        )}
        {data.number && <span className="topic-number">{data.number}</span>}
        <TopicIcon icon={data.icon} />
        {data.emoji && <span className="topic-emoji">{data.emoji}</span>}
        {editing ? (
          <textarea
            ref={editorRef}
            autoFocus
            className="topic-editor nodrag nowheel"
            value={draft}
            rows={1}
            placeholder={data.parentId ? "Chủ đề" : "Ý tưởng trung tâm"}
            onFocus={(event) => {
              const editor = event.currentTarget;
              // Typing on a selected topic replaces it; F2/double-click selects the text.
              if (typeof data.editSeed === "string") editor.setSelectionRange(editor.value.length, editor.value.length);
              else editor.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); finish(true); }
              else if (event.key === "Tab") { event.preventDefault(); finish(true, "child"); }
              else if (event.key === "Escape") { event.preventDefault(); setDraft(data.label || ""); finish(false); }
            }}
          />
        ) : (
          <span className={`topic-label ${data.label ? "" : "is-empty"}`}>{data.label || (data.parentId ? "Chủ đề" : "Ý tưởng trung tâm")}</span>
        )}
        {(data.note || data.link) && !data.aiGenerated && (
          <span className="topic-indicators">
            {data.note && <button type="button" className="nodrag" title="Có ghi chú — mở ghi chú" onClick={(event) => { event.stopPropagation(); data.onOpenNote?.(id); }}><StickyNote /></button>}
            {data.link && <a className="nodrag" href={data.link} target="_blank" rel="noreferrer" title={data.link} onClick={(event) => event.stopPropagation()}><Link2 /></a>}
          </span>
        )}
      </div>
      {hasBadges && (
        <div className="topic-badges">
          {data.labels?.map((label) => <span key={label} className="topic-tag">{label}</span>)}
          {data.dueDate && <span className="topic-date"><CalendarDays />{formatDate(data.dueDate)}</span>}
        </div>
      )}
      {data.progress !== null && data.progress !== undefined && (
        <div className="topic-progress" title={`${data.progress}% hoàn thành`}><i style={{ width: `${data.progress}%` }} /></div>
      )}
      {data.aiGenerated && data.note && <div className="topic-ai-note nowheel">{data.note}</div>}
      {data.childCount > 0 && (
        <button
          type="button"
          className={`topic-collapse nodrag ${data.collapsed ? "is-collapsed" : ""}`}
          aria-label={data.collapsed ? `Mở ${data.childCount} topic con` : "Thu gọn nhánh"}
          title={data.collapsed ? `Mở ${data.childCount} topic con` : "Thu gọn nhánh"}
          onClick={(event) => { event.stopPropagation(); data.onUpdate?.({ collapsed: !data.collapsed }); }}
        >
          {data.collapsed ? data.childCount : "−"}
        </button>
      )}
    </div>
  );
});

TopicNode.displayName = "TopicNode";
export default TopicNode;
