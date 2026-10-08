'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

test('customer profiles favour low familiarity, low hurry and good mood independently for sales and support', () => {
  const env = ready();
  const counts = env.evaluate(`(() => {
    let seed = 42; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    return ['buy', 'genius'].map(kind => {
      const result = {low: 0, calm: 0, happy: 0, mixed: 0};
      for (let i = 0; i < 1000; i++) {
        const c = spawnCustomer(kind);
        result.low += c.familiarity === 0; result.calm += c.hurry === 0;
        result.happy += c.mood >= 65; result.mixed += c.familiarity === 0 && c.hurry === 2;
      }
      return result;
    });
  })()`);
  counts.forEach(c => { assert.ok(c.low > 700); assert.ok(c.calm > 700); assert.ok(c.happy > 750); assert.ok(c.mixed > 20); });
});

test('a demanding client pauses a busy Expert, keeps both assignments and resumes the original consultation', () => {
  const env = ready();
  customer(env, {familiarity: 2, hurry: 0, mood: 80});
  env.mode().takeNext();
  env.evaluate(`(() => {
    const s = playerMode.player(); s.state = 'probe'; s.t = 6; s.path = [];
    const e = game.staff.find(e => e.tier === 'E');
    game.staff.filter(e => ['E', 'P'].includes(e.tier)).forEach(e => { e.hidden = true; });
    e.hidden = false; e.state = 'demo'; e.t = 10; e.path = [];
    const c = spawnCustomer('buy', {familiarity: 0, hurry: 0, mood: 80});
    c.state = 'served'; c.staff = e; e.customer = c;
    requestExpert(s, s.customer); updateStaff(e, 1);
    window.testExpert = e; window.testExpertClient = c;
  })()`);
  assert.equal(env.evaluate('testExpert.t'), 10);
  assert.equal(env.evaluate('playerMode.player().state'), 'toExpert');
  assert.equal(env.evaluate('testExpert.customer === testExpertClient && testExpertClient.staff === testExpert'), true);
  env.evaluate(`(() => {
    const s = playerMode.player(); s.path = []; updateExpertHelp(s, 0.1);
    updateExpertHelp(s, 5); s.path = []; updateExpertHelp(s, 0.1);
    updateStaff(testExpert, 1);
  })()`);
  assert.equal(env.evaluate('playerMode.player().state'), 'probe');
  assert.equal(env.evaluate('playerMode.player().t'), 6);
  assert.equal(env.evaluate('testExpert.t'), 9);
  assert.equal(env.evaluate('playerMode.player().customer.supportRequests'), 1);
  assert.equal(env.evaluate('Boolean(testExpert.helpRequester)'), false);
  env.evaluate('requestExpert(playerMode.player(), playerMode.player().customer)');
  assert.equal(env.evaluate('Boolean(playerMode.player().expertHelp)'), false);
});

test('Technical Specialists request technical help while ordinary good-mood customers need no escalation', () => {
  const env = ready();
  assert.equal(env.evaluate(`(() => {
    const s = playerMode.player(); s.state = 'probe';
    const c = spawnCustomer('buy', {familiarity: 0, hurry: 0, mood: 85}); s.customer = c;
    requestExpert(s, c); return Boolean(s.expertHelp);
  })()`), false);
  assert.equal(env.evaluate(`(() => {
    const s = game.staff.find(s => s.tier === 'TS');
    const e = game.staff.find(s => ['TE', 'G'].includes(s.tier));
    e.hidden = false; e.state = 'repair'; e.path = [];
    const c = spawnCustomer('genius', {repair: 2, familiarity: 0, hurry: 0, mood: 80});
    s.hidden = false; s.state = 'repair'; s.customer = c; c.staff = s;
    requestExpert(s, c); return ['TE', 'G'].includes(s.expertHelp.expert.tier);
  })()`), true);
});

test('hurry increases waiting cost and declining experience changes mood', () => {
  const env = ready();
  const values = env.evaluate(`(() => {
    const a = spawnCustomer('buy', {hurry: 0, mood: 80});
    const b = spawnCustomer('genius', {hurry: 2, mood: 80});
    for (const c of [a, b]) { c.state = 'waitDelivery'; c.exp = 70; c.lastProfileExp = 70; }
    updateCustomer(a, 2); updateCustomer(b, 2);
    updateCustomer(a, 0); updateCustomer(b, 0);
    return {a: a.exp, b: b.exp, am: a.mood, bm: b.mood};
  })()`);
  assert.ok(values.b < values.a); assert.ok(values.bm < values.am);
});

test('the full walk to an Expert and back completes and reserves an idle helper from dispatch', () => {
  const env = ready();
  customer(env, {familiarity: 2, hurry: 0, mood: 80}); env.mode().takeNext();
  env.evaluate(`(() => {
    const s = playerMode.player(); s.state = 'probe'; s.t = 6; s.path = [];
    const e = game.staff.find(e => e.tier === 'E');
    game.staff.filter(e => ['E', 'P'].includes(e.tier)).forEach(e => { e.hidden = true; });
    e.hidden = false; e.state = 'idle'; e.customer = null; e.path = [];
    requestExpert(s, s.customer); window.testExpert = e;
  })()`);
  assert.equal(env.evaluate('isAvailable(testExpert)'), false);
  assert.equal(env.evaluate(`(() => {
    const s = playerMode.player(); let ticks = 0;
    while (s.expertHelp && ticks++ < 2400) {
      game.time += 0.05; updateCustomer(s.customer, 0.05); updateStaff(s, 0.05); updateStaff(testExpert, 0.05);
    }
    return !s.expertHelp && s.state === 'probe' && s.customer.staff === s && s.customer.supportWait > 0;
  })()`), true);
  assert.equal(env.evaluate('Boolean(testExpert.helpRequester)'), false);
});

test('a sales consultation traverses all five ASOS phases before delivery', () => {
  const env = ready();
  customer(env, {familiarity: 0, hurry: 0, mood: 80});
  env.mode().takeNext();
  assert.equal(env.view().phase, 'approach');
  for (const [state, phase] of [['probe', 'probe'], ['demo', 'present'], ['listen', 'listen'], ['checkout', 'extend']]) {
    until(env, `playerMode.player().state === '${state}'`);
    assert.equal(env.view().phase, phase);
    assert.equal(env.view().stats.sales, 0);
  }
  const stages = env.get('playerPanel').querySelectorAll('.playerStep');
  assert.deepEqual(Array.from(stages, s => s.textContent), ['Approach', 'Probe', 'Present', 'Listen', 'Extend']);
  assert.equal(stages[4].hidden, false, 'Extend is present even without Setup');
  until(env, 'playerMode.view().stats.served === 1');
  assert.equal(env.view().stats.sales, 1);
});

function ready(options = {}) {
  const env = makeEnvironment(options);
  env.evaluate(`
    startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.weather = 'sole';
    Math.random = () => 0.5;
  `);
  return env;
}

function customer(env, extra = {}) {
  const settings = {product: 'iphone', fast: true, setup: null, finance: false, tradeIn: false, ...extra};
  return env.evaluate(`(() => {
    const settings = ${JSON.stringify(settings)};
    const kind = settings.kind || 'buy'; delete settings.kind;
    const c = spawnCustomer(kind, settings);
    game.lineIn = game.lineIn.filter(item => item !== c);
    if (kind === 'acc') {
      c.state = 'waitWall'; c.side = 'L'; c.x = WALL_SPOT.L; c.y = 600;
    } else {
      const slot = SLOTS.find(item => !item.taken && item.table.product === (kind === 'help' ? 'help' : c.product));
      if (!slot) throw new Error('No fixture slot available');
      slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
      c.state = 'waiting';
    }
    c.path = []; c.patience = 1000; c.wait = settings.wait || 0;
    c.tQueue = settings.tQueue === undefined ? game.time : settings.tQueue;
    c.exp = 90;
    return c;
  })()`);
}

function until(env, condition, maxMinutes = 120) {
  const result = env.evaluate(`(() => {
    let ticks = 0;
    while (!(${condition}) && !game.over && ticks < ${Math.ceil(maxMinutes / 0.05)}) {
      step(0.05); ticks++;
    }
    return {reached: Boolean(${condition}), ticks, time: game.time,
      state: playerMode.player().state, active: playerMode.view().active};
  })()`);
  assert.ok(result.reached, 'Transition did not complete: ' + JSON.stringify(result));
  return result;
}

function holdOperations(env) {
  env.evaluate(`game.staff.filter(person => person.role === 'ops').forEach(person => {
    person.state = 'onBreak'; person.until = 1000000; person.hidden = true; person.path = [];
  });`);
}

function resumeOperations(env) {
  env.evaluate(`(() => {
    const person = game.staff.find(item => item.role === 'ops');
    if (!person) throw new Error('No Operations fixture');
    person.state = 'idle'; person.hidden = true; person.path = [];
    person.x = BACK_DOOR.x; person.y = BACK_DOOR.y;
  })()`);
}

test('the page enables Specialist by default and creates exactly one persistent identity', () => {
  const env = ready();
  assert.match(env.html, /src="specialist-mode\.js(?:\?[^\"]*)?"/);
  assert.match(env.html, /src="specialist-ui\.js(?:\?[^\"]*)?"/);
  const player = env.mode().player();
  assert.equal(player.id, 'PLAYER');
  assert.equal(player.name, 'Tu');
  assert.equal(player.tier, 'S');
  assert.equal(player.rota, 'player');
  assert.equal(player.isPlayer, true);
  assert.equal(env.game().staff.filter(person => person.name === 'Tu').length, 1);
  assert.equal(env.game().staff.filter(person => person.isPlayer).length, 1);
  assert.equal(env.view().enabled, true);
  assert.equal(env.evaluate('window.__sim.mode'), 'career');
  assert.equal(env.view().canNext, false);
  assert.equal(env.mode().takeNext(), null);
});

test('a reserved customer is assigned reciprocally only by Next; a double click cannot duplicate it', () => {
  const env = ready();
  const c = customer(env);
  const mode = env.mode(), player = mode.player();
  env.evaluate('dispatch()');
  assert.equal(c.playerReserved, true);
  assert.equal(c.staff, null);
  assert.equal(player.customer, null);
  assert.equal(mode.takeNext(), c);
  assert.equal(c.staff, player);
  assert.equal(player.customer, c);
  assert.equal(c.ownerId, 'PLAYER');
  assert.equal(mode.takeNext(), null);
  assert.equal(env.view().stats.open, 1);
  assert.equal(env.game().staff.filter(person => person.customer === c).length, 1);
  assert.equal(env.game().customers.filter(item => item.id === c.id).length, 1);
});

test('Next chooses arrival order even when customer array order differs', () => {
  const env = ready();
  const later = customer(env, {tQueue: 610});
  const earlier = customer(env, {tQueue: 590});
  env.mode().reserveNext();
  assert.equal(earlier.playerReserved, true);
  assert.equal(Boolean(later.playerReserved), false);
  assert.equal(env.mode().takeNext(), earlier);
  assert.equal(env.mode().takeNext(), null);
  assert.equal(later.staff, null);
  assert.equal(env.view().stats.open, 1);
});

test('manual table pickup records waiting time once and accessory pickup is excluded from that average', () => {
  const env = ready();
  const c = customer(env, {wait: 7});
  assert.equal(env.game().stats.waitN, 0);
  assert.equal(env.game().stats.waitSum, 0);
  assert.equal(env.mode().takeNext(), c);
  assert.equal(env.game().stats.waitN, 1);
  assert.equal(env.game().stats.waitSum, 7);
  assert.equal(env.mode().takeNext(), null);
  assert.equal(env.game().stats.waitN, 1);
  assert.equal(env.game().stats.waitSum, 7);

  const accessoryEnv = ready();
  const accessory = customer(accessoryEnv, {kind: 'acc', wait: 7});
  assert.equal(accessoryEnv.mode().takeNext(), accessory);
  assert.equal(accessoryEnv.game().stats.waitN, 0);
  assert.equal(accessoryEnv.game().stats.waitSum, 0);
});

test('NPC dispatch excludes the player at tables and accessory walls and preserves owned customers', () => {
  const env = ready();
  const first = customer(env, {tQueue: 590});
  const npcCustomer = customer(env, {tQueue: 591});
  const wall = customer(env, {kind: 'acc', tQueue: 592});
  const player = env.mode().player();
  env.evaluate('dispatch()');
  assert.equal(first.staff, null);
  assert.ok(npcCustomer.staff && npcCustomer.staff !== player);
  assert.ok(wall.staff && wall.staff !== player);
  env.mode().takeNext();
  env.evaluate('dispatch()');
  assert.equal(player.customer, first);
  assert.equal(first.staff, player);

  // A customer's ongoing post-purchase journey can release the staff link while
  // retaining its owner; another Specialist must not take that visit over.
  const ownedReturn = customer(env, {tQueue: 620, tradeOnly: true, bought: true, saleCounted: true});
  ownedReturn.ownerId = 'PLAYER';
  env.evaluate('dispatch()');
  assert.equal(ownedReturn.staff, null);
  assert.equal(player.customer, first);
});

test('busy Next cannot switch to another customer or create a second open visit', () => {
  const env = ready();
  const first = customer(env, {tQueue: 590});
  const second = customer(env, {tQueue: 591});
  const mode = env.mode();
  assert.equal(mode.takeNext(), first);
  for (let i = 0; i < 5; i++) assert.equal(mode.takeNext(), null);
  assert.equal(mode.player().customer, first);
  assert.equal(second.ownerId, undefined);
  assert.equal(env.view().stats.open, 1);
  assert.equal(env.view().canNext, false);
});

test('a real consultation reaches handover and leave, and personal results are idempotent', () => {
  const env = ready();
  const c = customer(env);
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.outcome === 'bought'");
  assert.equal(c.ownerId, 'PLAYER');
  assert.equal(c.pending || 0, 0);
  assert.equal(c.saleCounted, true);
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 1);
  assert.equal(env.view().stats.open, 0);
  assert.equal(env.view().history.length, 1);
  const before = env.view().stats;
  env.mode().recordLeave(c, 'bought');
  env.mode().recordLeave(c, 'bought');
  assert.deepEqual(env.view().stats, before);
});

test('a pending backstage delivery never counts as a personal sale before actual handover', () => {
  const env = ready();
  holdOperations(env);
  const c = customer(env);
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "playerMode.player().state === 'waitProduct'");
  assert.ok(c.pending > 0);
  assert.equal(c.saleCounted, true);
  assert.equal(c.staff, env.mode().player());
  assert.equal(env.mode().player().customer, c);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().canNext, false);
  env.advance(5);
  assert.equal(env.view().stats.sales, 0);
  resumeOperations(env);
  until(env, "testCustomer.outcome === 'bought'");
  assert.equal(c.pending, 0);
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 1);
});

test('setup started is distinct from completed setup and from a fully concluded visit', () => {
  const env = ready();
  const c = customer(env, {setup: 'transfer'});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.state === 'toSetup' || testCustomer.state === 'setup'");
  assert.equal(c.ownerId, 'PLAYER');
  assert.equal(env.game().stats.setupsStarted, 1, 'Store engine records an initiated setup separately');
  assert.equal(env.game().stats.setups, 0, 'Store completion counter does not count initiated setups');
  assert.equal(env.view().stats.sales, 1, 'Product has already been handed over');
  assert.equal(env.view().stats.setups, 0, 'An initiated setup is not a completed setup');
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.open, 1);
  until(env, 'testCustomer.setupDone === true');
  assert.equal(env.game().stats.setups, 1);
  assert.equal(env.view().stats.setups, 1);
  assert.equal(env.view().stats.served, 1);
  assert.equal(env.view().stats.open, 0);
  env.mode().recordLeave(c, 'bought');
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.setups, 1);
});

test('an owned customer returning after setup waits while the player is busy and resumes manually without a duplicate sale', () => {
  const env = ready();
  const c = customer(env, {setup: 'transferThenTrade', tradeIn: true});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.state === 'toSetup' || testCustomer.state === 'setup'");
  holdOperations(env);
  const nextVisit = customer(env);
  env.context.secondCustomer = nextVisit;
  assert.equal(env.mode().takeNext(), nextVisit);
  until(env, "testCustomer.setupDone && testCustomer.state === 'waiting'");
  assert.equal(c.ownerId, 'PLAYER');
  assert.equal(c.staff, null);
  assert.equal(c.tradeOnly, true);
  assert.equal(env.mode().player().customer, nextVisit);
  assert.ok(nextVisit.pending > 0);
  assert.equal(env.mode().takeNext(), null, 'A returning customer cannot replace the active visit');
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.setups, 1);
  assert.equal(env.view().stats.open, 2);
  resumeOperations(env);
  until(env, "secondCustomer.outcome === 'bought'");
  assert.equal(c.staff, null, 'The return visit still requires a manual Next');
  assert.equal(env.view().canNext, true);
  assert.equal(env.mode().takeNext(), c);
  until(env, "testCustomer.outcome === 'bought'");
  assert.equal(env.view().stats.sales, 2, 'Two purchased products, with no additional sale for the Trade In return');
  assert.equal(env.view().stats.served, 2);
  assert.equal(env.view().stats.setups, 1);
  assert.equal(env.view().stats.open, 0);
  assert.equal(env.view().history.length, 2);
  assert.equal(env.game().stats.tradeAfter, 1);
});

test('Trade In and finance are marked completed at the end of their real timed phases', () => {
  const env = ready();
  const c = customer(env, {tradeIn: true, finance: true});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "playerMode.player().state === 'tradeIn'");
  assert.equal(Boolean(c.tradeDone), false);
  assert.equal(env.view().phase, 'extend');
  env.advance(1);
  assert.equal(Boolean(c.tradeDone), false);
  until(env, "playerMode.player().state === 'financing'");
  assert.equal(c.tradeDone, true);
  assert.equal(Boolean(c.financeDone), false);
  assert.equal(env.view().phase, 'extend');
  env.advance(1);
  assert.equal(Boolean(c.financeDone), false);
  until(env, "testCustomer.outcome === 'bought'");
  assert.equal(c.financeDone, true);
  assert.equal(env.game().stats.tradeIns, 1);
  assert.equal(env.game().stats.finance, 1);
  assert.equal(env.view().stats.sales, 1);
});

test('an accessory visit with a backstage order counts only after delivery and never as a product sale', () => {
  const env = ready();
  holdOperations(env);
  const c = customer(env, {kind: 'acc'});
  env.context.testCustomer = c;
  env.evaluate('Math.random = () => 0.2');
  env.mode().takeNext();
  until(env, "testCustomer.state === 'waitDelivery'");
  assert.ok(c.pending > 0);
  assert.equal(env.view().stats.accessories, 0);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  resumeOperations(env);
  until(env, "testCustomer.outcome === 'bought'");
  assert.equal(c.pending, 0);
  assert.equal(env.view().stats.accessories, 1);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 1);
});

test('the personal shift ending marks an undelivered visit incomplete without inventing a personal sale', () => {
  const env = ready();
  holdOperations(env);
  const c = customer(env);
  env.mode().takeNext();
  until(env, "playerMode.player().state === 'waitProduct'");
  assert.ok(c.pending > 0);
  env.evaluate('game.time = playerMode.shiftEnd() - 0.01; step(0.05)');
  assert.equal(env.game().over, true);
  assert.equal(env.view().isOver, true);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.open, 1);
  assert.match(env.view().history[0].outcome, /interrotta|aperta/i);
  env.mode().recordLeave(c, 'bought');
  assert.equal(env.view().stats.sales, 0);
});

test('a delivered purchase with unfinished setup remains a sale but not a completed visit at shift end', () => {
  const env = ready();
  const c = customer(env, {setup: 'transfer'});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.state === 'setup'");
  env.evaluate('game.time = playerMode.shiftEnd() - 0.01; step(0.05)');
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().stats.setups, 0);
  assert.equal(env.view().stats.open, 1);
});

test('a whole Specialist shift reaches 14:00 without old leader, role or checkpoint overlays blocking it', () => {
  const env = makeEnvironment({seed: 0x5eed});
  env.evaluate('startDay()');
  const result = env.evaluate(`(() => {
    let ticks = 0;
    while (!game.over && ticks++ < 4000) {
      if (playerMode.view().canNext) playerMode.takeNext();
      step(0.25);
      if (game.moment || game.planning || game.checkpoint) break;
    }
    return {over: game.over, time: game.time, ticks,
      moment: Boolean(game.moment), planning: game.planning, checkpoint: game.checkpoint};
  })()`);
  assert.equal(result.moment, false);
  assert.equal(result.planning, false);
  assert.equal(result.checkpoint, false);
  assert.equal(result.over, true, JSON.stringify(result));
  assert.equal(result.time, 14 * 60);
  assert.ok(env.view().stats.served > 0);
  for (const id of ['moment', 'plan', 'check']) assert.equal(env.get(id).classList.contains('show'), false);
  env.evaluate('render(); updatePanel()');
  assert.ok(env.counters.images > 0);
});

test('a new day clears personal counters/history while retaining identity and learned stats', () => {
  const env = ready();
  const c = customer(env, {kind: 'help'});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.outcome === 'helped'");
  assert.equal(env.view().stats.helped, 1);
  const previous = env.mode().player();
  previous.stats.comp = 44; previous.stats.mot = 63; previous.stats.stress = 21;
  env.evaluate('newDay(game.day + 1)');
  const player = env.mode().player();
  assert.equal(player.id, previous.id);
  assert.equal(player.name, previous.name);
  assert.equal(player.stats, previous.stats);
  assert.equal(player.stats.comp, 44);
  assert.equal(player.stats.mot, 63);
  assert.equal(player.stats.stress, 21);
  assert.equal(env.game().staff.filter(person => person.name === 'Tu').length, 1);
  assert.deepEqual(env.view().stats, {served: 0, sales: 0, accessories: 0, services: 0, helped: 0, setups: 0, open: 0});
  assert.deepEqual(env.view().history, []);
});

test('pause returns after fifteen minutes and enforces the existing one-hour cooldown', () => {
  const env = ready();
  const player = env.mode().player();
  assert.equal(env.mode().requestBreak(), true);
  assert.equal(env.mode().requestBreak(), false);
  assert.equal(env.view().canNext, false);
  until(env, "playerMode.player().state === 'onBreak'", 20);
  const started = player.lastBreak;
  assert.ok(player.until >= started + 15);
  assert.equal(env.mode().takeNext(), null);
  until(env, "playerMode.player().state === 'idle'", 30);
  assert.ok(env.game().time >= player.until);
  assert.equal(env.view().canPause, false);
  assert.equal(env.mode().requestBreak(), false);
  env.advance(Math.max(0, started + 60.1 - env.game().time));
  assert.equal(env.view().canPause, true);
  assert.equal(env.mode().requestBreak(), true);
});

test('the visible Next control follows the actual queue and busy state', () => {
  const env = ready();
  env.evaluate('updatePanel()');
  const panel = env.get('playerPanel');
  assert.ok(panel);
  const next = panel.querySelector('button[data-specialist-action="next"]');
  assert.ok(next);
  assert.equal(next.disabled, true);
  const c = customer(env);
  env.mode().reserveNext();
  env.evaluate('updatePanel()');
  assert.equal(next.disabled, false);
  next.click();
  assert.equal(env.mode().player().customer, c);
  env.evaluate('updatePanel()');
  assert.equal(next.disabled, true);
  next.click();
  assert.equal(env.view().stats.open, 1);
});

test('observation can be the injected default and NPCs dispatch without a player or reserved customers', () => {
  const env = ready({specialistMode: false});
  assert.equal(env.evaluate('window.__sim.mode'), 'observation');
  assert.equal(env.mode(), null);
  assert.equal(env.game().staff.some(person => person.isPlayer || person.name === 'Tu'), false);
  const waiting = customer(env, {wait: 7});
  const wall = customer(env, {kind: 'acc', wait: 4});
  env.evaluate('dispatch(); updatePanel()');
  assert.ok(waiting.staff && !waiting.staff.isPlayer);
  assert.ok(wall.staff && !wall.staff.isPlayer);
  assert.equal(waiting.ownerId, undefined);
  assert.equal(wall.ownerId, undefined);
  assert.equal(env.game().customers.some(c => c.playerReserved || c.ownerId === 'PLAYER'), false);
  assert.equal(env.get('playerPanel').hidden, true);
  assert.equal(env.game().stats.waitN, 1);
  assert.equal(env.game().stats.waitSum, 7);
});

test('an autonomous observation day reaches closing with only store results and preserves observation the next day', () => {
  const env = makeEnvironment({seed: 0x5eed, specialistMode: false});
  env.evaluate('startDay()');
  const result = env.evaluate(`(() => {
    let ticks = 0, personalEntitiesSeen = false;
    while (!game.over && ticks++ < 4000) {
      step(0.25);
      personalEntitiesSeen ||= game.staff.some(s => s.isPlayer || s.name === 'Tu') ||
        game.customers.some(c => c.playerReserved || c.ownerId === 'PLAYER');
      if (game.moment || game.planning || game.checkpoint) break;
    }
    return {over: game.over, time: game.time, ticks, personalEntitiesSeen,
      moment: Boolean(game.moment), planning: game.planning, checkpoint: game.checkpoint};
  })()`);
  assert.equal(result.moment, false);
  assert.equal(result.planning, false);
  assert.equal(result.checkpoint, false);
  assert.equal(result.personalEntitiesSeen, false);
  assert.equal(result.over, true, JSON.stringify(result));
  assert.ok(result.time >= 20 * 60);
  assert.ok(env.game().stats.sold > 0);
  env.evaluate('render(); updatePanel()');
  assert.equal(env.get('playerPanel').hidden, true);
  assert.equal(env.get('dbPlayerStats').hidden, true);
  assert.equal(env.get('dbPlayerStats').innerHTML, '');
  assert.equal(env.get('dbStoreResults').open, true);
  assert.match(env.get('dbTitle').textContent, /debrief|giornata/i);
  assert.equal(env.get('debrief').classList.contains('show'), true);
  for (const id of ['moment', 'plan', 'check']) assert.equal(env.get(id).classList.contains('show'), false);

  env.get('nextDay').click();
  assert.equal(env.evaluate('window.__sim.mode'), 'observation');
  assert.equal(env.mode(), null);
  assert.equal(env.game().day, 8);
  assert.equal(env.game().staff.some(person => person.isPlayer || person.name === 'Tu'), false);
  assert.equal(env.game().customers.some(c => c.playerReserved || c.ownerId === 'PLAYER'), false);
  assert.equal(env.game().stats.sold, 0);
});

test('switching both modes starts a fresh day and never duplicates the player or leaks personal results', () => {
  const env = ready();
  const c = customer(env, {kind: 'help'});
  env.context.testCustomer = c;
  env.mode().takeNext();
  until(env, "testCustomer.outcome === 'helped'");
  assert.equal(env.view().stats.helped, 1);
  const personalStats = env.evaluate('JSON.stringify(TEAM.Tu)');
  const npcRosterSize = env.evaluate("Object.keys(TEAM).filter(name => name !== 'Tu').length");
  assert.equal(npcRosterSize, 52);   // 49 + i 3 Lead
  assert.match(env.get('brTeam').innerHTML, new RegExp('su ' + (npcRosterSize + 1) + '(?:\\D|$)'));
  env.evaluate("game.speed = 4; window.__sim.selectMode('observation'); updatePanel()");
  assert.equal(env.evaluate('window.__sim.mode'), 'observation');
  assert.equal(env.mode(), null);
  assert.equal(env.game().day, 7);
  assert.equal(env.game().speed, 1);
  assert.equal(env.game().briefing, true);
  assert.equal(env.game().staff.some(person => person.isPlayer || person.name === 'Tu'), false);
  assert.equal(env.game().customers.length, 0);
  assert.equal(env.get('playerPanel').hidden, true);
  assert.match(env.get('brTeam').innerHTML, new RegExp('su ' + npcRosterSize + '(?:\\D|$)'));
  env.evaluate('overnight(game.focus); newDay(game.day + 1); updatePanel()');
  assert.equal(env.evaluate('window.__sim.mode'), 'observation');
  assert.equal(env.evaluate('JSON.stringify(TEAM.Tu)'), personalStats, 'Observation nights do not alter the inactive player profile');
  assert.equal(env.game().day, 8);

  for (let i = 0; i < 3; i++) {
    env.evaluate("window.__sim.selectMode('career'); updatePanel()");
    assert.equal(env.evaluate('window.__sim.mode'), 'career');
    assert.equal(env.game().day, 7);
    assert.equal(env.game().staff.filter(person => person.isPlayer || person.name === 'Tu').length, 1);
    assert.deepEqual(env.view().stats, {served: 0, sales: 0, accessories: 0, services: 0, helped: 0, setups: 0, open: 0});
    assert.deepEqual(env.view().history, []);
    assert.equal(env.get('playerPanel').hidden, false);
    env.evaluate("window.__sim.selectMode('observation'); updatePanel()");
    assert.equal(env.mode(), null);
    assert.equal(env.game().staff.some(person => person.isPlayer || person.name === 'Tu'), false);
  }
  env.evaluate("window.__sim.selectMode('career'); startDay(); game.time = playerMode.shiftEnd() - 0.01; step(0.05)");
  assert.equal(env.get('dbPlayerStats').hidden, false);
  assert.equal(env.get('dbStoreResults').open, false);
  env.get('nextDay').click();
  assert.equal(env.evaluate('window.__sim.mode'), 'career');
  assert.equal(env.game().day, 8);
  assert.equal(env.game().staff.filter(person => person.isPlayer || person.name === 'Tu').length, 1);
  assert.equal(env.view().stats.open, 0);
});

test('opening and cancelling the mode picker freezes and then resumes the same assigned visit', () => {
  const env = ready();
  const c = customer(env);
  env.mode().takeNext();
  const player = env.mode().player();
  const before = env.game().time;
  env.evaluate('window.__sim.showModes()');
  env.advance(5);
  assert.equal(env.game().time, before);
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, c);
  assert.equal(c.staff, player);
  assert.equal(env.view().stats.open, 1);
  env.evaluate('window.__sim.closeModes()');
  env.advance(0.5);
  assert.ok(env.game().time > before);
  assert.equal(env.evaluate('window.__sim.mode'), 'career');
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, c);
  assert.equal(c.ownerId, 'PLAYER');
});
