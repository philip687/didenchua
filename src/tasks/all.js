import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

/**
 * QUY TRÌNH TỰ ĐỘNG HÓA 4 TẦNG ƯU TIÊN TIÊU CHUẨN:
 * 
 * 1. TẦNG 1 (ƯU TIÊN CAO NHẤT): CÁC NHIỆM VỤ HÀNG NGÀY TRƯỚC (DAILY ACTION TASKS)
 *    - Làm sạch toàn bộ các nhiệm vụ ngày: Điểm danh, Dâng hương, Thả đèn, Chào hỏi,
 *      Quét lá, Cho cá ăn, Thắp đèn dầu, Chăm mèo, Gõ mõ, Lăn chuỗi hạt, Thỉnh chuông, Gieo quẻ xăm.
 *    - Chốt khóa nhận thưởng (claimAllQuests) ngay lập tức để bảo toàn công đức ngày.
 * 
 * 2. TẦNG 2: CÀY NHIỆM VỤ VĨNH VIỄN (MILESTONE FARMING - HOÀN TẤT HOẶC 1 PHẦN TIẾN ĐỘ)
 *    - Kiểm tra sổ thành tựu hiện tại và cày tích lũy theo quota đã đặt:
 *      Lạy Phật mốc 108/1.000 lạy, Tràng hạt 100 chuỗi, Quét lá sân chùa, Dâng hương mốc 30 nén,
 *      Thả hoa đăng mốc 10 ngọn, Khám phá toàn chùa 10/10 khu vực.
 * 
 * 3. TẦNG 3: CÁC HOẠT ĐỘNG CÓ THỂ ĂN THÊM ĐIỂM (EXTRA MERIT EARNING ACTIVITIES)
 *    - Vườn hoa dâng Phật: Chăm sóc luống của mình (gieo hạt nếu trống, tưới nếu chưa tưới,
 *      hái hoa và dâng hoa tươi lên Phật đài Chánh điện khi hoa nở).
 *    - TỰ ĐỘNG TƯỚI NƯỚC GIÚP TẤT CẢ LUỐNG HOA CỦA BẠN ĐỒNG TU (+2 CÔNG ĐỨC MỖI LUỐNG).
 *    - Dâng hương đài Quan Thế Âm Bồ Tát.
 *    - Tùy hỷ hoa đăng người khác trên hồ sen.
 *    - Xin chữ thư pháp & hoàn tất khóa tụng kinh.
 *    - Chốt nhận lại phần thưởng nếu có nhiệm vụ phát sinh.
 *
 * 4. TẦNG 4: CÁC HOẠT ĐỘNG TREO MÁY (HANGING / MEDITATION - LÀM SAU CÙNG)
 *    - Ngồi thiền tĩnh tâm trong thời gian cấu hình (5 phút / 30 phút / 60 phút).
 *    - Nhận thưởng nhiệm vụ ngồi tĩnh sau khi hoàn thành thời gian treo.
 */
export async function runAllQuests(options = {}) {
  const skipHang = options.skipHang ?? options.skipMeditate ?? false;
  const skipMilestones = options.skipMilestones ?? false;
  const skipExtraMerit = options.skipExtraMerit ?? false;
  const moCount = options.moCount ?? 30;
  const beadsCount = options.beadsCount ?? 20;
  const meditateSeconds = options.meditateSeconds ?? null;
  const autoWaterOthers = options.autoWaterOthers ?? null;

  const client = new DiDenChuaClient();
  if (typeof options.onClient === 'function') {
    options.onClient(client);
  }
  // Trả về số claim chưa được xác nhận để report phân biệt run hoàn tất với kết quả đã verify.
  let unverifiedCount = 0;

  log.temple('🪷', '=== BẮT ĐẦU CHU KỲ TỰ ĐỘNG HÓA CÔNG ĐỨC (4-TIER HIERARCHY STANDARD) ===');
  console.log('----------------------------------------------------------------------');

  try {
    await client.connect();

    // =========================================================================
    // TẦNG 1 (ƯU TIÊN 1): CÁC NHIỆM VỤ HÀNG NGÀY TRƯỚC (DAILY ACTION TASKS)
    // =========================================================================
    log.temple('⚡', '--- [TẦNG 1: CÁC NHIỆM VỤ HÀNG NGÀY TRƯỚC (DAILY ACTION TASKS)] ---');

    // 1. Điểm danh ngày
    await client.doCheckin();
    await client.humanDelay('dạo bước trong sân chùa');

    // 2. Dâng hương ngày (1 nén) -> Nhiệm vụ huong
    await client.doIncense(1);
    await client.humanDelay('chậm rãi đi ra khu vực thả hoa đăng');

    // 3. Thả hoa đăng ngày (1 ngọn) -> Nhiệm vụ den
    await client.doLantern('Cầu cho gia đạo bình an, vạn sự cát tường, phước lành tăng trưởng', 'vang', 1);
    await client.humanDelay('quan sát xung quanh tìm bạn đồng tu');

    // 4. Chắp tay chào một bạn đồng tu -> Nhiệm vụ chao
    await client.doGreet();
    await client.humanDelay('tiến về phía Phật đài');

    // 5. Cúi lạy Phật trang nghiêm -> Nhiệm vụ lạy / lạy cùng lúc với người khác
    await client.doLay(1);
    await client.humanDelay('chuẩn bị đi làm công quả');

    // 6. Quét lá sân chùa ngày (1 lần làm sạch sân) -> Nhiệm vụ việc chùa
    await client.doQuetLa(1);
    await client.humanDelay('thong thả bước ra cầu hồ sen');

    // 7. Phóng sinh cá hồ sen
    log.info('-> Phóng sinh / Cho đàn cá ở hồ sen ăn...');
    client.send({ t: 'viec', k: 'ca' });
    await client.humanDelay('bước vào chánh điện châm dầu đèn');

    // 8. Thắp đèn dầu chánh điện
    log.info('-> Thắp đèn dầu chánh điện...');
    client.send({ t: 'lamp' });
    await client.humanDelay('nghỉ chân bên thềm chùa');

    // 9. Chăm sóc mèo chùa
    await client.doPet();
    await client.humanDelay('bước vào gian chánh điện');

    // 10. Gõ mõ tụng kinh ngày
    if (moCount > 0) {
      await client.doMo(moCount);
      await client.humanDelay('nghỉ tay sau khi gõ mõ');
    }

    // 11. Lăn tràng hạt niệm Phật ngày
    if (beadsCount > 0) {
      await client.doBeads(beadsCount);
      await client.humanDelay('tĩnh tâm niệm Phật');
    }

    // 12. Thỉnh đại hồng chung
    await client.doBell();
    await client.humanDelay('lắng nghe dư âm tiếng chuông');

    // 13. Gieo quẻ xăm may mắn đầu ngày -> Nhiệm vụ xam
    await client.doXam();
    await client.humanDelay('thong thả dạo bước');

    // 14. Gửi một lời nguyện chung tới cả chùa -> Nhiệm vụ lời nguyện
    await client.doVow('Cầu cho muôn người bình an, thân tâm thường an lạc, vạn sự hanh thông');
    await client.humanDelay('thành tâm hướng về đại chúng');

    // 15. CHỐT KHÓA NHẬN THƯỞNG TOÀN BỘ NHIỆM VỤ HÀNG NGÀY NGAY LẬP TỨC
    log.info('🔒 Gửi yêu cầu nhận thưởng tất cả nhiệm vụ hàng ngày Tầng 1...');
    const claimRes = await client.claimAllQuests();
    unverifiedCount += claimRes.unverified?.length || 0;
    if (claimRes.claimed?.length > 0) {
      log.success(`Máy chủ đã xác nhận ghi nhận thưởng ${claimRes.claimed.length} nhiệm vụ hàng ngày.`);
    }
    if (claimRes.unverified?.length > 0) {
      log.warn(`Còn ${claimRes.unverified.length} nhiệm vụ đã gửi yêu cầu nhưng chưa nhận được xác nhận từ máy chủ.`);
    }
    client.printStatus();

    // =========================================================================
    // TẦNG 2 (ƯU TIÊN 2): CÀY NHIỆM VỤ VĨNH VIỄN (MILESTONE FARMING)
    // =========================================================================
    const farmCfg = client.config.milestoneFarming || {};
    const shouldFarm = !skipMilestones && farmCfg.enabled !== false;

    if (shouldFarm) {
      console.log('----------------------------------------------------------------------');
      log.temple('🎯', '--- [TẦNG 2: CÀY NHIỆM VỤ VĨNH VIỄN (MILESTONE FARMING)] ---');
      log.info('Kiểm tra sổ thành tựu hiện tại trước khi cày...');

      const initialJournal = await client.fetchJournal();
      const prevTitles = new Set((initialJournal?.titles || []).filter(t => t.got).map(t => t.name));

      const dailyBows = options.dailyBows ?? farmCfg.dailyBows ?? 18;
      const dailyBeads = options.dailyBeads ?? farmCfg.dailyBeads ?? 88;
      const dailySweeps = options.dailySweeps ?? farmCfg.dailySweeps ?? 5;
      const dailyIncense = options.dailyIncense ?? farmCfg.dailyIncense ?? 0;
      const dailyLanterns = options.dailyLanterns ?? farmCfg.dailyLanterns ?? 0;

      log.info(`Chỉ tiêu cày hôm nay: [Lạy: +${dailyBows}] [Tràng hạt: +${dailyBeads}] [Quét lá: +${dailySweeps}] [Hương: +${dailyIncense}] [Đèn: +${dailyLanterns}]`);

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
      let incenseCount = dailyIncense;
      if (initialJournal && typeof initialJournal.incense === 'number' && initialJournal.incense < 30) {
        const remainingTo30 = 30 - initialJournal.incense;
        incenseCount = Math.max(dailyIncense, Math.min(remainingTo30, 5));
      }
      if (incenseCount > 0) {
        log.temple('🪔', `[Cày thành tích] Dâng thêm ${incenseCount} nén hương thành kính (tiến tới mốc 30)...`);
        await client.doIncense(incenseCount);
        await client.humanDelay('thành tâm khấn nguyện');
      }

      // 5. Cày thêm thả hoa đăng (mốc 10 ngọn danh hiệu "Người thả đèn")
      if (dailyLanterns > 0) {
        log.temple('🏮', `[Cày thành tích] Thả thêm ${dailyLanterns} ngọn hoa đăng cầu an...`);
        await client.doLantern('Cầu cho quốc thái dân an, thiên hạ thái bình', 'vang', dailyLanterns);
        await client.humanDelay('dõi nhìn hoa đăng trôi trên dòng nước');
      }

      // 6. Cày khám phá chùa (mốc 10/10 khu vực "Thăm khắp chùa" nếu chưa đủ)
      if (initialJournal && initialJournal.visited < initialJournal.zones) {
        log.temple('🚶', `[Cày thành tích] Phát hiện mới đi ${initialJournal.visited}/${initialJournal.zones} khu vực. Tiến hành đi thăm đủ các khu...`);
        await client.doVisitAll();
        await client.humanDelay('nghỉ chân bên hàng lang');
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

      log.success('HOÀN TẤT TẦNG 2: CÀY TÍCH LŨY THÀNH TÍCH VĨNH VIỄN (MILESTONE FARMING)!');
    } else {
      log.info('⏩ Bỏ qua Tầng 2 (Cày thành tích vĩnh viễn) theo cấu hình hoặc tùy chọn.');
    }

    // =========================================================================
    // TẦNG 3 (ƯU TIÊN 3): CÁC HOẠT ĐỘNG CÓ THỂ ĂN THÊM ĐIỂM (EXTRA MERIT ACTIVITIES)
    // =========================================================================
    if (!skipExtraMerit) {
      console.log('----------------------------------------------------------------------');
      log.temple('✨', '--- [TẦNG 3: CÁC HOẠT ĐỘNG CÓ THỂ ĂN THÊM ĐIỂM (EXTRA MERIT)] ---');

      // 1. Chăm sóc Vườn hoa dâng Phật & Tự động tưới nước giúp bạn đồng tu (+2 công đức/luống)
      await client.doGarden({
        autoWaterOthers: autoWaterOthers ?? client.config.autoWaterOthers ?? true
      });
      await client.humanDelay('thong thả đi dạo ra đài Quan Âm');

      // 2. Dâng hương tại đài Bồ Tát Quan Thế Âm
      await client.doQaIncense();
      await client.humanDelay('thong thả bước ra bờ hồ ngắm hoa đăng');

      // 3. Tùy hỷ công đức hoa đăng của bạn đồng tu trên hồ sen
      await client.doTuyHy(5);
      await client.humanDelay('bước đến bàn ông đồ xin chữ');

      // 4. Xin chữ thư pháp đầu ngày & hoàn thành khóa tụng kinh sám hối
      log.info('-> Xin chữ thư pháp "Bình an" & ghi nhận khóa lễ tụng kinh...');
      client.send({ t: 'chu-xin', chu: 'binh-an' });
      client.send({ t: 'chu-dem', k: 'vao' });
      client.send({ t: 'tk-done' });
      await client.sleep(1200);

      // Chốt nhận lại phần thưởng nếu có quest phát sinh từ hoạt động ăn điểm
      const extraClaims = await client.claimAllQuests();
      unverifiedCount += extraClaims.unverified?.length || 0;
      log.success('HOÀN TẤT TẦNG 3: CÁC HOẠT ĐỘNG ĂN THÊM ĐIỂM & TÍCH LŨY CÔNG ĐỨC!');
    } else {
      log.info('⏩ Bỏ qua Tầng 3 (Các hoạt động ăn thêm điểm) theo tùy chọn.');
    }

    // =========================================================================
    // TẦNG 4 (ƯU TIÊN 4): CÁC HOẠT ĐỘNG TREO MÁY (HANGING / MEDITATION - LÀM SAU CÙNG)
    // =========================================================================
    if (!skipHang) {
      console.log('----------------------------------------------------------------------');
      const medSec = Number(meditateSeconds ?? client.config.meditateSeconds ?? 3600);
      const medMins = Math.ceil(medSec / 60);
      log.temple('🧘', `--- [TẦNG 4: HOẠT ĐỘNG TREO MÁY / TĨNH TÂM (${medMins} PHÚT - LÀM CUỐI CÙNG)] ---`);
      log.info(`Tiến hành ngồi thiền tĩnh tâm ${medMins} phút (${medSec}s) để tích lũy công đức và hồi hướng...`);

      // Ngồi thiền với thời gian tùy biến (nhiệm vụ treo cuối cùng)
      await client.doMeditate(medSec);

      // Kiểm tra phản hồi xác nhận từ máy chủ cho nhiệm vụ ngồi thiền
      const ngoiQuest = client.merit?.me?.quests?.find(q => q.id === 'ngoi');
      if (ngoiQuest?.claimed) {
        log.success('[ĐÃ XÁC NHẬN] Máy chủ đã ghi nhận hoàn thành nhiệm vụ tĩnh tâm thiền định.');
      } else {
        log.info('[ĐÃ GỬI YÊU CẦU] Đã hoàn thành thời gian thiền định và gửi yêu cầu nhận thưởng (chờ máy chủ đồng bộ).');
        unverifiedCount++;
      }

      log.success('HOÀN THÀNH TOÀN DIỆN 4 TẦNG: NHIỆM VỤ NGÀY -> CÀY VĨNH VIỄN -> ĂN THÊM ĐIỂM -> TREO MÁY!');
      client.printStatus();
      client.printJournal();
    } else {
      log.info('⏩ Đã bỏ qua nhiệm vụ treo máy (Tầng 4) theo tùy chọn chạy nhanh.');
      client.printJournal();
    }

    // Không trả về trạng thái verified vì các hành động khác chưa có ACK tổng hợp từ server.
    return { unverifiedCount, verificationStatus: 'unverified' };

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
  const skipExtraMerit = process.argv.includes('--skip-extra');

  const medArgIdx = process.argv.indexOf('--meditate');
  const meditateSeconds = medArgIdx !== -1 && process.argv[medArgIdx + 1] ? parseInt(process.argv[medArgIdx + 1], 10) : null;

  const skipHang = isCI && !wantHang;

  runAllQuests({ skipHang, skipMilestones, skipExtraMerit, meditateSeconds })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
