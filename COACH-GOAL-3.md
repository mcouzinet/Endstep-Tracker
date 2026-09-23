# Objectif 3 : le meilleur coup dans le coach, puis un modèle qui connaît les cartes

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL-3.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS-COACH3.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS.md`, `PROGRESS-BOT.md` (contexte des objectifs 1 et 2)
et `PROGRESS-COACH3.md` s'il existe, avant toute action et après toute compaction de contexte.** Décide seul, note
chaque décision dans PROGRESS-COACH3.md, ne demande rien à l'utilisateur.

## But

Deux parties indépendantes, dans cet ordre.

**Partie A — Rejeu des décisions : le coach montre le meilleur coup.** Chaque décision enregistrée par l'extension
(état du plateau, options proposées, choix) est rejouée dans Forge : l'état est reconstruit, le contrôleur du bot
(`CoachController`) classe les options exactement comme il le fait quand il joue, et le tableau de bord affiche, pour
chaque décision, le coup joué, le meilleur coup selon le modèle et l'écart. La main adverse est inconnue : elle est
tirée au sort plusieurs fois (déterminisation) et les scores sont moyennés. Résultat = un coach de niveau « Forge
amélioré » : il signale les fautes nettes et propose un coup meilleur, il reste aveugle aux finesses.

**Partie B — Embeddings de cartes : le modèle de valeur sait quelle carte est en jeu.** Aujourd'hui le modèle ne voit
que des comptes (vies, cartes, créatures, force). On ajoute, par zone, la somme de vecteurs de cartes calculés depuis
leur texte Oracle (Forge le fournit hors ligne), on réentraîne le même MLP sur les mêmes parties, et on mesure.
Le modèle d'embedding est figé (pas de fine-tuning) : une table carte → vecteur suffit, dans l'extension comme dans
Forge.

Critères de succès : A — sur des décisions réelles enregistrées, le coach affiche un meilleur coup pour ≥ 80 % des
décisions rejouables, en < 2 s par décision en moyenne, et sur les décisions de démonstration du harnais le meilleur
coup est celui attendu (létal, terrain manquant). B — AUC test du nouveau modèle ≥ ancien + 0,01 **sur le même jeu de
test** (`model/compare.py`), parité JS/Java à 1e-6, et le bot équipé du nouveau modèle ne fait pas moins bien que
61 % contre Forge dans le miroir (300 parties). En dessous : PARTIEL avec analyse, l'ancien modèle reste livré.

## Contexte (ce qui existe déjà)

- `~/Developer/Endstep-coach/bot/` : `CoachEvaluator.java` (37 features de `coach.js` + MLP, lecture de
  `bot/coach-model.txt` produit par `model/export-flat.js`), `CoachController.java` (à chaque priorité : candidats
  légaux via `SpellAbilityPicker.getCandidateSpellsAndAbilities`, **une option par cible**, simulation de chaque
  option avec `GameSimulator` + `NoRecursion`, ligne de base après résolution de la pile, journal
  `{"gameId","decision":{"turn","phase","seat","options":[{"sa","score"}],"chosen","ms"}}`), `CoachLobbyPlayer.java`,
  `CoachAi.java` (cerveau injecté par réflexion), `BotMatch.java`, `report.js`, `run-eval.sh`, `run-selfplay.sh`,
  `EvalCheck.java` + `parity.js` (parité et anti-triche). Pièges déjà résolus, à ne pas redécouvrir : rendre `null`
  (pas une liste vide) pour passer la priorité ; `AiCache.clear()` à chaque décision ; les cibles doivent être posées
  sur le sort d'origine avant `simulateSpellAbility` ; `getAllCandidates(sa, false)` (le `true` renvoie vide) ;
  `AttackingBand.setBlocked` avant les dégâts ; `createIngamePlayer` est rappelé pour chaque copie (drapeau
  `SIMULATING`). Tout est décrit dans PROGRESS-BOT.md.
- Forge 2.0.14 dans `Endstep-coach/forge/` ; compiler avec `javac -cp "<jar>:../sim" -d ../bot`, exécuter depuis
  `forge/` avec `-cp "<jar>:../sim:../bot"`, session macOS avec écran (pas de `-Djava.awt.headless`).
- **`forge.game.GameState`** (vérifié dans le jar) : `parse(List<String>)`, `applyToGame(Game)`, `initFromGame(Game)`,
  `toString()`. C'est le format des puzzles (`forge/res/puzzle/*.pzl`, section `[state]`) : clés `turn=`,
  `activeplayer=human|ai`, `activephase=MAIN1|…`, `humanlife=`, `ailife=`, `humanhand=A;B`, `humanlibrary=`,
  `humanbattlefield=Card|Tapped|SummonSick|Counters:P1P1=2|Id:7|Attaching:7|Damage:1;…`, `humangraveyard=`,
  `humanexile=`, et les mêmes avec `ai`, plus `removesummoningsickness=`. **Vérifier avant d'écrire** à quel joueur
  du `Game` correspondent « human » et « ai » (javap -c de `applyToGame`, ou un test : deux joueurs nommés, état
  avec `humanlife=7`, lire les vies) ; avec deux `CoachLobbyPlayer` ce sera probablement l'ordre des joueurs.
- Décisions enregistrées par l'extension (`tracker.onAction`, export JSON du tableau de bord sous
  `decisions: { matchId: { gameNumber: [decision] } }`, import symétrique) :
  `{ at, turn, phase, active, prompt: { type, message, options: [noms], min, max }, answer: { type, cardId|targets|
  attackers|blockers|… en noms }, board: { turnNumber, phase, activePlayerId, priorityPlayerId, players: [{ life,
  hand: [noms] (moi seulement), handSize, librarySize, battlefield: [{ name, power, toughness, tapped, types,
  hasSummoningSickness, isToken?, counters? }], graveyard: [noms], exile: [noms], manaPool? }], stack: [noms] } }`.
  Ce qui manque et qu'il faudra approximer : les attachements (équipement sur quelle créature), l'ordre des
  bibliothèques, la main adverse, les jetons (`isToken`, nom du jeton), les dégâts marqués, les cartes exilées face
  cachée. Les phases Endstep s'appellent `DECLARE_ATTACKERS`, `END_STEP`… (`PHASE_ALIAS` de `coach.js`).
- La fiche du match donne `mySeat`, `myDeck.cards` (liste complète), les cartes adverses vues (`seenCards`), le format,
  l'archétype adverse (`note:<id>.archetype`) ou reconnu (`meta.js`). Les listes d'archétypes viennent de l'API
  métagame publique d'endstep.cc (`sim/build-decks.js` sait la lire ; `test/harness/meta-Modern.json` en est un
  instantané ; pour le Pauper, un instantané est à faire une fois et à garder dans `Endstep-coach/data/meta/`).
- Textes des cartes hors ligne : `forge/res/cardsfolder/cardsfolder.zip`, un fichier par carte avec `Name:`,
  `ManaCost:`, `Types:`, `Oracle:` (`sim/ai-check.js` montre comment lire le zip via `unzip -p`).
- Python : `.venv` avec numpy/pandas/scikit-learn (pas de torch). Node 22. `model/build.js` (accepte des répertoires
  supplémentaires), `model/train.py`, `model/compare.py` (deux modèles sur le même jeu de test ; les features d'un
  modèle sont lues dans son fichier, donc le jeu de données doit contenir toutes les colonnes des deux).
- Extension : `dashboard.js` (bloc Coach : `coachRows`, `coachBlock`, `describeAction` ; export/import JSON ;
  i18n `_locales/{en,fr}`), `test/coach.test.js`, harnais `test/harness/` (`gen-demo.js` contient 4 décisions de
  démonstration pour le match `m1`, `shot-decisions.js` capture le bloc Coach, `qa-live.js`). Détecteur design :
  `node ~/.claude/skills/impeccable/scripts/detect.mjs --json dashboard.html dashboard.js`.
- Données réelles : le tableau de bord de l'utilisateur n'est pas accessible depuis le laboratoire. Pour tester sur du
  vrai, `test/harness/e2e.js` joue une partie contre le bot d'Endstep avec l'extension chargée et vérifie les
  décisions ; l'étendre pour **exporter le JSON** (même fonction que le menu Données) dans `test/harness/e2e-export.json`
  (ignoré par git). Une seule exécution d'e2e par phase.

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc.** Réseau autorisé : l'API métagame d'endstep.cc en lecture
   (≤ 4 requêtes en parallèle, une fois, instantané gardé sur disque), PyPI pour la phase B4 uniquement, rien d'autre.
   Rien n'est envoyé nulle part.
2. **Pas de triche** : le rejeu ne connaît que ce que le joueur voyait. La main adverse est tirée au sort depuis la
   liste d'archétype (ou les cartes vues + terrains de base), jamais depuis une information cachée. Le modèle B ne lit
   que les zones visibles (la main adverse reste un nombre) : le test anti-triche d'`EvalCheck` doit rester vert.
3. L'extension reste fonctionnelle à chaque instant : `node test/replay.test.js && node test/meta.test.js &&
   node test/coach.test.js && node test/hook.test.js` verts avant tout commit ; les changements y sont additifs
   (analyse importée, colonne dans le bloc Coach, table de vecteurs). Le suivi des matchs ne change pas.
4. Le laboratoire vit dans `~/Developer/Endstep-coach/` (`bot/`, `model/`, `data/`). Ne vont dans `Endstep-tracker`
   que `coach.js`, `coach-model.json` (< 300 Ko), `coach-cards.json` (< 1 Mo), le tableau de bord, les locales, les
   tests et le harnais. Un commit par phase dans chaque dépôt touché.
5. N'installer que : en phase B4 et si B3 est DONE, `pip install model2vec` dans le venv (petit, numpy) ; sinon rien.
   Pas de torch, pas de nouvelle bibliothèque Java.
6. Boîtes de temps : à 1,5× la boîte sans résultat, noter BLOQUÉ + cause + essais dans PROGRESS-COACH3.md et passer
   à la phase suivante indépendante. La partie B ne dépend pas de la partie A : si A bloque, faire B.
7. Tenir `~/Developer/Endstep-coach/PROGRESS-COACH3.md` à jour **après chaque étape** (format en fin de document).
8. Gros runs : `nohup … &`, ≤ 6 JVM, `-Xmx2g` (3g si deux bots), journaux dans `data/coach3/logs/`.

## Livrables et critères de fin

- [ ] A1 : `bot/StateBuilder.java` (ou équivalent) : une décision enregistrée → texte `GameState` → `Game` Forge
      démarré dans cet état ; 3 états de test rechargés et vérifiés champ par champ (vies, mains, plateau, phase).
- [ ] A2 : `bot/DecisionReplay.java` : classement des options d'une décision par `CoachController` en mode
      « classer seulement », K déterminisations, sortie JSON ; appariement avec les options/le choix enregistrés.
- [ ] A3 : `bot/coach-replay.js` : export JSON du tableau de bord → analyse (`analysis.json`) ; harnais et export e2e
      traités ; ≥ 80 % des décisions rejouables, < 2 s en moyenne.
- [ ] A4 : tableau de bord : import d'une analyse, colonne « meilleur coup » et écart dans le bloc Coach, i18n, tests,
      captures ; README.
- [ ] B1 : `model/cards.js` : table nom → texte Oracle/types/coût pour toutes les cartes des données et des listes
      Pauper ; `model/embed.py` : vecteurs TF-IDF + SVD (32 dimensions), `coach-cards.json`.
- [ ] B2 : `coach.js` : features étendues (37 + par zone la somme des vecteurs) ; `CoachEvaluator` idem ; parité
      JS/Java à 1e-6 ; anti-triche vert.
- [ ] B3 : réentraînement, `compare.py` ancien vs nouveau sur le même test, décision de livraison, bot re-mesuré.
- [ ] B4 (bonus) : embeddings `model2vec` à la place de TF-IDF si B3 est DONE ; même comparaison.
- [ ] Rapport, limites, prochaines étapes, `STATUT FINAL`.

## Phase 0 — Préparation (15 min)

1. Créer `Endstep-coach/data/coach3/logs/`, `data/meta/`, `PROGRESS-COACH3.md` (en-tête + phases). Relire
   PROGRESS-BOT.md (sections « Pièges » et « Ce que le bot décide vraiment »).
2. Tests de l'extension verts ; `node bot/parity.js data/bot/parity.jsonl` vert (si le modèle a changé, relancer
   `EvalCheck` d'abord).
3. `javap -cp <jar> -c forge.game.GameState | grep -A3 "human\|ai"` : noter comment « human »/« ai » sont résolus.
4. Instantané métagame Pauper : `GET https://endstep.cc/api/metagame/v1/Pauper/decks?pageSize=50` puis, pour les
   ≤ 30 archétypes les plus joués, `/decks/<slug>/cards?pageSize=50` → `data/meta/pauper.json` (même forme que
   `test/harness/meta-Modern.json`). Réutiliser `sim/build-decks.js` ou `test/harness/fetch-meta.js`.

## Partie A

### Phase A1 — Reconstruire un état dans Forge (boîte : 2 h 30)

1. `bot/StateBuilder.java` : à partir d'une décision (JSON lu sans bibliothèque : écrire un mini-parseur JSON
   récursif de 80 lignes dans `bot/Json.java`, ou réutiliser le lecteur que `BotMatch` n'a pas encore ; pas de Gson
   dans le jar) et de la fiche (mon siège, ma liste, cartes adverses vues, liste d'archétype adverse) :
   - moi : `hand` exacte ; `battlefield` avec `|Tapped`, `|SummonSick` (si `hasSummoningSickness`),
     `|Counters:…` ; `graveyard`, `exile` ; `library` = ma liste moins toutes mes cartes connues (main, plateau,
     cimetière, exil), mélangée ; taille ajustée à `librarySize` (compléter ou tronquer avec des terrains de base
     de ma liste, noter l'écart) ;
   - adversaire : `battlefield`/`graveyard`/`exile` du snapshot ; `hand` = `handSize` cartes tirées au sort dans
     la liste d'archétype (moins ses cartes déjà vues ce match) ; `library` = le reste de la liste, mélangé ;
     sans archétype : cartes vues × exemplaires + terrains de base des couleurs vues ;
   - `turn`, `activeplayer`, `activephase` (traduire `PHASE_ALIAS`), vies, `manaPool` si présent (vérifier la clé
     dans les puzzles ; sinon ignorer et noter) ;
   - jetons : chercher le nom de jeton Forge correspondant dans `forge/res/tokenscripts/` (ex. `c_1_1_a_servo`) ;
     à défaut, remplacer par une créature vanille de même force/endurance et le noter ;
   - attachements : un équipement/aura sur table est posé non attaché (limite à noter) ;
   - la pile : ignorée si non vide (décision « en réponse ») : marquer la décision non rejouable.
2. Démarrer une partie « vide » entre deux `CoachLobbyPlayer` (mode « classer seulement », voir A2) avec des decks
   factices de 60 cartes, puis `new GameState().parse(lines)` et `applyToGame(game)` **avant** la première priorité
   (chercher le bon moment : après `startGame` sur un autre thread, au premier `GameEventTurnPhase`, ou via
   `Game.getAction().invoke`/`devModeSet` ; les puzzles de Forge appliquent l'état dans `Puzzle.applyToGame` au
   démarrage — lire le bytecode de `forge.gamemodes.puzzle.Puzzle` et de l'appelant dans `forge.gamemodes.match`
   pour reproduire l'ordre).
3. Test `bot/StateCheck.java` : 3 décisions (les 4 de `gen-demo.js` conviennent, plus une avec la pile non vide qui
   doit être refusée) → état appliqué → relire avec `initFromGame` + `toString()` et comparer vies, tailles de mains,
   noms sur le plateau, phase, joueur actif ; écart 0 attendu (hors bibliothèques). Noter le temps de
   démarrage d'une partie (le chargement des cartes ~10 s se fait une fois par JVM : traiter toutes les décisions
   d'un export dans la même JVM).

### Phase A2 — Classer les options d'une décision (boîte : 2 h)

1. `CoachController` : mode « classer seulement » (champ `rankOnly` + un `Consumer<List<Option>>`) : à la première
   décision de priorité du siège rejoué, le contrôleur calcule les options et leurs scores comme d'habitude, les remet
   au consommateur, puis **passe** (retourne `null`) et lève un drapeau « terminé » ; `BotMatch`/le rejeu arrêtent
   la partie (`game.setGameOver`) dès ce drapeau. Pour `COMBAT_DECLARE_ATTACKERS`, activer `BOT_COMBAT` pour cette
   décision (l'énumération d'attaques existe) ; pour `DECLARE_BLOCKERS`, `MULLIGAN`, `CHOOSE_TARGETS` d'un sort en
   pile : non rejouable en v1, le noter.
2. `bot/DecisionReplay.java` : pour une décision, K = 5 déterminisations (mains/bibliothèques adverses différentes,
   graine fixée) → moyenne et écart-type du score de chaque option ; sortie
   `{ "options": [{ "label", "mean", "sd" }], "played": label|null, "best": label, "delta": best − played (points),
   "determinizations": K, "ms" }`. Appariement du coup joué : `answer.type` + noms (`PLAY_CARD cardId` ↔ option
   dont le libellé commence par ce nom ; `PASS_PRIORITY` ↔ « pass » ; `DECLARE_ATTACKERS attackers` ↔ option
   d'attaque de même ensemble) ; si l'appariement échoue, `played = null` et la raison.
3. Vérification sur les 4 décisions de démonstration : la décision « PASS_PRIORITY avec Lightning Bolt en main et
   l'adversaire à 3 » (à ajouter dans gen-demo si absente) doit donner Bolt comme meilleur coup avec un écart net ;
   la décision terrain doit donner le terrain. Temps par décision noté.

### Phase A3 — Du fichier exporté à l'analyse (boîte : 1 h 30)

1. `bot/coach-replay.js export.json [analysis.json]` : lit l'export du tableau de bord (matches, notes, decisions),
   prépare pour chaque match le contexte (siège, liste, archétype adverse : note, sinon reconnaissance `meta.js`
   sur les cartes vues avec `data/meta/pauper.json`, sinon aucun), écrit un fichier de travail par match, lance **une**
   JVM `DecisionReplay` sur tout l'export, produit `analysis.json` :
   `{ "version": 1, "model": "<games> parties", "at": ISO, "matches": { matchId: { gameNumber: [ analyse par
   décision, même index que la décision ] } } }`.
2. Exécuter sur l'export e2e réel (`test/harness/e2e.js` étendu pour exporter ; une seule exécution) et sur un export
   du harnais (`gen-demo.js` → écrire un petit script qui produit le même JSON que le menu Données). Rapport : décisions
   rejouables / non rejouables (par raison), temps moyen, distribution des écarts.
3. Critère : ≥ 80 % de décisions rejouables sur l'export e2e, < 2 s de moyenne par décision (K = 5) ; sinon réduire
   K ou noter PARTIEL.

### Phase A4 — Dans le tableau de bord (boîte : 2 h)

1. Menu Données : « Importer une analyse » (fichier `analysis.json`) → stockée sous `ana:<matchId>` (jamais écrite
   par le traqueur ; supprimée avec le match et par « Tout effacer » ; incluse dans l'export JSON comme `analyses`).
2. Bloc Coach : quand une analyse existe pour la game, deux colonnes de plus : « Meilleur coup » (libellé lisible :
   réutiliser `describeAction` pour le coup joué, et un rendu court pour l'option : nom de carte → cible) et
   « Écart » en points, coloré comme les erreurs actuelles (≤ −15 « erreur probable », ≤ −30 « grosse erreur »),
   infobulle « moyenne sur K mains adverses tirées au sort ». Note discrète sous le bloc : « analyse du <date>,
   modèle <n> parties ». Sans analyse : rien ne change.
3. Le README explique la boucle : Données → Export JSON → `node ~/Developer/Endstep-coach/bot/coach-replay.js
   export.json` → Données → Importer une analyse.
4. Tests : `test/coach.test.js` (ou `test/analysis.test.js`) sur l'appariement analyse ↔ décisions et le rendu
   (fonction pure extraite de `dashboard.js` si besoin) ; `gen-demo.js` enrichi d'une analyse de démonstration ;
   `shot-decisions.js` capture le bloc avec la colonne ; détecteur design sans remarque ; i18n en/fr sans clé manquante.

## Partie B

### Phase B1 — Cartes et vecteurs (boîte : 1 h 30)

1. `model/cards.js` : lit `cardsfolder.zip` (comme `sim/ai-check.js`), garde pour chaque carte `name`, `types`,
   `manaCost`, `oracle` (les `\n` de la ligne Oracle sont des retours à la ligne), et sort `data/coach3/cards.json`
   pour l'union : cartes de `decks/*.dck`, cartes vues dans `data/*.jsonl` et `data/bot/**/*.jsonl` (mains et
   zones), cartes des listes de `data/meta/pauper.json`. Noter le nombre de cartes et celles introuvables.
2. `model/embed.py` : texte = `types + " " + oracle` ; `TfidfVectorizer` (mots et bigrammes, `min_df=2`) puis
   `TruncatedSVD(32)` ; normalisation L2 ; écrit `Endstep-tracker/coach-cards.json` : `{ "dim": 32, "method":
   "tfidf-svd", "cards": { name: [32 flottants arrondis à 4 décimales] } }` (< 1 Mo ; sinon réduire à 24
   dimensions ou à 3 décimales) et `bot/coach-cards.txt` (une ligne `nom<TAB>v1 v2 …`).
3. Vérification de bon sens : les 5 plus proches voisins de Thoughtcast, de Lightning Bolt et d'un terrain (par
   cosinus) sont cohérents (pioche avec pioche, brûlure avec brûlure, terrains ensemble) ; noté dans le journal.

### Phase B2 — Features étendues, partout (boîte : 2 h)

1. `coach.js` : `FEATURES2` = `FEATURES` + pour chacune des zones `my_hand`, `my_battlefield`, `opp_battlefield`,
   `my_graveyard`, `opp_graveyard`, `stack` : 32 colonnes `zone_e<i>` = somme des vecteurs des cartes de la zone
   (carte inconnue = vecteur nul ; la main adverse **n'est pas** encodée). `features2(state, mySeat, firstSeat,
   cards)` ; `predict` inchangé (le fichier de modèle porte `features`). Le tableau de bord charge
   `coach-cards.json` à côté du modèle et appelle `features2` si le modèle liste des colonnes `_e`. Le repli
   heuristique reste sur les 37 premières.
2. `CoachEvaluator.java` : charge `bot/coach-cards.txt`, calcule les mêmes colonnes dans le même ordre (somme sur les
   cartes de la zone par nom ; jetons : nom du jeton, inconnu → nul). `bot/coach-model.txt` ajoute une ligne
   `cards <fichier>` quand le modèle est étendu ; sans cette ligne, comportement actuel.
3. Parité : `EvalCheck` + `parity.js` sur ≥ 200 états avec le modèle étendu : écart < 1e-6 ; anti-triche vert.
   `test/coach.test.js` : parité JS/Python (`js-parity.json`) sur les features étendues.

### Phase B3 — Réentraîner et mesurer (boîte : 1 h 30 + exécution)

1. `model/build.js` écrit les colonnes de `FEATURES2` (option `--cards coach-cards.json`) sur toutes les données
   (`data/*.jsonl` + `data/bot/selfplay`). `model/train.py` : MLP (64, 32) sur `FEATURES2` ; comparer aussi le MLP
   (32, 16) sur les 37 premières (référence) dans la même exécution ; sélection par log-loss de validation.
2. `model/compare.py` ancien (`bot/coach-model-selfplay.json`) contre nouveau sur le même jeu de test : critère
   AUC ≥ ancien + 0,01. Sinon PARTIEL : garder le nouveau dans `bot/coach-model-embed.json`, ne pas livrer.
3. Si livré : `export-flat.js`, puis bot re-mesuré miroir 150 + 150 (`run-eval.sh` avec les seules lignes miroir,
   ou `BotMatch` direct) : ≥ 61 % attendu ; sinon noter et garder quand même (le coach est la cible), sauf si
   < 55 %, auquel cas revenir à l'ancien modèle.
4. `node test/coach.test.js` vert, commit des deux dépôts (extension 0.7.0).

### Phase B4 — Bonus : embeddings appris (boîte : 1 h + exécution)

Si B3 est DONE et qu'il reste du temps : `pip install model2vec` (`minishlab/potion-base-8M`, statique, numpy),
vecteurs 256 → réduits à 32 par PCA, même pipeline B1–B3, même comparaison. Garder le meilleur des deux.

## Phase finale — Rapport (30 min)

- PROGRESS-COACH3.md : pour A, taux de rejeu, temps, exemples de meilleurs coups sur l'e2e (3 lignes), limites
  (attachements, jetons, pile, main adverse au hasard) ; pour B, AUC ancien/nouveau par source, voisins de cartes,
  taille des fichiers, résultat du bot ; prochaines étapes (rejeu automatique via un petit serveur local, 2 coups
  d'avance, explication par Claude sur les décisions signalées).
- Tests verts, captures du harnais (bloc Coach avec la colonne), commits. `STATUT FINAL : TERMINÉ` si A4 et B3 sont
  DONE ou PARTIEL avec mesures ; sinon `ARRÊT` avec la raison.

## Si bloqué

- `applyToGame` ne pose pas les cartes (noms inconnus, jetons) : vérifier les noms exacts dans `cardsfolder.zip`
  (accents : Forge accepte « Lorien Revealed »), remplacer les jetons, noter les cartes ignorées par décision.
- L'état s'applique mais la première priorité n'arrive pas au bon joueur/à la bonne phase : forcer
  `PhaseHandler.devModeSet(phase, player)` après `applyToGame`, ou définir `activeplayer`/`activephase` avant.
- Rejeu trop lent (> 2 s) : K = 3, ne simuler que les options dont le nom apparaît dans `prompt.options` (elles
  sont enregistrées !), limiter les cibles à 4.
- Import d'analyse : ne jamais toucher `match:`/`dec:` ; la clé `ana:` est indépendante, l'ancienne analyse est
  remplacée.
- B : la parité casse sur les jetons ou les noms à accents : normaliser les noms (NFD sans diacritiques, comme
  `sim/ai-check.js`) des deux côtés.
- AUC n'augmente pas : vérifier que les colonnes `_e` ne sont pas toutes nulles (cartes introuvables), essayer 64
  dimensions, ou moyenne au lieu de somme ; sinon PARTIEL, c'est un résultat aussi.

## Journal de progression (format de `PROGRESS-COACH3.md`)

```
# Coach 3 — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation — DONE (10 min)
- GameState : « human » = joueur 0 du Game (vérifié par test)
## Phase A1 — État — EN COURS
- 10:20 StateBuilder : 3 états rechargés, écart 0 ; jetons Servo → c_1_1_a_servo
## Phase A2 — Classement — …
## Phase B1 — …
## Métriques
- Rejeu : 31/36 décisions rejouables (5 en réponse), 1,4 s/décision (K = 5)
- Modèle : AUC 0,84 (ancien 0,82) sur le même test ; bot 63 % miroir
## Limites connues / prochaines étapes
…
STATUT FINAL : TERMINÉ
```
