import { useEffect, useState } from "react";
import { Check, CircleHelp, Lightbulb, Scale, X } from "lucide-react";
import { OPTION_LETTERS, shuffledOrder } from "./answer";
import { STEP_LABELS } from "./format";
import { playSound } from "./sound";

const KIND_ICONS = { concept: Lightbulb, mcq: CircleHelp, truefalse: Scale, fill: CircleHelp, explain: CircleHelp };

/** Answer buttons; `choices` are [{ value, label }] in display order. Keys 1–n and A–n pick. */
const Choices = ({ choices, value, onChange, status, correctValue, columns = 1 }) => {
  const locked = status !== "idle";
  useEffect(() => {
    if (locked) return undefined;
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || ["INPUT", "TEXTAREA"].includes(event.target?.tagName)) return;
      const key = event.key.toUpperCase();
      const index = /^[1-9]$/.test(key) ? Number(key) - 1 : OPTION_LETTERS.indexOf(key);
      if (index >= 0 && index < choices.length) { onChange(choices[index].value); playSound("select"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, locked, onChange]);

  return (
    <div className={`ln-choices ${columns === 2 ? "is-two" : ""}`} role="radiogroup" aria-label="Các đáp án">
      {choices.map((choice, index) => {
        const chosen = value === choice.value;
        const verdict = locked ? (choice.value === correctValue ? "is-right" : chosen ? "is-wrong" : "is-dim") : "";
        return (
          <button
            key={String(choice.value)}
            type="button"
            role="radio"
            aria-checked={chosen}
            disabled={locked}
            className={`ln-choice ${chosen ? "is-chosen" : ""} ${verdict}`}
            onClick={() => { onChange(choice.value); playSound("select"); }}
          >
            <span className="ln-choice-key">{verdict === "is-right" ? <Check /> : verdict === "is-wrong" ? <X /> : OPTION_LETTERS[index]}</span>
            <span className="ln-choice-text">{choice.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const Blank = ({ value, onChange, status, onSubmit }) => (
  <input
    className={`ln-blank is-${status}`}
    value={value ?? ""}
    autoFocus
    spellCheck={false}
    aria-label="Từ còn thiếu"
    size={Math.max(8, String(value ?? "").length + 2)}
    disabled={status !== "idle"}
    onChange={(event) => onChange(event.target.value)}
    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSubmit(); } }}
  />
);

/** Renders one lesson step. `status` is idle | correct | wrong | graded | revealed. */
const StepView = ({ step, value, onChange, status, onSubmit, grade }) => {
  // A fresh shuffle every time the step is shown, so answer positions can't be memorised.
  const [order] = useState(() => (step.type === "mcq" ? shuffledOrder(step.options.length) : []));
  const Icon = KIND_ICONS[step.type] || CircleHelp;

  return (
    <div className={`ln-step is-${step.type}`}>
      <p className="ln-step-kind">
        <span className="ln-kind-chip"><Icon /> {STEP_LABELS[step.type]}</span>
        {step.page ? <span className="ln-page-ref">Sách tr. {step.page}</span> : null}
      </p>

      {step.type === "concept" && (
        <div className="ln-concept">
          {step.title && <h2>{step.title}</h2>}
          {step.body.split(/\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {step.example && <aside className="ln-example"><strong>Ví dụ</strong><p>{step.example}</p></aside>}
        </div>
      )}

      {step.type === "mcq" && (
        <>
          <h2 className="ln-question">{step.question}</h2>
          <Choices choices={order.map((index) => ({ value: index, label: step.options[index] }))} value={value} onChange={onChange} status={status} correctValue={step.answer} />
        </>
      )}

      {step.type === "truefalse" && (
        <>
          <h2 className="ln-question">{step.statement}</h2>
          <Choices columns={2} choices={[{ value: true, label: "Đúng" }, { value: false, label: "Sai" }]} value={value} onChange={onChange} status={status} correctValue={step.answer} />
        </>
      )}

      {step.type === "fill" && (
        <h2 className="ln-question ln-fill">
          {step.sentence.split("___").map((part, index) => (
            <span key={index}>{index > 0 && <Blank value={value} onChange={onChange} status={status} onSubmit={onSubmit} />}{part}</span>
          ))}
        </h2>
      )}

      {step.type === "explain" && (
        <>
          <h2 className="ln-question">{step.prompt}</h2>
          <p className="ln-hint">Giải thích bằng lời của bạn, như đang dạy cho một người mới bắt đầu. Viết 3–6 câu là đủ. Nhấn <kbd>⌘/Ctrl</kbd> + <kbd>Enter</kbd> để nộp.</p>
          <textarea
            className="ln-explain"
            rows={7}
            value={value ?? ""}
            autoFocus
            disabled={status !== "idle"}
            placeholder="Nói đơn giản thì…"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); onSubmit(); } }}
          />
          {(status === "graded" || status === "revealed") && (
            <div className="ln-keypoints">
              {grade && <p className={`ln-score ${grade.passed ? "is-pass" : "is-low"}`}><strong>{grade.score}</strong>/100 — {grade.feedback}</p>}
              {grade?.tip && <p className="ln-tip"><Lightbulb /> {grade.tip}</p>}
              <h3>Các ý chính cần có</h3>
              <ul>
                {step.keyPoints.map((point, index) => {
                  const covered = grade?.covered?.includes(index);
                  return <li key={index} className={covered ? "is-covered" : ""}>{covered ? <Check /> : <span className="ln-bullet" />}{point}</li>;
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StepView;
