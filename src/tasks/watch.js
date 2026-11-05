import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { loadConfig } from '../../config.js';
import { log } from '../logger.js';

function findChromePath(userPath) {
  if (userPath && fs.existsSync(userPath)) return userPath;

  const defaultPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ];

  for (const p of defaultPaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function runWatch(taskToRun = 'all', options = {}) {
  const config = loadConfig();
  const chromePath = findChromePath(config.chromePath);

  if (!chromePath) {
    log.error('Không tìm thấy Google Chrome!');
    log.warn('Vui lòng kiểm tra chromePath trong config.json.');
    return;
  }

  const targetRoom = config.room || 'chua-1';
  const targetUrl = `https://didenchua.online/?phong=${encodeURIComponent(targetRoom)}`;

  log.temple('👁️', 'KHỞI ĐỘNG CHẾ ĐỘ XEM TRỰC TIẾP TRÊN TRÌNH DUYỆT (CHỐNG BỊ BÁO ĐĂNG NHẬP CHỖ KHÁC)');
  log.info(`Dùng đúng 1 kết nối duy nhất của Chrome để không bao giờ bị máy chủ ngắt!`);
  log.info(`Tài khoản: "${config.name}" (CID: ${config.cid})`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,850',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  // Hook WebSocket của chính trang web để điều khiển trực tiếp mà không cần mở kết nối thứ hai
  await page.evaluateOnNewDocument((cid, profile) => {
    localStorage.setItem('anduyen.cid', cid);
    if (profile) {
      localStorage.setItem('anduyen.profile', JSON.stringify(profile));
    }

    const OrigWS = window.WebSocket;
    window.__templeWs = null;
    window.__peersList = [];
    window.__meritData = null;
    window.__meritUpdateCount = 0;
    window.__journalData = null;
    window.__journalUpdateCount = 0;
    window.__wsCloseEvents = [];

    window.WebSocket = class extends OrigWS {
      constructor(...args) {
        super(...args);
        window.__templeWs = this;

        this.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.t === 'welcome' && Array.isArray(data.peers)) {
              window.__peersList = data.peers;
            }
            if (data.t === 'merit') {
              window.__meritData = data.me;
              window.__meritUpdateCount += 1;
            }
            if (data.t === 'journal') {
              window.__journalData = data.j;
              window.__journalUpdateCount += 1;
            }
            if (data.t === 'join' && data.peer) {
              window.__peersList.push(data.peer);
            }
          } catch {}
        });
        this.addEventListener('close', (event) => {
          window.__wsCloseEvents.push({ code: event.code, reason: String(event.reason || '').slice(0, 160) });
        });
      }
    };
  }, config.cid, {
    name: config.name,
    kind: config.kind,
    robe: config.robe,
    skin: config.skin,
    bio: config.bio,
    beads: config.beads,
    cushion: config.cushion
  });

  log.info(`Đang mở trang chùa: ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

  // Chờ trang tải và kết nối WebSocket sẵn sàng
  log.info('Đang chờ cổng chùa mở và kết nối máy chủ ổn định (khoảng 5s)...');
  await new Promise(r => setTimeout(r, 6000));

  const isConnected = await page.evaluate(() => {
    return window.__templeWs !== null && window.__templeWs.readyState === WebSocket.OPEN;
  });

  if (!isConnected) {
    log.error('Trình duyệt chưa kết nối được đến máy chủ chùa. Vui lòng kiểm tra lại mạng.');
    return;
  }

  log.success('Đã kết nối máy chủ thành công bên trong Chrome!');

  // Hàm helper gửi lệnh qua WebSocket của trang
  const sendInPage = async (payload) => {
    return page.evaluate((msg) => {
      if (window.__templeWs && window.__templeWs.readyState === WebSocket.OPEN) {
        window.__templeWs.send(JSON.stringify(msg));
        return true;
      }
      return false;
    }, payload);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const safeDelay = async (actionDesc) => {
    const min = (config.minDelaySec || 3.5) * 1000;
    const max = (config.maxDelaySec || 6.5) * 1000;
    const delay = Math.floor(min + Math.random() * (max - min));
    log.info(`⏳ ${actionDesc} (chờ ${(delay / 1000).toFixed(1)}s tự nhiên)...`);
    await sleep(delay);
  };

  const runOfficialMeditation = async (seconds) => {
    // Meditation is a game UI state: the official client emits state=sit with its real
    // world coordinates only after the user chooses "Ngồi thiền tại chỗ". A bare
    // WebSocket visit/claim does not start a valid sitting session.
    const requestJournal = async () => {
      const previousUpdates = await page.evaluate(() => window.__journalUpdateCount || 0);
      if (!(await sendInPage({ t: 'journal' }))) throw new Error('WebSocket chưa sẵn sàng để đọc journal.');
      await page.waitForFunction(
        previous => (window.__journalUpdateCount || 0) > previous,
        { timeout: 7000 },
        previousUpdates
      );
      return page.evaluate(() => window.__journalData);
    };
    const requestMerit = async () => {
      const previousUpdates = await page.evaluate(() => window.__meritUpdateCount || 0);
      if (!(await sendInPage({ t: 'merit' }))) throw new Error('WebSocket chưa sẵn sàng để đọc merit.');
      await page.waitForFunction(
        previous => (window.__meritUpdateCount || 0) > previous,
        { timeout: 7000 },
        previousUpdates
      );
      return page.evaluate(() => window.__meritData);
    };

    const journalBefore = await requestJournal().catch(() => null);
    const started = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find(item => item.innerText?.includes('Động tác'));
      if (!button) return false;
      button.click();
      return true;
    });
    if (!started) throw new Error('Không tìm thấy nút Động tác trong giao diện game; chưa bắt đầu thiền.');

    await page.waitForFunction(
      () => [...document.querySelectorAll('.moves button')]
        .some(item => item.innerText?.includes('Ngồi thiền tại chỗ')),
      { timeout: 7000 }
    );
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.moves button')]
        .find(item => item.innerText?.includes('Ngồi thiền tại chỗ'));
      button?.click();
    });

    // The official HUD renders "Đứng dậy" only after the game client enters sit state.
    await page.waitForFunction(
      () => [...document.querySelectorAll('button')]
        .some(item => item.innerText?.includes('Đứng dậy')),
      { timeout: 7000 }
    );
    log.success('Game UI xác nhận nhân vật đã vào trạng thái ngồi thiền hợp lệ.');

    let activeMs = 0;
    let lastLoggedSecond = -1;
    while (activeMs < seconds * 1000) {
      if (options.shouldStop?.()) {
        await page.evaluate(() => [...document.querySelectorAll('button')]
          .find(item => item.innerText?.includes('Đứng dậy'))?.click());
        throw new Error('Tác vụ đã bị dừng bởi người dùng.');
      }
      const wasConnected = await page.evaluate(
        () => window.__templeWs?.readyState === WebSocket.OPEN
      );
      await sleep(1000);
      const isConnectedNow = await page.evaluate(
        () => window.__templeWs?.readyState === WebSocket.OPEN
      );
      if (wasConnected && isConnectedNow) activeMs += 1000;

      const elapsed = Math.floor(activeMs / 1000);
      if (elapsed > 0 && elapsed % 30 === 0 && elapsed !== lastLoggedSecond) {
        lastLoggedSecond = elapsed;
        log.info(`Thiền định qua giao diện game: ${elapsed}s / ${seconds}s; thời gian mất kết nối không tính.`);
      }
    }

    // Ask the server for a fresh journal before eligible claims, then only claim quests
    // whose server snapshot says they are ready and not already claimed.
    const merit = await requestMerit().catch(() => null);
    const eligibleIds = await page.evaluate(() => {
      const groups = [
        ...(window.__meritData?.quests || []),
        ...(window.__meritData?.weekly || []),
        ...(window.__meritData?.newbie || [])
      ];
      return groups
        .filter(item => (item.id === 'ngoi' || item.id?.startsWith('ngoi') || item.id === 'wNgoi')
          && item.have >= item.need && !item.claimed)
        .map(item => item.id);
    });
    for (const questId of eligibleIds) {
      await sendInPage({ t: 'claim', q: questId });
      await sleep(500);
    }
    const meritAfterClaims = eligibleIds.length ? await requestMerit().catch(() => null) : merit;
    if (eligibleIds.length && meritAfterClaims) {
      const groups = [
        ...(meritAfterClaims.quests || []),
        ...(meritAfterClaims.weekly || []),
        ...(meritAfterClaims.newbie || [])
      ];
      const confirmed = eligibleIds.filter(id => groups.some(item => item.id === id && item.claimed));
      log.info(`Claim được server xác nhận: ${confirmed.length}/${eligibleIds.length} nhiệm vụ đủ điều kiện.`);
    }

    const journalAfter = await requestJournal().catch(() => null);
    const sitBefore = Number(journalBefore?.sitMin);
    const sitAfter = Number(journalAfter?.sitMin);
    if (Number.isFinite(sitBefore) && Number.isFinite(sitAfter) && sitAfter > sitBefore) {
      log.success(`Journal xác nhận thời gian ngồi tĩnh tăng ${sitBefore} -> ${sitAfter} phút.`);
    } else {
      log.warn(`Đã ngồi ${seconds}s theo UI nhưng journal chưa xác nhận tăng (trước: ${Number.isFinite(sitBefore) ? sitBefore : 'không có baseline'}, sau: ${Number.isFinite(sitAfter) ? sitAfter : 'không có snapshot'}).`);
    }

    const closeEvents = await page.evaluate(() => window.__wsCloseEvents || []);
    const policyCloses = closeEvents.filter(event => event.code === 1008);
    if (policyCloses.length) {
      log.warn(`Trong phiên có ${policyCloses.length} lần WebSocket đóng mã 1008; xem log/reconnect của game để chẩn đoán.`);
    } else {
      log.success('Không ghi nhận WebSocket close mã 1008 trong phiên thiền này.');
    }
    if (!merit) log.warn('Chưa nhận được snapshot merit mới; trạng thái claim cần đối soát lại.');
    return {
      verified: Number.isFinite(sitBefore) && Number.isFinite(sitAfter) && sitAfter > sitBefore,
      sitMinBefore: Number.isFinite(sitBefore) ? sitBefore : null,
      sitMinAfter: Number.isFinite(sitAfter) ? sitAfter : null,
      policyCloseCount: policyCloses.length
    };
  };

  log.temple('🎬', `Bắt đầu tự động thực hiện các nhiệm vụ (bạn hãy quan sát màn hình Chrome 3D)...`);

  try {
    if (taskToRun === 'meditate' || taskToRun === 'ngoi') {
      const requestedSeconds = Number(options.seconds ?? process.env.DIDENCHUA_MEDITATE_SECONDS ?? config.meditateSeconds ?? 3600);
      if (!Number.isInteger(requestedSeconds) || requestedSeconds < 60 || requestedSeconds > 7200) {
        throw new Error('Thời lượng thiền phải là số nguyên từ 60 đến 7200 giây.');
      }
      const meditationResult = await runOfficialMeditation(requestedSeconds);
      log.success(`Hoàn tất lượt thiền ${requestedSeconds}s qua giao diện game; Chrome vẫn mở để bạn kiểm tra.`);
      if (options.closeBrowserAfterTask) await browser.close();
      return meditationResult;
    }

    // 1. Điểm danh
    await safeDelay('kiểm tra điểm danh hàng ngày');
    await sendInPage({ t: 'claim-le' });
    log.temple('📅', 'Đã kiểm tra điểm danh trên màn hình Chrome.');

    // 2. Dâng hương
    if (taskToRun === 'all' || taskToRun === 'huong' || taskToRun === 'incense') {
      await safeDelay('tiến lại gần lư hương chánh điện');
      log.temple('🪔', 'Dâng một nén hương tâm nguyện…');
      await sendInPage({ t: 'incense' });
      await safeDelay('chắp tay cầu nguyện');
      await sendInPage({ t: 'claim', q: 'huong' });
    }

    // 3. Thả hoa đăng
    if (taskToRun === 'all' || taskToRun === 'den' || taskToRun === 'lantern') {
      await safeDelay('đi dạo ra bến hồ thả hoa đăng sen');
      log.temple('🏮', 'Thả một ngọn hoa đăng sen cầu an…');
      await sendInPage({ t: 'lantern', color: 'vang', text: 'Cầu cho muôn người bình an, vạn sự hanh thông' });
      await safeDelay('dõi theo ngọn hoa đăng');
      await sendInPage({ t: 'claim', q: 'den' });
    }

    // 4. Chắp tay chào một bạn đồng tu
    if (taskToRun === 'all' || taskToRun === 'chao' || taskToRun === 'greet') {
      await safeDelay('tìm một bạn đồng tu trong chùa để chào hỏi');
      const targetPeer = await page.evaluate(() => {
        return window.__peersList && window.__peersList.length > 0 ? window.__peersList[0].id : null;
      });
      if (targetPeer) {
        log.temple('🙏', `Chắp tay chào bạn đồng tu #${targetPeer}…`);
        await sendInPage({ t: 'greet', to: targetPeer });
        await sendInPage({ t: 'emote', e: 'chap' });
        await safeDelay('cung kính cúi đầu');
        await sendInPage({ t: 'claim', q: 'chao' });
      }
    }

    // 5. Làm việc công quả (quét sân, thả cá, thắp đèn)
    if (taskToRun === 'all' || taskToRun === 'chores' || taskToRun === 'viec' || taskToRun === 'quet') {
      log.temple('🧹', 'Làm việc công quả trên chùa:');
      await safeDelay('quét lá rụng ngoài sân chùa');
      await sendInPage({ t: 'emote', e: 'quet' });
      await safeDelay('chổi quét lá xào xạc sạch bóng sân chùa');
      await sendInPage({ t: 'viec', k: 'quet' });

      if (taskToRun !== 'quet') {
        await safeDelay('cho đàn cá ở hồ sen ăn bánh');
        await sendInPage({ t: 'viec', k: 'ca' });

        await safeDelay('thắp đèn dầu chánh điện');
        await sendInPage({ t: 'lamp' });

        await safeDelay('chăm sóc chú mèo chùa');
        await sendInPage({ t: 'pet-feed' });
        await sleep(1500);
        await sendInPage({ t: 'pet-pat' });
      }
    }

    // 6. Gõ mõ tụng kinh
    if (taskToRun === 'all' || taskToRun === 'mo') {
      log.temple('🪵', 'Gõ mõ tụng kinh (bạn sẽ nghe âm thanh trực tiếp trên Chrome):');
      for (let i = 1; i <= 15; i++) {
        await sendInPage({ t: 'mo', n: 1 });
        log.info(`...cốc cốc [${i}/15 tiếng]`);
        await sleep(Math.floor(2000 + Math.random() * 1000));
      }
    }

    // 7. Lăn chuỗi tràng hạt
    if (taskToRun === 'all' || taskToRun === 'chuoi' || taskToRun === 'beads') {
      log.temple('📿', 'Lăn chuỗi tràng hạt niệm Phật:');
      for (let i = 1; i <= 10; i++) {
        await sendInPage({ t: 'beads', n: 1 });
        log.info(`...Nam Mô A Di Đà Phật [${i}/10 hạt]`);
        await sleep(Math.floor(1800 + Math.random() * 800));
      }
    }

    // 8. Thỉnh chuông
    if (taskToRun === 'all' || taskToRun === 'chuong' || taskToRun === 'bell') {
      await safeDelay('tiến lại giá đại hồng chung');
      log.temple('🔔', 'Thỉnh một tiếng đại hồng chung ngân vang…');
      await sendInPage({ t: 'bell' });
      await safeDelay('lắng nghe tiếng chuông');
    }

    // 9. Tự động nhận thưởng tất cả nhiệm vụ
    log.info('Kiểm tra và nhận thưởng tất cả nhiệm vụ đã xong...');
    await sendInPage({ t: 'claim', q: 'huong' });
    await sleep(600);
    await sendInPage({ t: 'claim', q: 'den' });
    await sleep(600);
    await sendInPage({ t: 'claim', q: 'chao' });
    await sleep(600);
    await sendInPage({ t: 'claim', q: 'ngoi' });
    await sleep(1000);

    // Lấy thông tin công đức cuối cùng từ màn hình
    const currentMerit = await page.evaluate(() => window.__meritData);
    if (currentMerit) {
      log.success(`HOÀN THÀNH TẤT CẢ! Tổng công đức hiện tại: ${currentMerit.total} (Cấp: ${currentMerit.level})`);
    } else {
      log.success('HOÀN THÀNH TẤT CẢ NHIỆM VỤ THÀNH CÔNG!');
    }

    log.temple('✨', 'Cửa sổ trình duyệt vẫn đang mở để bạn tự do ngắm cảnh hoặc đi dạo.');
    log.info('Nhấn Ctrl+C trong cửa sổ terminal này khi muốn đóng trình duyệt.');

  } catch (err) {
    log.error('Lỗi trong quá trình điều khiển trình duyệt:', err.message);
    if (options.closeBrowserAfterTask) {
      try { await browser.close(); } catch {}
    }
    if (taskToRun === 'meditate' || taskToRun === 'ngoi') throw err;
  }
}

if (process.argv[1]?.endsWith('watch.js')) {
  const task = process.argv[2] || 'all';
  runWatch(task, process.argv[3] ? { seconds: Number(process.argv[3]) } : {});
}

