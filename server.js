import http from 'node:http';
import { runAllQuests } from './src/tasks/all.js';
import { DiDenChuaClient } from './src/client.js';
import { log, setLogHook } from './src/logger.js';
import { notifyRunResult } from './src/notify.js';
import { loadConfig } from './config.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// Bộ nhớ đệm lưu trạng thái và lịch sử chạy
const state = {
  lastUpdated: null,
  merit: null,
  journal: null,
  isRunning: false,
  runHistory: [],
  currentLogs: []
};

// Ghi log vào bộ nhớ đệm để hiển thị trên web
function addWebLog(msg) {
  const time = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 19);
  state.currentLogs.unshift(`[${time}] ${msg}`);
  if (state.currentLogs.length > 50) state.currentLogs.pop();
}

setLogHook(addWebLog);

// Cập nhật thông tin tài khoản từ máy chủ chùa
async function refreshAccountData() {
  const client = new DiDenChuaClient();
  try {
    await client.connect(8000);
    const j = await client.fetchJournal();
    state.merit = client.merit;
    state.journal = j;
    state.lastUpdated = new Date(Date.now() + 7 * 3600 * 1000).toLocaleString('vi-VN', { timeZone: 'UTC' });
  } catch (err) {
    log.error('Lỗi làm mới dữ liệu chùa:', err.message);
  } finally {
    client.close();
  }
}

// Hàm thực thi chu trình tự động
async function executeRoutine(triggerSource = 'Manual / Web') {
  if (state.isRunning) {
    return { ok: false, message: 'Đang có một tiến trình nhiệm vụ đang chạy dở, vui lòng đợi.' };
  }

  state.isRunning = true;
  addWebLog(`⚡ Bắt đầu chạy chu kỳ nhiệm vụ (Nguồn: ${triggerSource})...`);
  const startTime = Date.now();

  try {
    const initClient = new DiDenChuaClient();
    await initClient.connect(8000);
    const initJ = await initClient.fetchJournal();
    const prevTitles = new Set((initJ?.titles || []).filter(t => t.got).map(t => t.name));
    initClient.close();

    // Chạy chu trình 3 Giai đoạn
    await runAllQuests({ skipHang: false });

    // Lấy lại dữ liệu mới nhất
    await refreshAccountData();

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    const newlyUnlocked = (state.journal?.titles || []).filter(t => t.got && !prevTitles.has(t.name));

    const result = {
      source: triggerSource,
      status: 'success',
      timestamp: new Date(Date.now() + 7 * 3600 * 1000).toLocaleString('vi-VN', { timeZone: 'UTC' }),
      durationSec,
      totalMerit: state.merit?.me?.total || 0,
      todayMerit: state.merit?.me?.today || 0,
      newlyUnlocked
    };

    state.runHistory.unshift(result);
    if (state.runHistory.length > 15) state.runHistory.pop();

    addWebLog(`✅ Đã hoàn thành toàn bộ chu trình sau ${durationSec} giây!`);

    // Gửi thông báo Telegram/Discord nếu cấu hình
    await notifyRunResult({
      status: 'success',
      journal: state.journal,
      merit: state.merit,
      durationSec,
      newlyUnlocked
    });

    return { ok: true, result };
  } catch (err) {
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    addWebLog(`❌ Lỗi chạy nhiệm vụ: ${err.message}`);

    const result = {
      source: triggerSource,
      status: 'error',
      error: err.message,
      timestamp: new Date(Date.now() + 7 * 3600 * 1000).toLocaleString('vi-VN', { timeZone: 'UTC' }),
      durationSec
    };
    state.runHistory.unshift(result);

    await notifyRunResult({
      status: 'error',
      journal: state.journal,
      merit: state.merit,
      durationSec
    });

    return { ok: false, error: err.message };
  } finally {
    state.isRunning = false;
  }
}

// Lập lịch tự động chạy lúc 00:05 mỗi sáng giờ VN (UTC+7)
function startDailyScheduler() {
  function checkSchedule() {
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // Đúng 00:05 sáng
    if (hour === 0 && minute === 5 && !state.isRunning) {
      log.temple('⏰', 'Đã đến 00:05 sáng - Bắt đầu tự động làm nhiệm vụ ngày mới!');
      executeRoutine('Scheduler 00:05 Daily').catch(console.error);
    }
  }

  setInterval(checkSchedule, 60000); // Kiểm tra mỗi phút
  log.info('⏰ Đã kích hoạt lịch trình tự động canh 00:05 sáng mỗi ngày (giờ Việt Nam).');
}

// Tạo mã HTML Dashboard
function renderDashboardHTML() {
  const me = state.merit?.me || {};
  const j = state.journal || {};
  const cfg = loadConfig();

  const questsHTML = (me.quests || []).map(q => {
    const badge = q.claimed
      ? '<span class="badge badge-done">✅ Đã nhận</span>'
      : (q.have >= q.need ? '<span class="badge badge-ready">🎁 Chờ nhận</span>' : `<span class="badge badge-wait">⏳ ${q.have}/${q.need}</span>`);
    return `
      <div class="quest-item">
        <div class="quest-title">${q.title}</div>
        <div class="quest-meta">
          <span class="quest-reward">+${q.reward} điểm</span>
          ${badge}
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang đồng bộ nhiệm vụ từ máy chủ chùa…</p>';

  const titlesHTML = (j.titles || []).map(t => {
    return `
      <div class="title-card ${t.got ? 'title-got' : 'title-locked'}">
        <div class="title-icon">${t.got ? '🏆' : '🔒'}</div>
        <div class="title-info">
          <b>${t.name}</b>
          <small>${t.desc}</small>
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang tải danh hiệu…</p>';

  const historyHTML = state.runHistory.map(h => `
    <div class="history-item ${h.status}">
      <div>
        <b>${h.status === 'success' ? '✅ Thành công' : '❌ Lỗi'}</b> · <span>${h.source}</span>
        <small class="time">${h.timestamp} (${h.durationSec}s)</small>
      </div>
      <div>${h.status === 'success' ? `+${h.todayMerit}đ (Tổng: ${h.totalMerit}đ)` : `<span class="err">${h.error}</span>`}</div>
    </div>
  `).join('') || '<p class="empty">Chưa có lịch sử chạy nào trong phiên này.</p>';

  const logsHTML = state.currentLogs.map(l => `<div>${l}</div>`).join('') || '<div>Hệ thống sẵn sàng. Đang chờ tác vụ…</div>';

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    .title-card { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,0.2); border: 1px solid var(--card-border); }
    .title-got { border-color: rgba(233,194,122,0.4); background: rgba(233,194,122,0.06); }
    .title-info b { font-size: 13px; display: block; color: var(--text); }
    .title-got .title-info b { color: var(--gold); }
    .title-info small { font-size: 11px; color: var(--text-dim); }
    .history-item { font-size: 13px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; }
    .history-item .time { display: block; font-size: 11px; color: var(--text-dim); }
    .history-item.error { color: var(--danger); }
    .logs-box { background: #0c0907; border: 1px solid var(--card-border); border-radius: 10px; padding: 12px; font-family: monospace; font-size: 12px; color: #a89984; max-height: 180px; overflow-y: auto; line-height: 1.6; }
    footer { text-align: center; font-size: 12px; color: var(--text-dim); margin-top: 30px; }
    footer a { color: var(--gold-dim); text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="who">
        <h1>🪷 ${me.name || cfg.name} <span>(@${me.user || cfg.name})</span></h1>
        <p>Cấp bậc: <b>${me.level || 'Hoan hỷ'} (Lv.${me.lv || 3})</b> · Chuỗi lên chùa: <b>${me.days || 2} ngày liên tục</b></p>
      </div>
      <div class="actions">
        <button id="runBtn" class="btn" onclick="triggerRun()" ${state.isRunning ? 'disabled' : ''}>
          ${state.isRunning ? '⏳ Đang làm nhiệm vụ…' : '⚡ Chạy Nhiệm Vụ Ngay'}
        </button>
      </div>
    </header>

    <div class="grid">
      <!-- CÔNG ĐỨC & CẤP BẬC -->
      <div class="card">
        <h2>✨ Công Đức & Tích Lũy <small style="font-size:11px; color:var(--text-dim); font-weight:normal;">Cập nhật: ${state.lastUpdated || 'Đang nạp...'}</small></h2>
        <div class="stat-row">
          <div class="stat-box">
            <b>${me.total || 0}</b>
            <span>Tổng công đức</span>
          </div>
          <div class="stat-box">
            <b>+${me.today || 0}</b>
            <span>Hôm nay</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${(me.next || 1200) - (me.total || 0)}</b>
            <span>Cần đến cấp sau</span>
          </div>
          <div class="stat-box">
            <b>${j.streak || 2} ngày</b>
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
            <b>${j.bows || 0} / 108</b>
            <span>Lạy Phật (Trăm lạy: ${j.bows >= 108 ? '✅' : 'đang cày'})</span>
          </div>
          <div class="stat-box">
            <b>${j.beads || 0} hạt</b>
            <span>Tràng hạt (${j.rounds || 0} chuỗi tròn)</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${j.incense || 0} / 30</b>
            <span>Dâng hương (Hương trầm)</span>
          </div>
          <div class="stat-box">
            <b>${j.lanterns || 0} / 10</b>
            <span>Hoa đăng (Người thả đèn)</span>
          </div>
        </div>
        <div class="stat-row">
          <div class="stat-box">
            <b>${j.sitMin || 0} / 60 phút</b>
            <span>Ngồi tĩnh tâm (Tĩnh tọa)</span>
          </div>
          <div class="stat-box">
            <b>${j.visited || 10} / 10 khu</b>
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
        <h2>💻 Nhật Ký Trực Tiếp (Live Logs)</h2>
        <div class="logs-box">
          ${logsHTML}
        </div>
      </div>
    </div>

    <footer>
      <p>Hệ thống tự động hóa công đức chùa An Tự Duyên · Triển khai trên Render Cloud · <a href="/api/status" target="_blank">Xem API JSON</a></p>
    </footer>
  </div>

  <script>
    async function triggerRun() {
      const btn = document.getElementById('runBtn');
      btn.disabled = true;
      btn.innerText = '⏳ Đang khởi chạy…';
      try {
        const res = await fetch('/api/run', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          alert('Đã kích hoạt chạy chu trình tự động! Vui lòng đợi trong giây lát, trang sẽ tự làm mới.');
        } else {
          alert(data.message || 'Lỗi khi kích hoạt');
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
      }
      setTimeout(() => location.reload(), 4000);
    }

    // Tự động làm mới trang mỗi 30 giây để cập nhật trạng thái
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;
}

// Khởi chạy HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health check (Render giám sát)
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
    return;
  }

  // 2. API lấy trạng thái JSON
  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      isRunning: state.isRunning,
      lastUpdated: state.lastUpdated,
      merit: state.merit,
      journal: state.journal,
      history: state.runHistory
    }, null, 2));
    return;
  }

  // 3. API Kích hoạt chạy nhiệm vụ (POST hoặc GET)
  if (url.pathname === '/api/run' || url.pathname === '/run' || url.pathname === '/cron') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (state.isRunning) {
      res.end(JSON.stringify({ ok: false, message: 'Chu trình đang chạy dở, vui lòng đợi.' }));
      return;
    }

    res.end(JSON.stringify({ ok: true, message: 'Đã kích hoạt chu trình nhiệm vụ thành công!' }));
    // Chạy ngầm trong background
    executeRoutine(`API Trigger (${url.pathname})`).catch(console.error);
    return;
  }

  // 4. Trang Dashboard chính
  if (url.pathname === '/' || url.pathname === '/dashboard') {
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

