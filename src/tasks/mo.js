import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runMo(count = 108, options = {}) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doMo(count, options);
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi gõ mõ:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('mo.js')) {
  const count = process.argv[2] ? parseInt(process.argv[2], 10) : 108;
  runMo(count).then(() => process.exit(0));
}

