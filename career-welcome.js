(function (root) {
  'use strict';

  const pages = [
    {
      title: 'Dal Core al floor',
      text: 'Hai completato il Core, dove ti abbiamo raccontato i valori di Apple. Ora passiamo alla parte operativa: è il momento di conoscere il floor e accompagnare i clienti nelle loro visite.',
      detail: 'Sono Cristina, una Lead. All’inizio ti guideremo noi: prenditi il tempo di osservare, ascoltare e fare esperienza insieme al team.',
      tip: 'Specialist: 20 ore/settimana, 5 turni da 4 ore (10:00–14:00). Si parte da competenza 0 / 100.'
    },
    {
      title: 'Ogni cliente, un’esperienza',
      text: 'Vogliamo che tu faccia più che consegnare il prodotto richiesto. Connetti e personalizza: scopri come quella persona userà il dispositivo e aiutala a trovare la soluzione più adatta.',
      detail: 'Racconta ciò che offriamo: accessori, AppleCare, Trade In, Setup e soluzioni per chi lavora. Collegali ai bisogni del cliente: una buona proposta rende l’esperienza più completa.',
      tip: 'Approach · Probe · Present · Listen · Extend. Le cinque fasi ti accompagnano; l’ascolto continua per tutta la visita.'
    },
    {
      title: 'La pratica ti farà crescere',
      text: 'Nei primi tre turni un Lead ti affianca: trovi indicazioni semplici e una scelta consigliata. Puoi recuperare dagli errori e imparare senza dover andare in pausa dopo ogni sbaglio. Il tempo del turno continua anche mentre scegli.',
      detail: 'All’inizio ogni visita richiede più tempo; con la pratica diventi più sicuro e veloce. Visite e formazione fanno crescere la competenza fino a 100: poi puoi promuoverti. Expert: 30 ore/settimana, 6 al giorno; Pro e Lead: 40 ore, 8 al giorno. Nel nuovo ruolo riparti da 0 conservando la rapidità acquisita.',
      tip: 'Motivazione dal sostegno della squadra, stress dal lavoro e dagli errori, competenza dalla pratica. Lo stress alto riduce l’apprendimento: quando hai bisogno di recuperare, finisci con il cliente e fai una pausa di 15 minuti.'
    }
  ];
  let actions = {};
  let refs;
  let index = 0;
  let active = false;
  let newCareer = false;
  let entering = false;
  let returnFocus;

  function render() {
    const page = pages[index];
    refs.step.textContent = `Benvenuto in Carriera · ${index + 1} di ${pages.length}`;
    refs.title.textContent = page.title;
    refs.text.textContent = page.text;
    refs.detail.textContent = page.detail;
    refs.tip.textContent = page.tip;
    refs.prev.disabled = index === 0;
    refs.next.textContent = index < pages.length - 1 ? 'Continua' : newCareer ? 'Inizia la Carriera' : 'Torna alle modalità';
    refs.steps.forEach((step, i) => {
      step.classList.toggle('isCurrent', i === index);
      if (i === index) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    refs.title.focus?.();
  }

  function close() {
    if (!refs) return;
    active = false;
    refs.panel.hidden = true;
    refs.menu.hidden = false;
  }

  function cancel() {
    if (!active || entering) return;
    close();
    returnFocus?.focus?.();
  }

  function next() {
    if (!active || entering) return;
    if (index < pages.length - 1) { index++; render(); return; }
    if (!newCareer) { cancel(); return; }
    entering = true;
    try {
      if (typeof actions.enter === 'function' && actions.enter() !== false) close();
    } finally { entering = false; }
  }

  function bind(nextActions) {
    actions = nextActions || {};
    if (refs) return;
    const get = id => document.getElementById(id);
    refs = {
      panel: get('careerWelcome'), menu: get('introMenu'), step: get('careerWelcomeStep'),
      title: get('careerWelcomeTitle'), text: get('careerWelcomeText'), detail: get('careerWelcomeDetail'),
      tip: get('careerWelcomeTip'), prev: get('careerWelcomePrev'), next: get('careerWelcomeNext'),
      steps: get('careerWelcomeSteps').querySelectorAll('li')
    };
    refs.prev.addEventListener('click', () => {
      if (active && index > 0 && !entering) { index--; render(); }
    });
    refs.next.addEventListener('click', next);
    get('careerWelcomeCancel').addEventListener('click', cancel);
    document.addEventListener('keydown', event => {
      if (active && event.key === 'Escape') { event.preventDefault(); cancel(); }
    });
  }

  function open(options = {}) {
    if (!refs || entering) return false;
    returnFocus = document.activeElement;
    index = 0;
    active = true;
    newCareer = options.newCareer === true;
    refs.menu.hidden = true;
    refs.panel.hidden = false;
    refs.panel.parentElement.scrollTop = 0;
    render();
    return true;
  }

  root.PLCareerWelcome = { bind, open, close, active: () => active };
})(window);
