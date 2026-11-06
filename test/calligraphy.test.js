import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient, CALLIGRAPHY_WORDS } from '../src/client.js';
import { TASKS_CATALOG, QUEST_METADATA, renderDashboardHTML } from '../server.js';

test('CALLIGRAPHY: CALLIGRAPHY_WORDS has 12 distinct words with text, wish and meaning', () => {
  assert.equal(CALLIGRAPHY_WORDS.length, 12, 'Must have exactly 12 calligraphy words');
  const ids = new Set();
  for (const word of CALLIGRAPHY_WORDS) {
    assert.ok(word.id, 'Word must have an id');
    assert.ok(word.text, `Word ${word.id} must have text`);
    assert.ok(word.wish, `Word ${word.id} must have wish`);
    assert.ok(word.meaning, `Word ${word.id} must have meaning`);
    assert.ok(!ids.has(word.id), `Word id ${word.id} must be unique`);
    ids.add(word.id);
  }
});

test('CALLIGRAPHY: doXinAllChu sends visits, chu-list, all 12 words with open/save packets, and claims quest', async () => {
  const client = new DiDenChuaClient();
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
  };
  client.sleep = async () => {};
  client.humanDelay = async () => {};

  await client.doXinAllChu();

  // 1. Visit Thay Do and request list
  assert.deepEqual(sentPackets[0], { t: 'visit', zone: 'Thầy đồ' });
  assert.deepEqual(sentPackets[1], { t: 'chu-list' });

  // 2. Each of the 12 words must be requested, opened, placed, and saved
  for (const word of CALLIGRAPHY_WORDS) {
    const xin = sentPackets.find(p => p.t === 'chu-xin' && p.chu === word.id);
    assert.ok(xin, `Must send chu-xin for "${word.id}"`);

    const open = sentPackets.find(p => p.t === 'chu-dem' && p.k === 'mo');
    assert.ok(open, 'Must send chu-dem mo');

    const inside = sentPackets.find(p => p.t === 'chu-dem' && p.k === 'vao');
    assert.ok(inside, 'Must send chu-dem vao');

    const giu = sentPackets.find(p => p.t === 'chu-giu' && p.chu === word.id);
    assert.ok(giu, `Must send chu-giu for "${word.id}"`);
  }

  // 3. Quest claim for chu
  const claim = sentPackets.find(p => p.t === 'claim' && p.q === 'chu');
  assert.ok(claim, 'Must send claim for quest chu');
});

test('CALLIGRAPHY: doXinChu delegates to doXinAllChu when wish is "all", "tat-ca", "full", or "tron-bo"', async () => {
  const client = new DiDenChuaClient();
  let calledXinAll = 0;
  client.doXinAllChu = async () => {
    calledXinAll++;
  };

  await client.doXinChu('all');
  await client.doXinChu('tat-ca');
  await client.doXinChu('full');
  await client.doXinChu('tron-bo');

  assert.equal(calledXinAll, 4, 'All 4 aliases must delegate to doXinAllChu');
});

test('CALLIGRAPHY: TASKS_CATALOG and QUEST_METADATA correctly expose chu and chu-all', () => {
  const chuTask = TASKS_CATALOG.find(t => t.id === 'chu');
  assert.ok(chuTask, 'TASKS_CATALOG must include task "chu"');
  assert.equal(chuTask.defaultWish, 'all', 'Task "chu" should default to "all" (trọn bộ)');

  const chuAllTask = TASKS_CATALOG.find(t => t.id === 'chu-all');
  assert.ok(chuAllTask, 'TASKS_CATALOG must include task "chu-all"');
  assert.equal(chuAllTask.icon, '📜');

  assert.ok(QUEST_METADATA['chu'], 'QUEST_METADATA must include "chu"');
  assert.ok(QUEST_METADATA['chu-all'], 'QUEST_METADATA must include "chu-all"');
});

test('CALLIGRAPHY: renderDashboardHTML includes 12-word calligraphy showcase and quick action', () => {
  const html = renderDashboardHTML();
  assert.ok(html.includes('Tủ Chữ Thư Pháp Thầy Đồ'), 'Dashboard must include Tủ Chữ Thư Pháp');
  assert.ok(html.includes('Xin Trọn Bộ 12 Chữ Ngay'), 'Dashboard must include Xin Trọn Bộ 12 Chữ button');
  assert.ok(html.includes("runTask('chu-all')"), 'Dashboard must wire button to runTask(chu-all)');

  for (const word of CALLIGRAPHY_WORDS) {
    assert.ok(html.includes(word.text), `Dashboard must render word text "${word.text}"`);
    assert.ok(html.includes(word.wish), `Dashboard must render word wish "${word.wish}"`);
  }
});
