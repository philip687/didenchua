import { log } from './logger.js';

// Telegram parse_mode=HTML treats dynamic account/task text as markup unless escaped.
function escapeTelegramHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function reportValue(value) {
  return value === null || value === undefined ? 'Chưa có dữ liệu' : String(value);
}

function escapeDiscordMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_{}\[\]()#+\-.!|>~])/g, '\\$1');
}

/**
 * GỬI THÔNG BÁO TỔNG KẾT BÁO CÁO CÔNG ĐỨC QUA TELEGRAM HOẶC DISCORD
 * Đọc biến môi trường:
 * - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 * - DISCORD_WEBHOOK_URL
 */

export async function sendTelegramNotification(htmlMessage) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    const data = await res.json();
    if (data.ok) {
      log.success('Đã gửi báo cáo công đức về Telegram thành công!');
      return true;
    } else {
      log.warn(`Gửi Telegram thất bại: ${data.description}`);
      return false;
    }
  } catch (err) {
    log.error('Lỗi kết nối Telegram API:', err.message);
    return false;
  }
}

export async function sendDiscordNotification(content) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return false;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    // Không cho nội dung động trong report kích hoạt @everyone/@here hoặc role mention.
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } })
    });
    if (res.ok) {
      log.success('Đã gửi báo cáo công đức về Discord thành công!');
      return true;
    }
    return false;
  } catch (err) {
    log.error('Lỗi kết nối Discord Webhook:', err.message);
    return false;
  }
}

export async function notifyRunResult(result) {
  const { status, journal, merit, durationSec, newlyUnlocked = [], runId, finishedAt, snapshotAt, snapshotStatus, error } = result;
  // Render from the recorded UTC timestamp so the notification matches the run record.
  const timeStr = finishedAt
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(finishedAt))
    : 'Chưa có thời gian';
  const statusText = {
    success: 'Đã xác nhận',
    partial: 'Hoàn tất một phần',
    failed: 'Thất bại',
    error: 'Thất bại',
    unverified: 'Đã chạy hết luồng; chưa xác minh kết quả phía máy chủ'
  }[status] || 'Không xác định';
  const playerName = reportValue(journal?.name || merit?.me?.name || process.env.NAME || 'Phật Tử');
  const rawPlayerUser = (journal?.user && journal.user !== 'null') ? journal.user : ((merit?.me?.user && merit.me.user !== 'null') ? merit.me.user : null);
  const playerUserTag = rawPlayerUser ? ` (@${rawPlayerUser})` : '';

  // 1. Soạn tin nhắn Telegram (HTML)
  let tg = `<b>🪷 BÁO CÁO CÔNG ĐỨC CHÙA ONLINE</b>\n`;
  tg += `⏰ <i>Thời gian: ${escapeTelegramHTML(timeStr)} (Asia/Ho_Chi_Minh)</i>\n`;
  tg += `🆔 <b>Run:</b> ${escapeTelegramHTML(reportValue(runId))}\n`;
  tg += `👤 <b>Phật tử:</b> ${escapeTelegramHTML(playerName)}${escapeTelegramHTML(playerUserTag)}\n`;
  tg += `🏅 <b>Cấp bậc:</b> ${escapeTelegramHTML(reportValue(merit?.me?.level ?? journal?.level))} (Lv.${escapeTelegramHTML(reportValue(merit?.me?.lv ?? journal?.lv))})\n`;
  tg += `✨ <b>Tổng công đức:</b> ${escapeTelegramHTML(reportValue(merit?.me?.total ?? journal?.merit))} (+${escapeTelegramHTML(reportValue(merit?.me?.today))} hôm nay)\n`;
  tg += `📅 <b>Chuỗi lên chùa:</b> ${escapeTelegramHTML(reportValue(merit?.me?.days ?? journal?.streak ?? journal?.days))} ngày liên tiếp\n`;
  tg += `📡 <b>Snapshot:</b> ${escapeTelegramHTML(snapshotStatus || 'không rõ')}${snapshotAt ? ` lúc ${escapeTelegramHTML(snapshotAt)} UTC` : ''}\n\n`;

  tg += `<b>📋 NHIỆM VỤ HÀNG NGÀY:</b>\n`;
  if (Array.isArray(merit?.me?.quests)) {
    for (const q of merit.me.quests) {
      const icon = q.claimed ? '✅' : (q.have >= q.need ? '🎁' : '⏳');
      tg += `• ${icon} ${escapeTelegramHTML(reportValue(q.title))} (+${escapeTelegramHTML(reportValue(q.reward))}đ)\n`;
    }
  }

  tg += `\n<b>🎯 TIẾN ĐỘ THÀNH TỰU VĨNH VIỄN:</b>\n`;
  if (journal) {
    tg += `• 🙏 Lạy Phật: <b>${escapeTelegramHTML(reportValue(journal.bows))}/108</b> (${journal.bows >= 108 ? '✅ Trăm lạy' : 'đang cày'})\n`;
    tg += `• 📿 Tràng hạt: <b>${escapeTelegramHTML(reportValue(journal.beads))} hạt</b> (${escapeTelegramHTML(reportValue(journal.rounds))} chuỗi tròn)\n`;
    tg += `• 🪔 Dâng hương: <b>${escapeTelegramHTML(reportValue(journal.incense))}/30</b> lần\n`;
    tg += `• 🏮 Thả hoa đăng: <b>${escapeTelegramHTML(reportValue(journal.lanterns))}/10</b> ngọn\n`;
    tg += `• 🧘 Tĩnh tọa: <b>${escapeTelegramHTML(reportValue(journal.sitMin))}/60</b> phút\n`;
    tg += `• 🚶 Khám phá: <b>${escapeTelegramHTML(reportValue(journal.visited))}/${escapeTelegramHTML(reportValue(journal.zones))}</b> khu vực\n`;
  }

  if (newlyUnlocked.length > 0) {
    tg += `\n🎉 <b>DANH HIỆU MỚI MỞ KHÓA:</b>\n`;
    for (const t of newlyUnlocked) {
      tg += `🏆 <b>${escapeTelegramHTML(reportValue(t.name))}</b>: ${escapeTelegramHTML(reportValue(t.desc))}\n`;
    }
  }

  tg += `\n<i>Trạng thái: ${escapeTelegramHTML(statusText)} (${escapeTelegramHTML(reportValue(durationSec))}s)</i>`;
  if (error) tg += `\n⚠️ <b>Lỗi:</b> ${escapeTelegramHTML(error)}`;

  // 2. Soạn tin nhắn Discord (Markdown)
  const discordText = `**🪷 BÁO CÁO CÔNG ĐỨC - AN TỰ DUYÊN**\n` +
    `> 🆔 Run: ${escapeDiscordMarkdown(reportValue(runId))}\n` +
    `> 👤 ${escapeDiscordMarkdown(playerName)}${escapeDiscordMarkdown(playerUserTag)} | Lv.${escapeDiscordMarkdown(reportValue(merit?.me?.lv ?? journal?.lv))} ${escapeDiscordMarkdown(reportValue(merit?.me?.level ?? journal?.level))} | Tổng: ${escapeDiscordMarkdown(reportValue(merit?.me?.total ?? journal?.merit))} công đức\n` +
    `> 🎯 Lạy Phật: ${escapeDiscordMarkdown(reportValue(journal?.bows))}/108 | Tràng hạt: ${escapeDiscordMarkdown(reportValue(journal?.beads))} | Hương: ${escapeDiscordMarkdown(reportValue(journal?.incense))}/30 | Đèn: ${escapeDiscordMarkdown(reportValue(journal?.lanterns))}/10\n` +
    `> 📡 Snapshot: ${escapeDiscordMarkdown(snapshotStatus || 'không rõ')}${snapshotAt ? ` lúc ${escapeDiscordMarkdown(snapshotAt)} UTC` : ''}\n` +
    `> ⏰ ${escapeDiscordMarkdown(timeStr)} (Asia/Ho_Chi_Minh) - ${escapeDiscordMarkdown(statusText)}` +
    (error ? `\n> ⚠️ Lỗi: ${escapeDiscordMarkdown(error)}` : '');

  await Promise.allSettled([
    sendTelegramNotification(tg),
    sendDiscordNotification(discordText)
  ]);
}

