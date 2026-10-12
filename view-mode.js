(function (root) {
  'use strict';
  const api = root.PLFloorView;
  const canvas = document.getElementById('floor3d');
  if (!api || !canvas) return;

  const buttons = Array.from(document.querySelectorAll('[data-floor-mode]'));
  const cameras = Array.from(document.querySelectorAll('[data-floor-view]'));
  const statuses = Array.from(document.querySelectorAll('[data-floor-status]'));
  const cameraControls = document.getElementById('cameraControls');
  const label = document.getElementById('rendererLabel');
  const supports3D = typeof root.WebGL2RenderingContext === 'function';
  let renderer = null;
  let pending = null;
  let desiredMode = '2d';
  let currentView = 'overview';
  let unavailable = !supports3D;

  function remember(mode) {
    try { root.localStorage.setItem('plgame.view', mode); } catch (_) {}
  }

  function message(text) {
    statuses.forEach(status => { status.textContent = text; });
  }

  function update() {
    const active = Boolean(api.active);
    buttons.forEach(button => {
      const selected = button.dataset.floorMode === (active ? '3d' : '2d');
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = button.dataset.floorMode === '3d' && (unavailable || Boolean(pending));
    });
    cameras.forEach(button => {
      const selected = active && button.dataset.floorView === currentView;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = !active;
    });
    if (cameraControls) cameraControls.hidden = !active;
    if (label) label.textContent = active ? 'Floor in 3D · BETA' : 'Pianta 2D';
    canvas.hidden = !active;
    canvas.dataset.renderer = active ? 'threejs' : 'inactive';
  }

  function fallback(reason) {
    desiredMode = '2d';
    remember('2d');
    api.setMode(false);
    if (renderer) {
      try { renderer.dispose(); } catch (_) {}
      renderer = null;
    }
    api.attach(null);
    // A lost graphics context needs a fresh page before it can be used again.
    if (reason === 'contextlost' || !supports3D) unavailable = true;
    update();
    message(reason === 'contextlost'
      ? 'Il 3D si è interrotto. La vista 2D resta disponibile, con la stessa giornata.'
      : unavailable
        ? 'Vista 2D attiva. Il 3D non è disponibile in questo browser; puoi continuare a giocare.'
        : 'Non riesco a caricare il 3D. Puoi continuare in 2D o riprovare il pulsante 3D.');
    return false;
  }

  function activate() {
    if (desiredMode !== '3d' || !renderer || unavailable) return false;
    api.setMode(true);
    update();
    if (!api.active || !renderer) return false;
    api.setView(currentView);
    renderer.resize();
    message('Vista 3D attiva. Seleziona una persona o un tavolo per seguirne la visita.');
    return Boolean(api.active);
  }

  function selectMode(mode) {
    if (mode !== '2d' && mode !== '3d') return Promise.resolve(Boolean(api.active));
    desiredMode = mode;
    remember(mode);
    if (mode === '2d') {
      api.setMode(false);
      update();
      message(unavailable
        ? 'Vista 2D attiva. Il 3D non è disponibile in questo browser; puoi continuare a giocare.'
        : 'Vista 2D attiva. Puoi passare al 3D quando vuoi.');
      return Promise.resolve(false);
    }
    if (unavailable) return Promise.resolve(fallback());
    if (renderer) {
      try { return Promise.resolve(activate()); } catch (_) { return Promise.resolve(fallback()); }
    }
    if (pending) return pending;
    message('Caricamento della vista 3D… La giornata continua; puoi restare in 2D.');
    pending = import('./renderer-3d.js?v=1.9.0').then(({ BetaFloorRenderer }) => {
      renderer = new BetaFloorRenderer({ canvas, onSelect: api.select });
      api.attach(renderer);
      if (desiredMode === '3d') return activate();
      update();
      return false;
    }).catch(() => fallback()).finally(() => {
      pending = null;
      update();
    });
    update();
    return pending;
  }

  root.PLFloorViewUI = {
    selectMode,
    fallback,
    get ready() { return pending || Promise.resolve(Boolean(api.active)); },
  };

  buttons.forEach(button => button.addEventListener('click', () => selectMode(button.dataset.floorMode)));
  cameras.forEach(button => button.addEventListener('click', () => {
    if (!api.active || !renderer) return;
    currentView = button.dataset.floorView;
    try { api.setView(currentView); update(); } catch (_) { fallback(); }
  }));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fallback('contextlost');
  });
  root.addEventListener('resize', () => {
    if (!api.active || !renderer) return;
    try { renderer.resize(); } catch (_) { fallback(); }
  });

  api.setMode(false);
  update();
  message(unavailable
    ? 'Vista 2D attiva. Il 3D non è disponibile in questo browser; puoi continuare a giocare.'
    : 'Vista 2D attiva. Puoi passare al 3D quando vuoi.');
  let savedMode = '2d';
  try { savedMode = root.localStorage.getItem('plgame.view') || '2d'; } catch (_) {}
  if (savedMode === '3d') selectMode('3d');
})(window);
