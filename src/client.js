import { log } from './logger.js';
import { loadConfig } from '../config.js';

const WS_URL = 'wss://didenchua.online/ws';

export class DiDenChuaClient {
  constructor(customConfig = {}) {
    this.config = { ...loadConfig(), ...customConfig };
    this.ws = null;
    this.connected = false;
    this.myId = null;
    this.myPid = null;
    this.room = this.config.room || 'chua-1';
    this.peers = new Map();
    this.merit = null;
    this.checkinInfo = null;
    this.chores = null;
    this.lanterns = [];
    this.journal = null;
    this.heartbeatTimer = null;
  }

  async connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.connected) {
          this.close();
          reject(new Error(`Quá thời gian kết nối đến chùa (${timeoutMs}ms)`));
        }
      }, timeoutMs);

      try {
        this.ws = new WebSocket(WS_URL);
      } catch (err) {
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

        // Bật heartbeat định kỳ 20 giây
        this.heartbeatTimer = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ t: 'hb' }));
          }
        }, 20000);
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
          clearTimeout(timer);
          resolve(this);
        }
      };

      this.ws.onerror = (err) => {
        log.error('Lỗi WebSocket:', err?.message || err);
      };

      this.ws.onclose = () => {
        this.connected = false;
        clearInterval(this.heartbeatTimer);
      };
    });
  }

  handleMessage(msg) {
    switch (msg.t) {
      case 'welcome':
        this.myId = msg.id;
        this.myPid = msg.pid;
        this.room = msg.room;
        this.chores = msg.chores;
        this.lanterns = Array.isArray(msg.lanterns) ? msg.lanterns : [];
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
        break;

      case 'merit':
        this.merit = msg;
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

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  async sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  async humanDelay(reason = 'khoan thai chuyển bước') {
    if (!this.config.safeMode) {
      await this.sleep(1000);
      return;
    }
    const min = (this.config.minDelaySec || 3.5) * 1000;
    const max = (this.config.maxDelaySec || 7.0) * 1000;
    const delay = Math.floor(min + Math.random() * (max - min));
    log.info(`⏳ ${reason} (chờ ${(delay / 1000).toFixed(1)}s tránh server chặn)...`);
    await this.sleep(delay);
  }

  // --- CÁC HÀNH ĐỘNG CỤ THỂ ---

  async doCheckin() {
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
    log.temple('🪔', `Bắt đầu dâng hương (${count} nén)…`);
    for (let i = 1; i <= count; i++) {
      if (i > 1) {
        await this.humanDelay(`thành tâm dâng nén hương tiếp theo (nén ${i}/${count})`);
      } else {
        await this.humanDelay('chậm rãi bước đến lư hương chánh điện');
      }
      log.info(`[${i}/${count}] -> Thắp nén tâm hương thành kính...`);
      this.send({ t: 'incense' });
      await this.humanDelay('thành tâm chấp tay khấn nguyện');
      this.claimQuest('huong');
      await this.sleep(1000);
    }
    log.success(`Đã hoàn thành dâng ${count} nén tâm hương!`);
  }

  async doLantern(text = 'Cầu cho muôn người bình an, vạn sự hanh thông', color = 'vang', count = 1) {
    log.temple('🏮', `Bắt đầu thả hoa đăng sen (${count} ngọn)…`);
    for (let i = 1; i <= count; i++) {
      if (i > 1) {
        await this.humanDelay(`thắp ngọn hoa đăng tiếp theo (ngọn ${i}/${count})`);
      } else {
        await this.humanDelay('thong thả đi dạo ra bến hồ thả đăng');
      }
      log.info(`[${i}/${count}] -> Thả ngọn hoa đăng sen màu [${color}]: "${text}"`);
      this.send({ t: 'lantern', color, text });
      await this.humanDelay('dõi theo ngọn hoa đăng trôi theo làn nước');
      this.claimQuest('den');
      await this.sleep(1000);
    }
    log.success(`Đã hoàn thành thả ${count} ngọn hoa đăng sen!`);
  }

  async doGreet(targetPeerId = null) {
    let target = targetPeerId;
    if (!target && this.peers.size > 0) {
      target = Array.from(this.peers.keys())[0];
    }
    if (target) {
      await this.humanDelay('tiến lại gần chào hỏi bạn đồng tu');
      const peer = this.peers.get(target);
      const name = peer ? peer.name : `#${target}`;
      log.temple('🙏', `Chắp tay chào phật tử [${name}]…`);
      this.send({ t: 'greet', to: target });
      this.send({ t: 'emote', e: 'chap' });
      await this.humanDelay('cung kính cúi đầu');
      this.claimQuest('chao');
      await this.sleep(1000);
    } else {
      log.warn('Không tìm thấy ai trong phòng để chắp tay chào.');
    }
  }

  async doQuetLa(count = 1) {
    log.temple('🧹', `Bắt đầu công quả quét lá sân chùa (${count} lần)…`);
    for (let i = 1; i <= count; i++) {
      if (i > 1) {
        await this.humanDelay(`thong thả chuyển sang góc sân khác quét tiếp (lần ${i}/${count})`);
      } else {
        await this.humanDelay('cầm chổi bước ra sân chùa');
      }
      log.info(`[${i}/${count}] -> Gió thổi lá bay, chổi quét sạch bong (động tác quét lá)...`);
      this.send({ t: 'emote', e: 'quet' });
      await this.humanDelay(`chăm chỉ gom từng đám lá rụng quanh sân [lần ${i}/${count}]`);
      this.send({ t: 'viec', k: 'quet' });
      await this.sleep(1000);
    }
    log.success(`Sân chùa sạch bong rồi! Đã hoàn thành ${count} lần quét lá sân chùa.`);
  }

  async doLay(count = 108) {
    log.temple('🙏', `Bắt đầu lạy Phật sám hối (${count} lạy trang nghiêm)…`);
    for (let i = 1; i <= count; i++) {
      log.info(`...[${i}/${count} lạy] Thành kính cúi lạy Phật đài...`);
      this.send({ t: 'emote', e: 'lay' });
      if (i < count) {
        const bowDelay = Math.floor(3500 + Math.random() * 2000);
        await this.sleep(bowDelay);
      }
    }
    log.success(`Đã hoàn thành ${count} lạy trang nghiêm trước Phật đài!`);
  }

  async doVisitAll() {
    const zones = [
      'Chánh điện', 'Bảo tháp', 'Giếng Ngọc', 'Tượng Di Lặc',
      'Hồ sen · Cầu Duyên', 'Vườn Linh Thú', 'Vườn hoa', 'Vườn thiền',
      'Hành lang', 'Sân chùa'
    ];
    log.temple('🚶', `Bắt đầu đi thăm khắp ${zones.length} khu vực trong chùa (cày danh hiệu "Thăm khắp chùa")…`);
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      await this.humanDelay(`thong thả bước chân sang khu [${z}] (${i + 1}/${zones.length})`);
      this.send({ t: 'visit', zone: z });
      log.info(`-> Đã viếng thăm: [${z}]`);
      await this.sleep(1000);
    }
    log.success('Đã đi thăm trọn vẹn 10 khu vực trong chùa!');
  }

  async fetchJournal() {
    this.journal = null;
    this.send({ t: 'journal' });
    let count = 0;
    while (!this.journal && count < 25) {
      await this.sleep(200);
      count++;
    }
    return this.journal;
  }

  printJournal() {
    if (!this.journal) {
      log.warn('Chưa có dữ liệu danh hiệu / thành tựu.');
      return;
    }
    const j = this.journal;
    console.log('\n===============================================');
    console.log(`📜  BẢNG TIẾN ĐỘ THÀNH TỰU & DANH HIỆU CHÙA`);
    console.log('===============================================');
    console.log(`• Tên & Tài khoản : ${j.name} (@${j.user})`);
    console.log(`• Cấp bậc tu tập  : ${j.level} (Lv.${j.lv})`);
    console.log(`• Tổng công đức   : ${j.merit} / ${j.next} điểm`);
    console.log(`• Chuỗi ngày lên chùa: ${j.streak} ngày liên tục (kỷ lục: ${j.best})`);
    console.log('-----------------------------------------------');
    console.log('🎯  TIẾN ĐỘ ĐẠT SỐ LƯỢNG (MILESTONES):');
    console.log(`  🙏 Lạy Phật         : ${j.bows} / 108 lạy  (Trăm lạy: ${j.bows >= 108 ? '✅ Đã đạt' : `còn thiếu ${108 - j.bows} lạy`})`);
    console.log(`  📿 Lăn tràng hạt     : ${j.beads} hạt (đã xong ${j.rounds} chuỗi tròn 108 hạt)`);
    console.log(`  🪔 Dâng hương       : ${j.incense} / 30 lần (Hương trầm: ${j.incense >= 30 ? '✅ Đã đạt' : `còn thiếu ${30 - j.incense} lần`})`);
    console.log(`  🏮 Thả hoa đăng     : ${j.lanterns} / 10 ngọn (Người thả đèn: ${j.lanterns >= 10 ? '✅ Đã đạt' : `còn thiếu ${10 - j.lanterns} ngọn`})`);
    console.log(`  🧘 Ngồi tĩnh tâm    : ${j.sitMin} / 60 phút (Tĩnh tọa: ${j.sitMin >= 60 ? '✅ Đã đạt' : `còn thiếu ${60 - j.sitMin} phút`})`);
    console.log(`  🚶 Khám phá chùa    : ${j.visited} / ${j.zones} khu vực (Thăm khắp chùa: ${j.visited >= j.zones ? '✅ Đã đạt' : `còn thiếu ${j.zones - j.visited} khu`})`);
    console.log('-----------------------------------------------');
    console.log('🏅  DANH HIỆU HIỆN CÓ & MỤC TIÊU:');
    if (Array.isArray(j.titles)) {
      for (const t of j.titles) {
        const badge = t.got ? '🏆 [ĐÃ ĐẠT]' : '🔒 [CHƯA ĐẠT]';
        console.log(`  ${badge} ${t.name}: ${t.desc}`);
      }
    }
    console.log('===============================================\n');
  }

  async doChores() {
    log.temple('🧹', 'Làm việc chùa / Công quả tích phúc (chế độ khoan thai):');
    await this.doQuetLa();

    await this.humanDelay('thong thả bước ra cầu hồ sen');
    log.info('-> Phóng sinh / Cho đàn cá ở hồ sen ăn...');
    this.send({ t: 'viec', k: 'ca' });

    await this.humanDelay('bước vào chánh điện châm dầu đèn');
    log.info('-> Thắp đèn dầu chánh điện...');
    this.send({ t: 'lamp' });
    await this.sleep(1000);
  }

  async doPet() {
    log.temple('🐱', 'Chăm sóc thú cưng chùa:');
    await this.humanDelay('tìm chú mèo chùa đang nằm sưởi nắng');
    log.info('-> Cho mèo ăn bánh...');
    this.send({ t: 'pet-feed' });

    await this.humanDelay('nhẹ nhàng xoa đầu vuốt ve mèo');
    log.info('-> Xoa đầu mèo...');
    this.send({ t: 'pet-pat' });
    await this.sleep(1000);
  }

  async doGarden() {
    log.temple('🪷', 'Chăm sóc vườn sen:');
    await this.humanDelay('múc gáo nước mát tưới sen');
    this.send({ t: 'garden' });
    await this.sleep(1500);
    this.send({ t: 'water', pid: this.myPid });
    await this.sleep(1000);
  }

  async doMo(count = 30) {
    log.temple('🪵', `Bắt đầu gõ mõ tụng kinh (${count} tiếng - tốc độ thong thả tự nhiên)...`);
    // Gõ mõ theo nhịp thong thả: mỗi nhịp 1-3 tiếng, giãn cách 2-4 giây
    let sent = 0;
    while (sent < count) {
      const batch = Math.min(Math.floor(2 + Math.random() * 2), count - sent);
      this.send({ t: 'mo', n: batch });
      sent += batch;
      log.info(`...cốc cốc [${sent}/${count} tiếng mõ]`);
      if (sent < count) {
        const knockDelay = Math.floor(2200 + Math.random() * 1500);
        await this.sleep(knockDelay);
      }
    }
    log.success(`Hoàn thành ${count} tiếng mõ tụng kinh!`);
  }

  async doBeads(count = 20) {
    log.temple('📿', `Lăn tràng hạt niệm Phật (${count} hạt - tốc độ trang nghiêm)...`);
    let sent = 0;
    while (sent < count) {
      const batch = Math.min(Math.floor(2 + Math.random() * 2), count - sent);
      this.send({ t: 'beads', n: batch });
      sent += batch;
      log.info(`...Nam Mô A Di Đà Phật [${sent}/${count} hạt]`);
      if (sent < count) {
        const beadDelay = Math.floor(1800 + Math.random() * 1200);
        await this.sleep(beadDelay);
      }
    }
    log.success(`Hoàn thành lăn ${count} hạt tràng niệm Phật!`);
  }

  async doBell() {
    await this.humanDelay('tiến đến giá chuông chánh điện');
    log.temple('🔔', 'Thỉnh một tiếng đại hồng chung ngân vang…');
    this.send({ t: 'bell' });
    await this.humanDelay('lắng lòng nghe tiếng chuông ngân');
  }

  async doMeditate(seconds = 300, onProgress = null) {
    const mins = Math.ceil(seconds / 60);
    log.temple('🧘', `Bắt đầu ngồi thiền tĩnh tâm trong ${mins} phút (${seconds}s)...`);
    
    // Gửi trạng thái ngồi thiền (s = 2)
    this.send({ t: 'state', s: 2, seat: 'thap-1' });

    const start = Date.now();
    let elapsed = 0;

    while (elapsed < seconds) {
      await this.sleep(5000);
      elapsed = Math.floor((Date.now() - start) / 1000);
      const remain = Math.max(0, seconds - elapsed);
      if (onProgress) {
        onProgress(elapsed, seconds);
      } else if (elapsed % 30 === 0 || remain === 0) {
        log.info(`Thiền định: Đã ngồi ${Math.floor(elapsed / 60)}p${elapsed % 60}s / ${mins} phút (còn ${remain}s)`);
      }
      // Giữ kết nối
      this.send({ t: 'hb' });
    }

    log.success('Đã hoàn thành 5 phút tĩnh tâm thiền định!');
    this.claimQuest('ngoi');
    await this.sleep(1000);
  }

  claimQuest(questId) {
    this.send({ t: 'claim', q: questId });
  }

  async claimAllQuests() {
    if (!this.merit?.me?.quests) return;
    const quests = this.merit.me.quests;
    let claimedCount = 0;
    for (const q of quests) {
      if (q.have >= q.need && !q.claimed) {
        log.merit(`Nhận thưởng nhiệm vụ: "${q.title}" (+${q.reward} công đức)`);
        this.claimQuest(q.id);
        claimedCount++;
        await this.sleep(600);
      }
    }
    if (claimedCount === 0) {
      log.info('Không có nhiệm vụ nào đang chờ nhận thưởng.');
    }
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
