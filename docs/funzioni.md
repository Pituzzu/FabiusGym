# GymFabius - Funzioni e modifiche

Ultimo aggiornamento: 12-06-2026

Questo file va aggiornato ogni volta che viene fatta una modifica all'app.
Serve a ricordare cosa funziona, quali regole sono gia state confermate e cosa non va toccato senza motivo.

## Regola di aggiornamento

Quando si modifica l'app:

1. Aggiungere una riga nel Registro modifiche.
2. Aggiornare la sezione della funzione coinvolta.
3. Scrivere se la modifica richiede build web, deploy Firebase, build Android o build iOS.
4. Scrivere le verifiche fatte.
5. Sovrascrivere `docs/ultime-aggiunte.md` con solo le modifiche piu recenti, in formato pronto da copiare negli appunti del sito e senza termini tecnici di programmazione.

## Stato stabile

Il branch `main` contiene la versione stabile pubblicata su GitHub.

Repository:

```bash
https://github.com/Pituzzu/FabiusGym.git
```

Per modifiche rischiose usare un branch separato:

```bash
git checkout main
git checkout -b nome-prova
```

Se la prova va bene:

```bash
git checkout main
git merge nome-prova
git push origin main
```

Se la prova non va bene:

```bash
git checkout main
git branch -D nome-prova
```

## Comandi principali

Avvio web locale:

```bash
npm run web -- --port 8081
```

Controllo TypeScript:

```bash
npx tsc --noEmit
```

Lint:

```bash
npm run lint
```

Build web in `dist`:

```bash
npm run build:web
```

Deploy web Firebase:

```bash
npm run deploy:web
```

Build Android APK:

```bash
npm run build:apk
```

Build Android AAB:

```bash
npm run build:aab
```

Build iOS:

```bash
npm run build:ios
```

## Struttura generale

L'app usa Expo, React Native, Expo Router e Firebase.

Schermate principali:

- `app/(auth)/login.tsx`: login con Firebase Auth.
- `app/(tabs)/index.tsx`: Home, lettura card e gestione ingresso/uscita.
- `app/(tabs)/iscritti.tsx`: gestione soci, modifica profilo, ingresso/uscita manuale, calendario socio.
- `app/(tabs)/alert.tsx`: anomalie e alert.
- `app/(tabs)/setting.tsx`: storico ingressi.
- `app/(auth)/view.tsx`: vista profilo/accessi.
- `app/(tabs)/_layout.tsx`: bottom bar e badge alert.
- `app/config/firebaseConfig.js`: configurazione Firebase.

## Autenticazione

La login usa Firebase Auth con email e password.

Comportamento:

- Se l'utente non e loggato viene mandato a `/(auth)/login`.
- Se l'utente e loggato e prova ad andare alla login viene mandato a `/(tabs)`.
- La schermata `/(auth)/view` resta accessibile come vista dedicata.

## Home e lettura card

La Home legge la card da Firebase Realtime Database.

Funzionamento confermato:

- Quando una card valida viene letta, viene cercato il socio in Firestore.
- Il primo passaggio valido del giorno registra l'ingresso.
- Un secondo passaggio nello stesso giorno non crea un nuovo ingresso se l'ingresso e gia chiuso.
- Se esiste un ingresso aperto, il passaggio card registra l'uscita.
- L'uscita da card e consentita solo dopo almeno 2 minuti dall'ingresso.
- Non servono piu ingressi/uscite multipli nello stesso giorno.
- La finestra anti-lettura doppia della stessa card e di 1,5 secondi.

Dati principali aggiornati sul socio:

- `calc_frequenza`
- `frequenza`
- `recupero`
- `doppio_ingresso`
- `ultimo_ingresso_ms`
- `ultimo_giorno_uscita`
- `ultimo_uscita_ms`

Gli accessi vengono salvati in:

```text
accessi/{anno}/{mese}/{giorno}/ingressi_del_giorno/{socioId}
```

Il codice mantiene compatibilita con vecchi percorsi data con giorno/mese non sempre formattati a due cifre.

## Ingresso e uscita

Ogni accesso puo avere:

- `ingresso`
- `ingresso_ms`
- `uscita`
- `uscita_ms`
- `stato`
- `manuale`
- `uscitaManuale`
- `uscitaByAdmin`

Stati principali:

- `entrato`: ingresso aperto.
- `uscito`: uscita registrata.

La vista mostra messaggi con orario:

- `Ingresso registrato alle HH:MM`
- `Uscita registrata alle HH:MM`

## Uscita non timbrata

La Home controlla gli ingressi aperti senza uscita.

Se la fascia dell'ingresso e superata, il socio viene mostrato in rosso con:

```text
Nome Cognome (uscita non timbrata)
```

Fasce controllate:

- Mattina: ingresso tra 10:00 e 14:00; dopo le 14:00 diventa uscita non timbrata.
- Pomeriggio/sera: ingresso tra 16:00 e 23:00; dopo le 23:00 diventa uscita non timbrata.

La Home mostra il tasto `Valida uscita`.
Quando il gestore lo preme, l'accesso viene chiuso con:

```text
uscitaByAdmin: true
```

Nello storico l'uscita viene mostrata come:

```text
OUT: By Admin
```

Quando il venerdi passa la card admin `C34F8E0D`, oltre al reset recuperi vengono chiuse automaticamente le uscite non timbrate gia scadute.

## Regole di frequenza settimanale

La frequenza settimanale limita gli ingressi disponibili.

Regole confermate:

- Se il socio supera la frequenza settimanale viene creato un alert.
- Il conteggio si basa su `calc_frequenza`.
- Se il socio ha ancora ingressi disponibili, l'ingresso aumenta `calc_frequenza`.
- Se il mese e scaduto, l'ingresso viene bloccato e viene creato alert mese scaduto.

## Recuperi

La palestra considera 5 giorni massimi di apertura settimanale.

Regole confermate:

- Chi ha frequenza 5 non puo avere recuperi.
- Chi ha frequenza 4 puo avere massimo 1 recupero.
- Chi ha frequenza 3 recupera solo i giorni mancanti se e venuto almeno una volta.
- Se un socio fa 0 ingressi nella settimana, prende 0 recuperi.
- In generale: frequenza base + recuperi usabili non deve superare 5.
- I recuperi vengono limitati automaticamente dalla logica.

Esempio frequenza 3:

- 0 su 3: recuperi 0.
- 1 su 3: recuperi 2.
- 2 su 3: recuperi 1.
- 3 su 3: recuperi 0.

Esempio frequenza 4:

- 0 su 4: recuperi 0.
- 1 su 4: recuperi massimo 1.
- 2 su 4: recuperi massimo 1.
- 3 su 4: recuperi 1.
- 4 su 4: recuperi 0.

Card admin recuperi:

```text
C34F8E0D
```

Questa card e usata come card admin per il reset/recuperi.

Reset recuperi:

- Consentito il venerdi.
- Non deve essere eseguito piu di una volta nello stesso giorno per lo stesso socio.
- Se il mese del socio e scaduto viene conteggiato come mese scaduto.

## Iscritti

La sezione Iscritti permette:

- Creazione nuovo socio.
- Ricerca soci.
- Lista soci ordinata dalla A alla Z per cognome, poi nome.
- Modifica socio.
- Eliminazione socio.
- Rinnovo mese.
- Modifica data scadenza.
- Visualizzazione profilo.
- Validazione ingresso manuale.
- Validazione uscita manuale.
- Conteggio ingressi attuali nella lista, ad esempio `1 su 3`.
- Sfondo giallo/arancione quando il socio e arrivato a `n su n`.

Dati socio principali:

- `nome`
- `cognome`
- `cardId`
- `prezzo`
- `frequenza`
- `recupero`
- `calc_frequenza`
- `doppio_ingresso`
- `dataScadenza`
- `admin`

Quando viene creato un nuovo socio:

- `recupero` parte da 0.
- `calc_frequenza` parte da 0.
- `doppio_ingresso` parte da 0.
- La scadenza viene calcolata automaticamente.
- La card admin viene riconosciuta dal codice `C34F8E0D`.

## Profilo socio e calendario

Da Iscritti, entrando in Modifica e poi Visualizza Profilo, si vede il calendario del socio.

Funzionamento:

- Il calendario mostra i giorni del mese selezionato.
- I giorni con accesso sono evidenziati.
- Selezionando un giorno si vedono ingresso e uscita di quel giorno.
- Vengono letti anche vecchi percorsi data per compatibilita.
- I dati mostrano se l'ingresso o l'uscita sono manuali.

## Ingresso manuale

Serve quando un socio dimentica la card.

Funzionamento:

- Da Iscritti si apre il socio.
- Si puo validare l'ingresso manuale del giorno.
- Rispetta mese scaduto e frequenza settimanale.
- Se l'ingresso viene bloccato viene creato alert.
- Non deve generare falsi doppi ingressi al primo accesso.

## Uscita manuale

Serve quando un socio dimentica di passare la card in uscita.

Funzionamento:

- Da Iscritti si apre il socio.
- Si puo dichiarare l'uscita del giorno.
- L'uscita chiude l'ingresso aperto.
- Se non c'e un ingresso aperto oggi, viene mostrato errore.
- Viene salvato `uscitaManuale: true`.

## Rinnovo mese e scadenza

Il socio ha una data scadenza in formato:

```text
GG-MM-AAAA
```

Funzionamento:

- La data scadenza e modificabile dalla scheda socio.
- Il rinnovo mese aggiorna la scadenza.
- Se un alert mese scaduto era stato rimosso e la scadenza cambia, l'alert potra tornare se la nuova scadenza risulta superata.

## Alert

La sezione Alert mostra anomalie giornaliere e scadenze.

Tipi principali:

- Doppio ingresso.
- Mese scaduto.
- Frequenza settimanale.

Gli alert giornalieri vengono letti da:

```text
anomalie/{anno}/{mese}/{giorno}/eventi
```

Funzionamento:

- Gli alert vengono raggruppati per persona.
- Il contatore in basso nella tab Alert conta le persone con alert, non il totale degli alert.
- L'alert mese scaduto viene calcolato dai soci con `dataScadenza` superata.
- Se il gestore rimuove un alert, questo non deve piu comparire.

Rimozione alert:

- Gli alert giornalieri rimossi cancellano gli eventi del socio nel giorno selezionato.
- L'alert `Mese non pagato` viene nascosto salvando sul socio:

```text
alert_mese_scaduto_rimosso_scadenza
```

- La rimozione vale solo per quella specifica scadenza.
- Se la scadenza cambia, l'alert puo essere mostrato di nuovo.
- Anche il badge nella bottom bar ignora gli alert rimossi.

## Storico ingressi

La sezione Storico Ingressi mostra gli accessi del giorno selezionato.

Funzionamento:

- Si puo andare avanti e indietro nei giorni.
- Si puo tornare a oggi.
- Gli accessi sono ordinati dal piu recente.
- Per ogni socio vengono mostrati ingresso e uscita.
- Se l'uscita e stata validata dal gestore per mancata timbratura, viene mostrato `OUT: By Admin`.
- Vengono letti anche vecchi percorsi data per compatibilita.

Filtro fasce:

- Nei giorni lunedi, mercoledi e venerdi vengono mostrati i tab Mattina/Pomeriggio.
- Mattina: 10:00 - 14:00.
- Pomeriggio: 16:00 - 23:00.
- Negli altri giorni non vengono mostrati i tab e non viene applicato questo filtro.

## Bottom bar

Tab presenti:

- Home.
- Iscritti.
- Alert.
- Ingressi.

La tab Alert mostra un numerino solo se ci sono persone con alert.

Regola badge:

- Conta persone uniche.
- Include anomalie giornaliere.
- Include mesi scaduti non rimossi.
- Non conta piu alert rimossi dal gestore.

## Appunti Home

La Home contiene una sezione Appunti non invasiva.

Funzionamento:

- Il pulsante `Appunti` apre un modale.
- Si possono creare appunti.
- Si possono modificare appunti esistenti.
- Si possono cancellare appunti.
- Si possono segnare come risolti o riaprire.
- Il numerino mostra solo gli appunti non risolti.

Gli appunti vengono salvati in:

```text
appunti/{appuntoId}
```

Campi principali:

- `testo`
- `risolto`
- `creato`
- `creato_ms`
- `aggiornato`
- `aggiornato_ms`

## Build e distribuzione web

La build web genera la cartella:

```text
dist
```

La cartella `dist` e ignorata da git.

Per aggiornare la distribuzione web:

```bash
npm run build:web
```

Per pubblicare su Firebase Hosting:

```bash
npm run deploy:web
```

## Build mobile

Android APK:

```bash
npm run build:apk
```

Android AAB produzione:

```bash
npm run build:aab
```

iOS:

```bash
npm run build:ios
```

Nota iOS:

- Senza login Apple Developer, EAS puo chiedere dati manuali per certificati e profili.
- Con login Apple Developer, EAS puo generare e validare le credenziali.

## Dati Firebase

Collezioni/percorsi principali:

```text
soci/{socioId}
accessi/{anno}/{mese}/{giorno}/ingressi_del_giorno/{socioId}
anomalie/{anno}/{mese}/{giorno}/eventi/{eventoId}
```

Realtime Database:

- Usato per leggere la card passata dal lettore.
- Dopo la lettura, il valore viene resettato per evitare riletture continue.

## Cose da non rompere

Queste funzioni sono state confermate come corrette:

- Primo ingresso del socio nuovo senza falsi alert.
- Doppio ingresso giornaliero bloccato con alert.
- Uscita da card dopo almeno 2 minuti.
- Uscita manuale da Iscritti.
- Storico ingressi con ingresso/uscita.
- Filtro Mattina/Pomeriggio solo lunedi, mercoledi e venerdi.
- Badge Alert basato sul numero di persone.
- Rimozione alert da parte del gestore.
- Recuperi: 0 ingressi settimanali danno 0 recuperi.
- Recuperi: frequenza 4 ha massimo 1 recupero, frequenza 5 ha 0 recuperi.
- Card admin `C34F8E0D` per recuperi/admin.
- Lista iscritti ordinata per cognome.
- Lista iscritti con conteggio `x su n` e sfondo giallo/arancione su `n su n`.
- Calendario profilo socio.
- Modifica data scadenza.
- Rinnovo mese.
- Appunti Home con badge solo sugli appunti aperti.
- Uscita non timbrata validabile come `By Admin`.

## Registro modifiche

### 12-06-2026

- Creato `docs/funzioni.md`.
- Documentato il funzionamento attuale dell'app.
- Aggiunta regola: questo file va aggiornato a ogni modifica futura.
- Stato git prima della creazione: `main` gia pushato su `origin/main` con commit `d63a9a4`.
- Creato branch `nuove-funzionalita`.
- Aggiunta sezione Appunti in Home con badge per appunti aperti.
- Aggiunta rilevazione uscite non timbrate per fasce 10:00-14:00 e 16:00-23:00.
- Aggiunta validazione uscita `By Admin` dalla Home.
- Aggiunta chiusura automatica uscite scadute quando passa la card admin il venerdi.
- Aggiornata regola recuperi: 0 presenze settimanali danno 0 recuperi; frequenza 4 massimo 1; frequenza 5 zero.
- Aggiunto conteggio ingressi `x su n` nella lista Iscritti con evidenza giallo/arancione su completamento.

### 10-06-2026

- Aggiunta gestione uscita con card.
- Soglia uscita impostata a 2 minuti dall'ingresso.
- Aggiunta uscita manuale dalla scheda socio.
- Aggiunto calendario profilo socio con ingresso/uscita per giorno.
- Ordinata la lista iscritti per cognome.
- Sistemato storico ingressi e visualizzazione ingresso/uscita.
- Aggiunto filtro Mattina/Pomeriggio nello storico solo lunedi, mercoledi e venerdi.
- Aggiunto badge Alert basato sul numero di persone.
- Aggiunta rimozione alert da parte del gestore.
- Aggiornata build web `dist` dopo le modifiche.
- Committato e pushato su GitHub con commit `d63a9a4`.
