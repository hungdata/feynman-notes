import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import { BookUp, Flame, Loader2, Pencil, Play, Sparkles, Star, Trash2 } from "lucide-react";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/school.css";
import { deleteCourse, fetchCourses, renameCourse } from "../learn/api";
import { courseStatusLabel, coverPalette, isBusy, relativeDay } from "../learn/format";
import { LearnTopBar } from "../learn/LearnChrome";
import UploadBookDialog from "../learn/UploadBookDialog";
import { usePolling } from "../learn/usePolling";
import { useUiTheme } from "../learn/useUiTheme";
import { Corridor, EmptyRoom, Lockers, Note, NoticeBoard, Room } from "../school/Hallway";
import { playSound } from "../learn/sound";
import { SCHOOLS } from "../school/schools";

/** The course to continue: most recently studied, else the first one that is ready. */
const pickContinue = (courses) => {
  const ready = courses.filter((course) => course.learning?.nextLesson);
  return [...ready].sort((a, b) => String(b.learning.lastStudiedAt || "").localeCompare(String(a.learning.lastStudiedAt || "")))[0] || null;
};

const toRoom = (course, index) => {
  const learning = course.learning || {};
  const status = courseStatusLabel(course);
  const next = learning.nextLesson;
  return {
    id: course.id,
    number: 101 + index,
    title: course.title,
    color: coverPalette(course.title).base,
    subtitle: learning.lessonCount && status.tone === "ok" ? `${learning.lessonsDone}/${learning.lessonCount} bài` : status.text,
    progress: learning.lessonCount ? learning.lessonsDone / learning.lessonCount : null,
    board: isBusy(course.status) ? "Đang soạn…" : next ? `Chương ${next.stageIndex + 1}` : learning.lessonCount ? "Xong!" : "…",
    lit: Boolean(learning.lastStudiedAt),
    busy: isBusy(course.status),
  };
};

const LearnPage = () => {
  useUiTheme();
  const params = useParams();
  const school = SCHOOLS[params.school] || SCHOOLS.general;
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [entering, setEntering] = useState(null);
  const { data, error, loading, reload, setData } = usePolling(fetchCourses, {
    shouldPoll: (payload) => payload.courses?.some((course) => isBusy(course.status)),
  });
  const courses = (data?.courses || []).filter((course) => (course.school || "general") === school.id);
  const current = pickContinue(courses);
  const learner = data?.learner;

  const enter = (room) => {
    if (entering) return;
    setEntering(room.id);
    playSound("next");
    window.setTimeout(() => navigate(`/learn/${room.id}`), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 520);
  };

  const handleRename = async (room) => {
    const title = window.prompt("Tên mới của lớp học (khóa học)", room.title)?.trim();
    if (!title || title === room.title) return;
    try {
      await renameCourse(room.id, title);
      setData((payload) => ({ ...payload, courses: payload.courses.map((item) => (item.id === room.id ? { ...item, title } : item)) }));
    } catch (renameError) { toast.error(renameError.message); }
  };

  const handleDelete = async (room) => {
    if (!window.confirm(`Xóa lớp “${room.title}” và toàn bộ tiến độ học? Không thể hoàn tác.`)) return;
    try {
      await deleteCourse(room.id);
      setData((payload) => ({ ...payload, courses: payload.courses.filter((item) => item.id !== room.id) }));
      toast.success("Đã xóa khóa học.");
    } catch (deleteError) { toast.error(deleteError.message); }
  };

  const menu = [
    { label: "Đổi tên", icon: <Pencil />, onSelect: handleRename },
    { label: "Xóa khóa học", icon: <Trash2 />, danger: true, onSelect: handleDelete },
  ];

  return (
    <div className={`ln-shell hl-school is-learn is-${school.id}`} style={{ "--school": school.color }}>
      <LearnTopBar learner={learner} title={school.name}>
        <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}><BookUp /> Thêm sách</button>
      </LearnTopBar>

      <main className="hl-main">
        <header className="hl-hero">
          <div>
            <h1>Hành lang lớp học</h1>
            <p>{school.intro}</p>
          </div>
        </header>

        {error && !data && (
          <div className="ln-empty">
            <p>{error.message}</p>
            <button type="button" className="btn-ghost" onClick={reload}>Thử lại</button>
          </div>
        )}

        {loading && !data ? (
          <div className="ln-empty"><Loader2 className="spin" /> Đang mở cửa trường…</div>
        ) : data && (
          <Corridor label={`Tầng 1: Các lớp học từ ${school.subject}`}>
            <NoticeBoard>
              {current ? (
                <Note tone="yellow" tilt={-1.5}>
                  <h3>Học tiếp</h3>
                  <strong>{current.learning.nextLesson.title}</strong>
                  <p>{current.title}{current.learning.lastStudiedAt ? `, học lần cuối ${relativeDay(current.learning.lastStudiedAt)}` : ""}</p>
                  <Link className="btn-primary" to={`/learn/${current.id}/${current.learning.nextLesson.id}`}><Play /> {current.learning.lessonsDone ? "Học tiếp" : "Bắt đầu"}</Link>
                </Note>
              ) : (
                <Note tone="yellow" tilt={-1.5}>
                  <h3>Lớp đầu tiên</h3>
                  <strong>{school.upload}</strong>
                  <p>AI sẽ chia từng chương thành bài 3 phút.</p>
                  <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}><BookUp /> Thêm sách</button>
                </Note>
              )}
              {learner && (
                <Note tone="blue" tilt={1.2}>
                  <h3>Thành tích</h3>
                  <p className="hl-stat-line"><span><Flame /> {learner.streak || 0} ngày liên tiếp</span></p>
                  <p className="hl-stat-line"><span><Star /> {learner.today || 0}/{learner.dailyGoal || 30} XP hôm nay</span></p>
                  <p>Tổng {learner.xp || 0} XP</p>
                </Note>
              )}
              {data.ai && (
                <Note tone={data.ai.canGenerate ? "green" : "pink"} tilt={-0.8}>
                  <h3>Trợ giảng AI</h3>
                  <p><Sparkles style={{ width: 14, height: 14, verticalAlign: -2 }} /> {data.ai.canGenerate ? `Sẵn sàng (${data.ai.model})` : "Chưa cấu hình, chỉ học được lớp có sẵn."}</p>
                </Note>
              )}
            </NoticeBoard>
            {courses.map((course, index) => (
              <Room key={course.id} room={toRoom(course, index)} entering={entering === course.id} onEnter={enter} menu={menu} />
            ))}
            <EmptyRoom label={school.upload} hint="Mở lớp mới" onClick={() => setUploadOpen(true)} />
            <Lockers />
          </Corridor>
        )}
      </main>

      {uploadOpen && (
        <UploadBookDialog
          canGenerate={Boolean(data?.ai?.canGenerate)}
          school={school.id}
          schoolName={school.id === "general" ? "" : school.name}
          heading={school.id === "general" ? "Thêm sách để học" : `${school.upload}`}
          onClose={() => setUploadOpen(false)}
          onUploaded={(course) => { setUploadOpen(false); toast.success("Đã nhận sách. AI đang soạn lộ trình…"); navigate(`/learn/${course.id}`); }}
        />
      )}
    </div>
  );
};

export default LearnPage;
