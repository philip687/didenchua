import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runStatus() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    client.printStatus();
    await client.fetchJournal();
    client.printJournal();
  } catch (err) {
    log.error('Lỗi khi kiểm tra trạng thái:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('status.js')) {
  runStatus().then(() => process.exit(0));
}

