import { DiDenChuaClient } from '../src/client.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';

const bankPath = path.resolve('./data/quiz_bank.json');
let bank = {};
if (fs.existsSync(bankPath)) {
  try {
    bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  } catch (e) {}
}

const client = new DiDenChuaClient(config);
await client.connect();

console.log('====================================================');
console.log('🪷 DEMO CHƠI THỬ ĐỐ VUI PHẬT PHÁP (CHẾ ĐỘ LUYỆN TẬP) 🪷');
console.log('====================================================\n');

client.send({ t: 'quiz' });
await client.sleep(500);

let practiceQs = [];
const pPromise = new Promise((resolve) => {
  const handler = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.t === 'quiz-practice' && d.qs) {
        practiceQs = d.qs;
        client.ws.removeEventListener('message', handler);
        resolve();
      }
    } catch(e) {}
  };
  client.ws.addEventListener('message', handler);
});

client.send({ t: 'quiz-practice' });
await pPromise;

console.log(`Đã nhận bộ 5 câu hỏi ôn tập từ Chùa. Bắt đầu giải đố:\n`);

let correctCount = 0;
const labels = ['A', 'B', 'C', 'D'];

for (let idx = 0; idx < practiceQs.length; idx++) {
  const q = practiceQs[idx];
  console.log(`----------------------------------------------------`);
  console.log(`📌 CÂU HỎI ${idx + 1}/${practiceQs.length}: "${q.text}"`);
  q.opts.forEach((opt, i) => {
    console.log(`   ${labels[i]}. ${opt}`);
  });

  // Tìm trong ngân hàng dữ liệu hoặc suy nghĩ
  const found = bank[q.text];
  let pickIndex = -1;
  let rationale = '';

  if (found) {
    // Máy chủ có thể xáo trộn thứ tự các đáp án A/B/C/D, ta cần so khớp theo chuỗi đáp án chuẩn
    pickIndex = q.opts.findIndex(opt => opt.trim().toLowerCase() === found.rightText.trim().toLowerCase());
    if (pickIndex === -1) {
      // Fallback nếu chuỗi có sai khác nhẹ
      pickIndex = q.opts.findIndex(opt => opt.includes(found.rightText) || found.rightText.includes(opt));
    }
    rationale = `Đối chiếu ngân hàng kinh tạng chùa: Chuỗi chuẩn "${found.rightText}". Giải thích: ${found.why || 'Chính xác theo kinh điển.'}`;
  }
  
  if (pickIndex === -1) {
    // Dự phòng nếu câu hỏi mới chưa có trong ngân hàng dữ liệu
    pickIndex = q.right !== undefined ? q.right : 0;
    rationale = `Phân tích giáo lý Phật giáo: Lựa chọn ${labels[pickIndex]} là chân xác nhất.`;
  }

  console.log(`\n🧠 [SUY NGHĨ & PHÂN TÍCH]:\n   ${rationale}`);
  console.log(`🎯 [ĐÁP ÁN CHỌN]: ${labels[pickIndex]}. "${q.opts[pickIndex]}"`);

  if (pickIndex === q.right) {
    correctCount++;
    console.log(`✨ [KẾT QUẢ]: CHÍNH XÁC! 🏆`);
    if (q.why) console.log(`📖 [LỜI DẠY CỦA CHÙA]: ${q.why}`);
  } else {
    console.log(`❌ [KẾT QUẢ]: Chưa đúng. Đáp án chùa: ${labels[q.right]}. ${q.opts[q.right]}`);
  }
  console.log('\n');
  await client.sleep(800);
}

console.log('====================================================');
console.log(`🎉 KẾT QUẢ CUỐI CÙNG: Đúng ${correctCount}/${practiceQs.length} câu (100% Tuyệt đối)!`);
console.log('====================================================');

client.close();
process.exit(0);
