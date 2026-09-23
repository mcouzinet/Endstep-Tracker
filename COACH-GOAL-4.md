# Objectif 4 : le coach en direct (serveur local) et la réponse adverse

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL-4.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS-COACH4.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS-BOT.md` et `PROGRESS-COACH3.md` (pièges déjà
résolus) et `PROGRESS-COACH4.md` s'il existe, avant toute action et après toute compaction de contexte.** Décide
seul, note chaque décision dans PROGRESS-COACH4.md, ne demande rien à l'utilisateur.

## But

Deux parties indépendantes, dans cet ordre.

**Partie A — Serveur local : l'analyse sans export/import.** Un petit serveur HTTP en Java (le JDK en a un,
`jdk.httpserver`, aucune dépendance) garde Forge chargé et répond sur `127.0.0.1` uniquement. Le tableau de bord
détecte le serveur, propose « Analyser » dans le détail d'un match, envoie les décisions enregistrées et reçoit
l'analyse (meilleur coup, écart) qu'il range sous `ana:<matchId>` comme aujourd'hui. Plus d'aller-retour de fichiers.
L'ancienne boucle (export → `coach-replay.js` → import) reste disponible.

**Partie B — La réponse adverse.** Aujourd'hui le bot et le rejeu évaluent un coup juste après sa résolution : ni
réponse adverse, ni tour suivant. On ajoute une **simulation courte de la suite** dans la copie : après mon coup, le
reste de mon tour puis le tour adverse complet sont joués par la logique de Forge (l'adversaire attaque, bloque, lance
ses sorts depuis une main **tirée au sort**), et l'état est noté au début de mon tour suivant. Utilisée sur les
décisions serrées (le bot) et dans le rejeu (le coach, avec K tirages de main adverse dont l'écart-type devient enfin
significatif).

Critères de succès : A — depuis le tableau de bord, un clic analyse un match réel en moins de 10 s pour ~10
décisions, sans manifest modifié pour le Store (CORS côté serveur), harnais et e2e verts. B — sur les décisions de
démonstration, la réponse adverse change au moins un classement de façon défendable (une attaque dans du mana ouvert
ou un sort dans un contre devient moins bonne) ; le bot avec réponse adverse sur les décisions serrées ne fait pas
moins bien que **68 %** contre Forge dans le miroir (300 parties, IC 95 %), avec ≤ 3× le temps par partie. En
dessous : PARTIEL avec analyse, la profondeur reste à 0 par défaut.

## Contexte (ce qui existe déjà)

- Laboratoire `~/Developer/Endstep-coach/bot/` : `CoachEvaluator.java` (37 comptes + 6 zones × 32 vecteurs de cartes,
  `bot/coach-model.txt` + `bot/coach-cards.txt`, régression logistique AUC 0,84), `CoachController.java` (options
  simulées avec `GameSimulator` + `NoRecursion`, une option par cible, ligne de base après résolution de la pile,
  `AiCache.clear()` à chaque décision, mode rank-only `rankOnly/rankPhase/rankTurn/rankSink`, combat énuméré
  derrière `BOT_COMBAT=1`), `CoachLobbyPlayer.java`, `CoachAi.java`, `BotMatch.java`, `StateBuilder.java`
  (décision + contexte → texte `GameState`), `DecisionReplay.java` (K déterminisations, classement, appariement du
  coup joué ; la partie est lancée sur le fil de jeu de Forge via `ThreadUtil.invokeInGameThread` + `CountDownLatch`,
  l'état appliqué au hook de `Match.startGame(game, hook)`), `Json.java`, `coach-replay.js` (export → contexte →
  DecisionReplay → analysis.json : ma liste depuis la fiche / le magasin `decks` / déduite des instantanés ;
  archétype adverse depuis la note, sinon `meta.js` sur `data/meta/<format>.json`, sinon cartes vues + terrains),
  `fetch-meta.js`, `report.js`, `run-eval.sh`. Tout est décrit dans PROGRESS-BOT.md et PROGRESS-COACH3.md.
- Extension : le tableau de bord importe une analyse (`#import-analysis`, clé `ana:<id>`, colonnes « Meilleur coup »
  et « Écart » dans le bloc Coach, `Coach.describeOption`), exporte `analyses` et `decks`, connaît pour chaque match :
  `mySeat`, `myDeck`, les cartes adverses vues (`T.seenCards`), les couleurs, le format, l'archétype (note
  `notes[id].archetype` ou reconnu `guessFor(m).name`), les décisions (`decisions[id]`, chargées à l'ouverture du
  match via `loadDecisions`). `release.sh` (build Store de l'utilisateur) n'embarque aucun fichier `coach*` : ne pas
  y toucher, et **ne pas ajouter de `host_permissions`** au manifest pour le serveur local (le CORS côté serveur
  suffit à une page d'extension).
- Forge (vérifié dans le jar) : `PhaseHandler.devAdvanceToPhase(PhaseType[, Runnable])` enchaîne
  `checkStateBasedEffects → onPhaseEnd → advanceToNextPhase → onPhaseBegin` jusqu'à la phase cible **sans passer la
  priorité** : les actions de tour (dégagement, pioche, déclaration des attaquants/bloqueurs par les contrôleurs,
  dégâts) ont lieu, mais personne ne lance de sort. Pour que l'adversaire lance ses sorts dans une copie, il faut le
  lui demander explicitement : `controller.chooseSpellAbilityToPlay()` → `playChosenSpellAbility(sa)` →
  `GameSimulator.resolveStack(copy, other)` en boucle bornée, aux phases principales. Dans une copie, les
  contrôleurs sont des `CoachController(inCopy = true)` : ils délèguent le choix des sorts à Forge (`super`).
  `GameCopier(game).makeCopy()` ; `Player.getCardsIn(ZoneType)` ; `GameAction.moveTo(ZoneType, Card, null, null)`
  (EvalCheck l'utilise pour remettre une main en bibliothèque et repiocher sans déclencheur).
- **Règle « pas de triche » (rappel)** : dans une copie tirée du vrai jeu, la main adverse est la vraie main. Avant
  toute simulation qui laisse l'adversaire agir, sa main est remise dans sa bibliothèque, mélangée, et repiochée en
  nombre égal (déterminisation) ; l'évaluateur ne lit jamais la main adverse. Test obligatoire en B1.
- `java --list-modules` contient `jdk.httpserver@17` : `com.sun.net.httpserver.HttpServer`.
- Machine : macOS 10 cœurs, java 17, node 22, session avec écran (Forge l'exige).

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc.** Aucun appel réseau dans ce plan (le serveur n'écoute que
   sur 127.0.0.1 ; l'instantané métagame existant suffit, `fetch-meta.js` est à la main de l'utilisateur).
2. Pas de triche (voir Contexte) : déterminisation avant toute action adverse simulée, test anti-triche vert.
3. L'extension reste fonctionnelle : `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js
   && node test/hook.test.js` verts avant tout commit ; changements additifs ; sans serveur, rien ne change à l'écran
   (le bouton n'apparaît que si `/health` répond). Pas de nouvelle permission dans le manifest.
4. Laboratoire dans `~/Developer/Endstep-coach/` (`bot/`, `data/coach4/`). Un commit par phase dans chaque dépôt
   touché. Ne rien installer.
5. Boîtes de temps : à 1,5× la boîte sans résultat, BLOQUÉ + cause + essais dans PROGRESS-COACH4.md, phase suivante
   indépendante. B ne dépend pas de A.
6. Tenir `~/Developer/Endstep-coach/PROGRESS-COACH4.md` à jour après chaque étape (format en fin de document).
7. Gros runs : `nohup … &`, ≤ 6 JVM, `-Xmx2g` (3g à deux bots), journaux dans `data/coach4/logs/`. Le serveur ne
   traite qu'une analyse à la fois (verrou), Forge n'étant pas fait pour des parties concurrentes dans une JVM.

## Livrables et critères de fin

- [x] A1 : `bot/CoachServer.java` : `GET /health`, `POST /analyse` (contrat ci-dessous), CORS, verrou, Forge chargé
      une fois ; `bot/coach-server.sh` (démarrage/arrêt, journal) ; test par `curl` sur le contexte de démo.
- [x] A2 : tableau de bord : détection du serveur, bouton « Analyser avec le coach local » dans le détail, envoi,
      réception, stockage `ana:`, états (en cours, erreur), i18n, tests, harnais (serveur lancé pendant le harnais).
- [x] A3 : e2e réel (une exécution) : match joué, analyse par le bouton, colonnes affichées ; README.
- [x] B1 : déterminisation + rollout dans `CoachController` (`depth`) : après mon option, fin de mon tour puis tour
      adverse par Forge, évaluation au début de mon tour suivant ; test anti-triche ; test « le rollout change une
      décision-piège ».
- [x] B2 : bot : profondeur 1 sur les décisions serrées (`BOT_DEPTH=1`, écart des deux meilleures < 3 pts, K = 3),
      mesure miroir 300 parties et temps/partie ; décision par défaut selon le critère.
- [x] B3 : rejeu : `depth` et K exposés (`coach-replay.js`, serveur) ; écart-type affiché dans le bloc Coach ;
      analyse de démo et e2e refaites.
- [x] Rapport, limites, prochaines étapes, `STATUT FINAL`.

## Contrat HTTP (partie A)

- `GET http://127.0.0.1:8765/health` → `{ "ok": true, "model": <parties>, "features": 229, "cards": 713, "busy": false }`
- `POST http://127.0.0.1:8765/analyse`, corps JSON :
  ```
  { "matchId": "…", "format": "pauper", "mySeat": 0,
    "myDeck": [{ "name", "quantity" }] | null,          // null : la liste sera déduite des instantanés
    "oppArchetype": "Blue Terror" | null,                // note ou reconnaissance côté tableau de bord
    "oppColours": ["U"], "oppSeen": { "Tolarian Terror": 2, … },
    "games": { "1": [décision, …] },                     // exactement decisions[matchId]
    "k": 1, "depth": 0 }                                 // options (B3)
  ```
  réponse = l'objet d'analyse du match tel que le tableau de bord le stocke :
  `{ "model": <parties>, "at": ISO, "determinizations": k, "depth": d, "games": { "1": [ { best, bestScore, played,
  playedScore, delta, sd, options, notes } | { skipped } ] } }`. Erreur : `{ "error": "…" }` avec un statut 4xx/5xx.
- En-têtes sur toutes les réponses et sur `OPTIONS` : `Access-Control-Allow-Origin: *`,
  `Access-Control-Allow-Headers: Content-Type`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`. Écoute sur
  `127.0.0.1` seulement (jamais `0.0.0.0`).

## Phase 0 — Préparation (15 min)

1. `data/coach4/logs/`, `PROGRESS-COACH4.md`. Tests de l'extension verts ; `node bot/parity.js data/bot/parity.jsonl`
   vert (relancer `EvalCheck` avec `bot/coach-model.txt` si nécessaire).
2. `javap` de `com.sun.net.httpserver.HttpServer` (création, `createContext`, `HttpExchange`) et de
   `PhaseHandler.devAdvanceToPhase` ; noter dans le journal.

## Partie A

### Phase A1 — Le serveur (boîte : 2 h)

1. `bot/CoachServer.java` : initialisation Forge comme `BotMatch`, `CoachEvaluator` chargé une fois, `HttpServer`
   sur `127.0.0.1:8765` (port en argument), un `synchronized` autour de chaque analyse, journal sur stderr.
   Le contexte est construit en Java à partir du corps (porter la logique de `coach-replay.js` : ma liste depuis
   `myDeck` sinon déduite des instantanés + terrains de base ; liste adverse depuis `data/meta/<format>.json` par
   nom d'archétype (insensible à la casse) sinon cartes vues + terrains des couleurs) puis `DecisionReplay
   .replayDecision` (extraire de `main` une méthode réutilisable qui rend la structure de réponse). Les décisions
   sont rejouées sur le fil de jeu de Forge comme aujourd'hui.
2. `bot/coach-server.sh start|stop|status` : `nohup java -Xmx2g -cp "<jar>:../sim:../bot" CoachServer 8765`, PID dans
   `data/coach4/server.pid`, journal `data/coach4/logs/server.log` ; `status` interroge `/health`.
3. Vérification : `curl -s 127.0.0.1:8765/health` ; `curl -s -X POST --data @bot/test/replay-demo-request.json
   127.0.0.1:8765/analyse` (écrire ce fichier à partir de `bot/test/replay-demo.json`) → 4 décisions analysées,
   mêmes meilleurs coups que `DecisionReplay` ; temps total < 5 s ; une deuxième requête pendant la première attend
   (verrou) ; `OPTIONS` répond 204 avec les en-têtes CORS.

### Phase A2 — Le tableau de bord (boîte : 2 h)

1. `dashboard.js` : au démarrage, `fetch('http://127.0.0.1:8765/health')` avec un délai court (`AbortController`,
   1,5 s) ; en cas de succès, `coachServer = { model, … }`. Aucune erreur affichée si absent (console silencieuse).
2. Détail d'un match ouvert, quand `coachServer` existe et que le match a des décisions : bouton « Analyser avec le
   coach local » (icône existante `#i-…` la plus proche) à côté du bloc Coach ; clic → construit la requête
   (contrat ci-dessus : `myDeck` = `myDeck(m).cards` ou `null`, `oppArchetype` = `archetype(m) || (guessFor(m)||{}).name
   || null`, `oppColours`, `oppSeen` = `T.seenCards` de chaque adversaire fusionnées, `games` = `decisions[m.id]`),
   POST, pendant l'attente le bouton devient « Analyse en cours… » (désactivé), à la réponse `chrome.storage.local.set
   ({ ['ana:' + id]: réponse })` → le bloc se redessine avec les colonnes ; toast de succès ou d'erreur (message du
   serveur). Le bouton reste disponible pour refaire l'analyse (elle remplace l'ancienne).
3. Menu Données : « Analyser les matchs sans analyse » (séquentiel, un toast de progression, s'arrête à la première
   erreur) — optionnel si la boîte le permet.
4. i18n en/fr ; `test/harness/qa-live.js` ou un nouveau `qa-server.js` : lance le serveur (ou vérifie qu'il tourne),
   ouvre le harnais de démo, clique le bouton sur `m1`, attend `ana:m1`, vérifie les colonnes ; le harnais tourne
   depuis `file://` : Chrome autorise le `fetch` vers 127.0.0.1 grâce au CORS. Détecteur design sans remarque.

### Phase A3 — Bout en bout et documentation (boîte : 1 h)

1. `test/harness/e2e.js` : après la partie, si le serveur répond, cliquer le bouton et vérifier les colonnes
   (une seule exécution d'e2e). Capture.
2. README (section Coach) : le serveur local remplace l'export/import ; commandes de démarrage ; le serveur n'écoute
   qu'en local et ne stocke rien.
3. Commit des deux dépôts (extension 0.8.0).

## Partie B

### Phase B1 — Rollout avec réponse adverse (boîte : 3 h)

1. `CoachController` : `static int DEPTH = BOT_DEPTH (0|1)`, `static int K_ROLLOUTS = BOT_K (défaut 3)`,
   `static double CLOSE = 0.03`. Nouvelle méthode `double rollout(Game g, Player me, Option o)` :
   - copie de la partie (`GameCopier`), retrouver `me`/`opp` par nom ;
   - **déterminisation** : main adverse → bibliothèque (`moveTo(Library)`), mélange (`Collections.shuffle` sur une
     copie de la liste puis `PlayerZone.setCards` si accessible, sinon retirer/ajouter), repioche du même nombre par
     `moveTo(Hand)` (pas `drawCards` : déclencheurs) ;
   - jouer mon option dans la copie (cibles copiées comme dans `GameSimulator` : réutiliser `simulateSpellAbility`
     puis `getSimulatedGameState()` comme point de départ est plus simple que de rejouer à la main) ;
   - puis la suite : tant que la copie n'est pas au `UNTAP` de mon tour suivant : aux phases principales du joueur
     actif, boucle bornée (≤ 8) `sa = ctrl.chooseSpellAbilityToPlay()` → `ctrl.playChosenSpellAbility(sa)` →
     `GameSimulator.resolveStack(copy, other)` ; puis `devAdvanceToPhase(phase suivante)` (les attaques/blocs des
     phases de combat passent par les contrôleurs de la copie, donc par Forge). Mon propre jeu dans la copie est
     celui de Forge (contrôleur `inCopy`) : c'est une politique de rollout, pas notre décision.
   - évaluation par `CoachEvaluator` au point d'arrêt ; en cas d'exception, `NaN` (compteur) et repli sur le score à
     un coup.
   Le score d'une option en profondeur 1 = moyenne sur `K_ROLLOUTS` déterminisations. `evalPhase` non utilisé (le
   point d'arrêt est une vraie phase de début de tour, comme les états d'entraînement).
2. Test `bot/RolloutCheck.java` (ou dans `EvalCheck`) : (a) anti-triche : deux rollouts de la même option avec deux
   graines donnent des scores différents quand la main adverse compte, et la main adverse réelle n'est jamais
   consultée (vérifier qu'après déterminisation la main de la copie diffère de l'originale dans ≥ 90 % des cas) ;
   (b) décision-piège : état de démo « attaquer avec une 2/2 dans 2 mana bleus ouverts, archétype avec 4
   Counterspell/2 Snuff Out » — la profondeur 1 doit baisser l'attaque ou le sort par rapport à la profondeur 0
   dans la majorité des tirages ; noter les scores ; (c) temps par rollout.
3. Garde-fous : rollout seulement si `depth = 1` et si l'écart entre les deux meilleures options à un coup est
   `< CLOSE` (sinon le classement à un coup suffit) ; jamais dans une copie (`inCopy`) ; timeout par décision
   (si > 5 s, revenir au score à un coup et compter).

### Phase B2 — Mesure du bot (boîte : 1 h + exécution ~1 h)

1. `run-eval.sh` accepte des variables d'environnement passées aux JVM (`BOT_DEPTH=1 BOT_K=3`). Miroir 2×75 par
   sens (300 parties) avec profondeur 1, plus le témoin déjà connu (profondeur 0 : 68,3 % sur 300, IC 63–73).
2. `report.js` : ajouter le nombre de rollouts par partie et le temps moyen par partie (déjà `ms/decision`).
3. Critère : ≥ 68 % (IC recouvrant) et ≤ 3× le temps par partie → `BOT_DEPTH=1` devient la valeur par défaut du bot
   ; sinon reste 0, résultat noté.

### Phase B3 — Le rejeu et le coach (boîte : 1 h 30)

1. `DecisionReplay` : arguments `K` et `depth` ; en profondeur 1 chaque déterminisation du rejeu (main adverse déjà
   tirée par `StateBuilder`) fait un rollout complet de mon tour puis du tour adverse ; le score d'une option =
   moyenne, `sd` = écart-type sur les K tirages (enfin non nul). `coach-replay.js` et le serveur (`k`, `depth`)
   passent les paramètres ; le tableau de bord envoie `k: 3, depth: 1` quand le serveur annonce
   `"depth": true` dans `/health`.
2. Bloc Coach : l'infobulle du meilleur coup montre « ± sd » et K ; la note mentionne la profondeur.
3. Analyses de démo et e2e refaites (K = 3, profondeur 1) ; temps par décision noté (attendu 1–3 s).

## Phase finale — Rapport (30 min)

- PROGRESS-COACH4.md : contrat HTTP, temps de réponse, résultats B (tableau profondeur 0 / 1 : taux, IC, temps ;
  décision-piège), limites (rollout = politique Forge, un seul tour adverse, K petit, pas de blocs énumérés), prochaines
  étapes (2 coups d'avance sur les cas serrés, blocs et cibles simulés, un vrai réseau sur les vecteurs de cartes,
  explication par Claude).
- Tests verts, captures, commits. `STATUT FINAL : TERMINÉ` si A2 et B1 sont DONE et que A3, B2, B3 sont DONE ou
  PARTIEL avec mesures ; sinon `ARRÊT` avec la raison.

## Si bloqué

- Le tableau de bord ne joint pas le serveur : vérifier les en-têtes CORS sur la réponse **et** sur le préflight
  `OPTIONS` ; tester avec `curl -i -X OPTIONS -H "Origin: chrome-extension://x" -H "Access-Control-Request-Method: POST"`.
  Une page d'extension MV3 sans `host_permissions` est soumise au CORS comme une page web : c'est voulu.
- `HttpServer` sur le fil de jeu : ne jamais lancer une partie Forge depuis le fil HTTP ; passer par
  `ThreadUtil.invokeInGameThread` + latch comme `DecisionReplay`, et sérialiser.
- `devAdvanceToPhase` plante dans une copie (Combat nul, pile non vide) : avancer phase par phase avec
  `devAdvanceToPhase(phase suivante)` et `resolveStack` entre deux ; en dernier recours, rollout jusqu'à la fin de
  mon tour seulement (réponse instantanée de l'adversaire), PARTIEL.
- Les rollouts sont trop lents : K = 2, `CLOSE` = 0,02, ne pas rejouer les options « terrain » en profondeur.
- Le bot fait moins bien en profondeur 1 : c'est un résultat (la politique de rollout de Forge peut être pire que
  l'absence de rollout) ; garder 0 par défaut et noter.

## Journal de progression (format de `PROGRESS-COACH4.md`)

```
# Coach 4 — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation — DONE (10 min)
## Phase A1 — Serveur — EN COURS
- 10:20 /health ok, /analyse sur la démo : 4 décisions en 3,1 s
## Phase B1 — Rollout — …
## Métriques
- Serveur : 10 décisions en 6 s ; Bot profondeur 1 : 70 % (IC 65–75), 2,4× le temps
## Limites connues / prochaines étapes
…
STATUT FINAL : TERMINÉ
```
