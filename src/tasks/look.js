import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runLook(options = {}) {
  const client = new DiDenChuaClient();
  try {
    await client.connect(12000);
    await client.setLook(options);
  } catch (err) {
    log.error('Lỗi khi cập nhật diện mạo / trang bị:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('look.js')) {
  // Parse command line arguments like: robe=lam beads=tuDan phapkhi=truong cushion=laSen
  const options = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.includes('=')) {
      const [key, val] = arg.split('=');
      options[key.trim()] = val.trim();
    }
  }
  runLook(options).then(() => process.exit(0));
}

