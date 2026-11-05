import { DiDenChuaClient } from '../src/client.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';

const client = new DiDenChuaClient(config);
await client.connect();

const bankPath = path.resolve('./data/quiz_bank.json');
let bank = {};
if (fs.existsSync(bankPath)) {
  try {
    bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  } catch (e) {}
}

const initialCount = Object.keys(bank).length;
console.log(`Đã có ${initialCount} câu hỏi trong ngân hàng dữ liệu.`);

let consecutiveNoNew = 0;
const MAX_NO_NEW = 35;

client.ws.addEventListener('message', (ev) => {
  try {
    const d = JSON.parse(ev.data);
    if (d.t === 'quiz-practice' && d.qs) {
      let added = 0;
      for (const q of d.qs) {
        if (!bank[q.text]) {
          bank[q.text] = {
            text: q.text,
            opts: q.opts,
            right: q.right,
            rightText: q.opts[q.right],
            why: q.why
          };
          added++;
        }
      }
      if (added > 0) {
        consecutiveNoNew = 0;
        console.log(`+ Thêm mới ${added} câu! Tổng kho: ${Object.keys(bank).length} câu.`);
      } else {
        consecutiveNoNew++;
      }
    }
  } catch(e) {}
});

client.send({ t: 'quiz' });
await client.sleep(500);

console.log('Bắt đầu quét tiếp ngân hàng câu hỏi Đố vui Phật pháp...');
for (let i = 0; i < 200; i++) {
  if (consecutiveNoNew >= MAX_NO_NEW) {
    console.log(`Không còn câu hỏi mới sau ${MAX_NO_NEW} lần quét liên tiếp. Đã vét cạn kho!`);
    break;
  }
  client.send({ t: 'quiz-practice' });
  await client.sleep(250);
}

fs.mkdirSync(path.dirname(bankPath), { recursive: true });
fs.writeFileSync(bankPath, JSON.stringify(bank, null, 2), 'utf8');
console.log(`✅ Hoàn tất lưu ${Object.keys(bank).length} câu hỏi vào ${bankPath}`);

client.close();
process.exit(0);
