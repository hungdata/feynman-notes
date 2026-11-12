export class MindMapApiError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.name = "MindMapApiError";
    this.status = status;
    this.code = code;
  }
}

const request = async (url, options = {}) => {
  let response;
  try {
    response = await fetch(url, { credentials: "include", ...options });
  } catch {
    throw new MindMapApiError("Không kết nối được máy chủ. Kiểm tra backend đang chạy.", 0, "NETWORK");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new MindMapApiError(payload?.message || `Yêu cầu thất bại (${response.status}).`, response.status, payload?.code || "");
  return payload;
};

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const path = (id, suffix = "") => `/api/mindmaps/${encodeURIComponent(id)}${suffix}`;

export const fetchMindMaps = () => request("/api/mindmaps");
export const saveMindMap = (document) => request(path(document.id), json("PUT", { document }));
export const trashMindMap = (id) => request(path(id), { method: "DELETE" });
export const restoreMindMap = (id) => request(path(id, "/restore"), { method: "POST" });
export const removeMindMap = (id) => request(path(id, "?permanent=true"), { method: "DELETE" });
export const patchMindMap = (id, updates) => request(path(id), json("PATCH", updates));
