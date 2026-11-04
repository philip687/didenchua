import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runIncense(count = 1) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doIncense(count);
    log.success('Đã hoàn thành dâng hương và nhận công đức!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi dâng hương:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('incense.js')) {
  const count = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  runIncense(count).then(() => process.exit(0));
}
