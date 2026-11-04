import { log } from './logger.js';

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
      body: JSON.stringify({ content })
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
  const { status, journal, merit, durationSec, newlyUnlocked = [] } = result;
  const timeStr = new Date(Date.now() + 7 * 3600 * 1000).toLocaleString('vi-VN', { timeZone: 'UTC' });

  // 1. Soạn tin nhắn Telegram (HTML)
  let tg = `<b>🪷 BÁO CÁO CÔNG ĐỨC CHÙA ONLINE</b>\n`;
  tg += `⏰ <i>Thời gian: ${timeStr} (UTC+7)</i>\n`;
  tg += `👤 <b>Phật tử:</b> ${merit?.me?.name || 'thichkngan'} (@${merit?.me?.user || 'thichkngan'})\n`;
  tg += `🏅 <b>Cấp bậc:</b> ${merit?.me?.level || 'Hoan hỷ'} (Lv.${merit?.me?.lv || 3})\n`;
  tg += `✨ <b>Tổng công đức:</b> ${merit?.me?.total || 0} (+${merit?.me?.today || 0} hôm nay)\n`;
  tg += `📅 <b>Chuỗi lên chùa:</b> ${merit?.me?.days || 0} ngày liên tiếp\n\n`;

  tg += `<b>📋 NHIỆM VỤ HÀNG NGÀY:</b>\n`;
  if (Array.isArray(merit?.me?.quests)) {
    for (const q of merit.me.quests) {
      const icon = q.claimed ? '✅' : (q.have >= q.need ? '🎁' : '⏳');
      tg += `• ${icon} ${q.title} (+${q.reward}đ)\n`;
    }
  }

  tg += `\n<b>🎯 TIẾN ĐỘ THÀNH TỰU VĨNH VIỄN:</b>\n`;
  if (journal) {
    tg += `• 🙏 Lạy Phật: <b>${journal.bows}/108</b> (${journal.bows >= 108 ? '✅ Trăm lạy' : 'đang cày'})\n`;
    tg += `• 📿 Tràng hạt: <b>${journal.beads} hạt</b> (${journal.rounds} chuỗi tròn)\n`;
    tg += `• 🪔 Dâng hương: <b>${journal.incense}/30</b> lần\n`;
    tg += `• 🏮 Thả hoa đăng: <b>${journal.lanterns}/10</b> ngọn\n`;
    tg += `• 🧘 Tĩnh tọa: <b>${journal.sitMin}/60</b> phút\n`;
    tg += `• 🚶 Khám phá: <b>${journal.visited}/${journal.zones}</b> khu vực\n`;
  }

  if (newlyUnlocked.length > 0) {
    tg += `\n🎉 <b>DANH HIỆU MỚI MỞ KHÓA:</b>\n`;
    for (const t of newlyUnlocked) {
      tg += `🏆 <b>${t.name}</b>: ${t.desc}\n`;
    }
  }

  tg += `\n<i>Trạng thái: ${status === 'success' ? 'Hoàn mãn thanh tịnh 🙏' : 'Có lỗi gián đoạn ⚠️'} (${durationSec}s)</i>`;

  // 2. Soạn tin nhắn Discord (Markdown)
  const discordText = `**🪷 BÁO CÁO CÔNG ĐỨC - AN TỰ DUYÊN**\n` +
    `> 👤 **${merit?.me?.name || 'thichkngan'}** | Lv.${merit?.me?.lv || 3} ${merit?.me?.level || ''} | Tổng: **${merit?.me?.total || 0}** công đức\n` +
    `> 🎯 Lạy Phật: ${journal?.bows || 0}/108 | Tràng hạt: ${journal?.beads || 0} | Hương: ${journal?.incense || 0}/30 | Đèn: ${journal?.lanterns || 0}/10\n` +
    `> ⏰ Hoàn thành lúc: ${timeStr} (UTC+7) - ${status === 'success' ? '✅ Thành công' : '❌ Lỗi'}`;

  await Promise.allSettled([
    sendTelegramNotification(tg),
    sendDiscordNotification(discordText)
  ]);
}

