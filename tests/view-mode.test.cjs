'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const MODE_KEY = 'plgame.mode';
const LEVELS_KEY = 'plgame.levels';
const VIEW_KEY = 'plgame.view';
const savedCareer = {version: 2, day: 29, phase: 'start', shiftHours: 4,
  profile: {mot: 63, stress: 21, comp: 44, tier: 'S'}};
const plain = value => JSON.parse(JSON.stringify(value));

function storage(view) {
  const seed = new Map([[CAREER_KEY, JSON.stringify(savedCareer)], [MODE_KEY, 'observation'],
    [LEVELS_KEY, '{"0":{"stars":3,"value":99}}']]);
  if (view !== undefined) seed.set(VIEW_KEY, view);
  return seed;
}

function productionEntries(env) {
  return [CAREER_KEY, MODE_KEY, LEVELS_KEY].map(key => [key, env.storage.get(key)]);
}

function rendererModule() {
  const calls = {construct: 0, dispose: 0, resize: 0, views: [], entities: [], frames: []};
  class BetaFloorRenderer {
    constructor(options) { calls.construct++; this.options = options; }
    resize() { calls.resize++; }
    setView(view, entity) { calls.views.push(view); calls.entities.push(entity); }
    render(snapshot, dt) { calls.frames.push({snapshot, dt}); }
    getStats() { return {frames: calls.frames.length}; }
    focus() {}
    dispose() { calls.dispose++; }
  }
  return {module: {BetaFloorRenderer}, calls};
}

function modeButtons(env, mode) {
  return env.context.document.querySelectorAll(`[data-floor-mode="${mode}"]`);
}

function assertMode(env, mode) {
  const active = mode === '3d';
  assert.equal(env.context.PLFloorView.active, active);
  assert.equal(env.get('floor3d').hidden, !active);
  assert.equal(env.get('game').hidden, active);
  assert.equal(env.get('cameraControls').hidden, !active);
  for (const value of ['2d', '3d']) {
    const controls = modeButtons(env, value);
    assert.equal(controls.length, 2, 'Intro and floor both offer the same view selector');
    for (const button of controls) {
      assert.equal(button.classList.contains('on'), value === mode);
      assert.equal(button.getAttribute('aria-pressed'), String(value === mode));
    }
  }
}

function resumeVisit(env) {
  env.get('modeResumeCareer').click();
  env.evaluate(`
    startDay(); game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN + 8.7; game.speed = 3;
    const liveCustomer = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(c => c !== liveCustomer);
    const liveSlot = SLOTS.find(s => !s.taken && s.table.product === liveCustomer.product);
    liveSlot.taken = liveCustomer; liveCustomer.slot = liveSlot;
    liveCustomer.x = liveSlot.x; liveCustomer.y = liveSlot.y;
    liveCustomer.state = 'waiting'; liveCustomer.path = []; liveCustomer.wait = 4;
    liveCustomer.tQueue = game.time; liveCustomer.exp = 90; liveCustomer.patience = 1000;
    playerMode.takeNext();
    for (const entity of [liveCustomer, playerMode.player()]) {
      entity.path.forEach(Object.freeze); Object.freeze(entity.path); Object.freeze(entity);
    }
    [game.customers, game.staff, game.lineIn, game.lineGB, game.lineEx].forEach(Object.freeze);
    Object.freeze(game.stats); Object.freeze(playerMode.player().stats);
  `);
  return {
    game: env.game(), player: env.mode().player(), customer: env.mode().player().customer,
    entities: [env.game().customers, env.game().staff],
    paths: [env.mode().player().path, env.mode().player().customer.path],
    state: visitState(env), production: productionEntries(env),
    writes: env.storageCalls.filter(call => call.operation === 'write').length,
  };
}

function visitState(env) {
  return env.evaluate(`JSON.stringify({time: game.time, speed: game.speed,
    customer: {id: playerMode.player().customer.id, state: playerMode.player().customer.state,
      step: playerMode.player().customer.step, x: playerMode.player().customer.x,
      y: playerMode.player().customer.y, path: playerMode.player().customer.path},
    player: {id: playerMode.player().id, state: playerMode.player().state,
      path: playerMode.player().path, stats: playerMode.player().stats},
    queues: [game.lineIn, game.lineGB, game.lineEx].map(q => q.map(c => c.id)), stats: game.stats})`);
}

function assertVisit(env, before) {
  assert.equal(env.game(), before.game);
  assert.equal(env.mode().player(), before.player);
  assert.equal(before.player.customer, before.customer);
  assert.equal(before.customer.staff, before.player);
  assert.equal(env.game().customers, before.entities[0]);
  assert.equal(env.game().staff, before.entities[1]);
  assert.equal(before.player.path, before.paths[0]);
  assert.equal(before.customer.path, before.paths[1]);
  assert.equal(visitState(env), before.state);
  assert.deepEqual(productionEntries(env), before.production);
  const writes = env.storageCalls.filter(call => call.operation === 'write').slice(before.writes);
  assert.ok(writes.every(call => call.args[0] === VIEW_KEY), 'Only the view preference may be saved by view controls');
}

test('default 2D boot loads the production career without loading Three.js or writing any view preference', async () => {
  let imports = 0;
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => { imports++; return Promise.reject(new Error('Unexpected module load')); }});
  const before = productionEntries(env);
  await env.context.PLFloorViewUI.ready;
  assertMode(env, '2d');
  assert.equal(imports, 0);
  assert.equal(env.context.PLCareerSave.key, CAREER_KEY);
  assert.deepEqual(plain(env.context.PLCareerSave.load()), savedCareer);
  assert.deepEqual(productionEntries(env), before);
  assert.equal(env.storage.has(VIEW_KEY), false);
  assert.equal(env.get('careerResumeCard').hidden, false);
  env.get('modeResumeCareer').click();
  assert.equal(env.game().day, savedCareer.day);
  assert.equal(env.mode().player().stats.comp, savedCareer.profile.comp);
});

test('a saved 3D preference restores the production career and level progress through the same Resume control', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage('3d'), webgl2: true,
    importFloorRenderer: specifier => {
      assert.equal(specifier, './renderer-3d.js?v=1.9.3');
      return Promise.resolve(fixture.module);
    }});
  const before = productionEntries(env);
  assert.equal(await env.context.PLFloorViewUI.ready, true);
  assertMode(env, '3d');
  assert.deepEqual(plain(env.context.PLCareerSave.load()), savedCareer);
  assert.deepEqual(productionEntries(env), before);
  assert.equal(fixture.calls.construct, 1);
  env.get('modeResumeCareer').click();
  assert.equal(env.game().day, savedCareer.day);
  assert.equal(env.mode().player().stats.comp, savedCareer.profile.comp);
  assert.equal(env.mode().player().stats.mot, savedCareer.profile.mot);
  assertMode(env, '3d');
});

test('the real intro, floor, and camera controls switch one frozen career visit while saving only plgame.view', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  const before = resumeVisit(env);
  modeButtons(env, '3d')[0].click();
  assert.equal(await env.context.PLFloorViewUI.ready, true);
  assertMode(env, '3d');
  env.evaluate('render(0.1)');
  assert.equal(fixture.calls.frames.length, 1);
  assert.equal(fixture.calls.frames[0].snapshot.customers, before.entities[0]);
  assert.equal(fixture.calls.frames[0].snapshot.staff, before.entities[1]);
  const controls = env.context.document.querySelectorAll('[data-floor-view]');
  assert.deepEqual(controls.map(button => button.dataset.floorView).sort(), ['express', 'genius', 'overview', 'player', 'product', 'top']);
  for (const view of ['top', 'product', 'genius', 'express']) {
    env.context.document.querySelector(`[data-floor-view="${view}"]`).click();
    for (const button of controls) {
      assert.equal(button.classList.contains('on'), button.dataset.floorView === view);
      assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.floorView === view));
    }
    assertVisit(env, before);
  }
  assert.deepEqual(fixture.calls.views, ['player', 'top', 'product', 'genius', 'express']);
  assert.equal(env.storage.get(VIEW_KEY), '3d');
  assertVisit(env, before);

  modeButtons(env, '2d')[1].click();
  await env.context.PLFloorViewUI.ready;
  assertMode(env, '2d');
  const fills = env.counters.fills;
  env.evaluate('render(0.2)');
  assert.ok(env.counters.fills > fills, 'The production 2D floor draws after the view changes');
  assert.equal(fixture.calls.frames.length, 1);
  assert.equal(env.storage.get(VIEW_KEY), '2d');
  assert.ok(controls.every(button => button.disabled), 'Camera focus buttons are disabled in 2D');
  assertVisit(env, before);

  modeButtons(env, '3d')[1].click();
  await env.context.PLFloorViewUI.ready;
  assertMode(env, '3d');
  assert.equal(fixture.calls.construct, 1, 'A view switch reuses the loaded renderer');
  assert.equal(fixture.calls.views.at(-1), 'player', 'Returning to a 3D career follows the current player');
  assert.equal(fixture.calls.entities.at(-1), before.player);
  assertVisit(env, before);

  env.context.document.querySelector('[data-floor-view="top"]').click();
  env.context.document.querySelector('[data-specialist-action="focus"]').click();
  assert.equal(fixture.calls.views.at(-1), 'player', 'Mostrami sul floor re-enables following after a manual camera');
  assert.equal(fixture.calls.entities.at(-1), before.player);
  assert.equal(env.game().selected, before.player);
  const follow = env.context.document.querySelector('[data-floor-view="player"]');
  assert.equal(follow.classList.contains('on'), true);
  assert.equal(follow.getAttribute('aria-pressed'), 'true');
  assertVisit(env, before);
});

test('unsupported WebGL keeps 2D playable and preserves an existing production career', async () => {
  let imports = 0;
  const env = makeEnvironment({storage: storage('3d'),
    importFloorRenderer: () => { imports++; return Promise.reject(new Error('Unexpected module load')); }});
  const before = productionEntries(env);
  assert.equal(await env.context.PLFloorViewUI.ready, false);
  assertMode(env, '2d');
  assert.equal(imports, 0);
  assert.ok(modeButtons(env, '3d').every(button => button.disabled));
  assert.deepEqual(productionEntries(env), before);
  env.get('modeResumeCareer').click();
  assert.equal(env.game().day, savedCareer.day);
  env.evaluate('startDay(); render(0.1)');
  assert.ok(env.counters.fills > 0);
});

test('a rejected 3D import is caught, keeps the same career in 2D, and allows a later successful retry', async () => {
  let imports = 0;
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => ++imports === 1 ? Promise.reject(new Error('Network unavailable')) : Promise.resolve(fixture.module)});
  const before = resumeVisit(env);
  assert.equal(await env.context.PLFloorViewUI.selectMode('3d'), false);
  assertMode(env, '2d');
  assert.ok(modeButtons(env, '3d').every(button => !button.disabled));
  assertVisit(env, before);
  assert.equal(await env.context.PLFloorViewUI.selectMode('3d'), true);
  assertMode(env, '3d');
  assert.equal(imports, 2);
  assertVisit(env, before);
});

test('selecting 2D while the 3D module loads wins the race and leaves the cached renderer inactive', async () => {
  let resolveModule, imports = 0;
  const pendingModule = new Promise(resolve => { resolveModule = resolve; });
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => { imports++; return pendingModule; }});
  const before = resumeVisit(env);
  const pendingView = env.context.PLFloorViewUI.selectMode('3d');
  assertMode(env, '2d');
  assert.ok(modeButtons(env, '3d').every(button => button.disabled));
  assert.ok(modeButtons(env, '2d').every(button => !button.disabled));
  modeButtons(env, '2d')[0].click();
  resolveModule(fixture.module);
  assert.equal(await pendingView, false);
  assertMode(env, '2d');
  assert.equal(env.storage.get(VIEW_KEY), '2d');
  assert.equal(fixture.calls.construct, 1);
  assert.equal(fixture.calls.resize, 0, 'Finishing the load must not activate or resize an unwanted view');
  assertVisit(env, before);
  assert.equal(await env.context.PLFloorViewUI.selectMode('3d'), true);
  assert.equal(imports, 1);
  assertMode(env, '3d');
  assertVisit(env, before);
});

test('a lost graphics context releases 3D resources and renders the same career through the existing 2D canvas', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  const before = resumeVisit(env);
  assert.equal(await env.context.PLFloorViewUI.selectMode('3d'), true);
  env.get('floor3d').dispatch('webglcontextlost');
  assertMode(env, '2d');
  assert.equal(fixture.calls.dispose, 1);
  assert.ok(modeButtons(env, '3d').every(button => button.disabled));
  const fills = env.counters.fills;
  env.evaluate('render(0.1)');
  assert.ok(env.counters.fills > fills);
  assertVisit(env, before);
});

test('denied preference writes do not prevent switching to 3D or erase the production save', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), storageError: 'write', webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  const before = productionEntries(env);
  assert.equal(await env.context.PLFloorViewUI.selectMode('3d'), true);
  assertMode(env, '3d');
  assert.equal(await env.context.PLFloorViewUI.selectMode('2d'), false);
  assertMode(env, '2d');
  assert.deepEqual(productionEntries(env), before);
  assert.equal(env.storage.has(VIEW_KEY), false);
});

test('a saved 3D career preview stays in overview until Resume, then follows the restored player even during briefing', async () => {
  const fixture = rendererModule();
  const saved = storage('3d');
  saved.set(MODE_KEY, 'career');
  const env = makeEnvironment({storage: saved, webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  const follow = env.context.document.querySelector('[data-floor-view="player"]');
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(follow.hidden, true);
  assert.equal(fixture.calls.views.at(-1), 'overview');
  assert.equal(saved.get(CAREER_KEY), JSON.stringify(savedCareer));

  env.get('modeResumeCareer').click();
  const player = env.mode().player();
  assert.equal(env.game().briefing, true);
  assert.equal(env.context.PLFloorView.snapshot().paused, true);
  assert.equal(fixture.calls.views.at(-1), 'player', 'Following starts immediately, before the shift moves');
  assert.equal(fixture.calls.entities.at(-1), player);
  assert.equal(follow.hidden, false);
  assert.equal(follow.classList.contains('on'), true);
  assert.equal(follow.getAttribute('aria-pressed'), 'true');
  assert.equal(player.stats.comp, savedCareer.profile.comp);
  const checkpoint = saved.get(CAREER_KEY);
  env.evaluate('render(0.1)');
  assert.equal(fixture.calls.frames.at(-1).snapshot.player, player);
  assert.equal(saved.get(CAREER_KEY), checkpoint, 'Camera rendering does not save career progress');
});

test('New Career begins following only after the final Lead tutorial action, not while the tutorial is open', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage('3d'), webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  env.context.confirm = () => true;
  await env.context.PLFloorViewUI.ready;
  env.get('modeCareer').click();
  assert.equal(env.context.PLCareerWelcome.active(), true);
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(fixture.calls.views.includes('player'), false);
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeNext').click();
  assert.equal(env.context.PLFloorView.player(), null);
  env.get('careerWelcomeNext').click();
  assert.equal(env.context.PLCareerWelcome.active(), false);
  const player = env.mode().player();
  assert.equal(player.stats.comp, 0);
  assert.equal(env.game().day, 7);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), player);
});

test('Resume during a pending 3D import follows the restored current player instead of the intro preview', async () => {
  let resolveModule;
  const pendingModule = new Promise(resolve => { resolveModule = resolve; });
  const fixture = rendererModule();
  const saved = storage('3d');
  saved.set(MODE_KEY, 'career');
  const env = makeEnvironment({storage: saved, webgl2: true, importFloorRenderer: () => pendingModule});
  const preview = env.mode().player();
  assert.equal(env.context.PLFloorView.player(), null);
  env.get('modeResumeCareer').click();
  const restored = env.mode().player();
  assert.notEqual(restored, preview);
  const checkpoint = saved.get(CAREER_KEY);
  resolveModule(fixture.module);
  assert.equal(await env.context.PLFloorViewUI.ready, true);
  assertMode(env, '3d');
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), restored);
  assert.equal(restored.stats.comp, savedCareer.profile.comp);
  assert.equal(saved.get(CAREER_KEY), checkpoint);
});

test('a new career day follows its new player, while Observation hides following and returns to overview', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage('3d'), webgl2: true,
    importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  env.get('modeResumeCareer').click();
  const first = env.mode().player();
  env.context.document.querySelector('[data-floor-view="express"]').click();
  env.context.__sim.newDay(30);
  const next = env.mode().player();
  assert.notEqual(next, first);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), next);
  const checkpoint = env.storage.get(CAREER_KEY);
  env.context.__sim.selectMode('observation');
  const follow = env.context.document.querySelector('[data-floor-view="player"]');
  assert.equal(fixture.calls.views.at(-1), 'overview');
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(follow.hidden, true);
  assert.equal(follow.disabled, true);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  env.get('modeResumeCareer').click();
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), env.mode().player());
  assert.equal(follow.hidden, false);
});
