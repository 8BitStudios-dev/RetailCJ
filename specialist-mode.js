/* Personal Specialist shift. The existing simulation still runs each service. */
(function (root) {
  'use strict';

  const PLAYER_ID = 'PLAYER';
  const NAME = 'Tu';
  const HOME = Object.freeze({ x: 900, y: 330 });
  const LOOK = Object.freeze({ skin: '#e0ac85', hair: '#3b251e', shirt: '#2a6ad8', pants: '#23232b' });
  const AFTER_HANDOVER = new Set(['toSetup', 'setup', 'waitTrade', 'tradeOnly']);

  root.PLPlayerMode = {
    create(api) {
      let currentGame = null;
      let entity = null;
      let closing = false;
      let message = '';
      let records = new Map();
      let totals = freshTotals();

      function freshTotals() {
        return { served: 0, sales: 0, accessories: 0, services: 0, helped: 0, setups: 0 };
      }
      function game() { return api.getGame() || currentGame; }
      function clock(value) {
        const minute = Math.floor(Number(value) || 0);
        return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
      }
      function running(g) {
        return g && entity && !closing && !g.over && !g.briefing && !g.planning && !g.checkpoint &&
          !g.moment && g.time >= api.OPEN && g.time < api.CLOSE;
      }
      function available() {
        return entity && api.isAvailable(entity) && !api.onBreak(entity) && !entity.wantsBreak;
      }
      function owns(s) { return Boolean(s && s === entity && s.isPlayer); }
      function personal(c) { return Boolean(c && c.ownerId === PLAYER_ID); }
      function pending(c) { return Math.max(0, Number(c.pending) || 0); }
      function labels() {
        return (typeof api.STATE_LABEL === 'function' ? api.STATE_LABEL() : api.STATE_LABEL) || {};
      }
      function productLabel(c) {
        if (c.kind === 'acc') return 'Accessori';
        if (c.kind === 'help') return 'Aiuto sul prodotto';
        return api.PRODUCT_NAME[c.product] || 'Prodotto';
      }
      function describe(c) {
        if (c.tradeOnly) return 'Permuta del dispositivo dopo il trasferimento dei dati.';
        if (c.kind === 'help') return 'Una persona ha una domanda sul suo prodotto.';
        if (c.kind === 'acc') return 'Una persona cerca un consiglio sugli accessori.';
        const details = [c.fast ? 'Sa già cosa vuole.' : 'Una persona cerca una consulenza.'];
        if (c.tradeIn) details.push('Ha un dispositivo da dare in permuta.');
        if (c.finance) details.push('Ha richiesto il finanziamento.');
        return details.join(' ');
      }
      function track(c, eligibleSale) {
        const key = String(c.id);
        if (!records.has(key)) {
          records.set(key, {
            id: c.id, customer: c, startedAt: game().time, closedAt: null, deliveredAt: null,
            eligibleSale: eligibleSale === undefined ? c.kind === 'buy' && !c.tradeOnly : eligibleSale,
            delivered: false, accessoryCounted: false, setupCounted: false,
            closed: false, interrupted: false, outcome: null,
          });
        }
        return records.get(key);
      }
      function handoverComplete(c, outcome) {
        return c.saleCounted && pending(c) === 0 &&
          (outcome === 'bought' || AFTER_HANDOVER.has(c.state) ||
            (c.tradeOnly && (c.state === 'toTable' || c.state === 'waiting')));
      }
      function sync(record, outcome) {
        if (record.interrupted) return;
        const c = record.customer;
        if (!record.delivered && record.eligibleSale && handoverComplete(c, outcome)) {
          record.delivered = true;
          record.deliveredAt = game().time;
          totals.sales++;
          if (c.accessory) { totals.accessories++; record.accessoryCounted = true; }
          if (c.service) totals.services++;
        }
        if (record.delivered && c.setupDone && !record.setupCounted) {
          record.setupCounted = true;
          totals.setups++;
        }
      }
      function candidates(g) {
        if (!g) return [];
        return g.customers.filter(c => !c.gone && !c.outcome && !c.staff && !c.isStaff &&
          (!c.ownerId || personal(c)) &&
          ((c.state === 'waiting' && (c.kind === 'buy' || c.kind === 'help')) ||
            (c.state === 'waitWall' && c.kind === 'acc')))
          .sort((a, b) => {
            const arrived = c => Number.isFinite(c.tQueue) ? c.tQueue : g.time - (Number(c.wait) || 0);
            return arrived(a) - arrived(b) || Number(a.id) - Number(b.id);
          });
      }
      function clearReservations(g, keep) {
        if (!g) return;
        g.customers.forEach(c => { if (c !== keep && c.playerReserved) delete c.playerReserved; });
      }
      function reserveNext() {
        const g = game();
        if (!running(g) || !available()) { clearReservations(g); return null; }
        const waiting = candidates(g);
        const next = waiting.find(c => c.playerReserved) || waiting[0] || null;
        clearReservations(g, next);
        if (next) next.playerReserved = true;
        return next;
      }
      function newDay(g) {
        currentGame = g;
        closing = false;
        records = new Map();
        totals = freshTotals();
        message = 'Segui una persona in attesa quando sei disponibile.';
        const team = api.TEAM;
        if (!team[NAME]) team[NAME] = { tier: 'S', mot: 65, stress: 20, comp: 25, cap: 75, off: [], vacWeek: -1 };
        const stats = team[NAME];
        // The player is always present; the overnight routine can still restore their energy.
        stats.tier = 'S'; stats.cap = 75; stats.off = []; stats.vacWeek = -1;
        stats.sick = false; stats.sickTomorrow = false;
        entity = {
          id: PLAYER_ID, name: NAME, tier: 'S', role: 'specialist', rota: 'player',
          isStaff: true, isPlayer: true, x: HOME.x, y: HOME.y, home: { ...HOME },
          look: { ...LOOK }, path: [], facing: 'down', walk: 0, bubble: null,
          state: 'idle', t: Infinity, customer: null, served: 0, sessions: 0,
          hidden: false, wantsBreak: false, stats, start: { ...stats },
        };
        clearReservations(g);
        g.staff = g.staff.filter(s => !s.isPlayer);
        g.staff.push(entity);
        return entity;
      }
      function takeNext() {
        const g = game();
        if (!running(g) || !available()) return null;
        const c = reserveNext();
        if (!c) { message = 'Non ci sono persone in attesa da prendere in carico.'; return null; }
        const alreadyPersonal = personal(c);
        c.ownerId = PLAYER_ID;
        delete c.playerReserved;
        track(c, alreadyPersonal ? undefined : c.kind === 'buy' && !c.bought && !c.saleCounted && !c.tradeOnly);
        entity.customer = c;
        c.staff = entity;
        entity.t = 0;
        if (c.state === 'waitWall') {
          entity.state = 'toWallCustomer';
          api.goTo(entity, { x: c.x + (c.side === 'L' ? 28 : -28), y: c.y + 30 });
        } else {
          g.stats.waitSum += c.wait;
          g.stats.waitN++;
          entity.state = 'toCustomer';
          api.goTo(entity, { x: c.slot.sx, y: c.slot.sy });
        }
        clearReservations(g);
        message = `Hai preso in carico il cliente #${c.id}.`;
        api.log(`Tu segui il cliente #${c.id}: ${productLabel(c)}`);
        return c;
      }
      function canPause(g) {
        return running(g) && !api.onBreak(entity) && !entity.wantsBreak &&
          (entity.lastBreak === undefined || g.time - entity.lastBreak >= 60);
      }
      function requestBreak() {
        const g = game();
        if (!canPause(g)) return false;
        entity.wantsBreak = true;
        clearReservations(g);
        message = entity.customer ? 'Andrai in pausa quando avrai finito con il cliente.' : 'Hai richiesto una pausa di 15 minuti.';
        api.log(entity.customer ? 'Tu andrai in pausa appena libero' : 'Tu richiedi una pausa di 15 minuti');
        return true;
      }
      function focus() {
        const g = game();
        if (g && entity) g.selected = entity;
        return entity;
      }
      function recordLeave(c, outcome) {
        if (!personal(c)) return;
        const record = track(c);
        if (record.closed || record.interrupted) return;
        if (closing || ['incomplete', 'unfinished', 'visiting'].includes(outcome)) {
          record.interrupted = true;
          record.outcome = 'incomplete';
          record.closedAt = game().time;
          return;
        }
        sync(record, outcome);
        if (c.kind === 'acc' && outcome === 'bought' && pending(c) === 0 && !record.accessoryCounted) {
          totals.accessories++;
          record.accessoryCounted = true;
        }
        record.closed = true;
        record.closedAt = game().time;
        record.outcome = outcome;
        totals.served++;
        if (outcome === 'helped') totals.helped++;
        message = `Visita del cliente #${c.id} conclusa.`;
      }
      function beforeClose() {
        if (closing) return;
        records.forEach(record => {
          if (record.closed || record.interrupted) return;
          sync(record);
          record.interrupted = true;
          record.outcome = 'incomplete';
          record.closedAt = game().time;
        });
        closing = true;
        clearReservations(game());
        message = 'Turno concluso. Le visite incomplete restano distinte dai servizi conclusi.';
      }
      function step(dt) {
        const g = game();
        if (!g || !entity || closing) return;
        records.forEach(record => { if (!record.closed) sync(record); });
        // Free time never starts an automatic conversation or changes the player's position.
        if (entity.state === 'idle' && !entity.customer) entity.t = Infinity;
        reserveNext();
      }
      function phase(s) {
        if (!s) return 'idle';
        const state = s.expertHelp ? s.expertHelp.resume : s.state;
        if (['toCustomer', 'toWallCustomer', 'approach'].includes(state)) return 'approach';
        if (state === 'probe') return 'probe';
        if (['demo', 'helping', 'advise'].includes(state)) return 'present';
        if (state === 'listen') return 'listen';
        if (['toAccWall', 'atAccWall', 'backToTable', 'checkout', 'tradeIn', 'financing', 'tradeOnly', 'waitProduct', 'handover'].includes(state)) return 'extend';
        return 'idle';
      }
      function stateLabel(s) {
        if (s.state === 'checkout' && s.bubble) {
          if (s.bubble.icon === 'trade') return 'Valuti il dispositivo per il Trade In';
          if (s.bubble.icon === 'card') return 'Prepari la pratica di finanziamento';
          if (s.bubble.icon === 'shield') return 'Spieghi AppleCare';
        }
        if (s.state === 'waitProduct') return 'Aspetti il prodotto insieme al cliente';
        if (s.state === 'handover') return 'Consegni il prodotto al cliente';
        return labels()[s.state] || s.state;
      }
      function historyOutcome(record) {
        const c = record.customer;
        if (record.interrupted) return record.delivered ? 'Prodotto consegnato; visita rimasta aperta alla chiusura' : 'Visita interrotta alla chiusura';
        if (!record.closed && record.delivered) return 'Prodotto consegnato; configurazione in corso';
        return {
          bought: record.delivered ? 'Acquisto consegnato' : c.kind === 'acc' ? 'Accessorio acquistato' : 'Permuta conclusa',
          helped: 'Domanda risolta', browsed: 'Consulenza conclusa senza acquisto', lost: 'Cliente andato via',
        }[record.outcome] || 'Visita conclusa';
      }
      function view() {
        const g = game();
        const s = entity;
        const waiting = candidates(g).length;
        const current = !closing && !(g && g.over) && s && s.customer && !s.customer.outcome && !s.customer.gone ? s.customer : null;
        const followUp = !current && !closing && !(g && g.over) && [...records.values()].reverse().find(r =>
          r.delivered && !r.closed && !r.interrupted && !r.customer.outcome && !r.customer.gone);
        const c = current || (followUp ? followUp.customer : null);
        const record = c && records.get(String(c.id));
        const isOver = Boolean(closing || (g && g.over));
        let status = 'Pronto sul floor';
        if (isOver) status = 'Turno concluso';
        else if (!g || g.briefing || g.time < api.OPEN) status = 'Il tuo turno inizia alle ' + clock(api.OPEN);
        else if (s && api.onBreak(s)) status = s.state === 'onBreak' ? 'In pausa fino alle ' + clock(s.until) : s.state === 'fromBreak' ? 'Rientri dalla pausa' : 'Vai in pausa';
        else if (s && s.wantsBreak) status = 'Pausa richiesta: finisci prima con il cliente';
        else if (current) status = stateLabel(s);
        else if (followUp) status = 'Pronto sul floor; un tuo cliente continua la visita';
        const history = [...records.values()].filter(r => r.closed || r.interrupted || r.delivered)
          .sort((a, b) => (b.closedAt ?? b.deliveredAt ?? b.startedAt) - (a.closedAt ?? a.deliveredAt ?? a.startedAt))
          .map(r => ({ id: r.id, title: `Cliente #${r.id} · ${productLabel(r.customer)}`,
            outcome: historyOutcome(r), time: clock(r.closedAt ?? r.deliveredAt ?? r.startedAt) }));
        return {
          enabled: true, name: NAME, role: 'Specialist', status, phase: followUp ? 'extend' : phase(s),
          active: c ? { id: c.id, productLabel: productLabel(c), description: describe(c),
            stateLabel: followUp ? labels()[c.state] || 'Il cliente continua la visita dopo la consegna' : stateLabel(s),
            startedAt: clock(record ? record.startedAt : g.time), needsSetup: Boolean(c.setup) } : null,
          stats: { ...totals, open: [...records.values()].filter(r => !r.closed).length },
          energy: { motivation: s ? s.stats.mot : 65, stress: s ? s.stats.stress : 20, competence: s ? s.stats.comp : 25 },
          waiting, canNext: Boolean(running(g) && available() && waiting), canPause: Boolean(canPause(g)),
          isOver, history, message,
        };
      }
      return { newDay, step, takeNext, reserveNext, requestBreak, focus, view, recordLeave, beforeClose,
        player: () => entity, owns };
    },
  };
})(window);
