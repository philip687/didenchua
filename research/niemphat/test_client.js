import { NiemPhatClient } from './client.js';

async function main() {
  console.log('=== KHỞI CHẠY KIỂM THỬ CLIENT NIEMPHAT.ONLINE ===');

  const client = new NiemPhatClient();

  // 1. Tải Metadata
  console.log('\n1. Đang tải /api/meta...');
  const meta = await client.fetchMeta();
  console.log(`- Tên ứng dụng: Niệm Phật Online`);
  console.log(`- Danh sách tông phái:`, Object.keys(meta.sects).join(', '));
  console.log(`- Số lượng chùa 3D:`, meta.temples.length);
  console.log(`- Ngôi chùa đầu tiên: ${meta.temples[0].name} (${meta.temples[0].id})`);

  // 2. Đăng ký tài khoản khách mới tự động vượt Challenge Proof
  console.log('\n2. Đang tạo tài khoản tu tập mới (vượt challenge)...');
  const reg = await client.registerGuest({ sect: 'tinhdo' });
  console.log(`✅ Đã đăng ký thành công!`);
  console.log(`- Token: ${reg.token}`);
  console.log(`- Pháp danh: ${reg.user.name}`);
  console.log(`- Tông phái: ${reg.user.sect}`);
  console.log(`- Cấp độ: ${reg.user.level} (Công đức: ${reg.user.exp}/${reg.user.expNext})`);
  console.log(`- Tài sản: ${reg.user.sen} Sen, ${reg.user.ngoc} Ngọc`);

  // 3. Thực hiện chuỗi thời khóa hàng ngày (Daily Routine)
  console.log('\n3. Bắt đầu thực hiện chuỗi thời khóa tự động (Daily Routine)...');
  const routine = await client.doDailyRoutine();

  console.log('✅ Kết quả thời khóa hàng ngày:');
  console.log('- WebSocket:', routine.ws);
  console.log('- Điểm danh:', routine.checkin?.checkin ? `Chuỗi ${routine.checkin.checkin.streak} ngày (+${routine.checkin.checkin.reward.sen} Sen)` : routine.checkin);
  console.log('- Gieo quẻ:', routine.que?.que ? `${routine.que.que.rank} - "${routine.que.que.name}": ${routine.que.que.text}` : routine.que);
  console.log('- Thỉnh chuông:', routine.bell?.gained ? `+${routine.bell.gained} công đức` : routine.bell);
  console.log('- Vòng quay lộc:', routine.wheel?.item || routine.wheel?.sen ? `Trúng ${routine.wheel.item || routine.wheel.sen + ' Sen'}` : routine.wheel);
  console.log('- Nhận thưởng nhiệm vụ:', routine.claimedQuests);

  // 4. Tu tập thực hành: Lạy Phật & Gõ Mõ & Tràng Hạt
  console.log('\n4. Thực hiện tu tập: 3 lạy sám hối + 10 tiếng mõ...');
  const bowRes = await client.doBow(3);
  console.log(`- Lạy Phật: +${bowRes.gained} công đức (Tổng lạy: ${bowRes.user.stats.bows})`);

  const moRes = await client.doMo(10);
  console.log(`- Gõ mõ: +${moRes.gained} công đức (Tổng tiếng mõ: ${moRes.user.stats.mo})`);

  // 5. Kiểm tra hồ sơ sau tu tập
  const me = await client.fetchMe();
  console.log('\n5. Tổng kết sau thời khóa tu tập:');
  console.log(`- Pháp danh: ${me.user.name}`);
  console.log(`- Cấp độ: ${me.user.level} (Công đức: ${me.user.exp}/${me.user.expNext})`);
  console.log(`- Sen: ${me.user.sen} | Ngọc: ${me.user.ngoc}`);
  console.log(`- Thống kê: ${JSON.stringify(me.user.stats)}`);

  client.disconnectWs();
  console.log('\n🎉 KIỂM THỬ THÀNH CÔNG RỰC RỠ!');
}

main().catch(err => {
  console.error('❌ Lỗi kiểm thử:', err);
  process.exit(1);
});

