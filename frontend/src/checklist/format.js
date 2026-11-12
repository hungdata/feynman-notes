/** Date helpers for the checklist (pure). */

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const whenLabel = (iso, now = new Date()) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(date, now)) return `Hôm nay, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Hôm qua, ${time}`;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
};

export const todayTitle = (now = new Date()) => {
  const text = now.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });
  return text.charAt(0).toLocaleUpperCase("vi") + text.slice(1);
};

/** Keeps tasks created inside [from, to] (YYYY-MM-DD strings, both optional). */
export const inDateRange = (task, { from, to }) => {
  if (!from && !to) return true;
  const created = new Date(task.createdAt);
  if (Number.isNaN(created.getTime())) return false;
  if (from && created < new Date(`${from}T00:00:00`)) return false;
  if (to && created > new Date(`${to}T23:59:59.999`)) return false;
  return true;
};
