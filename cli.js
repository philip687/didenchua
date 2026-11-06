#!/usr/bin/env node

import { runCheckin } from './src/tasks/checkin.js';
import { runIncense } from './src/tasks/incense.js';
import { runLantern } from './src/tasks/lantern.js';
import { runGreet } from './src/tasks/greet.js';
import { runChores } from './src/tasks/chores.js';
import { runQuetLa } from './src/tasks/quet.js';
import { runLay } from './src/tasks/lay.js';
import { runVisit } from './src/tasks/visit.js';
import { runJournal } from './src/tasks/journal.js';
import { runAllSecrets } from './src/tasks/secrets.js';
import { runMilestoneFarming } from './src/tasks/farm.js';
import { runMo } from './src/tasks/mo.js';
import { runBeads } from './src/tasks/beads.js';
import { runBell } from './src/tasks/bell.js';
import { runMeditate } from './src/tasks/meditate.js';
import { runQuiz } from './src/tasks/quiz.js';
import { runClaim } from './src/tasks/claim.js';
import { runStatus } from './src/tasks/status.js';
import { runTitle } from './src/tasks/title.js';
import { runLook } from './src/tasks/look.js';
import { runKhoe } from './src/tasks/khoe.js';
import { runAm } from './src/tasks/am.js';
import { runPhapDuong } from './src/tasks/phapduong.js';
import { printTempleMap, teleportToPlace } from './src/map.js';
import { DiDenChuaClient } from './src/client.js';
import { runAllQuests } from './src/tasks/all.js';
import { runMaximumQuests } from './src/tasks/max.js';
import { openTempleBrowser } from './src/tasks/browser.js';
import { runWatch } from './src/tasks/watch.js';
import { startDaemon } from './src/tasks/daemon.js';
import { AutonomousBot } from './src/auto/index.js';

const command = process.argv[2]?.toLowerCase();
const args = process.argv.slice(3);

function showHelp() {
  console.log(`
========================================================================
🪷  HỆ THỐNG TỰ ĐỘNG HÓA - ĐI ĐẾN CHÙA ONLINE (didenchua.online)
========================================================================

CÁCH DÙNG:
  npm run <lệnh>          hoặc          node cli.js <lệnh>

DANH SÁCH LỆNH CHẠY TỪNG NHIỆM VỤ:
  npm run status        : Xem cấp bậc, điểm công đức và tiến độ nhiệm vụ hôm nay
  npm run journal       : Xem bảng thành tựu & tiến độ số lượng các danh hiệu (Trăm lạy, Tròn chuỗi...)
  npm run checkin       : Điểm danh nhận quà ngày (chuỗi 7 ngày)
  npm run huong [số nén]: Dâng hương (mặc định 1 nén, vd: node cli.js huong 30 cày danh hiệu)
  npm run den [số ngọn] : Thả hoa đăng (mặc định 1 ngọn, vd: node cli.js den 10 cày danh hiệu)
  npm run chao          : Chắp tay chào một bạn đồng tu trong chùa
  npm run quet [số lần] : Quét lá sân chùa (mặc định 1 lần, vd: node cli.js quet 20)
  npm run lay [số lạy]  : Lạy Phật sám hối (mặc định 108 lạy mở danh hiệu "Trăm lạy")
  npm run tham          : Đi thăm đủ 10 khu vực trong chùa (mở danh hiệu "Thăm khắp chùa")
  npm run chores        : Làm công quả trọn gói (quét sân, phóng sinh cá, thắp đèn, chăm mèo)
  npm run mo [số tiếng] : Gõ mõ tụng kinh (mặc định 30 lần, vd: node cli.js mo 50)
  npm run chuoi [số hạt]: Lăn chuỗi tràng hạt niệm Phật (mặc định 20 hạt, vd: 108 hạt)
  npm run chuong        : Thỉnh đại hồng chung
  npm run ngoi [số giây]: Ngồi thiền tĩnh tâm 5 phút (mặc định 300s)
  npm run claim         : Tự động kiểm tra và nhận tất cả quà nhiệm vụ đã xong
  npm run farm          : Cày tích lũy thành tích vĩnh viễn (Lạy Phật, Tràng hạt, Quét lá, Dâng hương...)

QUY TRÌNH CHUẨN HÓA 3 GIAI ĐOẠN (HÀNH ĐỘNG -> CÀY THÀNH TÍCH -> TREO THIỀN):
  npm run all           : Chạy trọn vẹn combo chuẩn 3 giai đoạn:
                          1. Hành động kiếm điểm ngày -> Chốt nhận thưởng ngay
                          2. Cày tích lũy thành tích (theo mức độ đặt trong config)
                          3. Ngồi thiền tĩnh tâm 5 phút (nhiệm vụ treo làm sau cùng)
  npm run quests        : (Tương đương npm run all)
  npm run cicd          : Chạy combo tối ưu cho CI/CD
  Tùy chọn nâng cao:
    --fast hoặc --skip-hang        : Bỏ qua giai đoạn treo 5 phút để hoàn thành nhanh
    --skip-milestones hoặc --no-farm: Bỏ qua giai đoạn cày thành tích, chỉ làm nhiệm vụ ngày
    --only-actions                 : Chỉ chạy các hành động kiếm điểm ngày, bỏ cả cày và treo
  npm run daemon        : Chạy ngầm 24/7, tự động canh 0h sáng hàng ngày để làm nhiệm vụ
  npm run auto          : CỖ MÁY TỰ CHƠI THÔNG MINH (Autonomous Self-Play Engine):
                          - Nhận diện ghi nhận máy chủ (điểm, tiến độ, nhật ký, việc chùa)
                          - Tự đổi nhiệm vụ khác khi chạm ngưỡng bão hòa
                          - Treo tích luỹ phước điền dài hạn (lạy Phật, tràng hạt, thiền định)
                          - Canh giờ sự kiện: Đố vui Phật pháp (20:00 UTC+7), Thắp đèn (16:30 - 21:30 UTC+7), Reset (00:01 UTC+7)
                          Tùy chọn: --once (chạy 1 chu kỳ rồi nghỉ), --probe (chẩn đoán trạng thái ghi nhận)

MỞ TRÌNH DUYỆT ĐỂ XEM TRỰC TIẾP (KHÔNG BỊ BÁO ĐĂNG NHẬP CHỖ KHÁC):
  npm run watch         : Mở Chrome 3D và tự động chạy nhiệm vụ trực tiếp trên màn hình để bạn ngắm
  npm run browser       : Mở Google Chrome hiển thị chùa 3D (để tự chơi hoặc ngắm cảnh)

========================================================================
`);
}

async function main() {
  switch (command) {
    case 'checkin':
      await runCheckin();
      break;

    case 'huong':
    case 'incense':
      await runIncense(args[0] ? parseInt(args[0], 10) : 1);
      break;

    case 'den':
    case 'lantern': {
      const arg1 = args[0];
      if (arg1 && !isNaN(Number(arg1))) {
        await runLantern('Cầu cho muôn người bình an, vạn sự hanh thông', 'vang', parseInt(arg1, 10));
      } else {
        await runLantern(args[0], args[1], args[2] ? parseInt(args[2], 10) : 1);
      }
      break;
    }

    case 'chao':
    case 'greet':
      await runGreet(args[0] ? Number(args[0]) : null);
      break;

    case 'chores':
    case 'viec':
      await runChores();
      break;

    case 'quet':
    case 'quetla':
      await runQuetLa(args[0] ? parseInt(args[0], 10) : 1);
      break;

    case 'lay':
      await runLay(args[0] ? parseInt(args[0], 10) : 108);
      break;

    case 'tham':
    case 'visit':
      await runVisit();
      break;

    case 'journal':
    case 'titles':
    case 'danhhieu':
    case 'danh-hieu':
      await runJournal();
      break;

    case 'map':
    case 'bando':
    case 'ban-do':
    case 'goto':
    case 'denkhu': {
      if (args[0]) {
        const client = new DiDenChuaClient();
        try {
          await client.connect(15000);
          await teleportToPlace(client, args.join(' '));
        } finally {
          client.close();
        }
      } else {
        printTempleMap();
      }
      break;
    }

    case 'am':
    case 'amrieng':
    case 'am-rieng':
      await runAm(args[0], args[1], args[2]);
      break;

    case 'phapduong':
    case 'phap-duong':
      await runPhapDuong(args[0] ? parseFloat(args[0]) : 1);
      break;

    case 'secrets':
    case 'hidden':
    case 'an':
      await runAllSecrets();
      break;

    case 'mo':
      await runMo(args[0] ? parseInt(args[0], 10) : 30);
      break;

    case 'beads':
    case 'chuoi':
      await runBeads(args[0] ? parseInt(args[0], 10) : 20);
      break;

    case 'bell':
    case 'chuong':
      await runBell(args[0] ? parseInt(args[0], 10) : 1);
      break;

    case 'meditate':
    case 'ngoi':
      await runMeditate(args[0] ? parseInt(args[0], 10) : 3600);
      break;

    case 'quiz':
    case 'dovui':
      await runQuiz({ mode: args[0] || 'practice' });
      break;

    case 'claim':
      await runClaim();
      break;

    case 'status':
      await runStatus();
      break;

    case 'all':
    case 'quests':
    case 'ci':
    case 'cicd': {
      const isFast = args.includes('--fast') || args.includes('--skip-hang');
      const skipMilestones = args.includes('--skip-milestones') || args.includes('--no-farm') || args.includes('--only-actions');
      const onlyActions = args.includes('--only-actions');
      await runAllQuests({
        skipHang: isFast || onlyActions,
        skipMilestones
      });
      break;
    }

    case 'farm':
    case 'milestones':
    case 'thanhtich': {
      const customOptions = {};
      if (args[0] && !isNaN(Number(args[0]))) customOptions.dailyBows = parseInt(args[0], 10);
      if (args[1] && !isNaN(Number(args[1]))) customOptions.dailyBeads = parseInt(args[1], 10);
      if (args[2] && !isNaN(Number(args[2]))) customOptions.dailySweeps = parseInt(args[2], 10);
      await runMilestoneFarming(customOptions);
      break;
    }

    case 'max':
    case 'maximum': {
      await runMaximumQuests();
      break;
    }

    case 'title':
    case 'settitle':
    case 'danhhieu-set':
      await runTitle(args[0]);
      break;

    case 'look':
    case 'equip':
    case 'trangbi': {
      const options = {};
      for (const a of args) {
        if (a.includes('=')) {
          const [k, v] = a.split('=');
          options[k.trim()] = v.trim();
        }
      }
      await runLook(options);
      break;
    }

    case 'khoe':
      await runKhoe();
      break;

    case 'watch':
    case 'live':
      await runWatch(args[0] || 'all', args[1] ? { seconds: Number(args[1]) } : {});
      return; // giữ trình duyệt mở

    case 'browser':
    case 'view':
      await openTempleBrowser();
      return; // không thoát ngay để giữ trình duyệt

    case 'daemon':
      await startDaemon();
      return; // daemon chạy vô hạn

    case 'auto':
    case 'selfplay':
    case 'self-play': {
      const mode = args.includes('--once') ? 'once' : (args.includes('--probe') ? 'probe' : 'daemon');
      const bot = new AutonomousBot({ mode });
      process.on('SIGINT', () => {
        console.log('\nĐang dừng cỗ máy tự chơi...');
        bot.stop('Người dùng gửi tín hiệu dừng (SIGINT)');
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        bot.stop('Hệ thống yêu cầu dừng (SIGTERM)');
        process.exit(0);
      });
      await bot.start();
      return;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Lỗi thực thi:', err);
  process.exit(1);
});

