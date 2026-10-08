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

  root.PLCareerProgression = { roles, role, view, promote };
})(window);
