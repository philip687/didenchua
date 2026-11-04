import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';

export async function runLantern(text = 'Cầu cho muôn người bình an, vạn sự hanh thông', color = 'vang', count = 1) {
  const client = new DiDenChuaClient();
  try {
    await client.connect();
    await client.doLantern(text, color, count);
    log.success('Đã thả hoa đăng và nhận công đức!');
    client.printStatus();
  } catch (err) {
    log.error('Lỗi khi thả hoa đăng:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('lantern.js')) {
  const arg1 = process.argv[2];
  let customText = 'Cầu cho muôn người bình an, vạn sự hanh thông';
  let customColor = 'vang';
  let customCount = 1;

  if (arg1 && !isNaN(Number(arg1))) {
    customCount = parseInt(arg1, 10);
  } else if (arg1) {
    customText = arg1;
    customColor = process.argv[3] || 'vang';
    customCount = process.argv[4] ? parseInt(process.argv[4], 10) : 1;
  }

  runLantern(customText, customColor, customCount).then(() => process.exit(0));
}
