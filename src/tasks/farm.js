import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

/**
 * NHIỆM VỤ CÀY TÍCH LŨY THÀNH TÍCH VĨNH VIỄN (MILESTONE FARMING):
 * 
 * Các nhiệm vụ này khi làm không còn tính điểm hàng ngày nếu đã chạm trần (cap),
 * nhưng liên tục được cộng dồn vào Sổ công đức vĩnh viễn và tiến trình mở khóa danh hiệu:
 * - Lạy Phật (mốc 108 lạy "Trăm lạy", mốc 1.000 lạy "Ngàn lạy")
 * - Lăn tràng hạt (mốc 108 hạt "Tròn chuỗi hạt", mốc 100 chuỗi "Trăm chuỗi hạt")
 * - Quét lá sân chùa (công quả dọn dẹp khuôn viên chùa)
 * - Dâng hương (mốc 30 lần "Hương trầm")
 * - Thả hoa đăng (mốc 10 ngọn "Người thả đèn")
 */
export async function runMilestoneFarming(customOptions = {}) {
  const client = new DiDenChuaClient();
  const farmCfg = {
    ...client.config.milestoneFarming,
    ...customOptions
  };

  const dailyBows = farmCfg.dailyBows ?? 18;
  const dailyBeads = farmCfg.dailyBeads ?? 88;
  const dailySweeps = farmCfg.dailySweeps ?? 5;
  const dailyIncense = farmCfg.dailyIncense ?? 0;
  const dailyLanterns = farmCfg.dailyLanterns ?? 0;

  log.temple('🎯', '=== BẮT ĐẦU CÀY TÍCH LŨY THÀNH TÍCH (MILESTONE FARMING) ===');
  log.info(`Chỉ tiêu cày hôm nay: [Lạy: +${dailyBows}] [Hạt tràng: +${dailyBeads}] [Quét lá: +${dailySweeps}] [Dâng hương: +${dailyIncense}] [Thả đèn: +${dailyLanterns}]`);
  console.log('----------------------------------------------------------------------');

  try {
    await client.connect();

    // 1. Kiểm tra tiến độ và danh hiệu trước khi cày
    const initialJournal = await client.fetchJournal();
    const prevTitles = new Set((initialJournal?.titles || []).filter(t => t.got).map(t => t.name));

    if (initialJournal) {
      log.info(`Tiến độ hiện tại: ${initialJournal.bows} lạy | ${initialJournal.beads} hạt tràng | ${initialJournal.incense} nén hương | ${initialJournal.lanterns} hoa đăng`);
    }

    // 2. Cày Lạy Phật
    if (dailyBows > 0) {
      log.temple('🙏', `Tiến hành cày ${dailyBows} lạy sám hối trước Phật đài...`);
      await client.doLay(dailyBows);
      await client.humanDelay('tĩnh tâm nghỉ ngơi sau khi lạy Phật');
    }

    // 3. Cày Lăn tràng hạt
    if (dailyBeads > 0) {
      log.temple('📿', `Tiến hành lăn thêm ${dailyBeads} hạt tràng niệm Phật...`);
      await client.doBeads(dailyBeads);
      await client.humanDelay('thong thả nghỉ tay');
    }

    // 4. Cày Quét lá sân chùa
    if (dailySweeps > 0) {
      log.temple('🧹', `Tiến hành quét dọn sân chùa thêm ${dailySweeps} lần tích công quả...`);
      await client.doQuetLa(dailySweeps);
      await client.humanDelay('dựng chổi thong thả nghỉ chân');
    }

    // 5. Cày Dâng hương
    if (dailyIncense > 0) {
      log.temple('🪔', `Dâng thêm ${dailyIncense} nén hương thành kính...`);
      await client.doIncense(dailyIncense);
      await client.humanDelay('thành tâm khấn nguyện');
    }

    // 6. Cày Thả hoa đăng
    if (dailyLanterns > 0) {
      log.temple('🏮', `Thả thêm ${dailyLanterns} ngọn hoa đăng cầu an...`);
      await client.doLantern('Cầu cho quốc thái dân an, phong điều vũ thuận', 'vang', dailyLanterns);
      await client.humanDelay('dõi nhìn hoa đăng trôi theo làn nước');
    }

    // 7. Cập nhật và kiểm tra danh hiệu mới mở khóa
    const updatedJournal = await client.fetchJournal();
    if (updatedJournal?.titles) {
      const newlyUnlocked = updatedJournal.titles.filter(t => t.got && !prevTitles.has(t.name));
      if (newlyUnlocked.length > 0) {
        console.log('\n🎉 ============================================================= 🎉');
        for (const t of newlyUnlocked) {
          log.temple('🏆', `CHÚC MỪNG BẠN VỪA MỞ KHÓA DANH HIỆU MỚI: [${t.name}]!`);
          log.info(`Ý nghĩa: ${t.desc}`);
        }
        console.log('🎉 ============================================================= 🎉\n');
      }
    }

    log.success('ĐÃ HOÀN THÀNH CHỈ TIÊU CÀY THÀNH TÍCH HÔM NAY!');
    client.printJournal();

  } catch (err) {
    log.error('Lỗi khi cày thành tích:', err.message);
    throw err;
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('farm.js')) {
  runMilestoneFarming()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

