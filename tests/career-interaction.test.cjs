'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {gameDirectory} = require('./environment.cjs');
const context = {};
context.window = context;
vm.createContext(context);
for (const file of ['career-progression.js', 'career-interaction.js']) {
  vm.runInContext(fs.readFileSync(path.join(gameDirectory, file), 'utf8'), context, {filename: file});
}
const engine = context.PLCareerInteraction;
const phases = ['approach', 'probe', 'present', 'listen', 'extend'];
const good = ['welcome', 'discover', 'relevant', 'respond', 'complete'];
const rushed = ['direct', 'assume', 'specs', 'move-on', 'finish'];
const overloaded = ['tour', 'all-questions', 'everything', 'promise', 'insist'];
const plain = value => JSON.parse(JSON.stringify(value));
const profile = extra => ({tier: 'S', comp: 0, stress: 0, mot: 65, ...extra});
const customer = extra => ({id: 101, kind: 'buy', product: 'iphone', need: 'data',
  hurry: 0, familiarity: 0, fast: false, setup: null, tradeIn: false, ...extra});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function choose(session, suffix) {
  const question = session.view();
  const option = question.options.find(item => item.id.endsWith('-' + suffix));
  assert.ok(option, 'The strategy must answer an available action: ' + suffix);
  return session.choose(option.id, question.token);
}
function play(c = customer(), p = profile(), strategy = good) {
  const session = engine.create(c, p);
  for (const suffix of strategy) assert.equal(choose(session, suffix).accepted, true);
  assert.equal(session.complete, true);
  return {session, result: plain(session.result)};
}

test('five explicit decisions complete the ASOS conversation without mutating frozen live inputs', () => {
  const c = freeze(customer()), p = freeze(profile());
  const before = JSON.stringify({c, p});
  const session = engine.create(c, p);
  const tokens = new Set();
  let minutes = 0;
  for (const [index, phase] of phases.entries()) {
    assert.equal(session.complete, false);
    assert.equal(session.result, null);
    const question = session.view();
    assert.equal(question.phase, phase);
    assert.equal(question.index, index);
    assert.equal(question.guided, true);
    assert.ok(question.speech.length > 10);
    assert.equal(question.options.length, 3);
    assert.equal(question.options.filter(option => option.recommended).length, 1);
    assert.equal(tokens.has(question.token), false);
    tokens.add(question.token);
    const result = choose(session, good[index]);
    assert.equal(result.accepted, true);
    assert.equal(result.complete, index === 4);
    assert.ok(result.minutes > 0);
    minutes += result.minutes;
  }
  assert.equal(session.complete, true);
  assert.equal(session.result.decisions, 5);
  assert.equal(session.result.feedback.length, 2);
  assert.ok(session.result.feedback.every(note => note.length > 15));
  assert.ok(Math.abs(session.result.minutes - minutes) < 1e-9);
  assert.equal(session.result.needKnown, true);
  assert.equal(session.result.purchase, true);
  assert.equal(session.result.setup, true);
  assert.ok(session.result.qualityDelta > 0);
  assert.equal(JSON.stringify({c, p}), before);
});

test('invalid, duplicate, stale and cross-session choices cannot charge minutes or skip phases', () => {
  const first = engine.create(customer(), profile());
  const second = engine.create(customer(), profile());
  const question = first.view();
  const choice = question.options.find(option => option.recommended);
  assert.equal(first.choose('missing-action', question.token).accepted, false);
  assert.equal(first.choose(choice.id, second.view().token).accepted, false);
  assert.equal(first.view().phase, 'approach');
  assert.equal(first.choose(choice.id, question.token).accepted, true);
  const next = JSON.stringify(first.view());
  assert.equal(first.choose(choice.id, question.token).accepted, false);
  assert.equal(JSON.stringify(first.view()), next);
  for (const suffix of good.slice(1)) choose(first, suffix);
  const result = plain(first.result);
  assert.equal(first.choose(choice.id, question.token).accepted, false);
  assert.deepEqual(plain(first.result), result);
  const exposed = first.result;
  exposed.feedback.push('external modification'); exposed.qualityDelta = -100;
  assert.deepEqual(plain(first.result), result, 'The public result cannot corrupt a completed conversation');
});

test('relevant choices improve quality while rushing saves time and overloading costs time and stress', () => {
  const best = play().result;
  const fast = play(customer(), profile(), rushed).result;
  const pressure = play(customer(), profile(), overloaded).result;
  assert.ok(best.qualityDelta > fast.qualityDelta);
  assert.ok(best.qualityDelta > pressure.qualityDelta);
  assert.ok(fast.minutes < best.minutes);
  assert.ok(pressure.minutes > best.minutes);
  assert.ok(pressure.stressDelta > best.stressDelta);
  assert.equal(best.seriousError, false);
  assert.equal(pressure.seriousError, true, 'An unverified promise has a real error consequence');
  assert.equal(fast.needKnown, false);
  assert.equal(fast.purchase, false);
});

test('a freely declined service preserves the quality of the proposal and creates no service or mistake', () => {
  let declined, accepted;
  for (let id = 1; id <= 100 && (!declined || !accepted); id++) {
    const completed = play(customer({id, need: 'protezione'}));
    if (completed.result.service) accepted ||= completed;
    else declined ||= completed;
  }
  assert.ok(declined && accepted, 'The same service scenario includes acceptance and refusal');
  assert.equal(declined.result.qualityDelta, accepted.result.qualityDelta);
  assert.equal(declined.result.seriousError, false);
  assert.equal(declined.result.purchase, true);
  assert.equal(declined.result.service, false);
  assert.match(declined.session.view().feedback, /preferisco|senza aggiungere/i);
});

test('client needs create relevant extensions; help remains help and accessories remain accessory visits', () => {
  for (const [need, flag] of [['data', 'setup'], ['travel', 'accessory'], ['business', 'business'], ['budget', 'tradeIn']]) {
    const result = play(customer({need})).result;
    assert.equal(result[flag], true, need);
    assert.equal(result.service, false, 'An unrelated service is not forced into every visit');
  }
  const help = play(customer({kind: 'help', need: null})).result;
  assert.equal(help.purchase, false);
  assert.equal(help.accessory, false);
  assert.equal(help.service, false);
  const acc = play(customer({kind: 'acc', need: null})).result;
  assert.equal(acc.purchase, true);
  assert.equal(acc.accessory, true);
});

test('guided juniors have no countdown; experienced profiles get one soft timeout per real-time tick', () => {
  for (const comp of [0, 24.999]) {
    const session = engine.create(freeze(customer()), freeze(profile({comp})));
    const before = JSON.stringify(session.view());
    assert.equal(session.view().secondsLeft, null);
    assert.equal(session.tick(100000), null);
    assert.equal(JSON.stringify(session.view()), before);
  }
  for (const p of [profile({comp: 25}), profile({tier: 'E', comp: 0}), profile({tier: 'P', comp: 80})]) {
    const session = engine.create(freeze(customer()), freeze(p));
    assert.equal(session.view().secondsLeft, 18);
    assert.equal(session.view().options.some(option => option.recommended), false);
    for (const invalid of [NaN, Infinity, -1, 0]) assert.equal(session.tick(invalid), null);
    assert.equal(session.view().secondsLeft, 18);
    assert.equal(session.tick(17), null);
    assert.equal(session.view().secondsLeft, 1);
    const token = session.view().token;
    assert.equal(session.tick(100000).accepted, true);
    assert.equal(session.view().phase, 'probe', 'A delayed frame never skips several decisions');
    assert.equal(session.view().secondsLeft, 18);
    assert.equal(session.choose('approach-welcome', token).accepted, false);
    for (let i = 0; i < 4; i++) assert.equal(session.tick(18).accepted, true);
    assert.equal(session.complete, true);
    assert.equal(session.result.decisions, 5);
    assert.equal(session.result.seriousError, false);
    assert.equal(session.result.needKnown, false, 'Timeout does not play an optimal discovery for the player');
    for (const key of ['accessory', 'service', 'setup', 'business', 'tradeIn']) assert.equal(session.result[key], false, key);
    assert.equal(session.tick(18), null);
  }
});

test('experience shortens actual choice minutes continuously across promotion boundaries', () => {
  const beginner = play(customer(), profile({comp: 0})).result;
  const experienced = play(customer(), profile({comp: 100})).result;
  const lead = play(customer(), profile({tier: 'L', comp: 100})).result;
  assert.ok(beginner.minutes > experienced.minutes);
  assert.ok(experienced.minutes > lead.minutes);
  for (const [tier, next] of [['S', 'E'], ['E', 'P'], ['P', 'L']]) {
    const before = play(customer(), profile({tier, comp: 100})).result;
    const after = play(customer(), profile({tier: next, comp: 0})).result;
    assert.equal(before.minutes, after.minutes, `${tier} to ${next} must preserve learned speed`);
  }
});

test('a session captures its initial need and competence while live inputs continue evolving independently', () => {
  const c = customer(), p = profile();
  const session = engine.create(c, p);
  c.need = 'budget'; c.hurry = 2; p.tier = 'L'; p.comp = 100; p.stress = 100;
  for (const suffix of good) choose(session, suffix);
  const original = play().result;
  assert.equal(session.result.minutes, original.minutes);
  assert.equal(session.result.setup, true);
  assert.equal(session.result.tradeIn, false);
});
