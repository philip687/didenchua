import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboardHTML, state, QUEST_METADATA } from '../server.js';

test('QUEST_METADATA: covers all standard daily and weekly quest types', () => {
  const expectedKeys = [
    'checkin', 'huong', 'den', 'chao', 'lay', 'quet', 'ca',
    'dendau', 'cat', 'wAm', 'am', 'ngoi', 'tung', 'mo', 'chuoi',
    'chu', 'chuong', 'bell', 'tuoi', 'khoe', 'xam', 'tron', 'viec', 'vow', 'nguyen'
  ];
  for (const key of expectedKeys) {
    assert.ok(QUEST_METADATA[key], `QUEST_METADATA must contain key "${key}"`);
    assert.ok(QUEST_METADATA[key].icon, `"${key}" must have an icon`);
    assert.ok(QUEST_METADATA[key].title, `"${key}" must have a title`);
    assert.ok(QUEST_METADATA[key].desc, `"${key}" must have a description`);
    assert.ok(QUEST_METADATA[key].taskId, `"${key}" must have a taskId`);
  }
});

test('renderDashboardHTML: renders rich daily quests with titles, progress bars, and badges', () => {
  // Set up mock state with varied quest statuses
  state.merit = {
    me: {
      name: 'Phật Tử Thử Nghiệm',
      user: 'testuser',
      merit: 1250,
      total: 1250,
      next: 1500,
      from: 1000,
      quests: [
        { id: 'checkin', name: 'Điểm danh hàng ngày', need: 1, have: 1, claimed: true, reward: 10 },
        { id: 'huong', name: 'Dâng hương Tam Bảo', need: 1, have: 1, claimed: false, reward: 10 },
        { id: 'dendau', name: 'Thắp đèn dầu chánh điện', need: 1, have: 0, claimed: false, reward: 10 },
        { id: 'lay', name: 'Lạy Phật trang nghiêm', need: 27, have: 18, claimed: false, reward: 15 },
        { id: 'wAm', name: 'Am riêng tu tập & Dâng hương', need: 1, have: 1, claimed: true, reward: 40 }
      ]
    }
  };
  state.journal = { merit: 1250, next: 1500, from: 1000 };
  state.isRunning = false;
  state.isStopping = false;

  const html = renderDashboardHTML();

  // 1. Must contain the summary banner
  assert.ok(html.includes('quests-summary-card'), 'Must contain quests summary card');
  assert.ok(html.includes('2 / 5 hoàn thành (40%)'), 'Must show correct completion ratio');
  assert.ok(html.includes('+50 / 85 điểm'), 'Must show correct reward earned / total ratio');

  // 2. Must render non-empty quest titles
  assert.ok(html.includes('Điểm danh hàng ngày'), 'Must render Điểm danh hàng ngày');
  assert.ok(html.includes('Dâng hương Tam Bảo'), 'Must render Dâng hương Tam Bảo');
  assert.ok(html.includes('Thắp đèn dầu chánh điện'), 'Must render Thắp đèn dầu chánh điện');
  assert.ok(html.includes('Lạy Phật trang nghiêm'), 'Must render Lạy Phật trang nghiêm');
  assert.ok(html.includes('Am riêng tu tập &amp; Dâng hương'), 'Must render Am riêng (escaped HTML)');

  // 3. Must render action tips and icons
  assert.ok(html.includes('16:30 – 21:30'), 'Must render dendau time window tip');
  assert.ok(html.includes('🪔'), 'Must render huong icon');
  assert.ok(html.includes('🕯️'), 'Must render dendau icon');
  assert.ok(html.includes('🛖'), 'Must render am icon');

  // 4. Must render correct action buttons
  assert.ok(html.includes('✅ Đã hoàn thành'), 'Must show completed badge for claimed quests');
  assert.ok(html.includes('runTask(\'claim\')'), 'Must have claim button for completed uncollected quest');
  assert.ok(html.includes('runTask(\'dendau\')'), 'Must have runTask(dendau) button for incomplete quest');
  assert.ok(html.includes('runTask(\'lay-daily\')'), 'Must have runTask(lay-daily) button for incomplete quest');

  // 5. Must calculate and show progress values
  assert.ok(html.includes('18 / 27'), 'Must show progress numbers 18/27');
  assert.ok(html.includes('67%'), 'Must calculate 18/27 = 67%');
});

test('renderDashboardHTML: disables quick buttons when a task is currently running', () => {
  state.isRunning = true;
  state.isStopping = false;

  const html = renderDashboardHTML();
  // All runTask buttons should have disabled attribute
  const claimBtnMatch = html.match(/<button[^>]*runTask\('claim'\)[^>]*>/);
  assert.ok(claimBtnMatch, 'Should find claim button');
  assert.ok(claimBtnMatch[0].includes('disabled'), 'Claim button must be disabled while running');

  state.isRunning = false;
});

test('renderDashboardHTML: inline script must be valid JavaScript with zero syntax errors', async () => {
  const vm = await import('node:vm');
  const html = renderDashboardHTML();
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch, 'Dashboard must contain a <script> block');
  assert.doesNotThrow(() => {
    new vm.Script(scriptMatch[1]);
  }, 'Inline script must compile without SyntaxError');
});

test('renderDashboardHTML: separates daily, weekly and achievement tabs with internal scroll box', async () => {
  state.merit = {
    me: {
      name: 'Hân Ánh Vũ',
      user: 'thichkngan',
      quests: [
        { id: 'd_lay27', name: 'Lạy 27 lạy', need: 27, have: 27, claimed: true, done: true, period: 'daily' },
        { id: 'w_lay300', name: 'Tinh tấn lễ bái', need: 300, have: 300, claimed: true, done: true, period: 'weekly' },
        { id: 'w_loc15', name: 'Hành hương nhặt lộc', need: 15, have: 2, claimed: false, done: false, period: 'weekly' },
        { id: 'a_cap10', name: 'Đạt cấp 10', need: 10, have: 9, claimed: false, done: false, period: 'achievement' },
        { id: 'a_chuoi7', name: 'Bảy ngày tinh tấn', need: 7, have: 2, claimed: false, done: false, period: 'achievement' },
        { id: 'r_xuyenviet', name: 'Tuyến: Xuyên Việt hành hương', need: 10, have: 7, claimed: false, done: false, period: 'achievement' },
        { id: 'a_pet_linhung', name: 'Linh thú Vọng Hải', need: 1, have: 0, claimed: false, done: false, period: 'achievement' }
      ]
    }
  };

  const html = renderDashboardHTML();

  // 1. Quests breakdown pills
  assert.ok(html.includes('quest-categories-pills'), 'Must render category breakdown pills');
  assert.ok(html.includes('🌟 Hàng ngày:'), 'Must show daily breakdown');
  assert.ok(html.includes('📅 Tuần:'), 'Must show weekly breakdown');
  assert.ok(html.includes('🏆 Thành tựu & Tuyến:'), 'Must show achievement breakdown');

  // 2. Filter bar with category buttons and search
  assert.ok(html.includes('quests-filter-bar'), 'Must contain filter bar');
  assert.ok(html.includes('quest-cat-btn'), 'Must contain category tag buttons');
  assert.ok(html.includes('data-cat="daily"'), 'Must have daily filter tag');
  assert.ok(html.includes('data-cat="weekly"'), 'Must have weekly filter tag');
  assert.ok(html.includes('data-cat="achievement"'), 'Must have achievement filter tag');
  assert.ok(html.includes('id="questSearchInput"'), 'Must have search input for quests');
  assert.ok(html.includes('id="questStatusFilter"'), 'Must have status filter for quests');

  // 3. Scroll container
  assert.ok(html.includes('quests-scroll-box'), 'Must wrap list in .quests-scroll-box');

  // 4. Milestone badges without broken runTask buttons
  assert.ok(html.includes('badge-milestone'), 'Must show badge-milestone for a_cap10');
  assert.ok(html.includes('badge-streak'), 'Must show badge-streak for a_chuoi7');
  assert.ok(!html.includes('runTask(\'a_cap10\')'), 'Must NOT generate broken runTask(a_cap10)');
  assert.ok(!html.includes('runTask(\'a_chuoi7\')'), 'Must NOT generate broken runTask(a_chuoi7)');

  // 5. Targeted runTask buttons for routes and pets
  assert.ok(html.includes('runTask(\'visitAll\')'), 'Must generate runTask(visitAll) for pilgrimage route');
  assert.ok(html.includes('runTask(\'petAll\')'), 'Must generate runTask(petAll) for temple pet');
  assert.ok(html.includes('runTask(\'loc\')'), 'Must generate runTask(loc) for w_loc15');
});

test('renderDashboardHTML & DiDenChuaClient: supports Trăm lạy Vọng Hải and Thất Sơn', async () => {
  const { DiDenChuaClient } = await import('../src/client.js');
  const client = new DiDenChuaClient();
  assert.equal(typeof client.doLayVongHai, 'function', 'client.doLayVongHai must be a function');
  assert.equal(typeof client.doLayThatSon, 'function', 'client.doLayThatSon must be a function');

  // Verify mock execution
  let visitedTemple = null;
  client.doVisit = async (t) => { visitedTemple = t; };
  client.practice = async (type, payload) => { return { gained: 5 }; };
  client.post = async (path) => { return { ok: true }; };

  await client.doLayVongHai(3, { intervalMs: 1 });
  assert.equal(visitedTemple, 'linhung', 'doLayVongHai must visit linhung');

  await client.doLayThatSon(3, { intervalMs: 1 });
  assert.equal(visitedTemple, 'nuisam', 'doLayThatSon must visit nuisam');

  // Verify UI buttons in renderDashboardHTML
  state.merit = {
    me: {
      quests: [
        { id: 'a_bow_linhung', name: 'Trăm lạy Vọng Hải', need: 108, have: 0, claimed: false, done: false, period: 'achievement' },
        { id: 'a_bow_nuisam', name: 'Trăm lạy Thất Sơn', need: 108, have: 0, claimed: false, done: false, period: 'achievement' }
      ]
    }
  };
  const html = renderDashboardHTML();
  assert.ok(html.includes('runTask(\'lay-vonghai\')'), 'Must generate runTask(lay-vonghai)');
  assert.ok(html.includes('🌊 Lạy Vọng Hải (108)'), 'Must render button label for Vọng Hải');
  assert.ok(html.includes('runTask(\'lay-nuisam\')'), 'Must generate runTask(lay-nuisam)');
  assert.ok(html.includes('⛰️ Lạy Thất Sơn (108)'), 'Must render button label for Thất Sơn');
});
