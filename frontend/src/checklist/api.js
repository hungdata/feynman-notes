const BASE = `${import.meta.env.VITE_API_URL || "/api"}/tasks`;

const request = async (url, options = {}) => {
  let response;
  try {
    response = await fetch(url, { credentials: "include", ...options });
  } catch {
    throw new Error("Không kết nối được máy chủ. Backend đã chạy chưa?");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Yêu cầu thất bại (${response.status}).`);
  return payload;
};

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listTasks = async () => (await request(BASE)).tasks ?? [];
export const createTask = (title) => request(BASE, json("POST", { title }));
export const updateTask = (id, updates) => request(`${BASE}/${id}`, json("PUT", updates));
export const removeTask = (id) => request(`${BASE}/${id}`, { method: "DELETE" });
