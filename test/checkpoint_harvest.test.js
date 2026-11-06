import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient } from '../src/client.js';

test('CHECKPOINT_HARVEST: doLay automatically claims daily quest and journals at checkpoints', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};

  // Setup active uncompleted daily quest needing 27 bows
  client.merit = {
    me: {
      quests: [
        { id: 'lay', name: 'Lạy Phật sám hối', need: 27, have: 0, claimed: false, reward: 15 }
      ],
      weekly: [
        { id: 'wLay', name: 'Lạy Phật tuần', need: 108, have: 54, claimed: false, reward: 100 }
      ]
    }
  };

  // Perform 54 bows (2 chunks of 27 bows)
  await client.doLay(54, { chunkSize: 27 });

  // 1. Visit Chánh điện
  assert.ok(sentPackets.some(p => p.t === 'visit' && p.zone === 'Chánh điện'), 'Must visit Chánh điện');

  // 2. Lay emotes: 54 / 3 = 18 emotes
  const emotePackets = sentPackets.filter(p => p.t === 'emote' && p.e === 'lay');
  assert.equal(emotePackets.length, 18, 'Must send 18 lay emote packets for 54 bows');

  // 3. Daily quest claim packet must have been dispatched mid-session
  const claimPackets = sentPackets.filter(p => p.t === 'claim' && p.q === 'lay');
  assert.ok(claimPackets.length >= 1, 'Must claim daily quest "lay" as soon as checkpoint reached');
  assert.equal(client.merit.me.quests[0].claimed, true, 'Daily quest must be marked claimed');

  // 4. Weekly quest wLay must have been claimed at 54 + 54 = 108
  const wClaimPackets = sentPackets.filter(p => p.t === 'claim' && p.q === 'wLay');
  assert.ok(wClaimPackets.length >= 1, 'Must claim weekly quest "wLay" as soon as 108 bows reached');

  // 5. Journal sync packet must have been sent at checkpoints
  const journalPackets = sentPackets.filter(p => p.t === 'journal');
  assert.ok(journalPackets.length >= 2, 'Must request journal updates at checkpoints');
});

test('CHECKPOINT_HARVEST: doMeditate divides long session into safe chunks, stands up, claims, and resumes', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.connected = true;
  client.ws = { readyState: 1 };
  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};
  client.fetchJournal = async () => {
    client.journal = { sitMin: 10 };
    return client.journal;
  };

  // Setup active daily quest needing 5 minutes (300s)
  client.merit = {
    me: {
      quests: [
        { id: 'ngoi', name: 'Ngồi tĩnh 5 phút', need: 5, have: 0, claimed: false, reward: 20 }
      ]
    }
  };

  // Run 600s with chunkSeconds = 300 (2 chunks of 5 minutes) using stepSeconds for instant simulation
  const result = await client.doMeditate(600, null, { chunkSeconds: 300, stepSeconds: 300 });

  assert.equal(result.verified, true, 'Result must be verified');

  // 1. Must sit at cushion (s: 2) twice
  const sitPackets = sentPackets.filter(p => p.t === 'state' && p.s === 2);
  assert.ok(sitPackets.length >= 2, 'Must sit at cushion for each chunk');

  // 2. Must stand up (s: 0) at each chunk boundary to lock in sitMin
  const standPackets = sentPackets.filter(p => p.t === 'state' && p.s === 0);
  assert.ok(standPackets.length >= 2, 'Must stand up at chunk checkpoints to record sitMin');

  // 3. Must send claim for ngoi quest
  const claimPackets = sentPackets.filter(p => p.t === 'claim' && p.q === 'ngoi');
  assert.ok(claimPackets.length >= 1, 'Must claim ngoi quest');

  // 4. Must send claim for wNgoi weekly quest
  const wClaimPackets = sentPackets.filter(p => p.t === 'claim' && p.q === 'wNgoi');
  assert.ok(wClaimPackets.length >= 1, 'Must claim wNgoi weekly quest');
});

test('CHECKPOINT_HARVEST: doMeditate handles single short session (<= 5 min) gracefully', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.connected = true;
  client.ws = { readyState: 1 };
  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};
  client.fetchJournal = async () => {
    client.journal = { sitMin: 5 };
    return client.journal;
  };

  client.merit = {
    me: {
      quests: [
        { id: 'ngoi', name: 'Ngồi tĩnh 5 phút', need: 5, have: 0, claimed: false, reward: 20 }
      ]
    }
  };

  // Run 300s (standard 5 minute daily quest) using stepSeconds for instant simulation
  const result = await client.doMeditate(300, null, { chunkSeconds: 300, stepSeconds: 300 });

  assert.equal(result.verified, true, 'Single 5-minute session must be verified');

  const sitPackets = sentPackets.filter(p => p.t === 'state' && p.s === 2);
  assert.equal(sitPackets.length, 1, 'Single session must sit down once');

  const standPackets = sentPackets.filter(p => p.t === 'state' && p.s === 0);
  assert.ok(standPackets.length >= 1, 'Single session must stand up at completion');

  const claimPackets = sentPackets.filter(p => p.t === 'claim' && p.q === 'ngoi');
  assert.equal(claimPackets.length, 1, 'Must claim ngoi once');
});
