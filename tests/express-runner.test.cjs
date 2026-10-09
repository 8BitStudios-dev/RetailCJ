'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const observation = require('../dist/observation-lab.js');

const plain = value => JSON.parse(JSON.stringify(value));
const noDemand = {sales: 0, accessories: 0, express: 0, appointments: 0, walkins: 0, browse: 0};

function fixture({career = false} = {}) {
  const env = makeEnvironment({seed: 0x5eed, specialistMode: !career ? false : true});
  env.context.__sim.selectMode(career ? 'career' : 'observation');
  if (!career) {
    const config = plain(env.context.PLObservation.defaults);
    config.demand = noDemand;
    config.staff.OP = 0;
    config.formation = 'essenziale';
    env.context.__sim.observation.apply(config);
  }
  env.evaluate(`startDay();
    game.arrivals = []; game.sessions = []; game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.nextRotation = Infinity; Math.random = () => 0.5;
    window.noSickMoment = true;
    game.staff = game.staff.filter(person => person.role !== 'ops');
    window.cashier = game.staff.find(person => person.post === EXPRESS);
    if (!cashier) throw new Error('The fixture needs a real Express cashier');
    game.staff.forEach(person => {
      person.path = []; person.customer = null; person.stats.stress = 0;
      person.hidden = person !== cashier; person.state = person === cashier ? 'idle' : 'onBreak';
      person.until = Infinity; person.wantsBreak = false;
    });
    cashier.x = cashier.home.x; cashier.y = cashier.home.y;
  `);
  return env;
}

// Use the page's real Express queue and customer state machine. Positioning a
// customer at the talk spot skips only walking that is unrelated to the case.
function startExpress(env, name, needsRunner) {
  return env.evaluate(`(() => {
    const c = spawnCustomer('acc', {journeyId: ${JSON.stringify('express-test-' + name)},
      labChannel: 'express', quick: true, expressNeedsRunner: ${needsRunner},
      familiarity: 0, hurry: 0, mood: 90, exp: 90, setup: null});
    window[${JSON.stringify(name)}] = c;
    game.lineIn = game.lineIn.filter(item => item !== c);
    c.x = EXPRESS.line[0].x; c.y = EXPRESS.line[0].y; c.path = []; c.lineIdx = 0;
    game.lineEx.push(c); updateLine(game.lineEx, EXPRESS);
    if (c.point !== cashier) throw new Error('The real Express queue did not assign its cashier');
    c.x = EXPRESS.talk.x; c.y = EXPRESS.talk.y; c.path = [];
    updateCustomer(c, 0.05);
    return c;
  })()`);
}

function finishExpress(env, name) {
  env.evaluate(`${name}.t = 0.001; updateCustomer(${name}, 0.05)`);
}

function reinforce(env) { env.context.__sim.observation.addStaff('OP'); }

function completeDeliveries(env, count) {
  return env.evaluate(`(() => {
    let ticks = 0;
    while (game.stats.expressRunnerDelivered < ${count} && ticks++ < 1600) step(0.05);
    return {ticks, delivered: game.stats.expressRunnerDelivered};
  })()`);
}

function report(env) { return plain(env.context.__sim.observation.view.report); }

function walkToExit(env, name) {
  const customer = env.context[name];
  assert.equal(customer.state, 'leaving');
  assert.notEqual(customer.gone, true, 'Starting a new exit path must not remove a customer from the floor');
  assert.ok(env.game().customers.includes(customer));
  assert.ok(customer.path.length > 0, 'The customer still has a real journey to the door');
  const start = {x: customer.x, y: customer.y};
  const exit = plain(customer.dest);
  env.evaluate(`updateCustomer(${name}, 0.05)`);
  assert.notEqual(customer.gone, true, 'The first walking tick must keep the customer visible');
  assert.notDeepEqual({x: customer.x, y: customer.y}, start, 'The customer walks away from the Express or waiting position');
  let ticks = 1;
  while (!customer.gone && ticks++ < 1600) env.evaluate(`updateCustomer(${name}, 0.05)`);
  assert.ok(ticks < 1600, 'The real path must eventually reach the doorway');
  assert.ok(ticks > 1, 'An exit from the floor takes multiple walking ticks');
  assert.equal(customer.gone, true);
  assert.equal(customer.path.length, 0);
  assert.deepEqual({x: customer.x, y: customer.y}, exit, 'Removal happens at the actual exit destination');
  env.evaluate('step(0.05)');
  assert.equal(env.game().customers.includes(customer), false, 'The following frame removes only the arrived customer');
}

test('runner stock scenarios are bounded, deterministic and independent of staff and other customer profiles', () => {
  assert.equal(observation.defaults.expressRunnerRate, 0.25);
  assert.equal(observation.normalizeConfig({expressRunnerRate: -2}).expressRunnerRate, 0);
  assert.equal(observation.normalizeConfig({expressRunnerRate: 2}).expressRunnerRate, 1);
  assert.equal(observation.normalizeConfig({expressRunnerRate: NaN}).expressRunnerRate, 0.25);
  const available = observation.plan({...observation.defaults, expressRunnerRate: 0});
  const backstage = observation.plan({...observation.defaults, expressRunnerRate: 1});
  const stocked = available.arrivals.filter(item => item.extra.labChannel === 'express');
  const missing = backstage.arrivals.filter(item => item.extra.labChannel === 'express');
  assert.ok(stocked.length > 0);
  assert.ok(stocked.every(item => item.extra.expressNeedsRunner === false));
  assert.ok(missing.every(item => item.extra.expressNeedsRunner === true));
  const withoutStock = plan => plain(plan.arrivals).map(item => {
    delete item.extra.expressNeedsRunner;
    return item;
  });
  assert.deepEqual(withoutStock(available), withoutStock(backstage));
  assert.deepEqual(available.appointments, backstage.appointments);
  assert.deepEqual(backstage, observation.plan({...observation.defaults, expressRunnerRate: 1,
    staff: {...observation.defaults.staff, OP: 0, S: 15, E: 8}}));
});

test('a stocked accessory keeps immediate Express checkout without requesting a runner', () => {
  const env = fixture();
  const customer = startExpress(env, 'stocked', false);
  finishExpress(env, 'stocked');
  assert.equal(customer.outcome, 'bought');
  assert.equal(env.game().stats.express, 1);
  assert.equal(env.game().stats.expressRunnerRequested, 0);
  assert.equal(env.game().stats.expressRunnerDelivered, 0);
  assert.equal(env.game().orders.length, 0);
  assert.equal(env.context.cashier.customer, null);
  assert.equal(report(env).metrics.completed, 1);
});

test('a completed Express checkout stays visible and walks to the door in observation and career', () => {
  for (const career of [false, true]) {
    const env = fixture({career});
    const customer = startExpress(env, 'stocked', false);
    finishExpress(env, 'stocked');
    assert.equal(customer.outcome, 'bought');
    assert.equal(env.game().stats.express, 1);
    walkToExit(env, 'stocked');
    assert.equal(env.game().stats.express, 1, 'Walking out cannot count the checkout again');
  }
});

test('an Express customer stays on the floor while waiting for a runner and walks out after delivery', () => {
  const env = fixture();
  const customer = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  assert.equal(customer.state, 'waitDelivery');
  assert.notEqual(customer.gone, true);
  const spot = customer.slot;
  env.advance(3, 0.05);
  assert.ok(env.game().customers.includes(customer));
  assert.notEqual(customer.gone, true);
  assert.deepEqual({x: customer.x, y: customer.y}, {x: spot.x, y: spot.y});
  assert.equal(customer.outcome, undefined);
  reinforce(env);
  assert.equal(completeDeliveries(env, 1).delivered, 1);
  assert.equal(customer.outcome, 'bought');
  assert.equal(spot.taken, null);
  walkToExit(env, 'waiting');
  assert.equal(env.game().stats.expressRunnerDelivered, 1);
});

test('a timeout during a stationary waiting tick starts a visible exit instead of removing the customer', () => {
  const env = fixture();
  env.evaluate(`window.impatient = spawnCustomer('buy', {product: 'iphone', setup: null,
    tradeIn: false, finance: false, familiarity: 0, hurry: 0, mood: 90});
    game.lineIn = game.lineIn.filter(customer => customer !== impatient);
    impatient.x = EXPRESS.talk.x; impatient.y = EXPRESS.talk.y;
    impatient.path = []; impatient.state = 'waiting'; impatient.wait = 0; impatient.patience = 0.001;
    updateCustomer(impatient, 0.05);`);
  assert.equal(env.context.impatient.outcome, 'lost');
  walkToExit(env, 'impatient');
  assert.equal(env.game().stats.lost, 1);
});

test('a missing accessory frees the cashier for the next checkout and remains an open delivery journey', () => {
  const env = fixture();
  const waiting = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  assert.equal(waiting.state, 'waitDelivery');
  assert.equal(waiting.expressAwaiting, true);
  assert.equal(waiting.pending, 1);
  assert.equal(waiting.point, null);
  assert.equal(waiting.staff, null);
  assert.equal(waiting.servedBy, env.context.cashier);
  assert.equal(env.context.cashier.customer, null);
  assert.equal(env.context.cashier.state, 'idle');
  assert.equal(waiting.outcome, undefined);
  assert.equal(env.game().stats.express, 0);
  assert.equal(env.game().stats.expressRunnerRequested, 1);
  assert.equal(env.game().orders[0].c, waiting);
  assert.deepEqual(plain(env.game().orders[0].items), ['acc']);
  assert.ok(waiting.slot && waiting.slot.taken === waiting, 'Waiting occupies its own floor position');
  assert.ok(waiting.slot.x > env.evaluate('EXPRESS.x'), 'Delivery waits to the right of B1, separate from the Express queue');
  const next = startExpress(env, 'next', false);
  finishExpress(env, 'next');
  assert.equal(next.outcome, 'bought');
  assert.equal(waiting.outcome, undefined);
  assert.equal(env.game().stats.express, 1);
  env.advance(3, 0.05);
  assert.equal(waiting.pending, 1);
  assert.equal(env.game().stats.delivered, 0);
  const result = report(env);
  assert.equal(result.metrics.entered, 2);
  assert.equal(result.metrics.completed, 1);
  assert.equal(result.metrics.active, 1);
  const delivery = result.phases.find(phase => phase.id === 'delivery');
  assert.equal(delivery.n, 1);
  assert.ok(delivery.wait >= 3 - 1e-9);
});

test('an Operations reinforcement retrieves the queued accessory and completes Express exactly once', () => {
  const env = fixture();
  const customer = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  const spot = customer.slot;
  const order = env.game().orders[0];
  env.advance(4, 0.05);
  assert.equal(customer.pending, 1);
  assert.equal(order.ops, null);
  reinforce(env);
  assert.equal(completeDeliveries(env, 1).delivered, 1);
  assert.equal(order.ops?.tier, 'OP');
  assert.equal(order.done, true);
  assert.equal(customer.pending, 0);
  assert.equal(customer.outcome, 'bought');
  assert.equal(customer.expressAwaiting, false);
  assert.equal(customer.slot, null);
  assert.equal(spot.taken, null);
  assert.equal(env.game().stats.express, 1);
  assert.equal(env.game().stats.expressRunnerRequested, 1);
  assert.equal(env.game().stats.expressRunnerDelivered, 1);
  assert.ok(report(env).metrics.delivery > 4);
  assert.equal(report(env).channels.find(channel => channel.id === 'express').completed, 1);
  const before = plain(env.game().stats);
  env.context.savedOrder = order;
  env.evaluate('delivered(savedOrder); dispatchOps()');
  assert.deepEqual(plain(env.game().stats), before, 'Repeating completion cannot count the same order twice');
});

test('two missing accessories share a runner batch but retain separate customer and waiting identities', () => {
  const env = fixture();
  const first = startExpress(env, 'first', true);
  finishExpress(env, 'first');
  const second = startExpress(env, 'second', true);
  finishExpress(env, 'second');
  const firstSpot = first.slot, secondSpot = second.slot;
  assert.notEqual(firstSpot, secondSpot);
  assert.notDeepEqual({x: firstSpot.x, y: firstSpot.y}, {x: secondSpot.x, y: secondSpot.y});
  assert.equal(env.game().orders.length, 2);
  reinforce(env);
  assert.equal(completeDeliveries(env, 2).delivered, 2);
  assert.equal(first.outcome, 'bought');
  assert.equal(second.outcome, 'bought');
  assert.equal(first.pending, 0);
  assert.equal(second.pending, 0);
  assert.equal(firstSpot.taken, null);
  assert.equal(secondSpot.taken, null);
  assert.equal(env.game().stats.express, 2);
  assert.equal(env.game().stats.expressRunnerRequested, 2);
  assert.ok(env.game().stats.batched >= 1);
  assert.equal(report(env).metrics.entered, 2);
  assert.equal(report(env).metrics.completed, 2);
});

test('delivering to the waiting customer does not interrupt a different customer currently at Express', () => {
  const env = fixture();
  const waiting = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  const current = startExpress(env, 'current', false);
  current.t = 1000;
  reinforce(env);
  assert.equal(completeDeliveries(env, 1).delivered, 1);
  assert.equal(waiting.outcome, 'bought');
  assert.equal(current.outcome, undefined);
  assert.equal(current.point, env.context.cashier);
  assert.equal(env.context.cashier.customer, current);
  assert.equal(env.context.cashier.state, 'listening');
  assert.equal(env.game().stats.express, 1);
  finishExpress(env, 'current');
  assert.equal(current.outcome, 'bought');
  assert.equal(env.game().stats.express, 2);
  assert.equal(env.game().stats.expressRunnerDelivered, 1);
});

test('a cashier who changes role or falls ill no longer owns the pending delivery', () => {
  for (const event of ['rotation', 'illness']) {
    const env = fixture();
    const customer = startExpress(env, 'waiting', true);
    finishExpress(env, 'waiting');
    const cashier = env.context.cashier;
    if (event === 'rotation') env.evaluate(`cashier.nextSlot = game.rota.findIndex(slot => slot.role === 'specialist'); applySlot(cashier)`);
    else env.evaluate('fallIll(cashier)');
    assert.notEqual(cashier.post, env.evaluate('EXPRESS'));
    assert.equal(customer.point, null);
    assert.equal(customer.staff, null);
    assert.equal(customer.servedBy, cashier);
    assert.equal(customer.state, 'waitDelivery');
    assert.equal(env.game().lineEx.includes(customer), false);
    reinforce(env);
    assert.equal(completeDeliveries(env, 1).delivered, 1);
    assert.equal(customer.outcome, 'bought');
    assert.equal(customer.pending, 0);
    assert.equal(env.game().stats.express, 1);
  }
});

test('a cancelled Express visit releases its spot and cannot be turned into a late purchase or delivery', () => {
  const env = fixture();
  const customer = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  const spot = customer.slot;
  const order = env.game().orders[0];
  env.evaluate("leave(waiting, 'lost')");
  assert.equal(spot.taken, null);
  reinforce(env);
  env.advance(10, 0.05);
  env.context.cancelledOrder = order;
  env.evaluate('delivered(cancelledOrder); delivered(cancelledOrder)');
  assert.equal(customer.outcome, 'lost');
  assert.equal(env.game().stats.express, 0);
  assert.equal(env.game().stats.expressRunnerDelivered, 0);
  assert.equal(env.game().stats.delivered, 0);
  assert.equal(report(env).metrics.completed, 0);
  assert.equal(report(env).metrics.lost, 1);
});

test('closing the store leaves an undelivered Express order unfinished without a phantom sale', () => {
  const env = fixture();
  const customer = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  const spot = customer.slot;
  const order = env.game().orders[0];
  env.evaluate('game.time = CLOSE; step(0.05)');
  assert.equal(env.game().over, true);
  assert.equal(customer.outcome, 'unfinished');
  assert.equal(spot.taken, null);
  assert.equal(env.game().orders.length, 0);
  assert.equal(env.game().stats.express, 0);
  assert.equal(env.game().stats.expressRunnerDelivered, 0);
  assert.equal(env.game().stats.unfinished, 1);
  assert.equal(report(env).metrics.unfinished, 1);
  assert.equal(report(env).metrics.completed, 0);
  env.context.closedOrder = order;
  env.evaluate('delivered(closedOrder)');
  assert.equal(customer.outcome, 'unfinished');
  assert.equal(env.game().stats.express, 0);
  assert.equal(env.game().stats.delivered, 0);
});

test('a career without Operations also preserves Express backlog while retaining ordinary order behavior', () => {
  const env = fixture({career: true});
  const express = startExpress(env, 'waiting', true);
  finishExpress(env, 'waiting');
  env.evaluate(`window.sale = spawnCustomer('buy', {product: 'iphone', setup: null,
    tradeIn: false, finance: false, familiarity: 0, hurry: 0, mood: 90});
    game.lineIn = game.lineIn.filter(customer => customer !== sale);
    sale.state = 'waitDelivery'; sale.bought = true; sale.path = [];
    requestItem(sale, 'product'); dispatchOps();`);
  assert.equal(express.state, 'waitDelivery');
  assert.equal(express.pending, 1);
  assert.equal(express.outcome, undefined);
  assert.equal(env.game().stats.express, 0);
  assert.equal(env.game().stats.expressRunnerDelivered, 0);
  assert.equal(env.context.sale.outcome, 'bought');
  assert.equal(env.context.sale.pending, 0);
  assert.equal(env.game().stats.delivered, 1);
  assert.equal(env.game().orders.find(order => order.c === express).done, false);
});
