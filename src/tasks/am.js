import { DiDenChuaClient, AM_SLOTS, AM_ITEMS } from '../client.js';
import { log } from '../logger.js';

export async function runAm(action = 'visit', arg1 = null, arg2 = null) {
  if (action === 'info' || action === 'items') {
    console.log('\n========================================================================');
    console.log('🛖  BÀI TRÍ AM RIÊNG TU TẬP (CÁC VỊ TRÍ & VẬT PHẨM)');
    console.log('========================================================================');
    console.log('📍  CÁC VỊ TRÍ BÀI TRÍ TRONG AM (SLOTS):');
    AM_SLOTS.forEach(s => {
      console.log(`  • [${s.id.padEnd(10, ' ')}] : ${s.name} (Loại: ${s.kind})`);
    });
    console.log('\n📦  CÁC VẬT PHẨM CÓ THỂ ĐẶT (ITEMS):');
    AM_ITEMS.forEach(it => {
      console.log(`  • [${it.id.padEnd(10, ' ')}] : ${it.name} (${it.free ? 'Miễn phí' : 'Mở khóa'}) - Loại: ${it.kind}`);
    });
    console.log('========================================================================\n');
    return;
  }

  const client = new DiDenChuaClient();
  try {
    await client.connect(15000);

    // 1. Bước vào Am riêng
    await client.doEnterAm();

    // 2. Thực hiện hành động trong Am
    if (action === 'huong' || action === 'incense') {
      await client.doAmIncense();
    } else if (action === 'set' || action === 'bay') {
      const slot = arg1 || 'altar';
      const item = arg2 || 'phat';
      await client.doAmSet(slot, item);
    } else {
      // Mặc định: viếng thăm am và dâng hương thơm thanh tịnh
      await client.doAmIncense();
    }

    // 3. Rời Am an toàn
    await client.doLeaveAm();
  } catch (err) {
    log.error('Lỗi khi vào Am riêng tu tập:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('am.js')) {
  const act = process.argv[2] || 'visit';
  const a1 = process.argv[3] || null;
  const a2 = process.argv[4] || null;
  runAm(act, a1, a2).then(() => process.exit(0));
}
