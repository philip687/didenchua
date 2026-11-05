import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { runAllQuests } from './src/tasks/all.js';
import { DiDenChuaClient, CALLIGRAPHY_WORDS } from './src/client.js';
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

// Danh mục toàn bộ các nhiệm vụ & công đức chùa chia theo 3 nhóm rõ ràng:
// 1. group: 'daily' (Nhiệm vụ hàng ngày tương ứng trực tiếp me.quests)
// 2. group: 'milestone' (Mốc tu tập & thành tựu vĩnh viễn theo dõi qua sổ thành tựu journal)
// 3. group: 'extra' (Ăn thêm điểm công đức, chăm sóc vườn sen & thiền tĩnh tâm)
export const TASKS_CATALOG = [
  // --- TẦNG 1: NHIỆM VỤ HÀNG NGÀY (DAILY QUESTS) ---
  {
    id: 'ngoi-daily',
    group: 'daily',
    questId: 'ngoi',
    title: 'Ngồi Tĩnh 5 Phút',
    desc: 'Ngồi thiền tĩnh tâm tại Vườn thiền hoàn thành nhiệm vụ ngày (5 phút)',
    icon: '🧘',
    reward: '+20 điểm',
    badge: 'Nhiệm vụ ngày',
    hasDuration: true
  },
  {
    id: 'bell',
    group: 'daily',
    questId: 'chuong',
    title: 'Thỉnh Chuông Bát Nhã',
    desc: 'Đến gác chuông thỉnh một tiếng đại hồng chung ngân vang',
    icon: '🔔',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'vow',
    group: 'daily',
    questId: 'nguyen',
    title: 'Gửi Lời Nguyện Chung',
    desc: 'Gửi một lời nguyện cầu bình an, an lạc tới cả chùa',
    icon: '🙏',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'incense',
    group: 'daily',
    questId: 'huong',
    title: 'Dâng Hương Chánh Điện',
    desc: 'Thắp nén tâm hương thành kính tại lư hương chánh điện (nhập số nén)',
    icon: '🪔',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    hasCount: true,
    defaultCount: 1,
    countOptions: [
      { value: 1, label: '1 nén' },
      { value: 3, label: '3 nén' },
      { value: 5, label: '5 nén' },
      { value: 10, label: '10 nén' }
    ]
  },
  {
    id: 'lay-daily',
    group: 'daily',
    questId: 'lay',
    title: 'Lạy Phật Trang Nghiêm',
    desc: 'Cúi lạy Phật sám hối đủ số lượng nhiệm vụ hôm nay (hoặc 1 lạy nếu không có quest)',
    icon: '🙇',
    reward: '+15-30đ',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'tung',
    group: 'daily',
    questId: 'tung',
    title: 'Gõ Mõ Tụng Kinh',
    desc: 'Đến Chánh điện gõ mõ tụng kinh hoàn thành nhiệm vụ ngày (108 tiếng)',
    icon: '🪵',
    reward: '+30 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'tuoi',
    group: 'daily',
    questId: 'tuoi',
    title: 'Tưới Hoa Vườn Chùa',
    desc: 'Tưới nước luống hoa dâng Phật và tưới giúp đồng tu',
    icon: '🪷',
    reward: '+20 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'chu',
    group: 'daily',
    questId: 'chu',
    title: 'Xin Chữ Thầy Đồ',
    desc: 'Đến lều Thầy đồ xin chữ thư pháp đầu ngày (chọn chữ tùy ý)',
    icon: '✍️',
    reward: '+25 điểm',
    badge: 'Nhiệm vụ ngày',
    hasWish: true,
    defaultWish: 'binh-an',
    wishOptions: CALLIGRAPHY_WORDS
  },
  {
    id: 'greet',
    group: 'daily',
    questId: 'chao',
    title: 'Chắp Tay Chào Đồng Tu',
    desc: 'Chắp tay trang nghiêm chào một bạn đồng tu đang có mặt tại chùa',
    icon: '🤝',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'lantern-daily',
    group: 'daily',
    questId: 'den',
    title: 'Thả Hoa Đăng Sen',
    desc: 'Thả hoa đăng sen cầu nguyện trôi trên hồ chùa (nhập số ngọn)',
    icon: '🏮',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày',
    hasCount: true,
    defaultCount: 1,
    countOptions: [
      { value: 1, label: '1 ngọn' },
      { value: 3, label: '3 ngọn' },
      { value: 5, label: '5 ngọn' }
    ]
  },
  {
    id: 'chores-daily',
    group: 'daily',
    questId: 'viec',
    title: 'Làm Việc Chùa & Quét Sân',
    desc: 'Quét lá sân chùa, cho cá ăn, thắp đèn dầu, vuốt ve mèo chùa',
    icon: '🧹',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'xam',
    group: 'daily',
    questId: 'xam',
    title: 'Gieo Quẻ Xăm May Mắn',
    desc: 'Lắc ống xăm may mắn đầu ngày cầu bình an cát tường',
    icon: '📜',
    reward: '+10 điểm',
    badge: 'Đầu ngày'
  },
  {
    id: 'claim',
    group: 'daily',
    questId: 'claim',
    title: 'Thu Nhận Tất Cả Phần Thưởng',
    desc: 'Kiểm tra và gửi yêu cầu thu nhận tất cả phần thưởng nhiệm vụ hoàn thành',
    icon: '🎁',
    reward: 'Tất cả quà',
    badge: 'Thu hoạch'
  },

  // --- TẦNG 2: MỐC TU TẬP & THÀNH TỰU VĨNH VIỄN (MILESTONES) ---
  {
    id: 'lay',
    group: 'milestone',
    title: 'Lạy Phật Sám Hối',
    desc: 'Trang nghiêm cúi lạy Phật sám hối (nhập số lạy tùy ý hoặc chọn gợi ý)',
    icon: '🙇',
    reward: 'Mốc lạy',
    badge: 'Thành tựu',
    hasCount: true,
    defaultCount: 18,
    countOptions: [
      { value: 18, label: '18 lạy (Khởi tâm)' },
      { value: 27, label: '27 lạy (Quest ngày)' },
      { value: 36, label: '36 lạy (Tinh tấn)' },
      { value: 108, label: '108 lạy (Trăm lạy 🏆)' },
      { value: 300, label: '300 lạy' },
      { value: 1000, label: '1.000 lạy (Ngàn lạy 🏆)' }
    ]
  },
  {
    id: 'beads',
    group: 'milestone',
    title: 'Lăn Tràng Hạt Niệm Phật',
    desc: 'Lăn tràng hạt niệm Phật (1 chuỗi = 108 hạt, mốc danh hiệu: 100 chuỗi)',
    icon: '📿',
    reward: 'Niệm Phật',
    badge: 'Chuỗi hạt',
    hasCount: true,
    defaultCount: 108,
    countOptions: [
      { value: 54, label: '54 hạt (Nửa chuỗi)' },
      { value: 108, label: '108 hạt (1 chuỗi tròn 🏆)' },
      { value: 216, label: '216 hạt (2 chuỗi)' },
      { value: 540, label: '540 hạt (5 chuỗi)' },
      { value: 1080, label: '1.080 hạt (10 chuỗi)' },
      { value: 3240, label: '3.240 hạt (30 chuỗi - Cây tre trăm đốt 🏆)' },
      { value: 5400, label: '5.400 hạt (50 chuỗi)' },
      { value: 10800, label: '10.800 hạt (100 chuỗi - Trăm chuỗi hạt 🏆)' }
    ]
  },
  {
    id: 'farm-bows-beads',
    group: 'milestone',
    title: 'Cày Tự Động: Chuỗi Hạt & Lạy Phật',
    desc: 'Chạy tự động kết hợp cả Lạy Phật và Lăn Tràng Hạt (nhập số lượng tùy ý)',
    icon: '📿',
    reward: 'Thành tựu',
    badge: 'Cày tự động',
    isCombo: true
  },
  {
    id: 'mo',
    group: 'milestone',
    title: 'Gõ Mõ Tụng Kinh',
    desc: 'Gõ mõ theo nhịp thong thả tự nhiên (nhập số tiếng tùy ý)',
    icon: '🪵',
    reward: 'Tụng kinh',
    badge: 'Tu tập',
    hasCount: true,
    defaultCount: 15,
    countOptions: [
      { value: 15, label: '15 tiếng' },
      { value: 30, label: '30 tiếng' },
      { value: 60, label: '60 tiếng' },
      { value: 108, label: '108 tiếng (Khóa lễ)' }
    ]
  },
  {
    id: 'quet',
    group: 'milestone',
    title: 'Quét Lá Sân Chùa (Cày Sân)',
    desc: 'Công quả quét dọn lá rụng nhiều lượt giữ gìn khuôn viên thanh tịnh (nhập số lần)',
    icon: '🧹',
    reward: 'Công quả',
    badge: 'Công quả',
    hasCount: true,
    defaultCount: 5,
    countOptions: [
      { value: 1, label: '1 lần' },
      { value: 5, label: '5 lần' },
      { value: 10, label: '10 lần' },
      { value: 20, label: '20 lần' }
    ]
  },
  {
    id: 'visit',
    group: 'milestone',
    title: 'Khám Phá Toàn Bộ Chùa (10 Khu)',
    desc: 'Đi dạo thăm khắp 10 khu vực trong chùa (cày danh hiệu "Thăm khắp chùa")',
    icon: '🚶',
    reward: 'Thành tựu',
    badge: 'Khám phá'
  },

  // --- TẦNG 3 & 4: ĂN THÊM ĐIỂM, VƯỜN SEN & TĨNH TÂM (EXTRA & MEDITATION) ---
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
    desc: 'Tùy hỷ công đức những ngọn hoa đăng lung linh trên hồ sen (nhập số ngọn)',
    icon: '🏮',
    reward: '+Tùy hỷ',
    badge: 'Ăn thêm điểm',
    hasCount: true,
    defaultCount: 5,
    countOptions: [
      { value: 3, label: '3 ngọn' },
      { value: 5, label: '5 ngọn' },
      { value: 10, label: '10 ngọn' }
    ]
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
    desc: 'Xin chữ thư pháp từ ông đồ và hoàn tất khóa lễ tụng kinh',
    icon: '✍️',
    reward: 'Thư pháp',
    badge: 'Bí ẩn chùa',
    hasWish: true,
    defaultWish: 'binh-an',
    wishOptions: CALLIGRAPHY_WORDS
  },
  {
    id: 'meditate',
    group: 'extra',
    title: 'Ngồi Thiền Tĩnh Tâm',
    desc: 'Đến Vườn thiền tọa thiền tĩnh tâm tại chỗ đất (nhập số phút 1-120 phút)',
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
  isStopping: false,
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
    if (j.name) client.merit.me.name = j.name;
    if (j.user) client.merit.me.user = j.user;
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

// Hàm thực thi chu trình tự động hoặc nhiệm vụ riêng lẻ (Định danh Run ID & Xác minh Snapshot trung thực)
async function executeRoutine(triggerSource = 'Manual / Web', runOptions = {}) {
  // Ngăn chặn race condition: từ chối nếu đang chạy hoặc đang trong quá trình dừng
  if (state.isRunning || state.isStopping) {
    return { ok: false, message: 'Đang có một tiến trình nhiệm vụ đang chạy hoặc đang trong quá trình dừng an toàn, vui lòng đợi.' };
  }

  const taskId = runOptions.task || 'all';
  const taskItem = TASKS_CATALOG.find(t => t.id === taskId);
  const taskTitle = taskItem ? taskItem.title : (taskId === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : taskId);

  const runId = 'run-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  state.isRunning = true;
  state.isStopping = false;
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

    // 1. Chụp baseline snapshot trước khi chạy để đối soát trung thực
    if (!state.merit?.me || !state.journal) {
      await refreshAccountData();
    }
    const preMeritTotal = Number(state.merit?.me?.total ?? 0);
    const preBows = Number(state.journal?.bows ?? 0);
    const preBeads = Number(state.journal?.beads ?? 0);
    const preIncense = Number(state.journal?.incense ?? 0);
    const preLanterns = Number(state.journal?.lanterns ?? 0);
    const preSitMin = Number(state.journal?.sitMin ?? 0);
    const preVisited = Number(state.journal?.visited ?? 0);
    const preQuests = Array.isArray(state.merit?.me?.quests) ? JSON.parse(JSON.stringify(state.merit.me.quests)) : [];
    const preClaimedCount = preQuests.filter(q => q.claimed).length;

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
        case 'ngoi-daily':
          const activeNgoi = (client.merit?.me?.quests || []).find(q => q.id === 'ngoi' || q.id.startsWith('ngoi'));
          const needNgoiSecs = activeNgoi && !activeNgoi.claimed ? Math.max(300, (activeNgoi.need - (activeNgoi.have || 0)) * 60) : 300;
          await client.doMeditate(runOptions.meditateSeconds || needNgoiSecs);
          break;
        case 'bell':
          await client.doBell();
          break;
        case 'vow':
          await client.doVow(runOptions.text || 'Cầu cho muôn người bình an, thân tâm thường an lạc, vạn sự hanh thông');
          break;
        case 'incense':
          await client.doIncense(runOptions.count || 1);
          break;
        case 'lay-daily':
          const activeLay = (client.merit?.me?.quests || []).find(q => q.id === 'lay' || q.id.startsWith('lay'));
          const needLay = activeLay && !activeLay.claimed ? Math.max(1, activeLay.need - (activeLay.have || 0)) : 1;
          await client.doLay(needLay);
          break;
        case 'tung':
          const activeTung = (client.merit?.me?.quests || []).find(q => q.id === 'tung');
          const needTung = activeTung && !activeTung.claimed ? Math.max(108, activeTung.need - (activeTung.have || 0)) : 108;
          await client.doMo(needTung);
          break;
        case 'tuoi':
          await client.doGarden({ autoWaterOthers: true });
          break;
        case 'chu':
          await client.doXinChu(runOptions.wish || client.config.calligraphyWish || 'binh-an');
          break;
        case 'lay':
          const bowsCount = runOptions.count || 18;
          await client.doLay(bowsCount);
          break;
        case 'greet':
          await client.doGreet();
          break;
        case 'lantern-daily':
          await client.doLantern(runOptions.text || 'Cầu cho muôn người bình an, vạn sự hanh thông', 'vang', runOptions.count || 1);
          break;
        case 'chores-daily':
          await client.doQuetLa(1);
          client.send({ t: 'viec', k: 'ca' });
          client.send({ t: 'lamp' });
          await client.doPet();
          break;
        case 'quet':
          await client.doQuetLa(runOptions.count || 5);
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
          await client.doTuyHy(runOptions.count || 5);
          break;
        case 'qa-incense':
          await client.doQaIncense();
          break;
        case 'secrets':
          await client.doXinChu(runOptions.wish || client.config.calligraphyWish || 'binh-an');
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
      if (['bell', 'vow', 'incense', 'lay-daily', 'lay', 'greet', 'lantern-daily', 'chores-daily', 'xam', 'chores', 'quet', 'farm-bows-beads', 'tung', 'tuoi', 'chu', 'garden', 'tuyhy', 'secrets', 'meditate', 'ngoi-daily'].includes(taskId)) {
        await client.sleep(1000);
        await client.claimAllQuests();
      }

      client.close();
    }

    // 2. Lấy lại dữ liệu mới nhất từ máy chủ chùa sau khi thực hiện
    const snapshotAvailable = await refreshAccountData();

    // 3. Đối soát trung thực (Snapshot Verification)
    let verificationStatus = 'unverified';
    let verificationDetail = '';

    if (!snapshotAvailable) {
      verificationStatus = 'unverified';
      verificationDetail = 'Không thể đồng bộ snapshot mới từ máy chủ chùa sau khi thực hiện tác vụ.';
    } else {
      const postMeritTotal = Number(state.merit?.me?.total ?? 0);
      const postBows = Number(state.journal?.bows ?? 0);
      const postBeads = Number(state.journal?.beads ?? 0);
      const postIncense = Number(state.journal?.incense ?? 0);
      const postLanterns = Number(state.journal?.lanterns ?? 0);
      const postSitMin = Number(state.journal?.sitMin ?? 0);
      const postVisited = Number(state.journal?.visited ?? 0);
      const postQuests = Array.isArray(state.merit?.me?.quests) ? state.merit.me.quests : [];
      const postClaimedCount = postQuests.filter(q => q.claimed).length;

      if (taskId === 'all') {
        if (postClaimedCount > preClaimedCount || postMeritTotal > preMeritTotal || postBows > preBows || postBeads > preBeads) {
          const allTodayClaimed = postQuests.length > 0 && postQuests.every(q => q.claimed);
          verificationStatus = allTodayClaimed ? 'verified' : 'partial';
          verificationDetail = allTodayClaimed
            ? 'Toàn bộ nhiệm vụ ngày đã được máy chủ chùa xác nhận nhận thưởng hoàn tất.'
            : `Đã xác nhận ghi nhận một phần (+${postMeritTotal - preMeritTotal} công đức).`;
        } else {
          verificationStatus = 'unverified';
          verificationDetail = 'Chưa ghi nhận biến động công đức/nhiệm vụ trong snapshot sau chu trình.';
        }
      } else if (taskId === 'lay' || taskId === 'lay-daily') {
        if (postBows > preBows || postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận số lạy: ${preBows} -> ${postBows} lạy.`;
        } else {
          verificationDetail = 'Số lạy chưa thay đổi trong snapshot máy chủ.';
        }
      } else if (taskId === 'beads') {
        if (postBeads > preBeads || postMeritTotal > preMeritTotal) {
          const postRounds = Math.floor(postBeads / 108);
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận: ${preBeads} -> ${postBeads} hạt (${postRounds}/100 chuỗi).`;
        } else {
          verificationDetail = 'Số hạt niệm chưa thay đổi trong snapshot máy chủ.';
        }
      } else if (taskId === 'farm-bows-beads') {
        if (postBows > preBows || postBeads > preBeads || postMeritTotal > preMeritTotal) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ xác nhận: ${postBows} lạy (+${postBows - preBows}), ${postBeads} hạt (+${postBeads - preBeads}).`;
        } else {
          verificationDetail = 'Chỉ số lạy và hạt chưa biến động trong snapshot.';
        }
      } else if (taskId === 'incense') {
        if (postIncense > preIncense || postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận nén hương: ${preIncense} -> ${postIncense}.`;
        } else {
          verificationDetail = 'Chỉ số dâng hương chưa biến động trong snapshot.';
        }
      } else if (taskId === 'lantern-daily') {
        if (postLanterns > preLanterns || postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận hoa đăng: ${preLanterns} -> ${postLanterns}.`;
        } else {
          verificationDetail = 'Chỉ số hoa đăng chưa biến động trong snapshot.';
        }
      } else if (taskId === 'visit') {
        if (postVisited > preVisited || postMeritTotal > preMeritTotal) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận số khu khám phá: ${preVisited} -> ${postVisited}.`;
        } else {
          verificationDetail = 'Chỉ số khám phá khu vực chưa biến động trong snapshot.';
        }
      } else if (taskId === 'meditate' || taskId === 'ngoi-daily') {
        if (postSitMin > preSitMin || postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận thời gian thiền: ${preSitMin} -> ${postSitMin} phút.`;
        } else {
          verificationDetail = 'Thời gian thiền chưa biến động trong snapshot.';
        }
      } else if (taskItem?.questId) {
        const preQ = preQuests.find(q => q.id === taskItem.questId);
        const postQ = postQuests.find(q => q.id === taskItem.questId);
        if ((postQ?.claimed && !preQ?.claimed) || (postQ && preQ && postQ.have > preQ.have) || postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ đã ghi nhận hoàn thành nhiệm vụ [${taskItem.title}].`;
        } else {
          verificationDetail = `Chưa thấy thay đổi tiến độ nhiệm vụ [${taskItem.title}] trong snapshot.`;
        }
      } else {
        if (postMeritTotal > preMeritTotal || postClaimedCount > preClaimedCount) {
          verificationStatus = 'verified';
          verificationDetail = `Máy chủ xác nhận tăng công đức (+${postMeritTotal - preMeritTotal} điểm).`;
        } else {
          verificationDetail = 'Chưa ghi nhận biến động điểm công đức sau tác vụ.';
        }
      }
    }

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const titlesComparisonAvailable = Array.isArray(initJ?.titles) && snapshotAvailable && Array.isArray(state.journal?.titles);
    const newlyUnlocked = titlesComparisonAvailable
      ? state.journal.titles.filter(t => t.got && !prevTitles.has(t.name))
      : [];

    runStatus = verificationStatus === 'verified'
      ? 'success'
      : (verificationStatus === 'partial' ? 'partial' : 'unverified');
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
      verificationStatus,
      verificationDetail,
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

    addWebLog(`✅ [${runId}] Đã hoàn tất [${taskTitle}] (${runStatus}: ${verificationDetail}) sau ${durationSec}s.`, runStatus === 'success' ? 'success' : 'warn', runStatus === 'success' ? '✅' : '⚠️');

    // Gửi thông báo Telegram/Discord nếu cấu hình (không làm đứt chu trình nếu notify lỗi)
    try {
      await notifyRunResult({
        runId,
        source: triggerSource,
        task: taskId,
        taskTitle,
        status: runStatus,
        verificationStatus,
        verificationDetail,
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
      verificationStatus: 'failed',
      verificationDetail: safeErrorMessage,
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
    // Khóa chỉ được giải phóng trong finally để tuyệt đối chống race condition!
    state.isRunning = false;
    state.isStopping = false;
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
    if (isSchedulerRunning || state.isRunning || state.isStopping) return;

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

// Helper lấy nhãn trạng thái nhiệm vụ hàng ngày & tiến độ mốc thành tựu vĩnh viễn
function getTaskQuestBadge(task, quests = [], journal = {}) {
  if (task.group === 'daily') {
    if (task.id === 'claim') return '';
    if (!Array.isArray(quests) || quests.length === 0) {
      return '<span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-dim);">Đang tải quest...</span>';
    }
    let q = quests.find(item => item.id === task.questId);
    if (!q && task.questId === 'lay') {
      q = quests.find(item => item.id.startsWith('lay'));
    }
    if (!q && task.questId === 'viec') {
      q = quests.find(item => item.id === 'quet' || item.id === 'viec');
    }
    if (!q && task.questId === 'ngoi') {
      q = quests.find(item => item.id.startsWith('ngoi'));
    }
    if (!q) {
      return '<span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-dim);">Hôm nay không có quest này</span>';
    }
    if (q.claimed) {
      return '<span class="badge badge-done">✅ Đã nhận</span>';
    }
    if (q.have >= q.need) {
      return '<span class="badge badge-ready">🎁 Chờ nhận</span>';
    }
    return `<span class="badge badge-wait">⏳ ${escapeHTML(q.have)}/${escapeHTML(q.need)}</span>`;
  }

  if (task.group === 'milestone') {
    if (task.id === 'lay') {
      const bows = journal?.bows;
      return bows !== undefined && bows !== null
        ? `<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(bows)}/108 lạy ${bows >= 108 ? '🏆' : ''}</span>`
        : '';
    }
    if (task.id === 'beads') {
      const beads = journal?.beads;
      const rounds = journal?.rounds || (beads ? Math.floor(beads / 108) : 0);
      return beads !== undefined && beads !== null
        ? `<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(rounds)}/100 chuỗi (${escapeHTML(beads)} hạt) ${rounds >= 100 ? '🏆' : ''}</span>`
        : '';
    }
    if (task.id === 'visit') {
      const visited = journal?.visited;
      const zones = journal?.zones || 10;
      return visited !== undefined && visited !== null
        ? `<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(visited)}/${escapeHTML(zones)} khu</span>`
        : '';
    }
  }

  if (task.id === 'meditate') {
    const sitMin = journal?.sitMin;
    return sitMin !== undefined && sitMin !== null
      ? `<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(sitMin)}/60 phút</span>`
      : '';
  }

  return '';
}

// Tạo mã HTML Dashboard an toàn chống XSS (Priority 2 & SYSTEM_LOG_REPORT)
function renderDashboardHTML() {
  const me = state.merit?.me || {};
  const j = state.journal || {};
  const displayName = j.name || me.name || process.env.NAME || 'Phật Tử';
  const rawUser = (j.user && j.user !== 'null') ? j.user : ((me.user && me.user !== 'null') ? me.user : null);
  const userTag = rawUser ? `<span>(@${escapeHTML(rawUser)})</span>` : '';

  // Dữ liệu thiếu phải hiện là thiếu, không dùng giá trị mẫu làm báo cáo thật.
  const reportValue = value => value === null || value === undefined ? 'Chưa có dữ liệu' : escapeHTML(value);
  const currentTotal = me.total !== null && me.total !== undefined ? me.total : j.merit;
  const nextTarget = me.next !== null && me.next !== undefined ? me.next : j.next;
  const nextLevelPoints = nextTarget !== null && nextTarget !== undefined && currentTotal !== null && currentTotal !== undefined
    && Number.isFinite(Number(nextTarget)) && Number.isFinite(Number(currentTotal))
    ? Number(nextTarget) - Number(currentTotal)
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
    const isPartial = h.status === 'partial';
    const isUnverified = h.status === 'unverified';
    const isStopped = h.status === 'stopped';
    const statusClass = isSuccess ? 'success' : (isPartial || isUnverified ? 'partial' : (isStopped ? 'stopped' : 'failed'));
    const statusLabel = isSuccess
      ? '✅ Đã xác nhận'
      : (isPartial ? '⚠️ Hoàn tất một phần' : (isUnverified ? '⏳ Chưa xác nhận biến động' : (isStopped ? '🛑 Đã dừng theo yêu cầu' : '❌ Thất bại')));
    const taskBadge = h.taskTitle ? ` [${escapeHTML(h.taskTitle)}]` : '';
    const detailMsg = h.verificationDetail ? ` · <span style="color:var(--text-dim);">${escapeHTML(h.verificationDetail)}</span>` : '';
    return `
      <div class="history-item ${statusClass}">
        <div>
          <b>${statusLabel}</b>${taskBadge} · <span>${escapeHTML(h.source)}</span>${detailMsg}
          <small class="time">Bắt đầu ${escapeHTML(h.startTime || 'chưa rõ')} · Kết thúc ${escapeHTML(h.timestamp || h.finishedAt || 'chưa rõ')} UTC · ${escapeHTML(h.durationSec)}s · ID: ${escapeHTML(h.id)}</small>
        </div>
        <div>${h.status === 'failed' || isStopped ? `<span class="err">${escapeHTML(h.error || 'Đã dừng')}</span>` : `Snapshot: ${escapeHTML(h.snapshotStatus || 'không rõ')} · Hôm nay: ${reportValue(h.todayMerit)}đ · Tổng: ${reportValue(h.totalMerit)}đ`}</div>
      </div>
    `;
  }).join('') || '<p class="empty">Chưa có lịch sử chạy nào trong phiên này (Bộ nhớ tạm lưu tối đa 15 lượt).</p>';

  const logsHTML = state.currentLogs.map(l => `<div><span style="color:var(--text-dim); margin-right:6px;">${escapeHTML(l.timeDisplay)}</span><span style="margin-right:4px;">${escapeHTML(l.icon || 'ℹ️')}</span>${escapeHTML(l.message)}</div>`).join('') || '<div>Hệ thống sẵn sàng. Đang chờ tác vụ…</div>';
  const isRunning = state.isRunning;
  const isStopping = state.isStopping;
  const currentRunningTaskName = state.runningTaskName || (state.runningTask === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : (state.runningTask ? `Nhiệm vụ [${state.runningTask}]` : 'Nhiệm vụ tự động'));
  const elapsedSec = isRunning && state.runStartTime ? Math.round((Date.now() - state.runStartTime) / 1000) : 0;

  const renderTaskRow = (t) => {
    const questBadge = getTaskQuestBadge(t, me.quests, j);
    const isThisRunning = isRunning && state.runningTask === t.id;
    const isAnyRunning = isRunning || isStopping;
    const isThisStopping = isStopping && isThisRunning;
    const stopActive = isRunning && !isStopping && (isThisRunning || state.runningTask === 'all');

    let inputControl = '';
    if (t.isCombo) {
      inputControl = `
        <div style="display:flex; flex-direction:column; gap:5px; margin-right:4px;">
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="font-size:11px; color:var(--gold); min-width:28px;">Lạy:</span>
            <input type="number" id="combo_bows" value="18" min="0" max="2000"
              style="width:58px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 6px; border-radius:6px; font-size:12px; text-align:center; font-weight:600;"
              placeholder="Số lạy"
              title="Nhập số lạy tùy ý"
              ${isAnyRunning ? 'disabled' : ''}>
            <select onchange="if(this.value){ document.getElementById('combo_bows').value = this.value; }"
              style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 4px; border-radius:6px; font-size:11px; cursor:pointer;"
              ${isAnyRunning ? 'disabled' : ''}>
              <option value="" disabled selected>Gợi ý ▼</option>
              <option value="18">18 lạy</option>
              <option value="27">27 lạy</option>
              <option value="36">36 lạy</option>
              <option value="108">108 lạy 🏆</option>
              <option value="300">300 lạy</option>
              <option value="1000">1.000 lạy</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:5px;">
            <span style="font-size:11px; color:var(--gold); min-width:28px;">Hạt:</span>
            <input type="number" id="combo_beads" value="108" min="0" max="20000"
              style="width:58px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 6px; border-radius:6px; font-size:12px; text-align:center; font-weight:600;"
              placeholder="Số hạt"
              title="Nhập số hạt niệm tùy ý (1 chuỗi = 108 hạt)"
              ${isAnyRunning ? 'disabled' : ''}>
            <select onchange="if(this.value){ document.getElementById('combo_beads').value = this.value; }"
              style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:4px 4px; border-radius:6px; font-size:11px; cursor:pointer;"
              ${isAnyRunning ? 'disabled' : ''}>
              <option value="" disabled selected>Gợi ý ▼</option>
              <option value="54">54 hạt (Nửa chuỗi)</option>
              <option value="108">108 hạt (1 chuỗi 🏆)</option>
              <option value="216">216 hạt (2 chuỗi)</option>
              <option value="540">540 hạt (5 chuỗi)</option>
              <option value="1080">1.080 hạt (10 chuỗi)</option>
              <option value="3240">3.240 hạt (30 chuỗi 🏆)</option>
              <option value="5400">5.400 hạt (50 chuỗi)</option>
              <option value="10800">10.800 hạt (100 chuỗi 🏆)</option>
            </select>
          </div>
        </div>
      `;
    } else if (t.hasCount) {
      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <input type="number" id="count_${escapeHTML(t.id)}" value="${t.defaultCount || 1}" min="1" max="20000"
            style="width:58px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; text-align:center; font-weight:600;"
            placeholder="Số lượng"
            title="Nhập số lượng tùy ý"
            ${isAnyRunning ? 'disabled' : ''}>
          <select onchange="if(this.value){ document.getElementById('count_${escapeHTML(t.id)}').value = this.value; }"
            style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; cursor:pointer; max-width:125px;"
            ${isAnyRunning ? 'disabled' : ''}>
            <option value="" disabled selected>Gợi ý ▼</option>
            ${(t.countOptions || []).map(opt => `<option value="${opt.value}">${escapeHTML(opt.label)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (t.hasDuration) {
      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <input type="number" id="duration_min_${escapeHTML(t.id)}" value="5" min="1" max="120"
            style="width:50px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; text-align:center; font-weight:600;"
            placeholder="Phút"
            title="Nhập số phút ngồi thiền"
            ${isAnyRunning ? 'disabled' : ''}>
          <span style="font-size:11px; color:var(--text-dim); margin-right:2px;">phút</span>
          <select onchange="if(this.value){ document.getElementById('duration_min_${escapeHTML(t.id)}').value = this.value; }"
            style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; cursor:pointer;"
            ${isAnyRunning ? 'disabled' : ''}>
            <option value="" disabled selected>Gợi ý ▼</option>
            <option value="5">5 phút</option>
            <option value="15">15 phút</option>
            <option value="30">30 phút</option>
            <option value="60">60 phút</option>
          </select>
        </div>
      `;
    } else if (t.hasWish) {
      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <select id="wish_${escapeHTML(t.id)}"
            style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 8px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:600; max-width:155px;"
            title="Chọn chữ thư pháp muốn xin từ Thầy đồ"
            ${isAnyRunning ? 'disabled' : ''}>
            ${(t.wishOptions || []).map(opt => `<option value="${opt.id}" ${opt.id === (t.defaultWish || 'binh-an') ? 'selected' : ''}>${escapeHTML(opt.text)} (${escapeHTML(opt.wish)})</option>`).join('')}
          </select>
        </div>
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
            ${isThisStopping ? '🛑 Đang dừng…' : (isThisRunning ? '⏳ Đang chạy…' : '⚡ Chạy')}
          </button>
          <button class="btn-task btn-stop" onclick="stopTask()" ${stopActive ? '' : 'disabled'}>
            🛑 Dừng
          </button>
        </div>
      </div>
    `;
  };

  const dailyTasksHTML = TASKS_CATALOG.filter(t => t.group === 'daily').map(renderTaskRow).join('');
  const milestoneTasksHTML = TASKS_CATALOG.filter(t => t.group === 'milestone').map(renderTaskRow).join('');
  const extraTasksHTML = TASKS_CATALOG.filter(t => t.group === 'extra').map(renderTaskRow).join('');

  // Khối thông báo trạng thái & Log trực tiếp khi đang làm nhiệm vụ
  const bannerBorderColor = isStopping ? '#e06c75' : 'var(--gold)';
  const bannerTitle = isStopping
    ? `🛑 ĐANG DỪNG AN TOÀN: ${escapeHTML(currentRunningTaskName)} (Đang ngắt kết nối an toàn...)`
    : `🟡 ĐANG CHẠY: ${escapeHTML(currentRunningTaskName)}`;

  const runningBannerHTML = isRunning ? `
    <div class="card live-task-card" style="border: 2px solid ${bannerBorderColor}; background: #1a140f; box-shadow: 0 0 25px rgba(233,194,122,0.25); margin-bottom: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h2 id="runningTaskTitle" style="color:${isStopping ? '#e06c75' : 'var(--gold)'}; font-size:16px; margin:0; border:none; padding:0; display:flex; align-items:center; gap:8px;">
          <span class="pulse-dot" style="${isStopping ? 'background:#e06c75;' : ''}"></span> ${bannerTitle}
        </h2>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span id="elapsedTimer" style="font-size:13px; color:#ffd98d; font-family:monospace; background:rgba(0,0,0,0.4); padding:5px 10px; border-radius:6px; border:1px solid var(--card-border);">
            ⏱️ Đã chạy: ${escapeHTML(elapsedSec)}s
          </span>
          <button class="btn" id="stopMainBtn" onclick="stopTask()" style="background:#e06c75; color:#fff; padding:6px 14px; font-size:12px; border-radius:8px; border:none; cursor:pointer; font-weight:600; display:flex; align-items:center; gap:6px;" ${isStopping ? 'disabled' : ''}>
            ${isStopping ? '⏳ Đang Dừng An Toàn…' : '🛑 Dừng Tác Vụ Ngay'}
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
    .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    button.btn { background: var(--gold); color: #1c150e; border: none; padding: 10px 18px; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; transition: 0.2s; }
    button.btn:hover:not(:disabled) { background: #ffd98d; transform: translateY(-1px); }
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
    .task-actions input[type="number"]:focus,
    .task-actions select:focus {
      border-color: var(--gold) !important;
      outline: none;
      box-shadow: 0 0 6px rgba(233, 194, 122, 0.3);
    }

    /* Giao diện đóng mở (Collapse & Expand) cho Mobile & Desktop */
    .card-header-toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      padding: 2px 0;
      transition: opacity 0.15s;
    }
    .card-header-toggle:hover {
      opacity: 0.9;
    }
    .card-header-toggle:active {
      opacity: 0.75;
    }
    .card-header-toggle h2 {
      margin-bottom: 0 !important;
      padding-bottom: 0 !important;
      border-bottom: none !important;
      flex: 1;
    }
    .chevron-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(233, 194, 122, 0.12);
      color: var(--gold);
      font-size: 11px;
      transition: transform 0.25s ease, background 0.15s;
      flex-shrink: 0;
      margin-left: 8px;
    }
    .card-header-toggle:hover .chevron-icon, .tier-header:hover .chevron-icon {
      background: rgba(233, 194, 122, 0.25);
    }
    .collapsed .chevron-icon {
      transform: rotate(-90deg);
    }
    .collapsible-content {
      margin-top: 14px;
      border-top: 1px solid var(--card-border);
      padding-top: 14px;
      transition: all 0.2s ease;
    }
    .collapsed .collapsible-content {
      display: none !important;
    }
    .card.collapsed {
      padding-bottom: 14px;
    }

    /* Các khối Tầng nhiệm vụ Accordion */
    .tier-box {
      border: 1px solid var(--card-border);
      border-radius: 12px;
      background: rgba(0,0,0,0.18);
      margin-bottom: 10px;
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .tier-box:hover {
      border-color: rgba(233, 194, 122, 0.3);
    }
    .tier-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 11px 14px;
      background: rgba(0,0,0,0.25);
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
      font-size: 13px;
      font-weight: 600;
      color: var(--gold);
      transition: background 0.15s;
    }
    .tier-header:hover {
      background: rgba(233, 194, 122, 0.08);
    }
    .tier-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .tier-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .tier-body {
      padding: 12px;
    }
    .collapsed .tier-body {
      display: none !important;
    }

    /* Thanh công cụ đóng/mở nhanh (Quick Toolbar) */
    .quick-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 10px 16px;
      margin-bottom: 18px;
      gap: 10px;
      flex-wrap: wrap;
    }
    .toolbar-title {
      font-size: 13px;
      color: var(--text-dim);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .toolbar-actions {
      display: flex;
      gap: 8px;
    }
    .btn-tool {
      background: rgba(233, 194, 122, 0.12);
      color: var(--gold);
      border: 1px solid rgba(233, 194, 122, 0.3);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: 0.15s;
      -webkit-tap-highlight-color: transparent;
    }
    .btn-tool:hover {
      background: var(--gold);
      color: #1c150e;
    }

    /* Tối ưu hiển thị cho Mobile / Tablet nhỏ */
    @media (max-width: 640px) {
      body {
        padding: 10px 8px;
      }
      .container {
        width: 100%;
      }
      header {
        padding: 14px;
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }
      .who h1 {
        font-size: 17px;
        flex-wrap: wrap;
      }
      .who h1 span {
        font-size: 13px;
      }
      .actions {
        flex-direction: column;
        width: 100%;
        gap: 8px;
      }
      .actions select, .actions button.btn {
        width: 100%;
        justify-content: center;
        font-size: 14px;
        padding: 11px 14px;
      }
      .quick-toolbar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 10px 12px;
        margin-bottom: 12px;
      }
      .toolbar-actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .btn-tool {
        text-align: center;
        padding: 8px 10px;
      }
      .grid {
        grid-template-columns: 1fr;
        gap: 12px;
        margin-bottom: 12px;
      }
      .card {
        padding: 14px 12px;
        margin-bottom: 12px !important;
      }
      .card h2 {
        font-size: 14px;
        margin-bottom: 8px;
        padding-bottom: 8px;
      }
      .stat-row {
        gap: 8px;
        margin-bottom: 8px;
      }
      .stat-box {
        padding: 10px 8px;
      }
      .stat-box b {
        font-size: 17px;
      }
      .stat-box span {
        font-size: 11px;
      }
      .task-row {
        padding: 10px;
        gap: 8px;
      }
      .task-info {
        min-width: 100%;
      }
      .task-actions {
        width: 100%;
        justify-content: space-between;
        margin-top: 6px;
        border-top: 1px dashed rgba(255,255,255,0.08);
        padding-top: 8px;
        flex-wrap: wrap;
        gap: 8px;
      }
      .task-actions select, .task-actions input {
        font-size: 13px;
      }
      .btn-task {
        padding: 8px 14px;
        font-size: 13px;
        flex: 1;
        justify-content: center;
      }
      .tier-header {
        padding: 10px 12px;
        font-size: 12px;
      }
      .tier-body {
        padding: 8px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="who">
        <h1>🪷 ${escapeHTML(displayName)} ${userTag}</h1>
        <p>Cấp bậc: <b>${reportValue(me.level || j.level)} (Lv.${reportValue(me.lv ?? j.lv)})</b> · Chuỗi lên chùa: <b>${reportValue(me.days ?? j.days)} ngày liên tục</b></p>
      </div>
      <div class="actions">
        <select id="meditateSelect" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border); padding:9px 12px; border-radius:10px; font-size:13px; outline:none; cursor:pointer;" ${isRunning || isStopping ? 'disabled' : ''}>
          <option value="3600" selected>🧘 Thiền 60 phút (Cày Top 1)</option>
          <option value="1800">🧘 Thiền 30 phút (Cày Top)</option>
          <option value="300">🧘 Thiền 5 phút (Chuẩn)</option>
        </select>
        <button id="runBtn" class="btn" onclick="triggerRun()" ${isRunning || isStopping ? 'disabled' : ''}>
          ${isStopping ? '🛑 Đang dừng an toàn…' : (isRunning ? '⏳ Đang thực thi…' : '⚡ Chạy Toàn Bộ Chu Trình')}
        </button>
        <button id="refreshBtn" class="btn" onclick="manualRefresh()" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border);" ${isRunning || isStopping ? 'disabled' : ''}>
          🔄 Làm Mới Dữ Liệu
        </button>
        ${isRunning ? `
          <button id="stopHeaderBtn" class="btn" onclick="stopTask()" style="background:#e06c75; color:#fff;" ${isStopping ? 'disabled' : ''}>
            ${isStopping ? '⏳ Đang Dừng…' : '🛑 Dừng Tác Vụ'}
          </button>
        ` : ''}
      </div>
    </header>

    <!-- THANH ĐIỀU HƯỚNG NHANH CHO ĐIỆN THOẠI & MÁY TÍNH -->
    <div class="quick-toolbar">
      <div class="toolbar-title">
        <span>📱</span> <b>Chế độ xem gọn:</b> Chạm tiêu đề mục để đóng/mở
      </div>
      <div class="toolbar-actions">
        <button type="button" class="btn-tool" onclick="expandAllSections()">📂 Mở rộng tất cả</button>
        <button type="button" class="btn-tool" onclick="collapseAllSections()">📁 Thu gọn tất cả</button>
      </div>
    </div>

    <!-- TRẠNG THÁI & KHỐI LIVE TASK LOGS KHI ĐANG CHẠY -->
    ${runningBannerHTML}

    <!-- BẢNG ĐIỀU KHIỂN TỪNG NHIỆM VỤ & DANH SÁCH TOÀN BỘ -->
    <div class="card" id="card_tasks" style="margin-bottom: 20px;">
      <div class="card-header-toggle" onclick="toggleSection('card_tasks')">
        <h2>
          <span>🎯 Bảng Điều Khiển Nhiệm Vụ & Tác Vụ Riêng Lẻ</span>
          <small style="font-size:12px; color:var(--text-dim); font-weight:normal;">Chạy ngẫu hứng · Kèm nút Dừng & Live Log</small>
        </h2>
        <span class="chevron-icon">▼</span>
      </div>
      <div class="collapsible-content">
        <p style="font-size:12px; color:var(--text-dim); margin-bottom:14px; line-height:1.6;">
          Sau khi chu trình tự động lúc 00:05 hoàn tất, bạn có thể bấm <b>[⚡ Chạy]</b> riêng lẻ bất kỳ nhiệm vụ nào bên dưới bất cứ khi nào vào chùa. Quá trình chạy sẽ stream nhật ký trực tiếp vào hộp log phía trên. Bấm <b>[🛑 Dừng]</b> để ngắt tác vụ an toàn.
        </p>

        <div style="display:flex; flex-direction:column; gap: 12px;">
          <div class="tier-box" id="tier_1">
            <div class="tier-header" onclick="toggleSection('tier_1')">
              <div class="tier-title"><span>📋</span> TẦNG 1: NHIỆM VỤ HÀNG NGÀY (QUEST HÔM NAY)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${dailyTasksHTML}
            </div>
          </div>

          <div class="tier-box" id="tier_2">
            <div class="tier-header" onclick="toggleSection('tier_2')">
              <div class="tier-title"><span>🎯</span> TẦNG 2: MỐC TU TẬP & THÀNH TỰU VĨNH VIỄN</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${milestoneTasksHTML}
            </div>
          </div>

          <div class="tier-box" id="tier_3">
            <div class="tier-header" onclick="toggleSection('tier_3')">
              <div class="tier-title"><span>✨</span> TẦNG 3 & 4: ĂN THÊM ĐIỂM, VƯỜN SEN & TĨNH TÂM</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${extraTasksHTML}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid">
      <!-- CÔNG ĐỨC & CẤP BẬC -->
      <div class="card" id="card_merit">
        <div class="card-header-toggle" onclick="toggleSection('card_merit')">
          <h2>
            <span>✨ Công Đức & Tích Lũy</span>
            <small style="font-size:11px; color:var(--text-dim); font-weight:normal;">Cập nhật UTC: ${escapeHTML(state.lastUpdated || 'Chưa có dữ liệu')}</small>
          </h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
          <div class="stat-row">
            <div class="stat-box">
              <b>${reportValue(me.total ?? j.merit)}</b>
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
              <b>${reportValue(j.streak ?? me.days)} ngày</b>
              <span>Kỷ lục liên tiếp</span>
            </div>
          </div>
        </div>
      </div>

      <!-- NHIỆM VỤ HÀNG NGÀY -->
      <div class="card" id="card_quests">
        <div class="card-header-toggle" onclick="toggleSection('card_quests')">
          <h2>📋 Nhiệm Vụ Hôm Nay</h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
          ${questsHTML}
        </div>
      </div>
    </div>

    <div class="grid">
      <!-- TIẾN ĐỘ THÀNH TỰU -->
      <div class="card" id="card_milestones">
        <div class="card-header-toggle" onclick="toggleSection('card_milestones')">
          <h2>🎯 Tiến Độ Thành Tựu Vĩnh Viễn</h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
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
      </div>

      <!-- BẢNG DANH HIỆU -->
      <div class="card" id="card_titles">
        <div class="card-header-toggle" onclick="toggleSection('card_titles')">
          <h2>🏅 Danh Hiệu & Thành Tựu</h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
          <div class="title-grid">
            ${titlesHTML}
          </div>
        </div>
      </div>
    </div>

    <!-- NHẬT KÝ & LIVE LOGS -->
    <div class="grid">
      <div class="card" id="card_history">
        <div class="card-header-toggle" onclick="toggleSection('card_history')">
          <h2>📜 Lịch Sử Chạy Gần Nhất</h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
          <div style="max-height: 220px; overflow-y: auto;">
            ${historyHTML}
          </div>
        </div>
      </div>

      <div class="card" id="card_logs">
        <div class="card-header-toggle" onclick="toggleSection('card_logs')">
          <h2>💻 Nhật Ký Hệ Thống</h2>
          <span class="chevron-icon">▼</span>
        </div>
        <div class="collapsible-content">
          <div class="logs-box" id="bottomLogsBox">
            ${logsHTML}
          </div>
        </div>
      </div>
    </div>

    <footer>
      <p>Hệ thống tự động hóa công đức chùa An Tự Duyên · Múi giờ: Asia/Ho_Chi_Minh (UTC+7) · Lưu trữ: Bộ nhớ tạm phiên làm việc (In-memory buffer) · <a href="/health">Health Monitor</a></p>
    </footer>
  </div>

  <script>
    async function runTask(taskId, customOptions = {}) {
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

      const payload = { task: taskId, ...customOptions };
      if (taskId === 'meditate' || taskId === 'ngoi-daily') {
        const medInp = document.getElementById('duration_min_' + taskId);
        if (medInp && medInp.value) {
          const mins = parseInt(medInp.value, 10) || 5;
          payload.meditate = mins * 60;
        } else {
          const medSel = document.getElementById('meditateSelect');
          if (medSel) payload.meditate = Number(medSel.value);
        }
      } else if (taskId === 'farm-bows-beads') {
        const bowsInp = document.getElementById('combo_bows');
        const beadsInp = document.getElementById('combo_beads');
        if (bowsInp && bowsInp.value !== '') payload.bowsCount = Number(bowsInp.value);
        if (beadsInp && beadsInp.value !== '') payload.beadsCount = Number(beadsInp.value);
      } else if (taskId === 'chu' || taskId === 'secrets') {
        const wishSel = document.getElementById('wish_' + taskId);
        if (wishSel && wishSel.value) payload.wish = wishSel.value;
      } else {
        const countInp = document.getElementById('count_' + taskId);
        if (countInp && countInp.value !== '') {
          payload.count = Number(countInp.value);
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

      const stopBtns = document.querySelectorAll('.btn-stop, #stopMainBtn, #stopHeaderBtn');
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
          // Trang sẽ tự reload khi poll thấy trạng thái dừng
          setTimeout(() => location.reload(), 1200);
        } else {
          alert(data.error || data.message || 'Lỗi khi gửi yêu cầu dừng');
          stopBtns.forEach(b => { b.disabled = false; b.textContent = '🛑 Dừng'; });
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
        stopBtns.forEach(b => { b.disabled = false; b.textContent = '🛑 Dừng'; });
      }
    }

    async function manualRefresh() {
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
      const refBtn = document.getElementById('refreshBtn');
      if (refBtn) {
        refBtn.disabled = true;
        refBtn.textContent = '🔄 Đang đồng bộ…';
      }
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
        const res = await fetch('/api/refresh', { method: 'POST', headers });
        const data = await res.json();
        if (res.ok && data.ok) {
          location.reload();
        } else {
          alert(data.error || data.message || 'Lỗi khi làm mới dữ liệu');
          if (refBtn) {
            refBtn.disabled = false;
            refBtn.textContent = '🔄 Làm Mới Dữ Liệu';
          }
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
        if (refBtn) {
          refBtn.disabled = false;
          refBtn.textContent = '🔄 Làm Mới Dữ Liệu';
        }
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

          if (data.isStopping) {
            const taskNameEl = document.getElementById('runningTaskTitle');
            if (taskNameEl) {
              taskNameEl.innerHTML = '<span class="pulse-dot" style="background:#e06c75;"></span> 🛑 ĐANG DỪNG AN TOÀN: ' + (data.runningTaskName || '') + ' (Đang ngắt kết nối an toàn...)';
              taskNameEl.style.color = '#e06c75';
            }
            const stopBtns = document.querySelectorAll('.btn-stop, #stopMainBtn, #stopHeaderBtn');
            stopBtns.forEach(b => { b.disabled = true; b.textContent = '⏳ Đang dừng…'; });
          }

          // Cập nhật số giây an toàn
          const timerEl = document.getElementById('elapsedTimer');
          if (timerEl && data.runningSeconds !== undefined) {
            timerEl.textContent = '⏱️ Đã chạy: ' + String(data.runningSeconds) + 's';
          }

          // Cập nhật tên tác vụ
          const taskNameEl = document.getElementById('runningTaskTitle');
          if (taskNameEl && data.runningTaskName && !data.isStopping) {
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
          const csrfMeta = document.querySelector('meta[name="csrf-token"]');
          const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';
          const headers = {};
          if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
          const res = await fetch('/api/status', { headers });
          if (!res.ok) return;
          const data = await res.json();
          if (data.isRunning) location.reload();
        } catch {}
      }, 15000);
    }

    // ==========================================
    // LOGIC ĐÓNG / MỞ (COLLAPSE & EXPAND) GIAO DIỆN
    // ==========================================
    function toggleSection(sectionId) {
      const el = document.getElementById(sectionId);
      if (!el) return;
      const isCollapsed = el.classList.toggle('collapsed');
      try {
        localStorage.setItem('ddc_col_' + sectionId, isCollapsed ? '1' : '0');
      } catch (e) {}
    }

    function expandAllSections() {
      document.querySelectorAll('.card, .tier-box').forEach(el => {
        el.classList.remove('collapsed');
        try {
          if (el.id) localStorage.setItem('ddc_col_' + el.id, '0');
        } catch (e) {}
      });
    }

    function collapseAllSections() {
      document.querySelectorAll('.card, .tier-box').forEach(el => {
        el.classList.add('collapsed');
        try {
          if (el.id) localStorage.setItem('ddc_col_' + el.id, '1');
        } catch (e) {}
      });
    }

    function restoreCollapseStates() {
      document.querySelectorAll('.card, .tier-box').forEach(el => {
        if (!el.id) return;
        try {
          const saved = localStorage.getItem('ddc_col_' + el.id);
          if (saved === '1') {
            el.classList.add('collapsed');
          } else if (saved === '0') {
            el.classList.remove('collapsed');
          }
        } catch (e) {}
      });
    }

    restoreCollapseStates();
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
      running: state.isRunning,
      stopping: state.isStopping
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

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: state.isRunning,
      isStopping: state.isStopping,
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

  // 3. API Làm mới dữ liệu từ chùa thủ công
  if (url.pathname === '/api/refresh') {
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

    if (state.isRunning || state.isStopping) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'Đang có tác vụ đang chạy, không thể đồng bộ lại dữ liệu chùa.' }));
      return;
    }

    const ok = await refreshAccountData();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok,
      message: ok ? 'Đã làm mới dữ liệu từ máy chủ chùa thành công.' : 'Làm mới dữ liệu thất bại.',
      lastUpdated: state.lastUpdated,
      merit: state.merit,
      journal: state.journal
    }));
    return;
  }

  // 4. API Dừng tác vụ đang chạy (Priority 1: Bắt buộc POST, Xác thực CSRF hoặc Auth Token)
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

    if (state.isStopping) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, stopped: true, message: 'Đang trong quá trình dừng an toàn, vui lòng đợi.' }));
      return;
    }

    state.isStopping = true;
    addWebLog('🛑 Đang tiến hành dừng tác vụ an toàn theo yêu cầu từ người dùng...', 'warn', '🛑');
    if (state.activeClient) {
      try {
        state.activeClient.abort('Người dùng đã bấm dừng tác vụ trên Dashboard.');
      } catch (abortErr) {
        log.warn('Lỗi khi gọi client.abort:', abortErr.message);
      }
    }

    // executeRoutine sẽ bắt lệnh hủy và giải phóng cả isRunning và isStopping trong finally
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, stopped: true, message: 'Đã gửi lệnh dừng tác vụ. Đang ngắt kết nối an toàn...' }));
    return;
  }

  // 5. API Kích hoạt chạy nhiệm vụ (Priority 1: Bắt buộc POST, Xác thực, Validate tham số)
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
      if (Number.isInteger(c) && c > 0 && c <= 20000) {
        runOptions.count = c;
      }
    }

    if (bodyData.bowsCount !== undefined && bodyData.bowsCount !== null) {
      const b = parseInt(bodyData.bowsCount, 10);
      if (Number.isInteger(b) && b >= 0 && b <= 2000) {
        runOptions.bowsCount = b;
      }
    }

    if (bodyData.beadsCount !== undefined && bodyData.beadsCount !== null) {
      const bd = parseInt(bodyData.beadsCount, 10);
      if (Number.isInteger(bd) && bd >= 0 && bd <= 20000) {
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

    // Kiểm tra và validate chữ thư pháp (wish)
    const wishRaw = bodyData.wish ?? (url.searchParams.has('wish') ? url.searchParams.get('wish') : null);
    if (wishRaw !== null && wishRaw !== undefined) {
      const wishStr = String(wishRaw).trim();
      const validWishes = CALLIGRAPHY_WORDS.map(w => w.id);
      if (validWishes.includes(wishStr)) {
        runOptions.wish = wishStr;
      }
    }

    // Nếu đang chạy dở hoặc đang dừng an toàn, trả về HTTP 409 Conflict
    if (state.isRunning || state.isStopping) {
      res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: false,
        running: true,
        isStopping: state.isStopping,
        message: state.isStopping
          ? 'Tiến trình trước đang ngắt kết nối an toàn, vui lòng đợi vài giây trước khi chạy nhiệm vụ mới.'
          : 'Chu trình nhiệm vụ hiện đang được thực hiện, vui lòng đợi hoàn tất.'
      }));
      return;
    }

    const taskItem = TASKS_CATALOG.find(t => t.id === task);
    const taskTitle = taskItem ? taskItem.title : (task === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : task);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      running: true,
      message: `Đã nhận yêu cầu chạy nhiệm vụ [${taskTitle}], tiến trình đang thực thi ngầm và truyền nhật ký trực tiếp.`,
      options: runOptions
    }));

    // Chạy ngầm trong background
    executeRoutine(`API Trigger (${task})`, runOptions).catch(console.error);
    return;
  }

  // 6. Trang Dashboard chính (GET)
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
