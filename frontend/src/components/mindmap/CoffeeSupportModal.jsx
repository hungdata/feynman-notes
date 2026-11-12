import { useEffect, useState } from "react";
import { Check, Coffee, Copy, Heart, Landmark, X } from "lucide-react";

const VARIANTS = {
  coffee: { icon: Coffee, kicker: "ỦNG HỘ DỰ ÁN", title: "Mời admin một ly cà phê", message: "Cảm ơn bạn đã giúp Feynman Notes có thêm động lực để tiếp tục phát triển.", amountLabel: "Số tiền ủng hộ", transfer: "UNG HO FEYNMAN NOTES", note: "Đây là khoản ủng hộ hoàn toàn tự nguyện. Cảm ơn sự đồng hành của bạn!" },
  tuition: { icon: Landmark, kicker: "PHÒNG TÀI VỤ", title: "Đóng học phí", message: "Học phí giúp duy trì máy chủ và trợ giảng AI cho cả trường.", amountLabel: "Học phí", transfer: "HOC PHI FEYNMAN NOTES", note: "Học phí đóng tự nguyện, không bắt buộc để học. Cảm ơn bạn đã đồng hành cùng trường!" },
};

const CoffeeSupportModal = ({ onClose, variant = "coffee" }) => {
  const text = VARIANTS[variant] || VARIANTS.coffee;
  const Icon = text.icon;
  const transferContent = text.transfer;
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
        <span><Icon /></span>
        <div><small>{text.kicker}</small><h2 id="coffee-title">{text.title}</h2></div>
        <button type="button" onClick={onClose} aria-label="Đóng"><X /></button>
      </header>

      <p className="coffee-message"><Heart /> {text.message}</p>
      <div className="coffee-payment">
        <div className="coffee-qr"><img src="/api/support/qr" alt="QR chuyển khoản ủng hộ admin" /></div>
        <div className="coffee-details">
          <span>{text.amountLabel}</span>
          <div className="coffee-any-amount"><strong>Tùy tâm</strong><small>Bạn vui lòng tự nhập số tiền mong muốn trong ứng dụng ngân hàng.</small></div>
          <span>Nội dung chuyển khoản</span>
          <button type="button" onClick={() => copy(transferContent, "content")}><strong>{transferContent}</strong>{copied === "content" ? <Check /> : <Copy />}</button>
          <small>MB Bank · DƯƠNG TẤN HƯNG · 0905849110</small>
        </div>
      </div>

      <div className="coffee-note">{text.note}</div>
    </section>
  </div>;
};

export default CoffeeSupportModal;
