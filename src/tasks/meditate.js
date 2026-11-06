import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runMeditateWithClient(client, seconds = 3600, options = {}) {
  return await client.doMeditate(seconds, null, options);
}

export async function runMeditate(seconds = 3600, options = {}) {
  const client = new DiDenChuaClient();
  try {
    await client.connect(8000);
    const result = await client.doMeditate(seconds, null, options);
    await client.claimAllQuests();
    return result;
  } catch (err) {
    log.error('Lỗi khi ngồi thiền tĩnh tâm:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('meditate.js')) {
  const secs = process.argv[2] ? parseInt(process.argv[2], 10) : 3600;
  runMeditate(secs).then(() => process.exit(0));
}
