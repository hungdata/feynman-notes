import { useEffect, useRef, useState } from "react";
import { BookUp, FileText, Loader2, X } from "lucide-react";
import { uploadBook } from "./api";
import { ProgressBar } from "./LearnChrome";

const MAX_MB = 80;

const UploadBookDialog = ({ canGenerate, onClose, onUploaded, school = "general", schoolName = "", heading = "Thêm sách để học" }) => {
  const [file, setFile] = useState(null);
  const [language, setLanguage] = useState("vi");
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal?.();
    return () => dialog?.close?.();
  }, []);

  const pick = (candidate) => {
    if (!candidate) return;
    if (!/\.pdf$/i.test(candidate.name) && candidate.type !== "application/pdf") { setError("Hãy chọn một tệp PDF."); return; }
    if (candidate.size > MAX_MB * 1024 * 1024) { setError(`Tệp lớn hơn ${MAX_MB} MB.`); return; }
    setError("");
    setFile(candidate);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    try {
      const result = await uploadBook(file, { language, title: title.trim(), school }, setProgress);
      onUploaded(result.course);
    } catch (uploadError) {
      setError(uploadError.message);
      setUploading(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="ln-dialog" aria-labelledby="upload-title" onCancel={(event) => { event.preventDefault(); if (!uploading) onClose(); }}>
      <form onSubmit={submit}>
        <header>
          <h2 id="upload-title"><BookUp /> {heading}</h2>
          <button type="button" className="icon-btn is-small" aria-label="Đóng" onClick={onClose} disabled={uploading}><X /></button>
        </header>

        <button
          type="button"
          className={`ln-drop ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files?.[0]); }}
          disabled={uploading}
        >
          <FileText />
          {file ? (
            <><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · bấm để đổi tệp</small></>
          ) : (
            <><strong>Kéo thả sách PDF vào đây</strong><small>hoặc bấm để chọn tệp (tối đa {MAX_MB} MB, PDF có chữ, không phải bản scan)</small></>
          )}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(event) => pick(event.target.files?.[0])} />

        <div className="ln-form-row">
          <label>Tên khóa học <span>(không bắt buộc)</span>
            <input value={title} maxLength={200} placeholder="Lấy theo tên sách" onChange={(event) => setTitle(event.target.value)} disabled={uploading} />
          </label>
          <label>Ngôn ngữ bài học
            <select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={uploading}>
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        {schoolName && <p className="ln-upload-school">Lớp mới sẽ được mở ở <strong>{schoolName}</strong>.</p>}
        <ol className="ln-howto">
          <li>Máy chủ đọc mục lục và tách sách thành từng <strong>chương</strong>.</li>
          <li>AI rút <strong>ý chính</strong> của mỗi chương và chia thành các <strong>bài 3 phút</strong> với câu hỏi trắc nghiệm.</li>
          <li>Cuối chương có bài <strong>ôn tập</strong>; toàn bộ kiến thức có thể xuất thành <strong>mind map</strong>.</li>
        </ol>

        {!canGenerate && <p className="ln-alert is-warn">Chưa cấu hình AI (AI_BASE_URL, AI_API_KEY, AI_MODEL trong <code>backend/.env</code>). Sách vẫn được tách chương, cấu hình xong bấm “Thử lại”.</p>}
        {error && <p className="ln-alert is-error" role="alert">{error}</p>}
        {uploading && <div className="ln-uploading"><ProgressBar value={progress} label="Đang tải sách lên" /><small>{progress < 1 ? `Đang tải lên ${Math.round(progress * 100)}%` : "Đang mở sách…"}</small></div>}

        <footer>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={uploading}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={!file || uploading}>{uploading ? <Loader2 className="spin" /> : <BookUp />} Tạo lộ trình</button>
        </footer>
      </form>
    </dialog>
  );
};

export default UploadBookDialog;
