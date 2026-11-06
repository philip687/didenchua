import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';
import { FeedbackTracker } from './feedback_tracker.js';
import {
  getVNTime,
  isLampTime,
  isQuizTime,
  isDayResetTime,
  getNextScheduledEvent,
  formatDuration
} from './schedule_events.js';
import { runQuizWithClient } from '../tasks/quiz.js';

/**
 * Trạng thái của Cỗ máy Tự chơi Phật pháp (Autonomous Bot)
 */
export const BotState = {
  IDLE: 'IDLE',
  CONNECTING: 'CONNECTING',
  PROBING_DAILY: 'PROBING_DAILY',
  CLAIMING_REWARDS: 'CLAIMING_REWARDS',
  CHECK_SCHEDULED: 'CHECK_SCHEDULED',
  ACCUMULATING_IDLE: 'ACCUMULATING_IDLE',
  SCHEDULED_EVENT: 'SCHEDULED_EVENT',
  STOPPED: 'STOPPED'
};

export class AutonomousBot {
  constructor(options = {}) {
    this.options = {
      mode: options.mode || 'daemon', // 'daemon' | 'once' | 'probe'
      safeMode: options.safeMode ?? true,
      maxActionIterations: options.maxActionIterations || 30,
      idleCycleMinutes: options.idleCycleMinutes || 10,
      config: options.config || {},
      ...options
    };

    this.client = options.client || null;
    this.tracker = new FeedbackTracker({ settleDelayMs: 600 });
    this.state = BotState.IDLE;
    this.stopRequested = false;

    // Bộ nhớ theo dõi các hành động đã làm trong ngày (theo ngày VN YYYY-MM-DD)
    this.currentDayVN = '';
    this.dailyActionsDone = new Set();
    this.lampDoneToday = false;
    this.liveQuizDoneToday = false;
  }

  /**
   * Khởi tạo và thiết lập client nếu chưa có
   */
  async initClient() {
    if (!this.client) {
      this.client = new DiDenChuaClient(this.options.config);
    }

    // Đăng ký lắng nghe sự kiện đóng kết nối
    if (this.client.ws) {
      this.bindSocketEvents();
    }
  }

  bindSocketEvents() {
    if (!this.client?.ws) return;

    this.client.ws.addEventListener('close', (event) => {
      if (event.code === 1008) {
        log.warn('\n🛑 [SESSION CONFLICT] Phát hiện Phật tử đang đăng nhập chùa ở thiết bị khác.');
        log.temple('🙏', 'Bot chủ động nhường phiên tu tập để Phật tử tự trải nghiệm game.');
        this.stop('Phật tử đăng nhập nơi khác (Policy 1008)');
      }
    });
  }

  /**
   * Danh sách các ứng viên hành động hàng ngày cần thăm dò & thực hiện đến khi hết ghi nhận
   */
  getCandidateDailyActions() {
    const c = this.client;
    return [
      {
        id: 'checkin',
        name: 'Điểm danh ngày mới',
        fn: async () => await c.doCheckin(),
        maxZeroAttempts: 1,
        maxIterations: 1
      },
      {
        id: 'garden',
        name: 'Chăm sóc vườn hoa & tưới nước',
        fn: async () => await c.doGarden({ autoWaterOthers: true, maxWaterOthers: 40 }),
        maxZeroAttempts: 1,
        maxIterations: 1
      },
      {
        id: 'xam',
        name: 'Gieo quẻ xăm may mắn',
        fn: async () => await c.doXam(),
        maxZeroAttempts: 1,
        maxIterations: 1
      },
      {
        id: 'xinChu',
        name: 'Xin chữ thư pháp đầu ngày',
        fn: async () => await c.doXinChu('binh-an'),
        maxZeroAttempts: 1,
        maxIterations: 1
      },
      {
        id: 'incense',
        name: 'Thắp tâm hương Chánh điện',
        fn: async () => {
          c.send({ t: 'incense' });
          c.claimQuest('huong');
        },
        maxZeroAttempts: 2,
        maxIterations: 10
      },
      {
        id: 'qaIncense',
        name: 'Thắp hương đài Quan Âm Bồ Tát',
        fn: async () => await c.doQaIncense(),
        maxZeroAttempts: 2,
        maxIterations: 5
      },
      {
        id: 'amIncense',
        name: 'Thắp hương Am riêng tu tập',
        fn: async () => {
          await c.doEnterAm();
          await c.doAmIncense();
          await c.doLeaveAm();
        },
        maxZeroAttempts: 1,
        maxIterations: 3
      },
      {
        id: 'phapDuong',
        name: 'Viếng Pháp Đường tu tập',
        fn: async () => {
          await c.doEnterPhapDuong();
          await c.sleep(400);
          await c.doLeavePhapDuong();
        },
        maxZeroAttempts: 1,
        maxIterations: 3
      },
      {
        id: 'lantern',
        name: 'Thả hoa đăng cầu an hồ sen',
        fn: async () => {
          c.send({
            t: 'lantern',
            color: 'vang',
            text: 'Cầu cho muôn người bình an, vạn sự hanh thông'
          });
          c.claimQuest('den');
        },
        maxZeroAttempts: 2,
        maxIterations: 10
      },
      {
        id: 'tuyHy',
        name: 'Tùy hỷ hoa đăng phật tử khác',
        fn: async () => await c.doTuyHy(5),
        maxZeroAttempts: 2,
        maxIterations: 10
      },
      {
        id: 'greet',
        name: 'Chào hỏi vái lạy đạo hữu đồng tu',
        fn: async () => await c.doGreet(),
        maxZeroAttempts: 2,
        maxIterations: 5
      },
      {
        id: 'quetLa',
        name: 'Quét lá sân chùa (Công quả)',
        fn: async () => await c.doQuetLa(1),
        maxZeroAttempts: 2,
        maxIterations: 15
      },
      {
        id: 'pet',
        name: 'Chăm sóc thú cưng chùa (cho ăn & vuốt ve)',
        fn: async () => await c.doPet(),
        maxZeroAttempts: 2,
        maxIterations: 10
      },
      {
        id: 'ca',
        name: 'Phóng sinh & Cho đàn cá ăn',
        fn: async () => {
          c.send({ t: 'viec', k: 'ca' });
        },
        maxZeroAttempts: 2,
        maxIterations: 10
      },
      {
        id: 'khoe',
        name: 'Khoe danh hiệu tu tập với đại chúng',
        fn: async () => await c.doKhoe(),
        maxZeroAttempts: 2,
        maxIterations: 5
      },
      {
        id: 'bell',
        name: 'Thỉnh đại hồng chung chùa',
        fn: async () => await c.doBell(1),
        maxZeroAttempts: 2,
        maxIterations: 5
      },
      {
        id: 'visitAll',
        name: 'Viếng thăm toàn bộ 10 khu vực chùa',
        fn: async () => await c.doVisitAll(),
        maxZeroAttempts: 1,
        maxIterations: 1
      }
    ];
  }

  /**
   * Kiểm tra ngày mới và reset trạng thái theo dõi nếu qua 00:00 UTC+7
   */
  checkDayRollover() {
    const vn = getVNTime();
    if (this.currentDayVN !== vn.dateStr) {
      log.temple('🌅', `Bắt đầu ngày mới: ${vn.dateStr} (Giờ VN: ${vn.timeStr}). Làm mới bộ đếm công việc.`);
      this.currentDayVN = vn.dateStr;
      this.dailyActionsDone.clear();
      this.lampDoneToday = false;
      this.liveQuizDoneToday = false;
    }
  }

  /**
   * Giai đoạn 1: Duyệt qua các hành động hàng ngày, làm đến khi hết ghi nhận, tự đổi việc khác
   */
  async runDailyProbingPhase() {
    this.state = BotState.PROBING_DAILY;
    this.checkDayRollover();

    const candidateActions = this.getCandidateDailyActions();
    log.temple('📋', `=== GIAI ĐOẠN 1: THĂM DÒ & TÍCH LUỸ NHIỆM VỤ HÀNG NGÀY (${candidateActions.length} việc) ===`);

    const summaryReport = [];

    for (const actionDef of candidateActions) {
      if (this.stopRequested) break;
      this.client.checkAborted();

      // Nếu việc này đã hoàn tất bão hòa trong ngày thì bỏ qua
      if (this.dailyActionsDone.has(actionDef.id)) {
        continue;
      }

      const result = await this.tracker.executeUntilCapped(this.client, actionDef, {
        maxZeroAttempts: actionDef.maxZeroAttempts || 2,
        maxIterations: actionDef.maxIterations || this.options.maxActionIterations
      });

      this.dailyActionsDone.add(actionDef.id);
      summaryReport.push(result);

      // Nghỉ một nhịp khoan thai trước khi chuyển việc tiếp theo
      await this.client.humanDelay('khoan thai chuyển sang việc Phật sự tiếp theo');
    }

    log.success('\n✅ Hoàn tất chu kỳ thăm dò & tích luỹ toàn bộ nhiệm vụ hàng ngày!');
    return summaryReport;
  }

  /**
   * Giai đoạn 2: Tự động nhận tất cả phần thưởng nhiệm vụ đã đạt điều kiện
   */
  async runClaimPhase() {
    this.state = BotState.CLAIMING_REWARDS;
    log.temple('🎁', '=== GIAI ĐOẠN 2: TỰ ĐỘNG THU NHẬN TẤT CẢ THƯỞNG CÔNG ĐỨC ===');
    const claimResult = await this.client.claimAllQuests();
    if (claimResult.claimed.length > 0) {
      log.success(`Đã nhận thành công thưởng cho ${claimResult.claimed.length} nhiệm vụ!`);
    } else {
      log.info('Không còn nhiệm vụ nào chưa nhận thưởng.');
    }
    return claimResult;
  }

  /**
   * Giai đoạn 3: Kiểm tra và thực hiện các nhiệm vụ có điều kiện khung giờ hệ thống
   * - Thắp đèn Chánh điện (16:30 - 21:30 UTC+7)
   * - Đố vui Phật pháp (20:00 UTC+7)
   */
  async checkAndRunScheduledTasks() {
    this.state = BotState.CHECK_SCHEDULED;
    const now = new Date();
    const vn = getVNTime(now);

    log.temple('⏰', `Kiểm tra lịch trình hệ thống lúc ${vn.dateStr} ${vn.timeStr} (UTC+7):`);

    // 1. Thắp đèn dầu Chánh điện (16:30 - 21:30 UTC+7)
    if (isLampTime(now)) {
      if (!this.lampDoneToday) {
        log.temple('🪔', `[16:30 - 21:30] Đang trong khung giờ Chánh điện mở đèn! Thực hiện thắp đèn dầu...`);
        const lampAction = {
          name: 'Thắp đèn dầu chánh điện',
          fn: async () => {
            this.client.send({ t: 'visit', zone: 'Chánh điện' });
            await this.client.sleep(400);
            this.client.send({ t: 'lamp' });
          },
          maxZeroAttempts: 2,
          maxIterations: 10,
          description: 'Thắp đèn dầu Chánh điện buổi chiều tối'
        };
        const lampResult = await this.tracker.executeUntilCapped(this.client, lampAction);
        this.lampDoneToday = true;
        log.success(`Hoàn tất thắp đèn dầu chiều tối (Thu được +${lampResult.totalMeritYield} công đức).`);
      } else {
        log.info('  • Thắp đèn Chánh điện: Hôm nay đã thắp đầy đủ.');
      }
    } else {
      log.info(`  • Thắp đèn Chánh điện: Chưa tới khung giờ (Yêu cầu: 16:30 - 21:30 UTC+7, hiện tại: ${vn.timeStr}).`);
    }

    // 2. Đố vui Phật pháp
    if (isQuizTime(now)) {
      if (!this.liveQuizDoneToday) {
        log.temple('🏆', `[20:00 UTC+7] ĐẾN GIỜ ĐỐ VUI PHẬT PHÁP TRỰC TIẾP! Bắt đầu tham gia...`);
        try {
          await runQuizWithClient(this.client, { mode: 'live' });
          this.liveQuizDoneToday = true;
        } catch (err) {
          log.error('Lỗi khi tham gia Đố vui trực tiếp:', err.message);
        }
      } else {
        log.info('  • Đố vui trực tiếp: Đã hoàn thành trận đấu hôm nay.');
      }
    } else {
      // Nếu chưa làm bài luyện tập đố vui trong ngày để lấy điểm nhiệm vụ tuần wDoVui
      if (!this.dailyActionsDone.has('quizPractice')) {
        log.temple('📖', 'Ngoài giờ thi đấu trực tiếp, thực hiện 1 bài ôn tập Phật pháp lấy thưởng tuần...');
        try {
          await runQuizWithClient(this.client, { mode: 'practice' });
          this.dailyActionsDone.add('quizPractice');
        } catch (err) {
          log.warn('Không thể chạy bài luyện tập đố vui:', err.message);
        }
      }
    }
  }

  /**
   * Giai đoạn 4: Sau khi hết toàn bộ nhiệm vụ, bắt đầu treo các nhiệm vụ tích luỹ dài hạn
   * - Lạy Phật (tích 108 lạy & tích công đức vô hạn)
   * - Lăn tràng hạt niệm Phật (tích hạt niệm Phật)
   * - Gõ mõ tụng niệm
   * - Ngồi thiền tĩnh tâm
   * - Tuần tra tưới hoa chùa khi luống khô
   */
  async runIdleAccumulationLoop() {
    this.state = BotState.ACCUMULATING_IDLE;
    log.temple('🪷', '\n========================================================================');
    log.temple('🪷', 'TẤT CẢ NHIỆM VỤ ĐÃ HOÀN TẤT & ĐẠT TRẦN! CHUYỂN SANG CHẾ ĐỘ TU TẬP TÍCH LUỸ (IDLE)');
    log.temple('🪷', 'Hệ thống duy trì: Lạy Phật, Lăn tràng hạt, Tọa thiền & Canh giờ sự kiện');
    log.temple('🪷', '========================================================================\n');

    let cycle = 0;

    while (!this.stopRequested) {
      cycle++;
      this.client.checkAborted();
      this.checkDayRollover();

      const nextEventInfo = getNextScheduledEvent();
      log.temple('🌿', `[Hiệp tu tập tích luỹ #${cycle}] - Hiện tại: ${nextEventInfo.currentTimeVN}`);
      if (nextEventInfo.nextEvent) {
        log.info(`⏳ Mốc sự kiện kế tiếp: "${nextEventInfo.nextEvent.name}" (${nextEventInfo.nextEvent.targetTimeStr}) - Còn ${nextEventInfo.nextEvent.waitFormatted}`);
      }

      // 1. Kiểm tra sự kiện thời gian thực (đèn, đố vui, reset)
      await this.checkAndRunScheduledTasks();

      // Nếu đang trong khung giờ reset ngày mới (00:01 - 00:05), thoát loop tích luỹ để sang chu kỳ ngày mới
      if (isDayResetTime()) {
        log.temple('🌅', 'Phát hiện thời khắc chuyển giao ngày mới! Khởi động lại toàn bộ chu kỳ ngày mới...');
        break;
      }

      // 2. Hoạt động tích luỹ A: Lạy Phật thành kính (18 lạy / hiệp)
      try {
        log.info('-> Lạy Phật thành kính tích luỹ phước điền...');
        await this.client.doLay(18);
        await this.client.sleep(500);
      } catch (err) {
        log.warn('Lỗi hiệp lạy Phật:', err.message);
      }

      // 3. Hoạt động tích luỹ B: Lăn tràng hạt niệm Phật (108 hạt / hiệp)
      try {
        log.info('-> Lăn tràng hạt 108 hạt nhất tâm niệm Phật...');
        await this.client.doBeads(108);
        await this.client.sleep(500);
      } catch (err) {
        log.warn('Lỗi hiệp lăn tràng hạt:', err.message);
      }

      // 4. Hoạt động tích luỹ C: Gõ mõ định tâm (20 tiếng)
      try {
        await this.client.doMo(20);
        await this.client.sleep(400);
      } catch (err) {}

      // 5. Hoạt động tích luỹ D: Dạo vườn hoa chùa tưới nước luống hoa mới khô
      try {
        await this.client.doGarden({ autoWaterOthers: true, maxWaterOthers: 15 });
      } catch (err) {}

      // 6. Nhận các phần thưởng nhiệm vụ phát sinh nếu có
      await this.client.claimAllQuests();

      // In bảng tóm tắt công đức định kỳ
      this.client.printStatus();

      // 7. Hoạt động tích luỹ E: Tĩnh toạ thiền định tĩnh tâm (giữ kết nối heartbeat)
      const restSeconds = Math.min(this.options.idleCycleMinutes * 60, 300); // 5 phút thiền mỗi hiệp
      log.temple('🧘', `Tĩnh tọa nhập định ${Math.floor(restSeconds / 60)} phút tĩnh tâm trước hiệp kế tiếp...`);

      // Chia nhỏ thời gian nghỉ để kiểm tra sự kiện thời gian thực và tín hiệu dừng
      const checkIntervalSec = 10;
      let waited = 0;
      while (waited < restSeconds && !this.stopRequested) {
        this.client.checkAborted();
        await this.client.sleep(checkIntervalSec * 1000);
        waited += checkIntervalSec;

        // Nếu vừa chạm khung giờ đố vui hoặc thắp đèn thì đánh thức ngay lập tức!
        const curDate = new Date();
        if ((isLampTime(curDate) && !this.lampDoneToday) ||
            (isQuizTime(curDate) && !this.liveQuizDoneToday) ||
            isDayResetTime(curDate)) {
          log.temple('🔔', 'Chuông báo sự kiện đặc biệt! Đánh thức xuất định để làm Phật sự...');
          break;
        }
      }
    }
  }

  /**
   * Phương thức điều phối chính (Main Execution Pipeline)
   */
  async start() {
    this.stopRequested = false;
    await this.initClient();

    log.temple('🪷', '=======================================================');
    log.temple('🪷', '  KHỞI ĐỘNG CỖ MÁY TỰ CHƠI PHẬT PHÁP (AUTONOMOUS BOT)  ');
    log.temple('🪷', '  Hỗ trợ tự nhận diện công đức, tự đổi việc & canh giờ  ');
    log.temple('🪷', '=======================================================');

    // Kết nối vào máy chủ chùa
    if (!this.client.connected) {
      log.info('Đang kết nối vào máy chủ chùa Di Đen...');
      await this.client.connect();
      this.bindSocketEvents();
    }

    const vnNow = getVNTime();
    this.currentDayVN = vnNow.dateStr;

    // Chế độ 'probe': Chỉ thăm dò chẩn đoán trạng thái
    if (this.options.mode === 'probe') {
      log.info('Đang chạy ở chế độ [probe] - Thăm dò chẩn đoán ghi nhận:');
      const actions = this.getCandidateDailyActions();
      for (const act of actions) {
        this.client.checkAborted();
        const p = await this.tracker.probeAction(this.client, act.name, act.fn);
        const icon = p.hasRecognition ? '✅' : '⏳';
        console.log(`${icon} [${act.name}]: Ghi nhận=${p.hasRecognition}, Delta công đức=+${p.deltaMerit}, Capped=${p.isCapped}`);
      }
      return;
    }

    // Chế độ 'once': Chạy 1 chu kỳ hoàn chỉnh rồi dừng
    if (this.options.mode === 'once') {
      await this.runDailyProbingPhase();
      await this.checkAndRunScheduledTasks();
      await this.runClaimPhase();
      this.client.printStatus();
      log.success('Đã hoàn thành 1 chu kỳ tự chơi hoàn chỉnh.');
      return;
    }

    // Chế độ mặc định 'daemon': Tự chơi liên tục, chuyển sang treo tích luỹ và đón sự kiện
    while (!this.stopRequested) {
      try {
        await this.runDailyProbingPhase();
        await this.checkAndRunScheduledTasks();
        await this.runClaimPhase();
        await this.runIdleAccumulationLoop();
      } catch (err) {
        if (this.stopRequested) break;
        log.error('Lỗi trong vòng lặp tự chơi:', err.message);
        log.info('Chờ 10 giây trước khi khôi phục chu trình...');
        await this.client.sleep(10000);
      }
    }
  }

  stop(reason = 'Người dùng yêu cầu dừng') {
    this.stopRequested = true;
    this.state = BotState.STOPPED;
    if (this.client) {
      this.client.abort(reason);
    }
  }
}
