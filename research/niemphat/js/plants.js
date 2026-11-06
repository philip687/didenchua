// Mô hình cây Phật: dùng chung cho sân chùa (chores.js) và ảnh cửa hàng (thumbs.js).
// Mỗi loại gộp thành một hình có màu theo đỉnh, nên trăm cây cũng chỉ tốn một lượt vẽ.
import * as THREE from 'three';

const col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// tô màu: shade(x, y, z) trả về độ sáng nhân thêm
function paint(geo, color, shade = () => 1) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, c = new Float32Array(p.count * 3);
  col.set(color);
  for (let i = 0; i < p.count; i++) { const k = shade(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function merge(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = new Float32Array(n * 3);
  let at = 0;
  for (const g of list) { pos.set(g.attributes.position.array, at * 3); nor.set(g.attributes.normal.array, at * 3); cl.set(g.attributes.color.array, at * 3); at += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  return out;
}
// cành: hình trụ nối hai điểm
function limb(a, b, ra, rb, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const g = new THREE.CylinderGeometry(rb, ra, d.length(), seg, 1, true).translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize()));
  return g.translate(A.x, A.y, A.z);
}
// tán lá: khối gồ ghề, pháp tuyến toả tròn cho mềm, dưới tối trên sáng
function foliage(r, x, y, z, sy, color, rnd, low, high) {
  const g = new THREE.IcosahedronGeometry(r, 1), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), bump = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    if (!bump.has(key)) bump.set(key, 0.84 + rnd() * 0.3);
    n.setXYZ(i, v.x / r, v.y / r, v.z / r);
    v.multiplyScalar(bump.get(key));
    p.setXYZ(i, v.x + x, v.y * sy + y, v.z + z);
  }
  return paint(g, color, (_, py) => low + (high - low) * Math.max(0, Math.min(1, (py - (y - r * sy)) / (2 * r * sy))));
}
// tán to ghép từ nhiều khối nhỏ để viền tán lô nhô như lá thật; vùng thấp tối hơn theo độ cao cả cây
function crown(spots, colors, rnd, low, high) {
  const out = [];
  spots.forEach((s, si) => {
    const n = Math.max(4, Math.round(s[3] * 4.2));
    out.push(foliage(s[3] * 0.72, s[0], s[1], s[2], s[4], colors[si % colors.length], rnd, low, high));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 1.55, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + si;
      const R = s[3] * (0.36 + rnd() * 0.1);
      out.push(foliage(R, s[0] + Math.cos(a) * r * s[3] * 0.72, s[1] + y * s[3] * s[4] * 0.72, s[2] + Math.sin(a) * r * s[3] * 0.72, 0.86, colors[(si + i) % colors.length], rnd, low, high));
    }
  });
  return out;
}
// lá rời hai tam giác hình tim, gắn trên mặt tán để viền tán không tròn trịa
function leaves(n, spots, size, colors, rnd, droop = 0.6) {
  const pos = [], list = [];
  for (let i = 0; i < n; i++) {
    const s = spots[Math.floor(rnd() * spots.length)], a = rnd() * 6.283, b = (rnd() - 0.35) * 2.4;
    const cx = s[0] + Math.cos(a) * Math.cos(b) * s[3], cy = s[1] + Math.sin(b) * s[3] * s[4], cz = s[2] + Math.sin(a) * Math.cos(b) * s[3];
    const w = size * (0.7 + rnd() * 0.6), rx = rnd() * 6.283;
    const g = new THREE.BufferGeometry();
    pos.length = 0;
    pos.push(0, 0, 0, w * 0.6, -w * 0.5, 0, 0, -w * 1.5, 0, 0, 0, 0, 0, -w * 1.5, 0, -w * 0.6, -w * 0.5, 0, 0, 0, 0, 0, -w * 1.5, 0, w * 0.6, -w * 0.5, 0, 0, 0, 0, -w * 0.6, -w * 0.5, 0, 0, -w * 1.5, 0);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.rotateY(rx); g.rotateX((rnd() - 0.5) * droop); g.translate(cx, cy, cz);
    g.computeVertexNormals();
    // pháp tuyến hướng ra ngoài tán để lá sáng đồng đều
    const nr = g.attributes.normal, o = new THREE.Vector3(cx - s[0], Math.max(0.2, cy - s[1]), cz - s[2]).normalize();
    for (let k = 0; k < nr.count; k++) nr.setXYZ(k, o.x, o.y, o.z);
    const c = colors[Math.floor(rnd() * colors.length)];
    list.push(paint(g, c, () => 0.9 + rnd() * 0.25));
  }
  return list;
}
// nghiêng pháp tuyến lên trời để mặt dưới cánh hoa vẫn đón sáng
function lift(g, k) {
  const n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i); v.y += k; v.normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  return g;
}
// hoa năm cánh hình sao, nhuỵ vàng giữa, đầu cánh trắng ngà; hai mặt để nhìn từ dưới vẫn thấy
function star(x, y, z, R, rnd) {
  const rim = [], pos = [], cl = [], q = new THREE.Euler(0.5 + (rnd() - 0.5) * 0.7, rnd() * 6.283, (rnd() - 0.5) * 0.7);
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, d = i % 2 ? R * 0.68 : R; rim.push([Math.cos(a) * d, 0, Math.sin(a) * d, i % 2 ? '#fff0b8' : '#fffbea']); }
  const put = (p, c) => { pos.push(p[0], p[1], p[2]); col.set(c); cl.push(col.r, col.g, col.b); };
  for (let i = 0; i < 10; i++) {
    const a = rim[i], b = rim[(i + 1) % 10], h = R * 0.22;
    put([0, h, 0], '#dca81f'); put(b, b[3]); put(a, a[3]);
    put([0, -h, 0], '#dca81f'); put(a, a[3]); put(b, b[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
  g.rotateX(q.x); g.rotateY(q.y); g.rotateZ(q.z); g.translate(x, y, z);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}
const bark = (color, rnd) => (x, y, z) => 0.82 + 0.28 * Math.abs(Math.sin(Math.atan2(z, x) * 7 + y * 1.6)) + rnd() * 0.06;

function bode() {
  const r = rng(11), parts = [], BK = '#6f5c47';
  parts.push(paint(new THREE.CylinderGeometry(0.34, 0.62, 2.9, 10, 3, true).translate(0, 1.45, 0), BK, bark(BK, r)));
  // rễ bạnh quanh gốc, đặc trưng của bồ đề già
  for (let i = 0; i < 7; i++) { const a = i * 0.898 + r() * 0.3, l = 0.95 + r() * 0.5; parts.push(paint(limb([Math.cos(a) * 0.35, 0.65, Math.sin(a) * 0.35], [Math.cos(a) * l, 0.02, Math.sin(a) * l], 0.2, 0.05, 5), BK, () => 0.78 + r() * 0.2)); }
  const spots = [[0, 5.3, 0, 2, 0.72], [1.85, 4.55, 0.55, 1.5, 0.7], [-1.8, 4.7, -0.6, 1.55, 0.7], [0.35, 4.3, 1.85, 1.4, 0.7], [-0.5, 4.45, -1.85, 1.4, 0.7], [1.15, 5.65, -0.95, 1.15, 0.72], [-1.05, 5.75, 0.9, 1.15, 0.72], [1.5, 3.85, -1.25, 1, 0.65], [-1.45, 3.9, 1.25, 1, 0.65]];
  // cành chính mở từ đỉnh thân tới các chùm lá
  for (const s of spots.slice(1, 7)) parts.push(paint(limb([s[0] * 0.08, 2.75, s[2] * 0.08], [s[0] * 0.72, s[1] - 0.45, s[2] * 0.72], 0.16, 0.05, 5), BK, () => 0.8 + r() * 0.15));
  parts.push(...crown(spots.slice(0, 7), ['#4a8a3c', '#42803a', '#55963f'], r, 0.66, 1.16));
  parts.push(foliage(1, 1.5, 3.85, -1.25, 0.65, '#3f7d38', r, 0.62, 1), foliage(1, -1.45, 3.9, 1.25, 0.65, '#3f7d38', r, 0.62, 1));
  parts.push(...leaves(240, spots, 0.17, ['#5fa64a', '#6fb552', '#4d9240', '#86c463'], r));
  return { geo: merge(parts), top: 6.7, view: { y: 3.1, dist: 15.5 }, fruitR: 0.19, fruit: [[1.9, 3.75, 1.65], [-1.75, 3.9, 1.8], [2.75, 4.1, -0.5], [-1.7, 3.85, -2.2], [0.25, 3.6, 2.75], [-2.8, 4.15, -0.5]] };
}
function sala() {
  const r = rng(23), parts = [], BK = '#5f4d3b';
  // thân thẳng cao, đặc trưng của sala Shorea robusta
  parts.push(paint(new THREE.CylinderGeometry(0.17, 0.36, 5.4, 9, 4, true).translate(0, 2.7, 0), BK, bark(BK, r)));
  for (const [x, y, z] of [[1, 5.3, 0.45], [-1.05, 5.5, -0.4], [0.3, 5.15, -1], [-0.3, 5.3, 1], [0.75, 6.3, -0.5], [-0.7, 6.4, 0.5]]) parts.push(paint(limb([0, y - 1.15, 0], [x, y, z], 0.1, 0.035, 5), BK, () => 0.82 + r() * 0.15));
  const spots = [[0, 7.15, 0, 1.2, 1], [1.15, 5.95, 0.45, 1.2, 0.72], [-1.2, 6.1, -0.45, 1.2, 0.72], [0.35, 5.7, -1.15, 1.1, 0.72], [-0.35, 5.85, 1.15, 1.1, 0.72], [0.8, 6.85, -0.6, 0.85, 0.8], [-0.8, 6.9, 0.65, 0.85, 0.8]];
  parts.push(...crown(spots, ['#47803e', '#3f7639', '#528c44'], r, 0.66, 1.14));
  parts.push(...leaves(90, spots, 0.2, ['#5a9a49', '#4c8c42', '#6dab56'], r, 0.9));
  // chùm hoa rủ quanh tán và nở trên mặt tán: hoa nhỏ vàng trắng, nhuỵ vàng đậm
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996, y = 5 + (i % 5) * 0.34, R = 2.25 - Math.abs(y - 5.8) * 0.45 + r() * 0.2, x = Math.sin(a) * R, z = Math.cos(a) * R;
    parts.push(paint(limb([x * 0.86, y + 0.2, z * 0.86], [x, y - 0.8, z], 0.016, 0.009, 3), '#b9a35f'));
    for (let k = 0; k < 6; k++) { const ang = k * 2.4, off = 0.16 - k * 0.012; parts.push(star(x + Math.sin(ang) * off, y - k * 0.14, z + Math.cos(ang) * off, 0.2, r)); }
  }
  for (let i = 0; i < 18; i++) { const a = i * 2.39996, t = i / 18, R = 0.35 + t * 1.75, y = 8.05 - t * 1.55; parts.push(star(Math.sin(a) * R, y + r() * 0.12, Math.cos(a) * R, 0.2, r)); }
  return { geo: merge(parts), top: 8.4, view: { y: 3.9, dist: 18.5 }, fruitR: 0.17, fruit: [[1.55, 5.45, 1.25], [-1.6, 5.6, 1.15], [1.45, 5.5, -1.4], [-1.4, 5.65, -1.45], [0, 5.3, 1.95]] };
}
function sen() {
  const r = rng(37), parts = [];
  // chậu đá tiện tròn: đế, thân phình, miệng loe
  const profile = [[0, 0], [0.66, 0], [0.72, 0.1], [0.62, 0.17], [0.8, 0.34], [1.02, 0.56], [1.12, 0.74], [1.18, 0.8], [1.16, 0.88], [1.02, 0.88], [0.98, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.LatheGeometry(profile, 26);
  parts.push(paint(pot, '#a79f8f', (x, y, z) => 0.82 + 0.16 * Math.sin(Math.atan2(z, x) * 11) * (y > 0.3 && y < 0.62 ? 1 : 0.15) + r() * 0.05));
  // viền chạm đài sen quanh thân chậu
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; parts.push(paint(new THREE.SphereGeometry(0.15, 8, 6).scale(0.9, 1.25, 0.14).rotateX(0.78).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * 0.975, 0.5, Math.sin(a) * 0.975), '#bdb3a0', () => 1)); }
  // mặt nước
  parts.push(paint(new THREE.CircleGeometry(1, 22).rotateX(-Math.PI / 2).translate(0, 0.76, 0), '#4d8da0', (x, _, z) => 0.8 + 0.38 * Math.hypot(x, z)));
  // lá sen tròn có khe
  for (const [x, z, R, a, y] of [[0.5, 0.3, 0.42, 0.4, 0.78], [-0.55, 0.25, 0.36, 2.1, 0.785], [-0.15, -0.58, 0.34, 4.3, 0.79], [0.56, -0.42, 0.28, 5.4, 0.78]]) {
    parts.push(paint(new THREE.CircleGeometry(R, 14, 0.2, 5.88).rotateX(-Math.PI / 2).rotateY(a).translate(x, y, z), '#4f9a4c', (px, _, pz) => 0.78 + 0.5 * (Math.hypot(px - x, pz - z) / R)));
  }
  const stem = (x, z, h) => parts.push(paint(limb([x, 0.76, z], [x, h, z], 0.022, 0.016, 5), '#5f9a4e'));
  // hoa nở nhiều lớp cánh
  const bx = 0.05, bz = 0.05, by = 1.5;
  stem(bx, bz, by);
  for (const [n, len, tilt, c, off] of [[11, 0.52, 0.98, '#ea8fb2', 0], [9, 0.46, 0.62, '#e4769f', 0.3], [7, 0.36, 0.28, '#d95f8d', 0.1]]) {
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + off;
      const g = new THREE.SphereGeometry(1, 8, 5).scale(len * 0.33, len * 0.62, len * 0.1).translate(0, len * 0.56, 0).rotateX(tilt).rotateY(a).translate(bx, by, bz);
      parts.push(lift(paint(g, c, (_, py) => 0.92 + 0.3 * Math.max(0, Math.min(1, (py - by) / (len * 0.9)))), 0.7));
    }
  }
  parts.push(paint(new THREE.CylinderGeometry(0.11, 0.08, 0.1, 9).translate(bx, by + 0.12, bz), '#e5c54a'));
  // hai nụ và một gương sen
  for (const [x, z, h, s] of [[-0.5, -0.1, 1.28, 1], [0.48, -0.15, 1.08, 0.8]]) {
    stem(x, z, h);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; parts.push(paint(new THREE.SphereGeometry(1, 6, 4).scale(0.08 * s, 0.2 * s, 0.05 * s).translate(0, 0.17 * s, 0.03).rotateY(a).translate(x, h, z), '#ee8fb3', (_, py) => 0.85 + 0.6 * Math.max(0, (py - h) / (0.36 * s)))); }
  }
  stem(-0.1, 0.55, 1.02);
  parts.push(paint(new THREE.CylinderGeometry(0.13, 0.06, 0.1, 9).translate(-0.1, 1.06, 0.55), '#8e9a4f'));
  return { geo: merge(parts), top: 2.15, view: { y: 0.95, dist: 5.6 }, fruitR: 0.085, fruit: [[0.56, 0.87, 0.34], [-0.6, 0.87, 0.26], [-0.14, 0.87, -0.6], [0.58, 0.87, -0.42]] };
}

const BUILD = { bode, sala, sen };
const made = {};
export const PLANT_KIND = { cay_bode: 'bode', cay_sala: 'sala', cay_sen: 'sen' };
// Hình dùng chung suốt phiên, không tự huỷ
export const plantDef = (kind) => (made[kind] ||= BUILD[kind]());
export const plantMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.FrontSide });
export const fruitMaterial = () => new THREE.MeshStandardMaterial({ color: '#f0c64a', roughness: 0.32, metalness: 0.15, emissive: '#a87a10', emissiveIntensity: 0.75 });
export const fruitGeo = (spots, r = 0.2) => {
  const list = spots.map(([x, y, z]) => paint(new THREE.SphereGeometry(r, 10, 7).scale(1, 1.12, 1).translate(x, y, z), '#ffffff'));
  return merge(list);
};
