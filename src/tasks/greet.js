import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runGreet(peerId = null) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doGreet(peerId);
    log.success('Đã hoàn thành chắp tay chào bạn đồng tu!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi chắp tay chào:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('greet.js')) {
  const customPeer = process.argv[2] ? Number(process.argv[2]) : null;
  runGreet(customPeer).then(() => process.exit(0));
}

