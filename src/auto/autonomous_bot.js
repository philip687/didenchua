import { DiDenChuaClient, CHANH_DIEN_SEATS } from '../client.js';
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
  ACCUMULATING_MILESTONES: 'ACCUMULATING_MILESTONES',
  STANDBY_WAIT: 'STANDBY_WAIT',
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

    // Cấu hình mốc tích luỹ (Milestone Targets) - Không làm vô hạn, chỉ làm đến mốc hoặc khi hết ghi nhận
    const milestoneCfg = this.options.config?.milestoneFarming || {};
    this.milestoneTargets = {
      bows: milestoneCfg.dailyBows ?? 108,      // Mốc lạy Phật (mặc định 108 lạy = Trăm lạy)
      beads: milestoneCfg.dailyBeads ?? 108,   // Mốc tràng hạt (mặc định 108 hạt = 1 chuỗi tròn)
      mo: milestoneCfg.dailyMo ?? 30,          // Mốc gõ mõ (mặc định 30 tiếng định tâm)
      maxWaterOthers: this.options.config?.maxWaterOthers ?? 40 // Mốc tưới hoa
    };

    // Tiến độ tích luỹ đã đạt trong ngày
    this.dailyAccumulated = {
      bows: 0,
      beads: 0,
      mo: 0,
      watered: 0
    };

    // Tập hợp các việc tích luỹ đã đạt mốc hoặc hết nhận được ghi nhận từ máy chủ
    this.accumulationsCapped = new Set();
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
      log.temple('🌅', `Bắt đầu ngày mới: ${vn.dateStr} (Giờ VN: ${vn.timeStr}). Làm mới bộ đếm công việc & mốc tích luỹ.`);
      this.currentDayVN = vn.dateStr;
      this.dailyActionsDone.clear();
      this.accumulationsCapped.clear();
      this.dailyAccumulated = { bows: 0, beads: 0, mo: 0, watered: 0 };
      this.lampDoneToday = false;
      this.liveQuizDoneToday = false;
    }
  }

  /**
   * Kiểm tra xem toàn bộ các hoạt động tích luỹ đã đạt mốc hoặc hết ghi nhận hay chưa
   */
  isAllAccumulationFinished() {
    return (
      this.accumulationsCapped.has('bows') &&
      this.accumulationsCapped.has('beads') &&
      this.accumulationsCapped.has('mo') &&
      this.accumulationsCapped.has('garden')
    );
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
   * Giai đoạn 4: Thực hiện các hoạt động tích luỹ theo mốc nhất định (Milestone Targets)
   * Không làm tới vô hạn: Mỗi việc chỉ làm đến khi đạt mốc hoặc khi máy chủ hết ghi nhận thêm (Capped)
   * - Lạy Phật (mốc 108 lạy = Trăm lạy)
   * - Lăn tràng hạt niệm Phật (mốc 108 hạt = Tròn chuỗi)
   * - Gõ mõ định tâm (mốc 30 tiếng)
   * - Tuần tra vườn hoa chùa (chỉ tưới khi còn luống hoa khô)
   */
  async runAccumulationPhase() {
    this.state = BotState.ACCUMULATING_MILESTONES;
    this.checkDayRollover();

    log.temple('🎯', '\n=== GIAI ĐOẠN 4: THỰC HIỆN HOẠT ĐỘNG TÍCH LUỸ THEO MỐC CHỈ TIÊU ===');
    log.info(`Chỉ tiêu mốc hôm nay: [Lạy Phật: ${this.milestoneTargets.bows} lạy] [Tràng hạt: ${this.milestoneTargets.beads} hạt] [Gõ mõ: ${this.milestoneTargets.mo} tiếng]`);

    // 1. Tích luỹ Lạy Phật (Mốc 108 lạy hoặc khi máy chủ hết ghi nhận)
    if (!this.accumulationsCapped.has('bows')) {
      const remainingBows = this.milestoneTargets.bows - this.dailyAccumulated.bows;
      if (remainingBows <= 0) {
        this.accumulationsCapped.add('bows');
        log.success(`🙏 Đã đạt đủ mốc lạy Phật hôm nay (${this.dailyAccumulated.bows}/${this.milestoneTargets.bows} lạy).`);
      } else {
        log.info(`-> Tích luỹ Lạy Phật (Hiện tại: ${this.dailyAccumulated.bows}/${this.milestoneTargets.bows} lạy, còn thiếu ${remainingBows} lạy)...`);
        const layAction = {
          name: 'Lạy Phật tích luỹ',
          fn: async () => await this.client.doLay(18),
          maxZeroAttempts: 2,
          maxIterations: Math.ceil(remainingBows / 18) + 1,
          description: 'Lạy Phật sám hối theo hiệp 18 lạy'
        };
        const res = await this.tracker.executeUntilCapped(this.client, layAction, { intervalMs: 600 });
        // Only recognized action batches count. Zero-recognition retries are
        // deliberately excluded so a cap probe cannot inflate the milestone.
        const bowsGained = Math.min((res.recognizedIterations || 0) * 18, remainingBows);
        this.dailyAccumulated.bows += bowsGained;

        const stoppedByServer = ['server_saturation', 'no_recognition'].includes(res.terminalStatus);
        if (this.dailyAccumulated.bows >= this.milestoneTargets.bows || stoppedByServer) {
          this.accumulationsCapped.add('bows');
          log.temple('🏁', `[Lạy Phật] Hoàn tất mốc (${this.dailyAccumulated.bows}/${this.milestoneTargets.bows} lạy) hoặc máy chủ hết ghi nhận thêm.`);
        } else if (res.terminalStatus === 'action_error' || res.terminalStatus === 'max_iterations') {
          log.warn(`[Lạy Phật] Chưa thể xác nhận đủ mốc; trạng thái dừng: ${res.terminalStatus}.`);
        }
      }
      await this.client.humanDelay('nghỉ ngơi sau hiệp lạy Phật');
    }

    // 2. Tích luỹ Lăn tràng hạt niệm Phật (Mốc 108 hạt hoặc khi máy chủ hết ghi nhận)
    if (!this.accumulationsCapped.has('beads')) {
      const remainingBeads = this.milestoneTargets.beads - this.dailyAccumulated.beads;
      if (remainingBeads <= 0) {
        this.accumulationsCapped.add('beads');
        log.success(`📿 Đã đạt đủ mốc tràng hạt hôm nay (${this.dailyAccumulated.beads}/${this.milestoneTargets.beads} hạt).`);
      } else {
        log.info(`-> Tích luỹ Lăn tràng hạt (Hiện tại: ${this.dailyAccumulated.beads}/${this.milestoneTargets.beads} hạt, còn thiếu ${remainingBeads} hạt)...`);
        const beadsBatch = Math.min(remainingBeads, 108);
        const beadsAction = {
          name: 'Lăn tràng hạt niệm Phật tích luỹ',
          fn: async () => await this.client.doBeads(beadsBatch),
          maxZeroAttempts: 2,
          maxIterations: Math.ceil(remainingBeads / beadsBatch) + 1,
          description: `Lăn tràng hạt niệm Phật ${beadsBatch} hạt`
        };
        const res = await this.tracker.executeUntilCapped(this.client, beadsAction, { intervalMs: 600 });
        // Count only batches with observed feedback; iteration count includes
        // retries that intentionally produced no recognition.
        this.dailyAccumulated.beads += Math.min((res.recognizedIterations || 0) * beadsBatch, remainingBeads);

        const stoppedByServer = ['server_saturation', 'no_recognition'].includes(res.terminalStatus);
        if (this.dailyAccumulated.beads >= this.milestoneTargets.beads || stoppedByServer) {
          this.accumulationsCapped.add('beads');
          log.temple('🏁', `[Tràng hạt] Hoàn tất mốc (${this.dailyAccumulated.beads}/${this.milestoneTargets.beads} hạt) hoặc máy chủ hết ghi nhận thêm.`);
        } else if (res.terminalStatus === 'action_error' || res.terminalStatus === 'max_iterations') {
          log.warn(`[Tràng hạt] Chưa thể xác nhận đủ mốc; trạng thái dừng: ${res.terminalStatus}.`);
        }
      }
      await this.client.humanDelay('thong thả nghỉ tay sau khi niệm hạt');
    }

    // 3. Tích luỹ Gõ mõ định tâm (Mốc 30 tiếng hoặc khi máy chủ hết ghi nhận)
    if (!this.accumulationsCapped.has('mo')) {
      const remainingMo = this.milestoneTargets.mo - this.dailyAccumulated.mo;
      if (remainingMo <= 0) {
        this.accumulationsCapped.add('mo');
        log.success(`🔔 Đã đạt đủ mốc gõ mõ hôm nay (${this.dailyAccumulated.mo}/${this.milestoneTargets.mo} tiếng).`);
      } else {
        const moBatch = Math.min(remainingMo, 15);
        const moAction = {
          name: 'Gõ mõ định tâm tích luỹ',
          fn: async () => await this.client.doMo(moBatch),
          maxZeroAttempts: 2,
          maxIterations: Math.ceil(remainingMo / moBatch) + 1,
          description: `Gõ mõ tụng kinh ${moBatch} tiếng`
        };
        const res = await this.tracker.executeUntilCapped(this.client, moAction, { intervalMs: 500 });
        // Do not treat the safety-limit iterations as server-acknowledged
        // tiếng mõ; only recognized batches are eligible for the target.
        this.dailyAccumulated.mo += Math.min((res.recognizedIterations || 0) * moBatch, remainingMo);

        const stoppedByServer = ['server_saturation', 'no_recognition'].includes(res.terminalStatus);
        if (this.dailyAccumulated.mo >= this.milestoneTargets.mo || stoppedByServer) {
          this.accumulationsCapped.add('mo');
          log.temple('🏁', `[Gõ mõ] Hoàn tất mốc (${this.dailyAccumulated.mo}/${this.milestoneTargets.mo} tiếng) hoặc máy chủ hết ghi nhận thêm.`);
        } else if (res.terminalStatus === 'action_error' || res.terminalStatus === 'max_iterations') {
          log.warn(`[Gõ mõ] Chưa thể xác nhận đủ mốc; trạng thái dừng: ${res.terminalStatus}.`);
        }
      }
    }

    // 4. Tích luỹ Vườn hoa chùa (Tưới nước giúp bạn đồng tu)
    if (!this.accumulationsCapped.has('garden')) {
      log.info('-> Kiểm tra các luống hoa chùa cần tưới nước tích công quả...');
      try {
        await this.client.doGarden({ autoWaterOthers: true, maxWaterOthers: this.milestoneTargets.maxWaterOthers });
        this.accumulationsCapped.add('garden');
      } catch (error) {
        // A failed garden request is not evidence that the garden is capped.
        log.warn(`[Vườn hoa] Chưa thể xác nhận hoàn tất: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Thu nhận phần thưởng phát sinh nếu có
    await this.client.claimAllQuests();
    this.client.printStatus();
  }

  /**
   * Chế độ Tĩnh Tâm Chờ Sự Kiện (Standby / Event Watch Mode)
   * Khi toàn bộ nhiệm vụ ngày VÀ hoạt động tích luỹ đều đã hoàn thành mốc / hết ghi nhận:
   * -> DỪNG TOÀN BỘ CÁC THAO TÁC HÀNH ĐỘNG (không lạy, không chuỗi, không mõ để tránh spam máy chủ vô ích)
   * -> CHỈ DUY TRÌ NHỊP TIM KẾT NỐI (hb 15s) VÀ ĐỒNG HỒ CANH GIỜ SỰ KIỆN:
   *    - 16:30 UTC+7: Thức dậy thắp đèn Chánh điện
   *    - 20:00 UTC+7: Thức dậy tham gia Đố vui trực tiếp
   *    - 00:01 UTC+7: Thức dậy đón ngày mới, khởi động lại toàn bộ chu trình!
   */
  async runStandbyWatchMode() {
    this.state = BotState.STANDBY_WAIT;
    log.temple('🪷', '\n========================================================================');
    log.temple('🪷', 'TẤT CẢ NHIỆM VỤ NGÀY & HOẠT ĐỘNG TÍCH LUỸ ĐÃ ĐẠT MỐC / HẾT GHI NHẬN TỪ MÁY CHỦ!');
    log.temple('🪷', `• Lạy Phật   : Đã hoàn tất mốc ${this.dailyAccumulated.bows}/${this.milestoneTargets.bows} lạy (Hoặc máy chủ hết ghi nhận)`);
    log.temple('🪷', `• Tràng hạt  : Đã hoàn tất mốc ${this.dailyAccumulated.beads}/${this.milestoneTargets.beads} hạt (Hoặc máy chủ hết ghi nhận)`);
    log.temple('🪷', `• Gõ mõ      : Đã hoàn tất mốc ${this.dailyAccumulated.mo}/${this.milestoneTargets.mo} tiếng`);
    log.temple('🪷', `• Vườn hoa   : Đã tưới sạch các luống hoa cần chăm sóc`);
    log.temple('🪷', '=> DỪNG GỬI LỆNH THAO TÁC ĐỂ TRÁNH SPAM VÔ ÍCH.');
    log.temple('🪷', '=> CHUYỂN SANG CHẾ ĐỘ TĨNH TÂM CHỜ SỰ KIỆN (STANDBY WATCH MODE):');
    log.temple('🪷', '   Duy trì nhịp tim kết nối (hb 15s), tĩnh tọa an định và canh giờ sự kiện:');
    log.temple('🪷', '   [16:30 UTC+7: Thắp đèn Chánh điện] | [20:00 UTC+7: Đố vui trực tiếp] | [00:01 UTC+7: Reset]');
    log.temple('🪷', '========================================================================\n');

    // Chuyển nhân vật vào Chánh điện và an tọa trên bồ đoàn
    const sitOnCushion = () => {
      try {
        this.client.send({ t: 'visit', zone: 'Chánh điện' });
        const taken = this.client.takenSeats || new Set();
        const seat = Array.isArray(CHANH_DIEN_SEATS) ? (CHANH_DIEN_SEATS.find(s => !taken.has(s.id)) || CHANH_DIEN_SEATS[0]) : null;
        if (seat) {
          const sitPayload = {
            t: 'state',
            x: seat.x,
            y: seat.y,
            z: seat.z,
            ry: seat.ry,
            s: 2,
            seat: seat.id
          };
          this.client.send(sitPayload);
          this.client.send({ t: 'sit', seat: seat.id });
        }
      } catch {}
    };

    sitOnCushion();
    log.temple('🧘', 'Đã an tọa trên bồ đoàn Chánh điện, bắt đầu thời khóa tĩnh tọa thiền định chờ sự kiện...');

    let standbyMinutesWaited = 0;
    let secondsSinceLastMeditateReport = 0;

    while (!this.stopRequested) {
      this.client.checkAborted();
      const now = new Date();
      const vn = getVNTime(now);

      // 1. Kiểm tra chuyển giao ngày mới (00:01 - 00:05 UTC+7)
      if (isDayResetTime(now) || (this.currentDayVN && this.currentDayVN !== vn.dateStr)) {
        log.temple('🌅', `Đến thời khắc chuyển giao ngày mới (${vn.dateStr} ${vn.timeStr})! Khởi động lại toàn bộ chu kỳ...`);
        this.checkDayRollover();
        break; // Thoát Standby Mode để bắt đầu chu kỳ ngày mới
      }

      // 2. Kiểm tra khung giờ Thắp đèn Chánh điện (16:30 - 21:30 UTC+7)
      if (isLampTime(now) && !this.lampDoneToday) {
        log.temple('🪔', `[16:30 UTC+7] Đúng giờ mở đèn Chánh điện! Thức dậy xuất định thắp đèn...`);
        try {
          this.client.send({ t: 'stand' });
          this.client.send({ t: 'state', s: 0 });
        } catch {}
        await this.checkAndRunScheduledTasks();
        sitOnCushion();
        log.info('-> Đã hoàn thành thắp đèn Chánh điện chiều tối. Quay trở lại an tọa tĩnh tâm...');
      }

      // 3. Kiểm tra khung giờ Đố vui Phật pháp trực tiếp (20:00 UTC+7)
      if (isQuizTime(now) && !this.liveQuizDoneToday) {
        log.temple('🏆', `[20:00 UTC+7] Đúng giờ Đố vui trực tiếp! Thức dậy bước vào Chánh điện thi đấu...`);
        try {
          this.client.send({ t: 'stand' });
          this.client.send({ t: 'state', s: 0 });
        } catch {}
        await this.checkAndRunScheduledTasks();
        sitOnCushion();
        log.info('-> Đã hoàn tất Đố vui Phật pháp. Quay trở lại an tọa tĩnh tâm...');
      }

      // 4. Nghỉ 10 giây mỗi nhịp (heartbeat vẫn chạy ngầm 15s/lần)
      await this.client.sleep(10000);
      standbyMinutesWaited += 10 / 60;
      secondsSinceLastMeditateReport += 10;

      // Mỗi 60 giây ghi nhận phút ngồi thiền vào máy chủ
      if (secondsSinceLastMeditateReport >= 60) {
        secondsSinceLastMeditateReport = 0;
        try {
          this.client.send({ t: 'meditate', sec: 60 });
        } catch {}
      }

      // Mỗi 15 phút log một dòng thông báo thời gian còn lại đến sự kiện kế tiếp
      if (standbyMinutesWaited >= 15) {
        standbyMinutesWaited = 0;
        const nextEvent = getNextScheduledEvent(now);
        if (nextEvent.nextEvent) {
          log.info(`[Tĩnh tâm canh giờ] Hiện tại: ${nextEvent.currentTimeVN} - Sự kiện kế tiếp: "${nextEvent.nextEvent.name}" (còn ${nextEvent.nextEvent.waitFormatted})`);
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
      try {
        log.info('Đang chạy ở chế độ [probe] - Thăm dò chẩn đoán ghi nhận:');
        const actions = this.getCandidateDailyActions();
        for (const act of actions) {
          this.client.checkAborted();
          const p = await this.tracker.probeAction(this.client, act.name, act.fn);
          const icon = p.hasRecognition ? '✅' : '⏳';
          console.log(`${icon} [${act.name}]: Ghi nhận=${p.hasRecognition}, Delta công đức=+${p.deltaMerit}, Capped=${p.isCapped}`);
        }
      } finally {
        // Finite modes must release the WebSocket; daemon mode intentionally
        // keeps it open for standby/event watching.
        this.client.close();
      }
      return;
    }

    // Chế độ 'once': Chạy 1 chu kỳ hoàn chỉnh rồi dừng
    if (this.options.mode === 'once') {
      try {
        await this.runDailyProbingPhase();
        await this.runClaimPhase();
        // Claim daily rewards before time-gated work so the execution order
        // matches the documented state machine and preserves the daily closeout.
        await this.checkAndRunScheduledTasks();
        await this.runAccumulationPhase();
        this.client.printStatus();
        log.success('Đã hoàn thành 1 chu kỳ tự chơi hoàn chỉnh (bao gồm các mốc tích luỹ).');
      } finally {
        // Without this cleanup a one-shot CLI can retain the live socket and
        // timers after its work has finished.
        this.client.close();
      }
      return;
    }

    // Chế độ mặc định 'daemon': Tự chơi liên tục, chuyển sang treo tích luỹ và đón sự kiện
    while (!this.stopRequested) {
      try {
        await this.runDailyProbingPhase();
        await this.runClaimPhase();
        // Keep daemon and one-shot modes on the same phase ordering.
        await this.checkAndRunScheduledTasks();
        await this.runAccumulationPhase();
        if (this.isAllAccumulationFinished()) {
          await this.runStandbyWatchMode();
        } else {
          // Do not enter standby while a milestone action failed or was only
          // stopped by a safety limit; retry it on the next daemon cycle.
          log.warn('Chưa đủ bằng chứng để vào standby; sẽ thử lại chu kỳ tích luỹ sau 10 giây.');
          await this.client.sleep(10000);
        }
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
