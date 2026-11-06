# 🪷 TÀI LIỆU TOÀN DIỆN DỰ ÁN TỰ ĐỘNG HÓA CHÙA ONLINE (AN TỰ DUYÊN)
> **Nền tảng:** [An Tự Duyên - didenchua.online](https://didenchua.online/?phong=chua-1)  
> **Phiên bản hệ thống:** v1.0.0 (Production Ready)  
> **Kiến trúc:** Node.js (ESM), WebSocket Game Protocol, Gemini Flash AI, Web Dashboard, Render Cloud 24/7  
> **Tôn chỉ vận hành:** *Thanh tịnh · Chánh niệm · Tinh tấn · Khoan thai*

---

## 📑 MỤC LỤC TỔNG QUAN

1. [Giới Thiệu Dự Án & Tôn Chỉ Vận Hành](#1-giới-thiệu-dự-án--tôn-chỉ-vận-hành)
2. [Kiến Trúc Kỹ Thuật & Giao Thức Truyền Thông](#2-kiến-trúc-kỹ-thuật--giao-thức-truyền-thông)
3. [Nguyên Tắc Đơn Phiên (Single Session Etiquette)](#3-nguyên-tắc-đơn-phiên-single-session-etiquette)
4. [Hệ Thống Hồ Sơ Nhân Vật & 4 Tab Tu Tập](#4-hệ-thống-hồ-sơ-nhân-vật--4-tab-tu-tập)
   - 4.1. [Tab 1: Của Tôi (My Profile & Stats)](#41-tab-1-của-tôi-my-profile--stats)
   - 4.2. [Tab 2: Bộ Sưu Tập (Trang Phục, Pháp Bảo, Bồ Đoàn, Linh Thú)](#42-tab-2-bộ-sưu-tập-trang-phục-pháp-bảo-bồ-đoàn-linh-thú)
   - 4.3. [Tab 3: Bảng Vàng Danh Hiệu (17 Danh Hiệu)](#43-tab-3-bảng-vàng-danh-hiệu-17-danh-hiệu)
   - 4.4. [Tab 4: Bản Đồ Chùa & Thông Tin Tài Khoản](#44-tab-4-bản-đồ-chùa--thông-tin-tài-khoản)
5. [Bản Đồ 3D Chùa An Tự Duyên & Tọa Độ Không Gian](#5-bản-đồ-3d-chùa-an-tự-duyên--tọa-độ-không-gian)
6. [Bảng Điều Khiển Tác Vụ 5 Tầng (31 Tasks Toàn Diện)](#6-bảng-điều-khiển-tác-vụ-5-tầng-31-tasks-toàn-diện)
   - 6.1. [Tầng 1: Nhiệm Vụ Hàng Ngày (13 Tasks)](#61-tầng-1-nhiệm-vụ-hàng-ngày-13-tasks)
   - 6.2. [Tầng 2: Mốc Tu Tập & Thành Tựu Vĩnh Viễn (6 Tasks)](#62-tầng-2-mốc-tu-tập--thành-tựu-vĩnh-viễn-6-tasks)
   - 6.3. [Tầng 3: Không Gian Tâm Linh Đặc Thù (4 Tasks)](#63-tầng-3-không-gian-tâm-linh-đặc-thù-4-tasks)
   - 6.4. [Tầng 4: Vườn Sen & Tùy Hỷ Công Đức (4 Tasks)](#64-tầng-4-vườn-sen--tùy-hỷ-công-đức-4-tasks)
   - 6.5. [Tầng 5: Tĩnh Tâm Thiền Định & Trí Tuệ AI (2 Tasks)](#65-tầng-5-tĩnh-tâm-thiền-định--trí-tuệ-ai-2-tasks)
   - 6.6. [Tùy Chỉnh Nhân Vật & Trang Bị (2 Tasks)](#66-tùy-chỉnh-nhân-vật--trang-bị-2-tasks)
7. [Các Phân Hệ Chuyên Biệt Nổi Bật](#7-các-phân-hệ-chuyên-biệt-nổi-bật)
   - 7.1. [Am Riêng Tu Tập (Tịnh Xá Cá Nhân)](#71-am-riêng-tu-tập-tịnh-xá-cá-nhân)
   - 7.2. [Pháp Đường Đại Giảng Đường](#72-pháp-đường-đại-giảng-đường)
   - 7.3. [Gác Chuông Bát Nhã & Tiếng Chuông Tỉnh Thức](#73-gác-chuông-bát-nhã--tiếng-chuông-tỉnh-thức)
   - 7.4. [Động Cơ AI Gemini & Ngân Hàng Phật Học 166 Câu](#74-động-cơ-ai-gemini--ngân-hàng-phật-học-166-câu)
   - 7.5. [Tọa Thiền Chống Rớt Kết Nối (Keep-Alive Meditation)](#75-tọa-thiền-chống-rớt-kết-nối-keep-alive-meditation)
8. [Giao Diện Quản Trị Web Dashboard & Giám Sát Thời Gian Thực](#8-giao-diện-quản-trị-web-dashboard--giám-sát-thời-gian-thực)
9. [Cấu Hình Hệ Thống & Chế Độ An Toàn (Safe Human Delay)](#9-cấu-hình-hệ-thống--chế-độ-an-toàn-safe-human-delay)
10. [Hướng Dẫn Triển Khai Lên Render Cloud 24/7](#10-hướng-dẫn-triển-khai-lên-render-cloud-247)
11. [Hệ Thống Thông Báo Tự Động (Telegram & Discord)](#11-hệ-thống-thông-báo-tự-động-telegram--discord)
12. [Cẩm Nang Tra Cứu Lệnh CLI & NPM Scripts](#12-cẩm-nang-tra-cứu-lệnh-cli--npm-scripts)
13. [Xử Lý Lỗi Thường Gặp (Troubleshooting Guide)](#13-xử-lý-lỗi-thường-gặp-troubleshooting-guide)

---

## 1. GIỚI THIỆU DỰ ÁN & TÔN CHỈ VẬN HÀNH

Dự án **Tự Động Hóa Chùa Online (An Tự Duyên)** là giải pháp toàn diện hỗ trợ Phật tử thực hành tu tập, giữ gìn thời khóa nhật tụng, tích lũy công đức và tham gia các hoạt động cộng đồng trên nền tảng thế giới ảo Phật giáo **An Tự Duyên** ([didenchua.online](https://didenchua.online/?phong=chua-1)).

### 🌸 Tôn Chỉ Hoạt Động
- **Thanh Tịnh & Trang Nghiêm**: Mọi hành vi (lạy Phật, niệm Phật, dâng hương, thả hoa đăng, quét lá...) đều được thực hiện theo nhịp điệu tự nhiên, từ tốn, không spam, không gây nhiễu loạn không gian chùa.
- **Bảo Toàn Công Đức**: Hệ thống tự động kiểm tra, hoàn thành và thu nhận (claim) tất cả phần thưởng, duy trì chuỗi ngày liên tiếp (streak) không bị gián đoạn.
- **Đồng Hành Đa Nền Tảng**: Vận hành trơn tru cả trên máy tính cá nhân (CLI / Browser 3D) lẫn máy chủ đám mây chạy ngầm 24/7 (Render / Docker / GitHub Actions).

---

## 2. KIẾN TRÚC KỸ THUẬT & GIAO THỨC TRUYỀN THÔNG

Hệ thống được xây dựng theo mô hình Module hóa cao cấp, tận dụng chuẩn ECMAScript Modules (ESM) của Node.js:

```mermaid
graph TD
    User["Phật Tử / Quản Trị Viên"] -->|Truy cập Web UI| Dashboard["Web Dashboard (server.js :3000)"]
    User -->|Chạy Terminal| CLI["CLI Interface (cli.js)"]
    
    Dashboard -->|Điều khiển tác vụ| Engine["Lõi Tự Động Hóa (src/tasks/)"]
    CLI -->|Điều khiển tác vụ| Engine
    
    Engine -->|Giao thức WebSocket (JSON)| WSClient["DiDenChuaClient (src/client.js)"]
    WSClient <==>|WSS JSON Protocol| GameServer["Máy Chủ An Tự Duyên (didenchua.online/ws)"]
    
    Engine -->|Tra cứu tri thức| GeminiAI["Gemini 3.5 Flash AI + Quiz Bank (166 câu)"]
    Engine -->|Gửi tổng kết| Notifier["Hệ Thống Thông Báo (Telegram/Discord)"]
    
    CloudCron["UptimeRobot / Cron-Job.org"] -->|Ping /health & /cron| Dashboard
```

### 🛰️ Giao Thức WebSocket Game (`wss://didenchua.online/ws`)
Mọi giao tiếp giữa client và máy chủ game đều sử dụng các gói tin JSON với trường định danh hành động `t`:
- `t: "join"`: Đăng nhập vào phòng chùa với danh tính `id` (CID), diện mạo `name`, `robe`, `beads`, `cushion`, `weapon`, `pet`, `title`...
- `t: "p"`: Heartbeat ping giữ kết nối mỗi 10-15 giây.
- `t: "checkin"`: Điểm danh nhận quà ngày.
- `t: "incense"`: Dâng hương Tam Bảo tại lư hương Chánh điện.
- `t: "lantern"`: Thả hoa đăng cầu bình an (`msg`, `color`, `count`).
- `t: "greet"`: Chắp tay chào đồng tu trong chùa (`to`).
- `t: "pray"`: Cúi lạy Phật trang nghiêm (`count`).
- `t: "mo"`: Gõ mõ tụng kinh (`count`).
- `t: "beads"`: Lăn tràng hạt niệm Phật (`count`).
- `t: "bell"`: Thỉnh Đại hồng chung gác chuông.
- `t: "chore"`: Làm việc chùa (`k: "quet" | "ca" | "dendau" | "cat" | "sen"`).
- `t: "wAm"`: Tu tập và bài trí Am riêng (`slot`, `item`).
- `t: "wPhapDuong"`: Tham gia khóa giảng Pháp đường.
- `t: "khoe"`: Chia sẻ thành tựu tu tập lên kênh chat chung.
- `t: "setTitle"`: Thay đổi danh hiệu hiển thị trên đầu nhân vật.
- `t: "setLook"`: Cập nhật diện mạo (áo, hạt, bồ đoàn, pháp khí).
- `t: "goto"`: Dịch chuyển tọa độ nhân vật (`x, y, z`).
- `t: "claim"` / `t: "claimTask"`: Thu nhận phần thưởng nhiệm vụ ngày và thành tựu.

---

## 3. NGUYÊN TẮC ĐƠN PHIÊN (SINGLE SESSION ETIQUETTE)

> [!CAUTION]
> **QUY TẮC BẤT DI BẤT DỊCH CỦA MÁY CHỦ AN TỰ DUYÊN:**  
> Mỗi tài khoản (`CID`) chỉ được phép kết nối **MỘT PHIÊN DUY NHẤT** tại một thời điểm.  
> Nếu bạn đang mở chùa trên trình duyệt web và tool chạy ngầm kết nối tới máy chủ, trình duyệt sẽ bị đẩy văng ra với thông báo:  
> **"Chùa đang mở ở nơi khác"**.

### 💡 Giải Pháp Hài Hòa
1. **Khi bạn đang tự chơi game trên trình duyệt**:  
   - Tuyệt đối **KHÔNG chạy các lệnh CLI nền** (`npm run all`, `node cli.js ...`) hoặc bấm nút "Chạy Ngay" trên Web Dashboard.
   - Để bot tự chạy vào khung giờ bạn nghỉ ngơi (mặc định được cấu hình tự động lúc **00:05 sáng**).
2. **Khi muốn vừa xem 3D vừa chạy tự động**:  
   - Sử dụng lệnh chuyên biệt:
     ```bash
     npm run watch
     ```
   - Lệnh này sẽ mở Google Chrome 3D thật lên màn hình và điều khiển **trực tiếp qua kết nối duy nhất của trình duyệt**, không mở phiên ngầm thứ hai, loại bỏ hoàn toàn hiện tượng tranh session!

---

## 4. HỆ THỐNG HỒ SƠ NHÂN VẬT & 4 TAB TU TẬP

Khi nhấp vào nhân vật của mình trên Chùa An Tự Duyên, giao diện **Hồ Sơ Tu Tập** hiện lên với 4 tab thông tin chuẩn mực:

```
┌───────────────────────────────────────────────────────────┐
│ Hồ sơ tu tập                                          [X] │
├───────────┬───────────────┬──────────────┬────────────────┤
│  CỦA TÔI  │  BỘ SƯU TẬP   │  DANH HIỆU   │   TÀI KHOẢN    │
└───────────┴───────────────┴──────────────┴────────────────┘
```

---

### 4.1. TAB 1: CỦA TÔI (MY PROFILE & STATS)

Tab này phản ánh trung thực toàn bộ căn lành, công đức tích lũy và thời khóa nhật tụng:

- **Thông Tin Định Danh**:
  - Pháp danh / Tên: `<configured display name>`
  - Cấp bậc tu tập: **An lạc (Lv.4)**
  - Danh hiệu đeo trên đầu: **Trăm chuỗi hạt** 🏆
  - Tài khoản hệ thống: `<configured account>`
  - Tâm niệm (Bio): *"Nam Mô A Di Đà Phật · Thân tâm thường an lạc"*
  - Tiến trình công đức: **1.839 / 3.000 điểm** (còn 1.161 điểm lên cấp Tịnh độ).

- **4 Chỉ Số Tu Tập Cốt Lõi**:
  | Chỉ Số | Giá Trị Hiện Tại | Ý Nghĩa Tâm Linh & Mốc Thành Tựu |
  | :--- | :---: | :--- |
  | 🙇 **Lạy Phật** | **1.344 lạy** | Đã vượt mốc *Trăm lạy* (108 lạy) & *Ngàn lạy* (1.000 lạy). Hướng tới *Vạn lạy* (10.000 lạy). |
  | 📿 **Chuỗi tràng hạt** | **100 chuỗi** *(10.900 hạt)* | Đạt danh hiệu cao quý **Trăm chuỗi hạt** (100 chuỗi = 10.800 hạt). |
  | 🧘 **Phút ngồi tĩnh** | **153 phút** | Đã đạt mốc *Tĩnh tọa* (60 phút). Hướng tới mốc *300 phút* để mở gậy thần. |
  | 🔥 **Ngày liên tiếp** | **3 ngày** *(kỷ lục 3)* | Chuỗi ngày tinh tấn không ngắt quãng. Mốc kế tiếp: 7 ngày & 30 ngày. |

- **4 Chỉ Số Phụ & Mở Rộng**:
  - 🕯️ **Lần dâng hương**: 39 lần (Đạt danh hiệu *Hương trầm* mốc 30 lần).
  - 🏮 **Hoa đăng đã thả**: 28 ngọn (Đạt danh hiệu *Người thả đèn* mốc 10 ngọn).
  - 🚶 **Khu đã viếng**: 10/10 khu vực (Đạt danh hiệu *Thăm khắp chùa*).
  - 📅 **Ngày đồng hành cùng chùa**: 3 ngày.

- **10 Nhiệm Vụ Ngày & Tuần (Daily / Weekly Quests)**:
  1. `checkin`: Điểm danh nhận quà ngày (+10đ).
  2. `huong`: Dâng hương Tam Bảo (+10đ).
  3. `den`: Thả hoa đăng cầu an (+10đ).
  4. `chao`: Chắp tay chào bạn đồng tu (+10đ).
  5. `lay`: Cúi lạy Phật trang nghiêm (+15-30đ).
  6. `quet`: Quét lá sân chùa (+10đ).
  7. `ca`: Cho đàn cá hồ sen ăn (+10đ).
  8. `dendau`: Thắp đèn dầu chánh điện (+10đ).
  9. `cat`: Chăm sóc mèo chùa (+10đ).
  10. `wAm`: Vào Am riêng tu tập và dâng 3 nén hương (+40đ - Nhiệm vụ tuần).

---

### 4.2. TAB 2: BỘ SƯU TẬP (TRANG PHỤC, PHÁP BẢO, BỒ ĐOÀN, LINH THÚ)

Bộ sưu tập bao gồm các trang bị quý giá được mở khóa thông qua công đức và sự chuyên cần:

#### 1. Áo Tràng (11 Loại)
| Mã ID | Tên Áo | Màu Sắc | Điều Kiện Mở Khóa |
| :--- | :--- | :---: | :--- |
| `nau` | Áo nâu | `#7a5134` | Trang phục khởi tâm ban đầu (Mặc định) |
| `lam` | Áo tràng lam | `#5d7487` | Mở khóa từ cấp Tinh tấn |
| `xam` | Áo xám | `#8a8a84` | Mở khóa tu tập |
| `vang` | Áo vàng | `#b98a3a` | Mở khóa theo cấp bậc công đức |
| `cam` | Áo cam | `#b8602c` | Pháp y Nam truyền |
| `trang` | Áo tràng nâu đậm | `#54392a` | Trang nghiêm thanh tịnh |
| `tieu` | Áo chú tiểu | `#b5b2a6` | Đồng chân nhập đạo |
| `sen` | Áo tràng sen | `#cf93a2` | Quà tặng sự kiện Lễ Rằm |
| `xuan` | Áo Xuân | `#a8402e` | Quà tặng sự kiện Lễ Tết |
| `vulan` | Áo Vu Lan | `#e6e0d2` | Quà tặng Đại lễ Vu Lan Báo Hiếu |
| `tangoc` | Áo tràng ngọc | `#3f8f86` | Cực phẩm đạt mốc **15.000 công đức** |

#### 2. Tràng Hạt Niệm Phật (13 Loại)
| Mã ID | Tên Tràng Hạt | Màu Sắc | Điều Kiện Mở Khóa |
| :--- | :--- | :---: | :--- |
| `go` | Tràng hạt gỗ | `#e0852c` | Khởi tâm niệm Phật (Mặc định) |
| `bode` | Tràng hạt bồ đề | `#b98a5a` | Đạt cấp Tu tập Lv.1 |
| `tram` | Tràng hạt trầm hương | `#6b442a` | Đạt cấp Tu tập Lv.2 |
| `hophach` | Tràng hạt hổ phách | `#f2a91f` | Đạt cấp Tu tập Lv.3 |
| `ngoc` | Tràng hạt ngọc bích | `#4fae84` | Đạt cấp Tu tập Lv.4 |
| `mun` | Tràng hạt gỗ mun | `#2c2320` | ✨ Hoàn thành danh mục "Người mới" |
| `tuDan` | Tràng hạt tử đàn | `#5a1f28` | ✨ **Đạt mốc 1.000 công đức** (Đã sở hữu) |
| `manao` | Tràng hạt mã não | `#c2412b` | Quà tặng điểm danh ngày thứ 7 |
| `thachAnh` | Tràng thạch anh tím | `#8e5fc0` | Đạt mốc 3.000 công đức |
| `maivang` | Tràng hạt hoa mai | `#f4c430` | Hoàn thành trọn vẹn Lễ Tết |
| `bachngoc` | Tràng hạt bạch ngọc | `#e6ebe2` | Tham dự Đại lễ Phật Đản |
| `hongngoc` | Tràng hạt hồng ngọc | `#d9506e` | Tham dự Đại lễ Vu Lan |
| `bachHop` | Tràng hạt bách hợp | `#f1ead8` | Cực phẩm đạt mốc **30.000 công đức** |

#### 3. Bồ Đoàn Thiền Tọa (7 Loại)
| Mã ID | Tên Bồ Đoàn | Màu Sắc | Điều Kiện Mở Khóa |
| :--- | :--- | :---: | :--- |
| `xam` | Bồ đoàn xám | `#8a8a84` | Mặc định ban đầu |
| `nau` | Bồ đoàn nâu | `#7a5134` | Cấp Lv.1 |
| `vang` | Bồ đoàn vàng | `#c9a24a` | Cấp Lv.2 |
| `son` | Bồ đoàn đỏ son | `#a3452f` | Cấp Lv.3 |
| `sen` | Bồ đoàn hoa sen | `#d98fa0` | Cấp Lv.5 |
| `laSen` | Bồ đoàn lá sen | `#5c8f5a` | ✨ **Đạt mốc 500 công đức** (Đã sở hữu) |
| `gam` | Bồ đoàn gấm | `#8c2f4a` | Đạt mốc **7.000 công đức** |

#### 4. Pháp Khí Chùa (12 Pháp Bảo)
Hệ thống sở hữu **6/12** pháp khí danh giá:
1. ✅ **Nén hương** *(Thường)*: Dâng hương 10 lần tại Chánh điện.
2. ✅ **Giỏ hoa sen** *(Thường)*: Thả 5 ngọn hoa đăng trên hồ sen.
3. ✅ **Gậy trúc hành hương** *(Thường)*: Thăm đủ 10 thắng cảnh trong chùa.
4. ✅ **Mõ cầm tay** *(Hiếm)*: Gõ 500 tiếng mõ tụng kinh.
5. 🔒 **Cuốn kinh** *(Hiếm)*: Chơi Đố vui Phật pháp 3 buổi tối.
6. ✅ **Cây tre trăm đốt** *(Hiếm)*: Lần đủ 30 chuỗi tràng hạt.
7. ✅ **Thiền trượng chín khoen** *(Quý)*: **Lạy Phật 1.000 lạy** (Đang cầm trên tay).
8. 🔒 **Nón lá** *(Thường)*: Lên chùa 14 ngày liên tiếp.
9. 🔒 **Đèn lồng** *(Hiếm)*: Làm trọn lễ ngày mùng một.
10. 🔒 **Chuông tay** *(Hiếm)*: Thỉnh Đại hồng chung 10 lần.
11. 🔒 **Bát tím vàng** *(Quý)*: Hoàn thành trọn vẹn 6 lễ chùa.
12. 🔒 **Gậy thần Chử Đồng Tử** *(Quý)*: Tọa thiền tích lũy đủ 300 phút.

#### 5. Linh Thú Hộ Trì (7 Loài)
| Mã ID | Tên Linh Thú | Cấp & Ngày Cần | Đặc Tính & Mô Tả |
| :--- | :--- | :---: | :--- |
| `meo` | Mèo chùa | Lv.2 · 7 ngày | Lười biếng mà hiền lành, thích nằm sưởi nắng bên thềm Chánh điện. |
| `se` | Chim sẻ | Lv.3 · 14 ngày | Nhảy lích chích theo chân Phật tử, mổ hạt thóc rơi dưới sân chùa. |
| `tho` | Thỏ trắng | Lv.4 · 21 ngày | Nhút nhát nhưng rất quấn chủ, nhảy từng bước nhỏ quanh vườn hoa. |
| `soc` | Sóc nâu | Lv.4 · 30 ngày | Nhanh nhẹn, đuôi xù to như chiếc chổi lông, chuyền cành cây bồ đề. |
| `rua` | Rùa vàng | Lv.5 · 45 ngày | Chậm rãi, điềm tĩnh, trường thọ nghìn năm bên hồ sen Cầu Duyên. |
| `huou` | Hươu sao | Lv.5 · 60 ngày | Hiền từ, lưng lấm tấm ánh sao trắng, sống nơi rừng trúc thanh tịnh. |
| `hac` | Hạc trắng | Lv.6 · 90 ngày | Cốt cách thanh cao, chân dài, cổ vươn múa lượn trước bảo tháp. |

---

### 4.3. TAB 3: BẢNG VÀNG DANH HIỆU (17 DANH HIỆU)

Tài khoản hiện đã đạt xuất sắc **10 / 17 danh hiệu**:

| ID Danh Hiệu | Tên Danh Hiệu Hiển Thị | Trạng Thái | Điều Kiện Đạt Thành Tựu |
| :--- | :--- | :---: | :--- |
| `moi` | Người mới lên chùa | ✅ ĐÃ ĐẠT | Lần đầu tiên đặt chân đến chùa An Tự Duyên. |
| `tram-lay` | Trăm lạy | ✅ ĐÃ ĐẠT | Lạy Phật sám hối đủ 108 lạy. |
| `ngan-lay` | Ngàn lạy | ✅ ĐÃ ĐẠT | Cúi lạy Phật sám hối đạt mốc 1.000 lạy. |
| `tron-chuoi` | Tròn chuỗi hạt | ✅ ĐÃ ĐẠT | Lần hạt trọn vẹn một chuỗi 108 hạt. |
| `tram-chuoi` | **Trăm chuỗi hạt** | 🌟 **ĐANG DÙNG** | **Lần trọn vẹn 100 chuỗi tràng hạt (10.800 hạt)**. |
| `tinh-toa` | Tĩnh tọa | ✅ ĐÃ ĐẠT | Ngồi thiền tĩnh tâm tích lũy đủ 60 phút. |
| `huong-tram` | Hương trầm | ✅ ĐÃ ĐẠT | Dâng hương Tam Bảo đủ 30 lần. |
| `hoa-dang` | Người thả đèn | ✅ ĐÃ ĐẠT | Thả đủ 10 ngọn hoa đăng lung linh trên hồ sen. |
| `du-gia` | Thăm khắp chùa | ✅ ĐÃ ĐẠT | Đặt chân khám phá đủ 10 khu vực cảnh quan của chùa. |
| `dong-tam` | Đồng tâm | ✅ ĐÃ ĐẠT | Cùng lạy Phật đồng thời với người khác đủ 10 lần. |
| `tinh-tan` | Tinh tấn bảy ngày | 🔒 Chưa đạt | Lên chùa liên tục 7 ngày liền không gián đoạn. |
| `tron-thang` | Một tháng không nghỉ | 🔒 Chưa đạt | Bất thối chuyển, lên chùa chuyên cần 30 ngày liền. |
| `ban-hien` | Bạn hiền | 🔒 Chưa đạt | Kết giao đủ 3 người bạn đồng tu trong chùa. |
| `muon-loai` | Người bạn của muôn loài | 🔒 Chưa đạt | Yêu thương chăm sóc linh thú đủ 30 ngày. |
| `hieu-phap` | Người hiểu pháp | 🔒 Chưa đạt | Tham gia giải Đố vui Phật pháp đủ 7 buổi tối. |
| `giu-le` | Người giữ lễ | 🔒 Chưa đạt | Làm trọn vẹn 12 lễ chùa (Rằm, Mùng một, các ngày lễ lớn). |
| `duyen-lanh` | Duyên lành | 🔒 Chưa đạt | Gieo quẻ và kết duyên tốt lành tại đền Nguyệt Lão. |

---

### 4.4. TAB 4: BẢN ĐỒ CHÙA & THÔNG TIN TÀI KHOẢN

- **Thông Tin Định Danh**:
  - Tên đăng nhập: `<configured account>`
  - CID (Account ID): cấu hình qua biến môi trường `CID`
  - Mã khôi phục: không lưu trong tài liệu
  - Trạng thái: Đã bảo vệ công đức an toàn trên máy chủ.
- **Tính Năng Bản Đồ**: Cung cấp tổng quan khuôn viên chùa 3D, hỗ trợ dịch chuyển tức thời (teleport) đến 17 thắng cảnh.

---

## 5. BẢN ĐỒ 3D CHÙA AN TỰ DUYÊN & TỌA ĐỘ KHÔNG GIAN

Dữ liệu tọa độ 3D được trích xuất trực tiếp từ mã nguồn thế giới ảo (`data/temple_map.json` và `src/map.js`):

```
                                [Bảo tháp (0, -50)]
                                         |
     [Giếng Ngọc (-44, -16)]    [Chánh điện (0, -3)]    [Tượng Di Lặc (46, -32)]
                                         |              [Đền Nguyệt Lão (50, -12)]
     [Vườn thiền (-36, 30)]      [Sân chùa (0, 40)]     [Hồ sen Cầu Duyên (35.5, 12)]
     [Gác chuông (-15, 47)]              |              [Tháp nghỉ chân (15, 47)]
     [Vườn Linh Thú (-39, 81)]   [Đường thần đạo]       [Vườn hoa (9.6, 75.75)]
     [Tàng Kinh Các (-6.5, 75)]          |
     [Thầy đồ (-5.6, 86.5)]              |
                               [Cổng tam quan (0, 140)]
```

### 📍 Bảng 17 Thắng Cảnh & Tọa Độ Chi Tiết
| STT | Mã ID | Tên Thắng Cảnh | Khu Vực (Zone) | Tọa Độ X, Y, Z | Góc Nhìn (Yaw) | Mô Tả Ý Nghĩa |
| :---: | :--- | :--- | :--- | :---: | :---: | :--- |
| 1 | `tam-quan` | Cổng tam quan | Cổng tam quan | `(0, 0.3, 140)` | `0.00` | Cổng chính vào chùa, nhìn ra mặt hồ lớn phía trước. |
| 2 | `san-chua` | Sân chùa | Sân chùa | `(0, 0, 40)` | `0.00` | Khuôn viên sân gạch chính giữa, nơi tập trung sinh hoạt. |
| 3 | `chanh-dien` | Chánh điện | Chánh điện | `(0, 2.4, -3)` | `0.00` | Nơi thờ Tam Bảo trang nghiêm với 50 bồ đoàn thiền tọa. |
| 4 | `bao-thap` | Bảo tháp | Bảo tháp | `(0, 4.6, -50)` | `0.00` | Ngọn tháp cao uy nghiêm phía sau Chánh điện. |
| 5 | `ho-sen` | Hồ sen · Cầu Duyên | Hồ sen · Cầu Duyên | `(35.5, 0, 12)` | `-1.57` | Hồ nước thả hoa đăng cầu an và nuôi đàn cá phóng sinh. |
| 6 | `vuon-thien` | Vườn thiền | Vườn thiền | `(-36, 0, 30)` | `1.57` | Khu vườn sỏi tĩnh mịch bên trái, nơi tọa thiền ngoài trời. |
| 7 | `gac-chuong` | Gác chuông | Sân chùa | `(-15, 0, 47.4)` | `3.14` | Nơi đặt Đại hồng chung cổ, thỉnh chuông ngân vang. |
| 8 | `thap-nghi-chan` | Tháp nghỉ chân | Sân chùa | `(15, 0, 47.4)` | `3.14` | Vọng lâu uống trà đàm đạo đối xứng với gác chuông. |
| 9 | `am-rieng` | Am riêng | Am riêng | `(-45.6, 0, 33.5)`<br>*(TP: `3000, 0, 3000`)* | `1.57` | Lối vào tịnh xá tu tập cá nhân ở không gian riêng biệt. |
| 10 | `phap-duong` | Pháp đường | Pháp đường | `(-40.5, 0, 4)`<br>*(TP: `-3006, 0, 3006`)* | `1.57` | Đại giảng đường nghe thuyết pháp và tu học cộng đồng. |
| 11 | `tang-kinh-cac` | Tàng Kinh Các | Sân chùa | `(-6.5, 0, 75.75)` | `1.57` | Kho tàng lưu giữ kinh điển, lời Phật dạy đại thừa. |
| 12 | `thay-do` | Thầy đồ | Sân chùa | `(-5.6, 0, 86.5)` | `1.57` | Lều thư pháp xin 12 chữ cát tường cất vào Tủ chữ. |
| 13 | `gieng-ngoc` | Giếng Ngọc | Giếng Ngọc | `(-44, 0, -16)` | `0.00` | Nguồn nước cam lồ trong lành linh thiêng góc Tây Bắc. |
| 14 | `tuong-di-lac` | Tượng Di Lặc | Tượng Di Lặc | `(46, 0, -32)` | `0.00` | Tôn tượng Đức Di Lặc hoan hỷ trên gò đồi phía Đông Bắc. |
| 15 | `den-nguyet-lao` | Đền Nguyệt Lão | Đền Nguyệt Lão | `(50, 0, -12.5)` | `0.00` | Đền cầu duyên và gieo quẻ xăm may mắn trên gò đảo hồ sen. |
| 16 | `vuon-linh-thu` | Vườn Linh Thú | Vườn Linh Thú | `(-39, 0, 81)` | `1.57` | Khu chăm sóc 7 loài linh thú chùa (Mèo, Sẻ, Thỏ, Sóc...). |
| 17 | `vuon-hoa` | Vườn hoa | Vườn hoa | `(9.6, 0, 75.75)` | `-1.57` | Vườn ươm hoa dâng Phật, gieo hạt và tưới nước tích phúc. |

---

## 6. BẢNG ĐIỀU KHIỂN TÁC VỤ 5 TẦNG (31 TASKS TOÀN DIỆN)

Hệ thống phân cấp 31 tác vụ thành 5 tầng ưu tiên khoa học, giúp tự động hóa triệt để và an toàn:

### 6.1. TẦNG 1: NHIỆM VỤ HÀNG NGÀY (13 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Mã Quest | Phần Thưởng | Chức Năng Chi Tiết |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `checkin` | Điểm Danh Hàng Ngày | 📅 | `checkin` | +10đ | Điểm danh nhận quà ngày, duy trì streak 7 ngày nhận tràng hạt mã não. |
| `incense` | Dâng Hương Chánh Điện | 🪔 | `huong` | +10đ | Thắp nén tâm hương thành kính tại lư hương Chánh điện (tùy chọn 1, 3, 5, 10 nén). |
| `lantern-daily` | Thả Hoa Đăng Sen | 🏮 | `den` | +10đ | Thả hoa đăng cầu bình an trôi trên hồ sen (tùy chọn số ngọn). |
| `greet` | Chắp Tay Chào Đồng Tu | 🤝 | `chao` | +10đ | Chắp tay chào một bạn đồng tu đang có mặt tại chùa. |
| `lay-daily` | Lạy Phật Trang Nghiêm | 🙇 | `lay` | +15-30đ | Lạy Phật sám hối đủ số lượng nhiệm vụ hôm nay. |
| `quet` | Quét Lá Sân Chùa | 🧹 | `quet` | +10đ | Quét sạch lá rụng trên sân gạch, làm sạch cảnh quan chùa. |
| `fish` | Cho Cá Hồ Sen Ăn | 🐟 | `viec` | +10đ | Rắc thức ăn phóng sinh cho đàn cá vàng bơi lội dưới hồ sen. |
| `oil` | Thắp Đèn Dầu Tam Bảo | 🪔 | `viec` | +10đ | Rót dầu thắp sáng ngọn đèn dầu trước Phật đài Chánh điện. |
| `cat` | Chăm Sóc Mèo Chùa | 🐱 | `viec` | +10đ | Vuốt ve, cho ăn và chăm sóc chú mèo hiền bên hiên chùa. |
| `sen` | Tưới Sen Hồ Cầu Duyên | 🪷 | `viec` | +10đ | Tưới nước chăm sóc những búp sen hồng đang nở. |
| `chores-daily` | Làm Việc Chùa Trọn Gói | 🧹 | `viec` | +10đ | Tự động làm sạch cả 5 công quả (quét lá, cho cá, châm dầu, chăm mèo, tưới sen). |
| `bell` | Thỉnh Chuông Gác Chuông | 🔔 | `chuong` | +15đ | Lên gác chuông thỉnh 1-10 tiếng Đại hồng chung ngân vang. |
| `claim` | Thu Nhận Tất Cả Quà | 🎁 | `claim` | Toàn bộ quà | Quét toàn bộ danh sách quest đã đạt và thu nhận công đức ngay tức khắc. |

---

### 6.2. TẦNG 2: MỐC TU TẬP & THÀNH TỰU VĨNH VIỄN (6 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Nhập Số Lượng | Mốc Danh Hiệu Hướng Tới |
| :--- | :--- | :---: | :---: | :--- |
| `lay` | Lạy Phật Sám Hối | 🙇 | 18, 27, 36, 108, 1000 | Cày mốc 108 lạy *(Trăm lạy)*, 1.000 lạy *(Ngàn lạy 🏆)*, 10.000 lạy *(Vạn lạy)*. |
| `beads` | Lăn Tràng Hạt Niệm Phật | 📿 | 54, 108, 540, 10800 | Cày mốc 108 hạt *(Tròn chuỗi)*, 100 chuỗi *(Trăm chuỗi hạt 🏆)*. |
| `farm-bows-beads` | Combo: Lạy Phật + Tràng Hạt | 📿 | Tùy ý | Chạy song song cả hai mốc tu tập để tối ưu hóa thời gian cày cuốc. |
| `mo` | Gõ Mõ Tụng Kinh Tự Do | 🪵 | 15, 30, 60, 108 | Gõ mõ nhịp nhàng khoan thai theo đúng chuẩn thời khóa tụng niệm. |
| `quet-farm` | Quét Sân Công Quả Nhiều Lượt | 🧹 | 5, 10, 20 lượt | Tích lũy số lần lao tác công quả giữ gìn cảnh chùa thanh tịnh. |
| `visit` | Khám Phá Toàn Bộ Chùa (10 Khu) | 🚶 | Tự động 10 khu | Đi thăm đủ 10 khu vực để mở khóa danh hiệu *Thăm khắp chùa* và gậy trúc. |

---

### 6.3. TẦNG 3: KHÔNG GIAN TÂM LINH ĐẶC THÙ (4 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Tọa Độ Không Gian | Ý Nghĩa & Phần Thưởng |
| :--- | :--- | :---: | :---: | :--- |
| `am` | Vào Am Riêng Tu Tập | 🛖 | `x: 3000, z: 3000` | Bước vào tịnh xá cá nhân, dâng 3 nén hương hoàn thành nhiệm vụ tuần `wAm` (+40đ). |
| `phapduong` | Vào Pháp Đường Nghe Pháp | 🏛️ | `x: -3006, z: 3006` | Đại giảng đường trang nghiêm, đảnh lễ Tam Bảo và lắng nghe thuyết pháp. |
| `khoe` | Khoe Thành Tích Tu Tập | 📢 | Kênh chat chung | Lan tỏa niềm hoan hỷ tu tập lên cộng đồng chùa (+10 công đức). |
| `teleport` | Dịch Chuyển Đến 17 Thắng Cảnh | 🗺️ | 17 Tọa độ 3D | Dịch chuyển tức thời đến bất kỳ địa danh nào trên bản đồ 3D (`goto`). |

---

### 6.4. TẦNG 4: VƯỜN SEN & TÙY HỶ CÔNG ĐỨC (4 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Chức Năng Chi Tiết |
| :--- | :--- | :---: | :--- |
| `garden` | Chăm Sóc Vườn Hoa & Tưới Hộ | 🪷 | Gieo hạt luống hoa của mình, dâng hoa tươi lên Tam Bảo, và tưới nước giúp luống hoa của bạn đồng tu (+2đ/luống). |
| `tuyhy` | Tùy Hỷ Hoa Đăng Hồ Sen | 🏮 | Gửi tâm niệm tùy hỷ công đức những ngọn hoa đăng lung linh của bạn đồng tu trên hồ sen. |
| `qa-incense` | Dâng Hương Đài Quan Âm | 🪔 | Dâng nén tâm hương thành kính cúng dường trước tôn tượng Đức Bồ Tát Quán Thế Âm. |
| `secrets` | Tàng Kinh Các & Xin Chữ Thầy Đồ | ✍️ | Đọc kinh điển tại Tàng Kinh Các và xin chữ thư pháp cát tường đầu ngày (Bình an, Từ bi, Tinh tấn...). |

---

### 6.5. TẦNG 5: TĨNH TÂM THIỀN ĐỊNH & TRÍ TUỆ AI (2 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Chức Năng Chi Tiết |
| :--- | :--- | :---: | :--- |
| `meditate` | Ngồi Thiền Vườn Thiền (Keep-Alive) | 🧘 | Đến Vườn thiền tọa thiền tĩnh tâm (5-120 phút), tự động duy trì kết nối chống rớt mạng. |
| `quiz` | Đố Vui Phật Pháp AI (Gemini Flash) | 🧠 | Giải trắc nghiệm Phật học bằng Gemini 3.5 Flash + Ngân hàng 166 câu chùa (Ôn tập hoặc Thi đấu lúc 20:00). |

---

### 6.6. TÙY CHỈNH NHÂN VẬT & TRANG BỊ (2 TASKS)
| ID Tác Vụ | Tên Tác Vụ | Biểu Tượng | Chức Năng Chi Tiết |
| :--- | :--- | :---: | :--- |
| `title` | Đổi Danh Hiệu Nhân Vật | 🏅 | Đeo danh hiệu cao quý đã mở khóa (`tram-chuoi`, `ngan-lay`, `huong-tram`...). |
| `equip` | Đổi Trang Phục & Pháp Bảo | 🥼 | Thay áo tràng, đổi chuỗi hạt tử đàn, đổi bồ đoàn lá sen và cầm thiền trượng chín khoen. |

---

## 7. CÁC PHÂN HỆ CHUYÊN BIỆT NỔI BẬT

### 7.1. AM RIÊNG TU TẬP (TỊNH XÁ CÁ NHÂN)
- **Tập tin đảm trách**: [`src/tasks/am.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/tasks/am.js)
- **Cơ chế vận hành**:
  1. Gửi lệnh dịch chuyển `goto` đưa nhân vật đến cửa Am (`x: -45.6, z: 33.5`), sau đó bước vào cõi tịnh độ riêng biệt tại tọa độ `x: 3000, y: 0, z: 3000`.
  2. Gửi gói tin `t: 'wAm'` kích hoạt trạng thái tu tập tịnh xá.
  3. Thắp 3 nén tâm hương thành kính dâng lên bàn thờ Phật trong Am.
  4. Máy chủ ghi nhận hoàn tất nhiệm vụ tuần **"Vào Am riêng tu tập" (`wAm`)** và cộng **+40 điểm công đức**.
  5. Hỗ trợ hệ thống bài trí 7 vị trí (`altar`, `altarL`, `altarR`, `wallL`, `wallR`, `cornerL`, `cornerR`) với 11 vật phẩm tâm linh (Tượng Phật, Di Lặc, Lư hương, Bình sen, Đèn dầu, Tranh chữ An, Chậu lan...).

---

### 7.2. PHÁP ĐƯỜNG ĐẠI GIẢNG ĐƯỜNG
- **Tập tin đảm trách**: [`src/tasks/phapduong.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/tasks/phapduong.js)
- **Cơ chế vận hành**:
  1. Di chuyển nhân vật đến cửa Pháp đường (`x: -40.5, z: 4`), bước vào đại giảng đường tại tọa độ `x: -3006, y: 0, z: 3006`.
  2. Phát tín hiệu `t: 'wPhapDuong'` báo cáo hiện diện tại Pháp đường.
  3. Cúi mình đảnh lễ Tam Bảo, chọn bồ đoàn lắng nghe giáo pháp và tĩnh tâm tọa thiền.

---

### 7.3. GÁC CHUÔNG BÁT NHÃ & TIẾNG CHUÔNG TỈNH THỨC
- **Tập tin đảm trách**: [`src/tasks/bell.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/tasks/bell.js)
- **Cơ chế vận hành**:
  1. Di chuyển đến Gác chuông cổ kính (`x: -15, z: 47.4`).
  2. Gửi gói tin thỉnh chuông `t: 'bell'` với nhịp điệu trang nghiêm (cách nhau 2.5s mỗi tiếng).
  3. Tiếng Đại hồng chung ngân vang khắp cõi An Tự Duyên, giải tỏa phiền não, tích lũy công đức và hướng tới pháp bảo *Chuông tay*.

---

### 7.4. ĐỘNG CƠ AI GEMINI & NGÂN HÀNG PHẬT HỌC 166 CÂU
- **Tập tin đảm trách**: [`src/tasks/quiz.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/tasks/quiz.js), [`data/quiz_bank.json`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/data/quiz_bank.json)
- **Kiến trúc giải đố 2 tầng hoàn hảo**:
  - **Tầng 1 (Local Bank - Offline)**: Ngân hàng tri thức Phật học gồm **166 câu hỏi - đáp chính xác 100%** được crawl và chọn lọc từ giáo lý nhà Phật chùa An Tự Duyên. Tốc độ tra cứu < 5ms, không phụ thuộc internet ngoài.
  - **Tầng 2 (Gemini 3.5 Flash AI - Online)**: Khi gặp các câu hỏi mới lạ ngoài ngân hàng, hệ thống tự động gọi API Google Gemini với prompt chuyên gia Phật học để suy luận đáp án chính xác trong vòng 1 giây.
- **Hỗ trợ 2 chế độ**:
  - `practice`: Tự do luyện tập ôn luyện giáo lý bất kỳ lúc nào.
  - `live`: Canh đúng 20:00 tối hàng ngày để tham gia giải đố trực tiếp cùng cả chùa, giật Top 1 Bảng Vàng và mở khóa pháp khí *Cuốn kinh*.

---

### 7.5. TỌA THIỀN CHỐNG RỚT KẾT NỐI (KEEP-ALIVE MEDITATION)
- **Tập tin đảm trách**: [`src/tasks/meditate.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/tasks/meditate.js)
- **Vấn đề đã khắc phục**: Máy chủ game tự động ngắt kết nối các client đứng yên sau 3-5 phút không có tương tác.
- **Giải pháp**:
  - Gửi gói tin `t: 'meditate'` đặt trạng thái ngồi thiền chính thức.
  - Đều đặn gửi gói tin Heartbeat `t: 'p'` mỗi 12 giây.
  - Cứ mỗi 60 giây, thực hiện nhịp thở chánh niệm (nhích nhẹ tọa độ vi mô $\pm 0.01$ hoặc xoay nhẹ góc nhìn) để máy chủ luôn ghi nhận nhân vật đang hoạt động thực thụ, cho phép treo máy thiền 1 đến 2 giờ liên tục mà không bao giờ bị rớt mạng.

---

## 8. GIAO DIỆN QUẢN TRỊ WEB DASHBOARD & GIÁM SÁT THỜI GIAN THỰC

File máy chủ [`server.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/server.js) cung cấp một Web Dashboard hiện đại chuẩn Chùa Online:

```
┌────────────────────────────────────────────────────────────────────────┐
│  🪷 AN TỰ DUYÊN · BẢNG ĐIỀU KHIỂN TU TẬP 24/7             [00:05 CRON] │
├────────────────────────────────────────────────────────────────────────┤
│  [ẢNH ĐẠI DIỆN 3D]   <configured account> · An lạc (Lv.4)               │
│                      Công đức: 1.839 / 3.000 (61.3%)                   │
│                      [Xem 4 Tab Hồ Sơ Tu Tập]  [Đổi Danh Hiệu]         │
├────────────────────────────────────────────────────────────────────────┤
│  ⚡ TÁC VỤ 5 TẦNG (31 TASKS):                                           │
│  [Tầng 1: 13 Quests Ngày]  [Tầng 2: 6 Mốc Thành Tựu]  [Tầng 3: Tâm Linh]│
│  [Tầng 4: Vườn Sen Tùy Hỷ] [Tầng 5: Thiền & AI Quiz]  [Tùy Chỉnh Avatar]│
├────────────────────────────────────────────────────────────────────────┤
│  📜 NHẬT KÝ TU TẬP THỜI GIAN THỰC (REALTIME SSE LOG STREAM)            │
│  [22:48:28] Kết nối máy chủ chùa An Tự Duyên thành công...             │
│  [22:48:29] Đã dâng 1 nén tâm hương tại Chánh điện.                    │
│  [22:48:30] Thu hoạch phần thưởng: +10 điểm công đức.                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 🛡️ Chế Độ Xem Tĩnh Hoàn Toàn (Zero-Game-Connection on Report View)
- Khi người dùng truy cập hoặc tải lại trang Report/Dashboard (`GET /`), máy chủ chỉ đọc dữ liệu từ bộ nhớ đệm (`.cached_state.json`), **tuyệt đối KHÔNG tự động kết nối vào game**.
- Kết nối vào máy chủ chùa chỉ diễn ra duy nhất khi một tác vụ được kích hoạt có chủ ý, bảo vệ 100% phiên chơi game trực tiếp của người dùng.

### 🌐 Danh Mục Endpoint API
- `GET /`: Giao diện Dashboard HTML responsive, hỗ trợ hoàn hảo trên cả máy tính và điện thoại.
- `GET /health`: Endpoint báo cáo trạng thái máy chủ, phục vụ Keep-Alive ping chống ngủ đông:
  ```json
  { "status": "ok", "service": "didenchua-bot", "uptime": 86400, "time": "2026-11-05T22:48:00+07:00" }
  ```
- `POST /cron`: Kích hoạt chu trình làm nhiệm vụ tự động. Bắt buộc header `Authorization: Bearer <AUTH_TOKEN>`; không hỗ trợ GET để tránh crawler/prefetch kích hoạt nhầm.
- `GET /events`: Luồng Server-Sent Events (SSE) đẩy nhật ký trực tiếp xuống trình duyệt không cần reload trang.
- `POST /api/run`: Thực thi tác vụ theo ID với tham số tùy chọn:
  ```json
  { "taskId": "lay", "count": 108 }
  ```
- `POST /api/stop`: Dừng khẩn cấp tiến trình đang chạy một cách an toàn.
- `GET /api/status`: Lấy snapshot JSON về tiến độ công đức và 10 nhiệm vụ ngày.

---

## 9. CẤU HÌNH HỆ THỐNG & CHẾ ĐỘ AN TOÀN (SAFE HUMAN DELAY)

Cấu hình được quản lý tập trung tại [`config.json`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/config.json) và [`config.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/config.js):

```json
{
  "cid": "YOUR_ACCOUNT_CID",
  "name": "Phật Tử Tịnh Tâm",
  "kind": "tieu",
  "robe": "nau",
  "skin": "dong",
  "bio": "Nam Mô A Di Đà Phật · Thân tâm thường an lạc",
  "beads": "go",
  "cushion": "xam",
  "room": "chua-1",
  "safeMode": true,
  "minDelaySec": 1.0,
  "maxDelaySec": 2.0,
  "meditateSeconds": 3600,
  "autoWaterOthers": true,
  "maxWaterOthers": 50,
  "calligraphyWish": "binh-an",
  "milestoneFarming": {
    "enabled": true,
    "dailyBows": 18,
    "dailyBeads": 108,
    "dailySweeps": 5,
    "dailyIncense": 2,
    "dailyLanterns": 1
  }
}
```

### 🛡️ Cơ Chế An Toàn (Safe Human Mode)
- **`safeMode: true`**: Tự động chèn các khoảng nghỉ ngẫu nhiên (`minDelaySec` - `maxDelaySec`) giữa các bước để mô phỏng hành vi tự nhiên của Phật tử đi dạo trong chùa.
- **Nhịp tụng kinh & gõ mõ**: Thay vì gửi dồn dập, bot gõ 1-3 tiếng mõ rồi nghỉ ngắn 2.2s - 3.7s theo đúng nhịp điệu trang nghiêm.

---

## 10. HƯỚNG DẪN TRIỂN KHAI LÊN RENDER CLOUD 24/7

Dự án đã tích hợp sẵn tệp khai báo [`render.yaml`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/render.yaml) để deploy miễn phí lên Render.com:

### Các Bước Thực Hiện:
1. Đẩy mã nguồn lên kho chứa GitHub cá nhân.
2. Đăng nhập [render.com](https://render.com) ➔ Chọn **Blueprints** ➔ Bấm **New Blueprint Instance**.
3. Chọn repo `didenchua` vừa đẩy lên. Render sẽ tự động nhận diện cấu hình:
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: `Free`
4. Cài đặt các biến môi trường quan trọng:
   - `CID`: `YOUR_ACCOUNT_CID` (Bắt buộc)
   - `NAME`: `phat-tu`
   - `ROOM`: `chua-1`
   - `AUTH_TOKEN`: `YOUR_SECRET_TOKEN` (Bắt buộc để gọi `/cron`, `/run` hoặc API quản trị)
   - `TELEGRAM_BOT_TOKEN`: *(Tùy chọn nhận tin nhắn báo cáo)*
   - `TELEGRAM_CHAT_ID`: *(Tùy chọn nhận tin nhắn báo cáo)*
5. Bấm **Apply** để hoàn tất triển khai!

> [!TIP]
> **Giải pháp chống ngủ đông (Render Free Tier Spindown Prevention):**  
> Do gói Free của Render sẽ ngủ sau 15 phút không có ai truy cập, bạn chỉ cần tạo 1 lịch hẹn miễn phí tại [cron-job.org](https://cron-job.org) hoặc [UptimeRobot](https://uptimerobot.com):
> - **Ping giữ server thức 24/7**: Ping URL `https://<ten-app>.onrender.com/health` mỗi 10 phút.
> - **Kích hoạt tự động lúc 00:05**: Gửi `POST` tới `https://<ten-app>.onrender.com/cron` vào lúc `00:05` sáng hàng ngày (giờ Việt Nam), kèm header `Authorization: Bearer <AUTH_TOKEN>`.

---

## 11. HỆ THỐNG THÔNG BÁO TỰ ĐỘNG (TELEGRAM & DISCORD)

Tập tin [`src/notify.js`](file:///Users/tyson/Library/CloudStorage/GoogleDrive-philip@mtglobal.tech/Drive%20của%20tôi/didenchua/src/notify.js) hỗ trợ định dạng bảng tin trang nhã gửi trực tiếp về điện thoại:

```
🪷 BÁO CÁO THỜI KHÓA TU TẬP CHÙA AN TỰ DUYÊN 🪷
────────────────────────────────────────
👤 Phật tử: <configured account>
🏅 Danh hiệu: Trăm chuỗi hạt 🏆
✨ Cấp bậc: An lạc (Lv.4)
📈 Công đức: 1.839 / 3.000 điểm

📊 THÀNH QUẢ NGÀY HÔM NAY:
  ✅ Điểm danh ngày mới (Chuỗi 3 ngày liên tiếp)
  ✅ Dâng hương Chánh điện Tam Bảo
  ✅ Thả hoa đăng cầu bình an
  ✅ Quét dọn lá sân chùa & Cho cá ăn
  ✅ Lạy Phật sám hối (1.344 lạy)
  ✅ Lăn tràng hạt niệm Phật (100 chuỗi tròn)
  ✅ Tọa thiền tịnh tâm tại Vườn thiền
  🎁 Đã thu nhận trọn vẹn tất cả quà tặng nhiệm vụ!

Nam Mô Công Đức Lâm Bồ Tát Ma Ha Tát 🙏
```

---

## 12. CẨM NANG TRA CỨU LỆNH CLI & NPM SCRIPTS

Hệ thống hỗ trợ hơn 35 câu lệnh dòng lệnh cực kỳ tiện lợi:

### 🌟 Lệnh Chạy Toàn Bộ & Chu Trình
| Lệnh | Ý Nghĩa Thực Hiện |
| :--- | :--- |
| `npm run auto` hoặc `node cli.js auto` | **Cỗ máy Tự chơi Thông minh (Autonomous Bot)**: Tự nhận diện ghi nhận, tự đổi việc khi chạm trần, chuyển sang treo tích luỹ (lạy, chuỗi, thiền) và tự canh đúng giờ thắp đèn (16:30 - 21:30) & đố vui (20:00 UTC+7). |
| `node cli.js auto --once` | Chạy 1 chu kỳ tự chơi hoàn chỉnh rồi dừng. |
| `node cli.js auto --probe` | Chẩn đoán các việc đang còn ghi nhận hoặc đã bão hòa. |
| `npm run all` hoặc `npm run quests` | Chạy toàn diện chu trình 5 tầng: làm sạch nhiệm vụ ngày, cày thành tích và ngồi thiền. |
| `npm run ci` | Chạy nhanh các nhiệm vụ hành động tức thời (~1 phút, phù hợp kiểm tra nhanh). |
| `npm run farm` | Chỉ cày mốc tích lũy vĩnh viễn (Lạy Phật, Chuỗi hạt, Quét sân) theo chỉ tiêu. |
| `npm run status` | Xem nhanh cấp bậc, điểm công đức và tiến độ nhiệm vụ ngày. |
| `npm run journal` | Xem bảng hồ sơ chi tiết 4 Tab: công đức, bộ sưu tập, danh hiệu, tài khoản. |

### 🛠️ Lệnh Từng Tác Vụ Cụ Thể (Kèm Tham Số)
| Cú Pháp Lệnh | Ví Dụ Thực Tế | Mô Tả |
| :--- | :--- | :--- |
| `node cli.js lay [số lạy]` | `node cli.js lay 108` | Cúi lạy Phật sám hối N lạy (mặc định 108 lạy để cày danh hiệu). |
| `node cli.js chuoi [số hạt]` | `node cli.js chuoi 108` | Lăn N hạt tràng niệm Phật (108 hạt để tròn 1 chuỗi). |
| `node cli.js quet [số lần]` | `node cli.js quet 10` | Quét lá sân chùa N lượt công quả. |
| `node cli.js huong [số nén]` | `node cli.js huong 3` | Dâng N nén tâm hương trước Chánh điện. |
| `node cli.js den [số ngọn]` | `node cli.js den 5` | Thả N ngọn hoa đăng cầu an trên hồ sen. |
| `node cli.js bell [số tiếng]` | `node cli.js bell 3` | Thỉnh N tiếng Đại hồng chung gác chuông. |
| `node cli.js mo [số tiếng]` | `node cli.js mo 30` | Gõ N tiếng mõ tụng kinh khoan thai. |
| `node cli.js am` | `node cli.js am` | Bước vào Am riêng tu tập, dâng 3 nén hương hoàn thành quest tuần. |
| `node cli.js phapduong` | `node cli.js phapduong` | Bước vào Pháp đường đại giảng đường nghe pháp. |
| `node cli.js khoe` | `node cli.js khoe` | Khoe thành tích tu tập lên kênh chat chung (+10 công đức). |
| `node cli.js title [mã]` | `node cli.js title ngan-lay` | Đổi danh hiệu trên đầu (`moi`, `ngan-lay`, `tram-chuoi`...). |
| `node cli.js look [trang bị]` | `node cli.js look robe=lam` | Đổi áo tràng, tràng hạt, bồ đoàn hoặc pháp khí. |
| `node cli.js quiz [chế độ]` | `node cli.js quiz practice` | Chơi Đố vui Phật pháp AI (luyện tập hoặc thi đấu lúc 20:00). |
| `node cli.js secrets` | `node cli.js secrets` | Chạy toàn bộ nhiệm vụ ẩn: gieo quẻ, xin chữ Thầy đồ, đài Quan Âm... |
| `node cli.js watch` | `npm run watch` | Mở Google Chrome 3D thật và tự động làm nhiệm vụ ngay trước mắt bạn. |

---

## 13. XỬ LÝ LỖI THƯỜNG GẶP (TROUBLESHOOTING GUIDE)

### 1. Lỗi: "Chùa đang mở ở nơi khác"
- **Nguyên nhân**: Bạn đang mở trang web chùa trên trình duyệt và cùng lúc đó một tiến trình nền kết nối tới máy chủ.
- **Cách khắc phục**:
  - Tắt tab trình duyệt cũ đi nếu muốn bot chạy ngầm.
  - Hoặc nếu đang muốn tự chơi, hãy để bot yên, không chạy lệnh nền nào.
  - Hoặc sử dụng `npm run watch` để bot điều khiển trực tiếp trên trình duyệt đang mở.

### 2. Lỗi: Nhiệm vụ thiền không được ghi nhận
- **Nguyên nhân**: Đứng thiền mà không gửi gói tin `meditate: true` hoặc bị disconnect giữa chừng do thiếu heartbeat.
- **Cách khắc phục**: Luôn sử dụng lệnh chuẩn `node cli.js meditate 300` (đã tích hợp cơ chế chống rớt mạng tự động).

### 3. Lỗi: Render Web Service bị Sleep
- **Nguyên nhân**: Gói Free của Render tạm dừng sau 15 phút không có request.
- **Cách khắc phục**: Thiết lập ping định kỳ 10 phút/lần tới `https://<ten-app>.onrender.com/health` qua UptimeRobot.

---

## 🙏 LỜI KẾT
> *"Một lòng hướng Phật, tâm an vạn sự an.*  
> *Mỗi nén hương dâng lên là một niệm lành gieo xuống cõi nhân gian."*  
> Chúc quý bạn đồng tu thân tâm thường an lạc, bồ đề tâm kiên cố, công đức ngày càng tăng trưởng! Nam Mô A Di Đà Phật.

