import {
  Activity, AlarmClock, Apple, Atom, Award, BadgeCheck, Ban, Bell, Bike, Book, BookOpen, Bookmark, Bot, Brain,
  Briefcase, Bug, Building2, Calculator, CalendarDays, Camera, ChartBar, ChartLine, ChartPie, CircleAlert,
  CircleCheck, CircleHelp, CircleX, Clock, Cloud, Code, Coffee, Compass, Cpu, Crown, Database, DollarSign, Dumbbell,
  Eye, Factory, FileText, Flag, FlaskConical, Flame, Flower2, Gem, Gift, Globe, GraduationCap, Handshake, Heart,
  HeartPulse, Hourglass, House, Image, Info, Key, Landmark, Languages, Leaf, Lightbulb, Link, ListTodo, Lock, Mail,
  Map, MapPin, Medal, Megaphone, MessageCircle, Microscope, Milestone, Moon, Mountain, Music, Network, Newspaper,
  Package, Palette, PartyPopper, Pencil, Phone, PiggyBank, Pill, Pin, Plane, Presentation, Puzzle, Quote, Rocket,
  Scale, School, Search, Server, Settings, Shield, ShoppingCart, Smartphone, Smile, Frown, Sparkles, Star,
  Stethoscope, StickyNote, Sun, Target, ThumbsDown, ThumbsUp, Timer, TreePine, TrendingDown, TrendingUp,
  TriangleAlert, Trophy, Truck, User, Users, Video, Wallet, Wrench, Zap,
} from "lucide-react";

const icon = (id, Component, label, color) => ({ id, Component, label, color });

/** Icon library (like SimpleMind's stock icons), grouped for the Icon panel. */
export const ICON_GROUPS = [
  {
    name: "Đánh dấu",
    icons: [
      icon("star", Star, "Sao", "#f59e0b"), icon("flag", Flag, "Cờ", "#ef4444"), icon("check", CircleCheck, "Xong", "#16a34a"),
      icon("x", CircleX, "Hủy", "#dc2626"), icon("question", CircleHelp, "Câu hỏi", "#2563eb"), icon("alert", TriangleAlert, "Cảnh báo", "#f97316"),
      icon("info", Info, "Thông tin", "#0ea5e9"), icon("important", CircleAlert, "Quan trọng", "#e11d48"), icon("idea", Lightbulb, "Ý tưởng", "#eab308"),
      icon("heart", Heart, "Yêu thích", "#ec4899"), icon("pin", Pin, "Ghim", "#db2777"), icon("bookmark", Bookmark, "Đánh dấu", "#7c3aed"),
      icon("thumbs-up", ThumbsUp, "Đồng ý", "#16a34a"), icon("thumbs-down", ThumbsDown, "Không đồng ý", "#dc2626"), icon("ban", Ban, "Cấm", "#b91c1c"),
      icon("verified", BadgeCheck, "Đã kiểm chứng", "#0d9488"), icon("sparkles", Sparkles, "Nổi bật", "#a855f7"), icon("fire", Flame, "Gấp", "#ea580c"),
    ],
  },
  {
    name: "Công việc",
    icons: [
      icon("target", Target, "Mục tiêu", "#dc2626"), icon("rocket", Rocket, "Khởi động", "#7c3aed"), icon("todo", ListTodo, "Việc cần làm", "#2563eb"),
      icon("calendar", CalendarDays, "Lịch", "#0891b2"), icon("clock", Clock, "Thời gian", "#475569"), icon("timer", Timer, "Hẹn giờ", "#f97316"),
      icon("alarm", AlarmClock, "Nhắc nhở", "#e11d48"), icon("hourglass", Hourglass, "Đang chờ", "#a16207"), icon("milestone", Milestone, "Cột mốc", "#4f46e5"),
      icon("briefcase", Briefcase, "Công việc", "#92400e"), icon("users", Users, "Nhóm", "#2563eb"), icon("user", User, "Người", "#0f766e"),
      icon("handshake", Handshake, "Hợp tác", "#ca8a04"), icon("megaphone", Megaphone, "Thông báo", "#db2777"), icon("presentation", Presentation, "Trình bày", "#0284c7"),
      icon("trophy", Trophy, "Thành tích", "#d97706"), icon("medal", Medal, "Huy chương", "#ca8a04"), icon("award", Award, "Giải thưởng", "#9333ea"),
      icon("crown", Crown, "Ưu tiên", "#eab308"), icon("bell", Bell, "Chuông", "#f59e0b"), icon("lock", Lock, "Bảo mật", "#475569"),
      icon("key", Key, "Chìa khóa", "#a16207"), icon("settings", Settings, "Cài đặt", "#64748b"), icon("wrench", Wrench, "Sửa chữa", "#57534e"),
    ],
  },
  {
    name: "Học tập",
    icons: [
      icon("graduation", GraduationCap, "Học tập", "#1d4ed8"), icon("book", BookOpen, "Sách", "#7c2d12"), icon("notebook", Book, "Vở", "#0f766e"),
      icon("brain", Brain, "Tư duy", "#db2777"), icon("puzzle", Puzzle, "Vấn đề", "#16a34a"), icon("atom", Atom, "Khoa học", "#0891b2"),
      icon("flask", FlaskConical, "Thí nghiệm", "#9333ea"), icon("microscope", Microscope, "Nghiên cứu", "#0d9488"), icon("calculator", Calculator, "Tính toán", "#475569"),
      icon("languages", Languages, "Ngôn ngữ", "#2563eb"), icon("quote", Quote, "Trích dẫn", "#64748b"), icon("note", StickyNote, "Ghi chú", "#eab308"),
      icon("school", School, "Trường học", "#b45309"), icon("search", Search, "Tìm hiểu", "#334155"), icon("eye", Eye, "Quan sát", "#0369a1"),
      icon("message", MessageCircle, "Thảo luận", "#16a34a"), icon("pencil", Pencil, "Viết", "#ea580c"), icon("file", FileText, "Tài liệu", "#475569"),
    ],
  },
  {
    name: "Kinh doanh & dữ liệu",
    icons: [
      icon("money", DollarSign, "Tiền", "#16a34a"), icon("wallet", Wallet, "Ví", "#92400e"), icon("piggy", PiggyBank, "Tiết kiệm", "#ec4899"),
      icon("trend-up", TrendingUp, "Tăng", "#16a34a"), icon("trend-down", TrendingDown, "Giảm", "#dc2626"), icon("chart", ChartLine, "Biểu đồ", "#2563eb"),
      icon("bar", ChartBar, "Cột", "#7c3aed"), icon("pie", ChartPie, "Tỷ lệ", "#f97316"), icon("cart", ShoppingCart, "Mua sắm", "#0891b2"),
      icon("package", Package, "Sản phẩm", "#a16207"), icon("truck", Truck, "Vận chuyển", "#475569"), icon("building", Building2, "Công ty", "#334155"),
      icon("factory", Factory, "Sản xuất", "#57534e"), icon("bank", Landmark, "Ngân hàng", "#1e3a8a"), icon("scale", Scale, "Cân nhắc", "#64748b"),
      icon("shield", Shield, "An toàn", "#0f766e"), icon("gem", Gem, "Giá trị", "#0ea5e9"), icon("gift", Gift, "Quà tặng", "#e11d48"),
    ],
  },
  {
    name: "Công nghệ",
    icons: [
      icon("code", Code, "Code", "#334155"), icon("bug", Bug, "Lỗi", "#dc2626"), icon("bot", Bot, "AI", "#7c3aed"),
      icon("cpu", Cpu, "Chip", "#0f766e"), icon("server", Server, "Server", "#475569"), icon("database", Database, "Dữ liệu", "#2563eb"),
      icon("cloud", Cloud, "Đám mây", "#0ea5e9"), icon("network", Network, "Mạng", "#4f46e5"), icon("phone-app", Smartphone, "Điện thoại", "#334155"),
      icon("globe", Globe, "Web", "#0284c7"), icon("link", Link, "Liên kết", "#2563eb"), icon("zap", Zap, "Nhanh", "#eab308"),
      icon("image", Image, "Hình ảnh", "#db2777"), icon("video", Video, "Video", "#dc2626"), icon("camera", Camera, "Máy ảnh", "#475569"),
      icon("mail", Mail, "Email", "#0369a1"), icon("call", Phone, "Gọi", "#16a34a"), icon("music", Music, "Âm nhạc", "#9333ea"),
    ],
  },
  {
    name: "Đời sống",
    icons: [
      icon("home", House, "Nhà", "#b45309"), icon("map", Map, "Bản đồ", "#0d9488"), icon("location", MapPin, "Địa điểm", "#dc2626"),
      icon("plane", Plane, "Du lịch", "#0284c7"), icon("bike", Bike, "Xe đạp", "#16a34a"), icon("compass", Compass, "Định hướng", "#475569"),
      icon("coffee", Coffee, "Cà phê", "#78350f"), icon("apple", Apple, "Ăn uống", "#dc2626"), icon("dumbbell", Dumbbell, "Thể thao", "#334155"),
      icon("health", HeartPulse, "Sức khỏe", "#e11d48"), icon("pill", Pill, "Thuốc", "#0ea5e9"), icon("doctor", Stethoscope, "Khám bệnh", "#0f766e"),
      icon("activity", Activity, "Hoạt động", "#ea580c"), icon("sun", Sun, "Ban ngày", "#f59e0b"), icon("moon", Moon, "Ban đêm", "#4338ca"),
      icon("leaf", Leaf, "Thiên nhiên", "#16a34a"), icon("tree", TreePine, "Cây", "#15803d"), icon("flower", Flower2, "Hoa", "#db2777"),
      icon("mountain", Mountain, "Núi", "#57534e"), icon("party", PartyPopper, "Sự kiện", "#d946ef"), icon("palette", Palette, "Nghệ thuật", "#f97316"),
      icon("news", Newspaper, "Tin tức", "#334155"), icon("smile", Smile, "Vui", "#eab308"), icon("sad", Frown, "Buồn", "#64748b"),
    ],
  },
];

export const ICON_BY_ID = new globalThis.Map(ICON_GROUPS.flatMap((group) => group.icons).map((item) => [item.id, item]));

export const PRIORITY_ICONS = ["1", "2", "3", "4", "5"].map((value) => ({ id: `priority-${value}`, label: `Ưu tiên ${value}`, value }));
export const PROGRESS_ICONS = [0, 25, 50, 75, 100].map((value) => ({ id: `progress-${value}`, label: `${value}%`, value }));

export const EMOJIS = ["💡", "⭐", "✅", "❌", "❓", "❗", "🔥", "🎯", "🚀", "📌", "📚", "🧠", "💬", "📝", "📅", "⏰", "💰", "📈", "🏆", "❤️", "😀", "🤔", "👍", "👎", "🎓", "🔬", "🧪", "⚙️", "🔒", "🌱", "🌍", "✈️", "🏠", "🍎", "☕", "🎨", "🎵", "📷", "🧩", "⚡"];
