import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runClaim() {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.claimAllQuests();
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi nhận thưởng:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('claim.js')) {
  runClaim().then(() => process.exit(0));
}

