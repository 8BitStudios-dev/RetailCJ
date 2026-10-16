'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {makeEnvironment} = require('./environment.cjs');

const CAREER_KEY = 'plgame.career.v1';
const plain = value => JSON.parse(JSON.stringify(value));
const saved = env => JSON.parse(env.storage.get(CAREER_KEY));
const checkpoint = extra => ({version: 2, day: 7, phase: 'start', tutorialShifts: 0,
  profile: {tier: 'S', comp: 0, mot: 65, stress: 20}, ...extra});

function resume(snapshot) {
  const env = makeEnvironment({storage: new Map([[CAREER_KEY, JSON.stringify(snapshot)]])});
  assert.equal(env.context.__sim.resumeCareer(), true);
  return env;
}

function finishShift(env) {
  env.evaluate(`
    if (game.briefing) startDay();
    game.time = playerMode.shiftEnd() - 0.01;
    step(0.05);
  `);
  assert.equal(env.game().over, true);
  assert.equal(saved(env).phase, 'completed');
}

test('a fresh career keeps its first tutorial day across interruption, reload and an observation detour', () => {
  const env = makeEnvironment();
  env.context.__sim.selectMode('career');
  assert.equal(env.game().tutorialShifts, 0);
  assert.equal(env.view().tutorial.day, 1);
  assert.equal(saved(env).tutorialShifts, 0);
  const opening = env.storage.get(CAREER_KEY);
  env.context.__sim.selectMode('observation');
  assert.equal(env.mode(), null);
  assert.equal(env.storage.get(CAREER_KEY), opening);
  const reload = makeEnvironment({storage: new Map(env.storage)});
  assert.equal(reload.storage.get(CAREER_KEY), opening, 'Opening the app does not advance the tutorial');
  reload.context.__sim.resumeCareer();
  assert.equal(reload.game().tutorialShifts, 0);
  assert.equal(reload.view().tutorial.day, 1);
  assert.equal(saved(reload).tutorialShifts, 0);
});

test('only completed shifts advance the three tutorial days once and the fourth shift has no tutorial', () => {
  let env = resume(checkpoint());
  const focuses = [];
  for (let completed = 0; completed < 3; completed++) {
    assert.equal(env.game().tutorialShifts, completed);
    assert.equal(env.view().tutorial.day, completed + 1);
    focuses.push(env.view().tutorial.focus);
    assert.equal(saved(env).tutorialShifts, completed);
    finishShift(env);
    assert.equal(env.game().tutorialShifts, completed, 'The finished shift retains its original tutorial metadata');
    assert.equal(saved(env).tutorialShifts, completed + 1);
    env.evaluate('step(0.05); saveCareerCheckpoint("completed"); saveCareerCheckpoint("completed")');
    assert.equal(saved(env).tutorialShifts, completed + 1, 'Repeated end-of-shift checkpoints cannot skip a tutorial day');
    const completedCheckpoint = env.storage.get(CAREER_KEY);
    env = makeEnvironment({storage: new Map(env.storage)});
    assert.equal(env.storage.get(CAREER_KEY), completedCheckpoint);
    env.context.__sim.resumeCareer();
  }
  assert.equal(new Set(focuses).size, 3, 'Each tutorial day teaches a different focus');
  assert.equal(env.game().tutorialShifts, 3);
  assert.equal(saved(env).tutorialShifts, 3);
  assert.equal(env.view().tutorial, null);
  finishShift(env);
  assert.equal(saved(env).tutorialShifts, 3, 'Later careers keep the capped completed count');
});

test('imported tutorial progress follows completed shifts across the January calendar wrap', () => {
  const source = checkpoint({day: 31, tutorialShifts: 1, profile: {tier: 'S', comp: 9, mot: 65, stress: 20}});
  const env = makeEnvironment();
  const backup = env.context.PLCareerSave.exportBackup(source);
  const parsed = env.context.PLCareerSave.parseBackup(backup);
  assert.deepEqual(plain(parsed.snapshot), source);
  assert.equal(env.context.__sim.importCareer(parsed.snapshot).ok, true);
  env.context.__sim.resumeCareer();
  assert.equal(env.game().day, 31);
  assert.equal(env.view().tutorial.day, 2, 'The tutorial follows experience rather than the day of the month');
  finishShift(env);
  assert.equal(saved(env).tutorialShifts, 2);
  env.get('nextDay').click();
  assert.equal(env.game().day, 1);
  assert.equal(env.game().tutorialShifts, 2);
  assert.equal(env.view().tutorial.day, 3);
  assert.equal(saved(env).tutorialShifts, 2, 'The calendar wrap cannot restart the tutorial');
});

test('legacy early checkpoints resume the corresponding tutorial while advanced careers stay outside it', () => {
  for (const [day, phase, tier, comp, completed] of [
    [7, 'start', 'S', 0, 0], [8, 'start', 'S', 10, 1], [8, 'completed', 'S', 10, 2],
    [9, 'completed', 'S', 5, 3], [14, 'start', 'S', 10, 3], [7, 'start', 'S', 44, 3], [7, 'start', 'E', 0, 3],
  ]) {
    const legacy = {version: 2, day, phase, profile: {tier, comp, mot: 65, stress: 20}};
    const env = resume(legacy);
    assert.equal(env.game().tutorialShifts, completed, `${tier} day ${day} ${phase}`);
    assert.equal(saved(env).tutorialShifts, completed);
    if (tier === 'S' && completed < 3) assert.equal(env.view().tutorial.day, completed + 1);
    else assert.equal(env.view().tutorial, null);
    assert.equal(env.mode().player().stats.comp, comp, 'Migration does not alter earned competence');
  }
});

test('promotion and mode changes preserve the tutorial counter without restoring Specialist guidance', () => {
  const env = resume(checkpoint({tutorialShifts: 1, profile: {tier: 'S', comp: 100, mot: 65, stress: 20}}));
  env.evaluate('startDay(); game.time = OPEN');
  assert.equal(env.context.__sim.promoteCareer(), true);
  assert.equal(env.mode().player().tier, 'E');
  assert.equal(env.view().tutorial, null);
  assert.equal(saved(env).tutorialShifts, 1);
  finishShift(env);
  assert.equal(saved(env).tutorialShifts, 2);
  env.evaluate('saveCareerCheckpoint("completed")');
  assert.equal(saved(env).tutorialShifts, 2);
  const progress = env.storage.get(CAREER_KEY);
  env.context.__sim.selectMode('observation');
  assert.equal(env.mode(), null);
  assert.equal(env.storage.get(CAREER_KEY), progress);
  env.context.__sim.resumeCareer();
  assert.equal(env.mode().player().tier, 'E');
  assert.equal(env.game().tutorialShifts, 2);
  assert.equal(env.view().tutorial, null);
  assert.equal(saved(env).tutorialShifts, 2);
});
