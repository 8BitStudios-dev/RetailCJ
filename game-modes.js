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
    node('p', 'gameModeNotice', root, 'Scegliere una modalità avvia una nuova giornata.');
    const buttons = MODES.map(mode => {
      const button = node('button', 'gameModeChoice', root);
      button.type = 'button';
      button.id = mode.id === 'observation' ? 'modeObservation' : 'modeCareer';
      button.dataset.gameMode = mode.id;
      node('strong', 'gameModeTitle', button, mode.title);
      node('span', 'gameModeDescription', button, mode.description);
      return button;
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('button[data-game-mode]');
      if (!button || !root.contains(button) || button.disabled) return;
      if (typeof actions.choose === 'function') actions.choose(button.dataset.gameMode);
    });
    refs = { root, buttons };
    return refs;
  }

  function render(mode) {
    currentMode = MODES.some(item => item.id === mode) ? mode : null;
    const r = ensure();
    if (r) {
      r.buttons.forEach(button => {
        button.classList.toggle('isSelected', button.dataset.gameMode === currentMode);
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
