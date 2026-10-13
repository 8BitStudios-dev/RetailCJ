'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {makeEnvironment, gameDirectory} = require('./environment.cjs');
const observation = require(path.join(gameDirectory, 'observation-lab.js'));

const CAREER_KEY = 'plgame.career.v1';
const plain = value => JSON.parse(JSON.stringify(value));

function configuration(env, changes = {}) {
  const initial = plain((env ? env.context.PLObservation : observation).defaults);
  return {...initial, ...changes,
    demand: {...initial.demand, ...(changes.demand || {})},
    staff: {...initial.staff, ...(changes.staff || {})}};
}

function observe(changes = {}, options = {}) {
  const env = makeEnvironment({seed: 0x5eed, specialistMode: false, ...options});
  env.context.__sim.selectMode('observation');
  env.context.__sim.observation.apply(configuration(env, changes));
  return env;
}

function demand(env) {
  return plain(env.evaluate('({arrivals: game.arrivals, agenda: game.agenda})'));
}

function roster(env) {
  return plain(env.game().staff.map(person => ({name: person.name, tier: person.tier,
    role: person.role, rota: person.rota, stats: person.stats, start: person.start,
    x: person.x, y: person.y, state: person.state, look: person.look})));
}

function channelArrivals(plan, channel) {
  return plain(plan.arrivals.filter(arrival => arrival.extra.labChannel === channel));
}

function report(env) { return plain(env.context.__sim.observation.view.report); }

test('a returning Support walk-in remains one journey and terminal outcomes are counted once', () => {
  const ledger = observation.createLedger(observation.defaults);
  const original = {id: 1, journeyId: 'support-return', labChannel: 'walkins', kind: 'genius', exp: 80};
  observation.recordEnter(ledger, original, 600);
  observation.recordWait(ledger, original, 'inLine', 2);
  observation.recordWait(ledger, original, 'lineGB', 3);
  observation.recordLeave(ledger, original, 'rebooked', 610);
  const pending = observation.snapshot(ledger, {time: 610});
  assert.equal(pending.metrics.entered, 1);
  assert.equal(pending.metrics.active, 1);
  assert.equal(pending.metrics.completed, 0);
  const returned = {...original, id: 19, appt: 660, walkin: true, exp: 75};
  observation.recordEnter(ledger, returned, 655);
  observation.recordWait(ledger, returned, 'lineGB', 1);
  observation.recordLeave(ledger, returned, 'fixed', 680);
  observation.recordLeave(ledger, returned, 'fixed', 681);
  observation.recordEnter(ledger, returned, 682);
  const result = observation.snapshot(ledger, {time: 682});
  assert.equal(result.metrics.entered, 1);
  assert.equal(result.metrics.completed, 1);
  assert.equal(result.metrics.active, 0);
  assert.equal(result.channels.find(channel => channel.id === 'walkins').completed, 1);
  assert.equal(result.channels.find(channel => channel.id === 'appointments').entered, 0);
  assert.equal(result.phases.find(phase => phase.id === 'point').wait, 2);
  assert.equal(result.phases.find(phase => phase.id === 'supportPoint').wait, 4);
  assert.equal(result.phases.find(phase => phase.id === 'supportPoint').n, 1);
});

test('CJ rates use eligible journey samples and expose the actual review and waiting denominators', () => {
  const ledger = observation.createLedger(observation.defaults);
  const customers = [
    {id: 1, journeyId: 'sale-won', labChannel: 'sales', kind: 'buy', exp: 90},
    {id: 2, journeyId: 'sale-browsed', labChannel: 'sales', kind: 'buy', exp: 60},
    {id: 3, journeyId: 'express-lost', labChannel: 'express', kind: 'acc', quick: true, exp: 30},
    {id: 4, journeyId: 'service-later', labChannel: 'walkins', kind: 'genius', exp: 50},
    {id: 5, journeyId: 'open-sale', labChannel: 'sales', kind: 'buy', exp: 65},
  ];
  customers.forEach(customer => observation.recordEnter(ledger, customer, 600));
  observation.recordWait(ledger, customers[0], 'waiting', 2);
  observation.recordWait(ledger, customers[1], 'waiting', 6);
  observation.recordLeave(ledger, customers[0], 'bought', 620);
  observation.recordLeave(ledger, customers[1], 'browsed', 625);
  observation.recordLeave(ledger, customers[2], 'lost', 630);
  observation.recordLeave(ledger, customers[3], 'later', 635);
  const current = observation.snapshot(ledger, {time: 640,
    reviews: [{value: 1}, {value: 0}, {value: -1}, {value: NaN}], stats: {errors: 2}});
  assert.equal(current.metrics.entered, 5);
  assert.equal(current.metrics.completed, 2);
  assert.equal(current.metrics.completionRate, 40);
  assert.equal(current.metrics.abandonRate, 20);
  assert.equal(current.metrics.redirected, 1);
  assert.equal(current.metrics.active, 1);
  assert.equal(current.metrics.conversion, 50, 'An open sale is not a failed conversion');
  assert.equal(current.metrics.nps, 0);
  assert.equal(current.metrics.npsN, 3);
  assert.equal(current.metrics.errors, 2);
  const salesWait = current.phases.find(phase => phase.id === 'sales');
  assert.equal(salesWait.wait, 4);
  assert.equal(salesWait.n, 2);
  observation.finishLedger(ledger, 1200);
  const finished = observation.snapshot(ledger, {time: 1200});
  assert.equal(finished.metrics.unfinished, 1);
  assert.equal(finished.metrics.active, 0);
  assert.equal(finished.metrics.completed, 2);
  assert.equal(finished.metrics.conversion, 50);
  assert.equal(observation.recordLeave(ledger, customers[4], 'bought', 1201), false);
  assert.equal(observation.snapshot(ledger, {time: 1201}).metrics.completed, 2);
});

test('a fair A/B comparison requires the same day, demand seed and observation time', () => {
  const ledger = observation.createLedger(observation.defaults);
  const a = observation.snapshot(ledger, {day: 7, time: 720});
  const b = plain(a);
  b.metrics.errors = 2;
  assert.equal(observation.compare(a, b).ok, true);
  assert.equal(observation.compare(a, b).deltas.errors, 2);
  assert.equal(observation.compare(a, b).deltas.conversion, null);
  assert.equal(observation.compare(a, {...b, day: 8}).ok, false);
  assert.equal(observation.compare(a, {...b, seed: a.seed + 1}).ok, false);
  assert.equal(observation.compare(a, {...b, time: 721}).ok, false);
});

test('the same observation plan keeps customer identities and profiles across replays and staffing changes', () => {
  const api = observation;
  const config = configuration(null);
  const original = plain(api.plan(config));
  assert.deepEqual(plain(api.plan(config)), original);
  const staffed = {...config, staff: {...config.staff, E: config.staff.E + 2,
    TE: config.staff.TE + 2, OP: config.staff.OP + 1}};
  assert.deepEqual(plain(api.plan(staffed)), original,
    'Staff capacity must change the service result, not the demand used to compare it');
});

test('changing a demand stream preserves other streams and distinguishes Express from assisted accessories', () => {
  const api = observation;
  const config = configuration(null);
  const original = api.plan(config);
  const changed = api.plan({...config, demand: {...config.demand, accessories: 2}});
  const oldAccessories = channelArrivals(original, 'accessories');
  const newAccessories = channelArrivals(changed, 'accessories');
  assert.ok(newAccessories.length > oldAccessories.length);
  const oldIds = new Set(oldAccessories.map(arrival => arrival.extra.journeyId));
  assert.deepEqual(newAccessories.filter(arrival => oldIds.has(arrival.extra.journeyId)), oldAccessories,
    'The unchanged cohort keeps its original arrival time and customer profile');
  for (const channel of ['sales', 'express', 'walkins', 'browse']) {
    assert.deepEqual(channelArrivals(changed, channel), channelArrivals(original, channel));
  }
  assert.deepEqual(plain(changed.appointments), plain(original.appointments));
  const express = channelArrivals(original, 'express');
  assert.ok(express.length > 0);
  assert.ok(express.every(arrival => arrival.kind === 'acc' && arrival.extra.quick === true));
  assert.ok(oldAccessories.every(arrival => arrival.kind === 'acc' && arrival.extra.quick === false));
});

test('scheduled Support demand and walk-in Support demand can be varied independently', () => {
  const api = observation;
  const config = configuration(null);
  const original = api.plan(config);
  const onlyAppointments = api.plan({...config, demand: {...config.demand, appointments: 2}});
  const onlyWalkins = api.plan({...config, demand: {...config.demand, walkins: 2}});
  assert.ok(onlyAppointments.appointments.length > original.appointments.length);
  assert.deepEqual(channelArrivals(onlyAppointments, 'walkins'), channelArrivals(original, 'walkins'));
  assert.ok(channelArrivals(onlyWalkins, 'walkins').length > channelArrivals(original, 'walkins').length);
  assert.deepEqual(plain(onlyWalkins.appointments), plain(original.appointments));
  assert.ok(original.appointments.every(appointment => appointment.extra.labChannel === 'appointments'));
});

test('invalid observation inputs normalize to finite bounded simulation values', () => {
  const api = observation;
  const invalid = configuration(null, {day: NaN, seed: Infinity, skill: -900,
    motivation: 900, stress: NaN, patience: -1, delivery: Infinity,
    complexity: 50, noShow: -50, demand: {sales: NaN, express: -4}, staff: {E: 2.5, OP: -2}});
  const normalized = plain(api.normalizeConfig(invalid));
  assert.ok(Number.isInteger(normalized.day) && normalized.day >= 1 && normalized.day <= 31);
  assert.ok(Number.isFinite(normalized.seed));
  for (const value of Object.values(normalized.demand)) assert.ok(Number.isFinite(value) && value >= 0);
  for (const value of Object.values(normalized.staff)) assert.ok(Number.isInteger(value) && value >= 0);
  for (const key of ['skill', 'motivation', 'stress']) {
    assert.ok(Number.isFinite(normalized[key]) && normalized[key] >= 0 && normalized[key] <= 100);
  }
  for (const key of ['complexity', 'noShow']) {
    assert.ok(Number.isFinite(normalized[key]) && normalized[key] >= 0 && normalized[key] <= 1);
  }
  assert.ok(Number.isFinite(normalized.delivery) && normalized.delivery > 0);
  assert.ok(Number.isFinite(normalized.patience) && normalized.patience > 0);
  assert.doesNotThrow(() => api.plan(normalized));
});

test('replay restores the full floor, demand and initial team after the simulation has changed them', () => {
  const env = observe();
  const initialDemand = demand(env), initialRoster = roster(env);
  env.evaluate('startDay(); step(1); game.staff[0].stats.stress = 97; game.staff[0].stats.comp = 99; game.stats.errors = 7');
  assert.notDeepEqual(roster(env), initialRoster);
  env.context.__sim.observation.replay();
  assert.deepEqual(demand(env), initialDemand);
  assert.deepEqual(roster(env), initialRoster);
  assert.equal(env.game().stats.errors, 0);
  assert.equal(env.game().customers.length, 0);
  assert.equal(env.game().orders.length, 0);
  assert.equal(env.game().reviews.length, 0);
  assert.equal(env.game().time, env.evaluate('OPEN - 2'));
  assert.equal(env.game().briefing, false);
});

test('an over-cap roster preserves requested roles and a maximum roster gives eight people to each service', () => {
  const maximum = Object.fromEntries(observation.tiers.map(tier => [tier.id, 20]));
  const normalized = observation.normalizeConfig({staff: maximum});
  assert.deepEqual(normalized.staff, Object.fromEntries(observation.tiers.map(tier => [tier.id, 8])));
  assert.equal(Object.values(normalized.staff).reduce((sum, count) => sum + count, 0), 80);
  assert.equal(normalized.staff.OP, 8, 'Maximum floor staffing must not silently remove every runner');
  assert.deepEqual(observation.normalizeConfig(normalized), normalized, 'The allocated roster survives replay and save normalization');

  const requested = {S: 20, E: 20, P: 20, TS: 20, TE: 20, G: 1, C: 0, CP: 0, OP: 1, L: 1};
  const varied = observation.normalizeConfig({staff: requested});
  assert.equal(Object.values(varied.staff).reduce((sum, count) => sum + count, 0), 80);
  for (const [tier, count] of Object.entries(requested)) {
    assert.ok(Number.isInteger(varied.staff[tier]));
    assert.ok(varied.staff[tier] <= count, 'Allocation cannot add an unrequested colleague');
    if (count > 0) assert.ok(varied.staff[tier] >= 1, 'A requested service keeps at least one colleague: ' + tier);
    else assert.equal(varied.staff[tier], 0, 'An absent role stays absent: ' + tier);
  }
  assert.deepEqual(observation.normalizeConfig(varied), varied);
  assert.deepEqual(observation.normalizeConfig(observation.defaults), observation.defaults, 'A team below the limit retains its exact requested staffing');
});

test('maximum staffing has a visible 200-to-80 preview and applies the promised Operations coverage', () => {
  const env = observe();
  const initial = plain(env.context.__sim.observation.view.config.staff);
  for (const tier of observation.tiers) {
    const field = env.get('observation-staff-' + tier.id);
    field.value = '20'; field.dispatch('input');
  }
  env.context.PLObservationUI.render(env.context.__sim.observation.view);
  const preview = env.get('observationStaffPreview');
  assert.ok(preview, 'The requested and allocated rosters must be visible before submission');
  assert.match(preview.textContent, /200/);
  assert.match(preview.textContent, /80/);
  assert.match(preview.textContent, /Operations[^\d]*8/);
  for (const tier of observation.tiers) {
    assert.equal(Number(env.get('observation-staff-' + tier.id).value), 20, 'Simulation refreshes preserve the unapplied request');
  }
  assert.deepEqual(plain(env.context.__sim.observation.view.config.staff), initial, 'Preview does not alter the active floor');
  env.get('observationApply').parentElement.dispatch('submit');
  const applied = plain(env.context.__sim.observation.view.config.staff);
  assert.equal(env.game().staff.length, 80);
  for (const tier of observation.tiers) {
    assert.equal(applied[tier.id], 8);
    assert.equal(env.game().staff.filter(person => person.tier === tier.id).length, 8);
    assert.equal(Number(env.get('observation-staff-' + tier.id).value), 8, 'Fields show the roster actually applied');
  }
  assert.equal(env.game().staff.filter(person => person.role === 'ops').length, 8);
});

test('applying additional staffing leaves the scenario arrival and appointment samples unchanged', () => {
  const env = observe();
  const original = demand(env);
  const config = plain(env.context.__sim.observation.view.config);
  env.context.__sim.observation.apply({...config,
    staff: {...config.staff, E: config.staff.E + 2, TE: config.staff.TE + 2, OP: config.staff.OP + 2}});
  assert.deepEqual(demand(env), original);
  for (const tier of ['E', 'TE', 'OP']) {
    assert.equal(env.game().staff.filter(person => person.tier === tier).length, config.staff[tier] + 2);
  }
});

test('shared customers keep their hidden need and accessory side after spawning with different staffing', () => {
  const a = observe();
  const b = observe({staff: {E: 5, TE: 5, OP: 5}});
  const spawnedProfiles = env => plain(env.evaluate(`game.arrivals
    .filter(arrival => ['buy', 'acc'].includes(arrival.kind)).slice(0, 40)
    .map(arrival => {
      const c = spawnCustomer(arrival.kind, {...arrival.extra, look: {...arrival.extra.look}});
      if (c.kind === 'acc') proceed(c);
      return {journeyId: c.journeyId, kind: c.kind, product: c.product, need: c.need,
        side: c.side, quick: c.quick, familiarity: c.familiarity, hurry: c.hurry,
        mood: c.mood, exp: c.exp, look: c.look};
    })`));
  const customersA = spawnedProfiles(a), customersB = spawnedProfiles(b);
  assert.ok(customersA.some(customer => customer.kind === 'buy' && customer.need));
  assert.ok(customersA.some(customer => customer.kind === 'acc' && ['L', 'R'].includes(customer.side)));
  assert.deepEqual(customersB, customersA,
    'Staffing changes the service, while shared journey IDs keep the same needs and destination inputs');
});

test('an edited scenario draft survives simulation refreshes and applies only when submitted', () => {
  const env = observe();
  const field = env.get('observation-demand-sales');
  assert.ok(field);
  field.value = '2';
  field.dispatch('input');
  const technicalExperts = env.get('observation-staff-TE');
  technicalExperts.value = '6';
  technicalExperts.dispatch('input');
  const geniuses = env.get('observation-staff-G');
  geniuses.value = '2';
  geniuses.dispatch('change');
  env.context.PLObservationUI.render(env.context.__sim.observation.view);
  env.evaluate('startDay(); step(1); updatePanel()');
  assert.equal(Number(field.value), 2);
  assert.equal(Number(technicalExperts.value), 6);
  assert.equal(Number(geniuses.value), 2);
  assert.equal(env.context.__sim.observation.view.config.demand.sales, 1);
  assert.equal(env.context.__sim.observation.view.config.staff.TE, 3);
  assert.equal(env.context.__sim.observation.view.config.staff.G, 1);
  env.get('observationApply').parentElement.dispatch('submit');
  assert.equal(env.context.__sim.observation.view.config.demand.sales, 2);
  assert.equal(env.context.__sim.observation.view.config.staff.TE, 6);
  assert.equal(env.context.__sim.observation.view.config.staff.G, 2);
  assert.equal(env.game().staff.filter(person => person.tier === 'TE').length, 6);
  assert.equal(env.game().staff.filter(person => person.tier === 'G').length, 2);
  assert.equal(env.game().briefing, false);
});

test('scenario staffing uses independent valid profiles for every tier and the operational routes', () => {
  const env = observe();
  const config = plain(env.context.__sim.observation.view.config);
  for (const [tier, count] of Object.entries(config.staff)) {
    assert.equal(env.game().staff.filter(person => person.tier === tier).length, count);
  }
  const staff = env.game().staff;
  assert.equal(staff.some(person => person.isPlayer || person.name === 'Tu'), false);
  for (const person of staff) {
    assert.ok(['point', 'express', 'accessori', 'specialist', 'genius', 'creative', 'ops', 'lead'].includes(person.role));
    assert.ok(Number.isFinite(person.stats.comp) && Number.isFinite(person.stats.cap));
    assert.notEqual(person.start, person.stats);
    for (const other of staff) if (person !== other) assert.notEqual(person.stats, other.stats);
  }
  assert.equal(env.evaluate('game.staff.every(s => TEAM[s.name] === s.stats)'), true);
  assert.ok(staff.some(person => person.rota === 'floor' && person.role === 'specialist'));
  assert.ok(staff.some(person => person.rota === 'bar' && person.role === 'genius'));
  assert.ok(staff.some(person => person.role === 'ops' && person.hidden));
  assert.doesNotThrow(() => env.advance(45, 0.25));
});

test('live reinforcements join both floor and Support dispatch and use distinct team profiles', () => {
  const env = observe();
  env.evaluate('startDay(); game.arrivals = []; game.sessions = []');
  const names = new Set(env.game().staff.map(person => person.name));
  const count = env.game().staff.length;
  for (const tier of ['E', 'TE', 'OP']) env.context.__sim.observation.addStaff(tier);
  const additions = env.game().staff.filter(person => !names.has(person.name));
  assert.equal(env.game().staff.length, count + 3);
  assert.deepEqual(plain(additions.map(person => person.tier).sort()), ['E', 'OP', 'TE']);
  const sales = additions.find(person => person.tier === 'E');
  const support = additions.find(person => person.tier === 'TE');
  assert.equal(sales.rota, 'floor');
  assert.equal(sales.role, 'specialist');
  assert.equal(support.rota, 'bar');
  assert.equal(support.role, 'genius');
  assert.equal(env.evaluate('game.staff.every(s => TEAM[s.name] === s.stats)'), true);
  env.context.salesReinforcement = sales;
  env.context.supportReinforcement = support;
  const assignments = plain(env.evaluate(`(() => {
    game.staff.filter(s => s !== salesReinforcement && s !== supportReinforcement).forEach(s => {
      s.hidden = true; s.state = 'onBreak'; s.until = Infinity;
    });
    const sale = spawnCustomer('buy', {product: 'iphone', fast: true,
      familiarity: 0, hurry: 0, mood: 80, setup: null, tradeIn: false, finance: false});
    game.lineIn = game.lineIn.filter(c => c !== sale);
    const slot = SLOTS.find(s => !s.taken && s.table.product === 'iphone');
    slot.taken = sale; sale.slot = slot; sale.x = slot.x; sale.y = slot.y;
    sale.state = 'waiting'; sale.path = []; sale.tQueue = game.time;
    const service = spawnCustomer('genius', {appt: game.time, familiarity: 0, hurry: 0, mood: 80, repair: 0});
    game.lineGB = game.lineGB.filter(c => c !== service);
    const chair = BAR.find(s => !s.taken); chair.taken = service; service.bar = chair;
    service.state = 'atBar'; service.path = []; service.x = chair.x; service.y = chair.y;
    service.tCheck = game.time;
    salesReinforcement.state = 'idle'; salesReinforcement.path = [];
    supportReinforcement.state = 'idle'; supportReinforcement.path = [];
    dispatch();
    return {sales: sale.staff === salesReinforcement, support: service.staff === supportReinforcement};
  })()`));
  assert.equal(assignments.sales, true);
  assert.equal(assignments.support, true);
});

test('live demand tools add real customers to the chosen journey cohort', () => {
  const env = observe();
  env.evaluate('startDay(); game.arrivals = []');
  for (const channel of ['sales', 'accessories', 'express', 'appointments', 'walkins']) {
    const count = env.game().customers.length;
    const arrivals = env.game().arrivals.length;
    env.context.__sim.observation.inject(channel, 3);
    env.evaluate('step(1)');
    const added = env.game().customers.slice(count).concat(env.game().arrivals.slice(arrivals));
    assert.ok(added.some(item => (item.labChannel || item.extra?.labChannel) === channel), channel);
  }
  assert.match(env.context.__sim.observation.view.notice, /client|arriv|aggiunt|intervent/i);
});

test('capturing an A reference stops its replay at exactly the same simulation clock', () => {
  const env = observe();
  env.evaluate('startDay()');
  env.advance(10, 0.25);
  const time = env.game().time;
  env.context.__sim.observation.capture();
  assert.equal(env.context.__sim.observation.view.reference.time, time);
  env.context.__sim.observation.replay();
  env.evaluate('startDay()');
  env.advance(30, 0.25);
  assert.ok(Math.abs(env.game().time - time) < 1e-9);
  const view = plain(env.context.__sim.observation.view);
  assert.ok(view.comparison);
  assert.equal(view.pendingTarget, null);
  const heldReport = report(env);
  env.advance(1, 0.25);
  assert.equal(env.game().time, time, 'The B result is held for review instead of drifting past A');
  assert.deepEqual(report(env), heldReport, 'Pausing B holds its customer and staff results as well as its clock');
  env.context.__sim.observation.clearReference();
  assert.equal(env.context.__sim.observation.view.reference, null);
  assert.equal(env.context.__sim.observation.view.comparison, null);
});

test('career data and its NPC team survive observation setup, interventions, replay and reset', () => {
  const stored = {version: 2, day: 17, phase: 'start',
    profile: {tier: 'E', mot: 63, stress: 21, comp: 38.75}};
  const env = makeEnvironment({specialistMode: true,
    storage: new Map([[CAREER_KEY, JSON.stringify(stored)]])});
  env.context.__sim.resumeCareer();
  const saved = env.storage.get(CAREER_KEY);
  const profile = env.evaluate('JSON.stringify(TEAM.Tu)');
  const team = env.evaluate("JSON.stringify(Object.fromEntries(Object.entries(TEAM).filter(([name]) => name !== 'Tu'))) ");
  const writes = env.storageCalls.filter(call => call.operation === 'write' && call.args[0] === CAREER_KEY).length;
  env.context.__sim.selectMode('observation');
  env.context.__sim.observation.apply(configuration(env, {stress: 80, skill: 95, staff: {E: 9, TE: 9}}));
  env.evaluate('startDay()');
  env.context.__sim.observation.addStaff('E');
  env.context.__sim.observation.inject('sales', 3);
  env.context.__sim.observation.teamSupport();
  env.advance(2, 0.25);
  env.context.__sim.observation.replay();
  env.context.__sim.observation.reset();
  assert.equal(env.storage.get(CAREER_KEY), saved);
  assert.equal(env.evaluate('JSON.stringify(TEAM.Tu)'), profile);
  assert.equal(env.storageCalls.filter(call => call.operation === 'write' && call.args[0] === CAREER_KEY).length, writes);
  env.context.__sim.resumeCareer();
  assert.equal(env.evaluate("JSON.stringify(Object.fromEntries(Object.entries(TEAM).filter(([name]) => name !== 'Tu'))) "), team);
  assert.equal(env.mode().player().stats.comp, stored.profile.comp);
});

test('observation actions cannot modify the player or floor during a career', () => {
  const env = makeEnvironment({specialistMode: true});
  env.context.__sim.selectMode('career');
  const before = env.evaluate('JSON.stringify({time: game.time, team: TEAM, arrivals: game.arrivals, stats: game.stats})');
  const saved = env.storage.get(CAREER_KEY);
  const api = env.context.__sim.observation;
  api.apply(configuration(env, {stress: 90}));
  api.replay(); api.reset(); api.capture(); api.inject('sales', 5); api.addStaff('P'); api.teamSupport();
  assert.equal(env.evaluate('window.__sim.mode'), 'career');
  assert.equal(env.evaluate('JSON.stringify({time: game.time, team: TEAM, arrivals: game.arrivals, stats: game.stats})'), before);
  assert.equal(env.storage.get(CAREER_KEY), saved);
  assert.equal(api.view.active, false);
});

test('an empty observation sample shows unavailable rates rather than invented zero-percent outcomes', () => {
  const env = observe({demand: {sales: 0, accessories: 0, express: 0,
    appointments: 0, walkins: 0, browse: 0}});
  const metrics = report(env).metrics;
  assert.equal(metrics.entered, 0);
  assert.equal(metrics.completed, 0);
  assert.equal(metrics.completionRate, null);
  assert.equal(metrics.abandonRate, null);
  assert.equal(metrics.conversion, null);
  assert.equal(metrics.nps, null);
  assert.equal(metrics.npsN, 0);
});

test('closing an observation scenario retains unfinished journeys without inventing sales or repairs', () => {
  const env = observe();
  env.evaluate(`startDay(); game.arrivals = []; game.sessions = [];
    const sale = spawnCustomer('buy', {journeyId: 'test-open-sale', labChannel: 'sales', product: 'iphone'});
    sale.state = 'waitDelivery'; sale.bought = true; sale.pending = 1;
    const service = spawnCustomer('genius', {journeyId: 'test-open-support', labChannel: 'appointments', appt: CLOSE - 5});
    const technician = game.staff.find(s => s.role === 'genius');
    technician.customer = service; technician.state = 'repair'; technician.t = 100;
    service.staff = technician; service.state = 'atBar';
    game.time = CLOSE; step(0.05);`);
  const metrics = report(env).metrics;
  assert.equal(env.game().over, true);
  assert.equal(env.game().stats.sold, 0);
  assert.equal(env.game().stats.genius, 0);
  assert.equal(metrics.completed, 0);
  assert.equal(metrics.unfinished, 2);
  assert.equal(metrics.active, 0);
});

test('without Operations an order remains queued until a real reinforcement retrieves and delivers it', () => {
  const env = observe({staff: {OP: 0}, demand: {sales: 0, accessories: 0, express: 0,
    appointments: 0, walkins: 0, browse: 0}});
  env.evaluate(`startDay(); game.sessions = []; Math.random = () => 0.5;
    window.queuedCustomer = spawnCustomer('buy', {journeyId: 'queued-order', labChannel: 'sales',
      product: 'iphone', setup: null, tradeIn: false, finance: false, hurry: 0, mood: 90});
    game.lineIn = []; queuedCustomer.state = 'waitDelivery'; queuedCustomer.bought = true;
    queuedCustomer.path = []; queuedCustomer.x = 700; queuedCustomer.y = 850;
    requestItem(queuedCustomer, 'product');`);
  const order = env.game().orders[0];
  env.advance(5, 0.25);
  assert.equal(env.game().stats.delivered, 0);
  assert.equal(env.game().stats.sold, 0);
  assert.equal(env.evaluate('queuedCustomer.pending'), 1);
  assert.equal(env.game().orders[0], order);
  assert.equal(order.done, false);
  assert.equal(order.ops, null);
  env.context.__sim.observation.addStaff('OP');
  const finished = env.evaluate(`(() => {
    let ticks = 0;
    while (!game.stats.delivered && ticks++ < 600) step(0.05);
    return game.stats.delivered === 1 && queuedCustomer.pending === 0;
  })()`);
  assert.equal(finished, true);
  assert.equal(order.ops?.tier, 'OP');
  assert.ok(report(env).metrics.delivery > 5, 'The delivery metric includes the real backlog wait');
});

test('a complete observation day with a small real cohort closes at 20:00 with a consistent CJ report', () => {
  const env = observe({demand: {sales: 0.15, accessories: 0.1, express: 0.1,
    appointments: 0.1, walkins: 0.1, browse: 0.1}});
  env.evaluate('startDay()');
  env.advance(610, 0.25);
  assert.equal(env.game().over, true);
  assert.equal(env.game().time, 20 * 60);
  assert.equal(env.mode(), null);
  const result = report(env);
  assert.ok(result.metrics.entered > 0);
  assert.equal(result.metrics.active, 0);
  assert.equal(result.metrics.entered, result.metrics.completed + result.metrics.lost +
    result.metrics.redirected + result.metrics.unfinished);
  assert.equal(result.channels.reduce((sum, channel) => sum + channel.entered, 0), result.metrics.entered);
  assert.equal(result.staff.total, env.game().staff.length);
  for (const value of Object.values(result.metrics)) assert.ok(value === null || Number.isFinite(value));
  assert.equal(env.storage.has(CAREER_KEY), false);
  const seed = result.seed;
  env.get('nextDay').click();
  assert.equal(env.game().day, 8);
  assert.equal(env.context.__sim.observation.view.config.seed, seed);
  assert.equal(report(env).metrics.entered, 0);
  assert.equal(report(env).metrics.completed, 0);
  assert.equal(env.game().over, false);
});
