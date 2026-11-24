# Emma English Studio (01_Dashboard_English)

A bright, family-friendly English dashboard for practising at home with your children, built from your own textbooks.

- What it does: [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md)
- Build status: [docs/BUILD_PROMPTS.md](docs/BUILD_PROMPTS.md)
- Where to put the books: [resources/book/README.md](resources/book/README.md)

## Requirements
- Node.js 22.5+ (uses the built-in `node:sqlite`; tested on Node 26)
- Chrome or Edge (en-US voices and speech recognition)
- Claude Code, for reading books and AI generation. The app **automatically uses the Claude Code that comes with the VS Code extension** (same login), or `claude` on PATH. Check with `npm run claude:check`.
  Without it, the app still works with the demo book and the **⚡ Quick pack (no AI)**.

## Cách mở ứng dụng (cho phụ huynh)
1. Nhấp đúp file **`Start_English_Dashboard.bat`** trong thư mục này.
2. Đợi một chút — trình duyệt sẽ tự mở trang **http://127.0.0.1:3210**.
   (Lần đầu tiên sẽ lâu hơn vì máy cài đặt và chuẩn bị ứng dụng.)
3. **Không tắt cửa sổ đen** khi đang học. Học xong, đóng cửa sổ đen để tắt ứng dụng.
4. Lỡ đóng trình duyệt? Nhấp đúp lại file `.bat` — nó chỉ mở lại trang, không khởi động lại.

## Start (developers)
```
npm install
npm run dev        # http://127.0.0.1:3000, hot reload
```
The `.bat` runs the production build on port 3210 (it rebuilds automatically when files in `src/` change, or when the project folder was moved or renamed).

- **Child mode** (`/`): pick your avatar → My World → islands → activities, stars and stickers.
- **Parent area** (`/parent`): first visit asks you to create a 4-digit PIN.

## Thêm sách và cho bé học
1. Parent → **Books** → bấm **📤 Upload a PDF book** và chọn file sách
   (hoặc chép file PDF vào thư mục `resources/book/` rồi bấm **Import**).
2. App tự làm hết: đọc sách → tìm các unit → đánh giá độ tuổi →
   **tạo bộ bài học cho từng unit** (từ vựng, nghe, nói, ngữ pháp, đọc, trò chơi, quiz, phiếu bài tập, giáo án, bài kiểm tra) → chuẩn bị giọng đọc.
   Một cuốn sách mất khoảng 20–60 phút; trong lúc đó vẫn dùng app bình thường.
3. Parent → **Children** → **Edit**: tích chọn **những sách bé học**. Bé sẽ thấy bài của các sách đó ngay.
4. Giọng đọc: Parent → **Settings** → chọn giọng (mặc định *Heart* — giọng tự nhiên, ấm áp).

## Quy tắc tạo bài & chỉnh sửa bài
- Parent → **📏 Lesson rules**: các quy tắc app luôn tuân theo khi tạo bài từ sách
  (chỉ dùng từ/câu trong unit · dùng hình của chính cuốn sách · bài Reading là câu đọc trong sách · rõ ràng, dễ hiểu cho bé).
  Có thể sửa lời, tắt/bật từng quy tắc, thêm quy tắc riêng (viết tiếng Việt cũng được).
  Quy tắc mới áp dụng cho bài tạo sau đó — muốn áp dụng cho bài cũ: vào sách → **♻️ Remake all lessons**.
- **Hình trong sách**: trang unit → tab **📖 From the book** → bấm vào hình của từ để khoanh lại đúng hình trên trang sách, rồi **💾 Save**.
  Ở đây cũng sửa được **câu trong sách** và **bài đọc** (Reading).
- **Sửa một bài học**: mở bài (✏️ Edit · 👀 Preview) → sửa chữ, từ, lựa chọn, đáp án ngay trong form, xem trước bên phải → **💾 Save changes**.

## AI Studio: tạo bài từ file của bạn
- Parent → **🤖 AI Studio** → bấm **📎** (hoặc kéo thả file vào khung chat, hoặc dán ảnh chụp màn hình bằng Ctrl+V).
- Dùng được: **ảnh** (PNG, JPG…), **PDF**, **Word (.docx)**, **Excel (.xlsx, .csv)**, **PowerPoint (.pptx)** — tối đa 8 file, mỗi file 30 MB.
- Chọn một gợi ý (ví dụ **✨ Make a practice topic from this file**) hoặc tự gõ yêu cầu → Claude đọc chữ và xem hình trong file rồi thiết kế bài học → **💾 Save as draft topic**.
- File Word/Excel/PowerPoint đời cũ (.doc/.xls/.ppt) hoặc ảnh HEIC của iPhone: app sẽ hướng dẫn lưu lại sang định dạng mới.
- File chỉ nằm trên máy này (thư mục `data/studio/`); xoá cuộc chat là xoá luôn file.

### Hình cho topic AI Studio (Claude tự vẽ theo phong cách bạn đính kèm)
- Muốn hình theo một phong cách: **đính kèm 1–2 ảnh mẫu** trong khung chat (tranh vẽ, trang sách, sticker bé thích…).
- Sau khi bấm **💾 Save as draft topic**, app tự làm hình cho từng từ (khoảng 1–3 phút, chạy nền):
  1. Claude **xem ảnh mẫu** và ghi lại phong cách (màu, nét viền, hình khối, nền) — chỉ lấy *phong cách*, không chép nhân vật/logo;
     không có ảnh mẫu thì Claude **tự chọn phong cách hợp với topic**.
  2. Claude **vẽ từng từ** theo đúng phong cách đó (lời chào/từ khó vẽ thì giữ emoji).
  3. Claude **tự kiểm tra** các hình vừa vẽ và **vẽ lại** hình nào bé khó nhận ra hoặc lệch phong cách.
- Mở topic trong **✨ Inspiration** → phần **🖼️ Pictures**:
  - **🎨 Picture style**: xem ảnh mẫu và mô tả phong cách; **➕ Add a style picture** / ✕ để thêm, bớt ảnh mẫu (tối đa 4), rồi **🎨 Draw all again**.
  - Từng từ: **Change picture** → **🎨 Claude, draw it** (vẽ lại từ đó) hoặc dùng lại emoji.
- Kiểu mặc định là **🎨 Claude draws** — không tìm gì trên mạng. Đổi ở **Settings → Pictures for AI Studio topics**:
  *Web pictures + drawings* (Claude chọn ảnh có giấy phép mở trên Openverse, phần còn lại tự vẽ; chỉ gửi *từ cần tìm*) hoặc *Emoji only*.

### Cho bé học topic từ AI Studio
1. Lưu topic (**💾 Save as draft topic**) → mở topic trong **✨ Inspiration** → **✅ Approve topic**.
2. Vào **Children** → **Edit** bé muốn học → tích topic ở mục **Extra topics (from AI Studio)** → **Save**.
3. Topic chỉ hiện (thành “Bonus island”) cho bé đã được tích. Bỏ tích là bé không thấy nữa.
   Trang của topic có ghi topic đang dành cho bé nào.

## Trò chơi (mini game)
- Có **11 trò chơi**, mỗi trò đều có hoạt hình, âm thanh và nhân vật riêng:
  🎣 **Go fishing** (nghe từ → câu chú cá mang hình đó) · 😋 **Feed Munchy** (chú quái vật đói đòi món gì → chạm hoặc kéo hình vào miệng) ·
  🔍 **I spy** (chỉ thấy một phần hình qua kính lúp → tìm đúng từ) · 🐹 **Pop-up friends** (bạn thú nhô lên từ hang → chạm nhanh đúng bạn) ·
  🦜 **Copy the parrot** (vẹt nói 2–3 từ → chạm hình theo đúng thứ tự) · 🚦 **Go, car, go!** (xem hình, nghe từ → bấm xanh *Yes* / đỏ *No*, xe chạy về đích) ·
  🚀 **Rocket words** (đọc chữ trên hành tinh, chọn đúng từ → đầy nhiên liệu thì tên lửa phóng; cho bé đã biết đọc) ·
  🧠 Memory match (lật thẻ 3D) · 🎈 Balloon pop · 🐝 Spelling bee (bé đã biết viết) · 🧺 Sort into baskets.
- **Mỗi unit / mỗi topic có 2 trò chơi**, app tự chọn theo chủ đề (biển → câu cá, đồ ăn → Munchy, xe cộ → đua xe, nông trại/sở thú → thú nhô lên…),
  **khác với các unit ngay trước** và hai trò chơi theo hai kiểu chơi khác nhau, để bé không bị lặp lại nhàm chán.
  Bấm **🔁 Play again** thì thứ tự cũng đổi.
- Topic từ AI Studio: Claude chọn 2 trò chơi hợp chủ đề; nếu thiếu, app tự thêm cho đủ 2.
- Muốn đổi trò chơi: mở trò chơi → ✏️ Edit → ô **Game** chọn trò khác → **💾 Save** (dùng chung danh sách từ).
- Sách đã nhập trước đây: các trò chơi tự tạo cũ (Memory + Balloon + Spelling ở mọi unit) được **tự đổi một lần** sang 2 trò chơi hợp chủ đề;
  trò chơi bạn đã sửa thì giữ nguyên. Sao bé đã đạt vẫn còn.

## Khi bé trả lời sai
- App báo rõ: đáp án sai có dấu ❌, chuyển màu đỏ và bị khoá; hiện khung **“Oops! That's not right. Try again!”** và đọc to “Oops! Try again.”
- Bé phải chọn lại đến khi đúng thì mới có nút **Next**. Sai 2 lần thì đáp án đúng sẽ phát sáng để gợi ý.
- Áp dụng cho quiz, bài kiểm tra, bài nghe, câu hỏi sau bài đọc/ngữ pháp, và mọi trò chơi.
- Sao (⭐) chỉ tính những câu bé làm đúng ngay lần đầu.

## Luyện nói: nghe lại giọng mình
- Ở phần **Speak**, bé bấm **🎤 Now you say it!** rồi nói. Nói xong bấm **👂 Hear myself** để nghe lại giọng mình, bấm 🔊 để nghe lại giọng mẫu.
- Bản ghi **không được lưu**: chỉ nằm tạm trong trình duyệt và tự xoá khi bấm Next hoặc thoát ra.

## Album sticker và cúp
- Sticker Book có **14 trang chủ đề** (động vật trên cạn, dưới biển, côn trùng, xe cộ, robot, thuyền, vũ trụ, nông trại, chim, trái cây, đồ ngọt, âm nhạc, thể thao, thời tiết), mỗi trang 8 sticker.
- Cứ 5 ⭐ bé được 1 sticker, dán lần lượt từng trang. **Đầy một trang → được 1 cúp** (đồng → bạc → vàng); số cúp là **level** của bé.
- Bé bấm vào sticker để nghe tên tiếng Anh. Phụ huynh xem level ở **Children** và **Home**.
- Sticker cũ của các bé đã được chuyển sang album mới (giữ nguyên số lượng, cộng thêm sticker nếu số sao đã đủ).

## Giọng đọc nhanh hơn
- Bấm vào loa hoặc một từ: giọng phát gần như ngay. Câu bé bấm luôn được làm trước mọi việc khác; trong lúc chờ nút hiện ⏳.
- Bài đọc dài phát ngay câu đầu, các câu sau được chuẩn bị trong lúc đang đọc.
- App tự chuẩn bị giọng cho tất cả bài học ở chế độ ngầm (cả sau khi đổi giọng hoặc tốc độ) — xem tiến độ ở **Settings**.

## Giọng đọc ngắt câu
- Bài đọc được đọc **từng câu, từng dòng**, có khoảng nghỉ tự nhiên; nghỉ lâu hơn giữa các đoạn; nút 🐢 (đọc chậm) nghỉ lâu hơn nữa.
- Hội thoại: không đọc tên người nói (“A:”, “Mai:”); chỗ trống “____” được ngừng một nhịp ngắn.

## 🌐 Bản online (Cloudflare)
- Bé học được ở bất cứ đâu qua internet: trang online có bài học, hình, giọng đọc tự nhiên, sao, sticker và hồ sơ bé.
- Nhập sách, AI Studio và sửa bài **chỉ làm ở máy nhà**. Làm xong thì vào **Settings → 🌐 Online version → 📦 Prepare the online files**, rồi commit + push; Cloudflare tự cập nhật.
- Cài đặt lần đầu (D1, Worker, khoá trang bằng Cloudflare Access) và cách xử lý sự cố: [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md).

## For production use at home
```
npm run build
npm start
```
