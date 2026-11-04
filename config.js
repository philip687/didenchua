import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

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
  safeMode: true,    // Chế độ mô phỏng người thật, giãn cách an toàn chống bị chặn
  minDelaySec: 3.5,  // Giãn cách tối thiểu giữa các hành động (giây)
  maxDelaySec: 7.0,  // Giãn cách tối đa giữa các hành động (giây)
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
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

