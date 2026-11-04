import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runVisit() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doVisitAll();
    await client.fetchJournal();
    client.printJournal();
  } catch (err) {
    log.error('Lỗi khi thăm các khu chùa:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('visit.js')) {
  runVisit().then(() => process.exit(0));
}

