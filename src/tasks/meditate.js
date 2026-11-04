import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runMeditate(seconds = 300) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doMeditate(seconds);
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi ngồi thiền tĩnh tâm:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('meditate.js')) {
  const secs = process.argv[2] ? parseInt(process.argv[2], 10) : 300;
  runMeditate(secs).then(() => process.exit(0));
}

