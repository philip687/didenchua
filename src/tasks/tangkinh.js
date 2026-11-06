import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runTangKinh(sutraId = 'all', options = {}) {
  const isTurbo = Boolean(options.turbo || options.fast || process.argv.includes('--turbo') || process.argv.includes('--fast'));
  const client = new DiDenChuaClient(isTurbo ? { turbo: true } : {});
  try {
    await client.connect();
    await client.doTangKinhCac(sutraId);
    log.success('Đã hoàn tất viếng Tàng Kinh Các & nghe kinh!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi nghe kinh tại Tàng Kinh Các:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('tangkinh.js') || process.argv[1]?.endsWith('kinh.js')) {
  const sutraId = process.argv[2] || 'all';
  runTangKinh(sutraId).then(() => process.exit(0));
}

