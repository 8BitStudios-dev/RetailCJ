'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const {chooseGuided} = require('./interaction-helpers.cjs');

const AUTO_KEY = 'plgame.career.auto-next.v1';
const CAREER_KEY = 'plgame.career.v1';
const plain = value => JSON.parse(JSON.stringify(value));
class FloorRenderer {
  resize() {} setView() {} render() {} dispose() {} focus() {} getStats() { return {}; }
}

async function fixture({keepNPCs = false, storage, storageError} = {}) {
  const env = makeEnvironment({storage, storageError, webgl2: true,
    importFloorRenderer: () => Promise.resolve({FloorRenderer})});
  await env.context.PLFloorViewUI.ready;
  env.evaluate(`
    __sim.selectMode('career'); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.nextRotation = Infinity; Math.random = () => 0.5;
    playerMode.player().stats.stress = 0;
    playerMode.player().needsBreak = false; playerMode.player().wantsBreak = false;
    ${keepNPCs ? '' : "game.staff = game.staff.filter(s => s.isPlayer || s.role === 'ops');"}
  `);
  return env;
}

function waiting(env, {kind = 'buy', tQueue = 600, ownerId} = {}) {
  return env.evaluate(`(() => {
    const c = spawnCustomer(${JSON.stringify(kind)}, {product: 'iphone', fast: true,
      setup: null, tradeIn: false, finance: false, familiarity: 0, hurry: 0, mood: 80, rude: false});
    game.lineIn = game.lineIn.filter(item => item !== c);
    if (${JSON.stringify(kind)} === 'acc') {
      c.state = 'waitWall'; c.side = 'L'; c.x = WALL_SPOT.L; c.y = 600;
    } else {
      const slot = SLOTS.find(s => !s.taken && s.table.product === ${JSON.stringify(kind === 'help' ? 'help' : 'iphone')});
      slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
      c.state = 'waiting';
    }
    c.path = []; c.wait = 3; c.tQueue = ${tQueue}; c.patience = 1000; c.exp = 70;
    ${ownerId ? 'c.ownerId = ' + JSON.stringify(ownerId) + ';' : ''}
    return c;
  })()`);
}

function browser(env, {id = 2, x = 700, y = 330, state = 'looking', hurry = 0} = {}) {
  return env.evaluate(`(() => {
    const c = spawnCustomer('look', {product: 'iphone', familiarity: 0, hurry: ${hurry}, mood: 80, rude: false});
    game.lineIn = game.lineIn.filter(item => item !== c);
    Object.assign(c, {id: ${id}, x: ${x}, y: ${y}, state: ${JSON.stringify(state)},
      path: [], t: 999, visits: 2, exp: 70, browsingProduct: 'iphone'});
    game.nextId = Math.max(game.nextId, c.id + 1);
    return c;
  })()`);
}

function arrive(env) {
  env.evaluate('playerMode.player().path = []; updateStaff(playerMode.player(), 0.05); updatePanel()');
}

function complete(env) {
  for (let i = 0; i < 5; i++) assert.equal(chooseGuided(env), true);
}

function startInteraction(env) {
  env.evaluate('playerMode.player().path = []; step(0.05); updatePanel()');
  assert.ok(env.view().interaction);
}

test('Auto defaults off and persists separately from the career, including an unavailable-storage session', async () => {
  const env = await fixture();
  const checkpoint = env.storage.get(CAREER_KEY);
  assert.equal(env.view().autoNext, false);
  assert.equal(env.storage.has(AUTO_KEY), false);
  assert.equal(env.mode().setAutoNext(true), true);
  assert.equal(env.view().autoNext, true);
  assert.equal(env.storage.get(AUTO_KEY), 'true');
  assert.equal(env.storage.get(CAREER_KEY), checkpoint);
  const reloaded = makeEnvironment({storage: new Map(env.storage)});
  assert.equal(reloaded.view().autoNext, true);
  assert.equal(reloaded.storage.get(CAREER_KEY), checkpoint);
  assert.equal(env.mode().setAutoNext(false), false);
  assert.equal(env.storage.get(AUTO_KEY), 'false');
  const denied = await fixture({storageError: 'all'});
  assert.doesNotThrow(() => denied.mode().setAutoNext(true));
  assert.equal(denied.view().autoNext, true, 'The preference remains usable in memory');
});

test('Auto takes the oldest eligible queued customer once and preserves ownership against normal NPC dispatch', async () => {
  const env = await fixture({keepNPCs: true});
  const recent = waiting(env, {tQueue: 598});
  const oldest = waiting(env, {tQueue: 590});
  const foreign = waiting(env, {tQueue: 580, ownerId: 'OTHER'});
  env.mode().step(0.05);
  assert.equal(env.mode().player().customer, null, 'Free time remains manual until Auto is enabled');
  env.mode().setAutoNext(true);
  env.evaluate('step(0.05)');
  const player = env.mode().player();
  assert.equal(player.customer, oldest);
  assert.equal(oldest.ownerId, 'PLAYER');
  assert.equal(oldest.staff, player);
  assert.equal(player.isPlayer, true);
  assert.notEqual(recent.staff, player);
  assert.notEqual(foreign.staff, player);
  const open = env.view().stats.open;
  env.evaluate('dispatch(); dispatch(); playerMode.step(0.05)');
  assert.equal(player.customer, oldest);
  assert.equal(oldest.staff, player);
  assert.equal(env.view().stats.open, open);
  env.mode().setAutoNext(false);
  assert.equal(player.customer, oldest, 'Turning Auto off does not abandon an active visit');
});

test('Auto waits for the real conversation to finish and never answers a decision or claims two customers', async () => {
  const env = await fixture();
  const first = waiting(env, {kind: 'help', tQueue: 590});
  const second = waiting(env, {kind: 'help', tQueue: 599});
  env.mode().setAutoNext(true);
  env.mode().step(0.05);
  assert.equal(env.mode().player().customer, first);
  startInteraction(env);
  const question = env.view().interaction;
  env.mode().step(1);
  assert.equal(env.view().interaction.token, question.token);
  assert.equal(second.staff, null);
  assert.equal(env.view().stats.served, 0);
  complete(env);
  assert.equal(first.outcome, 'helped');
  assert.equal(env.view().stats.served, 1);
  assert.equal(env.mode().player().customer, null, 'Work charged by the fifth choice cannot chain another visit');
  env.mode().step(0.05);
  assert.equal(env.mode().player().customer, second);
  assert.equal(second.staff, env.mode().player());
  assert.equal(env.mode().takeNext(), null);
  assert.equal(env.view().stats.open, 1);
});

test('Auto respects menu, pause, briefing, graphics loss, recovery, breaks and the exact personal end boundary', async () => {
  const guards = [
    ['menu', env => env.context.__sim.showModes()],
    ['pause', env => { env.game().speed = 0; }],
    ['briefing', env => { env.game().briefing = true; }],
    ['planning', env => { env.game().planning = true; }],
    ['graphics unavailable', env => env.context.PLFloorView.setReady(false)],
    ['recovery', env => { env.mode().player().needsBreak = true; }],
    ['requested break', env => { env.mode().player().wantsBreak = true; }],
    ['on break', env => { env.mode().player().state = 'onBreak'; }],
    ['end boundary', env => { env.game().time = env.mode().shiftEnd(); }],
    ['completed shift', env => { env.game().over = true; }],
  ];
  for (const [name, guard] of guards) {
    const env = await fixture();
    const customer = waiting(env);
    env.mode().setAutoNext(true);
    guard(env);
    env.mode().step(0.05);
    assert.equal(env.mode().player().customer, null, name);
    assert.equal(customer.ownerId, undefined, name);
    assert.equal(customer.staff, null, name);
    assert.equal(env.view().stats.served, 0, name);
  }
});

test('Auto never invites browsers, while manual engagement selects the chosen visitor and reserves only that approach', async () => {
  const env = await fixture();
  const near = browser(env, {id: 2, x: 850});
  const chosen = browser(env, {id: 3, x: 400});
  env.mode().setAutoNext(true);
  env.mode().step(1);
  assert.equal(env.mode().player().customer, null);
  assert.equal(near.state, 'looking');
  assert.equal(chosen.state, 'looking');
  assert.equal(env.view().browsing, 2);
  assert.equal(env.view().canEngage, true);
  env.game().selected = chosen;
  assert.equal(env.mode().engageBrowser(), chosen);
  assert.equal(env.mode().player().state, 'toBrowser');
  assert.equal(chosen.state, 'engaging');
  assert.equal(chosen.staff, env.mode().player());
  assert.equal(chosen.ownerId, undefined, 'An invitation is not yet consent to a personal consultation');
  assert.equal(env.view().stats.open, 0);
  assert.equal(env.view().engagement.status, 'approaching');
  assert.equal(env.mode().engageBrowser(), null);
  assert.equal(near.staff, null);
  const queued = waiting(env, {kind: 'help', tQueue: 590});
  env.mode().step(0.05);
  assert.equal(env.mode().player().customer, chosen, 'Auto cannot replace a manual invitation in progress');
  assert.equal(queued.staff, null);
  arrive(env);
  assert.equal(chosen.ownerId, 'PLAYER');
  assert.equal(chosen.engagedBrowser, true);
  assert.equal(env.view().engagement.status, 'accepted');
  assert.equal(env.view().interaction.phase, 'approach');
  assert.equal(env.view().stats.open, 1);
});

test('accepting a consultation does not force a browsing visitor to buy or invent an order, sale, or NPS response', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 3});
  assert.equal(env.mode().engageBrowser(), visitor);
  arrive(env);
  assert.equal(visitor.engagementPurchaseReady, false);
  assert.match(env.view().active.description, /esplorare|non ha deciso/i);
  complete(env);
  assert.equal(visitor.outcome, 'browsed');
  assert.equal(env.game().orders.length, 0);
  assert.equal(env.game().stats.sold, 0);
  assert.equal(env.game().stats.lost, 0);
  assert.equal(env.game().reviews.length, 0);
  assert.equal(env.view().stats.served, 1);
  assert.equal(env.view().stats.sales, 0);
});

test('a ready browsing visitor follows all five choices and real Operations delivery before counting a sale', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 2});
  env.context.readyVisitor = visitor;
  env.mode().engageBrowser(); arrive(env);
  assert.equal(visitor.engagementPurchaseReady, true);
  complete(env);
  assert.equal(env.game().orders.some(order => order.c === visitor), true);
  assert.equal(env.view().stats.sales, 0);
  assert.equal(env.game().reviews.length, 0);
  env.evaluate('for (let ticks = 0; !readyVisitor.outcome && ticks < 4000 && !game.over; ticks++) step(0.05)');
  assert.equal(visitor.outcome, 'bought');
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 1);
});

test('declining an invitation restores browsing without a lost customer, fake review, or personal record', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 5, state: 'toLook'});
  visitor.path = [{x: 740, y: 330}];
  const before = plain({kind: visitor.kind, state: visitor.state, t: visitor.t, path: visitor.path,
    exp: visitor.exp, stats: env.game().stats, reviews: env.game().reviews});
  env.mode().engageBrowser(); arrive(env);
  assert.equal(env.view().engagement.status, 'declined');
  assert.equal(visitor.staff, null);
  assert.equal(visitor.ownerId, undefined);
  assert.equal(visitor.outcome, undefined);
  assert.equal(env.mode().player().customer, null);
  assert.deepEqual(plain({kind: visitor.kind, state: visitor.state, t: visitor.t, path: visitor.path,
    exp: visitor.exp, stats: env.game().stats, reviews: env.game().reviews}), before);
  assert.equal(env.view().stats.open, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().history.length, 0);
  assert.equal(env.mode().engageBrowser(), null, 'A declined invitation is not repeated immediately');
  assert.equal(env.view().canEngage, false);
  env.game().time += 15;
  env.mode().step(0.05);
  assert.equal(env.view().canEngage, true, 'A later invitation is possible after the cooldown');
  assert.equal(visitor.ownerId, undefined, 'Cooldown expiry never starts an automatic invitation');
});

test('an invitation cannot take a visitor already claimed elsewhere, nor complete while the menu or shift end blocks work', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 2});
  env.mode().engageBrowser();
  env.context.__sim.showModes();
  arrive(env);
  assert.equal(env.view().engagement.status, 'approaching');
  assert.equal(visitor.ownerId, undefined);
  env.context.__sim.closeModes();
  env.game().time = env.mode().shiftEnd();
  arrive(env);
  assert.equal(visitor.ownerId, undefined);
  assert.equal(env.view().stats.open, 0);

  const raced = await fixture();
  const other = browser(raced, {id: 2});
  raced.mode().engageBrowser();
  const colleague = {id: 'OTHER', customer: other};
  other.staff = colleague;
  arrive(raced);
  assert.equal(other.staff, colleague);
  assert.equal(other.ownerId, undefined);
  assert.equal(raced.mode().player().customer, null);
  assert.equal(raced.view().stats.open, 0);
});

test('the actual personal shift boundary releases an unanswered invitation without recording a visit or losing its visitor', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 2, x: 400});
  env.mode().engageBrowser();
  assert.equal(visitor.staff, env.mode().player());
  env.evaluate('game.time = playerMode.shiftEnd() - 0.01; step(0.05)');
  assert.equal(env.game().over, true);
  assert.equal(env.view().engagement, null, 'An ended shift cannot retain an approaching-visitor message');
  assert.equal(visitor.staff, null);
  assert.equal(visitor.ownerId, undefined);
  assert.equal(visitor.state, 'looking');
  assert.equal(visitor.outcome, undefined);
  assert.equal(env.view().stats.open, 0);
  assert.equal(env.view().stats.served, 0);
  assert.equal(env.view().history.length, 0);
  assert.equal(env.game().stats.lost, 0);
  assert.equal(env.game().reviews.length, 0);
  assert.equal(JSON.parse(env.storage.get(CAREER_KEY)).phase, 'completed');
  env.evaluate('updatePanel()');
  assert.equal(env.get('playerAutoNext').disabled, true);
  assert.equal(env.get('playerCommands').querySelector('[data-specialist-action="engage"]').disabled, true);
});

test('the real Auto checkbox sits beside Next, survives renders, and manual engagement fires once from its nested command panel', async () => {
  const env = await fixture();
  const visitor = browser(env, {id: 5});
  env.evaluate('updatePanel()');
  const panel = env.get('playerPanel');
  const commands = env.get('playerCommands');
  const toggle = commands.querySelector('[data-specialist-auto-next]');
  const next = commands.querySelector('[data-specialist-action="next"]');
  const engage = commands.querySelector('[data-specialist-action="engage"]');
  const row = next.closest('.playerNextRow');
  const label = toggle.closest('label');
  assert.ok(row && label && engage);
  assert.equal(toggle.type, 'checkbox');
  assert.equal(row.children.indexOf(label), row.children.indexOf(next) + 1);
  assert.equal(label.parentElement, row);
  assert.equal(commands.closest('#playerPanel'), panel);
  assert.ok(panel.children.indexOf(commands) < panel.children.indexOf(panel.querySelector('.playerCurrent')));
  assert.equal(panel.querySelector('.playerCurrent').hidden, true, 'An idle player has no empty conversation card');
  const details = panel.querySelector('.playerTurnDetails');
  assert.equal(details.tagName, 'DETAILS');
  assert.equal(details.open, false);
  const secondaryAuto = env.get('playerTurnAutoNext');
  assert.ok(secondaryAuto, 'The preference remains reachable from the collapsed turn details during a conversation');
  assert.equal(secondaryAuto.closest('.playerTurnDetails'), details);
  details.open = true;
  let toggles = 0, invitations = 0;
  const setAuto = env.mode().setAutoNext, invite = env.mode().engageBrowser;
  env.mode().setAutoNext = value => { toggles++; return setAuto(value); };
  env.mode().engageBrowser = () => { invitations++; return invite(); };
  toggle.checked = true; toggle.dispatch('change');
  assert.equal(toggles, 1);
  assert.equal(env.view().autoNext, true);
  assert.equal(env.mode().player().customer, null);
  env.evaluate('updatePanel(); updatePanel()');
  assert.equal(commands.querySelector('[data-specialist-auto-next]'), toggle);
  assert.equal(toggle.checked, true);
  assert.equal(secondaryAuto.checked, true);
  assert.equal(panel.querySelector('.playerTurnDetails'), details);
  assert.equal(details.open, true);
  assert.equal(engage.disabled, false);
  engage.click();
  assert.equal(invitations, 1);
  assert.equal(env.mode().player().customer, visitor);
  assert.equal(env.view().engagement.status, 'approaching');
  arrive(env);
  assert.equal(env.view().engagement.status, 'declined');
  assert.equal(panel.querySelector('.playerMessage').hidden, false);
  assert.match(panel.querySelector('.playerMessage').textContent, /guardare|scelta/i);
  assert.equal(env.game().stats.lost, 0);

  const queued = waiting(env, {kind: 'help'});
  env.mode().step(0.05);
  assert.equal(env.mode().player().customer, queued);
  startInteraction(env);
  const token = env.view().interaction.token;
  const time = env.game().time;
  for (const enabled of [false, true]) {
    secondaryAuto.checked = enabled;
    secondaryAuto.dispatch('change');
    assert.equal(env.view().autoNext, enabled);
    assert.equal(toggle.checked, enabled);
    assert.equal(secondaryAuto.checked, enabled);
    assert.equal(env.mode().player().customer, queued);
    assert.equal(env.view().interaction.token, token, 'Changing a preference cannot answer or replace the current question');
    assert.equal(env.game().time, time);
  }
  assert.equal(toggles, 3, 'Each checkbox change dispatches its handler exactly once');
  env.evaluate('updatePanel()');
  assert.equal(env.get('playerTurnAutoNext'), secondaryAuto);
  assert.equal(details.open, true);
});
