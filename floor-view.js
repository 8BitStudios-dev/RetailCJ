(function (root) {
  'use strict';
  const api = root.PLFloorView;
  const canvas = document.getElementById('floor3d');
  if (!api || !canvas) return;

  const cameras = Array.from(document.querySelectorAll('[data-floor-view]'));
  const controls = document.getElementById('cameraControls');
  const status = document.getElementById('floorStatus');
  const retryButton = document.getElementById('floorRetry');
  const viewport = document.getElementById('floorViewport');
  const sizeButton = document.getElementById('floorSizeToggle');
  let renderer = null;
  let pending = null;
  let currentView = 'overview';
  let failure = null;
  let generation = 0;
  let expanded = false;

  function message(text) {
    if (status) status.textContent = text;
  }

  function careerPlayer() {
    return typeof api.player === 'function' ? api.player() : null;
  }

  function update() {
    const active = Boolean(api.active);
    const eligiblePlayer = Boolean(careerPlayer());
    cameras.forEach(button => {
      const playerButton = button.dataset.floorView === 'player';
      const selected = active && button.dataset.floorView === currentView;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
      if (playerButton) button.hidden = !eligiblePlayer;
      button.disabled = !active || (playerButton && !eligiblePlayer);
    });
    if (controls) controls.hidden = !active;
    if (viewport) viewport.classList.toggle('floorExpanded', expanded);
    document.body.classList.toggle('floorIsExpanded', expanded);
    if (sizeButton) {
      sizeButton.disabled = !active || !renderer;
      sizeButton.textContent = expanded ? 'Riduci' : 'Ingrandisci';
      sizeButton.setAttribute('aria-expanded', String(expanded));
    }
    if (retryButton) {
      retryButton.hidden = !failure;
      retryButton.disabled = Boolean(pending) && failure !== 'contextlost';
      retryButton.textContent = failure === 'contextlost' ? 'Riapri il gioco' : 'Riprova il 3D';
    }
    canvas.dataset.renderer = active ? 'threejs' : failure ? 'error' : 'loading';
  }

  function disconnect() {
    api.setReady(false);
    const previous = renderer;
    renderer = null;
    if (previous) {
      try { previous.dispose(); } catch (_) {}
    }
    api.attach(null);
  }

  function fail(reason) {
    generation++;
    failure = ['unsupported', 'import', 'contextlost'].includes(reason) ? reason : 'render';
    disconnect();
    update();
    message(failure === 'unsupported'
      ? 'Questo browser non rende disponibile WebGL 2. Attiva l’accelerazione grafica o apri il gioco con un browser compatibile.'
      : failure === 'contextlost'
        ? 'La connessione grafica si è interrotta. Riapri il gioco per riattivare il 3D.'
        : failure === 'import'
          ? 'Non riesco a caricare il floor 3D. La simulazione è in pausa: riprova.'
          : 'Il floor 3D si è interrotto. La simulazione è in pausa: riprova.');
    return false;
  }

  function syncCareerCamera() {
    const eligiblePlayer = Boolean(careerPlayer());
    currentView = eligiblePlayer ? 'player' : 'overview';
    document.body.classList.toggle('careerLayout', eligiblePlayer);
    expanded = false;
    try {
      update();
      if (api.active && renderer) api.setView(currentView);
      if (api.active) message('');
    } catch (_) { fail('render'); }
    return currentView === 'player';
  }

  function followPlayer() {
    if (!careerPlayer()) { update(); return false; }
    currentView = 'player';
    try {
      if (api.active && renderer) api.setView(currentView);
      update();
      if (api.active) message('');
    } catch (_) { fail('render'); return false; }
    return true;
  }

  function setSize(value) {
    const next = Boolean(value);
    if (!api.active || !renderer || next === expanded) return expanded;
    expanded = next;
    update();
    try { renderer.resize(); } catch (_) { fail('render'); }
    return expanded;
  }

  function toggleSize() {
    return setSize(!expanded);
  }

  function retry() {
    if (failure === 'contextlost') return Promise.resolve(false);
    if (pending) return pending;
    if (api.active && renderer) return Promise.resolve(true);
    if (typeof root.WebGL2RenderingContext !== 'function') return Promise.resolve(fail('unsupported'));

    const attempt = ++generation;
    let phase = 'import';
    failure = null;
    disconnect();
    message('Caricamento del floor 3D…');
    const work = import('./renderer-3d.js?v=2.0.1').then(({ FloorRenderer }) => {
      if (attempt !== generation) return false;
      phase = 'render';
      const candidate = new FloorRenderer({ canvas, onSelect: api.select });
      if (attempt !== generation) {
        try { candidate.dispose(); } catch (_) {}
        return false;
      }
      renderer = candidate;
      api.attach(renderer);
      currentView = careerPlayer() ? 'player' : currentView === 'player' ? 'overview' : currentView;
      api.setView(currentView);
      renderer.resize();
      api.setReady(true);
      update();
      message('');
      return Boolean(api.active);
    }).catch(() => attempt === generation ? fail(phase) : false).finally(() => {
      if (pending === work) pending = null;
      update();
    });
    pending = work;
    update();
    return work;
  }

  root.PLFloorViewUI = {
    retry,
    syncCareerCamera,
    followPlayer,
    setSize,
    toggleSize,
    fail,
    get expanded() { return expanded; },
    get ready() { return pending || Promise.resolve(Boolean(api.active)); },
  };

  cameras.forEach(button => button.addEventListener('click', () => {
    if (!api.active || !renderer) return;
    if (button.dataset.floorView === 'player') { followPlayer(); return; }
    currentView = button.dataset.floorView;
    try { api.setView(currentView); update(); message(''); } catch (_) { fail('render'); }
  }));
  if (sizeButton) {
    sizeButton.setAttribute('type', 'button');
    sizeButton.setAttribute('aria-controls', 'floor3d');
    sizeButton.addEventListener('click', toggleSize);
  }
  if (retryButton) retryButton.addEventListener('click', () => {
    if (failure === 'contextlost') {
      if (root.location && typeof root.location.reload === 'function') root.location.reload();
      return;
    }
    retry();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fail('contextlost');
  });
  root.addEventListener('resize', () => {
    if (!api.active || !renderer) return;
    try { renderer.resize(); } catch (_) { fail('render'); }
  });

  api.setReady(false);
  syncCareerCamera();
  retry();
})(window);
