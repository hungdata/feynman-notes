import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/school.css";
import { LearnTopBar } from "../learn/LearnChrome";
import { playSound } from "../learn/sound";
import { useUiTheme } from "../learn/useUiTheme";
import { Corridor, Lockers, Note, NoticeBoard, Room } from "../school/Hallway";

const ROOMS = [
  { id: "bida", path: "/giai-tri/bida", label: "Phòng G01", number: "G01", title: "Phòng bida", subtitle: "Bida 8 bi", color: "#1d4a36", doodle: "pool", lit: true, progress: null },
];

const ArcadePage = () => {
  useUiTheme();
  const navigate = useNavigate();
  const [entering, setEntering] = useState(null);

  const enter = (room) => {
    if (entering) return;
    setEntering(room.id);
    playSound("next");
    window.setTimeout(() => navigate(room.path), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 520);
  };

  return (
    <div className="ln-shell hl-school is-arcade">
      <LearnTopBar title="Nhà giải trí" />
      <main className="hl-main">
        <header className="hl-hero">
          <div>
            <h1>Hành lang giải trí</h1>
            <p>Học xong thì ghé đây chơi một ván. Bấm vào cửa phòng để vào.</p>
          </div>
        </header>
        <Corridor label="Tầng trệt: Phòng trò chơi">
          <NoticeBoard title="Nội quy phòng chơi">
            <Note tone="yellow" tilt={-1.5}>
              <h3>Phòng bida</h3>
              <strong>Bida 8 bi</strong>
              <p>Chơi với máy hoặc hai người cùng một máy.</p>
              <button type="button" className="btn-primary" onClick={() => enter(ROOMS[0])}>Vào chơi</button>
            </Note>
            <Note tone="green" tilt={1.2}>
              <h3>Cách thắng</h3>
              <p>Đưa hết 7 bi của nhóm mình vào lỗ, rồi mới đến bi số 8.</p>
            </Note>
            <Note tone="pink" tilt={-0.8}>
              <h3>Nhớ nhé</h3>
              <p>Bi cái rơi lỗ là lỗi. Đối thủ được đặt bi ở bất kỳ đâu.</p>
            </Note>
          </NoticeBoard>
          {ROOMS.map((room) => <Room key={room.id} room={room} entering={entering === room.id} onEnter={enter} />)}
          <Lockers />
        </Corridor>
      </main>
    </div>
  );
};

export default ArcadePage;
