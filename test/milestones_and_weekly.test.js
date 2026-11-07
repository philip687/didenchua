import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient } from '../src/client.js';
import { TASKS_CATALOG, renderDashboardHTML, state } from '../server.js';

test('DiDenChuaClient: doWeeklyQuests inspects incomplete weekly quests and fulfills them', async () => {
  const client = new DiDenChuaClient();
  const performed = [];

  // Mock profile with incomplete w_loc15 and w_chuoi7
  client.token = 'mock_token';
  client.fetchMe = async () => ({
    quests: [
      { id: 'w_lay300', target: 300, progress: 300, done: true, claimed: true },
      { id: 'w_chuoi7', target: 7, progress: 5, done: false, claimed: false },
      { id: 'w_thien60', target: 60, progress: 60, done: true, claimed: true },
      { id: 'w_loc15', target: 15, progress: 2, done: false, claimed: false }
    ]
  });

  client.doBeads = async (count) => { performed.push({ action: 'beads', count }); };
  client.doLoc = async (count) => { performed.push({ action: 'loc', count }); return { ok: true, claimed: count }; };
  client.post = async (path) => ({ ok: true });
  client.send = (msg) => { performed.push({ action: 'ws', msg }); };

  const res = await client.doWeeklyQuests();

  assert.equal(res.ok, true);
  // w_chuoi7 needed 7 - 5 = 2 chuỗi -> 2 * 108 = 216 beads
  assert.ok(performed.some(p => p.action === 'beads' && p.count === 216), 'Must do remaining beads for w_chuoi7');
  // w_loc15 needed 15 - 2 = 13 loc
  assert.ok(performed.some(p => p.action === 'loc' && p.count === 13), 'Must do remaining 13 loc for w_loc15');
});

test('DiDenChuaClient: doLocAllTemples visits all 12 stroll temples and claims quests', async () => {
  const client = new DiDenChuaClient();
  const visited = [];

  client.doLoc = async (count, options) => {
    if (options && options.temple) visited.push(options.temple);
    return { ok: true, claimed: count };
  };
  client.post = async () => ({ ok: true });
  client.send = () => {};

  const res = await client.doLocAllTemples();

  assert.equal(res.ok, true);
  assert.equal(visited.length, 12, 'Must visit all 12 stroll temples');
  assert.ok(visited.includes('linhung'));
  assert.ok(visited.includes('nuisam'));
  assert.ok(visited.includes('cuuphong'));
  assert.ok(visited.includes('hoangoc'));
});

test('DiDenChuaClient: doSpeedrunLevel10 executes all 5 breakthrough steps', async () => {
  const client = new DiDenChuaClient();
  const steps = [];

  client.doLayVongHai = async (count) => { steps.push('lay_vonghai'); };
  client.doLayThatSon = async (count) => { steps.push('lay_thatson'); };
  client.doVisitAll = async () => { steps.push('visit_all'); };
  client.doHuntPets = async () => { steps.push('hunt_pets'); };
  client.doLoc = async (count) => { steps.push('loc'); };
  client.claimAllQuests = async () => { steps.push('claim_all'); };

  const res = await client.doSpeedrunLevel10();

  assert.equal(res.ok, true);
  assert.deepEqual(steps, [
    'lay_vonghai',
    'lay_thatson',
    'visit_all',
    'hunt_pets',
    'loc',
    'claim_all'
  ], 'Must execute all 5 speedrun steps and final claim in sequence');
});

test('server.js: TASKS_CATALOG correctly registers weekly, loc-all and speedrun-level10', () => {
  const weeklyTask = TASKS_CATALOG.find(t => t.id === 'weekly');
  assert.ok(weeklyTask, 'Must have weekly task in catalog');

  const locAllTask = TASKS_CATALOG.find(t => t.id === 'loc-all');
  assert.ok(locAllTask, 'Must have loc-all task in catalog');

  const speedrunTask = TASKS_CATALOG.find(t => t.id === 'speedrun-level10');
  assert.ok(speedrunTask, 'Must have speedrun-level10 task in catalog');

  // Verify UI rendering for a_loc_
  state.merit = {
    me: {
      quests: [
        { id: 'a_loc_linhung', name: 'Dạo khắp Vọng Hải', need: 5, have: 0, claimed: false, done: false, period: 'achievement' },
        { id: 'w_loc15', name: 'Hành hương nhặt lộc', need: 15, have: 2, claimed: false, done: false, period: 'weekly' }
      ]
    }
  };

  const html = renderDashboardHTML();
  assert.ok(html.includes('runTask(\'loc-all\')'), 'Must generate runTask(loc-all) for a_loc_*');
  assert.ok(html.includes('runTask(\'loc\')'), 'Must generate runTask(loc) for w_loc15');
});

