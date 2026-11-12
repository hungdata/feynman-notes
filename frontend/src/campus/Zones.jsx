import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, Gamepad2, Landmark } from "lucide-react";
import CoffeeSupportModal from "../components/mindmap/CoffeeSupportModal";
import { playSound } from "../learn/sound";
import { LANGUAGE_SCHOOLS, SCHOOLS } from "../school/schools";
import ArcadeHouse from "./ArcadeHouse";
import Basketball from "./Basketball";
import Bursar from "./Bursar";
import LanguageQuarter from "./LanguageQuarter";
import Pitch from "./Pitch";
import { ZONES } from "./zoneList";


/** Stone path between two areas, with a wooden signpost to the next one. */
export const ZoneRoad = ({ to }) => (
  <div className="cp-road" aria-hidden="true">
    <span className="cp-road-path" />
    <span className="cp-road-sign"><ArrowDown /> {to}</span>
  </div>
);

const ZoneHeader = ({ title, children }) => (
  <header className="cp-zone-head">
    <h2>{title}</h2>
    {children && <p>{children}</p>}
  </header>
);

export const FootballZone = ({ sky }) => {
  const navigate = useNavigate();
  return (
    <section id="san-bong-da" className="cp-zone" aria-labelledby="zone-football">
      <ZoneHeader title={<span id="zone-football">Sân bóng đá online</span>}>Vào sân, điều khiển nhân vật và sút bóng cùng bạn bè. Hai đội dùng chung một trái bóng và bảng tỉ số.</ZoneHeader>
      <svg className={`cp-zone-svg cp-scene is-${sky}`} viewBox="0 548 1200 286">
        <Pitch score={[0, 0]} shooting={false} onShoot={() => navigate("/san-truong-3d?sport=football")} />
      </svg>
      <div className="cp-mini-gates is-single"><Link className="cp-mini-gate" style={{ "--gate": "#18a058", textDecoration: "none" }} to="/san-truong-3d?sport=football"><span className="cp-mini-emblem" aria-hidden="true">⚽</span><span><strong>Vào đá bóng ngay</strong><small>WASD để di chuyển · Space để sút · Chơi cùng người thật</small></span></Link></div>
    </section>
  );
};

export const BasketballZone = ({ sky }) => {
  const navigate = useNavigate();
  return (
    <section id="san-bong-ro" className="cp-zone" aria-labelledby="zone-basketball">
      <ZoneHeader title={<span id="zone-basketball">Sân bóng rổ online</span>}>Tự dẫn bóng, chọn vị trí rồi canh lực ném 2 hoặc 3 điểm. Rủ bạn bè vào cùng sân để chia đội.</ZoneHeader>
      <div className={`cp-scene is-${sky} cp-zone-frame`}>
        <Basketball score={[0, 0]} shooting={false} onShoot={() => navigate("/san-truong-3d?sport=basketball")} />
      </div>
      <div className="cp-mini-gates is-single"><Link className="cp-mini-gate" style={{ "--gate": "#f97316", textDecoration: "none" }} to="/san-truong-3d?sport=basketball"><span className="cp-mini-emblem" aria-hidden="true">🏀</span><span><strong>Vào chơi bóng rổ ngay</strong><small>Lại gần để nhặt bóng · Giữ rồi thả Space để ném</small></span></Link></div>
    </section>
  );
};

export const ArcadeZone = ({ sky, onOpen }) => (
  <section id="giai-tri" className="cp-zone" aria-labelledby="zone-arcade">
    <ZoneHeader title={<span id="zone-arcade">Nhà giải trí</span>}>Học xong thì vào chơi. Bên trong có phòng bida 8 bi, chơi với máy hoặc hai người.</ZoneHeader>
    <div className={`cp-scene is-${sky} cp-zone-frame`}>
      <ArcadeHouse onOpen={onOpen} />
    </div>
    <div className="cp-mini-gates is-single">
      <button type="button" className="cp-mini-gate" style={{ "--gate": "#7c3aed" }} onClick={onOpen}>
        <span className="cp-mini-emblem"><Gamepad2 /></span>
        <span><strong>Vào nhà giải trí</strong><small>Phòng bida đang mở cửa</small></span>
      </button>
    </div>
  </section>
);

export const LanguageZone = ({ sky, counts, onPick }) => (
  <section id="ngoai-ngu" className="cp-zone" aria-labelledby="zone-languages">
    <ZoneHeader title={<span id="zone-languages">Khu ngoại ngữ</span>}>Mỗi trường học một ngôn ngữ. Tải giáo trình PDF vào trường nào thì AI soạn bài theo kiểu học ngoại ngữ: từ vựng, mẫu câu, ngữ pháp.</ZoneHeader>
    <div className={`cp-scene is-${sky} cp-zone-frame`}>
      <LanguageQuarter onPick={onPick} counts={counts} />
    </div>
    <div className="cp-mini-gates">
      {LANGUAGE_SCHOOLS.map((id) => (
        <button key={id} type="button" className="cp-mini-gate" style={{ "--gate": SCHOOLS[id].color }} onClick={() => onPick(id)}>
          <span className="cp-mini-emblem">{SCHOOLS[id].emblem}</span>
          <span><strong>{SCHOOLS[id].name}</strong><small>{counts[id] ? `${counts[id]} lớp đang mở` : "Chưa có lớp, mở lớp đầu tiên"}</small></span>
        </button>
      ))}
    </div>
  </section>
);

export const BursarZone = ({ sky }) => {
  const [open, setOpen] = useState(false);
  return (
    <section id="tai-vu" className="cp-zone" aria-labelledby="zone-bursar">
      <ZoneHeader title={<span id="zone-bursar">Phòng tài vụ</span>}>Nơi đóng học phí. Bấm vào quầy thu để xem mã QR chuyển khoản.</ZoneHeader>
      <div className={`cp-scene is-${sky} cp-zone-frame`}>
        <Bursar onOpen={() => { playSound("select"); setOpen(true); }} />
      </div>
      <div className="cp-mini-gates is-single">
        <button type="button" className="cp-mini-gate" style={{ "--gate": "#4c5a75" }} onClick={() => setOpen(true)}>
          <span className="cp-mini-emblem"><Landmark /></span>
          <span><strong>Đóng học phí</strong><small>Chuyển khoản qua mã QR, số tiền tùy tâm</small></span>
        </button>
      </div>
      {open && <CoffeeSupportModal variant="tuition" onClose={() => setOpen(false)} />}
    </section>
  );
};

/** Sticky list of areas on the side; highlights the area in view. */
export const CampusNav = () => {
  const [active, setActive] = useState(ZONES[0].id);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { threshold: [0.25, 0.5, 0.75] });
    ZONES.forEach((zone) => { const element = document.getElementById(zone.id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, []);
  return (
    <nav className="cp-nav" aria-label="Các khu trong sân trường">
      {ZONES.map(({ id, label, icon: Icon }) => (
        <a key={id} href={`#${id}`} className={active === id ? "is-active" : ""} aria-current={active === id ? "location" : undefined}
          onClick={(event) => { event.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
          <Icon /><span>{label}</span>
        </a>
      ))}
    </nav>
  );
};
