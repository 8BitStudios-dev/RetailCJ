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

  function normalizedLine(value) {
    return String(value || '').toLowerCase().replace(/[«»“”"'’]/g, '').replace(/\s+/g, ' ').trim();
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
    const commands = document.getElementById('playerCommands');
    if (!root || !commands) return null;
    if (refs && refs.root === root) return refs;

    root.replaceChildren();
    commands.replaceChildren();
    root.classList.add('playerPanel');
    root.setAttribute('aria-label', 'Il tuo turno da Specialist');
    const header = node('div', 'playerHeader', root);
    node('h2', 'playerTitle', header, 'Il tuo turno');
    const identity = node('div', 'playerIdentity', header);
    const name = node('strong', '', identity, 'Tu');
    const role = node('span', 'playerRole', identity, 'Specialist');
    const status = node('div', 'playerStatus', root);
    status.setAttribute('role', 'status');
    const shift = node('div', 'playerShift', root);
    shift.id = 'playerShift';

    const career = node('section', 'playerCareer', root);
    career.hidden = true;
    career.setAttribute('aria-label', 'Il tuo percorso di Carriera');
    node('h3', 'playerCareerTitle', career, 'La tua Carriera');
    const ladder = node('ol', 'playerCareerRoles', career);
    ladder.setAttribute('aria-label', 'Ruoli della Carriera');
    const careerRoles = window.PLCareerProgression.roles.map(item => {
      const row = node('li', 'playerCareerRole', ladder);
      row.dataset.careerTier = item.tier;
      node('strong', '', row, item.label);
      const label = node('span', 'playerCareerRoleState', row);
      return {row, label};
    });
    const careerSummary = node('div', 'playerCareerSummary', career);
    const careerLabel = node('span', '', careerSummary);
    careerLabel.id = 'careerProgressLabel';
    const careerValue = node('strong', 'playerCareerValue', careerSummary);
    const careerBar = node('div', 'playerCareerBar', career);
    careerBar.id = 'careerProgress';
    careerBar.setAttribute('role', 'progressbar');
    careerBar.setAttribute('aria-labelledby', 'careerProgressLabel');
    careerBar.setAttribute('aria-valuemin', '0');
    careerBar.setAttribute('aria-valuemax', '100');
    const careerFill = node('span', '', careerBar);
    careerFill.setAttribute('aria-hidden', 'true');
    const promotion = node('div', 'playerPromotion', root);
    promotion.hidden = true;
    const careerHint = node('p', 'playerCareerHint', promotion);
    careerHint.id = 'careerPromotionHint';
    const promote = button(promotion, 'promote', '', 'playerPromote on');
    promote.id = 'careerPromote';
    promote.setAttribute('aria-describedby', 'careerPromotionHint');

    const queueSummary = node('div', 'playerQueueSummary', commands);
    const queue = node('span', 'playerQueue', queueSummary);
    const browsing = node('span', 'playerBrowsing', queueSummary);
    const controls = node('div', 'playerControls', commands);
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Gestisci le visite');
    const next = button(controls, 'next', 'Prossimo cliente', 'playerNext on');
    next.setAttribute('aria-label', 'Segui il prossimo cliente');
    const autoLabel = node('label', 'playerAutoNext', controls);
    const autoNext = node('input', '', autoLabel);
    autoNext.type = 'checkbox';
    autoNext.id = 'playerAutoNext';
    autoNext.dataset.specialistAutoNext = '';
    autoNext.setAttribute('aria-label', 'Auto: vai al prossimo cliente in coda');
    autoNext.setAttribute('aria-describedby', 'playerAutoNextHelp');
    node('span', '', autoLabel, 'Auto');
    const autoHelp = node('span', 'playerControlHint', commands,
      'Con Auto segui la coda quando sei libero. Ingaggia resta manuale.');
    autoHelp.id = 'playerAutoNextHelp';
    autoNext.addEventListener('change', () => {
      if (typeof actions.setAutoNext === 'function') actions.setAutoNext(Boolean(autoNext.checked));
    });
    const engage = button(controls, 'engage', 'Ingaggia', 'playerEngage');
    engage.setAttribute('aria-label', 'Ingaggia un cliente che sta esplorando');
    const pause = button(controls, 'pause', 'Pausa', 'playerPause');
    pause.setAttribute('aria-label', 'Pausa 15 min');

    const current = node('div', 'playerCurrent', root);
    root.insertBefore(commands, current);
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
    const feedback = node('div', 'playerInteractionFeedback', current);
    feedback.hidden = true;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    const interaction = node('section', 'playerInteraction', current);
    interaction.hidden = true;
    interaction.setAttribute('aria-label', 'Interazione con il cliente');
    const interactionHeader = node('div', 'playerInteractionHeader', interaction);
    const interactionPhase = node('strong', 'playerInteractionPhase', interactionHeader);
    const timer = node('span', 'playerDecisionTimer', interactionHeader);
    timer.setAttribute('aria-live', 'off');
    const speaker = node('div', 'playerSpeaker', interaction);
    const speech = node('p', 'playerSpeech', interaction);
    const cue = node('p', 'playerCue', interaction);
    const leadHint = node('p', 'playerLeadHint', interaction);
    const choices = node('div', 'playerChoices', interaction);
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'Scegli come proseguire');
    const choiceRows = Array.from({ length: 3 }, () => {
      const control = node('button', 'playerChoice', choices);
      control.type = 'button';
      control.dataset.specialistChoice = '';
      control.disabled = true;
      const heading = node('span', 'playerChoiceHeading', control);
      const label = node('strong', 'playerChoiceLabel', heading);
      const meta = node('span', 'playerChoiceMeta', heading);
      const minutes = node('span', 'playerChoiceMinutes', meta);
      const recommendation = node('span', 'playerChoiceRecommendation', meta);
      node('span', 'playerRecommendationFull', recommendation, 'Consiglio del Lead');
      node('span', 'playerRecommendationShort', recommendation, 'Lead');
      const detail = node('span', 'playerChoiceDetail', control);
      recommendation.hidden = true;
      control.addEventListener('keydown', event => {
        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
      });
      return { control, label, detail, minutes, recommendation, optionId: null, token: null, canChoose: false };
    });
    const choiceFootnote = node('p', 'playerChoiceFootnote', interaction,
      'Il tempo scorre anche durante le scelte. I minuti indicano il lavoro necessario.');
    const choiceHelp = node('details', 'playerDecisionHelp playerMobileDetails', interaction);
    choiceHelp.id = 'playerChoiceHelp';
    node('summary', '', choiceHelp, 'Aiuto e dettagli');
    const helpCue = node('p', 'playerHelpCue', choiceHelp);
    const helpLead = node('p', 'playerHelpLead', choiceHelp);
    const explanations = node('ol', 'playerChoiceExplanations', choiceHelp);
    const explanationRows = Array.from({ length: 3 }, () => {
      const item = node('li', '', explanations);
      const label = node('strong', '', item);
      const detail = node('span', '', item);
      return { item, label, detail };
    });
    choiceHelp.appendChild(choiceFootnote);
    choiceHelp.appendChild(feedback);
    const result = node('section', 'playerInteractionResult', current);
    result.hidden = true;
    result.setAttribute('aria-label', 'Risultato della conversazione');
    const resultDetails = node('details', 'playerResultDetails', result);
    const resultSummary = node('summary', '', resultDetails);
    const resultTitle = node('strong', 'playerResultTitle', resultSummary);
    const resultMeta = node('span', 'playerResultMeta', resultSummary);
    const resultFeedback = node('ul', 'playerResultFeedback', resultDetails);
    const resultRows = Array.from({ length: 2 }, () => node('li', '', resultFeedback));
    const visitHint = node('div', 'playerDescription', current, 'L’ascolto accompagna tutta la visita. Acquisto, servizi e Setup fanno parte del percorso.');
    const visitDetails = node('details', 'playerVisitDetails playerMobileDetails', current);
    visitDetails.id = 'playerVisitDetails';
    node('summary', '', visitDetails, 'Dettagli visita');
    const visitIdentity = node('p', '', visitDetails);
    const visitStatus = node('p', '', visitDetails);
    const visitShift = node('p', '', visitDetails);
    const visitDescription = node('p', '', visitDetails);
    const visitState = node('p', '', visitDetails);
    const visitStarted = node('p', '', visitDetails);

    const turnDetails = node('details', 'playerTurnDetails', root);
    node('summary', '', turnDetails, 'Il turno e i tuoi progressi');
    const turnAutoLabel = node('label', 'playerAutoNextSetting', turnDetails);
    const turnAutoNext = node('input', '', turnAutoLabel);
    turnAutoNext.type = 'checkbox';
    turnAutoNext.id = 'playerTurnAutoNext';
    turnAutoNext.setAttribute('aria-label', 'Auto coda nelle prossime visite');
    node('span', '', turnAutoLabel, 'Auto coda nelle prossime visite');
    turnAutoNext.addEventListener('change', () => {
      if (typeof actions.setAutoNext === 'function') actions.setAutoNext(Boolean(turnAutoNext.checked));
    });
    turnDetails.appendChild(shift);
    const metrics = node('div', 'playerMetrics', turnDetails);
    const stats = {};
    [['served', 'Clienti conclusi'], ['sales', 'Dispositivi consegnati'], ['open', 'Visite aperte']].forEach(([key, label]) => {
      const metric = node('div', 'playerMetric', metrics);
      stats[key] = node('strong', '', metric, '0');
      node('span', '', metric, label);
    });
    const extraStats = node('div', 'playerExtraStats', turnDetails);

    const energyRow = node('div', 'playerEnergy', root);
    root.insertBefore(energyRow, turnDetails);
    const energy = {};
    [['motivation', 'Motivazione'], ['stress', 'Stress'], ['competence', 'Competenza']].forEach(([key, label]) => {
      const badge = node('span', 'playerEnergyBadge', energyRow);
      node('span', '', badge, label);
      energy[key] = node('b', '', badge, '0');
    });
    const learning = node('div', 'playerLearning', turnDetails);
    learning.id = 'playerLearning';
    const factors = node('details', 'playerFactors', turnDetails);
    node('summary', '', factors, 'I tre fattori');
    node('p', '', factors, 'Motivazione: clima della squadra, supporto dei colleghi e riconoscimento dei Lead.');
    node('p', '', factors, 'Stress: impegno sul floor ed errori. Pause e riposo aiutano a recuperare.');
    node('p', '', factors, 'Competenza: cresce lavorando e con la formazione. Lo stress riduce i nuovi punti appresi; la competenza acquisita resta.');

    const message = node('div', 'playerMessage', root);
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');

    const recent = node('div', 'playerRecent', turnDetails);
    node('h3', '', recent, 'Ultimi clienti');
    const history = node('ol', 'playerHistory', recent);
    const historyRows = Array.from({ length: 3 }, () => {
      const row = node('li', '', history);
      const title = node('strong', '', row);
      const time = node('span', 'playerHistoryTime', row);
      const outcome = node('div', 'playerHistoryOutcome', row);
      return { row, title, time, outcome };
    });

    refs = { root, commands, name, role, status, shift, learning, career, careerRoles, careerLabel, careerValue, careerBar,
      careerFill, careerHint, promote, promotion, currentTitle, description, state, started, progress,
      stages, interaction, interactionPhase, timer, speaker, speech, cue, leadHint, choiceRows, choiceFootnote, feedback,
      choiceHelp, helpCue, helpLead, explanationRows, visitDetails, visitIdentity, visitStatus, visitShift,
      visitDescription, visitState, visitStarted, result, resultTitle, resultMeta, resultRows, visitHint, submittedToken: null,
      current, stats, extraStats, energy, queue, browsing, next, autoNext, engage, pause,
      turnDetails, turnAutoNext, message, recent, historyRows };
    for (const container of [root]) {
      container.addEventListener('click', event => {
        const choiceControl = event.target.closest('button[data-specialist-choice]');
        if (choiceControl && container.contains(choiceControl)) {
          if (choiceControl.disabled || event.detail > 1 || typeof actions.choose !== 'function') return;
          const choice = refs.choiceRows.find(row => row.control === choiceControl);
          if (!choice || choice.optionId === null || refs.submittedToken === choice.token) return;
          const optionId = choice.optionId;
          const token = choice.token;
          refs.submittedToken = token;
          refs.choiceRows.forEach(row => { row.control.disabled = true; });
          if (actions.choose(optionId, token) === false && refs.submittedToken === token) {
            refs.submittedToken = null;
            refs.choiceRows.forEach(row => { row.control.disabled = !row.canChoose; });
          }
          return;
        }
        const control = event.target.closest('button[data-specialist-action]');
        if (!control || !container.contains(control) || control.disabled) return;
        const action = actions[control.dataset.specialistAction];
        if (typeof action === 'function') action();
      });
    }
    return refs;
  }

  function render(view) {
    const r = ensure();
    if (!r || !view) return;
    r.root.hidden = !view.enabled;
    r.commands.hidden = !view.enabled;
    r.root.classList.toggle('isChoosing', Boolean(view.enabled && view.interaction));
    if (!view.enabled) return;

    setText(r.name, view.name || 'Tu');
    setText(r.role, view.role || 'Specialist');
    r.root.setAttribute('aria-label', 'Il tuo turno da ' + (view.role || 'Specialist'));
    setText(r.status, view.status || (view.isOver ? 'Turno concluso' : 'Pronto sul floor'));
    r.root.classList.toggle('needsBreak', Boolean(view.needsBreak));
    const shift = view.shift;
    const clock = value => String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0');
    setText(r.shift, shift ? `${shift.weeklyHours} h/settimana · ${shift.hours} h al giorno · ${clock(shift.start)}–${clock(shift.end)}` : '');
    r.shift.hidden = !shift;
    const career = view.career;
    r.career.hidden = true;
    r.promotion.hidden = !career || !career.nextRole || career.progress < 100;
    if (career) {
      const value = Math.max(0, Math.min(100, Number(career.progress) || 0));
      const displayed = Math.floor(value);
      const nextRole = career.nextRole;
      const nextLabel = nextRole && (typeof nextRole === 'string' ? nextRole : nextRole.label);
      r.career.classList.toggle('isComplete', Boolean(career.complete));
      r.careerRoles.forEach((item, i) => {
        const current = i === career.index;
        const completed = i < career.index || (current && career.complete);
        item.row.classList.toggle('isCurrent', current);
        item.row.classList.toggle('isDone', completed);
        setText(item.label, completed ? 'Completato' : current ? 'Tu sei qui' : 'Da fare');
        if (current) item.row.setAttribute('aria-current', 'step');
        else item.row.removeAttribute('aria-current');
      });
      setText(r.careerLabel, 'Competenza · ' + career.role);
      setText(r.careerValue, displayed + ' / 100');
      r.careerBar.setAttribute('aria-valuenow', String(value));
      r.careerBar.setAttribute('aria-valuetext', value + ' su 100 come ' + career.role);
      r.careerFill.style.width = value + '%';
      r.promote.hidden = !nextLabel;
      r.promote.disabled = value < 100 || !career.canPromote;
      if (nextLabel) {
        setText(r.promote, 'Promuoviti a ' + nextLabel);
        setText(r.careerHint, value >= 100 && !career.canPromote
          ? 'Promuoviti quando sei libero dalle visite e fuori pausa. Come ' + nextLabel + ' riparti da 0/100.'
          : value >= 100 ? 'Sei pronto: come ' + nextLabel + ' la competenza riparte da 0/100.'
          : 'A 100/100 puoi diventare ' + nextLabel + '. La competenza riparte da 0/100.');
      } else {
        setText(r.careerHint, career.complete
          ? 'Percorso completato: hai raggiunto 100/100 come Lead.'
          : 'Sei Lead. Raggiungi 100/100 per completare il percorso.');
      }
    }
    const active = view.active;
    r.root.classList.toggle('hasClient', Boolean(active));
    r.current.hidden = !active && !view.lastInteraction;
    if (active) {
      const id = active.id === undefined || active.id === null ? '' : ' #' + active.id;
      setText(r.currentTitle, 'Cliente' + id + (active.productLabel ? ' · ' + active.productLabel : ''));
      setText(r.description, active.description);
      setText(r.state, active.stateLabel || view.phase || 'In corso');
      setText(r.started, active.startedAt ? 'Iniziato alle ' + active.startedAt : '');
    } else {
      setText(r.currentTitle, view.isOver ? 'Il turno è concluso' : view.lastInteraction ? 'Ultima conversazione' : 'Pronto sul floor');
      setText(r.description, view.isOver ? 'Ritrovi qui i risultati del tuo turno.' : '');
      setText(r.state, '');
      setText(r.started, '');
    }
    r.description.hidden = !r.description.textContent;
    r.state.hidden = !r.state.textContent;
    r.started.hidden = !r.started.textContent;
    [[r.visitIdentity, r.name.textContent + ' · ' + r.role.textContent], [r.visitStatus, r.status.textContent],
      [r.visitShift, r.shift.textContent], [r.visitDescription, r.description.textContent],
      [r.visitState, r.state.textContent], [r.visitStarted, r.started.textContent]].forEach(([element, value]) => {
      setText(element, value);
      element.hidden = !element.textContent;
    });
    r.progress.hidden = !active;
    const conversation = view.interaction;
    const currentPhase = active ? phaseIndex(conversation && conversation.phase || view.phase || active.stateLabel) : -1;
    r.stages.forEach((stage, i) => {
      stage.hidden = false;
      stage.classList.toggle('isDone', currentPhase >= 0 && i < currentPhase);
      stage.classList.toggle('isCurrent', i === currentPhase);
      if (i === currentPhase) stage.setAttribute('aria-current', 'step');
      else stage.removeAttribute('aria-current');
    });

    const feedbackText = value => {
      if (Array.isArray(value)) return value.map(feedbackText).filter(Boolean).join(' ');
      if (value && typeof value === 'object') return String(value.text || value.message || '');
      return value === undefined || value === null ? '' : String(value);
    };
    r.interaction.hidden = !conversation;
    r.visitHint.hidden = Boolean(conversation || view.lastInteraction);
    if (conversation) {
      const phase = phaseIndex(conversation.phase);
      setText(r.interactionPhase, conversation.phaseLabel || (phase >= 0 ? STAGES[phase] : 'La tua scelta'));
      setText(r.speaker, conversation.speaker || 'Il cliente');
      setText(r.speech, conversation.speech);
      r.speech.hidden = !r.speech.textContent;
      setText(r.cue, conversation.cue);
      r.cue.hidden = !r.cue.textContent;
      setText(r.helpCue, conversation.cue);
      r.helpCue.hidden = !r.helpCue.textContent;
      const hint = conversation.guided && conversation.hint
        ? String(conversation.hint).replace(/^(?:il\s+)?lead\s*[:—–-]\s*/i, '') : '';
      setText(r.leadHint, hint ? 'Il Lead: ' + hint : '');
      r.leadHint.hidden = !r.leadHint.textContent;
      setText(r.helpLead, r.leadHint.textContent);
      r.helpLead.hidden = !r.helpLead.textContent;
      const seconds = Number(conversation.secondsLeft);
      const hasTimer = conversation.secondsLeft !== null && conversation.secondsLeft !== undefined && Number.isFinite(seconds);
      r.timer.hidden = Boolean(conversation.complete);
      if (view.interactionEnabled === false) {
        setText(r.timer, 'Scelte sospese');
        r.timer.classList.remove('isNearEnd');
      } else if (hasTimer) {
        setText(r.timer, Math.max(0, Math.ceil(seconds)) + ' s per scegliere');
        r.timer.classList.toggle('isNearEnd', seconds <= 5);
      } else {
        setText(r.timer, 'Il turno continua');
        r.timer.classList.remove('isNearEnd');
      }
      r.choiceFootnote.hidden = Boolean(conversation.complete);
      const options = Array.isArray(conversation.options) ? conversation.options.slice(0, 3) : [];
      r.choiceRows.forEach((row, i) => {
        const option = options[i];
        row.control.hidden = !option || Boolean(conversation.complete);
        row.optionId = option ? option.id : null;
        row.token = conversation.token;
        row.control.dataset.specialistChoice = option ? String(option.id) : '';
        row.control.dataset.choiceToken = String(conversation.token || '');
        row.canChoose = Boolean(option) && !conversation.complete && view.interactionEnabled !== false;
        row.control.disabled = !row.canChoose || r.submittedToken === conversation.token;
        const explanation = r.explanationRows[i];
        explanation.item.hidden = !option;
        if (!option) return;
        setText(row.label, option.label);
        setText(row.detail, option.detail);
        row.detail.hidden = !row.detail.textContent;
        setText(explanation.label, option.label);
        setText(explanation.detail, option.detail);
        explanation.detail.hidden = !explanation.detail.textContent;
        const duration = Number(option.minutes);
        const hasDuration = option.minutes !== undefined && option.minutes !== null && Number.isFinite(duration);
        setText(row.minutes, hasDuration ? Math.max(0, Math.round(duration * 10) / 10).toLocaleString('it-IT') + ' min di turno' : '');
        row.minutes.hidden = !hasDuration;
        row.recommendation.hidden = !(conversation.guided && option.recommended);
        row.control.classList.toggle('isRecommended', Boolean(conversation.guided && option.recommended));
      });
      const reply = feedbackText(conversation.feedback);
      setText(r.feedback, normalizedLine(reply) === normalizedLine(conversation.speech) ? '' : reply);
    } else {
      r.choiceRows.forEach(row => { row.control.disabled = true; row.optionId = null; row.canChoose = false; });
      setText(r.feedback, view.lastInteraction && view.lastInteraction.reply || '');
    }
    r.feedback.hidden = !r.feedback.textContent;
    const lastInteraction = view.lastInteraction;
    r.result.hidden = !lastInteraction || Boolean(conversation);
    if (lastInteraction) {
      setText(r.resultTitle, lastInteraction.qualityLabel || 'Visita conclusa');
      const minutes = Number(lastInteraction.minutes);
      const decisions = Number(lastInteraction.decisions);
      const resultDetails = [];
      if (Number.isFinite(minutes)) resultDetails.push(Math.max(0, Math.round(minutes * 10) / 10).toLocaleString('it-IT') + ' min di turno');
      if (Number.isFinite(decisions)) resultDetails.push(count(decisions) + ' scelte');
      setText(r.resultMeta, resultDetails.join(' · '));
      const remarks = Array.isArray(lastInteraction.feedback) ? lastInteraction.feedback.slice(0, 2) : [lastInteraction.feedback];
      r.resultRows.forEach((row, i) => {
        setText(row, feedbackText(remarks[i]));
        row.hidden = !row.textContent;
      });
    }

    const stats = view.stats || {};
    Object.keys(r.stats).forEach(key => setText(r.stats[key], count(stats[key])));
    setText(r.extraStats, 'Accessori ' + count(stats.accessories) + ' · servizi ' + count(stats.services)
      + ' · assistenze ' + count(stats.helped) + ' · setup ' + count(stats.setups));
    const energy = view.energy || {};
    Object.keys(r.energy).forEach(key => setText(r.energy[key], key === 'competence'
      ? (Math.floor(Math.max(0, Math.min(100, Number(energy[key]) || 0)) * 10) / 10).toLocaleString('it-IT')
      : Math.min(100, count(energy[key]))));
    r.energy.stress.parentElement.classList.toggle('isHigh', count(energy.stress) >= 70);
    const rate = window.PLCareerProgression.learningRate({ stress: energy.stress });
    setText(r.learning, 'Apprendimento attuale: ' + Math.round(rate * 100) + '% · meno stress, più crescita');

    const waiting = count(view.waiting);
    setText(r.queue, view.isOver ? 'Turno concluso' : waiting === 1 ? '1 persona in attesa' : waiting + ' persone in attesa');
    const browsers = count(view.browsing);
    setText(r.browsing, browsers === 1 ? '1 visitatore disponibile' : browsers + ' visitatori disponibili');
    r.autoNext.checked = Boolean(view.autoNext);
    r.autoNext.disabled = Boolean(view.isOver);
    r.turnAutoNext.checked = Boolean(view.autoNext);
    r.turnAutoNext.disabled = Boolean(view.isOver);
    r.next.disabled = !view.canNext || Boolean(view.isOver);
    r.engage.disabled = !view.canEngage || Boolean(view.isOver);
    r.pause.disabled = !view.canPause || Boolean(view.isOver);
    setText(r.message, view.engagement && view.engagement.message || view.message);
    r.message.hidden = !r.message.textContent || r.message.textContent === r.feedback.textContent
      || Boolean(conversation);

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
