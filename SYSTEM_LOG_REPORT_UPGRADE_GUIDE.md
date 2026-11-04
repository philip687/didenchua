# Hướng dẫn Agent Coding: Nâng cấp report nhật ký hệ thống

## Mục tiêu

Nâng cấp nhật ký trên dashboard và phần tổng kết sau mỗi lần chạy để user/dev trả lời được:

- Lượt chạy nào đã diễn ra, bắt đầu lúc nào và được kích hoạt từ đâu?
- Tác vụ nào đã được gửi, tác vụ nào được server xác nhận, và tác vụ nào chưa thể xác minh?
- Nếu lỗi, lỗi xảy ra ở bước nào và cần xử lý gì tiếp theo?
- Dữ liệu trong report được lấy lúc nào, theo múi giờ nào, và có đầy đủ hay không?

Report cần ngắn gọn, dễ quét, trung thực với bằng chứng có trong hệ thống và không làm lộ thông tin tài khoản.

## Phạm vi cần đọc

Trước khi sửa, đọc:

- `server.js`: `state.currentLogs`, `state.runHistory`, `executeRoutine()`, `addWebLog()`, dashboard, `/api/status` và `/health`.
- `src/logger.js`: mức log, timestamp và `setLogHook()`.
- `src/notify.js`: tổng kết Telegram/Discord.
- `src/client.js` và `src/tasks/all.js`: message gửi đi, phản hồi nhận được, claim và trạng thái kết nối.
- `README.md` và `AGENT_UPGRADE_GUIDE.md`: cách sản phẩm được kỳ vọng vận hành và các yêu cầu bảo mật đã nêu.

Không sửa các thay đổi đang có trong workspace nếu chúng không thuộc phạm vi này. Không thay giao thức máy chủ bên ngoài dựa trên phỏng đoán.

## Nguyên tắc báo cáo

1. **Báo điều đã biết, phân biệt điều chưa xác minh.** Routine chạy hết không đồng nghĩa mọi hành động đã được server chấp nhận.
2. **Giữ riêng log sự kiện và bản tổng kết.** Log ghi các mốc vận hành; summary gom kết quả cho một lượt chạy.
3. **Dùng dữ liệu thật hoặc thể hiện rõ dữ liệu thiếu.** Không dùng tên tài khoản, điểm số hay tiến độ mẫu để lấp chỗ trống.
4. **Timestamps có một chuẩn.** Lưu timestamp chuẩn UTC; chuyển sang múi giờ hiển thị ở giao diện và ghi rõ nhãn múi giờ.
5. **Không ghi bí mật.** Không log CID, token, webhook URL, thông tin xác thực, nội dung header hoặc payload nhạy cảm.
6. **Dữ liệu hiển thị là text không đáng tin cậy.** Không chèn log, lỗi, tên tài khoản hoặc nội dung từ server vào HTML như markup.
7. **Report phải cho biết phạm vi dữ liệu.** Nêu rõ log chỉ giữ trong phiên hay được lưu bền vững; không gọi log tạm là audit trail đầy đủ.

## Nội dung report nên có

### Thẻ tổng kết một lượt chạy

- Run ID ổn định, duy nhất.
- Thời gian bắt đầu/kết thúc, múi giờ hiển thị, thời lượng.
- Nguồn kích hoạt: dashboard, scheduler, cron hoặc CLI; không ghi thông tin bí mật từ request.
- Trạng thái tổng quát: `success`, `partial`, `failed` hoặc `unverified`.
- Số tác vụ đã gửi, được xác nhận, thất bại và chưa xác minh nếu dữ liệu hiện có cho phép tính.
- Tóm tắt điểm/tiến độ sau chạy kèm thời điểm lấy dữ liệu; phân biệt với mức tăng do lượt chạy nếu không có snapshot trước/sau đáng tin cậy.
- Danh hiệu mới nếu có bằng chứng trước/sau; nếu dữ liệu thiếu, ghi “không xác định”.
- Lỗi chính và bước gặp lỗi, đã lược bỏ dữ liệu nhạy cảm.

Không bắt buộc hiển thị mọi trường nếu không có bằng chứng. Tránh tạo số liệu tổng hợp có vẻ chính xác nhưng không đo được.

### Nhật ký sự kiện

Mỗi sự kiện nên có các trường phù hợp:

```json
{
  "timestamp": "2026-11-04T00:05:00.000Z",
  "runId": "<id>",
  "level": "info",
  "event": "routine.started",
  "step": "daily-actions",
  "message": "Bắt đầu chu trình nhiệm vụ",
  "outcome": "started"
}
```

Đây chỉ là ví dụ về cấu trúc, không phải giao thức server. Dùng tên sự kiện và trạng thái thống nhất trong code. Các mức log đề xuất: `debug`, `info`, `warn`, `error`; có thể thêm mức khác nếu cần cho luồng vận hành cụ thể.

Ghi các mốc có giá trị chẩn đoán: bắt đầu/kết thúc run, bắt đầu/kết thúc bước, timeout, mất kết nối, xác nhận hoặc từ chối từ server, làm mới snapshot, và lỗi thông báo ngoài. Không để các dòng mô tả lặp lại từng thao tác nhỏ lấn át cảnh báo và lỗi ở chế độ xem mặc định.

## Trạng thái và bằng chứng

- Chỉ dùng `success` khi các điều kiện thành công của routine đã được xác nhận theo khả năng của giao thức.
- Dùng `partial` khi một phần bước thành công nhưng có bước thất bại hoặc bị bỏ qua.
- Dùng `failed` khi routine không hoàn tất do lỗi.
- Dùng `unverified` khi chỉ biết đã gửi yêu cầu hoặc giao thức không cung cấp phản hồi đủ để xác nhận kết quả.
- Với từng hành động quan trọng, giữ khác biệt giữa `sent`, `acknowledged`, `rejected`, `timed_out` và `unknown` nếu source/protocol cung cấp được các trạng thái đó.
- Không suy ra claim thành công từ snapshot merit cũ. Nếu không có ACK, làm mới trạng thái khi có thể và mô tả chính xác giới hạn của việc đối chiếu.
- Lỗi gửi Telegram/Discord nên được ghi riêng; không biến lỗi gửi notification thành lỗi routine đã hoàn tất, trừ khi sản phẩm định nghĩa rõ notification là điều kiện bắt buộc.

Trước khi thêm xác nhận, tìm bằng chứng về các message phản hồi trong code hiện có. Không tự nghĩ ra ACK, mã lỗi hoặc semantics của máy chủ từ xa.

## Lưu trữ và dung lượng

Chọn chính sách theo nhu cầu sản phẩm, không tự thêm hạ tầng lớn:

- Nếu chỉ phục vụ giám sát trực tiếp, giữ buffer giới hạn trong bộ nhớ và ghi rõ dữ liệu mất khi tiến trình restart.
- Nếu user/dev cần tra cứu các lần chạy trước khi restart, thiết kế lưu trữ bền vững phù hợp với môi trường triển khai; xác định giới hạn dung lượng, thời hạn lưu và cách xử lý lỗi ghi.
- Giới hạn số bản ghi và kích thước nội dung mỗi bản ghi để tránh log tăng không kiểm soát.
- Không cho dữ liệu từ request điều khiển đường dẫn hoặc tên file log.
- Không trả toàn bộ log nhạy cảm qua endpoint công khai. Áp dụng cùng chính sách xác thực với dashboard/API.

## Hiển thị an toàn và dễ đọc

- Render message động bằng `textContent` hoặc cơ chế escape phù hợp theo ngữ cảnh; không ghép log vào `innerHTML`.
- Hiển thị level, thời gian, run ID và bước theo cấu trúc nhất quán; icon chỉ để hỗ trợ quét, không thay thế label văn bản.
- Đặt lỗi và trạng thái chưa xác minh nổi bật hơn log thông tin.
- Giữ phần xem nhanh gọn; cho phép mở rộng chi tiết theo run nếu cần.
- Nếu có trường bị lược bỏ vì bảo mật, không hiển thị nội dung gốc trong HTML, JSON API, notification hay stack trace người dùng thấy.

## Trạng thái tiến độ

Khi chỉ đọc hoặc đang thiết kế, không sửa code. Khi được giao thực hiện, ưu tiên thay đổi tập trung vào report và các nguồn dữ liệu trực tiếp cần cho report; tránh mở rộng sang endpoint authentication, lịch scheduler hoặc nghiệp vụ task nếu không cần thiết cho mục tiêu này.

Không thêm hoặc chạy test, build hay chương trình nếu user chưa yêu cầu kiểm tra. Nếu user yêu cầu kiểm tra, báo rõ lệnh đã chạy và giới hạn của kết quả. Không kết nối tài khoản thật, gửi hành động thật hoặc triển khai để “xác minh” report.

## Tiêu chí hoàn tất

- Mỗi lượt chạy có định danh, nguồn, thời gian và trạng thái được lưu nhất quán.
- Report phân biệt rõ kết quả đã xác nhận với yêu cầu chỉ mới gửi hoặc chưa thể xác minh.
- Không còn giá trị mặc định giả làm dữ liệu tài khoản thật.
- Thời gian được chuẩn hóa và hiển thị kèm múi giờ nhất quán.
- Log lỗi không bị log thông tin lặp lại che khuất; nội dung lỗi đã được làm sạch thông tin nhạy cảm.
- Dashboard và notification không diễn giải dữ liệu log/tài khoản thành HTML.
- Chính sách lưu giữ, giới hạn và quyền xem log được mô tả rõ.
- README khớp với hành vi report sau nâng cấp.
- Báo cáo công việc nêu rõ file thay đổi, trạng thái/nguồn bằng chứng, dữ liệu chưa xác minh, chính sách lưu trữ và các kiểm tra được phép thực hiện.

## Mẫu summary dành cho người đọc

```text
Run: <run-id> · Nguồn: <source>
Bắt đầu: <timestamp + timezone> · Thời lượng: <duration>
Trạng thái: <success | partial | failed | unverified>
Tác vụ: <confirmed>/<sent> xác nhận · <failed> lỗi · <unknown> chưa xác minh
Snapshot tài khoản: <timestamp> · <điểm/tiến độ hoặc “không có dữ liệu mới”>
Lỗi cần chú ý: <step + safe message hoặc “không có”>
Lưu trữ: <trong phiên | lưu bền vững đến ...>
```

Điều chỉnh hoặc bỏ các dòng không có bằng chứng; không điền số 0 cho dữ liệu chưa tải được.
