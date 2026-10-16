(function (root) {
  'use strict';

  const roles = Object.freeze([
    Object.freeze({ tier: 'S', label: 'Specialist' }),
    Object.freeze({ tier: 'E', label: 'Expert' }),
    Object.freeze({ tier: 'P', label: 'Pro' }),
    Object.freeze({ tier: 'L', label: 'Lead' }),
  ]);
  const firstShifts = Object.freeze([
    Object.freeze({ day: 1, title: 'Primi passi sul floor', focus: 'Accogli e scopri il bisogno',
      leadMessage: 'Oggi ti accompagno nei primi passi: accogli la persona e scopri cosa vuole riuscire a fare. Una domanda semplice è un ottimo inizio.',
      workStressMultiplier: 0.55, decisionStressMultiplier: 0.15, errorStressMultiplier: 0.45 }),
    Object.freeze({ day: 2, title: 'Una soluzione pertinente', focus: 'Collega la soluzione al bisogno e valuta gli accessori',
      leadMessage: 'Ripartiamo da quello che hai ascoltato: mostra una soluzione pertinente e proponi un accessorio solo quando completa davvero l’utilizzo.',
      workStressMultiplier: 0.75, decisionStressMultiplier: 0.25, errorStressMultiplier: 0.65 }),
    Object.freeze({ day: 3, title: 'Trova il tuo ritmo', focus: 'Gestisci il ritmo, i servizi e la chiusura',
      leadMessage: 'Ora proviamo a essere più fluidi: scegli i passaggi utili, introduci i servizi pertinenti e concludi con un riepilogo chiaro, rispettando i rifiuti.',
      workStressMultiplier: 0.9, decisionStressMultiplier: 0.4, errorStressMultiplier: 0.85 }),
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
    return Math.max(8, 25 - 5 * (career.index + career.progress / career.max));
  }

  function tutorial(completedShifts, profile) {
    if (!profile || profile.tier !== 'S' || !Number.isInteger(completedShifts) || completedShifts < 0 || completedShifts >= firstShifts.length) return null;
    return { ...firstShifts[completedShifts] };
  }

  function tutorialProgress(snapshot) {
    if (snapshot && Number.isInteger(snapshot.tutorialShifts) && snapshot.tutorialShifts >= 0 && snapshot.tutorialShifts <= 3) return snapshot.tutorialShifts;
    const profile = snapshot && snapshot.profile;
    if (!profile || profile.tier !== 'S' || !Number.isFinite(profile.comp) || profile.comp < 0 || profile.comp >= 25 ||
        ![7, 8, 9].includes(snapshot.day) || !['start', 'completed'].includes(snapshot.phase)) return 3;
    return Math.min(3, snapshot.day - 7 + (snapshot.phase === 'completed' ? 1 : 0));
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

  root.PLCareerProgression = { roles, role, view, promote, learningTime, learningRate, errorStress, contract, nextWorkday,
    tutorial, tutorialProgress };
})(window);
