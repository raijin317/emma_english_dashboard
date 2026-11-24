# Bản online trên Cloudflare Workers

Cùng một mã nguồn chạy được hai bản:

| | 🏠 Bản ở nhà (máy tính gia đình) | 🌐 Bản online (Cloudflare) |
|---|---|---|
| Nhập sách PDF, AI Studio (Claude), tạo / làm lại bài | ✅ | ❌ (chỉ làm ở nhà) |
| Sửa, duyệt, ẩn, xoá bài · chọn hình · quy tắc bài học | ✅ | 👀 chỉ xem |
| Bé học, chơi game, nhận sao / sticker / cúp | ✅ | ✅ |
| Hồ sơ bé, tiến độ, mã PIN, cài đặt | ✅ (file `data/app.db`) | ✅ (lưu trong **D1**, giữ nguyên qua mỗi lần cập nhật) |
| Giọng đọc | Giọng tự nhiên (tạo trên máy) hoặc giọng trình duyệt | Giọng tự nhiên **đã tạo ở nhà** hoặc giọng trình duyệt |

Bài học, hình và giọng đọc được **làm ở nhà**, xuất ra thư mục dự án, rồi **commit + push** lên GitHub. Cloudflare tự build lại và dùng bản mới.

---

## A. Cài đặt một lần

### 0. Để repository GitHub ở chế độ **Private**
Các file online gồm hình cắt từ sách, bài đọc của sách và giọng đọc. Sách có bản quyền, nên đừng để repository ở chế độ Public:
GitHub → repository `emma_english_dashboard` → **Settings** → **General** → *Danger Zone* → **Change visibility** → **Private**.

### 1. Tạo cơ sở dữ liệu D1 (lưu hồ sơ bé, tiến độ, PIN)
1. Vào https://dash.cloudflare.com → **Storage & Databases** → **D1 SQL Database** → **Create**.
2. Tên: `emma-english-db` → **Create**.
3. Sao chép **Database ID**, dán vào `wrangler.jsonc` ở dòng `"database_id"` (thay cho `00000000-…`), rồi commit + push.

(Cách khác, dùng dòng lệnh: `npx wrangler login`, sau đó `npx wrangler d1 create emma-english-db`.)
Không cần tạo bảng: app tự tạo ở lần chạy đầu tiên.

### 2. Tạo Worker và nối với GitHub (tự build mỗi lần push)
1. **Workers & Pages** → **Create application** → **Import a repository** (Continue with GitHub) → chọn `emma_english_dashboard`.
2. Điền:
   - **Project name**: `emma-english-dashboard` (phải **trùng** với `name` trong `wrangler.jsonc`)
   - **Build command**: `npm run cf:build`
   - **Deploy command**: `npx opennextjs-cloudflare deploy`
3. **Save and Deploy**. Lần đầu mất khoảng 3–5 phút. Địa chỉ trang sẽ có dạng `https://emma-english-dashboard.<tên-tài-khoản>.workers.dev`.

### 3. Khoá trang bằng Cloudflare Access (rất nên làm)
Mã PIN trong app chỉ là khoá để bé không tự vào phần phụ huynh. Nó **không bảo vệ** được trang khi đã lên internet.
Workers & Pages → `emma-english-dashboard` → tab **Access** → **Protect this Worker behind Access** → **All traffic** → chọn chính sách đăng nhập (email của gia đình) → **Apply Access**.
Lần đầu Cloudflare sẽ yêu cầu bật **Zero Trust** cho tài khoản.

### 4. Lần đầu mở trang online
- **Parent** → tạo mã PIN 4 số.
- **Children** → thêm bé, tích sách và chủ đề cho bé.
  Cũng có thể mang hồ sơ và tiến độ từ máy nhà lên: ở máy nhà vào **Settings → 💾 Export backup**, rồi ở trang online vào **Settings → ⬆️ Restore from file**.

---

## B. Mỗi lần có bài mới (sách mới, topic mới, sửa bài)

1. **Ở máy nhà**: mở app (`Start_English_Dashboard.bat`) → nhập sách / tạo topic trong AI Studio / sửa bài → **Approve**.
2. Đợi giọng đọc chuẩn bị xong (Settings có hiện tiến độ), hoặc bấm **🎙️ Prepare voices**.
3. **Settings → 🌐 Online version → 📦 Prepare the online files** (hoặc chạy `npm run online:export`).
   - Nếu báo *"N sentence(s) had no voice yet"*: đợi giọng đọc làm xong rồi bấm lại.
4. **Commit + push** những thay đổi trong `content/online/` và `public/online/` (bằng GitHub Desktop hoặc `git`).
5. Cloudflare tự build và cập nhật sau khoảng 3–5 phút. Hồ sơ bé, tiến độ và PIN online **được giữ nguyên**.
6. Topic mới: vào trang online → **Children → Edit** → tích topic cho bé.
   (Việc giao topic cho bé được lưu riêng ở mỗi bản.)

Những gì **không** được đưa lên: bài nháp, file PDF và ảnh trang sách, các cuộc chat và file đính kèm trong AI Studio, hồ sơ và tiến độ của bé ở máy nhà.

---

## C. Giới hạn và chi phí

- **Workers Free**: 100.000 request mỗi ngày, **10 ms CPU** mỗi request (Cloudflare cho phép thỉnh thoảng vượt một chút).
  Các trang bài học được build sẵn nên Worker chỉ việc gửi file (đo trên máy: khoảng 10–40 ms thời gian thực, so với 150–400 ms nếu phải render).
  Các API (lưu sao, tải bài, hồ sơ bé) vẫn chạy trong Worker.
  Nếu trang hay báo **Error 1102 – Worker exceeded resource limits**, hãy nâng lên **Workers Paid ($5/tháng, 30 giây CPU mỗi request)**: Workers & Pages → *Plans*.
- **D1 Free**: 5 triệu lượt đọc/ngày, 100.000 lượt ghi/ngày, 5 GB. Thừa cho một gia đình.
- **Dung lượng**: một cuốn sách khoảng 22 MB giọng đọc (MP3) và 1–2 MB hình. File cũ không còn dùng được xoá ở lần xuất sau.

---

## D. Thử bản online trên máy trước khi push (không bắt buộc)

```
npm run cf:preview      # build bản online, rồi mở http://127.0.0.1:8787 (D1 giả lập trong .wrangler/)
```
- Trên Windows, OpenNext sẽ báo *"not fully compatible with Windows"*. Bản này đã được chạy thử trên Windows và hoạt động bình thường. Cloudflare thì build trên Linux.
- Sau khi chạy `cf:preview`, lần mở app ở nhà kế tiếp bằng `.bat` sẽ tự build lại bản nhà (khoảng 1 phút).

## E. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Bước cài thư viện báo `onnxruntime-node … Failed to download the binaries: 404` | File `.npmrc` trong repo đã tắt bước tải bản GPU này (bản online không cần; máy nhà dùng bản CPU có sẵn). Kiểm tra `.npmrc` đã được push. Nếu sau này npm báo không còn nhận dòng đó, vào Worker → **Settings → Build → Build variables** thêm `ONNXRUNTIME_NODE_INSTALL_CUDA` = `skip` |
| Build trên Cloudflare báo tên Worker không khớp | Project name phải là `emma-english-dashboard` |
| Deploy báo không tìm thấy database / ID `00000000-…` | Chưa dán **Database ID** thật vào `wrangler.jsonc` (mục A.1) |
| Trang online báo *"The online database is missing"* | Worker chưa có D1 binding `DB`: kiểm tra `wrangler.jsonc` rồi deploy lại |
| Error 1102 | Nâng lên gói Workers Paid (mục C) |
| Bấm 🔊 mà nghe giọng "robot" | Câu đó chưa có file giọng: đợi giọng ở nhà làm xong → *Prepare the online files* → push |
| Mất bài mới sau khi push | Chưa bấm *Prepare the online files* trước khi commit |

---

## Technical notes (developers)

- **Build flag**: `npm run cf:build` (`scripts/cf-build.mjs`) runs `opennextjs-cloudflare build` with `NEXT_PUBLIC_SUNNY_ONLINE=1` → `ONLINE` in `src/lib/mode.ts`, inlined into server and browser code. It then deletes `.next/BUILD_ID` so the home `.bat` rebuilds the home app.
- **Lessons online** = `content/online/snapshot.json` (written by `scripts/online-export.ts`, bundled via `src/server/snapshot.ts`). In `src/server/repo.ts` the lesson reads use it when `ONLINE`. Routes that change lessons or need the PC are wrapped in `localOnly()` (`src/server/api.ts`) → 403 + `HOME_ONLY`.
- **Family data** (`settings`, `children`, `attempts`, `stickers`) goes through `src/server/family.ts`: home = the SQLite repo, online = D1 (binding `DB`, tables from `FAMILY_SCHEMA`, created on first use). Online settings: voice and speed come from the snapshot (the clips were made with them).
- **Static files**: `public/online/{books,topics,voice}/…`, named by `src/lib/assetKeys.ts`, which uses the same keys as the home caches (`data/tts`, `resources/.cache/*/crops`). The browser computes the URLs itself (`src/lib/sha1.ts`).
- **Workers runtime**: native packages are aliased to `src/server/homeOnlyStub.ts` (`next.config.ts`). `cacheComponents` is off online because it hangs page rendering in workerd. Lesson pages are prerendered from the snapshot (`generateStaticParams` in `src/server/onlinePages.ts`; `undefined` at home, where Cache Components rejects an empty list) and served from static assets (`open-next.config.ts`: static-assets incremental cache + cache interception). That cache is filled by `opennextjs-cloudflare deploy` / `preview`, not by plain `wrangler dev`.
- **Tests**: `tests/online.test.ts` (keys, MP3, D1 store with a fake D1), `tests/online-export.test.ts` (export end to end). The online build was also checked in `opennextjs-cloudflare preview` (workerd + local D1) with API calls and Edge.
