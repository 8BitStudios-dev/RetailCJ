'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const {guidedChoiceSource, chooseGuided} = require('./interaction-helpers.cjs');

const CAREER_KEY = 'plgame.career.v1';

function fixture(tier = 'S', comp = 0, {tutorialShifts = 3, stress = 20} = {}) {
  const storage = new Map([[CAREER_KEY, JSON.stringify({version: 2, day: 14, phase: 'start', tutorialShifts,
    profile: {tier, comp, mot: 65, stress}})]]);
  const env = makeEnvironment({storage});
  env.evaluate(`
    window.__sim.resumeCareer(); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.staff = game.staff.filter(s => s.role !== 'lead');
    game.time = OPEN; game.weather = 'sole'; Math.random = () => 0.5;
  `);
  return env;
}

function helpClient(env) {
  return env.evaluate(`(() => {
    const c = spawnCustomer('help', {product: 'iphone', fast: false, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(item => item !== c);
    const slot = SLOTS.find(item => !item.taken && item.table.product === 'help');
    slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
    c.state = 'waiting'; c.path = []; c.wait = 0; c.tQueue = game.time;
    c.patience = 1000; c.exp = 90;
    return c;
  })()`);
}

function until(env, condition, minutes = 120) {
  const result = env.evaluate(`(() => {
    let ticks = 0;
    while (!(${condition}) && !game.over && ticks++ < ${Math.ceil(minutes / 0.05)}) {
      ${guidedChoiceSource}
      step(0.05);
    }
    return {reached: Boolean(${condition}), time: game.time, state: playerMode.player().state};
  })()`);
  assert.equal(result.reached, true, JSON.stringify(result));
}

function forceError(env, staff, client) {
  env.context.measuringStaff = staff;
  env.context.measuringClient = client;
  return env.evaluate('Math.random = () => 0; serve(measuringStaff, measuringClient)');
}

test('a real service error costs a regular Specialist 25 stress and weighs less with experience', () => {
  const beginner = fixture();
  const client = helpClient(beginner);
  assert.equal(forceError(beginner, beginner.mode().player(), client), true);
  assert.equal(client.error, true);
  assert.equal(beginner.mode().player().stats.stress, 45);
  assert.equal(beginner.mode().player().stats.mot, 65, 'An error changes stress, not social motivation');
  assert.equal(beginner.mode().player().needsBreak, false);
  assert.equal(beginner.game().stats.errors, 1);

  const experienced = fixture('E', 50);
  assert.equal(forceError(experienced, experienced.mode().player(), helpClient(experienced)), true);
  assert.equal(experienced.mode().player().stats.stress, 37.5);
  assert.equal(experienced.mode().player().needsBreak, false);
  assert.equal(experienced.game().stats.errors, 1);
});

test('NPC service errors retain the existing three-point stress cost', () => {
  const env = fixture();
  const npc = env.game().staff.find(s => !s.isPlayer && s.role === 'specialist');
  Object.assign(npc.stats, {mot: 65, stress: 20, comp: 0});
  const client = helpClient(env);
  assert.equal(forceError(env, npc, client), true);
  assert.equal(npc.stats.stress, 23);
  assert.equal(npc.stats.mot, 62);
  assert.equal(client.error, true);
  assert.equal(env.game().stats.errors, 1);
  assert.equal(env.mode().player().stats.stress, 20);
  assert.equal(env.mode().player().needsBreak, false);
});

test('an error during a visit queues recovery without dropping the client and waits for a full 15-minute break', () => {
  const env = fixture('S', 0, {stress: 65});
  env.evaluate('game.staff = [playerMode.player()]');
  const client = helpClient(env);
  env.mode().takeNext();
  const player = env.mode().player();
  player.lastBreak = env.game().time - 1;
  assert.equal(forceError(env, player, client), true);
  assert.equal(player.needsBreak, true);
  assert.equal(player.wantsBreak, true);
  assert.equal(player.customer, client);
  assert.equal(client.staff, player);
  assert.equal(env.mode().takeNext(), null);
  assert.equal(env.view().canNext, false);
  env.evaluate('Math.random = () => 0.5');
  until(env, "playerMode.player().state === 'onBreak'");
  assert.equal(client.outcome, 'helped', 'The active visit finishes before recovery begins');
  assert.equal(player.needsBreak, true);
  assert.ok(Math.abs(player.until - env.game().time - 15) < 1e-9);
  const initialStress = player.stats.stress;
  env.advance(14.9);
  assert.equal(player.state, 'onBreak');
  assert.equal(player.needsBreak, true, 'Partial rest does not remove the required break');
  assert.equal(env.mode().completeBreak(), false);
  assert.equal(env.mode().takeNext(), null);
  env.advance(0.15);
  assert.equal(player.needsBreak, false);
  assert.ok(initialStress - player.stats.stress >= 57.4,
    'The full break provides ordinary recovery plus the extra 35 stress points');
  assert.ok(player.stats.stress < 70);
  until(env, "playerMode.player().state === 'idle'", 30);
  const next = helpClient(env);
  assert.equal(env.mode().takeNext(), next);
});

test('repeated errors reaching 70 stress require recovery before the next client', () => {
  const env = fixture();
  const client = helpClient(env);
  const player = env.mode().player();
  assert.equal(forceError(env, player, client), true);
  assert.equal(player.customer, null);
  assert.equal(player.stats.stress, 45);
  assert.equal(player.needsBreak, false, 'The first error can be recovered without a compulsory break');
  assert.equal(forceError(env, player, client), true);
  assert.equal(player.stats.stress, 70);
  assert.equal(player.needsBreak, true);
  assert.equal(env.mode().takeNext(), null);
  assert.equal(client.staff, null);
  player.stats.stress = 69;
  assert.equal(env.mode().takeNext(), null, 'Passive stress reduction does not replace the required break');
});

test('high stress permits a recovery request within the normal one-hour break cooldown', () => {
  const env = fixture();
  const player = env.mode().player();
  player.lastBreak = env.game().time - 1;
  player.stats.stress = 69.99;
  assert.equal(env.view().canPause, false);
  assert.equal(env.mode().requestBreak(), false);
  player.stats.stress = 70;
  assert.equal(env.view().canPause, true);
  assert.equal(env.mode().requestBreak(), true);
  assert.equal(player.wantsBreak, true);
  assert.equal(env.mode().requestBreak(), false);
});

test('a single first-day Specialist error is recoverable while the active visit stays assigned', () => {
  const env = fixture('S', 0, {tutorialShifts: 0, stress: 0});
  env.evaluate('game.staff = [playerMode.player()]');
  const client = helpClient(env);
  const player = env.mode().player();
  player.lastBreak = env.game().time - 1;
  env.mode().takeNext();
  assert.equal(forceError(env, player, client), true);
  assert.equal(player.stats.stress, 11.25);
  assert.equal(player.needsBreak, false, 'The first tutorial mistake does not force an immediate break');
  assert.equal(player.wantsBreak, false);
  assert.equal(player.customer, client);
  assert.equal(client.staff, player);
  assert.equal(env.mode().takeNext(), null);
  env.evaluate('Math.random = () => 0.5');
  until(env, "playerMode.player().state === 'idle' && !playerMode.player().customer");
  assert.equal(client.outcome, 'helped');
  assert.equal(player.needsBreak, false);
  assert.equal(player.wantsBreak, false);
  assert.ok(player.stats.stress < 70);
  const next = helpClient(env);
  assert.equal(env.mode().takeNext(), next);
});

test('an Expert error at zero starting stress retains the 70-point mandatory recovery threshold', () => {
  const env = fixture('E', 0);
  const client = helpClient(env);
  const player = env.mode().player();
  player.stats.stress = 0;
  env.mode().takeNext();
  assert.equal(forceError(env, player, client), true);
  assert.equal(player.stats.stress, 20);
  assert.equal(player.needsBreak, false);
  assert.equal(player.wantsBreak, false);
  assert.equal(player.customer, client);
  env.evaluate('Math.random = () => 0.5');
  until(env, "playerMode.player().state === 'idle' && !playerMode.player().customer");
  assert.equal(client.outcome, 'helped');
  assert.equal(player.needsBreak, false);
  assert.equal(player.wantsBreak, false);
  const next = helpClient(env);
  assert.equal(env.mode().takeNext(), next, 'The experienced role can continue without automatic recovery');
});

test('tutorial service-error protection tapers over three shifts and never changes observation NPCs', () => {
  for (const [tutorialShifts, addedStress] of [[0, 11.25], [1, 16.25], [2, 21.25], [3, 25]]) {
    const env = fixture('S', 0, {tutorialShifts, stress: 0});
    const player = env.mode().player();
    assert.equal(forceError(env, player, helpClient(env)), true);
    assert.equal(player.stats.stress, addedStress, `Completed tutorial shifts: ${tutorialShifts}`);
    assert.equal(player.needsBreak, false);
    assert.equal(player.wantsBreak, false);
  }
  const env = makeEnvironment();
  env.evaluate("__sim.selectMode('observation'); startDay(); game.time = OPEN");
  const npc = env.game().staff.find(s => s.role === 'specialist');
  Object.assign(npc.stats, {mot: 65, stress: 20, comp: 0});
  assert.equal(forceError(env, npc, helpClient(env)), true);
  assert.equal(npc.stats.stress, 23);
  assert.equal(npc.stats.mot, 62);
  assert.equal(env.mode(), null);
});
