import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runQuetLa(count = 1, options = {}) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doQuetLa(count, options);
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi quét lá:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('quet.js')) {
  const count = process.argv[2] ? parseInt(process.argv[2], 10) : 1;
  runQuetLa(count).then(() => process.exit(0));
}
