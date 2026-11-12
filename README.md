# Feynman Notes

Ứng dụng mind map trực quan theo phong cách **SimpleMind Pro**, kèm AI Teacher giúp học theo phương pháp Feynman và mục **Học**: tải một cuốn sách PDF lên, AI soạn lộ trình học kiểu Coddy theo từng chương. React + React Flow ở frontend, Express ở backend, lưu bằng tệp JSON trên máy hoặc MongoDB khi triển khai.

## Chạy trên máy trong 1 phút

Cần Node.js 22 trở lên (tính năng đọc sách PDF cần Node 22; mind map chạy được từ Node 20).

```bash
npm run dev
```

Lần đầu lệnh này tự cài thư viện cho `backend` và `frontend`, sau đó chạy API ở `http://localhost:5051` và giao diện ở `http://localhost:5173` (tự mở trình duyệt).

Không cần file `.env`, không cần MongoDB, không cần đăng nhập:

- Dữ liệu lưu bằng tệp JSON trong `backend/data/` (đã nằm trong `.gitignore`).
- `AUTH_SESSION_SECRET` được tự sinh cho môi trường dev.
- **Chế độ local**: mở app trên chính máy chạy server là vào thẳng, dữ liệu thuộc về “Máy của bạn” và không bị mất khi cookie hết hạn.

Muốn một địa chỉ duy nhất cho cả giao diện và API: `npm run build && npm start`, rồi mở `http://localhost:5051`.

| Lệnh | Việc làm |
| --- | --- |
| `npm run dev` | Chạy backend + frontend cùng lúc |
| `npm run setup` | Chỉ cài thư viện |
| `npm test` | Chạy toàn bộ test |
| `npm run lint` | Kiểm tra code frontend |
| `npm run build` / `npm start` | Bản production (API phục vụ luôn giao diện) |

## Sân trường (màn hình chính)

Mở app là vào **sân trường**: một bạn học sinh đứng giữa ba ngôi trường.

- **Trường Mind Map** (`/mindmaps`): bên trong là hành lang lớp học. Mỗi mind map là một phòng học, mỗi thư mục là một tầng. Bấm cửa để vào phòng vẽ (`/mindmap`). Phòng trống thì mở mind map mới.
- **Trường Lộ trình học** (`/learn`): hành lang có bảng tin (học tiếp, chuỗi ngày, XP). Mỗi cuốn sách là một lớp, trong lớp có bảng đen ghi tên khóa và mục lục bài học.
- **Trường Checklist** (`/tasks`): danh sách việc cần làm viết trên bảng đen bằng phấn, có ngày ở góc bảng như ở lớp. Gõ việc rồi nhấn Enter để ghi lên bảng. Bấm vào việc để tick (có tiếng phấn), bấm đúp để sửa, dùng giẻ lau để xóa, bấm “Hoàn tác” để lấy lại. Lọc nằm trên khay phấn.
Trang sân trường cuộn rất dài, mỗi khu một cảnh (menu bên phải để nhảy tới từng khu):

- **Sân bóng đá online**: bấm **Vào đá bóng ngay** để điều khiển nhân vật trong trận dùng chung bóng và tỉ số với người chơi thật.
- **Sân bóng rổ online**: bấm **Vào chơi bóng rổ ngay** để dẫn bóng, ngắm rổ, canh lực ném 2 hoặc 3 điểm.
- **Nhà giải trí** (`/giai-tri`): hành lang phòng trò chơi. **Phòng bida** (`/giai-tri/bida`) là game bida 8 bi: chơi với máy hoặc hai người cùng máy. Nắm cây cơ kéo để xoay hoặc bấm trên bàn để ngắm (có đường ngắm), kéo thanh Lực xuống rồi thả để đánh; phím ← → ngắm, giữ Space rồi thả để đánh. Ô Xoáy chọn điểm đánh trên bi cái (cao: đi theo, thấp: giật lùi, lệch ngang: đổi góc khi chạm băng). Bi có hai pha trượt rồi lăn như thật. Luật: chia bi màu/bi sọc, phạm lỗi thì đối thủ được đặt bi cái, bi 8 vào lỗ sớm là thua.
- **Khu ngoại ngữ**: Trường Tiếng Anh, Trường Tiếng Nhật, Trường Tiếng Hàn (`/schools/english|japanese|korean`). Mỗi trường có hành lang lớp học riêng. Sách tải vào trường nào thì AI soạn bài theo kiểu học ngoại ngữ: từ vựng, mẫu câu, ngữ pháp, kèm phiên âm (IPA, hiragana/romaji, romanization) và nghĩa tiếng Việt.
- **Phòng tài vụ**: quầy thu học phí, bấm để xem mã QR chuyển khoản (số tiền tùy tâm, nội dung `HOC PHI FEYNMAN NOTES`).

Rê chuột (hoặc Tab) vào một trường thì bạn học sinh đi tới và nói nhanh tình hình (số mind map, bài học tiếp theo, số việc còn lại). Bấm vào trường thì bạn ấy đi vào cửa rồi mở trường đó. Quanh sân có các bạn ngồi đọc sách, một lớp học ngoài trời với cô giáo đang giảng bài. Bầu trời đổi theo giờ thật: sáng, trưa/chiều, hoàng hôn, đêm có sao và đèn cửa sổ. Từ mọi trang đều có nút **Sân trường** để quay lại.

### Sân trường 3D (`/san-truong-3d`)

Bấm **Đi dạo sân trường 3D** ở sân trường để vào khung cảnh 3D của cả ngôi trường (vẽ bằng three.js, không tải file mô hình hay hình ảnh nào).

- **Nhân vật riêng**: đăng nhập Google hoặc vào bằng khách, chọn nam/nữ và đặt tên 2–20 ký tự. Máy chủ giữ tên duy nhất trên toàn sân, không phân biệt hoa/thường, chuẩn hóa Unicode và khoảng trắng. Tên và ngoại hình được lưu theo tài khoản; khách giữ cookie để quay lại nhân vật cũ. Chế độ local không được dùng làm danh tính chung của người chơi.
- **Người chơi thật**: các trình duyệt cùng kết nối một máy chủ sẽ thấy nhau di chuyển, tên trên đầu và danh sách online. NPC đi dạo vẫn là cảnh nền, không tính vào số người online. Một tài khoản mở nhiều tab chỉ có một nhân vật.
- **Đi lại**: phím mũi tên hoặc WASD, giữ **Shift** để chạy. Trên màn hình có bốn nút mũi tên và nút **Chạy** cho điện thoại, máy tính bảng. "Lên" luôn là đi ra xa máy quay.
- **Nhìn**: kéo chuột (hoặc vuốt) để xoay góc nhìn, lăn chuột để phóng to, thu nhỏ. Tường và tán cây che mất nhân vật sẽ tự mờ đi.
- **Vào trường**: đi tới cửa, vòng vàng hiện dưới đất thì nhấn **Enter** (hoặc bấm nút vàng). Tám nơi vào được: ba trường chính, ba trường ngoại ngữ, Nhà giải trí, Phòng tài vụ. Nút **Đi nhanh tới** mở danh sách các nơi này cho ai không muốn đi bộ.
- **Bóng đá**: bấm nút môn hoặc đi nhanh tới sân, tự chia hai đội Đỏ/Xanh. WASD/mũi tên để chạy tới bóng, giữ rồi thả **Space** để sút theo hướng đang nhìn; nút **Sút bóng** dùng lực mặc định. Di chuyển gần bóng để rê bóng. Cả hai gôn ghi bàn và bóng trở về giữa sân. Mỗi người tự điều khiển, không có đội NPC đóng giả người chơi.
- **Bóng rổ**: đến gần bóng để nhặt, di chuyển để dẫn bóng, bấm **Ngắm rổ** để hướng về rổ đội bạn. Giữ/thả **Space** để canh lực theo vạch xanh, hoặc bấm nút ném để dùng lực gợi ý. Hướng và lực quyết định vào/trượt; tính 2/3 điểm theo khoảng cách. Đến gần đối thủ rồi bấm để cướp bóng. Có thể tập một mình trước khi bạn bè vào.
- **Cảnh nền**: 28 học sinh NPC tự đi tới lớp, vào cửa rồi đi ra; đi gần thì các bạn chào. Góc đông có lớp học ngoài trời.
- Bản đồ nhỏ ở góc phải cho biết bạn đang ở đâu. Nút trời đổi giữa sáng, ngày, chiều tà, tối. Lần sau quay lại, bạn đứng đúng chỗ đã rời đi.

**Chơi nhiều máy:** `npm run build --prefix frontend && npm start` rồi mở `http://<IP-máy-chủ>:5051/san-truong-3d` trên các thiết bị cùng mạng. Dùng chính địa chỉ IP này khi sao chép link mời; `localhost` chỉ dùng được trên máy đang mở. Hoặc chạy frontend dev bằng `npm run dev --prefix frontend -- --host 0.0.0.0` và dùng cổng 5173.

**Chơi qua Internet / Google:** triển khai cả frontend và backend lên một máy chủ Node có HTTPS, đặt `APP_BASE_URL`, `FRONTEND_URL`, `AUTH_SESSION_SECRET` và lưu trữ bền vững (`DATA_DIR` hoặc MongoDB). Đăng nhập Google cần `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, callback được khai báo chính xác là `{APP_BASE_URL}/api/auth/google/callback`. Thiếu cấu hình thì nút Google báo chưa bật; khách vẫn chơi được. Không đưa khóa bí mật vào frontend.

**Vận hành:** một sân dùng một Node process, giới hạn 128 danh tính kết nối. Vật lý và điểm số do máy chủ quyết định (30 Hz), SSE cập nhật trạng thái 10 Hz; người chơi chỉ gửi vị trí/hướng/thao tác. Mất kết nối sẽ dọn nhân vật và thả bóng đang giữ; tự kết nối lại, không mô phỏng kết quả online trên máy khách. Chưa hỗ trợ chia sẻ trận giữa nhiều process/replica. Proxy cần cho phép SSE, không buffer `/api/campus/events` và giữ kết nối dài.

Mã nằm ở `frontend/src/campus3d/` (cảnh, điều khiển, giao diện chọn nhân vật và kết nối), `backend/src/campus/` và `backend/src/routes/campusRouter.js` (hồ sơ và phiên online), `shared/campusSports.mjs` (luật hai môn dùng chung). `npm test` chạy cả kiểm thử hai người qua SSE thật, tranh chấp tên, ngắt/kết nối lại và luật ghi điểm.

## Tính năng (giống SimpleMind Pro)

- **Bố cục tự động**: Ngang 2 phía, Sang phải, Dọc 2 phía, Sơ đồ tổ chức, Danh sách, Dòng thời gian, Hướng tâm, Ma trận và Tự do. Mỗi nhánh có thể dùng bố cục riêng (ví dụ một nhánh dạng danh sách trong mind map ngang). Khoảng cách Gọn / Vừa / Thoáng.
- **16 style sheet** (sáng và tối): Mặc định, Pastel, Cầu vồng, Chuyên nghiệp, Vòng tròn màu, Tối giản, Đại dương, Rừng xanh, Hoàng hôn, Giấy cổ, Đơn sắc, Feynman cổ điển, Ban đêm, Bảng phấn, Neon, Bản thiết kế. Đường nhánh cong thon dần như SimpleMind.
- **Kiểu từng topic**: hình dạng (bo góc, chữ nhật, viên thuốc, tròn, gạch chân, không viền), màu nền/viền/chữ, cỡ chữ, đậm/nghiêng, căn lề, độ rộng, màu nhánh, viền bao nhánh, sao chép/dán kiểu.
- **Nội dung topic**: ghi chú, liên kết, ngày, nhãn, checkbox với thanh tiến độ ở nhánh cha, 100+ icon, emoji, mức ưu tiên/tiến độ, ảnh trong topic hoặc ảnh rời, đánh số tự động.
- **Liên kết chéo** có nhãn, mũi tên, nét đứt, kéo để uốn cong.
- **Thư viện**: thư mục, yêu thích, gần đây, thùng rác (khôi phục được), đổi tên, nhân bản, ảnh thu nhỏ.
- **Bảng thuộc tính** 6 tab (⌘1…⌘6): Ghi chú · Kiểu · Mẫu (style sheet) · Icon · Dàn ý · AI Teacher.
- **Brainstorm** (⌘B) và **dán văn bản thành nhiều topic**; **trình chiếu** từng nhánh (F5); tập trung một nhánh; tìm kiếm; giao diện sáng/tối.
- **Xuất/nhập**: PNG, SVG, PDF, in; OPML, FreeMind `.mm`, Markdown, văn bản thụt lề, HTML, lịch `.ics`, bản sao lưu `.json`.
- **AI Teacher**: giải thích, tranh luận, kiểm tra đúng–sai một topic; có thể tìm thêm nguồn web (Brave Search).

### Phím tắt chính

| Phím | Việc làm |
| --- | --- |
| `Tab` / `Enter` / `⇧Enter` | Thêm topic con / cùng cấp / cùng cấp phía trên |
| `F2`, `Space` hoặc gõ chữ | Sửa topic đang chọn |
| Mũi tên · `⌘↑` `⌘↓` | Chọn topic bên cạnh · đổi thứ tự |
| `⌫` · `⇧⌫` | Xóa nhánh · xóa topic nhưng giữ topic con |
| `⌘Z` `⇧⌘Z` `⌘C` `⌘X` `⌘V` `⌘D` | Hoàn tác, làm lại, sao chép, cắt, dán, nhân bản |
| `⌘B` · `⌘L` · `⌘.` | Brainstorm · liên kết chéo · thu gọn/mở nhánh |
| `⌘1…⌘6` · `⌘\` · `⌘F` · `F5` | Bảng thuộc tính · thư viện · tìm kiếm · trình chiếu |

Trên Windows dùng `Ctrl` thay cho `⌘`. Xem đầy đủ trong app: **Phím tắt & trợ giúp**.

## Học từ sách (lộ trình AI kiểu Coddy)

Mở nút **Học** trên thanh công cụ, hoặc **Học từ sách** ở cuối thư viện, hoặc vào `http://localhost:5173/learn`.

1. **Thêm sách PDF** (PDF có chữ, không phải bản scan, tối đa 80 MB). Máy chủ đọc mục lục và tách sách thành từng chương. Ở bước này sách không được gửi đi đâu.
2. Với mỗi chương, AI rút ra **6–12 ý chính** và chia thành **3–6 bài học 3 phút**. Mỗi bài có 1–2 thẻ ý chính và 3–4 câu **trắc nghiệm** (chủ yếu 4 lựa chọn, đôi khi Đúng/Sai), không phải gõ chữ. Cuối mỗi chương có bài **Ôn tập chương** do hệ thống tự ghép từ câu hỏi của các bài. Mỗi bước ghi số trang trong sách để bạn đọc thêm.
3. **Khi học**: thứ tự đáp án được xáo lại mỗi lần, chọn bằng chuột hoặc phím A–D / 1–4, nhấn Enter để kiểm tra. Câu sai quay lại cuối bài. Có **âm thanh** khi chọn, đúng, sai, chuỗi đúng liên tiếp và khi hoàn thành bài (nút loa để tắt). Có XP, chuỗi ngày học 🔥 và mục tiêu 30 XP mỗi ngày. Nút “Báo câu sai” ẩn câu AI soạn chưa đúng.
4. **Trang khóa học** có mục lục chương, ý chính của từng chương và lộ trình bài học. Các bài mở khóa lần lượt; bật “Học không theo thứ tự” nếu muốn tự chọn bài.
5. **Mind map kiến thức** tạo một mind map của cả cuốn sách (thư mục “Khóa học”): các chương, ý chính của từng chương (chi tiết trong ghi chú), các bài học kèm tick đã học, và nội dung từng thẻ ý chính. Bấm lại để cập nhật theo tiến độ mới.

Mỗi người dùng có thư viện sách, lộ trình và tiến độ riêng. Chương nào AI lỗi (hết hạn mức, mất kết nối…) sẽ có nút **Thử lại**. Server khởi động lại thì các chương đang soạn dở tự chạy tiếp.

**Cấu hình AI**: điền vào `backend/.env` (không bao giờ đưa key lên frontend hay git):

```env
AI_BASE_URL=http://127.0.0.1:8045/v1   # mọi API chuẩn OpenAI: proxy trên máy, OpenAI, OpenRouter, Gemini…
AI_API_KEY=...
AI_MODEL=gemini-3.8-flash-high          # phải khớp đúng tên model mà endpoint hỗ trợ
```

Khi chạy, backend in ra `AI: bật – <model> qua <endpoint>`. Thiếu AI thì vẫn học được các khóa đã có.

**Khóa học ví dụ**: mọi tệp khóa học `*.json` trong `backend/data/examples/` được thêm một lần vào thư viện của “Máy của bạn” (chế độ local). Tệp có `exampleVersion` lớn hơn sẽ thay bản cũ và giữ tiến độ. Xóa trong app thì khóa đó không quay lại nữa.

## Cấu hình (`backend/.env`, tất cả đều tùy chọn)

Sao chép `backend/.env.example` thành `backend/.env` khi cần bật thêm tính năng.

| Biến | Ý nghĩa |
| --- | --- |
| `MONGODB_CONNECTION_STRING` | Có → dùng MongoDB. Bỏ trống → lưu tệp trong `DATA_DIR` |
| `STORAGE` | `auto` (mặc định), `mongo` hoặc `file` |
| `DATA_DIR` | Thư mục lưu tệp (mặc định `backend/data`) |
| `LOCAL_MODE` | `auto` (mặc định), `on`, `off` — tự đăng nhập khi mở trên chính máy chạy server. Không bao giờ bật ở production |
| `AUTH_SESSION_SECRET` | Bắt buộc ở production (≥ 32 ký tự ngẫu nhiên) |
| `APP_BASE_URL`, `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Đăng nhập Google |
| `ALLOWED_ORIGINS` | Origin frontend khi frontend và backend khác domain |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | AI chuẩn OpenAI cho AI Teacher và tạo lộ trình từ sách (ưu tiên dùng) |
| `COURSE_AI_CONCURRENCY`, `COURSE_AI_TIMEOUT_MS` | Số chương AI soạn song song (mặc định 2), thời gian chờ mỗi chương (mặc định 300000 ms) |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN`, `CLOUDFLARE_AI_MODEL` | AI Teacher qua Cloudflare (cách 2) |
| `BRAVE_SEARCH_API_KEY` | Nguồn web cho AI Teacher |

Khi khởi động, backend in ra bảng tóm tắt: địa chỉ, kiểu lưu trữ, tính năng nào đang bật và cần thêm biến gì. `GET /api/health` trả về cùng thông tin.

Nếu đã đặt `MONGODB_CONNECTION_STRING` nhưng không kết nối được: ở dev, server tạm dùng tệp và báo rõ; ở production, server vẫn chạy, trả `503` và tự thử kết nối lại.

## API

Mọi route cần đăng nhập (cookie phiên) hoặc chế độ local. Lỗi luôn trả JSON dạng `{ "message": "...", "code": "..." }`. `GET /api` liệt kê toàn bộ endpoint.

| Method | Đường dẫn | Việc làm |
| --- | --- | --- |
| `GET` | `/api/health` | Trạng thái, kiểu lưu trữ, tính năng đang bật |
| `GET` | `/api/mindmaps` | Danh sách đầy đủ `{ documents }`; `?view=summary` → `{ maps }` |
| `POST` | `/api/mindmaps` | Tạo mới: `{ title, topics: [] }` hoặc `{ document }` |
| `GET` | `/api/mindmaps/:id` | Lấy một mind map |
| `PUT` | `/api/mindmaps/:id` | Lưu toàn bộ: `{ document }` hoặc gửi thẳng document |
| `PATCH` | `/api/mindmaps/:id` | Sửa `title`, `folder`, `favorite`, `description` |
| `POST` | `/api/mindmaps/:id/duplicate` | Nhân bản |
| `DELETE` | `/api/mindmaps/:id` | Chuyển vào thùng rác; `?permanent=true` để xóa hẳn |
| `POST` | `/api/mindmaps/:id/restore` | Khôi phục |
| `GET` | `/api/mindmaps/:id/export?format=md` | Tải về: `json`, `md`, `txt`, `opml` |
| `POST` / `GET` / `DELETE` | `/api/assets/images[/:assetId]` | Tải lên, xem, xóa ảnh |
| `GET` · `POST` | `/api/ai/status` · `/api/ai/chat` | AI Teacher |
| `GET` · `POST` | `/api/courses` | Thư viện khóa học + XP/chuỗi ngày · tải sách (multipart `pdf`, `language`, `title`) → `202` |
| `GET` `PATCH` `DELETE` | `/api/courses/:id` | Khóa học + tiến độ · đổi tên · xóa |
| `POST` | `/api/courses/:id/retry` | Soạn lại chương lỗi (`{ stageId }` tùy chọn) |
| `POST` | `/api/courses/:id/lessons/:lessonId/complete` | Hoàn thành bài: `{ firstTryCorrect, mistakes, day }` → XP |
| `POST` | `/api/courses/:id/report` | Báo câu sai (ẩn câu đó) |
| `POST` | `/api/courses/:id/mindmap` | Tạo hoặc cập nhật mind map kiến thức của cả cuốn sách |
| `POST` | `/api/courses/:id/grade` | Chấm bài tự giải thích (cho khóa cũ có loại câu này) |
| `GET` `POST` `PUT` `DELETE` | `/api/tasks[/:id]` | Danh sách công việc |

Ví dụ (chạy trên máy, chế độ local nên không cần cookie):

```bash
# Tạo mind map có sẵn 3 nhánh
curl -X POST localhost:5051/api/mindmaps -H 'Content-Type: application/json' \
  -d '{"title":"Ôn thi Vật lý","topics":["Động học","Động lực học","Năng lượng"]}'

# Đánh dấu yêu thích và cho vào thư mục
curl -X PATCH localhost:5051/api/mindmaps/<id> -H 'Content-Type: application/json' \
  -d '{"favorite":true,"folder":"Học tập"}'

# Xuất dàn ý Markdown
curl -OJ "localhost:5051/api/mindmaps/<id>/export?format=md"
```

Mỗi topic trong `document.nodes` có dạng `{ id, type: "topic", position: { x, y }, data: { label, parentId, note, ... } }`. Chỉ `id` và `data.parentId` là bắt buộc; app tự điền phần còn lại và tự sắp xếp vị trí.

## Triển khai production

Triển khai cả repository như một Node web service:

- Build: `npm run build` · Start: `npm start`
- Biến bắt buộc: `NODE_ENV=production`, `AUTH_SESSION_SECRET`, `MONGODB_CONNECTION_STRING` (hoặc `DATA_DIR` trỏ tới ổ đĩa bền vững)

Express phục vụ cả API và giao diện React đã build. Không commit file `.env` và không đặt thông tin đăng nhập vào biến `VITE_` (biến `VITE_` bị nhúng vào code trình duyệt). Dùng tài khoản MongoDB giới hạn quyền, đổi mọi mật khẩu từng bị commit và giới hạn network access của Atlas.

### Đăng nhập Google

Đặt `AUTH_SESSION_SECRET`, `APP_BASE_URL` (không có `/` cuối), `FRONTEND_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` và đăng ký callback `{APP_BASE_URL}/api/auth/google/callback`. Phiên dùng thử dùng cookie HttpOnly có chữ ký và ID riêng nên dữ liệu không lẫn với người khác.

## Ứng dụng macOS

Ứng dụng Electron mở bản production trong cửa sổ native, không chứa secret hay thông tin cơ sở dữ liệu. Google sign-in mở trong trình duyệt mặc định rồi quay lại app qua callback localhost ngắn hạn.

```bash
npm install --prefix desktop
npm run desktop:dev
npm run desktop:build:mac        # Apple Silicon
npm run desktop:build:mac:intel  # Intel
```

Bản build nằm trong `desktop/dist`. Phát hành ngoài Mac App Store cần ký và notarize bằng Apple Developer; bản chưa ký có thể mở bằng menu **Open** trong Finder.

## Liên hệ

- Dương Tấn Hưng — AI Engineer
- Email: [duongtanhung24@gmail.com](mailto:duongtanhung24@gmail.com)
- Phone: [0905 559 946](tel:+84905559946)
- GitHub: [hungdata](https://github.com/hungdata)
