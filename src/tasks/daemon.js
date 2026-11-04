import { runAllQuests } from './all.js';
import { log } from '../logger.js';

// Định dạng ngày theo múi giờ Việt Nam (UTC+7)
function getTodayString() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function startDaemon() {
  log.temple('🕉️', 'TIẾN TRÌNH TỰ ĐỘNG CHẠY NGẦM ĐÃ KHỞI ĐỘNG (DAEMON MODE)');
  log.info('Múi giờ vận hành: Asia/Ho_Chi_Minh (UTC+7)');
  log.info('Tiến trình này sẽ tự động làm nhiệm vụ hàng ngày và giữ streak điểm danh.');
  console.log('--------------------------------------------------');

  let lastRunDate = '';
  let isRunning = false;

  const runRoutine = async () => {
    if (isRunning) return;
    isRunning = true;
    const today = getTodayString();
    log.info(`[${new Date().toLocaleTimeString('vi-VN')}] Bắt đầu chu kỳ làm nhiệm vụ cho ngày: ${today} (UTC+7)`);
    try {
      // Chạy với skipHang: true (đồng bộ với all.js để bỏ qua nhiệm vụ treo thiền 5 phút)
      await runAllQuests({ skipHang: true });
      lastRunDate = today;
      log.success(`Đã hoàn tất chu kỳ hôm nay (${today}). Lần chạy tiếp theo: Sau 00:01 sáng mai (giờ VN).`);
    } catch (err) {
      log.error('Lỗi khi chạy nhiệm vụ trong daemon:', err.message);
      // Không đánh dấu lastRunDate để cho phép chu kỳ kiểm tra tiếp theo có thể thử lại
    } finally {
      isRunning = false;
    }
  };

  // Chạy ngay lần đầu khi khởi động daemon
  await runRoutine();

  // Kiểm tra mỗi 10 phút xem đã qua ngày mới chưa (theo UTC+7)
  setInterval(async () => {
    const today = getTodayString();
    if (today !== lastRunDate && !isRunning) {
      log.info(`Phát hiện ngày mới (${today})! Tiến hành tự động điểm danh và làm nhiệm vụ...`);
      await runRoutine();
    }
  }, 10 * 60 * 1000);

  log.info('Tiến trình ngầm đang lắng nghe (nhấn Ctrl+C để dừng)...');
}

if (process.argv[1]?.endsWith('daemon.js')) {
  startDaemon();
}
