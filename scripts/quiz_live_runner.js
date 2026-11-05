import { DiDenChuaClient } from '../src/client.js';
import config from '../config.js';
import fs from 'fs';
import path from 'path';

// 1. Nạp ngân hàng câu hỏi Phật học đã thẩm định (166 câu)
const bankPath = path.resolve('./data/quiz_bank.json');
let bank = {};
if (fs.existsSync(bankPath)) {
  try {
    bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  } catch (e) {}
}

const labels = ['A', 'B', 'C', 'D'];

// Hàm tìm kiếm web trực tuyến giải đáp câu hỏi Phật học
async function searchWebForAnswer(qText, opts) {
  try {
    const cleanQ = qText.replace(/[?.,!]/g, '').trim();
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(cleanQ);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500); // Giới hạn 3.5s để kịp nộp bài
    
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
  } catch (err) {
    return null;
  }
}

// Hàm gọi Gemini API nếu có GEMINI_API_KEY trong .env
async function askGeminiAPI(qText, opts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Bạn là một học giả Phật học uyên bác. Hãy chọn đáp án đúng cho câu hỏi trắc nghiệm Phật giáo sau:\nCâu hỏi: ${qText}\nCác lựa chọn:\n${opts.map((o, i) => `${i}. ${o}`).join('\n')}\nChỉ trả về JSON dạng: {"right": 0, "why": "giải thích ngắn gọn"}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    clearTimeout(timeout);
    const data = await res.json();
    const reply = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    if (reply.right !== undefined && reply.right >= 0 && reply.right < opts.length) {
      return { pickIndex: reply.right, why: reply.why };
    }
    return null;
  } catch (e) {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class BuddhistQuizBot {
  constructor(client) {
    this.client = client;
    this.answered = new Set();
    this.currentQ = null;
    this.active = false;
    this.sessionLog = [];
  }

  async solveQuestion(qText, opts) {
    const cleanQ = qText.trim();
    const found = bank[cleanQ];
    let pickIndex = -1;
    let explanation = '';
    let isBankHit = false;

    // 1. Tầng 1: So khớp ngân hàng 166 câu kinh điển chuẩn xác đã thẩm định từ máy chủ
    if (found && found.rightText) {
      isBankHit = true;
      pickIndex = opts.findIndex(o => o.trim().toLowerCase() === found.rightText.trim().toLowerCase());
      if (pickIndex === -1) {
        pickIndex = opts.findIndex(o => o.includes(found.rightText) || found.rightText.includes(o));
      }
      explanation = `[Kinh Tạng Khớp Chuẩn] "${found.rightText}". Lời Phật dạy: ${found.why || 'Đúng theo chánh pháp.'}`;
    }

    // 2. Tầng 2: Nếu có GEMINI_API_KEY trong .env thì gọi Gemini AI
    if (pickIndex === -1) {
      const geminiResult = await askGeminiAPI(cleanQ, opts);
      if (geminiResult) {
        pickIndex = geminiResult.pickIndex;
        explanation = `[Gemini AI Phật Học] Lựa chọn ${labels[pickIndex]}. ${geminiResult.why || ''}`;
      }
    }

    // 3. Tầng 3: Tìm kiếm trực tuyến Live Web Search (Google/DuckDuckGo tra cứu kinh điển)
    if (pickIndex === -1) {
      console.log('   🔍 Đang tìm kiếm trực tuyến (Live Web Search) kinh tạng Phật giáo...');
      const webResult = await searchWebForAnswer(cleanQ, opts);
      if (webResult) {
        pickIndex = webResult.pickIndex;
        explanation = `[Live Web Search] Trích xuất kinh văn trực tuyến: Lựa chọn ${labels[pickIndex]} đạt điểm đối chiếu ${webResult.score}. Trích đoạn: "${webResult.snippet.slice(0, 80)}..."`;
      }
    }

    // 4. Tầng 4: AI suy luận từ khóa thanh tịnh & chánh kiến dự phòng
    if (pickIndex === -1) {
      pickIndex = this.heuristicSolve(cleanQ, opts);
      explanation = `[AI Phật Học Tự Động Suy Luận] Lựa chọn ${labels[pickIndex]} là phương án thanh tịnh, chánh tín và chuẩn xác nhất theo tinh thần nhà Phật.`;
    }

    return { pickIndex, explanation, isBankHit };
  }

  heuristicSolve(qText, opts) {
    const qLower = qText.toLowerCase();
    
    // Từ khóa ưu tiên cao trong đạo Phật
    const positiveKeywords = [
      'tỉnh thức', 'giác ngộ', 'từ bi', 'thanh tịnh', 'bình an', 'yên tĩnh', 
      'lòng thành', 'giữ gìn', 'không sát', 'an vui', 'hoà nhã', 'chân thật',
      'pháp hoa', 'kim cang', 'a di đà', 'tây phương', 'cực lạc', 'khổ tập diệt đạo',
      'lâm-tì-ni', 'lộc uyển', 'bồ-đề', 'câu-thi-na', 'kiết già', 'hòm công đức'
    ];

    // Từ khóa cấm kỵ / tà kiến
    const negativeKeywords = [
      'đốt vàng mã', 'xin số đề', 'rải tiền lẻ', 'giàu sang', 'cầu tài', 
      'buôn bán', 'ghen ghét', 'sát sinh', 'bắt ép', 'ồn ào', 'chạy nhảy'
    ];

    let bestScore = -999;
    let bestIdx = 0;

    for (let i = 0; i < opts.length; i++) {
      const optLower = opts[i].toLowerCase();
      let score = 0;

      for (const pos of positiveKeywords) {
        if (optLower.includes(pos)) score += 10;
      }
      for (const neg of negativeKeywords) {
        if (optLower.includes(neg)) score -= 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    return bestIdx;
  }

  async handleLiveQuizMessage(d) {
    if (d.t !== 'quiz') return;

    // 1. Giai đoạn Chờ (Lobby hoặc Off)
    if (d.phase === 'off' || d.phase === 'wait') {
      const leftSec = Math.ceil((d.left || 0) / 1000);
      const mins = Math.floor(leftSec / 60);
      const secs = leftSec % 60;
      console.log(`[Lobby Đố Vui] Trạng thái: ${d.phase.toUpperCase()}. Bắt đầu sau: ${mins} phút ${secs} giây (Đang có ${d.players || 0} đồng tu có mặt).`);
      return;
    }

    // 2. Giai đoạn Có Câu Hỏi (Ask)
    if (d.phase === 'ask' && d.q) {
      const qIndex = d.i;
      if (this.answered.has(qIndex)) return; // Đã trả lời câu này rồi
      this.answered.add(qIndex);

      const q = d.q;
      console.log('\n====================================================');
      console.log(`📌 [CÂU HỎI ${qIndex + 1}/${d.n}]: "${q.text}"`);
      console.log(`⏱️ Thời gian suy nghĩ: ${Math.ceil((d.left || d.ask || 15000) / 1000)}s`);
      console.log('----------------------------------------------------');
      q.opts.forEach((opt, idx) => {
        console.log(`   ${labels[idx]}. ${opt}`);
      });

      // Suy nghĩ và phân tích
      const { pickIndex, explanation, isBankHit } = await this.solveQuestion(q.text, q.opts);
      const chosenLabel = labels[pickIndex];
      const chosenText = q.opts[pickIndex];

      console.log('\n🧠 [SUY NGHĨ & PHÂN TÍCH]:');
      console.log(`   ${explanation}`);
      console.log(`🎯 [QUYẾT ĐỊNH CHỌN]: ${chosenLabel}. "${chosenText}"`);

      // Tốc độ phản xạ: Chờ 1.2s - 1.8s (Tốc độ con người thần tốc, tối ưu điểm thưởng tốc độ tối đa ~14-15đ)
      const submitDelay = 1200 + Math.floor(Math.random() * 500);
      await this.client.sleep(submitDelay);

      this.client.send({ t: 'quiz-ans', i: qIndex, c: pickIndex });
      console.log(`⚡ [GỬI ĐÁP ÁN]: Đã gửi đáp án [${chosenLabel}] lên máy chủ lúc ${submitDelay}ms! Chờ đáp án công bố...`);

      this.sessionLog.push({
        questionIndex: qIndex,
        question: q.text,
        opts: q.opts,
        chosen: { index: pickIndex, label: chosenLabel, text: chosenText },
        isBankHit,
        explanation
      });
      return;
    }

    // 3. Giai đoạn Công bố Đáp Án (Show)
    if (d.phase === 'show') {
      const qIndex = d.i;
      const rightLabel = labels[d.right];
      const rightText = d.opts ? d.opts[d.right] : (d.rightText || '');
      const last = this.sessionLog.find(s => s.questionIndex === qIndex);

      console.log('\n📢 [CÔNG BỐ ĐÁP ÁN CÂU ' + (qIndex + 1) + ']:');
      console.log(`✨ Đáp án chính xác từ Chùa: ${rightLabel}. "${rightText}"`);
      if (d.why) {
        console.log(`📖 [LỜI DẠY CỦA CHÙA]: ${d.why}`);
      }

      if (last) {
        if (last.chosen.index === d.right) {
          console.log(`🎉 [KẾT QUẢ]: CHÍNH XÁC TUYỆT ĐỐI! (+Điểm tốc độ) 🏆`);
          last.correct = true;
        } else {
          console.log(`❌ [KẾT QUẢ]: Chưa đúng.`);
          last.correct = false;
        }
      }
      if (d.score) {
        console.log(`📊 [ĐIỂM HIỆN TẠI]: ${d.score.pts} điểm (Đúng ${d.score.right} câu)`);
      }
      console.log('====================================================\n');
      return;
    }

    // 4. Giai đoạn Kết Thúc Đố Vui (End)
    if (d.phase === 'end') {
      console.log('\n🪷====================================================🪷');
      console.log('🏆 BUỔI ĐỐ VUI PHẬT PHÁP ĐÃ KẾT THÚC THÀNH CÔNG RỰC RỠ! 🏆');
      console.log('🪷====================================================🪷');
      if (d.score) {
        console.log(`🎯 Tổng điểm đạt được: ${d.score.pts} điểm`);
        console.log(`✅ Số câu trả lời đúng: ${d.score.right}/${d.n} câu`);
      }
      if (d.rank) {
        console.log(`🏅 Thứ hạng Đố vui hôm nay: HẠNG ${d.rank} TOÀN CHÙA!`);
      }
      if (d.top && d.top.length > 0) {
        console.log('\n🥇 BẢNG VINH DANH TOP ĐỐ VUI TỐI NAY:');
        d.top.slice(0, 5).forEach((p, idx) => {
          console.log(`   ${idx + 1}. ${p.name} - ${p.pts} điểm (Đúng ${p.right} câu)`);
        });
      }

      // Tự động nhận thưởng nhiệm vụ tuần wDoVui và nhiệm vụ trùm wTron
      console.log('\n🎁 Đang tự động nhận thưởng nhiệm vụ Tuần...');
      this.client.send({ t: 'claim', q: 'wDoVui' });
      await this.client.sleep(1000);
      this.client.send({ t: 'claim', q: 'wTron' });
      await this.client.sleep(1000);

      // Cập nhật lại công đức mới
      this.client.send({ t: 'merit' });
      await this.client.sleep(1500);
      console.log(`✨ CÔNG ĐỨC MỚI CỦA BẠN: ${this.client.merit?.me?.today} điểm hôm nay (Tổng: ${this.client.merit?.me?.total})`);

      // Lưu lại nhật ký buổi thi
      const logPath = path.resolve('./data/quiz_latest_session.json');
      fs.writeFileSync(logPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        score: d.score,
        rank: d.rank,
        top: d.top,
        sessionLog: this.sessionLog
      }, null, 2), 'utf8');

      this.active = false;
    }
  }

  async runLiveWatcher() {
    this.active = true;
    console.log('🧘 Bot Đố Vui Phật Pháp đã sẵn sàng trực chiến.');
    console.log(`📚 Đã nạp ${Object.keys(bank).length} câu hỏi kinh tạng chuẩn vào bộ nhớ.`);

    // 1. Thăm dò giờ thi đấu từ máy chủ
    let quizInfo = null;
    await new Promise((resolve) => {
      const initHandler = (ev) => {
        try {
          const d = JSON.parse(ev.data);
          if (d.t === 'quiz') {
            quizInfo = d;
            this.client.ws.removeEventListener('message', initHandler);
            resolve();
          }
        } catch (e) {}
      };
      this.client.ws.addEventListener('message', initHandler);
      this.client.send({ t: 'quiz' });
      setTimeout(resolve, 3000);
    });

    const now = Date.now();
    const upcoming = quizInfo?.upcoming || (now + 9000000);
    const lobbyTime = quizInfo?.lobby || (upcoming - 300000);
    const msUntilLobby = lobbyTime - now;

    if (msUntilLobby > 10000) {
      const waitMins = Math.floor(msUntilLobby / 60000);
      const waitSecs = Math.floor((msUntilLobby % 60000) / 1000);
      console.log(`🕒 Lịch thi đấu tối nay: 20:00:00 (Phòng chờ mở lúc 19:55:00).`);
      console.log(`💤 Bot sẽ giữ kết nối và đếm ngược ${waitMins} phút ${waitSecs} giây cho đến giờ mở phòng chờ...`);
      
      // Duy trì heartbeat thong thả mỗi 30s để không làm phiền server
      let elapsedWait = 0;
      while (elapsedWait < msUntilLobby - 5000) {
        await this.client.sleep(20000);
        elapsedWait += 20000;
        if (this.client.ws?.readyState === 1) {
          this.client.send({ t: 'hb' });
        } else {
          try { await this.client.connect(); } catch (e) {}
        }
        const remain = Math.max(0, msUntilLobby - elapsedWait);
        if (Math.floor(remain / 1000) % 300 === 0) { // Báo mỗi 5 phút
          console.log(`⏳ Còn ${Math.round(remain / 60000)} phút nữa tới giờ thi Đố Vui Phật Pháp 20:00...`);
        }
      }
    }

    console.log('\n🔔 [19:55:00] PHÒNG CHỜ ĐỐ VUI ĐÃ MỞ! Tiến vào Chánh điện trực chiến...');
    this.client.send({ t: 'visit', zone: 'Chánh điện' });
    await this.client.sleep(500);

    this.client.ws.addEventListener('message', async (ev) => {
      try {
        const d = JSON.parse(ev.data);
        await this.handleLiveQuizMessage(d);
      } catch (e) {}
    });

    // Bắt đầu thăm dò trạng thái trực tiếp
    this.client.send({ t: 'quiz' });

    while (this.active) {
      await this.client.sleep(2000);
      if (this.client.ws?.readyState === 1) {
        this.client.send({ t: 'quiz' });
      } else {
        try { await this.client.connect(); } catch (e) {}
      }
    }
  }
}

// Nếu chạy trực tiếp script này
if (process.argv[1]?.endsWith('quiz_live_runner.js')) {
  const client = new DiDenChuaClient(config);
  await client.connect();
  const bot = new BuddhistQuizBot(client);
  await bot.runLiveWatcher();
}
