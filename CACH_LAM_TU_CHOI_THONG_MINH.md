# 🪷 CẨM NANG THÔNG TIN & CÁCH THỨC XÂY DỰNG CỖ MÁY TỰ CHƠI THÔNG MINH
> **Dự án:** Niệm Phật Online (`niemphat.online`)  
> **Nhánh phát triển:** `research/niemphat-online`  
> **Tác giả:** Antigravity (Pair Programming cùng Bạn)  
> **Ngày hoàn thành:** 06/11/2026  

---

## 📑 MỤC LỤC

1. [Yêu Cầu Bài Toán & Bối Cảnh Thực Tế](#1-yêu-cầu-bài-toán--bối-cảnh-thực-tế)
2. [Chi Tiết Cách Tôi Đã Làm (Quy Trình 9 Bước)](#2-chi-tiết-cách-tôi-đã-làm-quy-trình-9-bước)
   - [Bước 1: Tách nhánh Git an toàn & Bảo toàn phiên game](#bước-1-tách-nhánh-git-an-toàn--bảo-toàn-phiên-game)
   - [Bước 2: Giải mã giao thức phản hồi từ máy chủ](#bước-2-giải-mã-giao-thức-phản-hồi-từ-máy-chủ)
   - [Bước 3: Nâng cấp Client với kiến trúc Observer (src/client.js)](#bước-3-nâng-cấp-client-với-kiến-trúc-observer-srcclientjs)
   - [Bước 4: Xây dựng Bộ nhận diện ghi nhận (src/auto/feedback_tracker.js)](#bước-4-xây-dựng-bộ-nhận-diện-ghi-nhận-srcautofeedback_trackerjs)
   - [Bước 5: Lập trình Động cơ Lịch trình UTC+7 (src/auto/schedule_events.js)](#bước-5-lập-trình-động-cơ-lịch-trình-utc7-srcautoschedule_eventsjs)
   - [Bước 6: Lập trình Cỗ máy Tự chơi State Machine (src/auto/autonomous_bot.js)](#bước-6-lập-trình-cỗ-máy-tự-chơi-state-machine-srcautoautonomous_botjs)
   - [Bước 7: Tích hợp CLI & Quản lý Script NPM (cli.js, package.json)](#bước-7-tích-hợp-cli--quản-lý-script-npm-clijs-packagejson)
   - [Bước 8: Viết bộ kiểm thử ngoại tuyến an toàn (test/auto.test.js)](#bước-8-viết-bộ-kiểm-thử-ngoại-tuyến-an-toàn-testautotestjs)
   - [Bước 9: Soát lỗi cú pháp, Commit & Push lên GitHub](#bước-9-soát-lỗi-cú-pháp-commit--push-lên-github)
3. [Cơ Chế Hoạt Động Chi Tiết Của Các Tính Năng](#3-cơ-chế-hoạt-động-chi-tiết-của-các-tính-năng)
   - [3.1. Nhận diện sự ghi nhận & Tự đổi việc khi chạm trần](#31-nhận-diện-sự-ghi-nhận--tự-đổi-việc-khi-chạm-trần)
   - [3.2. Chế độ treo tích luỹ dài hạn (Lạy Phật, Niệm hạt, Tọa thiền)](#32-chế-độ-treo-tích-luỹ-dài-hạn-lạy-phật-niệm-hạt-tọa-thiền)
   - [3.3. Canh giờ sự kiện chuẩn UTC+7 & Đánh thức ngắt thiền](#33-canh-giờ-sự-kiện-chuẩn-utc7--đánh-thức-ngắt-thiền)
   - [3.4. Bảo vệ phiên tu tập của bạn (Nhường quyền khi phát hiện mã 1008)](#34-bảo-vệ-phiên-tu-tập-của-bạn-nhường-quyền-khi-phát-hiện-mã-1008)
4. [Bảng Tra Cứu Tệp Tin Source Code](#4-bảng-tra-cứu-tệp-tin-source-code)
5. [Hướng Dẫn Sử Dụng Cỗ Máy Tự Chơi](#5-hướng-dẫn-sử-dụng-cỗ-máy-tự-chơi)

---

## 1. YÊU CẦU BÀI TOÁN & BỐI CẢNH THỰC TẾ

Bạn đã đặt ra 4 bài toán lớn để nâng cấp bot chùa thành một **Cỗ máy Tự chơi Thông minh (Autonomous Bot)**:
1. **Nhận diện ghi nhận:** Hệ thống phải nhận biết được việc nào đang mang lại công đức, điểm tích luỹ, tiến độ nhiệm vụ... và tiếp tục làm việc đó đến khi máy chủ không còn ghi nhận thêm (chạm trần/bão hòa).
2. **Tự đổi nhiệm vụ:** Khi một việc đã bão hòa, bot tự động đổi sang nhiệm vụ khác để làm.
3. **Treo tích luỹ phước điền:** Khi hết toàn bộ nhiệm vụ hàng ngày, bot tự động chuyển sang treo các việc tích luỹ dài hạn vô hạn (lạy Phật sám hối, lăn tràng hạt niệm Phật, gõ mõ, tọa thiền...).
4. **Tự canh giờ sự kiện hệ thống:** Bot tự nhận diện thời gian theo múi giờ Việt Nam (UTC+7) để:
   - Thắp đèn dầu Chánh điện: chỉ làm từ **16:30 đến 21:30 UTC+7**.
   - Đố vui Phật pháp: chỉ tham gia lúc **20:00 UTC+7**.
   - Đón ngày mới: reset làm mới bộ đếm lúc **00:01 - 00:05 UTC+7**.

> **⚠️ Ràng buộc cốt tử:** Bạn đang trực tiếp vào game chơi trên thiết bị của mình, do đó bot **tuyệt đối không được kết nối socket vào máy chủ chùa để tranh giành session** làm bạn bị văng ra ngoài với thông báo `"Chùa đang mở ở nơi khác"`. Toàn bộ quá trình lập trình và kiểm thử phải thực hiện **hoàn toàn ngoại tuyến (offline testing & mocking)**.

---

## 2. CHI TIẾT CÁCH TÔI ĐÃ LÀM (QUY TRÌNH 9 BƯỚC)

Dưới đây là từng bước tôi đã tư duy, thiết kế và triển khai mã nguồn:

### Bước 1: Tách nhánh Git an toàn & Bảo toàn phiên game
- Để giữ nguyên nhánh chính `main` ổn định, tôi tạo và chuyển sang nhánh tính năng mới:
  ```bash
  git checkout -b feature/autonomous-play
  ```
- Tuân thủ nguyên tắc cách ly: Không chạy các lệnh `node cli.js ...` mà có mở kết nối WebSocket live tới máy chủ game nhằm giữ trọn vẹn phiên chơi cho bạn.

### Bước 2: Giải mã giao thức phản hồi từ máy chủ
Tôi khảo sát toàn bộ mã nguồn `src/client.js` và `src/tasks/` để lập bản đồ các gói tin WebSocket mà máy chủ chùa gửi về:
1. `msg.t === 'gain'`: Máy chủ thưởng công đức tức thời (`msg.n`, `msg.why`).
2. `msg.t === 'merit'`: Chứa đối tượng `me` với `total` (tổng công đức), `today` (công đức hôm nay) và danh sách mảng nhiệm vụ `quests`, `weekly`, `newbie`.
3. `msg.t === 'journal'`: Gói tin thành tựu vĩnh viễn chứa `bows` (số lạy), `beads` (số hạt niệm), `sitMin` (số phút thiền), `incense` (hương), `lanterns` (đèn)...
4. `msg.t === 'chores'`: Chứa trạng thái các việc chùa (`quet`, `ca`, `cat`, `sen`, `den`).
5. `msg.t === 'toast'` hoặc `msg.text`: Thông báo nổi thông báo trạng thái hoặc thông báo chạm ngưỡng (ví dụ: *"Hôm nay bạn đã đạt giới hạn thắp đèn"*).
6. Mã đóng WebSocket `code === 1008`: Máy chủ ngắt kết nối do trùng phiên đăng nhập.

### Bước 3: Nâng cấp Client với kiến trúc Observer (`src/client.js`)
Để các module bên ngoài có thể theo dõi phản hồi mà không can thiệp sâu vào luồng xử lý socket nội bộ, tôi bổ sung mô hình **Publisher/Subscriber**:
- Thêm `this.messageListeners = new Set();` để lưu các hàm lắng nghe sự kiện.
- Thêm hai mảng đệm ngắn hạn: `this.recentGains = [];` và `this.recentToasts = [];`.
- Trong hàm `handleMessage(msg)`:
  - Tự động phát tin nhắn cho tất cả listener đã đăng ký.
  - Tự động ghi nhận các khoản công đức tức thời vào `recentGains`.
  - Tự động ghi nhận thông điệp hệ thống vào `recentToasts`.
- Cung cấp 2 hàm tiện ích:
  - `onMessage(listener)`: Trả về hàm hủy đăng ký (`unsubscribe`).
  - `clearRecentFeedback()`: Làm sạch bộ đệm trước mỗi lần thử việc.

### Bước 4: Xây dựng Bộ nhận diện ghi nhận (`src/auto/feedback_tracker.js`)
Tôi tạo class `FeedbackTracker` với giải thuật đo lường trước - sau (Snapshot Delta):
1. **Hàm `captureSnapshot(client)`:** Chụp ảnh trạng thái tức thời gồm: tổng công đức, công đức hôm nay, Map toàn bộ các quest (`have`, `need`, `claimed`), nhật ký `journal`, việc chùa `chores`.
2. **Hàm `compareSnapshots(before, after, recentGains, recentToasts)`:**
   - Tính toán $\Delta M$: Công đức tăng thêm từ `today`, `total` hoặc tổng các `gain`.
   - Tính tiến độ nhiệm vụ: Tìm quest nào có `have` tăng lên hoặc chuyển sang trạng thái sẵn sàng nhận thưởng (`newlyClaimable`).
   - Tính tiến độ nhật ký: So sánh độ tăng của `bows`, `beads`, `sitMin`...
   - Kiểm tra Toast bão hòa: So khớp với bộ Regex các cụm từ bão hòa (`/đã đạt giới hạn/i`, `/hết lượt/i`, `/ngày mai quay lại/i`, `/chỉ thắp đèn từ/i`...).
3. **Hàm `executeUntilCapped(client, actionDef)`:**
   - Lặp lại hành động và đo lường sau mỗi lần chạy.
   - Nếu có tiến triển $\rightarrow$ Đặt lại bộ đếm `zeroRecognitionCount = 0`.
   - Nếu không có bất kỳ phản hồi nào $\rightarrow$ Tăng `zeroRecognitionCount++`.
   - Khi `zeroRecognitionCount >= 2` hoặc phát hiện Toast bão hòa $\rightarrow$ Tự động kết luận việc này đã chạm trần (Capped), dừng lại và chuyển sang việc tiếp theo.

### Bước 5: Lập trình Động cơ Lịch trình UTC+7 (`src/auto/schedule_events.js`)
- **Vấn đề thực tế:** Khi ứng dụng chạy trên cloud (Render, Heroku, Docker container), giờ hệ điều hành mặc định là **UTC+0**. Nếu dùng `new Date().getHours()` sẽ bị lệch 7 tiếng so với giờ Việt Nam, dẫn tới chạy sai toàn bộ giờ đèn và giờ đố vui!
- **Giải pháp tôi thực hiện:** Sử dụng `Intl.DateTimeFormat` chuẩn hóa múi giờ `Asia/Ho_Chi_Minh`:
  ```javascript
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', ... });
  ```
- **Xây dựng các bộ kiểm tra thời gian thực:**
  - `isLampTime(date)`: Từ 16:30 đến 21:30 (990 đến 1290 phút).
  - `isQuizTime(date)`: Sảnh mở từ 19:58 đến 20:15 (đỉnh điểm 20:00).
  - `isDayResetTime(date)`: Từ 00:01 đến 00:05.
- **Hàm `getNextScheduledEvent(date)`:** Tính toán mốc sự kiện kế tiếp và đếm ngược số giờ, phút, giây còn lại theo thời gian thực.

### Bước 6: Lập trình Cỗ máy Tự chơi State Machine (`src/auto/autonomous_bot.js`)
Tôi thiết kế class `AutonomousBot` quản lý toàn bộ vòng đời tự chơi theo 4 giai đoạn logic khép kín:
- **Giai đoạn 1 (`PROBING_DAILY`):** Duyệt qua danh mục 18 việc Phật sự hàng ngày (điểm danh, vườn hoa, quẻ xăm, xin chữ, dâng hương Chánh điện, đài Quan Âm, Am riêng, Pháp đường, thả đèn, tùy hỷ, chào bạn, quét lá, chăm mèo, cho cá ăn, khoe danh hiệu, thỉnh chuông, thăm 10 cảnh chùa). Mỗi việc được làm đến khi bão hòa rồi tự đổi việc.
- **Giai đoạn 2 (`CLAIMING_REWARDS`):** Tự động gọi `claimAllQuests()` để gom toàn bộ điểm thưởng nhiệm vụ.
- **Giai đoạn 3 (`CHECK_SCHEDULED`):** Kiểm tra đồng hồ UTC+7:
  - Nếu đang từ 16:30 - 21:30: Thắp đèn dầu Chánh điện.
  - Nếu đang là 20:00: Tham gia trận Đố vui trực tiếp; nếu ngoài giờ: Làm 1 bài ôn tập 5 câu để lấy thưởng tuần.
- **Giai đoạn 4 (`ACCUMULATING_IDLE`):** Sau khi hết toàn bộ nhiệm vụ ngày, bot chuyển sang chế độ **Treo tu tập tích luỹ dài hạn**:
  - Lạy Phật từng hiệp 18 lạy.
  - Lăn tràng hạt từng hiệp 108 hạt.
  - Gõ mõ 20 tiếng.
  - Dạo vườn hoa tưới nước các luống hoa mới khô của đạo hữu.
  - Nhập định tĩnh toạ thiền định 5 phút mỗi hiệp (có heartbeat giữ kết nối).
  - **Cơ chế ngắt thiền:** Trong lúc thiền, mỗi 10 giây bot kiểm tra đồng hồ; nếu chạm mốc 16:30, 20:00 hoặc 00:01 thì chuông báo lập tức đánh thức để làm việc chùa ngay!
- **Bảo vệ phiên tu tập:** Đăng ký sự kiện lắng nghe đóng kết nối mã `1008`. Nếu phát hiện bạn mở game ở trình duyệt khác, bot lập tức log thông báo *"Phật tử đang đăng nhập nơi khác"* và tự dừng, không tranh giành session.

### Bước 7: Tích hợp CLI & Quản lý Script NPM (`cli.js`, `package.json`)
- Bổ sung lệnh `auto`, `selfplay`, `self-play` vào `cli.js`:
  - `npm run auto`: Chạy chế độ daemon 24/7 tự chơi liên tục.
  - `node cli.js auto --once`: Chạy 1 chu kỳ hoàn chỉnh rồi dừng.
  - `node cli.js auto --probe`: Chẩn đoán trạng thái ghi nhận của từng việc.
- Cập nhật menu trợ giúp `npm run --help` và bổ sung các script vào `package.json`.

### Bước 8: Viết bộ kiểm thử ngoại tuyến an toàn (`test/auto.test.js`)
Để kiểm chứng 100% logic mà không cần kết nối tới server live của bạn:
- Tôi xây dựng bộ test tự động sử dụng `node:test` và `node:assert/strict`.
- Mô phỏng Mock Client phát sinh công đức, mô phỏng Toast chạm ngưỡng bão hòa, mô phỏng chuỗi 2 lần không phản hồi để xác thực hàm tự ngắt.
- Kiểm tra chính xác các mốc thời gian UTC+7 qua dữ liệu ngày giờ giả lập.
- Chạy lệnh `npm test` $\rightarrow$ **5/5 tests vượt qua thành công trong 136ms**.

### Bước 9: Soát lỗi cú pháp, Commit & Push lên GitHub
- Kiểm tra cú pháp toàn diện bằng `node -c`.
- Thêm toàn bộ mã nguồn vào Git và tạo commit mô tả chi tiết:
  ```bash
  git commit -m "feat(auto): research and implement autonomous self-playing engine with feedback detection, idle stacking, and UTC+7 scheduling"
  ```
- Push nhánh `feature/autonomous-play` lên GitHub thành công.

---

## 3. CƠ CHẾ HOẠT ĐỘNG CHI TIẾT CỦA CÁC TÍNH NĂNG

### 3.1. Nhận diện sự ghi nhận & Tự đổi việc khi chạm trần
```
[Bắt đầu hành động] 
       │
       ▼
Chụp Snapshot trạng thái trước (Công đức, Quests, Journal, Chores)
       │
       ▼
Gửi gói tin hành động (Thắp hương / Quét lá / Thả đèn / ...)
       │
       ▼
Nghỉ 600ms chờ máy chủ phản hồi
       │
       ▼
Chụp Snapshot trạng thái sau & Tính toán Delta
       │
       ├─► [Có tiến triển? (Delta > 0)]: Ghi nhận thành công, tiếp tục lần lặp sau
       │
       └─► [Không tiến triển? (Delta = 0)]:
                 │
                 ├─► Lần 1: Ghi nhận tạm thời không phản hồi
                 │
                 └─► Lần 2 liên tiếp: Kết luận ĐÃ CHẠM TRẦN (CAPPED)
                           │
                           ▼
                 DỪNG HÀNH ĐỘNG HIỆN TẠI
                 TỰ ĐỘNG CHUYỂN SANG NHIỆM VỤ TIẾP THEO
```

### 3.2. Chế độ tích luỹ theo mốc & Dừng lại khi hết ghi nhận (Milestone Caps & Standby)
Các hoạt động tích luỹ **không thể và không được phép chạy vô hạn** vì:
- Máy chủ chùa có hạn mức công đức và mốc thành tựu trong ngày. Sau khi đạt mốc, việc tiếp tục gửi lệnh sẽ không mang lại thêm điểm nào và gây spam vô ích.
- Do đó, hệ thống áp dụng **Mốc chỉ tiêu cụ thể** kết hợp cùng **Bộ nhận diện ghi nhận**:

| Hoạt động tích luỹ | Mốc chỉ tiêu trong ngày | Điều kiện dừng ngay lập tức |
| :--- | :---: | :--- |
| **🙇 Lạy Phật sám hối** | **108 lạy** *(Đạt danh hiệu "Trăm lạy")* | Đạt đủ 108 lạy **HOẶC** máy chủ không còn tăng điểm công đức / nhật ký sau 2 lần thử. |
| **📿 Lăn tràng hạt niệm Phật** | **108 hạt** *(Tròn 1 vòng chuỗi hạt)* | Đạt đủ 108 hạt **HOẶC** máy chủ không còn ghi nhận thêm hạt niệm mới. |
| **🔔 Gõ mõ định tâm** | **30 tiếng** *(Thời khóa tụng niệm)* | Đạt đủ 30 tiếng **HOẶC** máy chủ không còn tăng phản hồi. |
| **💧 Vườn hoa chùa** | Tối đa 40 - 50 luống hoa bạn đồng tu | Tưới hết các luống hoa khô của đạo hữu **HOẶC** không còn luống hoa nào cần tưới. |

#### Chuyển sang Chế độ Tĩnh Tâm Chờ Sự Kiện (Standby Watch Mode):
Khi toàn bộ các hoạt động tích luỹ ở trên **đã đạt đủ mốc hoặc hết nhận được ghi nhận từ máy chủ**:
1. **DỪNG HOÀN TOÀN TẤT CẢ LỆNH THAO TÁC:** Bot không gửi thêm bất kỳ lệnh lạy, chuỗi, hay mõ nào nữa để bảo toàn trạng thái thanh tịnh và không spam máy chủ.
2. **CHỈ DUY TRÌ NHỊP TIM KẾT NỐI (Heartbeat 15s):** Giữ nhân vật an định trong chùa mà không bị ngắt kết nối.
3. **CHUYỂN SANG CANH GIỜ SỰ KIỆN:**
   - Đếm ngược đến **16:30 UTC+7**: Thức dậy thắp đèn dầu Chánh điện $\rightarrow$ Thắp xong quay lại Tĩnh tâm.
   - Đếm ngược đến **20:00 UTC+7**: Thức dậy tham gia Đố vui trực tiếp $\rightarrow$ Thi đấu xong quay lại Tĩnh tâm.
   - Đếm ngược đến **00:01 UTC+7**: Thức dậy đón ngày mới $\rightarrow$ Reset mốc tích luỹ và khởi động lại chu trình ngày mới!

### 3.3. Canh giờ sự kiện chuẩn UTC+7 & Đánh thức ngắt thiền
- **Thắp đèn Chánh điện (16:30 - 21:30 UTC+7):** Cửa sổ mở đèn dầu Chánh điện để Phật tử dâng đèn tích phước.
- **Đố vui Phật pháp trực tiếp (20:00 UTC+7):** Sảnh Chánh điện mở từ 19:58 đến 20:15. Bot tự động bước vào Chánh điện, gửi gói `t: 'quiz'`, tra cứu ngân hàng Phật học 166 câu và giải thuật ngữ nghĩa để trả lời trực tiếp.
- **Reset ngày mới (00:01 - 00:05 UTC+7):** Bot nhận diện ngày mới theo giờ Việt Nam, tự động xóa bộ nhớ cấm lặp và khởi động lại chu trình điểm danh + tích lũy ngày mới.
- **Cơ chế ngắt thiền (Event-driven Wakeup):** Khi bot đang trong giấc thiền định 5 phút, nó không "ngủ say" mà kiểm tra đồng hồ mỗi 10 giây. Nếu chạm đúng 16:30 hoặc 20:00, chuông báo lập tức kích hoạt, bot lập tức "xuất định" để hoàn thành nhiệm vụ sự kiện đúng giờ.

### 3.4. Bảo vệ phiên tu tập của bạn (Nhường quyền khi phát hiện mã 1008)
- Khi bạn mở trang web hoặc ứng dụng game chùa: Máy chủ gửi thông báo đóng WebSocket mã `1008: "Chùa đang mở ở nơi khác"`.
- Bot lập tức bắt được mã này qua event listener:
  ```javascript
  this.client.ws.addEventListener('close', (event) => {
    if (event.code === 1008) {
      log.warn('Phát hiện Phật tử đang đăng nhập chùa ở thiết bị khác.');
      log.temple('🙏', 'Bot chủ động nhường phiên tu tập để Phật tử tự trải nghiệm game.');
      this.stop('Phật tử đăng nhập nơi khác (Policy 1008)');
    }
  });
  ```
- Toàn bộ tiến trình tự chơi dừng lại trong êm đẹp, trả lại kết nối trọn vẹn cho bạn.

---

## 4. BẢNG TRA CỨU TỆP TIN SOURCE CODE

| Tệp tin | Trạng thái | Vai trò trong hệ thống |
| :--- | :---: | :--- |
| [`src/auto/feedback_tracker.js`](src/auto/feedback_tracker.js) | **Mới** | Chụp Snapshot, đo lường $\Delta M$, $\Delta H_q$, $\Delta J$, phát hiện toast bão hòa và tự dừng sau 2 lần thử không tiến triển. |
| [`src/auto/schedule_events.js`](src/auto/schedule_events.js) | **Mới** | Chuẩn hóa múi giờ Việt Nam (Asia/Ho_Chi_Minh - UTC+7), kiểm tra khung giờ Thắp đèn (16:30), Đố vui (20:00), Reset (00:01). |
| [`src/auto/autonomous_bot.js`](src/auto/autonomous_bot.js) | **Mới** | Cỗ máy tự chơi điều phối 4 giai đoạn: Probing hàng ngày $\rightarrow$ Claim thưởng $\rightarrow$ Canh giờ $\rightarrow$ Treo tích luỹ vô hạn. |
| [`src/auto/index.js`](src/auto/index.js) | **Mới** | Điểm xuất (Export entry point) kết nối module `auto` với toàn dự án. |
| [`src/client.js`](src/client.js) | **Chỉnh sửa** | Thêm cơ chế Publisher/Subscriber `onMessage()`, bộ đệm `recentGains`, `recentToasts` và hàm `clearRecentFeedback()`. |
| [`cli.js`](cli.js) | **Chỉnh sửa** | Bổ sung lệnh `auto`, xử lý các tùy chọn `--once`, `--probe` và bắt tín hiệu dừng `SIGINT`/`SIGTERM`. |
| [`package.json`](package.json) | **Chỉnh sửa** | Đăng ký script `"auto": "node cli.js auto"`, `"selfplay"` và `"test"`. |
| [`test/auto.test.js`](test/auto.test.js) | **Mới** | Bộ kiểm thử tự động ngoại tuyến 5 test suites (đo delta, bão hòa, dừng vòng lặp, múi giờ UTC+7). |
| [`AUTONOMOUS_RESEARCH.md`](AUTONOMOUS_RESEARCH.md) | **Mới** | Tài liệu kiến trúc chuyên sâu, công thức toán học và ma trận thời gian thực của hệ thống tự chơi. |

---

## 5. HƯỚNG DẪN SỬ DỤNG CỖ MÁY TỰ CHƠI

Khi bạn không trực tiếp vào game và muốn bot tự động tu tập thay mình:

### 1. Chạy Tự Chơi Liên Tục 24/7 (Khuyên Dùng)
Bot sẽ tự động quét hết nhiệm vụ ngày, nhận thưởng, chuyển sang lạy Phật, niệm tràng hạt, thiền và canh đúng 16:30 thắp đèn, 20:00 đố vui, 00:01 reset ngày mới:
```bash
npm run auto
# hoặc
node cli.js auto
```

### 2. Chạy Thử 1 Chu Kỳ Hoàn Chỉnh Rồi Nghỉ
Phù hợp khi bạn muốn bot làm sạch nhiệm vụ ngày một lần duy nhất rồi tự tắt:
```bash
node cli.js auto --once
```

### 3. Chạy Chẩn Đoán Ghi Nhận (Diagnostic Probe)
Kiểm tra xem máy chủ hiện tại đang ghi nhận những việc nào và việc nào đã chạm trần:
```bash
node cli.js auto --probe
```

### 4. Chạy Kiểm Thử Tự Động Ngoại Tuyến (Offline Tests)
Kiểm tra độ chính xác của toàn bộ thuật toán mà không cần bật mạng:
```bash
npm test
```

---

> 🙏 **Lời chúc:** Chúc bạn có những phút giây tu tập an lạc, thân tâm thường thanh tịnh, bồ đề tâm kiên cố và công đức ngày một tăng trưởng! Nam Mô A Di Đà Phật.

