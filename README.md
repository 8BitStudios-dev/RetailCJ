# RetailCJ

PLGame — gioco di gestione retail.

## Versione online

[Gioca a RetailCJ](https://retailcj.muccaugo.chatgpt.site).

Hosting con Sites.

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

Il gioco si trova ora alla radice della repository. È inclusa anche l’icona Apple originale, con il riferimento aggiornato per questo percorso.

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

Le attività del giocatore partono con un fattore di tempo 2,2 e diventano gradualmente più rapide fino a 0,8, senza rallentare alla promozione. Un errore aumenta molto lo stress iniziale (55 punti a Specialist 0, meno con la pratica). Uno Specialist termina la visita e va in pausa dopo ogni errore; nei ruoli successivi il recupero diventa obbligatorio a stress 70. Non si prende un altro cliente fino al recupero. Una pausa completata dura 15 minuti, recupera energia e riduce ulteriormente lo stress; il bisogno urgente di riposo supera il normale intervallo di un’ora tra pause. I tempi e gli errori degli NPC restano quelli precedenti.


## I tre fattori del giocatore

La motivazione dipende dal clima della squadra e dal supporto di colleghi e Lead. Sul floor si avvicina lentamente alla motivazione media dei colleghi in turno, con peso doppio per i Lead; può quindi salire o scendere. Un confronto completato con un Expert/Pro dà +3; un Lead disponibile incoraggia dopo un errore (+2, una volta per cliente) e riconosce una visita conclusa (+1, una volta). Clienti, errori, fatica, pause e riposo notturno non modificano direttamente la motivazione del giocatore. Gli NPC conservano i loro driver precedenti.

Lo stress aumenta con il lavoro e gli errori e si riduce con pause e riposo. Tutti i nuovi punti di competenza del giocatore, da visite, affiancamento e formazione, vengono moltiplicati per `1 - 0.0075 * stress`, con stress limitato a 0–100: 100% a stress 0, 85% a 20, 47,5% a 70 e 25% a 100. La competenza già acquisita non diminuisce. Il pannello mostra l'apprendimento attuale e spiega i tre fattori; competenza e salvataggi conservano anche i punti frazionari. Il riepilogo mostra motivazione, stress e apprendimento a fine turno.


## Progressione vendita

Una nuova Carriera parte da Specialist con competenza **0 / 100**. Il percorso è **Specialist → Expert → Pro → Lead**. A 100, la promozione al ruolo successivo si sceglie manualmente, tra una visita e l’altra; il nuovo ruolo riparte da 0. Lead è il ruolo finale. La competenza aumenta con le visite concluse (fino a +4 per un acquisto consegnato, +3 per un aiuto o un accessorio, +2 per una consulenza senza acquisto, ridotti dallo stress), oltre alla formazione. Visite perse o interrotte non assegnano la crescita di fine visita. La notte conserva la competenza del giocatore.

Ruolo e competenza sono inclusi nei salvataggi e nei backup versione 2. I salvataggi e i file versione 1 vengono recuperati come Specialist, conservando la competenza precedente. La promozione crea subito un checkpoint; se il browser impedisce il salvataggio, un messaggio invita a esportare una copia.

## Versione e aggiornamento

La versione corrente è **1.8.3**, visibile nel menu iniziale e nella barra del gioco. «Aggiorna app» ricarica il sito chiedendo una copia aggiornata. Durante un turno attivo richiede conferma, perché la Carriera riparte dal checkpoint salvato all’apertura; i salvataggi e i file di backup non vengono eliminati.

La versione è dichiarata nella meta `application-version` di `index.html` e nei parametri `v` dei file JavaScript e CSS. A ogni rilascio aggiornare entrambi: il ricaricamento usa un URL nuovo e i file della nuova versione non riutilizzano la copia precedente nella cache.

## Laboratorio Osservazione

La versione 1.8.3 permette di configurare sei flussi indipendenti: vendita, accessori assistiti, Express, Support con appuntamento, Support senza appuntamento e visite libere. I moltiplicatori vanno da 0 a 3; modificare il personale non cambia i clienti inizialmente previsti. Gli appuntamenti sono indipendenti dalla capacità del Bar: una squadra insufficiente produce attese invece di ridurre artificialmente la domanda.

Il personale del turno è configurabile per tutti i dieci ruoli, fino a 80 persone complessive. La copertura include Point ingresso, Point Support ed Express; un solo tecnico al Bar copre il Point e non aumenta la capacità di riparazione. Si possono cambiare disposizione, priorità, competenza iniziale, motivazione, stress, meteo, picco pomeridiano, complessità delle visite, pazienza, mancate presentazioni e tempi Operations. Con zero Operations gli ordini restano in attesa.

Cinque scenari pronti aiutano a esplorare giornate normali, picchi vendita, pressione Support, difficoltà backstage e squadre preparate. Durante il turno è possibile aggiungere cinque clienti a un servizio, aggiungere un collega per ruolo o offrire supporto alla squadra (+10 motivazione e −10 stress). Gli interventi cambiano il turno attuale; la configurazione si applica invece ripartendo.

Il report distingue persone uniche, percorsi conclusi, abbandoni, reindirizzati, aperti e incompleti. Un walk-in che torna all’appuntamento rimane un solo percorso. L’attesa complessiva è la media delle attese dei percorsi terminati; il dettaglio per fase comprende anche le code in corso. Esperienza media, conversione, errori, consegne e condizioni della squadra completano il report. Il NPS usa soltanto il campione di questionari dopo acquisti o riparazioni concluse, con il numero di risposte visibile. Alla chiusura nessun percorso incompleto viene trasformato in vendita o riparazione riuscita.

Per un confronto A/B, registra A, cambia una condizione e applica lo scenario B mantenendo giorno e codice. B si ferma automaticamente all’orario di A; i valori sono confrontabili solo allo stesso orario. Ripetere uno scenario ripristina arrivi, profili iniziali e floor. I risultati descrivono la simulazione e non sono previsioni di uno store reale. Il laboratorio usa profili temporanei e preserva il salvataggio della Carriera.

## Runner all’Express

Di base il 25% dei clienti Express richiede un accessorio dal backstage. Il collega apre un ordine Operations, manda il cliente nell’attesa a destra di B1 e libera subito la cassa per la persona successiva. Il runner consegna direttamente a quel cliente, anche se il collega sta seguendo qualcun altro. La vendita Express e il questionario si registrano soltanto dopo la consegna; alla chiusura un accessorio ancora atteso lascia il percorso incompleto. Senza runner disponibile l’ordine resta in coda, anche in Carriera.

In Osservazione, «Accessori Express dal backstage» modifica la quota da 0 a 100%; lo scenario «Collo di bottiglia backstage» usa il 75%. La necessità del runner appartiene al profilo del cliente, quindi cambiare l’organico non cambia quali clienti aspettano l’accessorio. Il pannello distingue la fila Express dai clienti in attesa del runner e mostra consegne concluse/richieste. L’attesa contribuisce alla fase consegna della CJ, all’esperienza e al NPS finale.

## Uscita visibile dall’Express

Dopo l’acquisto il cliente percorre il floor fino alla porta. L’arrivo alla cassa non viene più confuso con l’arrivo all’uscita: il cliente resta visibile lungo il tragitto e viene rimosso soltanto alla fine. La stessa correzione vale per gli altri percorsi conclusi dal cliente. Chi aspetta il runner mantiene la propria attesa e il suo ordine.
