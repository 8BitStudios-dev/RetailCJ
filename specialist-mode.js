/* Personal Specialist shift. The existing simulation still runs each service. */
(function (root) {
  'use strict';

  const PLAYER_ID = 'PLAYER';
  const NAME = 'Tu';
  const HOME = Object.freeze({ x: 900, y: 330 });
  const LOOK = Object.freeze({ skin: '#e0ac85', hair: '#3b251e', shirt: '#2a6ad8', pants: '#23232b' });
  const AFTER_HANDOVER = new Set(['toSetup', 'setup', 'waitTrade', 'tradeOnly']);
  const AUTO_NEXT_KEY = 'plgame.career.auto-next.v1';

  function savedAutoNext() {
    try { return root.localStorage.getItem(AUTO_NEXT_KEY) === 'true'; } catch { return false; }
  }

  root.PLPlayerMode = {
    create(api) {
      let currentGame = null;
      let entity = null;
      let shift = null;
      let closing = false;
      let message = '';
      let records = new Map();
      let totals = freshTotals();
      let interaction = null;
      let interactionCustomer = null;
      let lastInteraction = null;
      let workingChoice = false;
      let decisionMinutes = 0;
      let decisionClock = null;
      let autoNext = savedAutoNext();
      let engagement = null;
      let invitedCustomer = null;
      let browserResume = null;

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
          !g.moment && g.time >= api.OPEN && g.time < shiftEnd();
      }
      function shiftEnd() { return shift ? shift.end : api.CLOSE; }
      function tutorial() {
        const g = game();
        return g && entity ? root.PLCareerProgression.tutorial(g.tutorialShifts, entity.stats) : null;
      }
      function available() {
        return entity && api.isAvailable(entity) && !api.onBreak(entity) && !entity.wantsBreak && !entity.needsBreak;
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
        if (c.kind === 'look') return 'Una persona sta dando un’occhiata ai prodotti. Puoi offrirle aiuto, rispettando la sua risposta.';
        if (c.engagedBrowser && !c.engagementPurchaseReady) return 'Ha accettato il confronto per esplorare il prodotto; per ora non ha deciso di acquistare.';
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
      function browsers(g) {
        if (!g || !Array.isArray(g.customers)) return [];
        return g.customers.filter(c => c.kind === 'look' && ['looking', 'toLook'].includes(c.state) &&
          !c.gone && !c.outcome && !c.staff && !c.ownerId && !c.isStaff &&
          !(c.browserInvitationTried && (!Number.isFinite(c.browserInvitationUntil) || g.time < c.browserInvitationUntil)) &&
          !c.bought && !c.saleCounted && !c.tradeOnly && !c.setup && pending(c) === 0);
      }
      function liveCustomerActions() {
        const g = game();
        return Boolean(running(g) && g.speed > 0 && !workingChoice && !hasChoice() && canInteract() &&
          (!api.canTakeCustomer || api.canTakeCustomer()));
      }
      function setAutoNext(enabled) {
        autoNext = Boolean(enabled);
        try { root.localStorage.setItem(AUTO_NEXT_KEY, String(autoNext)); } catch { /* Preference remains usable in memory. */ }
        return autoNext;
      }
      function visitorCode(c) {
        const numeric = Number(c.id);
        if (Number.isFinite(numeric)) return Math.abs(Math.floor(numeric));
        return Array.from(String(c.id)).reduce((sum, letter) => (Math.imul(sum, 31) + letter.charCodeAt(0)) >>> 0, 0);
      }
      function releaseInvitation(c) {
        if (c && !c.gone && !c.outcome && c.state === 'engaging') {
          c.state = browserResume ? browserResume.state : 'looking';
          c.t = browserResume ? browserResume.t : 2;
          c.path = browserResume ? browserResume.path : [];
        }
        if (c && c.staff === entity) c.staff = null;
        if (entity && (entity.customer === c || entity.state === 'toBrowser')) {
          entity.customer = null; entity.state = 'idle'; entity.t = Infinity;
        }
        invitedCustomer = null;
        browserResume = null;
      }
      function engageBrowser() {
        const g = game();
        if (!liveCustomerActions() || !available()) return null;
        const eligible = browsers(g);
        const selected = eligible.find(c => c === g.selected);
        const c = selected || eligible.sort((a, b) => Math.hypot(a.x - entity.x, a.y - entity.y) -
          Math.hypot(b.x - entity.x, b.y - entity.y) || visitorCode(a) - visitorCode(b))[0];
        if (!c) { message = 'Al momento non ci sono visitatori disponibili per un invito.'; return null; }
        clearReservations(g);
        lastInteraction = null;
        c.browserInvitationTried = true;
        c.browserInvitationUntil = g.time + 15;
        browserResume = { state: c.state, t: c.t, path: (c.path || []).map(point => ({ ...point })) };
        invitedCustomer = c;
        c.state = 'engaging'; c.path = []; c.staff = entity;
        entity.customer = c; entity.state = 'toBrowser'; entity.t = Infinity;
        const direction = c.facing === 'right' ? -1 : c.facing === 'left' ? 1 : (entity.x < c.x ? -1 : 1);
        api.goTo(entity, { x: c.x + direction * 28, y: c.y + 18 });
        message = `Ti avvicini al visitatore #${c.id} per offrire aiuto, senza interrompere la sua scelta.`;
        engagement = { id: c.id, status: 'approaching', message };
        api.log(`Tu ti avvicini al visitatore #${c.id} e chiedi se desidera un confronto`);
        return c;
      }
      function arriveAtBrowser(c) {
        if (!c || c !== invitedCustomer || !entity || entity.customer !== c || c.staff !== entity ||
            c.gone || c.outcome || c.state !== 'engaging') {
          releaseInvitation(invitedCustomer);
          engagement = null;
          message = 'Il visitatore non è più disponibile per questo invito. Puoi seguire un’altra persona.';
          return false;
        }
        if (!liveCustomerActions()) return false;
        const code = visitorCode(c);
        const accepts = code % 5 !== 0 && !(c.hurry === 2 && code % 5 === 1);
        if (!accepts) {
          message = `Il visitatore #${c.id} preferisce continuare a guardare da solo. Rispetti la sua scelta: nessun cliente perso.`;
          engagement = { id: c.id, status: 'declined', message };
          api.log(`Il visitatore #${c.id} declina l’aiuto e continua a guardare i prodotti`);
          releaseInvitation(c);
          return true;
        }
        api.prepareBrowser(c, code);
        c.engagedBrowser = true;
        c.engagementPurchaseReady = code % 3 !== 0;
        c.ownerId = PLAYER_ID;
        track(c, true);
        invitedCustomer = null; browserResume = null;
        c.state = 'served';
        beginInteraction(c);
        api.serve(entity, c);
        if (api.face) { api.face(entity, c); api.face(c, entity); }
        message = c.engagementPurchaseReady ?
          `Il visitatore #${c.id} accetta il confronto. Scopri il suo bisogno prima di proporre una soluzione.` :
          `Il visitatore #${c.id} accetta una consulenza, ma oggi sta esplorando: una buona esperienza può concludersi senza acquisto.`;
        engagement = { id: c.id, status: 'accepted', message };
        api.log(`Il visitatore #${c.id} accetta una consulenza con te`);
        return true;
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
        interaction = null;
        interactionCustomer = null;
        lastInteraction = null;
        workingChoice = false;
        decisionMinutes = 0;
        decisionClock = null;
        engagement = null;
        invitedCustomer = null;
        browserResume = null;
        message = 'Segui una persona in attesa quando sei disponibile.';
        const team = api.TEAM;
        if (!team[NAME]) team[NAME] = { tier: 'S', mot: 65, stress: 20, comp: 0, cap: 100, off: [], vacWeek: -1 };
        const stats = team[NAME];
        // The player is always present; the overnight routine can still restore their energy.
        if (!root.PLCareerProgression.role(stats.tier)) stats.tier = 'S';
        stats.cap = 100; stats.off = []; stats.vacWeek = -1;
        stats.comp = Number.isFinite(stats.comp) ? Math.max(0, Math.min(100, stats.comp)) : 0;
        stats.sick = false; stats.sickTomorrow = false;
        const contract = root.PLCareerProgression.contract(stats);
        const hours = [4, 6, 8].includes(g.shiftHours) && g.shiftHours <= contract.hours ? g.shiftHours : contract.hours;
        shift = Object.freeze({ start: api.OPEN, end: api.OPEN + hours * 60, hours, weeklyHours: hours * 5 });
        entity = {
          id: PLAYER_ID, name: NAME, tier: stats.tier, role: 'specialist', rota: 'player',
          isStaff: true, isPlayer: true, x: HOME.x, y: HOME.y, home: { ...HOME },
          look: { ...LOOK }, path: [], facing: 'down', walk: 0, bubble: null,
          state: 'idle', t: Infinity, customer: null, served: 0, sessions: 0,
          hidden: false, wantsBreak: stats.stress >= 70, needsBreak: stats.stress >= 70,
          shift, stats, start: { ...stats },
        };
        if (entity.needsBreak) message = 'Stress alto: hai bisogno di una pausa di 15 minuti prima di seguire un cliente.';
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
        lastInteraction = null;
        engagement = null;
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
      function canInteract() {
        return running(game()) && (!api.canInteract || api.canInteract());
      }
      function hasChoice() {
        return Boolean(interaction && !interaction.complete && interactionCustomer &&
          entity && entity.customer === interactionCustomer && !interactionCustomer.gone &&
          !interactionCustomer.outcome && !closing);
      }
      function beginInteraction(c) {
        if (!owns(entity) || !personal(c) || c.tradeOnly || !root.PLCareerInteraction || !canInteract()) return false;
        interaction = root.PLCareerInteraction.create(c, entity.stats, { tutorial: tutorial() });
        interactionCustomer = c;
        decisionMinutes = 0;
        decisionClock = game().time;
        c.interactionControlled = true;
        entity.state = 'interaction'; entity.t = Infinity;
        message = 'Scegli come proseguire: il turno continua anche mentre decidi. Usa Pausa per fermare il gioco.';
        return true;
      }
      function applyAnswer(answer) {
        if (!answer || !answer.accepted || workingChoice) return false;
        const session = interaction, c = interactionCustomer;
        engagement = null;
        workingChoice = true;
        try { api.workInteraction(answer.minutes); } finally { workingChoice = false; }
        // Closing a shift can interrupt an action. Never complete or sell from an abandoned session.
        if (closing || game().over || interaction !== session || entity.customer !== c || c.outcome || c.gone) return true;
        message = answer.feedback;
        if (session.complete) {
          const result = session.result;
          result.workMinutes = result.minutes;
          result.decisionMinutes = Math.round(decisionMinutes * 10) / 10;
          result.minutes = Math.round((result.workMinutes + decisionMinutes) * 10) / 10;
          if (c.engagedBrowser && !c.engagementPurchaseReady) {
            result.purchase = false;
            result.feedback = [result.feedback[0], 'Una consulenza utile può concludersi senza un acquisto: il cliente era qui per esplorare.'];
          }
          lastInteraction = {
            feedback: result.feedback.slice(0, 2), minutes: result.minutes,
            workMinutes: result.workMinutes, decisionMinutes: result.decisionMinutes, decisions: result.decisions,
            reply: answer.feedback,
            qualityLabel: result.seriousError ? 'Promessa da verificare' : result.qualityDelta >= 8 ? 'Conversazione curata' : result.qualityDelta >= 0 ? 'Conversazione buona' : 'Conversazione da migliorare',
          };
          interaction = null; interactionCustomer = null;
          api.finishInteraction(entity, c, result);
        }
        return true;
      }
      function chooseInteraction(id, token) {
        if (workingChoice || !hasChoice() || !canInteract() || game().speed <= 0) return false;
        return applyAnswer(interaction.choose(id, token));
      }
      function tickChoice(seconds) {
        if (workingChoice || !hasChoice() || !canInteract() || game().speed <= 0) return false;
        return applyAnswer(interaction.tick(seconds));
      }
      function canPause(g) {
        return running(g) && !api.onBreak(entity) && !entity.wantsBreak &&
          (entity.needsBreak || entity.stats.stress >= 70 || entity.lastBreak === undefined || g.time - entity.lastBreak >= 60);
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
      function requireRest() {
        const g = game();
        if (!entity || closing || !g || g.over || (entity.stats.stress < 70 && !entity.needsBreak)) return false;
        entity.needsBreak = true;
        clearReservations(g);
        if (!api.onBreak(entity)) {
          entity.wantsBreak = true;
          message = entity.customer ?
            'Stress alto: finisci con il cliente, poi recupera con una pausa di 15 minuti.' :
            'Stress alto: hai bisogno di una pausa di 15 minuti prima di seguire un altro cliente.';
        }
        return true;
      }
      function recordError() {
        const g = game();
        if (!entity || closing || !g || g.over) return false;
        return requireRest();
      }
      function completeBreak() {
        const g = game();
        if (!entity || !g || entity.state !== 'onBreak' || !Number.isFinite(entity.until) || g.time < entity.until) return false;
        if (entity.stats.stress >= 70) {
          entity.needsBreak = true;
          entity.wantsBreak = true;
          return false;
        }
        entity.needsBreak = false;
        message = 'Pausa conclusa: rientra sul floor e segui il prossimo cliente.';
        return true;
      }
      function focus() {
        const g = game();
        if (g && entity) g.selected = entity;
        return entity;
      }
      function canPromote() {
        const g = game();
        if (!g || !entity || !root.PLCareerProgression.view(entity.stats).canPromote) return false;
        if (closing || g.over) return true;
        if (!available() || (entity.customer && !entity.customer.gone && !entity.customer.outcome)) return false;
        return ![...records.values()].some(record => !record.closed && !record.interrupted &&
          !record.customer.gone && !record.customer.outcome);
      }
      function promote() {
        if (!canPromote() || !root.PLCareerProgression.promote(entity.stats)) return false;
        entity.tier = entity.stats.tier;
        entity.stats.cap = 100;
        const label = root.PLCareerProgression.role(entity.tier).label;
        message = `Sei ${label}. Il nuovo percorso parte da 0 su 100.`;
        api.log(`Tu inizi il percorso ${label}`);
        return true;
      }
      function learnFromVisit(record, outcome) {
        const c = record.customer;
        let points = 0;
        if (outcome === 'bought' && record.delivered) points = 4;
        else if (outcome === 'helped' || (c.kind === 'acc' && outcome === 'bought' && pending(c) === 0)) points = 3;
        else if (c.kind === 'buy' && outcome === 'browsed') points = 2;
        if (points) api.bump(entity, 'comp', points);
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
        learnFromVisit(record, outcome);
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
        if (invitedCustomer) releaseInvitation(invitedCustomer);
        engagement = null;
        interaction = null;
        interactionCustomer = null;
        decisionClock = null;
        clearReservations(game());
        message = 'Turno concluso. Le visite incomplete restano distinte dai servizi conclusi.';
      }
      function step(dt) {
        const g = game();
        if (!g || !entity || closing) return;
        records.forEach(record => { if (!record.closed) sync(record); });
        if (interaction && Number.isFinite(decisionClock)) {
          if (!workingChoice && hasChoice()) decisionMinutes += Math.max(0, g.time - decisionClock);
          decisionClock = g.time;
        }
        requireRest();
        // Auto handles the service queue only. Invitations to browsers always need a click.
        if (entity.state === 'idle' && !entity.customer) entity.t = Infinity;
        reserveNext();
        if (autoNext && dt > 0 && liveCustomerActions() && available() && candidates(g).length) takeNext();
      }
      function phase(s) {
        if (!s) return 'idle';
        if (hasChoice()) return interaction.view().phase;
        const state = s.expertHelp ? s.expertHelp.resume : s.state;
        if (['toBrowser', 'toCustomer', 'toWallCustomer', 'approach'].includes(state)) return 'approach';
        if (state === 'probe') return 'probe';
        if (['demo', 'helping', 'advise'].includes(state)) return 'present';
        if (state === 'listen') return 'listen';
        if (['toAccWall', 'atAccWall', 'backToTable', 'checkout', 'tradeIn', 'financing', 'tradeOnly', 'waitProduct', 'handover'].includes(state)) return 'extend';
        return 'idle';
      }
      function stateLabel(s) {
        if (s.state === 'toBrowser') return 'Ti avvicini per offrire aiuto al visitatore';
        if (hasChoice()) return 'Scegli come proseguire · ' + interaction.view().phaseLabel;
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
        if (record.interrupted) return record.delivered ? 'Prodotto consegnato; visita rimasta aperta a fine turno' : 'Visita interrotta a fine turno';
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
        const career = root.PLCareerProgression.view(s ? s.stats : { tier: 'S', comp: 0 });
        career.canPromote = canPromote();
        let status = 'Pronto sul floor';
        if (isOver) status = 'Turno concluso';
        else if (!g || g.briefing || g.time < api.OPEN) status = 'Il tuo turno inizia alle ' + clock(api.OPEN);
        else if (s && api.onBreak(s)) status = s.state === 'onBreak' ? 'In pausa fino alle ' + clock(s.until) : s.state === 'fromBreak' ? 'Rientri dalla pausa' : 'Vai in pausa';
        else if (s && s.needsBreak) status = current ? 'Stress alto: finisci il cliente, poi pausa di 15 minuti' : 'Stress alto: hai bisogno di una pausa di 15 minuti';
        else if (s && s.wantsBreak) status = current ? 'Pausa richiesta: finisci prima con il cliente' : 'Pausa di 15 minuti richiesta';
        else if (current) status = stateLabel(s);
        else if (followUp) status = 'Pronto sul floor; un tuo cliente continua la visita';
        const history = [...records.values()].filter(r => r.closed || r.interrupted || r.delivered)
          .sort((a, b) => (b.closedAt ?? b.deliveredAt ?? b.startedAt) - (a.closedAt ?? a.deliveredAt ?? a.startedAt))
          .map(r => ({ id: r.id, title: `Cliente #${r.id} · ${productLabel(r.customer)}`,
            outcome: historyOutcome(r), time: clock(r.closedAt ?? r.deliveredAt ?? r.startedAt) }));
        return {
          enabled: true, name: NAME, role: career.role, career, tutorial: tutorial(), shift: shift ? { ...shift } : null,
          needsBreak: Boolean(s && s.needsBreak), status, phase: followUp ? 'extend' : phase(s),
          interaction: hasChoice() ? { ...interaction.view(), decisionMinutes: Math.round(decisionMinutes * 10) / 10 } : null,
          interactionEnabled: canInteract() && g.speed > 0, lastInteraction,
          autoNext, browsing: browsers(g).length,
          canEngage: Boolean(liveCustomerActions() && available() && browsers(g).length),
          engagement: engagement ? { ...engagement } : null,
          active: c ? { id: c.id, productLabel: productLabel(c), description: describe(c),
            stateLabel: followUp ? labels()[c.state] || 'Il cliente continua la visita dopo la consegna' : stateLabel(s),
            startedAt: clock(record ? record.startedAt : g.time), needsSetup: Boolean(c.setup) } : null,
          stats: { ...totals, open: [...records.values()].filter(r => !r.closed).length },
          energy: { motivation: s ? s.stats.mot : 65, stress: s ? s.stats.stress : 20, competence: s ? s.stats.comp : 0 },
          waiting, canNext: Boolean(running(g) && available() && waiting), canPause: Boolean(canPause(g)),
          isOver, history, message,
        };
      }
      return { newDay, step, takeNext, reserveNext, requestBreak, recordError, completeBreak, shiftEnd, focus, promote, view, recordLeave, beforeClose,
        beginInteraction, chooseInteraction, tickChoice, hasChoice, tutorial,
        waitingForChoice: () => !workingChoice && hasChoice(),
        setAutoNext, engageBrowser, arriveAtBrowser,
        player: () => entity, owns };
    },
  };
})(window);
