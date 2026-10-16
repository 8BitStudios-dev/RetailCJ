'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function unit() {
  const storage = new Map();
  const context = { TextEncoder, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } };
  context.window = context;
  vm.createContext(context);
  for (const file of ['career-progression.js', 'career-save.js', 'career-interaction.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, {filename: file});
  }
  return { progression: context.PLCareerProgression, save: context.PLCareerSave,
    interaction: context.PLCareerInteraction, storage };
}

const plain = value => JSON.parse(JSON.stringify(value));
const profile = extra => ({tier: 'S', comp: 0, mot: 65, stress: 20, ...extra});
const snapshot = extra => ({version: 2, day: 7, phase: 'start', profile: profile(), ...extra});
const customer = () => ({id: 102, kind: 'buy', product: 'ipad', hurry: 0, familiarity: 0,
  need: {who: 'studia', says: 'Prendo appunti a lezione.', feature: 'gli appunti e la scrittura', acc: 'una tastiera compatibile'}});
const decisions = ['welcome', 'discover', 'relevant', 'respond', 'complete'];

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

function play(session) {
  for (const action of decisions) {
    const question = session.view();
    const choice = question.options.find(item => item.id.endsWith('-' + action));
    assert.equal(session.choose(choice.id, question.token).accepted, true);
  }
  assert.equal(session.complete, true);
  return plain(session.result);
}

test('the first three Specialist shifts have staged guidance and progressively lighter protection', () => {
  const {progression} = unit();
  const stages = [0, 1, 2].map(done => progression.tutorial(done, profile({comp: 90})));
  assert.deepEqual(stages.map(stage => stage.day), [1, 2, 3]);
  assert.deepEqual(stages.map(stage => stage.workStressMultiplier), [0.55, 0.75, 0.9]);
  assert.deepEqual(stages.map(stage => stage.decisionStressMultiplier), [0.15, 0.25, 0.4]);
  assert.deepEqual(stages.map(stage => stage.errorStressMultiplier), [0.45, 0.65, 0.85]);
  assert.match(stages[0].focus, /bisogno/);
  assert.match(stages[1].focus, /accessori/);
  assert.match(stages[2].focus, /ritmo.*servizi.*chiusura/);
  assert.equal(new Set(stages.map(stage => stage.title)).size, 3);
  assert.ok(stages.every(stage => stage.leadMessage.length > 70));
  stages[0].title = 'Changed by a consumer';
  assert.notEqual(progression.tutorial(0, profile()).title, stages[0].title, 'Returned metadata never changes the next visit');
  for (const done of [-1, 1.5, 3, 4, NaN, undefined]) assert.equal(progression.tutorial(done, profile()), null);
  for (const tier of ['E', 'P', 'L', 'unknown']) assert.equal(progression.tutorial(0, profile({tier})), null);
});

test('tutorial progress prefers explicit completed shifts and infers only the small early legacy window', () => {
  const {progression} = unit();
  for (let done = 0; done <= 3; done++) {
    assert.equal(progression.tutorialProgress(snapshot({day: 21, tutorialShifts: done, profile: profile({tier: 'P', comp: 90})})), done);
  }
  for (const day of [7, 8, 9]) for (const phase of ['start', 'completed']) {
    const input = freeze(snapshot({day, phase, profile: profile({comp: 24.99})}));
    const before = JSON.stringify(input);
    assert.equal(progression.tutorialProgress(input), Math.min(3, day - 7 + (phase === 'completed' ? 1 : 0)));
    assert.equal(JSON.stringify(input), before);
    assert.equal(Object.hasOwn(input, 'tutorialShifts'), false);
  }
  for (const input of [null, snapshot({day: 6}), snapshot({day: 10}), snapshot({phase: 'invalid'}),
    snapshot({profile: profile({comp: 25})}), snapshot({profile: profile({comp: -1})}),
    snapshot({profile: profile({tier: 'E'})})]) assert.equal(progression.tutorialProgress(input), 3);
});

test('optional tutorial progress survives storage and a backup round trip without changing legacy save shapes', () => {
  const {save, storage} = unit();
  const legacy = freeze(snapshot());
  assert.deepEqual(plain(save.normalize(legacy)), legacy);
  assert.equal(Object.hasOwn(save.normalize(legacy), 'tutorialShifts'), false);
  const versionOne = {version: 1, day: 7, phase: 'start', profile: {mot: 65, stress: 20, comp: 12}};
  assert.deepEqual(plain(save.normalize(versionOne)), snapshot({profile: profile({comp: 12})}));
  for (let done = 0; done <= 3; done++) {
    const input = freeze(snapshot({tutorialShifts: done}));
    assert.equal(save.save(input), true);
    assert.deepEqual(plain(save.load()), input);
    const backup = save.exportBackup(input);
    assert.equal(JSON.parse(backup).career.tutorialShifts, done);
    const parsed = save.parseBackup(backup);
    assert.equal(parsed.ok, true);
    assert.deepEqual(plain(parsed.snapshot), input);
  }
  assert.equal(storage.size, 1, 'Progress uses the existing career record, without an extra storage key');
});

test('invalid tutorial backup metadata is rejected without replacing a valid saved career', () => {
  const {save, storage} = unit();
  const original = snapshot({tutorialShifts: 1});
  assert.equal(save.save(original), true);
  const before = storage.get(save.key);
  for (const tutorialShifts of [-1, 4, 0.5, '1', null, true, [], {}, NaN, Infinity]) {
    const input = snapshot({tutorialShifts});
    assert.equal(save.normalize(input), null);
    assert.equal(save.save(input), false);
    assert.equal(save.exportBackup(input), null);
    const backup = JSON.stringify({format: 'RetailCJ.career', version: 2, career: input});
    assert.equal(save.parseBackup(backup).ok, false);
    assert.equal(storage.get(save.key), before);
  }
});

test('the gentler error curve decreases continuously across promotions and never falls below eight', () => {
  const {progression} = unit();
  assert.equal(progression.errorStress(profile()), 25);
  for (const [tier, next] of [['S', 'E'], ['E', 'P'], ['P', 'L']]) {
    assert.equal(progression.errorStress(profile({tier, comp: 100})), progression.errorStress(profile({tier: next, comp: 0})));
  }
  let previous = Infinity;
  for (const tier of ['S', 'E', 'P', 'L']) for (const comp of [0, 25, 50, 75, 100]) {
    const amount = progression.errorStress(profile({tier, comp}));
    assert.ok(amount <= previous && amount >= 8 && amount <= 25);
    previous = amount;
  }
  assert.equal(progression.errorStress(profile({tier: 'L', comp: 100})), 8);
});

test('an active tutorial keeps all five decisions guided and untimed even after reaching higher competence', () => {
  const {progression, interaction} = unit();
  const p = freeze(profile({comp: 85})), c = freeze(customer());
  const baseline = play(interaction.create(c, p));
  const firstHints = [];
  for (let day = 1; day <= 3; day++) {
    const tutorial = freeze(progression.tutorial(day - 1, p));
    const before = JSON.stringify({tutorial, p, c});
    const session = interaction.create(c, p, freeze({tutorial}));
    firstHints.push(session.view().hint);
    for (const action of decisions) {
      const q = session.view();
      assert.equal(q.guided, true);
      assert.equal(q.secondsLeft, null); assert.equal(q.secondsTotal, null);
      assert.deepEqual(plain(q.tutorial), plain(tutorial));
      assert.equal(q.options.filter(option => option.recommended).length, 1);
      assert.ok(q.hint.length > q.options.find(option => option.recommended).detail.length);
      q.tutorial.title = 'Changed externally';
      assert.equal(session.view().tutorial.title, tutorial.title);
      assert.equal(session.tick(1000), null);
      assert.equal(session.view().token, q.token, 'The tutorial never chooses a phase on the player’s behalf');
      const option = q.options.find(item => item.id.endsWith('-' + action));
      assert.equal(session.choose(option.id, q.token).accepted, true);
    }
    assert.equal(session.complete, true);
    assert.deepEqual(plain(session.result), baseline, 'Guidance alone changes neither work time nor outcomes');
    assert.equal(JSON.stringify({tutorial, p, c}), before);
  }
  assert.equal(new Set(firstHints).size, 3, 'The three shifts give different learning priorities');
});

test('absent or invalid tutorial metadata preserves the normal competence-based timer', () => {
  const {interaction} = unit();
  for (const options of [undefined, null, {}, {tutorial: null}, {tutorial: {day: 0}}, {tutorial: {day: 4}}]) {
    const session = interaction.create(customer(), profile({comp: 85}), options);
    assert.equal(session.view().guided, false);
    assert.equal(session.view().secondsLeft, 18);
    assert.equal(session.view().tutorial, null);
  }
  assert.equal(interaction.create(customer(), profile()).view().guided, true);
});
