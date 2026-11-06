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

test('CHECKPOINT_HARVEST: doBeads automatically claims daily/weekly quest and journals at checkpoints', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};

  // Active daily quest needing 54 beads, weekly needing 108 beads (with 54 already done)
  client.merit = {
    me: {
      quests: [
        { id: 'chuoi', name: 'Lăn tràng hạt', need: 54, have: 0, claimed: false, reward: 15 }
      ],
      weekly: [
        { id: 'wChuoi', name: 'Tràng hạt tuần', need: 108, have: 54, claimed: false, reward: 100 }
      ]
    }
  };

  // Perform 108 beads (two chunks of 54)
  await client.doBeads(108, { chunkSize: 54, intervalMs: 0 });

  // 1. Initial emote chuoi
  assert.ok(sentPackets.some(p => p.t === 'emote' && p.e === 'chuoi'), 'Must send chuoi emote');

  // 2. Bead packets: 108 / 9 = 12 packets of 9 beads
  const beadPackets = sentPackets.filter(p => p.t === 'beads');
  const totalBeads = beadPackets.reduce((sum, p) => sum + (p.n || 0), 0);
  assert.equal(totalBeads, 108, 'Must send exactly 108 beads');

  // 3. Daily quest claim packet
  const claimDaily = sentPackets.filter(p => p.t === 'claim' && p.q === 'chuoi');
  assert.ok(claimDaily.length >= 1, 'Must claim daily quest "chuoi" at 54 beads');
  assert.equal(client.merit.me.quests[0].claimed, true, 'Daily chuoi quest must be marked claimed');

  // 4. Weekly quest claim packet
  const claimWeekly = sentPackets.filter(p => p.t === 'claim' && p.q === 'wChuoi');
  assert.ok(claimWeekly.length >= 1, 'Must claim weekly quest "wChuoi" at 108 beads');
  assert.equal(client.merit.me.weekly[0].claimed, true, 'Weekly wChuoi quest must be marked claimed');

  // 5. Journal sync packet
  const journalPackets = sentPackets.filter(p => p.t === 'journal');
  assert.ok(journalPackets.length >= 2, 'Must request journal at checkpoints');
});

test('CHECKPOINT_HARVEST: doMo automatically claims daily/weekly quest and journals at checkpoints', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};

  // Active daily quest needing 54 strikes, weekly needing 108 strikes (with 54 already done)
  client.merit = {
    me: {
      quests: [
        { id: 'tung', name: 'Gõ mõ tụng kinh', need: 54, have: 0, claimed: false, reward: 30 }
      ],
      weekly: [
        { id: 'wTung', name: 'Tụng kinh tuần', need: 108, have: 54, claimed: false, reward: 150 }
      ]
    }
  };

  // Perform 108 strikes (two chunks of 54)
  await client.doMo(108, { chunkSize: 54, intervalMs: 0 });

  // 1. Visit Chánh điện
  assert.ok(sentPackets.some(p => p.t === 'visit' && p.zone === 'Chánh điện'), 'Must visit Chánh điện');

  // 2. Mo packets: total strikes must be 108
  const moPackets = sentPackets.filter(p => p.t === 'mo');
  const totalMo = moPackets.reduce((sum, p) => sum + (p.n || 0), 0);
  assert.equal(totalMo, 108, 'Must send exactly 108 mo strikes');

  // 3. Daily quest claim
  const claimDaily = sentPackets.filter(p => p.t === 'claim' && p.q === 'tung');
  assert.ok(claimDaily.length >= 1, 'Must claim daily quest "tung" at 54 strikes');
  assert.equal(client.merit.me.quests[0].claimed, true, 'Daily tung quest must be marked claimed');

  // 4. Weekly quest claim
  const claimWeekly = sentPackets.filter(p => p.t === 'claim' && p.q === 'wTung');
  assert.ok(claimWeekly.length >= 1, 'Must claim weekly quest "wTung" at 108 strikes');
  assert.equal(client.merit.me.weekly[0].claimed, true, 'Weekly wTung quest must be marked claimed');

  // 5. Journal sync
  const journalPackets = sentPackets.filter(p => p.t === 'journal');
  assert.ok(journalPackets.length >= 2, 'Must request journal at checkpoints');
});

test('SMART_CAP: doLay stops early when zero progress is observed after maxZeroAttempts checkpoints', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.connected = true;
  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};
  client.journal = { bows: 108 };
  client.merit = { me: { total: 1000, quests: [], weekly: [] } };

  // Request 1.000 bows with chunkSize = 9 (3 emotes per chunk), maxZeroAttempts = 2
  // Without smart cap, it would loop 334 emotes. With smart cap, it must stop after 2 zero-progress checkpoints.
  await client.doLay(1000, { chunkSize: 9, maxZeroAttempts: 2, smartCap: true, intervalMs: 0 });

  const layEmotes = sentPackets.filter(p => p.t === 'emote' && p.e === 'lay');
  assert.ok(layEmotes.length <= 15, `Must stop early instead of 334 emotes (actual: ${layEmotes.length})`);
  assert.ok(layEmotes.length >= 3, `Must have performed at least 1 checkpoint (actual: ${layEmotes.length})`);
});

test('SMART_CAP: doLay stops immediately upon receiving server saturation toast', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.connected = true;
  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};
  client.journal = { bows: 108 };
  client.merit = { me: { total: 1000, quests: [], weekly: [] } };
  client.recentToasts = [{ text: 'Hôm nay bạn đã đạt giới hạn lạy Phật sám hối.' }];

  await client.doLay(1000, { chunkSize: 9, smartCap: true, intervalMs: 0 });

  const layEmotes = sentPackets.filter(p => p.t === 'emote' && p.e === 'lay');
  // First checkpoint is at 9 bows = 3 emotes, then it sees the saturation toast and stops immediately
  assert.equal(layEmotes.length, 3, 'Must stop immediately at first checkpoint upon saturation toast');
});

test('SMART_CAP: doBeads stops early when zero progress is observed after maxZeroAttempts checkpoints', async () => {
  const client = new DiDenChuaClient({ turbo: true });
  const sentPackets = [];

  client.connected = true;
  client.send = (pkt) => { sentPackets.push(pkt); };
  client.sleep = async () => {};
  client.journal = { beads: 108 };
  client.merit = { me: { total: 1000, quests: [], weekly: [] } };

  // Request 1.000 beads with chunkSize = 54 (6 batches per chunk), maxZeroAttempts = 2
  // Without smart cap, it would loop ~112 batches. With smart cap, it must stop after 2 zero-progress checkpoints.
  await client.doBeads(1000, { chunkSize: 54, maxZeroAttempts: 2, smartCap: true, intervalMs: 0 });

  const beadPackets = sentPackets.filter(p => p.t === 'beads');
  assert.ok(beadPackets.length <= 30, `Must stop early instead of 112 batches (actual: ${beadPackets.length})`);
  assert.ok(beadPackets.length >= 6, `Must have performed at least 1 checkpoint (actual: ${beadPackets.length})`);
});
