import { GraduationCap, ListTree, Paintbrush, Palette, Smile, StickyNote } from "lucide-react";

/** Inspector tabs, in ⌘1…⌘6 order (like SimpleMind's inspector panels). */
export const INSPECTOR_TABS = [
  { id: "note", label: "Ghi chú", icon: StickyNote },
  { id: "style", label: "Kiểu", icon: Paintbrush },
  { id: "sheets", label: "Mẫu", icon: Palette },
  { id: "icons", label: "Icon", icon: Smile },
  { id: "outline", label: "Dàn ý", icon: ListTree },
  { id: "ai", label: "AI", icon: GraduationCap },
];
