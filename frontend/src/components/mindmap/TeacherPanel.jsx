import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, CircleAlert, GraduationCap, History, LoaderCircle, RefreshCw, Sparkles, UserRound, X } from "lucide-react";
import { fetchTeacherConversations, fetchTeacherMessages, fetchTeacherStatus, sendTeacherMessage } from "@/mindmap/teacherApi";
import { EXPLANATION_LIMIT, explanationDraftKey, explanationReviewRequest, feedbackBlocks, nodeExplanation } from "@/mindmap/explanationReview";
import IdeaExpansionPanel from "./IdeaExpansionPanel";

const formatResetTime = (retryAt) => {
  if (!retryAt) return "ngày mai";
  const date = new Date(retryAt);
  if (Number.isNaN(date.getTime())) return "ngày mai";
  return date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
};

const TeacherReviewPanel = ({ documentId, selectedNode, quickActionRequest, onQuickActionComplete, onQuickActionHandled, onAddIdeas, onPrepareIdeas, onClose, embedded = false }) => {
  const [conversationId, setConversationId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [expanding, setExpanding] = useState(false);
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState({ available: true, retryAt: null });
  const messageEndRef = useRef(null);
  const handledQuickActionRef = useRef("");
  const handledExpansionActionRef = useRef("");
  const sendingRef = useRef(false);
  const activeRef = useRef(true);
  const historyRequestRef = useRef(0);
  const draftKey = explanationDraftKey(documentId, selectedNode?.id);
  const selectedText = nodeExplanation(selectedNode);
  const input = drafts[draftKey] ?? selectedText;
  const setInput = (value) => setDrafts((current) => ({ ...current, [draftKey]: value }));
  const setExpansionBusy = useCallback((value) => setExpanding(value), []);
  const handleAiError = useCallback((requestError) => {
    if (["AI_DAILY_QUOTA_EXHAUSTED", "AI_TEST_DAILY_LIMIT"].includes(requestError.code)) {
      setAvailability((current) => ({ ...current, available: false, code: requestError.code, retryAt: requestError.retryAt }));
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const result = await fetchTeacherConversations(documentId);
    if (activeRef.current) setConversations(Array.isArray(result?.conversations) ? result.conversations : []);
  }, [documentId]);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTeacherStatus(), fetchTeacherConversations(documentId)])
      .then(([status, history]) => {
        if (!active) return;
        setAvailability(status || { available: true, retryAt: null });
        setConversations(Array.isArray(history?.conversations) ? history.conversations : []);
      })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [documentId]);

  useEffect(() => {
    if (messages.length || sending) messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (availability.available || !availability.retryAt) return undefined;
    const delay = new Date(availability.retryAt).getTime() - Date.now() + 1_000;
    if (!Number.isFinite(delay) || delay <= 0) return undefined;
    const timer = window.setTimeout(() => { fetchTeacherStatus().then(setAvailability).catch(() => {}); }, Math.min(delay, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [availability.available, availability.retryAt]);

  const openConversation = async (id) => {
    const requestId = ++historyRequestRef.current;
    setConversationId(id);
    setError("");
    if (!id) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchTeacherMessages(id);
      if (activeRef.current && requestId === historyRequestRef.current) setMessages(Array.isArray(result?.messages) ? result.messages : []);
    } catch (requestError) {
      if (activeRef.current && requestId === historyRequestRef.current) setError(requestError.message);
    } finally {
      if (activeRef.current && requestId === historyRequestRef.current) setLoading(false);
    }
  };

  const sendContent = useCallback(async (rawContent, { node = selectedNode, saveAsTeacherNote = false } = {}) => {
    const content = rawContent.trim();
    if (!content || sendingRef.current || !availability.available || availability.configured === false) return;
    sendingRef.current = true;
    ++historyRequestRef.current;
    const optimisticUser = { _id: `local-${Date.now()}`, role: "user", content };
    setMessages([optimisticUser]);
    setConversationId("");
    setError("");
    setSending(true);

    try {
      const result = await sendTeacherMessage(explanationReviewRequest({ documentId, explanation: content, node }));
      if (!activeRef.current) return;
      const nextConversationId = result?.conversation?._id || "";
      setConversationId(nextConversationId);
      setMessages([optimisticUser, result.message]);
      refreshConversations().catch(() => {});
      if (saveAsTeacherNote && node?.id && result?.message?.content) {
        onQuickActionComplete?.({ sourceNodeId: node.id, content: result.message.content, conversationId: nextConversationId, mode: "verify" });
      }
    } catch (requestError) {
      if (!activeRef.current) return;
      setMessages([]);
      setError(requestError.message);
      if (["AI_DAILY_QUOTA_EXHAUSTED", "AI_TEST_DAILY_LIMIT"].includes(requestError.code)) {
        setAvailability((current) => ({ ...current, available: false, code: requestError.code, retryAt: requestError.retryAt }));
      }
    } finally {
      sendingRef.current = false;
      if (activeRef.current) setSending(false);
    }
  }, [availability.available, availability.configured, documentId, onQuickActionComplete, refreshConversations, selectedNode]);

  const submit = (event) => {
    event.preventDefault();
    if (!loading && !expanding) void sendContent(input);
  };

  useEffect(() => {
    if (!quickActionRequest?.requestId || (quickActionRequest.documentId && quickActionRequest.documentId !== documentId) || quickActionRequest.mode === "expand" || loading || sending || expanding || !availability.available || availability.configured === false) return;
    if (handledQuickActionRef.current === quickActionRequest.requestId || !selectedNode || selectedNode.id !== quickActionRequest.nodeId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || handledQuickActionRef.current === quickActionRequest.requestId) return;
      handledQuickActionRef.current = quickActionRequest.requestId;
      onQuickActionHandled?.(quickActionRequest.requestId);
      const explanation = nodeExplanation(selectedNode);
      if (!explanation) { setError("Hãy viết lời giải thích vào topic hoặc ghi chú trước."); return; }
      setDrafts((current) => ({ ...current, [explanationDraftKey(documentId, selectedNode.id)]: explanation }));
      void sendContent(explanation, { node: selectedNode, saveAsTeacherNote: true });
    });
    return () => { active = false; };
  }, [availability.available, availability.configured, documentId, expanding, loading, onQuickActionHandled, quickActionRequest, selectedNode, sendContent, sending]);

  const notConfigured = availability.configured === false;
  const unavailable = !availability.available || notConfigured;

  return (
    <aside className={`teacher-panel teacher-review ${embedded ? "is-embedded" : ""}`} aria-label="Nhận xét và phát triển ý bằng AI">
      <header className="teacher-header">
        <div className="teacher-avatar"><GraduationCap /></div>
        <div><span>FEYNMAN AI</span><strong>Nhận xét & phát triển ý</strong></div>
        <button type="button" onClick={onClose} aria-label="Đóng nhận xét AI"><X /></button>
      </header>

      <div className="teacher-review-body">
        <div className="teacher-review-intro"><Sparkles /><p>Giải thích bằng lời của bạn. AI sẽ chỉ ra chỗ đúng, chỗ cần sửa và giải thích vì sao.</p></div>
        <form className="teacher-review-form" onSubmit={submit}>
          <div className="teacher-review-input-label">
            <label htmlFor="teacher-explanation">Lời giải thích của bạn</label>
            {selectedNode && <button type="button" disabled={!selectedText || sending} onClick={() => setInput(selectedText)} title="Lấy lại nội dung topic và ghi chú"><RefreshCw /> Dùng nội dung topic</button>}
          </div>
          {selectedNode && <div className="teacher-review-topic" title={selectedNode.data?.label || selectedNode.data?.caption || ""}>Topic: {selectedNode.data?.label || selectedNode.data?.caption || "Ảnh đang chọn"}</div>}
          <textarea
            id="teacher-explanation"
            value={input}
            onChange={(event) => setInput(event.target.value.slice(0, EXPLANATION_LIMIT))}
            placeholder="Ví dụ: Theo em, học máy là cách máy tính học từ dữ liệu để…"
            disabled={sending}
            rows={5}
            maxLength={EXPLANATION_LIMIT}
          />
          <div className="teacher-review-input-hint"><span>Bạn có thể sửa nội dung trước khi gửi.</span><span>{input.length}/{EXPLANATION_LIMIT}</span></div>
          <button className="teacher-review-submit" type="submit" disabled={!input.trim() || unavailable || sending || expanding || loading}>
            {sending ? <LoaderCircle className="spin" /> : <Sparkles />}
            {sending ? "Đang nhận xét…" : "Nhận xét lời giải thích"}
          </button>
        </form>

        {notConfigured && <div className="teacher-quota is-setup" role="note"><CircleAlert /><div><strong>AI chưa sẵn sàng</strong><span>Bạn vẫn có thể viết lời giải thích và thử lại sau.</span></div></div>}
        {unavailable && !notConfigured && <div className="teacher-quota" role="alert"><CircleAlert /><div><strong>Đã hết lượt thử hôm nay</strong><span>Bạn có thể nhận xét tiếp lúc {formatResetTime(availability.retryAt)}.</span></div></div>}
        {error && !unavailable && <div className="teacher-error" role="alert"><CircleAlert /> {error}</div>}

        <IdeaExpansionPanel
          key={draftKey}
          documentId={documentId}
          nodeId={selectedNode?.type === "topic" ? selectedNode.id : undefined}
          topicTitle={selectedNode?.data?.label || selectedNode?.data?.caption || ""}
          explanation={input}
          quickActionRequest={quickActionRequest}
          quickActionExplanation={selectedText}
          handledActionRef={handledExpansionActionRef}
          onQuickActionHandled={onQuickActionHandled}
          disabled={loading || sending || unavailable}
          onAddIdeas={onAddIdeas}
          onPrepareIdeas={onPrepareIdeas}
          onBusyChange={setExpansionBusy}
          onAiError={handleAiError}
        />

        {conversations.length > 0 && <details className="teacher-review-history">
          <summary><History /> Nhận xét đã lưu</summary>
          <label className="teacher-select"><select aria-label="Chọn nhận xét đã lưu" value={conversationId} onChange={(event) => openConversation(event.target.value)} disabled={sending || loading}><option value="">Chọn một lần nhận xét</option>{conversations.map((conversation) => <option key={conversation._id} value={conversation._id}>{conversation.title}</option>)}</select><ChevronDown /></label>
        </details>}

        <div className="teacher-review-results" aria-live="polite" aria-busy={sending || loading}>
          {loading ? <div className="teacher-loading"><LoaderCircle /> Đang tải…</div> : messages.length === 0 && !sending ? <div className="teacher-review-empty"><Bot /><span>Nhận xét sẽ gồm: kết luận, điểm đúng, chỗ cần sửa, lý do và cách giải thích lại.</span></div> : messages.filter(Boolean).map((message) => (
            <article key={message._id} className={`teacher-review-message ${message.role}`}>
              <header>{message.role === "assistant" ? <Bot /> : <UserRound />}<strong>{message.role === "assistant" ? "Nhận xét của AI" : "Lời giải thích đã gửi"}</strong></header>
              {message.role === "assistant" ? feedbackBlocks(message.content).map((block, index) => <section key={index} className="teacher-feedback-block">{block.heading && <h4>{block.heading}</h4>}{block.text && <p>{block.text}</p>}</section>) : <p>{message.content}</p>}
            </article>
          ))}
          {sending && <div className="teacher-review-progress"><LoaderCircle className="spin" /> Đang xem từng ý trong lời giải thích…</div>}
          <div ref={messageEndRef} />
        </div>
      </div>
    </aside>
  );
};

// A document switch starts a fresh review session; pending callbacks belong only
// to the document that initiated them, including the optional save-to-map action.
const TeacherPanel = (props) => <TeacherReviewPanel key={props.documentId} {...props} />;

export default TeacherPanel;
