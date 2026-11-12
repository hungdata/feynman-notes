import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Flame, School, Star, Target, Volume2, VolumeX } from "lucide-react";
import { isSoundOn, playSound, setSoundOn } from "./sound";

export const LearnStats = ({ learner }) => {
  if (!learner) return null;
  const goal = learner.dailyGoal || 30;
  const today = Math.min(goal, learner.today || 0);
  const ratio = goal ? today / goal : 0;
  return (
    <div className="ln-stats" aria-label="Thành tích học tập">
      <span className={`ln-stat ${learner.streak ? "is-hot" : ""}`} title={`Chuỗi ngày học liên tiếp (kỷ lục ${learner.bestStreak || 0})`}><Flame /> {learner.streak || 0}</span>
      <span className="ln-stat is-xp" title="Tổng điểm kinh nghiệm"><Star /> {learner.xp || 0} XP</span>
      <span className="ln-stat is-goal" title={`Mục tiêu hôm nay: ${today}/${goal} XP`}>
        <svg viewBox="0 0 36 36" className="ln-ring" aria-hidden="true">
          <circle cx="18" cy="18" r="15" />
          <circle cx="18" cy="18" r="15" style={{ strokeDasharray: `${ratio * 94.25} 94.25` }} />
        </svg>
        <Target /> {today}/{goal}
      </span>
    </div>
  );
};

export const LearnTopBar = ({ back = "/", backLabel = "Sân trường", title, children, learner }) => (
  <header className="ln-topbar">
    <div className="ln-topbar-start">
      <Link className="ln-back" to={back}>{back === "/" ? <School /> : <ArrowLeft />}<span>{backLabel}</span></Link>
      {title && <h1 className="ln-topbar-title">{title}</h1>}
    </div>
    <div className="ln-topbar-end">
      {children}
      <LearnStats learner={learner} />
    </div>
  </header>
);

export const ProgressBar = ({ value, label }) => (
  <div className="ln-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
    <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
  </div>
);

export const SoundToggle = () => {
  const [on, setOn] = useState(isSoundOn);
  return (
    <button type="button" className="icon-btn" aria-pressed={on} aria-label={on ? "Tắt âm thanh" : "Bật âm thanh"} title={on ? "Tắt âm thanh" : "Bật âm thanh"} onClick={() => { setSoundOn(!on); setOn(!on); if (!on) playSound("select"); }}>
      {on ? <Volume2 /> : <VolumeX />}
    </button>
  );
};
