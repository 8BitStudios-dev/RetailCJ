(function () {
  'use strict';

  const MODES = [
    {
      id: 'observation',
      title: 'Osservazione',
      description: 'Il floor lavora da solo. Osserva clienti, colleghi e risultati.'
    },
    {
      id: 'career',
      title: 'Carriera · Specialist',
      description: 'Sei uno Specialist. Segui un cliente alla volta e i tuoi risultati.'
    }
  ];
  let refs = null;
  let actions = {};
  let currentMode = null;
  let currentSave = null;
  let storageAvailable = true;
  let importing = false;

  function node(tag, className, parent, content) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    parent.appendChild(element);
    return element;
  }

  function ensure() {
    const root = document.getElementById('modeChoices');
    if (!root) return null;
    if (refs && refs.root === root) return refs;

    root.replaceChildren();
    root.setAttribute('aria-label', 'Scegli la modalità di gioco');
    const resumeCard = node('div', 'careerResume', root);
    resumeCard.id = 'careerResumeCard';
    resumeCard.hidden = true;
    node('strong', 'careerResumeTitle', resumeCard, 'La tua Carriera');
    const summary = node('p', 'careerResumeSummary', resumeCard);
    const resumeDescription = node('p', 'careerResumeDescription', resumeCard);
    const resume = node('button', 'careerResumeButton on', resumeCard, 'Riprendi Carriera');
    resume.id = 'modeResumeCareer';
    resume.type = 'button';
    resume.dataset.careerAction = 'resume';
    const notice = node('p', 'gameModeNotice', root);
    notice.id = 'careerSaveNotice';
    notice.setAttribute('role', 'status');
    const buttons = MODES.map(mode => {
      const button = node('button', 'gameModeChoice', root);
      button.type = 'button';
      button.id = mode.id === 'observation' ? 'modeObservation' : 'modeCareer';
      button.dataset.gameMode = mode.id;
      node('strong', 'gameModeTitle', button, mode.title);
      node('span', 'gameModeDescription', button, mode.description);
      return button;
    });
    const backup = node('div', 'careerBackup', root);
    backup.setAttribute('aria-label', 'Backup della Carriera');
    const exportButton = node('button', 'careerBackupButton', backup, 'Esporta Carriera');
    exportButton.id = 'careerExport';
    exportButton.type = 'button';
    const importButton = node('button', 'careerBackupButton', backup, 'Importa Carriera');
    importButton.id = 'careerImport';
    importButton.type = 'button';
    const fileInput = node('input', '', backup);
    fileInput.id = 'careerImportFile';
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.hidden = true;
    node('p', 'careerBackupHelp', backup, 'Copia su file l’ultimo salvataggio. Un turno in corso riparte dall’apertura.');
    const backupStatus = node('p', 'careerBackupStatus', backup);
    backupStatus.id = 'careerBackupStatus';
    backupStatus.setAttribute('role', 'status');
    backupStatus.setAttribute('aria-live', 'polite');
    exportButton.addEventListener('click', () => {
      const text = window.PLCareerSave.exportBackup(currentSave);
      if (!text) return;
      let url;
      let link;
      try {
        url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        link = node('a', '', root);
        link.href = url;
        link.download = `RetailCJ-carriera-giorno-${currentSave.day}.json`;
        link.hidden = true;
        link.click();
        setText(backupStatus, 'Backup preparato. Conserva il file JSON per recuperare la Carriera.');
      } catch (error) {
        setText(backupStatus, 'Il browser non ha potuto esportare il file. Riprova.');
      } finally {
        if (link) link.remove();
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!file || importing) return;
      importing = true;
      render(currentMode);
      setText(backupStatus, 'Controllo del backup…');
      try {
        if (file.size > window.PLCareerSave.maxBackupBytes) {
          setText(backupStatus, 'Il file è troppo grande. Scegli un backup Carriera di massimo 64 KB.');
          return;
        }
        const parsed = window.PLCareerSave.parseBackup(await file.text());
        if (!parsed.ok) { setText(backupStatus, parsed.error); return; }
        const result = typeof actions.import === 'function' ? actions.import(parsed.snapshot) : { ok: false };
        setText(backupStatus, result.ok
          ? 'Carriera importata. Premi “Riprendi Carriera” per giocare.'
          : result.error || 'La Carriera non è stata importata. Riprova.');
      } catch (error) {
        setText(backupStatus, 'Non riesco a leggere questo file. Scegli un backup Carriera JSON.');
      } finally {
        importing = false;
        render(currentMode);
      }
    });
    root.addEventListener('click', event => {
      const resumeButton = event.target.closest('button[data-career-action="resume"]');
      if (resumeButton && root.contains(resumeButton) && !resumeButton.disabled) {
        if (typeof actions.resume === 'function') actions.resume();
        return;
      }
      const button = event.target.closest('button[data-game-mode]');
      if (!button || !root.contains(button) || button.disabled) return;
      if (typeof actions.choose === 'function') actions.choose(button.dataset.gameMode);
    });
    refs = { root, buttons, resumeCard, summary, resumeDescription, notice, resume,
      exportButton, importButton, backupStatus };
    return refs;
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function render(mode, saved = currentSave, available = storageAvailable) {
    currentMode = MODES.some(item => item.id === mode) ? mode : null;
    currentSave = saved;
    storageAvailable = available;
    const r = ensure();
    if (r) {
      r.exportButton.disabled = importing || !saved;
      r.importButton.disabled = importing;
      r.resume.disabled = importing;
      const back = document.getElementById('introBack');
      if (back) back.disabled = importing;
      r.resumeCard.hidden = !saved;
      if (saved) {
        const day = saved.phase === 'completed' ? saved.day % 31 + 1 : saved.day;
        setText(r.summary, `${day} gennaio · Competenza ${Math.round(saved.profile.comp)}`);
        setText(r.resumeDescription, saved.phase === 'completed'
          ? 'Turno concluso. Riparti dall’apertura del giorno successivo.'
          : 'Riparti dall’apertura di questa giornata con la crescita dei turni già conclusi.');
      }
      setText(r.notice, available
        ? 'La Carriera si salva all’apertura e a fine turno, in questo browser.'
        : 'Il browser non consente il salvataggio. I progressi restano solo in questa sessione.');
      r.buttons.forEach(button => {
        button.disabled = importing;
        button.classList.toggle('isSelected', button.dataset.gameMode === currentMode);
        if (button.dataset.gameMode === 'career') {
          setText(button.querySelector('.gameModeTitle'), saved ? 'Nuova Carriera' : 'Carriera · Specialist');
          setText(button.querySelector('.gameModeDescription'), saved
            ? 'Inizia dal 7 gennaio con uno Specialist alle prime armi.'
            : MODES.find(item => item.id === 'career').description);
        }
      });
    }
    const badge = document.getElementById('modeBadge');
    if (badge) {
      const selected = MODES.find(item => item.id === currentMode);
      const label = selected ? selected.title : '';
      if (badge.textContent !== label) badge.textContent = label;
      badge.dataset.gameMode = currentMode || '';
    }
  }

  function bind(nextActions) {
    actions = nextActions || {};
    render(currentMode);
  }

  window.PLGameModes = { bind, render };
})();
