import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient, BUDDHIST_SUTRAS } from '../src/client.js';
import { TASKS_CATALOG, QUEST_METADATA, renderDashboardHTML } from '../server.js';

test('SUTRAS: BUDDHIST_SUTRAS contains all 6 sutras with id, title, and duration', () => {
  assert.equal(BUDDHIST_SUTRAS.length, 6, 'Must contain exactly 6 sutras');
  const expectedIds = ['adida', 'batnha', 'batdai', 'daibi', 'vangsanh', 'hoihuong'];
  for (const id of expectedIds) {
    const sutra = BUDDHIST_SUTRAS.find(s => s.id === id);
    assert.ok(sutra, `Must contain sutra "${id}"`);
    assert.ok(sutra.title, `Sutra "${id}" must have a title`);
    assert.ok(sutra.duration, `Sutra "${id}" must have a duration`);
    assert.ok(sutra.seconds > 0, `Sutra "${id}" must have positive duration in seconds`);
  }
});

test('SUTRAS: doTangKinhCac("all") visits Tàng Kinh Các, reads all 6 sutras, sends tk-done, and claims quests', async () => {
  const client = new DiDenChuaClient();
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
  };
  client.sleep = async () => {};
  client.humanDelay = async () => {};

  await client.doTangKinhCac('all');

  // 1. Must visit Tàng Kinh Các
  const visit = sentPackets.find(p => p.t === 'visit' && (p.zone === 'Tàng Kinh Các' || p.zone === 'Sân chùa'));
  assert.ok(visit, 'Must visit Tàng Kinh Các or Sân chùa');

  // 2. Must send tk-read for all 6 sutras
  for (const sutra of BUDDHIST_SUTRAS) {
    const read = sentPackets.find(p => p.t === 'tk-read' && p.id === sutra.id);
    assert.ok(read, `Must send tk-read for "${sutra.id}"`);
  }

  // 3. Must send tk-done
  const done = sentPackets.find(p => p.t === 'tk-done');
  assert.ok(done, 'Must send tk-done');

  // 4. Must claim wDoc quest
  const claim = sentPackets.find(p => p.t === 'claim' && p.q === 'wDoc');
  assert.ok(claim, 'Must send claim for quest wDoc');
});

test('SUTRAS: doTangKinhCac with single sutra id reads that specific sutra and sends tk-done', async () => {
  const client = new DiDenChuaClient();
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
  };
  client.sleep = async () => {};
  client.humanDelay = async () => {};

  await client.doTangKinhCac('batnha');

  const read = sentPackets.find(p => p.t === 'tk-read' && p.id === 'batnha');
  assert.ok(read, 'Must send tk-read for batnha');

  const otherRead = sentPackets.find(p => p.t === 'tk-read' && p.id === 'adida');
  assert.equal(otherRead, undefined, 'Should not read other sutras when single id specified');

  const done = sentPackets.find(p => p.t === 'tk-done');
  assert.ok(done, 'Must send tk-done');
});

test('SUTRAS: doSecrets calls doTangKinhCac and doXinChu', async () => {
  const client = new DiDenChuaClient();
  let calledTangKinh = false;
  let calledXinChuWish = null;

  client.doTangKinhCac = async (sutraId) => {
    calledTangKinh = (sutraId === 'all');
  };
  client.doXinChu = async (wish) => {
    calledXinChuWish = wish;
  };

  await client.doSecrets('all');

  assert.ok(calledTangKinh, 'doSecrets must call doTangKinhCac("all")');
  assert.equal(calledXinChuWish, 'all', 'doSecrets must pass wish to doXinChu');
});

test('SUTRAS: TASKS_CATALOG and QUEST_METADATA correctly expose secrets and tangkinh', () => {
  const secretsTask = TASKS_CATALOG.find(t => t.id === 'secrets');
  assert.ok(secretsTask, 'TASKS_CATALOG must include task "secrets"');
  assert.equal(secretsTask.defaultWish, 'all', 'secrets should default wish to "all"');

  const tangkinhTask = TASKS_CATALOG.find(t => t.id === 'tangkinh');
  assert.ok(tangkinhTask, 'TASKS_CATALOG must include task "tangkinh"');
  assert.equal(tangkinhTask.icon, '📖');

  assert.ok(QUEST_METADATA['tangkinh'], 'QUEST_METADATA must include "tangkinh"');
  assert.ok(QUEST_METADATA['wDoc'], 'QUEST_METADATA must include "wDoc"');
});

test('SUTRAS: renderDashboardHTML includes 6-sutra showcase and quick action', () => {
  const html = renderDashboardHTML();
  assert.ok(html.includes('Tàng Kinh Các &amp; Thư Viện Kinh Điển') || html.includes('Tàng Kinh Các & Thư Viện Kinh Điển'), 'Dashboard must include Tàng Kinh Các');
  assert.ok(html.includes('Nghe Trọn Bộ Kinh Điển Ngay'), 'Dashboard must include Nghe Trọn Bộ Kinh Điển button');
  assert.ok(html.includes("runTask('tangkinh')"), 'Dashboard must wire button to runTask(tangkinh)');

  for (const sutra of BUDDHIST_SUTRAS) {
    assert.ok(html.includes(sutra.title), `Dashboard must render sutra title "${sutra.title}"`);
    assert.ok(html.includes(sutra.duration), `Dashboard must render sutra duration "${sutra.duration}"`);
  }
});
