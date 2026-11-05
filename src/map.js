import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mapDataPath = path.resolve(__dirname, '../data/temple_map.json');

export const TEMPLE_MAP = JSON.parse(fs.readFileSync(mapDataPath, 'utf8'));
export const PLACES = TEMPLE_MAP.places;
export const ZONES = TEMPLE_MAP.zones;
export const BOUNDS = TEMPLE_MAP.bounds;

/**
 * Tự động xác định tên khu vực (zone) từ tọa độ 3D (x, z)
 * dựa theo thuật toán gs(x, z) nguyên bản của game didenchua.online
 */
export function getZoneFromCoords(x, z) {
  if (x > 2900) return 'Am riêng';
  if (x < -2900) return 'Pháp đường';

  const { hall, upper, terrace, well, mound, petGarden, flowerGarden } = TEMPLE_MAP.zones;

  // 1. Chánh điện
  if (x > hall.x0 && x < hall.x1 && z > hall.z0 && z < hall.z1) return 'Chánh điện';

  // 2. Bảo tháp
  if (z < -46 && Math.abs(x) < 18) return 'Bảo tháp';

  // 3. Giếng Ngọc
  if (Math.hypot(x - well.center.x, z - well.center.z) < well.radius) return 'Giếng Ngọc';

  // 4. Tượng Di Lặc
  if (Math.hypot(x - mound.center.x, z - mound.center.z) < mound.radius) return 'Tượng Di Lặc';

  // 5. Hồ sen · Cầu Duyên
  if (x > 29) return 'Hồ sen · Cầu Duyên';

  // 6. Vườn Linh Thú
  if (x > petGarden.x0 && x < petGarden.x1 && z > petGarden.z0 && z < petGarden.z1) return 'Vườn Linh Thú';

  // 7. Vườn hoa
  if (x > flowerGarden.x0 && x < flowerGarden.x1 && z > flowerGarden.z0 && z < flowerGarden.z1) return 'Vườn hoa';

  // 8. Vườn thiền
  if (x < -29) return 'Vườn thiền';

  // 9. Hành lang La Hán
  if (Math.abs(x) > 24 && z > 10 && z < 58) return 'Hành lang La Hán';

  // 10. Trục đường vào cổng
  if (z > 95) return 'Cổng tam quan';
  if (z > 58) return 'Đường thần đạo';

  // 11. Sân chùa
  return 'Sân chùa';
}

/**
 * Tìm địa điểm theo id hoặc tên
 */
export function findPlace(query) {
  if (!query) return null;
  const q = query.toLowerCase().trim();
  return PLACES.find(p => p.id === q || p.name.toLowerCase().includes(q)) || null;
}

/**
 * In bản đồ và tọa độ tất cả các khu vực trong chùa
 */
export function printTempleMap() {
  console.log('\n========================================================================');
  console.log('🗺️  BẢN ĐỒ CHÙA AN TỰ DUYÊN (3D WORLD COORDINATES & ZONES)');
  console.log('========================================================================');
  console.log(`• Ranh giới thế giới: Trục X [${BOUNDS.x0}m -> ${BOUNDS.x1}m] · Trục Z [${BOUNDS.z0}m -> ${BOUNDS.z1}m]`);
  console.log(`• Điểm xuất hiện ban đầu (Spawn): x=${TEMPLE_MAP.spawn.x}, y=${TEMPLE_MAP.spawn.y}, z=${TEMPLE_MAP.spawn.z}`);
  console.log('------------------------------------------------------------------------');
  console.log('📍  DANH SÁCH 17 ĐỊA ĐIỂM CHÍNH TRÊN BẢN ĐỒ:');
  PLACES.forEach((p, idx) => {
    const coords = `(x: ${p.pos.x.toFixed(1)}, y: ${p.pos.y.toFixed(1)}, z: ${p.pos.z.toFixed(1)})`;
    console.log(`  ${(idx + 1).toString().padStart(2, ' ')}. [${p.id.padEnd(14, ' ')}] ${p.name.padEnd(22, ' ')} : ${coords}`);
    console.log(`      ↳ ${p.desc}`);
  });
  console.log('========================================================================\n');
}

/**
 * Lệnh di chuyển nhanh nhân vật tới vị trí trên bản đồ
 */
export async function teleportToPlace(client, placeQuery) {
  const target = findPlace(placeQuery);
  if (!target) {
    log.error(`Không tìm thấy địa điểm "${placeQuery}" trên bản đồ chùa!`);
    return false;
  }

  log.temple('🚶', `Khoan thai di chuyển tới [${target.name}]...`);
  // 1. Gửi sự kiện visit
  client.send({ t: 'visit', zone: target.zone });
  await client.sleep(300);

  // 2. Cập nhật vị trí tọa độ 3D
  const rotY = target.yaw + Math.PI;
  client.send({
    t: 'state',
    x: target.pos.x,
    y: target.pos.y,
    z: target.pos.z,
    ry: rotY,
    s: 0
  });
  await client.sleep(400);
  log.success(`-> Đã tới [${target.name}] (tọa độ x: ${target.pos.x}, z: ${target.pos.z}, hướng: ${rotY.toFixed(2)} rad).`);
  return true;
}

if (process.argv[1]?.endsWith('map.js')) {
  printTempleMap();
}

