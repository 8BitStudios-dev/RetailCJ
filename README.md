# RetailCJ

PLGame — gioco di gestione retail.

## Versione online

[Gioca a RetailCJ](https://8bitstudios-dev.github.io/RetailCJ/).

Hosting con GitHub Pages, gestito dalla repository [8BitStudios-dev/RetailCJ](https://github.com/8BitStudios-dev/RetailCJ).

## Avvio locale

Dalla cartella della repository:

```sh
python3 -m http.server 8000
```

Apri http://localhost:8000 nel browser.

## Test

Con Node.js installato:

```sh
node --test tests/*.test.cjs
```

## Origine

Copiato dalla cartella `plgame` di [MuccaUgo/store-tasks](https://github.com/MuccaUgo/store-tasks/tree/aa955cf4f155341a9ae7b52f642db15f3de7fc99/plgame), commit `aa955cf4f155341a9ae7b52f642db15f3de7fc99`.

Il gioco si trova ora alla radice della repository. L’icona del gioco rappresenta Piazza Liberty in pixel art.

## Salvataggio della Carriera

La Carriera salva automaticamente giorno, motivazione, stress e competenza all’apertura e a fine turno, nello stesso browser. Dal menu iniziale, **Riprendi Carriera** recupera il progresso salvato. Un turno interrotto riparte dall’apertura; un turno completato prosegue dal giorno successivo. La modalità Osservazione conserva il salvataggio della Carriera. **Nuova Carriera** richiede conferma prima di sostituirlo.

## Backup della Carriera

Dal menu «Cambia modalità», **Esporta Carriera** scarica l’ultimo salvataggio in un file JSON. **Importa Carriera** lo recupera anche in un altro browser o dispositivo; formato e valori vengono controllati prima di chiedere conferma per sostituire una Carriera esistente. Dopo l’importazione, scegli **Riprendi Carriera**. Un turno in corso riparte dall’apertura. I backup compatibili hanno formato `RetailCJ.career`, versione 1 o 2 e dimensione massima 64 KB. Un errore di lettura o salvataggio mantiene il percorso attuale.

## Benvenuto in Carriera

Prima di una Nuova Carriera, Cristina (Lead) introduce il floor in tre brevi passaggi: dal Core alla pratica, esperienza personalizzata e crescita. Indietro, Escape o “Torna alle modalità” conservano gioco e salvataggio; una nuova Carriera viene creata solo dal pulsante finale, con conferma quando sostituisce un percorso. “Rileggi il benvenuto del Lead” permette di rivederlo senza iniziare un nuovo turno. Riprendi e Importa seguono il flusso normale.

## Schermate compatte

Il riquadro “La tua Carriera” nel gioco e il percorso dei ruoli nel menu iniziale sono nascosti. A 100/100, quando esiste un ruolo successivo, compare un pulsante di promozione separato; rimane disabilitato fino a quando la visita e la pausa sono concluse.

## Turni, pratica e recupero

Specialist lavora 20 ore/settimana in turni di 4 ore (10:00–14:00), Expert 30 in turni di 6 (10:00–16:00), Pro e Lead 40 in turni di 8 (10:00–18:00). Il calendario prevede cinque turni da mercoledì a domenica e riposo lunedì/martedì. La promozione modifica il contratto dal prossimo turno; il campo opzionale `shiftHours` nei checkpoint e nei backup conserva l'orario del turno corrente anche al riavvio. La fine turno salva un checkpoint completato e mostra la situazione dello store in quel momento; non inventa consegne e non chiude lo store, che in Osservazione continua fino alle 20. Prossimo turno e ripresa dopo completamento saltano i riposi applicando il recupero di ogni notte.

Le attività del giocatore partono con un fattore di tempo 2,2 e diventano gradualmente più rapide fino a 0,8, senza rallentare alla promozione. Un errore grave applica un costo di base di 25 punti a Specialist 0, che scende con la pratica fino a un minimo di 8. Durante i primi tre turni il costo è ridotto ulteriormente. La pausa obbligatoria si attiva a stress 70, per tutti i ruoli: un singolo errore sotto soglia si può recuperare continuando la visita. Non si prende un altro cliente fino al recupero. Una pausa completata dura 15 minuti, recupera energia e riduce ulteriormente lo stress; il bisogno urgente di riposo supera il normale intervallo di un’ora tra pause. I tempi e gli errori degli NPC restano quelli precedenti.


## I tre fattori del giocatore

La motivazione dipende dal clima della squadra e dal supporto di colleghi e Lead. Sul floor si avvicina lentamente alla motivazione media dei colleghi in turno, con peso doppio per i Lead; può quindi salire o scendere. Un confronto completato con un Expert/Pro dà +3; un Lead disponibile incoraggia dopo un errore (+2, una volta per cliente) e riconosce una visita conclusa (+1, una volta). Clienti, errori, fatica, pause e riposo notturno non modificano direttamente la motivazione del giocatore. Gli NPC conservano i loro driver precedenti.

Lo stress aumenta con il lavoro e gli errori e si riduce con pause e riposo. Tutti i nuovi punti di competenza del giocatore, da visite, affiancamento e formazione, vengono moltiplicati per `1 - 0.0075 * stress`, con stress limitato a 0–100: 100% a stress 0, 85% a 20, 47,5% a 70 e 25% a 100. La competenza già acquisita non diminuisce. Il pannello mostra l'apprendimento attuale e spiega i tre fattori; competenza e salvataggi conservano anche i punti frazionari. Il riepilogo mostra motivazione, stress e apprendimento a fine turno.


## Progressione vendita

Una nuova Carriera parte da Specialist con competenza **0 / 100**. Il percorso è **Specialist → Expert → Pro → Lead**. A 100, la promozione al ruolo successivo si sceglie manualmente, tra una visita e l’altra; il nuovo ruolo riparte da 0. Lead è il ruolo finale. La competenza aumenta con le visite concluse (fino a +4 per un acquisto consegnato, +3 per un aiuto o un accessorio, +2 per una consulenza senza acquisto, ridotti dallo stress), oltre alla formazione. Visite perse o interrotte non assegnano la crescita di fine visita. La notte conserva la competenza del giocatore.

Ruolo e competenza sono inclusi nei salvataggi e nei backup versione 2. I salvataggi e i file versione 1 vengono recuperati come Specialist, conservando la competenza precedente. La promozione crea subito un checkpoint; se il browser impedisce il salvataggio, un messaggio invita a esportare una copia.

## Interfaccia e struttura

RetailCJ 2.3.2 usa un unico floor 3D con un’interfaccia ispirata al Liquid Glass: caratteri di sistema, superfici satinate, bordi luminosi e colori chiari o scuri secondo il dispositivo. Su telefono il floor precede la scheda del turno; durante le scelte resta più basso, mentre «Ingrandisci» permette di estenderlo. La camera mantiene zoom e inseguimento del giocatore. Orario, velocità e menu rimangono in alto e le inquadrature su una riga sotto la scena. Su desktop floor e interazione sono affiancati.

La scheda mostra la frase del cliente e le tre risposte senza ripetere statistiche e spiegazioni. Aiuti, dettagli della visita e risultati della conversazione si aprono su richiesta. Motivazione, stress e competenza restano visibili, mentre numeri del turno, apprendimento e storico sono raccolti nei dettagli chiusi. La UI non mostra numero di versione o pulsante di aggiornamento.

«Prossimo cliente», «Auto», «Ingaggia» e «Pausa» occupano una sola riga, anche su telefono. Accanto a «Prossimo cliente», la spunta «Auto» permette di prendere la prossima persona in coda quando il giocatore è libero e operativo. La preferenza è locale al browser e non cambia il formato dei backup della Carriera. Pause, menu, fine turno e interazioni in corso sospendono le nuove prese in carico. Le risposte delle cinque fasi rimangono sempre manuali.

«Ingaggia» è sempre un’azione manuale. Seleziona un visitatore che sta esplorando oppure avvicina una persona disponibile nelle vicinanze. L’invito può essere accettato o rifiutato; chi preferisce continuare da solo resta sul floor, senza contare come cliente perso. Dopo l’invito, la stessa persona non può essere sollecitata di nuovo per 15 minuti. Una consulenza accettata segue le cinque fasi e può concludersi anche senza acquisto.

`index.html` contiene la schermata e carica `game.js`, che conserva la simulazione e i salvataggi. `floor-view.js` avvia il renderer e gestisce camera, caricamento e recupero dagli errori. `renderer-3d.js` costruisce la scena; `floor-view.css` gestisce il layout di base e `liquid-glass.css` applica la nuova interfaccia. Il vecchio renderer del floor in 2D, i suoi asset grafici e il sistema di aggiornamento manuale sono stati rimossi. La versione rimane nei metadati e nei parametri degli asset per la cache.

## I primi tre turni

Una Nuova Carriera inizia con tre turni di affiancamento del Lead: accoglienza e bisogni, soluzione pertinente e accessori, ritmo e chiusura. La scheda mostra un obiettivo giornaliero compatto e un suggerimento per ciascuna delle cinque fasi; la risposta consigliata resta evidenziata e non scatta una risposta automatica durante il tutorial. Il floor e il turno continuano a scorrere.

La pressione cresce gradualmente: nel primo turno il lavoro genera il 55% dello stress ordinario e gli errori il 45% del costo di base; nel secondo 75% e 65%; nel terzo 90% e 85%. Mentre si sceglie, lo stress è più contenuto: 15%, 25%, 40% del ritmo lavorativo ordinario. Dopo l’affiancamento la riflessione conserva il fattore 40%, mentre il lavoro torna al ritmo normale. Le scelte poco efficaci restano recuperabili e quelle corrette riducono già lo stress. NPC e laboratorio Osservazione conservano le loro regole.

Il progresso usa il campo facoltativo `tutorialShifts` (0–3) nel salvataggio e nei backup versione 2. Avanza soltanto quando termina un turno, non ricaricando la pagina, importando o promuovendo il giocatore. I backup precedenti rimangono compatibili: le prime giornate di uno Specialist poco esperto sono riconosciute, mentre i percorsi avanzati proseguono fuori dall’affiancamento. La fine del mese non riavvia il tutorial.

## Conversazioni della Carriera

Le visite di vendita, accessori e aiuto del giocatore richiedono cinque decisioni: Approach, Probe, Present, Listen ed Extend. Ogni fase presenta una battuta del cliente, un indizio e tre azioni con il costo in minuti del turno. I clienti hanno bisogni diversi: dati e configurazione, viaggio, lavoro, budget, protezione, famiglia, utilizzo specifico, accessori o aiuto. Le proposte pertinenti modificano l’esperienza e possono aggiungere un accessorio, AppleCare, Setup, Trade In o un contatto business. Un rifiuto di un servizio facoltativo non è un errore.

Durante l’affiancamento, e poi finché lo Specialist rimane sotto competenza 25, il giocatore riceve un suggerimento del Lead e sceglie senza scadenza automatica, mentre il turno continua a scorrere. Dopo questa fase guidata c’è una finestra morbida di 18 secondi: allo scadere la conversazione prosegue con una risposta generica, senza aggiungere servizi automaticamente o creare un errore grave. Pausa, menu e indisponibilità del 3D sospendono il timer; 2× e 4× non lo accelerano. I pulsanti non accettano invii duplicati o riferiti a una fase precedente.

Durante la scelta il turno e il floor continuano a scorrere alla velocità selezionata: il tempo impiegato a rispondere allunga la conversazione. La pausa esplicita, il menu e l’indisponibilità del 3D fermano il gioco. Al clic si aggiunge il tempo necessario a eseguire l’azione, senza contare di nuovo i minuti già passati a scegliere. A parità di scelte, una conversazione curata costa circa 26 minuti simulati a Specialist 0 e 12 a Pro 0, oltre a cammino, pratiche e consegne. La rapidità è continua attraverso la promozione e lo stress aumenta il costo del lavoro. Una spiegazione eccessiva richiede più tempo; fretta e promesse senza verifica possono peggiorare l’esperienza. Gli errori gravi generati dalle scelte applicano le regole di stress e recupero della Carriera; una buona decisione non viene annullata da un errore casuale del giocatore.

A fine conversazione sono visibili durata, qualità e due osservazioni. La vendita e la crescita restano legate all’esito reale della visita: i prodotti passano da Operations, un cliente in attesa non è una consegna conclusa e il Setup può continuare dopo la consegna. Una visita interrotta a fine turno rimane incompleta. Gli NPC e Osservazione mantengono la simulazione automatica. Formati dei salvataggi e backup invariati: un turno interrotto riparte dall’apertura.

## Laboratorio Osservazione

Il laboratorio permette di configurare sei flussi indipendenti: vendita, accessori assistiti, Express, Support con appuntamento, Support senza appuntamento e visite libere. I moltiplicatori vanno da 0 a 3; modificare il personale non cambia i clienti inizialmente previsti. Gli appuntamenti sono indipendenti dalla capacità del Bar: una squadra insufficiente produce attese invece di ridurre artificialmente la domanda.

Il personale del turno è configurabile per tutti i dieci ruoli, fino a 80 persone complessive. La copertura include Point ingresso, Point Support ed Express; un solo tecnico al Bar copre il Point e non aumenta la capacità di riparazione. Si possono cambiare disposizione, priorità, competenza iniziale, motivazione, stress, meteo, picco pomeridiano, complessità delle visite, pazienza, mancate presentazioni e tempi Operations. Con zero Operations gli ordini restano in attesa.

Cinque scenari pronti aiutano a esplorare giornate normali, picchi vendita, pressione Support, difficoltà backstage e squadre preparate. Durante il turno è possibile aggiungere cinque clienti a un servizio, aggiungere un collega per ruolo o offrire supporto alla squadra (+10 motivazione e −10 stress). Gli interventi cambiano il turno attuale; la configurazione si applica invece ripartendo.

Il report distingue persone uniche, percorsi conclusi, abbandoni, reindirizzati, aperti e incompleti. Un walk-in che torna all’appuntamento rimane un solo percorso. L’attesa complessiva è la media delle attese dei percorsi terminati; il dettaglio per fase comprende anche le code in corso. Esperienza media, conversione, errori, consegne e condizioni della squadra completano il report. Il NPS usa soltanto il campione di questionari dopo acquisti o riparazioni concluse, con il numero di risposte visibile. Alla chiusura nessun percorso incompleto viene trasformato in vendita o riparazione riuscita.

Per un confronto A/B, registra A, cambia una condizione e applica lo scenario B mantenendo giorno e codice. B si ferma automaticamente all’orario di A; i valori sono confrontabili solo allo stesso orario. Ripetere uno scenario ripristina arrivi, profili iniziali e floor. I risultati descrivono la simulazione e non sono previsioni di uno store reale. Il laboratorio usa profili temporanei e preserva il salvataggio della Carriera.

## Runner all’Express

Di base il 25% dei clienti Express richiede un accessorio dal backstage. Il collega apre un ordine Operations, manda il cliente nell’attesa a destra di B1 e libera subito la cassa per la persona successiva. Il runner consegna direttamente a quel cliente, anche se il collega sta seguendo qualcun altro. La vendita Express e il questionario si registrano soltanto dopo la consegna; alla chiusura un accessorio ancora atteso lascia il percorso incompleto. Senza runner disponibile l’ordine resta in coda, anche in Carriera.

In Osservazione, «Accessori Express dal backstage» modifica la quota da 0 a 100%; lo scenario «Collo di bottiglia backstage» usa il 75%. La necessità del runner appartiene al profilo del cliente, quindi cambiare l’organico non cambia quali clienti aspettano l’accessorio. Il pannello distingue la fila Express dai clienti in attesa del runner e mostra consegne concluse/richieste. L’attesa contribuisce alla fase consegna della CJ, all’esperienza e al NPS finale.

## Uscita visibile dall’Express

Dopo l’acquisto il cliente percorre il floor fino alla porta. L’arrivo alla cassa non viene più confuso con l’arrivo all’uscita: il cliente resta visibile lungo il tragitto e viene rimosso soltanto alla fine. La stessa correzione vale per gli altri percorsi conclusi dal cliente. Chi aspetta il runner mantiene la propria attesa e il suo ordine.

## Floor 3D

Il 3D si carica automaticamente in Carriera e Osservazione, con Three.js 0.186.1 incluso in `vendor/` e relativa licenza MIT. Panoramica e Dall’alto mostrano il floor completo. Express, Point Product all’ingresso e Point Genius Bar impostano i tre focus, includendo la relativa fila. Trascinamento, rotella e due dita controllano camera e zoom. La camera legge la simulazione e non cambia visite o salvataggi. Il floor non mostra targhette con i nomi dei tavoli, del Genius Bar, dei Point o dell’Express; i relativi comandi della camera restano disponibili.

La precedente preferenza `plgame.view` non viene più letta o scritta; i salvataggi della Carriera, delle modalità e dei livelli mantengono gli stessi formati. Durante il caricamento o un errore grafico il ciclo del gioco resta in pausa, senza recuperare tempo nascosto al rientro. Un errore di caricamento permette di riprovare; la perdita del contesto propone di riaprire il gioco. WebGL 2 è necessario per il floor. I test verificano avvio, errori, continuità dello stato, selezione e camera con la matematica Three.js reale.

## Arredi dello store

Gli arredi 3D riprendono le foto di riferimento: i tavoli hanno legno chiaro con venatura, piano in due metà, fessura centrale per i cavi e gambe squadrate. Mac, iPad, iPhone e Watch hanno allestimenti distinti: portatili aperti in file contrapposte, tablet inclinati, telefoni su espositori bianchi e orologi su steli metallici. I tavoli D4, D3 e D2 includono prese centrali, telefoni dimostrativi raggruppati vicino alla fessura centrale fra i due moduli prese e sgabelli alti con struttura cromata. Nel Today at Apple le sedute sono cubi di legno con pannello scuro incassato e maniglia ovale. Il pavimento ha una finitura grigia simile alla pietra.

Le geometrie e le texture sono create localmente dal renderer. Materiali e forme sono condivisi e i pezzi ripetuti sono raggruppati per limitare le chiamate grafiche, conservando la selezione dei tavoli. Le posizioni della simulazione, i percorsi, i posti disponibili e i salvataggi rimangono quelli del gioco.

## Express e scenari estremi

Dalla versione 1.9.3, se il personale richiesto supera 80 persone, i posti vengono distribuiti proporzionalmente, mantenendo almeno una persona per ogni ruolo richiesto. Impostare tutti i dieci ruoli a 20 produce otto persone per ruolo, inclusi Operations. La configurazione mostra in anticipo il totale effettivo e quanti Operations saranno presenti; i ruoli impostati a zero restano a zero. Le configurazioni entro il limite conservano i numeri richiesti.

Durante il cambio ruoli, Point ed Express continuano a servire finché il sostituto è occupato. Il titolare passa il posto quando il cambio è pronto, senza interrompere una visita in corso. Senza Operations, gli ordini rimangono in attesa come previsto dal laboratorio; questa situazione non impedisce al cassiere di prendere altri clienti.

## Icona Piazza Liberty e camera Carriera

RetailCJ usa Piazza Liberty in pixel art per la favicon e l’icona della schermata Home. I PNG si trovano in `assets/piazza-liberty-icon.png` (512), `assets/piazza-liberty-icon-180.png` e `assets/piazza-liberty-icon-32.png`.

Quando avvii o riprendi una Carriera in 3D, la camera si centra sul tuo personaggio e lo segue durante gli spostamenti. «Seguimi» riattiva il seguito dopo aver scelto una vista del floor. Rotazione e zoom restano disponibili. Durante una pausa, quando il personaggio è nascosto, la camera mantiene l’ultima posizione e riprende al rientro. Osservazione usa Panoramica e i focus dei punti.
