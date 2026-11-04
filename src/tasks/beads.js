import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runBeads(count = 20) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doBeads(count);
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi lăn tràng hạt:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('beads.js')) {
  const count = process.argv[2] ? parseInt(process.argv[2], 10) : 20;
  runBeads(count).then(() => process.exit(0));
}

