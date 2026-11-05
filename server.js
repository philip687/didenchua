import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runAllQuests } from './src/tasks/all.js';
import { DiDenChuaClient } from './src/client.js';
import { log, setLogHook } from './src/logger.js';
import { notifyRunResult } from './src/notify.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Cấu hình mã bảo mật & xác thực (Priority 1)
const AUTH_TOKEN = (process.env.AUTH_TOKEN || process.env.CRON_SECRET || process.env.ADMIN_KEY || '').trim();
const CSRF_TOKEN = crypto.randomBytes(32).toString('hex');

// Hàm escape HTML chống XSS (Priority 2)
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Kiểm tra xác thực token an toàn (Timing-safe comparison)
function verifyAuth(req) {
  // 1. Kiểm tra CSRF header (dành cho browser client truy cập từ cùng origin)
  const clientCsrf = req.headers['x-csrf-token'];
  if (clientCsrf && typeof clientCsrf === 'string') {
    try {
      const a = Buffer.from(clientCsrf);
      const b = Buffer.from(CSRF_TOKEN);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return true;
      }
    } catch {}
  }

  // 2. Nếu môi trường không cấu hình AUTH_TOKEN (chạy local dev), cho phép
  if (!AUTH_TOKEN) {
    return true;
  }

  // 3. Kiểm tra token từ các HTTP headers an toàn (Authorization, X-API-Key, X-Cron-Secret)
  // Tuyệt đối không nhận token trong URL query string để tránh rò rỉ log
  let providedToken = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedToken = authHeader.slice(7).trim();
  } else if (req.headers['x-api-key']) {
    providedToken = String(req.headers['x-api-key']).trim();
  } else if (req.headers['x-cron-secret']) {
    providedToken = String(req.headers['x-cron-secret']).trim();
  }

  if (!providedToken) {
    return false;
  }

  try {
    const a = Buffer.from(providedToken);
    const b = Buffer.from(AUTH_TOKEN);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Danh mục toàn bộ các nhiệm vụ & công đức chùa hỗ trợ chạy riêng lẻ hoặc theo chu trình
export const TASKS_CATALOG = [
  {
    id: 'bell',
    group: 'daily',
    title: 'Thỉnh Chuông Bát Nhã',
    desc: 'Đến gác chuông thỉnh một tiếng đại hồng chung ngân vang',
    icon: '🔔',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'chuông'
  },
  {
    id: 'vow',
    group: 'daily',
    title: 'Gửi Lời Nguyện Chung',
    desc: 'Gửi lời nguyện cầu bình an, an lạc tới toàn thể chùa',
    icon: '🙏',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'nguyện'
  },
  {
    id: 'incense',
    group: 'daily',
    title: 'Dâng Hương Chánh Điện',
    desc: 'Thắp nén tâm hương thành kính tại lư hương chánh điện',
    icon: '🪔',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'hương'
  },
  {
    id: 'lay',
    group: 'daily',
    title: 'Lạy Phật Sám Hối',
    desc: 'Trang nghiêm cúi lạy Phật sám hối (chọn số lượng: 1, 18, 36, 108 lạy...)',
    icon: '🙇',
    reward: '+15 điểm',
    badge: 'Mốc lạy Phật',
    questKeyword: 'lạy',
    hasCount: true,
    defaultCount: 18,
    countOptions: [
      { value: 1, label: '1 lạy (Quest ngày)' },
      { value: 18, label: '18 lạy (Khởi tâm)' },
      { value: 36, label: '36 lạy (Tinh tấn)' },
      { value: 108, label: '108 lạy (Trăm lạy 🏆)' },
      { value: 300, label: '300 lạy' },
      { value: 1000, label: '1.000 lạy (Ngàn lạy 🏆)' }
    ]
  },
  {
    id: 'greet',
    group: 'daily',
    title: 'Chắp Tay Chào Đồng Tu',
    desc: 'Chắp tay trang nghiêm chào một bạn đồng tu đang có mặt tại chùa',
    icon: '🤝',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'chào'
  },
  {
    id: 'quet',
    group: 'daily',
    title: 'Quét Lá Sân Chùa',
    desc: 'Công quả quét dọn lá rụng giữ gìn khuôn viên thanh tịnh',
    icon: '🧹',
    reward: 'Công quả',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'quét',
    hasCount: true,
    defaultCount: 1,
    countOptions: [
      { value: 1, label: '1 lần (Quest ngày)' },
      { value: 5, label: '5 lần (Cày sân)' },
      { value: 10, label: '10 lần' }
    ]
  },
  {
    id: 'chores',
    group: 'daily',
    title: 'Làm Việc Chùa (Cá, Đèn, Mèo)',
    desc: 'Cho đàn cá hồ sen ăn, thắp đèn dầu chánh điện, xoa đầu mèo chùa',
    icon: '🐟',
    reward: 'Công quả',
    badge: 'Nhiệm vụ ngày',
    questKeyword: 'việc'
  },
  {
    id: 'mo',
    group: 'daily',
    title: 'Gõ Mõ Tụng Kinh',
    desc: 'Gõ mõ theo nhịp thong thả tự nhiên',
    icon: '🪵',
    reward: 'Tụng kinh',
    badge: 'Tu tập',
    questKeyword: 'mõ',
    hasCount: true,
    defaultCount: 15,
    countOptions: [
      { value: 15, label: '15 tiếng' },
      { value: 30, label: '30 tiếng' },
      { value: 60, label: '60 tiếng' }
    ]
  },
  {
    id: 'beads',
    group: 'daily',
    title: 'Lăn Tràng Hạt Niệm Phật',
    desc: 'Lăn tràng hạt niệm Phật (chọn số hạt: 20, 54, 108 hạt/chuỗi tròn...)',
    icon: '📿',
    reward: 'Niệm Phật',
    badge: 'Chuỗi hạt',
    questKeyword: 'hạt',
    hasCount: true,
    defaultCount: 108,
    countOptions: [
      { value: 20, label: '20 hạt (Nhanh)' },
      { value: 54, label: '54 hạt (Nửa chuỗi)' },
      { value: 108, label: '108 hạt (1 chuỗi tròn 🏆)' },
      { value: 216, label: '216 hạt (2 chuỗi)' },
      { value: 540, label: '540 hạt (5 chuỗi)' },
      { value: 1080, label: '1.080 hạt (10 chuỗi 🏆)' }
    ]
  },
  {
    id: 'xam',
    group: 'daily',
    title: 'Gieo Quẻ Xăm May Mắn',
    desc: 'Lắc ống xăm may mắn đầu ngày cầu bình an cát tường',
    icon: '📜',
    reward: 'Quẻ xăm',
    badge: 'Đầu ngày',
    questKeyword: 'xăm'
  },
  {
    id: 'claim',
    group: 'daily',
    title: 'Thu Nhận Tất Cả Phần Thưởng',
    desc: 'Kiểm tra và gửi yêu cầu thu nhận tất cả phần thưởng nhiệm vụ hoàn thành',
    icon: '🎁',
    reward: 'Nhận quà',
    badge: 'Thu hoạch'
  },
  {
    id: 'farm-bows-beads',
    group: 'extra',
    title: 'Cày Tự Động: Chuỗi Hạt & Lạy Phật',
    desc: 'Chạy tự động kết hợp cả Lạy Phật và Lăn Tràng Hạt (set số lượng tùy ý)',
    icon: '📿',
    reward: 'Thành tựu',
    badge: 'Cày tự động',
    isCombo: true
  },
  {
    id: 'garden',
    group: 'extra',
    title: 'Chăm Sóc Vườn Sen & Tưới Hộ',
    desc: 'Chăm luống của mình, dâng hoa nếu nở, và tưới giúp bạn đồng tu (+2đ/luống)',
    icon: '🪷',
    reward: '+2đ/luống',
    badge: 'Ăn thêm điểm'
  },
  {
    id: 'tuyhy',
    group: 'extra',
    title: 'Tùy Hỷ Hoa Đăng Hồ Sen',
    desc: 'Tùy hỷ công đức những ngọn hoa đăng lung linh trên hồ sen',
    icon: '🏮',
    reward: '+Tùy hỷ',
    badge: 'Ăn thêm điểm'
  },
  {
    id: 'qa-incense',
    group: 'extra',
    title: 'Dâng Hương Đài Quan Âm',
    desc: 'Dâng nén tâm hương thành kính cúng dường Bồ Tát Quan Thế Âm',
    icon: '🪔',
    reward: '+Công đức',
    badge: 'Ăn thêm điểm'
  },
  {
    id: 'secrets',
    group: 'extra',
    title: 'Xin Chữ Thư Pháp & Tụng Kinh',
    desc: 'Xin chữ thư pháp "Bình An" từ ông đồ và hoàn tất khóa lễ tụng kinh',
    icon: '✍️',
    reward: 'Thư pháp',
    badge: 'Bí ẩn chùa'
  },
  {
    id: 'visit',
    group: 'extra',
    title: 'Khám Phá Toàn Bộ Chùa (10 Khu)',
    desc: 'Đi dạo thăm khắp 10 khu vực trong chùa (cày danh hiệu "Thăm khắp chùa")',
    icon: '🚶',
    reward: 'Thành tựu',
    badge: 'Khám phá'
  },
  {
    id: 'meditate',
    group: 'extra',
    title: 'Ngồi Thiền Tĩnh Tâm',
    desc: 'Đến Vườn thiền tọa thiền tĩnh tâm tại chỗ đất (tùy chọn 5p / 30p / 60p)',
    icon: '🧘',
    reward: 'Tĩnh tọa',
    badge: 'Treo máy',
    hasDuration: true
  }
];

// Bộ nhớ đệm lưu trạng thái và lịch sử chạy (In-memory buffer)
const state = {
  lastUpdated: null,
  merit: null,
  journal: null,
  isRunning: false,
  runningTask: null,
  runningTaskName: null,
  activeClient: null,
  runStartTime: null,
  currentRunId: null,
  runTriggerSource: null,
  runHistory: [],
  currentLogs: []
};

// Ghi log vào bộ nhớ đệm theo cấu trúc sự kiện chuẩn (SYSTEM_LOG_REPORT)
function addWebLog(msg, level = 'info', icon = 'ℹ️') {
  const now = new Date();
  const timeVN = new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(11, 19);
  const entry = {
    id: 'evt-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    timestamp: now.toISOString(),
    timeDisplay: `[${timeVN} UTC+7]`,
    runId: state.currentRunId || null,
    level,
    icon,
    message: String(msg)
  };
  state.currentLogs.unshift(entry);
  if (state.currentLogs.length > 80) state.currentLogs.pop();
}

setLogHook((msg, level, icon) => {
  addWebLog(msg, level, icon);
});

// Lưu vết trạng thái lịch chạy để không chạy lặp lại khi tiến trình khởi động lại
const SCHEDULER_STATE_FILE = path.join(process.cwd(), '.scheduler_state.json');

function getSavedSchedulerDate() {
  try {
    if (fs.existsSync(SCHEDULER_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCHEDULER_STATE_FILE, 'utf-8'));
      return data.lastRunDate || '';
    }
  } catch {}
  return '';
}

function saveSchedulerDate(dateStr) {
  try {
    fs.writeFileSync(SCHEDULER_STATE_FILE, JSON.stringify({
      lastRunDate: dateStr,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf-8');
  } catch {}
}

let lastScheduledRunDate = getSavedSchedulerDate();
let isSchedulerRunning = false;

// Cập nhật thông tin tài khoản từ máy chủ chùa
async function refreshAccountData() {
  const client = new DiDenChuaClient();
  try {
    await client.connect(8000);
    const j = await client.fetchJournal();
    // Không ghi đè snapshot cũ hoặc thời điểm cập nhật nếu lần đồng bộ mới thiếu dữ liệu.
    if (!client.merit?.me || !j) return false;
    state.merit = client.merit;
    state.journal = j;
    state.lastUpdated = new Date().toISOString();

    // Nếu snapshot cho thấy các nhiệm vụ hôm nay đã hoàn thành, ghi nhận ngày hôm nay đã chạy
    const quests = client.merit.me.quests || [];
    if (Array.isArray(quests) && quests.length > 0 && quests.every(q => q.claimed)) {
      const todayStr = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      lastScheduledRunDate = todayStr;
      saveSchedulerDate(todayStr);
    }

    return true;
  } catch (err) {
    log.error('Lỗi làm mới dữ liệu chùa:', err.message);
    return false;
  } finally {
    client.close();
  }
}

// Hàm thực thi chu trình tự động hoặc nhiệm vụ riêng lẻ (Định danh Run ID & Ghi nhận chuẩn)
async function executeRoutine(triggerSource = 'Manual / Web', runOptions = {}) {
  if (state.isRunning) {
    return { ok: false, message: 'Đang có một tiến trình nhiệm vụ đang chạy dở, vui lòng đợi.' };
  }

  const taskId = runOptions.task || 'all';
  const taskItem = TASKS_CATALOG.find(t => t.id === taskId);
  const taskTitle = taskItem ? taskItem.title : (taskId === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : taskId);

  const runId = 'run-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  state.isRunning = true;
  state.runningTask = taskId;
  state.runningTaskName = taskTitle;
  state.currentRunId = runId;
  state.runStartTime = Date.now();
  state.runTriggerSource = triggerSource;

  const startedAt = new Date().toISOString();
  addWebLog(`⚡ [${runId}] Khởi động tác vụ: ${taskTitle} (Nguồn: ${triggerSource})...`, 'info', '⚡');
  const startTime = Date.now();

  let routineResult = null;
  let runStatus = 'success';
  let safeErrorMessage = null;
  let errorStep = null;
  let keepAliveTimer = null;

  try {
    // Tự động ping keep-alive mỗi 3 phút trong lúc làm nhiệm vụ để chống Render Free Tier ngủ gật
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL
      ? `${process.env.RENDER_EXTERNAL_URL}/health`
      : `http://127.0.0.1:${PORT}/health`;
    keepAliveTimer = setInterval(() => {
      fetch(keepAliveUrl).catch(() => {});
    }, 180000);
    if (keepAliveTimer.unref) keepAliveTimer.unref();

    let prevTitles = new Set();
    let initJ = null;

    if (taskId === 'all') {
      const initClient = new DiDenChuaClient();
      await initClient.connect(8000);
      initJ = await initClient.fetchJournal();
      prevTitles = new Set((initJ?.titles || []).filter(t => t.got).map(t => t.name));
      initClient.close();

      // Chạy chu trình toàn diện 4 Tầng
      routineResult = await runAllQuests({
        skipHang: false,
        onClient: (c) => { state.activeClient = c; },
        ...runOptions
      });
    } else {
      const client = new DiDenChuaClient();
      state.activeClient = client;
      await client.connect(8000);
      log.temple('⚡', `[${runId}] Bắt đầu thực thi nhiệm vụ riêng lẻ: [${taskTitle}]...`);

      switch (taskId) {
        case 'bell':
          await client.doBell();
          break;
        case 'vow':
          await client.doVow(runOptions.text || 'Cầu cho muôn người bình an, thân tâm thường an lạc, vạn sự hanh thông');
          break;
        case 'incense':
          await client.doIncense(runOptions.count || 1);
          break;
        case 'lay':
          const bowsCount = runOptions.count || 18;
          await client.doLay(bowsCount);
          break;
        case 'greet':
          await client.doGreet();
          break;
        case 'quet':
          await client.doQuetLa(runOptions.count || 1);
          break;
        case 'chores':
          await client.doChores();
          await client.doPet();
          break;
        case 'mo':
          await client.doMo(runOptions.count || 15);
          break;
        case 'beads':
          const beadsCount = runOptions.count || 108;
          await client.doBeads(beadsCount);
          break;
        case 'farm-bows-beads':
          const farmBows = runOptions.bowsCount ?? runOptions.count ?? 18;
          const farmBeads = runOptions.beadsCount ?? 108;
          log.temple('📿', `[Cày tự động] Bắt đầu chu trình tự động Chuỗi hạt & Lạy Phật (${farmBows} lạy, ${farmBeads} hạt tràng)...`);
          if (farmBows > 0) {
            log.temple('🙏', `[1/2] Tiến hành cày ${farmBows} lạy Phật sám hối...`);
            await client.doLay(farmBows);
            await client.humanDelay('nghỉ ngơi tĩnh tâm sau khi lạy Phật');
          }
          if (farmBeads > 0) {
            log.temple('📿', `[2/2] Tiến hành lăn thêm ${farmBeads} hạt tràng niệm Phật...`);
            await client.doBeads(farmBeads);
            await client.humanDelay('thong thả nghỉ tay niệm Phật');
          }
          log.success(`Đã hoàn tất cày tự động: ${farmBows} lạy Phật và ${farmBeads} hạt tràng niệm Phật!`);
          break;
        case 'xam':
          await client.doXam();
          break;
        case 'claim':
          await client.claimAllQuests();
          break;
        case 'garden':
          await client.doGarden({ autoWaterOthers: true });
          break;
        case 'tuyhy':
          await client.doTuyHy(5);
          break;
        case 'qa-incense':
          await client.doQaIncense();
          break;
        case 'secrets':
          log.info('-> Xin chữ thư pháp "Bình an" & ghi nhận khóa lễ tụng kinh...');
          client.send({ t: 'chu-xin', chu: 'binh-an' });
          client.send({ t: 'chu-dem', k: 'vao' });
          client.send({ t: 'tk-done' });
          await client.sleep(1200);
          break;
        case 'visit':
          await client.doVisitAll();
          break;
        case 'meditate':
          const secs = runOptions.meditateSeconds || 300;
          await client.doMeditate(secs);
          break;
        default:
          throw new Error(`Nhiệm vụ không xác định: ${taskId}`);
      }

      // Tự động nhận thưởng nếu nhiệm vụ này hoàn thành quest ngày
      if (['bell', 'vow', 'incense', 'lay', 'greet', 'xam', 'chores', 'quet', 'farm-bows-beads'].includes(taskId)) {
        await client.sleep(1000);
        await client.claimAllQuests();
      }

      client.close();
      routineResult = { verificationStatus: 'verified', unverifiedCount: 0 };
    }

    // Lấy lại dữ liệu mới nhất sau khi chạy xong
    const snapshotAvailable = await refreshAccountData();

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    // Chỉ so danh hiệu khi có snapshot trước và sau
    const titlesComparisonAvailable = Array.isArray(initJ?.titles) && snapshotAvailable && Array.isArray(state.journal?.titles);
    const newlyUnlocked = titlesComparisonAvailable
      ? state.journal.titles.filter(t => t.got && !prevTitles.has(t.name))
      : [];

    runStatus = routineResult?.verificationStatus === 'verified'
      ? 'success'
      : (Number(routineResult?.unverifiedCount) > 0 ? 'partial' : 'unverified');
    const finishedAt = new Date().toISOString();

    if (runStatus === 'success' && taskId === 'all') {
      const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      lastScheduledRunDate = today;
      saveSchedulerDate(today);
    }

    const result = {
      id: runId,
      runId,
      source: triggerSource,
      task: taskId,
      taskTitle,
      status: runStatus,
      startTime: startedAt,
      finishedAt,
      timestamp: finishedAt,
      durationSec,
      snapshotAt: snapshotAvailable ? state.lastUpdated : null,
      snapshotStatus: snapshotAvailable ? 'available' : 'unavailable',
      titlesComparison: titlesComparisonAvailable ? 'available' : 'unavailable',
      totalMerit: snapshotAvailable ? (state.merit?.me?.total ?? null) : null,
      todayMerit: snapshotAvailable ? (state.merit?.me?.today ?? null) : null,
      meritLevel: snapshotAvailable ? (state.merit?.me?.level ?? null) : null,
      newlyUnlocked,
      storagePolicy: 'Bộ nhớ tạm phiên làm việc (In-memory buffer tối đa 15 lượt)',
      error: null
    };

    state.runHistory.unshift(result);
    if (state.runHistory.length > 15) state.runHistory.pop();

    addWebLog(`✅ [${runId}] Đã hoàn tất [${taskTitle}] (${runStatus}) sau ${durationSec}s.`, runStatus === 'success' ? 'success' : 'warn', runStatus === 'success' ? '✅' : '⚠️');

    // Gửi thông báo Telegram/Discord nếu cấu hình (không làm đứt chu trình nếu notify lỗi)
    try {
      await notifyRunResult({
        runId,
        source: triggerSource,
        task: taskId,
        taskTitle,
        status: runStatus,
        finishedAt,
        snapshotAt: result.snapshotAt,
        snapshotStatus: result.snapshotStatus,
        journal: snapshotAvailable ? state.journal : null,
        merit: snapshotAvailable ? state.merit : null,
        durationSec,
        newlyUnlocked
      });
    } catch (notifErr) {
      addWebLog(`⚠️ Gửi thông báo Telegram/Discord thất bại: ${notifErr.message}`, 'warn', '⚠️');
    }

    return { ok: true, result };
  } catch (err) {
    const isStopped = (err.message && err.message.includes('dừng')) || state.activeClient?.aborted;
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    // Cắt và che thông tin xác thực phổ biến trước khi ghi lỗi vào dashboard/notification.
    safeErrorMessage = isStopped
      ? 'Tác vụ đã được dừng bởi người dùng'
      : String(err.message || 'Lỗi không xác định')
          .replace(/(authorization|token|secret|cookie|webhook)\s*[:=]\s*\S+/gi, '$1=[đã ẩn]')
          .replace(/https?:\/\/\S+/gi, '[URL đã ẩn]')
          .slice(0, 500);
    errorStep = isStopped ? 'user_stopped' : 'routine_execution';
    runStatus = isStopped ? 'stopped' : 'failed';
    const finishedAt = new Date().toISOString();

    if (isStopped) {
      addWebLog(`🛑 [${runId}] Tác vụ [${taskTitle}] đã dừng lại theo yêu cầu sau ${durationSec}s.`, 'warn', '🛑');
    } else {
      addWebLog(`❌ [${runId}] Thất bại tại bước [${errorStep}]: ${safeErrorMessage}`, 'error', '❌');
    }

    const result = {
      id: runId,
      runId,
      source: triggerSource,
      task: taskId,
      taskTitle,
      status: runStatus,
      error: safeErrorMessage,
      errorStep,
      startTime: startedAt,
      finishedAt,
      timestamp: finishedAt,
      durationSec,
      snapshotAt: state.lastUpdated,
      snapshotStatus: state.lastUpdated ? 'stale' : 'unavailable',
      storagePolicy: 'Bộ nhớ tạm phiên làm việc (In-memory buffer tối đa 15 lượt)'
    };
    state.runHistory.unshift(result);
    if (state.runHistory.length > 15) state.runHistory.pop();

    if (!isStopped) {
      try {
        await notifyRunResult({
          runId,
          source: triggerSource,
          task: taskId,
          taskTitle,
          status: 'failed',
          finishedAt,
          snapshotAt: result.snapshotAt,
          snapshotStatus: result.snapshotStatus,
          error: safeErrorMessage,
          journal: null,
          merit: null,
          durationSec
        });
      } catch {}
    }

    return { ok: false, error: safeErrorMessage, stopped: isStopped };
  } finally {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    state.isRunning = false;
    state.runningTask = null;
    state.runningTaskName = null;
    state.activeClient = null;
    state.runStartTime = null;
    state.runTriggerSource = null;
    state.currentRunId = null;
  }
}

// Lập lịch tự động chạy sau 00:05 sáng mỗi ngày giờ VN (UTC+7)
function startDailyScheduler() {
  async function checkSchedule() {
    if (isSchedulerRunning || state.isRunning) return;

    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // Khung giờ vận hành tự động định kỳ: Từ 00:05 đến 01:59 sáng (giờ Việt Nam UTC+7)
    // Ngăn chặn việc server khởi động lại vào ban ngày (ví dụ khi user truy cập xem report) lại kích hoạt chạy tự động
    const inScheduledWindow = (hour === 0 && minute >= 5) || (hour === 1);
    const allowDaytimeCatchup = process.env.AUTO_RUN_ON_BOOT === 'true';

    const shouldTrigger = (inScheduledWindow || allowDaytimeCatchup) && lastScheduledRunDate !== todayStr;
    if (shouldTrigger) {
      isSchedulerRunning = true;
      log.temple('⏰', `Đến lịch chạy tự động ngày mới ${todayStr} (giờ Việt Nam). Khởi động chu kỳ...`);
      try {
        const res = await executeRoutine(`Daily Scheduler (${todayStr})`, { meditateSeconds: 3600 });
        if (res && res.ok) {
          lastScheduledRunDate = todayStr;
          saveSchedulerDate(todayStr);
          log.success(`Đã hoàn thành lịch chạy tự động ngày ${todayStr}.`);
        } else {
          log.warn(`Lịch chạy ngày ${todayStr} chưa hoàn tất: ${res?.error || res?.message || 'Lỗi không xác định'}. Sẽ thử lại sau.`);
        }
      } catch (err) {
        log.error(`Lỗi thực thi lịch tự động ngày ${todayStr}:`, err.message);
      } finally {
        isSchedulerRunning = false;
      }
    }
  }

  setInterval(checkSchedule, 60000);
  checkSchedule();
  log.info('⏰ Đã kích hoạt lịch trình tự động canh khung giờ 00:05 - 01:59 sáng mỗi ngày (giờ Việt Nam).');
}

// Helper lấy nhãn trạng thái nhiệm vụ hàng ngày
function getTaskQuestBadge(task, quests = []) {
  if (!Array.isArray(quests) || quests.length === 0 || !task.questKeyword) return '';
  const kw = task.questKeyword.toLowerCase();
  const q = quests.find(item => {
    const title = (item.title || '').toLowerCase();
    const id = (item.id || '').toLowerCase();
    return title.includes(kw) || id === kw || id === task.id;
  });
  if (!q) return '';
  if (q.claimed) {
    return '<span class="badge badge-done">✅ Đã nhận</span>';
  }
  if (q.have >= q.need) {
    return '<span class="badge badge-ready">🎁 Chờ nhận</span>';
  }
  return `<span class="badge badge-wait">⏳ ${escapeHTML(q.have)}/${escapeHTML(q.need)}</span>`;
}

// Tạo mã HTML Dashboard an toàn chống XSS (Priority 2 & SYSTEM_LOG_REPORT)
function renderDashboardHTML() {
  const me = state.merit?.me || {};
  const j = state.journal || {};
  // Dữ liệu thiếu phải hiện là thiếu, không dùng giá trị mẫu làm báo cáo thật.
  const reportValue = value => value === null || value === undefined ? 'Chưa có dữ liệu' : escapeHTML(value);
  const nextLevelPoints = me.next !== null && me.next !== undefined && me.total !== null && me.total !== undefined
    && Number.isFinite(Number(me.next)) && Number.isFinite(Number(me.total))
    ? Number(me.next) - Number(me.total)
    : null;

  const questsHTML = (me.quests || []).map(q => {
    const badge = q.claimed
      ? '<span class="badge badge-done">✅ Đã nhận</span>'
      : (q.have >= q.need ? '<span class="badge badge-ready">🎁 Chờ nhận</span>' : `<span class="badge badge-wait">⏳ ${escapeHTML(q.have)}/${escapeHTML(q.need)}</span>`);
    return `
      <div class="quest-item">
        <div class="quest-title">${escapeHTML(q.title)}</div>
        <div class="quest-meta">
          <span class="quest-reward">+${escapeHTML(q.reward)} điểm</span>
          ${badge}
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang đồng bộ nhiệm vụ từ máy chủ chùa…</p>';

  const titlesHTML = (j.titles || []).map(t => {
    return `
      <div class="title-card ${t.got ? 'title-got' : 'title-locked'}">
        <div class="title-icon">${t.got ? '🏆' : '🔒'}</div>
        <div class="title-info">
          <b>${escapeHTML(t.name)}</b>
          <small>${escapeHTML(t.desc)}</small>
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang tải danh hiệu…</p>';

  const historyHTML = state.runHistory.map(h => {
    const isSuccess = h.status === 'success';
    const isPartial = h.status === 'partial' || h.status === 'unverified';
    const isStopped = h.status === 'stopped';
    const statusClass = isSuccess ? 'success' : (isPartial ? 'partial' : (isStopped ? 'stopped' : 'failed'));
    const statusLabel = isSuccess
      ? '✅ Đã xác nhận'
      : (isPartial ? '⚠️ Hoàn tất một phần' : (isStopped ? '🛑 Đã dừng theo yêu cầu' : '❌ Thất bại'));
    const taskBadge = h.taskTitle ? ` [${escapeHTML(h.taskTitle)}]` : '';
    return `
      <div class="history-item ${statusClass}">
        <div>
          <b>${statusLabel}</b>${taskBadge} · <span>${escapeHTML(h.source)}</span>
          <small class="time">Bắt đầu ${escapeHTML(h.startTime || 'chưa rõ')} · Kết thúc ${escapeHTML(h.timestamp || h.finishedAt || 'chưa rõ')} UTC · ${escapeHTML(h.durationSec)}s · ID: ${escapeHTML(h.id)}</small>
        </div>
        <div>${h.status === 'failed' || isStopped ? `<span class="err">${escapeHTML(h.error || 'Đã dừng')}</span>` : `Snapshot: ${escapeHTML(h.snapshotStatus || 'không rõ')} · Hôm nay: ${reportValue(h.todayMerit)}đ · Tổng: ${reportValue(h.totalMerit)}đ`}</div>
      </div>
    `;
  }).join('') || '<p class="empty">Chưa có lịch sử chạy nào trong phiên này (Bộ nhớ tạm lưu tối đa 15 lượt).</p>';

  const logsHTML = state.currentLogs.map(l => `<div><span style="color:var(--text-dim); margin-right:6px;">${escapeHTML(l.timeDisplay)}</span><span style="margin-right:4px;">${escapeHTML(l.icon || 'ℹ️')}</span>${escapeHTML(l.message)}</div>`).join('') || '<div>Hệ thống sẵn sàng. Đang chờ tác vụ…</div>';
  const isRunning = state.isRunning;
  const currentRunningTaskName = state.runningTaskName || (state.runningTask === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : (state.runningTask ? `Nhiệm vụ [${state.runningTask}]` : 'Nhiệm vụ tự động'));
  const elapsedSec = isRunning && state.runStartTime ? Math.round((Date.now() - state.runStartTime) / 1000) : 0;

  const renderTaskRow = (t) => {
    const questBadge = getTaskQuestBadge(t, me.quests);
    const isThisRunning = isRunning && state.runningTask === t.id;
    const isAnyRunning = isRunning;
    const stopActive = isThisRunning || (isAnyRunning && state.runningTask === 'all');

    let inputControl = '';
    if (t.isCombo) {
      inputControl = `
        <div style="display:flex; flex-direction:column; gap:4px; margin-right:4px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; color:var(--gold); width:28px;">Lạy:</span>
            <select id="combo_bows" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 6px; border-radius:6px; font-size:12px; cursor:pointer;" ${isAnyRunning ? 'disabled' : ''}>
              <option value="18" selected>18 lạy</option>
              <option value="36">36 lạy</option>
              <option value="108">108 lạy (Trăm lạy 🏆)</option>
              <option value="300">300 lạy</option>
              <option value="1000">1.000 lạy (Ngàn lạy 🏆)</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:11px; color:var(--gold); width:28px;">Hạt:</span>
            <select id="combo_beads" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 6px; border-radius:6px; font-size:12px; cursor:pointer;" ${isAnyRunning ? 'disabled' : ''}>
              <option value="54">54 hạt</option>
              <option value="108" selected>108 hạt (1 chuỗi tròn 🏆)</option>
              <option value="216">216 hạt (2 chuỗi)</option>
              <option value="540">540 hạt (5 chuỗi)</option>
              <option value="1080">1.080 hạt (10 chuỗi 🏆)</option>
            </select>
          </div>
        </div>
      `;
    } else if (t.hasCount) {
      inputControl = `
        <div style="display:flex; align-items:center; gap:4px; margin-right:4px;">
          <select id="count_${escapeHTML(t.id)}" onchange="handleCountChange('${escapeHTML(t.id)}')" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 8px; border-radius:6px; font-size:12px; cursor:pointer;" ${isAnyRunning ? 'disabled' : ''}>
            ${(t.countOptions || []).map(opt => `<option value="${opt.value}" ${opt.value === t.defaultCount ? 'selected' : ''}>${escapeHTML(opt.label)}</option>`).join('')}
            <option value="custom">Số khác…</option>
          </select>
          <input type="number" id="custom_${escapeHTML(t.id)}" min="1" max="1080" placeholder="Số" style="display:none; width:60px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px;" ${isAnyRunning ? 'disabled' : ''}>
        </div>
      `;
    } else if (t.hasDuration) {
      inputControl = `
        <select id="duration_${escapeHTML(t.id)}" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 8px; border-radius:6px; font-size:12px; cursor:pointer; margin-right:4px;" ${isAnyRunning ? 'disabled' : ''}>
          <option value="300">5 phút</option>
          <option value="1800">30 phút</option>
          <option value="3600" selected>60 phút</option>
        </select>
      `;
    }

    return `
      <div class="task-row ${isThisRunning ? 'active-task' : ''}">
        <div class="task-info">
          <div class="task-icon">${escapeHTML(t.icon)}</div>
          <div class="task-texts">
            <b>${escapeHTML(t.title)}</b>
            <small>${escapeHTML(t.desc)}</small>
            <div class="task-badges">
              <span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(t.reward)}</span>
              <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-dim);">${escapeHTML(t.badge)}</span>
              ${questBadge}
            </div>
          </div>
        </div>
        <div class="task-actions">
          ${inputControl}
          <button class="btn-task btn-run" onclick="runTask('${escapeHTML(t.id)}')" ${isAnyRunning ? 'disabled' : ''}>
            ${isThisRunning ? '⏳ Đang chạy…' : '⚡ Chạy'}
          </button>
          <button class="btn-task btn-stop" onclick="stopTask()" ${stopActive ? '' : 'disabled'}>
            🛑 Dừng
          </button>
        </div>
      </div>
    `;
  };

  const dailyTasksHTML = TASKS_CATALOG.filter(t => t.group === 'daily').map(renderTaskRow).join('');
  const extraTasksHTML = TASKS_CATALOG.filter(t => t.group === 'extra').map(renderTaskRow).join('');

  // Khối thông báo trạng thái & Log trực tiếp khi đang làm nhiệm vụ
  const runningBannerHTML = isRunning ? `
    <div class="card live-task-card" style="border: 2px solid var(--gold); background: #1a140f; box-shadow: 0 0 25px rgba(233,194,122,0.25); margin-bottom: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h2 id="runningTaskTitle" style="color:var(--gold); font-size:16px; margin:0; border:none; padding:0; display:flex; align-items:center; gap:8px;">
          <span class="pulse-dot"></span> 🟡 ĐANG CHẠY: ${escapeHTML(currentRunningTaskName)}
        </h2>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span id="elapsedTimer" style="font-size:13px; color:#ffd98d; font-family:monospace; background:rgba(0,0,0,0.4); padding:5px 10px; border-radius:6px; border:1px solid var(--card-border);">
            ⏱️ Đã chạy: ${escapeHTML(elapsedSec)}s
          </span>
          <button class="btn" onclick="stopTask()" style="background:#e06c75; color:#fff; padding:6px 14px; font-size:12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px;">
            🛑 Dừng Tác Vụ Ngay
          </button>
        </div>
      </div>
      <div class="logs-box" id="liveLogsContainer" style="max-height: 280px; background:#080604; color:#ffe3a8; font-size:13px; line-height:1.7;">
        ${logsHTML}
      </div>
      <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-dim); flex-wrap:wrap; gap:8px;">
        <span>📡 Đang truyền nhật ký trực tiếp (Tự động cập nhật mỗi 2 giây)...</span>
        <span style="color:var(--gold);">⚡ Xin vui lòng không tắt tab</span>
      </div>
    </div>
  ` : `
    <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(103,185,130,0.1); border:1px solid rgba(103,185,130,0.3); padding:10px 16px; border-radius:10px; margin-bottom:20px; font-size:13px; flex-wrap:wrap; gap:10px;">
      <div style="color:var(--success); font-weight:600; display:flex; align-items:center; gap:8px;">
        <span style="display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--success);"></span>
        🟢 SẴN SÀNG · Nhân vật đang an nhiên tĩnh tâm tại chùa
      </div>
      <div style="color:var(--text-dim); font-size:12px;">
        Cập nhật lần cuối (UTC): ${escapeHTML(state.lastUpdated || 'Chưa có dữ liệu')}
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="csrf-token" content="${escapeHTML(CSRF_TOKEN)}">
  <title>An Tự Duyên - Trung Tâm Điều Hành & Báo Cáo Công Đức</title>
  <style>
    :root {
      --bg: #15100c;
      --card-bg: #221b15;
      --card-border: #382c22;
      --gold: #e9c27a;
      --gold-dim: #b8934d;
      --text: #ede4db;
      --text-dim: #9e8e80;
      --success: #67b982;
      --danger: #e06c75;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 20px; line-height: 1.5; }
    .container { max-width: 960px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 16px; margin-bottom: 20px; flex-wrap: wrap; gap: 15px; }
    .who h1 { font-size: 20px; color: var(--gold); display: flex; align-items: center; gap: 8px; }
    .who p { font-size: 13px; color: var(--text-dim); }
    .actions { display: flex; gap: 10px; align-items: center; }
    button.btn { background: var(--gold); color: #1c150e; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; transition: 0.2s; }
    button.btn:hover { background: #ffd98d; transform: translateY(-1px); }
    button.btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .pulse-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #f1c40f;
      margin-right: 6px;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.3; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 20px; }
    .card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 14px; padding: 18px; }
    .card h2 { font-size: 15px; color: var(--gold); border-bottom: 1px solid var(--card-border); padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
    .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
    .stat-box { background: rgba(0,0,0,0.25); border: 1px solid var(--card-border); padding: 12px; border-radius: 10px; }
    .stat-box b { display: block; font-size: 20px; color: var(--gold); }
    .stat-box span { font-size: 12px; color: var(--text-dim); }
    .quest-item { background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .quest-title { font-size: 13px; font-weight: 500; }
    .quest-meta { display: flex; align-items: center; gap: 8px; }
    .quest-reward { font-size: 12px; color: var(--gold-dim); }
    .badge { font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: 600; }
    .badge-done { background: rgba(103,185,130,0.2); color: var(--success); }
    .badge-ready { background: rgba(233,194,122,0.25); color: var(--gold); }
    .badge-wait { background: rgba(255,255,255,0.1); color: var(--text-dim); }
    .title-grid { display: grid; grid-template-columns: 1fr; gap: 8px; max-height: 280px; overflow-y: auto; padding-right: 4px; }
    .title-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--card-border); }
    .title-got { background: rgba(233,194,122,0.1); border-color: rgba(233,194,122,0.3); }
    .title-locked { background: rgba(0,0,0,0.15); opacity: 0.6; }
    .title-icon { font-size: 20px; }
    .title-info b { font-size: 13px; color: var(--text); display: block; }
    .title-info small { font-size: 11px; color: var(--text-dim); }
    .history-item { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--card-border); margin-bottom: 8px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; }
    .history-item.success { border-left: 3px solid var(--success); }
    .history-item.partial, .history-item.unverified { border-left: 3px solid var(--gold); }
    .history-item.error, .history-item.failed, .history-item.stopped { border-left: 3px solid var(--danger); }
    .history-item .time { color: var(--text-dim); margin-left: 8px; }
    .history-item .err { color: var(--danger); }
    .logs-box { background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 180px; overflow-y: auto; line-height: 1.6; }
    .empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 15px; }
    footer { text-align: center; font-size: 12px; color: var(--text-dim); margin-top: 30px; }
    footer a { color: var(--gold-dim); text-decoration: none; }
    .btn-task {
      padding: 6px 12px;
      font-size: 12px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    .btn-run {
      background: var(--gold);
      color: #1c150e;
    }
    .btn-run:hover:not(:disabled) {
      background: #ffd98d;
      transform: translateY(-1px);
    }
    .btn-stop {
      background: rgba(224, 108, 117, 0.15);
      border-color: rgba(224, 108, 117, 0.4);
      color: var(--danger);
    }
    .btn-stop:hover:not(:disabled) {
      background: var(--danger);
      color: #fff;
      transform: translateY(-1px);
    }
    .btn-task:disabled {
      opacity: 0.35;
      cursor: not-allowed;
      transform: none;
    }
    .task-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(0,0,0,0.25);
      border: 1px solid var(--card-border);
      margin-bottom: 8px;
      gap: 10px;
      flex-wrap: wrap;
      transition: border-color 0.2s;
    }
    .task-row:hover {
      border-color: rgba(233,194,122,0.3);
    }
    .task-row.active-task {
      border-color: var(--gold);
      background: rgba(233, 194, 122, 0.08);
      box-shadow: 0 0 10px rgba(233, 194, 122, 0.15);
    }
    .task-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 200px;
    }
    .task-icon {
      font-size: 20px;
      width: 28px;
      text-align: center;
      flex-shrink: 0;
    }
    .task-texts b {
      display: block;
      font-size: 13px;
      color: var(--text);
    }
    .task-texts small {
      display: block;
      font-size: 11px;
      color: var(--text-dim);
      line-height: 1.3;
    }
    .task-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
      flex-wrap: wrap;
    }
    .task-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="who">
        <h1>🪷 ${reportValue(me.name)} <span>(@${reportValue(me.user)})</span></h1>
        <p>Cấp bậc: <b>${reportValue(me.level)} (Lv.${reportValue(me.lv)})</b> · Chuỗi lên chùa: <b>${reportValue(me.days)} ngày liên tục</b></p>
      </div>
      <div class="actions">
        <select id="meditateSelect" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border); padding:9px 12px; border-radius:10px; font-size:13px; outline:none; cursor:pointer;" ${isRunning ? 'disabled' : ''}>
          <option value="3600" selected>🧘 Thiền 60 phút (Cày Top 1)</option>
          <option value="1800">🧘 Thiền 30 phút (Cày Top)</option>
          <option value="300">🧘 Thiền 5 phút (Chuẩn)</option>
        </select>
        <button id="runBtn" class="btn" onclick="triggerRun()" ${isRunning ? 'disabled' : ''}>
          ${isRunning ? '⏳ Đang thực thi…' : '⚡ Chạy Toàn Bộ Chu Trình'}
        </button>
        ${isRunning ? `
          <button id="stopMainBtn" class="btn" onclick="stopTask()" style="background:#e06c75; color:#fff;">
            🛑 Dừng Tác Vụ
          </button>
        ` : ''}
      </div>
    </header>

    <!-- TRẠNG THÁI & KHỐI LIVE TASK LOGS KHI ĐANG CHẠY -->
    ${runningBannerHTML}

    <!-- BẢNG ĐIỀU KHIỂN TỪNG NHIỆM VỤ & DANH SÁCH TOÀN BỘ -->
    <div class="card" style="margin-bottom: 20px;">
      <h2>
        <span>🎯 Danh Sách Toàn Bộ Nhiệm Vụ & Bảng Điều Khiển Từng Phần</span>
        <small style="font-size:12px; color:var(--text-dim); font-weight:normal;">Chạy ngẫu hứng bất kỳ lúc nào · Kèm nút Dừng & Live Log trực tiếp</small>
      </h2>
      <p style="font-size:12px; color:var(--text-dim); margin-bottom:14px; line-height:1.6;">
        Sau khi chu trình tự động lúc 00:05 hoàn tất, bạn có thể bấm <b>[⚡ Chạy]</b> riêng lẻ bất kỳ nhiệm vụ nào bên dưới bất cứ khi nào vào chùa. Quá trình chạy sẽ stream nhật ký trực tiếp vào hộp log phía trên. Bấm <b>[🛑 Dừng]</b> để hủy tác vụ ngay lập tức.
      </p>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        <div>
          <div style="font-size:13px; font-weight:600; color:var(--gold); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
            <span>📋</span> NHIỆM VỤ HÀNG NGÀY & CÔNG QUẢ (TẦNG 1)
          </div>
          ${dailyTasksHTML}
        </div>
        <div>
          <div style="font-size:13px; font-weight:600; color:var(--gold); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
            <span>✨</span> ĂN THÊM ĐIỂM, THÀNH TỰU & TĨNH TÂM (TẦNG 2, 3, 4)
          </div>
          ${extraTasksHTML}
        </div>
      </div>
    </div>

    <div class="grid">
      <!-- CÔNG ĐỨC & CẤP BẬC -->
      <div class="card">
        <h2>✨ Công Đức & Tích Lũy <small style="font-size:11px; color:var(--text-dim); font-weight:normal;">Cập nhật UTC: ${escapeHTML(state.lastUpdated || 'Chưa có dữ liệu')}</small></h2>
        <div class="stat-row">
          <div class="stat-box">
            <b>${reportValue(me.total)}</b>
            <span>Tổng công đức</span>
          </div>
          <div class="stat-box">
            <b>${reportValue(me.today)}</b>
            <span>Hôm nay</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${reportValue(nextLevelPoints)}</b>
            <span>Cần đến cấp sau</span>
          </div>
          <div class="stat-box">
            <b>${reportValue(j.streak)} ngày</b>
            <span>Kỷ lục liên tiếp</span>
          </div>
        </div>
      </div>

      <!-- NHIỆM VỤ HÀNG NGÀY -->
      <div class="card">
        <h2>📋 Nhiệm Vụ Hôm Nay</h2>
        ${questsHTML}
      </div>
    </div>

    <div class="grid">
      <!-- TIẾN ĐỘ THÀNH TỰU -->
      <div class="card">
        <h2>🎯 Tiến Độ Thành Tựu Vĩnh Viễn</h2>
        <div class="stat-row">
          <div class="stat-box">
            <b>${reportValue(j.bows)} / 108</b>
            <span>Lạy Phật (Trăm lạy: ${j.bows === null || j.bows === undefined ? 'chưa xác định' : j.bows >= 108 ? '✅' : 'đang cày'})</span>
          </div>
          <div class="stat-box">
            <b>${reportValue(j.beads)} hạt</b>
            <span>Tràng hạt (${reportValue(j.rounds)} chuỗi tròn)</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${reportValue(j.incense)} / 30</b>
            <span>Dâng hương (Hương trầm)</span>
          </div>
          <div class="stat-box">
            <b>${reportValue(j.lanterns)} / 10</b>
            <span>Hoa đăng (Người thả đèn)</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${reportValue(j.sitMin)} / 60 phút</b>
            <span>Ngồi tĩnh tâm (Tĩnh tọa)</span>
          </div>
          <div class="stat-box">
            <b>${reportValue(j.visited)} / ${reportValue(j.zones)} khu</b>
            <span>Khám phá toàn chùa</span>
          </div>
        </div>
      </div>

      <!-- BẢNG DANH HIỆU -->
      <div class="card">
        <h2>🏅 Danh Hiệu & Thành Tựu</h2>
        <div class="title-grid">
          ${titlesHTML}
        </div>
      </div>
    </div>

    <!-- NHẬT KÝ & LIVE LOGS -->
    <div class="grid">
      <div class="card">
        <h2>📜 Lịch Sử Chạy Gần Nhất</h2>
        <div style="max-height: 180px; overflow-y: auto;">
          ${historyHTML}
        </div>
      </div>

      <div class="card">
        <h2>💻 Nhật Ký Hệ Thống</h2>
        <div class="logs-box" id="bottomLogsBox">
          ${logsHTML}
        </div>
      </div>
    </div>

    <footer>
      <p>Hệ thống tự động hóa công đức chùa An Tự Duyên · Múi giờ: Asia/Ho_Chi_Minh (UTC+7) · Lưu trữ: Bộ nhớ tạm phiên làm việc (In-memory buffer) · <a href="/health">Health Monitor</a></p>
    </footer>
  </div>

  <script>
    function handleCountChange(taskId) {
      const sel = document.getElementById('count_' + taskId);
      const inp = document.getElementById('custom_' + taskId);
      if (!sel || !inp) return;
      if (sel.value === 'custom') {
        inp.style.display = 'inline-block';
        inp.focus();
      } else {
        inp.style.display = 'none';
      }
    }

    async function runTask(taskId, customOptions = {}) {
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

      const payload = { task: taskId, ...customOptions };
      if (taskId === 'meditate') {
        const medSel = document.getElementById('duration_meditate') || document.getElementById('meditateSelect');
        if (medSel) payload.meditate = Number(medSel.value);
      } else if (taskId === 'farm-bows-beads') {
        const bowsSel = document.getElementById('combo_bows');
        const beadsSel = document.getElementById('combo_beads');
        if (bowsSel) payload.bowsCount = Number(bowsSel.value);
        if (beadsSel) payload.beadsCount = Number(beadsSel.value);
      } else {
        const countSel = document.getElementById('count_' + taskId);
        const customInp = document.getElementById('custom_' + taskId);
        if (countSel) {
          if (countSel.value === 'custom' && customInp && customInp.value) {
            payload.count = Number(customInp.value);
          } else {
            payload.count = Number(countSel.value);
          }
        }
      }

      const allRunBtns = document.querySelectorAll('.btn-run, #runBtn');
      allRunBtns.forEach(b => { b.disabled = true; });

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch('/api/run', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          location.reload();
        } else {
          alert(data.error || data.message || 'Lỗi khi kích hoạt nhiệm vụ');
          allRunBtns.forEach(b => { b.disabled = false; });
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
        allRunBtns.forEach(b => { b.disabled = false; });
      }
    }

    async function stopTask() {
      if (!confirm('Bạn có chắc chắn muốn dừng tác vụ đang thực thi không?')) return;
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

      const stopBtns = document.querySelectorAll('.btn-stop, #stopMainBtn');
      stopBtns.forEach(b => { b.disabled = true; b.textContent = '⏳ Đang dừng…'; });

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

        const res = await fetch('/api/stop', {
          method: 'POST',
          headers
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setTimeout(() => location.reload(), 1000);
        } else {
          alert(data.error || data.message || 'Lỗi khi gửi yêu cầu dừng');
          stopBtns.forEach(b => { b.disabled = false; b.textContent = '🛑 Dừng'; });
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
        stopBtns.forEach(b => { b.disabled = false; b.textContent = '🛑 Dừng'; });
      }
    }

    function triggerRun() {
      const medSel = document.getElementById('meditateSelect');
      const medVal = medSel ? medSel.value : '3600';
      runTask('all', { meditate: Number(medVal) });
    }

    // Tự động đồng bộ Live Logs từng giây khi đang làm nhiệm vụ (an toàn DOM textContent, chống XSS)
    const isCurrentlyRunning = ${isRunning ? 'true' : 'false'};

    if (isCurrentlyRunning) {
      const pollTimer = setInterval(async () => {
        try {
          const csrfMeta = document.querySelector('meta[name="csrf-token"]');
          const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
          const headers = {};
          if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

          const res = await fetch('/api/status', { headers });
          if (!res.ok) return;
          const data = await res.json();

          if (!data.isRunning) {
            clearInterval(pollTimer);
            location.reload();
            return;
          }

          // Cập nhật số giây an toàn
          const timerEl = document.getElementById('elapsedTimer');
          if (timerEl && data.runningSeconds !== undefined) {
            timerEl.textContent = '⏱️ Đã chạy: ' + String(data.runningSeconds) + 's';
          }

          // Cập nhật tên tác vụ
          const taskNameEl = document.getElementById('runningTaskTitle');
          if (taskNameEl && data.runningTaskName) {
            taskNameEl.textContent = '🟡 ĐANG CHẠY: ' + data.runningTaskName;
          }

          // Cập nhật Live Logs box an toàn tuyệt đối với textContent
          const logBox = document.getElementById('liveLogsContainer');
          if (logBox && Array.isArray(data.liveTaskLogs)) {
            logBox.textContent = '';
            for (const logItem of data.liveTaskLogs) {
              const row = document.createElement('div');
              const timeSpan = document.createElement('span');
              timeSpan.style.color = 'var(--text-dim)';
              timeSpan.style.marginRight = '6px';
              timeSpan.textContent = typeof logItem === 'object' && logItem.timeDisplay ? logItem.timeDisplay : '';

              const iconSpan = document.createElement('span');
              iconSpan.style.marginRight = '4px';
              iconSpan.textContent = typeof logItem === 'object' && logItem.icon ? logItem.icon : '';

              const msgSpan = document.createElement('span');
              msgSpan.textContent = typeof logItem === 'object' && logItem.message ? logItem.message : String(logItem);

              row.appendChild(timeSpan);
              row.appendChild(iconSpan);
              row.appendChild(msgSpan);
              logBox.appendChild(row);
            }
          }
        } catch {}
      }, 2000);
    } else {
      setTimeout(async () => {
        try {
          const res = await fetch('/api/status');
          if (!res.ok) return;
          const data = await res.json();
          if (data.isRunning) location.reload();
        } catch {}
      }, 15000);
    }
  </script>
</body>
</html>`;
}

// Khởi chạy HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health check tối thiểu (Priority 1: Chỉ trả thông tin cơ bản cho ping monitoring, không lộ dữ liệu tài khoản)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      running: state.isRunning
    }, null, 2));
    return;
  }

  // 2. API lấy trạng thái JSON (Priority 1: Bảo vệ trạng thái tài khoản)
  if (url.pathname === '/api/status') {
    if (AUTH_TOKEN && !verifyAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Yêu cầu không được phép (thiếu hoặc sai token xác thực).' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: state.isRunning,
      runningTask: state.runningTask,
      runningTaskName: state.runningTaskName,
      runningSeconds: state.isRunning && state.runStartTime ? Math.round((Date.now() - state.runStartTime) / 1000) : 0,
      currentRunId: state.currentRunId,
      runTriggerSource: state.runTriggerSource,
      lastUpdated: state.lastUpdated,
      merit: state.merit,
      journal: state.journal,
      liveTaskLogs: state.currentLogs,
      history: state.runHistory
    }, null, 2));
    return;
  }

  // 3. API Dừng tác vụ đang chạy (Priority 1: Bắt buộc POST, Xác thực CSRF hoặc Auth Token)
  if (url.pathname === '/api/stop') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Allow': 'POST' });
      res.end(JSON.stringify({ ok: false, error: 'Phương thức không được hỗ trợ. Bắt buộc dùng POST.' }));
      return;
    }

    if (!verifyAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Yêu cầu không được phép (thiếu hoặc sai token xác thực).' }));
      return;
    }

    if (!state.isRunning) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, stopped: false, message: 'Hiện không có tác vụ nào đang chạy.' }));
      return;
    }

    addWebLog('🛑 Đang tiến hành dừng tác vụ theo yêu cầu từ người dùng...', 'warn', '🛑');
    if (state.activeClient) {
      try {
        state.activeClient.abort('Người dùng đã bấm dừng tác vụ trên Dashboard.');
      } catch (abortErr) {
        log.warn('Lỗi khi gọi client.abort:', abortErr.message);
      }
    }

    setTimeout(() => {
      if (state.isRunning) {
        state.isRunning = false;
        state.runningTask = null;
        state.runningTaskName = null;
        state.activeClient = null;
      }
    }, 1200);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, stopped: true, message: 'Đã gửi lệnh dừng tác vụ thành công.' }));
    return;
  }

  // 4. API Kích hoạt chạy nhiệm vụ (Priority 1: Bắt buộc POST, Xác thực, Validate tham số)
  if (url.pathname === '/api/run' || url.pathname === '/run' || url.pathname === '/cron') {
    // Chỉ chấp nhận POST
    if (req.method !== 'POST') {
      res.writeHead(405, {
        'Content-Type': 'application/json; charset=utf-8',
        'Allow': 'POST'
      });
      res.end(JSON.stringify({
        ok: false,
        error: 'Phương thức không được hỗ trợ. Bắt buộc dùng POST để tạo tác vụ.'
      }));
      return;
    }

    // Kiểm tra xác thực (CSRF hoặc AUTH_TOKEN)
    if (!verifyAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        error: 'Yêu cầu không được phép (thiếu hoặc sai token xác thực).'
      }));
      return;
    }

    // Đọc body JSON nếu có
    let bodyData = {};
    if (req.headers['content-type']?.includes('application/json')) {
      try {
        const buffers = [];
        for await (const chunk of req) buffers.push(chunk);
        const rawBody = Buffer.concat(buffers).toString('utf-8');
        if (rawBody.trim()) {
          bodyData = JSON.parse(rawBody);
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Dữ liệu body JSON không hợp lệ.' }));
        return;
      }
    }

    const runOptions = {};
    const task = String(bodyData.task || url.searchParams.get('task') || 'all').trim();
    const validTaskIds = ['all', ...TASKS_CATALOG.map(t => t.id)];
    if (!validTaskIds.includes(task)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: `Tác vụ không hợp lệ: "${task}".` }));
      return;
    }
    runOptions.task = task;

    if (bodyData.count !== undefined && bodyData.count !== null) {
      const c = parseInt(bodyData.count, 10);
      if (Number.isInteger(c) && c > 0 && c <= 1080) {
        runOptions.count = c;
      }
    }

    if (bodyData.bowsCount !== undefined && bodyData.bowsCount !== null) {
      const b = parseInt(bodyData.bowsCount, 10);
      if (Number.isInteger(b) && b > 0 && b <= 1000) {
        runOptions.bowsCount = b;
      }
    }

    if (bodyData.beadsCount !== undefined && bodyData.beadsCount !== null) {
      const bd = parseInt(bodyData.beadsCount, 10);
      if (Number.isInteger(bd) && bd > 0 && bd <= 1080) {
        runOptions.beadsCount = bd;
      }
    }

    // Kiểm tra và validate tham số meditate
    const medRaw = bodyData.meditate ?? (url.searchParams.has('meditate') ? url.searchParams.get('meditate') : null);
    if (medRaw !== null && medRaw !== undefined) {
      const parsedMed = Number(medRaw);
      if (!Number.isInteger(parsedMed) || parsedMed < 60 || parsedMed > 7200) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: 'Thời gian thiền không hợp lệ. Phải là số nguyên từ 60 đến 7200 giây (tối đa 2 giờ).'
        }));
        return;
      }
      runOptions.meditateSeconds = parsedMed;
    }

    // Nếu đang chạy dở, trả về HTTP 409 Conflict
    if (state.isRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, running: true, message: 'Chu trình nhiệm vụ hiện đang được thực hiện.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      running: false,
      message: `Đã kích hoạt nhiệm vụ [${task}] thành công!`,
      options: runOptions
    }));

    // Chạy ngầm trong background
    executeRoutine(`API Trigger (${task})`, runOptions).catch(console.error);
    return;
  }

  // 4. Trang Dashboard chính (GET)
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Allow': 'GET' });
      res.end('Method Not Allowed');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderDashboardHTML());
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy đường dẫn.');
});

server.listen(PORT, HOST, async () => {
  log.temple('🚀', `Server Dashboard đang lắng nghe tại: http://${HOST}:${PORT}`);
  log.info(`Sẵn sàng phục vụ Render Cloud Web Service trên cổng ${PORT}`);

  // Nạp dữ liệu ban đầu
  await refreshAccountData();
  // Khởi động lịch trình 00:05 sáng
  startDailyScheduler();
});
