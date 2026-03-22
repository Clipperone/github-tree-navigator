# GitHub Tree Navigator Implementation Roadmap

Questo documento traduce i gap individuati in una roadmap concreta, ordinata per priorita' e dipendenze.
Ogni step include:

- obiettivo
- scope tecnico
- output atteso
- criteri di accettazione
- prompt pronto da usare nella chat per implementarlo

L'ordine suggerito va rispettato: gli step iniziali riducono rischio tecnico e semplificano quelli successivi.

---

## Step 0 - Hardening della baseline

### Obiettivo
Consolidare la base tecnica prima di introdurre feature piu' grandi.

### Scope
- verificare che README, sito GitHub Pages e Chrome Web Store non promettano feature non ancora implementate
- aggiungere una sezione "Known limitations" piu' esplicita dove serve
- verificare che type-check e build siano sempre verdi
- preparare una piccola checklist di regressione manuale per repo page, blob page, private repo con token, pin mode, resize, search

### Output atteso
- documentazione allineata alla baseline reale
- checklist di regression test nel README o in un file dedicato se utile

### Criteri di accettazione
- nessuna feature dichiarata ma assente nel codice
- `npm run type-check` e `npm run build` passano

### Prompt da usare
```text
Analizza la baseline attuale di GitHub Tree Navigator e fai un hardening iniziale prima delle nuove feature.

Obiettivi:
- allinea README, landing page e metadati del progetto alle feature realmente implementate
- evidenzia chiaramente i limiti attuali, soprattutto per repo molto grandi e pagine PR
- non aggiungere complessita' inutile
- mantieni l'architettura esistente: content_script orchestrator, api pure, state puro, ui senza mutazioni di stato

Esegui direttamente le modifiche necessarie, poi valida con:
- npm run type-check
- npm run build

Nel messaggio finale dimmi cosa hai corretto e se hai trovato incongruenze residue.
```

---

## Step 1 - Modalita' Pull Request / Files Changed

### Obiettivo
Supportare le pagine Pull Request mostrando l'albero dei file cambiati, non l'intero repository.

### Scope
- riconoscere URL PR e tab Files changed
- ottenere l'elenco dei file cambiati via GitHub API
- renderizzare un tree dedicato ai changed files
- supportare active file highlight anche dentro la PR
- mantenere search, expand/collapse e pin mode coerenti

### Output atteso
- sidebar contestuale su pagine PR
- UX distinta tra repository browsing e PR review

### Criteri di accettazione
- su una PR con file modificati il tree mostra solo i file changed
- click su un file porta alla vista corretta della PR
- nessuna regressione sulle normali pagine repo/blob

### Prompt da usare
```text
Implementa la modalita' Pull Request / Files Changed in GitHub Tree Navigator.

Requisiti:
- rileva quando l'utente si trova su una pagina PR rilevante
- usa la GitHub API per recuperare i file changed della PR
- mostra nella sidebar un tree dei soli file modificati
- mantieni search/filter, active file highlight, pin mode, resize e SPA navigation
- non introdurre cicli tra moduli e non spostare logica di business in ui.ts
- conserva lo stile e le API pubbliche esistenti quando possibile

Alla fine:
- aggiorna la documentazione necessaria
- esegui npm run type-check e npm run build
- riassumi i file toccati e i casi limite gestiti
```

---

## Step 2 - Fallback per repository grandi / risposta `truncated`

### Obiettivo
Evitare il degrado funzionale quando la Git Trees API restituisce `truncated: true`.

### Scope
- definire una strategia fallback per caricare directory on demand
- distinguere modalita' full-tree e lazy-tree
- mostrare uno stato UI esplicito quando il repo usa il fallback
- evitare freeze del DOM e mantenere performante la ricerca per quanto possibile

### Output atteso
- l'estensione continua a funzionare anche su repo grandi
- messaggi chiari all'utente sul tipo di caricamento in uso

### Criteri di accettazione
- se `truncated` e' true, il prodotto non si limita a un warning in console
- la sidebar resta usabile senza blocchi evidenti
- build e type-check verdi

### Prompt da usare
```text
Implementa un fallback robusto per repository grandi in GitHub Tree Navigator.

Problema attuale:
- quando la Git Trees API restituisce `truncated: true`, oggi c'e' solo un warning in console

Obiettivi:
- progettare e implementare un caricamento lazy/on-demand delle directory come fallback
- mantenere chiara la distinzione tra modalita' normale e fallback
- evitare freeze UI e regressioni sulle repository piccole/medie
- mantenere l'architettura modulare esistente

Vincoli:
- niente backend
- niente dipendenze inutili
- ui.ts deve restare priva di logica di fetch e mutazioni di stato

Alla fine valida con npm run type-check e npm run build e spiegami il comportamento finale lato UX.
```

---

## Step 3 - Keyboard navigation completa

### Obiettivo
Rendere la sidebar realmente veloce per utenti power.

### Scope
- scorciatoia per aprire/focalizzare la sidebar
- frecce per muoversi nel tree
- `Enter` per aprire il file selezionato
- `ArrowRight` / `ArrowLeft` per espandere-collassare directory
- `Escape` per chiudere pannello o uscire dalla search
- `/` o scorciatoia equivalente per focus immediato sulla search

### Output atteso
- navigazione da tastiera coerente e accessibile

### Criteri di accettazione
- il tree e' interamente navigabile senza mouse
- nessuna collisione grave con shortcut native di GitHub

### Prompt da usare
```text
Implementa la keyboard navigation per GitHub Tree Navigator.

Requisiti minimi:
- scorciatoia per aprire/focalizzare la sidebar
- navigazione nel tree con le frecce
- expand/collapse directory con tastiera
- apertura file con Enter
- Escape per chiudere o uscire dalla modalita' corrente
- scorciatoia rapida per portare il focus sulla search

Vincoli:
- accessibilita' prima di tutto
- evita conflitti inutili con GitHub
- mantieni separazione netta tra rendering UI e gestione stato

Aggiorna anche README e landing page se introduci shortcut utente-visibili.
Poi esegui npm run type-check e npm run build.
```

---

## Step 4 - Cache del tree per repo/ref

### Obiettivo
Ridurre latenza percepita e consumo API quando l'utente torna sullo stesso repo o branch.

### Scope
- cache in-memory e/o session-based per `owner/repo/ref`
- invalidazione semplice e prevedibile
- distinguere dati cache e stato UI locale
- non salvare in modo eccessivo dati voluminosi in storage persistente senza motivo

### Output atteso
- riapertura piu' rapida della sidebar su repo gia' visitati

### Criteri di accettazione
- i secondi accessi allo stesso repo/ref evitano fetch inutili quando i dati sono ancora validi
- nessuna regressione su token, filtri o active file

### Prompt da usare
```text
Implementa una cache del tree per GitHub Tree Navigator.

Obiettivi:
- cache keyed by owner/repo/ref
- ridurre refetch inutili nelle navigazioni ripetute
- mantenere semplice l'invalidazione
- non introdurre bug di stale state tra repository o branch diversi

Preferenze:
- soluzione pragmatica, non iper-ingegnerizzata
- niente backend
- niente dipendenze non necessarie

Alla fine spiegami:
- dove vive la cache
- quando viene invalidata
- quali tradeoff hai scelto

Valida con npm run type-check e npm run build.
```

---

## Step 5 - Context actions per file

### Obiettivo
Aumentare l'utilita' pratica della sidebar per operazioni frequenti.

### Scope
- azioni per file: copy path, copy permalink, open raw, open blame, open history
- UI minimale e coerente con GitHub
- supporto sia repo browsing sia, dove sensato, PR mode

### Output atteso
- menu contestuale o quick actions per ciascun file

### Criteri di accettazione
- le azioni funzionano senza rompere il click principale sul file
- nessuna regressione di accessibilita'

### Prompt da usare
```text
Implementa context actions utili per i file nella sidebar di GitHub Tree Navigator.

Feature richieste:
- copy file path
- copy permalink GitHub
- open raw
- open blame
- open history

Vincoli:
- UX semplice e non invasiva
- nessuna dipendenza esterna per menu o tooltip
- mantenere pulita l'architettura attuale

Se serve, aggiungi helper puri per generare le URL corrette.
Poi aggiorna la documentazione e valida con npm run type-check e npm run build.
```

---

## Step 6 - Supporto GitHub Enterprise / host configurabili

### Obiettivo
Aprire il prodotto a contesti aziendali reali.

### Scope
- supportare host GitHub Enterprise configurabili
- derivare la base API dal dominio quando possibile o tramite configurazione esplicita
- preservare il comportamento attuale su github.com
- aggiornare permessi e documentazione con attenzione

### Output atteso
- supporto chiaro a github.com e GitHub Enterprise Server

### Criteri di accettazione
- nessuna regressione sull'host pubblico
- configurazione comprensibile per l'utente

### Prompt da usare
```text
Implementa il supporto a GitHub Enterprise in GitHub Tree Navigator.

Obiettivi:
- estendere il parser URL e la logica API oltre github.com
- mantenere compatibilita' totale con github.com
- introdurre una configurazione minima e comprensibile per host self-hosted
- aggiornare manifest, documentazione e UX dove necessario

Vincoli:
- massima prudenza sui permessi del manifest
- nessun backend
- design semplice e difendibile

Esegui le modifiche end-to-end e valida con npm run type-check e npm run build.
```

---

## Step 7 - Supporto submodule

### Obiettivo
Gestire correttamente i repository che contengono submodule.

### Scope
- identificare i submodule dal payload GitHub o tramite fallback logico
- renderizzarli come nodi distinti
- consentire apertura del target corretto
- evitare che vengano trattati come file normali o directory espandibili errate

### Output atteso
- submodule riconoscibili e usabili nel tree

### Criteri di accettazione
- i submodule hanno icona/stato dedicato
- il click porta alla destinazione sensata

### Prompt da usare
```text
Implementa il supporto ai git submodule in GitHub Tree Navigator.

Requisiti:
- i submodule non devono apparire come normali file/blob
- serve una resa visiva dedicata e un comportamento di click coerente
- integra il tutto senza rompere repo mode, PR mode e search

Mantieni il codice minimale, documenta i casi limite e valida con npm run type-check e npm run build.
```

---

## Step 8 - Supporto commit/tag views

### Obiettivo
Rendere la sidebar utile anche fuori dal browsing del branch principale.

### Scope
- supportare URL su commit SHA e tag
- costruire link file coerenti con il contesto corrente
- mantenere active file highlight corretto

### Output atteso
- sidebar coerente anche in snapshot storiche

### Criteri di accettazione
- su pagine commit/tag la navigazione non rimbalza inavvertitamente sul branch di default

### Prompt da usare
```text
Estendi GitHub Tree Navigator per supportare commit view e tag view.

Obiettivi:
- riconoscere correttamente il contesto di navigazione quando l'utente e' su commit o tag
- generare URL file coerenti con quel contesto
- mantenere highlight del file attivo e search consistente

Vincoli:
- niente hack fragili basati solo sul DOM se esiste una soluzione URL/API piu' robusta
- non rompere il supporto attuale ai branch standard

Alla fine aggiorna la documentazione e valida con npm run type-check e npm run build.
```

---

## Step 9 - Bookmark e recent files/repos

### Obiettivo
Creare una retention feature utile senza gonfiare il prodotto.

### Scope
- recent files/recent repos come MVP
- opzionalmente bookmarks manuali se il costo resta contenuto
- persistenza locale via `chrome.storage.local`
- UI semplice e leggibile

### Output atteso
- accesso rapido a file o repo visitati di recente

### Criteri di accettazione
- la feature e' utile senza rendere la sidebar rumorosa
- nessuna regressione prestazionale evidente

### Prompt da usare
```text
Implementa una feature di productivity leggera per GitHub Tree Navigator: recent files / recent repos, con eventuali bookmarks manuali solo se il costo tecnico resta basso.

Requisiti:
- persistenza locale
- UI essenziale e non invadente
- niente complessita' eccessiva
- integrazione coerente con la sidebar esistente

Preferisco un MVP ben fatto piuttosto che una feature sovra-progettata.
Aggiorna README se serve e valida con npm run type-check e npm run build.
```

---

## Step 10 - Search avanzata e ranking risultati

### Obiettivo
Portare la search oltre il semplice filtro live.

### Scope
- ranking migliore dei match
- distinzione esplicita filename-only vs full-path search
- supporto migliore a glob/path patterns
- eventuale sezione top results o salto rapido al primo risultato

### Output atteso
- ricerca piu' veloce e piu' precisa in repo grandi o strutture profonde

### Criteri di accettazione
- la UX della ricerca migliora realmente senza diventare piu' complessa da capire

### Prompt da usare
```text
Migliora la search di GitHub Tree Navigator oltre il filtro live attuale.

Obiettivi:
- ranking risultati migliore
- differenziare chiaramente ricerca su filename e ricerca su full path
- migliorare il supporto ai glob/pattern
- aggiungere eventuali micro-interazioni utili solo se aumentano davvero la velocita' d'uso

Vincoli:
- non peggiorare la semplicita' della UI
- non introdurre librerie di fuzzy search se non strettamente necessarie

Esegui l'implementazione, aggiorna la documentazione se serve, poi valida con npm run type-check e npm run build.
```

---

## Step 11 - Polish finale, release prep e marketing alignment

### Obiettivo
Chiudere il ciclo con documentazione, store listing e sito perfettamente allineati al prodotto.

### Scope
- aggiornare README, landing page e privacy/support links dove necessario
- verificare descrizione Chrome Web Store e screenshot richiesti
- verificare versione, changelog e note di rilascio
- controllare che le nuove feature siano descritte in modo accurato e non ambiguo

### Output atteso
- repository e sito pronti per una release pubblica piu' forte

### Criteri di accettazione
- nessuna discrepanza tra prodotto, sito, README e store listing

### Prompt da usare
```text
Esegui il polish finale di GitHub Tree Navigator in vista del rilascio.

Obiettivi:
- allinea README, landing page GitHub Pages e materiali del progetto alle feature realmente implementate
- verifica che privacy, supporto, CTA e metadata SEO siano coerenti
- prepara il progetto per una release ordinata

Non aggiungere feature nuove in questo step se non sono strettamente necessarie.
Concentrati su accuratezza, chiarezza e qualita' del rilascio.

Valida con npm run type-check e npm run build e indicami eventuali elementi esterni che devo aggiornare manualmente nel Chrome Web Store.
```

---

## Ordine finale consigliato

1. Step 0 - Hardening baseline
2. Step 1 - PR / Files Changed
3. Step 2 - Large repo fallback
4. Step 3 - Keyboard navigation
5. Step 4 - Cache tree
6. Step 5 - Context actions
7. Step 6 - GitHub Enterprise
8. Step 7 - Submodule
9. Step 8 - Commit/tag views
10. Step 9 - Recent/Bookmarks
11. Step 10 - Search avanzata
12. Step 11 - Polish finale

## Nota pragmatica

Se vuoi massimizzare impatto e time-to-value, il sottoinsieme minimo ad alto ROI e':

1. Step 1 - PR / Files Changed
2. Step 2 - Large repo fallback
3. Step 3 - Keyboard navigation
4. Step 4 - Cache tree
5. Step 11 - Polish finale

Questo blocco da solo sposterebbe l'estensione da buon MVP a prodotto molto piu' competitivo.