'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');
const {guidedChoiceSource, chooseGuided} = require('./interaction-helpers.cjs');
const CAREER_KEY = 'plgame.career.v1';
const plain = value => JSON.parse(JSON.stringify(value));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9,
  `${actual} differs from ${expected}`);

function fixture({stress = 0, comp = 0, saved} = {}) {
  const storage = saved ? new Map([[CAREER_KEY, JSON.stringify(saved)]]) : new Map();
  const env = makeEnvironment({storage});
  env.evaluate(`
    window.factorAwards = []; window.factorMotivation = [];
    const actualFactorBump = bump;
    bump = function(s, key, delta) {
      const before = s.stats[key], stress = s.stats.stress;
      actualFactorBump(s, key, delta);
      if (key === 'comp' && delta > 0) window.factorAwards.push({base: delta, stress,
        before, after: s.stats.comp, player: Boolean(s.isPlayer)});
      if (s.isPlayer && key === 'mot') window.factorMotivation.push({delta, before, after: s.stats.mot});
    };
    ${saved ? 'window.__sim.resumeCareer()' : "window.__sim.selectMode('career')"}; startDay();
    window.factorRoster = game.staff.slice(); game.staff = [playerMode.player()];
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.weather = 'sole'; Math.random = () => 0.5;
  `);
  if (!saved) Object.assign(env.mode().player().stats, {stress, comp, mot: 65});
  return env;
}

function client(env, extra = {}) {
  return env.evaluate(`(() => {
    const c = spawnCustomer('help', {product: 'iphone', familiarity: 0, hurry: 0, mood: 80,
      rude: false, complex: false, ${Object.entries(extra).map(([key, value]) =>
        JSON.stringify(key) + ': ' + JSON.stringify(value)).join(', ')}});
    game.lineIn = [];
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
    return {reached: Boolean(${condition}), state: playerMode.player().state, time: game.time};
  })()`);
  assert.equal(result.reached, true, JSON.stringify(result));
}

function award(env, base, player = true) {
  const entries = plain(env.context.factorAwards).filter(item => item.player === player);
  assert.equal(entries.length, 1, 'The real transition grants one learning award');
  const result = entries[0];
  assert.equal(result.base, base);
  const rate = player ? 1 - 0.0075 * Math.max(0, Math.min(100, result.stress)) : 1;
  closeTo(result.after, Math.min(player ? 100 : 75, result.before + base * rate));
  return result;
}

function training(env, staff = env.mode().player()) {
  env.context.trainingStaff = staff;
  env.evaluate(`
    trainingStaff.state = 'training'; trainingStaff.until = game.time + 1;
    trainingStaff.seat = {taken: trainingStaff}; trainingStaff.path = [];
  `);
  until(env, "trainingStaff.state !== 'training'", 3);
}

function colleague(env, role = 'specialist', tier = 'S') {
  const person = env.context.factorRoster.find(s => !s.isPlayer && s.role === role && s.tier === tier);
  assert.ok(person, `Missing ${role}/${tier} fixture`);
  Object.assign(person, {gone: false, hidden: false, state: 'idle', customer: null, path: [], t: Infinity,
    wantsBreak: false, helpRequester: null, expertHelp: null, post: null});
  return person;
}

test('learning rates cover the bounded stress scale without changing the source profile', () => {
  const api = makeEnvironment().context.PLCareerProgression;
  for (const [stress, expected] of [[-20, 1], [0, 1], [20, 0.85], [80, 0.4], [100, 0.25], [150, 0.25]]) {
    const profile = {stress, comp: 42.125, mot: 63, tier: 'S'};
    closeTo(api.learningRate(profile), expected);
    assert.deepEqual(profile, {stress, comp: 42.125, mot: 63, tier: 'S'});
  }
});

test('the same real help visit learns less at initial stress 80 than at zero and rewards only its actual ending', () => {
  const earned = [];
  for (const stress of [0, 80]) {
    const env = fixture();
    const c = client(env);
    env.mode().takeNext();
    env.mode().player().stats.stress = stress;
    assert.equal(env.context.factorAwards.length, 0);
    env.context.factorClient = c;
    until(env, "factorClient.outcome === 'helped'");
    assert.equal(env.view().stats.served, 1);
    const result = award(env, 3);
    earned.push(result.after - result.before);
    env.mode().recordLeave(c, 'helped');
    assert.equal(env.context.factorAwards.length, 1);
    closeTo(env.mode().player().stats.comp, result.after);
  }
  assert.ok(earned[0] > 2.5);
  assert.ok(earned[1] < 1.3);
});

test('actual timed training scales its two-point reward with stress at completion', () => {
  const gains = [];
  for (const stress of [0, 80]) {
    const env = fixture({stress});
    training(env);
    const result = award(env, 2);
    gains.push(result.after - result.before);
    assert.equal(env.mode().player().seat, null);
    env.advance(0.05);
    assert.equal(env.context.factorAwards.length, 1);
  }
  closeTo(gains[0], 2);
  assert.ok(gains[1] > 0.79 && gains[1] < 0.81);
});

test('a full break improves future learning without decreasing earned competence or directly changing motivation', () => {
  const env = fixture({stress: 100, comp: 17.625});
  const player = env.mode().player();
  const initialRate = env.context.PLCareerProgression.learningRate(player.stats);
  assert.equal(env.mode().requestBreak(), true);
  until(env, "playerMode.player().state === 'onBreak'", 20);
  env.advance(15.05);
  until(env, "playerMode.player().state === 'idle'", 30);
  assert.equal(player.stats.comp, 17.625);
  assert.equal(player.stats.mot, 65);
  assert.ok(env.context.PLCareerProgression.learningRate(player.stats) > initialRate);
  training(env);
  const learned = award(env, 2);
  assert.ok(learned.after - learned.before > 2 * initialRate);
  const retained = player.stats.comp;
  env.evaluate("bump(playerMode.player(), 'stress', 80); overnight({op: 3})");
  assert.equal(player.stats.comp, retained, 'Stress and overnight focus do not retroactively alter earned competence');
  assert.equal(player.stats.mot, 65, 'Night recovery does not invent social motivation');
});

test('NPC timed training keeps its two points at both low and high stress', () => {
  for (const stress of [0, 80]) {
    const env = fixture();
    const npc = colleague(env);
    Object.assign(npc.stats, {stress, comp: 10, mot: 65, cap: 75});
    env.game().staff = [npc];
    training(env, npc);
    award(env, 2, false);
    assert.equal(npc.stats.comp, 12);
  }
});

test('negative competence adjustments remain unscaled and positive growth caps at 100 with manual promotion', () => {
  const env = fixture({stress: 100, comp: 10});
  env.evaluate("bump(playerMode.player(), 'comp', 2); bump(playerMode.player(), 'comp', -2)");
  assert.equal(env.mode().player().stats.comp, 8.5);
  const capped = fixture({stress: 0, comp: 99.9});
  training(capped);
  award(capped, 2);
  assert.equal(capped.mode().player().stats.comp, 100);
  assert.equal(capped.mode().player().stats.tier, 'S');
  assert.equal(capped.view().career.canPromote, true);
  assert.equal(capped.context.__sim.promoteCareer(), true);
  assert.equal(capped.mode().player().stats.tier, 'E');
  assert.equal(capped.mode().player().stats.comp, 0);
  assert.equal(capped.context.__sim.promoteCareer(), false);
});

test('fractional legacy competence and new fractional learning survive save, backup and import unchanged', () => {
  const old = {version: 1, day: 14, phase: 'start', profile: {comp: 12.375, mot: 63, stress: 80}};
  const env = fixture({saved: old});
  assert.equal(env.mode().player().stats.comp, 12.375);
  training(env);
  const learned = award(env, 2).after;
  assert.notEqual(learned, Math.round(learned));
  env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
  const saved = plain(env.context.PLCareerSave.load());
  assert.equal(saved.profile.comp, learned);
  const parsed = env.context.PLCareerSave.parseBackup(env.context.PLCareerSave.exportBackup(saved));
  assert.equal(parsed.ok, true);
  assert.deepEqual(plain(parsed.snapshot), saved);
  const fresh = makeEnvironment();
  assert.equal(fresh.context.__sim.importCareer(parsed.snapshot).ok, true);
  fresh.context.__sim.resumeCareer();
  assert.equal(fresh.mode().player().stats.comp, learned);
  assert.equal(fresh.mode().player().stats.mot, 63);
});

test('player motivation follows the real team climate with double Lead influence and excludes departed or sick colleagues', () => {
  const env = fixture();
  const player = env.mode().player();
  const low = colleague(env);
  const high = colleague(env, 'specialist', 'E');
  const lead = colleague(env, 'lead', 'L');
  low.stats.mot = 10; high.stats.mot = 90; lead.stats.mot = 100; player.stats.mot = 50;
  const gone = {...low, id: 'gone', gone: true, stats: {...low.stats, mot: 0}};
  const sick = {...high, id: 'sick', state: 'leavingSick', stats: {...high.stats, mot: 0}};
  env.game().staff = [player, low, high, lead, gone, sick];
  env.evaluate('updateStaff(playerMode.player(), 60)');
  closeTo(player.stats.mot, 56.25);
  assert.equal(player.stats.comp, 0);
  player.stats.mot = 50;
  low.stats.mot = 10; high.stats.mot = 10; lead.stats.mot = 10;
  env.evaluate('updateStaff(playerMode.player(), 60)');
  closeTo(player.stats.mot, 40, 'A demotivated team also lowers social motivation');
  assert.equal(player.stats.comp, 0);
});

test('rude customers, positive and negative reviews, and a purchase do not directly change isolated player motivation', () => {
  const env = fixture({stress: 20});
  const player = env.mode().player();
  const c = env.evaluate(`(() => {
    const c = spawnCustomer('buy', {product: 'iphone', familiarity: 0, hurry: 0, mood: 80,
      rude: true, complex: false, fast: true, setup: null, finance: false, tradeIn: false});
    game.lineIn = [];
    const slot = SLOTS.find(item => !item.taken && item.table.product === 'iphone');
    slot.taken = c; c.slot = slot; c.x = slot.x; c.y = slot.y;
    c.state = 'waiting'; c.path = []; c.wait = 0; c.tQueue = game.time;
    c.patience = 1000; c.exp = 90; return c;
  })()`);
  env.context.factorClient = c;
  assert.equal(env.mode().takeNext(), c);
  assert.equal(env.evaluate('serve(playerMode.player(), factorClient)'), false);
  assert.equal(env.game().stats.rude, 1);
  assert.equal(player.stats.stress, 24);
  assert.equal(player.stats.mot, 65);
  env.evaluate("Math.random = () => 0; factorClient.outcome = 'bought'; factorClient.exp = 100; survey(factorClient)");
  assert.equal(env.game().reviews.length, 1);
  assert.equal(env.game().reviews[0].score, 5);
  assert.equal(player.stats.mot, 65);
  env.evaluate('factorClient.exp = 0; survey(factorClient)');
  assert.equal(env.game().reviews.length, 2);
  assert.equal(env.game().reviews[0].score, 1);
  assert.equal(player.stats.stress, 25);
  assert.equal(player.stats.mot, 65);
  env.evaluate(`
    factorClient.exp = 90; factorClient.saleCounted = true; factorClient.pending = 0;
    factorClient.state = 'handover'; leave(factorClient, 'bought');
  `);
  assert.equal(c.outcome, 'bought');
  assert.equal(c.state, 'leaving');
  assert.equal(player.customer, null);
  assert.equal(env.game().stats.buyWon, 1);
  assert.equal(env.view().stats.sales, 1);
  assert.equal(env.view().stats.served, 1);
  assert.equal(env.game().reviews.length, 3);
  assert.equal(player.stats.mot, 65);
  assert.equal(c.playerRecognized, undefined, 'There is no Lead to give social recognition');
});

test('completing actual Expert advice grants social support once and scales its coaching learning', () => {
  const env = fixture({stress: 30});
  const c = client(env, {familiarity: 2});
  env.mode().takeNext();
  const player = env.mode().player();
  const expert = colleague(env, 'specialist', 'E');
  env.game().staff = [player, expert];
  env.evaluate(`
    playerMode.player().state = 'probe'; playerMode.player().t = 6; playerMode.player().path = [];
    requestExpert(playerMode.player(), playerMode.player().customer);
  `);
  assert.equal(player.state, 'toExpert');
  assert.equal(player.stats.mot, 65);
  env.evaluate('playerMode.player().path = []; updateExpertHelp(playerMode.player(), 0.05)');
  assert.equal(player.stats.mot, 65, 'Walking to the Expert is not the completed support');
  env.evaluate('updateExpertHelp(playerMode.player(), 3.05)');
  assert.equal(player.stats.mot, 68);
  award(env, 0.3);
  env.evaluate(`
    playerMode.player().path = []; updateExpertHelp(playerMode.player(), 0.05);
    updateExpertHelp(playerMode.player(), 30); requestExpert(playerMode.player(), playerMode.player().customer);
  `);
  assert.equal(player.stats.mot, 68);
  assert.equal(c.supportRequests, 1);
  assert.equal(env.context.factorAwards.length, 1);
  assert.equal(player.customer, c);
});

test('only an available real Lead encourages a player error and cannot reward the same client twice', () => {
  const env = fixture();
  const c = client(env);
  const player = env.mode().player();
  const lead = colleague(env, 'lead', 'L');
  env.game().staff.push(lead);
  lead.state = 'probe';
  env.context.factorClient = c;
  env.evaluate('Math.random = () => 0; serve(playerMode.player(), factorClient)');
  assert.equal(player.stats.mot, 65);
  assert.equal(c.playerEncouraged, undefined);
  lead.state = 'idle';
  env.evaluate('serve(playerMode.player(), factorClient)');
  assert.equal(player.stats.mot, 67);
  assert.equal(c.playerEncouraged, true);
  env.evaluate('serve(playerMode.player(), factorClient)');
  assert.equal(player.stats.mot, 67);
});

test('a real concluded visit receives one Lead recognition and a finished shift receives no further social rewards', () => {
  const env = fixture();
  const lead = colleague(env, 'lead', 'L');
  lead.stats.mot = 65;
  env.game().staff.push(lead);
  const c = client(env);
  env.context.factorClient = c;
  env.mode().takeNext();
  until(env, "factorClient.outcome === 'helped'");
  assert.equal(c.playerRecognized, true);
  const recognition = plain(env.context.factorMotivation).filter(change => change.delta === 1);
  assert.equal(recognition.length, 1);
  closeTo(recognition[0].after - recognition[0].before, 1);
  assert.equal(env.evaluate("careerLeadSupport(playerMode.player(), factorClient, 'visit')"), false);
  env.evaluate('game.time = playerMode.shiftEnd(); step(0.05)');
  const player = env.mode().player();
  const mot = player.stats.mot;
  const fresh = client(env);
  env.context.factorClient = fresh;
  assert.equal(env.evaluate("careerLeadSupport(playerMode.player(), factorClient, 'error')"), false);
  assert.equal(env.evaluate("careerLeadSupport(playerMode.player(), factorClient, 'visit')"), false);
  assert.equal(player.stats.mot, mot);
});

test('the HUD explains the three factors and preserves fractional competence without showing an early 100', () => {
  const env = fixture({stress: 80, comp: 99.99});
  env.evaluate('updatePanel()');
  const panel = env.get('playerPanel');
  const badge = Array.from(panel.querySelectorAll('.playerEnergyBadge')).find(item =>
    item.querySelector('span').textContent === 'Competenza');
  assert.ok(badge);
  assert.equal(badge.querySelector('b').textContent, '99,9');
  assert.equal(env.get('careerPromote').disabled, true);
  assert.match(env.get('playerLearning').textContent, /40\s*%/);
  const details = panel.querySelector('.playerFactors');
  assert.ok(details);
  assert.match(details.querySelector('summary').textContent, /tre fattori/i);
});
