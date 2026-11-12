import { useRef } from "react";
import {
  ArrowDownAZ, ClipboardPaste, Copy, CopyPlus, Crosshair, Focus, ImagePlus, Maximize2, Paintbrush, Pencil, Plus,
  Rows3, Scissors, Spline, StickyNote, Trash2, WandSparkles,
} from "lucide-react";
import { useDismiss } from "@/hooks/useDismiss";
import { MenuItem, MenuSeparator } from "./ui";

/** Right-click menu for a topic or for the empty canvas. */
const ContextMenu = ({ x, y, node, actions, onClose }) => {
  const ref = useRef(null);
  useDismiss(true, onClose, ref);
  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - (node ? 470 : 260));
  return (
    <div className="menu-popover context-menu" ref={ref} style={{ left, top: Math.max(8, top), width: 236 }} role="menu" onContextMenu={(event) => event.preventDefault()}>
      {node ? (
        <>
          <MenuItem icon={Plus} label="Thêm topic con" hint="Tab" close={onClose} onSelect={() => actions.addChild(node.id)} />
          {node.data.parentId && <MenuItem icon={Rows3} label="Thêm topic cùng cấp" hint="Enter" close={onClose} onSelect={actions.addSibling} />}
          {node.type === "topic" && <MenuItem icon={Pencil} label="Sửa chữ" hint="F2" close={onClose} onSelect={() => actions.startEditing(node.id)} />}
          {node.type === "topic" && <MenuItem icon={StickyNote} label="Ghi chú" close={onClose} onSelect={() => actions.openTab("note", true)} />}
          <MenuItem icon={Paintbrush} label="Kiểu…" close={onClose} onSelect={() => actions.openTab("style")} />
          <MenuItem icon={Spline} label="Liên kết chéo…" hint="⌘L" close={onClose} onSelect={() => actions.startCrossLink(node.id)} />
          <MenuItem icon={Focus} label="Tập trung vào nhánh" close={onClose} onSelect={() => actions.focusBranch(node.id)} />
          <MenuItem icon={ArrowDownAZ} label="Sắp xếp con A → Z" close={onClose} onSelect={() => actions.sortChildren(node.id, "asc")} />
          <MenuSeparator />
          <MenuItem icon={Scissors} label="Cắt" hint="⌘X" close={onClose} onSelect={actions.cut} />
          <MenuItem icon={Copy} label="Sao chép" hint="⌘C" close={onClose} onSelect={actions.copy} />
          <MenuItem icon={ClipboardPaste} label="Dán làm topic con" hint="⌘V" close={onClose} onSelect={actions.paste} />
          <MenuItem icon={CopyPlus} label="Nhân bản" hint="⌘D" close={onClose} onSelect={() => actions.duplicate(node.id)} />
          {(node.data.parentId || node.type === "image") && <><MenuSeparator /><MenuItem icon={Trash2} label="Xóa" hint="⌫" danger close={onClose} onSelect={() => actions.deleteNodes([node.id])} /></>}
        </>
      ) : (
        <>
          <MenuItem icon={Crosshair} label="Thêm chủ đề trung tâm ở đây" close={onClose} onSelect={() => actions.addRootAt(x, y)} />
          <MenuItem icon={ImagePlus} label="Thêm ảnh" close={onClose} onSelect={() => actions.chooseImage(null, "connect")} />
          <MenuItem icon={WandSparkles} label="Brainstorm…" hint="⌘B" close={onClose} onSelect={actions.openBrainstorm} />
          <MenuItem icon={ClipboardPaste} label="Dán" hint="⌘V" close={onClose} onSelect={actions.paste} />
          <MenuSeparator />
          <MenuItem icon={Maximize2} label="Vừa màn hình" hint="⌘0" close={onClose} onSelect={actions.fit} />
          <MenuItem icon={Paintbrush} label="Kiểu mind map…" close={onClose} onSelect={() => actions.openTab("style")} />
        </>
      )}
    </div>
  );
};

export default ContextMenu;
