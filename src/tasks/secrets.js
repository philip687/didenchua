import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

/**
 * TỰ ĐỘNG THỰC HIỆN TOÀN BỘ CÁC TÍNH NĂNG ẨN / MỞ RỘNG TRÊN CHÙA:
 * 1. Gieo quẻ xăm may mắn đầu ngày (t: "xam")
 * 2. Thắp nén tâm hương riêng tại đài Quan Thế Âm Bồ Tát (t: "qa-incense")
 * 3. Gieo hạt hoa & tưới nước luống hoa tại Vườn Hoa Chùa (t: "plant", t: "water")
 * 4. Tùy hỷ công đức tất cả hoa đăng của phật tử khác đang thả trên hồ sen (t: "tuyhy")
 * 5. Xin chữ thư pháp đầu ngày (t: "chu-xin")
 * 6. Viếng thăm trọn vẹn 10 khu vực trong chùa để mở danh hiệu 🏆 "Thăm khắp chùa" (t: "visit")
 * 7. Hoàn thành khóa tụng kinh sám hối (t: "tk-done")
 */
export async function runAllSecrets() {
  const client = new DiDenChuaClient();

  log.temple('✨', '=== BẮT ĐẦU TỰ ĐỘNG THỰC HIỆN TOÀN BỘ NHIỆM VỤ ẨN TRÊN CHÙA ===');
  console.log('----------------------------------------------------------------------');

  try {
    await client.connect();

    // 1. Thắp hương đài Quan Thế Âm Bồ Tát
    log.temple('🪔', '1. Thắp hương tại đài Quan Thế Âm Bồ Tát…');
    await client.humanDelay('tiến lại gần tôn tượng Bồ Tát Quan Âm');
    client.send({ t: 'qa-incense' });
    log.success('Đã dâng nén tâm hương cúng dường Bồ Tát Quan Âm!');
    await client.sleep(1500);

    // 2. Gieo quẻ xăm may mắn
    log.temple('📜', '2. Gieo quẻ xăm may mắn đầu ngày…');
    await client.humanDelay('thành tâm lắc ống xăm');
    const randomXam = Math.floor(Math.random() * 100) + 1;
    client.send({ t: 'xam', n: randomXam });
    log.success(`Đã gieo quẻ xăm số [${randomXam}] cầu bình an cát tường!`);
    await client.sleep(1500);

    // 3. Chăm sóc Vườn Hoa Chùa (Gieo hạt giống & Tưới nước)
    log.temple('🌱', '3. Chăm sóc Vườn Hoa Chùa (Trồng hoa dâng Phật)…');
    client.send({ t: 'garden' });
    await client.humanDelay('đi dạo ra luống hoa của mình');
    // Gieo hạt cúc nếu luống trống
    client.send({ t: 'plant', k: 'cuc' });
    await client.sleep(1200);
    // Tưới nước cho luống hoa
    client.send({ t: 'water', pid: '' });
    log.success('Đã chăm sóc và tưới nước cho luống hoa Cúc vàng!');
    await client.sleep(1500);

    // 4. Tùy hỷ hoa đăng người khác trên hồ sen
    log.temple('🏮', '4. Tùy hỷ hoa đăng của các phật tử khác trên hồ…');
    await client.humanDelay('bước ra cầu ngắm những ngọn hoa đăng lung linh');
    let tuyhyCount = 0;
    // Lấy danh sách hoa đăng từ server
    if (client.lanterns && client.lanterns.length > 0) {
      for (const lantern of client.lanterns.slice(0, 5)) {
        client.send({ t: 'tuyhy', lantern: lantern.id });
        log.info(`-> Tùy hỷ hoa đăng: "${lantern.text}" (+phước lành tùy hỷ)`);
        tuyhyCount++;
        await client.sleep(800);
      }
    }
    log.success(`Đã tùy hỷ công đức cho các ngọn hoa đăng trên hồ sen!`);
    await client.sleep(1500);

    // 5. Thư pháp / Xin chữ đêm
    log.temple('🖌️', '5. Xin chữ thư pháp đầu ngày…');
    await client.humanDelay('đến bàn ông đồ xin chữ thư pháp');
    client.send({ t: 'chu-xin', chu: 'binh-an' });
    client.send({ t: 'chu-dem', k: 'vao' });
    log.success('Đã xin chữ thư pháp "Bình an" lưu vào túi kỉ vật!');
    await client.sleep(1500);

    // 6. Đi thăm đủ 10 khu vực trong chùa (Mở khóa danh hiệu "Thăm khắp chùa")
    log.temple('🚶', '6. Khám phá 10 khu vực trong chùa…');
    const zones = [
      'Chánh điện', 'Bảo tháp', 'Giếng Ngọc', 'Tượng Di Lặc',
      'Hồ sen · Cầu Duyên', 'Vườn Linh Thú', 'Vườn hoa', 'Vườn thiền',
      'Hành lang', 'Sân chùa'
    ];
    for (const z of zones) {
      client.send({ t: 'visit', zone: z });
      await client.sleep(300);
    }
    log.success('Đã viếng thăm toàn bộ 10 khu vực trong chùa (🏆 Đạt danh hiệu "Thăm khắp chùa")!');
    await client.sleep(1500);

    // 7. Hoàn tất khóa tụng kinh sám hối
    log.temple('📖', '7. Hoàn thành khóa lễ tụng kinh…');
    client.send({ t: 'tk-done' });
    log.success('Đã ghi nhận hoàn tất khóa lễ tụng kinh!');
    await client.sleep(1500);

    // 8. Tự động nhận tất cả phần thưởng
    await client.claimAllQuests();

    // 9. Lấy bảng thành tựu và danh hiệu cập nhật
    log.info('Đang đồng bộ sổ công đức và danh hiệu...');
    await client.fetchJournal();
    client.printJournal();

    log.success('HOÀN THÀNH TẤT CẢ CÁC NHIỆM VỤ ẨN VÀ TÍNH NĂNG MỞ RỘNG!');

  } catch (err) {
    log.error('Lỗi khi thực hiện nhiệm vụ ẩn:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('secrets.js')) {
  runAllSecrets().then(() => process.exit(0));
}

