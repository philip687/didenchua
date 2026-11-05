import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runTitle(titleId) {
  if (!titleId) {
    log.warn('Vui lòng cung cấp mã danh hiệu cần đổi (ví dụ: ngan-lay, tram-chuoi, tinh-toa, moi...)');
    return;
  }
  const client = new DiDenChuaClient();
  try {
    await client.connect(12000);
    await client.fetchJournal();
    const found = client.journal?.titles?.find(t => t.id === titleId);
    if (found && !found.got) {
      log.warn(`Danh hiệu "${found.name}" (${titleId}) chưa mở khóa: ${found.desc}`);
    }
    await client.setTitle(titleId);
    await client.fetchJournal();
    log.success(`-> Danh hiệu hiện tại của nhân vật đã chuyển thành: "${client.journal?.titles?.find(t => t.id === titleId)?.name || titleId}"`);
  } catch (err) {
    log.error('Lỗi khi đổi danh hiệu:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('title.js')) {
  const tId = process.argv[2] || 'ngan-lay';
  runTitle(tId).then(() => process.exit(0));
}

