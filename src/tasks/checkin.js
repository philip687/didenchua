import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runCheckin() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doCheckin();
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi điểm danh:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('checkin.js')) {
  runCheckin().then(() => process.exit(0));
}
