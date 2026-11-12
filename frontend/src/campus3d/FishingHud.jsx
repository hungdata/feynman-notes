import { useState } from "react";
import { Coins, Fish, X } from "lucide-react";

const RARITY_CLASS = { junk: "is-junk", common: "is-common", uncommon: "is-uncommon", rare: "is-rare", legendary: "is-legendary" };

/** The reeling bar: keep the fish inside the green zone until the ring is full. */
export const ReelBar = ({ barRef }) => (
  <div className="c3-reel" ref={barRef} role="img" aria-label="Thanh kéo cá: giữ con cá trong khung xanh">
    <div className="c3-reel-track"><i className="c3-reel-zone" /><i className="c3-reel-fish"><Fish aria-hidden="true" /></i></div>
    <div className="c3-reel-progress"><i /></div>
  </div>
);

export const CatchCard = ({ result, onClose }) => (
  <div className={`c3-catch ${RARITY_CLASS[result.fish.rarity] || ""}`} role="status">
    <button type="button" className="c3-close" onClick={onClose} aria-label="Đóng"><X aria-hidden="true" /></button>
    <span className="c3-catch-icon"><Fish aria-hidden="true" /></span>
    <div>
      <small>{result.first ? "Lần đầu câu được" : result.record ? "Kỷ lục mới của bạn" : "Bạn câu được"}</small>
      <strong>{result.fish.name}</strong>
      <span>{result.fish.rarity === "junk" ? "Thôi thì cũng bán được chút vàng" : `Dài ${result.fish.size} cm`}</span>
    </div>
    <b className="c3-gold"><Coins aria-hidden="true" />+{result.fish.gold}</b>
  </div>
);

/** The tackle stall: rods to buy with gold, and the book of fish caught so far. */
export const TackleShop = ({ wallet, catalog, onBuy, onClose }) => {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const buy = async (rod) => {
    setBusy(rod.id);
    setError("");
    try { await onBuy(rod.id); } catch (problem) { setError(problem.message); }
    setBusy("");
  };
  return (
    <div className="c3-veil" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="c3-dialog c3-shop" role="dialog" aria-modal="true" aria-label="Tiệm cần câu" onKeyDown={(event) => { if (event.key === "Escape") onClose(); event.stopPropagation(); }} onKeyUp={(event) => event.stopPropagation()}>
        <button type="button" className="c3-close" onClick={onClose} aria-label="Đóng" autoFocus><X aria-hidden="true" /></button>
        <h1>Tiệm cần câu</h1>
        <p className="c3-dialog-lead">Bạn đang có <b className="c3-gold"><Coins aria-hidden="true" />{wallet.gold}</b> vàng. Vàng đến từ cá câu được và từ mỗi bài học làm xong lần đầu.</p>
        <ul className="c3-rods">
          {catalog.rods.map((rod) => {
            const owned = wallet.rods.includes(rod.id);
            const using = wallet.rod === rod.id;
            return (
              <li key={rod.id} className={using ? "is-using" : ""}>
                <div><strong>{rod.name}</strong><small>{rod.luck === 0 ? "Cần đầu tiên của mọi người" : `Khung kéo cá rộng hơn, cá quý cắn câu nhiều hơn`}</small></div>
                <button type="button" disabled={using || Boolean(busy) || (!owned && wallet.gold < rod.price)} onClick={() => buy(rod)}>
                  {using ? "Đang dùng" : owned ? "Dùng cần này" : <><Coins aria-hidden="true" />{rod.price}</>}
                </button>
              </li>
            );
          })}
        </ul>
        {error && <p className="c3-dialog-error" role="alert">{error}</p>}
        <h2>Sổ cá ({Object.keys(wallet.fish).length}/{catalog.fish.length} loài)</h2>
        <ul className="c3-fishbook">
          {catalog.fish.map((fish) => {
            const entry = wallet.fish[fish.id];
            return (
              <li key={fish.id} className={`${RARITY_CLASS[fish.rarity]} ${entry ? "" : "is-unknown"}`}>
                <Fish aria-hidden="true" />
                <span>{entry ? fish.name : "Chưa câu được"}<small>{entry ? `${entry.count} con, lớn nhất ${entry.best} cm` : catalog.rarities[fish.rarity]}</small></span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
