(function (root) {
  'use strict';

  const key = 'plgame.career.v1';
  const modeKey = 'plgame.mode';
  let storageAvailable = true;

  function valid(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Number.isInteger(snapshot.day) ||
        snapshot.day < 1 || snapshot.day > 31 || !['start', 'completed'].includes(snapshot.phase)) return false;
    const profile = snapshot.profile;
    return profile && ['mot', 'stress', 'comp'].every(name =>
      typeof profile[name] === 'number' && Number.isFinite(profile[name]) &&
      profile[name] >= 0 && profile[name] <= (name === 'comp' ? 75 : 100));
  }

  function copy(snapshot) {
    return { version: 1, day: snapshot.day, phase: snapshot.phase,
      profile: { mot: snapshot.profile.mot, stress: snapshot.profile.stress, comp: snapshot.profile.comp } };
  }

  function read(storageKey) {
    try { return root.localStorage.getItem(storageKey); }
    catch (error) { storageAvailable = false; return null; }
  }

  function write(storageKey, value) {
    try { root.localStorage.setItem(storageKey, value); return true; }
    catch (error) { storageAvailable = false; return false; }
  }

  root.PLCareerSave = {
    key,
    load() {
      const saved = read(key);
      if (!saved) return null;
      try {
        const snapshot = JSON.parse(saved);
        return valid(snapshot) ? copy(snapshot) : null;
      } catch (error) { return null; }
    },
    save(snapshot) { return Boolean(valid(snapshot)) && write(key, JSON.stringify(copy(snapshot))); },
    clear() {
      try { root.localStorage.removeItem(key); return true; }
      catch (error) { storageAvailable = false; return false; }
    },
    available() { return storageAvailable; },
    loadMode() {
      const mode = read(modeKey);
      return ['career', 'observation'].includes(mode) ? mode : null;
    },
    saveMode(mode) { return ['career', 'observation'].includes(mode) && write(modeKey, mode); },
  };
})(window);
