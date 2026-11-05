import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runKhoe() {
  const client = new DiDenChuaClient();
  try {
    await client.connect(12000);
    await client.doKhoe();
  } catch (err) {
    log.error('Lỗi khi khoe thành tích:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('khoe.js')) {
  runKhoe().then(() => process.exit(0));
}

