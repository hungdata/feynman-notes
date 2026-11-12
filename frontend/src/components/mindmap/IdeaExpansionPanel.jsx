import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, GitBranchPlus, LoaderCircle, Network } from "lucide-react";
import { expandTeacherIdeas } from "@/mindmap/teacherApi";
import { ideaExpansionRequest, ideaTopicCount, normalizeIdeaBranches, selectedIdeaBranches } from "@/mindmap/ideaExpansion";

const IdeaExpansionPanel = ({ documentId, nodeId, explanation, topicTitle, quickActionRequest, quickActionExplanation, handledActionRef, onQuickActionHandled, disabled, onAddIdeas, onPrepareIdeas, onBusyChange, onAiError }) => {
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const applyingRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      onBusyChange(false);
    };
  }, [onBusyChange]);

  const generate = useCallback(async (sourceExplanation = explanation) => {
    if (!nodeId || disabled || busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    onBusyChange(true);
    setError("");
    try {
      const request = ideaExpansionRequest({ documentId, nodeId, explanation: sourceExplanation });
      if (onPrepareIdeas && await onPrepareIdeas() === false) {
        throw new Error("Chưa lưu được topic. Hãy thử lại sau.");
      }
      if (!activeRef.current) return;
      const result = await expandTeacherIdeas(request);
      if (!activeRef.current) return;
      if (result?.documentId !== documentId || result?.nodeId !== nodeId || !Array.isArray(result?.branches)) {
        throw new Error("Chưa nhận được các ý phù hợp cho topic này. Hãy thử lại.");
      }
      const branches = normalizeIdeaBranches(result.branches);
      setPreview({ branches, explanation: request.explanation || topicTitle });
      setSelected(new Set(branches.map((_branch, index) => index)));
      applyingRef.current = false;
      setApplied(false);
      setResultMessage("");
    } catch (requestError) {
      if (!activeRef.current) return;
      setError(requestError.message || "AI chưa phát triển được ý. Hãy thử lại.");
      onAiError(requestError);
    } finally {
      busyRef.current = false;
      if (activeRef.current) {
        setGenerating(false);
        onBusyChange(false);
      }
    }
  }, [disabled, documentId, explanation, nodeId, onAiError, onBusyChange, onPrepareIdeas, topicTitle]);

  useEffect(() => {
    if (quickActionRequest?.mode !== "expand" || (quickActionRequest.documentId && quickActionRequest.documentId !== documentId) || quickActionRequest.nodeId !== nodeId || !quickActionRequest.requestId || disabled || generating) return;
    if (handledActionRef.current === quickActionRequest.requestId) return;
    let active = true;
    queueMicrotask(() => {
      if (!active || handledActionRef.current === quickActionRequest.requestId) return;
      handledActionRef.current = quickActionRequest.requestId;
      onQuickActionHandled?.(quickActionRequest.requestId);
      void generate(quickActionExplanation);
    });
    return () => { active = false; };
  }, [disabled, documentId, generate, generating, handledActionRef, nodeId, onQuickActionHandled, quickActionExplanation, quickActionRequest]);

  const branches = preview?.branches || [];
  const chosen = selectedIdeaBranches(branches, selected);
  const chosenCount = ideaTopicCount(chosen);
  const toggleBranch = (index) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  const apply = () => {
    if (applyingRef.current || applied || generating || !chosenCount || !onAddIdeas) return;
    applyingRef.current = true;
    setError("");
    try {
      const result = onAddIdeas({ documentId, sourceNodeId: nodeId, branches: chosen });
      if (!result) {
        setError("Topic đã thay đổi hoặc không còn trong sơ đồ. Hãy chọn lại topic.");
        applyingRef.current = false;
        return;
      }
      if (result.addedCount > 0) {
        setApplied(true);
        setResultMessage(`Đã thêm ${result.addedCount} topic. Bạn có thể hoàn tác bằng ⌘Z.`);
      } else {
        setResultMessage(result.message || "Các ý này đã có trong sơ đồ.");
        applyingRef.current = false;
      }
    } catch (applyError) {
      setError(applyError.message || "Chưa thêm được các ý vào sơ đồ.");
      applyingRef.current = false;
    }
  };

  return (
    <section className="teacher-ideas" aria-label="Phát triển ý bằng AI" aria-busy={generating}>
      <header><Network /><div><h3>Phát triển ý</h3><p>Khám phá kiến thức liên quan và vẽ thêm nhánh vào topic đang chọn.</p></div></header>
      {!nodeId ? <p className="teacher-ideas-hint">Chọn một topic trong sơ đồ để phát triển ý.</p> : <>
        <button className="teacher-ideas-generate" type="button" onClick={() => void generate()} disabled={disabled || generating}>
          {generating ? <LoaderCircle className="spin" /> : <GitBranchPlus />}
          {generating ? "Đang phát triển ý…" : preview ? "Gợi ý thêm bằng AI" : "Phát triển ý bằng AI"}
        </button>
        <p className="teacher-ideas-hint">Dựa trên topic và lời giải thích bạn đang viết. Bạn chọn các nhánh trước khi vẽ.</p>
      </>}

      {error && <div className="teacher-error" role="alert"><CircleAlert />{error}</div>}
      {preview && <div className="teacher-ideas-preview" aria-live="polite">
        {branches.length === 0 ? <p className="teacher-ideas-hint">Chưa có ý mới phù hợp, hoặc sơ đồ đã có các nhánh liên quan. Bạn có thể chọn một topic cụ thể hơn để phát triển tiếp.</p> : <>
          <div className="teacher-ideas-preview-heading"><strong>Chọn nhánh để vẽ</strong><span>{chosenCount} topic</span></div>
          <p className="teacher-ideas-source" title={preview.explanation}>Từ: {preview.explanation}</p>
          <ul className="teacher-ideas-tree">{branches.map((branch, index) => <li key={`${index}-${branch.label}`}>
            <label><input type="checkbox" checked={selected.has(index)} onChange={() => toggleBranch(index)} disabled={applied || generating} /><span>{branch.label}</span></label>
            {branch.children.length > 0 && <ul>{branch.children.map((child, childIndex) => <li key={`${childIndex}-${child.label}`}>{child.label}</li>)}</ul>}
          </li>)}</ul>
          <button className="teacher-ideas-apply" type="button" onClick={apply} disabled={applied || generating || !chosenCount || !onAddIdeas}>
            {applied ? <Check /> : <GitBranchPlus />}{applied ? "Đã vẽ vào mind map" : `Vẽ các nhánh đã chọn (${chosenCount})`}
          </button>
        </>}
        {resultMessage && <p className="teacher-ideas-result" role="status">{resultMessage}</p>}
      </div>}
    </section>
  );
};

export default IdeaExpansionPanel;
