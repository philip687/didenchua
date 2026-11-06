import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackTracker } from '../src/auto/feedback_tracker.js';
import {
  getVNTime,
  isLampTime,
  isQuizTime,
  isDayResetTime,
  getNextScheduledEvent,
  formatDuration
} from '../src/auto/schedule_events.js';

test('FeedbackTracker: captureSnapshot & compareSnapshots', () => {
  const tracker = new FeedbackTracker();

  const mockClientBefore = {
    merit: {
      me: {
        total: 1000,
        today: 50,
        quests: [
          { id: 'huong', title: 'Thắp hương', have: 0, need: 1, claimed: false }
        ]
      }
    },
    journal: { bows: 10, beads: 50 },
    chores: { quet: false }
  };

  const before = tracker.captureSnapshot(mockClientBefore);
  assert.equal(before.totalMerit, 1000);
  assert.equal(before.todayMerit, 50);
  assert.equal(before.quests.get('huong').have, 0);

  const mockClientAfter = {
    merit: {
      me: {
        total: 1010,
        today: 60,
        quests: [
          { id: 'huong', title: 'Thắp hương', have: 1, need: 1, claimed: false }
        ]
      }
    },
    journal: { bows: 10, beads: 50 },
    chores: { quet: false }
  };

  const after = tracker.captureSnapshot(mockClientAfter);
  const comparison = tracker.compareSnapshots(before, after, [{ n: 10, why: 'Thắp hương' }], []);

  assert.equal(comparison.hasRecognition, true);
  assert.equal(comparison.deltaMerit, 10);
  assert.equal(comparison.questDeltas.length, 1);
  assert.equal(comparison.questDeltas[0].newlyClaimable, true);
  assert.equal(comparison.isCapped, false);
});

test('FeedbackTracker: detect saturation toast', () => {
  const tracker = new FeedbackTracker();

  const mockClient = {
    merit: { me: { total: 1000, today: 50, quests: [] } },
    journal: {},
    chores: {}
  };

  const before = tracker.captureSnapshot(mockClient);
  const after = tracker.captureSnapshot(mockClient);

  const toasts = [{ t: 'toast', text: 'Hôm nay bạn đã đạt giới hạn thắp đèn, ngày mai quay lại nhé!' }];
  const comparison = tracker.compareSnapshots(before, after, [], toasts);

  assert.equal(comparison.hasRecognition, false);
  assert.equal(comparison.isCapped, true);
  assert.match(comparison.saturationReason, /đã đạt giới hạn/i);
});

test('FeedbackTracker: executeUntilCapped stops after reaching cap', async () => {
  const tracker = new FeedbackTracker({ settleDelayMs: 10 });

  let callCount = 0;
  const mockClient = {
    checkAborted: () => {},
    clearRecentFeedback: () => {},
    recentGains: [],
    recentToasts: [],
    merit: { me: { total: 100, today: 10, quests: [] } },
    journal: {},
    chores: {},
    sleep: async (ms) => new Promise(res => setTimeout(res, 5))
  };

  // Giả lập hành động: 2 lần đầu được cộng điểm, từ lần 3 máy chủ không nhận nữa
  const actionDef = {
    name: 'test_action',
    fn: async () => {
      callCount++;
      if (callCount <= 2) {
        mockClient.recentGains = [{ n: 5, why: 'Công quả' }];
        mockClient.merit.me.total += 5;
      } else {
        mockClient.recentGains = [];
      }
    },
    maxZeroAttempts: 2,
    maxIterations: 10,
    intervalMs: 5
  };

  const result = await tracker.executeUntilCapped(mockClient, actionDef);
  // Lần 1: +5, Lần 2: +5, Lần 3: zero #1, Lần 4: zero #2 -> STOP
  assert.equal(callCount, 4);
  assert.equal(result.totalMeritYield, 10);
  assert.equal(result.isCapped, true);
  assert.match(result.stoppedReason, /không còn ghi nhận thêm tiến độ/);
});

test('ScheduleEvents: getVNTime, isLampTime, isQuizTime, isDayResetTime', () => {
  // Test ngày & giờ UTC cố định chuyển sang VN (UTC+7)
  const dLamp = new Date('2026-11-06T09:45:00Z'); // 16:45 VN
  const vnLamp = getVNTime(dLamp);
  assert.equal(vnLamp.hours, 16);
  assert.equal(vnLamp.minutes, 45);
  assert.equal(isLampTime(dLamp), true);
  assert.equal(isQuizTime(dLamp), false);

  const dQuiz = new Date('2026-11-06T13:02:00Z'); // 20:02 VN
  assert.equal(isQuizTime(dQuiz), true);
  assert.equal(isLampTime(dQuiz), true); // 20:02 vẫn nằm trong 16:30 - 21:30

  const dReset = new Date('2026-11-06T17:03:00Z'); // 00:03 VN
  assert.equal(isDayResetTime(dReset), true);
  assert.equal(isLampTime(dReset), false);
  assert.equal(isQuizTime(dReset), false);
});

test('ScheduleEvents: getNextScheduledEvent & formatDuration', () => {
  const dMorning = new Date('2026-11-06T01:00:00Z'); // 08:00 VN
  const nextInfo = getNextScheduledEvent(dMorning);

  assert.equal(nextInfo.inLampWindow, false);
  assert.equal(nextInfo.inQuizWindow, false);
  assert.equal(nextInfo.nextEvent.id, 'lamp_start');
  assert.equal(nextInfo.nextEvent.targetTimeStr, '16:30:00');
  assert.ok(nextInfo.nextEvent.waitMs > 0);

  const formatted = formatDuration(3665000); // 1h 1m 5s
  assert.equal(formatted, '1 giờ 1 phút 5 giây');
});
