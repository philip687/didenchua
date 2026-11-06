import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient, CALLIGRAPHY_WORDS, BUDDHIST_SUTRAS } from '../src/client.js';
import { renderDashboardHTML } from '../server.js';

test('TURBO: DiDenChuaClient.isTurbo() reflects config.turbo or config.fast', () => {
  const normalClient = new DiDenChuaClient({ turbo: false, fast: false });
  assert.equal(normalClient.isTurbo(), false, 'isTurbo should be false when not enabled');

  const turboClient = new DiDenChuaClient({ turbo: true });
  assert.equal(turboClient.isTurbo(), true, 'isTurbo should be true when turbo: true');

  const fastClient = new DiDenChuaClient({ fast: true });
  assert.equal(fastClient.isTurbo(), true, 'isTurbo should be true when fast: true');
});

test('TURBO: humanDelay executes in < 150ms when in turbo mode', async () => {
  const client = new DiDenChuaClient({ turbo: true, safeMode: true });
  const start = Date.now();
  await client.humanDelay('test turbo delay');
  const duration = Date.now() - start;
  assert.ok(duration < 150, `Turbo humanDelay must be under 150ms, took ${duration}ms`);
});

test('TURBO: claimAllQuests breaks early as soon as server acknowledges claim', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
    // Simulate server acknowledging claim in merit
    if (pkt.t === 'claim' && pkt.q === 'test-q') {
      setTimeout(() => {
        if (client.merit?.me?.quests) {
          const q = client.merit.me.quests.find(x => x.id === 'test-q');
          if (q) q.claimed = true;
        }
      }, 30);
    }
  };

  client.merit = {
    me: {
      quests: [
        { id: 'test-q', title: 'Nhiệm vụ thử nghiệm', have: 1, need: 1, reward: 10, claimed: false }
      ]
    }
  };

  const start = Date.now();
  const res = await client.claimAllQuests();
  const elapsed = Date.now() - start;

  assert.equal(res.claimed.length, 1, 'Should have 1 claimed quest');
  assert.equal(res.claimed[0].id, 'test-q');
  assert.equal(res.unverified.length, 0, 'No unverified quests');
  // It should break early in < 600ms instead of looping 2500ms
  assert.ok(elapsed < 800, `claimAllQuests should finish rapidly with reactive check, took ${elapsed}ms`);
});

test('TURBO: doXinAllChu sends all 12 words rapidly in turbo mode', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
  };
  // Mock sleep to be immediate for packet count verification
  const sleeps = [];
  client.sleep = async (ms) => {
    sleeps.push(ms);
  };

  await client.doXinAllChu();

  // Verify all 12 words sent
  for (const word of CALLIGRAPHY_WORDS) {
    const xin = sentPackets.find(p => p.t === 'chu-xin' && p.chu === word.id);
    assert.ok(xin, `Must request "${word.id}" in turbo mode`);
  }
  // Check that turbo sleep intervals are compressed (all sleeps in word loop <= 120ms)
  const loopSleeps = sleeps.filter(ms => ms === 90 || ms === 80);
  assert.ok(loopSleeps.length >= 24, `Should use compressed turbo sleeps, recorded: ${loopSleeps.length}`);
});

test('TURBO: doTangKinhCac reads all 6 sutras with compressed delays in turbo mode', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];
  client.send = (pkt) => {
    sentPackets.push(pkt);
  };
  const sleeps = [];
  client.sleep = async (ms) => {
    sleeps.push(ms);
  };

  await client.doTangKinhCac('all');

  for (const sutra of BUDDHIST_SUTRAS) {
    const read = sentPackets.find(p => p.t === 'tk-read' && p.id === sutra.id);
    assert.ok(read, `Must read "${sutra.id}" in turbo mode`);
  }
  const turboSutraSleeps = sleeps.filter(ms => ms === 90);
  assert.equal(turboSutraSleeps.length, 6, 'Must use 90ms turbo sleeps for each sutra');
});

test('TURBO: renderDashboardHTML includes Turbo mode toggle checkbox with persistence', () => {
  const html = renderDashboardHTML();
  assert.ok(html.includes('id="turboModeToggle"'), 'Dashboard must render turboModeToggle checkbox');
  assert.ok(html.includes('⚡ Siêu Tốc (Turbo)'), 'Dashboard must render Turbo mode label');
  assert.ok(html.includes('didenchua_turbo'), 'Dashboard script must sync with localStorage didenchua_turbo');
  assert.ok(html.includes('turbo: isTurbo'), 'runTask in script must forward turbo parameter');
});
