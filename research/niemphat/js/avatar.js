// Nhân vật chibi: Phật tử / chú tiểu. Tư thế: ngồi, đứng, đi, lạy, thiền.
import * as THREE from 'three';
import { addGear } from './gear.js';

const ROBE = [[0, 0], [0.4, 0], [0.47, 0.08], [0.45, 0.25], [0.38, 0.45], [0.27, 0.62], [0.12, 0.72], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y));
const G = {
  head: new THREE.SphereGeometry(0.42, 32, 24),
  torso: new THREE.LatheGeometry(ROBE, 32),
  arm: new THREE.CapsuleGeometry(0.11, 0.3, 6, 12),
  hand: new THREE.SphereGeometry(0.09, 12, 10),
  lap: new THREE.SphereGeometry(1, 24, 16),
  leg: new THREE.CylinderGeometry(0.1, 0.09, 0.4, 12),
  ear: new THREE.SphereGeometry(0.08, 10, 8),
  eye: new THREE.SphereGeometry(0.035, 10, 8),
  cheek: new THREE.CircleGeometry(0.05, 16),
  hairCap: new THREE.SphereGeometry(0.44, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
  bun: new THREE.SphereGeometry(0.17, 16, 12),
  longHair: new THREE.CapsuleGeometry(0.3, 0.35, 6, 16),
  bead: new THREE.SphereGeometry(0.035, 8, 6),
};

// vạt áo dài (đứng/đi) – mở đáy, loe nhẹ, chừa mũi giày
const SKIRT = [[0.44, 0.06], [0.425, 0.16], [0.405, 0.3], [0.385, 0.42], [0.375, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
G.skirt = new THREE.LatheGeometry(SKIRT, 36);
G.sleeve = new THREE.CylinderGeometry(0.105, 0.155, 0.36, 24, 1, true);
G.cuff = new THREE.TorusGeometry(0.152, 0.017, 8, 28);
G.hem = new THREE.TorusGeometry(0.44, 0.022, 8, 48);
G.sleeveIn = new THREE.CircleGeometry(0.14, 24);
G.foot = new THREE.SphereGeometry(0.075, 12, 8);

// bán kính thân áo ở độ cao y (theo ROBE) và điểm trên bề mặt hướng góc t (mặt trước là -z)
function robeR(y) {
  for (let i = 1; i < ROBE.length; i++) {
    const a = ROBE[i - 1], b = ROBE[i];
    if (y <= b.y) return a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y || 1));
  }
  return 0;
}
function surf(t, y, off) {
  const r = robeR(y), dr = (robeR(y + 0.01) - robeR(y - 0.01)) / 0.02;
  const n = new THREE.Vector3(Math.sin(t), -dr * 0.6, -Math.cos(t) / 0.88).normalize();
  return { p: new THREE.Vector3(Math.sin(t) * r, y, -Math.cos(t) * r * 0.88).addScaledVector(n, off), n };
}
// dải vải phẳng bám theo đường cong (y ca-sa, cổ áo)
function ribbon(pts, normals, width) {
  const pos = [], nor = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) len += pts[i].distanceTo(pts[i - 1]);
    const tan = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
    const side = new THREE.Vector3().crossVectors(tan, normals[i]).normalize().multiplyScalar(width / 2);
    for (const k of [-1, 1]) {
      const v = pts[i].clone().addScaledVector(side, k);
      pos.push(v.x, v.y, v.z); nor.push(normals[i].x, normals[i].y, normals[i].z); uv.push(len, k < 0 ? 0 : 1);
    }
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.map((u, i) => (i % 2 ? u : u / (width * 2.4))), 2));
  g.setIndex(idx);
  return g;
}
// y ca-sa vắt vai trái (-x), để trần vai phải, vòng xuống hông phải
const KASAYA = (() => {
  const pts = [], ns = [];
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * Math.PI * 2;
    const y = 0.38 + 0.2 * Math.cos(t + Math.PI / 2);
    const { p, n } = surf(t, y, 0.028);
    pts.push(p); ns.push(n);
  }
  return ribbon(pts, ns, 0.18);
})();
// cổ giao lĩnh: vạt phải đè vạt trái, nối từ gáy xuống ngực
function collarGeo(s) {
  const pts = [], ns = [];
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    const t = Math.PI * (1 - k) * s * 0.92 + (-s * 0.16) * k;
    const { p, n } = surf(t, 0.64 - k * 0.2, 0.03 + (s > 0 ? 0.008 : 0));
    pts.push(p); ns.push(n);
  }
  return ribbon(pts, ns, 0.085);
}
G.collarR = collarGeo(1); G.collarL = collarGeo(-1);

// vân vải: nếp gấp dọc + sợi dệt, nhân với màu áo
function canvasTex(w, h, draw, rep = [1, 1]) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const TEX = {};
function foldTex() {
  return (TEX.fold ||= canvasTex(256, 128, (g, w, h) => {
    for (let x = 0; x < w; x++) {
      const v = 0.86 + 0.08 * Math.sin((x / w) * Math.PI * 2 * 7) + 0.05 * Math.sin((x / w) * Math.PI * 2 * 19 + 1.3);
      g.fillStyle = `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`; g.fillRect(x, 0, 1, h);
    }
    g.globalAlpha = 0.025;
    for (let y = 0; y < h; y += 2) { g.fillStyle = y % 4 ? '#000' : '#fff'; g.fillRect(0, y, w, 1); }
  }));
}
// ô ruộng (điền tướng) của y ca-sa
function fieldTex() {
  return (TEX.field ||= canvasTex(384, 96, (g, w, h) => {
    // các mảnh vải ghép (điền tướng): ô dọc so le, đường may sẫm, viền hai mép
    const pw = 64;
    for (let x = 0, i = 0; x < w; x += pw, i++) {
      const top = i % 2 ? 0.58 : 0.42;
      for (const [y0, y1, v] of [[0, top, 236 + (i % 3) * 6], [top, 1, 246 - (i % 2) * 8]]) {
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y0 * h, pw, (y1 - y0) * h);
      }
      g.fillStyle = 'rgb(150,150,150)'; g.fillRect(x, 0, 3, h); g.fillRect(x, top * h - 1.5, pw, 3);
    }
    g.fillStyle = 'rgb(165,165,165)'; g.fillRect(0, 0, w, 9); g.fillRect(0, h - 9, w, 9);
    g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 9, w, 2); g.fillRect(0, h - 11, w, 2);
    g.globalAlpha = 0.05; g.fillStyle = '#000';
    for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
  }));
}
const clothMats = new Map();
function cloth(color, kind) {
  const key = color + kind;
  if (!clothMats.has(key)) {
    const map = kind === 'field' ? fieldTex() : kind === 'in' ? null : foldTex();
    clothMats.set(key, new THREE.MeshStandardMaterial({ color, map, roughness: kind === 'field' ? 0.75 : 0.88, side: kind === 'fold' ? THREE.FrontSide : THREE.DoubleSide }));
  }
  return clothMats.get(key);
}

// Vải hoa văn cho áo cao cấp: vẽ màu thật vào texture (hoa văn không bị màu áo nhuộm)
function drawMotif(g, kind, x, y, s, accent) {
  g.save(); g.translate(x, y); g.fillStyle = accent; g.strokeStyle = accent; g.lineWidth = s * 0.09; g.lineCap = 'round';
  if (kind === 'sen') {
    for (const a of [-1.15, -0.58, 0, 0.58, 1.15]) {
      g.save(); g.rotate(a); g.beginPath(); g.moveTo(0, s * 0.45);
      g.quadraticCurveTo(-s * 0.3, -s * 0.05, 0, -s * 0.55); g.quadraticCurveTo(s * 0.3, -s * 0.05, 0, s * 0.45); g.fill(); g.restore();
    }
    g.beginPath(); g.moveTo(-s * 0.55, s * 0.58); g.quadraticCurveTo(0, s * 0.82, s * 0.55, s * 0.58); g.stroke();
  } else if (kind === 'may') {
    g.beginPath(); g.arc(-s * 0.32, 0, s * 0.24, Math.PI * 0.9, Math.PI * 2.2); g.arc(s * 0.08, -s * 0.1, s * 0.3, Math.PI * 1.05, Math.PI * 2.05); g.arc(s * 0.46, s * 0.03, s * 0.19, Math.PI * 1.3, Math.PI * 2.5);
    g.moveTo(s * 0.62, s * 0.24); g.lineTo(-s * 0.5, s * 0.24); g.stroke();
    g.beginPath(); g.arc(s * 0.06, -s * 0.06, s * 0.11, 0, Math.PI * 1.6); g.stroke();
  } else if (kind === 'gam') {
    g.beginPath(); g.moveTo(0, -s * 0.6); g.lineTo(s * 0.6, 0); g.lineTo(0, s * 0.6); g.lineTo(-s * 0.6, 0); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(s * 0.3, 0); g.lineTo(0, s * 0.3); g.lineTo(-s * 0.3, 0); g.closePath(); g.fill();
  } else if (kind === 'vay') {
    // vảy rồng: ba hàng cung xếp chồng
    for (const [dx, dy] of [[-1, -0.9], [0, -0.9], [1, -0.9], [-1.5, -0.3], [-0.5, -0.3], [0.5, -0.3], [1.5, -0.3], [-1, 0.3], [0, 0.3], [1, 0.3], [-1.5, 0.9], [-0.5, 0.9], [0.5, 0.9], [1.5, 0.9]]) {
      g.beginPath(); g.arc(dx * s * 0.62, dy * s * 0.72, s * 0.31, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(dx * s * 0.62, dy * s * 0.72 + s * 0.16, s * 0.05, 0, 7); g.fill();
    }
  } else if (kind === 'truc') {
    g.lineWidth = s * 0.14; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
    g.lineWidth = s * 0.05;
    for (const yy of [-s * 0.5, s * 0.25]) {
      g.beginPath(); g.moveTo(-s * 0.1, yy); g.lineTo(s * 0.1, yy); g.stroke();
      for (const d of [-1, 1]) { g.beginPath(); g.moveTo(0, yy); g.quadraticCurveTo(d * s * 0.35, yy - s * 0.32, d * s * 0.62, yy - s * 0.1); g.quadraticCurveTo(d * s * 0.32, yy - s * 0.04, 0, yy); g.fill(); }
    }
  }
  g.restore();
}
// đặt hoa văn lên 3 hàng so le, chừa dải viền gấu áo ở đáy texture (v thấp = gấu áo, cổ tay)
const PAT_H = 0.78;
function layMotifs(g, pattern, w, h, s, color, off = 0) {
  const cols = 8, rows = 3, dx = w / cols, dy = (h * PAT_H) / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c <= cols; c++) drawMotif(g, pattern, (c + (r % 2 ? 0.5 : 0) + off) * dx + dx / 4, (r + 0.5 + off) * dy, s, color);
}
function borderBand(g, w, h, color, accent) {
  const y0 = h * PAT_H, bh = h - y0;
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, y0 + bh * 0.1, w, bh * 0.8);
  g.fillStyle = accent;
  for (const [y, t] of [[0.08, 5], [0.86, 5], [0.17, 2], [0.8, 2]]) g.fillRect(0, y0 + bh * y, w, t);
  // chuỗi trám và chấm chạy dọc gấu
  const n = 32, st = w / n, cy = y0 + bh * 0.48, r = bh * 0.2;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * st;
    g.beginPath(); g.moveTo(x, cy - r); g.lineTo(x + r, cy); g.lineTo(x, cy + r); g.lineTo(x - r, cy); g.closePath(); g.fill();
    g.save(); g.fillStyle = color; g.beginPath(); g.arc(x, cy, r * 0.32, 0, 7); g.fill(); g.restore();
    g.beginPath(); g.arc(x + st / 2, cy, r * 0.16, 0, 7); g.fill();
  }
}
// màu nền đổi sáng/tối để dệt chìm cùng tông
const tone = (c, k) => new THREE.Color(c).multiplyScalar(k).getStyle();
function patternTex(color, pattern, accent) {
  const key = `pat${color}${pattern}${accent}`;
  return (TEX[key] ||= canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    // hoa văn nhỏ dệt chìm cùng tông, tạo mặt gấm
    g.globalAlpha = 0.3;
    layMotifs(g, pattern, w, h, 20, tone(color, 1.3), 0.5);
    g.globalAlpha = 0.3;
    g.fillStyle = tone(color, 0.6);
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    g.globalAlpha = 0.1;
    for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
    // hoa văn chính thêu nổi: bóng đổ, thân chỉ, rồi vệt sáng
    g.globalAlpha = 1;
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 5; g.shadowOffsetY = 2;
    layMotifs(g, pattern, w, h, 44, accent);
    g.restore();
    g.globalAlpha = 0.5;
    layMotifs(g, pattern, w, h, 30, tone(accent, 1.35));
    g.globalAlpha = 1;
    borderBand(g, w, h, color, accent);
    // nếp gấp phủ lên cả nền và hoa văn
    for (let x = 0; x < w; x += 2) {
      const v = 0.08 * Math.sin((x / w) * Math.PI * 2 * 7) + 0.05 * Math.sin((x / w) * Math.PI * 2 * 19 + 1.3) - 0.04;
      g.fillStyle = v < 0 ? `rgba(0,0,0,${-v})` : `rgba(255,255,255,${v})`; g.fillRect(x, 0, 2, h);
    }
  }));
}
// mặt nạ chỉ thêu: R = độ nổi, G = độ nhám, B = độ kim loại (dùng chung một texture)
function threadTex(pattern, shine) {
  const key = `thread${pattern}${shine}`;
  return (TEX[key] ||= (() => {
    const t = canvasTex(1024, 512, (g, w, h) => {
      g.fillStyle = 'rgb(30,215,0)'; g.fillRect(0, 0, w, h);
      const on = `rgb(235,${Math.round(150 - shine * 90)},${Math.round(Math.min(1, shine * 1.5) * 255)})`;
      layMotifs(g, pattern, w, h, 44, on);
      const y0 = h * PAT_H, bh = h - y0;
      g.fillStyle = on;
      g.fillRect(0, y0 + bh * 0.08, w, bh * 0.84);
    });
    if (t) t.colorSpace = THREE.NoColorSpace;
    return t;
  })());
}
function fancyCloth(robe, shade, side) {
  const key = `fancy${robe.color}${robe.pattern}${robe.accent}${shade}${side}${robe.shine || 0}`;
  if (!clothMats.has(key)) {
    const sh = robe.shine || 0, thread = threadTex(robe.pattern, sh);
    // lụa: có ánh viền khi nhìn nghiêng; chỉ thêu bắt sáng theo mặt nạ, nền vải vẫn mềm
    clothMats.set(key, new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(shade, shade, shade), map: patternTex(robe.color, robe.pattern, robe.accent),
      roughness: 1, roughnessMap: thread, metalness: sh ? 1 : 0, metalnessMap: sh ? thread : null, bumpMap: thread, bumpScale: 1.2,
      sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(robe.color).lerp(new THREE.Color('#ffffff'), 0.45),
      envMapIntensity: 1 + sh * 1.6, side,
    }));
  }
  return clothMats.get(key);
}
// viền và y của áo hoa văn: chỉ kim tuyến nếu áo có shine, lụa bóng nếu không
function fancyTrim(robe, color, map) {
  const key = `trim${color}${robe.shine || 0}${map ? 'm' : ''}`;
  if (!clothMats.has(key)) {
    const sh = robe.shine || 0;
    clothMats.set(key, new THREE.MeshPhysicalMaterial({ color, map, roughness: 0.62 - sh * 0.3, metalness: sh * 0.8, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4), envMapIntensity: 1 + sh * 1.6, side: THREE.DoubleSide }));
  }
  return clothMats.get(key);
}
// hạt đá, gỗ bóng phủ lớp men; hạt kim loại bắt sáng theo môi trường
export function beadMaterial(b) {
  const key = `bead${b.c1}${b.c2}${b.metal || 0}${b.gloss ? 1 : 0}`;
  if (!clothMats.has(key)) {
    const base = new THREE.Color(b.c1).lerp(new THREE.Color(b.c2 || b.c1), 0.5);
    clothMats.set(key, new THREE.MeshPhysicalMaterial({
      color: base, roughness: b.metal ? 0.24 : 0.2, metalness: b.metal || 0, clearcoat: 1, clearcoatRoughness: 0.08,
      emissive: base, emissiveIntensity: b.metal ? 0 : 0.1, envMapIntensity: 1.6,
    }));
  }
  return clothMats.get(key);
}
// Vầng sáng dưới chân cho áo quý: một texture tròn dùng chung, vật liệu riêng theo màu
function auraDisc(color) {
  const tex = (TEX.aura ||= canvasTex(256, 256, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, w * 0.12, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,.75)'); grad.addColorStop(0.72, 'rgba(255,255,255,.22)'); grad.addColorStop(0.86, 'rgba(255,255,255,.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
  }));
  const disc = new THREE.Mesh(auraGeo, new THREE.MeshBasicMaterial({ color, map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03; disc.renderOrder = 1;
  return disc;
}
const auraGeo = new THREE.CircleGeometry(1.15, 40);

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  return mats.get(key);
}
const HAIR = '#2a1d16';

// 18 hạt tràng đeo cổ gộp sẵn thành một hình (dùng chung cho mọi avatar)
let neckGeo;
function neckBeads() {
  if (neckGeo) return neckGeo;
  const pos = [], nor = [], idx = [];
  const b = G.bead;
  const bp = b.attributes.position, bn = b.attributes.normal, bi = b.index;
  for (let i = 0; i < 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    const front = Math.max(0, -Math.sin(t)), ox = Math.cos(t) * 0.34, oy = -front * 0.3, oz = Math.sin(t) * (front ? 0.47 : 0.34), base = pos.length / 3; // vòng rộng hơn thân áo, phía trước rủ xuống ngực
    for (let v = 0; v < bp.count; v++) { pos.push(bp.getX(v) + ox, bp.getY(v) + oy, bp.getZ(v) + oz); nor.push(bn.getX(v), bn.getY(v), bn.getZ(v)); }
    for (let k = 0; k < bi.count; k++) idx.push(bi.getX(k) + base);
  }
  neckGeo = new THREE.BufferGeometry();
  neckGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  neckGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  neckGeo.setIndex(idx);
  return neckGeo;
}

function m(geo, material, x = 0, y = 0, z = 0, o = {}) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  if (o.scale) mesh.scale.set(...o.scale);
  if (o.rot) mesh.rotation.set(...o.rot);
  mesh.castShadow = o.cast ?? true;
  return mesh;
}

/**
 * opts: { appearance:{gender,hair,skin}, robe:{color,sash,pattern?,accent?,shine?,aura?}, beads:{c1,gloss?,metal?}, npc }
 */
export function makeAvatar(opts = {}) {
  const ap = { gender: 'nam', hair: 'troc', skin: '#d98b5f', ...(opts.appearance || {}) };
  const robe = opts.robe || { color: '#b8c0c8', sash: '#e6bd45' };
  const skin = mat(ap.skin, { roughness: 0.55 });
  const fancy = robe.pattern && robe.accent;
  const robeM = fancy ? fancyCloth(robe, 1, THREE.FrontSide) : cloth(robe.color, 'fold');
  const robeIn = fancy ? fancyCloth(robe, 1, THREE.DoubleSide) : cloth(robe.color, 'foldD');
  const darkC = new THREE.Color(robe.color).multiplyScalar(0.72).getStyle();
  const robeDark = fancy ? fancyCloth(robe, 0.78, THREE.FrontSide) : cloth(darkC, 'fold');
  const trimM = fancy ? fancyTrim(robe, robe.accent) : cloth(darkC, 'in');
  const sashM = fancy ? fancyTrim(robe, robe.sash, fieldTex()) : cloth(robe.sash, 'field');

  const root = new THREE.Group();
  const upper = new THREE.Group();
  root.add(upper);
  upper.add(m(G.torso, robeM, 0, -0.05, 0, { scale: [1, 1, 0.88] }));
  // cổ giao lĩnh (áo lót trắng lộ ở cổ) + y ca-sa vắt vai trái
  upper.add(m(G.collarL, trimM, 0, -0.05, 0, { cast: false }), m(G.collarR, trimM, 0, -0.05, 0, { cast: false }));
  upper.add(m(G.collarL, mat('#f2ece0', { roughness: 0.8, side: THREE.DoubleSide }), 0, -0.035, -0.012, { scale: [0.82, 1, 0.9], cast: false }));
  upper.add(m(KASAYA, sashM, 0, -0.05, 0, { cast: false }));
  const arms = [], hands = [];
  for (const s of [-1, 1]) {
    const a = m(G.arm, robeM, s * 0.3, 0.38, -0.12, { rot: [1.0, 0, s * 0.5] });
    // tay áo rộng (ống loe về phía bàn tay) + viền tay
    const sl = m(G.sleeve, robeIn, 0, 0.01, 0);
    sl.add(m(G.cuff, trimM, 0, -0.18, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
    sl.add(m(G.sleeveIn, mat('#1e140e', { roughness: 1 }), 0, -0.165, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
    a.add(sl);
    const h = m(G.hand, skin, s * 0.05, 0.5, -0.36);
    arms.push(a); hands.push(h);
    upper.add(a, h);
  }
  // tràng hạt đeo cổ
  if (opts.beads) {
    const bm = opts.beads.rank ? beadMaterial(opts.beads) : mat(opts.beads.c1, { roughness: opts.beads.metal ? 0.3 : opts.beads.gloss ? 0.15 : 0.4, metalness: opts.beads.metal || 0 });
    const neck = m(neckBeads(), bm, 0, 0.6, -0.02, { cast: false });
    neck.rotation.x = 0;
    upper.add(neck);
  }

  const head = new THREE.Group();
  head.position.y = 0.95;
  head.add(m(G.head, skin));
  for (const s of [-1, 1]) head.add(m(G.ear, skin, s * 0.41, -0.02, 0.02, { scale: [0.6, 1, 0.8] }));
  // mặt (nhìn về -z)
  const eyeM = mat('#2a1a12', { roughness: 0.3 });
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = m(G.eye, eyeM, s * 0.13, 0.0, -0.39, { scale: [1, 1.25, 0.6], cast: false });
    eyes.push(e); head.add(e);
    const c = m(G.cheek, mat('#f08a8a', { transparent: true, opacity: ap.gender === 'nu' ? 0.55 : 0.3 }), s * 0.22, -0.1, -0.37, { rot: [0, Math.PI + s * 0.5, 0], cast: false });
    head.add(c);
  }
  // tóc
  const hairM = mat(HAIR, { roughness: 0.6 });
  if (ap.hair !== 'troc') {
    head.add(m(G.hairCap, hairM, 0, 0.02, 0.02, { rot: [0.45, 0, 0] }));
    if (ap.hair === 'bui') head.add(m(G.bun, hairM, 0, 0.32, 0.25));
    if (ap.hair === 'dai') head.add(m(G.longHair, hairM, 0, -0.22, 0.2, { scale: [1.1, 1, 0.55] }));
  }
  upper.add(head);

  const lap = m(G.lap, robeDark, 0, 0.12, -0.06, { scale: [0.52, 0.17, 0.42] });
  const legs = new THREE.Group();
  const legL = m(G.leg, robeDark, -0.13, 0.2, 0), legR = m(G.leg, robeDark, 0.13, 0.2, 0);
  const shoe = mat('#3a2a20', { roughness: 0.7 });
  for (const l of [legL, legR]) l.add(m(G.foot, shoe, 0, -0.19, -0.05, { scale: [0.9, 0.6, 1.4] }));
  legs.add(legL, legR);
  // vạt áo dài phủ gần tới chân + viền gấu
  const skirt = m(G.skirt, robeM, 0, 0, 0, { scale: [1, 1, 0.88] });
  skirt.material = robeIn;
  skirt.add(m(G.hem, trimM, 0, 0.065, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
  legs.add(skirt);
  root.add(lap, legs);

  const av = {
    root, upper, head, lap, legs, legL, legR, skirt, arms, hands, eyes,
    pose: 'sit', bowing: false, bowT: 0, walk: 0, meditate: 0, onBow: null, phase: Math.random() * 10,
  };
  if (robe.aura) { av.aura = auraDisc(robe.aura); root.add(av.aura); }
  addGear(av, opts);
  setSeated(av, true);
  return av;
}

export function setSeated(av, on) {
  if (av.cloud) av.cloud.visible = !on;
  av.seated = on;
  av.lap.visible = on;
  av.legs.visible = !on;
  av.upper.position.y = on ? 0.3 : 0.4;
  av.baseY = on ? 0.17 : 0;
  av.root.position.y = av.baseY;
}

export const BOW_TIME = 2.6;
const ss = THREE.MathUtils.smoothstep;
const _sh = new THREE.Vector3(), _d = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

/** state: { moving:boolean } */
// xung cử động: 0 → 1 → 0 trong khoảng [a, b]
const pulse = (t, a, b) => { const u = (t - a) / (b - a); return u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI); };
const FIGHT_HIT = 1.25, FIGHT_HURT = 1.1;
export function startFight(av, kind) { av.fight = { kind, t: 0, dur: kind === 'hit' ? FIGHT_HIT : FIGHT_HURT }; }
function fightArms(av, t) {
  const pr = [pulse(t, 0.3, 0.6), pulse(t, 0, 0.3)]; // [trái, phải]
  av.hands.forEach((h, i) => {
    const s = i ? 1 : -1, x = pr[i];
    // thủ thế trước ngực, đấm thẳng ra trước
    h.position.set(s * (0.2 - x * 0.12), 0.62 + x * 0.02, -0.28 - x * 0.62);
  });
  av.arms.forEach((a, i) => {
    const s = i ? 1 : -1, h = av.hands[i].position;
    _sh.set(s * 0.27, 0.58, -0.04);
    _d.subVectors(h, _sh); const len = _d.length();
    a.position.copy(_sh).addScaledVector(_d, 0.5);
    a.quaternion.setFromUnitVectors(_down, _d.normalize());
    a.scale.set(1, len / 0.44, 1);
  });
}
function fightBody(av, f) {
  const t = f.t;
  if (f.kind === 'hit') {
    const pu = pulse(t, 0, 0.3) + pulse(t, 0.3, 0.6), kick = pulse(t, 0.6, 1.2);
    av.upper.rotation.y = (pulse(t, 0, 0.3) - pulse(t, 0.3, 0.6)) * 0.45 + kick * 0.25;
    av.upper.rotation.x = -0.2 * pu + 0.3 * kick;
    av.upper.position.z = -0.1 * pu;
    av.legR.rotation.x = kick * 1.75; // đá thẳng ra trước
    av.legL.rotation.x = -kick * 0.25;
    av.root.position.y = av.baseY + kick * 0.14;
  } else {
    const hurt = pulse(t, 0, f.dur);
    av.upper.rotation.x = 0.5 * hurt;
    av.upper.position.z = 0.14 * hurt;
    av.upper.rotation.y = Math.sin(t * 22) * 0.16 * hurt;
    av.head.rotation.z = Math.sin(t * 18) * 0.28 * hurt;
    av.legL.rotation.x = -0.3 * hurt; av.legR.rotation.x = -0.18 * hurt;
  }
}
export function animateAvatar(av, dt, time, moving = false) {
  av.gearTick?.(time, moving);
  if (av.aura) { av.aura.material.opacity = 0.42 + 0.16 * Math.sin(time * 1.6 + av.phase); av.aura.rotation.z = time * 0.2; }
  // lạy
  if (av.bowing || av.bowT > 0) {
    av.bowT += dt / (BOW_TIME * (av.bowSlow || 1));
    if (av.bowT >= 1) { av.bowT = av.bowing ? av.bowT - 1 : 0; av.onBow?.(); }
  }
  // chan: tay phải đấm, tay trái đấm, rồi tung cú đá; người bị chan ngả ra sau, lắc đầu
  const f = av.fight;
  if (f) { f.t += dt; if (f.t >= f.dur) av.fight = null; }
  const p = av.bowT;
  const amt = p < 0.45 ? ss(p, 0, 0.45) : p < 0.6 ? 1 : 1 - ss(p, 0.6, 1);
  av.upper.rotation.x = -1.15 * amt;
  av.upper.position.z = -0.12 * amt;
  av.head.rotation.x = -0.3 * amt;

  // thiền: tay đặt trên đùi, mắt nhắm
  const target = av.meditating ? 1 : 0;
  av.meditate += (target - av.meditate) * Math.min(1, dt * 4);
  const k = av.meditate;
  av.hands.forEach((h, i) => { const s = i ? 1 : -1; h.position.set(s * (0.05 + k * 0.05), 0.5 - k * 0.32, -0.36 + k * 0.02); });
  av.arms.forEach((a, i) => {
    // cánh tay nối từ vai tới bàn tay → tay áo rộng rủ đúng hướng chắp tay / đặt trên đùi
    const s = i ? 1 : -1, h = av.hands[i].position;
    _sh.set(s * 0.27, 0.58, -0.04);
    _d.subVectors(h, _sh); const len = _d.length();
    a.position.copy(_sh).addScaledVector(_d, 0.5);
    a.quaternion.setFromUnitVectors(_down, _d.normalize());
    a.scale.set(1, len / 0.44, 1);
  });
  if (av.fight?.kind === 'hit') fightArms(av, av.fight.t);
  av.eyes.forEach((e) => { e.scale.y = 1.25 * (1 - k * 0.8) + 0.05; });
  if (k > 0.01) av.head.rotation.x = Math.min(av.head.rotation.x, -0.15 * k);

  // đi
  if (moving) {
    av.walk += dt * 10;
    av.legL.rotation.x = Math.sin(av.walk) * 0.6;
    av.legR.rotation.x = -Math.sin(av.walk) * 0.6;
    av.root.position.y = av.baseY + Math.abs(Math.sin(av.walk)) * 0.06;
    av.skirt.rotation.z = Math.sin(av.walk) * 0.035;
  } else {
    av.legL.rotation.x *= 0.8; av.legR.rotation.x *= 0.8; av.skirt.rotation.z *= 0.8;
    av.root.position.y = av.baseY;
  }
  if (av.fight) fightBody(av, av.fight);
  // thở
  av.head.position.y = 0.95 + Math.sin(time * 1.6 + av.phase) * 0.008;
}

// Dáng ngạ quỷ: phủ toàn thân màu xám xanh mờ, bỏ phủ thì trả lại vật liệu cũ
export function setGhost(av, on) {
  if (!!av.ghost === on) return;
  av.ghost = on;
  if (!on) av.ghostMats?.forEach((g) => g.dispose());
  av.ghostMats = on ? [] : null;
  av.root.traverse((o) => {
    if (!o.isMesh || o === av.aura) return;
    if (on) {
      const g = new THREE.MeshStandardMaterial({ color: 0x5f6f7f, emissive: 0x1c2a38, transparent: true, opacity: 0.62, depthWrite: false });
      o.userData.real = o.material; o.material = g; av.ghostMats.push(g);
    } else if (o.userData.real) { o.material = o.userData.real; delete o.userData.real; }
  });
}
export function disposeAvatar(av) {
  av.ghostMats?.forEach((g) => g.dispose());
  av.root.removeFromParent();
  if (av.pet) { av.pet.root.removeFromParent(); av.pet.dispose(); av.pet = null; }
  av.aura?.material.dispose();
  av.root.traverse((o) => { if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); } });
}
