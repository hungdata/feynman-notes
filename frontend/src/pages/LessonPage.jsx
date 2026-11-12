import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Check, Flag, Flame, Loader2, RotateCcw, Send, Star, Target, X } from "lucide-react";
import "@fontsource-variable/lexend";
import "../styles/mindmap.css";
import "../styles/learn.css";
import { completeLesson, fetchCourse, gradeExplanation, reportStep } from "../learn/api";
import { checkStep, nextLessonAfter } from "../learn/answer";
import { SoundToggle } from "../learn/LearnChrome";
import StepView from "../learn/StepView";
import { playSound } from "../learn/sound";
import { usePolling } from "../learn/usePolling";
import { useUiTheme } from "../learn/useUiTheme";

const answerText = (step) => {
  if (step.type === "mcq") return step.options[step.answer];
  if (step.type === "truefalse") return step.answer ? "Đúng" : "Sai";
  if (step.type === "fill") return step.answer;
  return "";
};

const PRAISE = ["Chính xác!", "Tuyệt vời!", "Đúng rồi!", "Quá chuẩn!", "Giỏi lắm!", "Hiểu bài rồi đó!"];
const CONFETTI_COLORS = ["#2f6fed", "#18a058", "#f5a524", "#e5484d", "#8b5cf6", "#06b6d4"];

/** One burst of confetti, generated once when the finish screen mounts. */
const Confetti = () => {
  const [pieces] = useState(() => Array.from({ length: 70 }, (_, index) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.35,
    duration: 1.6 + Math.random() * 1.4,
    drift: (Math.random() - 0.5) * 220,
    spin: (Math.random() - 0.5) * 900,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    wide: index % 3 === 0,
  })));
  return (
    <div className="ln-confetti" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span key={index} className={piece.wide ? "is-wide" : ""} style={{ left: `${piece.left}%`, background: piece.color, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s`, "--drift": `${piece.drift}px`, "--spin": `${piece.spin}deg` }} />
      ))}
    </div>
  );
};


const Player = ({ course, stage, lesson, progress }) => {
  const navigate = useNavigate();
  const steps = useMemo(() => lesson.steps.filter((step) => !step.reported), [lesson]);
  const [queue, setQueue] = useState(() => steps.map((step) => step.id));
  const [doneCount, setDoneCount] = useState(0);
  const [value, setValue] = useState(null);
  const [status, setStatus] = useState("idle");
  const [grade, setGrade] = useState(null);
  const [grading, setGrading] = useState(false);
  const [missed, setMissed] = useState(() => new Set());
  const [mistakes, setMistakes] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [finish, setFinish] = useState(null);
  const [praise, setPraise] = useState(PRAISE[0]);
  const [turn, setTurn] = useState(0);

  const step = steps.find((item) => item.id === queue[0]);
  const questionCount = steps.filter((item) => item.type !== "concept").length;
  const total = steps.length || 1;

  const finishLesson = useCallback(async (finalMissed, finalMistakes) => {
    setFinish({ loading: true });
    const firstTryCorrect = steps.filter((item) => item.type !== "concept" && !finalMissed.has(item.id)).length;
    try {
      const result = await completeLesson(course.id, lesson.id, { firstTryCorrect, mistakes: finalMistakes });
      playSound("finish");
      setFinish({ ...result, firstTryCorrect, nextItem: nextLessonAfter(course, result.progress, lesson.id) });
    } catch (error) {
      setFinish({ error: error.message, firstTryCorrect });
    }
  }, [course, lesson.id, steps]);

  const advance = useCallback((requeue) => {
    const rest = queue.slice(1);
    const nextQueue = requeue ? [...rest, queue[0]] : rest;
    if (!requeue) setDoneCount((count) => count + 1);
    setQueue(nextQueue);
    setTurn((count) => count + 1);
    setValue(null);
    setStatus("idle");
    setGrade(null);
    if (!nextQueue.length) finishLesson(missed, mistakes);
    else playSound("next");
  }, [finishLesson, missed, mistakes, queue]);

  const check = useCallback(async () => {
    if (!step || status !== "idle") return;
    if (step.type === "concept") { advance(false); return; }
    if (step.type === "explain") {
      if (String(value || "").trim().length < 15) { toast.info("Viết thêm một chút nhé (ít nhất 1–2 câu)."); return; }
      setGrading(true);
      try {
        const { result } = await gradeExplanation(course.id, { lessonId: lesson.id, stepId: step.id, answer: value });
        setGrade(result);
        setStatus("graded");
        playSound(result.passed ? "correct" : "wrong");
        if (!result.passed) setMissed((current) => new Set(current).add(step.id));
      } catch (error) { toast.error(error.message); }
      setGrading(false);
      return;
    }
    if (value === null || value === "") return;
    const correct = checkStep(step, value);
    setStatus(correct ? "correct" : "wrong");
    if (correct) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setBestCombo((best) => Math.max(best, nextCombo));
      setPraise(nextCombo >= 3 ? `${nextCombo} câu đúng liên tiếp!` : PRAISE[Math.floor(Math.random() * PRAISE.length)]);
      playSound(nextCombo >= 3 && nextCombo % 2 === 1 ? "combo" : "correct");
    } else {
      setCombo(0);
      setMissed((current) => new Set(current).add(step.id));
      setMistakes((count) => count + 1);
      playSound("wrong");
    }
  }, [advance, combo, course.id, lesson.id, status, step, value]);

  const proceed = useCallback(() => advance(status === "wrong"), [advance, status]);

  const reveal = () => {
    setMissed((current) => new Set(current).add(step.id));
    setGrade(null);
    setStatus("revealed");
  };

  const report = async () => {
    if (!window.confirm("Báo câu này sai hoặc khó hiểu? Câu sẽ được ẩn khỏi bài học.")) return;
    try {
      await reportStep(course.id, { lessonId: lesson.id, stepId: step.id });
      toast.success("Cảm ơn bạn! Đã ẩn câu này.");
    } catch (error) { toast.error(error.message); return; }
    const nextMissed = new Set(missed);
    nextMissed.delete(step.id);
    setMissed(nextMissed);
    const rest = queue.filter((id) => id !== step.id);
    setQueue(rest);
    setTurn((count) => count + 1);
    setDoneCount((count) => count + 1);
    setValue(null);
    setStatus("idle");
    if (!rest.length) finishLesson(nextMissed, mistakes);
  };

  useEffect(() => {
    const onKey = (event) => {
      if (finish || !step || event.key !== "Enter") return;
      if (["TEXTAREA", "INPUT", "SELECT"].includes(event.target?.tagName)) return;
      event.preventDefault();
      if (status === "idle") check(); else proceed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [check, finish, proceed, status, step]);

  const exit = () => {
    if (doneCount > 0 && !finish && !window.confirm("Thoát bài học? Tiến độ của bài này sẽ không được lưu.")) return;
    navigate(`/learn/${course.id}`);
  };

  if (finish) {
    const next = finish.nextItem;
    const accuracy = questionCount ? Math.round((finish.firstTryCorrect / questionCount) * 100) : 100;
    return (
      <div className="ln-player">
        {!finish.loading && !finish.error && <Confetti />}
        <div className="ln-finish">
          {finish.loading ? <Loader2 className="spin" /> : (
            <>
              <div className="ln-finish-badge"><Check /></div>
              <h1>{accuracy === 100 ? "Hoàn hảo!" : "Xong bài rồi!"}</h1>
              <p className="ln-finish-title">{lesson.title}</p>
              {finish.error ? <p className="ln-alert is-error">{finish.error}</p> : (
                <div className="ln-finish-stats">
                  <div className="is-xp"><span><Star /> Kinh nghiệm</span><strong>+{finish.xp} XP</strong></div>
                  <div className="is-acc"><span><Target /> Đúng ngay lần đầu</span><strong>{accuracy}%</strong></div>
                  <div className="is-streak"><span><Flame /> Chuỗi ngày</span><strong>{finish.learner?.streak || 1} ngày</strong></div>
                </div>
              )}
              {bestCombo >= 3 && <p className="ln-finish-combo"><Flame /> Chuỗi đúng dài nhất: {bestCombo} câu</p>}
              <div className="ln-finish-actions">
                {next ? (
                  <Link className="btn-primary ln-big-cta" to={`/learn/${course.id}/${next.lesson.id}`} replace autoFocus>Bài tiếp theo: {next.lesson.title}</Link>
                ) : (
                  <Link className="btn-primary ln-big-cta" to={`/learn/${course.id}`} autoFocus>Xem lộ trình</Link>
                )}
                <Link className="btn-ghost" to={`/learn/${course.id}`}>Về lộ trình</Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div className="ln-player"><div className="ln-finish"><p>Bài học này không còn câu nào (đã bị báo lỗi hết).</p><Link className="btn-ghost" to={`/learn/${course.id}`}>Về lộ trình</Link></div></div>
    );
  }

  const isQuestion = step.type !== "concept";
  const reviewing = Boolean(progress?.lessons?.[lesson.id]?.completedAt);
  const canCheck = step.type === "concept" || (step.type === "explain" ? String(value || "").trim().length >= 15 : value !== null && value !== "");
  const tone = status === "correct" ? "is-correct" : status === "wrong" ? "is-wrong" : status === "graded" ? (grade?.passed ? "is-correct" : "is-wrong") : status === "revealed" ? "is-neutral" : "";

  return (
    <div className="ln-player">
      <header className="ln-player-top">
        <button type="button" className="icon-btn" aria-label="Thoát bài học" title="Thoát bài học" onClick={exit}><X /></button>
        <div className="ln-player-progress" role="progressbar" aria-label="Tiến độ bài học" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
          <span style={{ width: `${(doneCount / total) * 100}%` }} />
        </div>
        <span className={`ln-combo ${combo >= 2 ? "is-on" : ""}`} title="Số câu đúng liên tiếp"><Flame /> {combo}</span>
        <SoundToggle />
      </header>

      <main className="ln-player-main">
        <p className="ln-player-crumb">{reviewing ? "Ôn lại: " : ""}{lesson.title}<span>{stage.title}</span></p>
        <StepView key={turn} step={step} value={value} onChange={setValue} status={status} onSubmit={status === "idle" ? check : proceed} grade={grade} />
      </main>

      <footer className={`ln-sheet ${tone}`}>
        <div className="ln-sheet-inner">
          <div className="ln-sheet-text" aria-live="polite">
            {status === "correct" && <><strong><span className="ln-sheet-icon"><Check /></span>{praise}</strong>{step.explanation && <p>{step.explanation}</p>}</>}
            {status === "wrong" && <><strong><span className="ln-sheet-icon"><X /></span>Chưa đúng</strong><p className="ln-sheet-answer">Đáp án đúng: <b>{answerText(step)}</b></p>{step.explanation && <p>{step.explanation}</p>}<small>Câu này sẽ quay lại ở cuối bài.</small></>}
            {status === "graded" && <strong><span className="ln-sheet-icon">{grade?.passed ? <Check /> : <RotateCcw />}</span>{grade?.passed ? "Giải thích tốt!" : "So lại với các ý chính phía trên nhé"}</strong>}
            {status === "revealed" && <strong>Đọc kỹ các ý chính, lần sau thử tự giải thích nhé.</strong>}
            {status === "idle" && step.type === "explain" && <button type="button" className="ln-link" onClick={reveal}>Mình chưa biết, xem ý chính</button>}
            {status === "idle" && (step.type === "mcq" || step.type === "truefalse") && <span className="ln-sheet-hint">Bấm chọn một đáp án, hoặc gõ phím {step.type === "mcq" ? "A–D" : "A/B"}</span>}
          </div>
          <div className="ln-sheet-actions">
            {isQuestion && status !== "idle" && <button type="button" className="ln-link ln-report" onClick={report} title="Báo câu hỏi sai hoặc khó hiểu"><Flag /> Báo câu sai</button>}
            {status === "idle" ? (
              <button type="button" className="btn-primary ln-cta" onClick={check} disabled={!canCheck || grading}>
                {grading ? <><Loader2 className="spin" /> AI đang chấm…</> : step.type === "concept" ? "Tiếp tục" : step.type === "explain" ? <><Send /> Nộp bài</> : "Kiểm tra"}
              </button>
            ) : (
              <button type="button" className="btn-primary ln-cta" onClick={proceed} autoFocus>Tiếp tục</button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};

const LessonPage = () => {
  useUiTheme();
  const { courseId, lessonId } = useParams();
  const { data, error, loading } = usePolling(() => fetchCourse(courseId), { key: courseId });
  const course = data?.course;
  const stage = course?.stages.find((item) => item.lessons?.some((lesson) => lesson.id === lessonId));
  const lesson = stage?.lessons.find((item) => item.id === lessonId);

  if (loading && !data) return <div className="ln-shell"><div className="ln-empty"><Loader2 className="spin" /> Đang mở bài học…</div></div>;
  if (!lesson) {
    return (
      <div className="ln-shell">
        <div className="ln-empty">
          <p>{error?.message || "Không tìm thấy bài học này."}</p>
          <Link className="btn-ghost" to={course ? `/learn/${courseId}` : "/learn"}>Quay lại</Link>
        </div>
      </div>
    );
  }
  return <Player key={lesson.id} course={course} stage={stage} lesson={lesson} progress={data.progress} />;
};

export default LessonPage;
