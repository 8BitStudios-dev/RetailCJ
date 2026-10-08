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

La versione corrente è **1.7.0**, visibile nel menu iniziale e nella barra del gioco. «Aggiorna app» ricarica il sito chiedendo una copia aggiornata. Durante un turno attivo richiede conferma, perché la Carriera riparte dal checkpoint salvato all’apertura; i salvataggi e i file di backup non vengono eliminati.

La versione è dichiarata nella meta `application-version` di `index.html` e nei parametri `v` dei file JavaScript e CSS. A ogni rilascio aggiornare entrambi: il ricaricamento usa un URL nuovo e i file della nuova versione non riutilizzano la copia precedente nella cache.
