// Module tìm kiếm web giải đáp câu hỏi Phật học
export async function searchBuddhistAnswer(qText, opts) {
  try {
    const cleanQ = qText.replace(/[?.,!]/g, '').trim();
    // Tạo truy vấn tìm kiếm chuyên về Phật giáo
    const query = cleanQ;
    const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500); // Giới hạn 3.5s để không trễ giờ nộp bài
    
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

    // Tính điểm cho từng đáp án dựa vào mật độ xuất hiện trong các bài viết kinh điển
    let bestScore = -1;
    let bestIdx = 0;
    const scoredOpts = [];

    opts.forEach((opt, idx) => {
      const optClean = opt.toLowerCase().trim();
      let score = 0;
      
      // 1. So khớp nguyên cụm
      const exactMatches = (fullText.match(new RegExp(escapeRegex(optClean), 'g')) || []).length;
      score += exactMatches * 10;

      // 2. So khớp từng từ khóa chính (loại bỏ từ nối)
      const words = optClean.split(/\s+/).filter(w => w.length > 2 && !['kinh', 'của', 'trong', 'với', 'những', 'được'].includes(w));
      for (const w of words) {
        const wordMatches = (fullText.match(new RegExp(escapeRegex(w), 'g')) || []).length;
        score += wordMatches * 2;
      }

      scoredOpts.push({ opt, score, idx });
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    return {
      pickIndex: bestIdx,
      score: bestScore,
      scoredOpts,
      snippets: snippets.slice(0, 2),
      confidence: bestScore > 0 ? 'high' : 'low'
    };
  } catch (err) {
    return null;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Chạy test nếu gọi trực tiếp
if (process.argv[1]?.endsWith('test_web_solver.js')) {
  const testQ = "Bồ Tát có đại nguyện “địa ngục chưa trống, thề không thành Phật” là vị nào?";
  const testOpts = ["Văn Thù", "Quán Thế Âm", "Địa Tạng", "Phổ Hiền"];
  console.log(`Kiểm tra câu hỏi: "${testQ}"`);
  console.log(`Các lựa chọn:`, testOpts);
  
  const result = await searchBuddhistAnswer(testQ, testOpts);
  console.log(`\nKết quả Search Web:`);
  console.log(`Đáp án chọn: ${testOpts[result.pickIndex]} (Index: ${result.pickIndex}, Điểm: ${result.score})`);
  console.log(`Chi tiết điểm từng lựa chọn:`, result.scoredOpts);
  console.log(`Đoạn trích từ kết quả tìm kiếm:`, result.snippets);
}

