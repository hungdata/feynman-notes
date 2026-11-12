import { useMemo, useState } from "react";
import { FilePlus2, Keyboard, WandSparkles } from "lucide-react";
import { TEMPLATES } from "@/mindmap/constants";
import { parseTextOutline } from "@/mindmap/formats";
import { getStyleSheet } from "@/mindmap/styles";
import { StyleSheetPreview } from "./previews";
import { Dialog, Kbd } from "./ui";

export const TemplateDialog = ({ onCreate, onClose }) => (
  <Dialog title="Mind map mới" subtitle="Chọn một mẫu để bắt đầu nhanh. Có thể đổi style sheet và bố cục bất cứ lúc nào." icon={FilePlus2} onClose={onClose} width={760}>
    <div className="template-grid">
      {TEMPLATES.map((template) => (
        <button key={template.id} type="button" className="template-card" onClick={() => onCreate(template.id)}>
          <StyleSheetPreview sheetId={template.styleSheet || "default"} />
          <span className="template-text">
            <strong><span aria-hidden="true">{template.emoji}</span> {template.name}</strong>
            <small>{template.description}</small>
            <em>{getStyleSheet(template.styleSheet || "default").name}</em>
          </span>
        </button>
      ))}
    </div>
  </Dialog>
);

const countTree = (tree) => tree.reduce((total, item) => total + 1 + countTree(item.children || []), 0);

/** Brainstorm mode: type or paste many ideas at once, one per line. */
export const BrainstormDialog = ({ parentLabel, onAdd, onClose }) => {
  const [text, setText] = useState("");
  const tree = useMemo(() => parseTextOutline(text), [text]);
  const count = countTree(tree);
  const submit = () => { if (count) { onAdd(tree); onClose(); } };
  return (
    <Dialog
      title="Brainstorm"
      subtitle={<>Mỗi dòng là một ý mới dưới <strong>“{parentLabel || "chủ đề trung tâm"}”</strong>. Thụt đầu dòng (Tab hoặc 2 dấu cách) để tạo ý con.</>}
      icon={WandSparkles}
      onClose={onClose}
      width={620}
      footer={(
        <>
          <span className="dialog-footer-hint"><Kbd>⌘</Kbd> + <Kbd>Enter</Kbd> để thêm</span>
          <button type="button" className="btn-ghost" onClick={onClose}>Hủy</button>
          <button type="button" className="btn-primary" disabled={!count} onClick={submit}>Thêm {count || ""} topic</button>
        </>
      )}
    >
      <textarea
        className="brainstorm-input"
        autoFocus
        rows={12}
        value={text}
        placeholder={"Ý tưởng 1\n  Chi tiết của ý 1\nÝ tưởng 2\n- [ ] Việc cần làm\n# Có thể dán cả dàn ý Markdown"}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            const { selectionStart, selectionEnd, value } = event.currentTarget;
            const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
            setText(next);
            requestAnimationFrame(() => event.target.setSelectionRange(selectionStart + 2, selectionStart + 2));
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); }
        }}
      />
    </Dialog>
  );
};

const SHORTCUTS = [
  ["Tạo & sửa", [["Tab", "Thêm topic con"], ["Enter", "Thêm topic cùng cấp"], ["⇧ Enter", "Thêm cùng cấp phía trên"], ["F2 / Space / gõ chữ", "Sửa topic đang chọn"], ["⌘B", "Brainstorm nhiều ý"], ["⌘L", "Liên kết chéo"], ["⌫", "Xóa nhánh"], ["⇧ ⌫", "Xóa topic, giữ topic con"]]],
  ["Di chuyển", [["← ↑ → ↓", "Chọn topic bên cạnh"], ["⌘ ↑ / ⌘ ↓", "Đổi thứ tự topic"], ["⌘ .", "Thu gọn / mở nhánh"], ["Kéo thả topic", "Đổi cha hoặc đổi thứ tự"], ["⇧ + kéo nền", "Chọn nhiều topic"]]],
  ["Chỉnh sửa", [["⌘Z / ⇧⌘Z", "Hoàn tác / Làm lại"], ["⌘C ⌘X ⌘V", "Sao chép, cắt, dán (dán văn bản → nhiều topic)"], ["⌘D", "Nhân bản nhánh"], ["⌘A", "Chọn tất cả"], ["⌘S", "Lưu ngay"]]],
  ["Hiển thị", [["⌘1 … ⌘6", "Ghi chú · Kiểu · Style sheet · Icon · Dàn ý · AI"], ["⌘\\", "Ẩn/hiện thư viện"], ["⌘F hoặc /", "Tìm kiếm"], ["+ / − / ⌘0", "Phóng to, thu nhỏ, vừa màn hình"], ["F5", "Trình chiếu"], ["Esc", "Bỏ chọn / thoát"]]],
];

export const ShortcutsDialog = ({ onClose }) => (
  <Dialog title="Phím tắt & trợ giúp" subtitle="Trên Windows dùng Ctrl thay cho ⌘." icon={Keyboard} onClose={onClose} width={720}>
    <div className="shortcut-grid">
      {SHORTCUTS.map(([group, items]) => (
        <section key={group}>
          <h3>{group}</h3>
          {items.map(([keys, label]) => <div key={keys} className="shortcut-row"><span>{label}</span><kbd className="kbd">{keys}</kbd></div>)}
        </section>
      ))}
    </div>
    <p className="panel-hint">Mẹo: dán một dàn ý (Markdown, danh sách thụt lề) khi đang chọn một topic để biến nó thành các topic con. Kéo ảnh vào canvas để thêm ảnh.</p>
  </Dialog>
);
