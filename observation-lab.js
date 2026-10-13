(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PLObservation = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const channels = [
    { id: 'sales', label: 'Vendita', kind: 'buy' },
    { id: 'accessories', label: 'Accessori assistiti', kind: 'acc' },
    { id: 'express', label: 'Express', kind: 'acc' },
    { id: 'appointments', label: 'Support con appuntamento', kind: 'genius' },
    { id: 'walkins', label: 'Support senza appuntamento', kind: 'genius' },
    { id: 'browse', label: 'Visita libera', kind: 'look' },
  ];
  const tiers = [
    { id: 'S', label: 'Specialist' }, { id: 'E', label: 'Expert' }, { id: 'P', label: 'Pro' },
    { id: 'TS', label: 'Technical Specialist' }, { id: 'TE', label: 'Technical Expert' }, { id: 'G', label: 'Genius' },
    { id: 'C', label: 'Creative' }, { id: 'CP', label: 'Creative Pro' },
    { id: 'OP', label: 'Operations' }, { id: 'L', label: 'Lead' },
  ];
  const defaults = {
    day: 7, seed: 70427, weather: 'nuvoloso',
    demand: { sales: 1, accessories: 1, express: 1, appointments: 1, walkins: 1, browse: 1 },
    staff: { S: 8, E: 3, P: 2, TS: 6, TE: 3, G: 1, C: 1, CP: 1, OP: 3, L: 2 },
    formation: 'accoglienza', tactic: 'equilibrio', skill: 50, motivation: 70, stress: 20,
    delivery: 1, complexity: 0.25, patience: 1, noShow: 0.1, expressRunnerRate: 0.25, pattern: 'steady',
  };
  const enumValue = (value, valid, fallback) => valid.includes(value) ? value : fallback;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const bound = (value, min, max, fallback) => finite(value) ? Math.max(min, Math.min(max, value)) : fallback;

  function normalizeConfig(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const demand = {}, staff = {};
    channels.forEach(channel => { demand[channel.id] = bound(source.demand && source.demand[channel.id], 0, 3, defaults.demand[channel.id]); });
    tiers.forEach(tier => {
      staff[tier.id] = Math.floor(bound(source.staff && source.staff[tier.id], 0, 20, defaults.staff[tier.id]));
    });
    const total = Object.values(staff).reduce((sum, count) => sum + count, 0);
    if (total > 80) {
      // Keep each requested role represented, then share the remaining places
      // proportionally. Role order must never silently remove Operations.
      const active = tiers.filter(tier => staff[tier.id] > 0);
      const places = 80 - active.length, requested = total - active.length;
      const shares = active.map(tier => ({ id: tier.id, quota: (staff[tier.id] - 1) * places / requested }));
      shares.forEach(share => { staff[share.id] = 1 + Math.floor(share.quota); });
      const spare = 80 - Object.values(staff).reduce((sum, count) => sum + count, 0);
      shares.sort((a, b) => (b.quota % 1) - (a.quota % 1));
      for (let i = 0; i < spare; i++) staff[shares[i].id]++;
    }
    return {
      day: Math.floor(bound(source.day, 1, 31, defaults.day)),
      seed: Math.floor(bound(source.seed, 1, 4294967295, defaults.seed)),
      weather: enumValue(source.weather, ['sole', 'nuvoloso', 'pioggia'], defaults.weather),
      demand, staff,
      formation: enumValue(source.formation, ['accoglienza', 'tavoli', 'essenziale'], defaults.formation),
      tactic: enumValue(source.tactic, ['equilibrio', 'vendita', 'qualita', 'velocita'], defaults.tactic),
      skill: bound(source.skill, 0, 100, defaults.skill), motivation: bound(source.motivation, 0, 100, defaults.motivation),
      stress: bound(source.stress, 0, 100, defaults.stress), delivery: bound(source.delivery, 0.5, 3, defaults.delivery),
      complexity: bound(source.complexity, 0, 1, defaults.complexity), patience: bound(source.patience, 0.5, 2, defaults.patience),
      noShow: bound(source.noShow, 0, 1, defaults.noShow),
      expressRunnerRate: bound(source.expressRunnerRate, 0, 1, defaults.expressRunnerRate),
      pattern: enumValue(source.pattern, ['steady', 'afternoon'], defaults.pattern),
    };
  }

  const presets = [
    { id: 'baseline', label: 'Giornata normale', description: 'Domanda regolare e squadra di riferimento.', config: normalizeConfig(defaults) },
    { id: 'salespeak', label: 'Picco sul floor', description: 'Più vendita ed Express, con affluenza concentrata nel pomeriggio.',
      config: normalizeConfig({ demand: { sales: 2.2, accessories: 1.5, express: 1.8 }, pattern: 'afternoon' }) },
    { id: 'supportpeak', label: 'Support sotto pressione', description: 'Molti appuntamenti, walk-in e riparazioni complesse.',
      config: normalizeConfig({ demand: { appointments: 2.2, walkins: 2 }, complexity: 0.7 }) },
    { id: 'opsbottleneck', label: 'Collo di bottiglia backstage', description: 'Un solo Operations e preparazione lenta: il prodotto arriva più tardi.',
      config: normalizeConfig({ demand: { sales: 1.5, accessories: 1.5, express: 1.5 }, staff: { OP: 1 }, delivery: 2.5, expressRunnerRate: 0.75 }) },
    { id: 'balanced', label: 'Squadra preparata', description: 'Più figure esperte, buona motivazione e stress basso.',
      config: normalizeConfig({ staff: { E: 4, P: 3, TE: 4, G: 2, OP: 4 }, skill: 75, motivation: 85, stress: 10 }) },
  ];

  function rng(seed) {
    let state = seed >>> 0 || 1;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let n = state;
      n = Math.imul(n ^ n >>> 15, n | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(seed, text) {
    let value = seed >>> 0;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619) >>> 0;
    return value || 1;
  }
  const rates = { sales: 10, accessories: 4, express: 6, appointments: 9, walkins: 5, browse: 5 };
  function arrivalTime(fraction, end, pattern) {
    const start = 600;
    if (pattern === 'steady') return start + fraction * (end - start);
    // Same customers, shifted toward the afternoon: 30% before 14:00.
    return fraction < 0.3 ? start + fraction / 0.3 * 240 : 840 + (fraction - 0.3) / 0.7 * (end - 840);
  }
  function profile(config, channel, index) {
    const r = rng(hash(config.seed, config.day + ':' + channel.id + ':profile:' + index));
    const pick = values => values[Math.floor(r() * values.length)];
    const level = () => { const value = r(); return value < 0.75 ? 0 : value < 0.93 ? 1 : 2; };
    const wet = config.weather === 'pioggia';
    const moodRoll = r();
    const extra = {
      journeyId: 'OBS-' + config.day + '-' + config.seed + '-' + channel.id + '-' + index,
      labChannel: channel.id,
      familiarity: level(), hurry: level(),
      mood: moodRoll < 0.8 ? 72 + r() * 16 : moodRoll < 0.95 ? 45 + r() * 15 : 20 + r() * 15,
      exp: wet ? 61 + r() * 12 : 64 + r() * 12, rude: r() < (wet ? 0.13 : 0.08),
    };
    if (channel.kind === 'acc') extra.quick = channel.id === 'express';
    if (channel.id === 'express') {
      const stock = rng(hash(config.seed, config.day + ':' + channel.id + ':stock:' + index));
      extra.expressNeedsRunner = stock() < config.expressRunnerRate;
    }
    if (channel.kind === 'buy') {
      const p = r();
      extra.product = p < 0.5 ? 'iphone' : p < 0.7 ? 'watch' : p < 0.85 ? 'ipad' : 'mac';
      extra.fast = r() < 0.32;
      extra.complex = r() < config.complexity;
      extra.tradeIn = r() < ({ iphone: 0.33, ipad: 0.12, mac: 0.1 }[extra.product] || 0);
      extra.finance = r() < ({ mac: 0.18, iphone: 0.1, ipad: 0.08 }[extra.product] || 0.03);
      extra.setup = null;
      if (extra.product === 'iphone') {
        const transfer = r();
        extra.setup = extra.tradeIn ? (transfer < 0.4 ? 'transferThenTrade' : transfer < 0.65 ? 'icloud' : null) : (transfer < 0.25 ? 'transfer' : null);
      }
    }
    if (channel.kind === 'genius') {
      const repair = r();
      extra.repair = repair < config.complexity ? 2 : repair < config.complexity + (1 - config.complexity) * 0.4 ? 1 : 0;
    }
    // Appearance is also stable, so staffing comparisons do not change customers.
    extra.look = {
      skin: pick(['#f1c7a3', '#e0ac85', '#b97c52', '#7a4b2e']),
      hair: pick(['#2b1d14', '#6b4226', '#d8b25a', '#141414', '#b8b8b8', '#8b3a1a']),
      shirt: pick(['#e05a47', '#f2b134', '#6ab04c', '#9b59b6', '#e67e22', '#95a5a6', '#34495e', '#c0392b', '#1abc9c', '#f5f5f0']),
      pants: pick(['#2c3e50', '#3b3b44', '#5a4a3a', '#1f2a44']),
    };
    return extra;
  }
  function plan(value) {
    const config = normalizeConfig(value), arrivals = [], appointments = [];
    channels.forEach(channel => {
      const end = channel.id === 'appointments' ? 1140 : 1185;
      const potential = Math.ceil(rates[channel.id] * (end - 600) / 60 * 3);
      for (let index = 0; index < potential; index++) {
        const r = rng(hash(config.seed, config.day + ':' + channel.id + ':arrival:' + index));
        if (r() >= config.demand[channel.id] / 3) continue;
        const fraction = (index + r()) / potential;
        const t = arrivalTime(fraction, end, config.pattern);
        const extra = profile(config, channel, index);
        if (channel.id === 'appointments') {
          const booked = Math.min(1140, Math.max(600, Math.round((t - 600) / 15) * 15 + 600));
          const punctual = r();
          const offset = punctual < 0.3 ? -3 - r() * 12 : punctual < 0.8 ? -3 + r() * 7 : 5 + r() * 15;
          appointments.push({ t: booked, arrivalT: Math.max(600, booked + offset), noShow: r() < config.noShow, extra });
        } else arrivals.push({ t, kind: channel.kind, extra });
      }
    });
    const sort = (a, b) => a.t - b.t || a.extra.journeyId.localeCompare(b.extra.journeyId);
    return { arrivals: arrivals.sort(sort), appointments: appointments.sort(sort) };
  }

  const phaseDefinitions = [
    { id: 'point', label: 'Point ingresso' }, { id: 'sales', label: 'Attesa vendita' },
    { id: 'accessories', label: 'Attesa accessori' }, { id: 'express', label: 'Coda Express' },
    { id: 'supportPoint', label: 'Check-in Support' }, { id: 'support', label: 'Attesa Support' },
    { id: 'keyrole', label: 'Attesa supporto collega' },
    { id: 'delivery', label: 'Attesa prodotto' },
  ];
  const completedOutcomes = ['bought', 'fixed', 'helped', 'browsed', 'looked', 'session'];
  function createLedger(config) {
    const phases = {};
    phaseDefinitions.forEach(phase => { phases[phase.id] = { wait: 0, journeys: Object.create(null) }; });
    return { config: normalizeConfig(config), journeys: Object.create(null), phases, finished: false, time: 598 };
  }
  function channelOf(c) {
    if (channels.some(channel => channel.id === c.labChannel)) return c.labChannel;
    if (c.kind === 'genius') return c.appt !== undefined && !c.walkin ? 'appointments' : 'walkins';
    if (c.kind === 'buy' || c.kind === 'help') return 'sales';
    if (c.kind === 'acc') return c.quick ? 'express' : 'accessories';
    return 'browse';
  }
  function journey(ledger, c, time) {
    if (!ledger || !c) return null;
    const id = c.journeyId !== undefined ? String(c.journeyId) : 'customer-' + String(c.id);
    if (!Object.prototype.hasOwnProperty.call(ledger.journeys, id)) {
      ledger.journeys[id] = { id, channel: channelOf(c), kind: c.kind, entered: finite(time) ? time : ledger.time, wait: 0, experience: finite(c.exp) ? c.exp : null, outcome: null, status: 'active' };
    }
    return ledger.journeys[id];
  }
  function recordEnter(ledger, c, time) {
    if (!ledger || ledger.finished) return false;
    const item = journey(ledger, c, time);
    if (!item || item.outcome) return false;
    item.status = 'active';
    if (finite(c.exp)) item.experience = c.exp;
    if (finite(time)) ledger.time = time;
    return true;
  }
  function recordWait(ledger, c, state, dt) {
    if (!ledger || !c || ledger.finished || !finite(dt) || dt <= 0) return false;
    const phase = state === 'keyrole' ? 'keyrole' : state === 'lineEx' ? 'express' : state === 'lineGB' ? 'supportPoint' : state === 'inLine' ? (c.appt !== undefined ? 'supportPoint' : 'point') :
      ({ waiting: 'sales', waitWall: 'accessories', queued: 'support', atBar: 'support', waitDelivery: 'delivery' })[state];
    if (!phase) return false;
    const item = journey(ledger, c);
    if (!item || item.outcome) return false;
    item.wait += dt;
    if (finite(c.exp)) item.experience = c.exp;
    ledger.phases[phase].wait += dt;
    ledger.phases[phase].journeys[item.id] = true;
    return true;
  }
  function recordLeave(ledger, c, outcome, time) {
    if (!ledger || ledger.finished) return false;
    const item = journey(ledger, c, time);
    if (!item || item.outcome) return false;
    if (finite(c.exp)) item.experience = c.exp;
    if (finite(time)) ledger.time = time;
    if (outcome === 'rebooked') { item.status = 'pending'; return true; }
    item.outcome = outcome;
    item.status = completedOutcomes.includes(outcome) ? 'completed' : outcome === 'lost' ? 'lost' : outcome === 'later' ? 'redirected' : 'unfinished';
    item.ended = finite(time) ? time : ledger.time;
    return true;
  }
  function finishLedger(ledger, time) {
    if (!ledger || ledger.finished) return false;
    Object.values(ledger.journeys).forEach(item => {
      if (!item.outcome) { item.outcome = 'unfinished'; item.status = 'unfinished'; item.ended = finite(time) ? time : ledger.time; }
    });
    if (finite(time)) ledger.time = time;
    ledger.finished = true;
    return true;
  }
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  function summarize(items) {
    const terminal = items.filter(item => item.outcome);
    return {
      entered: items.length, completed: items.filter(item => item.status === 'completed').length,
      lost: items.filter(item => item.status === 'lost').length, redirected: items.filter(item => item.status === 'redirected').length,
      unfinished: items.filter(item => item.status === 'unfinished').length, active: items.filter(item => !item.outcome).length,
      wait: average(terminal.map(item => item.wait)),
      experience: average(terminal.filter(item => finite(item.experience)).map(item => Math.max(0, Math.min(100, item.experience)))),
    };
  }
  function snapshot(ledger, game) {
    game = game || {};
    const config = normalizeConfig(game.observationConfig || ledger.config);
    const items = Object.values(ledger.journeys), metrics = summarize(items);
    const reviews = (game.reviews || []).filter(review => finite(review.value));
    const sales = items.filter(item => item.channel === 'sales' && item.kind === 'buy' && item.outcome && item.status !== 'unfinished');
    const people = (game.staff || []).filter(person => !person.gone);
    const stats = game.stats || {};
    const staffTiers = {};
    tiers.forEach(tier => { staffTiers[tier.id] = people.filter(person => person.tier === tier.id).length; });
    Object.assign(metrics, {
      completionRate: metrics.entered ? metrics.completed / metrics.entered * 100 : null,
      abandonRate: metrics.entered ? metrics.lost / metrics.entered * 100 : null,
      conversion: sales.length ? sales.filter(item => item.outcome === 'bought').length / sales.length * 100 : null,
      nps: reviews.length ? average(reviews.map(review => review.value)) * 100 : null, npsN: reviews.length,
      errors: finite(stats.errors) ? stats.errors : 0,
      delivery: stats.delivered > 0 && finite(stats.deliverySum) ? stats.deliverySum / stats.delivered : null,
      deliveryN: finite(stats.delivered) ? stats.delivered : 0,
      stress: average(people.filter(person => person.stats && finite(person.stats.stress)).map(person => person.stats.stress)),
      motivation: average(people.filter(person => person.stats && finite(person.stats.mot)).map(person => person.stats.mot)),
    });
    return {
      day: finite(game.day) ? game.day : config.day, seed: config.seed, time: finite(game.time) ? game.time : ledger.time,
      channels: channels.map(channel => Object.assign({ id: channel.id, label: channel.label }, summarize(items.filter(item => item.channel === channel.id)))),
      metrics,
      phases: phaseDefinitions.map(phase => {
        const entry = ledger.phases[phase.id], n = Object.keys(entry.journeys).length;
        return { id: phase.id, label: phase.label, wait: n ? entry.wait / n : null, n };
      }),
      staff: { tiers: staffTiers, total: people.length, repairers: people.filter(person => person.role === 'genius').length }, config,
    };
  }
  function compare(reference, current) {
    const result = { ok: false, reason: '', deltas: {}, reference, current };
    if (!reference || !current) { result.reason = 'Salva prima una situazione di riferimento.'; return result; }
    if (reference.day !== current.day || reference.seed !== current.seed) { result.reason = 'Confronta la stessa giornata e lo stesso seme.'; return result; }
    if (!finite(reference.time) || !finite(current.time) || Math.abs(reference.time - current.time) > 0.010000001) {
      result.reason = 'Confronta i risultati allo stesso orario.'; return result;
    }
    Object.keys(current.metrics || {}).forEach(key => {
      const before = reference.metrics && reference.metrics[key], after = current.metrics[key];
      result.deltas[key] = finite(before) && finite(after) ? after - before : null;
    });
    result.ok = true;
    return result;
  }
  return { defaults, channels, tiers, presets, normalizeConfig, plan, createLedger, recordEnter, recordWait, recordLeave, finishLedger, snapshot, compare };
});
