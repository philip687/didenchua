// Dựng chánh điện theo "theme" của từng chùa (lưu trong DB, admin chỉnh được tên/mô tả).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { floorTex, rockTex, muralTex, softDot, rand } from './textures.js';
import { buildStatue } from './statues.js';
import { buildSurroundings } from './exterior.js';
import { lotusPad, lotusPadColor, makeLotusPetals } from './lotus.js';
import { cushionGeo, cushionColor, cushionMaterial, cushionMap, setCushionFabric, rugTex } from './cushion.js';

function mk(geo, mat, x = 0, y = 0, z = 0, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (o.scale) m.scale.set(...o.scale);
  if (o.rot) m.rotation.set(...o.rot);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  return m;
}

const WALL = {
  wood: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }),
  lacquer: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }),
  plaster: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }),
  bronze: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.6 }),
  khmer: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }),
};
const FRAME = { wood: '#3a2416', lacquer: '#5a1208', plaster: '#6a4a30', bronze: '#4a3820', khmer: '#b07a18' };

export function buildTemple(scene, theme, quality = 'high') {
  const g = new THREE.Group();
  scene.add(g);
  const [W, D, H] = theme.size;
  const hw = W / 2, hd = D / 2;
  const isCave = theme.wall === 'rock';
  const flames = [], updaters = [];

  const hq = quality === 'high';
  // thế giới bên ngoài (trời, núi, nước, cây…) + nền trời/sương cho scene
  const sur = buildSurroundings(scene, theme, quality);

  /* ---------- ánh sáng ---------- */
  const hemi = new THREE.HemisphereLight(theme.light?.hemi || '#ffe2b8', '#2a1a10', hq ? 0.72 : 0.6);
  // nắng thật theo hướng mặt trời của cảnh; khi có bóng đổ, tường & mái che nắng nên chỉ lọt qua cửa
  const keyI = theme.light?.key ?? 1.4;
  const sun = new THREE.DirectionalLight(sur.sun.color, hq ? sur.sun.intensity : keyI);
  sun.position.copy(sur.sun.dir).multiplyScalar(70);
  sun.castShadow = hq;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(W, D) * 0.95;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  if (!hq) sur.boostSun(Math.max(0, sur.sun.intensity - keyI));
  const altarZ = -hd + 2.6;
  const spot = new THREE.SpotLight('#ffd99a', 60 * (H / 9), H * 3.5, 0.55, 0.6, 1.5);
  spot.position.set(0, H - 0.5, altarZ + 8);
  spot.target.position.set(0, 3, altarZ);
  g.add(hemi, sun, spot, spot.target);

  /* ---------- sàn ---------- */
  const fmat = new THREE.MeshStandardMaterial({ map: floorTex(theme.floor, [W, D]), roughness: theme.floor === 'wood' ? 0.55 : 0.75 });
  g.add(mk(new THREE.PlaneGeometry(W, D), fmat, 0, 0, 0, { rot: [-Math.PI / 2, 0, 0], cast: false }));

  /* ---------- tường / hang đá ---------- */
  if (isCave) {
    const A = hw + 1.5, Cz = hd + 1.5, M = sur.mouth;
    const geo = new THREE.SphereGeometry(1, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + Math.sin(x * 7 + z * 3) * 0.05 + Math.sin(y * 11 + x * 5) * 0.04 + Math.cos(z * 9) * 0.04;
      pos.setXYZ(i, x * n, y * n, z * n);
    }
    // khoét cửa động phía trước (bỏ các tam giác nằm trong elip miệng hang)
    const idx = geo.index.array, keep = [];
    const inMouth = (i) => {
      const wx = pos.getX(i) * A, wy = pos.getY(i) * H - 0.3, wz = pos.getZ(i) * Cz;
      return wz > 0 && (wx / (M.rx * 1.06)) ** 2 + ((wy - M.cy) / (M.ry * 1.06)) ** 2 < 1;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (inMouth(a) || inMouth(b) || inMouth(c)) continue;
      keep.push(a, b, c);
    }
    geo.setIndex(keep);
    geo.computeVertexNormals();
    const rock = new THREE.MeshStandardMaterial({ map: rockTex(), color: theme.wallColor, roughness: 0.95, side: THREE.BackSide, shadowSide: THREE.DoubleSide });
    const dome = mk(geo, rock, 0, -0.3, 0, { scale: [A, H, Cz], cast: true });
    g.add(dome);
    // đường hầm cửa động nối vòm hang với vách núi bên ngoài
    const tun = [], tIdx = [], K = 10, S = 48;
    for (let k = 0; k <= K; k++) {
      const t = k / K;
      for (let j = 0; j <= S; j++) {
        const a = (j / S) * Math.PI * 2;
        const wob = 1.3 + 0.08 * Math.sin(a * 3 + k * 1.3) + 0.04 * Math.sin(a * 7 - k);
        const x = Math.cos(a) * M.rx * wob, y = Math.max(-0.4, M.cy + Math.sin(a) * M.ry * wob);
        // điểm khởi đầu nằm ngay trên mặt vòm (cùng hàm nhiễu với vòm) để ống không lòi vào trong hang
        const ux = x / A, uy = (y + 0.3) / H, uz = Math.sqrt(Math.max(0.02, 1 - ux * ux - uy * uy));
        const nn = (1 + Math.sin(ux * 7 + uz * 3) * 0.05 + Math.sin(uy * 11 + ux * 5) * 0.04 + Math.cos(uz * 9) * 0.04) * 1.0;
        const sx = ux * nn * A, sy = uy * nn * H - 0.3, sz = uz * nn * Cz;
        tun.push(THREE.MathUtils.lerp(sx, x, t), THREE.MathUtils.lerp(sy, y, t), THREE.MathUtils.lerp(sz, M.z + 0.6, t));
      }
    }
    for (let k = 0; k < K; k++) for (let j = 0; j < S; j++) { const a = k * (S + 1) + j, b = a + S + 1; tIdx.push(a, b, a + 1, b, b + 1, a + 1); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tun, 3));
    const tuv = []; for (let i = 0; i < tun.length; i += 3) tuv.push(tun[i] * 0.15 + tun[i + 2] * 0.1, tun[i + 1] * 0.15);
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
    tg.setIndex(tIdx); tg.computeVertexNormals();
    g.add(mk(tg, new THREE.MeshStandardMaterial({ map: rockTex(), color: theme.wallColor, roughness: 0.95, shadowSide: THREE.DoubleSide }), 0, 0, 0, { cast: true }));
    // nền đá nối ra bậc thềm ngoài cửa động
    g.add(mk(new THREE.PlaneGeometry(M.rx * 2.6, M.z - hd + 3), new THREE.MeshStandardMaterial({ map: floorTex(theme.floor, [M.rx * 2.6, M.z - hd + 3]), roughness: 0.8 }), 0, 0.004, (hd + M.z) / 2 + 0.5, { rot: [-Math.PI / 2, 0, 0], cast: false }));
    // nhũ đá
    const sm = new THREE.MeshStandardMaterial({ color: '#8a8070', roughness: 0.6 });
    for (let i = 0; i < (hq ? 70 : 35); i++) {
      const x = rand(-hw, hw), z = rand(-hd, hd);
      const r = Math.hypot(x / A, z / Cz);
      if (r > 0.95) continue;
      if (z > 0 && Math.abs(x) < M.rx * 1.2 && r > 0.6) continue;
      const top = H * Math.sqrt(Math.max(0.05, 1 - r * r)) * 0.95 - 0.3;
      const len = rand(0.6, 2.6);
      g.add(mk(new THREE.ConeGeometry(rand(0.08, 0.3), len, 8), sm, x, top - len / 2, z, { rot: [Math.PI, 0, 0], cast: false }));
    }
    const mouthLight = new THREE.PointLight('#e8ffe0', 30, 30, 1.2);
    mouthLight.position.set(0, 4, hd - 1);
    g.add(mouthLight);
  } else {
    const wm = WALL[theme.wall](theme.wallColor);
    const outerM = sur.outerWallMaterial;
    const frameCol = FRAME[theme.wall] || '#3a2416';
    const T = 0.4;
    const winH = Math.min(3.8, H * 0.42), winY = Math.min(H * 0.5, 4.4);
    const nWin = Math.max(2, Math.round(D / 7));
    // các ô cửa thật (u: toạ độ dọc tường theo trục thế giới, v0: chân cửa)
    const walls = {
      back: { U: new THREE.Vector3(1, 0, 0), N: new THREE.Vector3(0, 0, -1), o: new THREE.Vector3(0, 0, -hd), len: W, holes: [] },
      front: { U: new THREE.Vector3(1, 0, 0), N: new THREE.Vector3(0, 0, 1), o: new THREE.Vector3(0, 0, hd), len: W, holes: [] },
      right: { U: new THREE.Vector3(0, 0, 1), N: new THREE.Vector3(1, 0, 0), o: new THREE.Vector3(hw, 0, 0), len: D, holes: [] },
      left: { U: new THREE.Vector3(0, 0, 1), N: new THREE.Vector3(-1, 0, 0), o: new THREE.Vector3(-hw, 0, 0), len: D, holes: [] },
    };
    for (const side of ['left', 'right']) for (let i = 0; i < nWin; i++) {
      const z = -hd + 3 + ((D - 5) / nWin) * (i + 0.5);
      if (z < altarZ + 1.5 && !theme.windowsAllSides) continue;
      walls[side].holes.push({ u: z, v0: winY - winH / 2, w: Math.min(4.2, D / nWin - 1), h: winH, win: true });
    }
    const doorW = Math.min(6, W * 0.3), doorH = Math.min(5, H * 0.6);
    walls.front.holes.push({ u: 0, v0: 0, w: doorW, h: doorH, door: true });
    if (theme.windowsAllSides) for (const x of [-hw * 0.6, hw * 0.6]) walls.front.holes.push({ u: x, v0: winY - winH / 2, w: Math.min(W * 0.26, 3.6), h: winH, win: true });

    const UP = new THREE.Vector3(0, 1, 0);
    function wallFace(wl, zdir, len, height, mat, offset) {
      const x = new THREE.Vector3().crossVectors(UP, zdir);
      const flip = x.dot(wl.U) < 0;
      const holes = wl.holes.map((h) => ({ ...h, u: flip ? -h.u : h.u }));
      const sh = new THREE.Shape();
      sh.moveTo(-len / 2, 0);
      for (const h of holes.filter((q) => q.v0 <= 0.01).sort((a, b) => a.u - b.u)) {
        sh.lineTo(h.u - h.w / 2, 0); sh.lineTo(h.u - h.w / 2, h.h); sh.lineTo(h.u + h.w / 2, h.h); sh.lineTo(h.u + h.w / 2, 0);
      }
      sh.lineTo(len / 2, 0); sh.lineTo(len / 2, height); sh.lineTo(-len / 2, height); sh.closePath();
      for (const h of holes.filter((q) => q.v0 > 0.01)) {
        const p = new THREE.Path();
        p.moveTo(h.u - h.w / 2, h.v0); p.lineTo(h.u + h.w / 2, h.v0); p.lineTo(h.u + h.w / 2, h.v0 + h.h); p.lineTo(h.u - h.w / 2, h.v0 + h.h); p.closePath();
        sh.holes.push(p);
      }
      const geo = new THREE.ShapeGeometry(sh, 4);
      const m = new THREE.Matrix4().makeBasis(x, UP, zdir).setPosition(wl.o.clone().addScaledVector(wl.N, offset));
      geo.applyMatrix4(m);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = offset > 0; mesh.receiveShadow = true;
      return mesh;
    }
    const frameParts = [], barParts = [];
    const box = (wl, u, v, du, dv, dn, n = T / 2) => {
      const gb = wl.U.x ? new THREE.BoxGeometry(du, dv, dn) : new THREE.BoxGeometry(dn, dv, du);
      const c = wl.o.clone().addScaledVector(wl.U, u).addScaledVector(wl.N, n); c.y = v;
      gb.translate(c.x, c.y, c.z);
      return gb;
    };
    const doorMat = new THREE.MeshStandardMaterial({ color: theme.wall === 'khmer' ? '#7a1e10' : theme.wall === 'plaster' ? '#7a3a1e' : '#5a160c', roughness: 0.5 });
    const doorLeaves = [];
    for (const wl of Object.values(walls)) {
      g.add(wallFace(wl, wl.N.clone().negate(), wl.len, H, wm, 0));
      g.add(wallFace(wl, wl.N.clone(), wl.len + 2 * T, H + 0.1, outerM, T));
      for (const h of wl.holes) {
        const d = T + 0.14;
        frameParts.push(box(wl, h.u - h.w / 2 - 0.06, h.v0 + h.h / 2, 0.2, h.h + 0.2, d), box(wl, h.u + h.w / 2 + 0.06, h.v0 + h.h / 2, 0.2, h.h + 0.2, d));
        frameParts.push(box(wl, h.u, h.v0 + h.h + 0.08, h.w + 0.44, 0.22, d + 0.04));
        if (h.win) {
          frameParts.push(box(wl, h.u, h.v0 - 0.06, h.w + 0.5, 0.14, T + 0.34));
          frameParts.push(box(wl, h.u, h.v0 + h.h * 0.78, h.w, 0.07, 0.08));
          const nb = Math.max(3, Math.floor(h.w / 0.34));
          for (let k = 1; k < nb; k++) {
            const cb = new THREE.CylinderGeometry(0.035, 0.035, h.h, 6);
            const c = wl.o.clone().addScaledVector(wl.U, h.u - h.w / 2 + (h.w * k) / nb).addScaledVector(wl.N, T / 2);
            cb.translate(c.x, h.v0 + h.h / 2, c.z);
            barParts.push(cb);
          }
        }
        if (h.door) {
          // hai cánh cửa mở toang ra hiên
          for (const s of [-1, 1]) {
            const lw = h.w / 2;
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.08, h.h * 0.98, lw), doorMat);
            const c = wl.o.clone().addScaledVector(wl.U, h.u + s * (h.w / 2 + 0.05)).addScaledVector(wl.N, T + lw / 2 + 0.05);
            leaf.position.set(c.x, h.h / 2, c.z);
            leaf.castShadow = true; leaf.receiveShadow = true;
            doorLeaves.push(leaf);
          }
        }
        if (theme.wall === 'khmer' && h.win) {
          const tri = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 3), new THREE.MeshStandardMaterial({ color: '#f0c050', metalness: 0.6, roughness: 0.35 }));
          const c = wl.o.clone().addScaledVector(wl.U, h.u).addScaledVector(wl.N, -0.06);
          tri.position.set(c.x, h.v0 + h.h + 0.7, c.z);
          tri.rotation.set(0, wl.U.x ? 0 : Math.PI / 2, 0); tri.scale.set(1, 1, 0.05);
          g.add(tri);
        }
      }
    }
    const fm = new THREE.MeshStandardMaterial({ color: theme.wall === 'khmer' ? '#c8901e' : frameCol, roughness: 0.6, metalness: theme.wall === 'khmer' || theme.wall === 'bronze' ? 0.5 : 0 });
    const frames = new THREE.Mesh(mergeGeometries(frameParts), fm);
    frames.castShadow = true; frames.receiveShadow = true;
    g.add(frames);
    if (barParts.length) {
      const bars = new THREE.Mesh(mergeGeometries(barParts), fm);
      bars.castShadow = true;
      g.add(bars);
    }
    frameParts.concat(barParts).forEach((x) => x.dispose());
    doorLeaves.forEach((l) => g.add(l));
    // tranh vách
    if (theme.mural) {
      g.add(mk(new THREE.PlaneGeometry(W * 0.92, H * 0.8), new THREE.MeshStandardMaterial({ map: muralTex(theme.mural), roughness: 0.8 }), 0, H * 0.52, -hd + 0.05, { cast: false }));
    }
    // dầm ngang
    const beamM = new THREE.MeshStandardMaterial({ color: theme.roof || '#3a2216', roughness: 0.8 });
    if (theme.wall !== 'plaster') for (const s of [-1, 1]) for (const y of [winY - winH / 2 - 0.3, winY + winH / 2 + 0.3]) {
      g.add(mk(new THREE.BoxGeometry(0.3, 0.35, D), beamM, s * (hw - 0.15), y, 0, { cast: false }));
    }
    // trần
    g.add(mk(new THREE.PlaneGeometry(W, D), beamM, 0, H, 0, { rot: [Math.PI / 2, 0, 0], cast: false }));
    for (let z = -hd + 1; z < hd; z += 3) g.add(mk(new THREE.BoxGeometry(W, 0.5, 0.4), beamM, 0, H - 0.3, z, { cast: false }));
    if (theme.wall === 'lacquer' || theme.wall === 'khmer') {
      const trim = new THREE.MeshStandardMaterial({ color: '#e0b050', metalness: 0.7, roughness: 0.3 });
      for (const s of [-1, 1]) g.add(mk(new THREE.BoxGeometry(0.1, 0.12, D), trim, s * (hw - 0.05), H - 0.9, 0, { cast: false }));
      g.add(mk(new THREE.BoxGeometry(W, 0.12, 0.1), trim, 0, H - 0.9, -hd + 0.06, { cast: false }));
    }
    if (theme.wall === 'bronze') {
      const relief = new THREE.MeshStandardMaterial({ color: '#a07a40', metalness: 0.75, roughness: 0.35 });
      for (let i = -3; i <= 3; i++) g.add(mk(new THREE.BoxGeometry(1.4, 1.8, 0.12), relief, i * (W / 7), H * 0.78, -hd + 0.08, { cast: false }));
    }
  }

  /* ---------- cột ---------- */
  if (theme.pillar) {
    const pm = new THREE.MeshStandardMaterial({ color: theme.pillar, roughness: 0.5, metalness: theme.wall === 'bronze' ? 0.6 : 0 });
    const bm = new THREE.MeshStandardMaterial({ color: '#9c6a22', metalness: 0.8, roughness: 0.4 });
    const colGeo = new THREE.CylinderGeometry(0.42, 0.48, H, 24), baseGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.35, 24);
    const xs = W > 14 ? [-(hw - 2.2), hw - 2.2] : [-(hw - 1.2), hw - 1.2];
    for (const x of xs) for (let z = -hd + 3; z < hd - 1; z += Math.max(5, D / 4)) {
      g.add(mk(colGeo, pm, x, H / 2, z), mk(baseGeo, bm, x, 0.17, z));
    }
  }

  /* ---------- đèn lồng / đèn dầu ---------- */
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#ffb36b', emissive: '#ff8a3a', emissiveIntensity: 1.2 });
  if (!isCave) {
    for (const [x, z] of [[-W * 0.22, -D * 0.12], [W * 0.22, -D * 0.12], [-W * 0.22, D * 0.2], [W * 0.22, D * 0.2]]) {
      g.add(mk(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 16), lanternMat, x, H - 2, z, { cast: false }));
      g.add(mk(new THREE.CylinderGeometry(0.01, 0.01, 1.4), lanternMat, x, H - 0.9, z, { cast: false }));
    }
  } else {
    for (const [x, z] of [[-hw + 2, -2], [hw - 2, -2], [-hw + 2, 5], [hw - 2, 5]]) {
      g.add(mk(new THREE.CylinderGeometry(0.2, 0.25, 0.4, 12), lanternMat, x, 0.2, z, { cast: false }));
    }
  }
  for (const s of [-1, 1]) {
    const fill = new THREE.PointLight(theme.light?.warm || '#ffa860', 8 * (W / 24), Math.max(W, D) * 0.7, 1.6);
    fill.position.set(s * W * 0.22, H - 2.4, 0);
    g.add(fill);
  }

  /* ---------- bệ thờ & tượng ---------- */
  const statues = theme.statues || [];
  const span = Math.max(...statues.map((s) => Math.abs(s.x)), 0);
  const altarW = Math.min(W - 2, span * 2 + 6.5), altarH = isCave ? 1.0 : 1.3;
  if (isCave) {
    g.add(mk(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ map: rockTex(), color: '#7a7064', roughness: 0.9 }), 0, altarH / 2, altarZ, { scale: [altarW / 2, altarH / 2 + 0.2, 2] }));
  } else {
    const lac = new THREE.MeshStandardMaterial({ color: theme.wall === 'khmer' ? '#a8401a' : '#4e140d', roughness: 0.45 });
    const gold = new THREE.MeshStandardMaterial({ color: '#d9a443', metalness: 0.85, roughness: 0.3 });
    g.add(mk(new THREE.BoxGeometry(altarW, altarH, 3.4), lac, 0, altarH / 2, altarZ));
    g.add(mk(new THREE.BoxGeometry(altarW + 0.1, 0.12, 3.5), gold, 0, altarH, altarZ), mk(new THREE.BoxGeometry(altarW + 0.1, 0.12, 3.5), gold, 0, 0.06, altarZ));
  }
  for (const s of statues) {
    const st = buildStatue(s.kind, s.mat);
    st.scale.setScalar(s.scale || 1);
    st.position.set(s.x || 0, altarH + 0.05, altarZ);
    g.add(st);
  }

  /* ---------- bàn lễ: nến, hoa, lư hương ---------- */
  const tz = altarZ + 2.6;
  const tm = new THREE.MeshStandardMaterial({ color: isCave ? '#5a4a3a' : '#4e140d', roughness: 0.5 });
  const goldT = new THREE.MeshStandardMaterial({ color: '#d9a443', metalness: 0.85, roughness: 0.3 });
  g.add(mk(new THREE.BoxGeometry(4.6, 0.9, 1.1), tm, 0, 0.45, tz), mk(new THREE.BoxGeometry(4.7, 0.08, 1.2), goldT, 0, 0.92, tz));
  const candleM = new THREE.MeshStandardMaterial({ color: '#f2e6d0', roughness: 0.6 });
  const flameM = new THREE.MeshBasicMaterial({ color: '#ffd27a' });
  for (const x of [-1.8, 1.8]) {
    g.add(mk(new THREE.CylinderGeometry(0.15, 0.2, 0.25, 16), goldT, x, 1.08, tz), mk(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 16), candleM, x, 1.55, tz));
    const f = mk(new THREE.SphereGeometry(0.07, 12, 8), flameM, x, 2.0, tz, { scale: [1, 2, 1], cast: false });
    const pl = new THREE.PointLight('#ffb060', 3, 7, 1.8);
    pl.position.set(x, 2.15, tz + 0.2);
    g.add(f, pl);
    flames.push({ f, pl, base: 3 });
  }
  const flowerGroup = new THREE.Group();
  g.add(flowerGroup);
  const vaseM = new THREE.MeshStandardMaterial({ color: '#5a8a8a', roughness: 0.3 });
  const stemM = new THREE.MeshStandardMaterial({ color: '#3d6b2c' });
  const lotusM = new THREE.MeshStandardMaterial({ color: '#f2a5b8', roughness: 0.6 });
  const mumM = new THREE.MeshStandardMaterial({ color: '#f2c030', roughness: 0.6 });
  function vase(x, flowerMat) {
    const v = new THREE.Group();
    v.add(mk(new THREE.LatheGeometry([0.05, 0.22, 0.25, 0.12, 0.16].map((r, i) => new THREE.Vector2(r, i * 0.18)), 20), vaseM, x, 0.96, tz));
    for (let k = 0; k < 3; k++) {
      v.add(mk(new THREE.CylinderGeometry(0.015, 0.015, 0.7), stemM, x + (k - 1) * 0.1, 1.95, tz, { cast: false }));
      v.add(mk(new THREE.SphereGeometry(0.11, 12, 10), flowerMat, x + (k - 1) * 0.1, 2.32 + (k % 2) * 0.1, tz, { scale: [1, 1.4, 1] }));
    }
    return v;
  }
  flowerGroup.add(vase(-1, lotusM), vase(1, lotusM));
  g.add(mk(new THREE.CylinderGeometry(0.3, 0.22, 0.3, 24), goldT, 0, 1.11, tz + 0.1));
  const stickM = new THREE.MeshStandardMaterial({ color: '#a83a2a' });
  const emberM = new THREE.MeshBasicMaterial({ color: '#ff5a1a' });
  const tips = [];
  function addStick(dx, dz = 0) {
    g.add(mk(new THREE.CylinderGeometry(0.008, 0.008, 0.9), stickM, dx, 1.7, tz + 0.1 + dz, { rot: [dz * 0.6, 0, -dx * 0.6], cast: false }));
    g.add(mk(new THREE.SphereGeometry(0.015, 6, 6), emberM, dx * 1.25, 2.15, tz + 0.1 + dz * 1.25, { cast: false }));
    tips.push(new THREE.Vector3(dx * 1.25, 2.15, tz + 0.1 + dz * 1.25));
  }
  [-0.08, 0, 0.08].forEach((dx) => addStick(dx));

  // khói hương
  const smokeMat = new THREE.SpriteMaterial({ map: softDot(), color: '#d9d2c8', transparent: true, depthWrite: false, opacity: 0.2 });
  const smoke = [];
  function spawnSmoke(n) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData = { tip: tips[(smoke.length + i) % tips.length], life: Math.random() * 4 };
      g.add(s); smoke.push(s);
    }
  }
  spawnSmoke(isCave ? 60 : 36);
  updaters.push((dt) => {
    for (const s of smoke) {
      const u = s.userData;
      u.life += dt; if (u.life > 4) { u.life = 0; u.tip = tips[Math.floor(Math.random() * tips.length)]; }
      const k = u.life / 4;
      s.position.set(u.tip.x + Math.sin(u.life * 2 + u.tip.x * 40) * 0.12 * k, u.tip.y + k * 2.2, u.tip.z + Math.cos(u.life * 1.5) * 0.06 * k);
      const sc = 0.06 + k * 0.45; s.scale.set(sc, sc, sc);
      s.material.opacity = 0.22 * Math.sin(k * Math.PI);
    }
  });

  /* ---------- chi tiết đặc thù ---------- */
  const extras = theme.extras || [];
  if (extras.includes('bamboo')) {
    const bm = new THREE.MeshStandardMaterial({ color: '#5f8a3a', roughness: 0.6 });
    const lm = new THREE.MeshStandardMaterial({ color: '#4a7a30', roughness: 0.7, side: THREE.DoubleSide });
    for (const [cx, cz] of [[-hw + 1.2, -hd + 1.2], [hw - 1.2, -hd + 1.2], [-hw + 1.2, hd - 1.5], [hw - 1.2, hd - 1.5]]) {
      g.add(mk(new THREE.CylinderGeometry(0.6, 0.45, 0.6, 16), new THREE.MeshStandardMaterial({ color: '#6a4a30' }), cx, 0.3, cz));
      for (let i = 0; i < 6; i++) {
        const h = rand(3, H - 1.5), x = cx + rand(-0.3, 0.3), z = cz + rand(-0.3, 0.3);
        g.add(mk(new THREE.CylinderGeometry(0.04, 0.05, h, 8), bm, x, h / 2 + 0.5, z));
        for (let k = 0; k < 4; k++) g.add(mk(new THREE.PlaneGeometry(0.12, 0.6), lm, x + rand(-0.3, 0.3), h * rand(0.6, 1) + 0.5, z + rand(-0.3, 0.3), { rot: [rand(-1, 1), rand(0, 3), rand(-1, 1)], cast: false }));
      }
    }
  }
  if (extras.includes('naga')) {
    const nm = new THREE.MeshStandardMaterial({ color: '#4a9a5a', metalness: 0.5, roughness: 0.35 });
    const crest = new THREE.MeshStandardMaterial({ color: '#f0c050', metalness: 0.7, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push(new THREE.Vector3(s * (altarW / 2 + 0.4 + Math.sin(t * 6) * 0.25), 0.3 + t * 3.2, altarZ + 3 - t * 3)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(mk(new THREE.TubeGeometry(curve, 60, 0.22, 12), nm));
      const head = pts.at(-1);
      g.add(mk(new THREE.SphereGeometry(0.35, 16, 12), nm, head.x, head.y + 0.2, head.z + 0.2, { scale: [1, 0.8, 1.3] }));
      for (let k = -2; k <= 2; k++) g.add(mk(new THREE.ConeGeometry(0.12, 0.6, 8), crest, head.x + k * 0.18, head.y + 0.6, head.z, { rot: [0, 0, k * 0.25] }));
    }
  }
  if (extras.includes('haze')) scene.fog = new THREE.Fog(theme.fog, 8, Math.max(W, D) * 1.4);

  /* ---------- bồ đoàn ---------- */
  const cushions = [];
  const c = theme.cushions;
  const matGeo = new THREE.BoxGeometry(1.5, 0.03, 1.5), cuGeo = cushionGeo();
  const matM = new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1 });
  const matGeos = [];
  for (let r = 0; r < c.rows; r++) for (const x of c.cols) {
    const z = c.z0 + r * c.dz;
    const cm = cushionMaterial();
    const mesh = mk(cuGeo, cm, x, 0.095, z);
    const petals = new THREE.Group();
    petals.position.set(x, 0, z);
    petals.visible = false;
    matGeos.push(matGeo.clone().translate(x, 0.015, z));
    g.add(mesh, petals);
    cushions.push({ index: cushions.length, pos: new THREE.Vector3(x, 0, z), mesh, petals, occupant: null });
  }
  // thảm lót dưới bồ đoàn gộp thành một khối → 1 lượt vẽ cho cả chánh điện
  if (matGeos.length) { g.add(mk(mergeGeometries(matGeos), matM, 0, 0, 0, { cast: false })); matGeos.forEach((x) => x.dispose()); }

  /* ---------- bia Bảng vàng tinh tấn ---------- */
  const steleCanvas = document.createElement('canvas');
  steleCanvas.width = 512; steleCanvas.height = 768;
  const steleTex = new THREE.CanvasTexture(steleCanvas);
  steleTex.colorSpace = THREE.SRGBColorSpace;
  // Đặt bia cạnh bệ thờ, phía trong hàng cột, trước hàng bồ đoàn đầu; nâng cao và xoay về giữa điện để không bị cột/người ngồi che
  const pillarX = W > 14 ? hw - 2.2 : hw - 1.2;
  const sx = -Math.max(1.8, Math.min(pillarX - 1.7, altarW / 2 + 1.8));
  const sz = Math.min(altarZ + 2.4, (c.z0 ?? altarZ + 4) - 1.4);
  const stele = new THREE.Group();
  stele.position.set(sx, 0, sz);
  stele.rotation.y = 0.45; // nghiêng về phía người đứng giữa điện
  const stoneM = new THREE.MeshStandardMaterial({ color: '#5e5548', roughness: 0.8 });
  const goldM = new THREE.MeshStandardMaterial({ color: '#c8963e', metalness: 0.8, roughness: 0.35 });
  stele.add(mk(new THREE.BoxGeometry(2.9, 1.1, 1.1), stoneM, 0, 0.55, 0));           // bệ
  stele.add(mk(new THREE.BoxGeometry(3.1, 0.12, 1.2), goldM, 0, 1.12, 0));
  stele.add(mk(new THREE.BoxGeometry(2.5, 3.6, 0.32), stoneM, 0, 2.95, 0));          // thân bia
  stele.add(mk(new THREE.CylinderGeometry(1.25, 1.25, 0.32, 40, 1, false, -Math.PI / 2, Math.PI), stoneM, 0, 4.75, 0, { rot: [-Math.PI / 2, 0, 0] })); // đỉnh bia bán nguyệt
  const face = mk(new THREE.PlaneGeometry(2.25, 3.35), new THREE.MeshStandardMaterial({ map: steleTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: steleTex, emissiveIntensity: 0.35 }), 0, 2.95, 0.17, { cast: false });
  stele.add(face);
  const steleLight = new THREE.SpotLight('#ffd9a0', 6, 7, 0.6, 0.5, 1.5);
  steleLight.position.set(0, 6, 2.6); steleLight.target = face; stele.add(steleLight);
  g.add(stele);
  function drawStele(rows = [], subtitle = '') {
    const c = steleCanvas.getContext('2d'), w = 512, h = 768;
    const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#3a2a1a'); bg.addColorStop(1, '#1e140c');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9a645'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 2; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = '#f6d27e'; c.textAlign = 'center';
    c.font = '700 44px Georgia, serif'; c.fillText('BẢNG VÀNG', w / 2, 100);
    c.font = '600 30px Georgia, serif'; c.fillText('TINH TẤN TUẦN NÀY', w / 2, 146);
    c.font = '400 22px Georgia, serif'; c.fillStyle = '#c9a76a'; c.fillText(subtitle, w / 2, 182);
    c.fillStyle = '#d9a645'; c.fillRect(120, 204, w - 240, 2);
    if (!rows.length) { c.fillStyle = '#c9a76a'; c.font = 'italic 26px Georgia, serif'; c.fillText('Chưa có ai ghi danh.', w / 2, 330); c.fillText('Hãy là người đầu tiên!', w / 2, 370); }
    rows.slice(0, 5).forEach((r, i) => {
      const y = 270 + i * 92;
      const mc = ['#ffd36b', '#d9dde3', '#d89a62', '#8a6a3a', '#8a6a3a'][i];
      c.beginPath(); c.arc(76, y - 4, 22, 0, Math.PI * 2); c.fillStyle = mc; c.fill();
      c.textAlign = 'center'; c.font = '700 24px Georgia, serif'; c.fillStyle = i < 3 ? '#3a2205' : '#f3e2bc'; c.fillText(String(i + 1), 76, y + 4);
      c.textAlign = 'left';
      c.font = `${i === 0 ? 700 : 600} ${i === 0 ? 34 : 30}px Georgia, serif`; c.fillStyle = i === 0 ? '#ffe08a' : '#f3e2bc';
      let name = r.name; while (c.measureText(name).width > 260 && name.length > 3) name = name.slice(0, -2) + '…';
      c.fillText(name, 116, y);
      c.font = '20px Georgia, serif'; c.fillStyle = '#c9a76a'; c.fillText(r.title || '', 116, y + 30);
      c.textAlign = 'right'; c.font = '600 26px Georgia, serif'; c.fillStyle = '#f6d27e'; c.fillText(String(r.score), w - 54, y + 8);
    });
    steleTex.needsUpdate = true;
  }
  drawStele();

  /* ---------- Bia Pháp Ngữ: đối xứng với Bảng vàng, mỗi ngày một câu, chạm để đọc ---------- */
  const phapCanvas = document.createElement('canvas');
  phapCanvas.width = 512; phapCanvas.height = 768;
  const phapTex = new THREE.CanvasTexture(phapCanvas);
  phapTex.colorSpace = THREE.SRGBColorSpace;
  const phap = new THREE.Group();
  phap.position.set(-sx, 0, sz);
  phap.rotation.y = -0.45;
  phap.add(mk(new THREE.BoxGeometry(2.9, 1.1, 1.1), stoneM, 0, 0.55, 0));
  phap.add(mk(new THREE.BoxGeometry(3.1, 0.12, 1.2), goldM, 0, 1.12, 0));
  phap.add(mk(new THREE.BoxGeometry(2.5, 3.6, 0.32), stoneM, 0, 2.95, 0));
  phap.add(mk(new THREE.CylinderGeometry(1.25, 1.25, 0.32, 40, 1, false, -Math.PI / 2, Math.PI), stoneM, 0, 4.75, 0, { rot: [-Math.PI / 2, 0, 0] }));
  // không thêm đèn riêng cho bia này (đỡ nặng máy), tự sáng mạnh hơn để vẫn đọc được
  phap.add(mk(new THREE.PlaneGeometry(2.25, 3.35), new THREE.MeshStandardMaterial({ map: phapTex, roughness: 0.6, emissive: '#ffffff', emissiveMap: phapTex, emissiveIntensity: 0.6 }), 0, 2.95, 0.17, { cast: false }));
  g.add(phap);
  let phapShown = '';
  function drawPhap(q = {}) {
    if (q.text === phapShown) return;
    phapShown = q.text || '';
    const c = phapCanvas.getContext('2d'), w = 512, h = 768;
    const bg = c.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#4a1f16'); bg.addColorStop(1, '#23100b');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9a645'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 2; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = '#f6d27e'; c.textAlign = 'center';
    c.font = '700 44px Georgia, serif'; c.fillText('PHÁP NGỮ', w / 2, 100);
    c.font = '400 24px Georgia, serif'; c.fillStyle = '#c9a76a'; c.fillText('Lời dạy hôm nay', w / 2, 146);
    c.fillStyle = '#d9a645'; c.fillRect(120, 170, w - 240, 2);
    // chọn cỡ chữ lớn nhất mà câu vẫn nằm gọn trong khung
    const wrap = () => {
      const lines = []; let line = '';
      for (const word of phapShown.split(' ')) {
        if (line && c.measureText(`${line} ${word}`).width > 410) { lines.push(line); line = word; } else line = line ? `${line} ${word}` : word;
      }
      return line ? [...lines, line] : lines;
    };
    let size = 38, lines;
    for (; size >= 22; size -= 2) { c.font = `600 ${size}px Georgia, serif`; lines = wrap(); if (lines.length * size * 1.3 <= 400) break; }
    const lh = size * 1.3, top = 400 - (lines.length - 1) * lh / 2;
    c.fillStyle = '#f3e2bc';
    lines.forEach((l, i) => c.fillText(l, w / 2, top + i * lh));
    c.fillStyle = '#d9a645'; c.fillRect(120, 640, w - 240, 2);
    c.font = '400 22px Georgia, serif'; c.fillStyle = '#c9a76a'; c.fillText(q.source || '', w / 2, 680);
    c.font = '600 22px Georgia, serif'; c.fillStyle = '#ffe08a'; c.fillText('Chạm vào bia để đọc', w / 2, 716);
    phapTex.needsUpdate = true;
  }

  const bounds = { minX: -hw + 1, maxX: hw - 1, minZ: tz + 1.2, maxZ: hd - 1 };
  if (isCave) { bounds.minX *= 0.85; bounds.maxX *= 0.85; }

  let candleBoost = 0;
  return {
    group: g, cushions, bounds, altarZ, tableZ: tz, height: H,
    setStele: drawStele,
    steleFace: face,
    setPhap: drawPhap,
    phapStele: phap,
    // dữ liệu để đi ra ngoài: cảnh quan, cửa chính, nền đất
    outdoor: !isCave ? { group: sur.group, groundY: sur.groundY ?? 0, doorW: Math.min(6, W * 0.3), hw, hd, W, D, H, cable: sur.cable || null, walkR: sur.walkR || 0, walkOk: sur.walkOk || null, blocks: sur.blocks, noGarden: sur.noGarden, forest: sur.forest } : null,
    setCushionLook(cu, look) {
      const lotus = !!look?.lotus;
      cu.mesh.geometry = lotus ? lotusPad() : cuGeo;
      setCushionFabric(cu.mesh.material, !lotus);
      if (!lotus && cu.mesh.material.map !== cushionMap(look)) { cu.mesh.material.map = cushionMap(look); cu.mesh.material.needsUpdate = true; }
      if (lotus) cu.mesh.material.color.copy(lotusPadColor(look));
      else cu.mesh.material.color.set(cushionColor(look));
      cu.mesh.material.metalness = look?.metal || 0;
      cu.mesh.material.roughness = look?.metal ? 0.45 : 0.95;
      cu.petals.visible = lotus;
      if (lotus) {
        if (!cu.petals.children.length) cu.petals.add(makeLotusPetals(look.petal || '#d97a95'));
        const pm = cu.petals.children[0].material;
        pm.color.set(look.petal || look.color || '#d97a95');
        pm.metalness = (look.metal || 0) * 0.4;
      }
    },
    addIncense() { if (tips.length < 15) { addStick(rand(-0.2, 0.2), rand(-0.12, 0.12)); spawnSmoke(6); } },
    brightenCandles() { candleBoost = 600; },
    offerFlowers() { flowerGroup.children.forEach((v) => v.children.forEach((m) => { if (m.material === lotusM) m.material = mumM; })); setTimeout(() => flowerGroup.children.forEach((v) => v.children.forEach((m) => { if (m.material === mumM) m.material = lotusM; })), 600000); },
    update(dt, time) {
      candleBoost = Math.max(0, candleBoost - dt);
      const boost = candleBoost > 0 ? 2.2 : 1;
      for (const { f, pl, base } of flames) {
        const k = 1 + Math.sin(time * 13 + f.position.x) * 0.06 + Math.random() * 0.06;
        f.scale.set(boost > 1 ? 1.4 : 1, 2 * k * (boost > 1 ? 1.3 : 1), boost > 1 ? 1.4 : 1);
        pl.intensity = base * k * boost;
      }
      updaters.forEach((u) => u(dt, time));
      sur.update(dt, time);
    },
    dispose() {
      sur.dispose();
      scene.remove(g);
      g.traverse((o) => { o.geometry?.dispose?.(); if (o.material && !o.material.map?.isCanvasTextureCached) o.material.dispose?.(); });
    },
  };
}
