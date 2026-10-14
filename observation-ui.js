(function () {
  'use strict';

  const FALLBACK_CHANNELS = [
    { id: 'sales', label: 'Vendita' }, { id: 'accessories', label: 'Accessori' },
    { id: 'express', label: 'Express' }, { id: 'appointments', label: 'Support · appuntamento' },
    { id: 'walkins', label: 'Support · senza appuntamento' }, { id: 'browse', label: 'Esplorazione' }
  ];
  const FALLBACK_TIERS = [
    { id: 'S', label: 'Specialist' }, { id: 'E', label: 'Expert' }, { id: 'P', label: 'Pro' },
    { id: 'TS', label: 'Technical Specialist' }, { id: 'TE', label: 'Technical Expert' },
    { id: 'G', label: 'Genius' }, { id: 'C', label: 'Creative' }, { id: 'CP', label: 'Creative Pro' },
    { id: 'OP', label: 'Operations' }, { id: 'L', label: 'Lead' }
  ];
  const FALLBACK_CONFIG = {
    day: 7, seed: 70427, weather: 'nuvoloso',
    demand: { sales: 1, accessories: 1, express: 1, appointments: 1, walkins: 1, browse: 1 },
    staff: { S: 8, E: 3, P: 2, TS: 6, TE: 3, G: 1, C: 1, CP: 1, OP: 3, L: 2 },
    formation: 'accoglienza', tactic: 'equilibrio', skill: 50, motivation: 70,
    stress: 20, delivery: 1, complexity: 0.25, patience: 1, noShow: 0.1, expressRunnerRate: 0.25, pattern: 'steady'
  };
  let actions = {};
  let refs = null;
  let draft = null;
  let configKey = null;
  let lastView = null;

  function model() { return window.PLObservation || {}; }
  function channels() { return model().channels || FALLBACK_CHANNELS; }
  function tiers() { return model().tiers || FALLBACK_TIERS; }
  function presets() { return model().presets || []; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function normalized(value) {
    if (typeof model().normalizeConfig === 'function') return model().normalizeConfig(value);
    const defaults = model().defaults || FALLBACK_CONFIG;
    return Object.assign({}, copy(defaults), value, {
      demand: Object.assign({}, defaults.demand, value && value.demand),
      staff: Object.assign({}, defaults.staff, value && value.staff)
    });
  }
  function node(tag, className, parent, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    if (parent) parent.appendChild(element);
    return element;
  }
  function setText(element, value) {
    const text = value === undefined || value === null ? '' : String(value);
    if (element.textContent !== text) element.textContent = text;
  }
  function number(value, decimals) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('it-IT', { maximumFractionDigits: decimals === undefined ? 0 : decimals });
  }
  function minutes(value) { return value === null || value === undefined ? '—' : number(value, 1) + ' min'; }
  function percent(value) { return value === null || value === undefined ? '—' : number(value, 1) + '%'; }
  function clock(value) {
    if (!Number.isFinite(Number(value))) return '—';
    const total = Math.floor(Number(value));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function button(parent, label, callback, className) {
    const element = node('button', className || '', parent, label);
    element.type = 'button';
    element.addEventListener('click', callback);
    return element;
  }
  function call(name) {
    const args = Array.prototype.slice.call(arguments, 1);
    if (typeof actions[name] === 'function') actions[name].apply(null, args);
  }
  function details(parent, label, className) {
    const element = node('details', className || 'observationDetails', parent);
    node('summary', '', element, label);
    return element;
  }
  function fieldset(parent, label) {
    const element = node('fieldset', 'observationFieldset', parent);
    node('legend', '', element, label);
    return element;
  }
  function setDraft(path, value) {
    if (!draft) return;
    const parts = path.split('.');
    if (parts.length === 2) draft[parts[0]][parts[1]] = value;
    else draft[path] = value;
    updateDraftState();
  }
  function input(parent, path, labelText, options) {
    const label = node('label', 'observationField ' + (options.type === 'range' ? 'observationRange' : ''), parent);
    const heading = node('span', 'observationFieldLabel', label);
    node('span', '', heading, labelText);
    const output = options.type === 'range' ? node('output', '', heading) : null;
    const control = node(options.choices ? 'select' : 'input', '', label);
    control.id = 'observation-' + path.replace('.', '-');
    if (options.choices) {
      options.choices.forEach(choice => {
        const option = node('option', '', control, choice[1]); option.value = choice[0];
      });
    } else {
      control.type = options.type || 'number';
      if (options.min !== undefined) control.min = options.min;
      if (options.max !== undefined) control.max = options.max;
      if (options.step !== undefined) control.step = options.step;
    }
    if (options.hint) {
      const hint = node('span', 'observationHint', label, options.hint);
      hint.id = control.id + '-hint'; control.setAttribute('aria-describedby', hint.id);
    }
    const field = { path, control, output, format: options.format || (value => number(value, 2)) };
    const updateValue = () => {
      const value = options.choices ? control.value : Number(control.value);
      if (!options.choices && !Number.isFinite(value)) return;
      setDraft(path, value);
      if (output) output.value = field.format(value);
    };
    if (!options.choices) control.addEventListener('input', updateValue);
    control.addEventListener('change', updateValue);
    return field;
  }
  function syncFields() {
    if (!refs || !draft) return;
    refs.fields.forEach(field => {
      const parts = field.path.split('.');
      const value = parts.length === 2 ? draft[parts[0]][parts[1]] : draft[field.path];
      field.control.value = value;
      if (field.output) field.output.value = field.format(value);
    });
    updateDraftState();
  }
  function updateDraftState() {
    if (!refs || !draft) return;
    const preview = normalized(draft);
    const changed = JSON.stringify(preview) !== configKey;
    const requestedStaff = tiers().reduce((sum, tier) => sum + Math.floor(Math.max(0, Math.min(20, Number(draft.staff[tier.id]) || 0))), 0);
    const appliedStaff = Object.values(preview.staff).reduce((sum, count) => sum + count, 0);
    setText(refs.staffPreview, requestedStaff > 80
      ? 'Richieste ' + number(requestedStaff) + ' persone: saranno distribuite su ' + number(appliedStaff) + ' posti, riducendo proporzionalmente i ruoli. Operations previsti: ' + number(preview.staff.OP) + '.'
      : 'Squadra prevista: ' + number(appliedStaff) + ' / 80 · Operations: ' + number(preview.staff.OP) + (preview.staff.OP === 0 ? '. Senza Operations gli ordini dal backstage restano in attesa.' : '.'));
    setText(refs.draftState, changed ? 'Modifiche da applicare · il floor attuale continua.' : 'Configurazione del floor attuale.');
    refs.draftState.classList.toggle('isChanged', changed);
  }

  function ensure() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return null;
    let root = document.getElementById('observationLab');
    if (!root) {
      const side = typeof document.querySelector === 'function' && document.querySelector('.side');
      if (!side) return null;
      root = node('section', 'box observationLab'); root.id = 'observationLab';
      side.prepend(root);
    }
    if (refs && refs.root === root) return refs;
    root.replaceChildren(); root.classList.add('observationLab');
    root.hidden = true; root.setAttribute('aria-label', 'Laboratorio Osservazione');
    const header = node('div', 'observationHeader', root);
    node('h2', '', header, 'Laboratorio CJ');
    const state = node('span', 'observationState', header, 'Osservazione');
    const intro = node('p', 'observationIntro', root, 'Cambia domanda e squadra. Osserva attese, abbandoni ed esperienza sul floor.');
    const stamp = node('div', 'observationStamp', root);

    const metrics = node('div', 'observationMetrics', root);
    const cards = {};
    [['entered', 'Clienti entrati'], ['wait', 'Attesa media'], ['nps', 'NPS'], ['abandonRate', 'Abbandoni']].forEach(item => {
      const card = node('div', 'observationMetric', metrics);
      cards[item[0]] = { value: node('strong', '', card, '—'), note: node('span', 'observationMetricNote', card) };
      node('span', 'observationMetricLabel', card, item[1]);
    });
    const totals = node('p', 'observationTotals', root);
    const channelWrap = node('div', 'observationTableWrap', root);
    const table = node('table', 'observationTable', channelWrap);
    node('caption', '', table, 'Customer Journey per servizio');
    const thead = node('thead', '', table); const headingRow = node('tr', '', thead);
    ['Servizio', 'Entrati', 'Conclusi', 'Persi', 'Attesa'].forEach(label => {
      const th = node('th', '', headingRow, label); th.scope = 'col';
    });
    const tbody = node('tbody', '', table);
    const channelRows = channels().map(channel => {
      const row = node('tr', '', tbody);
      const th = node('th', '', row, channel.label); th.scope = 'row';
      return { id: channel.id, entered: node('td', '', row, '0'), completed: node('td', '', row, '0'), lost: node('td', '', row, '0'), wait: node('td', '', row, '—') };
    });
    node('p', 'observationFootnote', root, 'Attesa sui percorsi terminati, sommata sulle fasi della visita. I dettagli per fase includono le code in corso. NPS sui questionari di acquisti e riparazioni conclusi.');

    const journeyDetails = details(root, 'Dove si accumula l’attesa');
    const phases = node('dl', 'observationPhaseList', journeyDetails);
    const secondaryMetrics = node('p', 'observationSecondaryMetrics', journeyDetails);

    const compare = details(root, 'Confronta A / B', 'observationDetails observationComparison');
    const referenceInfo = node('p', 'observationHint', compare);
    const compareResults = node('dl', 'observationCompareResults', compare);
    const compareButtons = node('div', 'observationButtonRow', compare);
    const capture = button(compareButtons, 'Registra riferimento A', () => call('capture'));
    capture.id = 'observationCapture';
    const clear = button(compareButtons, 'Cancella riferimento', () => call('clearReference'));
    clear.id = 'observationClearReference';
    node('p', 'observationHint', compare, 'Registra A, cambia una condizione e riparti con B. Il confronto si allinea allo stesso orario.');

    const configure = details(root, 'Configura scenario', 'observationDetails observationConfiguration');
    configure.id = 'observationConfiguration';
    const form = node('form', 'observationForm', configure);
    form.addEventListener('submit', event => { event.preventDefault(); call('apply', normalized(copy(draft))); });
    const presetLabel = node('label', 'observationField', form);
    node('span', 'observationFieldLabel', presetLabel, 'Scenari pronti');
    const presetSelect = node('select', '', presetLabel); presetSelect.id = 'observationPreset';
    node('option', '', presetSelect, 'Scegli uno scenario…').value = '';
    presets().forEach(preset => { node('option', '', presetSelect, preset.label).value = preset.id; });
    const presetDescription = node('p', 'observationHint', form, 'Parti da uno scenario o prepara il tuo.');
    presetSelect.addEventListener('change', () => {
      const preset = presets().find(item => item.id === presetSelect.value);
      if (!preset) return;
      draft = normalized(copy(preset.config)); syncFields(); setText(presetDescription, preset.description);
    });

    const fields = [];
    const demand = fieldset(form, 'Domanda per servizio');
    node('p', 'observationHint', demand, '1× è il flusso base. 0× ferma gli arrivi spontanei del servizio.');
    channels().forEach(channel => fields.push(input(demand, 'demand.' + channel.id, channel.label, {
      type: 'range', min: 0, max: 3, step: 0.05, format: value => number(value, 2) + '×'
    })));

    const staff = fieldset(form, 'Personale del turno');
    const staffGrid = node('div', 'observationStaffGrid', staff);
    tiers().forEach(tier => fields.push(input(staffGrid, 'staff.' + tier.id, tier.label, { min: 0, max: 20, step: 1 })));
    node('p', 'observationHint', staff, 'Massimo 80 persone per turno, compresi i Point. Oltre il limite, la squadra viene ridotta proporzionalmente mantenendo almeno una persona per ogni ruolo richiesto.');
    const staffPreview = node('p', 'observationHint', staff);
    staffPreview.id = 'observationStaffPreview'; staffPreview.setAttribute('role', 'status');

    const conditions = fieldset(form, 'Condizioni della squadra');
    fields.push(input(conditions, 'formation', 'Disposizione del floor', { choices: [['accoglienza', 'Accoglienza'], ['tavoli', 'Presidio dei tavoli'], ['essenziale', 'Copertura essenziale']] }));
    fields.push(input(conditions, 'tactic', 'Priorità', { choices: [['equilibrio', 'Equilibrio'], ['vendita', 'Vendita'], ['qualita', 'Qualità'], ['velocita', 'Velocità']] }));
    [['skill', 'Competenza iniziale'], ['motivation', 'Motivazione iniziale'], ['stress', 'Stress iniziale']].forEach(item => fields.push(input(conditions, item[0], item[1], { type: 'range', min: 0, max: 100, step: 5, format: value => number(value) + '/100' })));

    const advanced = details(form, 'Altre condizioni', 'observationDetails observationAdvanced');
    fields.push(input(advanced, 'weather', 'Meteo', { choices: [['sole', 'Sole'], ['nuvoloso', 'Nuvoloso'], ['pioggia', 'Pioggia']] }));
    fields.push(input(advanced, 'pattern', 'Distribuzione degli arrivi', { choices: [['steady', 'Durante la giornata'], ['afternoon', 'Picco pomeridiano']] }));
    fields.push(input(advanced, 'delivery', 'Tempo di consegna', { type: 'range', min: 0.5, max: 3, step: 0.25, format: value => number(value, 2) + '×', hint: 'Un valore alto mette più pressione su Operations.' }));
    fields.push(input(advanced, 'expressRunnerRate', 'Accessori Express dal backstage', { type: 'range', min: 0, max: 1, step: 0.05, format: value => number(value * 100) + '%', hint: 'Il cliente aspetta il runner di Operations; il collega Express può servire il prossimo cliente.' }));
    fields.push(input(advanced, 'complexity', 'Esigenze e riparazioni complesse', { type: 'range', min: 0, max: 1, step: 0.05, format: value => number(value * 100) + '%' }));
    fields.push(input(advanced, 'patience', 'Pazienza dei clienti', { type: 'range', min: 0.5, max: 2, step: 0.25, format: value => number(value, 2) + '×' }));
    fields.push(input(advanced, 'noShow', 'Appuntamenti non presentati', { type: 'range', min: 0, max: 1, step: 0.05, format: value => number(value * 100) + '%' }));
    const reproducibility = node('div', 'observationStaffGrid', advanced);
    fields.push(input(reproducibility, 'day', 'Giorno di gennaio', { min: 1, max: 31, step: 1 }));
    fields.push(input(reproducibility, 'seed', 'Codice scenario', { min: 1, max: 4294967295, step: 1 }));
    node('p', 'observationHint', advanced, 'Conserva giorno e codice per confrontare due scenari nelle stesse condizioni casuali.');
    const draftState = node('p', 'observationDraftState', form);
    const apply = node('button', 'on observationApply', form, 'Applica e riparti');
    apply.type = 'submit'; apply.id = 'observationApply';
    node('p', 'observationHint', form, 'Riparti dalle 10:00: i risultati del turno attuale vengono azzerati, il riferimento A resta.');
    const scenarioButtons = node('div', 'observationButtonRow', form);
    const replay = button(scenarioButtons, 'Ripeti scenario', () => call('replay'));
    replay.id = 'observationReplay';
    const reset = button(scenarioButtons, 'Scenario base', () => call('reset'));
    reset.id = 'observationReset';

    const live = details(root, 'Intervieni ora', 'observationDetails observationLive');
    node('p', 'observationHint', live, 'Gli interventi entrano nel turno in corso. Per isolare una causa, usa un confronto A / B senza altri interventi.');
    const arrivals = node('div', 'observationArrivalButtons', live);
    const liveButtons = channels().map(channel => {
      const control = button(arrivals, '+5 · ' + channel.label, () => call('inject', channel.id, 5));
      control.setAttribute('aria-label', 'Aggiungi 5 clienti: ' + channel.label); return control;
    });
    const staffAddition = node('div', 'observationStaffAddition', live);
    const liveStaffLabel = node('label', 'observationField', staffAddition);
    node('span', 'observationFieldLabel', liveStaffLabel, 'Rinforzo sul floor');
    const liveTier = node('select', '', liveStaffLabel); liveTier.id = 'observationAddTier';
    tiers().forEach(tier => { node('option', '', liveTier, tier.label).value = tier.id; });
    const addStaff = button(staffAddition, '+1 collega', () => call('addStaff', liveTier.value));
    addStaff.id = 'observationAddStaff'; liveButtons.push(addStaff);
    const support = button(live, 'Supporto al team', () => call('teamSupport'), 'observationSupport');
    support.id = 'observationTeamSupport'; liveButtons.push(support);
    node('p', 'observationHint', live, 'Il supporto dà +10 motivazione e riduce lo stress di 10 punti alla squadra.');
    const capacity = node('p', 'observationCapacity', root);
    const notice = node('p', 'observationNotice', root); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    node('p', 'observationFootnote observationModelNote', root, 'Questo laboratorio confronta situazioni simulate: i risultati aiutano a leggere il modello, non sono previsioni di un negozio reale.');

    const tools = [header, intro, stamp, configure, live];
    const remaining = Array.from(root.children).filter(child => !tools.includes(child));
    root.replaceChildren.apply(root, tools.concat(remaining));
    const controls = document.getElementById('observationControls');
    if (controls) controls.replaceChildren(configure, live, compare);

    refs = { root, controls, state, stamp, cards, totals, channelRows, phases, secondaryMetrics,
      referenceInfo, compareResults, capture, clear, fields, draftState, staffPreview, liveButtons, liveTier,
      capacity, notice, presetSelect, presetDescription };
    return refs;
  }

  function renderComparison(view, r) {
    const reference = view.reference;
    r.clear.disabled = !reference;
    r.capture.disabled = !view.report || Number(view.report.time) < 600;
    r.compareResults.replaceChildren();
    if (!reference) {
      setText(r.referenceInfo, 'Nessun riferimento: registra i risultati del floor attuale come A.');
      return;
    }
    const a = reference.report || reference;
    const pending = view.pendingTarget;
    if (pending !== null && pending !== undefined && pending !== false) {
      const target = typeof pending === 'object' ? pending.time : pending;
      setText(r.referenceInfo, 'Riferimento A alle ' + clock(a.time) + ' · B si fermerà allo stesso orario (' + clock(target) + ').');
    } else if (!view.comparison || !view.comparison.ok) {
      setText(r.referenceInfo, 'Riferimento A alle ' + clock(a.time) + ' · ' + (view.comparison && view.comparison.reason || 'Porta B allo stesso orario per confrontare i risultati.'));
    } else {
      setText(r.referenceInfo, 'A / B alle ' + clock(a.time) + ' · differenza di B rispetto ad A.');
      const delta = view.comparison.deltas || {};
      [['wait', 'Attesa', ' min', -1], ['abandonRate', 'Abbandoni', ' punti %', -1], ['nps', 'NPS', ' punti', 1], ['completed', 'Visite concluse', '', 1]].forEach(item => {
        node('dt', '', r.compareResults, item[1]);
        const value = delta[item[0]];
        const dd = node('dd', '', r.compareResults, value === null || value === undefined ? '—' : (value > 0 ? '+' : '') + number(value, 1) + item[2]);
        if (Number.isFinite(value) && value !== 0) dd.classList.add(value * item[3] > 0 ? 'isBetter' : 'isWorse');
      });
    }
  }

  function render(view) {
    const r = ensure();
    if (!r || !view) return;
    lastView = view;
    r.root.hidden = !view.active || Boolean(view.modePicking);
    if (r.controls) r.controls.hidden = r.root.hidden;
    if (r.root.hidden) return;
    const nextConfig = normalized(view.config || model().defaults || FALLBACK_CONFIG);
    const nextKey = JSON.stringify(nextConfig);
    if (!draft || nextKey !== configKey) {
      configKey = nextKey; draft = copy(nextConfig); syncFields();
      r.presetSelect.value = '';
      setText(r.presetDescription, 'Parti da uno scenario o prepara il tuo.');
    }
    const report = view.report || {};
    const m = report.metrics || {};
    setText(r.state, view.over ? 'Turno concluso' : 'Osservazione');
    setText(r.stamp, 'Gennaio · giorno ' + (report.day || nextConfig.day) + ' · ' + clock(report.time) + ' · codice ' + (report.seed || nextConfig.seed));
    setText(r.cards.entered.value, number(m.entered));
    setText(r.cards.entered.note, 'Persone uniche');
    setText(r.cards.wait.value, minutes(m.wait));
    setText(r.cards.wait.note, 'Tutte le fasi');
    setText(r.cards.nps.value, number(m.nps, 1));
    setText(r.cards.nps.note, number(m.npsN) + ' questionari');
    setText(r.cards.abandonRate.value, percent(m.abandonRate));
    setText(r.cards.abandonRate.note, number(m.lost) + ' clienti persi');
    setText(r.totals, 'Conclusi ' + number(m.completed) + ' · percorsi aperti ' + number(m.active) + ' · reindirizzati ' + number(m.redirected) + (view.over ? ' · incompleti ' + number(m.unfinished) : ''));
    r.channelRows.forEach(row => {
      const channel = (report.channels || []).find(item => item.id === row.id) || {};
      setText(row.entered, number(channel.entered === undefined ? 0 : channel.entered));
      setText(row.completed, number(channel.completed === undefined ? 0 : channel.completed));
      setText(row.lost, number(channel.lost === undefined ? 0 : channel.lost));
      setText(row.wait, channel.wait === null || channel.wait === undefined ? '—' : number(channel.wait, 1) + 'm');
    });
    r.phases.replaceChildren();
    (report.phases || []).forEach(phase => {
      node('dt', '', r.phases, phase.label);
      node('dd', '', r.phases, minutes(phase.wait) + ' · n=' + number(phase.n));
    });
    if (!(report.phases || []).length) node('div', 'observationHint', r.phases, 'Le attese vengono misurate quando iniziano le visite.');
    setText(r.secondaryMetrics, 'Esperienza media ' + number(m.experience, 1) + '/100 · errori ' + number(m.errors) + '\nConsegna media ' + minutes(m.delivery) + ' (' + number(m.deliveryN) + ' consegne)\nMotivazione ' + number(m.motivation, 1) + ' · stress ' + number(m.stress, 1));
    renderComparison(view, r);
    r.liveButtons.forEach(control => { control.disabled = Boolean(view.over); });
    r.liveTier.disabled = Boolean(view.over);
    const staff = report.staff || {};
    setText(r.capacity, 'Squadra sul turno: ' + number(staff.total) + ' · addetti alle riparazioni: ' + number(staff.repairers) + (staff.repairers === 0 ? '. Le riparazioni richiedono personale abilitato.' : ''));
    r.capacity.classList.toggle('isWarning', staff.repairers === 0);
    setText(r.notice, view.notice || ''); r.notice.hidden = !view.notice;
  }

  window.PLObservationUI = {
    bind: function (nextActions) { actions = nextActions || {}; ensure(); if (lastView) render(lastView); },
    render: render
  };
}());
