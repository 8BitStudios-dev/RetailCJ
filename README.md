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

La pratica rende più rapide le attività del giocatore: il fattore sui tempi passa da 1,2 alla prima visita a 0,8 a Lead 100/100, mantenendo la rapidità alla promozione. I tempi degli NPC restano quelli precedenti.

## Schermate compatte

Il riquadro “La tua Carriera” nel gioco e il percorso dei ruoli nel menu iniziale sono nascosti. A 100/100, quando esiste un ruolo successivo, compare un pulsante di promozione separato; rimane disabilitato fino a quando la visita e la pausa sono concluse.

## Progressione vendita

Una nuova Carriera parte da Specialist con competenza **0 / 100**. Il percorso è **Specialist → Expert → Pro → Lead**. A 100, la promozione al ruolo successivo si sceglie manualmente, tra una visita e l’altra; il nuovo ruolo riparte da 0. Lead è il ruolo finale. La competenza aumenta con le visite concluse (+4 per un acquisto consegnato, +3 per un aiuto o un accessorio, +2 per una consulenza senza acquisto), oltre alla formazione. Visite perse o interrotte non assegnano la crescita di fine visita. La notte conserva la competenza del giocatore.

Ruolo e competenza sono inclusi nei salvataggi e nei backup versione 2. I salvataggi e i file versione 1 vengono recuperati come Specialist, conservando la competenza precedente. La promozione crea subito un checkpoint; se il browser impedisce il salvataggio, un messaggio invita a esportare una copia.

## Versione e aggiornamento

La versione corrente è **1.5.1**, visibile nel menu iniziale e nella barra del gioco. «Aggiorna app» ricarica il sito chiedendo una copia aggiornata. Durante un turno attivo richiede conferma, perché la Carriera riparte dal checkpoint salvato all’apertura; i salvataggi e i file di backup non vengono eliminati.

La versione è dichiarata nella meta `application-version` di `index.html` e nei parametri `v` dei file JavaScript e CSS. A ogni rilascio aggiornare entrambi: il ricaricamento usa un URL nuovo e i file della nuova versione non riutilizzano la copia precedente nella cache.
