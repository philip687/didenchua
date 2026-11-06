import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';
import { loadConfig } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_CACHE_PATH = path.join(__dirname, '..', '.cached_token.json');

const DEFAULT_BASE_URL = 'https://niemphat.online';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEARTBEAT_INTERVAL_MS = 15000;
const PRACTICE_GAP_MS = 1250; // Máy chủ quy định gap >= 1200ms giữa các lần tu tập

// Danh sách 50 bồ đoàn chính thức tại Chánh điện
export const CHANH_DIEN_SEATS = (() => {
  let qt = 0;
  const list = [];
  for (const z of [-6.2, -9.2, -11.6, -16.6, -19]) {
    for (const x of [-13.4, -11.2, -6.6, -4.4, -2.2, 2.2, 4.4, 6.6, 11.2, 13.4]) {
      list.push({ id: `cd-${qt++}`, x, y: 2.56, z, ry: 3.14 });
    }
  }
  return list;
})();

// Danh sách trọn vẹn 12 chữ thư pháp tại lều Thầy đồ cùng ước nguyện & ý nghĩa
export const CALLIGRAPHY_WORDS = [
  { id: 'binh-an', text: 'Bình An', wish: 'Yên ổn', meaning: 'Trong lòng yên, ngoài đời ổn. Bình an không phải là không có sóng gió, mà là biết giữ mình giữa sóng gió.' },
  { id: 'an-khang', text: 'An Khang', wish: 'Sức khỏe', meaning: 'An là yên, khang là khỏe. Chữ này chúc thân khỏe mạnh và tâm thư thái, hai điều luôn đi cùng nhau.' },
  { id: 'hoa-thuan', text: 'Hòa Thuận', wish: 'Gia đạo êm ấm', meaning: 'Hòa là không đối chọi, thuận là biết nhường nhau. Một nhà hòa thuận thì việc khó cũng hóa nhẹ.' },
  { id: 'hieu', text: 'Hiếu', wish: 'Hiếu thảo', meaning: 'Hiếu là nhớ ơn và chăm lo cho cha mẹ, ông bà. Một cuộc gọi hỏi thăm cũng đã là hiếu.' },
  { id: 'nhan', text: 'Nhẫn', wish: 'Nhẫn nại', meaning: 'Nhẫn không phải là cam chịu, mà là dừng lại một nhịp trước khi đáp lời, để không làm điều mình sẽ tiếc.' },
  { id: 'tinh-tam', text: 'Tĩnh Tâm', wish: 'Tĩnh tâm', meaning: 'Giữ lòng lắng lại như mặt nước yên. Nước yên thì thấy rõ, lòng yên thì nghĩ thông.' },
  { id: 'tri-tue', text: 'Trí Tuệ', wish: 'Học hành, sáng suốt', meaning: 'Trí tuệ là thấy việc đúng như nó là, biết điều nên làm và điều nên buông. Học để sáng, không chỉ để hơn.' },
  { id: 'phuc-duc', text: 'Phúc Đức', wish: 'Phúc đức', meaning: 'Phúc là điều lành mình nhận được, đức là điều lành mình gieo. Ông bà ta nói có đức mới bền phúc.' },
  { id: 'duyen', text: 'Duyên', wish: 'Nhân duyên', meaning: 'Duyên là sự gặp gỡ đúng lúc. Có người đến để đi cùng, có người đến để dạy mình một điều, đều là duyên.' },
  { id: 'tu-bi', text: 'Từ Bi', wish: 'Lòng từ', meaning: 'Từ là mong người khác vui, bi là muốn người khác bớt khổ. Và đừng quên hiền với chính mình.' },
  { id: 'tinh-tan', text: 'Tinh Tấn', wish: 'Công việc, siêng năng', meaning: 'Tinh tấn là chăm chỉ đi tới mỗi ngày một ít, không vội, không bỏ. Việc lớn nào cũng thành từ những bước nhỏ.' },
  { id: 'biet-on', text: 'Biết Ơn', wish: 'Biết ơn', meaning: 'Biết ơn là nhận ra những điều đã có. Càng thấy mình được cho nhiều, lòng càng đủ đầy.' }
];

// Danh sách 6 bài kinh điển giác ngộ trong Tàng Kinh Các & Pháp Đường
export const BUDDHIST_SUTRAS = [
  { id: 'adida', title: 'Kinh A Di Đà', duration: '13:20', seconds: 800.28, desc: 'Bản Hán Việt truyền thống theo Hán bản Cưu Ma La Thập' },
  { id: 'batnha', title: 'Bát Nhã Tâm Kinh', duration: '02:22', seconds: 142.04, desc: 'Ma ha Bát nhã Ba la mật đa Tâm kinh (Trí tuệ cứu cánh)' },
  { id: 'batdai', title: 'Kinh Bát Đại Nhân Giác', duration: '03:04', seconds: 184.13, desc: 'Tám điều giác ngộ của các bậc đại nhân' },
  { id: 'daibi', title: 'Chú Đại Bi', duration: '03:19', seconds: 199.14, desc: 'Thiên thủ thiên nhãn vô ngại đại bi tâm đà la ni' },
  { id: 'vangsanh', title: 'Chú Vãng Sanh', duration: '00:40', seconds: 39.67, desc: 'Bạt nhất thiết nghiệp chướng căn bản đắc sanh Tịnh độ đà la ni' },
  { id: 'hoihuong', title: 'Kệ Hồi Hướng', duration: '00:16', seconds: 15.66, desc: 'Nguyện dĩ thử công đức, phổ cập ư nhất thiết' }
];

export const ROBES_CATALOG = {
  nau: { name: 'Áo nâu', color: '#7a5134' },
  lam: { name: 'Áo tràng lam', color: '#5d7487' },
  xam: { name: 'Áo xám', color: '#8a8a84' },
  vang: { name: 'Áo vàng', color: '#b98a3a' },
  cam: { name: 'Áo cam', color: '#b8602c' }
};

export const BEADS_CATALOG = {
  go: { name: 'Tràng hạt gỗ', color: '#e0852c', lv: 0 },
  bode: { name: 'Tràng hạt bồ đề', color: '#b98a5a', lv: 1 },
  tram: { name: 'Tràng hạt trầm hương', color: '#6b442a', lv: 2 }
};

export const CUSHIONS_CATALOG = {
  xam: { name: 'Bồ đoàn xám', color: '#8a8a84', lv: 0 },
  nau: { name: 'Bồ đoàn nâu', color: '#7a5134', lv: 1 },
  vang: { name: 'Bồ đoàn vàng', color: '#c9a24a', lv: 2 }
};

export const PHAPKHI_CATALOG = {
  huong: { name: 'Nén hương', rank: 'Thường' },
  gio: { name: 'Giỏ hoa sen', rank: 'Thường' },
  gaytruc: { name: 'Gậy trúc hành hương', rank: 'Thường' }
};

export const PETS_CATALOG = {
  meo: { name: 'Mèo chùa', lv: 2, days: 7, desc: 'Lười biếng mà hiền, thích nằm sưởi nắng bên hiên' },
  tho: { name: 'Thỏ trắng', lv: 4, days: 21, desc: 'Nhút nhát nhưng quấn chủ, nhảy từng bước nhỏ' }
};

export const AM_SLOTS = [
  { id: 'altar', name: 'Giữa bàn thờ', kind: 'tuong' }
];

export const AM_ITEMS = [
  { id: 'phat', name: 'Tượng Phật nhỏ', kind: 'tuong', free: true }
];

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

export class DiDenChuaClient {
  constructor(customConfig = {}) {
    this.config = { ...loadConfig(), ...customConfig };
    this.baseUrl = this.config.domain || DEFAULT_BASE_URL;
    this.wsUrl = this.config.wsUrl || (this.baseUrl.replace(/^http/, 'ws') + '/ws');
    this.temple = this.config.temple || 'voluong';
    this.token = this.config.token || null;
    this.userAgent = this.config.userAgent || DEFAULT_USER_AGENT;

    this.ws = null;
    this.connected = false;
    this.heartbeatTimer = null;
    this.aborted = false;
    this.abortResolvers = new Set();
    this.messageListeners = new Set();
    this.recentGains = [];
    this.recentToasts = [];
    this.practiceNext = 0;
    this.practiceGap = this.config.minDelaySec ? (this.config.minDelaySec * 1000) : PRACTICE_GAP_MS;

    this.profile = null;
    this.meta = null;
    this.merit = null;
    this.journal = null;
    this.quests = [];
  }

  isTurbo() {
    return Boolean(this.config.turbo || this.config.fast);
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
    this.checkAborted();
    return new Promise((resolve, reject) => {
      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        this.abortResolvers.delete(onAbort);
        reject(new Error('Tác vụ đã bị dừng bởi người dùng.'));
      };
      this.abortResolvers.add(onAbort);

      timer = setTimeout(() => {
        this.abortResolvers.delete(onAbort);
        if (this.aborted) {
          reject(new Error('Tác vụ đã bị dừng bởi người dùng.'));
        } else {
          resolve();
        }
      }, ms);
    });
  }

  async humanDelay(msg = '') {
    if (this.isTurbo()) return;
    const min = (this.config.minDelaySec || 1.2) * 1000;
    const max = (this.config.maxDelaySec || 2.0) * 1000;
    const delay = Math.floor(Math.random() * (max - min)) + min;
    if (msg) log.info(`⏳ ${msg} (chờ ${(delay / 1000).toFixed(1)}s)...`);
    await this.sleep(delay);
  }

  checkAborted() {
    if (this.aborted) {
      throw new Error('Tác vụ đã bị dừng bởi người dùng.');
    }
  }

  abort(reason = 'Người dùng đã dừng tác vụ') {
    this.aborted = true;
    for (const cancelFn of Array.from(this.abortResolvers)) {
      try {
        cancelFn();
      } catch {}
    }
    this.abortResolvers.clear();
    this.close();
  }

  setAbort() {
    this.abort();
  }

  async api(path, { method = 'GET', body, headers = {} } = {}) {
    this.checkAborted();
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
    } catch {}

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

  async authenticate() {
    // 1. Thử token trong bộ nhớ
    if (this.token) {
      try {
        await this.fetchMe();
        return this.token;
      } catch {}
    }

    // 2. Thử token lưu trong file cache .cached_token.json
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      try {
        const cached = JSON.parse(fs.readFileSync(TOKEN_CACHE_PATH, 'utf-8'));
        if (cached?.token) {
          this.token = cached.token;
          try {
            await this.fetchMe();
            log.info(`🔑 Đã khôi phục phiên đăng nhập cho tài khoản [${this.profile?.user?.name || cached.username}] từ cache.`);
            return this.token;
          } catch {
            this.token = null;
          }
        }
      } catch {}
    }

    // 3. Đăng nhập bằng username / password nếu có
    const username = this.config.username || 'thichkngan';
    const password = this.config.password || 'thichkngan';

    if (username && password) {
      log.info(`🔐 Đang đăng nhập tài khoản "${username}" trên niemphat.online...`);
      try {
        const res = await this.post('/login', { username, password });
        this.token = res.token;
        fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ username, token: this.token, at: Date.now() }, null, 2), 'utf-8');
        await this.fetchMe();
        log.success(`✅ Đăng nhập thành công! Pháp danh: "${this.profile.user.name}", Tông phái: ${this.profile.user.sect}, Cấp: ${this.profile.user.level}`);
        return this.token;
      } catch (err) {
        log.warn(`Không thể đăng nhập bằng tài khoản "${username}" (${err.message}). Chuyển sang tạo tài khoản khách...`);
      }
    }

    // 4. Fallback: Đăng ký tài khoản khách vượt challenge
    log.info('Đang lấy mã thử thách (challenge proof) để tạo tài khoản mới...');
    const proofRes = await this.api('/challenge');
    await this.sleep(2300); // Máy chủ yêu cầu cách ít nhất 2.2 giây

    const name = this.config.name || generateBuddhistName();
    const sect = this.config.sect || 'tinhdo';
    const regRes = await this.post('/register', {
      name,
      nameSig: 'client',
      appearance: { gender: 'nam', hair: 'troc', skin: '#f1c7a3' },
      sect,
      robe: this.config.robe || 'ao_lam',
      ref: null,
      consent: true,
      source: null,
      proof: proofRes.c
    });

    this.token = regRes.token;
    fs.writeFileSync(TOKEN_CACHE_PATH, JSON.stringify({ username: name, token: this.token, at: Date.now() }, null, 2), 'utf-8');
    this.profile = regRes;
    this.syncMeritFromProfile();
    log.success(`✅ Đã tạo tài khoản khách mới thành công! Pháp danh: "${name}", Token: ${this.token}`);
    return this.token;
  }

  async fetchMeta() {
    this.meta = await this.api('/meta');
    return this.meta;
  }

  async fetchMe() {
    this.profile = await this.api('/me');
    this.syncMeritFromProfile();
    return this.profile;
  }

  syncMeritFromProfile() {
    if (!this.profile?.user) return;
    const u = this.profile.user;
    const qList = (this.profile.quests || []).map(q => ({
      id: q.id,
      name: q.name,
      title: q.name,
      need: q.target || 1,
      have: q.progress || 0,
      claimed: Boolean(q.claimed),
      done: Boolean(q.done || (q.target && q.progress >= q.target)),
      reward: q.reward?.sen || 10,
      period: q.period
    }));

    this.merit = {
      me: {
        name: u.name,
        user: u.username || this.config.username || u.name,
        sect: u.sect,
        level: u.title || `Bậc ${u.level}`,
        lv: u.level,
        exp: u.exp,
        next: u.expNext,
        total: u.exp,
        merit: u.exp,
        today: u.exp,
        sen: u.sen,
        ngoc: u.ngoc,
        days: u.streak || 1,
        stats: u.stats || {},
        quests: qList,
        weekly: qList.filter(q => q.period === 'weekly')
      }
    };

    this.quests = qList;
    this.journal = {
      name: u.name,
      user: u.username || this.config.username || u.name,
      sect: u.sect,
      level: u.title || `Bậc ${u.level}`,
      sen: u.sen,
      ngoc: u.ngoc,
      streak: u.streak,
      merit: u.exp,
      next: u.expNext,
      from: 0,
      bows: u.stats?.bows || 0,
      beads: u.stats?.beads || 0,
      mo: u.stats?.mo || 0,
      sitMin: u.stats?.sitMin || 0,
      stats: u.stats || {}
    };
  }

  async connectWs(templeId = this.temple) {
    this.temple = templeId;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ t: 'join', temple: this.temple, v: 4, gv: 1 });
      return;
    }

    const fullUrl = `${this.wsUrl}?token=${this.token}&temple=${encodeURIComponent(this.temple)}`;
    this.ws = new WebSocket(fullUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Origin': this.baseUrl
      }
    });

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve();
      }, 8000);

      this.ws.on('open', () => {
        clearTimeout(timer);
        this.connected = true;
        this.send({ t: 'join', temple: this.temple, v: 4, gv: 1 });
        
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.send({ t: 's' });
          }
        }, HEARTBEAT_INTERVAL_MS);
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch {}
      });

      this.ws.on('error', (err) => {
        clearTimeout(timer);
        log.warn(`WebSocket gặp sự cố (${err.message}), hoạt động tu tập vẫn duy trì qua REST API.`);
        resolve();
      });

      this.ws.on('close', () => {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      });
    });
  }

  async connect() {
    this.checkAborted();
    try {
      await this.fetchMeta();
    } catch {}

    await this.authenticate();

    try {
      await this.connectWs(this.temple);
    } catch {}

    this.connected = true;
    return this;
  }

  send(pkt) {
    if (this.aborted || !pkt) return;
    for (const listener of this.messageListeners) {
      try { listener(pkt); } catch {}
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(pkt));
      } catch {}
    }
  }

  handleMessage(msg) {
    for (const listener of this.messageListeners) {
      try { listener(msg); } catch {}
    }
    if (msg.t === 'gain' && typeof msg.n === 'number') {
      this.recentGains.push({ n: msg.n, why: msg.why || '', at: Date.now() });
      if (this.recentGains.length > 50) this.recentGains.shift();
    }
    if (msg.t === 'toast' && msg.text) {
      this.recentToasts.push(msg.text);
    }
  }

  async practice(type, payload = {}) {
    this.checkAborted();
    if (!this.token) {
      return { gained: 5, user: { exp: 5 }, q: [] };
    }
    const body = {
      type,
      temple: payload.temple || this.temple,
      ...payload
    };

    const res = await this.post('/practice', body);

    if (res.gained) {
      this.recentGains.push({ n: res.gained, why: type, at: Date.now() });
      if (this.recentGains.length > 50) this.recentGains.shift();
    }

    if (res.user && this.profile) {
      this.profile.user = res.user;
      this.syncMeritFromProfile();
    }

    if (Array.isArray(res.q)) {
      for (const [qid, progress, claimed, done] of res.q) {
        const found = (this.merit?.me?.quests || []).find(x => x.id === qid);
        if (found) {
          found.have = progress;
          found.claimed = Boolean(claimed);
          found.done = Boolean(done);
        }
      }
    }

    return res;
  }

  async doCheckin() {
    this.checkAborted();
    log.temple('📅', `Bắt đầu điểm danh lên chùa hôm nay...`);
    this.send({ t: 'checkin' });

    let checkinRes = null;
    if (this.token) {
      try {
        checkinRes = await this.post('/checkin');
        log.success(`✨ Điểm danh thành công! Chuỗi ${checkinRes.checkin?.streak || 1} ngày liên tiếp (+${checkinRes.checkin?.reward?.sen || 10} Sen).`);
      } catch (e) {
        if (/đã điểm danh/i.test(e.message)) {
          log.info('Hôm nay bạn đã điểm danh rồi.');
        } else {
          log.warn(`Điểm danh: ${e.message}`);
        }
      }

      try { await this.doQue(); } catch {}
      try { await this.doBell(); } catch {}
      try { await this.doWheel(); } catch {}
      try { await this.fetchMe(); } catch {}
    }
    return checkinRes;
  }

  async doQue() {
    this.checkAborted();
    log.temple('📜', 'Thành tâm gieo một quẻ cát tường đầu ngày...');
    this.send({ t: 'xam' });
    if (!this.token) return { que: { rank: 'Thượng cát', name: 'Bình an', text: 'Tâm an' } };
    try {
      const r = await this.post('/que');
      if (r.que) {
        log.success(`📜 Quẻ hôm nay: [${r.que.rank}] "${r.que.name}" - ${r.que.text}`);
        log.info(`💡 Lời khuyên tu tập: ${r.que.advice}`);
      }
      return r;
    } catch (e) {
      if (/đã gieo|hôm nay/i.test(e.message)) {
        log.info(`Gieo quẻ: ${e.message}`);
        return null;
      }
      throw e;
    }
  }

  async doXam() {
    return this.doQue();
  }

  async doWheel() {
    this.checkAborted();
    if (!this.token) return null;
    try {
      const r = await this.post('/wheel');
      log.success(`🎡 Vòng quay lộc: Bạn đã nhận được ${r.item ? `vật phẩm "${r.item}"` : `${r.sen} Sen`}!`);
      return r;
    } catch (e) {
      if (!/đã quay/i.test(e.message)) {
        log.warn(`Vòng quay lộc: ${e.message}`);
      }
      return null;
    }
  }

  async doBell(count = 1) {
    this.checkAborted();
    log.temple('🔔', 'Thỉnh một hồi chuông đại hồng ngân vang thanh tịnh...');
    this.send({ t: 'bell' });
    let gained = 5;
    if (this.token) {
      try {
        const r = await this.practice('bell');
        gained = r.gained || 5;
      } catch (e) {
        if (/đã thỉnh chuông|hôm nay/i.test(e.message)) {
          log.info('Hôm nay bạn đã thỉnh chuông ở chùa này rồi.');
          return { gained: 0, already: true };
        }
        throw e;
      }
    }
    log.success(`🔔 Boooong... Tiếng chuông cảnh tỉnh, thân tâm an lạc (+${gained} công đức)!`);
    return { gained };
  }

  async doLay(count = 27, options = {}) {
    this.checkAborted();
    log.temple('🙏', `Bắt đầu lễ Phật sám hối (${count} lạy trang nghiêm - chốt an toàn từng chặng)...`);
    this.send({ t: 'visit', zone: 'Chánh điện' });
    await this.sleep(this.isTurbo() ? 80 : 300);

    const emotesNeeded = Math.ceil(count / 3);
    const checkpointBowsInterval = options.chunkSize || 9;
    const activeLay = (this.merit?.me?.quests || []).find(q => q.id === 'lay' || q.id.startsWith('lay') || q.id === 'd_lay27');
    const dailyQuestBows = (activeLay && !activeLay.claimed) ? (activeLay.need || 27) : 27;

    let sentEmotes = 0;
    try {
      for (let i = 1; i <= emotesNeeded; i++) {
        this.checkAborted();
        const currentBows = Math.min(i * 3, count);
        log.info(`...[${currentBows}/${count} lạy] Thành kính cúi lạy Phật đài...`);

        if (this.token) {
          try {
            await this.practice('bow', { count: Math.min(3, count - (i - 1) * 3), lite: true });
          } catch {}
        }

        this.send({ t: 'emote', e: 'lay' });
        sentEmotes = i;

        const isDailyQuestReached = (currentBows >= dailyQuestBows) && activeLay && !activeLay.claimed;
        const isIntervalReached = (currentBows % checkpointBowsInterval === 0);
        const isFinalEmote = (i === emotesNeeded);

        if (isDailyQuestReached || isIntervalReached || isFinalEmote) {
          let claimedAny = false;
          if (activeLay && !activeLay.claimed && currentBows >= (activeLay.need || 18)) {
            this.send({ t: 'claim', q: activeLay.id });
            activeLay.claimed = true;
            claimedAny = true;
            log.success(`🙏 [Chốt an toàn chặng: ${currentBows}/${count} lạy] -> Thu thập ngay phần thưởng nhiệm vụ Lạy Phật!`);
          }

          const wLay = (this.merit?.me?.weekly || []).find(q => q.id === 'wLay' || q.id === 'w_lay300');
          if (wLay && !wLay.claimed && (wLay.have || 0) + currentBows >= (wLay.need || 108)) {
            this.send({ t: 'claim', q: wLay.id });
            wLay.claimed = true;
            claimedAny = true;
            log.success(`🙏 [Chốt an toàn chặng: ${currentBows}/${count} lạy] -> Thu thập ngay nhiệm vụ tuần Lạy Phật!`);
          }

          if (!claimedAny && !isFinalEmote) {
            log.temple('🙏', `[Chốt an toàn chặng: ${currentBows}/${count} lạy] Đã đồng bộ ${currentBows} lạy vào máy chủ chùa. Tiếp tục lạy...`);
          }

          this.send({ t: 'journal' });
        }

        if (i < emotesNeeded) {
          await this.sleep(options.intervalMs ?? (this.isTurbo() ? 80 : 1250));
        }
      }
      log.success(`🎉 HOÀN TẤT: Đã hoàn thành gửi ${count} lạy sám hối và chốt toàn bộ công đức.`);
    } finally {
      if (sentEmotes > 0 && sentEmotes < emotesNeeded) {
        const bowsSoFar = Math.min(sentEmotes * 3, count);
        if (activeLay && !activeLay.claimed && bowsSoFar >= (activeLay.need || 18)) {
          this.send({ t: 'claim', q: activeLay.id });
          activeLay.claimed = true;
        }
        this.send({ t: 'journal' });
      }
    }
  }

  async doMo(count = 108, options = {}) {
    this.checkAborted();
    log.temple('🪵', `Bắt đầu gõ mõ tụng kinh (${count} tiếng - chốt an toàn từng chặng)...`);
    this.send({ t: 'visit', zone: 'Chánh điện' });
    await this.sleep(this.isTurbo() ? 80 : 250);

    const batchSize = this.isTurbo() ? 20 : 10;
    const checkpointMoInterval = options.chunkSize || (count > 108 ? 108 : 54);
    const activeTung = (this.merit?.me?.quests || []).find(q => q.id === 'tung' || q.id === 'd_mo108');
    const dailyQuestNeed = (activeTung && !activeTung.claimed) ? (activeTung.need || 108) : 108;

    let sent = 0;
    while (sent < count) {
      this.checkAborted();
      const batch = Math.min(batchSize, count - sent);
      if (this.token) {
        try { await this.practice('mo', { count: batch, lite: true }); } catch {}
      }
      sent += batch;
      this.send({ t: 'mo', n: batch });

      if (count <= 108 || sent % 54 === 0 || sent >= count) {
        log.info(`...cốc cốc [${sent}/${count} tiếng mõ]`);
      }

      const isDailyQuestReached = (sent >= dailyQuestNeed) && activeTung && !activeTung.claimed;
      const isIntervalReached = (sent % checkpointMoInterval === 0 || (sent % 54 === 0 && count > 54));
      const isFinalStrike = (sent >= count);

      if (isDailyQuestReached || isIntervalReached || isFinalStrike) {
        let claimedAny = false;
        if (activeTung && !activeTung.claimed && sent >= (activeTung.need || 108)) {
          this.send({ t: 'claim', q: activeTung.id });
          activeTung.claimed = true;
          claimedAny = true;
          log.success(`🪵 [Chốt an toàn chặng: ${sent}/${count} tiếng mõ] -> Thu thập ngay phần thưởng nhiệm vụ Gõ mõ tụng kinh!`);
        }

        const wTung = (this.merit?.me?.weekly || []).find(q => q.id === 'wTung' || q.id === 'w_mo500');
        if (wTung && !wTung.claimed && (wTung.have || 0) + sent >= (wTung.need || 108)) {
          this.send({ t: 'claim', q: wTung.id });
          wTung.claimed = true;
          claimedAny = true;
          log.success(`🪵 [Chốt an toàn chặng: ${sent}/${count} tiếng mõ] -> Thu thập ngay nhiệm vụ tuần Gõ mõ tụng kinh!`);
        }

        if (!claimedAny && !isFinalStrike) {
          log.temple('🪵', `[Chốt an toàn chặng: ${sent}/${count} tiếng mõ] Đã đồng bộ số tiếng mõ vào máy chủ chùa. Tiếp tục gõ mõ...`);
        }

        this.send({ t: 'journal' });
      }

      if (sent < count) {
        await this.sleep(options.intervalMs ?? (this.isTurbo() ? 80 : 1250));
      }
    }

    log.success(`🎉 HOÀN TẤT: Đã hoàn thành gửi ${count} tiếng mõ tụng kinh.`);
  }

  async doBeads(count = 108, options = {}) {
    this.checkAborted();
    const roundsTarget = (count / 108).toFixed(1);
    log.temple('📿', `Bắt đầu lần tràng hạt niệm Phật (${count} hạt ~ ${roundsTarget} chuỗi - chốt an toàn từng chặng)...`);
    this.send({ t: 'emote', e: 'chuoi' });

    const batchSize = 9;
    const checkpointBeadsInterval = options.chunkSize || (count > 108 ? 108 : 54);
    const activeChuoi = (this.merit?.me?.quests || []).find(q => q.id === 'chuoi' || q.id === 'beads' || q.id === 'd_chuoi1' || q.id.startsWith('chuoi'));
    const dailyQuestNeed = (activeChuoi && !activeChuoi.claimed) ? (activeChuoi.need || 54) : 54;

    let sent = 0;
    while (sent < count) {
      this.checkAborted();
      const batch = Math.min(batchSize, count - sent);
      if (this.token) {
        try { await this.practice('bead', { count: batch, lite: true }); } catch {}
      }
      sent += batch;
      this.send({ t: 'beads', n: batch });
      const curRounds = (sent / 108).toFixed(1);

      if (count <= 108 || sent % 108 === 0 || sent >= count || (count <= 540 && sent % 54 === 0)) {
        log.info(`...Nam Mô A Di Đà Phật [${sent}/${count} hạt] (~${curRounds}/${roundsTarget} chuỗi)`);
      }

      const isDailyQuestReached = (sent >= dailyQuestNeed) && activeChuoi && !activeChuoi.claimed;
      const isIntervalReached = (sent % checkpointBeadsInterval === 0 || (sent % 54 === 0 && count > 54));
      const isFinal = (sent >= count);

      if (isDailyQuestReached || isIntervalReached || isFinal) {
        let claimedAny = false;
        if (activeChuoi && !activeChuoi.claimed && sent >= (activeChuoi.need || 54)) {
          this.send({ t: 'claim', q: activeChuoi.id });
          activeChuoi.claimed = true;
          claimedAny = true;
          log.success(`📿 [Chốt an toàn chặng: ${sent}/${count} hạt] -> Thu thập ngay phần thưởng nhiệm vụ Lần tràng hạt!`);
        }

        const wChuoi = (this.merit?.me?.weekly || []).find(q => q.id === 'wChuoi' || q.id === 'w_chuoi7');
        if (wChuoi && !wChuoi.claimed && (wChuoi.have || 0) + sent >= (wChuoi.need || 108)) {
          this.send({ t: 'claim', q: wChuoi.id });
          wChuoi.claimed = true;
          claimedAny = true;
          log.success(`📿 [Chốt an toàn chặng: ${sent}/${count} hạt] -> Thu thập ngay nhiệm vụ tuần Tràng hạt!`);
        }

        if (!claimedAny && !isFinal) {
          log.temple('📿', `[Chốt an toàn chặng: ${sent}/${count} hạt] Đã đồng bộ số hạt niệm vào máy chủ chùa. Tiếp tục niệm Phật...`);
        }

        this.send({ t: 'journal' });
      }

      if (sent < count) {
        await this.sleep(options.intervalMs ?? (this.isTurbo() ? 80 : 1250));
      }
    }

    log.success(`🎉 HOÀN TẤT: Đã niệm đủ ${count} hạt tràng niệm Phật.`);
  }

  async doQuetLa(count = 1, options = {}) {
    this.checkAborted();
    log.temple('🧹', `Bắt đầu công quả quét lá sân chùa (${count} lần - chốt an toàn từng chặng)...`);
    this.send({ t: 'visit', zone: 'Sân chùa' });
    await this.sleep(this.isTurbo() ? 80 : 300);

    const activeQuet = (this.merit?.me?.quests || []).find(q => q.id === 'quet' || q.id === 'viec' || q.id === 'd_sweep' || q.id.startsWith('quet'));
    const dailyQuestNeed = (activeQuet && !activeQuet.claimed) ? (activeQuet.need || 1) : 1;
    const checkpointInterval = options.chunkSize || 5;

    for (let i = 1; i <= count; i++) {
      this.checkAborted();
      log.info(`[${i}/${count}] -> Gió thổi lá bay, chổi quét sạch bong (công quả quét lá)...`);
      if (this.token) {
        try { await this.practice('sweep'); } catch {}
      }
      this.send({ t: 'emote', e: 'quet' });
      this.send({ t: 'viec', k: 'quet' });

      const isDailyQuestReached = (i >= dailyQuestNeed) && activeQuet && !activeQuet.claimed;
      const isIntervalReached = (i % checkpointInterval === 0);
      const isFinal = (i >= count);

      if (isDailyQuestReached || isIntervalReached || isFinal) {
        let claimedAny = false;
        if (activeQuet && !activeQuet.claimed && i >= (activeQuet.need || 1)) {
          this.send({ t: 'claim', q: activeQuet.id });
          activeQuet.claimed = true;
          claimedAny = true;
          log.success(`🧹 [Chốt an toàn chặng: ${i}/${count} lần] -> Thu thập ngay phần thưởng nhiệm vụ Quét lá dọn sân chùa!`);
        }

        const wViec = (this.merit?.me?.weekly || []).find(q => q.id === 'wViec' || q.id === 'wQuet' || q.id === 'w_viec5');
        if (wViec && !wViec.claimed && (wViec.have || 0) + i >= (wViec.need || 5)) {
          this.send({ t: 'claim', q: wViec.id });
          wViec.claimed = true;
          claimedAny = true;
          log.success(`🧹 [Chốt an toàn chặng: ${i}/${count} lần] -> Thu thập ngay nhiệm vụ tuần Công quả quét dọn!`);
        }

        if (!claimedAny && !isFinal) {
          log.temple('🧹', `[Chốt an toàn chặng: ${i}/${count} lần] Đã đồng bộ số lần quét lá vào máy chủ chùa. Tiếp tục quét dọn...`);
        }

        this.send({ t: 'journal' });
      }

      if (i < count) {
        await this.sleep(options.intervalMs ?? (this.isTurbo() ? 80 : 1250));
      }
    }

    log.success(`🎉 HOÀN TẤT: Đã làm xong công quả quét dọn sân chùa (${count} lần).`);
  }

  async doMeditate(seconds = 300, onProgress = null, options = {}) {
    this.checkAborted();
    log.temple('🧘', `Bắt đầu thời khóa thiền định tĩnh tâm (${Math.round(seconds / 60)} phút)...`);
    const chunkSeconds = options.chunkSeconds || (seconds > 300 ? 300 : seconds);
    const targetZone = options.zone || 'Vườn thiền';

    let totalElapsed = 0;
    while (totalElapsed < seconds) {
      this.checkAborted();
      const currentChunkTarget = Math.min(chunkSeconds, seconds - totalElapsed);

      this.send({ t: 'visit', zone: targetZone });
      await this.sleep(this.isTurbo() ? 80 : 300);

      this.send({ t: 'state', s: 2 });
      if (this.token) {
        try { await this.practice('meditate_start'); } catch {}
      }

      let chunkElapsed = 0;
      const step = options.stepSeconds || (this.isTurbo() ? currentChunkTarget : 10);
      while (chunkElapsed < currentChunkTarget) {
        this.checkAborted();
        const waitTime = Math.min(step, currentChunkTarget - chunkElapsed);
        await this.sleep(this.isTurbo() ? 30 : (waitTime * 1000));
        chunkElapsed += waitTime;

        if (onProgress) {
          onProgress(totalElapsed + chunkElapsed, seconds);
        }
      }

      totalElapsed += chunkElapsed;

      this.send({ t: 'state', s: 0 });
      if (this.token) {
        try { await this.practice('meditate_end'); } catch {}
      }

      let claimedNgoi = false;
      const ngoiQ = (this.merit?.me?.quests || []).find(q => q.id === 'ngoi' || q.id === 'd_thien5');
      if (ngoiQ && !ngoiQ.claimed) {
        this.send({ t: 'claim', q: ngoiQ.id });
        ngoiQ.claimed = true;
        claimedNgoi = true;
      }
      if (!claimedNgoi) {
        this.send({ t: 'claim', q: 'ngoi' });
      }
      this.send({ t: 'claim', q: 'wNgoi' });
      this.send({ t: 'journal' });

      if (totalElapsed < seconds) {
        await this.sleep(this.isTurbo() ? 80 : 1000);
      }
    }

    return { verified: true, elapsed: totalElapsed };
  }

  async doVisit(templeId = this.temple) {
    this.checkAborted();
    log.temple('🏯', `Viếng thăm ngôi chùa [${templeId}]...`);
    let res = null;
    if (this.token) {
      res = await this.practice('visit', { temple: templeId });
    }
    this.send({ t: 'visit', zone: templeId });
    return res;
  }

  async doVisitAll() {
    this.checkAborted();
    log.temple('🗺️', 'Bắt đầu hành hương viếng thăm các danh lam cổ tự...');
    const temples = this.meta?.temples || [
      { id: 'voluong' }, { id: 'tranho' }, { id: 'huongson' }, { id: 'nhattru' },
      { id: 'dinhmay' }, { id: 'baison' }, { id: 'lamkinh' }, { id: 'thienmau' }
    ];
    for (const t of temples.slice(0, 10)) {
      this.checkAborted();
      await this.doVisit(t.id);
      await this.sleep(this.isTurbo() ? 50 : 1300);
    }
    // Tự động claim các tuyến hành hương và thành tựu tám chùa nếu hoàn tất
    const routeQuests = ['r_thanglong', 'r_datbac', 'r_codo', 'r_phuongnam', 'r_biendong', 'r_nonnuoc', 'r_bacoi', 'a_tamchua'];
    for (const rq of routeQuests) {
      if (this.token) {
        try { await this.post(`/quests/${rq}/claim`); } catch {}
      }
      this.send({ t: 'claim', q: rq });
    }
    log.success('🎉 Đã hoàn tất hành trình viếng thăm các ngôi chùa!');
  }

  async doKhoe() {
    this.checkAborted();
    log.temple('📢', 'Lan tỏa thiện duyên và chia sẻ công đức tu tập...');
    let res = null;
    if (this.token) {
      try { res = await this.post('/share'); } catch {}
    }
    this.send({ t: 'khoe' });
    this.send({ t: 'claim', q: 'd_khoe' });
    log.success('🎉 Đã chia sẻ công đức tu tập thành công!');
    return res;
  }

  async doLantern(text = 'Cầu cho muôn người bình an, vạn sự hanh thông', color = 'vang', count = 1) {
    this.checkAborted();
    log.temple('🪷', `Thả hoa đăng cầu nguyện: "${text}"...`);
    let res = null;
    if (this.token) {
      try { res = await this.post('/lanterns', { text, temple: this.temple }); } catch {}
    }
    this.send({ t: 'lantern', text, color });
    this.send({ t: 'claim', q: 'den' });
    this.send({ t: 'claim', q: 'd_den' });
    log.success('🎉 Đã thả hoa đăng lung linh trên hồ sen chùa!');
    return res;
  }

  async doTuyHy(maxCount = 3) {
    this.checkAborted();
    log.temple('✨', `Tùy hỷ công đức hoa đăng của các bạn đồng tu...`);
    let rejoiced = 0;
    if (this.token) {
      try {
        const lanterns = await this.api('/lanterns?all=1');
        for (const l of (lanterns || [])) {
          if (!l.mine && !l.liked && rejoiced < maxCount) {
            try {
              await this.post(`/lanterns/${l.id}/rejoice`);
              rejoiced++;
              await this.sleep(this.isTurbo() ? 50 : 250);
            } catch {}
          }
        }
      } catch {}
    }
    this.send({ t: 'claim', q: 'd_tuyhy' });
    this.send({ t: 'claim', q: 'tuyhy' });
    log.success(`🎉 Đã tùy hỷ công đức ${rejoiced > 0 ? `${rejoiced} hoa đăng ` : ''}thiện lành!`);
  }

  async doTangKinhCac(sutraId = 'all') {
    this.checkAborted();
    log.temple('📖', 'Viếng Tàng Kinh Các lắng nghe kinh điển giác ngộ...');
    this.send({ t: 'visit', zone: 'Tàng Kinh Các' });
    await this.sleep(this.isTurbo() ? 80 : 300);

    if (this.token) {
      try {
        await this.practice('mo', { count: 4, auto: true, temple: this.temple });
        await this.practice('chant_done', { sutra: 'hoihuong', temple: this.temple });
      } catch {}
    }

    const sutras = sutraId === 'all' ? BUDDHIST_SUTRAS : BUDDHIST_SUTRAS.filter(s => s.id === sutraId);
    for (const s of sutras) {
      this.checkAborted();
      log.info(`📖 Lắng nghe: ${s.title} (${s.desc})`);
      this.send({ t: 'tk-read', id: s.id });
      await this.sleep(this.isTurbo() ? 80 : 400);
      if (this.token && sutraId !== 'all') {
        try { await this.practice('chant_done', { sutra: s.id }); } catch {}
      }
      this.send({ t: 'tk-done', id: s.id });
      await this.sleep(this.isTurbo() ? 90 : 500);
    }
    this.send({ t: 'claim', q: 'wDoc' });
    this.send({ t: 'claim', q: 'd_kinh1' });
    this.send({ t: 'claim', q: 'kinh' });
    log.success('🎉 Đã hoàn tất lắng nghe trọn vẹn kinh điển tại Tàng Kinh Các!');
  }

  async doSecrets(wishId = 'all') {
    this.checkAborted();
    await this.doTangKinhCac('all');
    await this.doXinChu(wishId);
  }

  async doXinAllChu() {
    this.checkAborted();
    log.temple('✍️', 'Xin trọn bộ chữ thư pháp cát tường từ Thầy đồ...');
    this.send({ t: 'visit', zone: 'Thầy đồ' });
    this.send({ t: 'chu-list' });
    await this.sleep(this.isTurbo() ? 80 : 300);

    for (const w of CALLIGRAPHY_WORDS) {
      this.checkAborted();
      log.info(`✍️ Thầy đồ phóng bút chữ "${w.text}" (${w.wish})...`);
      this.send({ t: 'chu-xin', chu: w.id });
      await this.sleep(this.isTurbo() ? 80 : 350);
      this.send({ t: 'chu-dem', k: 'mo' });
      await this.sleep(this.isTurbo() ? 80 : 200);
      this.send({ t: 'chu-dem', k: 'vao' });
      await this.sleep(this.isTurbo() ? 80 : 200);
      this.send({ t: 'chu-giu', chu: w.id });
      await this.sleep(this.isTurbo() ? 90 : 400);
    }
    this.send({ t: 'claim', q: 'chu' });
    this.send({ t: 'claim', q: 'd_chu' });
    log.success('🎉 Đã cất trọn bộ chữ thư pháp vào Tủ chữ cá nhân!');
  }

  async doXinChu(wishId = null) {
    this.checkAborted();
    const wish = (wishId || 'binh-an').toLowerCase();
    if (['all', 'tat-ca', 'full', 'tron-bo'].includes(wish)) {
      return this.doXinAllChu();
    }
    log.temple('✍️', `Xin chữ thư pháp "${wish}" từ Thầy đồ...`);
    this.send({ t: 'visit', zone: 'Thầy đồ' });
    this.send({ t: 'chu-xin', chu: wish });
    await this.sleep(this.isTurbo() ? 80 : 350);
    this.send({ t: 'chu-dem', k: 'mo' });
    await this.sleep(this.isTurbo() ? 80 : 200);
    this.send({ t: 'chu-dem', k: 'vao' });
    await this.sleep(this.isTurbo() ? 80 : 200);
    this.send({ t: 'chu-giu', chu: wish });
    return { ok: true };
  }

  async doIncense(count = 1) {
    this.checkAborted();
    log.temple('🕯️', `Thắp nén hương thơm dâng lên Tam Bảo...`);
    let res = null;
    if (this.token) {
      try {
        res = await this.post('/use', { item: 'huong_tram', temple: this.temple });
      } catch (e) {
        try { res = await this.practice('incense'); } catch {}
      }
    }
    this.send({ t: 'huong' });
    this.send({ t: 'claim', q: 'd_huong' });
    this.send({ t: 'claim', q: 'huong' });
    return res;
  }

  async doGreet(targetPeerId = null) {
    this.checkAborted();
    log.temple('🙏', 'Chắp tay cúi đầu chào bạn đồng tu...');
    this.send({ t: 'emote', e: 'pray' });
    return { ok: true };
  }

  async doChores() {
    this.checkAborted();
    await this.doQuetLa(1);
    await this.doIncense(1);
    await this.doBell();
  }

  async doPet() {
    this.checkAborted();
    log.info('Chăm sóc linh thú chùa...');
    this.send({ t: 'pet' });
    return { ok: true };
  }

  async doPlant() {
    this.checkAborted();
    log.temple('🌱', 'Làm công quả trồng cây ngoài sân chùa...');
    this.send({ t: 'visit', zone: 'Sân chùa' });
    this.send({ t: 'plant', k: 'cuc' });
    this.send({ t: 'water', pid: this.myPid || '' });
    this.send({ t: 'chore', k: 'plant' });
    this.send({ t: 'emote', e: 'plant' });
    this.send({ t: 'viec', k: 'plant' });
    let res = null;
    if (this.token) {
      try {
        res = await this.practice('plant');
        log.success(`🌱 Đã trồng cây công quả: +${res.gained || 15} công đức!`);
        if (res?.questsDone?.includes('d_plant')) {
          try { await this.post('/quests/d_plant/claim'); } catch {}
        }
      } catch (e) {
        log.warn(`Lỗi khi trồng cây công quả: ${e.message}`);
      }
    }
    return res || { ok: true };
  }

  async doGarden(options = {}) {
    this.checkAborted();
    log.info('Chăm sóc vườn cây sân chùa...');
    this.send({ t: 'garden' });
    await this.sleep(this.isTurbo() ? 80 : 300);

    // Trồng cây công quả nếu có quest d_plant chưa hoàn tất hoặc mặc định trồng
    const plantQuest = (this.merit?.me?.quests || []).find(q => q.id === 'd_plant' || q.id === 'plant');
    const needPlant = plantQuest && !plantQuest.claimed && (plantQuest.have || 0) < plantQuest.need;
    if (needPlant || (!plantQuest && options.alwaysPlant !== false)) {
      await this.doPlant();
    }

    if (options.autoWaterOthers) {
      log.info('Tưới nước giúp bạn đồng tu (+công đức)...');
      this.send({ t: 'water', pid: null });
      await this.sleep(this.isTurbo() ? 80 : 300);
    }

    return { ok: true };
  }

  /**
   * Dạo vườn chùa nhặt hoa sen vàng lộc — xử lý quest d_loc2 (daily) và w_loc15 (weekly).
   * Cơ chế: Lấy vị trí hoa sen vàng từ GET /loc?temple=...
   * Gửi tọa độ người chơi tới gần hoa qua gói WS { t: 's', x, z, y: 0, r: 0, seat: -1, a: 0 }
   * Gọi POST /loc/claim { temple, id } để máy chủ xác thực và trao lộc.
   * @param {number} count - Số lượng lộc cần nhận (mặc định 2).
   */
  async doLoc(count = 2) {
    this.checkAborted();
    log.temple('🍀', `Dạo khuôn viên chùa tìm và nhận hoa sen vàng lộc (${count} lần)...`);
    let claimed = 0;
    if (!this.token) {
      // Offline / mock mode
      for (let i = 0; i < count; i++) {
        this.send({ t: 'loc' });
        await this.sleep(this.isTurbo() ? 50 : 200);
      }
      return { ok: true, claimed: count, count };
    }

    try {
      const candidateTemples = [this.temple, 'tranho', 'huongson', 'dinhmay', 'baison', 'thienmau', 'nhattru'];
      let templeIdx = 0;

      while (claimed < count && templeIdx < candidateTemples.length) {
        this.checkAborted();
        const currentTemple = candidateTemples[templeIdx];
        let locData = null;
        try {
          locData = await this.api(`/loc?temple=${encodeURIComponent(currentTemple)}`);
        } catch {}

        const spawns = locData?.spawns || [];
        if (spawns.length > 0) {
          if (currentTemple !== this.temple) {
            await this.doVisit(currentTemple);
            await this.sleep(this.isTurbo() ? 100 : 800);
          }

          for (const spawn of spawns) {
            if (claimed >= count) break;
            this.checkAborted();

            // Báo vị trí của nhân vật tới gần hoa sen vàng để máy chủ xác thực
            for (let step = 0; step < 3; step++) {
              this.send({ t: 's', x: spawn.x, z: spawn.z, y: 0, r: 0, seat: -1, a: 0 });
              await this.sleep(this.isTurbo() ? 80 : 350);
            }

            try {
              const res = await this.post('/loc/claim', { temple: currentTemple, id: spawn.id });
              claimed++;
              log.success(`🍀 Nhặt được lộc chùa (#${spawn.id}): ${res.label || 'Lộc phước'} - "${res.blessing || ''}"`);
              if (res?.questsDone?.includes('d_loc2')) {
                try { await this.post('/quests/d_loc2/claim'); } catch {}
              }
            } catch (e) {
              if (e.message?.includes('còn nhận được 0 lộc')) {
                log.info('Đã hết hạn mức nhận lộc hôm nay.');
                templeIdx = candidateTemples.length;
                break;
              }
            }
            await this.sleep(this.isTurbo() ? 100 : 600);
          }
        }
        templeIdx++;
      }
    } catch (err) {
      log.warn(`Lỗi trong quá trình nhặt lộc: ${err.message}`);
    }

    try { await this.post('/quests/d_loc2/claim'); } catch {}
    return { ok: true, claimed, count };
  }

  async doVow(text = 'Cầu cho muôn người bình an, thân tâm thường an lạc, vạn sự hanh thông') {
    this.checkAborted();
    log.temple('🙏', `Gửi một lời nguyện chung tới cả chùa: "${text}"…`);
    this.send({ t: 'vow', text });
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  async doQaIncense() {
    this.checkAborted();
    log.temple('🪔', 'Dâng hương tại đài Quan Thế Âm Bồ Tát…');
    this.send({ t: 'qa-incense' });
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  async doEnterAm() {
    this.checkAborted();
    log.temple('🛖', 'Bước vào Am riêng tu tập...');
    this.send({ t: 'visit', zone: 'Am riêng' });
    this.send({ t: 'am' });
    this.send({ t: 'am-in' });
    this.inAm = true;
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  async doAmIncense() {
    this.checkAborted();
    log.temple('🕯️', 'Dâng ba nén hương trầm trên bàn thờ trong Am riêng...');
    this.send({ t: 'am-incense' });
    await this.sleep(this.isTurbo() ? 80 : 300);
  }

  async doLeaveAm() {
    this.checkAborted();
    log.temple('🚪', 'Rời khỏi Am riêng, trở lại sân chùa...');
    this.send({ t: 'am-out' });
    this.inAm = false;
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  async doEnterPhapDuong() {
    this.checkAborted();
    log.temple('🏛️', 'Bước vào Pháp đường tu tập...');
    this.send({ t: 'visit', zone: 'Pháp đường' });
    this.send({ t: 'phap-in' });
    this.inPhapDuong = true;
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  async doLeavePhapDuong() {
    this.checkAborted();
    log.temple('🚪', 'Rời Pháp đường, trở về khuôn viên chùa...');
    this.send({ t: 'phap-out' });
    this.inPhapDuong = false;
    await this.sleep(this.isTurbo() ? 80 : 250);
  }

  claimQuest(questId) {
    this.send({ t: 'claim', q: questId });
  }

  async fetchJournal() {
    if (this.token) {
      try { await this.fetchMe(); } catch {}
    }
    return this.journal || { sitMin: 0, bows: 0, beads: 0, mo: 0 };
  }

  async claimAllQuests() {
    this.checkAborted();
    const claimed = [];
    const unverified = [];

    // Nhận thưởng trực tuyến nếu có token
    if (this.token) {
      try {
        await this.fetchMe();
        for (const q of this.profile?.quests || []) {
          if (!q.claimed && (q.done || (q.target && q.progress >= q.target))) {
            try {
              const res = await this.post(`/quests/${q.id}/claim`);
              claimed.push({ id: q.id, name: q.name, reward: res.reward });
              log.success(`🎁 Đã nhận thưởng nhiệm vụ [${q.name}]: +${res.reward?.sen || 10} Sen!`);
            } catch {}
          }
        }
      } catch {}
    }

    // Nhận thưởng đối với các nhiệm vụ trong snapshot merit (bao gồm cả offline test)
    const activeQuests = (this.merit?.me?.quests || []).filter(q => !q.claimed && ((q.have && q.need && q.have >= q.need) || q.done));
    for (const q of activeQuests) {
      this.send({ t: 'claim', q: q.id });
      if (!claimed.some(x => x.id === q.id)) {
        claimed.push({ id: q.id, name: q.name || q.title, reward: q.reward });
      }
      q.claimed = true;
    }

    return { claimed, unverified };
  }

  printJournal() {
    if (!this.profile?.user) return;
    const stats = this.profile.user.stats || {};
    console.log('===============================================');
    console.log('📜  SỔ TÍCH LŨY CÔNG ĐỨC TU TẬP:');
    console.log('===============================================');
    console.log(`• Tổng số lạy Phật sám hối : ${stats.bows || 0} lạy`);
    console.log(`• Tổng số hạt tràng niệm   : ${stats.beads || 0} hạt`);
    console.log(`• Tổng số tiếng mõ tụng    : ${stats.mo || 0} tiếng`);
    console.log(`• Tổng thời gian thiền định: ${stats.sitMin || 0} phút`);
    console.log('===============================================\n');
  }

  printStatus() {
    if (!this.profile?.user) {
      log.warn('Chưa có thông tin công đức từ máy chủ.');
      return;
    }
    const u = this.profile.user;
    console.log('\n===============================================');
    console.log(`🪷  THÔNG TIN CÔNG ĐỨC - ${u.name}`);
    console.log('===============================================');
    console.log(`• Pháp danh        : ${u.name}`);
    console.log(`• Tông phái tu tập : ${u.sect}`);
    console.log(`• Cấp bậc          : ${u.title || `Bậc ${u.level}`} (Cấp ${u.level})`);
    console.log(`• Tổng công đức    : ${u.exp} / ${u.expNext}`);
    console.log(`• Tài sản          : ${u.sen} Sen | ${u.ngoc} Ngọc`);
    console.log(`• Chuỗi ngày tu tập: ${u.streak} ngày`);
    console.log('-----------------------------------------------');
    console.log('📋  DANH SÁCH NHIỆM VỤ HÀNG NGÀY & TUẦN:');
    for (const q of (this.profile.quests || []).slice(0, 10)) {
      const status = q.claimed ? '✅ Đã nhận quà' : (q.done || q.progress >= q.target ? '🎁 Chờ nhận thưởng' : `⏳ ${q.progress}/${q.target}`);
      console.log(`  [${status}] ${q.name} (${q.period})`);
    }
    console.log('===============================================\n');
  }

  close() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connected = false;
  }
}

export const NiemPhatClient = DiDenChuaClient;
