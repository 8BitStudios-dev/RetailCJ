'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const roles = [
  {tier: 'S', label: 'Specialist'}, {tier: 'E', label: 'Expert'},
  {tier: 'P', label: 'Pro'}, {tier: 'L', label: 'Lead'},
];
const plain = value => JSON.parse(JSON.stringify(value));
function checkpoint(tier = 'S', comp = 37.5, phase = 'start') {
  return {version: 2, day: 17, phase, profile: {mot: 65, stress: 20, comp, tier}};
}
function save(env) { return plain(env.context.PLCareerSave.load()); }
function ready() {
  const env = makeEnvironment();
  env.evaluate(`
    window.__sim.selectMode('career'); startDay();
    game.arrivals = []; game.sessions = []; game.customers = [];
    game.lineIn = []; game.lineGB = []; game.lineEx = [];
    game.time = OPEN; game.weather = 'sole'; Math.random = () => 0.5;
  `);
  return env;
}
function client(env, extra = {}) {
  return env.evaluate(`(() => {
    const settings = ${JSON.stringify({product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80, ...extra})};
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
    c.path = []; c.patience = 1000; c.wait = 0; c.tQueue = game.time; c.exp = 90;
    return c;
  })()`);
}
function until(env, condition, limit = 240) {
  for (let elapsed = 0; elapsed < limit; elapsed += 0.05) {
    if (env.evaluate(condition)) return;
    env.advance(0.05);
  }
  assert.fail('Simulation did not reach: ' + condition + ' (state ' + env.mode().player().state + ')');
}
function competence(env) { return env.mode().player().stats.comp; }
function setProgress(env, comp) { env.mode().player().stats.comp = comp; env.evaluate('updatePanel()'); }

test('a new career starts as Specialist with zero competence on the full 100-point scale', () => {
  const env = makeEnvironment();
  env.evaluate("window.__sim.selectMode('career')");
  assert.equal(competence(env), 0);
  assert.equal(env.mode().player().stats.cap, 100);
  assert.equal(env.mode().player().tier, 'S');
  assert.equal(env.view().role, 'Specialist');
  assert.equal(env.view().energy.competence, 0);
  assert.deepEqual(env.view().career, {tier: 'S', role: 'Specialist', index: 0,
    progress: 0, max: 100, nextRole: roles[1], canPromote: false, complete: false});
  assert.deepEqual(save(env), {...checkpoint('S', 0), day: 7});
});

test('100 is an exact promotion threshold and each new sales role restarts at zero', () => {
  const env = makeEnvironment();
  const progression = env.context.PLCareerProgression;
  assert.deepEqual(plain(progression.roles), roles);
  assert.equal(progression.role('unknown'), null);
  const profile = {tier: 'S', comp: 99.99, mot: 65, stress: 20};
  assert.equal(progression.view(profile).canPromote, false);
  assert.equal(progression.promote(profile), false);
  assert.equal(profile.tier, 'S');
  for (let index = 1; index < roles.length; index++) {
    profile.comp = 100;
    assert.equal(progression.view(profile).canPromote, true);
    assert.deepEqual(plain(progression.view(profile).nextRole), roles[index]);
    assert.equal(progression.promote(profile), true);
    assert.deepEqual(profile, {tier: roles[index].tier, comp: 0, mot: 65, stress: 20});
    assert.equal(progression.promote(profile), false, 'A repeated request cannot skip another role');
  }
  assert.equal(progression.view(profile).nextRole, null);
  assert.equal(progression.view(profile).complete, false);
  profile.comp = 100;
  assert.equal(progression.view(profile).complete, true);
  assert.equal(progression.view(profile).canPromote, false);
  assert.equal(progression.promote(profile), false);
  assert.equal(profile.tier, 'L');
  assert.equal(profile.comp, 100);
});

test('invalid or non-finite progress never grants a promotion', () => {
  const progression = makeEnvironment().context.PLCareerProgression;
  for (const profile of [{tier: 'other', comp: 100}, {tier: 'S', comp: NaN},
    {tier: 'S', comp: Infinity}, {tier: 'S', comp: -1}, {tier: 'S', comp: '100'}]) {
    assert.equal(progression.view(profile).canPromote, false);
    assert.equal(progression.promote(profile), false);
  }
});

test('manual promotions preserve actual staff tier across new days and cannot skip roles', () => {
  const env = ready();
  for (const {tier, label} of roles.slice(1)) {
    setProgress(env, 100);
    assert.equal(env.evaluate('window.__sim.promoteCareer()'), true);
    assert.equal(env.mode().player().tier, tier);
    assert.equal(env.mode().player().stats.tier, tier);
    assert.equal(env.view().role, label);
    assert.equal(competence(env), 0);
    assert.equal(env.evaluate('window.__sim.promoteCareer()'), false);
    env.evaluate('newDay(game.day + 1)');
    assert.equal(env.mode().player().tier, tier);
    assert.equal(env.mode().player().stats.tier, tier);
    assert.equal(env.view().role, label);
  }
  setProgress(env, 100);
  assert.equal(env.evaluate('window.__sim.promoteCareer()'), false);
  assert.equal(env.view().career.complete, true);
});

test('a promotion is blocked during an active visit and a delivered follow-up', () => {
  const env = ready();
  const c = client(env, {setup: 'transfer'});
  env.context.testClient = c;
  env.mode().takeNext();
  setProgress(env, 100);
  assert.equal(env.view().career.canPromote, false);
  assert.equal(env.evaluate('window.__sim.promoteCareer()'), false);
  until(env, "testClient.state === 'toSetup' || testClient.state === 'setup'");
  assert.equal(env.mode().player().customer, null);
  assert.ok(env.view().active, 'The completed product handover still has a personal follow-up');
  assert.equal(env.view().career.canPromote, false);
  assert.equal(env.evaluate('window.__sim.promoteCareer()'), false);
  until(env, "testClient.outcome === 'bought'");
  assert.equal(env.view().career.canPromote, true);
  assert.equal(env.evaluate('window.__sim.promoteCareer()'), true);
  assert.equal(env.view().role, 'Expert');
});

test('a product handover learns four points only after the real visit concludes, once', () => {
  const env = ready();
  const c = client(env, {setup: 'transfer'});
  env.context.testClient = c;
  env.mode().takeNext();
  until(env, "testClient.state === 'toSetup' || testClient.state === 'setup'");
  assert.equal(env.view().stats.sales, 1);
  assert.equal(competence(env), 0, 'An open setup has not completed its personal visit');
  until(env, "testClient.outcome === 'bought'");
  assert.equal(competence(env), 4);
  env.mode().recordLeave(c, 'bought');
  env.mode().recordLeave(c, 'bought');
  assert.equal(competence(env), 4);
});

test('real completed help and accessory visits learn three points each', () => {
  for (const kind of ['help', 'acc']) {
    const env = ready();
    const c = client(env, {kind});
    env.context.testClient = c;
    env.mode().takeNext();
    until(env, "Boolean(testClient.outcome)");
    assert.equal(c.outcome, kind === 'help' ? 'helped' : 'bought');
    assert.equal(competence(env), 3);
    env.mode().recordLeave(c, c.outcome);
    assert.equal(competence(env), 3);
  }
});

test('a real consultation without purchase learns two points and lost or interrupted visits learn zero', () => {
  const env = ready();
  const c = client(env, {fast: false});
  env.context.testClient = c;
  env.mode().takeNext();
  env.evaluate('Math.random = () => 0.999');
  until(env, "testClient.outcome === 'browsed'");
  assert.equal(competence(env), 2);
  env.mode().recordLeave(c, 'browsed');
  assert.equal(competence(env), 2);

  const lost = ready();
  const lostClient = client(lost);
  lost.context.testClient = lostClient;
  lost.mode().takeNext();
  lost.evaluate("leave(testClient, 'lost')");
  assert.equal(competence(lost), 0);
  lost.mode().recordLeave(lostClient, 'bought');
  assert.equal(competence(lost), 0);

  const unfinished = ready();
  const openClient = client(unfinished);
  unfinished.mode().takeNext();
  unfinished.evaluate('game.time = CLOSE; closeStore()');
  assert.equal(competence(unfinished), 0);
  unfinished.mode().recordLeave(openClient, 'bought');
  assert.equal(competence(unfinished), 0);
});

test('the final learning increment caps at 100 and training can reach the same promotion threshold', () => {
  const env = ready();
  const c = client(env, {kind: 'help'});
  env.context.testClient = c;
  setProgress(env, 99);
  env.mode().takeNext();
  until(env, "testClient.outcome === 'helped'");
  assert.equal(competence(env), 100);
  assert.equal(env.view().career.canPromote, true);
  const training = ready();
  setProgress(training, 99);
  training.evaluate(`(() => {
    const s = playerMode.player();
    s.state = 'training'; s.until = game.time; s.seat = {taken: s};
    updateStaff(s, 0.05);
  })()`);
  assert.equal(competence(training), 100);
  assert.equal(training.mode().player().state, 'idle');
  assert.equal(training.view().career.canPromote, true);
});

test('overnight preserves player competence while NPC competence still decays', () => {
  const env = ready();
  setProgress(env, 100);
  const npc = env.game().staff.find(person => !person.isPlayer);
  npc.stats.comp = 40; npc.stats.sick = false; npc.stats.sickTomorrow = false; npc.stats.stress = 20;
  env.evaluate('overnight({op: 0})');
  assert.equal(competence(env), 100);
  assert.equal(npc.stats.comp, 39.8);
  assert.equal(env.view().career.canPromote, true, 'Reaching 100 survives the end of a shift');
});

test('each sales role survives save, resume, new day, export and import in either checkpoint phase', () => {
  for (const {tier, label} of roles) for (const phase of ['start', 'completed']) {
    const value = checkpoint(tier, 37.5, phase);
    const storage = new Map([[CAREER_KEY, JSON.stringify(value)]]);
    const first = makeEnvironment({storage});
    assert.deepEqual(save(first), value);
    const text = first.context.PLCareerSave.exportBackup(save(first));
    assert.deepEqual(JSON.parse(text), {format: 'RetailCJ.career', version: 2, career: value});
    const parsed = plain(first.context.PLCareerSave.parseBackup(text));
    assert.deepEqual(parsed, {ok: true, snapshot: value});
    const second = makeEnvironment();
    assert.deepEqual(plain(second.context.__sim.importCareer(parsed.snapshot)), {ok: true});
    assert.equal(second.context.__sim.resumeCareer(), true);
    assert.equal(second.game().day, phase === 'completed' ? 18 : 17);
    assert.equal(second.mode().player().tier, tier);
    assert.equal(second.mode().player().stats.tier, tier);
    assert.equal(second.view().role, label);
    assert.equal(competence(second), 37.5);
    second.evaluate('newDay(game.day + 1)');
    assert.equal(second.mode().player().tier, tier);
    assert.equal(second.view().role, label);
    assert.equal(competence(second), 37.5);
    const third = makeEnvironment({storage: second.storage});
    third.context.__sim.resumeCareer();
    assert.equal(third.mode().player().tier, tier);
    assert.equal(competence(third), 37.5);
  }
});

test('a promotion immediately checkpoints the new role at zero before opening and after closing', () => {
  for (const phase of ['start', 'completed']) {
    const env = makeEnvironment();
    env.evaluate("window.__sim.selectMode('career')");
    if (phase === 'completed') env.evaluate('startDay(); game.time = CLOSE; closeStore()');
    setProgress(env, 100);
    assert.equal(env.context.__sim.promoteCareer(), true);
    assert.equal(env.context.__sim.promoteCareer(), false);
    assert.deepEqual(save(env), {version: 2, day: 7, phase,
      profile: {tier: 'E', comp: 0, mot: env.mode().player().stats.mot, stress: env.mode().player().stats.stress}});
    const afterReload = makeEnvironment({storage: env.storage});
    afterReload.context.__sim.resumeCareer();
    assert.equal(afterReload.game().day, phase === 'completed' ? 8 : 7);
    assert.equal(afterReload.mode().player().tier, 'E');
    assert.equal(competence(afterReload), 0);
  }
});

test('old version-one saves and backups migrate to Specialist without losing progress or modifying boot storage', () => {
  const old = {version: 1, day: 21, phase: 'start', profile: {comp: 74.75, mot: 82, stress: 13}};
  const migrated = {...old, version: 2, profile: {...old.profile, tier: 'S'}};
  const storage = new Map([[CAREER_KEY, JSON.stringify(old)]]);
  const env = makeEnvironment({storage});
  assert.deepEqual(save(env), migrated);
  assert.equal(storage.get(CAREER_KEY), JSON.stringify(old));
  const oldText = JSON.stringify({format: 'RetailCJ.career', version: 1, career: old});
  assert.deepEqual(plain(env.context.PLCareerSave.parseBackup(oldText)), {ok: true, snapshot: migrated});
  const reexported = JSON.parse(env.context.PLCareerSave.exportBackup(old));
  assert.deepEqual(reexported, {format: 'RetailCJ.career', version: 2, career: migrated});
  env.context.__sim.resumeCareer();
  assert.equal(env.game().day, 21);
  assert.equal(competence(env), 74.75);
  assert.equal(env.mode().player().tier, 'S');
  assert.deepEqual(save(env), migrated);
});

test('schema validation rejects invalid tiers, progress beyond 100 and out-of-range legacy saves', () => {
  const env = makeEnvironment();
  for (const value of [checkpoint('unknown', 100), checkpoint('S', 100.01), checkpoint('E', -1),
    {...checkpoint('S', 75.01), version: 1},
    {...checkpoint('S', 50), profile: {mot: 65, stress: 20, comp: 50}}]) {
    assert.equal(env.context.PLCareerSave.save(value), false);
    const envelope = JSON.stringify({format: 'RetailCJ.career', version: value.version, career: value});
    assert.equal(env.context.PLCareerSave.parseBackup(envelope).ok, false);
    assert.equal(save(env), null);
  }
});

test('career panels stay hidden while a separate promotion appears only at 100', () => {
  const env = ready();
  for (const comp of [0, 99.6, 99.99, 100]) {
    setProgress(env, comp);
    const careerPanel = env.get('playerPanel').querySelector('.playerCareer');
    const promotion = env.get('careerPromote');
    assert.equal(careerPanel.hidden, true);
    assert.equal(env.get('modeChoices').querySelector('.careerPath').hidden, true);
    assert.equal(careerPanel.contains(promotion), false, 'The promotion remains usable outside the hidden panel');
    assert.equal(promotion.parentElement.hidden, comp < 100);
    const bar = env.get('careerProgress');
    assert.ok(bar);
    assert.equal(bar.getAttribute('role'), 'progressbar');
    assert.equal(Number(bar.getAttribute('aria-valuemin')), 0);
    assert.equal(Number(bar.getAttribute('aria-valuemax')), 100);
    assert.equal(Number(bar.getAttribute('aria-valuenow')), comp);
    const value = env.get('playerPanel').querySelector('.playerCareerValue');
    assert.match(value.textContent, new RegExp('^' + Math.floor(comp) + ' / 100$'));
    assert.equal(env.get('careerPromote').disabled, comp < 100);
  }
  env.get('careerPromote').click();
  assert.equal(env.view().role, 'Expert');
  assert.equal(competence(env), 0);
  assert.equal(env.get('careerPromote').parentElement.hidden, true);
  assert.equal(env.get('playerPanel').querySelector('.playerCareer').hidden, true);
  env.get('careerPromote').click();
  assert.equal(env.view().role, 'Expert');
  const ladder = env.get('playerPanel').querySelectorAll('.playerCareerRole');
  assert.deepEqual(Array.from(ladder, row => row.dataset.careerTier), roles.map(role => role.tier));
  assert.equal(ladder[0].classList.contains('isDone'), true);
  assert.equal(ladder[1].classList.contains('isCurrent'), true);
});

test('an Expert or Pro player remains manual and is not automatically assigned as an NPC helper', () => {
  for (const promotedTier of ['E', 'P']) {
    const env = ready();
    while (env.mode().player().tier !== promotedTier) {
      setProgress(env, 100);
      assert.equal(env.context.__sim.promoteCareer(), true);
    }
    env.evaluate(`(() => {
      const requester = game.staff.find(s => !s.isPlayer && s.tier === 'S');
      if (!requester) throw new Error('No NPC Specialist available');
      game.staff.filter(s => !s.isPlayer && ['E', 'P'].includes(s.tier)).forEach(s => {s.hidden = true;});
      const c = spawnCustomer('buy', {familiarity: 2, hurry: 0, mood: 80});
      c.state = 'served'; c.staff = requester; requester.customer = c;
      requester.state = 'probe'; requester.t = 5; requester.path = [];
      window.testRequester = requester;
      requestExpert(requester, c);
    })()`);
    assert.equal(env.evaluate('Boolean(testRequester.expertHelp)'), false);
    assert.equal(Boolean(env.mode().player().helpRequester), false);
    assert.equal(env.mode().player().customer, null);
    assert.equal(env.mode().player().state, 'idle');
    assert.equal(competence(env), 0);
    const waiting = client(env, {kind: 'help'});
    env.evaluate('dispatch()');
    assert.equal(env.mode().player().customer, null, 'Automatic table dispatch also leaves the player available');
    assert.equal(env.mode().takeNext(), waiting);
    assert.equal(env.mode().player().customer, waiting);
  }
});

test('a failed promotion write retains the new role in memory and export preserves it for recovery', async () => {
  const value = checkpoint('S', 100);
  const storage = new Map([[CAREER_KEY, JSON.stringify(value)]]);
  const env = makeEnvironment({storage, storageError: 'write'});
  env.context.__sim.resumeCareer();
  assert.doesNotThrow(() => assert.equal(env.context.__sim.promoteCareer(), true));
  assert.equal(env.mode().player().tier, 'E');
  assert.equal(competence(env), 0);
  assert.deepEqual(save(env), value, 'The failed write preserves the old durable checkpoint');
  assert.match(env.get('playerPanel').querySelector('.playerMessage').textContent, /non.*salvat|esporta/i);
  env.context.__sim.showModes();
  env.get('careerExport').click();
  assert.equal(env.downloads.length, 1);
  const backup = JSON.parse(await env.downloads[0].blob.text());
  assert.deepEqual(backup, {format: 'RetailCJ.career', version: 2,
    career: checkpoint('E', 0)});
});
