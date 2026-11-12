import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, BookOpen, Check, ChevronDown, Clock3, FileText, Lightbulb, Loader2, Lock, Network, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import { createMindMap, fetchCourse, retryCourse } from "../learn/api";
import { roadmapOrder } from "../learn/answer";
import BookCover from "../learn/BookCover";
import { isBusy, pageRange } from "../learn/format";
import { LearnTopBar, ProgressBar } from "../learn/LearnChrome";
import { usePolling } from "../learn/usePolling";
import { useUiTheme } from "../learn/useUiTheme";
import { schoolOf } from "../school/schools";

const readFree = (id) => { try { return localStorage.getItem(`feynman.learn.free.${id}`) === "1"; } catch { return false; } };
const writeFree = (id, value) => { try { localStorage.setItem(`feynman.learn.free.${id}`, value ? "1" : "0"); } catch { /* private mode */ } };

const questionCount = (lesson) => lesson.steps.filter((step) => step.type !== "concept" && !step.reported).length;

const TocItem = ({ stage, number, items, active, onSelect }) => {
  const done = items.filter((item) => item.done).length;
  const complete = stage.status === "ready" && items.length > 0 && done === items.length;
  const state = stage.status === "error" ? "error" : stage.status !== "ready" ? "wait" : complete ? "done" : done > 0 ? "doing" : "todo";
  return (
    <li>
      <button type="button" className={`ln-toc-item is-${state} ${active ? "is-active" : ""}`} aria-current={active ? "true" : undefined} onClick={onSelect}>
        <span className="ln-toc-num">{state === "done" ? <Check /> : state === "wait" ? <Loader2 className="spin" /> : state === "error" ? <AlertTriangle /> : number}</span>
        <span className="ln-toc-text">
          <strong>{stage.title.replace(/^(Chương|Chapter)\s*\d+[.:]?\s*/i, "")}</strong>
          {stage.status === "ready" ? <span className="ln-toc-bar"><span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></span> : <small>{stage.status === "error" ? "Lỗi, bấm để thử lại" : "AI đang soạn…"}</small>}
        </span>
      </button>
    </li>
  );
};

const KeyIdeas = ({ ideas }) => {
  const [open, setOpen] = useState(false);
  if (!ideas?.length) return null;
  const shown = open ? ideas : ideas.slice(0, 5);
  return (
    <section className="ln-ideas" aria-label="Ý chính của chương">
      <h3><Lightbulb /> Ý chính của chương</h3>
      <ol>
        {shown.map((idea, index) => (
          <li key={index}>
            <strong>{idea.title}</strong>
            {idea.detail && <p>{idea.detail}</p>}
            {idea.page && <span className="ln-page-ref">tr. {idea.page}</span>}
          </li>
        ))}
      </ol>
      {ideas.length > 5 && <button type="button" className="ln-link" onClick={() => setOpen((value) => !value)}><ChevronDown className={open ? "is-flipped" : ""} /> {open ? "Thu gọn" : `Xem thêm ${ideas.length - 5} ý`}</button>}
    </section>
  );
};

const LessonRow = ({ item, index, courseId }) => {
  const { lesson, state } = item;
  const icon = state === "done" ? <Check /> : state === "locked" ? <Lock /> : lesson.review ? <RotateCcw /> : <span>{index + 1}</span>;
  const action = state === "done" ? "Ôn lại" : state === "locked" ? "Chưa mở" : state === "current" ? "Bắt đầu" : "Học";
  const body = (
    <>
      <span className="ln-trail-node">{icon}</span>
      <span className="ln-trail-body">
        <strong>{lesson.title}</strong>
        {lesson.goal && <span className="ln-trail-goal">{lesson.goal}</span>}
        <span className="ln-trail-meta"><span><Clock3 /> {lesson.minutes || 3} phút</span><span>{questionCount(lesson)} câu hỏi</span></span>
      </span>
      <span className="ln-trail-action">{state === "current" && <Play />}{action}</span>
    </>
  );
  const className = `ln-trail-row is-${state} ${lesson.review ? "is-review" : ""}`;
  return (
    <li className={className}>
      {state === "locked"
        ? <div className="ln-trail-card" title="Học xong bài trước để mở bài này">{body}</div>
        : <Link className="ln-trail-card" to={`/learn/${courseId}/${lesson.id}`}>{body}</Link>}
    </li>
  );
};

const ChapterPanel = ({ stage, number, items, courseId, free, onFree, onRetry, retrying }) => (
  <article className="ln-chapter" aria-labelledby={`chapter-${stage.id}`}>
    <header className="ln-chapter-head">
      <p className="ln-chapter-kicker">Chương {number}{pageRange(stage) && <span><FileText /> {pageRange(stage)}</span>}</p>
      <h2 id={`chapter-${stage.id}`}>{stage.title.replace(/^(Chương|Chapter)\s*\d+[.:]?\s*/i, "")}</h2>
      {stage.summary && stage.status === "ready" && <p className="ln-chapter-summary">{stage.summary}</p>}
    </header>

    {(stage.status === "pending" || stage.status === "generating") && (
      <p className="ln-wait"><Loader2 className="spin" /> {stage.status === "generating" ? "AI đang đọc chương này và soạn bài…" : "Đang chờ tới lượt, chương trước đang được soạn."}</p>
    )}
    {stage.status === "error" && (
      <div className="ln-alert is-error">
        <AlertTriangle />
        <span>{stage.error || "Không tạo được bài học cho chương này."}</span>
        <button type="button" className="btn-ghost" onClick={() => onRetry(stage.id)} disabled={retrying}><RotateCcw /> Thử lại</button>
      </div>
    )}

    {stage.status === "ready" && (
      <>
        <KeyIdeas ideas={stage.keyIdeas} />
        <section className="ln-lessons" aria-label="Bài học">
          <header className="ln-lessons-head">
            <h3>Bài học</h3>
            <label className="ln-switch">
              <input type="checkbox" checked={free} onChange={(event) => onFree(event.target.checked)} />
              <span aria-hidden="true" />
              Học không theo thứ tự
            </label>
          </header>
          <ol className="ln-trail">
            {items.map((item, index) => <LessonRow key={item.lesson.id} item={item} index={index} courseId={courseId} />)}
          </ol>
        </section>
      </>
    )}
  </article>
);

const CoursePage = () => {
  useUiTheme();
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [free, setFree] = useState(() => readFree(courseId));
  const [selectedId, setSelectedId] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [making, setMaking] = useState(false);
  const { data, error, loading, reload } = usePolling(() => fetchCourse(courseId), {
    key: courseId,
    shouldPoll: (payload) => isBusy(payload.course?.status),
  });
  const course = data?.course;
  const progress = data?.progress;

  const order = useMemo(() => roadmapOrder(course, progress, { free }), [course, progress, free]);
  const byStage = useMemo(() => {
    const map = new Map();
    order.forEach((item) => map.set(item.stage.id, [...(map.get(item.stage.id) || []), item]));
    return map;
  }, [order]);
  const current = order.find((item) => item.state === "current");
  const done = order.filter((item) => item.done).length;

  const retry = async (stageId) => {
    setRetrying(true);
    try { await retryCourse(courseId, stageId); await reload(); toast.info("Đang soạn lại…"); } catch (retryError) { toast.error(retryError.message); }
    setRetrying(false);
  };

  const makeMindMap = async () => {
    if (course.mindMapId && !window.confirm("Mind map kiến thức sẽ được tạo lại theo nội dung và tiến độ mới nhất. Những chỉnh sửa tay trên bản cũ sẽ bị thay thế. Tiếp tục?")) return;
    setMaking(true);
    try {
      const { document, updated } = await createMindMap(courseId);
      toast.success(updated ? "Đã cập nhật mind map kiến thức." : "Đã tạo mind map kiến thức trong thư mục “Khóa học”.");
      navigate(`/mindmap?map=${encodeURIComponent(document.id)}`);
    } catch (mapError) { toast.error(mapError.message); setMaking(false); }
  };

  if (loading && !data) return <div className="ln-shell"><div className="ln-empty"><Loader2 className="spin" /> Đang mở khóa học…</div></div>;
  if (!course) {
    return (
      <div className="ln-shell">
        <LearnTopBar back="/learn" backLabel="Hành lang" />
        <div className="ln-empty"><p>{error?.status === 404 ? "Không tìm thấy khóa học này." : error?.message || "Không tải được khóa học."}</p><Link className="btn-ghost" to="/learn">Về hành lang</Link></div>
      </div>
    );
  }

  const stages = course.stages;
  const fallbackStage = current?.stage || stages.find((stage) => stage.status !== "ready") || stages[0];
  const selected = stages.find((stage) => stage.id === selectedId) || fallbackStage;
  const selectedIndex = stages.indexOf(selected);
  const failed = stages.filter((stage) => stage.status === "error").length;
  const ready = stages.filter((stage) => stage.status === "ready").length;

  return (
    <div className="ln-shell">
      <LearnTopBar back={schoolOf(course).path} backLabel={`Hành lang ${schoolOf(course).name.replace("Trường ", "")}`} />

      <main className="ln-main ln-course">
        <header className="ln-course-head is-board">
          <BookCover course={course} size="sm" />
          <div className="ln-course-info">
            <h1>{course.title}</h1>
            {course.author && <p className="ln-course-author">{course.author}</p>}
            <ul className="ln-facts">
              <li><strong>{stages.length}</strong> chương</li>
              <li><strong>{order.length}</strong> bài học</li>
              {course.pageCount > 0 && <li><strong>{course.pageCount}</strong> trang</li>}
              <li><strong>{progress?.xp || 0}</strong> XP</li>
            </ul>
            <div className="ln-course-progress">
              <ProgressBar value={order.length ? done / order.length : 0} label="Tiến độ khóa học" />
              <span>{order.length ? Math.round((done / order.length) * 100) : 0}% hoàn thành</span>
            </div>
          </div>
          <div className="ln-course-actions">
            {current ? (
              <Link className="btn-primary ln-big-cta" to={`/learn/${course.id}/${current.lesson.id}`}><Play /> {done ? "Học tiếp" : "Bắt đầu học"}</Link>
            ) : order.length > 0 ? (
              <p className="ln-alert is-ok"><Trophy /> Bạn đã học hết khóa này</p>
            ) : null}
            {current && <p className="ln-next-hint">{current.lesson.title}</p>}
            <button type="button" className="btn-ghost" onClick={makeMindMap} disabled={making || !ready} title="Mind map gồm các chương, ý chính và bài học của cả cuốn sách">
              {making ? <Loader2 className="spin" /> : <Network />} {course.mindMapId ? "Cập nhật mind map kiến thức" : "Tạo mind map kiến thức"}
            </button>
          </div>
        </header>

        {course.status === "extracting" && (
          <div className="ln-processing">
            <Loader2 className="spin" />
            <div><strong>Đang đọc sách và tách chương…</strong><ProgressBar value={course.progress || 0} label="Đang đọc sách" /></div>
          </div>
        )}
        {course.status === "error" && <div className="ln-alert is-error"><AlertTriangle /> {course.error || "Không xử lý được sách."}</div>}
        {course.example && <p className="ln-note"><Sparkles /> Khóa ví dụ soạn sẵn bằng lời tóm tắt riêng. Số trang dẫn về sách gốc để bạn đọc thêm.</p>}

        {stages.length > 0 && (
          <div className="ln-course-body">
            <nav className="ln-toc" aria-label="Mục lục">
              <div className="ln-toc-head">
                <h2><BookOpen /> Mục lục</h2>
                {failed > 0 && <button type="button" className="ln-link" onClick={() => retry()} disabled={retrying}><RotateCcw /> Thử lại {failed} chương</button>}
              </div>
              <ol>
                {stages.map((stage, index) => (
                  <TocItem key={stage.id} stage={stage} number={index + 1} items={byStage.get(stage.id) || []} active={stage.id === selected?.id} onSelect={() => {
                    setSelectedId(stage.id);
                    if (window.innerWidth < 900) window.requestAnimationFrame(() => document.querySelector(".ln-chapter")?.scrollIntoView({ behavior: "smooth", block: "start" }));
                  }} />
                ))}
              </ol>
            </nav>
            {selected && (
              <ChapterPanel
                key={selected.id}
                stage={selected}
                number={selectedIndex + 1}
                items={byStage.get(selected.id) || []}
                courseId={course.id}
                free={free}
                onFree={(value) => { setFree(value); writeFree(course.id, value); }}
                onRetry={retry}
                retrying={retrying}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default CoursePage;
