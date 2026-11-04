import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

/**
 * QUY TRÌNH CHUẨN HÓA 3 GIAI ĐOẠN CHO CI/CD & TỰ ĐỘNG HÓA CÔNG ĐỨC:
 * 
 * 1. GIAI ĐOẠN 1 (ACTION TASKS):
 *    Thực hiện tất cả nhiệm vụ hành động có điểm thưởng hàng ngày trước.
 *    Khóa và chốt nhận thưởng (claimAllQuests) ngay lập tức để bảo toàn công đức ngày.
 * 
 * 2. GIAI ĐOẠN 2 (MILESTONE FARMING - CÀY THÀNH TÍCH VĨNH VIỄN):
 *    Các hành động hôm đó có thể không còn điểm ngày nhưng tích lũy vào Sổ công đức
 *    (Lạy Phật chạm mốc 108/1000 lạy, Tràng hạt 100 chuỗi, Dâng 30 nén hương, Thả 10 hoa đăng, Quét lá...).
 *    Người dùng có thể đặt mức độ (quota) cày mỗi ngày trong config.milestoneFarming.
 * 
 * 3. GIAI ĐOẠN 3 (HANGING TASKS - NHIỆM VỤ TREO / TĨNH TÂM):
 *    Chỉ thực hiện sau cùng (ngồi thiền tĩnh tâm 5 phút).
 *    Sau khi thiền xong chốt quest thiền (+15 điểm) và xuất báo cáo hoàn mãn.
 */
export async function runAllQuests(options = {}) {
  const {
    skipHang = false,           // Bỏ qua nhiệm vụ treo 5 phút (dành cho chế độ chạy nhanh)
    skipMilestones = false,     // Bỏ qua giai đoạn cày thành tích nếu chỉ muốn làm nhiệm vụ ngày
    moCount = 30,
    beadsCount = 20
  } = options;

  const client = new DiDenChuaClient();

  log.temple('🪷', '=== BẮT ĐẦU CHU KỲ TỰ ĐỘNG HÓA CÔNG ĐỨC (CI/CD 3-PHASE STANDARD) ===');
  console.log('----------------------------------------------------------------------');

  try {
    await client.connect();

    // =========================================================================
    // GIAI ĐOẠN 1: CÁC NHIỆM VỤ HÀNH ĐỘNG KIẾM ĐIỂM NGÀY (DAILY ACTION TASKS)
    // =========================================================================
    log.temple('⚡', '--- [GIAI ĐOẠN 1: CÁC NHIỆM VỤ HÀNH ĐỘNG KIẾM ĐIỂM NGÀY (ACTION TASKS)] ---');

    // 1. Điểm danh
    await client.doCheckin();
    await client.humanDelay('dạo bước trong sân chùa');

    // 2. Dâng hương ngày (1 nén)
    await client.doIncense(1);
    await client.humanDelay('chậm rãi đi ra khu vực thả hoa đăng');

    // 3. Thả hoa đăng ngày (1 ngọn)
    await client.doLantern('Cầu cho gia đạo bình an, vạn sự cát tường, phước lành tăng trưởng', 'vang', 1);
    await client.humanDelay('quan sát xung quanh tìm bạn đồng tu');

    // 4. Chắp tay chào một bạn đồng tu
    await client.doGreet();
    await client.humanDelay('chuẩn bị đi làm công quả');

    // 5. Quét lá sân chùa ngày (1 lần làm sạch sân)
    await client.doQuetLa(1);
    await client.humanDelay('thong thả bước ra cầu hồ sen');

    // 6. Phóng sinh cá hồ sen
    log.info('-> Phóng sinh / Cho đàn cá ở hồ sen ăn...');
    client.send({ t: 'viec', k: 'ca' });
    await client.humanDelay('bước vào chánh điện châm dầu đèn');

    // 7. Thắp đèn dầu chánh điện
    log.info('-> Thắp đèn dầu chánh điện...');
    client.send({ t: 'lamp' });
    await client.humanDelay('nghỉ chân bên thềm chùa');

    // 8. Chăm sóc mèo chùa
    await client.doPet();
    await client.humanDelay('đi dạo ra vườn sen');

    // 9. Chăm sóc hoa sen
    await client.doGarden();
    await client.humanDelay('bước vào gian chánh điện');

    // 10. Gõ mõ tụng kinh
    if (moCount > 0) {
      await client.doMo(moCount);
      await client.humanDelay('nghỉ tay sau khi gõ mõ');
    }

    // 11. Lăn tràng hạt ngày
    if (beadsCount > 0) {
      await client.doBeads(beadsCount);
      await client.humanDelay('tĩnh tâm niệm Phật');
    }

    // 12. Thỉnh đại hồng chung
    await client.doBell();
    await client.humanDelay('lắng nghe dư âm tiếng chuông');

    // 13. CHỐT NHẬN THƯỞNG TOÀN BỘ NHIỆM VỤ HÀNH ĐỘNG GIAI ĐOẠN 1
    log.info('🔒 Chốt nhận thưởng tất cả nhiệm vụ hành động Giai đoạn 1...');
    await client.claimAllQuests();
    log.success('ĐÃ HOÀN TẤT VÀ KHÓA THÀNH CÔNG TOÀN BỘ NHIỆM VỤ HÀNH ĐỘNG (PHASE 1)!');
    client.printStatus();

    // =========================================================================
    // GIAI ĐOẠN 2: CÀY TÍCH LŨY THÀNH TÍCH VĨNH VIỄN (MILESTONE FARMING)
    // =========================================================================
    const farmCfg = client.config.milestoneFarming || {};
    const shouldFarm = !skipMilestones && farmCfg.enabled !== false;

    if (shouldFarm) {
      console.log('----------------------------------------------------------------------');
      log.temple('🎯', '--- [GIAI ĐOẠN 2: CÀY TÍCH LŨY THÀNH TÍCH VĨNH VIỄN (MILESTONE FARMING)] ---');
      log.info('Kiểm tra sổ thành tựu hiện tại trước khi cày...');

      const initialJournal = await client.fetchJournal();
      const prevTitles = new Set((initialJournal?.titles || []).filter(t => t.got).map(t => t.name));

      const dailyBows = options.dailyBows ?? farmCfg.dailyBows ?? 18;
      const dailyBeads = options.dailyBeads ?? farmCfg.dailyBeads ?? 88;
      const dailySweeps = options.dailySweeps ?? farmCfg.dailySweeps ?? 5;
      const dailyIncense = options.dailyIncense ?? farmCfg.dailyIncense ?? 0;
      const dailyLanterns = options.dailyLanterns ?? farmCfg.dailyLanterns ?? 0;

      log.info(`Mức cày hôm nay: [Lạy: +${dailyBows}] [Tràng hạt: +${dailyBeads}] [Quét lá: +${dailySweeps}] [Hương: +${dailyIncense}] [Đèn: +${dailyLanterns}]`);

      // 1. Cày lạy Phật tích lũy mốc 108 lạy ("Trăm lạy") hoặc 1.000 lạy ("Ngàn lạy")
      if (dailyBows > 0) {
        log.temple('🙏', `[Cày thành tích] Tiến hành cày ${dailyBows} lạy sám hối...`);
        await client.doLay(dailyBows);
        await client.humanDelay('nghỉ ngơi tĩnh tâm sau khi lạy Phật');
      }

      // 2. Cày lăn chuỗi tràng hạt tích lũy 100 chuỗi ("Trăm chuỗi hạt")
      if (dailyBeads > 0) {
        log.temple('📿', `[Cày thành tích] Tiến hành lăn thêm ${dailyBeads} hạt tràng niệm Phật...`);
        await client.doBeads(dailyBeads);
        await client.humanDelay('thong thả nghỉ tay niệm Phật');
      }

      // 3. Cày quét lá dọn dẹp sân chùa (công quả tích phước)
      if (dailySweeps > 0) {
        log.temple('🧹', `[Cày thành tích] Tiến hành quét dọn sân chùa thêm ${dailySweeps} lần...`);
        await client.doQuetLa(dailySweeps);
        await client.humanDelay('thong thả dựng chổi nghỉ ngơi');
      }

      // 4. Cày thêm dâng hương (mốc 30 lần danh hiệu "Hương trầm")
      if (dailyIncense > 0) {
        log.temple('🪔', `[Cày thành tích] Dâng thêm ${dailyIncense} nén hương thành kính...`);
        await client.doIncense(dailyIncense);
        await client.humanDelay('thành tâm khấn nguyện');
      }

      // 5. Cày thêm thả hoa đăng (mốc 10 ngọn danh hiệu "Người thả đèn")
      if (dailyLanterns > 0) {
        log.temple('🏮', `[Cày thành tích] Thả thêm ${dailyLanterns} ngọn hoa đăng cầu an...`);
        await client.doLantern('Cầu cho quốc thái dân an, thiên hạ thái bình', 'vang', dailyLanterns);
        await client.humanDelay('dõi nhìn hoa đăng trôi trên dòng nước');
      }

      // Kiểm tra lại sổ thành tựu sau khi cày và phát hiện danh hiệu mới
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

      log.success('HOÀN TẤT GIAI ĐOẠN 2: CÀY TÍCH LŨY THÀNH TÍCH (MILESTONE FARMING)!');
    } else {
      log.info('⏩ Bỏ qua Giai đoạn 2 (Cày thành tích) theo cấu hình hoặc tùy chọn.');
    }

    // =========================================================================
    // GIAI ĐOẠN 3: CÁC NHIỆM VỤ TREO / TĨNH TÂM (HANGING TASKS - LÀM SAU CÙNG)
    // =========================================================================
    if (!skipHang) {
      console.log('----------------------------------------------------------------------');
      log.temple('🧘', '--- [GIAI ĐOẠN 3: NHIỆM VỤ TREO / TĨNH TÂM (HANGING / MEDITATION)] ---');
      log.info('Tiến hành ngồi thiền tĩnh tâm 5 phút (nhiệm vụ treo cuối cùng)...');

      // Ngồi thiền 5 phút (300 giây)
      await client.doMeditate(300);

      // Nhận thưởng nhiệm vụ ngồi tĩnh sau khi hoàn thành thời gian treo
      log.info('Nhận thưởng nhiệm vụ ngồi tĩnh 5 phút...');
      client.claimQuest('ngoi');
      await client.sleep(1500);

      log.success('HOÀN THÀNH TOÀN DIỆN CẢ 3 GIAI ĐOẠN: HÀNH ĐỘNG -> CÀY THÀNH TÍCH -> TREO THIỀN!');
      client.printStatus();
      client.printJournal();
    } else {
      log.info('⏩ Đã bỏ qua nhiệm vụ treo (Phase 3) theo tùy chọn CI/CD nhanh.');
      client.printJournal();
    }

  } catch (err) {
    log.error('Có lỗi xảy ra trong quá trình chạy chu trình tự động:', err.message);
    throw err;
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('all.js')) {
  const isCI = process.env.CI === 'true' || process.argv.includes('--fast') || process.argv.includes('--skip-hang');
  const wantHang = process.argv.includes('--hang') || process.argv.includes('--full') || process.argv.includes('-m');
  const skipMilestones = process.argv.includes('--skip-milestones') || process.argv.includes('--no-farm');

  const skipHang = isCI && !wantHang;

  runAllQuests({ skipHang, skipMilestones })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
