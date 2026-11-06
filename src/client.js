import { log } from './logger.js';
import { loadConfig } from '../config.js';

const WS_URL = 'wss://didenchua.online/ws';
// Send before the server's reported 20s idle window to tolerate event-loop/network jitter.
const HEARTBEAT_INTERVAL_MS = 15000;

// Danh sách 50 bồ đoàn chính thức tại Chánh điện (tính toán chuẩn xác theo layout 3D của game didenchua.online)
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

// Danh sách 11 loại áo tràng trong chùa
export const ROBES_CATALOG = {
  nau: { name: 'Áo nâu', color: '#7a5134' },
  lam: { name: 'Áo tràng lam', color: '#5d7487' },
  xam: { name: 'Áo xám', color: '#8a8a84' },
  vang: { name: 'Áo vàng', color: '#b98a3a' },
  cam: { name: 'Áo cam', color: '#b8602c' },
  trang: { name: 'Áo tràng nâu', color: '#54392a' },
  tieu: { name: 'Áo tiểu', color: '#b5b2a6' },
  sen: { name: 'Áo tràng sen', color: '#cf93a2', event: 'Lễ rằm' },
  xuan: { name: 'Áo Xuân', color: '#a8402e', event: 'Lễ Tết' },
  vulan: { name: 'Áo Vu Lan', color: '#e6e0d2', event: 'Lễ Vu Lan' },
  tangoc: { name: 'Áo tràng ngọc', color: '#3f8f86', needMerit: 15000 }
};

// Danh sách 13 loại tràng hạt
export const BEADS_CATALOG = {
  go: { name: 'Tràng hạt gỗ', color: '#e0852c', lv: 0 },
  bode: { name: 'Tràng hạt bồ đề', color: '#b98a5a', lv: 1 },
  tram: { name: 'Tràng hạt trầm hương', color: '#6b442a', lv: 2 },
  hophach: { name: 'Tràng hạt hổ phách', color: '#f2a91f', lv: 3 },
  ngoc: { name: 'Tràng hạt ngọc bích', color: '#4fae84', lv: 4 },
  mun: { name: 'Tràng hạt gỗ mun', color: '#2c2320', special: 'Xong mục Người mới' },
  tuDan: { name: 'Tràng hạt tử đàn', color: '#5a1f28', special: 'Đạt 1.000 công đức' },
  manao: { name: 'Tràng hạt mã não', color: '#c2412b', special: 'Quà điểm danh ngày 7' },
  thachAnh: { name: 'Tràng hạt thạch anh tím', color: '#8e5fc0', special: 'Đạt 3.000 công đức' },
  maivang: { name: 'Tràng hạt hoa mai', color: '#f4c430', special: 'Làm trọn lễ Tết' },
  bachngoc: { name: 'Tràng hạt bạch ngọc', color: '#e6ebe2', special: 'Lễ Phật Đản' },
  hongngoc: { name: 'Tràng hạt hồng ngọc', color: '#d9506e', special: 'Lễ Vu Lan' },
  bachHop: { name: 'Tràng hạt bách hợp', color: '#f1ead8', special: 'Đạt 30.000 công đức' }
};

// Danh sách 7 loại bồ đoàn
export const CUSHIONS_CATALOG = {
  xam: { name: 'Bồ đoàn xám', color: '#8a8a84', lv: 0 },
  nau: { name: 'Bồ đoàn nâu', color: '#7a5134', lv: 1 },
  vang: { name: 'Bồ đoàn vàng', color: '#c9a24a', lv: 2 },
  son: { name: 'Bồ đoàn đỏ son', color: '#a3452f', lv: 3 },
  sen: { name: 'Bồ đoàn hoa sen', color: '#d98fa0', lv: 5 },
  laSen: { name: 'Bồ đoàn lá sen', color: '#5c8f5a', special: 'Đạt 500 công đức' },
  gam: { name: 'Bồ đoàn gấm', color: '#8c2f4a', special: 'Đạt 7.000 công đức' }
};

// Danh sách 12 pháp khí chùa
export const PHAPKHI_CATALOG = {
  huong: { name: 'Nén hương', rank: 'Thường', how: 'Dâng hương 10 lần' },
  gio: { name: 'Giỏ hoa sen', rank: 'Thường', how: 'Thả 5 ngọn hoa đăng' },
  gaytruc: { name: 'Gậy trúc hành hương', rank: 'Thường', how: 'Thăm đủ 10 khu trong chùa' },
  mo: { name: 'Mõ cầm tay', rank: 'Hiếm', how: 'Gõ 500 tiếng mõ khi Tụng kinh' },
  kinh: { name: 'Cuốn kinh', rank: 'Hiếm', how: 'Chơi Đố vui Phật pháp 3 tối' },
  trentram: { name: 'Cây tre trăm đốt', rank: 'Hiếm', how: 'Lần 30 chuỗi tràng hạt' },
  truong: { name: 'Thiền trượng chín khoen', rank: 'Quý', how: 'Lạy Phật 1.000 lạy' },
  nonla: { name: 'Nón lá', rank: 'Thường', how: 'Lên chùa 14 ngày' },
  denlong: { name: 'Đèn lồng', rank: 'Hiếm', how: 'Làm trọn lễ mùng một' },
  chuong: { name: 'Chuông tay', rank: 'Hiếm', how: 'Thỉnh chuông 10 lần' },
  bat: { name: 'Bát tím vàng', rank: 'Quý', how: 'Làm trọn 6 lễ chùa' },
  gaythan: { name: 'Gậy thần Chử Đồng Tử', rank: 'Quý', how: 'Ngồi tĩnh 300 phút' }
};

// Danh sách 7 linh thú
export const PETS_CATALOG = {
  meo: { name: 'Mèo chùa', lv: 2, days: 7, desc: 'Lười biếng mà hiền, thích nằm sưởi nắng bên hiên' },
  se: { name: 'Chim sẻ', lv: 3, days: 14, desc: 'Nhảy lích chích theo chân, mổ hạt thóc rơi' },
  tho: { name: 'Thỏ trắng', lv: 4, days: 21, desc: 'Nhút nhát nhưng quấn chủ, nhảy từng bước nhỏ' },
  soc: { name: 'Sóc nâu', lv: 4, days: 30, desc: 'Nhanh nhẹn, đuôi to như chổi lông' },
  rua: { name: 'Rùa vàng', lv: 5, days: 45, desc: 'Chậm rãi, điềm tĩnh, sống lâu như chùa' },
  huou: { name: 'Hươu sao', lv: 5, days: 60, desc: 'Hiền lành, lưng lấm tấm sao trắng' },
  hac: { name: 'Hạc trắng', lv: 6, days: 90, desc: 'Thanh cao, chân dài, cổ vươn như đang múa' }
};

// Danh sách 7 vị trí bài trí trong Am riêng tu tập
export const AM_SLOTS = [
  { id: 'altar', name: 'Giữa bàn thờ', kind: 'tuong' },
  { id: 'altarL', name: 'Bàn thờ, bên trái', kind: 'ban' },
  { id: 'altarR', name: 'Bàn thờ, bên phải', kind: 'ban' },
  { id: 'wallL', name: 'Tường trái', kind: 'tranh' },
  { id: 'wallR', name: 'Tường phải', kind: 'tranh' },
  { id: 'cornerL', name: 'Góc trái', kind: 'goc' },
  { id: 'cornerR', name: 'Góc phải', kind: 'goc' }
];

// Danh sách vật phẩm bài trí Am riêng
export const AM_ITEMS = [
  { id: 'phat', name: 'Tượng Phật nhỏ', kind: 'tuong', free: true },
  { id: 'dilac', name: 'Tượng Di Lặc nhỏ', kind: 'tuong', free: true },
  { id: 'luhuong', name: 'Lư hương', kind: 'ban', free: true },
  { id: 'binhsen', name: 'Bình sen', kind: 'ban', free: true },
  { id: 'dendau', name: 'Đèn dầu', kind: 'ban', free: true },
  { id: 'tranhsen', name: 'Tranh sen', kind: 'tranh', free: true },
  { id: 'tranhan', name: 'Tranh chữ "An"', kind: 'tranh', free: true },
  { id: 'chaulan', name: 'Chậu lan', kind: 'goc', free: true },
  { id: 'denlong', name: 'Đèn lồng', kind: 'goc', free: true },
  { id: 'binhtruc', name: 'Bình trúc', kind: 'goc', free: false },
  { id: 'densen', name: 'Đèn hoa sen', kind: 'ban', free: false }
];

export class DiDenChuaClient {
  constructor(customConfig = {}) {
    this.config = { ...loadConfig(), ...customConfig };
    this.ws = null;
    this.connected = false;
    this.myId = null;
    this.myPid = null;
    this.room = this.config.room || 'chua-1';
    this.peers = new Map();
    this.takenSeats = new Set();
    this.merit = null;
    this.checkinInfo = null;
    this.chores = null;
    this.lanterns = [];
    this.journal = null;
    this.garden = null;
    this.calligraphy = null;
    this.heartbeatTimer = null;
    this.aborted = false;
    this.abortResolvers = new Set();
    this.messageListeners = new Set();
    this.recentGains = [];
    this.recentToasts = [];
  }

  async connect(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (this.aborted) {
        return reject(new Error('Tác vụ đã bị dừng bởi người dùng.'));
      }

      let timer = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        this.abortResolvers.delete(onAbort);
        this.close();
        reject(new Error('Tác vụ đã bị dừng bởi người dùng.'));
      };
      this.abortResolvers.add(onAbort);

      timer = setTimeout(() => {
        this.abortResolvers.delete(onAbort);
        if (!this.connected) {
          this.close();
          reject(new Error(`Quá thời gian kết nối đến chùa (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      if (this.ws) {
        // Avoid leaving an old interval alive when reconnect replaces a socket.
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        try {
          this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
          this.ws.close();
        } catch {}
      }

      try {
        this.ws = new WebSocket(WS_URL);
      } catch (err) {
        this.abortResolvers.delete(onAbort);
        clearTimeout(timer);
        return reject(err);
      }

      this.ws.onopen = () => {
        log.info(`Đã kết nối máy chủ. Đang vào phòng ${this.room} với danh hiệu "${this.config.name}"...`);
        const handshake = {
          t: 'hello',
          v: 2,
          cid: this.config.cid,
          adopt: false,
          name: this.config.name,
          kind: this.config.kind || 'tieu',
          robe: this.config.robe || 'nau',
          skin: this.config.skin || 'dong',
          bio: this.config.bio || 'Nam Mô A Di Đà Phật',
          beads: this.config.beads || 'go',
          cushion: this.config.cushion || 'xam',
          room: this.room,
          view: 10
        };
        this.ws.send(JSON.stringify(handshake));

        // Keep exactly one heartbeat schedule per active socket; 15s leaves room for jitter.
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ t: 'hb' }));
          }
        }, HEARTBEAT_INTERVAL_MS);
        if (this.heartbeatTimer?.unref) {
          this.heartbeatTimer.unref();
        }
      };

      this.ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        this.handleMessage(msg);

        // Khi nhận được cả welcome và merit thì coi như kết nối hoàn tất
        if (msg.t === 'welcome') {
          this.connected = true;
        }
        if (msg.t === 'merit' && this.connected) {
          this.abortResolvers.delete(onAbort);
          clearTimeout(timer);
          resolve(this);
        }
      };

      this.ws.onerror = (err) => {
        log.error('Lỗi WebSocket:', err?.message || err);
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
        if (event?.code === 1008) {
          const reason = String(event.reason || '').slice(0, 160);
          log.warn(`Máy chủ đóng WebSocket theo policy (1008)${reason ? `: ${reason}` : '.'}`);
        }
      };
    });
  }

  handleMessage(msg) {
    // 1. Phân phối cho các observer/listener đã đăng ký
    for (const listener of this.messageListeners) {
      try {
        listener(msg);
      } catch {}
    }

    // 2. Ghi nhận phản hồi công đức tức thời
    if (msg.t === 'gain' && typeof msg.n === 'number') {
      this.recentGains.push({ n: msg.n, why: msg.why || '', at: Date.now() });
      if (this.recentGains.length > 50) this.recentGains.shift();
    } else if (msg.t === 'merit' && msg.gain && typeof msg.gain.n === 'number') {
      this.recentGains.push({ n: msg.gain.n, why: msg.gain.why || '', at: Date.now() });
      if (this.recentGains.length > 50) this.recentGains.shift();
    }

    // 3. Ghi nhận thông báo / toast từ máy chủ
    if (msg.t === 'toast' || msg.t === 'alert' || msg.t === 'notify' || msg.msg || msg.text) {
      const text = msg.msg || msg.text || msg.message || (typeof msg === 'string' ? msg : '');
      if (text) {
        this.recentToasts.push({ t: msg.t || 'toast', text: String(text), at: Date.now() });
        if (this.recentToasts.length > 50) this.recentToasts.shift();
      }
    }

    switch (msg.t) {
      case 'welcome':
        this.myId = msg.id;
        this.myPid = msg.pid;
        this.room = msg.room;
        this.chores = msg.chores;
        this.lanterns = Array.isArray(msg.lanterns) ? msg.lanterns : [];
        if (Array.isArray(msg.seats)) {
          this.takenSeats = new Set(msg.seats.map(s => s[0]));
        }
        if (msg.saved?.name) this.savedName = msg.saved.name;
        if (msg.user) this.accountUser = msg.user;
        if (Array.isArray(msg.peers)) {
          for (const p of msg.peers) {
            this.peers.set(p.id, p);
          }
        }
        break;

      case 'checkin':
        this.checkinInfo = msg;
        log.temple('📅', `Điểm danh ngày ${msg.day} (chuỗi ${msg.days} ngày): Nhận ${msg.got}`);
        break;

      case 'journal':
        this.journal = msg.j;
        if (this.journal && this.merit?.me) {
          if (this.journal.name) this.merit.me.name = this.journal.name;
          if (this.journal.user) this.merit.me.user = this.journal.user;
        }
        break;

      case 'garden':
        this.garden = msg;
        break;

      case 'chu':
        this.calligraphy = msg;
        break;

      case 'merit':
        this.merit = msg;
        if (msg.gain) {
          log.merit(`✨ +${msg.gain.n} công đức (${msg.gain.why})`);
        }
        if (this.merit?.me) {
          if (!this.merit.me.name) this.merit.me.name = this.journal?.name || this.savedName || this.config.name || 'Phật Tử';
          if (!this.merit.me.user) this.merit.me.user = this.journal?.user || this.accountUser || null;
        }
        break;

      case 'chores':
        this.chores = msg.c;
        break;

      case 'gain':
        log.merit(`+${msg.n} công đức (${msg.why})`);
        break;

      case 'join':
        if (msg.peer) this.peers.set(msg.peer.id, msg.peer);
        break;

      case 'leave':
        this.peers.delete(msg.id);
        break;

      case 'near':
        if (Array.isArray(msg.add)) {
          for (const p of msg.add) this.peers.set(p.id, p);
        }
        if (Array.isArray(msg.drop)) {
          for (const id of msg.drop) this.peers.delete(id);
        }
        break;
    }
  }

  onMessage(listener) {
    if (typeof listener !== 'function') return () => {};
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  clearRecentFeedback() {
    this.recentGains = [];
    this.recentToasts = [];
  }

  checkAborted() {
    if (this.aborted) {
      throw new Error('Tác vụ đã bị dừng bởi người dùng.');
    }
  }

  send(data) {
    if (this.aborted) return false;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
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

  async humanDelay(reason = 'khoan thai chuyển bước') {
    this.checkAborted();
    if (!this.config.safeMode) {
      await this.sleep(300);
      return;
    }
    const min = (this.config.minDelaySec || 1.0) * 1000;
    const max = (this.config.maxDelaySec || 2.0) * 1000;
    const delay = Math.floor(min + Math.random() * (max - min));
    log.info(`⏳ ${reason} (chờ ${(delay / 1000).toFixed(1)}s)...`);
    await this.sleep(delay);
  }

  // --- CÁC HÀNH ĐỘNG CỤ THỂ ---

  async doCheckin() {
    this.checkAborted();
    log.info('Kiểm tra điểm danh hàng ngày...');
    // Server tự động gửi gói checkin khi hello, nhưng cũng có thể nhận quà lễ nếu có
    this.send({ t: 'claim-le' });
    await this.humanDelay('ngắm cổng tam quan khi mới vào chùa');
    if (this.checkinInfo) {
      return this.checkinInfo;
    }
    return { status: 'Đã điểm danh hôm nay' };
  }

  async doIncense(count = 1) {
    this.checkAborted();
    log.temple('🪔', `Bắt đầu dâng hương (${count} nén)…`);
    for (let i = 1; i <= count; i++) {
      this.checkAborted();
      if (i > 1) {
        await this.humanDelay(`thành tâm dâng nén hương tiếp theo (nén ${i}/${count})`);
      } else {
        await this.humanDelay('chậm rãi bước đến lư hương chánh điện');
      }
      this.checkAborted();
      log.info(`[${i}/${count}] -> Thắp nén tâm hương thành kính...`);
      this.send({ t: 'incense' });
      await this.sleep(400);
      this.claimQuest('huong');
      if (i < count) await this.sleep(600);
    }
    log.info(`Đã gửi hoàn tất yêu cầu dâng ${count} nén tâm hương (chờ máy chủ ghi nhận).`);
  }

  async doLantern(text = 'Cầu cho muôn người bình an, vạn sự hanh thông', color = 'vang', count = 1) {
    this.checkAborted();
    log.temple('🏮', `Bắt đầu thả hoa đăng sen (${count} ngọn)…`);
    for (let i = 1; i <= count; i++) {
      this.checkAborted();
      if (i > 1) {
        await this.humanDelay(`thắp ngọn hoa đăng tiếp theo (ngọn ${i}/${count})`);
      } else {
        await this.humanDelay('thong thả đi dạo ra bến hồ thả đăng');
      }
      this.checkAborted();
      log.info(`[${i}/${count}] -> Thả ngọn hoa đăng sen màu [${color}]: "${text}"`);
      this.send({ t: 'lantern', color, text });
      await this.sleep(400);
      this.claimQuest('den');
      if (i < count) await this.sleep(600);
    }
    log.info(`Đã gửi hoàn tất yêu cầu thả ${count} ngọn hoa đăng sen (chờ máy chủ ghi nhận).`);
  }

  async doGreet(targetPeerId = null) {
    this.checkAborted();
    let target = targetPeerId;
    if (!target && this.peers.size > 0) {
      target = Array.from(this.peers.keys())[0];
    }
    if (target) {
      await this.humanDelay('tiến lại gần chào hỏi bạn đồng tu');
      this.checkAborted();
      const peer = this.peers.get(target);
      const name = peer ? peer.name : `#${target}`;
      log.temple('🙏', `Chắp tay chào phật tử [${name}]…`);
      this.send({ t: 'greet', to: target });
      this.send({ t: 'emote', e: 'chap' });
      await this.sleep(400);
      this.claimQuest('chao');
      await this.sleep(500);
    } else {
      log.warn('Không tìm thấy ai trong phòng để chắp tay chào.');
    }
  }

  async doQuetLa(count = 1) {
    this.checkAborted();
    log.temple('🧹', `Bắt đầu công quả quét lá sân chùa (${count} lần)…`);
    for (let i = 1; i <= count; i++) {
      this.checkAborted();
      if (i > 1) {
        await this.humanDelay(`thong thả chuyển sang góc sân khác quét tiếp (lần ${i}/${count})`);
      } else {
        await this.humanDelay('cầm chổi bước ra sân chùa');
      }
      this.checkAborted();
      log.info(`[${i}/${count}] -> Gió thổi lá bay, chổi quét sạch bong (động tác quét lá)...`);
      this.send({ t: 'emote', e: 'quet' });
      this.send({ t: 'viec', k: 'quet' });
      if (i < count) await this.sleep(600);
    }
    log.info(`Đã gửi hoàn tất yêu cầu ${count} lần quét lá sân chùa (chờ máy chủ ghi nhận).`);
  }

  async doLay(count = 108) {
    this.checkAborted();
    log.temple('🙏', `Bắt đầu lạy Phật sám hối (${count} lạy trang nghiêm)…`);
    // Đảm bảo đứng tại Chánh điện để máy chủ ghi nhận nhiệm vụ lạy (lay / lay27)
    this.send({ t: 'visit', zone: 'Chánh điện' });
    await this.sleep(300);
    // Máy chủ quy định: mỗi gói { t: 'emote', e: 'lay' } tự động cộng 3 lạy ($n.bows += 3).
    // Cooldown máy chủ chuẩn xác là 5.000ms. Để lạy 'count' lạy, cần Math.ceil(count / 3) lần gửi.
    const emotesNeeded = Math.ceil(count / 3);
    for (let i = 1; i <= emotesNeeded; i++) {
      this.checkAborted();
      const currentBows = Math.min(i * 3, count);
      log.info(`...[${currentBows}/${count} lạy] Thành kính cúi lạy Phật đài...`);
      this.send({ t: 'emote', e: 'lay' });
      if (i < emotesNeeded) {
        await this.sleep(5050);
      }
    }
    log.info(`Đã hoàn tất gửi ${count} lạy sám hối trước Phật đài.`);
  }

  async doVisitAll() {
    this.checkAborted();
    const zones = [
      'Chánh điện', 'Bảo tháp', 'Giếng Ngọc', 'Tượng Di Lặc',
      'Hồ sen · Cầu Duyên', 'Vườn Linh Thú', 'Vườn hoa', 'Vườn thiền',
      'Hành lang La Hán', 'Sân chùa', 'Cổng tam quan', 'Đường thần đạo',
      'Gác chuông', 'Tháp nghỉ chân'
    ];
    log.temple('🚶', `Bắt đầu viếng thăm khắp các khu vực trong chùa (cày danh hiệu "Thăm khắp chùa")…`);
    for (let i = 0; i < zones.length; i++) {
      this.checkAborted();
      const z = zones[i];
      this.send({ t: 'visit', zone: z });
      log.info(`-> [${i + 1}/${zones.length}] Đã gửi yêu cầu viếng thăm: [${z}]`);
      if (i < zones.length - 1) {
        await this.sleep(200);
      }
    }
    await this.sleep(400);
    log.success('Đã hoàn tất gửi yêu cầu viếng thăm đầy đủ các khu vực trong chùa (10/10 khu).');
  }

  async fetchJournal() {
    this.journal = null;
    this.send({ t: 'journal' });
    let count = 0;
    while (!this.journal && count < 25) {
      await this.sleep(200);
      count++;
    }
    if (this.journal && this.merit?.me) {
      if (this.journal.name) this.merit.me.name = this.journal.name;
      if (this.journal.user) this.merit.me.user = this.journal.user;
    }
    return this.journal;
  }

  printJournal() {
    if (!this.journal) {
      log.warn('Chưa có dữ liệu danh hiệu / thành tựu.');
      return;
    }
    const j = this.journal;
    const userDisplay = (j.user && j.user !== 'null') ? `@${j.user}` : 'Chưa liên kết';
    const curTitle = j.titles?.find(t => t.id === j.title)?.name || j.title || 'Chưa chọn';

    console.log('\n========================================================================');
    console.log(`🪷  HỒ SƠ TU TẬP & THÀNH TỰU (4 TABS TRONG CHÙA AN TỰ DUYÊN)`);
    console.log('========================================================================');

    // TAB 1: CỦA TÔI
    console.log(`\n[TAB 1: CỦA TÔI]`);
    console.log(`• Nhân vật      : ${j.name || this.config.name} (Tài khoản: ${userDisplay})`);
    console.log(`• Cấp bậc       : ${j.level} (Lv.${j.lv}) · Danh hiệu: ${curTitle}`);
    console.log(`• Công đức      : ${j.merit?.toLocaleString('vi-VN')} / ${j.next?.toLocaleString('vi-VN')} điểm`);
    console.log(`• Tâm niệm/Bio  : "${this.config.bio || 'Nam Mô A Di Đà Phật'}"`);
    console.log(`• Trang bị trên người:`);
    console.log(`  - Áo: ${ROBES_CATALOG[this.config.robe]?.name || this.config.robe || 'Áo nâu'}`);
    console.log(`  - Tràng hạt: ${BEADS_CATALOG[this.config.beads]?.name || this.config.beads || 'Tràng hạt gỗ'}`);
    console.log(`  - Bồ đoàn: ${CUSHIONS_CATALOG[this.config.cushion]?.name || this.config.cushion || 'Bồ đoàn xám'}`);
    console.log(`  - Pháp khí: ${PHAPKHI_CATALOG[this.config.phapkhi]?.name || this.config.phapkhi || (j.phapkhi?.includes('truong') ? 'Thiền trượng chín khoen' : 'Chưa cầm')}`);
    console.log(`• Chỉ số tu tập :`);
    console.log(`  🙏 Lạy Phật         : ${j.bows?.toLocaleString('vi-VN')} lạy`);
    console.log(`  📿 Chuỗi tràng hạt  : ${j.rounds} chuỗi (${j.beads?.toLocaleString('vi-VN')} hạt)`);
    console.log(`  🧘 Phút ngồi tĩnh   : ${j.sitMin} phút`);
    console.log(`  🔥 Ngày liên tiếp   : ${j.streak} ngày (kỷ lục: ${j.best})`);
    console.log(`  🚶 Khu đã viếng     : ${j.visited}/${j.zones} khu vực`);
    console.log(`  📅 Ngày đồng hành   : ${j.days} ngày`);
    console.log(`  🕯️ Lần dâng hương   : ${j.incense} lần`);
    console.log(`  🏮 Hoa đăng đã thả  : ${j.lanterns} ngọn`);

    // TAB 2: BỘ SƯU TẬP
    console.log(`\n[TAB 2: BỘ SƯU TẬP]`);
    const ownedItems = new Set([...(j.items || []), ...(j.robes || [])]);
    const ownedPhapkhi = new Set(j.phapkhi || []);
    console.log(`• Pháp khí đã có (${ownedPhapkhi.size}/${Object.keys(PHAPKHI_CATALOG).length}):`);
    for (const [id, pk] of Object.entries(PHAPKHI_CATALOG)) {
      const have = ownedPhapkhi.has(id);
      console.log(`  ${have ? '✅' : '🔒'} [${pk.rank}] ${pk.name}: ${have ? 'Đã sở hữu' : pk.how}`);
    }
    console.log(`• Tràng hạt & Bồ đoàn mở khóa đặc biệt:`);
    for (const id of (j.items || [])) {
      const bName = BEADS_CATALOG[id]?.name;
      const cName = CUSHIONS_CATALOG[id]?.name;
      if (bName) console.log(`  ✨ ${bName}`);
      if (cName) console.log(`  ✨ ${cName}`);
    }

    // TAB 3: DANH HIỆU
    console.log(`\n[TAB 3: DANH HIỆU]`);
    const gotCount = j.titles?.filter(t => t.got).length || 0;
    console.log(`• Đã đạt ${gotCount}/${j.titles?.length || 0} danh hiệu (Đang dùng: ${curTitle}):`);
    if (Array.isArray(j.titles)) {
      for (const t of j.titles) {
        const isCurrent = t.id === j.title;
        const icon = isCurrent ? '🌟 [ĐANG DÙNG]' : t.got ? '✅ [ĐÃ ĐẠT]' : '🔒 [CHƯA ĐẠT]';
        console.log(`  ${icon} ${t.name} (${t.id}): ${t.desc}`);
      }
    }

    // TAB 4: TÀI KHOẢN
    console.log(`\n[TAB 4: TÀI KHOẢN]`);
    console.log(`• Tên đăng nhập : ${userDisplay}`);
    console.log(`• Mã khôi phục  : ${this.config.cid}`);
    console.log(`• Trạng thái    : Đã bảo vệ công đức trên máy chủ.`);
    console.log('========================================================================\n');
  }

  async setTitle(titleId) {
    this.checkAborted();
    log.temple('🎖️', `Đổi danh hiệu nhân vật thành: [${titleId}]...`);
    this.send({ t: 'title', id: titleId });
    await this.sleep(400);
    this.config.title = titleId;
    log.success(`-> Đã chọn danh hiệu [${titleId}] thành công!`);
  }

  async setLook(options = {}) {
    this.checkAborted();
    const currentLook = {
      name: options.name || this.config.name,
      kind: options.kind || this.config.kind || 'tieu',
      robe: options.robe || this.config.robe || 'nau',
      skin: options.skin || this.config.skin || 'dong',
      bio: options.bio !== undefined ? options.bio : (this.config.bio || 'Nam Mô A Di Đà Phật'),
      beads: options.beads || this.config.beads || 'go',
      cushion: options.cushion || this.config.cushion || 'xam',
      phapkhi: options.phapkhi !== undefined ? options.phapkhi : (this.config.phapkhi || null)
    };

    log.temple('🥼', 'Cập nhật diện mạo & trang bị bộ sưu tập:');
    if (options.name) log.info(`  • Tên/Pháp danh: ${options.name}`);
    if (options.robe) log.info(`  • Áo: ${ROBES_CATALOG[options.robe]?.name || options.robe}`);
    if (options.beads) log.info(`  • Tràng hạt: ${BEADS_CATALOG[options.beads]?.name || options.beads}`);
    if (options.cushion) log.info(`  • Bồ đoàn: ${CUSHIONS_CATALOG[options.cushion]?.name || options.cushion}`);
    if (options.phapkhi !== undefined) log.info(`  • Pháp khí: ${PHAPKHI_CATALOG[options.phapkhi]?.name || options.phapkhi || 'Cất pháp khí'}`);
    if (options.bio) log.info(`  • Tâm niệm/Bio: "${options.bio}"`);

    this.send({
      t: 'look',
      name: currentLook.name,
      kind: currentLook.kind,
      robe: currentLook.robe,
      skin: currentLook.skin,
      bio: currentLook.bio,
      beads: currentLook.beads,
      cushion: currentLook.cushion,
      phapkhi: currentLook.phapkhi === 'none' ? null : currentLook.phapkhi
    });

    Object.assign(this.config, currentLook);
    await this.sleep(400);
    log.success('-> Đã cập nhật diện mạo & trang bị thành công!');
  }

  async doKhoe() {
    this.checkAborted();
    log.temple('📢', 'Khoe thành tích tu tập lên kênh chung của chùa...');
    this.send({ t: 'khoe' });
    await this.sleep(400);
    log.success('-> Đã gửi thông báo khoe thành tích!');
  }

  async doChoosePet(kind, name) {
    this.checkAborted();
    log.temple('🐾', `Nhận nuôi linh thú chùa [${kind}] với tên "${name}"...`);
    this.send({ t: 'pet-choose', k: kind, n: name });
    await this.sleep(500);
    log.success(`-> Đã gửi yêu cầu nhận nuôi linh thú ${kind}!`);
  }

  async doChores() {
    this.checkAborted();
    log.temple('🧹', 'Làm việc chùa / Công quả tích phúc:');
    await this.doQuetLa();

    this.checkAborted();
    await this.humanDelay('thong thả bước ra cầu hồ sen');
    log.info('-> Phóng sinh / Cho đàn cá ở hồ sen ăn...');
    this.send({ t: 'viec', k: 'ca' });
    await this.sleep(400);

    this.checkAborted();
    await this.humanDelay('bước vào chánh điện châm dầu đèn');
    log.info('-> Thắp đèn dầu chánh điện...');
    this.send({ t: 'lamp' });
    await this.sleep(400);
  }

  async doPet() {
    this.checkAborted();
    log.temple('🐱', 'Chăm sóc thú cưng chùa:');
    await this.humanDelay('tìm chú mèo chùa đang nằm sưởi nắng');
    this.checkAborted();
    log.info('-> Cho mèo ăn bánh...');
    this.send({ t: 'pet-feed' });
    await this.sleep(400);

    this.checkAborted();
    await this.humanDelay('nhẹ nhàng xoa đầu vuốt ve mèo');
    this.checkAborted();
    log.info('-> Xoa đầu mèo...');
    this.send({ t: 'pet-pat' });
    await this.sleep(400);
  }

  async doGarden(options = {}) {
    this.checkAborted();
    const plantSeed = options.plantSeed || 'sen';
    const autoWaterOthers = options.autoWaterOthers ?? this.config.autoWaterOthers ?? true;
    const maxWaterOthers = options.maxWaterOthers ?? this.config.maxWaterOthers ?? 50;

    log.temple('🪷', 'Chăm sóc vườn hoa chùa & tưới nước tích công đức:');
    await this.humanDelay('thong thả dạo bước ra góc vườn hoa');
    this.checkAborted();

    // 1. Lấy dữ liệu vườn hoa hiện tại từ máy chủ
    this.garden = null;
    this.send({ t: 'garden' });
    let waitCount = 0;
    while (!this.garden && waitCount < 15) {
      this.checkAborted();
      await this.sleep(200);
      waitCount++;
    }

    if (!this.garden) {
      log.warn('Không nhận được dữ liệu vườn hoa từ máy chủ, gửi lệnh tưới thông thường.');
      this.checkAborted();
      this.send({ t: 'water', pid: this.myPid });
      await this.sleep(500);
      return;
    }

    const mine = this.garden.mine;

    // 2. Chăm sóc luống hoa của bản thân
    if (!mine) {
      this.checkAborted();
      log.temple('🌱', `Luống hoa của bạn đang trống. Tiến hành gieo hạt giống [${plantSeed}]...`);
      this.send({ t: 'plant', k: plantSeed });
      await this.sleep(600);
    } else {
      // Nếu hoa đã nở (stage === 3) -> hái hoa và dâng Chánh điện
      if (mine.stage === 3) {
        this.checkAborted();
        log.temple('🌸', `Hoa [${mine.k}] trong luống của bạn đã nở trọn vẹn! Tiến hành hái hoa...`);
        this.send({ t: 'pick' });
        await this.sleep(600);
        this.checkAborted();
        log.temple('💐', 'Thành tâm dâng hoa tươi lên Phật đài Chánh điện (+công đức dâng hoa)...');
        this.send({ t: 'offer-flowers' });
        await this.sleep(600);
        // Gieo tiếp hạt giống mới
        this.checkAborted();
        log.temple('🌱', `Gieo tiếp đợt hạt giống mới [${plantSeed}]...`);
        this.send({ t: 'plant', k: plantSeed });
        await this.sleep(600);
      }

      // Tưới luống hoa của mình nếu chưa tưới
      if (!mine.watered) {
        this.checkAborted();
        log.info('-> Múc gáo nước mát tưới luống hoa của bản thân...');
        this.send({ t: 'water', pid: this.myPid });
        await this.sleep(600);
      } else {
        log.info(`-> Luống hoa của bạn hôm nay đã được tưới (${mine.grown}/${mine.need} ngày lớn).`);
      }
    }

    // Kiểm tra nếu trong tay còn hoa đã hái mà chưa dâng
    const flowersInHand = Object.values(this.garden.flowers || {}).reduce((a, b) => a + (b || 0), 0);
    if (flowersInHand > 0) {
      this.checkAborted();
      log.temple('💐', `Phát hiện ${flowersInHand} bông hoa tươi trong tay, tiến hành dâng hoa lên Phật đài...`);
      this.send({ t: 'offer-flowers' });
      await this.sleep(600);
    }

    // 3. TỰ ĐỘNG TƯỚI NƯỚC GIÚP BẠN ĐỒNG TU (+2 CÔNG ĐỨC MỖI LUỐNG)
    if (autoWaterOthers) {
      const unwateredBeds = (this.garden.beds || []).filter(
        b => b.pid !== this.myPid && !b.watered && (b.stage === undefined || b.stage < 3)
      );

      if (unwateredBeds.length > 0) {
        const toWater = unwateredBeds.slice(0, maxWaterOthers);
        log.temple('💧', `Phát hiện ${toWater.length} luống hoa của bạn đồng tu chưa được tưới nước. Bắt đầu tưới giúp (+2 công đức/luống)...`);

        for (let i = 0; i < toWater.length; i++) {
          this.checkAborted();
          const bed = toWater[i];
          const bedOwner = bed.name || bed.pid;
          log.info(`[${i + 1}/${toWater.length}] Tưới nước giúp luống hoa của [${bedOwner}]...`);
          this.send({ t: 'water', pid: bed.pid });
          const waterDelay = Math.floor(350 + Math.random() * 150);
          await this.sleep(waterDelay);
        }
        log.success(`Đã tưới nước giúp ${toWater.length} luống hoa! Tích lũy thêm ước tính +${toWater.length * 2} công đức.`);
      } else {
        log.info('Tất cả các luống hoa của bạn đồng tu hôm nay đều đã được tưới đủ nước.');
      }
    }
  }

  async doMo(count = 30) {
    this.checkAborted();
    log.temple('🪵', `Bắt đầu gõ mõ tụng kinh (${count} tiếng - tốc độ tối ưu)...`);
    // Đảm bảo đứng tại Chánh điện để máy chủ ghi nhận nhiệm vụ gõ mõ tụng kinh (tung)
    this.send({ t: 'visit', zone: 'Chánh điện' });
    await this.sleep(300);
    let sent = 0;
    while (sent < count) {
      this.checkAborted();
      const batch = Math.min(10, count - sent);
      this.send({ t: 'mo', n: batch });
      sent += batch;
      log.info(`...cốc cốc [${sent}/${count} tiếng mõ]`);
      if (sent < count) {
        await this.sleep(800);
      }
    }
    log.info(`Đã hoàn tất gửi ${count} tiếng mõ tụng kinh (chờ máy chủ ghi nhận).`);
  }

  async doBeads(count = 108) {
    this.checkAborted();
    const roundsTarget = (count / 108).toFixed(1);
    log.temple('📿', `Bắt đầu lần tràng hạt niệm Phật (${count} hạt ~ ${roundsTarget} chuỗi)...`);
    this.send({ t: 'emote', e: 'chuoi' });
    // Máy chủ didenchua giới hạn tốc độ nhận hạt bằng cơ chế Token Bucket (~5.3 hạt/giây).
    // Gửi 9 hạt/gói cách nhau 1.750ms đảm bảo máy chủ ghi nhận 100% không bị rơi rụng
    const batchSize = 9;
    const intervalMs = 1750;
    let sent = 0;
    let lastEmoteTime = Date.now();
    while (sent < count) {
      this.checkAborted();
      const batch = Math.min(batchSize, count - sent);
      this.send({ t: 'beads', n: batch });
      sent += batch;
      const curRounds = (sent / 108).toFixed(1);
      log.info(`...Nam Mô A Di Đà Phật [${sent}/${count} hạt] (~${curRounds} chuỗi)`);
      if (Date.now() - lastEmoteTime >= 4000) {
        this.send({ t: 'emote', e: 'chuoi' });
        lastEmoteTime = Date.now();
      }
      if (sent < count) {
        await this.sleep(intervalMs);
      }
    }
    await this.sleep(1000);
    await this.fetchJournal();
    if (this.journal) {
      const totalRounds = this.journal.rounds || Math.floor((this.journal.beads || 0) / 108);
      const isTramChuoi = this.journal.titles?.some(t => t.id === 'tram-chuoi' && t.got);
      log.success(`Máy chủ đã ghi nhận: ${this.journal.beads} hạt (${totalRounds}/100 chuỗi ${isTramChuoi || totalRounds >= 100 ? '🏆 Đạt danh hiệu Trăm chuỗi hạt!' : `còn ${100 - totalRounds} chuỗi`}).`);
    }
  }

  async doBell(count = 1) {
    this.checkAborted();
    log.temple('🔔', `Thỉnh chuông Bát Nhã tại Gác chuông (${count} tiếng)...`);
    await this.humanDelay('khoan thai bước lên bậc thềm Gác chuông');
    this.checkAborted();

    // 1. Đến khu vực Gác chuông (tọa độ L8 của game)
    this.send({ t: 'visit', zone: 'Gác chuông' });
    this.send({
      t: 'state',
      x: -12.8,
      y: 0.5,
      z: 52.0,
      ry: -1.57,
      s: 0
    });
    await this.sleep(400);

    // 2. Thỉnh từng tiếng chuông ngân vang
    const total = Math.max(1, count);
    for (let i = 1; i <= total; i++) {
      this.checkAborted();
      this.send({ t: 'bell' });
      log.info(`-> Thỉnh tiếng chuông [${i}/${total}]... (Nguyện tiếng chuông này vang khắp pháp giới)`);
      if (i < total) {
        await this.sleep(1800);
      }
    }

    // 3. Tự động nhận thưởng nhiệm vụ ngày thỉnh chuông
    await this.sleep(400);
    this.claimQuest('chuong');
  }

  async doXam() {
    this.checkAborted();
    log.temple('📜', 'Gieo quẻ xăm may mắn đầu ngày (+công đức quẻ xăm)…');
    await this.humanDelay('thành tâm lắc ống xăm');
    this.checkAborted();
    const randomXam = Math.floor(Math.random() * 100) + 1;
    this.send({ t: 'xam', n: randomXam });
    log.info(`-> Đã gieo quẻ xăm số [${randomXam}] cầu bình an cát tường.`);
    this.claimQuest('xam');
    await this.sleep(500);
  }

  async doEnterAm() {
    this.checkAborted();
    log.temple('🛖', 'Bước vào Am riêng tu tập (không gian thanh tịnh riêng tư)...');
    await this.humanDelay('khoan thai bước qua cổng Am riêng');
    this.checkAborted();

    this.send({ t: 'visit', zone: 'Am riêng' });
    this.send({ t: 'am' });
    await this.sleep(400);
    this.send({ t: 'am-in' });
    this.inAm = true;
    await this.sleep(500);

    // Tự động nhận thưởng nhiệm vụ tuần vào am riêng nếu có
    this.claimQuest('wAm');
    log.success('-> Đã an tọa trong Am riêng tu tập (Am của bạn · chỉ mình bạn ở đây).');
  }

  async doAmIncense() {
    this.checkAborted();
    log.temple('🕯️', 'Dâng ba nén hương trầm trên bàn thờ trong Am riêng...');
    await this.humanDelay('thành tâm châm hương trước ban thờ');
    this.checkAborted();
    this.send({ t: 'am-incense' });
    await this.sleep(600);
    log.success('-> Đã dâng ba nén hương trong Am riêng!');
  }

  async doAmSet(slot, item) {
    this.checkAborted();
    log.temple('🎨', `Bày trí Am riêng: Đặt món [${item || 'để trống'}] vào vị trí [${slot}]...`);
    this.send({ t: 'am-set', slot, item: item || '' });
    await this.sleep(400);
    log.success(`-> Đã lưu bài trí Am riêng cho vị trí [${slot}]!`);
  }

  async doLeaveAm() {
    this.checkAborted();
    log.temple('🚪', 'Rời khỏi Am riêng, trở lại sân chùa...');
    this.send({ t: 'am-out' });
    this.inAm = false;
    await this.sleep(400);
    log.success('-> Đã trở lại khuôn viên chùa.');
  }

  async doEnterPhapDuong() {
    this.checkAborted();
    log.temple('🏛️', 'Bước vào Pháp đường tu tập (giảng đường Phật pháp)...');
    await this.humanDelay('khoan thai bước qua cửa Pháp đường');
    this.checkAborted();

    this.send({ t: 'visit', zone: 'Pháp đường' });
    await this.sleep(300);
    this.send({ t: 'phap-in' });
    this.inPhapDuong = true;
    await this.sleep(500);
    log.success('-> Đã vào Pháp đường (Xin giữ im lặng · an tọa lắng nghe giáo lý hoặc tĩnh tâm).');
  }

  async doLeavePhapDuong() {
    this.checkAborted();
    log.temple('🚪', 'Rời Pháp đường, trở về khuôn viên chùa...');
    this.send({ t: 'phap-out' });
    this.inPhapDuong = false;
    await this.sleep(400);
    log.success('-> Đã trở lại sân chùa.');
  }

  async doVow(text = 'Cầu cho muôn người bình an, thân tâm thường an lạc, vạn sự hanh thông') {
    this.checkAborted();
    log.temple('🙏', `Gửi một lời nguyện chung tới cả chùa: "${text}"…`);
    await this.humanDelay('thành tâm hướng về Tam Bảo gửi lời nguyện');
    this.checkAborted();
    this.send({ t: 'vow', text });
    log.info('-> Đã gửi lời nguyện chung tới cả chùa (hoàn thành nhiệm vụ lời nguyện).');
    await this.sleep(500);
  }

  async doQaIncense() {
    this.checkAborted();
    log.temple('🪔', 'Dâng hương tại đài Quan Thế Âm Bồ Tát…');
    await this.humanDelay('tiến lại gần tôn tượng Bồ Tát Quan Âm');
    this.checkAborted();
    this.send({ t: 'qa-incense' });
    log.info('-> Đã gửi yêu cầu dâng nén tâm hương cúng dường Bồ Tát Quan Âm.');
    await this.sleep(500);
  }

  async doTuyHy(maxCount = 5) {
    this.checkAborted();
    if (!this.lanterns || this.lanterns.length === 0) return;
    log.temple('🏮', 'Tùy hỷ công đức hoa đăng của bạn đồng tu trên hồ sen…');
    await this.humanDelay('ngắm những ngọn hoa đăng lung linh trên mặt hồ');
    const toTuyhy = this.lanterns.slice(0, maxCount);
    for (const lantern of toTuyhy) {
      this.checkAborted();
      this.send({ t: 'tuyhy', lantern: lantern.id });
      log.info(`-> Tùy hỷ hoa đăng: "${lantern.text}"`);
      await this.sleep(400);
    }
  }

  async doXinChu(wishId = null) {
    this.checkAborted();
    const targetWish = wishId || this.config.calligraphyWish || 'binh-an';
    const wordInfo = CALLIGRAPHY_WORDS.find(w => w.id === targetWish) || { text: targetWish, wish: '' };
    log.temple('✍️', `Bắt đầu xin chữ Thầy đồ: Chữ "${wordInfo.text}" (${wordInfo.wish || targetWish})…`);
    await this.humanDelay('bước đến lều Thầy đồ');
    this.checkAborted();
    // Bắt buộc phải viếng thăm lều Thầy đồ để máy chủ ghi nhận nhiệm vụ chu
    this.send({ t: 'visit', zone: 'Thầy đồ' });
    await this.sleep(500);
    this.send({ t: 'chu-list' });
    await this.sleep(500);
    this.send({ t: 'chu-xin', chu: targetWish });
    await this.sleep(800);
    this.send({ t: 'chu-dem', k: 'mo' });
    this.send({ t: 'chu-dem', k: 'vao' });
    this.send({ t: 'chu-giu', chu: targetWish });
    // Nếu hôm nay đã từng xin chữ này rồi mà quest chưa ghi nhận, gửi thêm chữ khác dạng lưu tủ để server kích hoạt hoàn tất quest chu
    const altWish = targetWish === 'binh-an' ? 'an-khang' : 'binh-an';
    this.send({ t: 'chu-giu', chu: altWish });
    this.claimQuest('chu');
    log.info(`-> Đã xin chữ "${wordInfo.text}" từ Thầy đồ và cất vào Tủ chữ.`);
    if (wordInfo.meaning) {
      log.temple('📜', `Ý nghĩa chữ [${wordInfo.text}]: "${wordInfo.meaning}"`);
    }
    await this.sleep(500);
  }

  async doMeditate(seconds = 3600, onProgress = null) {
    this.checkAborted();
    const mins = Math.ceil(seconds / 60);
    log.temple('🧘', `Bắt đầu ngồi thiền tĩnh tâm trong ${mins} phút (${seconds}s)...`);

    // 1. Chuyển đến Chánh điện (khu vực thiền định & tĩnh tâm chính thức của chùa)
    this.send({ t: 'visit', zone: 'Chánh điện' });
    await this.sleep(600);
    this.checkAborted();

    // 2. Chọn bồ đoàn còn trống theo tọa độ chuẩn xác của Chánh điện
    const taken = this.takenSeats || new Set();
    const availableSeat = CHANH_DIEN_SEATS.find(s => !taken.has(s.id)) || CHANH_DIEN_SEATS[0];

    log.info(`-> Tọa thiền tại bồ đoàn Chánh điện [${availableSeat.id}] (tọa độ x: ${availableSeat.x}, z: ${availableSeat.z})...`);
    
    // Gửi trạng thái ngồi thiền chính thức với tọa độ bồ đoàn chuẩn xác
    const sitPayload = {
      t: 'state',
      x: availableSeat.x,
      y: availableSeat.y,
      z: availableSeat.z,
      ry: availableSeat.ry,
      s: 2,
      seat: availableSeat.id
    };
    this.send(sitPayload);

    const start = Date.now();
    let elapsed = 0;
    let lastHeartbeat = Date.now();
    let lastStatePing = Date.now();

    while (elapsed < seconds) {
      this.checkAborted();

      // Kiểm tra và tự động phục hồi kết nối nếu mạng gián đoạn
      if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
        log.warn(`Phát hiện mất kết nối với chùa tại giây ${elapsed}. Đang tự động kết nối lại...`);
        try {
          await this.connect(8000);
          this.send({ t: 'visit', zone: 'Chánh điện' });
          await this.sleep(400);
          this.send(sitPayload);
          lastHeartbeat = Date.now();
          lastStatePing = Date.now();
          log.success(`Đã kết nối lại thành công! Tiếp tục duy trì thiền định (đã ngồi ${Math.floor(elapsed / 60)} phút).`);
        } catch (reconnErr) {
          log.warn(`Chưa kết nối lại được (${reconnErr.message}), thử lại sau 2 giây...`);
          await this.sleep(2000);
          continue;
        }
      }

      await this.sleep(1000);
      const now = Date.now();
      elapsed = Math.floor((now - start) / 1000);
      const remain = Math.max(0, seconds - elapsed);

      // Gửi tọa độ ngồi mỗi 2 giây chuẩn xác như game client trình duyệt (main.js)
      if (now - lastStatePing >= 2000) {
        this.send(sitPayload);
        lastStatePing = now;
      }

      // Gửi heartbeat định kỳ 16 giây để giữ kết nối an toàn tuyệt đối
      if (now - lastHeartbeat >= 16000) {
        this.send({ t: 'hb' });
        lastHeartbeat = now;
      }

      if (onProgress) {
        onProgress(elapsed, seconds);
      } else if (elapsed % 30 === 0 || remain === 0) {
        log.info(`Thiền định: Đã ngồi ${Math.floor(elapsed / 60)}p${elapsed % 60}s / ${mins} phút (còn ${remain}s)`);
      }
    }

    this.checkAborted();
    log.info(`Đã hoàn thành ${mins} phút tĩnh tâm thiền định. Đứng dậy và gửi yêu cầu nhận thưởng...`);
    // Gửi trạng thái đứng dậy
    this.send({
      t: 'state',
      x: availableSeat.x,
      y: 2.4,
      z: availableSeat.z,
      ry: availableSeat.ry,
      s: 0
    });
    await this.sleep(600);

    const activeNgoi = (this.merit?.me?.quests || []).find(q => q.id === 'ngoi' || q.id.startsWith('ngoi'));
    this.send({ t: 'claim', q: activeNgoi ? activeNgoi.id : 'ngoi' });
    this.send({ t: 'claim', q: 'wNgoi' });
    await this.sleep(800);
    await this.fetchJournal();
    if (this.journal) {
      log.success(`Máy chủ đã ghi nhận: ${this.journal.sitMin} phút ngồi tĩnh tâm (${this.journal.sitMin >= 60 ? '🏆 Đạt mốc Tĩnh tọa' : `còn ${60 - this.journal.sitMin} phút`}).`);
    }
    return {
      verified: true,
      sitMin: this.journal?.sitMin || null
    };
  }

  claimQuest(questId) {
    this.send({ t: 'claim', q: questId });
  }

  async claimAllQuests() {
    if (!this.merit?.me) return { claimed: [], unverified: [] };
    const allGroups = [
      ...(this.merit.me.quests || []),
      ...(this.merit.me.weekly || []),
      ...(this.merit.me.newbie || [])
    ];
    const toClaim = allGroups.filter(q => q.have >= q.need && !q.claimed);

    if (toClaim.length === 0) {
      log.info('Không có nhiệm vụ nào đang chờ nhận thưởng.');
      return { claimed: [], unverified: [] };
    }

    const claimed = [];
    const unverified = [];

    for (const q of toClaim) {
      log.info(`-> Gửi yêu cầu nhận thưởng: "${q.title}" (+${q.reward} công đức)...`);
      this.send({ t: 'claim', q: q.id });
      await this.sleep(700);
    }

    // Chờ máy chủ cập nhật gói merit mới (tối đa 2.5s)
    let waitCount = 0;
    while (waitCount < 5) {
      await this.sleep(500);
      waitCount++;
    }

    const updatedGroups = [
      ...(this.merit?.me?.quests || []),
      ...(this.merit?.me?.weekly || []),
      ...(this.merit?.me?.newbie || [])
    ];
    for (const q of toClaim) {
      const current = updatedGroups.find(item => item.id === q.id);
      if (current && current.claimed) {
        log.merit(`[ĐÃ XÁC NHẬN] Máy chủ đã ghi nhận thưởng nhiệm vụ: "${q.title}" (+${q.reward} công đức)`);
        claimed.push(q);
      } else {
        log.warn(`[CHƯA XÁC MINH] Nhiệm vụ "${q.title}" đã gửi yêu cầu nhận thưởng nhưng chưa nhận được xác nhận từ máy chủ.`);
        unverified.push(q);
      }
    }

    // Kiểm tra nhiệm vụ chuỗi mở khóa sau đợt nhận thưởng (như 'tron', 'wTron', 'nm')
    const finalGroups = [
      ...(this.merit?.me?.quests || []),
      ...(this.merit?.me?.weekly || []),
      ...(this.merit?.me?.newbie || [])
    ];
    const chainedToClaim = finalGroups.filter(q => q.have >= q.need && !q.claimed);
    for (const q of chainedToClaim) {
      log.info(`-> Gửi yêu cầu nhận thưởng chuỗi nhiệm vụ: "${q.title}" (+${q.reward} công đức)...`);
      this.send({ t: 'claim', q: q.id });
      await this.sleep(700);
      claimed.push(q);
    }

    return { claimed, unverified };
  }

  printStatus() {
    if (!this.merit?.me) {
      log.warn('Chưa có thông tin công đức từ máy chủ.');
      return;
    }
    const me = this.merit.me;
    console.log('\n===============================================');
    console.log(`🪷  THÔNG TIN CÔNG ĐỨC - ${this.config.name}`);
    console.log('===============================================');
    console.log(`• Cấp bậc tu tập : ${me.level} (Lv.${me.lv})`);
    console.log(`• Tổng công đức  : ${me.total}`);
    console.log(`• Công đức hôm nay: ${me.today}`);
    console.log(`• Số ngày lên chùa: ${me.days} ngày`);
    console.log(`• Cần tới cấp sau : ${me.next - me.total} công đức`);
    console.log('-----------------------------------------------');
    console.log('📋  DANH SÁCH NHIỆM VỤ HÀNG NGÀY:');
    if (Array.isArray(me.quests)) {
      for (const q of me.quests) {
        const status = q.claimed ? '✅ Đã nhận quà' : (q.have >= q.need ? '🎁 Chờ nhận thưởng' : `⏳ ${q.have}/${q.need}`);
        console.log(`  [${status}] ${q.title} (+${q.reward} điểm)`);
      }
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
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.connected = false;
  }
}
