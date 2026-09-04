export class TeacherApiError extends Error {
  constructor(message, { status = 500, code = null, retryAt = null } = {}) {
    super(message);
    this.name = "TeacherApiError";
    this.status = status;
    this.code = code;
    this.retryAt = retryAt;
  }
}

const request = async (url, options = {}) => {
  const response = await fetch(url, { credentials: "include", ...options });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new TeacherApiError(payload?.message || "AI Teacher hiện không thể phản hồi.", {
      status: response.status,
      code: payload?.code || null,
      retryAt: payload?.retryAt || null,
    });
  }
  return payload;
};

export const fetchTeacherStatus = () => request("/api/ai/status");

export const fetchTeacherConversations = (documentId) =>
  request(`/api/ai/conversations?documentId=${encodeURIComponent(documentId)}`);

export const fetchTeacherMessages = (conversationId) =>
  request(`/api/ai/conversations/${encodeURIComponent(conversationId)}/messages`);

export const sendTeacherMessage = (input) =>
  request("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
