# Objectif 6 : ré-entraîner le réseau sur l'auto-jeu en profondeur 1

Commande pour lancer la session autonome :

```
/goal Exécute le plan COACH-GOAL-6.md (à la racine de Endstep-tracker) phase par phase, sans me poser de question, jusqu'à ce que ~/Developer/Endstep-coach/PROGRESS-COACH6.md contienne une ligne "STATUT FINAL : TERMINÉ" ou "STATUT FINAL : ARRÊT" avec, pour chaque phase, un statut DONE, PARTIEL ou BLOQUÉ et ses vérifications.
```

Ce document est écrit pour être exécuté par Claude Code sur plusieurs heures, l'utilisateur absent.
**Relis-le en entier, ainsi que `~/Developer/Endstep-coach/PROGRESS-COACH4.md` et `PROGRESS-COACH5.md` (pièges déjà
résolus, incidents de pilotage) et `PROGRESS-COACH6.md` s'il existe, avant toute action et après toute compaction de
contexte.** Décide seul, note chaque décision dans PROGRESS-COACH6.md, ne demande rien à l'utilisateur.

## But

Le réseau « ensemble de cartes » livré en COACH-5 (AUC test 0,856, bot 73,0 % dans le miroir) a appris de parties
jouées par l'IA de Forge et par le bot à un coup d'avance ; seules 54 parties venaient du bot fort (profondeur 1, qui
gagne 77 %). On veut **un meilleur professeur** : plusieurs centaines de parties du bot en profondeur 1 contre
lui-même, et un réseau qui en tire parti. Quatre leviers, mesurés séparément :

1. **Plus de données fortes** : ~600 parties bot contre bot en profondeur 1 (miroir + 3 archétypes), pondérées ou
   utilisées en fine-tuning.
2. **Cible de recherche** : chaque décision rejouée du bot laisse dans le journal la valeur du meilleur rollout ; c'est
   une estimation « après recherche » de la position, moins bruitée que l'issue de la partie. Cible auxiliaire.
3. **Table de cartes apprise** : les 713 vecteurs TF-IDF/SVD sont aujourd'hui gelés ; les laisser bouger (initialisés
   aux vecteurs actuels).
4. **Un jeu de test « fort »** : une part des nouvelles parties, jamais vue à l'entraînement, pour juger l'évaluateur
   sur des positions bien jouées, en plus du test historique de COACH-3.

Critère de succès : le réseau retenu bat le réseau actuel **dans le miroir** (300 parties, profondeur 0, attaques et
blocs énumérés = la configuration par défaut) : point estimé ≥ 74 % **et** pas moins bon sur un archétype de contrôle
(150 parties contre `terror`), avec une log-loss meilleure sur le test fort. Sinon PARTIEL : le modèle actuel reste,
les mesures sont notées.

## Contexte (ce qui existe déjà)

- Bot (`~/Developer/Endstep-coach/bot/`) : `CoachController` (profondeur `BOT_DEPTH` 0|1 défaut 0, `BOT_K` 3,
  attaques et blocs énumérés par défaut — `BOT_COMBAT=0`/`BOT_BLOCKS=0` pour Forge —, rollouts sur sorts et
  attaques, `RolloutCheck -m ../bot/coach-model-logreg.txt` vert), `BotMatch` (journal JSONL : lignes d'état
  `{gameId, seq, turnNumber, phase, activePlayerId, players[...]}`, lignes de décision
  `{gameId, decision: {turn, phase, seat, options|blocks, rollouts?: [{sa, one, score}], chosen, ms}}`, ligne
  d'issue `{gameId, outcome: {winner, draw, timedOut, turns, ms, ai}}`), `run-selfplay.sh <miroir> <archétype>
  [dir] [P] [classes]` (CHUNK par JVM, verrou `mkdir`, ≤ P JVM sur le répertoire, `-Xmx3g`, deux bots),
  `run-eval.sh <N/2> 0 <dir> [P]` (miroir 4 × N/2, `BOT_MODEL=` pour un autre modèle ; **ses runs d'archétype à 0
  partie écrivent aussi `DONE` : compter les `mirror-*.log` seulement**), `report.js` (taux, IC, s/partie).
- Modèle : `model/lists.js [dirs…]` → `model/lists.jsonl` (`{s, m, g, seat, y, c[37], z[6][≤24 indices]}`,
  vocabulaire `model/cards-vocab.json`, partage md5 par partie : train/valid/test, les répertoires `coach5/*` jamais
  en test) et cache `lists.npz` ; `model/train_sets.py [H_carte] [H_tête] [minutes]` (torch, `SETS_TAG`,
  `SETS_THREADS`, table gelée, sortie `coach-model-sets<tag>.json` + `results-sets<tag>.json`) ;
  `model/sets_predict.py` (référence numpy) ; `model/export-flat.js <json> <txt>` ; `model/parity-export.py <json>`
  (→ `js-parity-sets.json`) ; `bot/parity.js` et `Endstep-tracker/test/coach.test.js` acceptent
  `COACH_MODEL=<json>` ; `EvalCheck A.dck B.dck N out.jsonl model.txt` produit les évaluations Java pour la parité.
- Modèle livré : `Endstep-tracker/coach-model.json` = `model/coach-model-sets-64.json` (type `sets`, 64/64,
  `games 9253`), `bot/coach-model.txt` (plat), `bot/coach-model-logreg.txt` (ancienne logreg), table
  `Endstep-tracker/coach-cards.json` (`{dim: 32, method, cards: {nom: [32]}}`) et `bot/coach-cards.txt`
  (`dim 32` puis `nom<TAB>valeurs`). `CoachEvaluator` (Java) et `coach.js` (JS) lisent la table telle quelle : une
  table apprise se livre en réécrivant ces deux fichiers (mêmes formats, même dimension).
- Données : `data/*.jsonl` (Forge contre Forge, 8 fichiers, 1,5 Go), `data/bot/selfplay/*` (1 000 parties bot
  contre bot profondeur 0), `data/coach5/selfplay/*` (54 parties profondeur 1 : miroir 9, terror 22, white-weenie
  21, grixis 2). Total actuel : 9 253 parties, 1,61 M lignes (train 6 454 / valid 1 379 / test 1 420 parties).
- Mesures de référence (miroir Esper Affinity, 300 parties, bot contre Forge) : logreg 68,3 % ; réseau 71,7 % ;
  **réseau + attaques + blocs (défaut) 73,0 % (IC 67,7–77,7), 5,3 s/partie à 4 JVM et charge 7** (eval-d).
  Auto-jeu profondeur 1 : ~2 min par partie et par JVM (deux bots avec rollouts), donc ~120 parties par heure à
  4 JVM.
- Machine : macOS 10 cœurs, 32 Go, 347 Go libres, java 17, node 22, `.venv` (Python 3.10, torch 2.14, sklearn),
  session avec écran. Le serveur coach (`bot/coach-server.sh`) tourne sur `bot/coach-model.txt` : le relancer après
  toute recompilation ou changement de modèle.

## Règles absolues

1. **Aucun bot, aucune partie automatisée sur endstep.cc, aucun appel réseau** (le serveur coach n'est pas touché par
   ce plan ; `/explain` reste tel quel).
2. Pas de triche : `RolloutCheck -m ../bot/coach-model-logreg.txt` vert après toute modification de `CoachController`
   (ce plan ne devrait pas y toucher).
3. L'extension reste fonctionnelle : `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js
   && node test/hook.test.js` verts avant tout commit ; un modèle livré passe la parité Python ↔ JS (< 1e-6) et
   Java ↔ JS (< 1e-9) ; `release.sh` n'est pas touché.
4. Laboratoire dans `~/Developer/Endstep-coach/` (`data/coach6/`, `model/`). Ne rien installer. Un commit par phase
   dans chaque dépôt touché. Les fichiers de données ne sont pas versionnés ; les modèles candidats (`model/*.json`)
   le sont.
5. Boîtes de temps : à 1,5× la boîte sans résultat, BLOQUÉ + cause + essais, phase suivante. L'auto-jeu tourne en
   fond pendant les phases A et B ; C attend qu'il soit fini.
6. Tenir `~/Developer/Endstep-coach/PROGRESS-COACH6.md` à jour après chaque étape (format en fin de document).
7. **≤ 4 JVM en même temps** (`-Xmx3g` pour l'auto-jeu, `-Xmx2g` pour les mesures). L'auto-jeu prend 4 JVM en phase 0 ;
   il est mis en pause (`kill -STOP` sur ses JVM, `kill -CONT` après) pendant une mesure, ou les mesures attendent.
   Toute comparaison de temps se fait à charge égale (`uptime` noté).
8. Gros runs en `nohup … &`, journaux dans `data/coach6/logs/`. **Une chaîne d'attente compte les `mirror-*.log`
   contenant `DONE`, jamais `*.log`** (incident COACH-5). Vérifier au bout de 10 minutes qu'une mesure avance.

## Livrables et critères de fin

- [ ] Phase 0 : journal, tests verts, auto-jeu profondeur 1 lancé (4 JVM, 600 parties), heure de fin estimée notée.
- [ ] A1 : `lists.js` : source de chaque partie (`forge`, `selfplay0`, `selfplay1`), partage `test1` (15 % des parties
      profondeur 1, par md5), poids par ligne ; cible de recherche `v` attachée aux états quand le journal la donne.
- [ ] A2 : `train_sets.py` : pondération par source, fine-tuning depuis un modèle donné, table apprise (option), perte
      auxiliaire sur `v` (option), rapport sur `test` et `test1` ; répétable avec les 54 parties déjà là.
- [ ] B1 : quand ≥ 400 parties profondeur 1 sont finies : jeu de données reconstruit ; 4 entraînements (base pondérée,
      fine-tuning, table apprise, cible de recherche), ≤ 30 min chacun ; tableau AUC/log-loss `test` et `test1`.
- [ ] B2 : deux candidats retenus (meilleure log-loss `test1`, et le meilleur sans table apprise si ce n'est pas le
      même) exportés et vérifiés en parité.
- [ ] C1 : miroir 300 (défauts, profondeur 0) pour chaque candidat, témoin actuel re-mesuré (76 parties) à charge égale.
- [ ] C2 : archétype de contrôle : 150 parties contre `terror` pour le meilleur candidat et le témoin.
- [ ] D : livraison (ou non) : `coach-model.json`, `bot/coach-model.txt`, table si apprise, `coach-model-sets-*.json`
      versionné, `coach.test.js` vert, démo et captures, version de l'extension, README (une phrase).
- [ ] Rapport, limites, prochaines étapes, `STATUT FINAL`.

## Phase 0 — Préparation et lancement de l'auto-jeu (20 min)

1. `data/coach6/logs/`, `PROGRESS-COACH6.md`, tests extension verts, `uptime`, `df -h`.
2. Lancer l'auto-jeu tout de suite (le plus long) : `BOT_DEPTH=1 BOT_K=3 CHUNK=3 bot/run-selfplay.sh 300 100
   data/coach6/selfplay 4` (miroir 2 × 150 + terror/grixis-affinity/white-weenie × 100, deux bots, attaques et blocs
   énumérés par défaut, 4 JVM). Vérifier après 10 min que 4 JVM tournent et que des parties s'écrivent ; noter le
   temps par partie et l'heure de fin estimée (attendu 5–6 h). Si une série plante (exception Java dans son
   journal), la relancer seule avec le reste des parties.
3. Ne pas attendre : passer aux phases A puis B avec les 54 parties existantes pour mettre au point la chaîne.

## Phase A — Données et entraînement (boîte : 3 h)

### A1 — `lists.js` (1 h)

1. Chaque partie porte une **source** : `forge` (`data/*.jsonl`), `selfplay0` (`data/bot/selfplay`), `selfplay1`
   (`data/coach5/selfplay`, `data/coach6/selfplay`). Ligne : `{s, src, m, g, seat, y, c, z, v?}`.
2. Partage : inchangé pour `forge` et `selfplay0` (md5 → train/valid/test, le test reste celui de COACH-3) ; pour
   `selfplay1` : md5 → 70 % train, 15 % valid, **15 % `test1`** (jamais en `test`).
3. **Cible de recherche** `v` : dans un journal de bot, une ligne de décision avec `rollouts` donne
   `max(rollouts[].score)` = estimation après recherche pour le siège `seat`, au moment de l'état courant. Attacher
   cette valeur à la **prochaine ligne d'état** du même `gameId` (celle dont `seq` suit la décision), pour ce siège ;
   pour l'autre siège, `1 − v` n'est pas garanti (évaluateurs différents) : ne rien attacher. Sans rollout, pas de
   `v`. Noter la part des lignes avec `v` (attendu : quelques pour cent, seulement dans `selfplay1`).
4. `node model/lists.js data/bot/selfplay data/coach5/selfplay data/coach6/selfplay` reconstruit `lists.jsonl` ;
   `lists.npz` se régénère (le cache est invalidé par la date du JSONL).

### A2 — `train_sets.py` (2 h)

1. Options par variables d'environnement, valeurs par défaut = comportement COACH-5 :
   - `SETS_WEIGHT_SELFPLAY1` (poids des lignes `selfplay1`, défaut 1 ; essai à 3) ;
   - `SETS_INIT=<json>` : initialise les poids depuis un modèle exporté (fine-tuning) et `SETS_LR` (défaut 1e-3 ;
     fine-tuning à 2e-4) ; `SETS_ONLY=selfplay1` restreint l'entraînement à une source (la validation reste
     complète) ;
   - `SETS_LEARN_TABLE=1` : table de cartes apprise (init = vecteurs actuels, ligne 0 gelée à zéro, régularisation L2
     vers l'init `SETS_TABLE_L2` défaut 1e-3) ; l'export écrit alors aussi `coach-cards-<tag>.json` et
     `coach-cards-<tag>.txt` (mêmes formats que les fichiers livrés) ;
   - `SETS_AUX=0.5` : perte auxiliaire `BCE(sigmoid(logit), v)` sur les lignes qui ont `v`, pondérée par cette valeur
     (0 = ignorée).
2. Rapport : AUC et log-loss sur `valid`, `test` (COACH-3) et **`test1`** (fort) ; `results-sets<tag>.json` les
   contient tous ; export JSON comme aujourd'hui (+ `table` si apprise : `model/parity-export.py` et
   `sets_predict.py` prennent la table du modèle quand elle existe, sinon `coach-cards.json`).
3. Répétition sur les données actuelles (54 parties fortes) pour valider la chaîne : les quatre variantes tournent
   sans erreur (5 min chacune avec `[minutes] = 5`), parité `coach.test.js` verte sur au moins un export avec table
   apprise (`COACH_MODEL=…`, la table du modèle doit être lue par `zoneInput` : ajouter `model.table` en priorité sur
   `cards` dans `coach.js`, et `CoachEvaluator` lit une ligne `cards <fichier>` comme aujourd'hui — export-flat.js
   écrit la table apprise dans un fichier à côté et le nomme sur cette ligne).

## Phase B — Entraînements (boîte : 2 h + attente de l'auto-jeu)

### B1 — Quatre entraînements

1. Attendre ≥ 400 parties profondeur 1 finies (`grep -c '"outcome"' data/coach6/selfplay/*.jsonl` + les 54) ;
   reconstruire `lists.jsonl` ; noter les tailles (lignes par source, `test1`).
2. Mettre l'auto-jeu en pause si les 4 JVM saturent la machine pendant l'entraînement (`SETS_THREADS=4`), sinon le
   laisser finir. Quatre entraînements 64/64, ≤ 30 min chacun :
   - `base` : toutes sources, `SETS_WEIGHT_SELFPLAY1=3` ;
   - `finetune` : `SETS_INIT=model/coach-model-sets-64.json SETS_ONLY=selfplay1 SETS_LR=2e-4` ;
   - `table` : comme `base` + `SETS_LEARN_TABLE=1` ;
   - `aux` : comme `base` + `SETS_AUX=0.5`.
   Tableau : AUC / log-loss sur `test` et `test1` pour les quatre + le réseau actuel (évalué sur `test1` avec
   `sets_predict.py`) + la logreg (idem).
3. Critère B1 : au moins un candidat améliore la log-loss `test1` du réseau actuel de ≥ 0,005 sans perdre plus de
   0,005 sur `test`. Sinon : PARTIEL, C se fait quand même avec le meilleur candidat (les mesures en parties décident).

### B2 — Candidats

1. Deux candidats : la meilleure log-loss `test1`, et le meilleur sans table apprise si différent (une table apprise
   change deux fichiers livrés de plus : on veut savoir si elle vaut le coup).
2. Export plat (`export-flat.js`), parité Python ↔ JS (`parity-export.py` + `COACH_MODEL=… coach.test.js`) et
   Java ↔ JS (`EvalCheck` 2 parties avec le `.txt` du candidat, `COACH_MODEL=… bot/parity.js`).

## Phase C — Mesures en parties (boîte : 30 min + exécution ~1 h 30)

1. Auto-jeu fini (ou mis en pause). Pour chaque candidat : `BOT_DEPTH=0 BOT_MODEL=../bot/<candidat>.txt
   bot/run-eval.sh 150 0 data/coach6/eval-<nom> 4` (miroir 300, défauts : attaques et blocs énumérés) → `report.js`.
   Témoin : le réseau actuel, 76 parties (`run-eval.sh 38 0 data/coach6/eval-witness 4`) à la même charge, en plus
   des 73,0 % d'eval-d.
2. Contrôle : 150 parties contre `terror` : `BOT_MODEL=… bot/run-eval.sh 0 150 data/coach6/ctl-<nom> 4` lance les
   trois archétypes × 150 (terror suffit : tuer les deux autres séries, ou laisser tourner si le temps le permet, en
   les notant) pour le meilleur candidat et pour le témoin.
3. Décision : livré si miroir ≥ 74 % **et** terror ≥ témoin − 3 points (IC recouvrants) **et** log-loss `test1`
   meilleure ; sinon le modèle actuel reste, résultat noté. Une seule mesure supplémentaire autorisée (par exemple
   l'autre candidat sur terror) si la décision est à moins d'un point.

## Phase D — Livraison (boîte : 45 min)

1. Si livré : `coach-model.json` (avec `games`, `auc_test`, `auc_test1`, `trained`, `data`), `bot/coach-model.txt`,
   `coach-cards.json` + `bot/coach-cards.txt` si table apprise (l'ancienne table gardée en `coach-cards-tfidf.*`),
   `model/js-parity-sets.json` régénéré, `coach.test.js` vert, `bot/parity.js` vert, serveur relancé,
   `RolloutCheck -m ../bot/coach-model-logreg.txt` vert (inchangé), démo rejouée (`qa-server.js`), captures
   (`shots.js`, `shot-decisions.js`), extension `0.9.2`, README (une phrase : sur quoi le modèle a appris).
2. Si non livré : les candidats restent sous leur nom dans `model/`, rien ne change dans l'extension ; le journal dit
   pourquoi.

## Phase finale — Rapport (30 min)

- PROGRESS-COACH6.md : tableau des entraînements (`test`, `test1`), tableau des mesures (miroir, terror, s/partie,
  charge), coût de l'auto-jeu (parties, heures), limites (bruit des rollouts dans `v`, un seul deck, miroir comme
  juge), prochaines étapes (deuxième génération : auto-jeu avec le nouveau réseau, attention par zone, blocs en
  profondeur 1).
- Tests verts, commits (deux dépôts), `STATUT FINAL : TERMINÉ` si A et B sont DONE et C, D DONE ou PARTIEL avec
  mesures ; sinon `ARRÊT` avec la raison.

## Si bloqué

- Auto-jeu trop lent (> 3 min par partie et par JVM) : `BOT_K=2` pour les chunks suivants, et B1 démarre à 300
  parties ; noter.
- Une série d'auto-jeu qui plante à répétition sur un archétype : la retirer, noter, augmenter le miroir d'autant.
- `lists.npz` trop gros pour la RAM (au-delà de ~3 M lignes) : `lists.js` échantillonne un état sur deux des parties
  `forge` (`--every 2`), noter.
- Table apprise qui diverge (log-loss `valid` qui remonte dès la 2e époque) : `SETS_TABLE_L2=1e-2`, puis abandonner
  la variante.
- Parité Java ↔ JS en échec avec une table apprise : vérifier que `bot/coach-cards-<tag>.txt` a bien 4 décimales
  identiques au JSON (l'export arrondit les deux de la même façon) ; sinon exporter à 6 décimales dans les deux.
- Une mesure qui n'avance plus après 10 minutes : `pgrep -fl BotMatch`, journal de la JVM, relancer la série seule.

## Format de PROGRESS-COACH6.md

```
# Coach 6 — progression
Démarré : <date heure>   Dernière mise à jour : <date heure>

## Phase 0 — Préparation et auto-jeu — DONE|PARTIEL|BLOQUÉ (<durée>)
- <faits, mesures, décisions, commandes exactes>
## Phase A1 — lists.js — …
## Phase A2 — train_sets.py — …
## Phase B1 — Entraînements — …
## Phase B2 — Candidats — …
## Phase C1 — Miroir — …
## Phase C2 — Archétype de contrôle — …
## Phase D — Livraison — …
## Phase finale — Rapport — …

STATUT FINAL : TERMINÉ|ARRÊT
```
