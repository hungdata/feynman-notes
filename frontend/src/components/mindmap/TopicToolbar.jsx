import { NodeToolbar, Position } from "@xyflow/react";
import {
  ArrowDownAZ, ArrowUpAZ, BadgeCheck, CalendarDays, ClipboardPaste, Copy, Ellipsis, EyeOff, Focus, GraduationCap,
  ImagePlus, Lightbulb, Lock, LockOpen, MessagesSquare, Paintbrush, Plus, RotateCw, Rows3, Smile, Spline,
  SquareCheck, SquareDashed, StickyNote, Trash2, Unlink,
} from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "./ui";

/** Small toolbar above the selected topic, like SimpleMind's topic toolbar. */
const TopicToolbar = ({ node, actions }) => {
  if (!node) return null;
  const isImage = node.type === "image";
  const data = node.data;
  const button = (Icon, label, onClick, active = false) => (
    <button type="button" className={active ? "is-active" : ""} title={label} aria-label={label} onClick={onClick}><Icon /></button>
  );
  return (
    <NodeToolbar nodeId={node.id} isVisible position={Position.Top} offset={14} className="topic-toolbar">
      {button(Plus, "Thêm topic con (Tab)", () => actions.addChild(node.id))}
      {!isImage && data.parentId && button(Rows3, "Thêm topic cùng cấp (Enter)", actions.addSibling)}
      <span className="sep" />
      {!isImage && button(StickyNote, "Ghi chú (⌘1)", () => actions.openTab("note", true), Boolean(data.note))}
      {!isImage && button(Smile, "Icon (⌘4)", () => actions.openTab("icons"), Boolean(data.icon || data.emoji))}
      {isImage && button(ImagePlus, "Thay ảnh", () => actions.chooseImage(node.id, "replace"))}
      {button(Paintbrush, "Kiểu (⌘2)", () => actions.openTab("style"))}
      {!isImage && (
        <Menu width={230} trigger={({ toggle, open }) => <button type="button" className={`is-ai ${open ? "is-active" : ""}`} title="AI Teacher" aria-label="AI Teacher" onClick={toggle}><GraduationCap /></button>}>
          {(close) => (
            <>
              <MenuLabel>AI Teacher cho topic này</MenuLabel>
              <MenuItem icon={Lightbulb} label="Giải thích theo Feynman" close={close} onSelect={() => actions.aiAction(node.id, "explain")} />
              <MenuItem icon={MessagesSquare} label="Tranh luận / phản biện" close={close} onSelect={() => actions.aiAction(node.id, "debate")} />
              <MenuItem icon={BadgeCheck} label="Kiểm tra đúng – sai" close={close} onSelect={() => actions.aiAction(node.id, "verify")} />
              <MenuSeparator />
              <MenuItem icon={GraduationCap} label="Mở trò chuyện với AI (⌘6)" close={close} onSelect={() => actions.openTab("ai")} />
            </>
          )}
        </Menu>
      )}
      <Menu width={236} align="end" trigger={({ toggle, open }) => <button type="button" className={open ? "is-active" : ""} title="Thêm" aria-label="Thêm tùy chọn" onClick={toggle}><Ellipsis /></button>}>
        {(close) => (
          <>
            {!isImage && <MenuItem icon={SquareCheck} label={data.checkbox ? "Bỏ ô đánh dấu" : "Thêm ô đánh dấu"} close={close} onSelect={() => actions.edit([node.id], { checkbox: !data.checkbox, ...(data.checkbox ? { checked: false } : {}) })} />}
            {!isImage && <MenuItem icon={CalendarDays} label={data.dueDate ? "Sửa ngày" : "Thêm ngày"} close={close} onSelect={() => actions.openTab("note", false, "date")} />}
            {!isImage && <MenuItem icon={ImagePlus} label={data.imageAssetId ? "Thay ảnh trong topic" : "Thêm ảnh vào topic"} close={close} onSelect={() => actions.chooseImage(node.id, "attach")} />}
            <MenuItem icon={Spline} label="Liên kết chéo…" hint="⌘L" close={close} onSelect={() => actions.startCrossLink(node.id)} />
            <MenuSeparator />
            <MenuItem icon={Focus} label="Tập trung vào nhánh" close={close} onSelect={() => actions.focusBranch(node.id)} />
            {!isImage && <MenuItem icon={EyeOff} label="Ẩn nhánh" close={close} onSelect={() => actions.edit([node.id], { hidden: true })} />}
            <MenuItem icon={ArrowDownAZ} label="Sắp xếp con A → Z" close={close} onSelect={() => actions.sortChildren(node.id, "asc")} />
            <MenuItem icon={ArrowUpAZ} label="Sắp xếp con Z → A" close={close} onSelect={() => actions.sortChildren(node.id, "desc")} />
            {!isImage && <MenuItem icon={SquareDashed} label={data.branchBorder ? "Bỏ viền nhánh" : "Viền bao nhánh"} close={close} onSelect={() => actions.edit([node.id], { branchBorder: !data.branchBorder })} />}
            {isImage && <MenuItem icon={RotateCw} label="Xoay 90°" close={close} onSelect={() => actions.updateImage(node.id, { rotation: (data.rotation || 0) + 90 })} />}
            {isImage && <MenuItem icon={data.locked ? LockOpen : Lock} label={data.locked ? "Mở khóa" : "Khóa vị trí"} close={close} onSelect={() => actions.updateImage(node.id, { locked: !data.locked })} />}
            {!isImage && data.imageAssetId && <MenuItem icon={Unlink} label="Gỡ ảnh khỏi topic" close={close} onSelect={() => actions.edit([node.id], { imageAssetId: null })} />}
            <MenuSeparator />
            {!isImage && <MenuItem icon={Copy} label="Sao chép kiểu" close={close} onSelect={() => actions.copyStyle(node.id)} />}
            {!isImage && <MenuItem icon={ClipboardPaste} label="Dán kiểu" close={close} onSelect={() => actions.pasteStyle([node.id])} />}
            <MenuItem icon={Copy} label="Nhân bản nhánh" hint="⌘D" close={close} onSelect={() => actions.duplicate(node.id)} />
            <MenuSeparator />
            {data.parentId && !isImage && <MenuItem icon={Trash2} label="Xóa topic, giữ topic con" hint="⇧⌫" danger close={close} onSelect={() => actions.deleteNodes([node.id], { keepChildren: true })} />}
            {(data.parentId || isImage) && <MenuItem icon={Trash2} label="Xóa cả nhánh" hint="⌫" danger close={close} onSelect={() => actions.deleteNodes([node.id])} />}
          </>
        )}
      </Menu>
    </NodeToolbar>
  );
};

export default TopicToolbar;
