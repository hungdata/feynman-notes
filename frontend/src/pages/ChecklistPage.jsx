import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { CalendarRange, ChevronDown, Eraser, Loader2, Pencil, X } from "lucide-react";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/checklist.css";
import { createTask, listTasks, removeTask, updateTask } from "../checklist/api";
import { inDateRange, whenLabel } from "../checklist/format";
import { LearnTopBar, SoundToggle } from "../learn/LearnChrome";
import { playSound } from "../learn/sound";
import { useUiTheme } from "../learn/useUiTheme";

const FILTERS = [
  { id: "all", label: "Tất cả" },
  { id: "active", label: "Chưa xong" },
  { id: "completed", label: "Đã xong" },
];

/** "Thứ Tư, ngày 11 tháng 11" — the date a teacher writes in the corner of the board. */
const boardDate = (now = new Date()) => {
  const weekday = now.toLocaleDateString("vi-VN", { weekday: "long" });
  return `${weekday.charAt(0).toLocaleUpperCase("vi")}${weekday.slice(1)}, ngày ${now.getDate()} tháng ${now.getMonth() + 1}`;
};

const ChalkTick = () => (
  <svg viewBox="0 0 24 24" className="ck-tick" aria-hidden="true"><path d="M4 13 L9.5 18.5 L20 5.5" /></svg>
);

const TaskRow = ({ task, settling, onToggle, onRename, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [busy, setBusy] = useState(false);
  const done = task.status === "completed";

  const save = async () => {
    const next = title.trim();
    if (!next || next === task.title) { setTitle(task.title); setEditing(false); return; }
    setBusy(true);
    try { await onRename(task, next); setEditing(false); } catch (error) { toast.error(error.message); }
    setBusy(false);
  };

  return (
    <li className={`ck-row ${done ? "is-done" : ""} ${settling ? "is-settling" : ""}`}>
      <button type="button" className="ck-box" aria-pressed={done} aria-label={done ? `Bỏ đánh dấu: ${task.title}` : `Đánh dấu xong: ${task.title}`} onClick={() => onToggle(task)} disabled={busy}>
        <ChalkTick />
      </button>
      {editing ? (
        <form className="ck-edit" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <input value={title} autoFocus maxLength={200} aria-label="Sửa tên việc" onChange={(event) => setTitle(event.target.value)} onBlur={save}
            onKeyDown={(event) => { if (event.key === "Escape") { setTitle(task.title); setEditing(false); } }} />
        </form>
      ) : (
        <button type="button" className="ck-title" onClick={() => onToggle(task)} onDoubleClick={() => setEditing(true)} title="Bấm để đánh dấu xong, bấm đúp để sửa">
          <span className="ck-text">{task.title}</span>
          <small>{done && task.completedAt ? `xong lúc ${whenLabel(task.completedAt).toLocaleLowerCase("vi")}` : whenLabel(task.createdAt)}</small>
        </button>
      )}
      {!editing && (
        <span className="ck-actions">
          <button type="button" className="ck-tool" aria-label={`Sửa: ${task.title}`} title="Sửa" onClick={() => setEditing(true)}><Pencil /></button>
          <button type="button" className="ck-tool is-erase" aria-label={`Xóa: ${task.title}`} title="Xóa bằng giẻ lau bảng" onClick={() => onDelete(task)}><Eraser /></button>
        </span>
      )}
    </li>
  );
};

const ChalkDoodle = () => (
  <svg viewBox="0 0 120 110" className="ck-doodle" aria-hidden="true">
    <rect x="24" y="16" width="72" height="86" rx="8" />
    <rect x="44" y="8" width="32" height="14" rx="4" />
    <path d="M38 44 l6 6 l11 -12 M38 70 l6 6 l11 -12" />
    <path d="M62 45 H84 M62 71 H80" />
  </svg>
);

const ChecklistPage = () => {
  useUiTheme();
  const [tasks, setTasks] = useState(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(true);
  const [settling, setSettling] = useState(() => new Set());
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    listTasks().then((list) => { if (!cancelled) setTasks(list); }).catch((error) => { if (!cancelled) { setTasks([]); toast.error(error.message); } });
    return () => { cancelled = true; };
  }, []);

  const all = useMemo(() => tasks || [], [tasks]);
  const doneCount = all.filter((task) => task.status === "completed").length;
  const activeCount = all.length - doneCount;
  const visible = all.filter((task) => inDateRange(task, range));
  // A task just ticked stays in place for a moment so the chalk tick can be drawn.
  const activeList = visible.filter((task) => task.status !== "completed" || settling.has(task._id));
  const doneList = visible.filter((task) => task.status === "completed" && !settling.has(task._id))
    .sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  const ratio = all.length ? doneCount / all.length : 0;
  const filtered = Boolean(range.from || range.to);

  const replace = (task) => setTasks((list) => list.map((item) => (item._id === task._id ? task : item)));

  const add = async (event) => {
    event.preventDefault();
    const title = draft.trim();
    if (!title || adding) return;
    setAdding(true);
    try {
      const task = await createTask(title);
      setTasks((list) => [task, ...(list || [])]);
      setDraft("");
      playSound("chalk");
      if (filter === "completed") setFilter("all");
    } catch (error) { toast.error(error.message); }
    setAdding(false);
    inputRef.current?.focus();
  };

  const toggle = async (task) => {
    const completing = task.status !== "completed";
    const optimistic = { ...task, status: completing ? "completed" : "active", completedAt: completing ? new Date().toISOString() : null };
    replace(optimistic);
    if (completing) {
      playSound("tick");
      if (activeCount === 1) window.setTimeout(() => playSound("finish"), 260);
      setSettling((current) => new Set(current).add(task._id));
      window.setTimeout(() => setSettling((current) => { const next = new Set(current); next.delete(task._id); return next; }), 900);
    } else {
      playSound("erase");
    }
    try { replace(await updateTask(task._id, { status: optimistic.status })); } catch (error) { replace(task); toast.error(error.message); }
  };

  const rename = async (task, title) => { replace(await updateTask(task._id, { title })); playSound("chalk"); };

  const remove = async (task) => {
    playSound("erase");
    setTasks((list) => list.filter((item) => item._id !== task._id));
    try {
      await removeTask(task._id);
      toast(({ closeToast }) => (
        <span className="ck-toast">Đã lau “{task.title}” khỏi bảng
          <button type="button" onClick={async () => {
            closeToast();
            try {
              let restored = await createTask(task.title);
              if (task.status === "completed") restored = await updateTask(restored._id, { status: "completed" });
              setTasks((list) => [restored, ...list]);
              playSound("chalk");
            } catch (error) { toast.error(error.message); }
          }}>Hoàn tác</button>
        </span>
      ), { autoClose: 5000 });
    } catch (error) {
      setTasks((list) => [task, ...list]);
      toast.error(error.message);
    }
  };

  const showActive = filter !== "completed";
  const showDone = filter !== "active";

  return (
    <div className="ln-shell ck-shell">
      <LearnTopBar title="Trường Checklist">
        <SoundToggle />
      </LearnTopBar>

      <main className="ck-room">
        <div className="ck-board">
          <div className="ck-board-top">
            <p className="ck-date">{boardDate()}</p>
            <p className="ck-tally" aria-label={`Đã xong ${doneCount} trên ${all.length} việc`}>
              <svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" /><circle cx="22" cy="22" r="18" style={{ strokeDasharray: `${ratio * 113.1} 113.1` }} /></svg>
              Đã xong {doneCount}/{all.length}
            </p>
          </div>
          <h1 className="ck-heading">Việc cần làm</h1>

          <form className="ck-add" onSubmit={add}>
            <Pencil aria-hidden="true" />
            <input ref={inputRef} value={draft} maxLength={200} placeholder="Viết việc mới lên bảng…" aria-label="Việc mới" onChange={(event) => setDraft(event.target.value)} />
            <button type="submit" className="ck-chalk-btn" disabled={!draft.trim() || adding}>{adding ? <Loader2 className="spin" /> : null}Ghi lên bảng</button>
          </form>

          {rangeOpen && (
            <div className="ck-range">
              <label>Từ ngày<input type="date" value={range.from} max={range.to || undefined} onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))} /></label>
              <label>đến ngày<input type="date" value={range.to} min={range.from || undefined} onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))} /></label>
              {filtered && <button type="button" className="ck-chalk-link" onClick={() => setRange({ from: "", to: "" })}><X /> Bỏ lọc</button>}
            </div>
          )}

          {tasks === null ? (
            <div className="ck-loading"><Loader2 className="spin" /> Đang chép bài lên bảng…</div>
          ) : (
            <div className="ck-columns">
              {showActive && (
                <section className="ck-section" aria-label="Chưa xong">
                  <h2>Chưa xong <span>({activeList.length})</span></h2>
                  {activeList.length ? (
                    <ul className="ck-list">
                      {activeList.map((task) => <TaskRow key={task._id} task={task} settling={settling.has(task._id)} onToggle={toggle} onRename={rename} onDelete={remove} />)}
                    </ul>
                  ) : all.length && !filtered ? (
                    <p className="ck-note">Không còn việc nào chưa xong.</p>
                  ) : (
                    <div className="ck-empty"><ChalkDoodle /><p>{filtered ? "Không có việc nào trong khoảng ngày này." : "Bảng còn trống. Viết việc đầu tiên ở dòng phía trên."}</p></div>
                  )}
                </section>
              )}
              {showDone && (doneList.length > 0 || filter === "completed") && (
                <section className="ck-section is-done-list" aria-label="Đã xong">
                  <button type="button" className="ck-section-toggle" aria-expanded={doneOpen || filter === "completed"} onClick={() => setDoneOpen((open) => !open)}>
                    <ChevronDown className={doneOpen || filter === "completed" ? "" : "is-closed"} /> Đã xong <span>({doneList.length})</span>
                  </button>
                  {(doneOpen || filter === "completed") && (doneList.length ? (
                    <ul className="ck-list">
                      {doneList.map((task) => <TaskRow key={task._id} task={task} settling={false} onToggle={toggle} onRename={rename} onDelete={remove} />)}
                    </ul>
                  ) : <p className="ck-note">Chưa có việc nào xong{filtered ? " trong khoảng ngày này" : ""}.</p>)}
                </section>
              )}
            </div>
          )}
        </div>

        <div className="ck-tray">
          <div className="ck-filters" role="tablist" aria-label="Lọc theo trạng thái">
            {FILTERS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} className={`ck-chalk-piece ${filter === item.id ? "is-on" : ""}`} onClick={() => setFilter(item.id)}>
                {item.label} <span>{item.id === "all" ? all.length : item.id === "active" ? activeCount : doneCount}</span>
              </button>
            ))}
          </div>
          <button type="button" className={`ck-chalk-piece is-tool ${filtered ? "is-on" : ""}`} aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}>
            <CalendarRange /> {filtered ? "Đang lọc ngày" : "Lọc theo ngày"}
          </button>
          <span className="ck-eraser" aria-hidden="true" />
        </div>
      </main>
    </div>
  );
};

export default ChecklistPage;
