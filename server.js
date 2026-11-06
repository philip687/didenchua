import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runAllQuests } from './src/tasks/all.js';
import {
  DiDenChuaClient,
  CALLIGRAPHY_WORDS,
  BUDDHIST_SUTRAS,
  ROBES_CATALOG,
  BEADS_CATALOG,
  CUSHIONS_CATALOG,
  PHAPKHI_CATALOG,
  PETS_CATALOG,
  AM_SLOTS,
  AM_ITEMS
} from './src/client.js';
import { TEMPLE_MAP } from './src/map.js';
import { runMeditateWithClient } from './src/tasks/meditate.js';
import { runQuizWithClient } from './src/tasks/quiz.js';
import { AutonomousBot } from './src/auto/index.js';
import { log, setLogHook } from './src/logger.js';
import { notifyRunResult } from './src/notify.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';

// URL ứng dụng công khai (dùng để ping giữ thức Render Free Tier từ router ngoại vi)
const PUBLIC_APP_URL = (
  process.env.RENDER_EXTERNAL_URL
  || process.env.PUBLIC_URL
  || process.env.APP_URL
  || (process.env.RENDER_SERVICE_NAME ? `https://${process.env.RENDER_SERVICE_NAME}.onrender.com` : '')
  || 'https://didenchua-bot.onrender.com'
).replace(/\/+$/, '');

// File lưu trữ bộ nhớ đệm trạng thái (Persistence Cache) để khi mở report không phải kết nối game
const CACHE_STATE_FILE = path.join(process.cwd(), '.cached_state.json');

// Cấu hình mã bảo mật & xác thực (Priority 1)
const AUTH_TOKEN = (process.env.AUTH_TOKEN || process.env.CRON_SECRET || process.env.ADMIN_KEY || '').trim();
let CSRF_TOKEN = '';
try {
  if (fs.existsSync(CACHE_STATE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE_STATE_FILE, 'utf-8'));
    if (raw && typeof raw.csrfToken === 'string' && raw.csrfToken.length === 64) {
      CSRF_TOKEN = raw.csrfToken;
    }
  }
} catch {}
if (!CSRF_TOKEN) {
  CSRF_TOKEN = crypto.randomBytes(32).toString('hex');
}

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

  // 2. Cho phép Same-Origin fetch từ trình duyệt (Sec-Fetch-Site là header cấm spoofing của browser)
  const secFetchSite = req.headers['sec-fetch-site'];
  const reqHost = req.headers['host'];
  const reqOrigin = req.headers['origin'];
  if (secFetchSite === 'same-origin' && reqHost && reqOrigin) {
    try {
      const originHost = new URL(reqOrigin).host;
      if (originHost === reqHost) {
        return true;
      }
    } catch {}
  }

  // 3. Cron/API bên ngoài luôn phải có token cấu hình; dashboard browser đã đi qua nhánh CSRF / Same-Origin ở trên.
  // Không dùng query string vì URL thường bị lưu trong log, lịch sử và proxy.
  if (!AUTH_TOKEN) {
    return false;
  }

  // 4. Chỉ nhận token từ các HTTP headers an toàn.
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

// Danh mục toàn bộ các nhiệm vụ & công đức chùa chia theo 5 nhóm khoa học:
// 1. group: 'daily' (Tầng 1: Nhiệm vụ hàng ngày me.quests)
// 2. group: 'milestone' (Tầng 2: Mốc tu tập & thành tựu vĩnh viễn journal)
// 3. group: 'spiritual' (Tầng 3: Không gian tâm linh - Am riêng & Pháp đường, Khoe thành tích, Bản đồ 3D)
// 4. group: 'extra' (Tầng 4: Vườn sen & Tùy hỷ công đức)
// 5. group: 'zen-ai' (Tầng 5: Tĩnh tâm thiền định & Trí tuệ AI Gemini Flash)
export const TASKS_CATALOG = [
  // --- CỖ MÁY TỰ CHƠI THÔNG MINH (AUTONOMOUS AI) ---
  {
    id: 'auto',
    group: 'daily',
    title: 'Tự Chơi Thông Minh',
    desc: 'Cỗ máy tự chơi tự động nhận diện công đức/tiến độ, tự đổi việc khi bão hòa, cày mốc tích luỹ và canh đúng giờ thắp đèn & đố vui',
    icon: '🤖',
    reward: 'Toàn diện',
    badge: 'Autonomous AI'
  },
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
    desc: 'Đến gác chuông (x:-12.8, z:52) thỉnh một tiếng đại hồng chung ngân vang',
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
    desc: 'Đến Chánh điện gõ mõ tụng kinh hoàn thành nhiệm vụ ngày (108 tiếng hoặc tự chọn)',
    icon: '🪵',
    reward: '+30 điểm',
    badge: 'Nhiệm vụ ngày',
    hasCount: true,
    defaultCount: 108,
    countOptions: [
      { value: 30, label: '30 tiếng (Khởi tâm)' },
      { value: 54, label: '54 tiếng (Nửa khóa)' },
      { value: 108, label: '108 tiếng (Chuẩn khóa lễ 🏆)' },
      { value: 216, label: '216 tiếng (2 khóa lễ)' },
      { value: 300, label: '300 tiếng (Sám hối)' },
      { value: 1080, label: '1.080 tiếng (Đại khóa lễ 🏆)' }
    ]
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
    desc: 'Đến lều Thầy đồ xin chữ thư pháp đầu ngày (chọn 1 chữ hoặc xin đủ 12 chữ)',
    icon: '✍️',
    reward: '+25 điểm',
    badge: 'Nhiệm vụ ngày',
    hasWish: true,
    defaultWish: 'all',
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
    id: 'checkin',
    group: 'daily',
    questId: 'checkin',
    title: 'Điểm Danh Hàng Ngày',
    desc: 'Điểm danh đầu ngày tại cổng chùa nhận phước lành và quà điểm danh',
    icon: '📅',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'ca',
    group: 'daily',
    questId: 'ca',
    title: 'Cho Cá Hồ Sen Ăn',
    desc: 'Cho đàn cá vàng hồ sen ăn và phóng sinh tạo phước duyên',
    icon: '🐟',
    reward: '+10 điểm',
    badge: 'Nhiệm vụ ngày'
  },
  {
    id: 'dendau',
    group: 'daily',
    questId: 'dendau',
    title: 'Thắp Đèn Dầu Chánh Điện',
    desc: 'Châm dầu và thắp sáng ngọn đèn nơi chánh điện (Khung giờ: 16:30 - 21:30 UTC+7)',
    icon: '🕯️',
    reward: '+10 điểm',
    badge: '16:30-21:30'
  },
  {
    id: 'cat',
    group: 'daily',
    questId: 'cat',
    title: 'Chăm Sóc Mèo Chùa',
    desc: 'Âu yếm, vuốt ve chăm sóc chú mèo ngoan của chùa',
    icon: '🐱',
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
    title: 'Gõ Mõ Tụng Kinh Tự Do',
    desc: 'Gõ mõ theo nhịp thong thả tự nhiên (nhập số tiếng tùy ý hoặc chọn gợi ý)',
    icon: '🪵',
    reward: 'Tụng kinh',
    badge: 'Tu tập',
    hasCount: true,
    defaultCount: 108,
    countOptions: [
      { value: 30, label: '30 tiếng (Khởi tâm)' },
      { value: 54, label: '54 tiếng (Nửa khóa)' },
      { value: 108, label: '108 tiếng (Chuẩn khóa lễ 🏆)' },
      { value: 216, label: '216 tiếng (2 khóa lễ)' },
      { value: 300, label: '300 tiếng (Sám hối)' },
      { value: 540, label: '540 tiếng (Tinh tấn)' },
      { value: 1080, label: '1.080 tiếng (Đại khóa lễ 🏆)' }
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

  // --- TẦNG 3: KHÔNG GIAN TÂM LINH (AM RIÊNG & PHÁP ĐƯỜNG) ---
  {
    id: 'am',
    group: 'spiritual',
    questId: 'wAm',
    title: 'Vào Am Riêng Tu Tập & Dâng Hương',
    desc: 'Bước vào tịnh xá am riêng tu tập (x:3000, z:3000), dâng 3 nén tâm hương hoàn thành quest tuần',
    icon: '🛖',
    reward: '+40đ & Quest tuần',
    badge: 'Tịnh xá riêng'
  },
  {
    id: 'phapduong',
    group: 'spiritual',
    title: 'Vào Pháp Đường Nghe Pháp & Tọa Thiền',
    desc: 'Bước vào đại giảng đường Pháp đường (x:-3006, z:3006) nghe thuyết pháp và thiền định',
    icon: '🏛️',
    reward: 'Thuyết pháp',
    badge: 'Đại giảng đường',
    hasDuration: true
  },
  {
    id: 'khoe',
    group: 'spiritual',
    title: 'Khoe Thành Tích Tu Tập',
    desc: 'Khoe thành tích tu tập lên cộng đồng chùa, lan tỏa hoan hỷ (+10 công đức)',
    icon: '📢',
    reward: '+10 điểm',
    badge: 'Cộng đồng'
  },
  {
    id: 'teleport',
    group: 'spiritual',
    title: 'Dịch Chuyển Đến Địa Điểm Chùa (Goto)',
    desc: 'Di chuyển tức thời đến bất kỳ địa điểm nào trong 17 thắng cảnh chùa 3D',
    icon: '🗺️',
    reward: 'Thăm quan',
    badge: 'Bản đồ 3D',
    hasPlace: true
  },

  // --- TẦNG 4: VƯỜN SEN & TÙY HỶ CÔNG ĐỨC (EXTRA) ---
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
    title: 'Tàng Kinh Các & Xin Chữ Thư Pháp',
    desc: 'Viếng Tàng Kinh Các nghe trọn bộ 6 bài kinh và xin chữ thư pháp Thầy đồ',
    icon: '✍️',
    reward: 'Kinh & Thư pháp',
    badge: 'Tàng Kinh Các',
    hasWish: true,
    defaultWish: 'all',
    wishOptions: CALLIGRAPHY_WORDS
  },
  {
    id: 'tangkinh',
    group: 'extra',
    questId: 'wDoc',
    title: 'Tàng Kinh Các (Nghe Trọn Bộ 6 Bài Kinh)',
    desc: 'Lắng nghe trọn vẹn 6 bài kinh điển giác ngộ và hoàn tất thời khóa',
    icon: '📖',
    reward: 'Trọn bộ 6 bài kinh',
    badge: 'Tàng Kinh Các'
  },
  {
    id: 'chu-all',
    group: 'extra',
    questId: 'chu',
    title: 'Xin Trọn Bộ 12 Chữ Thư Pháp',
    desc: 'Đến lều Thầy đồ xin đủ toàn bộ 12 chữ cát tường cất vào Tủ chữ',
    icon: '📜',
    reward: 'Trọn bộ 12 chữ',
    badge: 'Tủ chữ'
  },

  // --- TẦNG 5: TĨNH TÂM THIỀN ĐỊNH & TRÍ TUỆ AI (ZEN & WISDOM) ---
  {
    id: 'meditate',
    group: 'zen-ai',
    title: 'Ngồi Thiền Tĩnh Tâm Vườn Thiền',
    desc: 'Đến Vườn thiền tọa thiền tĩnh tâm (5-120 phút), tự động duy trì kết nối chống rớt mạng',
    icon: '🧘',
    reward: 'Tĩnh tọa',
    badge: 'Treo máy',
    hasDuration: true
  },
  {
    id: 'quiz',
    group: 'zen-ai',
    title: 'Đố Vui Phật Pháp (Gemini Flash AI)',
    desc: 'Giải trắc nghiệm Phật học bằng Gemini AI + Ngân hàng 166 câu chùa (Ôn tập hoặc Thi đấu 20:00)',
    icon: '🧠',
    reward: '+60đ & Top 1',
    badge: 'Trí tuệ AI'
  },

  // --- TÙY CHỈNH DIỆN MẠO & DANH HIỆU (PROFILE CUSTOM) ---
  {
    id: 'title',
    group: 'profile',
    title: 'Đổi Danh Hiệu Nhân Vật',
    desc: 'Đeo danh hiệu cao quý đã mở khóa (Ngàn lạy, Trăm chuỗi, Tinh tấn, Bách lạy...)',
    icon: '🏅',
    reward: 'Danh xưng',
    badge: 'Danh hiệu'
  },
  {
    id: 'equip',
    group: 'profile',
    title: 'Đổi Trang Phục & Pháp Bảo',
    desc: 'Thay áo tràng, đổi chuỗi hạt tử đàn, đổi bồ đoàn lá sen và cầm thiền trượng',
    icon: '🥼',
    reward: 'Pháp bảo',
    badge: 'Bộ sưu tập'
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
  activeRun: null,
  runHistory: [],
  currentLogs: []
};

function loadCachedState() {
  try {
    if (fs.existsSync(CACHE_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_STATE_FILE, 'utf-8'));
      if (data.merit) state.merit = data.merit;
      if (data.journal) state.journal = data.journal;
      if (data.lastUpdated) state.lastUpdated = data.lastUpdated;
      if (Array.isArray(data.runHistory) && data.runHistory.length > 0) {
        state.runHistory = data.runHistory;
      }
      if (Array.isArray(data.currentLogs) && data.currentLogs.length > 0) {
        state.currentLogs = data.currentLogs;
      }
      // Phát hiện tiến trình bị gián đoạn do máy chủ Render Free tự động tắt (spindown) sau 15 phút không có người xem
      if (data.activeRun && data.activeRun.runId) {
        const interruptedTask = data.activeRun.taskTitle || data.activeRun.taskId || 'Nhiệm vụ';
        const interruptedMsg = `Tiến trình [${interruptedTask}] trước đó đã bị gián đoạn do máy chủ Render Free tự động tắt (spindown) sau 15 phút không có người xem.`;
        addWebLog(`⚠️ ${interruptedMsg}`, 'warn', '⚠️');
        state.runHistory.unshift({
          id: data.activeRun.runId,
          runId: data.activeRun.runId,
          triggerSource: data.activeRun.runTriggerSource || 'Manual / Web',
          task: data.activeRun.taskId,
          taskTitle: interruptedTask,
          startedAt: data.activeRun.startedAt || new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationSeconds: data.activeRun.startedAt ? Math.round((Date.now() - new Date(data.activeRun.startedAt).getTime()) / 1000) : 0,
          status: 'stopped',
          step: 'render_spindown',
          message: interruptedMsg,
          verificationStatus: 'unverified',
          verificationDetail: 'Bị ngắt bởi cơ chế tiết kiệm tài nguyên của Render Free.'
        });
        if (state.runHistory.length > 15) state.runHistory.pop();
        state.activeRun = null;
        saveCachedState();
      }
    }
  } catch (err) {
    log.warn('Không thể nạp file cache trạng thái:', err.message);
  }
}

function saveCachedState() {
  try {
    fs.writeFileSync(CACHE_STATE_FILE, JSON.stringify({
      lastUpdated: state.lastUpdated,
      merit: state.merit,
      journal: state.journal,
      activeRun: state.activeRun || null,
      currentLogs: state.currentLogs.slice(0, 50),
      runHistory: state.runHistory.slice(0, 15),
      csrfToken: CSRF_TOKEN
    }, null, 2), 'utf-8');
  } catch (err) {
    log.warn('Không thể lưu file cache trạng thái:', err.message);
  }
}

// Nạp cache trạng thái ngay khi khởi tạo server (tránh gọi refreshAccountData gây tranh session)
loadCachedState();

// Ghi log vào bộ nhớ đệm theo cấu trúc sự kiện chuẩn (SYSTEM_LOG_REPORT)
let logSaveTimer = null;
function scheduleCacheSave() {
  if (logSaveTimer) return;
  logSaveTimer = setTimeout(() => {
    logSaveTimer = null;
    saveCachedState();
  }, 2000);
}

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
  scheduleCacheSave();
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
    saveCachedState();

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
  state.activeRun = {
    runId,
    taskId,
    taskTitle,
    startedAt: new Date().toISOString(),
    runTriggerSource: triggerSource
  };
  saveCachedState();

  const startedAt = new Date().toISOString();
  addWebLog(`⚡ [${runId}] Khởi động tác vụ: ${taskTitle} (Nguồn: ${triggerSource})...`, 'info', '⚡');
  const startTime = Date.now();

  let routineResult = null;
  let runStatus = 'success';
  let safeErrorMessage = null;
  let errorStep = null;
  let keepAliveTimer = null;

  try {
    // Tự động ping keep-alive mỗi 3 phút tới URL công khai HTTPS để Render Router nhận diện traffic và reset bộ đếm 15 phút
    const keepAliveUrl = `${PUBLIC_APP_URL}/health`;
    addWebLog(`📡 Kích hoạt cơ chế tự giữ thức Render: định kỳ ping ${keepAliveUrl}...`, 'info', '📡');
    keepAliveTimer = setInterval(async () => {
      try {
        const resp = await fetch(keepAliveUrl);
        if (resp.ok) {
          log.info(`[Keep-Alive] Đã gửi tín hiệu giữ thức tới ${keepAliveUrl} thành công.`);
        }
      } catch (pingErr) {
        fetch(`http://127.0.0.1:${PORT}/health`).catch(() => {});
      }
    }, 180000); // 3 phút / lần (timeout của Render là 15 phút)

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

    const clientOpts = (runOptions.turbo || runOptions.fast) ? { turbo: true } : {};

    if (taskId === 'all') {
      const initClient = new DiDenChuaClient(clientOpts);
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
      const client = new DiDenChuaClient(clientOpts);
      state.activeClient = client;
      await client.connect(8000);
      log.temple('⚡', `[${runId}] Bắt đầu thực thi nhiệm vụ riêng lẻ: [${taskTitle}]...`);

      switch (taskId) {
        case 'auto':
        case 'selfplay':
          log.temple('🤖', `[${runId}] Khởi động Cỗ máy Tự chơi Thông minh (Autonomous Bot)...`);
          // Reuse the already connected client, but pass its resolved config so
          // dashboard runs honour milestone targets and register the 1008
          // single-session guard before any Auto action is sent.
          const autoBot = new AutonomousBot({ client, mode: 'once', config: client.config });
          await autoBot.initClient();
          await autoBot.runDailyProbingPhase();
          await autoBot.runClaimPhase();
          await autoBot.checkAndRunScheduledTasks();
          await autoBot.runAccumulationPhase();
          break;
        case 'ngoi-daily':
          const activeNgoi = (client.merit?.me?.quests || []).find(q => q.id === 'ngoi' || q.id.startsWith('ngoi'));
          const needNgoiSecs = activeNgoi && !activeNgoi.claimed ? Math.max(300, (activeNgoi.need - (activeNgoi.have || 0)) * 60) : 300;
          await runMeditateWithClient(client, runOptions.meditateSeconds || needNgoiSecs, runOptions);
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
          await client.doLay(needLay, runOptions);
          break;
        case 'tung': {
          const activeTung = (client.merit?.me?.quests || []).find(q => q.id === 'tung');
          const defaultNeed = activeTung && !activeTung.claimed ? Math.max(1, activeTung.need - (activeTung.have || 0)) : 108;
          const needTung = (runOptions.count && runOptions.count > 0) ? runOptions.count : defaultNeed;
          await client.doMo(needTung);
          break;
        }
        case 'tuoi':
          await client.doGarden({ autoWaterOthers: true });
          break;
        case 'chu':
          await client.doXinChu(runOptions.wish || client.config.calligraphyWish || 'all');
          break;
        case 'chu-all':
        case 'xinchu-all':
          await client.doXinAllChu();
          break;
        case 'lay':
          const bowsCount = runOptions.count || 18;
          await client.doLay(bowsCount, runOptions);
          break;
        case 'greet':
          await client.doGreet();
          break;
        case 'lantern-daily':
          await client.doLantern(runOptions.text || 'Cầu cho muôn người bình an, vạn sự hanh thông', 'vang', runOptions.count || 1);
          break;
        case 'checkin':
          log.temple('📅', 'Tiến hành điểm danh ngày mới...');
          await client.doCheckin();
          log.success('Đã hoàn tất điểm danh hôm nay!');
          break;
        case 'ca':
        case 'viec-ca':
          log.temple('🐟', 'Cho đàn cá ở hồ sen ăn & phóng sinh...');
          client.send({ t: 'viec', k: 'ca' });
          await client.sleep(1200);
          log.success('Đã cho đàn cá hồ sen ăn thành công!');
          break;
        case 'dendau':
        case 'lamp':
          log.temple('🕯️', 'Thắp đèn dầu chánh điện...');
          client.send({ t: 'lamp' });
          await client.sleep(1200);
          log.success('Đã thắp đèn dầu chánh điện!');
          break;
        case 'cat':
        case 'pet':
          log.temple('🐱', 'Chăm sóc và vuốt ve mèo chùa...');
          await client.doPet();
          log.success('Đã chăm sóc mèo chùa chu đáo!');
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
          await client.doMo(runOptions.count || 108);
          break;
        case 'beads':
        case 'chuoi':
          const beadsCount = runOptions.count || 108;
          await client.doBeads(beadsCount);
          break;
        case 'farm-bows-beads':
          const farmBows = runOptions.bowsCount ?? runOptions.count ?? 18;
          const farmBeads = runOptions.beadsCount ?? 108;
          log.temple('📿', `[Cày tự động] Bắt đầu chu trình tự động Chuỗi hạt & Lạy Phật (${farmBows} lạy, ${farmBeads} hạt tràng)...`);
          if (farmBows > 0) {
            log.temple('🙏', `[1/2] Tiến hành cày ${farmBows} lạy Phật sám hối...`);
            await client.doLay(farmBows, runOptions);
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
          await client.doSecrets(runOptions.wish || client.config.calligraphyWish || 'all');
          break;
        case 'tangkinh':
        case 'kinh':
        case 'nghekinh':
          await client.doTangKinhCac(runOptions.sutra || 'all');
          break;
        case 'visit':
          await client.doVisitAll();
          break;
        case 'meditate':
          const secs = runOptions.meditateSeconds || 300;
          await runMeditateWithClient(client, secs, runOptions);
          break;
        case 'quiz':
          await runQuizWithClient(client, runOptions);
          break;
        case 'am':
        case 'wAm':
          log.temple('🛖', 'Bước vào Am riêng tu tập...');
          await client.doEnterAm();
          await client.sleep(1000);
          log.temple('🪔', 'Dâng 3 nén tâm hương trong am riêng...');
          await client.doAmIncense();
          await client.sleep(1000);
          await client.doLeaveAm();
          log.success('Hoàn tất thời khóa tu tập trong am riêng!');
          break;
        case 'phapduong':
          const pMinutes = runOptions.durationMin || (runOptions.meditateSeconds ? Math.round(runOptions.meditateSeconds / 60) : 1);
          const pSeconds = Math.max(10, pMinutes * 60);
          log.temple('🏛️', `Bước vào Pháp đường tu tập trong ${pMinutes} phút (${pSeconds}s)...`);
          await client.doEnterPhapDuong();
          const pStart = Date.now();
          let pLast = 0;
          while ((Date.now() - pStart) / 1000 < pSeconds) {
            client.checkAborted();
            const el = Math.floor((Date.now() - pStart) / 1000);
            if (el - pLast >= 15) {
              log.info(`Pháp đường: Đã tĩnh tâm ${Math.floor(el / 60)}p${el % 60}s / ${pMinutes} phút...`);
              pLast = el;
            }
            await client.sleep(1000);
          }
          await client.doLeavePhapDuong();
          log.success(`Đã hoàn tất thời khóa tu tập tại Pháp đường (${pMinutes} phút)!`);
          break;
        case 'khoe':
          log.temple('📢', 'Khoe thành tích tu tập lên kênh đại chúng...');
          await client.doKhoe();
          await client.sleep(1000);
          log.success('Đã khoe thành tích thành công (+10 điểm công đức)!');
          break;
        case 'teleport':
          const placeId = runOptions.placeId || 'san-chua';
          const targetPlace = TEMPLE_MAP.places.find(p => p.id === placeId) || TEMPLE_MAP.places[0];
          log.temple('🚶', `Di chuyển đến: [${targetPlace.name}] (${targetPlace.desc})...`);
          const pos = targetPlace.teleportPos || targetPlace.pos;
          client.send({ t: 'goto', x: pos.x, y: pos.y, z: pos.z });
          await client.sleep(1200);
          log.success(`Đã đến [${targetPlace.name}] (Khu vực: ${targetPlace.zone})!`);
          break;
        case 'title':
          const titleId = runOptions.titleId || runOptions.title || 'ngan-lay';
          log.temple('🏅', `Cài đặt danh hiệu nhân vật thành: [${titleId}]...`);
          await client.setTitle(titleId);
          await client.sleep(600);
          log.success(`Đã đổi danh hiệu thành công sang: [${titleId}]!`);
          break;
        case 'equip':
          const lookOpts = {
            robe: runOptions.robe,
            beads: runOptions.beads,
            cushion: runOptions.cushion,
            phapkhi: runOptions.phapkhi,
            bio: runOptions.bio
          };
          log.temple('🥼', 'Áp dụng bộ trang phục & pháp bảo mới...');
          await client.setLook(lookOpts);
          await client.sleep(800);
          log.success('Đã cập nhật trang phục và pháp bảo thành công!');
          break;
        default:
          throw new Error(`Nhiệm vụ không xác định: ${taskId}`);
      }

      // Tự động nhận thưởng nếu nhiệm vụ này hoàn thành quest ngày hoặc quest tuần
      if (['bell', 'vow', 'incense', 'lay-daily', 'lay', 'greet', 'lantern-daily', 'chores-daily', 'xam', 'chores', 'quet', 'farm-bows-beads', 'tung', 'tuoi', 'chu', 'garden', 'tuyhy', 'secrets', 'tangkinh', 'chu-all', 'meditate', 'ngoi-daily', 'quiz', 'am', 'khoe', 'checkin', 'ca', 'dendau', 'cat', 'wAm', 'chuoi'].includes(taskId)) {
        await client.sleep(client.isTurbo() ? 80 : 300);
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
      } else if (taskId === 'khoe') {
        verificationStatus = 'verified';
        verificationDetail = postMeritTotal > preMeritTotal
          ? `Máy chủ đã ghi nhận khoe thành tích (+${postMeritTotal - preMeritTotal} công đức).`
          : 'Đã phát lời thông tri thành tích tu tập lên toàn chùa.';
      } else if (taskId === 'am') {
        verificationStatus = 'verified';
        verificationDetail = 'Đã hoàn tất thời khóa viếng thăm và dâng hương tại am riêng tu tập.';
      } else if (taskId === 'phapduong') {
        verificationStatus = 'verified';
        verificationDetail = 'Đã hoàn tất thời khóa tọa thiền nghe giảng tại Pháp đường.';
      } else if (taskId === 'teleport') {
        verificationStatus = 'verified';
        verificationDetail = 'Đã dịch chuyển thành công đến thắng cảnh chùa.';
      } else if (taskId === 'title') {
        verificationStatus = 'verified';
        verificationDetail = 'Đã cập nhật danh hiệu nhân vật thành công.';
      } else if (taskId === 'equip') {
        verificationStatus = 'verified';
        verificationDetail = 'Đã lưu trang phục và pháp bảo mới vào hồ sơ nhân vật.';
      } else if (taskId === 'auto' || taskId === 'selfplay') {
        // A completed JavaScript routine only proves that requests returned;
        // mark Auto verified only when the post-run snapshot shows a change.
        const autoQuestChanged = postQuests.some((postQ) => {
          const preQ = preQuests.find((preQItem) => preQItem.id === postQ.id);
          return Boolean(preQ && (
            postQ.have > preQ.have
            || (postQ.claimed && !preQ.claimed)
          ));
        });
        const autoSnapshotChanged = postMeritTotal > preMeritTotal
          || postBows > preBows
          || postBeads > preBeads
          || postIncense > preIncense
          || postLanterns > preLanterns
          || postSitMin > preSitMin
          || postVisited > preVisited
          || autoQuestChanged;
        verificationStatus = autoSnapshotChanged ? 'verified' : 'unverified';
        verificationDetail = autoSnapshotChanged
          ? `Snapshot máy chủ ghi nhận thay đổi sau chu kỳ Tự chơi (+${postMeritTotal - preMeritTotal} công đức).`
          : 'Chu kỳ Tự chơi đã gửi xong nhưng snapshot sau chạy chưa chứng minh thay đổi từ máy chủ.';
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
    state.activeRun = null;
    saveCachedState();
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
  const me = state.merit?.me || {};
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

  if (task.group === 'spiritual') {
    if (task.id === 'am') {
      const wAm = (me.weekly || []).find(q => q.id === 'wAm');
      if (wAm?.claimed) return '<span class="badge badge-done">✅ Quest tuần đã nhận</span>';
      if (wAm && wAm.have >= wAm.need) return '<span class="badge badge-ready">🎁 Quest tuần chờ nhận</span>';
      return '<span class="badge badge-wait">⏳ Quest tuần (0/1)</span>';
    }
    if (task.id === 'khoe') {
      return '<span class="badge" style="background:rgba(103,185,130,0.2); color:var(--success);">+10 công đức</span>';
    }
    if (task.id === 'phapduong') {
      return '<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">Đại giảng đường</span>';
    }
    if (task.id === 'teleport') {
      return '<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">17 địa điểm 3D</span>';
    }
  }

  if (task.id === 'meditate') {
    const sitMin = journal?.sitMin;
    return sitMin !== undefined && sitMin !== null
      ? `<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(sitMin)}/60 phút ${sitMin >= 60 ? '🏆' : ''}</span>`
      : '';
  }

  if (task.id === 'quiz') {
    return '<span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">Gemini Flash AI</span>';
  }

  return '';
}

// Từ điển thông tin chi tiết nhiệm vụ ngày & tuần (Icons, tiêu đề đầy đủ, gợi ý hành động, mốc thời gian)
export const QUEST_METADATA = {
  checkin: {
    icon: '📅',
    title: 'Điểm danh hàng ngày',
    desc: 'Đến cổng chùa điểm danh đầu ngày nhận phước lành',
    tip: 'Tự động mở đầu ngày tu tập',
    taskId: 'checkin'
  },
  huong: {
    icon: '🪔',
    title: 'Dâng hương Tam Bảo',
    desc: 'Thắp nén tâm hương thành kính trước Phật đài chánh điện',
    tip: 'Dâng 1 nén hương thanh tịnh',
    taskId: 'incense'
  },
  den: {
    icon: '🏮',
    title: 'Thả hoa đăng cầu an',
    desc: 'Thả hoa đăng sen trôi trên hồ nước cầu nguyện bình an',
    tip: 'Thả hoa đăng trên hồ sen',
    taskId: 'lantern-daily'
  },
  chao: {
    icon: '🤝',
    title: 'Chắp tay chào đồng tu',
    desc: 'Chắp tay trang nghiêm niệm Phật chào bạn đồng tu tại chùa',
    tip: 'Chào bạn đồng tu đang viếng chùa',
    taskId: 'greet'
  },
  lay: {
    icon: '🙇',
    title: 'Lạy Phật trang nghiêm',
    desc: 'Cúi đầu đảnh lễ Đức Phật sám hối nghiệp chướng',
    tip: 'Lạy Phật theo số lượng yêu cầu của ngày',
    taskId: 'lay-daily'
  },
  quet: {
    icon: '🧹',
    title: 'Quét lá dọn sân chùa',
    desc: 'Cầm chổi quét sạch lá rụng thanh tịnh khuôn viên chùa',
    tip: 'Công quả quét sân giữ chùa sạch đẹp',
    taskId: 'quet'
  },
  ca: {
    icon: '🐟',
    title: 'Cho cá hồ sen ăn',
    desc: 'Thả thức ăn và phóng sinh đàn cá bơi lội hồ sen',
    tip: 'Cho đàn cá hồ sen ăn tích phước',
    taskId: 'ca'
  },
  dendau: {
    icon: '🕯️',
    title: 'Thắp đèn dầu chánh điện',
    desc: 'Châm dầu và thắp sáng ngọn đèn dầu nơi gian chánh điện',
    tip: '⏰ Khung giờ linh thiêng: 16:30 – 21:30 (UTC+7)',
    taskId: 'dendau'
  },
  cat: {
    icon: '🐱',
    title: 'Chăm sóc mèo chùa',
    desc: 'Vuốt ve, chăm sóc chú mèo ngoan của chùa',
    tip: 'Chăm sóc chú mèo nhỏ chốn thiền môn',
    taskId: 'cat'
  },
  wAm: {
    icon: '🛖',
    title: 'Am riêng tu tập & Dâng hương',
    desc: 'Vào am thất riêng tĩnh tọa tu tập và dâng 3 nén tâm hương',
    tip: 'Tu tập nơi tịnh thất (+40 điểm công đức)',
    taskId: 'am'
  },
  am: {
    icon: '🛖',
    title: 'Am riêng tu tập & Dâng hương',
    desc: 'Vào am thất riêng tĩnh tọa tu tập và dâng 3 nén tâm hương',
    tip: 'Tu tập nơi tịnh thất (+40 điểm công đức)',
    taskId: 'am'
  },
  ngoi: {
    icon: '🧘',
    title: 'Ngồi tĩnh tọa thiền định',
    desc: 'Ngồi xếp bằng tĩnh tâm tại Vườn thiền (5 phút)',
    tip: 'Giữ tâm an định không dao động trong 5 phút',
    taskId: 'ngoi-daily'
  },
  tung: {
    icon: '🪵',
    title: 'Gõ mõ tụng kinh',
    desc: 'Đến chánh điện gõ mõ tụng thời kinh sám hối',
    tip: 'Gõ mõ tụng kinh trang nghiêm',
    taskId: 'tung'
  },
  mo: {
    icon: '🪵',
    title: 'Gõ mõ tụng kinh',
    desc: 'Đến chánh điện gõ mõ tụng thời kinh sám hối',
    tip: 'Gõ mõ tụng kinh trang nghiêm',
    taskId: 'tung'
  },
  chuoi: {
    icon: '📿',
    title: 'Lăn tràng hạt niệm Phật',
    desc: 'Lăn tràng hạt lần từng hạt niệm Phật A Di Đà',
    tip: 'Lần tràng hạt thanh tịnh tâm ý',
    taskId: 'beads'
  },
  chu: {
    icon: '✍️',
    title: 'Xin chữ Thầy đồ',
    desc: 'Ghé gian lều Thầy đồ xin chữ thư pháp may mắn đầu ngày',
    tip: 'Xin chữ bình an hoặc xin trọn bộ 12 chữ cát tường',
    taskId: 'chu'
  },
  'chu-all': {
    icon: '📜',
    title: 'Xin trọn bộ 12 chữ Thầy đồ',
    desc: 'Ghé lều Thầy đồ xin đủ toàn bộ 12 chữ cát tường cất vào Tủ chữ',
    tip: 'Xin trọn vẹn 12 bức thư pháp may mắn',
    taskId: 'chu-all'
  },
  wDoc: {
    icon: '📖',
    title: 'Đọc kinh Tàng Kinh Các',
    desc: 'Đến Tàng Kinh Các đọc kinh điển và lời Phật dạy',
    tip: 'Viếng Tàng Kinh Các đọc lời Phật dạy',
    taskId: 'tangkinh'
  },
  tangkinh: {
    icon: '📖',
    title: 'Tàng Kinh Các & Thư Viện Kinh Điển',
    desc: 'Lắng nghe trọn bộ 6 bài kinh điển giác ngộ chốn thiền môn',
    tip: 'Nghe đủ 6 bài kinh điển và hoàn tất thời khóa',
    taskId: 'tangkinh'
  },
  kinh: {
    icon: '📖',
    title: 'Nghe kinh điển giác ngộ',
    desc: 'Lắng nghe lời Phật dạy và tụng niệm kinh điển',
    tip: 'Nghe kinh điển giác ngộ chốn thiền môn',
    taskId: 'tangkinh'
  },
  chuong: {
    icon: '🔔',
    title: 'Thỉnh chuông Bát Nhã',
    desc: 'Đến gác chuông thỉnh một tiếng đại hồng chung ngân vang',
    tip: 'Thỉnh tiếng chuông thức tỉnh nhân tâm',
    taskId: 'bell'
  },
  bell: {
    icon: '🔔',
    title: 'Thỉnh chuông Bát Nhã',
    desc: 'Đến gác chuông thỉnh một tiếng đại hồng chung ngân vang',
    tip: 'Thỉnh tiếng chuông thức tỉnh nhân tâm',
    taskId: 'bell'
  },
  tuoi: {
    icon: '🪷',
    title: 'Tưới hoa vườn chùa',
    desc: 'Tưới nước chăm sóc các luống hoa dâng Phật trong vườn',
    tip: 'Tưới hoa dâng cúng Tam Bảo',
    taskId: 'tuoi'
  },
  khoe: {
    icon: '📢',
    title: 'Khoe danh hiệu tu tập',
    desc: 'Khoe danh hiệu hoặc thành tựu tu tập lên kênh đại chúng',
    tip: 'Chia sẻ niềm vui tu tập cùng đại chúng',
    taskId: 'khoe'
  },
  xam: {
    icon: '📜',
    title: 'Gieo quẻ xăm may mắn',
    desc: 'Lắc ống xăm may mắn đầu ngày cầu điềm lành cát tường',
    tip: 'Gieo quẻ xăm đầu ngày',
    taskId: 'xam'
  },
  tron: {
    icon: '🌟',
    title: 'Trọn vẹn ngày tu',
    desc: 'Hoàn thành tất cả thời khóa tu tập trong ngày',
    tip: 'Nhận phước đức viên mãn',
    taskId: 'claim'
  },
  viec: {
    icon: '🧹',
    title: 'Làm việc công quả',
    desc: 'Quét dọn sân chùa, làm việc công quả tích lũy phước đức',
    tip: 'Công quả chùa cảnh thanh tịnh',
    taskId: 'chores-daily'
  },
  vow: {
    icon: '🙏',
    title: 'Gửi lời nguyện chung',
    desc: 'Gửi một lời nguyện cầu bình an, an lạc tới cả chùa',
    tip: 'Thành tâm hướng về đại chúng',
    taskId: 'vow'
  },
  nguyen: {
    icon: '🙏',
    title: 'Gửi lời nguyện chung',
    desc: 'Gửi một lời nguyện cầu bình an, an lạc tới cả chùa',
    tip: 'Thành tâm hướng về đại chúng',
    taskId: 'vow'
  }
};

// Tạo mã HTML Dashboard an toàn chống XSS (Priority 2 & SYSTEM_LOG_REPORT)
export function renderDashboardHTML() {
  const isRunning = state.isRunning;
  const isStopping = state.isStopping;
  const isAnyRunning = isRunning || isStopping;

  const me = state.merit?.me || {};
  const j = state.journal || {};
  const journal = j;
  const displayName = j.name || me.name || process.env.NAME || 'Phật Tử';
  const rawUser = (j.user && j.user !== 'null') ? j.user : ((me.user && me.user !== 'null') ? me.user : null);
  const userTag = rawUser ? `<span>(@${escapeHTML(rawUser)})</span>` : '';
  const clientConfigBio = me.bio || j.bio || process.env.BIO || 'Không thích nói xấu vừa thỉnh chuông';

  // Dữ liệu thiếu phải hiện là thiếu, không dùng giá trị mẫu làm báo cáo thật.
  const reportValue = value => value === null || value === undefined ? 'Chưa có dữ liệu' : escapeHTML(value);
  const currentTotal = me.total !== null && me.total !== undefined ? me.total : j.merit;
  const nextTarget = me.next !== null && me.next !== undefined ? me.next : j.next;
  const fromTarget = Number(me.from ?? j.from ?? 0);
  const nextLevelPoints = nextTarget !== null && nextTarget !== undefined && currentTotal !== null && currentTotal !== undefined
    && Number.isFinite(Number(nextTarget)) && Number.isFinite(Number(currentTotal))
    ? Number(nextTarget) - Number(currentTotal)
    : null;
  const meritProgressPercent = (nextTarget && currentTotal)
    ? Math.min(100, Math.max(0, Math.round(((Number(currentTotal) - fromTarget) / (Number(nextTarget) - fromTarget || 1)) * 100)))
    : 0;

  // Trang bị hiện tại của nhân vật
  const robeKey = j.robe || 'nau';
  const robeName = ROBES_CATALOG[robeKey]?.name || 'Áo nâu';
  const beadsKey = j.beadsKey || (j.items?.includes('tuDan') ? 'tuDan' : 'go');
  const beadsName = BEADS_CATALOG[beadsKey]?.name || 'Tràng hạt gỗ';
  const cushionKey = j.cushionKey || (j.items?.includes('laSen') ? 'laSen' : 'xam');
  const cushionName = CUSHIONS_CATALOG[cushionKey]?.name || 'Bồ đoàn xám';
  const phapkhiKey = j.phapkhiKey || (j.phapkhi?.includes('truong') ? 'truong' : (j.phapkhi?.[0] || 'huong'));
  const phapkhiName = PHAPKHI_CATALOG[phapkhiKey]?.name || 'Thiền trượng chín khoen';
  const petKey = j.pet || null;
  const petName = petKey && PETS_CATALOG[petKey] ? PETS_CATALOG[petKey].name : 'Chưa có';

  // Danh hiệu hiện tại
  const activeTitleId = j.title || me.title || 'moi';
  const activeTitleObj = (j.titles || []).find(t => t.id === activeTitleId);
  const activeTitleName = activeTitleObj ? activeTitleObj.name : 'Người mới lên chùa';

  // Nhiệm vụ hàng ngày (me.quests) với đầy đủ biểu tượng, tên, mô tả, mẹo thời gian, thanh tiến độ và nút bấm hành động trực tiếp
  const quests = me.quests || [];
  const totalQuests = quests.length;
  const claimedQuests = quests.filter(q => q.claimed).length;
  const readyQuests = quests.filter(q => !q.claimed && (q.have || 0) >= (q.need || 1)).length;
  const totalRewardPossible = quests.reduce((acc, q) => acc + (Number(q.reward) || 0), 0);
  const earnedReward = quests.filter(q => q.claimed).reduce((acc, q) => acc + (Number(q.reward) || 0), 0);
  const overallPercent = totalQuests > 0 ? Math.round((claimedQuests / totalQuests) * 100) : 0;

  const questsSummaryHTML = totalQuests > 0 ? `
    <div class="quests-summary-card">
      <div class="quests-summary-top">
        <div>
          <span class="metric-label">Tiến độ hôm nay</span>
          <b class="metric-val">${claimedQuests} / ${totalQuests} hoàn thành (${overallPercent}%)</b>
        </div>
        <div style="text-align:right;">
          <span class="metric-label">Công đức nhiệm vụ</span>
          <b class="metric-val" style="color:var(--gold);">+${earnedReward} / ${totalRewardPossible} điểm</b>
        </div>
      </div>
      <div class="quest-progress-track">
        <div class="quest-progress-fill ${overallPercent === 100 ? 'fill-done' : 'fill-pending'}" style="width: ${overallPercent}%;"></div>
      </div>
      ${readyQuests > 0 ? `
        <div class="quests-claim-banner">
          <span>🎉 Có <b>${readyQuests}</b> nhiệm vụ đã xong chưa nhận thưởng!</span>
          <button class="btn-task btn-quick-claim" onclick="runTask('claim')" ${isAnyRunning ? 'disabled' : ''}>🎁 Nhận Tất Cả Quà</button>
        </div>
      ` : ''}
    </div>
  ` : '';

  const questsListHTML = quests.map(q => {
    const meta = QUEST_METADATA[q.id] || {};
    const title = q.name || q.title || meta.title || q.id;
    const icon = meta.icon || '📋';
    const desc = meta.desc || '';
    const tip = meta.tip || '';
    const taskId = meta.taskId || q.id;
    const have = Number(q.have) || 0;
    const need = Math.max(1, Number(q.need) || 1);
    const percent = Math.min(100, Math.round((have / need) * 100));

    let actionBtn = '';
    let statusClass = 'quest-pending';
    let fillClass = 'fill-pending';

    if (q.claimed) {
      statusClass = 'quest-done';
      fillClass = 'fill-done';
      actionBtn = `<span class="badge badge-done">✅ Đã hoàn thành</span>`;
    } else if (have >= need) {
      statusClass = 'quest-ready';
      fillClass = 'fill-ready';
      actionBtn = `<button class="btn-task btn-quick-claim" onclick="runTask('claim')" ${isAnyRunning ? 'disabled' : ''} title="Nhận phần thưởng công đức">🎁 Nhận (+${escapeHTML(q.reward)}đ)</button>`;
    } else {
      actionBtn = `<button class="btn-task btn-quick-run" onclick="runTask('${escapeHTML(taskId)}')" ${isAnyRunning ? 'disabled' : ''} title="Làm nhiệm vụ này ngay">⚡ Làm ngay</button>`;
    }

    return `
      <div class="quest-card ${statusClass}">
        <div class="quest-main-row">
          <div class="quest-left">
            <div class="quest-icon">${icon}</div>
            <div class="quest-info">
              <div class="quest-title-row">
                <span class="quest-name">${escapeHTML(title)}</span>
                <span class="quest-reward-pill">+${escapeHTML(q.reward)} điểm</span>
              </div>
              ${desc ? `<div class="quest-desc">${escapeHTML(desc)}</div>` : ''}
              ${tip ? `<div class="quest-tip">${escapeHTML(tip)}</div>` : ''}
            </div>
          </div>
          <div class="quest-action-col">
            ${actionBtn}
          </div>
        </div>
        <div class="quest-progress-container">
          <div class="quest-progress-label">
            <span>Tiến độ: <b>${escapeHTML(have)} / ${escapeHTML(need)}</b></span>
            <span>${percent}%</span>
          </div>
          <div class="quest-progress-track">
            <div class="quest-progress-fill ${fillClass}" style="width: ${percent}%;"></div>
          </div>
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang đồng bộ nhiệm vụ từ máy chủ chùa…</p>';

  const questsHTML = questsSummaryHTML + questsListHTML;

  // 10 Nhiệm vụ tuần (Weekly Quests)
  const weeklyQuestsHTML = (me.weekly || []).map(q => {
    const badge = q.claimed
      ? '<span class="badge badge-done">✅ Đã nhận</span>'
      : (q.have >= q.need ? '<span class="badge badge-ready">🎁 Chờ nhận</span>' : `<span class="badge badge-wait">⏳ ${escapeHTML(q.have)}/${escapeHTML(q.need)}</span>`);
    const title = q.name || q.title || q.id;
    return `
      <div class="quest-item">
        <div class="quest-title">${escapeHTML(title)}</div>
        <div class="quest-meta">
          <span class="quest-reward">+${escapeHTML(q.reward)}đ</span>
          ${badge}
        </div>
      </div>`;
  }).join('') || '<p class="empty">Đang đồng bộ nhiệm vụ tuần…</p>';

  // 12 Pháp khí chùa (6/12 đã mở khóa)
  const unlockedPhapkhiSet = new Set(j.phapkhi || ['huong', 'gio', 'gaytruc', 'mo', 'trentram', 'truong']);
  const phapkhiListHTML = Object.entries(PHAPKHI_CATALOG).map(([key, item]) => {
    const isUnlocked = unlockedPhapkhiSet.has(key);
    const isEquipped = key === phapkhiKey;
    return `
      <div class="phapkhi-card ${isUnlocked ? 'phapkhi-unlocked' : 'phapkhi-locked'} ${isEquipped ? 'phapkhi-equipped' : ''}">
        <div class="phapkhi-icon">${isUnlocked ? '🏆' : '🔒'}</div>
        <div class="phapkhi-info">
          <div>
            <b>${escapeHTML(item.name)}</b>
            ${isEquipped ? '<span class="badge" style="background:var(--gold); color:#1c150e; margin-left:4px;">Đang dùng</span>' : ''}
            <span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-dim); margin-left:4px;">${escapeHTML(item.rank || 'Pháp khí')}</span>
          </div>
          <small style="color:${isUnlocked ? 'var(--gold-dim)' : 'var(--text-dim)'};">${escapeHTML(item.how || 'Nhiệm vụ tu tập')}</small>
        </div>
      </div>`;
  }).join('');

  // 12 Chữ thư pháp Thầy Đồ (Bộ sưu tập Tủ chữ)
  const calligraphyCardsHTML = CALLIGRAPHY_WORDS.map((w, idx) => {
    return `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(233,194,122,0.2); border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; justify-content:space-between; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span style="font-size:11px; color:var(--text-dim); font-family:monospace;">#${idx + 1}</span>
            <div style="font-size:16px; font-weight:700; color:var(--gold); font-family:'Noto Serif', serif; letter-spacing:1px; margin-top:1px;">
              ✍️ ${escapeHTML(w.text)}
            </div>
          </div>
          <span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold); font-size:10px; padding:2px 6px;">
            ${escapeHTML(w.wish)}
          </span>
        </div>
        <p style="font-size:11px; color:var(--text-dim); margin:0; line-height:1.45; font-style:italic;">
          "${escapeHTML(w.meaning)}"
        </p>
        <div style="margin-top:4px; display:flex; justify-content:flex-end;">
          <button type="button" class="btn-task btn-run" onclick="runTask('chu', { wish: '${escapeHTML(w.id)}' })" style="font-size:11px; padding:3px 8px; border-radius:4px;" ${isAnyRunning ? 'disabled' : ''}>
            ✍️ Xin chữ
          </button>
        </div>
      </div>
    `;
  }).join('');

  // 6 Bài kinh điển trong Tàng Kinh Các & Thư Viện Kinh Điển
  const sutrasCardsHTML = BUDDHIST_SUTRAS.map((s, idx) => {
    return `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(233,194,122,0.2); border-radius:10px; padding:10px 12px; display:flex; flex-direction:column; justify-content:space-between; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <span style="font-size:11px; color:var(--text-dim); font-family:monospace;">#${idx + 1}</span>
            <div style="font-size:15px; font-weight:700; color:var(--gold); margin-top:1px;">
              📖 ${escapeHTML(s.title)}
            </div>
          </div>
          <span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold); font-size:10px; padding:2px 6px;">
            ⏱️ ${escapeHTML(s.duration)}
          </span>
        </div>
        <p style="font-size:11px; color:var(--text-dim); margin:0; line-height:1.45;">
          ${escapeHTML(s.desc)}
        </p>
        <div style="margin-top:4px; display:flex; justify-content:flex-end;">
          <button type="button" class="btn-task btn-run" onclick="runTask('tangkinh', { sutra: '${escapeHTML(s.id)}' })" style="font-size:11px; padding:3px 8px; border-radius:4px;" ${isAnyRunning ? 'disabled' : ''}>
            📖 Nghe bài này
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Danh sách danh hiệu
  const unlockedTitlesHTML = (j.titles || []).filter(t => t.got).map(t => {
    const isCurrent = t.id === activeTitleId;
    return `
      <div class="title-card title-got ${isCurrent ? 'title-active' : ''}">
        <div class="title-icon">🏆</div>
        <div class="title-info">
          <b>${escapeHTML(t.name)} ${isCurrent ? '<span class="badge" style="background:var(--gold); color:#1c150e; margin-left:6px;">Đang mang</span>' : ''}</b>
          <small>${escapeHTML(t.desc)}</small>
        </div>
      </div>`;
  }).join('') || '<p class="empty">Chưa có danh hiệu mở khóa.</p>';

  const lockedTitlesHTML = (j.titles || []).filter(t => !t.got).map(t => {
    return `
      <div class="title-card title-locked">
        <div class="title-icon">🔒</div>
        <div class="title-info">
          <b>${escapeHTML(t.name)}</b>
          <small>${escapeHTML(t.desc)}</small>
        </div>
      </div>`;
  }).join('') || '<p class="empty">Bạn đã mở khóa toàn bộ danh hiệu!</p>';

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

  const currentRunningTaskName = state.runningTaskName || (state.runningTask === 'all' ? 'Toàn bộ chu trình tự động (4 Tầng)' : (state.runningTask ? `Nhiệm vụ [${state.runningTask}]` : 'Nhiệm vụ tự động'));
  const elapsedSec = isRunning && state.runStartTime ? Math.round((Date.now() - state.runStartTime) / 1000) : 0;

  // 17 Thắng cảnh bản đồ chùa 3D
  const mapPlacesHTML = TEMPLE_MAP.places.map(p => `
    <div class="map-card">
      <div>
        <b><span>${escapeHTML(p.name)}</span> <span class="badge" style="background:rgba(233,194,122,0.15); color:var(--gold);">${escapeHTML(p.zone)}</span></b>
        <p>${escapeHTML(p.desc)}</p>
        <div style="font-size:11px; color:var(--text-dim); margin-bottom:8px; font-family:monospace;">
          Tọa độ: (x: ${p.pos.x}, y: ${p.pos.y}, z: ${p.pos.z})
        </div>
      </div>
      <button type="button" class="btn-task btn-run" onclick="runTeleport('${escapeHTML(p.id)}')" style="align-self:flex-start; margin-top:4px;" ${isRunning || isStopping ? 'disabled' : ''}>
        🚀 Đến đây
      </button>
    </div>
  `).join('');

  const logsHTML = state.currentLogs.map(l => `<div><span style="color:var(--text-dim); margin-right:6px;">${escapeHTML(l.timeDisplay)}</span><span style="margin-right:4px;">${escapeHTML(l.icon || 'ℹ️')}</span>${escapeHTML(l.message)}</div>`).join('') || '<div>Hệ thống sẵn sàng. Đang chờ tác vụ…</div>';

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
              ${(journal?.beads || 0) < 10800 ? `<option value="${10800 - (journal?.beads || 0)}">Cày đủ 100 chuỗi (còn ${10800 - (journal?.beads || 0)} hạt 🏆)</option>` : ''}
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
      let smartOption = '';
      if (t.id === 'beads' && (journal?.beads || 0) < 10800) {
        smartOption = `<option value="${10800 - (journal?.beads || 0)}">Cày đủ 100 chuỗi (còn ${Math.ceil((10800 - (journal?.beads || 0)) / 108)} chuỗi = ${10800 - (journal?.beads || 0)} hạt 🏆)</option>`;
      } else if (t.id === 'tung') {
        const tungQ = (me?.quests || []).find(q => q.id === 'tung');
        if (tungQ && !tungQ.claimed && Number(tungQ.have || 0) < Number(tungQ.need || 108)) {
          const rem = Math.max(1, Number(tungQ.need || 108) - Number(tungQ.have || 0));
          smartOption = `<option value="${rem}">Làm đủ nhiệm vụ ngày (còn ${rem} tiếng 🎯)</option>`;
        }
      }

      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <input type="number" id="count_${escapeHTML(t.id)}" value="${t.defaultCount || 1}" min="1" max="20000"
            style="width:58px; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; text-align:center; font-weight:600;"
            placeholder="Số lượng"
            title="Nhập số lượng tùy ý"
            ${isAnyRunning ? 'disabled' : ''}>
          <select onchange="if(this.value){ document.getElementById('count_${escapeHTML(t.id)}').value = this.value; }"
            style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 6px; border-radius:6px; font-size:12px; cursor:pointer; max-width:145px;"
            ${isAnyRunning ? 'disabled' : ''}>
            <option value="" disabled selected>Gợi ý ▼</option>
            ${smartOption}
            ${(t.countOptions || []).map(opt => `<option value="${opt.value}">${escapeHTML(opt.label)}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (t.hasDuration) {
      const defaultDurationMin = t.id === 'meditate' ? 60 : 5;
      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <input type="number" id="duration_min_${escapeHTML(t.id)}" value="${defaultDurationMin}" min="1" max="120"
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
            <option value="120">120 phút</option>
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
            <option value="all" ${(!t.defaultWish || t.defaultWish === 'all') ? 'selected' : ''}>📜 Xin đủ 12 chữ (Trọn bộ)</option>
            ${(t.wishOptions || []).map(opt => `<option value="${opt.id}" ${opt.id === t.defaultWish ? 'selected' : ''}>${escapeHTML(opt.text)} (${escapeHTML(opt.wish)})</option>`).join('')}
          </select>
        </div>
      `;
    } else if (t.hasPlace) {
      inputControl = `
        <div style="display:flex; align-items:center; gap:5px; margin-right:4px;">
          <select id="place_${escapeHTML(t.id)}"
            style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:5px 8px; border-radius:6px; font-size:12px; cursor:pointer; font-weight:600; max-width:160px;"
            title="Chọn địa điểm muốn đến trên bản đồ chùa"
            ${isAnyRunning ? 'disabled' : ''}>
            ${TEMPLE_MAP.places.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} (${escapeHTML(p.zone)})</option>`).join('')}
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
  const spiritualTasksHTML = TASKS_CATALOG.filter(t => t.group === 'spiritual').map(renderTaskRow).join('');
  const extraTasksHTML = TASKS_CATALOG.filter(t => t.group === 'extra').map(renderTaskRow).join('');
  const zenAiTasksHTML = TASKS_CATALOG.filter(t => t.group === 'zen-ai').map(renderTaskRow).join('');

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
        <span style="color:var(--gold);">💡 Cơ chế tự giữ thức Render đang hoạt động (tự ping HTTPS mỗi 3 phút)</span>
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

    /* Quests Card Styling */
    .quests-summary-card {
      background: rgba(233, 194, 122, 0.05);
      border: 1px solid rgba(233, 194, 122, 0.2);
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 14px;
    }
    .quests-summary-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .metric-label {
      font-size: 11px;
      color: var(--text-dim);
      display: block;
      margin-bottom: 2px;
    }
    .metric-val {
      font-size: 13px;
      color: var(--text);
    }
    .quest-progress-track {
      height: 6px;
      background: rgba(0, 0, 0, 0.4);
      border-radius: 10px;
      overflow: hidden;
      width: 100%;
    }
    .quest-progress-fill {
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s ease;
    }
    .fill-done {
      background: var(--success);
    }
    .fill-ready {
      background: var(--gold);
    }
    .fill-pending {
      background: linear-gradient(90deg, var(--gold-dim), var(--gold));
    }
    .quests-claim-banner {
      background: rgba(233, 194, 122, 0.12);
      border: 1px solid rgba(233, 194, 122, 0.3);
      border-radius: 8px;
      padding: 8px 12px;
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      gap: 8px;
      flex-wrap: wrap;
    }
    .quest-card {
      background: rgba(0, 0, 0, 0.22);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 10px;
      transition: all 0.2s ease;
    }
    .quest-card:hover {
      border-color: rgba(233, 194, 122, 0.3);
    }
    .quest-card.quest-done {
      border-left: 3px solid var(--success);
      opacity: 0.88;
    }
    .quest-card.quest-ready {
      border-left: 3px solid var(--gold);
      background: rgba(233, 194, 122, 0.05);
    }
    .quest-card.quest-pending {
      border-left: 3px solid rgba(255, 255, 255, 0.15);
    }
    .quest-main-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
    }
    .quest-left {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      flex: 1;
    }
    .quest-icon {
      font-size: 22px;
      line-height: 1.2;
      min-width: 26px;
      text-align: center;
    }
    .quest-info {
      flex: 1;
    }
    .quest-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .quest-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
    }
    .quest-reward-pill {
      font-size: 11px;
      color: var(--gold);
      background: rgba(233, 194, 122, 0.12);
      padding: 2px 7px;
      border-radius: 6px;
      font-weight: 600;
      white-space: nowrap;
    }
    .quest-desc {
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 3px;
      line-height: 1.4;
    }
    .quest-tip {
      font-size: 11px;
      color: #e5c07b;
      margin-top: 2px;
      font-weight: 500;
    }
    .quest-action-col {
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }
    .btn-quick-claim {
      background: var(--gold);
      color: #1c150e;
      font-weight: 700;
      border: 1px solid var(--gold);
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: 0.15s;
    }
    .btn-quick-claim:hover:not(:disabled) {
      background: #ffe099;
      transform: translateY(-1px);
    }
    .btn-quick-run {
      background: rgba(233, 194, 122, 0.12);
      border: 1px solid rgba(233, 194, 122, 0.35);
      color: var(--gold);
      font-weight: 600;
      padding: 5px 11px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      transition: 0.15s;
    }
    .btn-quick-run:hover:not(:disabled) {
      background: var(--gold);
      color: #1c150e;
      transform: translateY(-1px);
    }
    .quest-progress-container {
      margin-top: 6px;
    }
    .quest-progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 4px;
    }
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
      .quest-main-row {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }
      .quest-action-col {
        align-self: flex-end;
      }
    }

    /* Hồ sơ tu tập 4 Tab */
    .profile-tab-bar {
      display: flex;
      background: rgba(0,0,0,0.3);
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 16px;
      gap: 4px;
      overflow-x: auto;
      border: 1px solid var(--card-border);
    }
    .profile-tab-btn {
      flex: 1;
      min-width: 120px;
      text-align: center;
      padding: 10px 14px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-dim);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }
    .profile-tab-btn:hover {
      color: var(--gold);
      background: rgba(233, 194, 122, 0.08);
    }
    .profile-tab-btn.active {
      background: var(--gold);
      color: #1c150e;
      box-shadow: 0 2px 8px rgba(233, 194, 122, 0.3);
    }
    .profile-tab-pane {
      display: none;
      animation: fadeIn 0.25s ease;
    }
    .profile-tab-pane.active {
      display: block;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Bong bóng tâm niệm / Status Quote */
    .quote-bubble {
      background: rgba(233, 194, 122, 0.1);
      border: 1px dashed rgba(233, 194, 122, 0.35);
      border-radius: 12px;
      padding: 10px 16px;
      margin-bottom: 16px;
      text-align: center;
      font-size: 13px;
      color: #ffd98d;
      font-style: italic;
    }

    /* Thanh tiến độ công đức */
    .progress-bar-container {
      background: rgba(0,0,0,0.35);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      height: 18px;
      overflow: hidden;
      margin: 8px 0 16px 0;
      position: relative;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #b8934d, #e9c27a, #ffd98d);
      border-radius: 10px;
      transition: width 0.4s ease;
    }
    .progress-bar-label {
      position: absolute;
      width: 100%;
      text-align: center;
      top: 0;
      left: 0;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      color: #1c150e;
      text-shadow: 0 0 2px rgba(255,255,255,0.6);
    }

    /* Lưới các ô trang bị (Gear Slots) */
    .gear-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .gear-card {
      background: rgba(0,0,0,0.22);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 10px;
      text-align: center;
      transition: border-color 0.2s;
    }
    .gear-card:hover {
      border-color: rgba(233, 194, 122, 0.4);
    }
    .gear-card .gear-icon {
      font-size: 24px;
      margin-bottom: 4px;
    }
    .gear-card .gear-type {
      font-size: 11px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .gear-card .gear-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--gold);
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Danh sách pháp khí 12 món */
    .phapkhi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .phapkhi-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--card-border);
    }
    .phapkhi-unlocked {
      background: rgba(233, 194, 122, 0.08);
      border-color: rgba(233, 194, 122, 0.3);
    }
    .phapkhi-locked {
      background: rgba(0,0,0,0.18);
      opacity: 0.65;
    }
    .phapkhi-equipped {
      border-color: var(--gold) !important;
      box-shadow: 0 0 10px rgba(233, 194, 122, 0.2);
    }
    .phapkhi-icon {
      font-size: 22px;
      flex-shrink: 0;
    }
    .phapkhi-info {
      flex: 1;
      min-width: 0;
    }
    .phapkhi-info b {
      font-size: 13px;
      color: var(--text);
      display: block;
    }
    .phapkhi-info small {
      font-size: 11px;
      line-height: 1.3;
      display: block;
    }

    /* Bản đồ 3D */
    .map-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .map-card {
      background: rgba(0,0,0,0.22);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .map-card b {
      color: var(--gold);
      font-size: 13px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .map-card p {
      font-size: 11px;
      color: var(--text-dim);
      margin: 6px 0 10px 0;
      line-height: 1.4;
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
        <label style="display:inline-flex; align-items:center; gap:6px; background:#221a14; border:1px solid #4a3828; padding:8px 12px; border-radius:10px; cursor:pointer; font-size:13px; color:#ffd54f; user-select:none;" title="Chế độ Siêu Tốc: Tối ưu hoá nhịp gửi gói tin, nén tối đa các khoảng dừng vô ích, hoàn thành nhiệm vụ chỉ trong vài giây">
          <input type="checkbox" id="turboModeToggle" style="cursor:pointer; accent-color:#ffd54f; width:16px; height:16px;" ${isRunning || isStopping ? 'disabled' : ''} />
          <span style="font-weight:600;">⚡ Siêu Tốc (Turbo)</span>
        </label>
        <select id="meditateSelect" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border); padding:9px 12px; border-radius:10px; font-size:13px; outline:none; cursor:pointer;" ${isRunning || isStopping ? 'disabled' : ''}>
          <option value="3600" selected>🧘 Thiền 60 phút (Cày Top 1)</option>
          <option value="1800">🧘 Thiền 30 phút (Cày Top)</option>
          <option value="300">🧘 Thiền 5 phút (Chuẩn)</option>
        </select>
        <button id="runBtn" class="btn" onclick="triggerRun()" ${isRunning || isStopping ? 'disabled' : ''}>
          ${isStopping ? '🛑 Đang dừng an toàn…' : (isRunning ? '⏳ Đang thực thi…' : '⚡ Chạy Toàn Bộ Chu Trình')}
        </button>
        <button id="autoPlayBtn" class="btn" onclick="runTask('auto')" style="background:linear-gradient(135deg, #1b3a4b, #2d5a88); color:#64b5f6; border:1px solid #42a5f5;" ${isRunning || isStopping ? 'disabled' : ''}>
          🤖 Kích Hoạt Tự Chơi
        </button>
        <button class="btn" onclick="runTask('khoe')" style="background:rgba(233,194,122,0.15); color:var(--gold); border:1px solid var(--card-border);" ${isRunning || isStopping ? 'disabled' : ''}>
          📢 Khoe (+10đ)
        </button>
        <button id="refreshBtn" class="btn" onclick="manualRefresh()" style="background:#2b221a; color:var(--gold); border:1px solid var(--card-border);" ${isRunning || isStopping ? 'disabled' : ''}>
          🔄 Làm Mới
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

    <!-- HỒ SƠ TU TẬP & BỘ SƯU TẬP NHÂN VẬT (4 TAB CHUẨN GIAO DIỆN CHÙA) -->
    <div class="card" id="card_profile_tabs" style="margin-bottom: 20px;">
      <div class="card-header-toggle" onclick="toggleSection('card_profile_tabs')">
        <h2>
          <span>🪷 Hồ Sơ Tu Tập & Bộ Sưu Tập (4 Tab)</span>
          <small style="font-size:12px; color:var(--text-dim); font-weight:normal;">Của tôi · Bộ sưu tập · Danh hiệu · Bản đồ & Tài khoản</small>
        </h2>
        <span class="chevron-icon">▼</span>
      </div>
      <div class="collapsible-content">
        <!-- 4 Tab Buttons -->
        <div class="profile-tab-bar">
          <button type="button" class="profile-tab-btn active" onclick="switchProfileTab('tab_my')">🧘 1. Của tôi</button>
          <button type="button" class="profile-tab-btn" onclick="switchProfileTab('tab_collection')">🥼 2. Bộ sưu tập</button>
          <button type="button" class="profile-tab-btn" onclick="switchProfileTab('tab_titles')">🏅 3. Danh hiệu</button>
          <button type="button" class="profile-tab-btn" onclick="switchProfileTab('tab_account_map')">🗺️ 4. Bản đồ & Tài khoản</button>
        </div>

        <!-- TAB 1: CỦA TÔI -->
        <div class="profile-tab-pane active" id="tab_my">
          <div class="quote-bubble">
            “${escapeHTML(clientConfigBio)}”
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
            <div>
              <b style="font-size:16px; color:var(--gold);">${escapeHTML(displayName)}</b>
              <span style="font-size:12px; color:var(--text-dim); margin-left:6px;">(@${escapeHTML(rawUser || 'phat-tu')})</span>
              <div style="font-size:12px; color:var(--text-dim); margin-top:2px;">
                Cấp bậc: <b style="color:var(--text);">${reportValue(me.level || j.level)} (Lv.${reportValue(me.lv ?? j.lv)})</b> · Danh hiệu: <b style="color:var(--gold);">${escapeHTML(activeTitleName)}</b>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button type="button" class="btn-task btn-run" onclick="runTask('auto')" style="background:linear-gradient(135deg, #1b3a4b, #2d5a88); color:#64b5f6; border:1px solid #42a5f5;" ${isRunning || isStopping ? 'disabled' : ''}>🤖 Tự chơi</button>
              <button type="button" class="btn-task btn-run" onclick="runTask('ngoi-daily')" ${isRunning || isStopping ? 'disabled' : ''}>🧘 Ngồi thiền</button>
              <button type="button" class="btn-task btn-run" onclick="runTask('greet')" ${isRunning || isStopping ? 'disabled' : ''}>🙏 Chắp tay</button>
              <button type="button" class="btn-task btn-run" onclick="runTask('khoe')" ${isRunning || isStopping ? 'disabled' : ''}>📢 Khoe (+10đ)</button>
              <button type="button" class="btn-task btn-run" onclick="runTask('am')" ${isRunning || isStopping ? 'disabled' : ''}>🛖 Vào Am</button>
              <button type="button" class="btn-task btn-run" onclick="runTask('phapduong')" ${isRunning || isStopping ? 'disabled' : ''}>🏛️ Pháp đường</button>
            </div>
          </div>

          <!-- 6 Ô Trang bị quanh nhân vật -->
          <div class="gear-grid">
            <div class="gear-card">
              <div class="gear-icon">👘</div>
              <div class="gear-type">Áo tràng</div>
              <div class="gear-name">${escapeHTML(robeName)}</div>
            </div>
            <div class="gear-card">
              <div class="gear-icon">📿</div>
              <div class="gear-type">Tràng hạt</div>
              <div class="gear-name">${escapeHTML(beadsName)}</div>
            </div>
            <div class="gear-card">
              <div class="gear-icon">🪷</div>
              <div class="gear-type">Bồ đoàn</div>
              <div class="gear-name">${escapeHTML(cushionName)}</div>
            </div>
            <div class="gear-card">
              <div class="gear-icon">⚔️</div>
              <div class="gear-type">Pháp khí</div>
              <div class="gear-name">${escapeHTML(phapkhiName)}</div>
            </div>
            <div class="gear-card">
              <div class="gear-icon">🐾</div>
              <div class="gear-type">Linh thú</div>
              <div class="gear-name">${escapeHTML(petName)}</div>
            </div>
            <div class="gear-card">
              <div class="gear-icon">🏅</div>
              <div class="gear-type">Danh hiệu</div>
              <div class="gear-name">${escapeHTML(activeTitleName)}</div>
            </div>
          </div>

          <!-- Thanh tiến độ công đức -->
          <div style="margin-top:14px;">
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
              <span><b>${reportValue(currentTotal)}</b> / ${reportValue(nextTarget)} công đức đến cấp tiếp theo</span>
              <span style="color:var(--gold);">${nextLevelPoints !== null ? `Còn ${reportValue(nextLevelPoints)} điểm` : ''}</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width: ${meritProgressPercent}%;"></div>
              <div class="progress-bar-label">${meritProgressPercent}%</div>
            </div>
          </div>

          <!-- 4 Thông số tu tập chính chuẩn Modal game -->
          <div class="stat-row" style="margin-top:12px;">
            <div class="stat-box">
              <b>${reportValue(j.bows)}</b>
              <span>Lạy Phật (Mốc 1.000 lạy 🏆)</span>
            </div>
            <div class="stat-box">
              <b>${reportValue(j.rounds)} chuỗi</b>
              <span>Tràng hạt (${reportValue(j.beads)} hạt niệm 🏆)</span>
            </div>
          </div>
          <div class="stat-row">
            <div class="stat-box">
              <b>${reportValue(j.sitMin)} phút</b>
              <span>Ngồi tĩnh tâm (Tĩnh tọa 🏆)</span>
            </div>
            <div class="stat-box">
              <b>${reportValue(j.streak ?? me.days)} ngày</b>
              <span>Ngày liên tiếp (Kỷ lục ${reportValue(j.best ?? 3)})</span>
            </div>
          </div>

          <!-- 10 Nhiệm Vụ Tuần (Weekly Quests) -->
          <div style="margin-top:16px; border-top:1px solid var(--card-border); padding-top:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <b style="font-size:13px; color:var(--gold);">📅 Nhiệm Vụ Tuần (10 Mục Tiêu Tu Tập)</b>
              <span style="font-size:11px; color:var(--text-dim);">Được làm mới hàng tuần</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:8px;">
              ${weeklyQuestsHTML}
            </div>
          </div>
        </div>

        <!-- TAB 2: BỘ SƯU TẬP -->
        <div class="profile-tab-pane" id="tab_collection">
          <p style="font-size:12px; color:var(--text-dim); margin-bottom:12px;">
            Kho tàng pháp bảo, áo tràng, tràng hạt và 12 pháp khí tu tập chùa An Tự Duyên. Bạn đã mở khóa <b>${unlockedPhapkhiSet.size}/12</b> pháp khí cao quý!
          </p>

          <h3 style="font-size:13px; color:var(--gold); margin-bottom:10px;">⚔️ 12 Pháp Khí Chùa (Đã mở ${unlockedPhapkhiSet.size}/12)</h3>
          <div class="phapkhi-grid">
            ${phapkhiListHTML}
          </div>

          <!-- Form Thay Đổi Diện Mạo & Trang Bị -->
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--card-border); padding:14px; border-radius:12px; margin-top:16px;">
            <h3 style="color:var(--gold); font-size:14px; margin-bottom:10px;">🛠️ Thay Đổi Diện Mạo & Trang Bị Nhân Vật</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:12px;">
              <div>
                <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:4px;">Áo tràng:</label>
                <select id="equip_robe" style="width:100%; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 8px; border-radius:6px; font-size:12px;">
                  ${Object.entries(ROBES_CATALOG).map(([k, v]) => `<option value="${k}" ${k === robeKey ? 'selected' : ''}>${escapeHTML(v.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:4px;">Tràng hạt:</label>
                <select id="equip_beads" style="width:100%; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 8px; border-radius:6px; font-size:12px;">
                  ${Object.entries(BEADS_CATALOG).map(([k, v]) => `<option value="${k}" ${k === beadsKey ? 'selected' : ''}>${escapeHTML(v.name)} ${v.special ? `(${v.special})` : ''}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:4px;">Bồ đoàn:</label>
                <select id="equip_cushion" style="width:100%; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 8px; border-radius:6px; font-size:12px;">
                  ${Object.entries(CUSHIONS_CATALOG).map(([k, v]) => `<option value="${k}" ${k === cushionKey ? 'selected' : ''}>${escapeHTML(v.name)} ${v.special ? `(${v.special})` : ''}</option>`).join('')}
                </select>
              </div>
              <div>
                <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:4px;">Pháp khí cầm tay:</label>
                <select id="equip_phapkhi" style="width:100%; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 8px; border-radius:6px; font-size:12px;">
                  <option value="">-- Cất pháp khí --</option>
                  ${Object.entries(PHAPKHI_CATALOG).map(([k, v]) => `<option value="${k}" ${k === phapkhiKey ? 'selected' : ''}>${escapeHTML(v.name)} (${escapeHTML(v.rank)})</option>`).join('')}
                </select>
              </div>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:11px; color:var(--text-dim); display:block; margin-bottom:4px;">Tâm niệm / Bio hiển thị:</label>
              <input type="text" id="equip_bio" value="${escapeHTML(clientConfigBio)}" style="width:100%; background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 10px; border-radius:6px; font-size:12px;" placeholder="Nhập tâm niệm của bạn...">
            </div>
            <button type="button" class="btn" onclick="runEquip()" style="font-size:13px; padding:8px 16px;" ${isRunning || isStopping ? 'disabled' : ''}>
              ⚡ Áp Dụng Trang Bị & Diện Mạo
            </button>
          </div>

          <!-- Tủ Chữ Thư Pháp Thầy Đồ (12 Chữ Cát Tường) -->
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--card-border); padding:14px; border-radius:12px; margin-top:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
              <div>
                <h3 style="color:var(--gold); font-size:14px; margin:0;">📜 Tủ Chữ Thư Pháp Thầy Đồ (Trọn Bộ 12 Chữ)</h3>
                <small style="color:var(--text-dim); font-size:11px;">Mỗi chữ là một lời chúc phước lành và ý nghĩa tu dưỡng đạo đức chốn thiền môn</small>
              </div>
              <button type="button" class="btn" onclick="runTask('chu-all')" style="font-size:12px; padding:7px 16px; background:linear-gradient(135deg, #b8860b, #e9c27a); color:#1c150e; font-weight:700;" ${isRunning || isStopping ? 'disabled' : ''}>
                📜 Xin Trọn Bộ 12 Chữ Ngay
              </button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:10px;">
              ${calligraphyCardsHTML}
            </div>
          </div>

          <!-- TÀNG KINH CÁC & THƯ VIỆN KINH ĐIỂN (6 BÀI KINH GIÁC NGỘ) -->
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--card-border); padding:14px; border-radius:12px; margin-top:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
              <div>
                <h3 style="color:var(--gold); font-size:14px; margin:0;">📖 Tàng Kinh Các & Thư Viện Kinh Điển (6 Bài Kinh Giác Ngộ)</h3>
                <small style="color:var(--text-dim); font-size:11px;">Kinh văn đại thừa & chân ngôn mầu nhiệm lưu giữ nơi Tàng Kinh Các chốn thiền môn</small>
              </div>
              <button type="button" class="btn" onclick="runTask('tangkinh')" style="font-size:12px; padding:7px 16px; background:linear-gradient(135deg, #1e3c72, #2a5298); color:#fff; font-weight:700;" ${isRunning || isStopping ? 'disabled' : ''}>
                📖 Nghe Trọn Bộ Kinh Điển Ngay
              </button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(210px, 1fr)); gap:10px;">
              ${sutrasCardsHTML}
            </div>
          </div>
        </div>

        <!-- TAB 3: DANH HIỆU -->
        <div class="profile-tab-pane" id="tab_titles">
          <div style="background:rgba(233,194,122,0.1); border:1px solid rgba(233,194,122,0.3); padding:12px 16px; border-radius:10px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <span style="font-size:12px; color:var(--text-dim);">Danh hiệu đang đeo trên người:</span>
              <div style="font-size:15px; font-weight:700; color:var(--gold); margin-top:2px;">
                🏆 ${escapeHTML(activeTitleName)}
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <select id="title_select" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 10px; border-radius:8px; font-size:12px; min-width:180px;" ${isRunning || isStopping ? 'disabled' : ''}>
                ${(j.titles || []).filter(t => t.got).map(t => `<option value="${escapeHTML(t.id)}" ${t.id === activeTitleId ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
              </select>
              <button type="button" class="btn" onclick="runTitle()" style="font-size:12px; padding:7px 14px;" ${isRunning || isStopping ? 'disabled' : ''}>
                🏅 Đổi
              </button>
            </div>
          </div>

          <h3 style="font-size:13px; color:var(--gold); margin-bottom:10px;">🏆 10 Danh Hiệu Đã Mở Khóa</h3>
          <div class="title-grid" style="margin-bottom:16px;">
            ${unlockedTitlesHTML}
          </div>

          <h3 style="font-size:13px; color:var(--text-dim); margin-bottom:10px;">🔒 Danh Hiệu Đang Tu Luyện (Chờ Mở Khóa)</h3>
          <div class="title-grid">
            ${lockedTitlesHTML}
          </div>
        </div>

        <!-- TAB 4: BẢN ĐỒ CHÙA & TÀI KHOẢN -->
        <div class="profile-tab-pane" id="tab_account_map">
          <!-- Dịch chuyển nhanh -->
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--card-border); padding:14px; border-radius:12px; margin-bottom:16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <span style="font-size:13px; color:var(--gold); font-weight:600;">🚀 Dịch chuyển nhanh đến địa điểm:</span>
            <select id="teleport_select" style="background:#1c150e; color:var(--gold); border:1px solid var(--card-border); padding:7px 10px; border-radius:8px; font-size:12px; min-width:220px;" ${isRunning || isStopping ? 'disabled' : ''}>
              ${TEMPLE_MAP.places.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)} (${escapeHTML(p.zone)})</option>`).join('')}
            </select>
            <button type="button" class="btn" onclick="runTeleport()" style="font-size:12px; padding:7px 14px;" ${isRunning || isStopping ? 'disabled' : ''}>
              🚀 Dịch Chuyển Đến (Goto)
            </button>
          </div>

          <h3 style="font-size:13px; color:var(--gold); margin-bottom:10px;">🗺️ 17 Thắng Cảnh Bản Đồ Chùa An Tự Duyên</h3>
          <div class="map-grid">
            ${mapPlacesHTML}
          </div>

          <!-- Thông tin tài khoản & Kết nối -->
          <div style="background:rgba(0,0,0,0.25); border:1px solid var(--card-border); padding:14px; border-radius:12px; margin-top:16px;">
            <h3 style="color:var(--gold); font-size:13px; margin-bottom:8px;">🔐 Thông Tin Tài Khoản & Kết Nối Máy Chủ</h3>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; font-size:12px;">
              <div>Tài khoản: <b style="color:var(--gold);">@${escapeHTML(rawUser || 'phat-tu')}</b></div>
              <div>Pháp danh: <b>${escapeHTML(displayName)}</b></div>
              <div>Phòng hiện tại: <b>chua-1</b></div>
              <div>Máy chủ WebSocket: <b>wss://didenchua.com:443/ws</b></div>
              <div>Render Health Check: <b>/health (alias: /heath, /ping)</b></div>
              <div>Cơ chế tự động: <b>00:05 sáng (UTC+7) & Keep-Alive 3p</b></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- BẢNG ĐIỀU KHIỂN TỪNG NHIỆM VỤ & DANH SÁCH TOÀN BỘ (5 TẦNG KHOA HỌC) -->
    <div class="card" id="card_tasks" style="margin-bottom: 20px;">
      <div class="card-header-toggle" onclick="toggleSection('card_tasks')">
        <h2>
          <span>🎯 Bảng Điều Khiển Nhiệm Vụ & Tác Vụ Riêng Lẻ (5 Tầng)</span>
          <small style="font-size:12px; color:var(--text-dim); font-weight:normal;">Chạy ngẫu hứng · Kèm nút Dừng & Live Log</small>
        </h2>
        <span class="chevron-icon">▼</span>
      </div>
      <div class="collapsible-content">
        <p style="font-size:12px; color:var(--text-dim); margin-bottom:14px; line-height:1.6;">
          Sau khi chu trình tự động lúc 00:05 hoàn tất, bạn có thể bấm <b>[⚡ Chạy]</b> riêng lẻ bất kỳ nhiệm vụ nào bên dưới bất cứ khi nào vào chùa. Quá trình chạy sẽ stream nhật ký trực tiếp vào hộp log phía trên. Bấm <b>[🛑 Dừng]</b> để ngắt tác vụ an toàn.
        </p>

        <div style="display:flex; flex-direction:column; gap: 12px;">
          <!-- TẦNG 1 -->
          <div class="tier-box" id="tier_1">
            <div class="tier-header" onclick="toggleSection('tier_1')">
              <div class="tier-title"><span>📋</span> TẦNG 1: NHIỆM VỤ HÀNG NGÀY (QUEST HÔM NAY - 13 TÁC VỤ)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${dailyTasksHTML}
            </div>
          </div>

          <!-- TẦNG 2 -->
          <div class="tier-box" id="tier_2">
            <div class="tier-header" onclick="toggleSection('tier_2')">
              <div class="tier-title"><span>🎯</span> TẦNG 2: MỐC TU TẬP & THÀNH TỰU VĨNH VIỄN (6 TÁC VỤ)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${milestoneTasksHTML}
            </div>
          </div>

          <!-- TẦNG 3 -->
          <div class="tier-box" id="tier_3">
            <div class="tier-header" onclick="toggleSection('tier_3')">
              <div class="tier-title"><span>🛖</span> TẦNG 3: KHÔNG GIAN TÂM LINH (AM RIÊNG & PHÁP ĐƯỜNG - 4 TÁC VỤ)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${spiritualTasksHTML}
            </div>
          </div>

          <!-- TẦNG 4 -->
          <div class="tier-box" id="tier_4">
            <div class="tier-header" onclick="toggleSection('tier_4')">
              <div class="tier-title"><span>🪷</span> TẦNG 4: VƯỜN SEN & TÙY HỶ CÔNG ĐỨC (4 TÁC VỤ)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${extraTasksHTML}
            </div>
          </div>

          <!-- TẦNG 5 -->
          <div class="tier-box" id="tier_5">
            <div class="tier-header" onclick="toggleSection('tier_5')">
              <div class="tier-title"><span>🧘</span> TẦNG 5: TĨNH TÂM THIỀN ĐỊNH & TRÍ TUỆ AI (2 TÁC VỤ)</div>
              <div class="tier-meta">
                <span class="chevron-icon">▼</span>
              </div>
            </div>
            <div class="tier-body">
              ${zenAiTasksHTML}
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

      const turboToggle = document.getElementById('turboModeToggle');
      const isTurbo = turboToggle ? turboToggle.checked : (localStorage.getItem('didenchua_turbo') === '1');
      const payload = { task: taskId, turbo: isTurbo, fast: isTurbo, ...customOptions };
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
        if (!payload.wish) {
          const wishSel = document.getElementById('wish_' + taskId);
          if (wishSel && wishSel.value) payload.wish = wishSel.value;
        }
      } else if (taskId === 'teleport') {
        const placeSel = document.getElementById('place_' + taskId);
        if (placeSel && placeSel.value) payload.placeId = placeSel.value;
      } else {
        const countInp = document.getElementById('count_' + taskId);
        if (countInp && countInp.value !== '') {
          payload.count = Number(countInp.value);
        }
      }

      const allRunBtns = document.querySelectorAll('.btn-run, .btn-quick-run, .btn-quick-claim, #runBtn, #autoPlayBtn');
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
        } else if (res.status === 401) {
          alert('Phiên làm việc trên máy chủ vừa được khởi động lại. Đang tải lại trang để đồng bộ mã bảo mật mới...');
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
        } else if (res.status === 401) {
          alert('Phiên làm việc trên máy chủ vừa được khởi động lại. Đang tải lại trang để đồng bộ mã bảo mật mới...');
          location.reload();
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
      if (!confirm('⚠️ LƯU Ý KẾT NỐI MÁY CHỦ CHÙA:\\nLàm mới dữ liệu từ chùa sẽ kết nối máy chủ trong vài giây để lấy snapshot công đức mới nhất.\\nNếu bạn đang tự chơi game trên điện thoại/máy tính, phiên game có thể bị ngắt kết nối.\\n\\nBạn có chắc chắn muốn làm mới từ chùa lúc này không?')) {
        return;
      }
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
        const res = await fetch('/api/refresh', {
          method: 'POST',
          headers
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          location.reload();
        } else if (res.status === 401) {
          alert('Phiên làm việc trên máy chủ vừa được khởi động lại. Đang tải lại trang để đồng bộ mã bảo mật mới...');
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
              const dot = document.createElement('span');
              dot.className = 'pulse-dot';
              dot.style.background = '#e06c75';
              taskNameEl.textContent = '';
              taskNameEl.appendChild(dot);
              taskNameEl.appendChild(document.createTextNode(' 🛑 ĐANG DỪNG AN TOÀN: ' + (data.runningTaskName || '') + ' (Đang ngắt kết nối an toàn...)'));
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

    function switchProfileTab(tabId) {
      document.querySelectorAll('.profile-tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.profile-tab-pane').forEach(pane => pane.classList.remove('active'));

      const activeBtn = Array.from(document.querySelectorAll('.profile-tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
      if (activeBtn) activeBtn.classList.add('active');

      const activePane = document.getElementById(tabId);
      if (activePane) activePane.classList.add('active');

      try {
        localStorage.setItem('ddc_active_profile_tab', tabId);
      } catch (e) {}
    }

    function restoreProfileTab() {
      try {
        const savedTab = localStorage.getItem('ddc_active_profile_tab');
        if (savedTab && document.getElementById(savedTab)) {
          switchProfileTab(savedTab);
        }
      } catch (e) {}
    }

    async function runEquip() {
      const robe = document.getElementById('equip_robe')?.value;
      const beads = document.getElementById('equip_beads')?.value;
      const cushion = document.getElementById('equip_cushion')?.value;
      const phapkhi = document.getElementById('equip_phapkhi')?.value;
      const bio = document.getElementById('equip_bio')?.value;
      await runTask('equip', { robe, beads, cushion, phapkhi, bio });
    }

    async function runTitle() {
      const titleId = document.getElementById('title_select')?.value;
      if (!titleId) return alert('Vui lòng chọn một danh hiệu.');
      await runTask('title', { titleId });
    }

    async function runTeleport(pId) {
      const placeId = pId || document.getElementById('teleport_select')?.value || 'san-chua';
      await runTask('teleport', { placeId });
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

    const turboToggle = document.getElementById('turboModeToggle');
    if (turboToggle) {
      turboToggle.checked = localStorage.getItem('didenchua_turbo') === '1';
      turboToggle.addEventListener('change', () => {
        localStorage.setItem('didenchua_turbo', turboToggle.checked ? '1' : '0');
      });
    }

    restoreCollapseStates();
    restoreProfileTab();
  </script>
</body>
</html>`;
}

// Khởi chạy HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 1. Health check & Ping Keep-Alive (hỗ trợ /health, alias /heath tránh lỗi chính tả, và /ping)
  if (url.pathname === '/health' || url.pathname === '/heath' || url.pathname === '/ping') {
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
    // Snapshot tài khoản và log có dữ liệu riêng tư, kể cả khi chạy local.
    if (!verifyAuth(req)) {
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

  // 5. API kích hoạt chạy nhiệm vụ: chỉ POST để tránh kích hoạt ngoài ý muốn khi crawler/prefetch mở URL.
  if (url.pathname === '/api/run' || url.pathname === '/run' || url.pathname === '/cron') {
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
    const validTaskIds = ['all', 'wAm', 'chuoi', 'viec-ca', 'lamp', 'pet', 'chu-all', 'xinchu-all', 'tangkinh', 'kinh', 'nghekinh', ...TASKS_CATALOG.map(t => t.id)];
    if (!validTaskIds.includes(task)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: `Tác vụ không hợp lệ: "${task}".` }));
      return;
    }
    runOptions.task = task;

    const rawCount = bodyData.count ?? url.searchParams.get('count');
    if (rawCount !== undefined && rawCount !== null) {
      const c = parseInt(rawCount, 10);
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
      const validWishes = ['all', 'tat-ca', 'full', 'tron-bo', ...CALLIGRAPHY_WORDS.map(w => w.id)];
      if (validWishes.includes(wishStr)) {
        runOptions.wish = wishStr;
      }
    }

    // Kiểm tra bài kinh (sutra)
    if (bodyData.sutra || url.searchParams.get('sutra')) {
      runOptions.sutra = String(bodyData.sutra || url.searchParams.get('sutra')).trim();
    }

    // Các tham số cho danh hiệu, bản đồ, trang bị và thời lượng
    if (bodyData.titleId || url.searchParams.get('titleId') || bodyData.title) {
      runOptions.titleId = String(bodyData.titleId || url.searchParams.get('titleId') || bodyData.title).trim();
    }
    if (bodyData.placeId || url.searchParams.get('placeId')) {
      runOptions.placeId = String(bodyData.placeId || url.searchParams.get('placeId')).trim();
    }
    if (bodyData.durationMin || url.searchParams.get('durationMin')) {
      runOptions.durationMin = Number(bodyData.durationMin || url.searchParams.get('durationMin'));
    }
    if (bodyData.robe) runOptions.robe = String(bodyData.robe).trim();
    if (bodyData.beads) runOptions.beads = String(bodyData.beads).trim();
    if (bodyData.cushion) runOptions.cushion = String(bodyData.cushion).trim();
    if (bodyData.phapkhi !== undefined) runOptions.phapkhi = bodyData.phapkhi ? String(bodyData.phapkhi).trim() : null;
    if (bodyData.bio) runOptions.bio = String(bodyData.bio).trim();

    // Chế độ siêu tốc (Turbo / Fast)
    if (bodyData.turbo !== undefined || url.searchParams.has('turbo')) {
      runOptions.turbo = bodyData.turbo === true || bodyData.turbo === 'true' || url.searchParams.get('turbo') === 'true';
    }
    if (bodyData.fast !== undefined || url.searchParams.has('fast')) {
      runOptions.fast = bodyData.fast === true || bodyData.fast === 'true' || url.searchParams.get('fast') === 'true';
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

  // 6. Trang Dashboard chính (GET) - Tuyệt đối KHÔNG tự kết nối game khi mở xem report
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Allow': 'GET' });
      res.end('Method Not Allowed');
      return;
    }
    // Trả về giao diện từ dữ liệu bộ nhớ đệm (Cache/In-memory buffer), không gọi WebSocket vào game
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderDashboardHTML());
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Không tìm thấy đường dẫn.');
});

export { server, state, loadCachedState, saveCachedState };

const isDirectRun = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('/server.js') || process.argv[1].endsWith('\\server.js') || process.argv[1] === 'server.js' || fileURLToPath(import.meta.url) === process.argv[1])
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  const handleExit = (signal) => {
    log.warn(`Nhận tín hiệu ${signal} (hệ thống/Render đang tái khởi động hoặc dừng tiến trình)...`);
    if (state.activeClient) {
      try {
        state.activeClient.abort();
        state.activeClient.close();
      } catch {}
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => handleExit('SIGTERM'));
  process.on('SIGINT', () => handleExit('SIGINT'));

  server.listen(PORT, HOST, async () => {
    log.temple('🚀', `Server Dashboard đang lắng nghe tại: http://${HOST}:${PORT}`);
    log.info(`Sẵn sàng phục vụ Render Cloud Web Service trên cổng ${PORT}`);

    // Nạp dữ liệu từ file cache bộ nhớ (không kết nối game, chống tranh session khi khởi động)
    loadCachedState();
    // Khởi động lịch trình 00:05 sáng
    startDailyScheduler();
  });
}
