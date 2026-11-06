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
  || 'https://niemphat-online-bot.onrender.com'
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
    id: 'que',
    group: 'daily',
    questId: 'xam',
    title: 'Gieo Quẻ Xăm Cát Tường',
    desc: 'Lắc quẻ cát tường nhận lời khai thị tu tập đầu ngày',
    icon: '📜',
    reward: '+10 điểm',
    badge: 'Đầu ngày'
  },
  {
    id: 'wheel',
    group: 'daily',
    title: 'Vòng Quay Lộc',
    desc: 'Quay vòng quay may mắn trong ngày nhận Sen hoặc vật phẩm quý',
    icon: '🎡',
    reward: 'Sen / Vật phẩm',
    badge: 'Vòng quay'
  },
  {
    id: 'vieng',
    group: 'daily',
    questId: 'd_vieng2',
    title: 'Viếng Thăm Các Ngôi Chùa',
    desc: 'Hành hương viếng thăm các danh lam cổ tự (20 ngôi chùa)',
    icon: '🏯',
    reward: '+25 Sen',
    badge: 'Hành hương'
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
    desc: 'Lăn tràng hạt niệm Phật (1 chuỗi = 108 hạt, 100 chuỗi = 10.800 hạt mở danh hiệu Trăm chuỗi hạt 🏆)',
    icon: '📿',
    reward: 'Niệm Phật',
    badge: 'Chuỗi hạt',
    hasCount: true,
    defaultCount: 108,
    countOptions: [
      { value: 54, label: 'Nửa chuỗi (54 hạt)' },
      { value: 108, label: '1 chuỗi (108 hạt tròn 🏆)' },
      { value: 216, label: '2 chuỗi (216 hạt)' },
      { value: 540, label: '5 chuỗi (540 hạt)' },
      { value: 1080, label: '10 chuỗi (1.080 hạt)' },
      { value: 3240, label: '30 chuỗi (3.240 hạt - Cây tre trăm đốt 🏆)' },
      { value: 5400, label: '50 chuỗi (5.400 hạt)' },
      { value: 10800, label: '100 chuỗi (10.800 hạt - Trăm chuỗi hạt 🏆)' }
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
    desc: 'Gõ mõ theo nhịp thong thả tự nhiên (nhập số tiếng tùy ý hoặc chọn gợi ý mốc lớn)',
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
      { value: 1080, label: '1.080 tiếng (Đại khóa lễ 🏆)' },
      { value: 3240, label: '3.240 tiếng (Vạn tiếng mõ 🏆)' },
      { value: 10800, label: '10.800 tiếng (Đại viên mãn 🏆)' }
    ]
  },
  {
    id: 'quet',
    group: 'milestone',
    title: 'Quét Lá Sân Chùa (Cày Sân)',
    desc: 'Công quả quét dọn lá rụng nhiều lượt giữ gìn khuôn viên thanh tịnh (1-100 lần)',
    icon: '🧹',
    reward: 'Công quả',
    badge: 'Công quả',
    hasCount: true,
    defaultCount: 5,
    countOptions: [
      { value: 1, label: '1 lần (Khởi tâm)' },
      { value: 5, label: '5 lần (Quest ngày 🎯)' },
      { value: 10, label: '10 lần (Công quả)' },
      { value: 20, label: '20 lần (Chăm chỉ)' },
      { value: 50, label: '50 lần (Tinh tấn 🏆)' },
      { value: 100, label: '100 lần (Đại công quả 🏆)' }
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
  autoEnabled: (process.env.AUTO_PLAY === 'true' || process.env.NP_AUTO_PLAY === 'true'),
  autoIntervalMinutes: parseInt(process.env.AUTO_INTERVAL_MINS || '15', 10),
  lastAutoCheckTime: null,
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

function saveCachedState() {
  try {
    fs.writeFileSync(CACHE_STATE_FILE, JSON.stringify({
      lastUpdated: state.lastUpdated,
      autoEnabled: state.autoEnabled,
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

function loadCachedState() {
  try {
    if (fs.existsSync(CACHE_STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_STATE_FILE, 'utf-8'));
      if (data.merit) state.merit = data.merit;
      if (data.journal) state.journal = data.journal;
      if (data.lastUpdated) state.lastUpdated = data.lastUpdated;
      if (typeof data.autoEnabled === 'boolean' && process.env.AUTO_PLAY === undefined && process.env.NP_AUTO_PLAY === undefined) {
        state.autoEnabled = data.autoEnabled;
      }
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

// Nạp cache trạng thái ngay khi khởi tạo server (tránh gọi refreshAccountData gây tranh session)
loadCachedState();

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
          await client.doMo(needTung, runOptions);
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
          await client.doQuetLa(1, runOptions);
          client.send({ t: 'viec', k: 'ca' });
          client.send({ t: 'lamp' });
          await client.doPet();
          break;
        case 'quet':
          await client.doQuetLa(runOptions.count || 5, runOptions);
          break;
        case 'chores':
          await client.doChores();
          await client.doPet();
          break;
        case 'mo':
          await client.doMo(runOptions.count || 108, runOptions);
          break;
        case 'beads':
        case 'chuoi':
          const beadsCount = runOptions.count || 108;
          await client.doBeads(beadsCount, runOptions);
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
            await client.doBeads(farmBeads, runOptions);
            await client.humanDelay('thong thả nghỉ tay niệm Phật');
          }
          log.success(`Đã hoàn tất cày tự động: ${farmBows} lạy Phật và ${farmBeads} hạt tràng niệm Phật!`);
          break;
        case 'xam':
        case 'que':
          await client.doQue();
          await client.doXam();
          break;
        case 'wheel':
          await client.doWheel();
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
        case 'vieng':
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
      if (['bell', 'vow', 'incense', 'lay-daily', 'lay', 'greet', 'lantern-daily', 'chores-daily', 'xam', 'que', 'wheel', 'vieng', 'chores', 'quet', 'farm-bows-beads', 'tung', 'tuoi', 'chu', 'garden', 'tuyhy', 'secrets', 'tangkinh', 'chu-all', 'meditate', 'ngoi-daily', 'quiz', 'am', 'khoe', 'checkin', 'ca', 'dendau', 'cat', 'wAm', 'chuoi', 'beads'].includes(taskId)) {
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

// Cỗ máy tự động chơi liên tục (Autonomous Auto-Play Engine)
let autoLoopTimer = null;
function startAutoLoop() {
  if (autoLoopTimer) clearInterval(autoLoopTimer);
  log.info(`🤖 Vòng lặp Tự Chơi (Auto Engine) đã khởi động (Chu kỳ quét: ${state.autoIntervalMinutes || 15} phút, Trạng thái: ${state.autoEnabled ? 'BẬT' : 'TẮT'}).`);

  autoLoopTimer = setInterval(async () => {
    if (!state.autoEnabled) return;
    if (state.isRunning || state.isStopping) return;

    const now = new Date(Date.now() + 7 * 3600 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // 1. Nếu ngày mới qua 00:05 sáng mà hôm nay chưa chạy, ưu tiên chạy ngày mới
    if (lastScheduledRunDate !== todayStr && ((hour === 0 && minute >= 5) || hour >= 1)) {
      log.temple('🌅', `[Auto Engine] Phát hiện ngày mới ${todayStr} (giờ VN). Tự động chạy toàn bộ nhiệm vụ ngày...`);
      try {
        const res = await executeRoutine(`Auto Routine (Ngày mới ${todayStr})`, { fast: true });
        if (res && res.ok) {
          lastScheduledRunDate = todayStr;
          saveSchedulerDate(todayStr);
        }
      } catch (err) {
        log.error('[Auto Engine] Lỗi khi chạy ngày mới:', err.message);
      }
      return;
    }

    // 2. Định kỳ quét mỗi 15 phút: kiểm tra nếu còn nhiệm vụ chưa xong hoặc chưa claim
    const nowTs = Date.now();
    const intervalMs = (state.autoIntervalMinutes || 15) * 60 * 1000;
    if (state.lastAutoCheckTime && (nowTs - state.lastAutoCheckTime < intervalMs)) {
      return;
    }
    state.lastAutoCheckTime = nowTs;

    const quests = state.merit?.me?.quests || [];
    const hasUnclaimed = quests.some(q => !q.claimed && (q.done || ((q.have || 0) >= (q.need || 1))));
    const hasIncompleteDaily = quests.some(q => (q.id.startsWith('d_') || q.id === 'lay' || q.id === 'tung' || q.id === 'chuoi' || q.id === 'huong' || q.id === 'chuong') && !q.claimed && !q.done);

    if (hasUnclaimed || hasIncompleteDaily) {
      log.temple('🤖', '[Auto Engine] Phát hiện nhiệm vụ ngày chưa hoàn thành hoặc quà chưa nhận. Tự động xử lý...');
      try {
        await executeRoutine('Auto Routine (Định kỳ)', { fast: true });
      } catch (err) {
        log.warn('[Auto Engine] Lỗi chu kỳ định kỳ:', err.message);
      }
    }
  }, 30000);
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
  },
  d_lay27: {
    icon: '🙇',
    title: 'Lạy 27 lạy',
    desc: 'Thành tâm lạy Phật 27 lạy trang nghiêm',
    tip: 'Lễ bái Tam Bảo sám hối tiêu trừ nghiệp chướng',
    taskId: 'lay-daily'
  },
  d_chuoi1: {
    icon: '📿',
    title: 'Lần trọn một chuỗi',
    desc: 'Lần đủ 108 hạt tràng niệm Phật A Di Đà',
    tip: 'Thanh tịnh tâm ý, nhất tâm niệm Phật',
    taskId: 'beads'
  },
  d_mo108: {
    icon: '🪵',
    title: 'Gõ mõ 108 tiếng',
    desc: 'Tự tay gõ đủ 108 tiếng mõ khi tụng kinh',
    tip: 'Gõ mõ tụng kinh trang nghiêm thanh tịnh',
    taskId: 'tung'
  },
  d_thien5: {
    icon: '🧘',
    title: 'Thiền định 5 phút',
    desc: 'Ngồi thiền định tĩnh tâm ít nhất 5 phút',
    tip: 'Tĩnh tâm an trú trong hiện tại',
    taskId: 'ngoi-daily'
  },
  d_kinh1: {
    icon: '📖',
    title: 'Tụng trọn một bài',
    desc: 'Tụng trọn một bài kinh chú trong mục Tụng kinh',
    tip: 'Lắng nghe và tụng niệm kinh điển giác ngộ',
    taskId: 'tangkinh'
  },
  d_huong: {
    icon: '🪔',
    title: 'Thắp một nén hương',
    desc: 'Thắp nén tâm hương dâng Phật',
    tip: 'Thành kính dâng hương Tam Bảo',
    taskId: 'incense'
  },
  d_vieng2: {
    icon: '🏯',
    title: 'Viếng hai ngôi chùa',
    desc: 'Ghé thăm 2 ngôi chùa khác nhau trong ngày',
    tip: 'Hành hương chiêm bái các cảnh chùa danh thắng',
    taskId: 'visit'
  },
  d_khoe: {
    icon: '📢',
    title: 'Lan tỏa thiện duyên',
    desc: 'Khoe thành tích tu tập lên mạng xã hội',
    tip: 'Chia sẻ niềm hoan hỷ tu tập cùng đại chúng',
    taskId: 'khoe'
  },
  d_tuyhy: {
    icon: '✨',
    title: 'Tùy hỷ công đức',
    desc: 'Tùy hỷ 3 ngọn đèn hoa đăng của người khác',
    tip: 'Hoan hỷ tùy hỷ công đức hoa đăng thiện lành',
    taskId: 'tuyhy'
  },
  d_chuong: {
    icon: '🔔',
    title: 'Thỉnh chuông',
    desc: 'Thỉnh một hồi chuông ở bất kỳ chùa nào',
    tip: 'Thỉnh tiếng chuông đại hồng ngân vang',
    taskId: 'bell'
  },
  d_sweep: {
    icon: '🧹',
    title: 'Quét sân chùa',
    desc: 'Quét sạch lá rụng thanh tịnh sân chùa',
    tip: 'Công quả quét sân giữ chùa sạch đẹp',
    taskId: 'quet'
  },
  wheel: {
    icon: '☸️',
    title: 'Vòng quay phúc lộc',
    desc: 'Quay vòng quay phúc lộc nhận sen & ngọc',
    tip: 'Quay nhận lộc chùa',
    taskId: 'wheel'
  },
  que: {
    icon: '📜',
    title: 'Gieo quẻ cát tường',
    desc: 'Gieo quẻ cát tường nhận lời Phật dạy đầu ngày',
    tip: 'Gieo quẻ nhận lời khuyên',
    taskId: 'que'
  }
};

// Tạo mã HTML Dashboard an toàn chống XSS (Priority 2 & SYSTEM_LOG_REPORT)
export function renderDashboardHTML() {
  const isRunning = state.isRunning;
  const isStopping = state.isStopping;
  const isAnyRunning = isRunning || isStopping;
  const autoEnabled = Boolean(state.autoEnabled);

  const me = state.merit?.me || {};
  const j = state.journal || {};
  const journal = j;
  const stats = me.stats || j.stats || {};

  const displayName = me.name || j.name || 'Hân Ánh Vũ';
  const username = me.user || j.user || process.env.NP_USERNAME || 'thichkngan';
  const rawUser = username;
  const userTag = rawUser ? `<span>(@${escapeHTML(rawUser)})</span>` : '';
  const sectRaw = me.sect || j.sect || 'tinhdo';
  const sectName = sectRaw === 'tinhdo' ? 'Tịnh Độ Tông 🪷' : (sectRaw === 'thien' ? 'Thiền Tông 🧘' : (sectRaw === 'mat' ? 'Mật Tông 📿' : (sectRaw === 'namtong' ? 'Nam Tông 🪵' : escapeHTML(sectRaw))));
  const levelTitle = me.level || j.level || 'Hạt sen · bậc 4';
  const expCurrent = Number(me.exp ?? me.total ?? j.merit ?? 0);
  const expNext = Number(me.next ?? j.next ?? 735);
  const fromTarget = Number(me.from ?? j.from ?? 0);
  const nextLevelPoints = expNext > expCurrent ? (expNext - expCurrent) : 0;
  const currentTotal = expCurrent;
  const nextTarget = expNext;
  const meritProgressPercent = expNext > fromTarget
    ? Math.min(100, Math.max(0, Math.round(((expCurrent - fromTarget) / (expNext - fromTarget)) * 100)))
    : 0;

  const senCount = Number(me.sen ?? j.sen ?? 560);
  const ngocCount = Number(me.ngoc ?? j.ngoc ?? 0);
  const streakDays = Number(me.days ?? j.streak ?? 2);
  const templeName = me.temple || j.temple || 'Vô Lượng Tự';

  const bowsCount = Number(stats.bows ?? j.bows ?? 0);
  const beadsCount = Number(stats.beads ?? j.beads ?? 0);
  const roundsCount = Number(stats.rounds ?? j.rounds ?? Math.floor(beadsCount / 108));
  const moCount = Number(stats.mo ?? j.mo ?? 0);
  const sitMin = Number(stats.sitMin ?? j.sitMin ?? 0);
  const chantsCount = Number(stats.chants ?? j.chants ?? 0);
  const sweepsCount = Number(stats.sweeps ?? j.sweeps ?? 0);
  const visitsCount = Number(stats.visits ?? j.visits ?? 0);

  // Quests processing
  const quests = me.quests || [];
  const totalQuests = quests.length;
  const claimedQuests = quests.filter(q => q.claimed).length;
  const readyQuests = quests.filter(q => !q.claimed && ((q.have || 0) >= (q.need || 1) || q.done)).length;
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
      <div class="quest-progress-track" style="margin-top:10px;">
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
    } else if (have >= need || q.done) {
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

  // Smart remaining option for tung
  const tungQ = (me?.quests || []).find(q => q.id === 'tung' || q.id === 'd_mo108');
  let tungSmartOption = '';
  if (tungQ && !tungQ.claimed && Number(tungQ.have || 0) < Number(tungQ.need || 108)) {
    const rem = Math.max(1, Number(tungQ.need || 108) - Number(tungQ.have || 0));
    tungSmartOption = `<option value="${rem}">Làm đủ nhiệm vụ ngày (còn ${rem} tiếng 🎯)</option>`;
  }

  // Sutras cards
  const sutrasCardsHTML = BUDDHIST_SUTRAS.map((s, idx) => `
    <div class="sutra-card">
      <div class="sutra-card-header">
        <span class="sutra-num">#${idx + 1}</span>
        <div class="sutra-title-box">
          <b>${escapeHTML(s.title)}</b>
          <span class="badge badge-duration">${escapeHTML(s.duration)}</span>
        </div>
      </div>
      <p class="sutra-desc">${escapeHTML(s.desc)}</p>
      <button type="button" class="btn btn-sm" onclick="runTask('tangkinh', { sutra: '${escapeHTML(s.id)}' })" ${isAnyRunning ? 'disabled' : ''}>
        ▶️ Tụng bài này
      </button>
    </div>
  `).join('');

  // Calligraphy cards
  const calligraphyCardsHTML = CALLIGRAPHY_WORDS.map((w, idx) => `
    <div class="calligraphy-card">
      <div class="calligraphy-header">
        <span class="calligraphy-num">#${idx + 1}</span>
        <span class="calligraphy-text">✍️ ${escapeHTML(w.text)}</span>
        <span class="badge badge-wish">${escapeHTML(w.wish)}</span>
      </div>
      <p class="calligraphy-meaning">"${escapeHTML(w.meaning)}"</p>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Báo Cáo Tu Tập · Niệm Phật Online</title>
  <style>
    :root {
      --bg-body: #0d1117;
      --bg-card: #161b22;
      --bg-card-sub: #21262d;
      --card-border: #30363d;
      --gold: #f59e0b;
      --gold-light: #fbbf24;
      --gold-dim: #d97706;
      --pink: #ec4899;
      --pink-dim: #be185d;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --text-main: #f0f6fc;
      --text-dim: #8b949e;
      --text-muted: #6e7681;
      --radius: 12px;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-body);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.5;
      padding-bottom: 60px;
    }
    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 20px 16px;
    }

    /* TOP NAVBAR */
    .top-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
    }
    .brand-box {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: inherit;
    }
    .brand-logo {
      font-size: 28px;
      line-height: 1;
    }
    .brand-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--gold-light);
      letter-spacing: 0.5px;
    }
    .brand-domain {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.15);
      color: var(--gold-light);
      border: 1px solid rgba(245, 158, 11, 0.3);
      margin-left: 6px;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    /* BUTTONS & BADGES */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
      color: var(--text-main);
      background: var(--bg-card-sub);
    }
    .btn:hover:not(:disabled) {
      background: #30363d;
      border-color: #8b949e;
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .btn-primary {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      border-color: #3b82f6;
    }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
    .btn-gold {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff;
      border-color: #f59e0b;
    }
    .btn-gold:hover:not(:disabled) { background: #b45309; }
    .btn-success {
      background: linear-gradient(135deg, #059669, #047857);
      color: #fff;
      border-color: #10b981;
    }
    .btn-success:hover:not(:disabled) { background: #047857; }
    .btn-danger {
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: #fff;
      border-color: #ef4444;
    }
    .btn-danger:hover:not(:disabled) { background: #b91c1c; }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-done { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-ready { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .badge-wait { background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.3); }
    .badge-status { background: #21262d; border: 1px solid #30363d; color: var(--text-dim); }

    /* TURBO TOGGLE */
    .turbo-toggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card-sub);
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--card-border);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: var(--gold-light);
      user-select: none;
    }
    .turbo-toggle input { cursor: pointer; accent-color: var(--gold); }

    /* HERO PROFILE CARD */
    .hero-card {
      background: linear-gradient(145deg, #161b22, #1c2331);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 24px;
      align-items: center;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }
    @media (max-width: 820px) {
      .hero-card { grid-template-columns: 1fr; gap: 16px; }
    }
    .avatar-box {
      font-size: 48px;
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(245, 158, 11, 0.1);
      border: 2px solid var(--gold);
      border-radius: 50%;
      box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
    }
    .hero-info h1 {
      font-size: 22px;
      color: #fff;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .hero-info h1 small {
      font-size: 13px;
      font-weight: normal;
      color: var(--text-dim);
    }
    .hero-meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      font-size: 13px;
      color: var(--text-dim);
    }
    .hero-meta span { display: flex; align-items: center; gap: 4px; }
    .exp-track {
      background: #21262d;
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      margin-top: 6px;
      border: 1px solid #30363d;
    }
    .exp-fill {
      background: linear-gradient(90deg, #f59e0b, #ec4899);
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }
    .exp-labels {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--text-dim);
      margin-top: 4px;
    }
    .hero-stats-pillbox {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .hero-pill {
      background: var(--bg-card-sub);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 8px 14px;
      text-align: center;
      min-width: 100px;
    }
    .hero-pill .val { font-size: 16px; font-weight: 700; color: var(--gold-light); display: block; }
    .hero-pill .lbl { font-size: 11px; color: var(--text-dim); }

    /* AUTO ENGINE CONTROL BANNER */
    .auto-engine-card {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(245, 158, 11, 0.08));
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-radius: var(--radius);
      padding: 18px 24px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .auto-engine-info { flex: 1; min-width: 280px; }
    .auto-badge {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
      display: inline-block;
    }
    .auto-badge-on { color: #34d399; }
    .auto-badge-off { color: var(--text-dim); }
    .auto-desc { font-size: 12px; color: var(--text-dim); line-height: 1.4; }
    .auto-engine-actions { display: flex; gap: 10px; flex-wrap: wrap; }

    /* STATS GRID */
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--gold-light);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 14px;
      text-align: center;
      transition: transform 0.15s ease;
    }
    .stat-card:hover { transform: translateY(-2px); border-color: #8b949e; }
    .stat-icon { font-size: 24px; margin-bottom: 4px; }
    .stat-num { font-size: 18px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 11px; color: var(--text-dim); margin-top: 2px; }

    /* QUESTS SUMMARY & LIST */
    .quests-section {
      background: var(--bg-card);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 28px;
    }
    .quests-summary-card {
      background: var(--bg-card-sub);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .quests-summary-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .metric-label { font-size: 11px; color: var(--text-dim); display: block; }
    .metric-val { font-size: 14px; font-weight: 700; color: var(--text-main); }
    .quest-progress-track {
      background: #0d1117;
      height: 8px;
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid #30363d;
    }
    .quest-progress-fill { height: 100%; border-radius: 999px; }
    .fill-done { background: var(--success); }
    .fill-ready { background: var(--gold); }
    .fill-pending { background: #3b82f6; }
    .quests-claim-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      padding: 10px 14px;
      border-radius: 8px;
      margin-top: 12px;
      font-size: 13px;
      color: var(--gold-light);
    }
    .quest-card {
      background: var(--bg-card-sub);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 10px;
      transition: border-color 0.15s ease;
    }
    .quest-card.quest-done { border-color: rgba(16, 185, 129, 0.4); opacity: 0.85; }
    .quest-card.quest-ready { border-color: rgba(245, 158, 11, 0.6); background: rgba(245, 158, 11, 0.05); }
    .quest-main-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .quest-left {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      flex: 1;
    }
    .quest-icon { font-size: 24px; line-height: 1.2; }
    .quest-info { flex: 1; }
    .quest-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 2px;
      flex-wrap: wrap;
    }
    .quest-name { font-size: 14px; font-weight: 600; color: #fff; }
    .quest-reward-pill {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(245, 158, 11, 0.15);
      color: var(--gold-light);
    }
    .quest-desc { font-size: 12px; color: var(--text-dim); }
    .quest-tip { font-size: 11px; color: var(--gold-dim); font-style: italic; margin-top: 2px; }
    .quest-progress-container { margin-top: 8px; }
    .quest-progress-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--text-dim);
      margin-bottom: 4px;
    }
    .btn-task {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid transparent;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-quick-run {
      background: #238636;
      color: #fff;
      border-color: rgba(240, 246, 252, 0.1);
    }
    .btn-quick-run:hover:not(:disabled) { background: #2ea043; }
    .btn-quick-claim {
      background: #b08800;
      color: #fff;
      border-color: #d29922;
    }
    .btn-quick-claim:hover:not(:disabled) { background: #d29922; }

    /* DEEP PRACTICE GRID */
    .practice-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 14px;
      margin-bottom: 28px;
    }
    .practice-card {
      background: var(--bg-card);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
    }
    .practice-top {
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .practice-icon { font-size: 26px; }
    .practice-title-box b { font-size: 14px; color: #fff; display: block; }
    .practice-title-box small { font-size: 11px; color: var(--text-dim); }
    .practice-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .practice-controls input[type="number"] {
      width: 72px;
      background: var(--bg-body);
      border: 1px solid var(--card-border);
      color: var(--gold-light);
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
    }
    .practice-controls select {
      background: var(--bg-body);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      max-width: 140px;
    }

    /* SHOWCASES */
    .showcase-card {
      background: var(--bg-card);
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 20px;
      margin-bottom: 24px;
    }
    .showcase-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .sutras-grid, .calligraphy-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
    }
    .sutra-card, .calligraphy-card {
      background: var(--bg-card-sub);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 8px;
    }
    .sutra-card-header, .calligraphy-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 6px;
    }
    .sutra-num, .calligraphy-num { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
    .sutra-title-box b { font-size: 13px; color: #fff; display: block; }
    .sutra-desc, .calligraphy-meaning { font-size: 11px; color: var(--text-dim); line-height: 1.4; }
    .calligraphy-text { font-size: 15px; font-weight: 700; color: var(--gold-light); }
    .badge-duration { background: rgba(59, 130, 246, 0.15); color: #60a5fa; font-size: 10px; }
    .badge-wish { background: rgba(245, 158, 11, 0.15); color: var(--gold-light); font-size: 10px; }

    /* LIVE LOGS */
    .logs-card {
      background: #090d13;
      border: 1px solid var(--card-border);
      border-radius: var(--radius);
      padding: 18px;
    }
    .logs-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 10px;
    }
    .terminal-box {
      background: #04070b;
      border: 1px solid #1f242c;
      border-radius: 8px;
      padding: 14px;
      height: 240px;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.6;
      color: #cbd5e1;
    }
    .log-line { margin-bottom: 4px; word-break: break-word; }
    .log-time { color: var(--text-muted); margin-right: 6px; }
    .log-info { color: #93c5fd; }
    .log-success { color: #34d399; }
    .log-warn { color: #fbbf24; }
    .log-error { color: #f87171; }
  </style>
</head>
<body>
  <div class="container">
    <!-- TOP NAVIGATION -->
    <header class="top-nav">
      <a href="https://niemphat.online" target="_blank" rel="noopener" class="brand-box">
        <span class="brand-logo">🪷</span>
        <div>
          <div class="brand-title">NIỆMPHẬT.ONLINE <span class="brand-domain">niemphat.online</span></div>
          <small style="color:var(--text-dim); font-size:11px;">Trung Tâm Báo Cáo & Tự Động Hóa Tu Tập</small>
        </div>
      </a>
      <div class="nav-actions">
        <span class="badge badge-status" id="serverClock">⏰ --:--:-- (UTC+7)</span>
        <span class="badge ${isRunning ? 'badge-ready' : 'badge-done'}" id="botStatusBadge">
          ${isRunning ? '🟡 Đang thực thi: ' + escapeHTML(state.runningTaskName || 'Tác vụ') : '🟢 Sẵn sàng'}
        </span>
        <label class="turbo-toggle" title="Kích hoạt chế độ siêu tốc (bỏ qua độ trễ người thật)">
          <input type="checkbox" id="turboModeToggle" onchange="toggleTurboMode(this.checked)">
          <span>⚡ Siêu Tốc (Turbo)</span>
        </label>
        <button type="button" class="btn btn-sm" onclick="refreshData()" ${isAnyRunning ? 'disabled' : ''}>
          🔄 Làm Mới
        </button>
      </div>
    </header>

    <!-- HERO PROFILE CARD -->
    <section class="hero-card">
      <div class="avatar-box">🪷</div>
      <div class="hero-info">
        <h1>
          <span>${escapeHTML(displayName)}</span>
          <small>${userTag}</small>
        </h1>
        <div class="hero-meta">
          <span>📿 ${sectName}</span>
          <span>🏆 ${escapeHTML(levelTitle)}</span>
          <span>🏯 ${escapeHTML(templeName)}</span>
          <span>🔥 ${streakDays} ngày liên tục</span>
        </div>
        <div>
          <div class="exp-track">
            <div class="exp-fill" style="width: ${meritProgressPercent}%;"></div>
          </div>
          <div class="exp-labels">
            <span>Tiến độ kinh nghiệm: <b>${expCurrent} / ${expNext} EXP</b> (${meritProgressPercent}%)</span>
            <span>còn ${nextLevelPoints} EXP đến cấp tiếp theo</span>
          </div>
        </div>
      </div>
      <div class="hero-stats-pillbox">
        <div class="hero-pill">
          <span class="val">🪷 ${senCount}</span>
          <span class="lbl">Hoa Sen</span>
        </div>
        <div class="hero-pill">
          <span class="val">💎 ${ngocCount}</span>
          <span class="lbl">Ngọc</span>
        </div>
        <div class="hero-pill">
          <span class="val">🔥 ${streakDays}</span>
          <span class="lbl">Chuỗi Ngày</span>
        </div>
        <div class="hero-pill">
          <span class="val">🛡️ 100</span>
          <span class="lbl">Đức Hạnh</span>
        </div>
      </div>
    </section>

    <!-- AUTO ENGINE COMMAND BANNER -->
    <section class="auto-engine-card">
      <div class="auto-engine-info">
        <div class="auto-badge ${autoEnabled ? 'auto-badge-on' : 'auto-badge-off'}" id="autoEngineBadge">
          ${autoEnabled ? '🟢 CỖ MÁY TỰ CHƠI AUTO: ĐANG HOẠT ĐỘNG (24/7)' : '⚪ CỖ MÁY TỰ CHƠI AUTO: ĐANG TẮT'}
        </div>
        <div class="auto-desc">
          ${autoEnabled
            ? 'Cỗ máy đang tự động kiểm tra nhiệm vụ ngày (00:05 UTC+7), quét hoàn thành việc còn thiếu mỗi 15 phút và giữ thức Render.'
            : 'Nhấn nút bật bên cạnh để cỗ máy tự động chơi toàn diện trên cloud Render mà không cần can thiệp.'}
        </div>
      </div>
      <div class="auto-engine-actions">
        <button type="button" class="btn ${autoEnabled ? 'btn-danger' : 'btn-success'}" onclick="toggleAutoMode()" id="autoToggleBtn">
          ${autoEnabled ? '🛑 Tắt Chế Độ Auto' : '🤖 Bật Tự Động Chơi (Auto)'}
        </button>
        <button type="button" class="btn btn-primary" onclick="runTask('all')" ${isAnyRunning ? 'disabled' : ''}>
          ⚡ Chạy Nhanh Toàn Bộ
        </button>
        <button type="button" class="btn btn-gold" onclick="runTask('claim')" ${isAnyRunning ? 'disabled' : ''}>
          🎁 Nhận Tất Cả Quà
        </button>
        <button type="button" class="btn" onclick="runTask('ngoi-daily')" ${isAnyRunning ? 'disabled' : ''}>
          🧘 Thiền 5 Phút
        </button>
        <button type="button" class="btn btn-danger" onclick="stopTask()" ${!isRunning || isStopping ? 'disabled' : ''}>
          🛑 Dừng Tác Vụ
        </button>
      </div>
    </section>

    <!-- CULTIVATION STATS GRID -->
    <h2 class="section-title">📊 Chỉ Số Công Đức Tu Tập (Niệm Phật Online)</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">🙇</div>
        <div class="stat-num">${bowsCount}</div>
        <div class="stat-label">Lạy Phật</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📿</div>
        <div class="stat-num">${beadsCount}</div>
        <div class="stat-label">Hạt Tràng (${roundsCount} chuỗi)</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🪵</div>
        <div class="stat-num">${moCount}</div>
        <div class="stat-label">Tiếng Mõ</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧘</div>
        <div class="stat-num">${sitMin}</div>
        <div class="stat-label">Phút Thiền</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📜</div>
        <div class="stat-num">${chantsCount}</div>
        <div class="stat-label">Bài Kinh</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🧹</div>
        <div class="stat-num">${sweepsCount}</div>
        <div class="stat-label">Lần Quét Sân</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🏯</div>
        <div class="stat-num">${visitsCount}</div>
        <div class="stat-label">Cổ Tự Đã Viếng</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">☸️</div>
        <div class="stat-num">${roundsCount || 2}</div>
        <div class="stat-label">Vòng Quay Lộc</div>
      </div>
    </div>

    <!-- DAILY QUESTS REPORT -->
    <section class="quests-section">
      <h2 class="section-title">📋 Báo Cáo Nhiệm Vụ Hôm Nay</h2>
      ${questsSummaryHTML}
      <div class="quests-list">
        ${questsListHTML}
      </div>
    </section>

    <!-- DEEP PRACTICE GRID -->
    <h2 class="section-title">⚡ Thao Tác Tu Tập & Cày Mốc Nhanh</h2>
    <div class="practice-grid">
      <!-- Gõ Mõ Tụng Kinh -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🪵</span>
          <div class="practice-title-box">
            <b>Gõ Mõ Tụng Kinh</b>
            <small>Thời khóa 108 tiếng định tâm</small>
          </div>
        </div>
        <div class="practice-controls">
          <input type="number" id="count_tung" value="108" min="1" max="20000" ${isAnyRunning ? 'disabled' : ''}>
          <select onchange="if(this.value){ document.getElementById('count_tung').value = this.value; }" ${isAnyRunning ? 'disabled' : ''}>
            <option value="" disabled selected>Gợi ý ▼</option>
            ${tungSmartOption}
            <option value="30">30 tiếng (Khởi tâm)</option>
            <option value="54">54 tiếng (Nửa khóa)</option>
            <option value="108">108 tiếng (Chuẩn khóa lễ 🏆)</option>
            <option value="216">216 tiếng (2 khóa lễ)</option>
            <option value="300">300 tiếng (Sám hối)</option>
            <option value="1080">1.080 tiếng (Đại khóa lễ 🏆)</option>
          </select>
          <button type="button" class="btn btn-sm btn-gold" onclick="runTask('tung', { count: parseInt(document.getElementById('count_tung').value, 10) })" ${isAnyRunning ? 'disabled' : ''}>
            🪵 Gõ Mõ
          </button>
        </div>
      </div>

      <!-- Gõ Mõ Tích Luỹ Mốc -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🪵</span>
          <div class="practice-title-box">
            <b>Gõ Mõ Tích Luỹ Mốc</b>
            <small>Cày mốc thành tựu vĩnh viễn</small>
          </div>
        </div>
        <div class="practice-controls">
          <input type="number" id="count_mo" value="108" min="1" max="20000" ${isAnyRunning ? 'disabled' : ''}>
          <select onchange="if(this.value){ document.getElementById('count_mo').value = this.value; }" ${isAnyRunning ? 'disabled' : ''}>
            <option value="" disabled selected>Gợi ý ▼</option>
            <option value="108">108 tiếng (1 chuỗi)</option>
            <option value="300">300 tiếng (Định tâm)</option>
            <option value="1080">1.080 tiếng</option>
          </select>
          <button type="button" class="btn btn-sm" onclick="runTask('mo', { count: parseInt(document.getElementById('count_mo').value, 10) })" ${isAnyRunning ? 'disabled' : ''}>
            🪵 Gõ Tích Luỹ
          </button>
        </div>
      </div>

      <!-- Lăn Tràng Hạt -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">📿</span>
          <div class="practice-title-box">
            <b>Lăn Tràng Hạt Niệm Phật</b>
            <small>Lăn tràng hạt niệm Phật A Di Đà (108 hạt)</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-gold" onclick="runTask('beads', { count: 108 })" ${isAnyRunning ? 'disabled' : ''}>
          📿 Lăn 1 Chuỗi Hạt
        </button>
      </div>

      <!-- Lạy Phật -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🙇</span>
          <div class="practice-title-box">
            <b>Lạy Phật Sám Hối</b>
            <small>Cúi đầu đảnh lễ Đức Phật sám hối</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-primary" onclick="runTask('lay-daily')" ${isAnyRunning ? 'disabled' : ''}>
          🙇 Lạy Phật Ngay
        </button>
      </div>

      <!-- Quét Sân Chùa -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🧹</span>
          <div class="practice-title-box">
            <b>Quét Lá Sân Chùa</b>
            <small>Công quả dọn sạch lá rụng khuôn viên</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick="runTask('quet', { count: 10 })" ${isAnyRunning ? 'disabled' : ''}>
          🧹 Quét 10 Lần
        </button>
      </div>

      <!-- Thỉnh Chuông -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🔔</span>
          <div class="practice-title-box">
            <b>Thỉnh Chuông Bát Nhã</b>
            <small>Ngân vang một tiếng đại hồng chung</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick="runTask('bell')" ${isAnyRunning ? 'disabled' : ''}>
          🔔 Thỉnh Chuông
        </button>
      </div>

      <!-- Dâng Hương -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🪔</span>
          <div class="practice-title-box">
            <b>Dâng Hương Tam Bảo</b>
            <small>Thắp nén tâm hương thành kính</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick="runTask('incense', { count: 1 })" ${isAnyRunning ? 'disabled' : ''}>
          🪔 Thắp 1 Nén Hương
        </button>
      </div>

      <!-- Gieo Quẻ & Vòng Quay -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">☸️</span>
          <div class="practice-title-box">
            <b>Vòng Quay & Quẻ Cát Tường</b>
            <small>Quay vòng lộc nhận Sen và gieo quẻ đầu ngày</small>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-sm btn-gold" onclick="runTask('wheel')" ${isAnyRunning ? 'disabled' : ''}>
            ☸️ Vòng Quay
          </button>
          <button type="button" class="btn btn-sm" onclick="runTask('que')" ${isAnyRunning ? 'disabled' : ''}>
            📜 Gieo Quẻ
          </button>
        </div>
      </div>

      <!-- Viếng Cổ Tự -->
      <div class="practice-card">
        <div class="practice-top">
          <span class="practice-icon">🏯</span>
          <div class="practice-title-box">
            <b>Chiêm Bái Cổ Tự</b>
            <small>Hành hương viếng 20 danh lam cổ tự</small>
          </div>
        </div>
        <button type="button" class="btn btn-sm" onclick="runTask('visit')" ${isAnyRunning ? 'disabled' : ''}>
          🏯 Viếng Toàn Bộ Cổ Tự
        </button>
      </div>
    </div>

    <!-- TÀNG KINH CÁC & THƯ VIỆN KINH ĐIỂN -->
    <section class="showcase-card">
      <div class="showcase-header">
        <div>
          <h3 style="color:var(--gold-light); font-size:15px; margin:0;">📖 Tàng Kinh Các & Thư Viện Kinh Điển (6 Bài Kinh Giác Ngộ)</h3>
          <small style="color:var(--text-dim); font-size:12px;">Kinh văn đại thừa & chân ngôn mầu nhiệm lưu giữ nơi Tàng Kinh Các chốn thiền môn</small>
        </div>
        <button type="button" class="btn btn-primary" onclick="runTask('tangkinh')" ${isAnyRunning ? 'disabled' : ''}>
          📖 Nghe Trọn Bộ Kinh Điển Ngay
        </button>
      </div>
      <div class="sutras-grid">
        ${sutrasCardsHTML}
      </div>
    </section>

    <!-- TỦ CHỮ THƯ PHÁP THẦY ĐỒ -->
    <section class="showcase-card">
      <div class="showcase-header">
        <div>
          <h3 style="color:var(--gold-light); font-size:15px; margin:0;">📜 Tủ Chữ Thư Pháp Thầy Đồ (Trọn Bộ 12 Chữ)</h3>
          <small style="color:var(--text-dim); font-size:12px;">Mỗi chữ là một lời chúc phước lành và ý nghĩa tu dưỡng đạo đức chốn thiền môn</small>
        </div>
        <button type="button" class="btn btn-gold" onclick="runTask('chu-all')" ${isAnyRunning ? 'disabled' : ''}>
          📜 Xin Trọn Bộ 12 Chữ Ngay
        </button>
      </div>
      <div class="calligraphy-grid">
        ${calligraphyCardsHTML}
      </div>
    </section>

    <!-- LIVE LOGS CONSOLE -->
    <section class="logs-card">
      <div class="logs-header">
        <h2 class="section-title" style="margin:0;">📟 Nhật Ký Thực Thi Thời Gian Thực</h2>
        <div style="display:flex; gap:8px;">
          <button type="button" class="btn btn-sm" onclick="clearLogs()">🧹 Làm Sạch Log</button>
          <button type="button" class="btn btn-sm" onclick="copyLogs()">📋 Sao Chép Log</button>
        </div>
      </div>
      <div class="terminal-box" id="terminalBox">
        ${state.currentLogs.map(l => `
          <div class="log-line">
            <span class="log-time">${escapeHTML(l.timeDisplay || '')}</span>
            <span>${l.icon || 'ℹ️'}</span>
            <span class="log-${l.level || 'info'}">${escapeHTML(l.message)}</span>
          </div>
        `).join('') || '<div class="log-line" style="color:var(--text-muted);">Chưa có nhật ký hoạt động nào.</div>'}
      </div>
    </section>
  </div>

  <script>
    const CSRF_TOKEN = '${CSRF_TOKEN}';
    let isTaskRunning = ${isRunning ? 'true' : 'false'};

    // Turbo Mode Sync
    const savedTurbo = localStorage.getItem('didenchua_turbo');
    const isTurbo = savedTurbo === 'true';
    const turboCheckbox = document.getElementById('turboModeToggle');
    if (turboCheckbox) turboCheckbox.checked = isTurbo;

    function toggleTurboMode(checked) {
      localStorage.setItem('didenchua_turbo', checked ? 'true' : 'false');
    }

    // Run Task API
    async function runTask(taskId, extraOptions = {}) {
      if (isTaskRunning) return;
      const isTurbo = localStorage.getItem('didenchua_turbo') === 'true';
      const payload = { task: taskId, turbo: isTurbo, ...extraOptions };

      try {
        const resp = await fetch('/api/run', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': CSRF_TOKEN
          },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok) {
          alert(data.error || data.message || 'Lỗi khi kích hoạt tác vụ');
        } else {
          isTaskRunning = true;
          updateRunningUI(true, taskId);
        }
      } catch (err) {
        alert('Lỗi kết nối máy chủ: ' + err.message);
      }
    }

    // Stop Task API
    async function stopTask() {
      try {
        const resp = await fetch('/api/stop', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': CSRF_TOKEN
          }
        });
        const data = await resp.json();
        if (resp.ok) {
          alert(data.message || 'Đã gửi lệnh dừng an toàn.');
        }
      } catch (err) {
        alert('Lỗi khi gửi lệnh dừng: ' + err.message);
      }
    }

    // Refresh Data API
    async function refreshData() {
      try {
        const resp = await fetch('/api/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': CSRF_TOKEN
          }
        });
        const data = await resp.json();
        if (data.ok) {
          window.location.reload();
        } else {
          alert(data.message || 'Không thể làm mới dữ liệu');
        }
      } catch (err) {
        alert('Lỗi khi làm mới: ' + err.message);
      }
    }

    // Toggle Auto Play API
    async function toggleAutoMode() {
      try {
        const resp = await fetch('/api/auto/toggle', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': CSRF_TOKEN
          }
        });
        const data = await resp.json();
        if (data.ok) {
          window.location.reload();
        } else {
          alert(data.error || 'Lỗi khi chuyển đổi chế độ Auto');
        }
      } catch (err) {
        alert('Lỗi kết nối: ' + err.message);
      }
    }

    function clearLogs() {
      const box = document.getElementById('terminalBox');
      if (box) box.innerHTML = '<div class="log-line" style="color:var(--text-muted);">Đã làm sạch nhật ký trên màn hình.</div>';
    }

    function copyLogs() {
      const box = document.getElementById('terminalBox');
      if (box) {
        navigator.clipboard.writeText(box.innerText).then(() => {
          alert('Đã sao chép toàn bộ nhật ký vào clipboard!');
        }).catch(() => {});
      }
    }

    function updateRunningUI(running, taskName) {
      const badge = document.getElementById('botStatusBadge');
      if (badge) {
        if (running) {
          badge.className = 'badge badge-ready';
          badge.textContent = '🟡 Đang thực thi: ' + (taskName || 'Tác vụ');
        } else {
          badge.className = 'badge badge-done';
          badge.textContent = '🟢 Sẵn sàng';
        }
      }
      document.querySelectorAll('button:not(#autoToggleBtn)').forEach(btn => {
        if (!btn.classList.contains('btn-danger') || !btn.textContent.includes('Dừng')) {
          btn.disabled = running;
        }
      });
    }

    // Clock
    setInterval(() => {
      const clock = document.getElementById('serverClock');
      if (clock) {
        const now = new Date(Date.now() + 7 * 3600 * 1000);
        clock.textContent = '⏰ ' + now.toISOString().slice(11, 19) + ' (UTC+7)';
      }
    }, 1000);

    // Status Polling
    let pollingInterval = 4000;
    async function pollStatus() {
      try {
        const resp = await fetch('/api/status', {
          headers: { 'x-csrf-token': CSRF_TOKEN }
        });
        if (resp.ok) {
          const data = await resp.json();
          const running = Boolean(data.isRunning);
          if (running !== isTaskRunning) {
            isTaskRunning = running;
            if (!running) {
              window.location.reload();
              return;
            }
            updateRunningUI(running, data.runningTaskName);
          }
          if (Array.isArray(data.liveTaskLogs)) {
            const box = document.getElementById('terminalBox');
            if (box && data.liveTaskLogs.length > 0) {
              box.innerHTML = data.liveTaskLogs.map(function(l) {
                return '<div class="log-line"><span class="log-time">' + (l.timeDisplay || '') + '</span> <span>' + (l.icon || 'ℹ️') + '</span> <span class="log-' + (l.level || 'info') + '">' + (l.message || '') + '</span></div>';
              }).join('');
            }
          }
        }
      } catch {}
      setTimeout(pollStatus, isTaskRunning ? 2000 : 5000);
    }
    setTimeout(pollStatus, 3000);
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
      app: 'niemphat-online-bot',
      domain: 'https://niemphat.online',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      running: state.isRunning,
      stopping: state.isStopping,
      autoEnabled: state.autoEnabled
    }, null, 2));
    return;
  }

  // 1b. API Bật/Tắt chế độ tự chơi Auto
  if (url.pathname === '/api/auto/toggle') {
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

    state.autoEnabled = !state.autoEnabled;
    addWebLog(`🤖 Chế độ Tự Động Chơi (Auto Engine): ${state.autoEnabled ? 'ĐÃ BẬT' : 'ĐÃ TẮT'}`, state.autoEnabled ? 'success' : 'warn', '🤖');
    saveCachedState();

    if (state.autoEnabled && !state.isRunning && !state.isStopping) {
      executeRoutine('Auto Bot (Kích hoạt từ Dashboard)', { fast: true }).catch(console.error);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      autoEnabled: state.autoEnabled,
      message: `Đã ${state.autoEnabled ? 'bật' : 'tắt'} chế độ tự động chơi.`
    }));
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
      autoEnabled: state.autoEnabled,
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
      autoEnabled: state.autoEnabled,
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

export { server, state, loadCachedState, saveCachedState, refreshAccountData, executeRoutine };

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
    // Khởi động vòng lặp Tự Chơi Auto
    startAutoLoop();

    if (state.autoEnabled) {
      log.temple('🤖', 'Chế độ Tự Động Chơi (Auto Engine) đang BẬT. Sẽ tự động kiểm tra và chạy sau 5 giây...');
      setTimeout(() => {
        if (!state.isRunning && !state.isStopping) {
          executeRoutine('Auto Engine Boot Initializer', { fast: true }).catch(console.error);
        }
      }, 5000);
    }
  });
}
