import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://niemphat.online';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const NAME_WORDS = 'An Ái Ân Anh Ánh Bách Bạch Bảo Băng Bình Bích Bồ Cát Cẩm Cầm Chánh Châu Chân Chí Chiêu Chính Chơn Chung Công Cúc Cung Cường Dạ Danh Dao Diên Diễm Diệp Diệu Doanh Du Duy Duyên Dũng Dung Dương Đại Đan Đào Đạo Đạt Đăng Điền Điệp Định Đoan Đông Đức Gia Giác Giang Giao Hà Hạ Hải Hàm Hân Hạnh Hào Hảo Hằng Hậu Hiên Hiền Hiển Hiệp Hiếu Hinh Hoa Hòa Hoài Hoan Hoàng Hồng Huân Huệ Hùng Hưng Hương Hữu Huy Huyền Huỳnh Hy Hỷ Kha Khả Khai Khang Khánh Khiêm Khiết Khoa Khôi Khởi Khuê Khương Kiên Kiến Kiều Kim Kính Kỳ Lạc Lam Lâm Lan Lãng Lễ Liên Liêm Linh Lĩnh Long Lộc Lợi Luân Lương Lưu Ly Mai Mẫn Mạnh Mây Miên Minh Mộc Mộng Mỹ Nam Nga Ngân Nghi Nghĩa Nghiêm Ngọc Nguyên Nguyệt Nhã Nhạc Nhàn Nhân Nhật Nhi Nhiên Nhu Như Nhuận Nhung Ninh Oanh Pháp Phi Phong Phú Phúc Phụng Phương Phước Quân Quang Quảng Quế Quý Quyên Quỳnh Sa San Sang Sen Sơn Song Sương Tâm Tài Tấn Tân Thái Thanh Thành Thảo Thắm Thăng Thiên Thiền Thiện Thịnh Thọ Thông Thu Thuận Thục Thùy Thủy Thư Thương Thường Thy Tiên Tiến Tiệp Tín Tinh Tịnh Toàn Trà Trang Trâm Trân Trí Trinh Trúc Trung Trường Tú Tuấn Tuệ Tùng Tường Tuyền Tuyết Từ Tự Uyên Uy Vân Văn Vi Viên Việt Vinh Vĩnh Vũ Vy Xuân Xuyến Yên Yến Ý Ẩn Ấn Âm Ngộ Ngôn Nguyện Bối Biên Lệ Hội Thuyên Tịch Nghị Sáng Bằng Thoại Thạch Mẫu Bổn Thuần Trừng Tĩnh Hoành Liễu Đình Nhẫn Diệm Cơ Đỉnh Vọng Khanh Tuân Lực Chương Kiệt Mậu Quyền Hoằng Thúy Tuyên Vượng Viễn Vạn Nhạn Tố Thiều Nghiên Quỳ Ngưng Nhất Bửu Tôn Thánh Hòe Thiêm Phấn'.split(' ');

export function generateBuddhistName() {
  for (let i = 0; i < 40; i++) {
    const r = Math.random(), n = r < 0.03 ? 2 : r < 0.6 ? 3 : 4, words = [];
    while (words.length < n) {
      const w = NAME_WORDS[Math.floor(Math.random() * NAME_WORDS.length)];
      if (!words.includes(w)) words.push(w);
    }
    const name = words.join(' ');
    if (name.length <= 24) return name;
  }
  return 'Diệu Tâm';
}

export class NiemPhatClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_BASE_URL;
    this.wsUrl = options.wsUrl || (this.baseUrl.replace(/^http/, 'ws') + '/ws');
    this.token = options.token || null;
    this.temple = options.temple || 'voluong';
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.profile = null;
    this.meta = null;
    this.ws = null;
    this.practiceNext = 0;
    this.practiceGap = options.practiceGap ?? 1250; // Máy chủ quy định gap >= 1200ms
  }

  getHeaders(customHeaders = {}) {
    const headers = {
      'User-Agent': this.userAgent,
      'Referer': this.baseUrl + '/',
      'Origin': this.baseUrl,
      'Accept': 'application/json',
      ...customHeaders
    };
    if (this.token) {
      headers['Authorization'] = 'Bearer ' + this.token;
    }
    return headers;
  }

  async sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  async api(path, { method = 'GET', body, headers = {} } = {}) {
    const finalHeaders = this.getHeaders({
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    });

    const res = await fetch(this.baseUrl + '/api' + path, {
      method,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : undefined
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // Non-json
    }

    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}: Lỗi kết nối API`);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  async post(path, body) {
    if (path === '/practice') {
      const now = Date.now();
      const at = Math.max(now, this.practiceNext);
      this.practiceNext = at + this.practiceGap;
      if (at > now) {
        await this.sleep(at - now);
      }
    }
    return this.api(path, { method: 'POST', body });
  }

  async fetchMeta() {
    this.meta = await this.api('/meta');
    return this.meta;
  }

  async fetchMe() {
    this.profile = await this.api('/me');
    return this.profile;
  }

  async getChallenge() {
    const at = Date.now();
    const data = await this.api('/challenge');
    return { at, code: data.c };
  }

  async registerGuest(options = {}) {
    const proofObj = await this.getChallenge();
    // Máy chủ yêu cầu proof phải được lấy trước đó ít nhất 2200ms
    const delay = Math.max(0, proofObj.at + 2300 - Date.now());
    if (delay > 0) {
      await this.sleep(delay);
    }

    const name = options.name || generateBuddhistName();
    const sect = options.sect || 'tinhdo';
    const appearance = options.appearance || { gender: 'nam', hair: 'troc', skin: '#f1c7a3' };
    const robe = options.robe || 'robe_nau';

    const payload = {
      name,
      nameSig: 'client',
      appearance,
      sect,
      robe,
      ref: options.ref || null,
      consent: true,
      source: options.source || null,
      proof: proofObj.code
    };

    const res = await this.post('/register', payload);
    this.token = res.token;
    this.profile = res;
    return res;
  }

  async login(username, password) {
    const res = await this.post('/login', { username, password });
    this.token = res.token;
    await this.fetchMe();
    return res;
  }

  async setAccountPassword(username, password) {
    return this.post('/account', { username, password, current: '' });
  }

  async connectWs(templeId = this.temple) {
    this.temple = templeId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'join', temple: this.temple, v: 4, gv: 1 }));
      return;
    }

    const fullUrl = `${this.wsUrl}?token=${this.token}&temple=${encodeURIComponent(this.temple)}`;
    this.ws = new WebSocket(fullUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Origin': this.baseUrl
      }
    });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('WebSocket connection timeout after 8000ms'));
      }, 8000);

      this.ws.on('open', () => {
        clearTimeout(timer);
        this.ws.send(JSON.stringify({ t: 'join', temple: this.temple, v: 4, gv: 1 }));
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  disconnectWs() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  async practice(type, payload = {}) {
    const body = {
      type,
      temple: payload.temple || this.temple,
      ...payload
    };
    return this.post('/practice', body);
  }

  async visit(templeId = this.temple) {
    return this.practice('visit', { temple: templeId });
  }

  async checkin() {
    return this.post('/checkin');
  }

  async gieoQue() {
    return this.post('/que');
  }

  async getWheelInfo() {
    return this.api('/wheel');
  }

  async spinWheel() {
    return this.post('/wheel');
  }

  async claimQuest(questId) {
    return this.post(`/quests/${questId}/claim`);
  }

  async claimAllQuests() {
    const me = await this.fetchMe();
    const claimed = [];
    for (const q of me.quests || []) {
      if (!q.claimed && (q.done || (q.target && q.progress >= q.target))) {
        try {
          const res = await this.claimQuest(q.id);
          claimed.push({ id: q.id, name: q.name, reward: res.reward });
        } catch (e) {
          // ignore or record error
        }
      }
    }
    return claimed;
  }

  async doBow(count = 27, templeId = this.temple) {
    return this.practice('bow', { count, lite: true, temple: templeId });
  }

  async doBeads(grains = 108, templeId = this.temple) {
    return this.practice('bead', { count: grains, lite: true, temple: templeId });
  }

  async doMo(strikes = 108, auto = false, templeId = this.temple) {
    return this.practice('mo', { count: strikes, auto, lite: !auto, temple: templeId });
  }

  async doBell(templeId = this.temple) {
    return this.practice('bell', { temple: templeId });
  }

  async doChantDone(sutraId = 'batnha', templeId = this.temple) {
    return this.practice('chant_done', { sutra: sutraId, temple: templeId });
  }

  async doSweep(templeId = this.temple) {
    return this.practice('sweep', { temple: templeId });
  }

  async doPlant(templeId = this.temple) {
    return this.practice('plant', { temple: templeId });
  }

  async doSit(templeId = this.temple) {
    return this.practice('sit', { lite: true, temple: templeId });
  }

  async doDailyRoutine() {
    const results = {};

    // 1. Kết nối vào chùa để xác thực sự hiện diện
    try {
      await this.connectWs(this.temple);
      results.ws = 'Connected';
    } catch (e) {
      results.ws = `Failed: ${e.message}`;
    }

    // 2. Viếng chùa
    try {
      results.visit = await this.visit(this.temple);
    } catch (e) {
      results.visit = e.message;
    }

    // 3. Điểm danh
    try {
      results.checkin = await this.checkin();
    } catch (e) {
      results.checkin = e.message;
    }

    // 4. Gieo quẻ đầu ngày
    try {
      results.que = await this.gieoQue();
    } catch (e) {
      results.que = e.message;
    }

    // 5. Thỉnh đại hồng chung
    try {
      results.bell = await this.doBell(this.temple);
    } catch (e) {
      results.bell = e.message;
    }

    // 6. Quay vòng quay may mắn
    try {
      results.wheel = await this.spinWheel();
    } catch (e) {
      results.wheel = e.message;
    }

    // 7. Nhận thưởng toàn bộ quest đã hoàn thành
    try {
      results.claimedQuests = await this.claimAllQuests();
    } catch (e) {
      results.claimedQuests = e.message;
    }

    // 8. Cập nhật hồ sơ cuối cùng
    try {
      results.profile = await this.fetchMe();
    } catch {}

    return results;
  }
}
