import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiDenChuaClient, PETS_CATALOG } from '../src/client.js';
import { TASKS_CATALOG, QUEST_METADATA, renderDashboardHTML, state } from '../server.js';

test('PETS_CATALOG: contains all 9 official species from niemphat.online with accurate ranks and speed multipliers', () => {
  const species = [
    'tho_ngoc', 'huou', 'nghe', 'trau_vang', 'huyen_vu',
    'bach_tuong', 'chu_tuoc', 'su_tu_xanh', 'thanh_long'
  ];

  for (const sp of species) {
    const meta = PETS_CATALOG[sp];
    assert.ok(meta, `Species ${sp} must exist in PETS_CATALOG`);
    assert.ok(meta.name, `${sp} must have a name`);
    assert.ok(meta.mult >= 1.5, `${sp} speed multiplier must be at least 1.5x`);
    assert.ok(['thuong', 'quy', 'hiem', 'toi_thuong'].includes(meta.rank), `${sp} must have valid rank`);
  }

  // Check specific ranks and multipliers
  assert.equal(PETS_CATALOG.tho_ngoc.rank, 'thuong');
  assert.equal(PETS_CATALOG.tho_ngoc.mult, 1.5);

  assert.equal(PETS_CATALOG.nghe.rank, 'quy');
  assert.equal(PETS_CATALOG.nghe.mult, 1.75);

  assert.equal(PETS_CATALOG.su_tu_xanh.rank, 'hiem');
  assert.equal(PETS_CATALOG.su_tu_xanh.mult, 2.0);
  assert.equal(PETS_CATALOG.su_tu_xanh.reqLv, 5);

  assert.equal(PETS_CATALOG.thanh_long.rank, 'toi_thuong');
  assert.equal(PETS_CATALOG.thanh_long.mult, 2.4);
  assert.equal(PETS_CATALOG.thanh_long.reqLv, 5);
});

test('DiDenChuaClient: getPetBook and getPetSpawns call correct endpoints', async () => {
  const client = new DiDenChuaClient();
  const requestedUrls = [];
  client.get = async (path) => {
    requestedUrls.push(path);
    if (path === '/pets') {
      return { species: [{ item: 'tho_ngoc', owned: true }], left: 5, daily: 5 };
    }
    if (path.startsWith('/pets/spawns')) {
      return { spawns: [{ id: 'beast_1', item: 'tho_ngoc', x: 10, z: -5 }] };
    }
    return {};
  };

  const book = await client.getPetBook();
  assert.equal(book.left, 5);
  assert.ok(requestedUrls.includes('/pets'));

  const spawns = await client.getPetSpawns('linhung');
  assert.equal(spawns.spawns.length, 1);
  assert.ok(requestedUrls.some(u => u.includes('temple=linhung')));
});

test('DiDenChuaClient: doBondPet starts bond, waits, finishes, and auto-equips when successful', async () => {
  const client = new DiDenChuaClient();
  const sentWs = [];
  const posted = [];

  client.send = (msg) => { sentWs.push(msg); };
  client.post = async (path, body) => {
    posted.push({ path, body });
    if (path === '/pets/bond/start') {
      return { ok: true, ms: 50 }; // fast mock
    }
    if (path === '/pets/bond/finish') {
      return { ok: true, item: 'su_tu_xanh', dup: false, left: 4 };
    }
    if (path === '/equip') {
      return { ok: true };
    }
    return { ok: true };
  };

  const beast = { id: 'b123', model: 'su_tu_xanh', x: 12.5, z: -8.2 };
  const res = await client.doBondPet('linhung', beast, { fast: true });

  assert.equal(res.ok, true);
  assert.equal(res.item, 'su_tu_xanh');

  // Verify avatar coordinates sent
  assert.ok(sentWs.some(m => m.t === 's' && m.x === 12.5 && m.z === -8.2), 'Must send positioning WS packet near beast');

  // Verify API flow: start -> finish -> equip
  assert.ok(posted.some(p => p.path === '/pets/bond/start' && p.body.id === 'b123'), 'Must call /pets/bond/start');
  assert.ok(posted.some(p => p.path === '/pets/bond/finish' && p.body.id === 'b123'), 'Must call /pets/bond/finish');
  assert.ok(posted.some(p => p.path === '/equip' && p.body.item === 'su_tu_xanh'), 'Must call /equip for newly bonded pet');
});

test('DiDenChuaClient: doHuntPets scans priority temples and bonds with wild beasts', async () => {
  const client = new DiDenChuaClient();
  const visitedTemples = [];
  const bondedIds = [];

  client.getPetBook = async () => ({ left: 2, daily: 5 });
  client.doVisit = async (t) => { visitedTemples.push(t); };
  client.getPetSpawns = async (t) => {
    if (t === 'linhung') {
      return { spawns: [{ id: 'spawn_lh_1', model: 'tho_ngoc', x: 5, z: 5 }] };
    }
    if (t === 'nuisam') {
      return { spawns: [{ id: 'spawn_ns_1', model: 'nghe', x: -2, z: 8 }] };
    }
    return { spawns: [] };
  };
  client.doBondPet = async (templeId, beast, options) => {
    bondedIds.push(beast.id);
    return { ok: true, item: beast.model, left: bondedIds.length === 1 ? 1 : 0 };
  };
  client.post = async () => ({ ok: true });

  const huntRes = await client.doHuntPets({ fast: true, templeList: ['linhung', 'nuisam', 'cuuphong'] });

  assert.equal(huntRes.ok, true);
  assert.equal(bondedIds.length, 2, 'Should have bonded with 2 beasts before running out of attempts');
  assert.equal(bondedIds[0], 'spawn_lh_1');
  assert.equal(bondedIds[1], 'spawn_ns_1');
  assert.equal(huntRes.remaining, 0);
});

test('server.js: TASKS_CATALOG and QUEST_METADATA correctly expose pet-hunt and a_ketduyen', () => {
  const huntTask = TASKS_CATALOG.find(t => t.id === 'pet-hunt');
  assert.ok(huntTask, 'TASKS_CATALOG must contain pet-hunt');
  assert.equal(huntTask.questId, 'a_ketduyen');
  assert.ok(huntTask.icon.includes('🐾'));

  assert.ok(QUEST_METADATA.a_ketduyen, 'QUEST_METADATA must contain a_ketduyen');
  assert.equal(QUEST_METADATA.a_ketduyen.taskId, 'pet-hunt');

  // Verify UI generation
  state.merit = {
    me: {
      quests: [
        { id: 'a_ketduyen', name: 'Kết duyên Linh thú', need: 3, have: 0, claimed: false, done: false, period: 'achievement' },
        { id: 'a_pet_nuisam', name: 'Linh thú Thất Sơn', need: 1, have: 0, claimed: false, done: false, period: 'achievement' }
      ]
    }
  };

  const html = renderDashboardHTML();
  assert.ok(html.includes('runTask(\'pet-hunt\')'), 'Must generate runTask(pet-hunt) for a_ketduyen');
  assert.ok(html.includes('🐾 Bắt Linh thú (5 lượt)'), 'Must render button label for pet-hunt');
  assert.ok(html.includes('runTask(\'petAll\')'), 'Must generate runTask(petAll) for a_pet_nuisam');
});

