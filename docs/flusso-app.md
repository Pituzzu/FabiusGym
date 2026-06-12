# GymFabius - Flusso operativo dell'app

Ultimo aggiornamento: 12-06-2026

Questo documento racconta cosa fa l'app nella pratica, senza entrare troppo nel codice.
Serve per capire il comportamento generale e per ricordare il flusso corretto da mantenere.

## Idea generale

GymFabius gestisce gli ingressi dei soci in palestra tramite card.

L'app permette al gestore di:

- vedere chi entra;
- registrare ingressi e uscite;
- controllare frequenze settimanali;
- gestire recuperi;
- controllare mesi scaduti;
- vedere alert;
- correggere manualmente ingresso o uscita quando un socio dimentica la card;
- consultare lo storico degli accessi.

## Accesso del gestore

Il gestore entra nell'app con email e password.

Se non e loggato, l'app mostra la schermata di login.
Quando il login va a buon fine, il gestore entra nella schermata principale.

## Passaggio card

Quando un socio passa la card, l'app controlla chi è il socio collegato a quella card.

Se la card appartiene a un socio valido, l'app verifica la situazione del socio:

- ha il mese pagato?
- ha ancora ingressi disponibili questa settimana?
- e gia entrato oggi?
- ha un ingresso aperto senza uscita?

In base a queste risposte, l'app decide se registrare un ingresso, un'uscita oppure creare un alert.

## Primo ingresso della giornata

Se il socio non e ancora entrato oggi e ha tutto in regola, l'app registra l'ingresso.

L'ingresso viene salvato con:

- nome e cognome del socio;
- card;
- data;
- ora di ingresso;
- stato di ingresso aperto.

Il conteggio settimanale del socio viene aggiornato.

Esempio:

Un socio ha frequenza settimanale 3.
Entra lunedi: l'app segna 1 ingresso usato su 3.

## Uscita

Se il socio ha gia un ingresso aperto oggi e passa di nuovo la card, l'app considera il passaggio come uscita.

Per evitare letture sbagliate immediate, l'uscita puo essere registrata solo dopo almeno 2 minuti dall'ingresso.

Esempio:

- Il socio entra alle 18:00.
- Ripassa la card alle 18:01: l'app non registra l'uscita e avvisa che e troppo presto.
- Ripassa la card alle 18:05: l'app registra l'uscita.

L'app non gestisce piu entrate e uscite multiple nello stesso giorno.
Per ogni socio interessa sapere se quel giorno e entrato e se e uscito.

## Doppio ingresso

Se il socio ha gia completato ingresso e uscita nello stesso giorno e prova a entrare di nuovo, l'app non crea un nuovo ingresso.

In questo caso crea un alert di doppio ingresso.

Questo serve a evitare che una persona venga conteggiata piu volte nello stesso giorno.

## Mese scaduto

Ogni socio ha una data di scadenza.

Se la data di scadenza e superata, il socio risulta con mese non pagato.

Quando un socio con mese scaduto prova a entrare:

- l'ingresso viene bloccato;
- viene creato un alert;
- il gestore vede che il problema e il mese scaduto.

Il gestore puo poi rinnovare il mese dalla scheda del socio.

## Frequenza settimanale

Ogni socio ha una frequenza settimanale.

Esempio:

- frequenza 3: puo entrare 3 volte nella settimana;
- frequenza 4: puo entrare 4 volte nella settimana;
- frequenza 5: puo entrare 5 volte nella settimana.

Quando il socio entra, l'app aumenta il conteggio degli ingressi usati.

Se il socio prova a entrare oltre la sua frequenza, l'app blocca l'ingresso e crea un alert.

## Recuperi

I recuperi servono per permettere a un socio di recuperare giorni persi.

La regola principale e:

Un socio non puo superare 5 giorni totali tra frequenza e recuperi.

Esempi:

- frequenza 5: non puo avere recuperi;
- frequenza 4: puo avere massimo 1 recupero;
- frequenza 3: puo avere massimo 2 recuperi.

Il sistema limita i recuperi in modo che il totale non superi mai 5.

## Card admin recuperi

La card admin e:

```text
C34F8E0D
```

Questa card serve per la gestione dei recuperi/reset.

La logica dei recuperi e stata impostata per evitare recuperi esagerati o incoerenti.

## Se un socio dimentica la card

Se un socio dimentica la card, il gestore puo andare nella sezione Iscritti.

Da li puo aprire il socio e registrare manualmente:

- ingresso;
- uscita.

## Ingresso manuale

L'ingresso manuale serve quando il socio e presente ma non ha la card.

Il gestore seleziona il socio e valida l'ingresso del giorno.

Anche l'ingresso manuale rispetta le regole principali:

- mese non scaduto;
- frequenza settimanale disponibile;
- niente doppio ingresso falso.

## Uscita manuale

L'uscita manuale serve quando il socio ha fatto ingresso ma non ha registrato l'uscita con la card.

Il gestore apre il socio e dichiara l'uscita.

L'uscita manuale funziona solo se per quel giorno esiste un ingresso aperto.

Se non c'e un ingresso da chiudere, l'app avvisa il gestore.

## Sezione Iscritti

La sezione Iscritti e l'area in cui il gestore controlla i soci.

Da qui puo:

- creare un nuovo socio;
- cercare un socio;
- modificare dati del socio;
- cambiare la data di scadenza;
- rinnovare il mese;
- validare ingresso o uscita manuale;
- aprire il profilo del socio;
- eliminare un socio.

I soci sono ordinati dalla A alla Z per cognome.

## Creazione nuovo socio

Quando viene creato un nuovo socio, vengono inseriti i suoi dati principali:

- nome;
- cognome;
- card;
- frequenza settimanale;
- prezzo;
- scadenza.

Il socio parte senza ingressi usati e senza recuperi.

Il primo ingresso del nuovo socio non deve creare falsi alert di doppio ingresso.

## Modifica socio

Il gestore puo modificare i dati di un socio.

Tra le cose importanti:

- puo modificare la data di scadenza;
- puo cambiare frequenza;
- puo aggiornare prezzo e dati personali.

## Rinnovo mese

Quando il gestore rinnova il mese, la scadenza del socio viene aggiornata.

Se prima il socio aveva un alert di mese scaduto rimosso manualmente, il cambio scadenza permette all'app di rivalutare correttamente la situazione.

## Profilo socio

Dal profilo socio il gestore puo vedere il calendario degli accessi.

Il calendario mostra i giorni in cui il socio e venuto.

Selezionando un giorno, l'app mostra:

- ora di ingresso;
- ora di uscita;
- se l'ingresso e stato manuale;
- se l'uscita e stata manuale.

Questo serve per ricostruire velocemente la presenza di una persona.

## Sezione Home

La Home e la schermata operativa principale.

Serve per:

- leggere la card;
- mostrare l'ultimo accesso;
- far capire se e stato registrato un ingresso;
- far capire se e stata registrata un'uscita;
- mostrare eventuali errori o alert.

Quando il passaggio card va bene, il gestore vede il messaggio corretto.

Quando qualcosa non va, l'app crea un alert.

## Sezione Alert

La sezione Alert mostra i problemi da controllare.

Gli alert principali sono:

- doppio ingresso;
- mese scaduto;
- frequenza settimanale superata.

Gli alert vengono raggruppati per persona.

Questo significa che se una persona genera piu problemi, il gestore vede il riferimento alla persona invece di una lista confusa di eventi.

## Rimozione alert

Se il gestore decide che un alert non serve piu, puo rimuoverlo.

Quando un alert viene rimosso:

- non viene piu mostrato nella lista;
- il numerino della bottom bar si aggiorna;
- per il mese scaduto, la rimozione vale solo per quella specifica scadenza.

Questo e importante perche se la scadenza cambia e poi diventa di nuovo superata, l'app puo ricreare correttamente l'alert.

## Numerino Alert nella bottom bar

Il numerino vicino ad Alert non conta il numero totale di alert.

Conta il numero di persone che hanno almeno un alert.

Esempio:

- Mario ha 3 alert;
- Luca ha 1 alert.

Il numerino mostra 2, perche le persone coinvolte sono 2.

## Sezione Storico Ingressi

La sezione Storico Ingressi mostra chi e entrato in un certo giorno.

Il gestore puo:

- vedere oggi;
- andare al giorno precedente;
- andare al giorno successivo;
- controllare orario di ingresso;
- controllare orario di uscita.

Gli ingressi sono ordinati dal piu recente.

## Filtro mattina e pomeriggio

Nei giorni lunedi, mercoledi e venerdi lo storico mostra due tab:

- Mattina;
- Pomeriggio.

Le fasce sono:

- Mattina: dalle 10:00 alle 14:00;
- Pomeriggio: dalle 16:00 alle 23:00.

Negli altri giorni questi tab non servono e quindi non vengono mostrati.

## Distribuzione web

Quando viene fatta una modifica che deve arrivare nella versione web, bisogna aggiornare la build.

Il comando e:

```bash
npm run build:web
```

Questo aggiorna la cartella `dist`.

Se bisogna pubblicare online su Firebase Hosting:

```bash
npm run deploy:web
```

## Versioni di prova

Per fare modifiche che potrebbero non piacere, conviene usare un branch.

Il flusso consigliato e:

1. Tenere `main` come versione buona.
2. Creare un branch di prova.
3. Fare la modifica nel branch.
4. Provare l'app.
5. Se piace, unire il branch in `main`.
6. Se non piace, cancellare il branch.

In questo modo si puo tornare indietro senza perdere la versione funzionante.

## Cosa deve restare sempre vero

Queste sono le regole pratiche piu importanti:

- Il primo ingresso di un nuovo socio non deve creare falsi alert.
- Un socio non deve essere contato piu volte nello stesso giorno.
- La seconda passata della card deve registrare l'uscita, se sono passati almeno 2 minuti.
- Se il socio ha gia chiuso ingresso e uscita, un altro tentativo deve diventare alert.
- Il mese scaduto deve bloccare l'ingresso.
- La frequenza settimanale deve essere rispettata.
- I recuperi non devono mai far superare 5 giorni totali.
- Lo storico deve mostrare ingressi e uscite del giorno corretto.
- Il profilo socio deve mostrare il calendario delle presenze.
- Gli alert rimossi dal gestore non devono restare visibili.
