import { Gamepad2, Goal, Landmark, Languages, School, Trophy } from "lucide-react";

/** Areas of the long campus page, top to bottom (ids are the section anchors). */
export const ZONES = [
  { id: "khu-hoc", label: "Khu học chính", icon: School },
  { id: "san-bong-da", label: "Sân bóng đá", icon: Goal },
  { id: "san-bong-ro", label: "Sân bóng rổ", icon: Trophy },
  { id: "giai-tri", label: "Nhà giải trí", icon: Gamepad2 },
  { id: "ngoai-ngu", label: "Khu ngoại ngữ", icon: Languages },
  { id: "tai-vu", label: "Phòng tài vụ", icon: Landmark },
];
