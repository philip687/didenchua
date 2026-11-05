import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runJournal() {
  const client = new DiDenChuaClient();
  try {
    await client.connect(15000);
    await client.fetchJournal();
    client.printJournal();
  } catch (err) {
    log.error('Lỗi khi tải bảng danh hiệu:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('journal.js')) {
  runJournal().then(() => process.exit(0));
}

