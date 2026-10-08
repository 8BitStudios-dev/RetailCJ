'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const LEVELS_KEY = 'plgame.levels';
const savedCareer = {version: 2, day: 17, phase: 'start',
  profile: {tier: 'E', comp: 44, mot: 63, stress: 21}};

function fixture(active = false) {
  const storage = new Map([[CAREER_KEY, JSON.stringify(savedCareer)],
    [LEVELS_KEY, JSON.stringify({'0': {stars: 3, value: 76}})]]);
  const env = makeEnvironment({storage});
  if (active) {
    env.evaluate(`
      window.__sim.resumeCareer(); startDay();
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
      window.__sim.showModes();
    `);
  }
  return {env, game: env.game(), player: env.mode().player(),
    client: env.mode().player().customer, time: env.game().time,
    profile: JSON.stringify(env.mode().player().stats), stored: [...storage.entries()]};
}

function unchanged(current) {
  const {env, game, player, client, time, profile, stored} = current;
  assert.equal(env.game(), game);
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, client);
  if (client) assert.equal(client.staff, player);
  assert.equal(env.game().time, time);
  assert.equal(JSON.stringify(player.stats), profile);
  assert.deepEqual([...env.storage.entries()], stored);
}

function step(env, page) {
  assert.equal(env.context.PLCareerWelcome.active(), true);
  assert.equal(env.get('careerWelcome').hidden, false);
  assert.equal(env.get('introMenu').hidden, true);
  assert.match(env.get('careerWelcomeStep').textContent, new RegExp(String(page)));
  assert.ok(env.get('careerWelcomeTitle').textContent.trim());
  assert.ok(env.get('careerWelcomeText').textContent.trim());
  assert.ok(env.get('careerWelcomeTip').textContent.trim());
}

test('New Career opens the three-page guide without touching the saved or live career', () => {
  const current = fixture(true);
  const {env} = current;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  env.get('modeCareer').click();
  step(env, 1);
  assert.equal(env.get('careerWelcomePrev').disabled, true);
  const firstTitle = env.get('careerWelcomeTitle').textContent;
  env.get('careerWelcomePrev').click();
  assert.equal(env.get('careerWelcomeTitle').textContent, firstTitle);
  env.advance(3);
  unchanged(current);
  assert.equal(confirmations, 0);

  env.get('careerWelcomeNext').click();
  step(env, 2);
  assert.equal(env.get('careerWelcomePrev').disabled, false);
  assert.notEqual(env.get('careerWelcomeTitle').textContent, firstTitle);
  env.get('careerWelcomeNext').click();
  step(env, 3);
  unchanged(current);
  assert.equal(confirmations, 0);
  env.get('careerWelcomePrev').click();
  step(env, 2);
  unchanged(current);
});

test('Cancel returns to the menu while the active shift remains paused and untouched', () => {
  const current = fixture(true);
  const {env} = current;
  env.get('modeCareer').click();
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeCancel').click();
  assert.equal(env.context.PLCareerWelcome.active(), false);
  assert.equal(env.get('careerWelcome').hidden, true);
  assert.equal(env.get('introMenu').hidden, false);
  env.advance(3);
  unchanged(current);
  env.get('introBack').click();
  env.advance(0.5);
  assert.ok(env.game().time > current.time, 'Returning to the game resumes the original visit');
  assert.equal(env.mode().player(), current.player);
  assert.equal(current.player.customer, current.client);
});

test('Escape closes the guide without accepting replacement or altering a checkpoint', () => {
  const current = fixture(true);
  const {env} = current;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  env.get('modeCareer').click();
  env.get('careerWelcomeNext').click();
  env.get('careerWelcome').dispatch('keydown', {key: 'Escape'});
  env.dispatchWindow('keydown', {key: 'Escape'});
  assert.equal(env.context.PLCareerWelcome.active(), false);
  assert.equal(env.get('introMenu').hidden, false);
  unchanged(current);
  assert.equal(confirmations, 0);
});

test('only the final guide action asks to replace an existing career and refusal stays on page three', () => {
  const current = fixture(true);
  const {env} = current;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  env.get('modeCareer').click();
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 0);
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 1);
  step(env, 3);
  unchanged(current);
  env.advance(3);
  unchanged(current);
});

test('accepting the final action creates exactly one new career even when clicked twice', () => {
  const current = fixture(true);
  const {env} = current;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  env.get('modeCareer').click();
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeNext').click();
  const game = env.game();
  const player = env.mode().player();
  const checkpoint = env.storage.get(CAREER_KEY);
  env.get('careerWelcomeNext').click();
  assert.equal(confirmations, 1);
  assert.equal(env.context.PLCareerWelcome.active(), false);
  assert.equal(env.game(), game);
  assert.equal(env.mode().player(), player);
  assert.equal(env.game().day, 7);
  assert.equal(env.game().briefing, true);
  assert.equal(env.game().customers.length, 0);
  assert.equal(player.customer, null);
  assert.equal(player.stats.tier, 'S');
  assert.equal(player.stats.comp, 0);
  assert.notEqual(player, current.player);
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  assert.equal(env.storage.get(LEVELS_KEY), new Map(current.stored).get(LEVELS_KEY));
});

test('the guide can be reread without a new shift, confirmation or changes to live progress', () => {
  const current = fixture(true);
  const {env} = current;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  env.get('careerWelcomeRead').click();
  step(env, 1);
  env.get('careerWelcomeNext').click();
  step(env, 2);
  env.get('careerWelcomeNext').click();
  step(env, 3);
  assert.match(env.get('careerWelcomeNext').textContent, /modalit/i);
  env.get('careerWelcomeNext').click();
  assert.equal(env.context.PLCareerWelcome.active(), false);
  assert.equal(env.get('introMenu').hidden, false);
  env.advance(3);
  unchanged(current);
  assert.equal(confirmations, 0);
});

test('the welcome on first opening keeps the game paused and the return-to-game button hidden', () => {
  const current = fixture();
  const {env} = current;
  assert.equal(env.get('introBack').hidden, true);
  env.get('modeCareer').click();
  step(env, 1);
  assert.equal(env.get('introBack').hidden, true);
  env.advance(3);
  unchanged(current);
  env.get('careerWelcomeNext').click();
  env.get('careerWelcomeCancel').click();
  assert.equal(env.context.PLCareerWelcome.active(), false);
  assert.equal(env.get('introMenu').hidden, false);
  assert.equal(env.get('introBack').hidden, true);
  env.advance(3);
  unchanged(current);
});

for (const finish of [false, true]) {
  test(`rereading after import preserves the imported checkpoint and blocks the old shift after ${finish ? 'finishing' : 'cancelling'} the guide`, () => {
    const current = fixture(true);
    const {env} = current;
    env.context.confirm = () => true;
    const imported = {...savedCareer, day: 22,
      profile: {...savedCareer.profile, tier: 'P', comp: 82}};
    assert.equal(env.context.__sim.importCareer(imported).ok, true);
    current.stored = [...env.storage.entries()];
    assert.deepEqual(JSON.parse(env.storage.get(CAREER_KEY)), imported);
    assert.equal(env.get('introBack').hidden, true);
    let confirmations = 0;
    env.context.confirm = () => { confirmations++; return true; };

    env.get('careerWelcomeRead').click();
    step(env, 1);
    assert.equal(env.get('introBack').hidden, true);
    env.advance(3);
    unchanged(current);
    if (finish) {
      env.get('careerWelcomeNext').click();
      env.get('careerWelcomeNext').click();
      step(env, 3);
      env.get('careerWelcomeNext').click();
    } else {
      env.get('careerWelcomeCancel').click();
    }
    assert.equal(env.context.PLCareerWelcome.active(), false);
    assert.equal(env.get('introMenu').hidden, false);
    assert.equal(env.get('intro').classList.contains('show'), true);
    assert.equal(env.get('introBack').hidden, true,
      'The old live shift cannot return and overwrite the imported checkpoint');
    env.advance(3);
    unchanged(current);
    assert.deepEqual(JSON.parse(env.storage.get(CAREER_KEY)), imported);
    assert.equal(confirmations, 0);
  });
}

test('Resume, import and Observation retain their direct routes without the new-career guide', () => {
  const resumed = fixture();
  resumed.env.get('modeResumeCareer').click();
  assert.equal(resumed.env.context.PLCareerWelcome.active(), false);
  assert.equal(resumed.env.game().day, savedCareer.day);
  assert.equal(resumed.env.mode().player().stats.tier, savedCareer.profile.tier);

  const imported = fixture();
  imported.env.context.confirm = () => true;
  assert.equal(imported.env.context.__sim.importCareer({...savedCareer, day: 22}).ok, true);
  assert.equal(imported.env.context.PLCareerWelcome.active(), false);
  assert.equal(imported.env.game(), imported.game, 'Import does not start a shift');

  const observation = fixture();
  observation.env.get('modeObservation').click();
  assert.equal(observation.env.context.PLCareerWelcome.active(), false);
  assert.equal(observation.env.mode(), null);
  assert.equal(observation.env.context.__sim.mode, 'observation');
  assert.deepEqual([...observation.env.storage.entries()].filter(([key]) => key !== 'plgame.mode'),
    observation.stored.filter(([key]) => key !== 'plgame.mode'));
});
