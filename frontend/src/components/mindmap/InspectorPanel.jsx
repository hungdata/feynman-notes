import { X } from "lucide-react";
import { INSPECTOR_TABS } from "./inspectorTabs";
import Inspector from "./Inspector";
import MapInspector from "./MapInspector";
import ImageInspector from "./ImageInspector";
import RelationInspector from "./RelationInspector";
import NoteTab from "./NoteTab";
import StyleSheetTab from "./StyleSheetTab";
import IconTab from "./IconTab";
import OutlinePanel from "./OutlinePanel";
import TeacherPanel from "./TeacherPanel";


const titleFor = (tab, selection) => {
  if (tab === "style") {
    if (selection.edge) return selection.edge.data.isCrossLink ? "Kiểu liên kết chéo" : "Kiểu đường nối";
    if (!selection.nodes.length) return "Kiểu mind map";
    return selection.nodes[0].type === "image" ? "Ảnh" : selection.nodes.length > 1 ? `Kiểu ${selection.nodes.length} topic` : "Kiểu topic";
  }
  return INSPECTOR_TABS.find((item) => item.id === tab)?.label || "";
};

const InspectorPanel = ({ tab, onTabChange, onClose, map, selection, actions }) => {
  const [firstNode] = selection.nodes;
  let content = null;
  if (tab === "note") content = <NoteTab map={map} selection={selection} edit={actions.edit} noteRef={actions.noteRef} />;
  if (tab === "style") {
    if (selection.edge) {
      content = <RelationInspector edge={selection.edge} onUpdate={(updates) => map.updateRelation(selection.edge.id, updates)} onClearPath={() => map.updateRelation(selection.edge.id, { controlPoint: null })} onDelete={() => actions.deleteEdge(selection.edge)} />;
    } else if (firstNode?.type === "image") {
      content = <ImageInspector node={firstNode} onUpdate={(updates, styles) => actions.updateImage(firstNode.id, updates, styles)} onAddChild={() => actions.addChild(firstNode.id)} onDuplicate={() => actions.duplicate(firstNode.id)} onDelete={() => actions.deleteNodes([firstNode.id])} onReplace={() => actions.chooseImage(firstNode.id, "replace")} />;
    } else if (selection.nodes.length) {
      content = <Inspector map={map} nodes={selection.nodes.filter((node) => node.type === "topic")} edit={actions.edit} onCopyStyle={() => actions.copyStyle(firstNode.id)} onPasteStyle={() => actions.pasteStyle(selection.nodes.map((node) => node.id))} />;
    } else {
      content = <MapInspector map={map} onArrange={actions.arrange} onOpenSheets={() => onTabChange("sheets")} />;
    }
  }
  if (tab === "sheets") content = <StyleSheetTab current={map.document.settings.styleSheet} onApply={actions.applySheet} />;
  if (tab === "icons") content = <IconTab selection={selection} onApply={actions.edit} />;
  if (tab === "outline") {
    content = <OutlinePanel nodes={actions.outlineNodes} numbers={actions.numbers} selectedId={firstNode?.id} onSelect={actions.focusNode} onCheck={(id, checked) => actions.edit([id], { checked, checkbox: true })} onRename={(id, label) => actions.edit([id], { label })} onReparent={(source, target) => actions.reparent(source, target)} onToggle={(id, collapsed) => actions.edit([id], { collapsed })} />;
  }
  if (tab === "ai") {
    content = <TeacherPanel key={map.document.id} documentId={map.document.id} selectedNode={firstNode || null} quickActionRequest={actions.teacherQuickAction} onQuickActionComplete={actions.saveTeacherNote} onClose={onClose} embedded />;
  }

  return (
    <aside className={`inspector-panel tab-${tab}`} aria-label="Bảng thuộc tính">
      <div className="inspector-tabs" role="tablist">
        {INSPECTOR_TABS.map((item, index) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} title={`${item.label} (⌘${index + 1})`} onClick={() => onTabChange(item.id)}>
            <item.icon /><span>{item.label}</span>
          </button>
        ))}
      </div>
      {tab !== "ai" && (
        <header className="inspector-head">
          <h2>{titleFor(tab, selection)}</h2>
          <button type="button" className="icon-btn is-small" onClick={onClose} aria-label="Đóng bảng thuộc tính"><X /></button>
        </header>
      )}
      <div className={`inspector-body ${tab === "ai" ? "is-flush" : ""}`}>{content}</div>
    </aside>
  );
};

export default InspectorPanel;
