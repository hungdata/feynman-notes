import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronDown,
  CircleAlert,
  GraduationCap,
  LoaderCircle,
  MessageCirclePlus,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  fetchTeacherConversations,
  fetchTeacherMessages,
  fetchTeacherStatus,
  sendTeacherMessage,
} from "@/mindmap/teacherApi";

const MODE_OPTIONS = [
  { value: "socratic", label: "Socratic", hint: "Thầy hỏi để bạn tự suy luận" },
  { value: "explain", label: "Giải thích", hint: "Giải thích dễ hiểu theo Feynman" },
  { value: "debate", label: "Tranh luận", hint: "Phản biện luận điểm và giả định" },
  { value: "quiz", label: "Kiểm tra", hint: "Hỏi và chấm từng câu" },
  { value: "review", label: "Ôn tập", hint: "Tìm phần thiếu và cần ôn" },
  { value: "verify", label: "Kiểm chứng note", hint: "Chỉ ra đúng, sai và lập luận chuẩn" },
];

const SCOPE_OPTIONS = [
  { value: "node", label: "Node này" },
  { value: "branch", label: "Cả nhánh" },
  { value: "map", label: "Toàn mind map" },
];

const nodeTitle = (node) =>
  node?.data?.label || node?.data?.caption || node?.data?.note || (node?.type === "image" ? "Ảnh" : "Chưa chọn node");

const formatResetTime = (retryAt) => {
  if (!retryAt) return "ngày mai";
  const date = new Date(retryAt);
  if (Number.isNaN(date.getTime())) return "ngày mai";
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

const QUICK_ACTION_MESSAGES = {
  explain: "Hãy giải thích duy nhất note này theo phương pháp Feynman: làm rõ ý nghĩa, cơ chế hoặc logic từng bước, đưa một ví dụ ngắn và chỉ ra điểm dễ hiểu nhầm.",
  debate: "Hãy tranh luận học thuật về duy nhất note này: xác định luận điểm, nêu phần hợp lý, phản biện mạnh nhất, các giả định hoặc bằng chứng còn thiếu, rồi kết luận quan điểm hợp lý hơn.",
  verify: "Hãy kiểm chứng duy nhất note này: kết luận đúng hay sai, chỉ rõ chỗ sai hoặc thiếu, giải thích lập luận đúng từng bước và đề xuất phiên bản note đã sửa.",
};

const TeacherPanel = ({ documentId, selectedNode, quickActionRequest, onQuickActionComplete, onClose }) => {
  const [mode, setMode] = useState("socratic");
  const [scope, setScope] = useState("node");
  const [conversationId, setConversationId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState({ available: true, retryAt: null });
  const messageEndRef = useRef(null);
  const handledQuickActionRef = useRef("");

  const refreshConversations = useCallback(async () => {
    const result = await fetchTeacherConversations(documentId);
    setConversations(Array.isArray(result?.conversations) ? result.conversations : []);
  }, [documentId]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTeacherStatus(), fetchTeacherConversations(documentId)])
      .then(([status, history]) => {
        if (!active) return;
        setAvailability(status || { available: true, retryAt: null });
        setConversations(Array.isArray(history?.conversations) ? history.conversations : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [documentId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (availability.available || !availability.retryAt) return undefined;
    const delay = new Date(availability.retryAt).getTime() - Date.now() + 1_000;
    if (!Number.isFinite(delay) || delay <= 0) return undefined;
    const timer = window.setTimeout(() => {
      fetchTeacherStatus().then(setAvailability).catch(() => {});
    }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [availability.available, availability.retryAt]);

  const currentMode = useMemo(
    () => MODE_OPTIONS.find((option) => option.value === mode) || MODE_OPTIONS[0],
    [mode]
  );
  const effectiveScope = selectedNode ? scope : "map";

  const openConversation = async (id) => {
    setConversationId(id);
    setError("");
    if (!id) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchTeacherMessages(id);
      setMessages(Array.isArray(result?.messages) ? result.messages : []);
      setMode(result?.conversation?.mode || "socratic");
      setScope(result?.conversation?.scope || "node");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const sendContent = useCallback(async (rawContent, overrides = {}) => {
    const content = rawContent.trim();
    if (!content || sending || !availability.available) return;
    const requestedMode = overrides.mode || mode;
    const requestedScope = overrides.scope || effectiveScope;
    const requestedNode = overrides.node || selectedNode;
    const requestedConversationId = overrides.newConversation ? "" : conversationId;

    if (requestedScope !== "map" && !requestedNode) {
      setError("Hãy chọn một note hoặc ảnh trên mind map trước.");
      return;
    }

    const optimisticUser = { _id: `local-${Date.now()}`, role: "user", content };
    setMessages((current) => [...current, optimisticUser]);
    setInput("");
    setError("");
    setSending(true);

    try {
      const result = await sendTeacherMessage({
        documentId,
        ...(requestedConversationId ? { conversationId: requestedConversationId } : {}),
        message: content,
        mode: requestedMode,
        scope: requestedScope,
        ...(requestedScope !== "map" ? { nodeId: requestedNode.id } : {}),
      });
      const nextConversationId = result?.conversation?._id || requestedConversationId;
      setConversationId(nextConversationId);
      setMessages((current) => [...current, result.message]);
      refreshConversations().catch(() => {});
      if (overrides.saveAsTeacherNote && result?.message?.content) {
        onQuickActionComplete?.({
          sourceNodeId: requestedNode.id,
          content: result.message.content,
          conversationId: nextConversationId,
          mode: requestedMode,
        });
      }
    } catch (requestError) {
      setMessages((current) => current.filter((message) => message._id !== optimisticUser._id));
      setInput(content);
      setError(requestError.message);
      if (requestError.code === "AI_DAILY_QUOTA_EXHAUSTED") {
        setAvailability({ available: false, code: requestError.code, retryAt: requestError.retryAt });
      }
    } finally {
      setSending(false);
    }
  }, [availability.available, conversationId, documentId, effectiveScope, mode, onQuickActionComplete, refreshConversations, selectedNode, sending]);

  const submit = (event) => {
    event?.preventDefault();
    void sendContent(input);
  };

  useEffect(() => {
    if (!quickActionRequest?.requestId || loading || sending || !availability.available) return;
    if (handledQuickActionRef.current === quickActionRequest.requestId) return;
    if (!selectedNode || selectedNode.id !== quickActionRequest.nodeId) return;
    const requestedMode = quickActionRequest.mode;
    const requestedMessage = QUICK_ACTION_MESSAGES[requestedMode];
    if (!requestedMessage) return;

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (handledQuickActionRef.current === quickActionRequest.requestId) return;
      handledQuickActionRef.current = quickActionRequest.requestId;
      setMode(requestedMode);
      setScope("node");
      setConversationId("");
      setMessages([]);
      setError("");
      void sendContent(requestedMessage, {
        mode: requestedMode,
        scope: "node",
        node: selectedNode,
        newConversation: true,
        saveAsTeacherNote: true,
      });
    });
    return () => { active = false; };
  }, [availability.available, loading, quickActionRequest, selectedNode, sendContent, sending]);

  const unavailable = !availability.available;

  return (
    <aside className="teacher-panel" aria-label="AI Teacher">
      <header className="teacher-header">
        <div className="teacher-avatar"><GraduationCap /></div>
        <div><span>FEYNMAN AI</span><strong>Teacher</strong></div>
        <button type="button" onClick={onClose} aria-label="Đóng AI Teacher"><X /></button>
      </header>

      <div className="teacher-settings">
        <label>
          <span>Cuộc trò chuyện</span>
          <div className="teacher-select">
            <MessageCirclePlus />
            <select value={conversationId} onChange={(event) => openConversation(event.target.value)}>
              <option value="">Cuộc trò chuyện mới</option>
              {conversations.map((conversation) => (
                <option key={conversation._id} value={conversation._id}>{conversation.title}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        </label>
        <div className="teacher-setting-row">
          <label><span>Cách dạy</span><select value={mode} onChange={(event) => setMode(event.target.value)}>{MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label><span>Phạm vi</span><select value={effectiveScope} onChange={(event) => setScope(event.target.value)}>{SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value !== "map" && !selectedNode}>{option.label}</option>)}</select></label>
        </div>
        <div className="teacher-context"><Sparkles /><span><small>{currentMode.hint}</small><strong>{effectiveScope === "map" ? "Toàn bộ mind map" : nodeTitle(selectedNode)}</strong></span></div>
      </div>

      {unavailable && (
        <div className="teacher-quota" role="alert">
          <CircleAlert />
          <div><strong>Đã hết lượt miễn phí hôm nay</strong><span>AI Teacher sẽ mở lại lúc {formatResetTime(availability.retryAt)}.</span></div>
        </div>
      )}
      {error && !unavailable && <div className="teacher-error" role="alert"><CircleAlert /> {error}</div>}

      <div className="teacher-messages" aria-live="polite">
        {loading ? (
          <div className="teacher-loading"><LoaderCircle /> Đang tải Teacher…</div>
        ) : messages.length === 0 ? (
          <div className="teacher-empty"><div><Bot /></div><strong>Bắt đầu học từ mind map</strong><p>Chọn một note, sau đó hỏi Teacher giải thích hoặc kiểm tra kiến thức của bạn.</p><button type="button" onClick={() => setInput("Hãy bắt đầu bằng một câu hỏi Socratic về nội dung này.")}>Bắt đầu Socratic</button></div>
        ) : messages.map((message) => (
          <article key={message._id} className={`teacher-message ${message.role}`}>
            <span>{message.role === "assistant" ? <Bot /> : <UserRound />}</span>
            <div><strong>{message.role === "assistant" ? "Teacher" : "Bạn"}</strong><p>{message.content}</p></div>
          </article>
        ))}
        {sending && <div className="teacher-typing"><span /><span /><span /></div>}
        <div ref={messageEndRef} />
      </div>

      <form className="teacher-composer" onSubmit={submit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value.slice(0, 2_000))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
          placeholder={unavailable ? "Đã hết lượt miễn phí hôm nay" : "Hỏi Teacher về nội dung đang chọn…"}
          disabled={unavailable || sending}
          rows={2}
          aria-label="Câu hỏi cho AI Teacher"
        />
        <button type="submit" disabled={!input.trim() || unavailable || sending} aria-label="Gửi câu hỏi">
          {sending ? <LoaderCircle className="spin" /> : <Send />}
        </button>
        <small>{input.length}/2000 · Enter để gửi, Shift + Enter để xuống dòng</small>
      </form>
    </aside>
  );
};

export default TeacherPanel;
