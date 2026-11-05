import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';
import { runMeditateWithClient } from './meditate.js';

/**
 * HOÀN THÀNH MAXIMUM TOÀN BỘ NHIỆM VỤ, TÍNH NĂNG ẨN & CÀY DANH HIỆU:
 * 
 * 1. Chốt 100% nhiệm vụ hàng ngày & điểm danh.
 * 2. Thực hiện toàn bộ tính năng & nhiệm vụ mở rộng:
 *    - Thắp hương đài Bồ Tát Quan Âm (t: "qa-incense")
 *    - Dâng hoa Tam Bảo (t: "offer-flowers")
 *    - Hoàn thành Thời khóa ngày (t: "tk-done")
 *    - Xin chữ thư pháp Tàng Kinh Các (t: "chu-xin", "chu-dem")
 *    - Tùy hỷ hoa đăng người khác trên hồ sen (t: "tuyhy")
 *    - Chăm sóc linh thú chùa (t: "pet-feed", "pet-pat")
 *    - Trồng và tưới hoa sen, hoa cúc (t: "garden", "water", "plant")
 *    - Nhận quà lễ chùa nếu có (t: "claim-le")
 * 3. Cày cán mốc các Danh hiệu tiếp theo:
 *    - Thả thêm 7 ngọn hoa đăng (đưa từ 3 lên 10 ngọn -> MỞ KHÓA DANH HIỆU 🏆 "Người thả đèn")
 *    - Dâng thêm 21 nén hương (đưa từ 9 lên 30 nén -> MỞ KHÓA DANH HIỆU 🏆 "Hương trầm")
 * 4. Ngồi thiền tĩnh tâm 5 phút (tăng thời gian Tĩnh tọa và chốt quest thiền)
 */
export async function runMaximumQuests() {
  const client = new DiDenChuaClient();

  log.temple('🪷', '=== BẮT ĐẦU HOÀN THÀNH MAXIMUM TOÀN BỘ NHIỆM VỤ & DANH HIỆU ===');
  console.log('----------------------------------------------------------------------');

  try {
    await client.connect();

    // Lấy thông tin ban đầu
    const initJournal = await client.fetchJournal();
    const prevTitles = new Set((initJournal?.titles || []).filter(t => t.got).map(t => t.name));

    log.info(`Tiến độ ban đầu: Lạy: ${initJournal?.bows} | Tràng hạt: ${initJournal?.beads} | Hương: ${initJournal?.incense}/30 | Hoa đăng: ${initJournal?.lanterns}/10`);

    // =========================================================================
    // PHẦN 1: TÍNH NĂNG MỞ RỘNG & NHIỆM VỤ ẨN TRÊN CHÙA
    // =========================================================================
    log.temple('✨', '--- [PHẦN 1: THỰC HIỆN TOÀN BỘ HOẠT ĐỘNG ẨN & MỞ RỘNG] ---');

    // 1. Thắp hương đài Bồ Tát Quan Âm
    log.temple('🪔', '1. Dâng hương tại đài Bồ Tát Quan Thế Âm…');
    await client.humanDelay('tiến lại đài Quan Âm Bồ Tát');
    client.send({ t: 'qa-incense' });
    log.success('Đã dâng hương cúng dường Bồ Tát Quan Âm!');

    // 2. Dâng hoa Tam Bảo
    log.temple('🌸', '2. Dâng hoa tươi cúng dường Tam Bảo…');
    await client.humanDelay('chậm rãi tiến vào gian Chánh Điện');
    client.send({ t: 'offer-flowers' });
    log.success('Đã dâng hoa tươi thanh tịnh lên ban Tam Bảo!');

    // 3. Hoàn tất Thời khóa hôm nay
    log.temple('📖', '3. Hoàn tất Thời khóa hôm nay…');
    await client.humanDelay('chuẩn bị tụng một câu kệ Thời khóa');
    client.send({ t: 'tk-done' });
    log.success('Đã hoàn tất Thời khóa tu tập ngày!');

    // 4. Nhận quà Lễ chùa (nếu là ngày rằm, mùng 1 hoặc lễ lớn)
    log.info('4. Kiểm tra quà Lễ chùa định kỳ…');
    client.send({ t: 'claim-le' });

    // 5. Thư pháp Tàng Kinh Các
    log.temple('🖌️', '5. Xin chữ thư pháp Tàng Kinh Các…');
    await client.humanDelay('bước đến bàn thư pháp');
    client.send({ t: 'chu-xin', chu: 'an-lac' });
    client.send({ t: 'chu-dem', k: 'vao' });
    log.success('Đã xin chữ thư pháp "An Lạc" lưu vào kỉ vật!');

    // 6. Chăm sóc linh thú chùa
    log.temple('🐱', '6. Cho linh thú chùa ăn và vuốt ve…');
    await client.humanDelay('tìm đàn linh thú dưới bóng mát');
    client.send({ t: 'emote', e: 'gieo' });
    client.send({ t: 'pet-feed' });
    await client.sleep(1200);
    client.send({ t: 'pet-pat' });
    log.success('Đã chăm sóc linh thú chùa!');

    // 7. Chăm sóc vườn sen và luống hoa
    log.temple('🪷', '7. Trồng hoa & tưới nước luống hoa chùa…');
    client.send({ t: 'garden' });
    await client.humanDelay('đi dạo ra luống hoa');
    client.send({ t: 'plant', k: 'cuc' });
    await client.sleep(1200);
    client.send({ t: 'water', pid: client.myPid || '' });
    log.success('Đã gieo trồng và tưới nước cho luống hoa chùa!');

    // 8. Tùy hỷ hoa đăng của bạn đồng tu trên hồ sen
    log.temple('🏮', '8. Tùy hỷ hoa đăng trên hồ sen…');
    if (client.lanterns && client.lanterns.length > 0) {
      for (const lantern of client.lanterns.slice(0, 5)) {
        client.send({ t: 'tuyhy', lantern: lantern.id });
        log.info(`-> Tùy hỷ ngọn hoa đăng: "${lantern.text}"`);
        await client.sleep(800);
      }
    }

    // Chốt nhận thưởng tất cả các quà đã xong
    await client.claimAllQuests();

    // =========================================================================
    // PHẦN 2: CÀY CÁN MỐC 2 DANH HIỆU LỚN TIẾP THEO
    // =========================================================================
    console.log('----------------------------------------------------------------------');
    log.temple('🏆', '--- [PHẦN 2: CÀY CÁN MỐC CÁC DANH HIỆU TIẾP THEO] ---');

    // 1. Thả thêm hoa đăng để đạt mốc 10 ngọn -> MỞ KHÓA DANH HIỆU "Người thả đèn"
    const currentLanterns = initJournal?.lanterns || 0;
    const needLanterns = Math.max(0, 10 - currentLanterns);
    if (needLanterns > 0) {
      log.temple('🏮', `Tiến hành thả thêm ${needLanterns} ngọn hoa đăng để cán mốc 10 ngọn (mở danh hiệu 🏆 "Người thả đèn")…`);
      await client.doLantern('Cầu cho gia đạo bình an, tai qua nạn khỏi, phước đức vô lượng', 'vang', needLanterns);
      await client.humanDelay('nghỉ chân ngắm hoa đăng lung linh trôi theo dòng nước');
    } else {
      log.info('✅ Đã đạt đủ mốc 10 hoa đăng từ trước.');
    }

    // 2. Dâng thêm hương để đạt mốc 30 nén -> MỞ KHÓA DANH HIỆU "Hương trầm"
    const currentIncense = initJournal?.incense || 0;
    const needIncense = Math.max(0, 30 - currentIncense);
    if (needIncense > 0) {
      log.temple('🪔', `Tiến hành dâng thêm ${needIncense} nén hương để cán mốc 30 nén (mở danh hiệu 🏆 "Hương trầm")…`);
      await client.doIncense(needIncense);
      await client.humanDelay('thành tâm khấn nguyện trước Phật đài');
    } else {
      log.info('✅ Đã đạt đủ mốc 30 nén hương từ trước.');
    }

    // =========================================================================
    // PHẦN 3: NHIỆM VỤ TREO / TĨNH TÂM (LÀM SAU CÙNG)
    // =========================================================================
    console.log('----------------------------------------------------------------------');
    log.temple('🧘', '--- [PHẦN 3: NGỒI THIỀN TĨNH TÂM 60 PHÚT (NHIỆM VỤ TREO CUỐI CÙNG)] ---');
    await runMeditateWithClient(client, 3600);

    // runMeditateWithClient claims only server-confirmed eligible meditation quests.

    // =========================================================================
    // TỔNG KẾT & XUẤT SỔ DANH HIỆU MỚI
    // =========================================================================
    const finalJournal = await client.fetchJournal();
    if (finalJournal?.titles) {
      const newlyUnlocked = finalJournal.titles.filter(t => t.got && !prevTitles.has(t.name));
      if (newlyUnlocked.length > 0) {
        console.log('\n🎉 ============================================================= 🎉');
        for (const t of newlyUnlocked) {
          log.temple('🏆', `CHÚC MỪNG BẠN VỪA MỞ KHÓA DANH HIỆU MỚI: [${t.name}]!`);
          log.info(`Ý nghĩa: ${t.desc}`);
        }
        console.log('🎉 ============================================================= 🎉\n');
      }
    }

    log.success('HOÀN THÀNH MAXIMUM 100% TOÀN BỘ NHIỆM VỤ, TÍNH NĂNG VÀ CÀY DANH HIỆU!');
    client.printStatus();
    client.printJournal();

  } catch (err) {
    log.error('Lỗi khi chạy maximum nhiệm vụ:', err.message);
    throw err;
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('max.js')) {
  runMaximumQuests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

