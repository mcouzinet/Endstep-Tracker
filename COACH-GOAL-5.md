# Objectif 5 : profondeur 1 par défaut, combat simulé, vrai réseau, explication par Claude

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL-5.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS-COACH5.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS-BOT.md`, `PROGRESS-COACH3.md`,
`PROGRESS-COACH4.md` (pièges déjà résolus) et `PROGRESS-COACH5.md` s'il existe, avant toute action et après toute
compaction de contexte.** Décide seul, note chaque décision dans PROGRESS-COACH5.md, ne demande rien à l'utilisateur.

## But

Quatre parties, dans cet ordre (C démarre son auto-jeu dès la phase 0 car c'est le plus long).

**Partie A — La profondeur 1 par défaut.** COACH-4 : +8,7 points contre Forge (77,0 % vs 68,3 %) mais ×6,4 en temps,
parce que presque toutes les décisions de terrain sont « serrées » (deux terrains à 0,1 point) et déclenchent des
rollouts inutiles. On ne rejoue plus que les décisions où un sort ou une capacité est en jeu, avec un K adaptatif ; si
le bot garde ≥ 74 % à ≤ 3× le temps, `BOT_DEPTH=1` devient la valeur par défaut.

**Partie D — L'explication par Claude.** Sur une décision signalée (écart ≤ −5 points), un bouton « Expliquer » dans
le bloc Coach demande au serveur local une explication courte en français : pourquoi le meilleur coup bat le coup
joué, à partir du plateau et des scores. Le serveur appelle l'API Claude **seulement si la clé `ANTHROPIC_API_KEY`
est dans son environnement** ; sans clé, le bouton n'apparaît pas. L'extension ne fait aucun appel externe.

**Partie B — Le combat simulé et deux coups d'avance.** Les attaques sont aujourd'hui jugées à un coup (blocs de
Forge, dégâts, évaluation) et les blocs ne sont jamais énumérés. On ajoute : (1) le rollout après l'attaque
(profondeur 1 sur les décisions d'attaque, même politique que les sorts) ; (2) l'énumération des blocs, bornée ; (3)
dans le rejeu seulement, « deux coups d'avance » sur les cas serrés : à mon tour suivant dans la copie, au lieu de
noter l'état brut, on prend le meilleur de mes options à un coup.

**Partie C — Un vrai réseau sur les vecteurs de cartes.** La régression logistique sur des sommes de vecteurs est
linéaire : elle ne voit pas les synergies. On entraîne un réseau « ensemble de cartes » (par carte : vecteur 32 → MLP
→ somme par zone ; puis tête MLP sur les 37 comptes + 6 résumés de zone), sur les parties existantes plus de
l'auto-jeu en profondeur 1 (un meilleur enseignant que Forge). Le réseau est exporté dans le format plat et
exécuté par `CoachEvaluator` (Java) et `coach.js` (extension), parité vérifiée.

Critères de succès : A — ≥ 74 % contre Forge dans le miroir (300 parties) à ≤ 3× le temps par partie du témoin
profondeur 0 (8,5 s, mêmes conditions : 4 JVM). B — les tests-pièges passent (attaque dans du mana ouvert avec un
bloqueur possible ; bloc évident) et le bot avec combat simulé ne perd pas de points (IC recouvrant). C — AUC test
≥ 0,85 sur le même jeu de test que COACH-3 (logreg 0,840) et bot à profondeur 0 ≥ 71 % dans le miroir (300, témoin
68,3 %). D — un clic, une explication en < 10 s, rien sans clé, harnais vert avec un serveur simulé.

## Contexte (ce qui existe déjà)

- Laboratoire `~/Developer/Endstep-coach/bot/` : `CoachController.java` (rollouts B1 de COACH-4 : `depth`,
  `kRollouts`, `CLOSE = 0,03`, `ROLLOUT_TOP = 3`, `rollout(g, me, o, rnd)`, `determinize`, graine par décision,
  la décision se prend **dans** l'ensemble rejoué, repli à un coup sur dépassement ; `declareAttackers` énumère les
  sous-ensembles d'attaquants (`MAX_ATTACK_ENUM`) via `simulateAttack` : copie, `AiBlockController` pour les blocs
  adverses, dégâts, `checkStateEffects`, évaluation), `CoachEvaluator.java` (format plat : `type`, `features`,
  `mean/scale`, `layer/bias` pour un MLP, `cards <fichier>`), `RolloutCheck.java` + `bot/test/rollout-trap.json`,
  `CoachServer.java` (`/health`, `/analyse`, `Json.java`, verrou, CORS), `DecisionReplay.java` (`depth`, K),
  `BotMatch.java`, `report.js` (s/partie, rollouts/partie), `run-eval.sh` (variables d'environnement transmises),
  `run-selfplay.sh` (CHUNK, bot contre bot), `EvalCheck.java`.
- Modèle : `model/build.js [maxStates] [dirs…] --cards` (états → 229 colonnes : 37 comptes + 6 zones × 32),
  `model/train.py` (logreg + MLP sklearn, `MLP_HIDDEN`, `MLP_ALPHA`, `MODEL_OUT`), `model/compare.py`,
  `model/export-flat.js`, `model/cards.js`, `model/embed.py` (TF-IDF+SVD 32, `bot/coach-cards.txt`,
  `Endstep-tracker/coach-cards.json`), `model/parity-export.py`, `bot/parity.js`. Données : `data/sim/*` (Forge vs
  Forge), `data/bot/selfplay/*` (1 000 parties bot vs bot à profondeur 0), `model/dataset.csv` (1,6 M lignes, 2,9 Go,
  non versionné). `.venv` : Python 3.10, sklearn 1.7, numpy 2.2, **torch 2.14 installé (CPU + MPS)**.
- Extension : `coach.js` (`predict` logreg/MLP, `featuresFor`, `describeOption`), `dashboard.js` (`coachServer`,
  `analyseMatch`, bloc Coach avec colonnes « Meilleur coup »/« Écart », `analyses[id]` maintenu en mémoire, écouteur
  `storage.onChanged` sur `match|note|dec|ana`), `_locales/{en,fr}`, harnais `test/harness/{qa-server.js, e2e.js,
  shots.js, shot-decisions.js, gen-demo.js}`, `analysis-demo.json` (profondeur 1). `release.sh` (build Store, fichier
  de l'utilisateur) : ne pas y toucher ; **pas de `host_permissions`** dans le manifest.
- Mesures de référence : profondeur 0 = 205/300 (68,3 %, IC 62,9–73,3, 8,5 s/partie) ; profondeur 1 = 231/300
  (77,0 %, IC 71,9–81,4, 54 s/partie, 217 rollouts/partie sur 23 décisions serrées). Une partie arrêtée au chrono est
  une nulle (BotMatch corrigé en COACH-4).
- Compétences disponibles dans la session : `claude-api` (à charger avant d'écrire l'appel à l'API en D1 : ids de
  modèle, en-têtes, format des messages ; aucun SDK installable ici, donc HTTP brut depuis Java
  `java.net.http.HttpClient`).
- Machine : macOS 10 cœurs, java 17, node 22, session avec écran (Forge l'exige).

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc.** Le seul appel réseau de ce plan est celui du serveur
   local vers `https://api.anthropic.com` en partie D, uniquement quand `ANTHROPIC_API_KEY` est défini dans
   l'environnement du serveur ; jamais depuis l'extension. Le corps envoyé se limite au plateau de la décision, aux
   options et aux scores (pas de pseudo adverse, pas d'identifiant de match).
2. Pas de triche : déterminisation avant toute action adverse simulée ; l'évaluateur ne lit jamais la main adverse ;
   `RolloutCheck` vert après toute modification de `CoachController`.
3. L'extension reste fonctionnelle : `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js
   && node test/hook.test.js` verts avant tout commit ; sans serveur ou sans clé, rien ne change à l'écran.
4. Laboratoire dans `~/Developer/Endstep-coach/` (`bot/`, `model/`, `data/coach5/`). Un commit par phase dans chaque
   dépôt touché. **Ne rien installer** (`torch` 2.14 est déjà dans `.venv`) ; si `import torch` échoue, C se fait
   avec le MLP sklearn et le note.
5. Boîtes de temps : à 1,5× la boîte sans résultat, BLOQUÉ + cause + essais dans PROGRESS-COACH5.md, phase suivante
   indépendante. A, B, C, D sont indépendantes ; C attend ses données d'auto-jeu (lancées en phase 0).
6. Tenir `~/Developer/Endstep-coach/PROGRESS-COACH5.md` à jour après chaque étape (format en fin de document).
7. Gros runs : `nohup … &`, **≤ 4 JVM en même temps** (l'auto-jeu de C en occupe déjà jusqu'à 3 : les mesures de A
   et B se font avec 4 JVM au total ou attendent), `-Xmx2g` (3g à deux bots), journaux dans `data/coach5/logs/`.
   Comparer des temps par partie seulement à charge égale (noter la charge : `uptime`).
8. Le serveur coach est relancé (`bot/coach-server.sh stop && start`) après chaque recompilation de `bot/`.

## Livrables et critères de fin

- [x] Phase 0 : journal, tests verts, torch installé (ou repli noté), auto-jeu profondeur 1 lancé en arrière-plan.
- [x] A1 : rollouts seulement quand une option non-terrain est dans l'ensemble serré ; K adaptatif (2 puis 3) ;
      terrain contre terrain à un coup ; `RolloutCheck` vert ; fumée 5 parties.
- [x] A2 : mesure miroir 300 (profondeur 1 allégée) : taux, IC, s/partie, rollouts/partie ; décision par défaut.
- [x] D1 : serveur : `GET /health` annonce `explain`, `POST /explain` (contrat ci-dessous), appel Claude en HTTP brut,
      clé depuis l'environnement, modèle et délai configurables, cache mémoire par (matchId, game, index).
- [x] D2 : tableau de bord : bouton « Expliquer » sur les lignes signalées quand `explain` est vrai, texte rangé dans
      la ligne d'analyse (`explanation`), affiché sous la ligne ; i18n ; harnais avec serveur simulé ; README.
- [x] B1 : profondeur 1 sur les décisions d'attaque (bot et rejeu) ; test-piège « attaque dans un bloqueur ».
- [x] B2 : blocs énumérés (`declareBlockers`, borné) dans le rejeu et derrière `BOT_BLOCKS=1` ; test-piège « bloc
      évident » ; les blocs deviennent rejouables dans le coach.
- [x] B3 : deux coups d'avance dans le rejeu (`depth = 2`) sur les cas serrés ; démo ; temps noté.
- [x] B4 : mesure du bot avec attaques en profondeur 1 (+ blocs si B2 tient) : miroir 300, décision par défaut.
- [x] C1 : jeu de données par cartes (`build.js --lists`) : 37 comptes + listes d'identifiants de cartes par zone.
- [x] C2 : réseau « ensemble de cartes » entraîné (torch, sinon sklearn), AUC sur le jeu de test de COACH-3.
- [x] C3 : export plat, inférence Java (`CoachEvaluator`) et JS (`coach.js`), parité Java/JS/Python ≤ 1e-4.
- [x] C4 : mesure du bot à profondeur 0 avec le réseau (miroir 300) ; choix du modèle livré.
- [x] Rapport, limites, prochaines étapes, `STATUT FINAL`.

## Contrat HTTP (partie D)

- `GET /health` → `{ …, "depth": true, "explain": <clé présente>, "llm": "<modèle>" }`
- `POST /explain`, corps : `{ "decision": <la décision enregistrée : turn, phase, prompt, answer, board>,
  "analysis": <la ligne d'analyse : best, bestScore, played, playedScore, delta, options>, "myDeck": "<nom ou null>",
  "oppArchetype": "<nom ou null>", "lang": "fr" | "en" }`
  réponse `{ "text": "<explication, ≤ 80 mots>", "model": "<modèle>", "ms": <durée> }` ; sans clé → 404
  `{ "error": "no key" }` ; erreur API → 502 avec le message ; une requête à la fois (même verrou que `/analyse`).
- Prompt (système) : coach de Magic, français ou anglais selon `lang`, ne cite que des cartes présentes dans la
  décision, s'appuie sur les scores fournis (probabilités de victoire), n'invente pas de règle, ≤ 80 mots, tutoie.
  Contenu (utilisateur) : plateau résumé (tour, phase, vies, mains, permanents des deux côtés, ma main), le coup joué,
  le meilleur coup, les options et leurs scores. Modèle par défaut `claude-sonnet-5` (`COACH_LLM_MODEL`), délai 20 s
  (`COACH_LLM_TIMEOUT_MS`), `max_tokens` 300.

## Phase 0 — Préparation (30 min)

1. `data/coach5/logs/`, `PROGRESS-COACH5.md`. Tests de l'extension verts ; `RolloutCheck` vert ; `uptime` noté.
2. Vérifier `.venv/bin/python -c "import torch, sklearn"` (torch 2.14 déjà installé). Échec → noter, C en sklearn.
3. **Auto-jeu profondeur 1 lancé tout de suite** (le plus long) : `BOT_DEPTH=1 BOT_K=3 CHUNK=3 bot/run-selfplay.sh 300
   100 data/coach5/selfplay 3` (miroir 300 + 3 archétypes × 100, ≤ 3 JVM, bot contre bot, `-Xmx3g`). Ordre de
   grandeur : 100–150 s par partie → ~8 h ; on l'utilise en C avec ce qui est fini à ce moment-là (≥ 300 parties),
   le reste sert au rapport. Journal `data/coach5/logs/selfplay-*.log`.

## Partie A — Profondeur 1 allégée (boîte : 1 h 30 + mesure ~1 h)

### A1 — Règle « pas de rollout entre terrains »

1. `CoachController.chooseSpellAbilityToPlay`, bloc profondeur 1 : l'ensemble serré (`ranked` à moins de `CLOSE`
   du meilleur) est calculé comme aujourd'hui, mais **si toutes ses options non-« passer » sont des terrains**
   (`sa.isLandAbility()`), pas de rollout : classement à un coup. Si l'ensemble mêle terrain et sort, rollout
   normal (le terrain à poser peut dépendre du sort à lancer).
2. K adaptatif : `kRollouts` = 2 d'abord ; si les deux meilleures moyennes sont à moins de 0,02, un troisième
   tirage pour l'ensemble (mêmes graines : `decisionSeed + 2·7919`). `BOT_K` reste le maximum.
3. Compteurs : `rolloutsSkippedLand`, `rolloutsK3`. Journal du bot : `"rollouts":"land-only"` quand la règle
   s'applique.
4. `RolloutCheck` vert (la décision-piège n'est pas un choix de terrain). Fumée `BOT_DEPTH=1` 5 parties : rollouts
   par partie attendus ≤ 90 (contre 217).

### A2 — Mesure

1. `BOT_DEPTH=1 BOT_K=3 bot/run-eval.sh 300 0 data/coach5/eval-a 4` → `report.js` : taux, IC, s/partie,
   rollouts/partie. Si l'auto-jeu de C occupe 3 JVM, lancer la mesure en 1 JVM à la fois (4 × 75 en série) et noter
   la charge ; comparer le temps par partie au témoin **re-mesuré dans les mêmes conditions** (75 parties profondeur
   0 avec la même charge) plutôt qu'aux 8,5 s de COACH-4.
2. Critère : ≥ 74 % et ≤ 3× → `DEFAULT_DEPTH = 1` dans `CoachController` (variable `BOT_DEPTH=0` pour revenir) ;
   sinon reste 0, résultat noté. Le serveur et le rejeu ne changent pas (déjà en profondeur 1).

## Partie D — Explication par Claude (boîte : 2 h)

### D1 — Serveur

1. Charger la compétence `claude-api` (session) avant d'écrire l'appel ; s'en tenir à ce qu'elle documente pour
   l'HTTP brut (URL `/v1/messages`, en-têtes `x-api-key`, `anthropic-version`, corps `model`, `max_tokens`, `system`,
   `messages`). `bot/Llm.java` : `java.net.http.HttpClient`, JSON par `Json.java`, délai, extraction de
   `content[0].text`, erreurs lisibles (statut + message).
2. `CoachServer` : `/explain` selon le contrat, `explain` et `llm` dans `/health`, cache `LinkedHashMap` borné
   (100 entrées) par clé `matchId|game|index|lang` (la clé est fournie par le tableau de bord dans le corps :
   `"key": "…"`), verrou commun. Résumé du plateau construit en Java depuis `decision.board` (comme `StateBuilder`
   lit les instantanés) : ne pas envoyer le JSON brut.
3. Clé : `bot/coach-server.sh start` fait `set -a; . "$ROOT/.env"; set +a` si `~/Developer/Endstep-coach/.env` existe
   (fichier `ANTHROPIC_API_KEY=…`, `chmod 600`, ajouté à `.gitignore`), sinon prend l'environnement courant ; la clé
   n'est jamais journalisée ni renvoyée par `/health`. Vérification : sans clé → `/health` `explain: false`,
   `/explain` → 404 ; avec la clé : une
   requête `curl` sur la décision #3 de la démo (Bolt en face à 3 PV) → texte en français cohérent, < 10 s, coût
   noté (`usage` de la réponse). Sans clé disponible pendant la session : D1 PARTIEL, test avec un serveur simulé.

### D2 — Tableau de bord

1. `dashboard.js` : `coachServer.explain` ; dans le bloc Coach, sur chaque ligne signalée (écart ≤ −5 points, ou
   erreur/blunder) qui a une analyse, bouton texte « Expliquer » (`[data-explain]`) ; clic → POST `/explain` avec
   la décision, la ligne d'analyse, `myDeck`/`oppArchetype` du match, `lang`, `key` ; pendant l'attente « … » ;
   réponse → `analyses[id].games[g][i].explanation = text` puis `chrome.storage.local.set({['ana:'+id]: …})` ;
   affichage sous la ligne (`<tr class="explain"><td colspan>`), avec la mention du modèle en petit ; erreur →
   toast. Le texte reste dans `ana:` (exporté/importé avec l'analyse).
2. i18n en/fr (`coach_explain`, `coach_explain_wait`, `coach_explain_failed`, `coach_explain_by`) ; README (section
   Coach : clé dans l'environnement du serveur, ce qui est envoyé, rien sans clé).
3. Harnais `test/harness/qa-explain.js` : serveur simulé Node (`http.createServer` sur 8765, `/health` avec
   `explain: true`, `/analyse` renvoyant `analysis-demo.json`, `/explain` renvoyant un texte fixe) → le bouton
   apparaît sur la ligne signalée de m1, le clic affiche le texte, `ana:m1` le contient, 0 erreur ; sans `explain`,
   pas de bouton. Le vrai serveur est arrêté pendant ce harnais puis relancé.

## Partie B — Combat simulé et deux coups d'avance (boîte : 4 h + mesure ~1 h)

### B1 — Attaques en profondeur 1

1. `declareAttackers` : après `simulateAttack` (copie où le combat a eu lieu), si `depth ≥ 1` et que l'ensemble des
   masques est serré (< `CLOSE` entre les deux meilleurs, hors rank-only où tout est rejoué), continuer la copie
   comme `rollout` : déterminisation, `mainLoopStep` jusqu'à l'UNTAP de mon tour suivant, moyenne sur K. Factoriser
   la partie « continuer une copie jusqu'à mon tour suivant » de `rollout` en `double playOut(Game copy, Player cm,
   Player co, Random rnd)` réutilisée par les deux chemins. La décision se prend dans l'ensemble rejoué.
2. Test-piège dans `bot/test/attack-trap.json` : ma 2/2 face à un 2/3 adverse dégagé, l'adversaire à 15 PV : à un
   coup l'attaque peut sembler neutre (Forge ne bloque pas toujours) ; en profondeur 1 « pas d'attaque » doit
   remonter ou l'attaque baisser d'au moins 2 points ; `RolloutCheck` étendu (argument : plusieurs fichiers-pièges).

### B2 — Blocs énumérés

1. `declareBlockers(Player defender, Combat combat)` (vérifier la signature dans le jar par `javap
   forge.ai.PlayerControllerAi`) : si `inCopy` ou trop d'attaquants × bloqueurs (`MAX_BLOCK_ENUM = 64` affectations),
   Forge (`super`). Sinon énumérer les affectations bloqueur → {aucun, attaquant i} (chaque bloqueur au plus un
   attaquant ; pas de double bloc au-delà de 2 sur un même attaquant), chacune jouée dans une copie : `combat`
   copié, `addBlocker`, `orderBlockersForDamageAssignment`/`orderAttackersForDamageAssignment`, dégâts via la même
   séquence que `simulateAttack`, `checkStateEffects`, évaluation (à un coup ; profondeur 1 possible si le temps le
   permet). Journal `"blocks": [{sa: "block: A→X, B→Y", score}]`.
2. Rejeu : `StateBuilder` sait déjà appliquer un état ; pour une décision `DECLARE_BLOCKERS`, appliquer l'état au
   moment de la déclaration des attaquants adverses (attaquants en `Attacking` dans le `[state]`, vérifier la syntaxe
   de `GameState` pour les attaquants : `humanbattlefield=…|Attacking` sinon rejouer l'attaque par
   `combat.addAttacker`) et remettre au sink les options de bloc ; l'appariement du bloc joué se fait sur l'ensemble
   des paires. Si la syntaxe ne le permet pas en 1 h : blocs seulement pour le bot, rejeu des blocs BLOQUÉ noté.
3. Test-piège `bot/test/block-trap.json` : leur 2/2 attaque, j'ai une 3/3 dégagée, je suis à 4 PV : le bloc doit
   être le meilleur coup avec un écart ≥ 5 points sur « pas de bloc ».
4. Bot : derrière `BOT_BLOCKS=1` ; fumée 5 parties, 0 exception.

### B3 — Deux coups d'avance dans le rejeu

1. `DecisionReplay`/`CoachController` en rank-only : `depth = 2` → à l'UNTAP de mon tour suivant dans la copie, au
   lieu de `pWin`, avancer au MAIN1 (`mainLoopStep` jusqu'à `phase == MAIN1 && isPlayerTurn(cm)`), calculer mes
   options à un coup dans la copie (le contrôleur de la copie est `inCopy` : ajouter une méthode statique
   `bestOnePly(Game copy, Player cm)` qui reprend la boucle candidats → `GameSimulator` de
   `chooseSpellAbilityToPlay` sans effet de bord) et rendre le max. Seulement en rank-only et seulement si les deux
   meilleures options en profondeur 1 sont à moins de `CLOSE`. Serveur : `depth` accepte 2 ; le tableau de bord
   reste à 1 (le coût est pour l'utilisateur de `coach-replay.js` : documenter).
2. Démo et décision-piège en profondeur 2 : scores et temps notés (attendu 2–4× la profondeur 1).

### B4 — Mesure

1. Bot avec attaques en profondeur 1 (`BOT_DEPTH=1` ou la valeur par défaut issue de A2, `BOT_COMBAT=1`) et, si B2
   a tenu, `BOT_BLOCKS=1` : miroir 300 (`data/coach5/eval-b`), mêmes conditions que A2. Critère : IC recouvrant le
   résultat de A2 ou meilleur → les options deviennent celles par défaut ; sinon notées.

## Partie C — Un vrai réseau sur les vecteurs de cartes (boîte : 6 h + entraînement)

### C1 — Jeu de données par cartes (1 h)

1. `model/build.js --lists` : pour chaque état, les 37 comptes + pour chacune des 6 zones (`my_hand`,
   `my_battlefield`, `opp_battlefield`, `my_graveyard`, `opp_graveyard`, `stack`) la liste des cartes (noms → index
   dans `bot/coach-cards.txt`, cartes inconnues → index 0 « inconnu »), tronquée à 24 par zone, écrite en JSONL
   compact (`{"y":1,"c":[37 nombres],"z":[[…],[…],…]}`) ou en `.npz` par `model/lists.py` si plus rapide. Sources :
   `data/sim/*` + `data/bot/selfplay/*` + `data/coach5/selfplay/*` (ce qui est fini), mêmes règles de partage
   train/val/test par partie que `train.py` (même graine → même jeu de test que COACH-3 pour les parties déjà
   présentes ; les nouvelles parties d'auto-jeu vont en train/val seulement, le test reste comparable).
2. Tailles notées (lignes, parties, part d'auto-jeu profondeur 1).

### C2 — Réseau (2 h + entraînement en arrière-plan)

1. `model/train_sets.py` (torch) : par carte `v ∈ R^32` → `Linear(32,64) + ReLU + Linear(64,32)` (poids partagés
   entre zones, un biais par zone), somme par zone → 6 × 32 ; concaténation avec les 37 comptes standardisés →
   `Linear(229,64) + ReLU + Dropout(0,1) + Linear(64,1)`. Perte : log-loss ; Adam ; arrêt sur la log-loss de
   validation ; ≤ 30 minutes d'entraînement par essai, 3 essais max (largeur 32/64/128). Mesures : AUC et log-loss
   test, comparées à la logreg (0,840) et à la baseline vie (0,698) sur le même test.
2. Repli sans torch : `MLPClassifier` sklearn sur les 229 colonnes avec early stopping, largeurs (64), (128,32),
   alpha 1e-4/1e-3 ; noter.
3. Critère C2 : AUC test ≥ 0,85. Sinon : PARTIEL, on garde la logreg livrée, C3–C4 servent quand même à vérifier
   l'inférence (parité) sans changer le modèle livré.

### C3 — Export et inférence (2 h)

1. Format plat étendu (`type sets`) : `cardlayer <in> <out>` + lignes de poids, `zonebias <zone> <32 valeurs>`,
   puis `layer/bias` de la tête comme aujourd'hui ; `mean/scale` sur les 37 comptes seulement.
2. `CoachEvaluator` : si `type sets`, par zone somme des `f(v)` sur les cartes présentes (les vecteurs viennent de
   `bot/coach-cards.txt`), puis tête ; `coach.js` : même chose avec `coach-cards.json` (ajouter la branche dans
   `predict`, `FEATURES` inchangées pour l'affichage). `model/parity-export.py` produit les cas de test ;
   `test/coach.test.js` compare (≤ 1e-4) ; `bot/parity.js` Java/JS sur `data/bot/parity.jsonl` (relancer
   `EvalCheck` avec le nouveau modèle).
3. Temps d'inférence : ≤ 2× la logreg par état (mesurer sur 10 000 états), sinon noter.

### C4 — Mesure du bot (1 h + mesure ~30 min)

1. `bot/run-eval.sh 300 0 data/coach5/eval-c 4 …` avec le nouveau modèle (`bot/coach-model-sets.txt`) à profondeur 0 :
   miroir 300, témoin 68,3 %. Critère : ≥ 71 % → le réseau devient `bot/coach-model.txt` et
   `Endstep-tracker/coach-model.json` (via `export-flat.js`), `coach.test.js` mis à jour ; sinon le modèle est
   gardé sous son nom, résultat noté.
2. Si A2 a fait passer la profondeur 1 par défaut : une mesure supplémentaire réseau + profondeur 1 (150 parties
   suffisent pour situer).

## Phase finale — Rapport (30 min)

- PROGRESS-COACH5.md : tableau des mesures (témoin 68,3 % / profondeur 1 COACH-4 77,0 % / A2 / B4 / C4), coûts par
  partie à charge notée, AUC (logreg 0,840 / réseau), pièges (attaque, bloc, Guide), coût d'une explication
  (`usage`), limites (Forge reste la politique de rollout, K petit, blocs bornés, réseau exécuté en JS dans
  l'extension : taille de `coach-model.json`), prochaines étapes.
- Tests verts, captures (`shot-decisions.js` avec une explication de démo), commits. `STATUT FINAL : TERMINÉ` si A2,
  D2 et C3 sont DONE et que B et C4 sont DONE ou PARTIEL avec mesures ; sinon `ARRÊT` avec la raison.

## Si bloqué

- Rollouts trop lents malgré A1 : réduire `ROLLOUT_TOP` à 2, `ROLLOUT_MS` à 3 s, et noter ; ne pas retirer « passer »
  de l'ensemble rejoué (COACH-4 : comparer des échelles différentes fausse la décision).
- `declareBlockers` absent ou signature différente : `javap -cp <jar> forge.ai.PlayerControllerAi | grep -i block`
  (candidats : `declareBlockers`, `assignBlockers`), sinon passer par `AiBlockController` sur une copie et B2 BLOQUÉ.
- `GameState` ne connaît pas les attaquants : rejeu des blocs BLOQUÉ, blocs pour le bot seulement.
- torch : déjà installé (2.14, Python 3.10, CPU + MPS) ; s'il ne s'importe plus, repli sklearn, pas de réinstallation.
- API Claude : 401 → clé absente ou invalide (ne rien retenter) ; 429/529 → une nouvelle tentative après 5 s puis
  502 ; jamais plus de 2 essais.
- Auto-jeu profondeur 1 trop lent (> 200 s/partie) : `BOT_K=2`, CHUNK 2, et C1 utilise ce qui est fini à H+4.

## Format de PROGRESS-COACH5.md

```
# Coach 5 — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation — DONE|PARTIEL|BLOQUÉ (<durée>)
- <faits, mesures, décisions, commandes exactes>
## Phase A1 — Rollouts allégés — …
## Phase A2 — Mesure — …
## Phase D1 — Serveur /explain — …
## Phase D2 — Tableau de bord — …
## Phase B1 — Attaques en profondeur 1 — …
## Phase B2 — Blocs — …
## Phase B3 — Deux coups d'avance — …
## Phase B4 — Mesure — …
## Phase C1 — Données par cartes — …
## Phase C2 — Réseau — …
## Phase C3 — Export et parité — …
## Phase C4 — Mesure — …
## Phase finale — Rapport — …

STATUT FINAL : TERMINÉ|ARRÊT
```
