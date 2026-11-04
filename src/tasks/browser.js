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

export async function openTempleBrowser(options = {}) {
  const config = loadConfig();
  const chromePath = findChromePath(config.chromePath);

  if (!chromePath) {
    log.error('Không tìm thấy đường dẫn Google Chrome!');
    log.warn('Vui lòng mở file config.json và điền đường dẫn chromePath của máy bạn.');
    return;
  }

  const isHeadless = options.headless || process.argv.includes('--headless');
  const targetRoom = config.room || 'chua-1';
  const targetUrl = `https://didenchua.online/?phong=${encodeURIComponent(targetRoom)}`;

  log.temple('🌐', `Đang khởi chạy trình duyệt (${isHeadless ? 'chạy ẩn' : 'có giao diện xem'})...`);
  log.info(`Dùng Chrome tại: ${chromePath}`);
  log.info(`Tài khoản: "${config.name}" (CID: ${config.cid})`);
  log.info(`Địa chỉ: ${targetUrl}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: isHeadless,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,800',
      '--autoplay-policy=no-user-gesture-required'
    ]
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());

  // Đồng bộ CID và thông tin nhân vật từ file cấu hình vào LocalStorage trước khi tải trang
  await page.evaluateOnNewDocument((cid, profile) => {
    localStorage.setItem('anduyen.cid', cid);
    if (profile) {
      localStorage.setItem('anduyen.profile', JSON.stringify(profile));
    }
  }, config.cid, {
    name: config.name,
    kind: config.kind,
    robe: config.robe,
    skin: config.skin,
    bio: config.bio,
    beads: config.beads,
    cushion: config.cushion
  });

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log.success('Đã tải không gian chùa 3D thành công!');
    
    if (!isHeadless) {
      log.temple('👀', 'Cửa sổ trình duyệt đang mở. Bạn có thể tự do ngắm cảnh, di chuyển hoặc xem nhân vật của mình.');
      log.info('Nhấn Ctrl+C trong cửa sổ lệnh terminal này khi muốn đóng trình duyệt.');
    } else {
      await new Promise(r => setTimeout(r, 4000));
      await page.screenshot({ path: 'temple-preview.png' });
      log.success('Đã lưu ảnh chụp không gian chùa vào file: temple-preview.png');
      await browser.close();
      process.exit(0);
    }
  } catch (err) {
    log.error('Lỗi khi mở trang chùa:', err.message);
  }
}

if (process.argv[1]?.endsWith('browser.js')) {
  openTempleBrowser();
}
