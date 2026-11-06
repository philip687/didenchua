// Âm thanh tự tổng hợp bằng Web Audio: mõ, chuông, tiếng hạt, tiếng ngân.
import { local } from './api.js';
import { TempleMusic } from './music.js';

const rand = (a, b) => a + Math.random() * (b - a);

export const Sound = {
  ctx: null, master: null,
  enabled: local.get('sound', true),
  chanting: local.get('chant', true),
  voice: local.get('voice2', true),
  musicOn: local.get('music', true),
  tempo: local.get('tempo', 72),
  // âm lượng 0..1: tổng, nhịp mõ/chuông/nền, tiếng niệm, hiệu ứng
  vol: { master: 0.9, rhythm: 0.8, voice: 0.8, sfx: 0.8, music: 0.9, ...local.get('vol', {}) },
  active: false, // chỉ chạy nhịp mõ khi đang ở chánh điện
  beat: 0, nextBeat: 0, drone: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.vol.master : 0;
    this.master.connect(this.ctx.destination);
    this.bus = {};
    for (const k of ['rhythm', 'voice', 'sfx', 'music']) { this.bus[k] = this.ctx.createGain(); this.bus[k].gain.value = this.vol[k]; }
    this.bus.rhythm.connect(this.master); this.bus.sfx.connect(this.master); this.bus.music.connect(this.master);
    // vang chánh điện: impulse response tự sinh (đuôi ~3.5s)
    this.reverb = this.ctx.createConvolver();
    const len = this.ctx.sampleRate * 3.5, ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    this.reverb.buffer = ir;
    this.wet = this.ctx.createGain(); this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet).connect(this.master);
    const vDry = this.ctx.createGain(); vDry.gain.value = 0.6;
    this.bus.voice.connect(vDry).connect(this.master); this.bus.voice.connect(this.reverb);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = this.ctx.currentTime + 0.3;
    this.music = new TempleMusic(this.ctx, this.bus.music, this.reverb);
    if (this.musicWant) this.setTempleMusic(this.musicWant);
    setInterval(() => this.schedule(), 50);
    setInterval(() => this.music.schedule(this.ctx.currentTime + 2), 500); // thưa, xếp trước 2 giây để tab ẩn vẫn không đứt
  },
  get now() { return this.ctx ? this.ctx.currentTime : 0; },
  setEnabled(on) {
    this.enabled = on; local.set('sound', on);
    if (this.master) this.master.gain.setTargetAtTime(on ? this.vol.master : 0, this.ctx.currentTime, 0.05);
    this.refreshLoop();
  },
  setVolume(kind, v) {
    this.vol[kind] = v; local.set('vol', this.vol);
    if (!this.ctx) return;
    const node = kind === 'master' ? (this.enabled ? this.master : null) : this.bus[kind];
    node?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    if (this.recording) this.recording.volume = Math.min(1, 0.75 * this.vol.voice * this.vol.master);
  },
  setChanting(on) {
    this.chanting = on; local.set('chant', on);
    this.refreshLoop();
  },
  setActive(on) { this.active = on; this.refreshLoop(); },
  // đổi chùa thì đổi bản nhạc; trong chánh điện nhạc lùi xuống cho rõ tiếng mõ
  setTempleMusic(id) {
    this.musicWant = id;
    if (!this.music) return;
    if (!id || !this.musicOn) { this.music.stop(); return; }
    if (this.music.id !== id) { this.music.stop(0.8); this.music.start(id); }
    this.duckMusic();
  },
  setMusicOn(on) { this.musicOn = on; local.set('music', on); this.setTempleMusic(this.musicWant); },
  setOutdoors(on) { if (this.outdoors !== on) { this.outdoors = on; this.duckMusic(); } },
  duckMusic() { this.music?.setLevel(this.outdoors && this.active ? 1 : 0.55); }, // ngoài sân nghe rõ, trong điện và lúc hành trì lùi xuống
  refreshLoop() {
    if (!this.ctx) return;
    this.duckMusic();
    const on = this.chanting && this.active;
    if (on) { this.nextBeat = Math.max(this.nextBeat, this.ctx.currentTime + 0.2); if (!this.recording) this.startDrone(); }
    else this.stopDrone();
    if (this.recording) { if (on && this.voice && this.enabled) this.recording.play().catch(() => {}); else this.recording.pause(); }
  },
  env(g, t, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  },
  mok(t = this.now, vol = 0.5) {
    if (!this.ctx) return;
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(560, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    this.env(g, t, vol, 0.18);
    o.connect(g).connect(this.bus.rhythm); o.start(t); o.stop(t + 0.2);
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), gn = c.createGain();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 4;
    this.env(gn, t, vol * 0.5, 0.05);
    n.connect(bp).connect(gn).connect(this.bus.rhythm); n.start(t); n.stop(t + 0.06);
  },
  bell(t = this.now, base = 196, vol = 0.35, len = 6, out = this.bus?.sfx) {
    if (!this.ctx) return;
    [[1, 1], [2.0, 0.6], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]].forEach(([r, a], i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.value = base * r * (1 + (i ? rand(-0.003, 0.003) : 0));
      this.env(g, t, vol * a, len / (1 + i * 0.6));
      o.connect(g).connect(out || this.master); o.start(t); o.stop(t + len);
    });
  },
  bigBell() { this.bell(this.now + 0.05, 98, 0.5, 10); },
  click(t = this.now) {
    if (!this.ctx) return;
    const c = this.ctx;
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 6;
    this.env(g, t, 0.6, 0.04);
    n.connect(bp).connect(g).connect(this.bus.sfx); n.start(t); n.stop(t + 0.05);
    const o = c.createOscillator(), go = c.createGain();
    o.frequency.value = 1500;
    this.env(go, t, 0.15, 0.05);
    o.connect(go).connect(this.bus.sfx); o.start(t); o.stop(t + 0.06);
  },
  chime() { this.bell(this.now, 660, 0.12, 2.5); },
  success() { [0, 0.12, 0.24].forEach((d, i) => this.bell(this.now + d, [523, 659, 784][i], 0.12, 2)); },
  startDrone() {
    if (this.drone) return;
    const c = this.ctx, out = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 3;
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.045, c.currentTime, 1.5);
    const oscs = [98, 98.6, 147, 196.4].map((f) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return o; });
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.13; lg.gain.value = 180;
    lfo.connect(lg).connect(lp.frequency); lfo.start();
    lp.connect(out).connect(this.bus.rhythm);
    this.drone = { out, oscs: [...oscs, lfo] };
  },
  stopDrone() {
    if (!this.drone) return;
    const { out, oscs } = this.drone;
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => oscs.forEach((o) => o.stop()), 2000);
    this.drone = null;
  },
  schedule() {
    if (!this.chanting || !this.active || !this.ctx) return;
    const spb = 60 / this.tempo;
    if (this.nextBeat < this.ctx.currentTime - 1) this.nextBeat = this.ctx.currentTime + 0.1;
    while (this.nextBeat < this.ctx.currentTime + 0.15) {
      const t = this.nextBeat;
      this.mok(t, this.beat % 4 === 0 ? 0.45 : 0.32);
      if (this.beat % 32 === 0) this.bell(t, 174, 0.2, 7, this.bus.rhythm);
      if (this.voice && !this.recording && this.beat % 8 === 0) this.chantPhrase(t, spb);
      this.beat++;
      this.nextBeat += spb;
    }
  },
  /* ---------- Tiếng niệm đại chúng (tổng hợp formant) ----------
     Mỗi chữ một nhịp mõ: Nam – mô – A – Di – Đà – Phật, 3 giọng nam trầm hoà âm + vang. */
  VOWELS: { a: [730, 1090, 2440], o: [520, 840, 2410], i: [300, 2100, 2900], m: [280, 900, 2200] },
  PHRASE: [
    { v: 'a', n: 0, nasal: true }, { v: 'o', n: 0, nasal: true }, { v: 'a', n: 2 },
    { v: 'i', n: 2 }, { v: 'a', n: 0, fall: 2 }, { v: 'a', n: -3, short: true },
  ],
  chantPhrase(t0, spb) {
    if (!this.ctx) return;
    this.PHRASE.forEach((syl, i) => this.chantSyllable(t0 + i * spb, spb * (syl.short ? 0.55 : 0.95), syl));
  },
  chantSyllable(t, dur, syl) {
    const c = this.ctx, base = 98; // G2: giọng nam trầm
    const f = base * Math.pow(2, syl.n / 12);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.09, t + 0.08);
    out.gain.setValueAtTime(0.09, t + dur * 0.7);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.bus.voice);
    const forms = this.VOWELS[syl.v];
    // 3 giọng: gốc, lệch nhẹ, quãng tám dưới
    [[1, 0.5], [1.006, 0.35], [0.5, 0.45]].forEach(([mul, amp]) => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * mul, t);
      if (syl.fall) o.frequency.linearRampToValueAtTime(f * mul * Math.pow(2, -syl.fall / 12), t + dur);
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 4.8 + Math.random(); vg.gain.value = f * mul * 0.006;
      vib.connect(vg).connect(o.frequency);
      const g = c.createGain(); g.gain.value = amp;
      o.connect(g);
      forms.forEach((F, k) => {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 8 + k * 4;
        bp.frequency.setValueAtTime(syl.nasal && k === 0 ? this.VOWELS.m[0] : F, t);
        if (syl.nasal) bp.frequency.linearRampToValueAtTime(F, t + 0.12);
        const fg = c.createGain(); fg.gain.value = [1, 0.5, 0.18][k];
        g.connect(bp).connect(fg).connect(out);
      });
      o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
    });
  },

  /* ---------- Giọng đọc kinh từng câu, phát theo tiếng mõ ---------- */
  lines: new Map(),
  lineNow: null,
  loadLine(url) {
    if (!this.ctx) return Promise.resolve(null);
    if (!this.lines.has(url)) {
      this.lines.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => this.ctx.decodeAudioData(b))
        .catch(() => { this.lines.delete(url); return null; })); // lỗi mạng thì lần sau tải lại, buổi tụng vẫn tiếp tục không tiếng
    }
    return this.lines.get(url);
  },
  stopLine() {
    const n = this.lineNow; this.lineNow = null;
    if (!n) return;
    n.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.04);
    n.src?.stop(this.ctx.currentTime + 0.2);
  },
  // đọc một câu, cắt câu đang đọc dở; trả về độ dài câu (ms) để mõ tự động đợi đọc xong
  async sayLine(url) {
    this.stopLine();
    if (!this.ctx) return 0;
    const me = (this.lineNow = { g: this.ctx.createGain(), src: null });
    const buf = await this.loadLine(url);
    if (!buf) return 0;
    if (this.lineNow !== me) return 0; // đã gõ câu khác trong lúc tải
    me.g.gain.value = 1.3;
    me.src = this.ctx.createBufferSource(); me.src.buffer = buf;
    me.src.connect(me.g).connect(this.bus.voice);
    me.src.start();
    return buf.duration * 1000;
  },

  /* ---------- Bản ghi âm tụng niệm do admin tải lên ---------- */
  recording: null,
  setRecording(url) {
    if (this.recording) { this.recording.pause(); this.recording = null; }
    if (!url) return;
    const a = new Audio(url); a.loop = true; a.volume = Math.min(1, 0.75 * this.vol.voice * this.vol.master); a.preload = 'auto';
    this.recording = a;
    this.refreshLoop();
  },
};
