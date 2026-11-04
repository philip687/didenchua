import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runChores() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doChores();
    await client.doPet();
    await client.doGarden();
    log.success('Đã hoàn thành các việc công quả chùa (quét sân, cho cá ăn, chăm mèo, tưới hoa sen)!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi làm công quả:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('chores.js')) {
  runChores().then(() => process.exit(0));
}

