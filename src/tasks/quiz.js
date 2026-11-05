import { DiDenChuaClient } from '../client.js';
import { log } from '../logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bankPath = path.resolve(__dirname, '../../data/quiz_bank.json');

let bank = {};
if (fs.existsSync(bankPath)) {
  try {
    bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  } catch {}
}

const labels = ['A', 'B', 'C', 'D'];

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 1. Lớp tra cứu web kinh điển
async function searchWebForAnswer(qText, opts) {
  try {
    const cleanQ = qText.replace(/[?.,!]/g, '').trim();
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(cleanQ);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timeout);

    const html = await res.text();
    const snippets = [];
    const regex = /class="result__snippet"[^>]*>(.*?)<\/a>/gs;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const cleanSnippet = m[1].replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
      snippets.push(cleanSnippet);
    }

    if (snippets.length === 0) return null;
    const fullText = snippets.join(' ').toLowerCase();

    let bestScore = -1;
    let bestIdx = 0;

    opts.forEach((opt, idx) => {
      const optClean = opt.toLowerCase().trim();
      let score = 0;
      const exactMatches = (fullText.match(new RegExp(escapeRegex(optClean), 'g')) || []).length;
      score += exactMatches * 10;

      const words = optClean.split(/\s+/).filter(w => w.length > 2 && !['kinh', 'của', 'trong', 'với', 'những', 'được'].includes(w));
      for (const w of words) {
        const wordMatches = (fullText.match(new RegExp(escapeRegex(w), 'g')) || []).length;
        score += wordMatches * 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestScore > 0) {
      return {
        pickIndex: bestIdx,
        snippet: snippets[0],
        score: bestScore
      };
    }
    return null;
  } catch {
    return null;
  }
}

// 2. Lớp gọi Google Gemini 3.5 Flash
async function askGeminiAPI(qText, opts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Bạn là một học giả Phật học uyên bác. Hãy chọn đáp án đúng cho câu hỏi trắc nghiệm Phật giáo sau:\nCâu hỏi: ${qText}\nCác lựa chọn:\n${opts.map((o, i) => `${i}. ${o}`).join('\n')}\nChỉ trả về JSON dạng: {"right": 0, "why": "giải thích ngắn gọn"}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    clearTimeout(timeout);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const match = text.match(/\{[\s\S]*"right"[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (typeof parsed.right === 'number' && parsed.right >= 0 && parsed.right < opts.length) {
        return { pickIndex: parsed.right, why: parsed.why || 'Gemini 3.5 Flash suy luận' };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Bộ giải đố 4 lớp chuẩn xác
export async function solveQuestion(qText, opts) {
  // Lớp 1: Ngân hàng 166 câu đã kiểm chứng (khớp theo nội dung đáp án vì server xáo trộn thứ tự A, B, C, D)
  if (bank[qText]) {
    const entry = bank[qText];
    const targetText = (entry.rightText || (entry.opts && entry.opts[entry.right]) || '').trim().toLowerCase();
    if (targetText) {
      const matchIdx = opts.findIndex(o => o.trim().toLowerCase() === targetText);
      if (matchIdx !== -1) {
        return {
          pickIndex: matchIdx,
          source: 'Ngân hàng 166 câu chùa (Khớp nội dung)',
          why: entry.why || entry.rightText
        };
      }
    }
  }

  // Lớp 2: Gemini 3.5 Flash
  const aiRes = await askGeminiAPI(qText, opts);
  if (aiRes) {
    return {
      pickIndex: aiRes.pickIndex,
      source: 'Gemini 3.5 Flash',
      why: aiRes.why
    };
  }

  // Lớp 3: Tìm kiếm kinh điển web trực tuyến
  const webRes = await searchWebForAnswer(qText, opts);
  if (webRes) {
    return {
      pickIndex: webRes.pickIndex,
      source: 'Kinh điển Web Search',
      why: webRes.snippet?.slice(0, 80)
    };
  }

  // Lớp 4: Heuristic dự phòng
  return {
    pickIndex: 0,
    source: 'Heuristic dự phòng',
    why: 'Chọn đáp án mặc định'
  };
}

export async function runQuizWithClient(client, options = {}) {
  log.temple('🧠', '=== KHỞI ĐỘNG TÁC VỤ ĐỐ VUI PHẬT PHÁP ===');

  // Lấy thời gian hiện tại
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  // Nếu đang trong khung giờ trực tiếp 19:55 - 20:15
  const isLiveWindow = (h === 19 && m >= 54) || (h === 20 && m <= 15);
  const mode = options.mode || (isLiveWindow ? 'live' : 'practice');

  if (mode === 'live') {
    log.temple('🏆', `[TRẬN ĐẤU TRỰC TIẾP 20:00] Bắt đầu vào sảnh chờ Chánh điện...`);
    client.send({ t: 'visit', zone: 'Chánh điện' });
    await client.sleep(500);
    client.send({ t: 'quiz' });
    log.info('Đang kết nối sảnh Đố Vui trực tiếp...');
    return { mode: 'live', status: 'connected' };
  }

  // Chế độ Luyện tập ôn tập 5 câu hỏi
  log.temple('📖', `[CHẾ ĐỘ ÔN TẬP LUYỆN TẬP] Gửi yêu cầu lấy bộ 5 câu hỏi ôn tập Phật pháp...`);
  
  let practiceQs = [];
  const pPromise = new Promise((resolve) => {
    const handler = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.t === 'quiz-practice' && Array.isArray(d.qs)) {
          practiceQs = d.qs;
          client.ws?.removeEventListener('message', handler);
          resolve();
        }
      } catch {}
    };
    client.ws?.addEventListener('message', handler);
    // Timeout dự phòng 5s
    setTimeout(resolve, 5000);
  });

  client.send({ t: 'quiz-practice' });
  await pPromise;

  if (practiceQs.length === 0) {
    log.warn('Máy chủ chưa gửi bộ câu hỏi luyện tập (có thể đang giờ cao điểm). Thử lại sau.');
    return { mode: 'practice', total: 0, correct: 0 };
  }

  log.success(`Đã nhận thành công bộ ${practiceQs.length} câu hỏi Phật học từ chùa! Bắt đầu giải:`);
  console.log('----------------------------------------------------------------------');

  let correctCount = 0;
  for (let idx = 0; idx < practiceQs.length; idx++) {
    const q = practiceQs[idx];
    const qNum = idx + 1;
    log.info(`[Câu ${qNum}/${practiceQs.length}]: "${q.text}"`);

    const solution = await solveQuestion(q.text, q.opts);
    const chosenLabel = labels[solution.pickIndex];
    const chosenText = q.opts[solution.pickIndex];

    const isRight = solution.pickIndex === q.right;
    if (isRight) correctCount++;

    const icon = isRight ? '✅' : '⚠️';
    log.info(`  ${icon} Lựa chọn: [${chosenLabel}] ${chosenText}`);
    log.info(`  -> Nguồn phân tích: ${solution.source} (${solution.why})`);
    await client.sleep(800);
  }

  console.log('----------------------------------------------------------------------');
  log.success(`🏆 KẾT QUẢ ĐỐ VUI PHẬT PHÁP: Hoàn thành ${correctCount}/${practiceQs.length} câu chính xác (${Math.round(correctCount / practiceQs.length * 100)}%)!`);
  
  // Tự động nhận thưởng nhiệm vụ tuần wDoVui nếu đủ điều kiện
  client.send({ t: 'claim', q: 'wDoVui' });
  client.send({ t: 'claim', q: 'wTron' });
  await client.sleep(500);

  return {
    mode: 'practice',
    total: practiceQs.length,
    correct: correctCount,
    rate: Math.round(correctCount / practiceQs.length * 100)
  };
}

export async function runQuiz(options = {}) {
  const client = new DiDenChuaClient();
  try {
    await client.connect(8000);
    return await runQuizWithClient(client, options);
  } catch (err) {
    log.error('Lỗi khi thực hiện Đố Vui Phật Pháp:', err.message);
  } finally {
    client.close();
  }
}

if (process.argv[1]?.endsWith('quiz.js')) {
  runQuiz().then(() => process.exit(0));
}
