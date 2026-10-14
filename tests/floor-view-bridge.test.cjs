'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

function activeVisit() {
  const env = makeEnvironment({specialistMode: true});
  env.evaluate(`
    window.__sim.selectMode('career'); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN + 8.7; game.speed = 3; game.weather = 'sole';
    const visitCustomer = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(c => c !== visitCustomer);
    const visitSlot = SLOTS.find(s => !s.taken && s.table.product === visitCustomer.product);
    visitSlot.taken = visitCustomer; visitCustomer.slot = visitSlot;
    visitCustomer.x = visitSlot.x; visitCustomer.y = visitSlot.y;
    visitCustomer.state = 'waiting'; visitCustomer.path = []; visitCustomer.wait = 4;
    visitCustomer.tQueue = game.time; visitCustomer.exp = 90; visitCustomer.patience = 1000;
    playerMode.takeNext();
    const queuedCustomer = spawnCustomer('acc', {hurry: 0, mood: 80, expressNeedsRunner: true});
    game.lineIn = game.lineIn.filter(c => c !== queuedCustomer);
    queuedCustomer.state = 'inEx'; queuedCustomer.path = []; game.lineEx.push(queuedCustomer);
    // Freeze the collections and visit data to expose accidental view-side writes.
    for (const e of [visitCustomer, queuedCustomer, playerMode.player()]) {
      e.path.forEach(Object.freeze); Object.freeze(e.path); Object.freeze(e);
    }
    [game.customers, game.staff, game.lineIn, game.lineGB, game.lineEx].forEach(Object.freeze);
    Object.freeze(game.stats); Object.freeze(playerMode.player().stats);
  `);
  return env;
}

function primitiveState(object) {
  // Selection is an intentional view change, separate from the visit state.
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => key !== 'selected' &&
    (value === null || ['string', 'number', 'boolean'].includes(typeof value))));
}

function capture(env) {
  const game = env.game();
  const player = env.mode().player();
  const customer = player.customer;
  return {
    game, player, customer, customers: game.customers, staff: game.staff,
    lineIn: game.lineIn, lineGB: game.lineGB, lineEx: game.lineEx, stats: game.stats,
    customerPath: customer.path, playerPath: player.path,
    state: JSON.stringify({game: primitiveState(game), player: primitiveState(player),
      customer: primitiveState(customer), customerPath: customer.path, playerPath: player.path,
      queues: [game.lineIn, game.lineGB, game.lineEx].map(queue => queue.map(c => c.id)),
      stats: game.stats, profile: player.stats}),
    storage: [...env.storage],
  };
}

function assertVisitUnchanged(env, before) {
  const after = capture(env);
  for (const key of ['game', 'player', 'customer', 'customers', 'staff', 'lineIn', 'lineGB',
    'lineEx', 'stats', 'customerPath', 'playerPath']) assert.equal(after[key], before[key], key);
  assert.equal(after.player.customer, before.customer);
  assert.equal(after.customer.staff, before.player);
  assert.equal(after.state, before.state);
  assert.deepEqual(after.storage, before.storage);
}

function stubRenderer() {
  const calls = {resize: 0, frames: [], views: [], entities: [], focus: []};
  return {calls,
    resize() { calls.resize++; },
    render(snapshot, dt) { calls.frames.push({snapshot, dt}); },
    getStats() { return {frames: calls.frames.length}; },
    setView(view, entity) { calls.views.push(view); calls.entities.push(entity); },
    focus(person) { calls.focus.push(person); },
  };
}

test('renderer attachment, readiness changes, and camera views never change a frozen active visit', () => {
  const env = activeVisit();
  const before = capture(env);
  const api = env.context.PLFloorView;
  const renderer = stubRenderer();

  api.attach(renderer);
  assert.equal(api.active, false, 'Attaching a renderer alone cannot start the floor');
  assert.equal(api.setReady(true), true);
  api.setView('overview');
  env.evaluate('render(0.1)');
  assert.equal(renderer.calls.frames.length, 1);
  const frame = renderer.calls.frames[0];
  assert.equal(frame.snapshot.customers, before.customers);
  assert.equal(frame.snapshot.staff, before.staff);
  assert.equal(frame.snapshot.time, before.game.time);
  assert.equal(frame.snapshot.player, before.player);
  assert.equal(frame.dt, 0.1);
  assertVisitUnchanged(env, before);

  assert.equal(api.setReady(false), false);
  const fills = env.counters.fills;
  env.evaluate('render(0.2)');
  assert.equal(env.counters.fills, fills, 'An unavailable 3D renderer has no hidden 2D fallback');
  assert.equal(renderer.calls.frames.length, 1);
  assertVisitUnchanged(env, before);

  assert.equal(api.setReady(true), true);
  api.setView('top');
  env.evaluate('render(0.3)');
  assert.equal(renderer.calls.frames.length, 2);
  assert.equal(renderer.calls.frames[1].dt, 0.3);
  assert.deepEqual(renderer.calls.views, ['overview', 'top']);
  assert.deepEqual(plain(api.stats()), {frames: 2});
  assertVisitUnchanged(env, before);
});

function plain(value) { return JSON.parse(JSON.stringify(value)); }

test('3D staff, customer, and table selection opens existing information without taking ownership of a visit', () => {
  const env = activeVisit();
  const before = capture(env);
  const api = env.context.PLFloorView;
  api.attach(stubRenderer());
  const info = () => env.get('info').querySelector('.tipText').innerHTML;

  api.select({isStaff: true, id: before.player.id});
  assert.equal(env.game().selected, before.player);
  assert.ok(info().includes(before.player.name));
  assertVisitUnchanged(env, before);

  api.select({isStaff: false, id: before.customer.id});
  assert.equal(env.game().selected, before.customer);
  assert.ok(info().includes('Cliente #' + before.customer.id));
  assert.ok(info().includes(before.player.name), 'The information keeps the assigned colleague');
  assertVisitUnchanged(env, before);

  const table = before.customer.slot.table;
  api.select({type: 'table', name: table.name});
  assert.equal(env.game().selected.isTable, true);
  assert.equal(env.game().selected.table, table);
  assert.ok(info().includes('Tavolo ' + table.name));
  assertVisitUnchanged(env, before);

  api.select(null);
  assert.equal(env.game().selected, null);
  assertVisitUnchanged(env, before);
});

test('the camera exposes only a started career player and resolves a new day, observation and levels safely', () => {
  const saved = {version: 2, day: 19, phase: 'start', shiftHours: 4,
    profile: {mot: 63, stress: 21, comp: 44, tier: 'S'}};
  const env = makeEnvironment({storage: new Map([['plgame.career.v1', JSON.stringify(saved)], ['plgame.mode', 'career']])});
  const api = env.context.PLFloorView;
  assert.ok(env.mode().player().isPlayer, 'The intro may show a preview player');
  assert.equal(api.player(), null, 'A preview is not an active career');
  assert.equal(api.snapshot().player, null);

  env.get('modeResumeCareer').click();
  const first = env.mode().player();
  assert.equal(api.player(), first);
  assert.equal(api.snapshot().player, first);
  assert.equal(first.stats.comp, saved.profile.comp);
  env.context.__sim.newDay(20);
  const second = env.mode().player();
  assert.notEqual(second, first, 'The next shift creates a new entity');
  assert.equal(second.id, first.id);
  assert.equal(api.player(), second, 'Following cannot cache yesterday’s player entity');
  assert.equal(api.snapshot().player, second);
  env.evaluate('game.level = {name: "test level"}');
  assert.equal(api.player(), null);
  assert.equal(api.snapshot().player, null);
  env.evaluate('game.level = null');
  assert.equal(api.player(), second);
  env.context.__sim.selectMode('observation');
  assert.equal(api.player(), null);
  assert.equal(api.snapshot().player, null);
});

test('selecting the personal camera passes the exact current player while preserving a frozen active visit', () => {
  const env = activeVisit();
  const before = capture(env);
  const api = env.context.PLFloorView;
  const renderer = stubRenderer();
  api.attach(renderer);
  api.setReady(true);
  api.setView('player');
  assert.equal(renderer.calls.views.at(-1), 'player');
  assert.equal(renderer.calls.entities.at(-1), before.player);
  env.evaluate('render(0.1)');
  assert.equal(renderer.calls.frames.at(-1).snapshot.player, before.player);
  assertVisitUnchanged(env, before);
});
