/**
 * Tests for doGarden() (plant + water) and doLoc() (nhặt lộc) quest support.
 * - d_plant: Trồng một cây (requires plant + water packets after garden)
 * - d_loc2: Dạo vườn chùa (requires { t: 'loc' } × 2)
 * - w_loc15: Hành hương nhặt lộc (weekly, requires { t: 'loc' } × up to 15)
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient } from '../src/client.js';

function makeMockClient(questOverrides = [], weeklyOverrides = []) {
  const client = new DiDenChuaClient({ turbo: true });
  // Bypass real WS
  client.ws = null;
  client.aborted = false;
  client.checkAborted = () => {};
  const sent = [];
  client.send = (pkt) => sent.push(pkt);
  client.sleep = async () => {};
  client.humanDelay = async () => {};
  client.merit = {
    me: {
      quests: questOverrides,
      weekly: weeklyOverrides,
    },
  };
  client._sent = sent;
  return client;
}

describe('doGarden() — d_plant quest support', () => {
  it('sends garden + plant + water when d_plant quest is unclaimed', async () => {
    const client = makeMockClient([
      { id: 'd_plant', have: 0, need: 1, claimed: false }
    ]);
    await client.doGarden({ autoWaterOthers: false });

    const types = client._sent.map(p => p.t);
    assert.ok(types.includes('garden'), 'should send garden');
    assert.ok(types.includes('plant'), 'should send plant');
    assert.ok(types.includes('water'), 'should send water');
    const plantPkt = client._sent.find(p => p.t === 'plant');
    assert.equal(plantPkt?.k, 'cuc', 'plant packet should have k=cuc');
  });

  it('still sends garden + plant when d_plant quest is absent (mặc định trồng)', async () => {
    const client = makeMockClient([]); // no quests
    await client.doGarden({ autoWaterOthers: false });

    const types = client._sent.map(p => p.t);
    assert.ok(types.includes('garden'), 'should send garden');
    assert.ok(types.includes('plant'), 'should send plant when no quest data');
  });

  it('skips plant+water when d_plant is already claimed', async () => {
    const client = makeMockClient([
      { id: 'd_plant', have: 1, need: 1, claimed: true }
    ]);
    await client.doGarden({ autoWaterOthers: false });

    const types = client._sent.map(p => p.t);
    assert.ok(types.includes('garden'), 'should always send garden');
    assert.ok(!types.includes('plant'), 'should NOT send plant when quest claimed');
    assert.ok(!types.includes('water'), 'should NOT send water when quest claimed');
  });

  it('sends water-others packet when autoWaterOthers=true', async () => {
    const client = makeMockClient([
      { id: 'd_plant', have: 1, need: 1, claimed: true }
    ]);
    await client.doGarden({ autoWaterOthers: true });

    // Even without planting, autoWaterOthers should trigger a water packet
    const types = client._sent.map(p => p.t);
    assert.ok(types.includes('water'), 'should send water for others when autoWaterOthers=true');
  });
});

describe('doLoc() — d_loc2 and w_loc15 quest support', () => {
  it('sends correct number of loc packets for d_loc2 (count=2)', async () => {
    const client = makeMockClient();
    await client.doLoc(2);
    const locPackets = client._sent.filter(p => p.t === 'loc');
    assert.equal(locPackets.length, 2, 'should send exactly 2 loc packets for d_loc2');
  });

  it('sends correct number of loc packets for w_loc15 (count=5 partial)', async () => {
    const client = makeMockClient();
    await client.doLoc(5);
    const locPackets = client._sent.filter(p => p.t === 'loc');
    assert.equal(locPackets.length, 5, 'should send 5 loc packets for partial w_loc15');
  });

  it('returns ok:true with count', async () => {
    const client = makeMockClient();
    const result = await client.doLoc(3);
    assert.equal(result.ok, true);
    assert.equal(result.count, 3);
  });

  it('sends no loc packets when count=0', async () => {
    const client = makeMockClient();
    await client.doLoc(0);
    const locPackets = client._sent.filter(p => p.t === 'loc');
    assert.equal(locPackets.length, 0, 'should send 0 loc packets when count=0');
  });
});
