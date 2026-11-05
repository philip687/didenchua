import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runPhapDuong(minutes = 1) {
  const client = new DiDenChuaClient();
  try {
    await client.connect(20000);

    // 1. Vào Pháp đường
    await client.doEnterPhapDuong();

    // 2. Tọa thiền hoặc lắng nghe thuyết pháp trong số phút cấu hình
    const seconds = Math.max(10, minutes * 60);
    log.info(`-> Tọa thiền & tu tập tại Pháp đường trong ${minutes} phút (${seconds}s)...`);

    const start = Date.now();
    let lastLog = 0;
    while ((Date.now() - start) / 1000 < seconds) {
      client.checkAborted();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (elapsed - lastLog >= 30) {
        log.info(`Pháp đường: Đã tĩnh tâm ${Math.floor(elapsed / 60)}p${elapsed % 60}s / ${minutes} phút`);
        lastLog = elapsed;
      }
      await client.sleep(1000);
    }

    // 3. Rời Pháp đường
    await client.doLeavePhapDuong();
    log.success(`Hoàn tất buổi tu tập ${minutes} phút tại Pháp đường!`);
  } catch (err) {
    log.error('Lỗi khi tu tập tại Pháp đường:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('phapduong.js')) {
  const mins = process.argv[2] ? parseFloat(process.argv[2]) : 1;
  runPhapDuong(mins).then(() => process.exit(0));
}

