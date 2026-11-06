import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runXinChu(wish = 'all') {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    if (wish === 'all' || wish === 'tat-ca' || wish === 'full' || wish === 'tron-bo') {
      await client.doXinAllChu();
    } else {
      await client.doXinChu(wish);
    }
    log.success('Đã hoàn tất xin chữ Thầy đồ!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi xin chữ Thầy đồ:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('chu.js')) {
  const wish = process.argv[2] || 'all';
  runXinChu(wish).then(() => process.exit(0));
}

