import { log } from '../logger.js';

/**
 * Các mẫu câu máy chủ phản hồi khi một hoạt động đã đạt giới hạn (cap/saturated)
 */
const SATURATION_PATTERNS = [
  /đã đạt giới hạn/i,
  /hết lượt/i,
  /ngày mai quay lại/i,
  /đã nhận thưởng/i,
  /chỉ thắp đèn từ/i,
  /chỉ mở lúc/i,
  /không thể thắp thêm/i,
  /không còn/i,
  /đã hoàn thành/i,
  /tối đa trong ngày/i,
  /chờ đợt sau/i
];

/**
 * Class giám sát và nhận diện sự ghi nhận từ máy chủ chùa Di Đen:
 * - Điểm công đức (merit / gain)
 * - Tiến độ nhiệm vụ (quests / weekly / newbie)
 * - Chỉ số tích lũy nhật ký chùa (journal: lạy, tràng hạt, thắp hương, đèn, ...)
 * - Trạng thái việc chùa (chores)
 * - Thông điệp hệ thống (toasts, alerts)
 */
export class FeedbackTracker {
  constructor(options = {}) {
    this.settleDelayMs = options.settleDelayMs || 700;
  }

  /**
   * Chụp nhanh trạng thái hiện tại của tài khoản
   */
  captureSnapshot(client) {
    const me = client.merit?.me || {};
    const questsMap = new Map();
    const allQuests = [
      ...(me.quests || []),
      ...(me.weekly || []),
      ...(me.newbie || [])
    ];
    for (const q of allQuests) {
      if (q && q.id) {
        questsMap.set(q.id, {
          id: q.id,
          title: q.title || q.id,
          have: Number(q.have || 0),
          need: Number(q.need || 0),
          claimed: Boolean(q.claimed)
        });
      }
    }

    const journal = client.journal ? { ...client.journal } : {};
    const chores = client.chores ? { ...client.chores } : {};

    return {
      timestamp: Date.now(),
      totalMerit: Number(me.total || 0),
      todayMerit: Number(me.today || 0),
      quests: questsMap,
      journal,
      chores
    };
  }

  /**
   * So sánh hai ảnh chụp để xác định mức độ ghi nhận của máy chủ
   */
  compareSnapshots(before, after, recentGains = [], recentToasts = []) {
    // 1. Độ lệch công đức
    let meritFromGains = 0;
    for (const g of recentGains) {
      if (typeof g.n === 'number' && g.n > 0) {
        meritFromGains += g.n;
      }
    }

    const deltaToday = Math.max(0, after.todayMerit - before.todayMerit);
    const deltaTotal = Math.max(0, after.totalMerit - before.totalMerit);
    const deltaMerit = Math.max(deltaToday, deltaTotal, meritFromGains);

    // 2. Độ lệch tiến độ nhiệm vụ
    const questDeltas = [];
    for (const [id, beforeQ] of before.quests.entries()) {
      const afterQ = after.quests.get(id);
      if (afterQ) {
        const deltaHave = afterQ.have - beforeQ.have;
        const newlyClaimable = !beforeQ.claimed && beforeQ.have < beforeQ.need && afterQ.have >= afterQ.need;
        const newlyClaimed = !beforeQ.claimed && afterQ.claimed;

        if (deltaHave > 0 || newlyClaimable || newlyClaimed) {
          questDeltas.push({
            id,
            title: afterQ.title,
            deltaHave,
            beforeHave: beforeQ.have,
            afterHave: afterQ.have,
            need: afterQ.need,
            newlyClaimable,
            newlyClaimed
          });
        }
      }
    }

    // 3. Độ lệch tiến độ nhật ký chùa (journal)
    const journalDeltas = {};
    for (const [key, afterVal] of Object.entries(after.journal)) {
      const beforeVal = before.journal[key];
      if (typeof afterVal === 'number' && typeof beforeVal === 'number') {
        const diff = afterVal - beforeVal;
        if (diff > 0) {
          journalDeltas[key] = diff;
        }
      }
    }

    // 4. Độ lệch việc chùa (chores)
    let choreChanged = false;
    for (const [key, afterVal] of Object.entries(after.chores)) {
      if (before.chores[key] !== afterVal) {
        choreChanged = true;
        break;
      }
    }

    // 5. Kiểm tra thông báo chạm ngưỡng (toast saturation)
    let saturationReason = null;
    for (const toast of recentToasts) {
      const text = toast.text || '';
      for (const pattern of SATURATION_PATTERNS) {
        if (pattern.test(text)) {
          saturationReason = text;
          break;
        }
      }
      if (saturationReason) break;
    }

    // Tổng hợp: Có sự ghi nhận từ máy chủ hay không
    const hasRecognition =
      deltaMerit > 0 ||
      questDeltas.length > 0 ||
      Object.keys(journalDeltas).length > 0 ||
      choreChanged;

    return {
      hasRecognition,
      deltaMerit,
      gains: [...recentGains],
      questDeltas,
      journalDeltas,
      choreChanged,
      toasts: [...recentToasts],
      saturationReason,
      isCapped: Boolean(saturationReason) || (!hasRecognition)
    };
  }

  /**
   * Thực hiện thăm dò 1 lần thử cho một hành động và phân tích phản hồi
   */
  async probeAction(client, actionName, executeFn, options = {}) {
    client.checkAborted();
    client.clearRecentFeedback();

    const before = this.captureSnapshot(client);

    let actionError = null;
    try {
      await executeFn();
    } catch (err) {
      actionError = err;
    }

    if (actionError) {
      return {
        actionName,
        success: false,
        error: actionError.message,
        hasRecognition: false,
        deltaMerit: 0,
        questDeltas: [],
        journalDeltas: {},
        isCapped: true,
        saturationReason: actionError.message
      };
    }

    // Chờ máy chủ phản hồi trạng thái
    const waitTime = options.settleDelayMs || this.settleDelayMs;
    await client.sleep(waitTime);

    const after = this.captureSnapshot(client);
    const feedback = this.compareSnapshots(
      before,
      after,
      client.recentGains,
      client.recentToasts
    );

    return {
      actionName,
      success: true,
      ...feedback
    };
  }

  /**
   * Lặp lại hành động liên tục cho đến khi máy chủ không còn ghi nhận thêm
   * (Chạm ngưỡng / Bão hòa / Cap)
   */
  async executeUntilCapped(client, actionDef, options = {}) {
    const {
      name,
      fn,
      maxZeroAttempts = 2,
      maxIterations = 50,
      intervalMs = 500,
      description = name
    } = actionDef;

    log.info(`\n🔍 Bắt đầu thăm dò & tích luỹ: [${description}]...`);

    let zeroRecognitionCount = 0;
    let iteration = 0;
    let totalMeritYield = 0;
    let totalQuestsUpdated = 0;
    let stopReason = '';
    const executionHistory = [];

    while (iteration < maxIterations) {
      client.checkAborted();
      iteration++;

      const probe = await this.probeAction(client, name, fn, {
        settleDelayMs: intervalMs
      });

      executionHistory.push(probe);

      if (probe.deltaMerit > 0) {
        totalMeritYield += probe.deltaMerit;
      }
      if (probe.questDeltas?.length > 0) {
        totalQuestsUpdated += probe.questDeltas.length;
      }

      // Xử lý thông điệp chạm ngưỡng cụ thể từ toast
      if (probe.saturationReason) {
        stopReason = `Máy chủ báo: "${probe.saturationReason}"`;
        log.temple('🛑', `[${description}] Chạm ngưỡng ghi nhận: ${stopReason}`);
        break;
      }

      // Đánh giá mức độ ghi nhận
      if (probe.hasRecognition) {
        zeroRecognitionCount = 0; // Đặt lại bộ đếm vì vẫn còn ghi nhận
        const detailParts = [];
        if (probe.deltaMerit > 0) detailParts.push(`+${probe.deltaMerit} công đức`);
        if (probe.questDeltas.length > 0) {
          detailParts.push(`Nhiệm vụ [${probe.questDeltas.map(q => q.title).join(', ')}] tiến triển`);
        }
        if (Object.keys(probe.journalDeltas).length > 0) {
          detailParts.push(`Nhật ký chùa ghi nhận: ${JSON.stringify(probe.journalDeltas)}`);
        }
        log.merit(`  ✨ Lần ${iteration}: Ghi nhận thành công (${detailParts.join(' | ') || 'Cập nhật việc chùa'})`);
      } else {
        zeroRecognitionCount++;
        log.info(`  ⏳ Lần ${iteration}: Không nhận thêm phản hồi mới (Lần thử không tiến triển: ${zeroRecognitionCount}/${maxZeroAttempts})`);
        
        if (zeroRecognitionCount >= maxZeroAttempts) {
          stopReason = `Máy chủ không còn ghi nhận thêm tiến độ sau ${maxZeroAttempts} lần thực hiện`;
          log.temple('🏁', `[${description}] Hoàn tất tích luỹ (Đã bão hòa/Capped): ${stopReason}`);
          break;
        }
      }

      await client.sleep(intervalMs);
    }

    if (iteration >= maxIterations && !stopReason) {
      stopReason = `Đã đạt giới hạn an toàn tối đa (${maxIterations} lượt) của hệ thống`;
      log.warn(`[${description}] Tạm dừng: ${stopReason}`);
    }

    return {
      actionName: name,
      description,
      iterations: iteration,
      totalMeritYield,
      totalQuestsUpdated,
      stoppedReason: stopReason,
      isCapped: true,
      lastFeedback: executionHistory[executionHistory.length - 1]
    };
  }
}
