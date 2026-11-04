import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runBell() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doBell();
    log.success('Đã thỉnh đại hồng chung!');
  } catch (err) {
    log.error('Lỗi khi thỉnh chuông:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('bell.js')) {
  runBell().then(() => process.exit(0));
}

