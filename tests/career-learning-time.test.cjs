'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

function consultation({comp, tier = 'S', npc = false, promote = false}) {
  const env = makeEnvironment();
  env.evaluate("window.__sim.selectMode('career')");
  Object.assign(env.mode().player().stats, {comp, tier, mot: 65, stress: 20});
  env.mode().player().tier = tier;
  if (promote) assert.equal(env.context.__sim.promoteCareer(), true);
  env.evaluate(`
    startDay(); game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.weather = 'sole'; Math.random = () => 0.5;
    const measuringStaff = ${npc ? "game.staff.find(s => !s.isPlayer && s.role === 'specialist' && s.tier === 'S')" : 'playerMode.player()'};
    if (!measuringStaff) throw new Error('No consultation fixture');
    if (${npc}) Object.assign(measuringStaff.stats, {comp: ${comp}, mot: 65, stress: 20});
    measuringStaff.post = null; measuringStaff.pendingSlot = undefined; measuringStaff.nextSlot = undefined;
    game.staff = [measuringStaff];
    const measuringClient = spawnCustomer('buy', {product: 'iphone', fast: false, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80, complex: false});
    game.lineIn = [];
    const slot = SLOTS.find(item => !item.taken && item.table.product === measuringClient.product);
    slot.taken = measuringClient; measuringClient.slot = slot;
    measuringClient.x = slot.x; measuringClient.y = slot.y;
    measuringClient.state = 'waiting'; measuringClient.path = []; measuringClient.wait = 0;
    measuringClient.tQueue = game.time; measuringClient.patience = 1000; measuringClient.exp = 90;
    if (${npc}) {
      measuringStaff.customer = measuringClient; measuringClient.staff = measuringStaff;
      measuringStaff.state = 'toCustomer';
    } else playerMode.takeNext();
    measuringStaff.x = slot.sx; measuringStaff.y = slot.sy; measuringStaff.path = [];
    window.measuringStaff = measuringStaff; window.measuringClient = measuringClient;
  `);
  const measured = env.evaluate(`(() => {
    const phases = new Set();
    let ticks = 0;
    while (measuringStaff.state !== 'checkout' && ticks < 4000) {
      step(0.05); ticks++;
      phases.add(measuringStaff.state);
    }
    return {ticks, duration: game.time - OPEN, state: measuringStaff.state,
      phases: [...phases], tier: measuringStaff.tier, comp: measuringStaff.stats.comp,
      clientKind: measuringClient.kind, clientProduct: measuringClient.product};
  })()`);
  assert.equal(measured.state, 'checkout');
  for (const phase of ['approach', 'probe', 'demo', 'listen']) assert.ok(measured.phases.includes(phase), phase);
  return {env, ...measured};
}

test('actual player consultation gets faster with role competence for the same client and random input', () => {
  const beginner = consultation({comp: 0});
  const experienced = consultation({comp: 100});
  assert.equal(beginner.clientKind, experienced.clientKind);
  assert.equal(beginner.clientProduct, experienced.clientProduct);
  assert.ok(beginner.duration > experienced.duration,
    `Expected learning to shorten the consultation: ${beginner.duration} vs ${experienced.duration}`);
  assert.ok(beginner.duration - experienced.duration >= 0.5, 'The benefit is visible in real simulation time');
});

test('promoting Specialist 100 to Expert 0 keeps the actual consultation speed', () => {
  const before = consultation({comp: 100});
  const after = consultation({comp: 100, promote: true});
  assert.equal(before.tier, 'S');
  assert.equal(after.tier, 'E');
  assert.equal(after.comp, 0);
  assert.equal(after.ticks, before.ticks, 'The role transition must not slow down the player');
});

test('the learning multiplier does not change NPC consultation durations', () => {
  const inexperienced = consultation({comp: 0, npc: true});
  const experienced = consultation({comp: 100, npc: true});
  assert.equal(inexperienced.tier, 'S');
  assert.equal(experienced.tier, 'S');
  assert.equal(inexperienced.ticks, experienced.ticks, 'NPC timers retain their existing rules');
});
