'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const {guidedChoiceSource, chooseGuided} = require('./interaction-helpers.cjs');

const CAREER_KEY = 'plgame.career.v1';
const contracts = [
  {tier: 'S', weeklyHours: 20, hours: 4, end: 14 * 60},
  {tier: 'E', weeklyHours: 30, hours: 6, end: 16 * 60},
  {tier: 'P', weeklyHours: 40, hours: 8, end: 18 * 60},
  {tier: 'L', weeklyHours: 40, hours: 8, end: 18 * 60},
];

function fixture(tier = 'S', {comp = 0, clean = true, version = 2} = {}) {
  const profile = {mot: 65, stress: 20, comp, ...(version === 2 ? {tier} : {})};
  const storage = new Map([[CAREER_KEY, JSON.stringify({version, day: 17, phase: 'start', profile})]]);
  const env = makeEnvironment({storage, seed: 0x5eed});
  env.evaluate('window.__sim.resumeCareer(); startDay()');
  if (clean) env.evaluate(`
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.weather = 'sole'; Math.random = () => 0.5;
  `);
  return env;
}

function customer(env) {
  return env.evaluate(`(() => {
    const c = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(item => item !== c);
    const slot = SLOTS.find(item => !item.taken && item.table.product === c.product);
    slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
    c.state = 'waiting'; c.path = []; c.wait = 0; c.tQueue = game.time;
    c.patience = 1000; c.exp = 90;
    return c;
  })()`);
}

function careerWrites(env) {
  return env.storageCalls.filter(call => call.operation === 'write' && call.args[0] === CAREER_KEY).length;
}

for (const {tier, weeklyHours, hours, end} of contracts) {
  test(`a real ${tier} career ends at its contracted ${hours}-hour boundary without extending to store closing`, () => {
    const env = fixture(tier, {clean: false});
    assert.deepEqual(env.view().shift, {start: 10 * 60, end, hours, weeklyHours});
    assert.equal(env.mode().shiftEnd(), end);
    // Exercise the same full shift without treating one VM call's watchdog as
    // a performance benchmark. Batches retain every choice and quarter-minute
    // step; the overall simulation budget remains at most 4000 ticks.
    let result;
    for (let ticks = 0; ticks < 4000 && !env.game().over; ticks += 10) {
      result = env.evaluate(`(() => {
        for (let tick = 0; tick < 10 && !game.over; tick++) {
          if (playerMode.view().canNext) playerMode.takeNext();
          if (playerMode.player().needsBreak && playerMode.view().canPause) playerMode.requestBreak();
          ${guidedChoiceSource}
          step(0.25);
        }
        return {over: game.over, time: game.time, day: game.day};
      })()`);
    }
    assert.equal(result.over, true);
    assert.equal(result.time, end);
    assert.equal(result.day, 17);
    assert.equal(env.view().isOver, true);
    const saved = JSON.parse(env.storage.get(CAREER_KEY));
    assert.equal(saved.phase, 'completed');
    assert.equal(saved.profile.tier, tier);
  });
}

test('a large simulation step clamps at shift end and checkpoints exactly once without finishing a long visit', () => {
  const env = fixture();
  const c = customer(env);
  env.mode().takeNext();
  env.evaluate(`
    game.staff = [playerMode.player()];
    playerMode.player().state = 'probe'; playerMode.player().t = 100;
    playerMode.player().path = []; playerMode.player().customer.state = 'consulting';
    game.time = playerMode.shiftEnd() - 0.1;
  `);
  const writes = careerWrites(env);
  env.evaluate('step(120)');
  assert.equal(env.game().time, 14 * 60);
  assert.equal(env.game().over, true);
  assert.ok(env.mode().player().t >= 99.8, 'Only the time remaining in the shift reaches the consultation');
  assert.equal(c.saleCounted, undefined);
  assert.equal(c.outcome, undefined);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.open, 1);
  assert.match(env.view().history[0].outcome, /interrott|apert/i);
  assert.equal(careerWrites(env), writes + 1);
  const completed = env.storage.get(CAREER_KEY);
  env.evaluate('step(120); step(0.05)');
  assert.equal(env.game().time, 14 * 60);
  assert.equal(careerWrites(env), writes + 1);
  assert.equal(env.storage.get(CAREER_KEY), completed);
});

test('personal shift ending leaves undelivered orders and NPC visits untouched without inventing sales', () => {
  const env = fixture();
  env.evaluate(`game.staff.filter(s => s.role === 'ops').forEach(s => {
    s.state = 'onBreak'; s.until = Infinity; s.hidden = true; s.path = [];
  });`);
  const personal = customer(env);
  env.mode().takeNext();
  const reached = env.evaluate(`(() => {
    let ticks = 0;
    while (playerMode.player().state !== 'waitProduct' && ticks++ < 2400) {
      ${guidedChoiceSource}
      step(0.05);
    }
    return playerMode.player().state === 'waitProduct';
  })()`);
  assert.equal(reached, true);
  assert.ok(personal.pending > 0);
  const npcClient = customer(env);
  const npc = env.game().staff.find(s => !s.isPlayer && s.role === 'specialist');
  npc.customer = npcClient; npcClient.staff = npc;
  npc.state = 'waitProduct'; npc.path = []; npcClient.state = 'waitDelivery';
  npcClient.bought = true; npcClient.pending = 1;
  const orders = env.game().orders;
  const summarizeOrders = () => orders.map(order => ({customer: order.c.id, items: [...order.items],
    t0: order.t0, ops: order.ops && order.ops.id, done: order.done}));
  const ordersBefore = summarizeOrders();
  const orderObjects = [...orders];
  const stateBefore = JSON.stringify({stats: env.game().stats, npcStats: npc.stats,
    state: npc.state, clientState: npcClient.state, pending: npcClient.pending});
  const comp = env.mode().player().stats.comp;
  env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
  assert.equal(env.game().time, 14 * 60);
  assert.equal(env.game().over, true);
  assert.equal(env.game().orders, orders);
  assert.deepEqual(summarizeOrders(), ordersBefore);
  orderObjects.forEach((order, index) => assert.equal(orders[index], order));
  assert.equal(npc.customer, npcClient);
  assert.equal(npcClient.staff, npc);
  assert.equal(npcClient.outcome, undefined);
  assert.equal(personal.outcome, undefined);
  assert.ok(personal.pending > 0);
  assert.equal(JSON.stringify({stats: env.game().stats, npcStats: npc.stats,
    state: npc.state, clientState: npcClient.state, pending: npcClient.pending}), stateBefore);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.open, 1);
  assert.equal(env.mode().player().stats.comp, comp, 'An incomplete visit grants no learning');
  env.mode().recordLeave(personal, 'bought');
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.mode().player().stats.comp, comp);
});

test('a promotion retains the current contracted end and changes the next day and resumed career', () => {
  const env = fixture('S', {comp: 100});
  assert.equal(env.context.__sim.promoteCareer(), true);
  assert.equal(env.mode().player().stats.tier, 'E');
  assert.equal(env.mode().shiftEnd(), 14 * 60);
  assert.equal(env.view().shift.hours, 4);
  const duringShift = JSON.parse(env.storage.get(CAREER_KEY));
  assert.equal(duringShift.phase, 'start');
  assert.equal(duringShift.shiftHours, 4);
  const interrupted = makeEnvironment({storage: new Map(env.storage)});
  interrupted.context.__sim.resumeCareer();
  assert.equal(interrupted.game().day, 17);
  assert.equal(interrupted.mode().player().stats.tier, 'E');
  assert.equal(interrupted.mode().shiftEnd(), 14 * 60,
    'Reloading the promoted role retains the day-start contract');
  env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
  const checkpoint = JSON.parse(env.storage.get(CAREER_KEY));
  assert.equal(checkpoint.phase, 'completed');
  assert.equal(checkpoint.profile.tier, 'E');

  const resumed = makeEnvironment({storage: new Map(env.storage)});
  resumed.context.__sim.resumeCareer();
  assert.equal(resumed.game().day, 20);
  assert.equal(resumed.mode().shiftEnd(), 16 * 60);
  const restoredProfile = JSON.parse(JSON.stringify(resumed.mode().player().stats));
  const another = makeEnvironment({storage: new Map(resumed.storage)});
  another.context.__sim.resumeCareer();
  assert.equal(another.game().day, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(another.mode().player().stats)), restoredProfile,
    'Reloading the new day does not apply overnight recovery twice');

  env.get('nextDay').click();
  assert.equal(env.game().day, 20);
  assert.equal(env.mode().shiftEnd(), 16 * 60);
  assert.equal(env.view().shift.weeklyHours, 30);
});

test('Next and Pause cannot start at the personal end boundary even before the end-of-shift tick', () => {
  const env = fixture();
  const c = customer(env);
  env.evaluate('game.time = playerMode.shiftEnd()');
  assert.equal(env.mode().takeNext(), null);
  assert.equal(env.mode().requestBreak(), false);
  assert.equal(env.view().canNext, false);
  assert.equal(env.view().canPause, false);
  assert.equal(c.ownerId, undefined);
  env.evaluate('step(0.05)');
  assert.equal(env.game().over, true);
  assert.equal(env.mode().takeNext(), null);
  assert.equal(env.mode().requestBreak(), false);
});

test('old saves and exported backups retain compatibility with the new contracted shifts', () => {
  const legacy = fixture('S', {version: 1, comp: 63});
  assert.equal(legacy.mode().player().stats.comp, 63);
  assert.equal(legacy.mode().player().stats.tier, 'S');
  assert.equal(legacy.mode().shiftEnd(), 14 * 60);
  for (const {tier, end} of contracts) {
    const env = fixture(tier);
    env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
    const checkpoint = JSON.parse(env.storage.get(CAREER_KEY));
    const parsed = env.context.PLCareerSave.parseBackup(env.context.PLCareerSave.exportBackup(checkpoint));
    assert.equal(parsed.ok, true);
    assert.deepEqual(JSON.parse(JSON.stringify(parsed.snapshot)), checkpoint);
    const fresh = makeEnvironment();
    assert.equal(fresh.context.__sim.importCareer(parsed.snapshot).ok, true);
    assert.equal(fresh.game().over, false, 'Import waits for Resume');
    fresh.context.__sim.resumeCareer();
    assert.equal(fresh.game().day, 20);
    assert.equal(fresh.mode().shiftEnd(), end);
  }
});

test('optional shift hours round-trip without changing old snapshots and invalid overrides cannot replace a save', () => {
  const env = makeEnvironment();
  const api = env.context.PLCareerSave;
  const legacy = {version: 2, day: 17, phase: 'start',
    profile: {tier: 'E', comp: 25, mot: 63, stress: 21}};
  assert.deepEqual(JSON.parse(JSON.stringify(api.normalize(legacy))), legacy);
  for (const [tier, values] of [['S', [4]], ['E', [4, 6]], ['P', [4, 6, 8]], ['L', [4, 6, 8]]]) {
    for (const shiftHours of values) {
      for (const phase of ['start', 'completed']) {
        const value = {...legacy, phase, shiftHours, profile: {...legacy.profile, tier}};
        assert.equal(api.save(value), true);
        const parsed = api.parseBackup(api.exportBackup(value));
        assert.equal(parsed.ok, true);
        assert.deepEqual(JSON.parse(JSON.stringify(parsed.snapshot)), value);
      }
    }
  }
  const saved = env.storage.get(CAREER_KEY);
  for (const [tier, shiftHours] of [['S', 6], ['S', 8], ['E', 8], ['P', 3], ['P', 4.5],
    ['P', 9], ['P', '4'], ['P', null], ['P', NaN], ['P', Infinity]]) {
    const value = {...legacy, shiftHours, profile: {...legacy.profile, tier}};
    assert.equal(api.normalize(value), null);
    assert.equal(api.save(value), false);
    assert.equal(api.exportBackup(value), null);
    assert.equal(env.storage.get(CAREER_KEY), saved);
  }
});

test('observation still runs until the 20:00 store closing without a personal shift', () => {
  const env = makeEnvironment({specialistMode: false});
  env.evaluate('startDay(); game.time = 18 * 60; step(0.05)');
  assert.equal(env.mode(), null);
  assert.equal(env.game().over, false);
  env.evaluate('game.time = CLOSE - 0.01; step(0.05)');
  assert.equal(env.game().over, true);
  assert.ok(env.game().time >= 20 * 60);
  assert.equal(env.storage.has(CAREER_KEY), false);
});

test('the career calendar provides five workdays per week and preserves the January wrap', () => {
  const env = makeEnvironment();
  const next = day => env.context.PLCareerProgression.nextWorkday(day);
  assert.equal(next(10), 13, 'Sunday skips Monday and Tuesday');
  assert.equal(next(11), 13);
  assert.equal(next(12), 13);
  const days = [13];
  while (days.length < 6) days.push(next(days[days.length - 1]));
  assert.deepEqual(days, [13, 14, 15, 16, 17, 20]);
  assert.deepEqual(days.slice(0, 5).map(day => new Date(2027, 0, day).getDay()), [3, 4, 5, 6, 0]);
  for (const {tier, hours, weeklyHours} of contracts) {
    const contract = env.context.PLCareerProgression.contract(tier);
    assert.equal(days.slice(0, 5).length * contract.hours, weeklyHours);
    assert.equal(contract.hours, hours);
  }
  assert.equal(next(31), 1, 'The existing repeating January calendar starts again at January 1');
});

test('a Sunday completed career rests for three nights, resumes on Wednesday and never rests twice on reload', () => {
  const env = fixture('S', {comp: 35});
  Object.assign(env.mode().player().stats, {mot: 63, stress: 60});
  env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
  const completed = env.storage.get(CAREER_KEY);
  const resumed = makeEnvironment({storage: new Map(env.storage)});
  assert.equal(resumed.storage.get(CAREER_KEY), completed, 'Boot does not apply the weekend recovery');
  resumed.context.__sim.resumeCareer();
  assert.equal(resumed.game().day, 20);
  assert.ok(Math.abs(resumed.mode().player().stats.stress - 60 * 0.7 ** 3) < 1e-9);
  assert.equal(resumed.mode().player().stats.mot, 63, 'Rest changes stress without inventing social motivation');
  assert.equal(resumed.mode().player().stats.comp, 35);
  const recovered = JSON.parse(JSON.stringify(resumed.mode().player().stats));
  const reload = makeEnvironment({storage: new Map(resumed.storage)});
  reload.context.__sim.resumeCareer();
  assert.equal(reload.game().day, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(reload.mode().player().stats)), recovered);

  env.get('nextDay').click();
  assert.equal(env.game().day, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(env.mode().player().stats)), recovered,
    'Next Day and resuming the completed checkpoint recover the same three nights');
});

test('an imported start checkpoint on a rest day resumes that exact day before following the work schedule', () => {
  const env = makeEnvironment({storage: new Map([[CAREER_KEY, JSON.stringify({version: 2,
    day: 18, phase: 'start', profile: {tier: 'S', comp: 28, mot: 63, stress: 21}})]])});
  env.context.__sim.resumeCareer();
  assert.equal(env.game().day, 18);
  assert.equal(env.mode().player().stats.comp, 28);
  assert.equal(env.mode().player().stats.mot, 63);
  assert.equal(env.mode().player().stats.stress, 21);
  env.evaluate('startDay(); game.time = playerMode.shiftEnd(); step(0.05)');
  env.get('nextDay').click();
  assert.equal(env.game().day, 20);
  assert.ok(Math.abs(env.mode().player().stats.stress - 21 * 0.7 ** 2) < 1e-9);
});
