(function (root) {
  'use strict';

  const key = 'plgame.career.v1';
  const modeKey = 'plgame.mode';
  const backupFormat = 'RetailCJ.career';
  const maxBackupBytes = 64 * 1024;
  let storageAvailable = true;

  function normalize(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) ||
        ![1, 2].includes(snapshot.version) || !Number.isInteger(snapshot.day) ||
        snapshot.day < 1 || snapshot.day > 31 || !['start', 'completed'].includes(snapshot.phase)) return null;
    const profile = snapshot.profile;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
        !['mot', 'stress', 'comp'].every(name =>
      typeof profile[name] === 'number' && Number.isFinite(profile[name]) &&
      profile[name] >= 0 && profile[name] <= (name === 'comp' && snapshot.version === 1 ? 75 : 100))) return null;
    const tier = snapshot.version === 1 ? 'S' : profile.tier;
    if (!['S', 'E', 'P', 'L'].includes(tier)) return null;
    const career = { version: 2, day: snapshot.day, phase: snapshot.phase,
      profile: { mot: profile.mot, stress: profile.stress, comp: profile.comp, tier } };
    if (snapshot.shiftHours !== undefined) {
      const maxHours = tier === 'S' ? 4 : tier === 'E' ? 6 : 8;
      if (![4, 6, 8].includes(snapshot.shiftHours) || snapshot.shiftHours > maxHours) return null;
      career.shiftHours = snapshot.shiftHours;
    }
    return career;
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
    maxBackupBytes,
    normalize,
    exportBackup(snapshot) {
      const career = normalize(snapshot);
      if (!career) return null;
      return JSON.stringify({ format: backupFormat, version: 2, career }, null, 2);
    },
    parseBackup(text) {
      if (typeof text !== 'string' || new TextEncoder().encode(text).length > maxBackupBytes) {
        return { ok: false, error: 'Il file è troppo grande. Scegli un backup Carriera di massimo 64 KB.' };
      }
      let backup;
      try { backup = JSON.parse(text); }
      catch (error) { return { ok: false, error: 'Il file non contiene un JSON valido.' }; }
      const career = backup && normalize(backup.career);
      if (!backup || backup.format !== backupFormat || ![1, 2].includes(backup.version) ||
          !backup.career || backup.career.version !== backup.version || !career) {
        return { ok: false, error: 'Il file non è un backup Carriera compatibile con RetailCJ.' };
      }
      return { ok: true, snapshot: career };
    },
    load() {
      const saved = read(key);
      if (!saved) return null;
      try {
        return normalize(JSON.parse(saved));
      } catch (error) { return null; }
    },
    save(snapshot) {
      const career = normalize(snapshot);
      return Boolean(career) && write(key, JSON.stringify(career));
    },
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
