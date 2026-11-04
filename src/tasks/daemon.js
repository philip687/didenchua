import { runAllQuests } from './all.js';
import { log } from '../logger.js';

function getTodayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function startDaemon() {
  log.temple('🕉️', 'TIẾN TRÌNH TỰ ĐỘNG CHẠY NGẦM ĐÃ KHỞI ĐỘNG');
  log.info('Tiến trình này sẽ tự động làm nhiệm vụ hàng ngày và giữ streak điểm danh.');
  console.log('--------------------------------------------------');

  let lastRunDate = '';

  const runRoutine = async () => {
    const today = getTodayString();
    log.info(`[${new Date().toLocaleTimeString()}] Bắt đầu chu kỳ làm nhiệm vụ cho ngày: ${today}`);
    try {
      await runAllQuests({ skipMeditate: true });
      lastRunDate = today;
      log.success(`Đã hoàn tất chu kỳ hôm nay (${today}). Lần chạy tiếp theo: Sau 00:01 sáng mai.`);
    } catch (err) {
      log.error('Lỗi khi chạy nhiệm vụ trong daemon:', err.message);
    }
  };

  // Chạy ngay lần đầu khi bật
  await runRoutine();

  // Kiểm tra mỗi 10 phút xem đã qua ngày mới chưa
  setInterval(async () => {
    const today = getTodayString();
    if (today !== lastRunDate) {
      log.info(`Phát hiện ngày mới (${today})! Tiến hành tự động điểm danh và làm nhiệm vụ...`);
      await runRoutine();
    }
  }, 10 * 60 * 1000);

  log.info('Tiến trình ngầm đang lắng nghe (nhấn Ctrl+C để dừng)...');
}

if (process.argv[1]?.endsWith('daemon.js')) {
  startDaemon();
}

