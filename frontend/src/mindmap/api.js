const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "include", ...options });
  if (!response.ok) throw new Error(`Mind map request failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
};

export const fetchMindMaps = () => request("/api/mindmaps");
export const saveMindMap = (document) => request(`/api/mindmaps/${encodeURIComponent(document.id)}`, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ document }),
});
export const removeMindMap = (id) => request(`/api/mindmaps/${encodeURIComponent(id)}`, { method: "DELETE" });
