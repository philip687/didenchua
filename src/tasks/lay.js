import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runLay(count = 108) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doLay(count);
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi lạy Phật:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('lay.js')) {
  const count = process.argv[2] ? parseInt(process.argv[2], 10) : 108;
  runLay(count).then(() => process.exit(0));
}

