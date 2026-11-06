# 🪷 Báo Cáo Nghiên Cứu Kiến Trúc Game Niệm Phật Online (niemphat.online)

> **Tài liệu nghiên cứu kỹ thuật**  
> **Nhánh**: `research/niemphat-online`  
> **Mục tiêu**: Phân tích toàn diện kiến trúc hệ thống, giao thức mạng, cơ chế bảo vệ anti-cheat và xây dựng bộ Client tự động hóa cho `https://niemphat.online/`.

---

## 1. Tổng Quan Về Game

`https://niemphat.online/` là một ứng dụng web/game Phật giáo 3D trực tuyến hiện đại mô phỏng các danh lam thắng cảnh và cổ tự linh thiêng tại Việt Nam.

* **Nền tảng đồ họa**: Three.js (v0.164.1) dựng cảnh 3D thời gian thực (Chánh điện, bồ đoàn, tượng Phật, sân chùa, cây bồ đề, hoa sen, cáp treo...).
* **Hệ thống danh lam**: 20 ngôi chùa 3D lấy cảm hứng từ các danh lam 3 miền (Chùa Vô Lượng - Hà Nội, Trấn Hồ - Trấn Quốc, Động Hương Sơn - Chùa Hương, Thiền viện Đỉnh Mây - Yên Tử, Chùa Bái Sơn - Bái Đính, Chùa Vọng Hải - Đà Nẵng, Miếu Bà Thất Sơn, Chùa Cửu Phong...).
* **4 Tông phái Phật giáo**:
  * **Trúc Lâm** (🎋): Thiền phái của Vua Trần Nhân Tông (Bonus: Thiền định $\times 1.3$).
  * **Tịnh Độ** (🪷): Pháp môn niệm Phật A Di Đà (Bonus: Tràng hạt / Niệm Phật $\times 1.3$).
  * **Lâm Tế** (🏮): Dòng thiền tinh tấn lễ bái (Bonus: Lễ lạy $\times 1.3$).
  * **Tào Động** (💧): Mặc chiếu thiền, quán chiếu nội tâm (Bonus: Ngồi tĩnh $\times 1.5$, Thiền $\times 1.1$).

---

## 2. So Sánh Kiến Trúc: `didenchua.online` vs `niemphat.online`

| Tiêu chí | Đi Đến Chùa (`didenchua.online`) | Niệm Phật Online (`niemphat.online`) |
| :--- | :--- | :--- |
| **Mô hình kiến trúc** | **Monolithic WebSocket** (Tất cả gửi qua socket) | **Decoupled Hybrid** (REST HTTP + Multiplayer WS) |
| **Lưu trữ tiến độ tu tập** | WebSocket packet (`{ t: 'mo' }`, `{ t: 'beads' }`, `{ t: 'emote' }`) | **HTTP REST API** (`POST /api/practice`) có Transaction & Acknowledgment |
| **Xác thực danh tính** | Cookie / Session ID / URL token | **JWT Bearer Token** (`Authorization: Bearer <token>`) |
| **Độ tin cậy khi mạng gián đoạn** | Dễ bị mất kết nối (Code 1008), socket rớt thì dừng | **Rất cao**: Mỗi nhịp tu tập gửi HTTP POST độc lập, máy chủ phản hồi trạng thái tức thì |
| **Tác vụ của WebSocket** | Gánh toàn bộ logic game, nhiệm vụ, công đức | **Chỉ xử lý đồng bộ sự hiện diện 3D**: tọa độ avatar `(x, y, z)`, biểu cảm `emote`, hiệu ứng công quả |
| **Quy mô thế giới** | 1 Chùa (hoặc phòng phân mảnh `chua-1`) | **20 Chùa 3D**, có tuyến hành hương, sổ lữ hành xuyên Việt |

---

## 3. Cơ Chế Bảo Vệ & Giới Hạn Tần Suất (Anti-Cheat & Rate Limits)

Qua việc giải mã mã nguồn client (`api.js`, `main.js`), hệ thống áp dụng các quy chuẩn kỹ thuật nghiêm ngặt:

### 3.1. Proof of Challenge khi Đăng Ký Tài Khoản
* Khi mở app hoặc chuẩn bị tạo tài khoản, client gọi `GET /api/challenge` nhận mã thử thách `c` (gồm timestamp + chữ ký số).
* Máy chủ quy định: **Mã thử thách phải được tạo trước thời điểm gửi `POST /api/register` ít nhất 2.200 ms** (2,2 giây). Nếu gửi quá sớm, máy chủ từ chối đăng ký để ngăn bot spam tạo tài khoản hàng loạt.

### 3.2. Điều Tiết Lượt Tu Tập (`PRACTICE_GAP`)
* Máy chủ quy định ngưỡng Token Bucket: **Tối đa 1 lượt `/practice` mỗi giây cho mỗi tài khoản**.
* Client nguyên bản sử dụng hàng đợi với khoảng cách:
  $$\text{PRACTICE\_GAP} = 1.200\text{ ms}$$
  Nếu gọi nhanh hơn ngưỡng này, máy chủ sẽ trả về lỗi **HTTP 429 (Too Many Requests)**.

### 3.3. Xác Thực Sự Hiện Diện Bằng WebSocket (Temple Presence Verification)
* Một số tính năng tâm linh và nhận thưởng lớn (như Vòng quay may mắn `POST /api/wheel`, nhặt hoa sen lộc quanh chùa `POST /api/loc/claim`) yêu cầu nhân vật phải **thực sự đang đứng trong chùa**.
* Cơ chế kiểm tra: Tài khoản phải đang duy trì một kết nối WebSocket mở tới `wss://niemphat.online/ws?token=<token>&temple=<templeId>` và đã gửi gói `{ t: 'join', temple: '<templeId>', v: 4, gv: 1 }`. Nếu chưa có WebSocket kết nối, API sẽ trả về `HTTP 400: "Hãy vào chùa rồi quay nhé"`.

---

## 4. Danh Mục API Toàn Diện (API Catalog)

Tất cả các endpoint đều có tiền tố `/api` và sử dụng header chuẩn:
```http
Content-Type: application/json
Authorization: Bearer <token>
User-Agent: Mozilla/5.0 ...
Origin: https://niemphat.online
Referer: https://niemphat.online/
```

### 4.1. Tài Khoản & Hồ Sơ (Authentication & Profile)
* `GET /api/meta`: Tải toàn bộ danh sách chùa, tông phái, bảng cấp độ (1-100), vật phẩm cửa hàng, công đức quy đổi.
* `GET /api/challenge`: Lấy mã thử thách đăng ký.
* `POST /api/register`: Đăng ký tài khoản khách mới:
  ```json
  {
    "name": "Diệu Tâm",
    "nameSig": "client",
    "appearance": { "gender": "nam", "hair": "troc", "skin": "#f1c7a3" },
    "sect": "tinhdo",
    "robe": "robe_nau",
    "ref": null,
    "consent": true,
    "source": null,
    "proof": "<challenge_token>"
  }
  ```
* `POST /api/login`: Đăng nhập bằng tên đăng nhập + mật khẩu (`{ username, password }`).
* `POST /api/account`: Cài đặt tên đăng nhập và mật khẩu cho tài khoản khách (`{ username, password, current: "" }`).
* `GET /api/me`: Lấy thông tin tài khoản, danh hiệu, chỉ số, tài sản (Sen, Ngọc).
* `PUT /api/me`: Cập nhật ngoại hình và tên nhân vật.

### 4.2. Nghiệp Vụ Tu Tập Trọng Tâm (`POST /api/practice`)
Mỗi lần gọi thành công đều trả về:
* `gained`: Số điểm công đức nhận được.
* `user`: Hồ sơ tài khoản sau khi cộng điểm, lên cấp.
* `questsDone`: Danh sách các quest vừa hoàn thành đủ điều kiện nhận thưởng.
* `q`: Ma trận cập nhật tiến độ tất cả nhiệm vụ `[ [quest_id, progress, claimed, done], ... ]`.

**Các phân loại tu tập (`type`)**:
1. `visit`: `{ type: "visit", temple: "voluong" }` — Viếng thăm chùa, mở sổ hành hương.
2. `bow`: `{ type: "bow", count: 3, lite: true, temple: "voluong" }` — Lạy Phật sám hối.
3. `bead`: `{ type: "bead", count: 9, lite: true, temple: "voluong" }` — Lần tràng hạt niệm Phật.
4. `mo`: `{ type: "mo", count: 10, lite: true, temple: "voluong" }` — Gõ mõ tụng kinh (hoặc `{ auto: true }`).
5. `bell`: `{ type: "bell", temple: "voluong" }` — Thỉnh đại hồng chung.
6. `sit`: `{ type: "sit", lite: true, temple: "voluong" }` — Ngồi tĩnh trên bồ đoàn.
7. `meditate_start` & `meditate_end`: `{ type: "meditate_start"|"meditate_end", temple: "..." }` — Thiền định.
8. `stroll`: `{ type: "stroll", lite: true, temple: "voluong" }` — Kinh hành ngoài sân chùa.
9. `chant_done`: `{ type: "chant_done", sutra: "batnha", temple: "voluong" }` — Tụng trọn một bài kinh.
10. `sweep`: `{ type: "sweep", temple: "voluong" }` — Công quả quét lá sân chùa.
11. `plant`: `{ type: "plant", temple: "voluong" }` — Công quả trồng cây sân chùa.
12. `incense` / `candle` / `flower`: Cúng dường hương, hoa, nến.

### 4.3. Nhiệm Vụ & Điểm Danh & Vận May
* `POST /api/checkin`: Điểm danh ngày, nhận Sen và giữ streak.
* `POST /api/que`: Gieo quẻ thẻ đầu ngày (nhận quẻ cát tường + lời khuyên tu tập + Sen).
* `GET /api/wheel` & `POST /api/wheel`: Vòng quay may mắn (mỗi ngày 1 lượt miễn phí, trúng Sen, nến, hương, đồ quý).
* `POST /api/quests/:id/claim`: Nhận thưởng nhiệm vụ ngày (`d_...`), nhiệm vụ tuần (`w_...`) hoặc thành tựu (`a_...`).
* `GET /api/pilgrim`: Sổ hành hương theo dõi tiến độ viếng thăm 20 ngôi chùa.
* `GET /api/loc?temple=...` & `POST /api/loc/claim`: Nhận lộc hoa sen vàng xuất hiện quanh khuôn viên chùa.

---

## 5. Thư Viện Client Đã Xây Dựng & Kiểm Thử Thành Công

Chúng em đã phát triển sẵn Client mẫu tại:
* [`research/niemphat/client.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/research/niemphat/client.js): Bộ Client hoàn chỉnh hỗ trợ vượt challenge, pacing tự động $\ge 1.250\text{ ms}$, kết nối WebSocket đồng bộ phòng và đầy đủ phương thức tu tập.
* [`research/niemphat/test_client.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/research/niemphat/test_client.js): Kịch bản kiểm thử trực tiếp máy chủ `niemphat.online`.

### Kết quả chạy kiểm thử thực tế (Live Test):
```text
=== KHỞI CHẠY KIỂM THỬ CLIENT NIEMPHAT.ONLINE ===

1. Đang tải /api/meta...
- Tên ứng dụng: Niệm Phật Online
- Danh sách tông phái: truclam, tinhdo, lamte, taodong
- Số lượng chùa 3D: 20
- Ngôi chùa đầu tiên: Chùa Vô Lượng (voluong)

2. Đang tạo tài khoản tu tập mới (vượt challenge)...
✅ Đã đăng ký thành công!
- Token: 82d5278283ad441ab24d846bf8448246c16d16ded0a3738b
- Pháp danh: Liễu Nhã Hùng
- Tông phái: tinhdo
- Cấp độ: 1 (Công đức: 0/80)
- Tài sản: 100 Sen, 0 Ngọc

3. Bắt đầu thực hiện chuỗi thời khóa tự động (Daily Routine)...
✅ Kết quả thời khóa hàng ngày:
- WebSocket: Connected
- Điểm danh: Chuỗi 1 ngày (+10 Sen)
- Gieo quẻ: Đại an - "Bóng mát bồ đề": Có người đang âm thầm che chở, hãy biết ơn.
- Thỉnh chuông: +5 công đức
- Vòng quay lộc: Trúng nen_sap
- Nhận thưởng nhiệm vụ: [ { id: 'd_chuong', name: 'Thỉnh chuông', reward: { sen: 10 } } ]

4. Thực hiện tu tập: 3 lạy sám hối + 10 tiếng mõ...
- Lạy Phật: +5 công đức (Tổng lạy: 1)
- Gõ mõ: +10 công đức (Tổng tiếng mõ: 10)

5. Tổng kết sau thời khóa tu tập:
- Pháp danh: Liễu Nhã Hùng
- Cấp độ: 1 (Công đức: 30/80)
- Sen: 125 | Ngọc: 0
- Thống kê: {"bows":1,"mo":10}

🎉 KIỂM THỬ THÀNH CÔNG RỰC RỠ!
```

---

## 6. Kết Luận & Định Hướng Mở Rộng

1. **Khả năng tự động hóa vượt trội**: `niemphat.online` có cấu trúc API phân tách vô cùng chuẩn mực, giúp việc xây dựng bot tự chơi hoặc bot làm nhiệm vụ hàng ngày trở nên **ổn định hơn rất nhiều so với `didenchua.online`** (không phụ thuộc gói packet WebSocket thô sơ).
2. **Tiềm năng tích hợp**: Hoàn toàn có thể phát triển thêm CLI hoặc web dashboard riêng cho `niemphat.online` tương tự như giao diện của `didenchua`.
3. **An toàn Git**: Nhánh `research/niemphat-online` được tạo độc lập song song với `main`, mọi mã nguồn và file nghiên cứu được lưu cục bộ an toàn, tuân thủ tuyệt đối quy định không push khi chưa có lệnh.

