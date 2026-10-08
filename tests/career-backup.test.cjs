'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const LEVELS_KEY = 'plgame.levels';
const MAX_BYTES = 64 * 1024;
const learned = {comp: 44, mot: 63, stress: 21};

function snapshot(overrides = {}) {
  return {version: 1, day: 14, phase: 'start', profile: {...learned}, ...overrides};
}

function envelope(career, overrides = {}) {
  return {format: 'RetailCJ.career', version: 1, career, ...overrides};
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function api(env) { return env.context.PLCareerSave; }
function load(env) { return plain(api(env).load()); }
function backup(env, value = snapshot()) { return api(env).exportBackup(value); }
function importCareer(env, value) { return plain(env.context.__sim.importCareer(value)); }

function profile(env) {
  const {comp, mot, stress} = env.mode().player().stats;
  return {comp, mot, stress};
}

function activeCareer(options = {}) {
  const value = snapshot({day: 18});
  const storage = new Map([[CAREER_KEY, JSON.stringify(value)], [LEVELS_KEY, '{"0":{"stars":2,"value":65}}']]);
  const env = makeEnvironment({storage, ...options});
  env.evaluate(`
    window.__sim.resumeCareer(); startDay(); game.time = OPEN;
    const fixtureClient = spawnCustomer('buy', {product: 'iphone', fast: true, setup: null,
      finance: false, tradeIn: false, familiarity: 0, hurry: 0, mood: 80});
    game.lineIn = game.lineIn.filter(item => item !== fixtureClient);
    const fixtureSlot = SLOTS.find(item => !item.taken && item.table.product === fixtureClient.product);
    fixtureSlot.taken = fixtureClient; fixtureClient.slot = fixtureSlot;
    fixtureClient.x = fixtureSlot.x; fixtureClient.y = fixtureSlot.y;
    fixtureClient.state = 'waiting'; fixtureClient.path = []; fixtureClient.wait = 0;
    fixtureClient.tQueue = game.time; fixtureClient.patience = 1000; fixtureClient.exp = 90;
    playerMode.takeNext();
    bump(playerMode.player(), 'comp', 7);
    window.__sim.showModes();
  `);
  return {env, value, game: env.game(), player: env.mode().player(), client: env.mode().player().customer};
}

function assertVisitPreserved(fixture) {
  const {env, game, player, client} = fixture;
  assert.equal(env.game(), game);
  assert.equal(env.mode().player(), player);
  assert.equal(player.customer, client);
  assert.equal(client.staff, player);
  assert.equal(profile(env).comp, 51);
}

async function chooseFile(env, text, overrides = {}) {
  const input = env.get('careerImportFile');
  let reads = 0;
  const file = {name: 'retailcj-carriera.json', size: Buffer.byteLength(text),
    async text() { reads++; return text; }, ...overrides};
  input.files = [file];
  await input.dispatchAsync('change');
  return {reads, file};
}

test('export and parse round-trip both checkpoint phases with an independent validated profile', () => {
  const env = makeEnvironment();
  for (const phase of ['start', 'completed']) {
    const value = snapshot({phase});
    const text = backup(env, value);
    assert.equal(typeof text, 'string');
    assert.deepEqual(JSON.parse(text), envelope(value));
    const result = plain(api(env).parseBackup(text));
    assert.deepEqual(result, {ok: true, snapshot: value});
    value.profile.comp = 1;
    assert.equal(result.snapshot.profile.comp, learned.comp, 'The backup does not retain the source object');
    result.snapshot.profile.mot = 1;
    assert.equal(plain(api(env).parseBackup(text)).snapshot.profile.mot, learned.mot);
  }
});

test('incompatible, malformed and invalid profile backups return an error rather than a career', () => {
  const env = makeEnvironment();
  const invalid = [
    '{bad JSON', 'null', '[]', '{}',
    JSON.stringify(snapshot()),
    JSON.stringify(envelope(snapshot(), {format: 'SomeOtherGame'})),
    JSON.stringify(envelope(snapshot(), {version: 2})),
    JSON.stringify(envelope(snapshot({version: 2}))),
    JSON.stringify(envelope(snapshot({day: 32}))),
    JSON.stringify(envelope(snapshot({phase: 'live'}))),
    JSON.stringify(envelope(snapshot({profile: {comp: 76, mot: 63, stress: 21}}))),
    JSON.stringify(envelope(snapshot({profile: {comp: 44, mot: 101, stress: 21}}))),
    JSON.stringify(envelope(snapshot({profile: {comp: 44, mot: 63, stress: -1}}))),
    JSON.stringify(envelope(snapshot({profile: {comp: '44', mot: 63, stress: 21}}))),
    JSON.stringify(envelope(snapshot({profile: {comp: 44, mot: 63}}))),
  ];
  for (const text of invalid) {
    const result = api(env).parseBackup(text);
    assert.equal(result.ok, false, text);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 0);
    assert.equal(result.snapshot, undefined);
  }
});

test('backup limits are enforced in UTF-8 bytes while a valid exact-limit backup is accepted', () => {
  const env = makeEnvironment();
  const text = backup(env);
  const exact = text.padEnd(MAX_BYTES, ' ');
  assert.equal(Buffer.byteLength(exact), MAX_BYTES);
  assert.equal(api(env).parseBackup(exact).ok, true);
  assert.equal(api(env).parseBackup(exact + ' ').ok, false);
  const multibyte = JSON.stringify(envelope(snapshot(), {extra: 'é'.repeat(MAX_BYTES / 2)}));
  assert.ok(multibyte.length < MAX_BYTES);
  assert.ok(Buffer.byteLength(multibyte) > MAX_BYTES);
  const rejected = api(env).parseBackup(multibyte);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /64|grande|dimension/i);
});

test('export refuses invalid or non-finite profiles and creates no storage side effects', () => {
  const env = makeEnvironment();
  for (const value of [null, {}, snapshot({version: 2}), snapshot({day: 0}),
    snapshot({profile: {...learned, comp: NaN}}), snapshot({profile: {...learned, mot: Infinity}})]) {
    assert.equal(backup(env, value), null);
  }
  assert.equal(load(env), null);
  assert.equal(env.downloads.length, 0);
});

test('the backup UI allows import without a checkpoint and disables export', () => {
  const env = makeEnvironment();
  assert.ok(env.get('careerExport'));
  assert.equal(env.get('careerExport').disabled, true);
  assert.equal(env.get('careerImport').disabled, false);
  env.get('careerExport').click();
  assert.equal(env.downloads.length, 0);
  env.get('careerImport').click();
  assert.equal(env.get('careerImportFile').clickCount, 1);
});

test('the export button downloads the last checkpoint without changing an active visit or live gains', async () => {
  const fixture = activeCareer();
  const {env, value} = fixture;
  assert.equal(env.get('careerExport').disabled, false);
  const levels = env.storage.get(LEVELS_KEY);
  env.get('careerExport').click();
  assert.equal(env.downloads.length, 1);
  const download = env.downloads[0];
  assert.match(download.filename, /\.json$/i);
  assert.ok(download.blob);
  assert.deepEqual(JSON.parse(await download.blob.text()), envelope(value));
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
  assert.equal(env.storage.get(LEVELS_KEY), levels);
});

test('importing either checkpoint phase saves it without starting and round-trips across a new session', () => {
  for (const phase of ['start', 'completed']) {
    const storage = new Map();
    const env = makeEnvironment({storage});
    const value = snapshot({day: 24, phase});
    const game = env.game();
    let confirmations = 0;
    env.context.confirm = () => { confirmations++; return false; };
    assert.deepEqual(importCareer(env, value), {ok: true});
    assert.equal(confirmations, 0, 'The first imported checkpoint needs no replacement confirmation');
    assert.equal(env.game(), game, 'Import does not start a new shift');
    assert.deepEqual(load(env), value);
    assert.equal(env.get('careerResumeCard').hidden, false);
    assert.equal(env.get('careerExport').disabled, false);

    const second = makeEnvironment({storage});
    second.get('modeResumeCareer').click();
    const expected = phase === 'completed'
      ? {comp: learned.comp - 0.2, mot: learned.mot + (60 - learned.mot) * 0.15, stress: learned.stress * 0.7}
      : learned;
    assert.equal(second.game().day, phase === 'completed' ? 25 : 24);
    assert.deepEqual(profile(second), expected);
    const third = makeEnvironment({storage});
    third.get('modeResumeCareer').click();
    assert.equal(third.game().day, second.game().day);
    assert.deepEqual(profile(third), expected, 'Import and reload apply overnight recovery only once');
  }
});

test('an accepted replacement import updates the checkpoint while preserving the current live visit', () => {
  const fixture = activeCareer();
  const {env} = fixture;
  const replacement = snapshot({day: 27, profile: {comp: 61, mot: 80, stress: 12}});
  let confirmation = '';
  env.context.confirm = message => { confirmation = message; return true; };
  assert.deepEqual(importCareer(env, replacement), {ok: true});
  assert.match(confirmation, /salvataggio.*sostituit|sostitui/i);
  assert.deepEqual(load(env), replacement);
  assertVisitPreserved(fixture);
  assert.equal(env.get('introBack').hidden, true, 'The old live shift cannot overwrite the newly imported checkpoint');
  env.get('modeResumeCareer').click();
  assert.equal(env.game().day, 27);
  assert.deepEqual(profile(env), replacement.profile);
  assert.equal(env.mode().player().customer, null);
});

test('invalid imports are rejected before confirmation without altering a checkpoint or active visit', () => {
  const fixture = activeCareer();
  const {env, value} = fixture;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  const result = importCareer(env, snapshot({profile: {...learned, comp: 76}}));
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.equal(confirmations, 0);
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
});

test('cancelled imports preserve both the saved checkpoint and the current live visit', () => {
  const fixture = activeCareer();
  const {env, value} = fixture;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return false; };
  const result = importCareer(env, snapshot({day: 25}));
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.equal(confirmations, 1);
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
});

test('a failed import storage write preserves the previous checkpoint, live visit and legacy levels', () => {
  const fixture = activeCareer({storageError: 'write'});
  const {env, value} = fixture;
  env.context.confirm = () => true;
  const levels = env.storage.get(LEVELS_KEY);
  const result = importCareer(env, snapshot({day: 25}));
  assert.equal(result.ok, false);
  assert.ok(result.error);
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
  assert.equal(env.storage.get(LEVELS_KEY), levels);
});

test('the asynchronous file picker imports a completed backup and reports success without starting', async () => {
  const env = makeEnvironment();
  const game = env.game();
  const value = snapshot({day: 23, phase: 'completed'});
  const {reads} = await chooseFile(env, backup(env, value));
  assert.equal(reads, 1);
  assert.deepEqual(load(env), value);
  assert.equal(env.game(), game);
  assert.equal(env.get('careerResumeCard').hidden, false);
  assert.ok(env.get('careerBackupStatus').textContent.length > 0);
});

test('returning to the old live shift is blocked during file reading and after a successful import', async () => {
  const fixture = activeCareer();
  const {env} = fixture;
  const replacement = snapshot({day: 25});
  env.context.confirm = () => true;
  let finishRead;
  const text = new Promise(resolve => { finishRead = resolve; });
  const input = env.get('careerImportFile');
  input.files = [{name: 'carriera.json', size: 512, text: () => text}];
  const pending = input.dispatchAsync('change');
  assert.equal(env.get('introBack').disabled, true);
  for (const id of ['modeResumeCareer', 'modeCareer', 'modeObservation', 'careerExport', 'careerImport']) {
    assert.equal(env.get(id).disabled, true, id + ' cannot change the career while a backup is being read');
  }
  env.get('introBack').click();
  assert.equal(env.get('intro').classList.contains('show'), true);
  assertVisitPreserved(fixture);
  finishRead(backup(env, replacement));
  await pending;
  assert.deepEqual(load(env), replacement);
  assertVisitPreserved(fixture);
  assert.equal(env.get('introBack').hidden, true);
  for (const id of ['modeResumeCareer', 'modeCareer', 'modeObservation', 'careerExport', 'careerImport']) {
    assert.equal(env.get(id).disabled, false, id + ' is available after the import finishes');
  }
});

test('the picker rejects oversized, malformed and unreadable files without changing a live career', async () => {
  const fixture = activeCareer();
  const {env, value} = fixture;
  let confirmations = 0;
  env.context.confirm = () => { confirmations++; return true; };
  const oversized = await chooseFile(env, backup(env, snapshot({day: 25})), {size: MAX_BYTES + 1});
  assert.equal(oversized.reads, 0, 'Oversized files are rejected before reading their contents');
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
  assert.ok(env.get('careerBackupStatus').textContent.length > 0);

  await chooseFile(env, '{invalid JSON');
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
  await chooseFile(env, '{}', {async text() { throw new Error('File unavailable'); }});
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
  assert.equal(confirmations, 0);
  assert.ok(env.get('careerBackupStatus').textContent.length > 0);
});

test('cancelling the native file picker leaves the checkpoint and live visit intact', async () => {
  const fixture = activeCareer();
  const {env, value} = fixture;
  env.get('careerImportFile').files = [];
  await env.get('careerImportFile').dispatchAsync('change');
  assert.deepEqual(load(env), value);
  assertVisitPreserved(fixture);
});
