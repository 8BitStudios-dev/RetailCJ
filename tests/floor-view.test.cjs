'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {makeEnvironment, gameDirectory} = require('./environment.cjs');

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

function rendererModule(extra = {}) {
  const calls = {construct: 0, dispose: 0, resize: 0, views: [], entities: [], frames: []};
  class FloorRenderer {
    constructor(options) { calls.construct++; this.options = options; }
    resize() { calls.resize++; }
    setView(view, entity) { calls.views.push(view); calls.entities.push(entity); }
    render(snapshot, dt) { calls.frames.push({snapshot, dt}); if (extra.renderError) throw new Error('GPU failure'); }
    getStats() { return {frames: calls.frames.length}; }
    focus() {}
    dispose() { calls.dispose++; }
  }
  return {module: {FloorRenderer}, calls};
}

function assertReady(env, expected) {
  assert.equal(env.context.PLFloorView.active, expected);
  assert.equal(env.get('game'), null, 'There is no legacy floor canvas');
  assert.equal(env.get('floor3d').hidden, false, 'The single floor keeps its place during loading and errors');
  assert.equal(env.get('cameraControls').hidden, !expected);
  assert.equal(env.context.document.querySelectorAll('[data-floor-mode]').length, 0);
  if (expected) {
    assert.equal(env.get('floorStatus').textContent, '');
    assert.equal(env.get('floorRetry').hidden, true);
  } else {
    assert.equal(env.get('floorStatus').hidden, false);
    assert.ok(env.get('floorStatus').textContent.length > 0, 'An unavailable floor has a visible explanation');
    assert.ok(env.context.document.querySelectorAll('[data-floor-view]').every(button => button.disabled));
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
  assert.equal(env.storageCalls.filter(call => call.operation === 'write').length, before.writes,
    'Camera and renderer recovery never write career, level, mode, or view progress');
}

test('3D boots automatically and ignores an old 2D preference without changing production saves', async () => {
  for (const view of [undefined, '2d', '3d']) {
    let imports = 0;
    const fixture = rendererModule();
    const saved = storage(view);
    const entries = [...saved];
    const env = makeEnvironment({storage: saved, webgl2: true, importFloorRenderer: specifier => {
      imports++; assert.equal(specifier, './renderer-3d.js?v=2.2.0');
      return Promise.resolve(fixture.module);
    }});
    assert.equal(await env.context.PLFloorViewUI.ready, true);
    assertReady(env, true);
    assert.equal(imports, 1);
    assert.equal(fixture.calls.construct, 1);
    assert.equal(fixture.calls.views.at(-1), 'overview');
    assert.deepEqual([...saved], entries);
    assert.equal(env.storageCalls.some(call => call.args[0] === VIEW_KEY), false,
      'The retired view preference is neither read nor rewritten');
    assert.equal(env.context.PLCareerSave.key, CAREER_KEY);
    assert.deepEqual(plain(env.context.PLCareerSave.load()), savedCareer);
    env.get('modeResumeCareer').click();
    assert.equal(env.game().day, savedCareer.day);
    assert.equal(env.mode().player().stats.comp, savedCareer.profile.comp);
  }
});

test('the page keeps game commands above the floor and its compact camera bar directly below the canvas', () => {
  const env = makeEnvironment();
  const doc = env.context.document;
  assert.equal(doc.querySelectorAll('canvas').length, 1);
  assert.equal(env.get('floor3d').tagName, 'CANVAS');
  const menu = env.get('changeMode');
  assert.equal(menu.getAttribute('aria-label'), 'Cambia modalità');
  assert.ok(menu.querySelector('.modeLabelFull'));
  assert.ok(menu.querySelector('.modeLabelShort'));
  assert.equal(menu.querySelector('.modeLabelShort').getAttribute('aria-hidden'), 'true');
  assert.equal(doc.querySelectorAll('[data-app-version], [data-app-update], [data-floor-mode]').length, 0);
  assert.equal(env.context.PLAppUpdate, undefined);
  assert.equal(env.context.PLGraphics, undefined);
  assert.equal(env.context.__sim.refreshApp, undefined);
  const scripts = [...env.html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => match[1]);
  assert.ok(scripts.some(file => file.startsWith('floor-view.js')));
  assert.ok(scripts.every(file => !/graphics-(?:interior|walls|people)|view-mode\.js|app-update/.test(file)));
  const assets = [...env.html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)]
    .map(match => match[1]).filter(url => !/^(?:https?:)?\/\//.test(url));
  for (const asset of assets) {
    assert.equal(new URL(asset, env.context.location.href).searchParams.get('v'), '2.2.0', asset);
    assert.equal(fs.existsSync(path.join(gameDirectory, asset.split('?')[0])), true, asset);
  }
  const floorPosition = env.html.indexOf('id="floor3d"');
  for (const id of ['gameControls', 'playerCommands', 'observationControls']) {
    assert.ok(env.get(id), id);
    assert.ok(env.html.indexOf('id="' + id + '"') < floorPosition, id + ' precedes the floor');
  }
  const viewport = env.get('floorViewport');
  assert.ok(viewport);
  assert.equal(env.get('floor3d').closest('#floorViewport'), viewport);
  assert.equal(env.get('cameraControls').closest('#floorViewport'), viewport);
  assert.equal(env.get('floorSizeToggle').closest('#cameraControls'), env.get('cameraControls'));
  assert.ok(env.html.indexOf('id="cameraControls"') > floorPosition, 'Cameras are below the physical canvas');
  assert.equal(env.get('playerPanel').closest('#interactionPane'), env.get('interactionPane'),
    'The active interaction belongs to the main workspace beside the compact floor');
  env.context.__sim.selectMode('career');
  for (const action of ['next', 'focus', 'pause']) {
    const button = doc.querySelector('[data-specialist-action="' + action + '"]');
    assert.ok(button, action);
    assert.equal(button.closest('#playerCommands'), env.get('playerCommands'));
  }
});

test('without WebGL the floor explains the failure and real animation frames cannot consume a saved career', async () => {
  let imports = 0;
  const env = makeEnvironment({storage: storage('2d'), importFloorRenderer: () => { imports++; throw new Error('Unexpected import'); }});
  assert.equal(await env.context.PLFloorViewUI.ready, false);
  assertReady(env, false);
  assert.match(env.get('floorStatus').textContent, /WebGL|browser|grafica/i);
  assert.equal(imports, 0);
  const size = env.get('floorSizeToggle');
  assert.equal(size.disabled, true);
  size.click();
  assert.equal(env.get('floorViewport').classList.contains('floorExpanded'), false);
  assert.equal(size.getAttribute('aria-expanded'), 'false');
  env.get('modeResumeCareer').click();
  env.evaluate('startDay(); game.time = OPEN');
  const time = env.game().time;
  const checkpoint = env.storage.get(CAREER_KEY);
  for (let frame = 1; frame <= 5; frame++) env.runFrame(frame * 100);
  assert.equal(env.game().time, time);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  env.context.__sim.step(0.05);
  assert.ok(env.game().time > time, 'Programmatic simulation tests remain available without a GPU');
});

test('loading pauses real time, deduplicates retry, and resumes only after the renderer is ready', async () => {
  let resolveModule, imports = 0;
  const pendingModule = new Promise(resolve => { resolveModule = resolve; });
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true,
    importFloorRenderer: () => { imports++; return pendingModule; }});
  env.get('modeResumeCareer').click();
  env.evaluate('startDay(); game.time = OPEN; game.arrivals = []; game.speed = 4');
  const time = env.game().time;
  const checkpoint = env.storage.get(CAREER_KEY);
  const first = env.context.PLFloorViewUI.ready;
  const second = env.context.PLFloorViewUI.retry();
  assert.equal(first, second);
  assert.equal(imports, 1);
  assert.equal(env.context.PLFloorView.active, false);
  for (let frame = 1; frame <= 3; frame++) env.runFrame(frame * 100);
  assert.equal(env.game().time, time);
  resolveModule(fixture.module);
  assert.equal(await first, true);
  assertReady(env, true);
  env.runFrame(400);
  assert.ok(env.game().time > time);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
});

test('a failed import shows recovery and concurrent retries attach one renderer without resetting a frozen visit', async () => {
  let imports = 0, resolveModule;
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true, importFloorRenderer: () => {
    imports++;
    return imports === 1 ? Promise.reject(new Error('Network unavailable'))
      : new Promise(resolve => { resolveModule = resolve; });
  }});
  const before = resumeVisit(env);
  assert.equal(await env.context.PLFloorViewUI.ready, false);
  assertReady(env, false);
  assert.equal(env.get('floorRetry').hidden, false);
  assert.match(env.get('floorStatus').textContent, /caricare|pausa/i);
  env.runFrame(100);
  assertVisit(env, before);
  const first = env.context.PLFloorViewUI.retry();
  const second = env.context.PLFloorViewUI.retry();
  assert.equal(first, second);
  env.get('floorRetry').click();
  assert.equal(imports, 2);
  resolveModule(fixture.module);
  assert.equal(await first, true);
  assertReady(env, true);
  assert.equal(fixture.calls.construct, 1);
  env.evaluate('render(0.1)');
  assert.equal(fixture.calls.frames.at(-1).snapshot.player, before.player);
  assertVisit(env, before);
});

test('losing the graphics context disposes rendering, pauses the visit, and offers a clean reload using its existing checkpoint', async () => {
  const fixture = rendererModule();
  const saved = storage();
  const env = makeEnvironment({storage: saved, webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  const before = resumeVisit(env);
  let prevented = false;
  env.get('floor3d').dispatch('webglcontextlost', {preventDefault() { prevented = true; }});
  assert.equal(prevented, true);
  assert.equal(await env.context.PLFloorViewUI.ready, false);
  assertReady(env, false);
  assert.equal(fixture.calls.dispose, 1);
  env.runFrame(100);
  assertVisit(env, before);
  assert.equal(await env.context.PLFloorViewUI.retry(), false, 'The lost context is not reused');
  env.get('floorRetry').click();
  assert.equal(env.counters.reloads, 1);
  assertVisit(env, before);
  const reloaded = makeEnvironment({storage: saved, webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  assert.equal(await reloaded.context.PLFloorViewUI.ready, true);
  reloaded.get('modeResumeCareer').click();
  assert.equal(reloaded.game().day, savedCareer.day);
  assert.equal(reloaded.mode().player().stats.comp, savedCareer.profile.comp);
});

test('a render failure pauses the same career and retry reconstructs the renderer without saving partial gains', async () => {
  const options = {renderError: true};
  const fixture = rendererModule(options);
  const env = makeEnvironment({storage: storage(), webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  const before = resumeVisit(env);
  env.evaluate('render(0.1)');
  assert.equal(await env.context.PLFloorViewUI.ready, false);
  assertReady(env, false);
  assert.equal(fixture.calls.dispose, 1);
  assertVisit(env, before);
  options.renderError = false;
  assert.equal(await env.context.PLFloorViewUI.retry(), true);
  env.evaluate('render(0.1)');
  assert.equal(fixture.calls.construct, 2);
  assertReady(env, true);
  assertVisit(env, before);
});

test('career cameras follow the current player, respect manual focus, and reset safely for new shifts and observation', async () => {
  const fixture = rendererModule();
  const saved = storage(); saved.set(MODE_KEY, 'career');
  const env = makeEnvironment({storage: saved, webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  const follow = env.context.document.querySelector('[data-floor-view="player"]');
  const viewport = env.get('floorViewport');
  const size = env.get('floorSizeToggle');
  assert.equal(env.context.document.body.classList.contains('careerLayout'), false);
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(follow.hidden, true);
  assert.equal(fixture.calls.views.at(-1), 'overview');
  env.get('modeResumeCareer').click();
  const first = env.mode().player();
  assert.equal(env.game().briefing, true);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), first);
  assert.equal(follow.hidden, false);
  assert.equal(env.context.document.body.classList.contains('careerLayout'), true);
  assert.equal(viewport.classList.contains('floorExpanded'), false);
  size.click();
  assert.equal(viewport.classList.contains('floorExpanded'), true);
  env.context.document.querySelector('[data-floor-view="express"]').click();
  assert.equal(fixture.calls.views.at(-1), 'express');
  env.context.document.querySelector('[data-specialist-action="focus"]').click();
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(env.game().selected, first);
  assert.equal(viewport.classList.contains('floorExpanded'), true, 'Focusing the player preserves the chosen floor size');
  env.context.__sim.newDay(30);
  const next = env.mode().player();
  assert.notEqual(next, first);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), next);
  assert.equal(viewport.classList.contains('floorExpanded'), false, 'A new shift starts with the compact career layout');
  assert.equal(size.getAttribute('aria-expanded'), 'false');
  size.click();
  assert.equal(viewport.classList.contains('floorExpanded'), true);
  const checkpoint = saved.get(CAREER_KEY);
  env.context.__sim.selectMode('observation');
  assert.equal(fixture.calls.views.at(-1), 'overview');
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(follow.hidden, true);
  assert.equal(follow.disabled, true);
  assert.equal(env.context.document.body.classList.contains('careerLayout'), false);
  assert.equal(viewport.classList.contains('floorExpanded'), false, 'Observation clears the career size override');
  assert.equal(env.context.document.body.classList.contains('floorIsExpanded'), false);
  assert.equal(size.getAttribute('aria-expanded'), 'false');
  assert.equal(saved.get(CAREER_KEY), checkpoint);
});

test('camera changes and mode-picker pause preserve a frozen assigned visit and its checkpoint', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  const before = resumeVisit(env);
  const cameras = env.context.document.querySelectorAll('[data-floor-view]');
  assert.deepEqual(cameras.map(button => button.dataset.floorView).sort(), ['express', 'genius', 'overview', 'player', 'product', 'top']);
  for (const view of ['top', 'product', 'genius', 'express', 'player']) {
    env.context.document.querySelector('[data-floor-view="' + view + '"]').click();
    assert.equal(fixture.calls.views.at(-1), view);
    for (const button of cameras) assert.equal(button.getAttribute('aria-pressed'), String(button.dataset.floorView === view));
    assertVisit(env, before);
  }
  env.context.__sim.showModes();
  assert.equal(env.context.PLFloorView.snapshot().paused, true);
  env.runFrame(100);
  assertVisit(env, before);
  env.context.__sim.closeModes();
  assert.equal(env.context.PLFloorView.snapshot().paused, false);
  env.evaluate('render(0.1)');
  assert.equal(fixture.calls.frames.at(-1).snapshot.player, before.player);
  assertVisit(env, before);
});

test('Resume while a 3D import is pending follows the restored player after loading', async () => {
  let resolveModule;
  const fixture = rendererModule();
  const pending = new Promise(resolve => { resolveModule = resolve; });
  const env = makeEnvironment({storage: storage(), webgl2: true, importFloorRenderer: () => pending});
  env.get('modeResumeCareer').click();
  const restored = env.mode().player();
  resolveModule(fixture.module);
  assert.equal(await env.context.PLFloorViewUI.ready, true);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), restored);
  assert.equal(restored.stats.comp, savedCareer.profile.comp);
});

test('a new career starts following only after the final Lead tutorial action', async () => {
  const fixture = rendererModule();
  const env = makeEnvironment({storage: storage(), webgl2: true, importFloorRenderer: () => Promise.resolve(fixture.module)});
  await env.context.PLFloorViewUI.ready;
  env.context.confirm = () => true;
  env.get('modeCareer').click();
  assert.equal(env.context.PLCareerWelcome.active(), true);
  assert.equal(env.context.PLFloorView.player(), null);
  assert.equal(fixture.calls.views.includes('player'), false);
  for (let step = 0; step < 2; step++) env.get('careerWelcomeNext').click();
  assert.equal(env.context.PLFloorView.player(), null);
  env.get('careerWelcomeNext').click();
  assert.equal(env.context.PLCareerWelcome.active(), false);
  const player = env.mode().player();
  assert.equal(player.stats.comp, 0);
  assert.equal(env.game().day, 7);
  assert.equal(fixture.calls.views.at(-1), 'player');
  assert.equal(fixture.calls.entities.at(-1), player);
});
