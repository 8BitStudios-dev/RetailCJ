(function (root) {
  'use strict';

  const roles = Object.freeze([
    Object.freeze({ tier: 'S', label: 'Specialist' }),
    Object.freeze({ tier: 'E', label: 'Expert' }),
    Object.freeze({ tier: 'P', label: 'Pro' }),
    Object.freeze({ tier: 'L', label: 'Lead' }),
  ]);

  function role(tier) {
    return roles.find(item => item.tier === tier) || null;
  }

  function view(profile) {
    const current = role(profile && profile.tier);
    const selected = current || roles[0];
    const index = roles.indexOf(selected);
    const value = profile && Number.isFinite(profile.comp) ? profile.comp : 0;
    const progress = Math.max(0, Math.min(100, value));
    const nextRole = roles[index + 1] || null;
    return {
      tier: selected.tier, role: selected.label, index, progress, max: 100, nextRole,
      canPromote: Boolean(current && nextRole && value >= 100),
      complete: Boolean(current && !nextRole && value >= 100),
    };
  }

  function promote(profile) {
    const career = view(profile);
    if (!career.canPromote) return false;
    profile.tier = career.nextRole.tier;
    profile.comp = 0;
    return true;
  }

  function learningTime(profile) {
    const career = view(profile);
    return Math.max(0.8, 2.2 - 0.35 * (career.index + career.progress / career.max));
  }

  function learningRate(profile) {
    const stress = profile && Number.isFinite(profile.stress) ? Math.max(0, Math.min(100, profile.stress)) : 0;
    return 1 - 0.0075 * stress;
  }

  function errorStress(profile) {
    const career = view(profile);
    return Math.max(12, 55 - 12 * (career.index + career.progress / career.max));
  }

  function contract(profile) {
    const career = view(typeof profile === 'string' ? { tier: profile } : profile);
    const hours = career.index === 0 ? 4 : career.index === 1 ? 6 : 8;
    return { weeklyHours: hours * 5, hours };
  }

  function nextWorkday(day) {
    let next = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 0;
    do {
      next = next % 31 + 1;
    } while ([1, 2].includes(new Date(2027, 0, next).getDay()));
    return next;
  }

  root.PLCareerProgression = { roles, role, view, promote, learningTime, learningRate, errorStress, contract, nextWorkday };
})(window);
