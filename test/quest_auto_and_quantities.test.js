import test from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient } from '../src/client.js';
import { renderDashboardHTML, state, TASKS_CATALOG } from '../server.js';

test('AUTO QUESTS: doPlant supports quantity and auto-completes remaining a_plant30', async () => {
  const client = new DiDenChuaClient();
  const sentPackets = [];
  let practiceCalls = 0;
  const claimedQuests = [];

  client.send = (pkt) => { sentPackets.push(pkt); };
  client.practice = async (type) => {
    practiceCalls++;
    return { gained: 15, questsDone: ['d_plant', 'a_plant30'] };
  };
  client.post = async (path) => {
    const m = path.match(/\/quests\/([^/]+)\/claim/);
    if (m) claimedQuests.push(m[1]);
    return { ok: true };
  };
  client.token = 'mock_jwt_token';
  client.config = { turbo: true };

  // 1. Explicit count = 3
  const res3 = await client.doPlant(3, { intervalMs: 1 });
  assert.equal(res3.ok, true);
  assert.equal(practiceCalls, 3, 'Must call practice 3 times for 3 trees');
  assert.ok(sentPackets.some(p => p.t === 'plant' && p.k === 'cuc'), 'Must send plant packet');
  assert.ok(claimedQuests.includes('a_plant30'), 'Must claim a_plant30');

  // 2. Auto-completion of remaining trees when a_plant30 has progress (e.g. 5/30)
  client.merit = {
    me: {
      quests: [
        { id: 'a_plant30', name: 'Người gieo bóng mát', need: 30, have: 5, claimed: false }
      ]
    }
  };
  practiceCalls = 0;
  claimedQuests.length = 0;

  // Default call with count=1 must auto-detect remaining: 30 - 5 = 25
  const resAuto = await client.doPlant(1, { intervalMs: 1 });
  assert.equal(practiceCalls, 25, 'Must plant remaining 25 trees in 1 auto run to reach 30/30');
  assert.ok(claimedQuests.includes('a_plant30'), 'Must claim a_plant30 upon auto completion');
});

test('AUTO QUESTS: doLoc auto-completes remaining w_loc15 in 1 run', async () => {
  const client = new DiDenChuaClient();
  const visits = [];
  const claimedQuests = [];

  client.send = (pkt) => {};
  client.doVisit = async (t) => { visits.push(t); };
  client.token = 'mock_jwt_token';
  client.config = { turbo: true };

  // Mock API returning spawns
  client.api = async (path) => {
    return {
      spawns: [
        { id: 1, x: 10, z: 10 },
        { id: 2, x: 20, z: 20 },
        { id: 3, x: 30, z: 30 }
      ]
    };
  };
  client.post = async (path, body) => {
    if (path === '/loc/claim') return { ok: true, label: 'Sen Vàng' };
    const m = path.match(/\/quests\/([^/]+)\/claim/);
    if (m) claimedQuests.push(m[1]);
    return { ok: true };
  };

  // User has 3/15 lotuses for w_loc15; remaining needed is 12
  client.merit = {
    me: {
      quests: [
        { id: 'w_loc15', name: 'Hành hương nhặt lộc', need: 15, have: 3, claimed: false }
      ]
    }
  };

  const res = await client.doLoc(2, { intervalMs: 1, temple: 'nhattru' });
  assert.equal(res.count, 12, 'Must calculate remaining 12 lotuses to complete w_loc15 in 1 run');
  assert.ok(claimedQuests.includes('w_loc15'), 'Must claim w_loc15');
});

test('AUTO QUESTS: doLayVongHai & doLayThatSon auto-calculate remaining bows (108 - progress)', async () => {
  const client = new DiDenChuaClient();
  let executedBows = 0;
  let targetTemple = null;
  const claimedQuests = [];

  client.token = 'mock_jwt_token';
  client.config = { turbo: true };
  client.send = () => {};
  client.doLay = async (count, options) => {
    executedBows = count;
    targetTemple = options.temple;
    return { ok: true };
  };
  client.post = async (path) => {
    const m = path.match(/\/quests\/([^/]+)\/claim/);
    if (m) claimedQuests.push(m[1]);
    return { ok: true };
  };

  // 1. Trăm lạy Vọng Hải with existing progress 30/108 (needed: 78)
  client.merit = {
    me: {
      quests: [
        { id: 'a_bow_linhung', name: 'Trăm lạy Vọng Hải', need: 108, have: 30, claimed: false },
        { id: 'a_bow_nuisam', name: 'Trăm lạy Thất Sơn', need: 108, have: 54, claimed: false }
      ]
    }
  };

  await client.doLayVongHai();
  assert.equal(executedBows, 78, 'Must do exactly 78 remaining bows for Vọng Hải (108 - 30)');
  assert.equal(targetTemple, 'linhung', 'Must target linhung temple');
  assert.ok(claimedQuests.includes('a_bow_linhung'), 'Must claim a_bow_linhung');

  // 2. Trăm lạy Thất Sơn with existing progress 54/108 (needed: 54)
  claimedQuests.length = 0;
  await client.doLayThatSon();
  assert.equal(executedBows, 54, 'Must do exactly 54 remaining bows for Thất Sơn (108 - 54)');
  assert.equal(targetTemple, 'nuisam', 'Must target nuisam temple');
  assert.ok(claimedQuests.includes('a_bow_nuisam'), 'Must claim a_bow_nuisam');
});

test('UI PRACTICE CARDS: all 5 cumulative activities + plant provide user quantity input', () => {
  state.merit = { me: { quests: [] } };
  const html = renderDashboardHTML();

  // 1. Lạy Phật Sám Hối: count_lay
  assert.ok(html.includes('id="count_lay"'), 'Must have input field for count_lay');
  assert.ok(html.includes("runTask('lay', { count: parseInt(document.getElementById('count_lay').value, 10)"), 'Button must pass user-entered count for lay');

  // 2. Lăn Tràng Hạt Niệm Phật: count_beads
  assert.ok(html.includes('id="count_beads"'), 'Must have input field for count_beads');
  assert.ok(html.includes("runTask('beads', { count: parseInt(document.getElementById('count_beads').value, 10)"), 'Button must pass user-entered count for beads');

  // 3. Gõ Mõ Tụng Kinh: count_mo & count_tung
  assert.ok(html.includes('id="count_mo"'), 'Must have input field for count_mo');
  assert.ok(html.includes("runTask('mo', { count: parseInt(document.getElementById('count_mo').value, 10)"), 'Button must pass user-entered count for mo');

  // 4. Ngồi Thiền Tĩnh Tâm: count_thien (minutes)
  assert.ok(html.includes('id="count_thien"'), 'Must have input field for count_thien');
  assert.ok(html.includes("runTask('meditate', { count: mins, minutes: mins, meditateSeconds: mins * 60 })"), 'Button must pass user-entered minutes for meditate');

  // 5. Quét Lá Sân Chùa: count_quet
  assert.ok(html.includes('id="count_quet"'), 'Must have input field for count_quet');
  assert.ok(html.includes("runTask('quet', { count: parseInt(document.getElementById('count_quet').value, 10)"), 'Button must pass user-entered count for quet');

  // 6. Trồng Cây Che Bóng Mát: count_plant
  assert.ok(html.includes('id="count_plant"'), 'Must have input field for count_plant');
  assert.ok(html.includes("runTask('plant', { count: parseInt(document.getElementById('count_plant').value, 10)"), 'Button must pass user-entered count for plant');

  // 7. Nhặt Lộc Sen Vàng: count_loc
  assert.ok(html.includes('id="count_loc"'), 'Must have input field for count_loc');
  assert.ok(html.includes("runTask('loc', { count: parseInt(document.getElementById('count_loc').value, 10)"), 'Button must pass user-entered count for loc');
});

test('DASHBOARD QUESTS: 1-click runs and dynamic progress badges', () => {
  state.merit = {
    me: {
      quests: [
        { id: 'a_plant30', name: 'Người gieo bóng mát', need: 30, have: 12, claimed: false, period: 'achievement' },
        { id: 'w_loc15', name: 'Hành hương nhặt lộc', need: 15, have: 5, claimed: false, period: 'weekly' },
        { id: 'a_loc_voluong', name: 'Dạo Vô Lượng Cung', need: 1, have: 0, claimed: false, period: 'achievement' },
        { id: 'a_bow_linhung', name: 'Trăm lạy Vọng Hải', need: 108, have: 50, claimed: false, period: 'achievement' },
        { id: 'a_bow_nuisam', name: 'Trăm lạy Thất Sơn', need: 108, have: 0, claimed: false, period: 'achievement' },
        { id: 'w_chuoi7', name: 'Bảy chuỗi niệm Phật', need: 7, have: 2, claimed: false, period: 'weekly' }
      ]
    }
  };

  const html = renderDashboardHTML();

  // a_plant30: 30 - 12 = 18 remaining
  assert.ok(html.includes('Trồng 18 cây (Xong bóng mát 🏆)'), 'Must show remaining 18 trees for a_plant30');
  assert.ok(html.includes("runTask('plant')"), 'Must link to plant task');

  // w_loc15: 15 - 5 = 10 remaining
  assert.ok(html.includes('Nhặt 10 lộc (Xong tuần 🏆)'), 'Must show remaining 10 lotuses for w_loc15');
  assert.ok(html.includes("runTask('loc')"), 'Must link to loc task');

  // a_loc_*: 1-click execution for all 12 temples
  assert.ok(html.includes('Dạo 12 chùa (1 lần kích hoạt xong hết 🏆)'), 'Must offer 1-click run for all 12 temples');
  assert.ok(html.includes("runTask('loc-all')"), 'Must link to loc-all task');

  // a_bow_linhung: 108 - 50 = 58 remaining
  assert.ok(html.includes('Lạy Vọng Hải (58 lạy 🏆)'), 'Must show remaining 58 bows for Vọng Hải');
  assert.ok(html.includes("runTask('lay-vonghai')"), 'Must link to lay-vonghai');

  // a_bow_nuisam: 108 remaining
  assert.ok(html.includes('Lạy Thất Sơn (108)'), 'Must show 108 bows for Thất Sơn');
  assert.ok(html.includes("runTask('lay-nuisam')"), 'Must link to lay-nuisam');

  // w_chuoi7: 7 - 2 = 5 chains (540 beads)
  assert.ok(html.includes('Lăn 5 chuỗi (540 hạt 🏆)'), 'Must show remaining 5 chains (540 beads) for w_chuoi7');
  assert.ok(html.includes("runTask('beads')"), 'Must link to beads task');
});
