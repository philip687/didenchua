import http from 'node:http';
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

// Bộ nhớ đệm lưu trạng thái và lịch sử chạy (In-memory buffer)
const state = {
  lastUpdated: null,
  merit: null,
  journal: null,
  isRunning: false,
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
    return true;
  } catch (err) {
    log.error('Lỗi làm mới dữ liệu chùa:', err.message);
    return false;
  } finally {
    client.close();
  }
}

// Hàm thực thi chu trình tự động (Định danh Run ID & Ghi nhận trạng thái chuẩn)
async function executeRoutine(triggerSource = 'Manual / Web', runOptions = {}) {
  if (state.isRunning) {
    return { ok: false, message: 'Đang có một tiến trình nhiệm vụ đang chạy dở, vui lòng đợi.' };
  }

  const runId = 'run-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  state.isRunning = true;
  state.currentRunId = runId;
  state.runStartTime = Date.now();
  state.runTriggerSource = triggerSource;
  
  const startedAt = new Date().toISOString();
  addWebLog(`⚡ [${runId}] Khởi động chu kỳ tự động (Nguồn: ${triggerSource})...`, 'info', '⚡');
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

    const initClient = new DiDenChuaClient();
    await initClient.connect(8000);
    const initJ = await initClient.fetchJournal();
    const prevTitles = new Set((initJ?.titles || []).filter(t => t.got).map(t => t.name));
    initClient.close();

    // Chạy chu trình 3 Giai đoạn
    routineResult = await runAllQuests({ skipHang: false, ...runOptions });

    // Lấy lại dữ liệu mới nhất sau khi chạy xong
    const snapshotAvailable = await refreshAccountData();

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    // Chỉ so danh hiệu khi có snapshot trước và sau; nếu thiếu dữ liệu thì không suy ra danh hiệu mới.
    const titlesComparisonAvailable = Array.isArray(initJ?.titles) && snapshotAvailable && Array.isArray(state.journal?.titles);
    const newlyUnlocked = titlesComparisonAvailable
      ? state.journal.titles.filter(t => t.got && !prevTitles.has(t.name))
      : [];

    // Chỉ đánh dấu success khi toàn routine tuyên bố đã xác minh; claim count riêng chưa chứng minh mọi action.
    runStatus = routineResult?.verificationStatus === 'verified'
      ? 'success'
      : (Number(routineResult?.unverifiedCount) > 0 ? 'partial' : 'unverified');
    const finishedAt = new Date().toISOString();

    const result = {
      id: runId,
      runId,
      source: triggerSource,
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

    // Hết luồng chạy không đồng nghĩa server đã ghi nhận; ghi status tương ứng với bằng chứng hiện có.
    addWebLog(`⚠️ [${runId}] Đã chạy hết luồng (${runStatus}) sau ${durationSec}s.`, runStatus === 'success' ? 'success' : 'warn', runStatus === 'success' ? '✅' : '⚠️');

    // Gửi thông báo Telegram/Discord nếu cấu hình (không làm đứt chu trình nếu notify lỗi)
    try {
      await notifyRunResult({
        runId,
        source: triggerSource,
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
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    // Cắt và che thông tin xác thực phổ biến trước khi ghi lỗi vào dashboard/notification.
    safeErrorMessage = String(err.message || 'Lỗi không xác định')
      .replace(/(authorization|token|secret|cookie|webhook)\s*[:=]\s*\S+/gi, '$1=[đã ẩn]')
      .replace(/https?:\/\/\S+/gi, '[URL đã ẩn]')
      .slice(0, 500);
    errorStep = 'routine_execution';
    runStatus = 'failed';
    const finishedAt = new Date().toISOString();

    addWebLog(`❌ [${runId}] Thất bại tại bước [${errorStep}]: ${safeErrorMessage}`, 'error', '❌');

    const result = {
      id: runId,
      runId,
      source: triggerSource,
      status: 'failed',
      error: safeErrorMessage,
      errorStep,
      startTime: startedAt,
      finishedAt,
      durationSec,
      snapshotAt: state.lastUpdated,
      snapshotStatus: state.lastUpdated ? 'stale' : 'unavailable',
      storagePolicy: 'Bộ nhớ tạm phiên làm việc (In-memory buffer tối đa 15 lượt)'
    };
    state.runHistory.unshift(result);
    if (state.runHistory.length > 15) state.runHistory.pop();

    try {
      await notifyRunResult({
        runId,
        source: triggerSource,
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

    return { ok: false, error: safeErrorMessage };
  } finally {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    state.isRunning = false;
    state.runStartTime = null;
    state.runTriggerSource = null;
    state.currentRunId = null;
  }
}

// Lập lịch tự động chạy sau 00:05 mỗi sáng giờ VN (UTC+7) với cơ chế chạy bù an toàn (Priority 4)
let lastScheduledRunDate = '';
let isSchedulerRunning = false;

function startDailyScheduler() {
  async function checkSchedule() {
    if (isSchedulerRunning || state.isRunning) return;

    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // Điều kiện: Sau 00:05 sáng (giờ VN) và ngày hôm nay chưa chạy thành công
    const pastScheduledTime = (hour > 0) || (hour === 0 && minute >= 5);
    if (pastScheduledTime && lastScheduledRunDate !== todayStr) {
      isSchedulerRunning = true;
      log.temple('⏰', `Đến lịch chạy tự động ngày mới ${todayStr} (giờ Việt Nam). Khởi động chu kỳ...`);
      try {
        const res = await executeRoutine(`Daily Scheduler (${todayStr})`, { meditateSeconds: 3600 });
        if (res && res.ok) {
          lastScheduledRunDate = todayStr;
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
  log.info('⏰ Đã kích hoạt lịch trình tự động canh sau 00:05 sáng mỗi ngày (giờ Việt Nam) với cơ chế chạy bù an toàn.');
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

  const historyHTML = state.runHistory.map(h => `
    <div class="history-item ${escapeHTML(h.status)}">
      <div>
        <b>${h.status === 'success' ? '✅ Đã xác nhận' : (h.status === 'partial' ? '⚠️ Hoàn tất một phần' : (h.status === 'unverified' ? '⚠️ Chưa xác minh' : '❌ Thất bại'))}</b> · <span>${escapeHTML(h.source)}</span>
        <small class="time">Bắt đầu ${escapeHTML(h.startTime || 'chưa rõ')} · Kết thúc ${escapeHTML(h.timestamp || 'chưa rõ')} UTC · ${escapeHTML(h.durationSec)}s · ID: ${escapeHTML(h.id)}</small>
      </div>
      <div>${h.status === 'failed' ? `<span class="err">${escapeHTML(h.error || 'Lỗi không rõ')}</span>` : `Snapshot: ${escapeHTML(h.snapshotStatus || 'không rõ')} · Hôm nay: ${reportValue(h.todayMerit)}đ · Tổng: ${reportValue(h.totalMerit)}đ`}</div>
    </div>
  `).join('') || '<p class="empty">Chưa có lịch sử chạy nào trong phiên này (Bộ nhớ tạm lưu tối đa 15 lượt).</p>';

  const logsHTML = state.currentLogs.map(l => `<div><span style="color:var(--text-dim); margin-right:6px;">${escapeHTML(l.timeDisplay)}</span><span style="margin-right:4px;">${escapeHTML(l.icon || 'ℹ️')}</span>${escapeHTML(l.message)}</div>`).join('') || '<div>Hệ thống sẵn sàng. Đang chờ tác vụ…</div>';
  const isRunning = state.isRunning;
  const elapsedSec = isRunning && state.runStartTime ? Math.round((Date.now() - state.runStartTime) / 1000) : 0;

  // Khối thông báo trạng thái & Log trực tiếp khi đang làm nhiệm vụ
  const runningBannerHTML = isRunning ? `
    <div class="card live-task-card" style="border: 2px solid var(--gold); background: #1a140f; box-shadow: 0 0 25px rgba(233,194,122,0.25); margin-bottom: 20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:10px;">
        <h2 style="color:var(--gold); font-size:16px; margin:0; border:none; padding:0; display:flex; align-items:center; gap:8px;">
          <span class="pulse-dot"></span> 🟡 ĐANG THỰC HIỆN NHIỆM VỤ TỰ ĐỘNG
        </h2>
        <span id="elapsedTimer" style="font-size:13px; color:#ffd98d; font-family:monospace; background:rgba(0,0,0,0.4); padding:4px 10px; border-radius:6px; border:1px solid var(--card-border);">
          ⏱️ Đã chạy: ${escapeHTML(elapsedSec)}s
        </span>
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
    .actions { display: flex; gap: 10px; }
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
    .history-item.error, .history-item.failed { border-left: 3px solid var(--danger); }
    .history-item .time { color: var(--text-dim); margin-left: 8px; }
    .history-item .err { color: var(--danger); }
    .logs-box { background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 180px; overflow-y: auto; line-height: 1.6; }
    .empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 15px; }
    footer { text-align: center; font-size: 12px; color: var(--text-dim); margin-top: 30px; }
    footer a { color: var(--gold-dim); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="who">
        <h1>🪷 ${reportValue(me.name)} <span>(@${reportValue(me.user)})</span></h1>
        <p>Cấp bậc: <b>${reportValue(me.level)} (Lv.${reportValue(me.lv)})</b> · Chuỗi lên chùa: <b>${reportValue(me.days)} ngày liên tục</b></p>
      </div>
      <div class="actions" style="display:flex; align-items:center; gap:8px;">
        <select id="meditateSelect" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border); padding:9px 12px; border-radius:10px; font-size:13px; outline:none; cursor:pointer;" ${isRunning ? 'disabled' : ''}>
          <option value="3600" selected>🧘 Thiền 60 phút (Mặc định - Cày Top 1)</option>
          <option value="1800">🧘 Thiền 30 phút (Cày Top)</option>
          <option value="300">🧘 Thiền 5 phút (Chuẩn)</option>
        </select>
        <button id="runBtn" class="btn" onclick="triggerRun()" ${isRunning ? 'disabled' : ''}>
          ${isRunning ? '⏳ Đang làm nhiệm vụ…' : '⚡ Bắt Đầu Làm Nhiệm Vụ'}
        </button>
      </div>
    </header>

    <!-- TRẠNG THÁI & KHỐI LIVE TASK LOGS KHI ĐANG CHẠY -->
    ${runningBannerHTML}

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
    async function triggerRun() {
      const btn = document.getElementById('runBtn');
      const medSel = document.getElementById('meditateSelect');
      const medVal = medSel ? medSel.value : '3600';
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

      btn.disabled = true;
      btn.innerText = '⏳ Đang khởi chạy…';
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
        }

        const res = await fetch('/api/run', {
          method: 'POST',
          headers,
          body: JSON.stringify({ meditate: Number(medVal) })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          location.reload();
        } else {
          alert(data.error || data.message || 'Lỗi khi kích hoạt');
          btn.disabled = false;
          btn.innerText = '⚡ Bắt Đầu Làm Nhiệm Vụ';
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
        btn.disabled = false;
        btn.innerText = '⚡ Bắt Đầu Làm Nhiệm Vụ';
      }
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

  // 3. API Kích hoạt chạy nhiệm vụ (Priority 1: Bắt buộc POST, Xác thực, Validate tham số meditate)
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

    // Kiểm tra và validate tham số meditate
    const runOptions = {};
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
      message: 'Đã kích hoạt chu trình nhiệm vụ thành công!',
      options: runOptions
    }));

    // Chạy ngầm trong background
    executeRoutine(`API Trigger (${url.pathname})`, runOptions).catch(console.error);
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
