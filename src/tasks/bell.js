import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runBell(count = 1) {
  const client = new DiDenChuaClient();
  try {
    await client.connect(15000);
    await client.doBell(count);
    log.success(`Đã hoàn tất thỉnh ${count} tiếng đại hồng chung!`);
  } catch (err) {
    log.error('Lỗi khi thỉnh chuông:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('bell.js')) {
  const cnt = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  runBell(cnt).then(() => process.exit(0));
}

