# 🪷 BÁO CÁO NGHIÊN CỨU & KIẾN TRÚC TỰ CHƠI THÔNG MINH (AUTONOMOUS SELF-PLAYING)
> **Dự án:** Đi Đến Chùa Online (`didenchua.online`)  
> **Nhánh phát triển:** `feature/autonomous-play`  
> **Mục tiêu:** Xây dựng hệ thống tự hành thông minh, tự nhận diện công đức/tiến độ từ máy chủ, tự đổi việc khi bão hòa, chuyển sang chế độ tu tập tích luỹ dài hạn và tự động canh đúng các khung giờ sự kiện hệ thống (Đố vui 20:00 UTC+7, Thắp đèn Chánh điện 16:30 - 21:30 UTC+7).

---

## 1. BỐI CẢNH & PHƯƠNG HƯỚNG BÀI TOÁN

Trong trò chơi tĩnh tâm trực tuyến **Đi Đến Chùa**, các hoạt động tu tập và công quả được chia làm ba nhóm chính:
1. **Nhiệm vụ giới hạn hàng ngày (Daily Quota):** Chỉ ghi nhận công đức hoặc tiến độ một số lần nhất định trong ngày (ví dụ: điểm danh, xin chữ, dâng hương, thả hoa đăng, quét lá, thăm thú...).
2. **Nhiệm vụ có điều kiện khung giờ (Time-Gated Events):**
   - **Thắp đèn dầu Chánh điện:** Chỉ mở từ **16:30 đến 21:30 UTC+7**.
   - **Đố vui Phật pháp trực tiếp:** Chỉ diễn ra lúc **20:00 UTC+7** (sảnh mở từ 19:58 đến 20:15).
   - **Chuyển giao ngày mới:** Reset bộ đếm lúc **00:01 - 00:05 UTC+7**.
3. **Nhiệm vụ tích luỹ dài hạn vô hạn (Uncapped Accumulative Tasks):** Lạy Phật sám hối, Lăn tràng hạt niệm Phật, Gõ mõ tụng kinh, Tĩnh toạ thiền định, Tưới nước vườn hoa giúp bạn đồng tu.

Mục tiêu nghiên cứu là tạo ra một **Cỗ máy Tự chơi (Autonomous Bot)** có khả năng:
- **Tự nhận thức phản hồi:** Đo lường sự thay đổi của công đức, nhật ký, việc chùa sau mỗi hành động để biết máy chủ còn ghi nhận hay đã đạt ngưỡng bão hòa (cap).
- **Tự đổi việc:** Khi một việc chạm trần, tự động chuyển ngay sang việc tiếp theo trong danh sách ưu tiên mà không cần can thiệp thủ công.
- **Tự chuyển trạng thái treo tích luỹ:** Sau khi hoàn thành và chốt nhận thưởng toàn bộ nhiệm vụ ngày, tự động chuyển sang cày công đức vô hạn (lạy Phật, chuỗi hạt, thiền).
- **Tự canh giờ thực tế:** Luôn theo dõi đồng hồ UTC+7; khi đến giờ sự kiện (thắp đèn, đố vui trực tiếp), bot tự động ngắt trạng thái thiền/lạy để thực hiện đúng thời khắc thiêng liêng.
- **Tôn trọng người dùng:** Khi phát hiện Phật tử đăng nhập vào game ở trình duyệt/thiết bị khác (`WebSocket close policy 1008: "Chùa đang mở ở nơi khác"`), bot lập tức nhường phiên, không tranh giành session.

---

## 2. KIẾN TRÚC HỆ THỐNG TỰ CHƠI (SYSTEM ARCHITECTURE)

```
                            ┌──────────────────────────────────────────┐
                            │          DiDenChua Client (WS)           │
                            └────────────────────┬─────────────────────┘
                                                 │ onMessage()
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        FEEDBACK TRACKER (Bộ Nhận Diện Ghi Nhận)                        │
│  - Chụp Snapshot (Trước vs Sau)                                                        │
│  - Nhận diện: deltaMerit | questDeltas | journalDeltas | choreChanged | saturationToast│
│  - Quyết định: Còn ghi nhận (Continue) hay Đã chạm ngưỡng (Capped -> Switch Task)      │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     SCHEDULE ENGINE (Bộ Quản Lý Lịch Trình UTC+7)                      │
│  - Đồng hồ thời gian thực Asia/Ho_Chi_Minh                                             │
│  - Khung giờ Thắp đèn: 16:30 - 21:30 UTC+7                                             │
│  - Khung giờ Đố vui:   19:58 - 20:15 UTC+7 (Đỉnh điểm: 20:00)                          │
│  - Khung giờ Reset:    00:01 - 00:05 UTC+7                                             │
│  - Tính toán đếm ngược đến sự kiện kế tiếp                                             │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        AUTONOMOUS BOT (Bộ Điều Phối Trạng Thái)                        │
│                                                                                        │
│   [Giai đoạn 1: Probing Hàng Ngày]  ──>  Làm đến khi bão hòa (Cap)                     │
│                 │                                                                      │
│                 ▼                                                                      │
│   [Giai đoạn 2: Thu Nhận Thưởng]    ──>  Claim All Quests                              │
│                 │                                                                      │
│                 ▼                                                                      │
│   [Giai đoạn 3: Kiểm Tra Giờ]       ──>  Thắp đèn (16:30-21:30) / Đố vui (20:00)      │
│                 │                                                                      │
│                 ▼                                                                      │
│   [Giai đoạn 4: Treo Tích Luỹ]      ──>  Lạy Phật + Tràng hạt + Gõ mõ + Thiền          │
│                 │                        (Định kỳ canh giờ sự kiện & tưới hoa)         │
│                 └─────────────────────>  Tự động lặp lại khi sang ngày mới             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. CƠ CHẾ NHẬN DIỆN SỰ GHI NHẬN CỦA MÁY CHỦ (FEEDBACK RECOGNITION MODEL)

Sau khi gửi một gói tin hành động lên máy chủ, client chờ một khoảng trễ lắng đọng (**Settle Delay: 500 - 800ms**) và tổng hợp phản hồi từ 5 kênh dữ liệu:

### 3.1. Kênh Công đức (Merit Delta)
$$\Delta M = \max(M_{today}^{after} - M_{today}^{before}, M_{total}^{after} - M_{total}^{before}, \sum g_i.n)$$
- Nếu $\Delta M > 0$: Máy chủ xác nhận hành động vừa thực hiện mang lại công đức trực tiếp.

### 3.2. Kênh Tiến độ Nhiệm vụ (Quest Progression)
So sánh danh sách nhiệm vụ `me.quests`, `me.weekly`, `me.newbie`:
$$\Delta H_q = H_q^{after} - H_q^{before} > 0$$
Hoặc nhiệm vụ vừa chuyển sang trạng thái sẵn sàng nhận thưởng (`H_q \ge N_q` và chưa `claimed`).

### 3.3. Kênh Nhật ký Chùa (Journal Milestones)
Theo dõi các trường số liệu tích lũy vĩnh viễn trong gói `t: 'journal'`:
- `bows`: Số lạy Phật
- `beads`: Số hạt tràng hạt niệm Phật
- `sitMin`: Số phút ngồi thiền
- `incense`: Số nén hương đã dâng
- `lanterns`: Số ngọn hoa đăng đã thả

### 3.4. Kênh Việc chùa (Chores Status)
Theo dõi trạng thái hoàn thành các việc công quả (`quet`, `ca`, `cat`, `sen`, `den`). Nếu trạng thái chuyển từ `false` sang `true`, máy chủ đã ghi nhận hoàn thành.

### 3.5. Kênh Thông điệp Hệ thống (Saturation Toasts)
Phát hiện các thông báo dạng Toast từ máy chủ thông qua biểu thức chính quy (Regex):
- `/đã đạt giới hạn/i`
- `/hết lượt/i`
- `/ngày mai quay lại/i`
- `/chỉ thắp đèn từ/i`
- `/chỉ mở lúc/i`
- `/không thể thắp thêm/i`

### 3.6. Quy tắc Quyết định Ngừng & Chuyển việc (Termination Condition)
Hệ thống kết luận một hành động đã **bão hòa (Capped)** khi thỏa mãn **1 trong 2 điều kiện**:
1. Nhận được thông điệp Toast chứa mẫu bão hòa.
2. Thực hiện liên tiếp $K$ lần ($K = 2$, cấu hình qua `maxZeroAttempts`) mà không có bất kỳ ghi nhận nào ($\Delta M = 0$, không tăng nhiệm vụ, không tăng nhật ký, không đổi việc chùa).

Khi chạm ngưỡng, bot thông báo rõ lý do dừng và lập tức chuyển sang việc kế tiếp trong danh mục.

---

## 4. MA TRẬN NHIỆM VỤ HÀNG NGÀY & DANH MỤC ƯU TIÊN

| STT | Mã việc | Tên hành động | Gói tin WebSocket | Ngưỡng lặp an toàn | Điều kiện đặc biệt |
| :---: | :--- | :--- | :--- | :---: | :--- |
| **1** | `checkin` | Điểm danh ngày mới | `t: 'claim-le'` | 1 lần | Tự làm mới khi qua 0h |
| **2** | `garden` | Vườn hoa & tưới nước | `t: 'plant'`, `t: 'water'`, `t: 'pick'`, `t: 'offer-flowers'` | 1 lượt trọn gói | Tưới tối đa 40 luống bạn đồng tu |
| **3** | `xam` | Gieo quẻ xăm may mắn | `t: 'xam'` | 1 lần | Đầu ngày |
| **4** | `xinChu` | Xin chữ thư pháp | `t: 'chu-xin'`, `t: 'chu-dem'` | 1 lần | Mở khóa nhiệm vụ chữ |
| **5** | `incense` | Thắp hương Chánh điện | `t: 'incense'`, `claim: 'huong'` | 10 lần | Giới hạn nhiệm vụ ngày: 1 nén |
| **6** | `qaIncense`| Thắp hương đài Quan Âm | `t: 'qa-incense'` | 5 lần | Công quả tâm hương |
| **7** | `amIncense`| Thắp hương Am riêng | `t: 'am-incense'` | 3 lần | Am riêng tu tập |
| **8** | `phapDuong`| Viếng Pháp Đường | `t: 'visit', zone: 'Pháp Đường'` | 3 lần | Pháp đường nghe giảng |
| **9** | `lantern` | Thả hoa đăng hồ sen | `t: 'lantern'`, `claim: 'den'` | 10 lần | Giới hạn nhiệm vụ ngày: 1 ngọn |
| **10**| `tuyHy` | Tùy hỷ hoa đăng đạo hữu| `t: 'tuyhy'` | 10 lần | Hồ sen Chùa |
| **11**| `greet` | Chào hỏi vái lạy đạo hữu| `t: 'greet'`, `t: 'emote', e: 'chap'` | 5 lần | Nhiệm vụ chào |
| **12**| `quetLa` | Quét lá sân chùa | `t: 'emote', e: 'quet'`, `t: 'viec', k: 'quet'` | 15 lần | Việc chùa |
| **13**| `pet` | Chăm sóc mèo chùa | `t: 'pet-feed'`, `t: 'pet-pat'` | 10 lần | Cho ăn & vuốt ve |
| **14**| `ca` | Phóng sinh đàn cá | `t: 'viec', k: 'ca'` | 10 lần | Hồ sen Chùa |
| **15**| `khoe` | Chia sẻ danh hiệu tu tập| `t: 'khoe'` | 5 lần | Đại chúng |
| **16**| `bell` | Thỉnh đại hồng chung | `t: 'bell'` | 5 lần | Gác chuông |
| **17**| `visitAll`| Viếng thăm 10 khu vực | `t: 'visit'` (10 zones) | 1 lượt | Danh hiệu "Thăm khắp chùa" |
| **18**| `quiz` | Đố vui Phật pháp | `t: 'quiz'` (live) / `t: 'quiz-practice'` | 1 lượt | Canh đúng 20:00 UTC+7 |

---

## 5. ĐỘNG CƠ CANH GIỜ HỆ THỐNG THEO MÚI GIỜ VIỆT NAM (UTC+7)

Toàn bộ thời gian được chuẩn hóa qua `Intl.DateTimeFormat` với múi giờ `Asia/Ho_Chi_Minh` để chạy độc lập và chính xác tuyệt đối ngay cả khi server triển khai tại nước ngoài (Render, AWS, GCP chạy UTC).

### 5.1. Khung giờ Thắp đèn Chánh điện (16:30 - 21:30 UTC+7)
- **Cửa sổ thời gian:** Từ $16 \times 60 + 30 = 990$ phút đến $21 \times 60 + 30 = 1290$ phút.
- **Hành vi:**
  - Nếu bot đang chạy trong khung giờ này: Tự động bước vào Chánh điện, thắp đèn dầu Chánh điện (`t: 'lamp'`).
  - Nếu chưa tới giờ: Ghi chú thời gian còn lại đến 16:30.
  - Khi đang ở chế độ treo tích luỹ, nếu đồng hồ chạm 16:30: Bot tự động kích hoạt tiến trình thắp đèn chiều tối.

### 5.2. Khung giờ Đố vui Phật pháp trực tiếp (20:00 UTC+7)
- **Cửa sổ thời gian:** Từ 19:58 đến 20:15 UTC+7 (1198 - 1215 phút).
- **Hành vi:**
  - Đúng 19:58 - 20:00: Bot tự động di chuyển về Chánh điện, gửi gói `t: 'quiz'` để vào phòng thi đấu trực tiếp cùng các Phật tử trong server.
  - Tự động tra cứu kinh điển qua bộ dữ liệu `quiz_bank.json`, kết hợp tra cứu ngữ nghĩa và AI để trả lời câu hỏi trắc nghiệm Phật pháp.
  - Tự động nhận thưởng nhiệm vụ tuần `wDoVui`.
  - Ngoài khung giờ 20:00: Thực hiện 1 bài ôn tập 5 câu hỏi (`t: 'quiz-practice'`) để lấy thành tích tuần.

### 5.3. Khung giờ Reset ngày mới (00:01 - 00:05 UTC+7)
- Khi đồng hồ bước qua nửa đêm, hàm `checkDayRollover()` tự động phát hiện đổi ngày, làm mới toàn bộ bộ nhớ công việc, kích hoạt điểm danh và tái khởi động chu trình thăm dò ngày mới.

---

## 6. CHẾ ĐỘ TREO TÍCH LUỸ PHƯỚC ĐIỀN DÀI HẠN (IDLE STACKING MODE)

Sau khi toàn bộ nhiệm vụ ngày đã hoàn thành và chạm trần, bot tự động kích hoạt vòng lặp tu tập dài hạn:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   VÒNG LẶP TU TẬP TÍCH LUỸ (IDLE CYCLE)                │
│                                                                        │
│  1. Lạy Phật thành kính (18 lạy / hiệp -> hướng tới trăm lạy)          │
│  2. Lăn tràng hạt niệm Phật (108 hạt / hiệp -> tích lũy chuỗi tròn)    │
│  3. Gõ mõ định tâm (20 tiếng tụng niệm)                                │
│  4. Tuần tra luống hoa chùa (tưới nước tích công đức khi có bạn mới)   │
│  5. Tự động thu nhận thưởng nhiệm vụ phát sinh                         │
│  6. Tọa thiền nhập định tĩnh tâm (giữ nhịp tim heartbeat)              │
│  7. Canh chuông sự kiện (Đánh thức tức thì nếu chạm 16:30, 20:00, 00:01)│
└────────────────────────────────────────────────────────────────────────┘
```

Trong suốt thời gian tọa thiền nhập định, socket gửi heartbeat `t: 'hb'` đều đặn mỗi 15 giây để duy trì kết nối an định và đồng thời kiểm tra đồng hồ mỗi 10 giây. Nếu chạm mốc sự kiện, bot lập tức "xuất định" để làm việc chùa.

---

## 7. BIỆN PHÁP BẢO VỆ PHIÊN (ANTI-SESSION CONFLICT PROTOCOL)

Khi Phật tử mở game trên điện thoại hoặc máy tính để tự chơi:
1. Máy chủ WebSocket chùa sẽ gửi sự kiện đóng mã `1008` kèm thông báo: *"Chùa đang mở ở nơi khác"*.
2. Cỗ máy Tự chơi (`AutonomousBot`) có bộ lắng nghe chuyên biệt:
   ```javascript
   this.client.ws.addEventListener('close', (event) => {
     if (event.code === 1008) {
       log.warn('Phát hiện Phật tử đang đăng nhập chùa ở thiết bị khác.');
       log.temple('🙏', 'Bot chủ động nhường phiên tu tập để Phật tử tự trải nghiệm game.');
       this.stop('Phật tử đăng nhập nơi khác (Policy 1008)');
     }
   });
   ```
3. Bot ngay lập tức hủy mọi tác vụ đang chờ, giải phóng socket và thoát êm ái mà **tuyệt đối không thử kết nối lại để tranh giành phiên với người dùng**.

---

## 8. HƯỚNG DẪN VẬN HÀNH & KIỂM THỬ

### 8.1. Khởi chạy Cỗ máy Tự chơi
```bash
# Chạy ở chế độ Tự chơi liên tục 24/7 (Daemon mode)
npm run auto
# hoặc
node cli.js auto

# Chạy 1 chu kỳ hoàn chỉnh (thăm dò hết việc -> nhận thưởng -> kết thúc)
node cli.js auto --once

# Chạy chế độ chẩn đoán xem những việc nào đang ghi nhận / việc nào đã bão hòa
node cli.js auto --probe
```

### 8.2. Chạy Kiểm thử Đơn vị Tự động (Unit Tests)
```bash
# Chạy bộ test ngoại tuyến (offline, an toàn tuyệt đối không đụng vào server game)
node --test test/auto.test.js
```
Kết quả kiểm thử kiểm chứng:
- Nhận diện chính xác độ lệch công đức và tiến độ nhiệm vụ.
- Phát hiện tức thời thông báo chạm trần (Saturation Toast).
- Tự động ngắt vòng lặp khi máy chủ ngừng ghi nhận sau số lần cho phép.
- Tính toán chính xác các mốc giờ 16:30, 20:00, 00:01 theo múi giờ Việt Nam.

---

## 9. TỔNG KẾT & KẾT LUẬN

Nhánh `feature/autonomous-play` đã hiện thực hóa trọn vẹn 4 yêu cầu cốt lõi:
1. ✅ **Nhận diện ghi nhận máy chủ:** Đo lường công đức tức thời, tiến độ nhiệm vụ và nhật ký thành tựu; tiếp tục tích luỹ cho đến khi chạm ngưỡng bão hòa.
2. ✅ **Tự đổi việc:** Linh hoạt chuyển việc ngay khi một hành động chạm trần.
3. ✅ **Treo tích luỹ phước điền:** Chuyển sang chu kỳ lạy Phật, tràng hạt, mõ và tọa thiền sau khi hoàn thành mọi nhiệm vụ ngày.
4. ✅ **Canh giờ sự kiện chuẩn UTC+7:** Tự động kích hoạt thắp đèn Chánh điện (16:30 - 21:30), đố vui trực tiếp (20:00) và đón ngày mới reset (00:01).
5. ✅ **Bảo vệ phiên tu tập:** Chủ động nhường phiên khi Phật tử tự đăng nhập vào chùa.
