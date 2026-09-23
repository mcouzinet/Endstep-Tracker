# Objectif 2 : un bot à nous qui bat l'IA de Forge

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL-2.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS-BOT.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS.md` (contexte du premier objectif) et
`PROGRESS-BOT.md` s'il existe, avant toute action et après toute compaction de contexte.** Décide seul, note chaque
décision dans PROGRESS-BOT.md, ne demande rien à l'utilisateur.

## But

Un joueur artificiel **à nous** qui prend toutes les décisions à la place de l'IA de Forge, Forge ne servant plus que
de moteur de règles. Le bot choisit un coup en **simulant chaque option** dans une copie de la partie et en notant le
résultat avec **notre modèle de valeur** (celui du coach, qui tient compte des ressources : cartes, plateau, mana,
tempo), au lieu des heuristiques scriptées carte par carte de Forge. Conséquences attendues :

- plus de « cartes mortes » : c'est nous qui décidons de lancer Dispatch ou Reckoner's Bargain, et de payer leurs coûts ;
- un bot qui préfère un échange favorable ou une carte piochée à trois points de vie ;
- surtout : le **même cœur** (« classer les options d'une décision ») servira ensuite au coach pour recommander le
  meilleur coup, et à l'auto-jeu pour améliorer le modèle. Ce n'est pas l'objet de ce plan : ici, on prouve que le
  bot existe et qu'il bat Forge.

Critère de succès de l'objectif : **le bot bat l'IA Default de Forge à ≥ 60 % dans le miroir de mon deck (mine.dck
contre mine.dck) sur ≥ 300 parties**, sans lire d'information cachée, et lance les cartes que Forge ne lançait
jamais. En dessous de 55 % : PARTIEL avec analyse. Une itération d'auto-jeu est un bonus (phase 4) si le temps le
permet.

## Contexte (ce qui existe déjà)

- `~/Developer/Endstep-coach/` : Forge 2.0.14 dans `forge/` (jar `forge-gui-desktop-2.0.14-jar-with-dependencies.jar`
  + `res/`), `sim/SimDump.java` (IA Forge contre IA Forge, dump JSONL des états + issue + sorts lancés), `sim/run-all.sh`,
  `sim/ai-check.js` (cartes jamais lancées / cartes marquées `AI:RemoveDeck:All`), `sim/check-data.js`, decks Pauper
  dans `decks/` (`mine.dck` = Esper Affinity, 8 archétypes gardés, `decks/SKIP` = Elves et Madness Burn),
  `model/build.js` + `model/train.py` (MLP (32,16) + StandardScaler, AUC 0,82), venv `.venv`, `PROGRESS.md`.
- `~/Developer/Endstep-tracker/coach.js` : les **37 features** (`FEATURES`, `features(state, mySeat, firstSeat)`,
  `PHASE_ALIAS`) et `predict(x, model)` (passe avant MLP : scaler, ReLU, sigmoïde) ; `coach-model.json` = poids.
  `test/coach.test.js` vérifie la parité JS/Python.
- API Forge vérifiée dans le jar (`javap -cp <jar> <classe>`), à re-vérifier avant d'écrire :
  - `forge.ai.LobbyPlayerAi.createIngamePlayer(Game, int)` fait `new Player(getName(), game, id)`,
    `player.setFirstController(createControllerFor(player))` (**privé**), `setAiProfile(...)`. Pour brancher notre
    contrôleur : sous-classer `LobbyPlayerAi` et **réécrire `createIngamePlayer`** avec ces trois lignes, le
    contrôleur étant notre `CoachController extends forge.ai.PlayerControllerAi` (constructeur `(Game, Player,
    LobbyPlayer)`).
  - Décisions surchargeables dans `PlayerControllerAi` : `chooseSpellAbilityToPlay()` (liste des sorts/capacités à
    jouer maintenant, vide = passer), `declareAttackers(Player, Combat)`, `declareBlockers(Player, Combat)`,
    `chooseTargetsFor(SpellAbility)`, `chooseCardsForEffect(...)`, `chooseSingleEntityForEffect(...)`,
    `confirmAction(...)`, `chooseBinary(...)`, `chooseNumber(...)`, `mulliganKeepHand(Player, int)`,
    `chooseCardsToDiscardFrom(...)`, `orderMoveToZoneList(...)`. `getAi()` donne l'`AiController` de Forge (repli).
  - Candidats : `forge.ai.ComputerUtilAbility.getSpellAbilities(CardCollectionView, Player)` puis
    `getOriginalAndAltCostAbilities(list, Player)` ; légalité : `sa.canPlay()` et
    `forge.ai.ComputerUtilMana.canPayManaCost(sa, player, 0, false)` ; `sa.isLandAbility()` pour les terrains.
    **Ne pas** filtrer avec `AiController.canPlaySa` (c'est l'« envie » scriptée de Forge : c'est elle qui rend des
    cartes mortes), seulement la légalité.
  - Simulation : `forge.ai.simulation.GameSimulator(SimulationController, Game, Player, PhaseType)` copie la partie
    et `simulateSpellAbility(sa, GameStateEvaluator, boolean resolve)` joue le sort dans la copie et renvoie
    `GameStateEvaluator.Score` (`value`, `availableValue`) ; `getSimulatedGameState()` donne la copie après coup.
    `forge.ai.simulation.GameCopier(game).makeCopy()` copie seule. `GameStateEvaluator.getScoreForGameState(Game,
    Player)` est **publique et surchargeable** : notre évaluateur la réécrit pour renvoyer notre P(victoire) (× 10 000
    en entier). `SimulationController(Score)` sert de contexte ; `SpellAbilityChoicesIterator` (setInterceptor)
    énumère les choix internes d'un sort (cibles, modes) : le reprendre tel quel si possible, sinon laisser Forge
    choisir les cibles dans la copie (`chooseTargetsFor` par défaut) et le noter.
  - Combat : `forge.game.combat.Combat` (`addAttacker(Card, GameEntity)`, `addBlocker(Card attacker, Card blocker)`),
    `forge.ai.AiAttackController` / `AiBlockController` = logique de Forge (repli).
  - Pas de Gson dans le jar : le modèle est lu depuis un export **texte plat** (voir phase 1), pas depuis le JSON.
- Machine : macOS 10 cœurs, 32 Go, java 17, node 22, pas de Maven (on compile contre le jar, comme SimDump).

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc.** Tout se passe dans Forge en local. Aucun appel réseau
   n'est nécessaire dans ce plan ; rien n'est envoyé nulle part.
2. **Le bot ne triche pas.** Dans Forge il a accès à tout l'objet `Game`, y compris la main et la bibliothèque
   adverses. Interdits dans toute décision et dans l'évaluateur : lire les cartes de la main adverse, l'ordre des
   bibliothèques, les cartes face cachée. Autorisés : tout ce qu'un joueur voit (nombre de cartes en main, cimetières,
   exil, plateau, pile, vies, mana). Test obligatoire (phase 1) : l'évaluateur donne le même score quand on remplace la
   main adverse par des cartes au hasard. Si des simulations sur plusieurs tours sont utilisées (phase 4), la main
   adverse est d'abord remise dans la bibliothèque, mélangée, et repiochée (déterminisation).
3. L'extension (`Endstep-tracker`) **ne change pas** dans ce plan, sauf ajout éventuel d'un export dans
   `model/` côté laboratoire. `coach.js` et `coach-model.json` restent la référence ; tests de l'extension verts
   avant tout commit du laboratoire qui touche à leur export (`node test/coach.test.js`).
4. Tout vit dans `~/Developer/Endstep-coach/bot/` (Java, scripts, résultats). Données de parties dans
   `Endstep-coach/data/bot/` (ignoré par git). Un commit d'`Endstep-coach` à la fin de chaque phase.
5. Ne rien installer (le venv existant suffit ; pas de Maven, pas de nouvelle bibliothèque Java : on n'a que le jar).
6. Boîtes de temps : à 1,5× la boîte sans résultat, noter BLOQUÉ + cause + essais dans PROGRESS-BOT.md et passer à la
   phase suivante indépendante. Ne jamais rester bloqué en silence.
7. Tenir `~/Developer/Endstep-coach/PROGRESS-BOT.md` à jour **après chaque étape** (format en fin de document).
8. Les simulations Forge exigent une session macOS avec écran (GuiDesktop lit l'échelle d'affichage) : ne pas ajouter
   `-Djava.awt.headless=true`. Lancer les gros runs avec `nohup … &`, ≤ 6 JVM en parallèle, `-Xmx2g` chacune,
   journaux dans `data/bot/logs/`.

## Livrables et critères de fin

- [x] Phase 1 : `bot/CoachEvaluator.java` reproduit `coach.js` (37 features + MLP) sur un `Game` Forge, parité
      vérifiée à 1e-6 sur des états dumpés, test « pas de triche » vert.
- [x] Phase 2 : `bot/CoachController.java` + `bot/BotMatch.java` : parties bot contre Forge, dump au même format que
      SimDump (+ `casts`, + par décision : options évaluées et scores), ≥ 20 parties sans exception.
- [x] Phase 3 : évaluation ≥ 300 parties dans le miroir + 3 archétypes, sièges alternés ; taux de victoire, cartes
      lancées, débit, dans PROGRESS-BOT.md. Critère : ≥ 60 % dans le miroir.
- [x] Phase 4 (bonus) : combat évalué par simulation et/ou une itération d'auto-jeu → nouveau modèle → re-mesure.
- [x] Phase 5 : rapport, limites, prochaines étapes, `STATUT FINAL`.

## Phase 0 — Préparation (15 min)

1. Créer `~/Developer/Endstep-coach/bot/` et `data/bot/logs/`, `PROGRESS-BOT.md` (en-tête + phases à venir).
   Ajouter `data/bot/` à `.gitignore` si `data/` n'y est pas déjà.
2. `java -version`, `node --version`, `node test/coach.test.js` dans Endstep-tracker : vert.
3. `javap` sur toutes les classes citées plus haut : noter dans PROGRESS-BOT.md toute différence avec ce document.
4. Relire `sim/SimDump.java` : `BotMatch.java` en reprend l'initialisation (`GuiBase.setInterface(new GuiDesktop())`,
   `FModel.initialize(null, null)`, `GameRules`, `Match`, `TimeLimitedCodeBlock`, dump JSON).

## Phase 1 — L'évaluateur : notre modèle de valeur dans Forge (boîte : 1 h 30)

1. **Export plat du modèle** : `model/export-flat.js` lit `Endstep-tracker/coach-model.json` et écrit
   `bot/coach-model.txt` : une ligne `features <n> <noms…>`, une ligne `mean …`, `scale …`, puis pour chaque couche
   `layer <in> <out>` suivie des poids (ligne par ligne) et du biais. Régénérer à chaque réentraînement.
2. **`bot/CoachEvaluator.java extends forge.ai.simulation.GameStateEvaluator`** :
   - `double pWin(Game g, Player me)` : construit les **37 features exactement comme `coach.js`** (relire
     `coach.js` : ordre `FEATURES`, alias de phases, `on_play` = ai-je joué en premier, `my_ready_creatures` =
     créatures non malades non engagées…) depuis les objets Forge (`Player.getLife()`, `getZone(ZoneType.Hand).size()`,
     `getCardsIn(ZoneType.Battlefield)`, `Card.isCreature()/getNetPower()/getNetToughness()/isTapped()/isSick()`,
     `game.getStack()`, `game.getPhaseHandler().getPhase().name()` / `getTurn()` / `getPlayerTurn()`), puis la passe
     avant MLP. **Pour l'adversaire : uniquement `handSize`, jamais le contenu de sa main.**
   - `getScoreForGameState(Game, Player)` renvoie `new Score((int) Math.round(pWin * 10000))`.
   - Qui a joué en premier : mémoriser au premier tour (`game.getPhaseHandler().getPlayerTurn()` au tour 1), sinon
     approximer ; noter le choix.
3. **Parité** : `bot/EvalCheck.java` charge un `.dck` quelconque, joue une partie IA Forge (comme SimDump) et, à chaque
   phase dumpée, écrit l'état JSON (format SimDump) **et** `pWin` Java. Puis `bot/parity.js` recalcule
   `Coach.predict(Coach.features(state, seat, firstSeat), model)` en JS sur ces états : écart max < 1e-6 (sinon
   < 1e-4 accepté si la cause est un arrondi de feature documenté). ≥ 200 états comparés.
4. **Test « pas de triche »** dans `EvalCheck` : sur 50 états, remplacer la main adverse par des cartes prises au hasard
   dans sa bibliothèque (dans une copie via `GameCopier`) : `pWin` identique au bit près.
5. Vérification : parité et anti-triche verts, notés dans PROGRESS-BOT.md avec les écarts mesurés.

## Phase 2 — Le contrôleur : choisir un coup en simulant (boîte : 3 h)

1. **`bot/CoachLobbyPlayer.java extends forge.ai.LobbyPlayerAi`** : `createIngamePlayer` réécrit pour poser un
   `CoachController`. Garder `setAiProfile("Default")` (les replis Forge en dépendent).
2. **`bot/CoachController.java extends forge.ai.PlayerControllerAi`**, décision par décision :
   - `chooseSpellAbilityToPlay()` : candidats = terrains jouables + sorts/capacités légaux et payables (voir Contexte),
     **plus « passer »**. Pour chaque candidat : `GameSimulator` avec `CoachEvaluator`, `simulateSpellAbility(sa,
     evaluator, true)` → score. « Passer » = score de l'état courant. Choisir le meilleur ; en cas d'égalité à
     ±0,2 pt, préférer passer en dehors de sa phase principale et jouer un terrain dans sa phase principale. Si la
     simulation lève une exception pour un candidat : le noter (compteur par carte) et retomber sur la note de Forge
     pour ce candidat uniquement (`getAi().canPlaySa` = veut/ne veut pas).
     Garde-fous : ≤ 12 candidats simulés par décision (garder les moins chers en mana et les terrains d'abord), et
     interdiction de rejouer indéfiniment une capacité sans coût (mémoriser les `sa` déjà activées dans le même
     passage de priorité).
   - Coûts : conserver les décisions de coût de Forge (`AiCostDecision`), mais vérifier sur Reckoner's Bargain que le
     sacrifice d'artefact est bien payé quand notre contrôleur a choisi de lancer la carte ; sinon surcharger
     `chooseCardsForEffect`/`chooseSingleEntityForEffect` pour ce cas (choisir le permanent de plus faible valeur
     selon l'évaluateur : simuler chaque choix si ≤ 6 options).
   - Cibles (`chooseTargetsFor`), modes, nombres, `confirmAction`, `chooseBinary` : version 1 = Forge (`super`),
     **sauf** quand l'énumération `SpellAbilityChoicesIterator` de Forge fonctionne dans `GameSimulator` (alors les
     cibles sont déjà optimisées par nos scores). Noter ce qui est réellement couvert.
   - `declareAttackers` / `declareBlockers` : version 1 = Forge (`super`). Version 1.5 (si la boîte le permet, sinon
     phase 4) : énumérer les sous-ensembles d'attaquants quand ≤ 5 créatures peuvent attaquer (≤ 32 combinaisons),
     simuler le combat dans une copie (`GameCopier`, poser les attaquants, laisser Forge bloquer avec
     `AiBlockController`, résoudre les dégâts jusqu'à la fin du combat) et noter avec l'évaluateur ; garder le
     meilleur. Même idée pour les blocs (≤ 4 bloqueurs × attaquants).
   - Mulligan : Forge (`super`).
3. **`bot/BotMatch.java`** (dérivé de SimDump) : `BotMatch A.dck B.dck N out.jsonl [timeoutSec] [seed] [aiA] [aiB]`
   avec `aiX` ∈ `forge` | `bot` ; siège A joue en premier au premier jeu, alternance ensuite comme Forge le fait.
   Dump : mêmes lignes que SimDump (états par phase, `outcome` avec `casts`) **plus** une ligne par décision du bot :
   `{"gameId","decision":{"turn","phase","seat","options":[{"sa":"texte","score":p}],"chosen":i,"ms":durée}}`.
   Journaliser exceptions et temps par décision.
4. **Fumée** : 20 parties `mine.dck` bot contre `mine.dck` forge, timeout 300 s : 0 exception non rattrapée, 0 timeout,
   temps moyen par décision et par partie notés. Si une carte fait systématiquement planter la simulation, l'exclure
   des candidats (liste `bot/blacklist.txt`) et le noter.
5. Vérification : `node sim/ai-check.js data/bot/smoke` adapté (ou un `bot/report.js`) montre que Dispatch et
   Reckoner's Bargain sont désormais lancés par le bot.

## Phase 3 — Mesure : le bot contre Forge (boîte : 1 h de travail, exécution en arrière-plan)

1. Runs (≤ 6 JVM, `nohup`, sorties dans `data/bot/eval/`) :
   - miroir : `mine.dck` (bot) contre `mine.dck` (forge), **≥ 300 parties** ; et le même en inversant les sièges
     (`aiA=forge aiB=bot`) pour neutraliser l'avantage du siège ;
   - bot avec `mine.dck` contre 3 archétypes gardés (terror, grixis-affinity, white-weenie), 150 parties chacun, à
     comparer aux taux Forge-contre-Forge de PROGRESS.md (39 %, 44 %, 27 %) ;
   - témoin : `mine.dck` forge contre `mine.dck` forge, 300 parties (doit être ≈ 50 %, sinon le siège compte : le
     noter et comparer à sièges égaux).
2. `bot/report.js` : par run, victoires du bot, intervalle de confiance à 95 % (Wilson), tours moyens, décisions par
   partie, temps par décision, cartes lancées par le bot vs par Forge (même méthode qu'ai-check), exceptions.
3. Critère : miroir ≥ 60 % (moyenne des deux sens) → DONE. 55–60 % → PARTIEL. < 55 % : analyser 20 décisions où le
   bot a choisi un coup que Forge n'aurait pas joué et où P(victoire) a chuté juste après ; classer les causes
   (évaluateur, cibles Forge, combat Forge, bug) ; noter.
4. Pendant que ça tourne : commencer la phase 4.

## Phase 4 — Bonus, dans l'ordre, chacun avec sa boîte

1. **Combat simulé** (2 h) si la version 1.5 n'a pas été faite en phase 2. Re-mesurer le miroir (300 parties).
2. **Une itération d'auto-jeu** (2 h + exécution) : bot contre bot (miroir + 3 archétypes, ≥ 2 000 parties), puis
   `node model/build.js` sur `data/bot/selfplay/` **mélangé aux données existantes** (`data/*.jsonl`) et
   `.venv/bin/python model/train.py` → nouveau modèle dans `Endstep-tracker/coach-model.json` **uniquement si** son
   AUC test ≥ à l'actuel (0,82) ; sinon le garder dans `bot/coach-model-selfplay.json` et le noter. Regénérer
   l'export plat, re-mesurer le miroir bot(nouveau modèle) contre forge et contre bot(ancien modèle).
3. Ne pas dépasser 8 h au total pour ce plan : au-delà, clore proprement.

## Phase 5 — Rapport (30 min)

- PROGRESS-BOT.md : tableau des taux de victoire avec intervalles, débit (parties/heure, ms/décision), couverture
  réelle des décisions (ce qui est simulé vs laissé à Forge), cartes désormais lancées, exceptions résiduelles,
  limites (information cachée, combat, cibles), prochaines étapes : brancher le classement des options dans le coach
  (rejouer une décision enregistrée par l'extension dans Forge), auto-jeu itératif, explication par Claude.
- `node test/coach.test.js` (Endstep-tracker) vert si `coach-model.json` a changé ; commit d'`Endstep-coach` (et
  d'`Endstep-tracker` seulement si le modèle a changé, version 0.6.1).
- `STATUT FINAL : TERMINÉ` si phases 1, 2, 3 et 5 sont DONE ou PARTIEL avec mesures ; sinon `STATUT FINAL : ARRÊT`
  avec la raison.

## Si bloqué

- `GameSimulator` plante sur beaucoup de sorts : essayer `simulateSpellAbility(sa, evaluator, false)` (sans
  résolution), puis le repli « copie + jouer la capacité à la main » : `GameCopier.makeCopy()`, retrouver `sa` via
  `copier.find(sa.getHostCard())`, `HumanPlay`/`ComputerUtil.playStack`-équivalents (chercher dans `forge.ai.ComputerUtil`
  une méthode qui joue un `SpellAbility` pour un joueur), puis `GameSimulator.resolveStack(game, player)`. Après 1,5 h
  sans copie fiable : version dégradée « 1 coup sans résolution » (score = état après paiement des coûts et mise sur
  la pile) et PARTIEL.
- Le bot boucle (rejoue une capacité sans fin) : la mémoire des capacités activées par passage de priorité (phase 2) ;
  sinon limiter à 40 actions par phase.
- Débit < 100 parties/heure par JVM : réduire les candidats à 8, ne simuler qu'en phase principale et sur la pile
  quand elle n'est pas vide, noter.
- Le témoin Forge-contre-Forge n'est pas à ≈ 50 % dans le miroir : le siège compte ; toujours comparer les deux sens.
- Parité impossible sur une feature (ex. créatures « prêtes ») : aligner la définition Java sur `coach.js` (c'est
  `coach.js` la référence), pas l'inverse.

## Journal de progression (format de `PROGRESS-BOT.md`)

```
# Bot — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation — DONE (10 min)
- javap : createControllerFor privé → createIngamePlayer réécrit (comme prévu)
## Phase 1 — Évaluateur — DONE
- parité JS/Java : 212 états, écart max 3e-7 ; anti-triche : identique sur 50 états
## Phase 2 — Contrôleur — EN COURS
- 15:10 chooseSpellAbilityToPlay simulé : 20 parties, 0 exception, 180 ms/décision
- Décision : cibles laissées à Forge (l'itérateur de choix lève NPE sur les sorts modaux)
## Phase 3 — Mesure — …
## Métriques
- Miroir : bot 64 % (IC 95 % 58–70), 600 parties, sièges alternés ; témoin Forge/Forge 51 %
## Limites connues / prochaines étapes
…
STATUT FINAL : TERMINÉ
```
