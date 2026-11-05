import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');
const ENV_PATH = path.join(__dirname, '.env');

// Tự động nạp biến môi trường từ .env nếu có (không cần thư viện dotenv bên ngoài)
if (fs.existsSync(ENV_PATH)) {
  try {
    const envLines = fs.readFileSync(ENV_PATH, 'utf-8').split('\n');
    for (const line of envLines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  } catch {}
}

const DEFAULT_CONFIG = {
  cid: crypto.randomUUID(),
  name: 'Phật Tử Tịnh Tâm',
  kind: 'tieu',      // tieu, ni
  robe: 'nau',       // nau, lam, xam, vang, cam
  skin: 'dong',      // sang, dong
  bio: 'Nam Mô A Di Đà Phật · Thân tâm thường an lạc',
  beads: 'go',       // go, bode, tramhuong, hophach, ngoc, manao
  cushion: 'xam',    // xam, nau, vang, do, sen
  room: 'chua-1',
  safeMode: true,    // Chế độ mô phỏng an toàn
  minDelaySec: 1.0,  // Giãn cách tối thiểu giữa các hành động (giây) - Đã tối ưu tốc độ
  maxDelaySec: 2.0,  // Giãn cách tối đa giữa các hành động (giây) - Đã tối ưu tốc độ
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  meditateSeconds: 3600, // Thời gian treo máy thiền mặc định (3600s = 60 phút cho phần tự động để cày Top 1 Bảng Vàng)
  autoWaterOthers: true, // Tự động tưới nước giúp các luống hoa của bạn đồng tu (+2 công đức/luống)
  maxWaterOthers: 50,    // Số luống tối đa tưới giúp mỗi chu kỳ
  calligraphyWish: 'binh-an', // Chữ thư pháp mặc định xin Thầy đồ (binh-an, an-khang, hoa-thuan, hieu, nhan, tinh-tam, tri-tue, phuc-duc, duyen, tu-bi, tinh-tan, biet-on)
  // Cấu hình mức độ cày tích lũy thành tích (Milestone Farming) sau khi làm xong nhiệm vụ ngày
  milestoneFarming: {
    enabled: true,        // Tự động cày tích lũy thành tích sau khi nhận thưởng nhiệm vụ ngày
    dailyBows: 18,        // Số lạy cày mỗi ngày (18 lạy đưa từ 90 -> 108 để đạt danh hiệu "Trăm lạy")
    dailyBeads: 88,       // Số hạt tràng lăn thêm mỗi ngày (tích lũy chuỗi 108 hạt và 100 chuỗi)
    dailySweeps: 5,       // Số lần quét lá dọn sân chùa thêm mỗi ngày
    dailyIncense: 2,      // Số lần dâng hương thêm mỗi ngày (tích lũy mốc 30 nén)
    dailyLanterns: 1      // Số ngọn hoa đăng thả thêm mỗi ngày (tích lũy mốc 10 ngọn)
  }
};

export function loadConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch (err) {
      console.error('Lỗi đọc config.json, dùng cấu hình mặc định:', err.message);
    }
  } else {
    saveConfig(DEFAULT_CONFIG);
  }

  // Ưu tiên đọc biến môi trường nếu có (chuẩn hóa cho môi trường CI/CD như GitHub Actions, Docker)
  const envConfig = {};
  if (process.env.CID) envConfig.cid = process.env.CID;
  if (process.env.NAME) envConfig.name = process.env.NAME;
  if (process.env.ROOM) envConfig.room = process.env.ROOM;
  if (process.env.SAFE_MODE !== undefined) envConfig.safeMode = process.env.SAFE_MODE === 'true';
  if (process.env.CALLIGRAPHY_WISH) envConfig.calligraphyWish = process.env.CALLIGRAPHY_WISH;

  return {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    milestoneFarming: {
      ...DEFAULT_CONFIG.milestoneFarming,
      ...(fileConfig.milestoneFarming || {})
    },
    ...envConfig
  };
}

export function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (err) {
    console.error('Lỗi ghi file config.json:', err.message);
  }
}

export default loadConfig();

