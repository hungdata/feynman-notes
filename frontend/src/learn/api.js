export class LearnApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "LearnApiError";
    this.status = status;
  }
}

const request = async (url, options = {}) => {
  let response;
  try {
    response = await fetch(url, { credentials: "include", ...options });
  } catch {
    throw new LearnApiError("Không kết nối được máy chủ. Backend đã chạy chưa?");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new LearnApiError(payload?.message || `Yêu cầu thất bại (${response.status}).`, response.status);
  return payload;
};

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
const base = (id = "") => `/api/courses${id ? `/${encodeURIComponent(id)}` : ""}`;

/** Local calendar day (YYYY-MM-DD) so streaks follow the learner's own midnight. */
export const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const fetchCourses = () => request(`${base()}?day=${today()}`);
export const fetchCourse = (id) => request(base(id));
export const deleteCourse = (id) => request(base(id), { method: "DELETE" });
export const renameCourse = (id, title) => request(base(id), json("PATCH", { title }));
export const retryCourse = (id, stageId) => request(`${base(id)}/retry`, json("POST", stageId ? { stageId } : {}));
export const completeLesson = (id, lessonId, stats) => request(`${base(id)}/lessons/${encodeURIComponent(lessonId)}/complete`, json("POST", { ...stats, day: today() }));
export const gradeExplanation = (id, payload) => request(`${base(id)}/grade`, json("POST", payload));
export const reportStep = (id, payload) => request(`${base(id)}/report`, json("POST", payload));
export const createMindMap = (id) => request(`${base(id)}/mindmap`, { method: "POST" });

/** Uploads a PDF with progress callbacks (fetch has no upload progress). */
export const uploadBook = (file, { language = "vi", title = "", school = "general" } = {}, onProgress) => new Promise((resolve, reject) => {
  const form = new FormData();
  form.append("pdf", file);
  form.append("language", language);
  if (title) form.append("title", title);
  form.append("school", school);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", base());
  xhr.withCredentials = true;
  xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded / event.total); };
  xhr.onload = () => {
    let payload = null;
    try { payload = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
    if (xhr.status >= 200 && xhr.status < 300) resolve(payload);
    else reject(new LearnApiError(payload?.message || `Tải lên thất bại (${xhr.status}).`, xhr.status));
  };
  xhr.onerror = () => reject(new LearnApiError("Mất kết nối khi tải sách lên."));
  xhr.send(form);
});
