(function (root) {
  'use strict';

  // The bridge owns temporary floor state; career profiles stay in their original objects.
  function create(d) {
    let config = null, reference = null, target = null, notice = '', original = null, serial = 0, holding = false;
    const api = root.PLObservation;
    const clone = value => JSON.parse(JSON.stringify(value));
    const active = () => d.getMode() === 'observation' && config !== null;
    const g = () => d.getGame();

    function restoreTeam() {
      if (!original) return;
      for (const name of Object.keys(d.TEAM)) if (name !== 'Tu') delete d.TEAM[name];
      for (const [name, profile] of Object.entries(original)) d.TEAM[name] = profile;
    }
    function enter() {
      if (!original) original = Object.fromEntries(Object.entries(d.TEAM).filter(([name]) => name !== 'Tu'));
      if (!config) config = api.normalizeConfig(api.defaults);
      return config;
    }
    function exit() {
      restoreTeam(); original = null; config = null; reference = null; target = null; notice = ''; holding = false;
    }
    function prepare(day, opts) {
      if (!active() || opts.level) return null;
      config = api.normalizeConfig({...config, day});
      restoreTeam();
      for (const [name, profile] of Object.entries(original)) d.TEAM[name] = clone(profile);
      d.seedRandom(config.seed);
      serial = 0;
      return config;
    }
    function profile(tier) {
      return {tier, mot: config.motivation, stress: config.stress,
        comp: Math.min(config.skill, d.TIER[tier].cap), cap: d.TIER[tier].cap,
        off: [], vacWeek: -1, sick: false, sickTomorrow: false};
    }
    function staffPerson(name, tier, slot) {
      const stats = profile(tier);
      d.TEAM[name] = stats;
      const person = {id: 'LAB-S' + (++serial), name, tier, isStaff: true, ...slot,
        x: slot.home.x, y: slot.home.y, path: [], state: 'idle', t: d.rand(2, 6),
        look: {skin: d.pick(d.SKIN), hair: d.pick(d.HAIR), shirt: d.STAFF_SHIRT, pants: '#23232b'},
        facing: slot.post ? slot.post.face : 'down', walk: 0, bubble: null,
        customer: null, served: 0, sessions: 0, stats, start: {...stats}};
      if (slot.role === 'ops') { person.hidden = true; person.x = d.BACK_DOOR.x; person.y = d.BACK_DOOR.y; }
      return person;
    }
    function makeStaff() {
      const game = g();
      const pool = [];
      for (const [tier, count] of Object.entries(config.staff)) {
        for (let i = 0; i < count; i++) pool.push({tier, name: d.ROSTER[tier][i] || `${d.TIER[tier].label} ${i + 1}`});
      }
      const area = a => pool.filter(p => d.TIER[p.tier].area === a);
      const floor = area('floor'), bar = area('bar');
      game.formation = config.formation;
      game.rota = d.buildFloorRota(floor.length, config.formation);
      game.barRota = d.buildBarRota(bar.length);
      game.staff = [
        ...floor.map((p, i) => staffPerson(p.name, p.tier, d.slotProps('floor', i))),
        ...bar.map((p, i) => staffPerson(p.name, p.tier, d.slotProps('bar', i))),
        ...area('creative').map((p, i) => staffPerson(p.name, p.tier, {role: 'creative', home: d.CREATIVE_HOMES[i % d.CREATIVE_HOMES.length]})),
        ...area('ops').map(p => staffPerson(p.name, p.tier, {role: 'ops', home: d.BACK_DOOR})),
        ...area('lead').map((p, i) => staffPerson(p.name, p.tier, {role: 'lead', home: d.LEAD_HOMES[i % d.LEAD_HOMES.length]})),
      ];
      game.offToday = 0; game.vacation = []; game.sick = []; game.cover = [];
      game.nextRotation = d.OPEN + d.rand(60, 120);
    }
    function bookAppointment(item) {
      const game = g(), id = game.agenda.length;
      game.agenda.push({id, t: item.t, walkin: false, status: 'atteso', delay: null});
      const b = Math.floor((item.t - d.OPEN) / 15);
      for (let k = 0; k < 2; k++) game.slots[b + k] = (game.slots[b + k] || 0) + 1;
      if (!item.noShow) game.arrivals.push({t: item.arrivalT, kind: 'genius',
        extra: {...item.extra, appt: item.t, apptId: id, walkin: false}});
    }
    function prepareCustomer(item) {
      let key = 0; for (const char of item.extra.journeyId) key = (Math.imul(key, 31) + char.charCodeAt(0)) >>> 0;
      if (item.extra.product && !item.extra.need) {
        const needs = d.NEEDS[item.extra.product]; item.extra.need = needs[key % needs.length];
      }
      if (item.kind === 'acc') item.extra.side = key % 2 ? 'L' : 'R';
      return item;
    }
    function agenda() {
      const game = g();
      const plan = api.plan(config);
      game.slots = []; game.agenda = []; game.arrivals = plan.arrivals;
      plan.appointments.forEach(bookAppointment);
      game.arrivals.forEach(prepareCustomer);
      game.arrivals.sort((a, b) => a.t - b.t);
      game.agenda.sort((a, b) => a.t - b.t);
      game.observationLedger = api.createLedger(config);
    }
    function restart(next, message) {
      if (!active()) return false;
      config = api.normalizeConfig(next);
      target = reference && reference.day === config.day && reference.seed === config.seed ? reference.time : null;
      if (target !== null && target < d.OPEN) target = null;
      holding = false; notice = message;
      d.newDay(config.day); d.startDay(); d.resetClock(1); d.updatePanel();
      return true;
    }
    function apply(next) { return restart(next, 'Scenario applicato: il floor riparte con la nuova situazione.'); }
    function replay() { return restart(config, 'Stessa situazione e stessi arrivi iniziali: osserva un nuovo tentativo.'); }
    function reset() { reference = null; return restart(api.defaults, 'Ripristinato lo scenario base.'); }
    function capture() {
      if (!active() || g().time < d.OPEN) return false;
      reference = clone(api.snapshot(g().observationLedger, g())); target = null;
      d.resetClock(0); notice = 'Riferimento A registrato. Modifica lo scenario e riparti per confrontare B allo stesso orario.';
      d.updatePanel(); return true;
    }
    function clearReference() { reference = null; target = null; holding = false; notice = 'Riferimento cancellato.'; d.updatePanel(); }
    function limit(dt) {
      if (holding) return 0;
      return active() && target !== null && g().time < target ? Math.min(dt, target - g().time) : dt;
    }
    function afterStep() {
      if (active() && target !== null && g().time >= target - 1e-8) {
        g().time = target; target = null; holding = true; d.resetClock(0);
        notice = 'B ha raggiunto lo stesso orario di A: confronto pronto.'; d.updatePanel();
      }
    }
    function inject(channel, n = 5) {
      if (!active() || g().over || !api.channels.some(c => c.id === channel) || g().time >= d.LAST_ENTRY) return false;
      const count = Math.max(1, Math.min(20, Math.floor(Number(n) || 5))), game = g();
      const seed = ((config.seed + (++serial) * 7919) >>> 0) || 1;
      const plan = api.plan({...config, seed, demand: Object.fromEntries(api.channels.map(c => [c.id, 3]))});
      const list = channel === 'appointments' ? plan.appointments : plan.arrivals.filter(c => c.extra.labChannel === channel);
      if (!list.length || (channel === 'appointments' && game.time > d.LAST_APPT - 5)) return false;
      for (let i = 0; i < count; i++) {
        const item = clone(list[i % list.length]);
        item.extra.journeyId = `live-${seed}-${i}`; prepareCustomer(item);
        if (channel === 'appointments') {
          item.t = Math.min(d.LAST_APPT, Math.ceil((game.time + 5 + i) / 15) * 15);
          item.arrivalT = Math.max(d.OPEN, game.time) + i * 0.2;
          item.noShow = false; bookAppointment(item);
        } else game.arrivals.push({...item, t: Math.max(d.OPEN, game.time) + i * 0.2});
      }
      game.arrivals.sort((a, b) => a.t - b.t); game.agenda.sort((a, b) => a.t - b.t);
      notice = `Aggiunti ${count} clienti: ${api.channels.find(c => c.id === channel).label}. Il confronto ora include questo intervento.`;
      d.log(notice); d.updatePanel(); return true;
    }
    function addStaff(tier) {
      if (!active() || g().over || !d.TIER[tier] || g().staff.length >= 80 || config.staff[tier] >= 20) return false;
      const game = g(), area = d.TIER[tier].area;
      let slot;
      if (area === 'floor') {
        const index = game.rota.length;
        game.rota = d.buildFloorRota(index + 1, game.formation); slot = d.slotProps('floor', index);
      } else if (area === 'bar') {
        const index = game.barRota.length;
        game.barRota = d.buildBarRota(index + 1); slot = d.slotProps('bar', index);
      } else slot = {role: area === 'creative' ? 'creative' : area === 'ops' ? 'ops' : 'lead',
        home: area === 'creative' ? d.CREATIVE_HOMES[0] : area === 'ops' ? d.BACK_DOOR : d.LEAD_HOMES[0]};
      const name = `${d.TIER[tier].label} extra ${++serial}`;
      game.staff.push(staffPerson(name, tier, slot));
      config = api.normalizeConfig({...config, staff: {...config.staff, [tier]: config.staff[tier] + 1}});
      game.observationConfig = config;
      notice = `Entra una persona: ${d.TIER[tier].label}. I clienti già assegnati continuano la visita.`;
      d.log(notice); d.updatePanel(); return true;
    }
    function teamSupport() {
      if (!active() || g().over) return false;
      for (const person of g().staff) { d.bump(person, 'mot', 10); d.bump(person, 'stress', -10); }
      notice = 'Supporto alla squadra: motivazione +10, stress −10. Osserva gli effetti sui prossimi clienti.';
      d.log(notice); d.updatePanel(); return true;
    }
    function view() {
      if (!active() || !g().observationLedger) return {active: false};
      const report = api.snapshot(g().observationLedger, g());
      return {active: true, modePicking: d.isModePicking(), config, report, reference,
        comparison: reference ? api.compare(reference, report) : null,
        pendingTarget: target, notice, over: g().over};
    }
    return {enter, exit, prepare, makeStaff, agenda, apply, replay, reset, capture, clearReference,
      inject, addStaff, teamSupport, limit, afterStep, active, resume: () => {holding = false;}, get config() {return config;}, get view() {return view();}};
  }
  root.PLObservationEngine = {create};
})(typeof window === 'undefined' ? globalThis : window);
