// Gọi API + lưu token
const KEY = 'niemphat:token';
export const token = {
  get: () => localStorage.getItem(KEY),
  set: (t) => localStorage.setItem(KEY, t),
  clear: () => localStorage.removeItem(KEY),
};

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  const t = token.get();
  if (t) headers.authorization = 'Bearer ' + t;
  const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (data?.maintenance) dispatchEvent(new Event('np-maintenance'));
    const err = new Error(data?.error || 'Lỗi kết nối');
    err.status = res.status;
    throw err;
  }
  return data;
}

// Máy chủ giới hạn /practice 1 lượt/giây mỗi tài khoản: lạy, hạt, mõ, ngồi tĩnh... chạy bằng các bộ hẹn giờ riêng
// nên hay gửi sát nhau. Xếp hàng và giãn cách để không dính 429.
const PRACTICE_GAP = 1200;
let practiceNext = 0; // mốc sớm nhất được gửi lượt kế tiếp; chia lượt theo giờ, không chờ lượt trước xong nên không kẹt khi mạng treo
export const post = async (path, body) => {
  if (path === '/practice') {
    const at = Math.max(Date.now(), practiceNext);
    practiceNext = at + PRACTICE_GAP;
    if (at > Date.now()) await new Promise((r) => setTimeout(r, at - Date.now()));
  }
  return api(path, { method: 'POST', body });
};

// Mã thử thách tạo tài khoản: lấy sẵn khi mở app, máy chủ chỉ nhận mã đã lấy ít nhất 2 giây
let proof = null;
const loadProof = () => { proof = { at: Date.now(), c: api('/challenge').then((r) => r.c) }; proof.c.catch(() => { proof = null; }); };
export function prepareProof() { if (!proof) loadProof(); }
export async function takeProof() {
  if (!proof || Date.now() - proof.at > 5 * 36e5) loadProof();
  const { at, c } = proof, code = await c;
  await new Promise((r) => setTimeout(r, Math.max(0, at + 2200 - Date.now())));
  loadProof();
  return code;
}

export const local = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('niemphat:' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('niemphat:' + k, JSON.stringify(v)),
};
