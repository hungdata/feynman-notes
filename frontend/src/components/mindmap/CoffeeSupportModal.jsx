import { useEffect, useState } from "react";
import { Check, Coffee, Copy, Heart, X } from "lucide-react";

const transferContent = "UNG HO FEYNMAN NOTES";

const CoffeeSupportModal = ({ onClose }) => {
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const copy = async (value, field) => {
    await navigator.clipboard.writeText(String(value));
    setCopied(field);
    window.setTimeout(() => setCopied(""), 1_500);
  };

  return <div className="support-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="coffee-modal" role="dialog" aria-modal="true" aria-labelledby="coffee-title">
      <header className="coffee-modal-header">
        <span><Coffee /></span>
        <div><small>ỦNG HỘ DỰ ÁN</small><h2 id="coffee-title">Mời admin một ly cà phê</h2></div>
        <button type="button" onClick={onClose} aria-label="Đóng"><X /></button>
      </header>

      <p className="coffee-message"><Heart /> Cảm ơn bạn đã giúp Feynman Notes có thêm động lực để tiếp tục phát triển.</p>
      <div className="coffee-payment">
        <div className="coffee-qr"><img src="/api/support/qr" alt="QR chuyển khoản ủng hộ admin" /></div>
        <div className="coffee-details">
          <span>Số tiền ủng hộ</span>
          <div className="coffee-any-amount"><strong>Tùy tâm</strong><small>Bạn vui lòng tự nhập số tiền mong muốn trong ứng dụng ngân hàng.</small></div>
          <span>Nội dung chuyển khoản</span>
          <button type="button" onClick={() => copy(transferContent, "content")}><strong>{transferContent}</strong>{copied === "content" ? <Check /> : <Copy />}</button>
          <small>MB Bank · DƯƠNG TẤN HƯNG · 0905849110</small>
        </div>
      </div>

      <div className="coffee-note">Đây là khoản ủng hộ hoàn toàn tự nguyện. Cảm ơn sự đồng hành của bạn!</div>
    </section>
  </div>;
};

export default CoffeeSupportModal;
