# Hướng dẫn Agent Coding nâng cấp didenchua

## Mục tiêu

Nâng độ an toàn và độ tin cậy của tool tự động hóa trong repo này, tập trung vào dashboard HTTP, cấu hình tài khoản, lịch chạy daemon và độ chính xác của báo cáo. Hãy làm theo từng ưu tiên, giữ thay đổi nhỏ và có thể rà soát; không suy đoán giao thức máy chủ `didenchua.online` khi chưa có bằng chứng từ source hoặc tài liệu đáng tin cậy.

## Quy tắc làm việc

- Đọc `README.md`, `package.json`, `config.js`, `server.js`, `src/client.js`, và các task liên quan trước khi sửa.
- Giữ tương thích với cách gọi CLI hiện có, trừ khi thay đổi đó được nêu rõ và cập nhật tài liệu.
- Không gửi lệnh tới tài khoản thật, không mở phiên WebSocket thật, không triển khai hay gọi endpoint bên ngoài trong quá trình nâng cấp.
- Không đưa CID, token, webhook URL hoặc dữ liệu nhận dạng tài khoản vào mã nguồn, log, ví dụ, ảnh chụp hay báo cáo.
- Không khẳng định hành động/claim thành công nếu chưa có xác nhận từ server. Phân biệt rõ “đã gửi yêu cầu”, “đã được xác nhận” và “chưa xác minh”.
- Không thêm hoặc chạy test, build hay chương trình nếu người dùng chưa yêu cầu kiểm tra. Khi được yêu cầu kiểm tra, dùng kiểm tra cục bộ phù hợp và báo chính xác phần đã chạy.
- Dùng `rtk` làm tiền tố cho lệnh shell theo hướng dẫn môi trường.

## Ưu tiên 1: Bảo vệ dashboard và API

Hiện `server.js` cho phép kích hoạt routine qua `/api/run`, `/run` và `/cron` mà không có xác thực; các route này cũng nhận GET. Dashboard lắng nghe trên `0.0.0.0`, còn `/api/status` trả dữ liệu tài khoản và log.

Thực hiện:

1. Bắt buộc phương thức POST cho mọi endpoint tạo tác vụ; các phương thức khác phải nhận mã lỗi phù hợp và không được chạy routine.
2. Bảo vệ lệnh chạy bằng cơ chế xác thực phù hợp với môi trường triển khai. Hỗ trợ gọi cron có xác thực; không để URL công khai có thể kích hoạt tác vụ chỉ bằng cách truy cập.
3. Thêm giới hạn hợp lý cho tham số `meditate` và các đầu vào khác; từ chối giá trị sai, âm, quá lớn hoặc không phải số nguyên. Không để request công khai giữ tiến trình chạy lâu tùy ý.
4. Quyết định rõ endpoint nào được công khai. `/health` chỉ nên trả thông tin tối thiểu cần cho health check; bảo vệ dữ liệu tài khoản, lịch sử và log.
5. Thêm phản hồi trạng thái HTTP chính xác cho lỗi xác thực, phương thức không hỗ trợ, đầu vào không hợp lệ và routine đang chạy.
6. Nếu dùng cookie/session cho dashboard, chống CSRF. Nếu dùng token cho cron/API, so sánh an toàn, không ghi token vào log và không đặt token trong URL.

## Ưu tiên 2: Chống XSS và xử lý dữ liệu không tin cậy

`server.js` hiện chèn log, lịch sử, tên và dữ liệu tài khoản vào HTML theo dạng chuỗi; phần cập nhật log trong trình duyệt dùng `innerHTML`.

Thực hiện:

1. Không đưa dữ liệu động chưa escape vào template HTML. Dùng hàm escape HTML có phạm vi rõ ràng hoặc render DOM bằng `textContent`.
2. Khi cập nhật log phía trình duyệt, tạo phần tử và gán `textContent`; không ghép nội dung log vào `innerHTML`.
3. Rà soát mọi trường từ WebSocket, query string, lỗi runtime và thông tin tài khoản như dữ liệu không tin cậy, kể cả khi hiện tại chúng thường do server bên thứ ba gửi.
4. Tránh nhúng trực tiếp chuỗi người dùng vào JavaScript nội tuyến. Nếu cần truyền dữ liệu, serialize an toàn hoặc tải JSON rồi render bằng text.

## Ưu tiên 3: Loại thông tin tài khoản khỏi mã nguồn

`config.json` và `render.yaml` hiện có CID và tên tài khoản cố định. Chuyển các giá trị môi trường riêng tư sang cấu hình môi trường của máy chạy; chỉ giữ giá trị mẫu không nhạy cảm trong repo.

Thực hiện:

1. Không commit giá trị CID thật trong `config.json`, `render.yaml`, README hoặc workflow. Cập nhật ví dụ dùng placeholder.
2. Giữ hỗ trợ `CID`, `NAME`, `ROOM` qua biến môi trường và ghi rõ biến bắt buộc/tùy chọn.
3. Nếu CID đã được chia sẻ trong repo công khai hoặc được máy chủ dùng như thông tin xác thực, hướng dẫn người vận hành thay/thu hồi CID theo cơ chế của dịch vụ. Không tự động liên hệ dịch vụ hoặc thực hiện thay đổi tài khoản.
4. Kiểm tra `.gitignore` và hướng dẫn triển khai để file cấu hình cá nhân không bị commit nhầm. Không xóa lịch sử Git hoặc viết lại lịch sử nếu chưa được yêu cầu rõ.

## Ưu tiên 4: Sửa luồng daemon và lịch chạy

`src/tasks/daemon.js` truyền `{ skipMeditate: true }`, nhưng `runAllQuests()` trong `src/tasks/all.js` không đọc tùy chọn này; vì vậy daemon vẫn chạy giai đoạn thiền. Scheduler của web server chỉ kiểm tra đúng phút 00:05, nên có thể bỏ lỡ khi tiến trình ngủ hoặc khởi động lại.

Thực hiện:

1. Dùng đúng tùy chọn được `runAllQuests()` hỗ trợ, hoặc bổ sung một tùy chọn rõ nghĩa và xử lý nhất quán trong hàm này. Không duy trì hai tên tùy chọn cho cùng hành vi.
2. Xác định từ README/hành vi hiện tại liệu daemon có nên chạy ngay khi khởi động hay chờ lịch tiếp theo; giữ hành vi có chủ ý và cập nhật tài liệu.
3. Thay lịch “đúng một phút” bằng cơ chế có thể chạy bù sau khi tiến trình khởi động trễ, đồng thời bảo đảm mỗi ngày chỉ chạy tối đa một lần trong phạm vi vận hành dự kiến.
4. Chọn và ghi rõ múi giờ. Xử lý lỗi chạy để không đánh dấu ngày đã hoàn tất khi routine thất bại.
5. Nếu dịch vụ có thể chạy nhiều instance, khóa trong bộ nhớ không đủ để ngăn chạy trùng; cần cơ chế khóa dùng chung hoặc nêu rõ giới hạn triển khai.

## Ưu tiên 5: Báo cáo kết quả dựa trên xác nhận

Các hàm gửi hành động/claim trong `src/client.js` hiện gửi WebSocket rồi tiếp tục, trong khi routine có thể ghi trạng thái thành công mà không xác nhận từng kết quả.

Thực hiện:

1. Kiểm tra các loại message phản hồi thực tế trong code/protocol có sẵn trước khi thiết kế xác nhận. Không tự đặt tên message hoặc quy tắc server.
2. Nếu có phản hồi tương ứng, chờ xác nhận với timeout và xử lý lỗi/đóng kết nối cho từng thao tác quan trọng.
3. Nếu giao thức không cung cấp xác nhận, thể hiện báo cáo là “đã gửi routine / chưa xác minh kết quả”, không ghi “hoàn thành thành công” theo nghĩa server đã ghi nhận.
4. Sau claim, làm mới dữ liệu hoặc dùng phản hồi xác nhận trước khi báo đã nhận thưởng. Không dựa vào snapshot `merit` cũ để khẳng định claim thành công.
5. Đảm bảo mọi đường thoát đều đóng WebSocket và timer; lỗi một thao tác phải được đưa vào trạng thái run cuối cùng.

## Tiêu chí hoàn tất

- Endpoint tạo tác vụ không thể bị kích hoạt ẩn danh hoặc bằng GET; cron và dashboard dùng được theo cơ chế xác thực đã chọn.
- Dữ liệu log/tài khoản không được thực thi như HTML/JavaScript trong dashboard.
- Không còn CID/tokens thật được thêm mới vào source hoặc ví dụ cấu hình được commit.
- Daemon bỏ qua thiền đúng như chủ đích, và lịch chạy có chính sách khởi động trễ/chạy trùng được mô tả rõ.
- Trạng thái thành công, thất bại và chưa xác minh phản ánh đúng bằng chứng nhận từ server.
- README và hướng dẫn triển khai khớp với cách cấu hình, xác thực và vận hành sau nâng cấp.
- Bản tổng kết nêu file đã đổi, rủi ro còn lại và các kiểm tra đã thực hiện; không gọi là live-verified nếu chưa được phép chạy trên dịch vụ thật.

## Cách báo cáo khi hoàn tất

Tóm tắt theo thứ tự: vấn đề đã xử lý, file chính đã đổi, thay đổi cấu hình cần người vận hành thực hiện, kiểm tra đã chạy (nếu được yêu cầu), và giới hạn chưa thể xác minh. Không đưa bí mật hoặc CID vào báo cáo.
