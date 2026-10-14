'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const {chooseGuided} = require('./interaction-helpers.cjs');

function fixture({kind = 'buy', tier = 'S', comp = 0, graphics = false} = {}) {
  class FloorRenderer {
    resize() {} setView() {} render() {} dispose() {} focus() {} getStats() { return {}; }
  }
  const env = makeEnvironment(graphics ? {webgl2: true,
    importFloorRenderer: () => Promise.resolve({FloorRenderer})} : {});
  env.context.fixtureKind = kind;
  env.evaluate(`
    __sim.selectMode('career'); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.nextRotation = Infinity; Math.random = () => 0.5;
    Object.assign(playerMode.player().stats, {tier: '${tier}', comp: ${comp}, stress: 0});
    playerMode.player().tier = '${tier}';
    game.staff = game.staff.filter(s => s.isPlayer || s.role === 'ops');
    const bridgeClient = spawnCustomer(fixtureKind, {product: 'iphone', fast: true,
      setup: null, tradeIn: false, finance: false, familiarity: 0, hurry: 0, mood: 80, rude: false});
    bridgeClient.need = 'deciso'; bridgeClient.exp = 70; bridgeClient.patience = 1000;
    game.lineIn = [];
    if (fixtureKind === 'acc') {
      bridgeClient.state = 'waitWall'; bridgeClient.side = 'L'; bridgeClient.x = WALL_SPOT.L; bridgeClient.y = 600;
    } else {
      const slot = SLOTS.find(s => !s.taken && s.table.product === (fixtureKind === 'help' ? 'help' : 'iphone'));
      slot.taken = bridgeClient; bridgeClient.slot = slot; bridgeClient.x = slot.x; bridgeClient.y = slot.y;
      bridgeClient.state = 'waiting';
    }
    bridgeClient.path = []; bridgeClient.wait = 0; bridgeClient.tQueue = game.time;
    window.bridgeClient = bridgeClient;
    playerMode.takeNext(); playerMode.player().path = [];
    step(0.05); updatePanel();
  `);
  assert.equal(env.mode().player().state, 'interaction');
  return env;
}

function complete(env) { for (let i = 0; i < 5; i++) assert.equal(chooseGuided(env), true); }
function deliver(env) {
  env.evaluate(`for (let ticks = 0; !bridgeClient.outcome && !game.over && ticks < 4000; ticks++) step(0.05)`);
}

test('five player choices charge real floor work, reject stale input, and leave counting to Operations delivery', () => {
  const env = fixture();
  let minutes = 0;
  for (const phase of ['approach', 'probe', 'present', 'listen', 'extend']) {
    const q = env.view().interaction;
    assert.equal(q.phase, phase);
    assert.equal(env.game().orders.length, 0, 'A conversation is not a product order');
    const option = q.options.find(o => o.recommended);
    const before = env.game().time;
    assert.equal(env.mode().chooseInteraction(option.id, q.token), true);
    assert.ok(Math.abs(env.game().time - before - option.minutes) < 1e-7);
    minutes += option.minutes;
    const after = env.game().time;
    assert.equal(env.mode().chooseInteraction(option.id, q.token), false);
    assert.equal(env.game().time, after);
  }
  assert.equal(env.view().interaction, null);
  assert.equal(env.view().lastInteraction.decisions, 5);
  assert.ok(Math.abs(env.view().lastInteraction.minutes - minutes) < 1e-7);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.ok(env.game().orders.some(o => o.c === env.context.bridgeClient));
  deliver(env);
  assert.equal(env.context.bridgeClient.outcome, 'bought');
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 1);
  assert.ok(env.view().energy.competence > 0);
});

test('help and accessory conversations retain their own outcomes and never count as device sales', () => {
  for (const kind of ['help', 'acc']) {
    const env = fixture({kind});
    complete(env);
    if (kind === 'acc') {
      assert.equal(env.view().stats.served, 0, 'The accessory is still in Operations');
      assert.ok(env.game().orders.some(o => o.items.includes('acc')));
    }
    deliver(env);
    assert.equal(env.context.bridgeClient.outcome, kind === 'help' ? 'helped' : 'bought');
    assert.equal(env.view().stats.sales, 0);
    assert.equal(env.view().stats.served, 1);
    assert.equal(env.view().stats[kind === 'help' ? 'helped' : 'accessories'], 1);
  }
});

test('menu guards and shift closure cannot apply a stale conversation or create an unearned delivery', () => {
  const env = fixture();
  const q = env.view().interaction, a = q.options[0];
  const before = env.game().time;
  env.context.__sim.showModes();
  assert.equal(env.mode().chooseInteraction(a.id, q.token), false);
  assert.equal(env.game().time, before);
  env.context.__sim.closeModes();
  env.evaluate('game.time = playerMode.shiftEnd() - 0.01');
  assert.equal(env.mode().chooseInteraction(a.id, q.token), true);
  assert.equal(env.game().over, true);
  assert.equal(env.view().interaction, null);
  assert.equal(env.view().lastInteraction, null);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.mode().chooseInteraction(a.id, q.token), false);
  assert.equal(env.game().orders.length, 0);
});

test('real animation frames hold the shift for reading and keep countdown independent of speed, menu, pause and GPU loss', async () => {
  const slow = fixture({tier: 'E', graphics: true});
  const fast = fixture({tier: 'E', graphics: true});
  await Promise.all([slow.context.PLFloorViewUI.ready, fast.context.PLFloorViewUI.ready]);
  const initial = fast.game().time;
  for (const [env, speed] of [[slow, 1], [fast, 4]]) {
    env.game().speed = speed;
    for (let t = 100; t <= 1000; t += 100) env.runFrame(t);
    assert.equal(env.game().time, initial);
  }
  assert.equal(slow.view().interaction.secondsLeft, fast.view().interaction.secondsLeft);
  const left = fast.view().interaction.secondsLeft;
  fast.game().speed = 0; fast.runFrame(1100);
  assert.equal(fast.view().interaction.secondsLeft, left);
  fast.game().speed = 4; fast.context.__sim.showModes(); fast.runFrame(1200);
  assert.equal(fast.view().interaction.secondsLeft, left);
  fast.context.__sim.closeModes(); fast.context.PLFloorView.setReady(false); fast.runFrame(1300);
  assert.equal(fast.view().interaction.secondsLeft, left);
  fast.context.PLFloorView.setReady(true);
  assert.equal(fast.mode().tickChoice(18), true);
  assert.equal(fast.view().interaction.phase, 'probe');
  assert.equal(fast.view().stats.sales, 0);
});

test('a deliberate unverified promise creates stress and recovery; a correct choice is never randomly replaced by an error', () => {
  const good = fixture();
  good.evaluate('Math.random = () => 0');
  complete(good);
  assert.equal(good.context.bridgeClient.error, undefined);
  assert.equal(good.mode().player().needsBreak, false);

  const wrong = fixture();
  for (const suffix of ['welcome', 'discover', 'relevant', 'promise', 'complete']) {
    const q = wrong.view().interaction;
    const a = q.options.find(o => o.id.endsWith('-' + suffix));
    assert.equal(wrong.mode().chooseInteraction(a.id, q.token), true);
  }
  assert.equal(wrong.context.bridgeClient.error, true);
  assert.equal(wrong.game().stats.errors, 1);
  assert.equal(wrong.mode().player().needsBreak, true);
  assert.ok(wrong.mode().player().stats.stress >= 50);
  assert.ok(wrong.context.bridgeClient.exp < good.context.bridgeClient.exp - 15,
    'An unverified promise affects the customer experience as well as player stress');
});

test('visible choice controls cannot advance the floor while its renderer is unavailable', () => {
  const env = fixture();
  const time = env.game().time, token = env.view().interaction.token;
  const buttons = env.get('playerPanel').querySelectorAll('.playerChoice');
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every(button => button.disabled));
  buttons[0].click();
  assert.equal(env.game().time, time);
  assert.equal(env.view().interaction.token, token);
});
