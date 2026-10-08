(function (root) {
  'use strict';

  const version = document.querySelector('meta[name="application-version"]').getAttribute('content');
  const bound = new WeakSet();
  let actions = {};
  let refreshing = false;

  function feedback(message) {
    document.querySelectorAll('[data-app-update-status]').forEach(element => {
      element.textContent = message;
    });
    document.querySelectorAll('[data-app-update]').forEach(button => {
      button.disabled = refreshing;
    });
  }

  function refresh() {
    if (refreshing) return false;
    if (typeof actions.hasActiveShift === 'function' && actions.hasActiveShift() &&
        typeof root.confirm === 'function' &&
        !root.confirm('Aggiornare l’app? Il turno in corso si interrompe. La Carriera ripartirà dall’ultimo salvataggio, all’apertura.')) return false;
    refreshing = true;
    feedback('Aggiornamento dell’app…');
    try {
      const url = new root.URL(root.location.href);
      url.searchParams.set('app-update', String(Date.now()));
      root.location.replace(url.href);
      return true;
    } catch (error) {
      refreshing = false;
      feedback('Non riesco a ricaricare l’app. Riprova.');
      return false;
    }
  }

  function bind(nextActions) {
    actions = nextActions || {};
    document.querySelectorAll('[data-app-version]').forEach(element => {
      element.textContent = 'Versione ' + version;
    });
    document.querySelectorAll('[data-app-update]').forEach(button => {
      if (bound.has(button)) return;
      button.addEventListener('click', refresh);
      bound.add(button);
    });
  }

  root.PLAppUpdate = { version, bind, refresh };
})(window);
