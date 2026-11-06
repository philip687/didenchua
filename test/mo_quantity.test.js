import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASKS_CATALOG, QUEST_METADATA, renderDashboardHTML, state } from '../server.js';
import { runMo } from '../src/tasks/mo.js';

test('MO_QUANTITY: TASKS_CATALOG configures hasCount and rich presets for both tung and mo', () => {
  const tungTask = TASKS_CATALOG.find(t => t.id === 'tung');
  assert.ok(tungTask, 'TASKS_CATALOG must include task "tung"');
  assert.equal(tungTask.hasCount, true, 'Task "tung" must enable hasCount');
  assert.equal(tungTask.defaultCount, 108, 'Task "tung" default count must be 108');
  assert.ok(Array.isArray(tungTask.countOptions), 'Task "tung" must have countOptions array');
  assert.ok(tungTask.countOptions.some(opt => opt.value === 108), 'countOptions must include 108');
  assert.ok(tungTask.countOptions.some(opt => opt.value === 30), 'countOptions must include 30');
  assert.ok(tungTask.countOptions.some(opt => opt.value === 1080), 'countOptions must include 1080');

  const moTask = TASKS_CATALOG.find(t => t.id === 'mo');
  assert.ok(moTask, 'TASKS_CATALOG must include task "mo"');
  assert.equal(moTask.hasCount, true, 'Task "mo" must enable hasCount');
  assert.equal(moTask.defaultCount, 108, 'Task "mo" default count must be 108');
  assert.ok(Array.isArray(moTask.countOptions), 'Task "mo" must have countOptions array');
  assert.ok(moTask.countOptions.some(opt => opt.value === 108), 'countOptions must include 108');
  assert.ok(moTask.countOptions.some(opt => opt.value === 300), 'countOptions must include 300');
});

test('MO_QUANTITY: renderDashboardHTML renders quantity inputs and smart options for tung and mo', () => {
  state.merit = {
    me: {
      name: 'Phật Tử Thử Nghiệm',
      user: 'testuser',
      merit: 1000,
      total: 1000,
      quests: [
        { id: 'tung', name: 'Gõ mõ tụng kinh', need: 108, have: 28, claimed: false, reward: 30 }
      ]
    }
  };
  state.journal = { merit: 1000 };
  state.isRunning = false;
  state.isStopping = false;

  const html = renderDashboardHTML();

  // Number input and selector for tung
  assert.ok(html.includes('id="count_tung"'), 'Must render input id="count_tung"');
  assert.ok(html.includes('value="108"'), 'Must render default value 108');
  assert.ok(html.includes('Làm đủ nhiệm vụ ngày (còn 80 tiếng 🎯)'), 'Must render smart option for remaining 80 strikes');

  // Number input and selector for mo
  assert.ok(html.includes('id="count_mo"'), 'Must render input id="count_mo"');
  assert.ok(html.includes('1.080 tiếng'), 'Must render 1080 strike option');
});

test('MO_QUANTITY: doMo client method executes custom count in batches with turbo support', async () => {
  const { DiDenChuaClient } = await import('../src/client.js');
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};

  await client.doMo(55);

  const visitPkt = sentPackets.find(p => p.t === 'visit' && p.zone === 'Chánh điện');
  assert.ok(visitPkt, 'Must visit Chánh điện before striking');

  const moPackets = sentPackets.filter(p => p.t === 'mo');
  const totalStrikes = moPackets.reduce((sum, p) => sum + (p.n || 0), 0);
  assert.equal(totalStrikes, 55, 'Total strikes sent across all batches must equal requested 55');
});
