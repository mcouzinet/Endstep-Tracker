# Objectif : prototype « coach » pour Endstep Tracker

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS.md` s'il existe, avant toute action et après toute
compaction de contexte.** Décide seul, note chaque décision dans PROGRESS.md, ne demande rien à l'utilisateur.

## But

Un « moteur d'analyse » de mes parties, comme un moteur d'échecs : pour chaque décision que je prends dans une partie
Endstep, une probabilité de victoire avant et après, et un signalement des chutes nettes (erreurs probables).
Prototype = pipeline complet de bout en bout, même si le modèle est modeste :

1. l'extension enregistre mes décisions (état du jeu, options proposées, choix) ;
2. Forge (le moteur d'Endstep, open source) joue des parties hors ligne et enregistre les états et l'issue ;
3. un modèle de valeur P(victoire | état) est entraîné sur ces parties ;
4. le tableau de bord de l'extension affiche, par décision, P(victoire) avant/après et signale les erreurs.

## Contexte (ce qui existe déjà)

- Extension Chrome MV3 dans `~/Developer/Endstep-tracker` : `hook.js` (monde MAIN : observe le WebSocket d'endstep.cc et
  quelques `fetch`), `tracker.js` (logique pure, transforme les messages en fiche de match, testée par
  `test/replay.test.js`), `content.js` (persiste dans `chrome.storage.local`, clés `match:<id>`, `note:<id>`, `decks`,
  `lastDeck`, `meta`), `dashboard.html/js` (tableau de bord, i18n via `_locales/{en,fr}/messages.json`), `meta.js`
  (reconnaissance du deck adverse via l'API publique `https://endstep.cc/api/metagame/v1`, testé par
  `test/meta.test.js`), `README.md`. Le harnais de QA (Puppeteer + Chrome for Testing) est dans `test/harness/`
  (lire son README ; `e2e.js` crée une session invitée et une partie sur endstep.cc : au plus une fois par phase).
- Protocole Endstep observé (WebSocket `/ws`) :
  - entrants : `GAME_STATE` (état complet : `players[]` avec `id`, `name`, `life`, `hand` (mes cartes ; celles de
    l'adversaire arrivent en `Hidden card`/`faceDown`), `handSize`, `librarySize`, `battlefield[]`, `graveyard[]`,
    `exile[]`, `manaPool` ; cartes avec `id`, `name`, `power`, `toughness`, `tapped`, `types[]`, `counters`,
    `hasSummoningSickness`, `isToken` ; `stack[]`, `phase`, `step`, `turnNumber`, `activePlayerId`,
    `priorityPlayerId`, `pendingAction` {`type` (MULLIGAN, PRIORITY, CHOOSE_TARGETS, PAY_MANA, DECLARE_BLOCKERS…),
    `message`, `cardOptions[]`, `stringOptions[]`, `min`, `max`, `promptVersion`}, `matchScore`), `GAME_DELTA`
    (patch `state` + `players[{i,…}]`, appliqué par `tracker.applyDelta`), `GAME_EVENT`, `GAME_OVER`, `ATTACH`
    (rejoue des frames). `viewerSeat` = mon siège.
  - sortants (`{type:"GAME_ACTION", payload:{type, …, matchId, actionId, promptVersion}}`) : `PLAY_CARD {cardId,
    abilityIndex, autoPassAfter}`, `PASS_PRIORITY`, `KEEP_HAND {keepHand:true}` / `MULLIGAN {keepHand:false}`,
    `DECLARE_ATTACKERS {attackers:[ids]}`, `DECLARE_BLOCKERS {blockers:{attackerId:[blockerIds]}}`,
    `CHOOSE_TARGETS {targets:[ids]}`, `CHOOSE_CARDS {orderedCards:[ids]}`, `CHOOSE_MODE`, `CHOOSE_ABILITY`,
    `CHOOSE_NUMBER {numberValue}`, `YES`/`NO`, `DECLINE`, `CANCEL`, `TAP_MANA {cardId}`, `AUTO_PAY`,
    `CONCEDE_MATCH`, réglages `SET_PHASE_STOPS`, `SET_AUTO_YIELDS`.
- Le bot d'Endstep (« Forge AI », profils Default/Cautious/Reckless/Experimental) est l'IA de Forge : simuler contre
  Forge AI hors ligne = le même adversaire que le mode entraînement d'Endstep.
- Machine : macOS, 10 cœurs, 32 Go, `java` 17 disponible, pas de Maven (inutile : on compile contre le jar de Forge),
  `python3` sans scikit-learn (créer un venv), Node 22.

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc.** Les simulations se font uniquement dans Forge en local.
   Les seuls appels réseau autorisés : l'API métagame d'endstep.cc (lecture, doucement, ≤ 4 requêtes en parallèle),
   le téléchargement de Forge (GitHub / cardforge.org), pip/npm. Rien n'est envoyé nulle part.
2. L'extension doit rester fonctionnelle à chaque instant : `node test/replay.test.js && node test/meta.test.js` verts
   avant tout commit ; le suivi des matchs ne change pas de comportement. Le coach est additif.
3. Tout le laboratoire (Forge, données, modèle, scripts Python/Java) vit dans `~/Developer/Endstep-coach/`, jamais dans
   le dossier de l'extension (il est zippé pour des amis). Seuls `coach.js`, les modifications d'extension et le
   fichier de poids du modèle (`coach-model.json`, < 200 Ko) vont dans `Endstep-tracker`.
4. Git : si `Endstep-tracker` n'est pas un dépôt, `git init` (avec `.gitignore` : `test/harness/*.png`,
   `test/harness/harness-*.html`, `test/harness/*-data.js`, `test/harness/e2e-profile/`, `test/harness/meta-stub.js`).
   Un commit à la fin de chaque phase. Même chose pour `Endstep-coach` (ignorer `forge/`, `data/`, `.venv/`).
5. Ne pas installer autre chose que : un venv Python avec numpy/pandas/scikit-learn, Forge (archive dans
   `Endstep-coach/forge/`), éventuellement `openjdk@17` via Homebrew si `java` venait à manquer.
6. Chaque phase a une boîte de temps. À 1,5× la boîte sans résultat : noter BLOQUÉ + cause + ce qui a été essayé dans
   PROGRESS.md, passer à la phase suivante indépendante. Ne jamais rester bloqué en silence.
7. Tenir `~/Developer/Endstep-coach/PROGRESS.md` à jour **après chaque étape** (format en fin de document) : c'est ce
   que l'utilisateur lira à son retour, et ce qui permet de reprendre après une compaction.

## Livrables et critères de fin

- [ ] Phase 1 : décisions enregistrées par l'extension, visibles dans le détail d'un match, incluses dans l'export JSON.
- [ ] Phase 2 : `Endstep-coach/data/*.jsonl` contenant ≥ 3 000 parties Forge (états + issue), format identique à
      `GAME_STATE` d'Endstep sur les champs utilisés.
- [ ] Phase 3 : `coach-model.json` entraîné, AUC ≥ 0,70 sur des parties tenues à l'écart et supérieure à la
      baseline « différence de vie », rapport de calibration dans PROGRESS.md.
- [ ] Phase 4 : section « Coach » dans le tableau de bord : P(victoire) avant/après chaque décision, erreurs
      signalées, fonctionne même sans modèle (heuristique de repli).
- [ ] Phase 5 : tests verts, captures du harnais, PROGRESS.md complet avec « STATUT FINAL : TERMINÉ » (ou « ARRÊT »).

L'ordre d'exécution recommandé exploite le parallélisme : **lancer les simulations Forge (phase 2) en arrière-plan dès
que le dumper fonctionne, et faire les phases 1 et 4 pendant qu'elles tournent.**

## Phase 0 — Préparation (15 min)

1. Créer `~/Developer/Endstep-coach/` avec `PROGRESS.md` (en-tête + phases à venir), `decks/`, `data/`, `sim/`,
   `model/`. Git init des deux dépôts si nécessaire, commit initial.
2. Vérifier : `java -version` (17+), `node --version`, `python3 -m venv ~/Developer/Endstep-coach/.venv` puis
   `pip install numpy pandas scikit-learn`.
3. Lancer `node test/replay.test.js && node test/meta.test.js` dans `Endstep-tracker` : verts.

## Phase 1 — Enregistrer mes décisions dans l'extension (boîte : 2 h)

Conception (déjà prototypée une fois, à refaire proprement) :

- `hook.js` : dans le Proxy WebSocket, envelopper `ws.send` ; si la chaîne commence par `{"type":"GAME_ACTION"`,
  `post('out', data)`.
- `tracker.js` : `onAction(store, payload, now)` (exportée, testable). Ignorer `SET_PHASE_STOPS`, `SET_AUTO_YIELDS`,
  `TAP_MANA`, `AUTO_PAY`, `USE_FLOATING_MANA`, `UNDO`, `CHEAT`, `CONCEDE_MATCH`, et `PASS_PRIORITY` quand
  `pendingAction.cardOptions` est vide (rien d'autre n'était possible). Pour les autres, ajouter à
  `entry.dec[gameNumber]` (tableau) un objet :
  ```
  { at, turn, phase, active, prompt: { type, message, options: [noms des cardOptions] + stringOptions, min, max },
    answer: { type, …champs de l'action avec les ids de cartes résolus en noms (cardId, targets, orderedCards,
              attackers, blockers) },
    board: instantané compact de rt.state : players[{ life, hand: noms (moi) | handSize (adv.), library,
              battlefield: [{ n, p, t, tapped, types, sick, counters }], graveyard: [noms], exile: [noms],
              manaPool }], stack: [noms], turnNumber, phase, activePlayerId, priorityPlayerId }
  ```
  Les noms se résolvent via `rt.state` (zones + stack) et `pendingAction.cardOptions` (les cibles joueurs ont des ids
  négatifs et un `name`). `rt.state` doit être à jour : `handle` le maintient déjà (GAME_STATE et GAME_DELTA).
- `content.js` : message `out` → `T.onAction` → sauvegarde sous la clé `dec:<matchId>` (séparée de `match:` pour que
  la liste du tableau de bord n'ait jamais à la charger), même débounce que `save`.
- `dashboard.js` : charger `dec:<id>` à l'ouverture d'un match (`chrome.storage.local.get`), afficher dans chaque game
  un `<details>` « Mes décisions (n) » : tour, phase, invite, options, choix. L'export JSON inclut les décisions
  (`decisions: { matchId: {...} }`), l'import les restaure, la suppression d'un match supprime `dec:<id>`,
  `Tout effacer` aussi. i18n dans les deux catalogues.
- Test : étendre `test/replay.test.js` avec des frames sortantes (PLAY_CARD d'une carte de la main, PASS_PRIORITY avec
  et sans options, DECLARE_ATTACKERS) et vérifier la structure produite, la résolution des noms et l'exclusion des
  actions de réglage.
- Vérification : tests verts ; harnais `test/harness/qa-live.js` toujours vert ; un `e2e.js` (une seule fois) montre
  des décisions enregistrées sur une vraie partie contre le bot (la clé `dec:` existe, ≥ 3 décisions).

## Phase 2 — Forge hors ligne : simulateur et dump des états (boîte : 3 h, puis exécution en arrière-plan)

1. **Obtenir Forge** dans `Endstep-coach/forge/` : dernière release desktop (dépôt GitHub `Card-Forge/forge`,
   releases ; sinon `https://releases.cardforge.org/forge/forge-gui-desktop/`). Il faut le jar
   `forge-gui-desktop-*-jar-with-dependencies.jar` **et** le dossier `res/` (cartes). Ne pas construire depuis les
   sources (Maven absent) sauf impossibilité.
2. **Vérifier le mode simulation natif** : lire `forge-gui-desktop/src/main/java/forge/view/SimulateMatch.java` dans
   le dépôt (via GitHub, fichier brut) pour la syntaxe exacte, puis lancer 2 parties :
   `java -jar forge-gui-desktop-*.jar sim -d A.dck B.dck -n 2 -f Constructed` (ou équivalent). Le premier
   lancement peut être lent (chargement des cartes). Si Forge cherche un répertoire utilisateur, définir
   `-Dforge.home` / variables d'environnement selon SimulateMatch et la doc du dépôt.
3. **Decks** (`decks/*.dck`, format Forge : `[metadata]\nName=…\n[Main]\n4 Lightning Bolt\n…`) :
   - `mine.dck` : si l'utilisateur en a déposé un dans `decks/`, l'utiliser ; sinon la liste Burn des tests :
     4 Lightning Bolt, 4 Monastery Swiftspear, 4 Goblin Guide, 4 Lava Spike, 4 Rift Bolt, 4 Chain Lightning,
     4 Skullcrack, 4 Searing Blaze, 4 Eidolon of the Great Revel, 4 Light Up the Stage, 20 Mountain.
   - 8 à 10 archétypes adverses du format (Modern par défaut) construits depuis l'API :
     `GET /api/metagame/v1/Modern/decks?pageSize=50` puis, pour chaque archétype retenu (les plus joués),
     `GET /api/metagame/v1/Modern/decks/<slug>/cards?pageSize=50` → prendre les cartes avec `playRate ≥ 0,5`,
     `round(averageCopies)` exemplaires (max 4, sauf terrains de base), compléter à 60 avec des terrains de base
     selon `colours`. Script `sim/build-decks.js`. Si une carte est inconnue de Forge, la retirer et le noter.
4. **Dumper d'états** `sim/SimDump.java`, compilé contre le jar (`javac -cp forge-gui-desktop-*.jar SimDump.java`,
   exécuté avec `java -cp "forge-gui-desktop-*.jar:." SimDump …`). S'inspirer de SimulateMatch (initialisation
   `FModel`, `GameRules(GameType.Constructed)`, `RegisteredPlayer` + `Deck`, joueurs IA via `GamePlayerUtil`,
   `Match`/`Game`, `startGame`). Vérifier les noms de classes réels avec `jar tf` / `javap -cp` avant d'écrire.
   S'abonner aux événements de partie (`game.subscribeToEvents`, bus Guava : chercher dans `forge/game/event/` des
   classes comme `GameEventTurnPhase`, `GameEventTurnBegan`, `GameEventGameOutcome`) et écrire, à chaque changement de
   phase, une ligne JSON dans `data/<matchup>.jsonl` avec **les mêmes noms de champs que `GAME_STATE` d'Endstep** :
   `gameId, turnNumber, phase, activePlayerId, players:[{ id, name, life, handSize, hand:[noms], librarySize,
   battlefield:[{ name, power, toughness, tapped, types, hasSummoningSickness, counters }], graveyard:[noms],
   exile:[noms] }], stack:[noms]`, puis à la fin de partie une ligne `{ gameId, outcome: { winner: id } }`.
   Priorité à un dump qui marche (états par phase) sur un dump par décision (option de plus, si le temps le permet :
   sous-classer le contrôleur IA pour capturer les options proposées et le choix).
   Repli si l'API Java résiste après 1,5 h : lancer le `sim` natif et parser son journal texte pour n'en extraire
   que les vies par tour et l'issue ; le noter comme PARTIEL.
5. **Lancer les simulations** en arrière-plan : un processus JVM par matchup (`nohup … &`, ≤ 6 en parallèle sur
   10 cœurs, `-Xmx2g` chacun), ≥ 300 parties par matchup pour commencer, plus si le débit le permet (mesurer le
   débit sur 20 parties et noter parties/heure). Journaliser dans `data/logs/`. Pendant ce temps, avancer les
   phases 1 et 4.
6. Vérification : `wc -l data/*.jsonl`, un script `sim/check-data.js` qui compte les parties complètes (état + issue),
   la répartition des vainqueurs par matchup (aucun matchup à 100 %/0 % sans explication), et vérifie que 3 états
   pris au hasard ont bien tous les champs attendus.

## Phase 3 — Données et modèle de valeur (boîte : 2 h, après ≥ 3 000 parties)

1. **Features partagées** : écrire `Endstep-tracker/coach.js` (module UMD comme `tracker.js`/`meta.js`) contenant
   `features(state, mySeat)` → tableau de nombres, et `predict(features, model)` (voir 3). Le même fichier sert à
   l'entraînement (Node lit les jsonl → CSV) et à l'extension : parité garantie. Features du point de vue du siège
   évalué : tour, index de phase, suis-je le joueur actif, mes vies, vies adverses, différence, cartes en main (moi,
   adv.), bibliothèques, terrains (total/dégagés) de chaque côté, créatures (nombre, somme des forces, somme des
   endurances, créatures non malades) de chaque côté, autres permanents, cimetières, taille de la pile, différence de
   force totale, mana disponible. ~30 valeurs, toutes calculables depuis l'instantané de la phase 1.
2. **Jeu de données** `model/build.js` : pour chaque état, deux exemples (un par siège) avec label = ce siège a gagné ;
   exclure les parties sans issue ; **découpage par partie** (pas par état) train/valid/test 70/15/15.
3. **Entraînement** `model/train.py` (venv) : baseline `LogisticRegression` sur la seule différence de vie ; puis
   `LogisticRegression` sur toutes les features (avec `StandardScaler`) et `MLPClassifier(hidden_layer_sizes=(32, 16))`.
   Garder le meilleur AUC sur valid ; rapporter AUC, log-loss et calibration (10 déciles) sur test dans PROGRESS.md.
   Vérifications de bon sens sur le modèle retenu : P(victoire) monte quand les vies adverses baissent, quand ma force
   sur table monte ; sinon le noter.
4. **Export** `Endstep-tracker/coach-model.json` : type (`logreg`|`mlp`), moyennes/écarts du scaler, poids,
   liste ordonnée des features, métriques, date, nombre de parties. `predict` dans `coach.js` implémente la passe
   avant (ReLU + sigmoïde pour le MLP). Test `test/coach.test.js` : features sur un état du replay, `predict` reproduit
   à 1e-6 près 3 sorties calculées en Python sur les mêmes vecteurs (les stocker dans le test).
5. Critère : AUC test ≥ 0,70 et > baseline. Sinon : PARTIEL, garder l'heuristique de la phase 4.

## Phase 4 — Le coach dans le tableau de bord (boîte : 2 h)

1. `coach.js` expose aussi `heuristic(features)` : une évaluation à la main (sigmoïde d'une combinaison de la
   différence de vie, de force sur table et de cartes en main) utilisée quand `coach-model.json` est absent ou
   invalide, marquée « heuristique » dans l'interface.
2. Dashboard, dans chaque game qui a des décisions : bloc **Coach** (i18n en/fr) : tableau des décisions avec tour,
   phase, action (texte lisible), P(victoire) avant (instantané de la décision) → après (instantané de la décision
   suivante, ou état final de la game), Δ en points. Δ ≤ −15 signalé « erreur probable », Δ ≤ −30 « grosse
   erreur ». Mention discrète : « modèle entraîné sur N parties Forge AI (bêta) » ou « heuristique ». Préciser
   dans un tooltip que l'« après » inclut la réponse adverse (limitation connue).
3. Ne rien envoyer à un LLM dans cette session (pas de clé API) : l'explication en langage naturel est hors périmètre.
4. Vérification : harnais `test/harness/gen-demo.js` enrichi de décisions de démo, capture du bloc Coach en fr et en
   en, `detect.mjs` d'impeccable sans remarque (`node ~/.claude/skills/impeccable/scripts/detect.mjs --json
   dashboard.html dashboard.js`), tests verts.

## Phase 5 — Validation et rapport (30 min)

- Tests : `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js`.
- Harnais : `gen-demo.js` + `shots.js` + `qa-live.js` sans erreur.
- `e2e.js` une fois : partie contre le bot, décisions enregistrées, bloc Coach visible.
- PROGRESS.md : métriques finales, débit des simulations, décisions prises, limites connues, prochaines étapes
  suggérées (dump par décision et classement des options, explication par LLM, entraînement plus long), puis
  `STATUT FINAL : TERMINÉ` si les phases 1, 4 et 5 sont DONE et que 2 et 3 sont DONE ou PARTIEL avec données ;
  sinon `STATUT FINAL : ARRÊT` avec la raison.
- Commit final des deux dépôts. Version de l'extension : 0.5.0.

## Si bloqué

- Forge ne démarre pas / cartes introuvables : vérifier `res/` à côté du jar et le répertoire courant ; lire les
  premières lignes d'erreur ; essayer `-Duser.dir`. Après 1,5 h : repli « journal texte » (phase 2.4).
- Cartes de mon deck inconnues de Forge : les retirer et le noter.
- Débit trop faible (< 200 parties/heure au total) : réduire les matchups à 5, viser 3 000 parties, noter.
- Le modèle ne bat pas la baseline : vérifier le label (siège gagnant), l'alignement des champs Forge/Endstep,
  la fuite d'information (états après l'issue) ; sinon PARTIEL et heuristique.
- Toute erreur dans l'extension : revenir au dernier commit vert avant de réessayer.

## Journal de progression (format de `PROGRESS.md`)

```
# Coach — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation — DONE (12 min)
- java 17.0.20, node 22.18, venv ok
## Phase 1 — Décisions — EN COURS
- 14:05 hook.js : envoi des GAME_ACTION → ok (test)
- Décision : PASS_PRIORITY sans option ignoré (bruit)
## Phase 2 — Forge — BLOQUÉ : <cause> — essayé : <liste> — repli : <quoi>
…
## Métriques
- Simulations : 4 120 parties, 9 matchups, 1 350 parties/heure
- Modèle : MLP, AUC test 0,74 (baseline vie 0,63), log-loss 0,58
## Limites connues / prochaines étapes
…
STATUT FINAL : TERMINÉ
```
