import { Copy, Focus, Plus, Rows3, Trash2 } from "lucide-react";

const ContextMenu = ({ x, y, isRoot, onAddChild, onAddSibling, onDuplicate, onFocus, onDelete, onClose }) => (
  <div className="context-backdrop" onPointerDown={onClose}>
    <div className="context-menu" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}>
      <button onClick={onAddChild}><Plus /> Thêm child <kbd>Tab</kbd></button>
      <button onClick={onAddSibling}><Rows3 /> Thêm sibling <kbd>Enter</kbd></button>
      <button onClick={onDuplicate}><Copy /> Nhân bản <kbd>⌘D</kbd></button>
      <button onClick={onFocus}><Focus /> Focus nhánh</button>
      {!isRoot && <button className="danger" onClick={onDelete}><Trash2 /> Xóa <kbd>⌫</kbd></button>}
    </div>
  </div>
);

export default ContextMenu;
