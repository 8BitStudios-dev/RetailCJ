'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const MODE_KEY = 'plgame.mode';
const LEVELS_KEY = 'plgame.levels';
const defaults = {comp: 0, mot: 65, stress: 20, tier: 'S'};
const learned = {comp: 44, mot: 63, stress: 21, tier: 'S'};

function snapshot(overrides = {}) {
  return {version: 2, day: 14, phase: 'start', shiftHours: 4, profile: {...learned}, ...overrides};
}

function stored(value, extras = []) {
  return new Map([[CAREER_KEY, JSON.stringify(value)], ...extras]);
}

function load(env) {
  return JSON.parse(env.evaluate('JSON.stringify(PLCareerSave.load())'));
}

function profile(env) {
  const stats = env.mode().player().stats;
  return {comp: stats.comp, mot: stats.mot, stress: stats.stress, tier: stats.tier};
}

function resume(env) {
  return env.evaluate('window.__sim.resumeCareer()');
}

function finish(env) {
  env.evaluate('startDay(); game.time = playerMode.shiftEnd(); step(0.05)');
}

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
}

function changeLiveProfile(env) {
  env.evaluate(`
    bump(playerMode.player(), 'comp', 7);
    bump(playerMode.player(), 'mot', 8);
    bump(playerMode.player(), 'stress', 11);
  `);
}

function takeVisit(env) {
  return env.evaluate(`(() => {
    game.time = OPEN;
    const c = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(item => item !== c);
    const slot = SLOTS.find(item => !item.taken && item.table.product === c.product);
    slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
    c.state = 'waiting'; c.path = []; c.wait = 0; c.tQueue = game.time;
    c.patience = 1000; c.exp = 90;
    return playerMode.takeNext();
  })()`);
}

test('boot leaves a saved career untouched until the user resumes or starts a career', () => {
  const value = snapshot({day: 19});
  const storage = stored(value, [[MODE_KEY, 'observation']]);
  const before = storage.get(CAREER_KEY);
  const env = makeEnvironment({storage});
  assert.equal(env.evaluate('PLCareerSave.key'), CAREER_KEY);
  assert.deepEqual(load(env), value);
  assert.equal(storage.get(CAREER_KEY), before);
  assert.equal(env.evaluate('window.__sim.mode'), 'observation');
  const control = env.get('modeResumeCareer');
  assert.ok(control, 'The intro offers Resume for an existing save');
  assert.equal(control.hidden, false);
  assert.equal(env.get('careerResumeCard').hidden, false);
  control.click();
  assert.equal(env.game().day, 19, 'The visible Resume button invokes the saved career');
  assert.deepEqual(profile(env), learned);
});

test('resuming a start snapshot restores the same day and learned profile in a new session', () => {
  const storage = stored(snapshot({day: 22}));
  const first = makeEnvironment({storage});
  resume(first);
  assert.equal(first.evaluate('window.__sim.mode'), 'career');
  assert.equal(first.game().day, 22);
  assert.deepEqual(profile(first), learned);
  assert.equal(first.game().staff.filter(person => person.isPlayer).length, 1);
  assert.equal(first.game().briefing, true);
  assert.deepEqual(first.view().stats, {served: 0, sales: 0, accessories: 0, services: 0, helped: 0, setups: 0, open: 0});
  assert.deepEqual(first.view().history, []);

  const second = makeEnvironment({storage});
  resume(second);
  assert.equal(second.game().day, 22);
  assert.deepEqual(profile(second), learned);
  assert.equal(second.game().customers.length, 0);
});

test('closing saves the completed day and actual personal profile for the next session', () => {
  const storage = new Map();
  const first = makeEnvironment({storage});
  first.evaluate('startDay(); newDay(14)');
  Object.assign(first.mode().player().stats, learned);
  finish(first);
  assert.equal(first.game().over, true);
  assert.deepEqual(load(first), snapshot({phase: 'completed'}));

  const second = makeEnvironment({storage});
  assert.deepEqual(load(second), snapshot({phase: 'completed'}));
  resume(second);
  assert.equal(second.game().day, 15);
  const rested = profile(second);
  closeTo(rested.comp, learned.comp);
  closeTo(rested.mot, learned.mot);
  closeTo(rested.stress, learned.stress * 0.7);
  assert.equal(load(second).phase, 'start');
  assert.equal(load(second).day, 15);

  const third = makeEnvironment({storage});
  resume(third);
  assert.equal(third.game().day, 15);
  assert.deepEqual(profile(third), rested, 'Reloading does not apply overnight recovery a second time');
});

test('a completed January 31 career resumes on day 1 with overnight recovery once', () => {
  const storage = stored(snapshot({day: 31, phase: 'completed'}));
  const env = makeEnvironment({storage});
  resume(env);
  assert.equal(env.game().day, 1);
  assert.equal(load(env).day, 1);
  closeTo(profile(env).stress, learned.stress * 0.7);
});

test('the next-day control advances and saves exactly once despite a repeated click', () => {
  const storage = stored(snapshot());
  const env = makeEnvironment({storage});
  resume(env);
  finish(env);
  env.get('nextDay').click();
  const day = env.game().day;
  const rested = profile(env);
  const saved = load(env);
  env.get('nextDay').click();
  assert.equal(day, 15);
  assert.equal(env.game().day, day);
  assert.deepEqual(profile(env), rested);
  assert.deepEqual(load(env), saved);
  assert.equal(saved.phase, 'start');
});

test('observation and its following day preserve an existing career snapshot', () => {
  const value = snapshot({phase: 'completed'});
  const storage = stored(value);
  const env = makeEnvironment({storage});
  env.evaluate("window.__sim.selectMode('observation'); startDay(); overnight(game.focus); newDay(game.day + 1)");
  assert.equal(env.mode(), null);
  assert.deepEqual(load(env), value);
  assert.equal(storage.get(MODE_KEY), 'observation');
});

test('an interrupted shift reloads the start snapshot without keeping uncompleted live growth', () => {
  const value = snapshot({day: 16});
  const storage = stored(value);
  const first = makeEnvironment({storage});
  resume(first);
  first.evaluate('startDay()');
  changeLiveProfile(first);
  assert.deepEqual(profile(first), {comp: learned.comp + 7 * (1 - 0.0075 * learned.stress),
    mot: 71, stress: 32, tier: 'S'});
  assert.deepEqual(load(first), value, 'Live profile changes do not overwrite the shift-start checkpoint');

  const second = makeEnvironment({storage});
  resume(second);
  assert.equal(second.game().day, 16);
  assert.deepEqual(profile(second), learned);
  assert.deepEqual(load(second), value);
});

test('switching from career to observation and resuming restores the start profile before live gains', () => {
  const value = snapshot({day: 18});
  const storage = stored(value);
  const env = makeEnvironment({storage});
  resume(env);
  env.evaluate('startDay()');
  changeLiveProfile(env);
  env.evaluate("window.__sim.selectMode('observation')");
  assert.equal(env.mode(), null);
  assert.deepEqual(load(env), value);
  resume(env);
  assert.equal(env.evaluate('window.__sim.mode'), 'career');
  assert.equal(env.game().day, 18);
  assert.deepEqual(profile(env), learned);
  assert.equal(env.game().staff.filter(person => person.isPlayer).length, 1);
});

test('the New Career confirmation preserves the active visit when cancelled and resets only when accepted', () => {
  const value = snapshot({day: 17});
  const storage = stored(value);
  const env = makeEnvironment({storage});
  resume(env);
  env.evaluate('startDay()');
  const client = takeVisit(env);
  assert.ok(client);
  const player = env.mode().player();
  const time = env.game().time;
  env.evaluate('window.__sim.showModes()');

  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  env.get('modeCareer').click();
  assert.equal(confirmations, 0, 'Opening the guide must not ask to replace the career');
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 0, 'Only the final action can replace the career');
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 1);
  assert.equal(env.context.PLCareerWelcome.active(), true, 'Declining leaves the final guide page open');
  assert.equal(env.game().day, 17);
  assert.equal(env.game().time, time);
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, client);
  assert.equal(client.staff, player);
  assert.deepEqual(load(env), value);

  env.context.confirm = () => { confirmations++; return true; };
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 2);
  assert.equal(env.game().day, 7);
  assert.deepEqual(profile(env), defaults);
  assert.equal(env.game().customers.length, 0);
  assert.equal(env.mode().player().customer, null);
  assert.deepEqual(load(env), snapshot({day: 7, profile: defaults}));
});

test('explicitly starting a new career resets the saved day and player profile', () => {
  const storage = stored(snapshot({phase: 'completed'}));
  const env = makeEnvironment({storage});
  env.evaluate("window.__sim.selectMode('career')");
  assert.equal(env.game().day, 7);
  assert.deepEqual(profile(env), defaults);
  assert.deepEqual(load(env), snapshot({day: 7, profile: defaults}));
  assert.equal(storage.get(MODE_KEY), 'career');
});

test('career writes, clearing and mode preferences do not alter the legacy level progress', () => {
  const levels = JSON.stringify({'0': {stars: 3, value: 76}, '1': {stars: 1, value: 54}});
  const storage = new Map([[LEVELS_KEY, levels]]);
  const env = makeEnvironment({storage});
  assert.deepEqual(JSON.parse(env.evaluate('JSON.stringify(progress)')), JSON.parse(levels));
  env.evaluate('startDay()');
  finish(env);
  env.evaluate("PLCareerSave.saveMode('observation'); PLCareerSave.clear()");
  assert.equal(storage.get(LEVELS_KEY), levels);
  assert.equal(load(env), null);
  assert.deepEqual(JSON.parse(env.evaluate('JSON.stringify(progress)')), JSON.parse(levels));
});

test('invalid or corrupt career storage is ignored without preventing a new playable day', () => {
  const corruptValues = [
    '{broken', 'null', '[]', '{}',
    JSON.stringify(snapshot({version: 3})),
    JSON.stringify(snapshot({day: 0})),
    JSON.stringify(snapshot({day: 32})),
    JSON.stringify(snapshot({day: 7.5})),
    JSON.stringify(snapshot({phase: 'playing'})),
    JSON.stringify(snapshot({profile: {tier: 'S', comp: 44, mot: 63}})),
    JSON.stringify(snapshot({profile: {tier: 'S', comp: '44', mot: 63, stress: 21}})),
    JSON.stringify(snapshot({profile: {tier: 'S', comp: 101, mot: 63, stress: 21}})),
    JSON.stringify(snapshot({profile: {tier: 'S', comp: 44, mot: -1, stress: 21}})),
    JSON.stringify(snapshot({profile: {tier: 'S', comp: 44, mot: 63, stress: 101}})),
  ];
  for (const value of corruptValues) {
    const storage = new Map([[CAREER_KEY, value]]);
    const env = makeEnvironment({storage});
    assert.equal(load(env), null, value);
    env.evaluate('startDay()');
    assert.equal(env.game().briefing, false);
    assert.equal(env.game().over, false);
    assert.equal(env.game().staff.filter(person => person.isPlayer).length, 1);
  }
});

test('save rejects non-finite and invalid profiles without replacing a previously valid snapshot', () => {
  const value = snapshot();
  const storage = stored(value);
  const env = makeEnvironment({storage});
  for (const expression of [
    "({...PLCareerSave.load(), profile: {tier: 'S', comp: NaN, mot: 63, stress: 21}})",
    "({...PLCareerSave.load(), profile: {tier: 'S', comp: 44, mot: Infinity, stress: 21}})",
    "({...PLCareerSave.load(), profile: {tier: 'S', comp: 44, mot: 63, stress: -1}})",
    "({...PLCareerSave.load(), day: 1.5})",
  ]) {
    assert.equal(env.evaluate(`PLCareerSave.save(${expression})`), false);
    assert.deepEqual(load(env), value);
  }
});

test('denied storage leaves the game playable and persistence reports its unavailable state', () => {
  const env = makeEnvironment({storageError: 'all'});
  assert.equal(env.evaluate('PLCareerSave.available()'), false);
  assert.equal(load(env), null);
  assert.equal(env.evaluate(`PLCareerSave.save(${JSON.stringify(snapshot())})`), false);
  assert.equal(env.evaluate('PLCareerSave.clear()'), false);
  assert.doesNotThrow(() => env.evaluate("window.__sim.selectMode('career'); startDay()"));
  assert.equal(env.game().briefing, false);
  assert.equal(env.game().staff.filter(person => person.isPlayer).length, 1);
  assert.doesNotThrow(() => finish(env));
  assert.equal(env.game().over, true);
});

test('a failed storage write does not discard an existing saved career or level progress', () => {
  const value = snapshot();
  const levels = JSON.stringify({'0': {stars: 2, value: 65}});
  const storage = stored(value, [[LEVELS_KEY, levels]]);
  const env = makeEnvironment({storage, storageError: 'write'});
  assert.deepEqual(load(env), value);
  assert.equal(env.evaluate(`PLCareerSave.save(${JSON.stringify(snapshot({day: 15}))})`), false);
  assert.equal(env.evaluate('PLCareerSave.clear()'), false);
  assert.equal(storage.get(LEVELS_KEY), levels);
  assert.deepEqual(load(env), value);
  assert.doesNotThrow(() => resume(env));
  assert.equal(env.game().day, 14);
});
