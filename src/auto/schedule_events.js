/**
 * Module quản lý lịch trình sự kiện thời gian thực theo múi giờ Việt Nam (Asia/Ho_Chi_Minh - UTC+7).
 * Hỗ trợ tự động nhận diện các khung giờ đặc biệt:
 * 1. Thắp đèn Chánh điện: 16:30 - 21:30 UTC+7
 * 2. Đố vui Phật pháp trực tiếp: 20:00 (sảnh mở 19:58 - 20:15) UTC+7
 * 3. Chuyển giao ngày mới (Reset nhiệm vụ chùa): 00:01 - 00:05 UTC+7
 */

/**
 * Trích xuất thời gian chi tiết theo múi giờ Asia/Ho_Chi_Minh (UTC+7)
 */
export function getVNTime(date = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  let hours = parseInt(map.hour, 10);
  if (hours === 24) hours = 0;
  const minutes = parseInt(map.minute, 10);
  const seconds = parseInt(map.second, 10);
  const totalMinutes = hours * 60 + minutes;

  return {
    rawDate: date,
    year,
    month,
    day,
    hours,
    minutes,
    seconds,
    totalMinutes,
    timeStr: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  };
}

/**
 * Kiểm tra xem hiện tại có đang trong khung giờ thắp đèn Chánh điện không (16:30 - 21:30 UTC+7)
 */
export function isLampTime(date = new Date()) {
  const vn = getVNTime(date);
  // 16:30 = 16*60 + 30 = 990 phút
  // 21:30 = 21*60 + 30 = 1290 phút
  return vn.totalMinutes >= 990 && vn.totalMinutes <= 1290;
}

/**
 * Kiểm tra xem hiện tại có đang trong khung giờ Đố vui Phật pháp trực tiếp không (19:58 - 20:15 UTC+7)
 */
export function isQuizTime(date = new Date()) {
  const vn = getVNTime(date);
  // 19:58 = 19*60 + 58 = 1198 phút
  // 20:15 = 20*60 + 15 = 1215 phút
  return vn.totalMinutes >= 1198 && vn.totalMinutes <= 1215;
}

/**
 * Kiểm tra xem hiện tại có đang trong khung giờ chuyển giao ngày mới không (00:01 - 00:05 UTC+7)
 */
export function isDayResetTime(date = new Date()) {
  const vn = getVNTime(date);
  return vn.totalMinutes >= 1 && vn.totalMinutes <= 5;
}

/**
 * Tính toán mốc sự kiện hệ thống kế tiếp và thời gian đếm ngược còn lại
 */
export function getNextScheduledEvent(date = new Date()) {
  const vn = getVNTime(date);
  const nowMs = date.getTime();

  // Danh sách các mốc giờ hệ thống trong ngày (theo phút tính từ 00:00)
  const SCHEDULE_POINTS = [
    { id: 'day_reset', name: 'Đón ngày mới & Reset nhiệm vụ chùa', hour: 0, minute: 1 },
    { id: 'lamp_start', name: 'Bắt đầu khung giờ thắp đèn Chánh điện (16:30)', hour: 16, minute: 30 },
    { id: 'quiz_live', name: 'Trận Đố vui Phật pháp trực tiếp (20:00)', hour: 20, minute: 0 },
    { id: 'lamp_end', name: 'Khép đèn Chánh điện (21:30)', hour: 21, minute: 30 }
  ];

  let nextEvent = null;
  let minWaitMs = Infinity;

  // Tính thời gian cho ngày hôm nay và ngày mai theo mốc UTC+7
  for (const pt of SCHEDULE_POINTS) {
    const ptMinutes = pt.hour * 60 + pt.minute;
    let diffMinutes = ptMinutes - vn.totalMinutes;
    if (diffMinutes <= 0) {
      // Mốc này đã qua trong ngày hôm nay, tính sang ngày mai
      diffMinutes += 24 * 60;
    }

    const waitMs = (diffMinutes * 60 - vn.seconds) * 1000;
    if (waitMs > 0 && waitMs < minWaitMs) {
      minWaitMs = waitMs;
      nextEvent = {
        id: pt.id,
        name: pt.name,
        targetTimeStr: `${String(pt.hour).padStart(2, '0')}:${String(pt.minute).padStart(2, '0')}:00`,
        waitMs,
        waitFormatted: formatDuration(waitMs)
      };
    }
  }

  return {
    currentTimeVN: `${vn.dateStr} ${vn.timeStr} (UTC+7)`,
    inLampWindow: isLampTime(date),
    inQuizWindow: isQuizTime(date),
    inResetWindow: isDayResetTime(date),
    nextEvent
  };
}

/**
 * Định dạng thời lượng mili-giây sang chuỗi đọc được (giờ, phút, giây)
 */
export function formatDuration(ms) {
  if (ms <= 0) return '0 giây';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} giây`);

  return parts.join(' ');
}
