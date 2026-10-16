/* Five decisions, one conversation. This module never changes a visitor or a profile. */
(function (root) {
  'use strict';

  const PHASES = ['approach', 'probe', 'present', 'listen', 'extend'];
  const LABELS = ['Approach · Accogli', 'Probe · Scopri', 'Present · Proponi', 'Listen · Ascolta', 'Extend · Completa'];
  const TUTORIAL_HINTS = [
    ['Parti da un’accoglienza semplice e lascia parlare il cliente.', 'Scopri il bisogno con una domanda aperta.',
      'Mostra un esempio collegato a ciò che hai ascoltato.', 'Puoi tornare sul dubbio: non devi sapere già tutto.', 'Ricapitola con calma il prossimo passo.'],
    ['Conferma da quale esigenza partire.', 'Cerca l’utilizzo concreto che guiderà la proposta.',
      'Collega la soluzione al bisogno emerso.', 'Verifica che l’esempio sia stato utile.', 'Un accessorio serve quando completa davvero quell’utilizzo.'],
    ['Concorda il ritmo della visita.', 'Una domanda mirata può evitare passaggi inutili.',
      'Scegli le informazioni utili per questa persona.', 'Chiarisci il dubbio prima di proseguire.', 'Riepiloga e proponi solo i servizi pertinenti, rispettando i rifiuti.'],
  ];
  let nextSession = 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const number = (value, fallback) => Number.isFinite(value) ? value : fallback;
  function hash(value) {
    let result = 2166136261;
    for (const letter of String(value)) result = Math.imul(result ^ letter.charCodeAt(0), 16777619);
    return result >>> 0;
  }

  // These are fictional needs, not promises about prices, eligibility or coverage.
  const STORIES = {
    data: {
      junior: 'Vorrei cambiare dispositivo, ma ho paura di perdere foto e messaggi. Non so come passarli su quello nuovo.',
      expert: 'Vorrei cambiarlo. Qui dentro però ho tutte le mie foto…',
      probe: 'Mi interessa soprattutto ritrovare le mie cose e riuscire a usare il nuovo dispositivo.',
      reveal: 'Il vecchio funziona ancora. Prima di lasciarlo vorrei essere sicuro di avere tutto sul nuovo.',
      worry: 'E se poi le mie foto non ci fossero?',
      close: 'Bene, mi basta sapere come affrontare il passaggio senza perdere nulla.',
      cue: 'Il cliente torna spesso sulle foto e guarda il vecchio dispositivo.',
      ask: 'Chiedi come conserva i dati e cosa vuole trasferire',
      askDetail: 'Capisci la situazione prima di spiegare i passaggi.',
      present: 'Mostra il passaggio dei dati e verifica cosa serve',
      presentDetail: 'Collega la soluzione alla sua preoccupazione, senza garantire un trasferimento prima delle verifiche.',
      recovery: 'Riprendi il dubbio sui dati e verifica insieme il percorso',
      recoveryDetail: 'Chiarisci cosa controllerete e quale aiuto è disponibile.',
      extend: 'Concorda il supporto alla configurazione',
      extendDetail: 'Spiega il prossimo passaggio e lascia spazio alle ultime domande.',
      extension: 'setup', response: 'Sapere come iniziare mi tranquillizza.',
    },
    travel: {
      junior: 'Parto spesso e il dispositivo mi serve tutto il giorno. Vorrei capire autonomia e ricarica quando sono fuori.',
      expert: 'Tra un viaggio e l’altro la batteria arriva sempre al limite.',
      probe: 'Lo uso per orientarmi, lavorare e tenere i contatti mentre viaggio.',
      reveal: 'Passo molte ore fuori. La sera a volte non riesco nemmeno a trovare una presa.',
      worry: 'Ho già tanti oggetti nella borsa: non vorrei aggiungere cose inutili.',
      close: 'Vorrei una soluzione pratica per quando sono in movimento.',
      cue: 'Il cliente descrive una giornata lontano dalle prese di corrente.',
      ask: 'Chiedi come si svolge una giornata di viaggio',
      askDetail: 'Individui quando autonomia e ricarica diventano davvero un problema.',
      present: 'Mostra una soluzione legata a utilizzo e autonomia',
      presentDetail: 'Confronta ciò che serve in viaggio senza elencare ogni specifica.',
      recovery: 'Chiedi cosa porta già con sé e riduci la proposta',
      recoveryDetail: 'Tieni solo gli elementi utili e compatibili con le sue abitudini.',
      extend: 'Verifica se serve un accessorio di ricarica compatibile',
      extendDetail: 'Parti da quello che possiede già; aggiungilo solo se completa la soluzione.',
      extension: 'accessory', response: 'Così capisco cosa mi serve davvero quando parto.',
    },
    business: {
      junior: 'Lo userò per la mia attività. Devo gestire appuntamenti e documenti e vorrei capire quali soluzioni avete per il lavoro.',
      expert: 'Mi serve anche per seguire l’attività, non soltanto per me.',
      probe: 'Lavoro in proprio e devo tenere insieme clienti, appuntamenti e documenti.',
      reveal: 'Vorrei separare meglio ciò che faccio per lavoro e capire a chi rivolgermi.',
      worry: 'Non ho tempo per configurare un sistema troppo complicato.',
      close: 'Se c’è un riferimento per la mia attività, mi farebbe comodo conoscerlo.',
      cue: 'Parla di clienti, documenti e della propria attività.',
      ask: 'Chiedi quali attività deve svolgere per lavoro',
      askDetail: 'Scopri il contesto prima di proporre una soluzione business.',
      present: 'Mostra come la soluzione aiuta nel suo lavoro',
      presentDetail: 'Usa un esempio concreto legato ad appuntamenti e documenti.',
      recovery: 'Concentrati sul primo utilizzo e chiarisci il supporto',
      recoveryDetail: 'Riduci i passaggi iniziali e verifica quali aspetti desidera approfondire.',
      extend: 'Introduci il contatto per le soluzioni business',
      extendDetail: 'Chiedi se vuole approfondire e spiega il prossimo passo, senza promesse commerciali.',
      extension: 'business', response: 'Sì, avere un riferimento per la mia attività è utile.',
    },
    budget: {
      junior: 'Vorrei cambiare dispositivo senza spendere più del necessario. Ho ancora quello vecchio: possiamo capire se ha un valore?',
      expert: 'Mi interessa il nuovo, ma devo fare bene i conti. Ho portato anche il vecchio.',
      probe: 'Voglio capire il costo complessivo e conservare ciò che posso già usare.',
      reveal: 'Se possiamo verificare la permuta, mi aiuta a decidere. Non voglio costi aggiunti senza motivo.',
      worry: 'Questa cifra comprende tutto o ci sono altre cose da aggiungere?',
      close: 'Prima di decidere vorrei avere chiari i prossimi passaggi e il totale.',
      cue: 'Chiede il costo complessivo e mostra il dispositivo attuale.',
      ask: 'Chiedi priorità di spesa e cosa possiede già',
      askDetail: 'Distingui gli elementi necessari da quelli facoltativi.',
      present: 'Confronta una soluzione adeguata e il costo complessivo',
      presentDetail: 'Spiega cosa è incluso e cosa è facoltativo; la permuta richiede una valutazione.',
      recovery: 'Ricapitola i costi e togli gli extra che non servono',
      recoveryDetail: 'Rispondi al dubbio sul totale prima di aggiungere altre possibilità.',
      extend: 'Proponi di verificare il dispositivo per il Trade In',
      extendDetail: 'Richiedi la valutazione senza anticipare un importo garantito.',
      extension: 'tradeIn', response: 'Grazie, prima la valutazione e poi posso decidere con chiarezza.',
    },
    protection: {
      junior: 'Mi è già caduto il dispositivo una volta. Vorrei capire come proteggerlo e quali possibilità di assistenza ci sono.',
      expert: 'Il precedente è finito a terra. Preferirei non ripetere l’esperienza.',
      probe: 'Lo porto sempre con me e voglio capire come gestire un eventuale problema.',
      reveal: 'Una protezione fisica mi interessa, ma vorrei anche capire l’assistenza.',
      worry: 'La protezione e l’assistenza sono la stessa cosa? Non mi è chiaro.',
      close: 'Ora vorrei scegliere sapendo cosa copre ogni soluzione.',
      cue: 'Racconta una caduta e chiede come affrontare eventuali problemi.',
      ask: 'Chiedi come usa il dispositivo e cosa lo preoccupa',
      askDetail: 'Capisci se cerca protezione fisica, assistenza o entrambe.',
      present: 'Distingui protezione fisica e opzioni di assistenza',
      presentDetail: 'Spiega AppleCare verificando le condizioni applicabili, senza promettere coperture assolute.',
      recovery: 'Chiarisci la differenza con un esempio concreto',
      recoveryDetail: 'Verifica che il cliente abbia capito prima di chiedergli di scegliere.',
      extend: 'Chiedi se desidera aggiungere l’assistenza illustrata',
      extendDetail: 'Lascia scegliere liberamente dopo aver chiarito condizioni e limiti.',
      extension: 'service', response: 'Ora posso scegliere: mi interessa approfondire questa possibilità.',
    },
    decided: {
      junior: 'Ho già scelto il modello e conosco le caratteristiche. Vorrei verificare che sia quello giusto e concludere rapidamente.',
      expert: 'Ho già confrontato i modelli. Mi serve quello che ho indicato.',
      probe: 'Ho già controllato le funzioni. Voglio soltanto essere sicuro della configurazione.',
      reveal: 'La configurazione che ho scelto corrisponde a quello che mi serve.',
      worry: 'Possiamo evitare una spiegazione completa? Ho già fatto le mie ricerche.',
      close: 'Grazie. Per accessori e servizi sono già a posto.',
      cue: 'Nomina una configurazione precisa e chiede di concludere.',
      ask: 'Conferma configurazione e una priorità essenziale',
      askDetail: 'Una verifica mirata evita di ripetere un confronto già fatto.',
      present: 'Ricapitola la scelta e verifica che corrisponda alla richiesta',
      presentDetail: 'Confermi i punti essenziali senza rifare l’intera dimostrazione.',
      recovery: 'Riconosci la richiesta e passa ai punti essenziali',
      recoveryDetail: 'Rispetta il ritmo del cliente e lascia aperta la possibilità di fare domande.',
      extend: 'Conferma che non serva altro e spiega il prossimo passo',
      extendDetail: 'Rispetti il suo rifiuto degli extra e chiudi con chiarezza.',
      extension: 'none', response: 'Perfetto, era proprio quello che volevo fare.',
    },
    family: {
      junior: 'Lo useremo in famiglia. Ci interessa che sia facile da usare e vorremmo capire le impostazioni per i figli.',
      expert: 'Non lo userò soltanto io. Dobbiamo metterci d’accordo anche a casa.',
      probe: 'Le persone che lo useranno hanno abitudini diverse. Per i figli vogliamo fare attenzione alle impostazioni.',
      reveal: 'Ci serve un esempio semplice per capire se tutti riusciremo a usarlo.',
      worry: 'Ho paura che tutte queste impostazioni siano difficili da gestire.',
      close: 'Ci aiuterebbe sapere come iniziare e dove trovare aiuto per la configurazione.',
      cue: 'Parla di più utilizzatori e di impostazioni per la famiglia.',
      ask: 'Chiedi chi lo userà e quali esigenze hanno',
      askDetail: 'Fai emergere una priorità condivisa prima di scegliere la soluzione.',
      present: 'Mostra un utilizzo quotidiano e le impostazioni pertinenti',
      presentDetail: 'Usa un esempio comprensibile senza aprire ogni menu disponibile.',
      recovery: 'Dividi la configurazione in pochi passaggi comprensibili',
      recoveryDetail: 'Concentrati su ciò che serve per iniziare e verifica la comprensione.',
      extend: 'Concorda il supporto per la prima configurazione',
      extendDetail: 'Chiarisci chi userà il prodotto e quali impostazioni vuole approfondire.',
      extension: 'setup', response: 'Bene, sapere da dove partire ci aiuta.',
    },
    accessories: {
      junior: 'Cerco un accessorio per il dispositivo che ho già. Vorrei essere sicuro della compatibilità e non comprare quello sbagliato.',
      expert: 'Mi manca solo un accessorio. Questo è il dispositivo con cui deve funzionare.',
      probe: 'Mi serve per un utilizzo preciso, ma non ricordo quale versione sia compatibile.',
      reveal: 'Possiamo verificare modello e utilizzo prima di scegliere?',
      worry: 'Come faccio a essere sicuro che funzioni con quello che ho?',
      close: 'Mi basta l’accessorio adatto a questo utilizzo.',
      cue: 'Mostra il dispositivo e chiede conferma della compatibilità.',
      ask: 'Verifica modello e utilizzo previsto dell’accessorio',
      askDetail: 'Controlli le informazioni necessarie senza procedere per somiglianza.',
      present: 'Mostra l’accessorio adatto e verifica la compatibilità',
      presentDetail: 'Collega la scelta all’utilizzo richiesto, senza inventare disponibilità.',
      recovery: 'Ricontrolla la compatibilità prima di confermare',
      recoveryDetail: 'Meglio una verifica in più che una promessa senza riscontro.',
      extend: 'Ricapitola l’uso dell’accessorio e il prossimo passo',
      extendDetail: 'Completi la richiesta senza aggiungere altri oggetti non necessari.',
      extension: 'accessory', response: 'Grazie, cercavo proprio una conferma prima di scegliere.',
    },
    help: {
      junior: 'Ho già il dispositivo. Vorrei soltanto capire come fare una cosa e provare insieme i passaggi.',
      expert: 'Per l’acquisto sono a posto. C’è però una cosa che non riesco a fare.',
      probe: 'Vorrei riuscire a rifarlo da solo quando torno a casa.',
      reveal: 'Se mi mostra i passaggi sul mio dispositivo capisco meglio.',
      worry: 'Quando lo fa lei sembra semplice, ma temo di non ricordarmelo.',
      close: 'Vorrei riprovare io, così capisco se ho imparato.',
      cue: 'Ha già il prodotto e chiede aiuto su un utilizzo preciso.',
      ask: 'Chiedi cosa vuole fare e dove si blocca',
      askDetail: 'Individui il passaggio che manca prima di dare una spiegazione.',
      present: 'Guida il cliente mentre prova sul proprio dispositivo',
      presentDetail: 'Un passaggio alla volta, lasciando a lui il controllo.',
      recovery: 'Fai riprovare il passaggio e ascolta cosa resta poco chiaro',
      recoveryDetail: 'Verifichi l’autonomia invece di ripetere la stessa spiegazione.',
      extend: 'Lascia riprovare il cliente e indica dove ritrovare aiuto',
      extendDetail: 'Concludi la richiesta di aiuto senza trasformarla in una vendita.',
      extension: 'none', response: 'Adesso riesco a farlo anche da solo.',
    },
    usage: {
      junior: 'Vorrei capire se questo dispositivo è adatto al mio utilizzo.',
      expert: 'Ho in mente un utilizzo preciso. Possiamo partire da quello?',
      probe: 'Vorrei provarlo su qualcosa che faccio davvero durante la giornata.',
      reveal: 'Un esempio pratico mi aiuterebbe a capire se è la soluzione adatta.',
      worry: 'Le caratteristiche sembrano interessanti, ma vorrei capire cosa cambia per me.',
      close: 'Mi interessa completare la soluzione con ciò che serve davvero al mio utilizzo.',
      cue: 'Descrive un utilizzo concreto e cerca una dimostrazione pertinente.',
      ask: 'Chiedi un esempio concreto del suo utilizzo',
      askDetail: 'Scegli una dimostrazione a partire da ciò che vuole riuscire a fare.',
      present: 'Mostra la funzione collegata al bisogno emerso',
      presentDetail: 'Un esempio pertinente rende comprensibili le caratteristiche del dispositivo.',
      recovery: 'Riprendi l’utilizzo descritto e fai provare il passaggio',
      recoveryDetail: 'Verifica insieme al cliente se l’esempio risponde alla sua richiesta.',
      extend: 'Verifica se serve un accessorio per quell’utilizzo',
      extendDetail: 'Collega l’accessorio al bisogno e controlla quello che possiede già.',
      extension: 'accessory', response: 'Questo completa l’utilizzo che avevo in mente.',
    },
  };

  function selectStory(customer, seed) {
    if (customer.kind === 'help') return 'help';
    if (customer.kind === 'acc') return 'accessories';
    if (customer.tradeIn) return 'budget';
    if (customer.setup && customer.familiarity === 0 && customer.product !== 'watch') return 'data';
    if (customer.fast) return 'decided';
    if (customer.needStatement || customer.needFeature) return 'usage';
    const need = String(customer.need || '').toLowerCase();
    const named = [
      ['data', /dat[ai]|foto|trasfer|setup|configur/], ['travel', /viagg|travel|batter|autonom/],
      ['business', /business|lavor|attivit/], ['budget', /budget|prezzo|spesa|trade|permut/],
      ['protection', /protez|care|assisten|cadut/], ['family', /famigl|figl/],
      ['decided', /decis|veloc|fast/], ['accessories', /accessor|compatibil/],
    ].find(entry => entry[1].test(need));
    if (named && !(customer.product === 'watch' && named[0] === 'data')) return named[0];
    if (customer.product === 'watch') return ['budget', 'protection', 'decided'][seed % 3];
    return ['data', 'travel', 'business', 'budget', 'protection', 'decided', 'family'][seed % 7];
  }

  function create(inputCustomer, inputProfile, options = {}) {
    // Only capture primitives used here; live simulation objects can keep evolving independently.
    const c = {};
    ['id', 'kind', 'product', 'need', 'hurry', 'familiarity', 'fast', 'tradeIn', 'setup', 'accessory', 'service', 'business', 'tradeOnly']
      .forEach(key => { c[key] = inputCustomer && inputCustomer[key]; });
    const need = c.need && typeof c.need === 'object' ? c.need : null;
    const needText = key => need && typeof need[key] === 'string' ? need[key].trim() : '';
    c.needStatement = needText('says');
    c.needFeature = needText('feature');
    c.needAccessory = needText('acc');
    if (need) c.need = ['who', 'says', 'feature', 'acc'].map(needText).filter(Boolean).join(' · ');
    const p = {
      tier: inputProfile && inputProfile.tier || 'S',
      comp: clamp(number(inputProfile && inputProfile.comp, 0), 0, 100),
      stress: clamp(number(inputProfile && inputProfile.stress, 0), 0, 100),
    };
    const seed = hash([c.id, c.kind, c.product, c.need, c.hurry, c.familiarity].join('|'));
    const storyKey = selectStory(c, seed);
    const story = { ...STORIES[storyKey] };
    if (storyKey === 'usage') {
      if (c.needStatement) {
        story.junior = c.needStatement;
        story.expert = c.needStatement;
        story.probe = c.needStatement;
        story.cue = 'Il cliente descrive un utilizzo preciso. Cerca il collegamento con ciò che puoi mostrargli.';
      }
      if (c.needFeature) {
        story.reveal = 'Mi interessa capire meglio questo aspetto: ' + c.needFeature + '.';
        story.present = 'Mostra ' + c.needFeature;
      }
      if (c.needAccessory) {
        story.extend = 'Verifica se può essere utile ' + c.needAccessory;
        story.extendDetail = 'Collega la proposta all’utilizzo emerso e verifica compatibilità e necessità.';
      }
    }
    const acceptsOptional = story.extension !== 'service' || seed % 3 !== 0;
    const sessionId = (++nextSession).toString(36) + '-' + seed.toString(36);
    const suppliedTutorial = options && options.tutorial;
    const tutorial = suppliedTutorial && Number.isInteger(suppliedTutorial.day) && suppliedTutorial.day >= 1 && suppliedTutorial.day <= 3 ? {
      day: suppliedTutorial.day,
      title: typeof suppliedTutorial.title === 'string' ? suppliedTutorial.title : '',
      focus: typeof suppliedTutorial.focus === 'string' ? suppliedTutorial.focus : '',
      leadMessage: typeof suppliedTutorial.leadMessage === 'string' ? suppliedTutorial.leadMessage : '',
      ...Object.fromEntries(['workStressMultiplier', 'decisionStressMultiplier', 'errorStressMultiplier']
        .map(key => [key, Number.isFinite(suppliedTutorial[key]) ? suppliedTutorial[key] : 1])),
    } : null;
    const guided = Boolean(tutorial) || p.tier === 'S' && p.comp < 25;
    const progression = root.PLCareerProgression;
    const roleIndex = Math.max(0, ['S', 'E', 'P', 'L'].indexOf(p.tier));
    const learningTime = progression && typeof progression.learningTime === 'function'
      ? progression.learningTime(p) : Math.max(0.8, 2.2 - 0.35 * (roleIndex + p.comp / 100));
    const timeFactor = Math.pow(clamp(number(learningTime, 2.2), 0.8, 2.2) / 1.5, 2) * (1 + p.stress * 0.0015);
    let index = 0;
    let secondsLeft = guided ? null : 18;
    let feedback = '';
    let elapsedMinutes = 0;
    let quality = 0;
    let stress = 0;
    let needKnown = false;
    let seriousError = false;
    let recovered = false;
    let rushed = false;
    let overloaded = false;
    let timedOut = false;
    const chosen = [];
    const flags = {
      accessory: Boolean(c.accessory), service: Boolean(c.service), setup: Boolean(c.setup),
      business: Boolean(c.business), tradeIn: Boolean(c.tradeIn),
    };
    let finalResult = null;

    function minutes(base) { return Math.round(base * timeFactor * 10) / 10; }
    function token() { return sessionId + ':' + index; }
    function option(id, label, detail, base, delta, reply, extra) {
      if (!guided) {
        const neutral = {
          tour: 'Presenta una panoramica dei prodotti e servizi',
          'all-questions': 'Approfondisci il profilo con un questionario completo',
          specs: storyKey === 'help' ? 'Mostra il procedimento eseguendolo tu' : 'Riepiloga le caratteristiche tecniche',
          everything: 'Amplia la dimostrazione con altre funzioni',
          promise: 'Dai una conferma immediata sull’esito atteso',
          insist: 'Aggiungi una panoramica di accessori e servizi',
        };
        label = neutral[id] || label;
      }
      return { id: PHASES[index] + '-' + id, label, detail, minutes: minutes(base),
        recommended: false, delta, reply, ...extra };
    }
    function choices() {
      let options;
      if (index === 0) {
        options = [
          option('welcome', c.hurry === 2 ? 'Accogli e chiedi quanto tempo ha a disposizione' : 'Accogli e chiedi cosa vuole riuscire a fare',
            'Una breve apertura per scegliere insieme il ritmo della visita.', 2, 1,
            c.hurry === 2 ? 'Ho poco tempo: grazie per avermelo chiesto.' : 'Grazie, le racconto cosa mi serve.', { best: true }),
          option('direct', 'Passa subito alla richiesta iniziale',
            'Risparmi tempo; hai ancora poche informazioni sul bisogno.', 1.8, storyKey === 'decided' ? 1 : -1,
            storyKey === 'decided' ? 'Bene, ho già una richiesta precisa.' : 'Sì, ma c’è anche una cosa che vorrei spiegarle.', { rushed: storyKey !== 'decided' }),
          option('tour', 'Racconta subito tutti i prodotti e servizi disponibili',
            'Presenti molte possibilità prima di sapere quali siano utili.', 3, -1,
            'Ci sono tante cose… possiamo partire da quello che mi serve?', { overload: true }),
        ];
      } else if (index === 1) {
        options = [
          option('discover', story.ask, story.askDetail, 3, 2,
            story.reveal, { best: true, known: true }),
          option('assume', 'Conferma solo il prodotto richiesto e prosegui',
            'La visita avanza più rapidamente, ma il bisogno resta da verificare.', 2.4, storyKey === 'decided' ? 0 : -2,
            storyKey === 'decided' ? 'Sì, quella è la configurazione che ho scelto.' : 'È il prodotto che avevo visto, ma non so se risolve il mio problema.',
            { rushed: storyKey !== 'decided' }),
          option('all-questions', 'Fai tutte le domande della lista, anche quelle poco pertinenti',
            'Puoi scoprire il bisogno, ma consumi tempo e attenzione.', 4, c.hurry === 2 ? -2 : 0,
            'Le rispondo, ma alcune domande non riguardano quello che devo fare.', { known: true, overload: true }),
        ];
      } else if (index === 2) {
        options = [
          option('relevant', story.present, story.presentDetail, 3, needKnown ? 3 : 1,
            needKnown ? 'Questo esempio è collegato a quello che le ho raccontato.' : 'Questo mi aiuta, ma prima vorrei chiarire meglio la mia situazione.',
            { best: true, relevant: true }),
          option('specs', storyKey === 'help' ? 'Esegui i passaggi al posto del cliente' : 'Elenca solo le specifiche e passa oltre',
            storyKey === 'help' ? 'Risolvi il passaggio sul momento, senza verificare che sappia ripeterlo.' : 'È rapido, ma il collegamento con l’utilizzo resta implicito.',
            2.4, storyKey === 'decided' ? 0 : -2,
            storyKey === 'help' ? 'Ora funziona, ma da solo non saprei rifarlo.' : 'Capisco le caratteristiche, ma cosa cambia per me?', { rushed: true }),
          option('everything', 'Mostra ogni funzione e aggiungi tutte le possibilità',
            'Una spiegazione estesa può nascondere ciò che conta per questa persona.', 4.2, -2,
            'Mi sto perdendo: qual è la cosa più utile per me?', { overload: true }),
        ];
      } else if (index === 3) {
        options = [
          option('respond', story.recovery, story.recoveryDetail, 2.1, quality < 2 ? 3 : 2,
            'Adesso è più chiaro. Grazie per aver ripreso il mio dubbio.', { best: true, known: true, recover: true }),
          option('move-on', 'Rassicura in modo generico e vai avanti',
            'Risparmi tempo; il dubbio potrebbe restare aperto.', 1.8, -1,
            'Va bene, anche se non sono del tutto sicuro di aver capito.', { rushed: true }),
          option('promise', storyKey === 'budget' ? 'Prometti il valore della permuta prima della valutazione' :
            storyKey === 'accessories' ? 'Garantisci compatibilità e disponibilità senza verificarle' :
            storyKey === 'protection' ? 'Prometti che l’assistenza coprirà qualsiasi problema' :
            storyKey === 'data' ? 'Garantisci che tutti i dati si trasferiranno senza verifiche' : 'Garantisci che non ci sarà nessuna difficoltà',
            'Chiudi il dubbio con una certezza che non hai verificato.', 3, -4,
            'Allora conto su questa promessa. È stata verificata?', { error: true }),
        ];
      } else {
        options = [
          option('complete', story.extend, story.extendDetail, 1.9, 2,
            acceptsOptional ? story.response : 'Grazie per averlo spiegato. Per ora preferisco proseguire senza aggiungere l’assistenza.',
            { best: true, extension: true }),
          option('finish', 'Concludi subito senza un ultimo riepilogo',
            'Risparmi un po’ di tempo; il cliente deve ricostruire da solo il prossimo passo.', 1.7,
            storyKey === 'decided' ? 0 : -1, storyKey === 'decided' ? 'Va bene, procediamo.' : 'Prima di andare: quindi adesso cosa devo fare?',
            { rushed: storyKey !== 'decided' }),
          option('insist', 'Proponi altri accessori e servizi, anche dopo un rifiuto',
            'Aumenti la durata e rischi di far sentire il cliente sotto pressione.', 2.8, -3,
            'Preferirei fermarmi qui. Non desidero aggiungere altro.', { overload: true }),
        ];
      }
      // A stable shuffle keeps the useful action from occupying a predictable position.
      const offset = hash(seed + ':' + index) % options.length;
      options = options.slice(offset).concat(options.slice(0, offset));
      if (hash(index + ':' + seed) % 2) options.reverse();
      return options;
    }

    function finish() {
      const notes = [];
      if (recovered) notes.push('Hai recuperato il dubbio tornando ad ascoltare il cliente.');
      else if (needKnown) notes.push('Hai fatto emergere il bisogno prima di completare la proposta.');
      else notes.push('Una domanda mirata avrebbe reso la proposta più adatta al cliente.');
      if (seriousError) notes.push('Una promessa senza verifica crea aspettative che poi devi gestire.');
      else if (overloaded) notes.push('Selezionare le informazioni utili avrebbe ridotto tempo e confusione.');
      else if (rushed) notes.push('Hai risparmiato tempo, ma alcuni passaggi sono rimasti poco chiari.');
      else if (timedOut) notes.push('Quando esiti puoi ripartire con una domanda semplice: il cliente resta disponibile.');
      else notes.push('Hai completato l’esperienza rispettando le priorità del cliente.');
      finalResult = {
        qualityDelta: clamp(quality, -15, 12), stressDelta: clamp(stress, -6, 20), seriousError,
        needKnown, ...flags, purchase: c.kind !== 'help' && !c.tradeOnly && quality >= -6,
        minutes: Math.round(elapsedMinutes * 10) / 10, feedback: notes.slice(0, 2), decisions: chosen.length,
      };
    }

    function applyChoice(choice, automatic) {
      const before = quality;
      chosen.push(choice.id);
      elapsedMinutes += choice.minutes;
      if (automatic) {
        quality -= 1;
        stress += 1;
        timedOut = true;
        // Hesitating remains recoverable, but does not discover needs or sell extras for the player.
        feedback = 'Ti prendi un momento e prosegui con una risposta generale. Il cliente resta disponibile, ma manca un approfondimento.';
      } else {
        quality += choice.delta;
        needKnown = needKnown || Boolean(choice.known);
        rushed = rushed || Boolean(choice.rushed);
        overloaded = overloaded || Boolean(choice.overload);
        seriousError = seriousError || Boolean(choice.error);
        if (choice.error) stress += 8;
        else if (choice.delta < 0) stress += 2;
        else if (choice.best) stress -= 1;
        if (choice.recover && before < 2) recovered = true;
        if (index === 2 && choice.relevant && needKnown && storyKey === 'protection') flags.accessory = true;
        if (choice.extension && needKnown && quality >= 0 && story.extension !== 'none' && acceptsOptional) flags[story.extension] = true;
        feedback = choice.reply;
      }
      index++;
      if (index === PHASES.length) finish();
      else secondsLeft = guided ? null : 18;
      return { accepted: true, minutes: choice.minutes, feedback, complete: Boolean(finalResult) };
    }

    function choose(choiceId, choiceToken) {
      if (finalResult || choiceToken !== token()) return { accepted: false, minutes: 0, feedback: '', complete: Boolean(finalResult) };
      const choice = choices().find(item => item.id === choiceId);
      if (!choice) return { accepted: false, minutes: 0, feedback: '', complete: false };
      return applyChoice(choice, false);
    }

    function tick(seconds) {
      if (finalResult || guided || !Number.isFinite(seconds) || seconds <= 0) return null;
      secondsLeft = Math.max(0, secondsLeft - seconds);
      if (secondsLeft > 0) return null;
      // At most one fallback per call: a delayed frame must never skip a conversation.
      const fallback = choices().find(item => item.best);
      return applyChoice(fallback, true);
    }

    function view() {
      const finished = Boolean(finalResult);
      const phaseIndex = Math.min(index, PHASES.length - 1);
      const speech = phaseIndex === 0 ? (guided ? story.junior : story.expert) :
        phaseIndex === 1 ? story.probe : phaseIndex === 2 ? (needKnown ? story.reveal : story.probe) :
        phaseIndex === 3 ? story.worry : story.close;
      const available = finished ? [] : choices();
      const best = available.find(item => item.best);
      return {
        token: token(), phase: PHASES[phaseIndex], phaseLabel: LABELS[phaseIndex], index: phaseIndex,
        speaker: 'Cliente', speech, cue: story.cue,
        hint: guided && best ? (tutorial ? TUTORIAL_HINTS[tutorial.day - 1][phaseIndex] + ' ' : '') + best.detail : '', guided,
        tutorial: tutorial ? { ...tutorial } : null,
        options: available.map(item => ({ id: item.id, label: item.label, detail: item.detail,
          minutes: item.minutes, recommended: Boolean(guided && item.best) })),
        feedback, secondsLeft: finished ? null : secondsLeft, secondsTotal: guided || finished ? null : 18,
        progress: Math.round(index / PHASES.length * 100), complete: finished,
      };
    }

    return { view, choose, tick,
      get complete() { return Boolean(finalResult); },
      get result() { return finalResult ? { ...finalResult, feedback: finalResult.feedback.slice() } : null; },
    };
  }

  root.PLCareerInteraction = Object.freeze({ create });
})(window);
