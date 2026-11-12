import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Loader2, Network, PenLine } from "lucide-react";
import "@fontsource-variable/lexend";
import "@fontsource/patrick-hand/vietnamese-400.css";
import "@fontsource/patrick-hand/latin-400.css";
import "../styles/mindmap.css";
import "../styles/learn.css";
import "../styles/school.css";
import { LearnTopBar } from "../learn/LearnChrome";
import { relativeDay } from "../learn/format";
import { playSound } from "../learn/sound";
import { useUiTheme } from "../learn/useUiTheme";
import { Corridor, EmptyRoom, Lockers, Note, NoticeBoard, Room } from "../school/Hallway";

const DOOR_COLORS = ["#2f6fed", "#4c3fb5", "#0f6e8c", "#14795a", "#b4233c", "#c2410c", "#6b4f1d", "#1f2a44"];
const colorFor = (id = "") => {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return DOOR_COLORS[hash % DOOR_COLORS.length];
};

const request = async (url, options) => {
  const response = await fetch(url, { credentials: "include", ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Yêu cầu thất bại (${response.status}).`);
  return payload;
};

/** Maps grouped into floors by folder; maps without a folder are on the ground floor. */
const toFloors = (maps) => {
  const groups = new Map();
  maps.forEach((map) => {
    const key = map.folder || "";
    groups.set(key, [...(groups.get(key) || []), map]);
  });
  const keys = [...groups.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "vi")));
  return keys.map((folder, floorIndex) => ({
    folder,
    label: `Tầng ${floorIndex + 1}: ${folder || "Mind map chung"}`,
    rooms: groups.get(folder)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map((map, index) => ({
        id: map.id,
        number: (floorIndex + 1) * 100 + index + 1,
        title: map.title,
        color: colorFor(map.id),
        subtitle: `${map.topicCount} topic`,
        progress: null,
        doodle: "map",
        lit: Boolean(map.updatedAt) && Date.now() - new Date(map.updatedAt).getTime() < 3 * 86_400_000,
        favorite: map.favorite,
      })),
  }));
};

const MindMapHallPage = () => {
  useUiTheme();
  const navigate = useNavigate();
  const [maps, setMaps] = useState(null);
  const [entering, setEntering] = useState(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request("/api/mindmaps?view=summary")
      .then((payload) => { if (!cancelled) setMaps((payload.maps || []).filter((map) => !map.trashedAt)); })
      .catch((error) => { if (!cancelled) { setMaps([]); toast.error(error.message); } });
    return () => { cancelled = true; };
  }, []);

  const floors = useMemo(() => toFloors(maps || []), [maps]);
  const latest = useMemo(() => [...(maps || [])].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0], [maps]);

  const enter = (room) => {
    if (entering) return;
    setEntering(room.id);
    playSound("next");
    window.setTimeout(() => navigate(`/mindmap?map=${encodeURIComponent(room.id)}`), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 520);
  };

  const create = async (folder = "") => {
    if (creating) return;
    setCreating(true);
    try {
      const { document } = await request("/api/mindmaps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Mind map mới" }) });
      if (folder) await request(`/api/mindmaps/${encodeURIComponent(document.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder }) });
      playSound("next");
      navigate(`/mindmap?map=${encodeURIComponent(document.id)}`);
    } catch (error) {
      toast.error(error.message);
      setCreating(false);
    }
  };

  return (
    <div className="ln-shell hl-school is-mindmap">
      <LearnTopBar title="Trường Mind Map">
        <Link className="btn-ghost" to="/mindmap"><PenLine /> Mở phòng vẽ</Link>
      </LearnTopBar>

      <main className="hl-main">
        <header className="hl-hero">
          <div>
            <h1>Hành lang lớp học</h1>
            <p>Mỗi mind map là một lớp học, mỗi thư mục là một tầng. Bấm vào cửa để vào lớp và vẽ tiếp.</p>
          </div>
        </header>

        {maps === null ? (
          <div className="ln-empty"><Loader2 className="spin" /> Đang mở cửa trường…</div>
        ) : floors.length === 0 ? (
          <Corridor label="Tầng 1: Mind map chung">
            <NoticeBoard>
              <Note tone="yellow" tilt={-1.5}>
                <h3>Chào mừng</h3>
                <strong>Chưa có lớp nào</strong>
                <p>Mở phòng trống bên cạnh để vẽ mind map đầu tiên.</p>
              </Note>
            </NoticeBoard>
            <EmptyRoom label="Mind map mới" hint="Mở lớp mới" onClick={() => create("")} busy={creating} />
            <Lockers />
          </Corridor>
        ) : floors.map((floor, floorIndex) => (
          <Corridor key={floor.folder || "root"} label={floor.label}>
            {floorIndex === 0 && (
              <NoticeBoard>
                {latest && (
                  <Note tone="yellow" tilt={-1.5}>
                    <h3>Vẽ tiếp</h3>
                    <strong>{latest.title}</strong>
                    <p>Sửa lần cuối {relativeDay(latest.updatedAt) || "gần đây"}</p>
                    <button type="button" className="btn-primary" onClick={() => enter({ id: latest.id })}><Network /> Vào lớp</button>
                  </Note>
                )}
                <Note tone="blue" tilt={1.2}>
                  <h3>Sĩ số</h3>
                  <p className="hl-stat-line"><span>{maps.length} mind map</span><span>{floors.length} tầng</span></p>
                  <p>Thêm thư mục trong phòng vẽ để có tầng mới.</p>
                </Note>
              </NoticeBoard>
            )}
            {floor.rooms.map((room) => <Room key={room.id} room={room} entering={entering === room.id} onEnter={enter} />)}
            <EmptyRoom label="Mind map mới" hint={floor.folder ? `Mở lớp ở tầng ${floorIndex + 1}` : "Mở lớp mới"} onClick={() => create(floor.folder)} busy={creating} />
            <Lockers start={floorIndex * 10 + 1} />
          </Corridor>
        ))}
      </main>
    </div>
  );
};

export default MindMapHallPage;
