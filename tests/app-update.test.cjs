'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const VERSION = '1.8.1';
const CAREER_KEY = 'plgame.career.v1';
const buttons = env => env.context.document.querySelectorAll('[data-app-update]');
const statuses = env => env.context.document.querySelectorAll('[data-app-update-status]');
const labels = env => env.context.document.querySelectorAll('[data-app-version]');

function activeCareer(options = {}) {
  const env = makeEnvironment(options);
  env.evaluate(`
    window.__sim.selectMode('career'); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; Math.random = () => 0.5;
    const c = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(item => item !== c);
    const slot = SLOTS.find(item => !item.taken && item.table.product === c.product);
    slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
    c.state = 'waiting'; c.path = []; c.wait = 0; c.tQueue = game.time;
    c.patience = 1000; c.exp = 90; playerMode.takeNext();
    bump(playerMode.player(), 'comp', 7);
  `);
  return {env, game: env.game(), player: env.mode().player(), client: env.mode().player().customer,
    checkpoint: env.storage.get(CAREER_KEY), time: env.game().time,
    storageCalls: env.storageCalls.length};
}

function assertVisitUnchanged(fixture) {
  const {env, game, player, client, checkpoint, time, storageCalls} = fixture;
  assert.equal(env.game(), game);
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, client);
  assert.equal(client.staff, player);
  assert.equal(env.game().time, time);
  assert.equal(player.stats.comp, 7 * (1 - 0.0075 * 20));
  assert.equal(env.storage.get(CAREER_KEY), checkpoint, 'Refresh must keep the last durable checkpoint');
  assert.equal(env.storageCalls.length, storageCalls, 'Refresh does not read, clear or write storage');
}

function stubNow(env, value = 123456789) {
  env.evaluate(`Date.now = () => ${value}`);
}

test('the version appears in the HUD and intro and every local script and stylesheet uses the same release', () => {
  const env = makeEnvironment();
  const version = env.context.document.querySelector('meta[name="application-version"]');
  assert.ok(version);
  assert.equal(version.getAttribute('content'), VERSION);
  assert.equal(labels(env).length, 2);
  for (const label of labels(env)) assert.equal(label.textContent, 'Versione ' + VERSION);
  assert.ok(env.get('appUpdate'));
  assert.ok(env.get('introAppUpdate'));
  assert.equal(buttons(env).length, 2);
  assert.equal(statuses(env).length, 2);
  const assets = [...env.html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)]
    .map(match => match[1]).filter(url => !/^(?:https?:)?\/\//.test(url));
  assert.ok(assets.length > 5, 'The runtime modules and stylesheets are versioned');
  for (const asset of assets) {
    assert.equal(new URL(asset, env.context.location.href).searchParams.get('v'), VERSION, asset);
  }
});

test('the intro update button reloads without asking for confirmation before a shift starts', () => {
  const env = makeEnvironment();
  stubNow(env);
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  const checkpoint = env.storage.get(CAREER_KEY);
  const storageCalls = env.storageCalls.length;
  env.get('introAppUpdate').click();
  assert.equal(confirmations, 0);
  assert.deepEqual(env.navigations, ['http://retailcj.test/?foo=bar&app-update=123456789#game']);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  assert.equal(env.storageCalls.length, storageCalls);
  for (const button of buttons(env)) assert.equal(button.disabled, true);
  for (const status of statuses(env)) assert.match(status.textContent, /aggiornamento/i);
});

test('cancelling an active-shift update leaves the assigned visit, checkpoint and controls untouched', () => {
  const fixture = activeCareer();
  const {env} = fixture;
  const beforeStatuses = statuses(env).map(status => status.textContent);
  const beforeDisabled = buttons(env).map(button => button.disabled);
  let message = '';
  env.context.confirm = text => { message = text; return false; };
  assert.equal(env.context.__sim.refreshApp(), false);
  assert.match(message, /turno/i);
  assert.match(message, /interromp/i);
  assert.match(message, /carriera/i);
  assert.match(message, /ultimo salvataggio/i);
  assertVisitUnchanged(fixture);
  assert.equal(env.navigations.length, 0);
  assert.equal(env.navigationAttempts.length, 0);
  assert.deepEqual(statuses(env).map(status => status.textContent), beforeStatuses);
  assert.deepEqual(buttons(env).map(button => button.disabled), beforeDisabled);
});

test('accepting the HUD update during a shift navigates without saving partial career gains', () => {
  const fixture = activeCareer();
  const {env} = fixture;
  stubNow(env, 200);
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  env.get('appUpdate').click();
  assert.equal(confirmations, 1);
  assert.deepEqual(env.navigations, ['http://retailcj.test/?foo=bar&app-update=200#game']);
  assertVisitUnchanged(fixture);
  for (const button of buttons(env)) assert.equal(button.disabled, true);
});

test('refresh preserves origin, path, existing query and hash while replacing an older cache-buster', () => {
  const original = 'https://retailcj.test/game/play?foo=a&foo=b&app-update=10&encoded=a%26b#career';
  const env = makeEnvironment({locationHref: original});
  stubNow(env, 300);
  assert.equal(env.context.PLAppUpdate.refresh(), true);
  const next = new URL(env.navigations[0]);
  const before = new URL(original);
  assert.equal(next.origin, before.origin);
  assert.equal(next.pathname, before.pathname);
  assert.equal(next.hash, before.hash);
  assert.deepEqual(next.searchParams.getAll('foo'), ['a', 'b']);
  assert.equal(next.searchParams.get('encoded'), 'a&b');
  assert.deepEqual(next.searchParams.getAll('app-update'), ['300']);
});

test('a finished shift can update without confirmation and keeps its completed checkpoint', () => {
  const env = makeEnvironment();
  env.evaluate("window.__sim.selectMode('career'); startDay(); game.time = playerMode.shiftEnd(); step(0.05)");
  assert.equal(env.game().over, true);
  const checkpoint = env.storage.get(CAREER_KEY);
  assert.equal(JSON.parse(checkpoint).phase, 'completed');
  const storageCalls = env.storageCalls.length;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  assert.equal(env.context.__sim.refreshApp(), true);
  assert.equal(confirmations, 0);
  assert.equal(env.navigations.length, 1);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  assert.equal(env.storageCalls.length, storageCalls);
});

test('an accepted reload disables both controls and blocks repeated calls during navigation', () => {
  const env = makeEnvironment();
  env.get('introAppUpdate').click();
  env.get('appUpdate').click();
  env.get('introAppUpdate').click();
  assert.equal(env.context.PLAppUpdate.refresh(), false);
  assert.equal(env.context.__sim.refreshApp(), false);
  assert.equal(env.navigations.length, 1);
  assert.equal(env.navigationAttempts.length, 1);
  for (const button of buttons(env)) assert.equal(button.disabled, true);
});

test('a navigation error restores update controls, reports the error and allows a retry', () => {
  const options = {navigationError: true};
  const env = makeEnvironment(options);
  const storageCalls = env.storageCalls.length;
  assert.doesNotThrow(() => assert.equal(env.context.PLAppUpdate.refresh(), false));
  assert.equal(env.navigations.length, 0);
  assert.equal(env.navigationAttempts.length, 1);
  for (const button of buttons(env)) assert.equal(button.disabled, false);
  for (const status of statuses(env)) {
    assert.ok(status.textContent.length > 0);
    assert.doesNotMatch(status.textContent, /^Aggiornamento(?:\.{3}|…)?$/i);
  }
  assert.equal(env.storageCalls.length, storageCalls);
  options.navigationError = false;
  env.get('appUpdate').click();
  assert.equal(env.navigations.length, 1);
  assert.equal(env.navigationAttempts.length, 2);
  for (const button of buttons(env)) assert.equal(button.disabled, true);
});

test('updating still works when browser storage is unavailable and does not attempt to access it', () => {
  const fixture = activeCareer({storageError: 'all'});
  const {env} = fixture;
  env.context.confirm = () => true;
  assert.equal(env.context.PLCareerSave.available(), false);
  assert.doesNotThrow(() => assert.equal(env.context.__sim.refreshApp(), true));
  assertVisitUnchanged(fixture);
  assert.equal(env.navigations.length, 1);
});

test('an active observation shift also asks before reload and cancellation keeps it running', () => {
  const env = makeEnvironment({specialistMode: false});
  env.evaluate("window.__sim.selectMode('observation'); startDay(); game.time = OPEN");
  const game = env.game();
  const storageCalls = env.storageCalls.length;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  assert.equal(env.context.__sim.refreshApp(), false);
  assert.equal(confirmations, 1);
  assert.equal(env.game(), game);
  assert.equal(env.game().briefing, false);
  assert.equal(env.game().over, false);
  assert.equal(env.mode(), null);
  assert.equal(env.navigations.length, 0);
  assert.equal(env.storageCalls.length, storageCalls);
});
