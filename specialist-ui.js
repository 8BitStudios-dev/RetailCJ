(function () {
  'use strict';

  const STAGES = ['Approach', 'Probe', 'Present', 'Listen', 'Extend'];
  const STAGE_HINTS = ['Accogli e inizi il contatto', 'Esplori bisogni e aspettative', 'Presenti una soluzione', 'Ascolti dubbi e verifichi la soluzione', 'Completi la visita e accompagni nei prossimi passi'];
  const PHASES = {
    approach: 0, probe: 1, present: 2, listen: 3, extend: 4
  };
  let refs = null;
  let actions = {};

  function node(tag, className, parent, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    if (parent) parent.appendChild(element);
    return element;
  }

  function setText(element, value) {
    const content = value === undefined || value === null ? '' : String(value);
    if (element.textContent !== content) element.textContent = content;
  }

  function count(value) {
    return Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0;
  }

  function phaseIndex(value) {
    const key = String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    return Object.prototype.hasOwnProperty.call(PHASES, key) ? PHASES[key] : -1;
  }

  function button(parent, action, label, className) {
    const element = node('button', className, parent, label);
    element.type = 'button';
    element.dataset.specialistAction = action;
    element.disabled = true;
    return element;
  }

  function ensure() {
    const root = document.getElementById('playerPanel');
    if (!root) return null;
    if (refs && refs.root === root) return refs;

    root.replaceChildren();
    root.classList.add('playerPanel');
    root.setAttribute('aria-label', 'Il tuo turno da Specialist');
    const header = node('div', 'playerHeader', root);
    node('h2', 'playerTitle', header, 'Il tuo turno');
    const identity = node('div', 'playerIdentity', header);
    const name = node('strong', '', identity, 'Tu');
    const role = node('span', 'playerRole', identity, 'Specialist');
    const status = node('div', 'playerStatus', root);
    status.setAttribute('role', 'status');

    const current = node('div', 'playerCurrent', root);
    const currentTitle = node('strong', 'playerCurrentTitle', current, 'Nessun cliente in corso');
    const description = node('div', 'playerDescription', current);
    const state = node('div', 'playerState', current);
    const started = node('span', 'playerStarted', current);
    const progress = node('ol', 'playerProgress', current);
    progress.setAttribute('aria-label', 'Percorso del cliente');
    const stages = STAGES.map((label, i) => {
      const stage = node('li', 'playerStep', progress, label);
      stage.title = STAGE_HINTS[i]; return stage;
    });
    node('div', 'playerDescription', current, 'L’ascolto accompagna tutta la visita. Acquisto, servizi e Setup fanno parte del percorso.');

    const metrics = node('div', 'playerMetrics', root);
    const stats = {};
    [['served', 'Clienti conclusi'], ['sales', 'Dispositivi consegnati'], ['open', 'Visite aperte']].forEach(([key, label]) => {
      const metric = node('div', 'playerMetric', metrics);
      stats[key] = node('strong', '', metric, '0');
      node('span', '', metric, label);
    });
    const extraStats = node('div', 'playerExtraStats', root);

    const energyRow = node('div', 'playerEnergy', root);
    const energy = {};
    [['motivation', 'Motivazione'], ['stress', 'Stress'], ['competence', 'Competenza']].forEach(([key, label]) => {
      const badge = node('span', 'playerEnergyBadge', energyRow);
      node('span', '', badge, label);
      energy[key] = node('b', '', badge, '0');
    });

    const queue = node('div', 'playerQueue', root);
    const controls = node('div', 'playerControls', root);
    const next = button(controls, 'next', 'Segui il prossimo cliente', 'playerNext on');
    const secondary = node('div', 'playerSecondaryActions', controls);
    const focus = button(secondary, 'focus', 'Mostrami sul floor');
    const pause = button(secondary, 'pause', 'Pausa 15 min');
    const message = node('div', 'playerMessage', root);

    const recent = node('div', 'playerRecent', root);
    node('h3', '', recent, 'Ultimi clienti');
    const history = node('ol', 'playerHistory', recent);
    const historyRows = Array.from({ length: 3 }, () => {
      const row = node('li', '', history);
      const title = node('strong', '', row);
      const time = node('span', 'playerHistoryTime', row);
      const outcome = node('div', 'playerHistoryOutcome', row);
      return { row, title, time, outcome };
    });

    refs = { root, name, role, status, currentTitle, description, state, started, progress,
      stages, stats, extraStats, energy, queue, next, focus, pause, message, recent, historyRows };
    root.addEventListener('click', event => {
      const control = event.target.closest('button[data-specialist-action]');
      if (!control || !root.contains(control) || control.disabled) return;
      const action = actions[control.dataset.specialistAction];
      if (typeof action === 'function') action();
    });
    return refs;
  }

  function render(view) {
    const r = ensure();
    if (!r || !view) return;
    r.root.hidden = !view.enabled;
    if (!view.enabled) return;

    setText(r.name, view.name || 'Tu');
    setText(r.role, view.role || 'Specialist');
    setText(r.status, view.status || (view.isOver ? 'Turno concluso' : 'Pronto sul floor'));
    const active = view.active;
    r.root.classList.toggle('hasClient', Boolean(active));
    if (active) {
      const id = active.id === undefined || active.id === null ? '' : ' #' + active.id;
      setText(r.currentTitle, 'Cliente' + id + (active.productLabel ? ' · ' + active.productLabel : ''));
      setText(r.description, active.description);
      setText(r.state, active.stateLabel || view.phase || 'In corso');
      setText(r.started, active.startedAt ? 'Iniziato alle ' + active.startedAt : '');
    } else {
      setText(r.currentTitle, view.isOver ? 'Il turno è concluso' : 'Nessun cliente in corso');
      setText(r.description, view.isOver ? 'Ritrovi qui i risultati del tuo turno.' : 'Quando sei disponibile, segui una persona in attesa.');
      setText(r.state, '');
      setText(r.started, '');
    }
    r.description.hidden = !r.description.textContent;
    r.state.hidden = !r.state.textContent;
    r.started.hidden = !r.started.textContent;
    r.progress.hidden = !active;
    const currentPhase = active ? phaseIndex(view.phase || active.stateLabel) : -1;
    r.stages.forEach((stage, i) => {
      stage.hidden = false;
      stage.classList.toggle('isDone', currentPhase >= 0 && i < currentPhase);
      stage.classList.toggle('isCurrent', i === currentPhase);
      if (i === currentPhase) stage.setAttribute('aria-current', 'step');
      else stage.removeAttribute('aria-current');
    });

    const stats = view.stats || {};
    Object.keys(r.stats).forEach(key => setText(r.stats[key], count(stats[key])));
    setText(r.extraStats, 'Accessori ' + count(stats.accessories) + ' · servizi ' + count(stats.services)
      + ' · assistenze ' + count(stats.helped) + ' · setup ' + count(stats.setups));
    const energy = view.energy || {};
    Object.keys(r.energy).forEach(key => setText(r.energy[key], Math.min(100, count(energy[key]))));
    r.energy.stress.parentElement.classList.toggle('isHigh', count(energy.stress) >= 70);

    const waiting = count(view.waiting);
    setText(r.queue, view.isOver ? 'Store chiuso' : waiting === 1 ? '1 persona in attesa' : waiting + ' persone in attesa');
    r.next.disabled = !view.canNext || Boolean(view.isOver);
    r.pause.disabled = !view.canPause || Boolean(view.isOver);
    r.focus.disabled = !view.enabled;
    setText(r.message, view.message);
    r.message.hidden = !r.message.textContent;

    const recent = Array.isArray(view.history) ? view.history.slice(0, 3) : [];
    r.recent.hidden = recent.length === 0;
    r.historyRows.forEach((row, i) => {
      const item = recent[i];
      row.row.hidden = !item;
      if (!item) return;
      setText(row.title, item.title || 'Cliente' + (item.id === undefined ? '' : ' #' + item.id));
      setText(row.time, item.time);
      setText(row.outcome, item.outcome);
    });
  }

  function bind(nextActions) {
    actions = nextActions || {};
    ensure();
  }

  window.PLSpecialistUI = { render, bind };
})();
