# Endstep Tracker

Extension Chrome (Manifest V3, sans dépendance) qui enregistre automatiquement tes matchs sur [endstep.cc](https://endstep.cc).

## Installation

1. `chrome://extensions` → activer **Mode développeur**
2. **Charger l'extension non empaquetée** → sélectionner ce dossier
3. Recharger les onglets endstep.cc déjà ouverts. Pendant un match, l'icône affiche un badge **REC**.
4. Clic sur l'icône → popup : le match en cours (archétype adverse, mon bilan contre lui, mon plan de side) ou la session, et le bouton du tableau de bord (historique, stats, exports).

Après une modification du code : bouton ↻ de l'extension dans `chrome://extensions`. Les onglets endstep.cc ouverts sont rattachés automatiquement (`background.js` réinjecte le traqueur et `hook.js`, qui survit dans la page, lui rejoue ce qu'il a manqué depuis le dernier état complet de la partie).

## Ce qui est enregistré

Par match : date, format (classé ou non, Bo1/Bo3), adversaire, mon deck (nom + liste), score, résultat.

Par game :
- play/draw, qui a gagné le toss
- mulligans des deux joueurs, ma main de départ gardée
- vainqueur, raison de fin (concession…), nombre de tours, PV finaux, durée
- cartes adverses vues (sorts, terrains, cimetière, exil, cartes révélées) avec le nombre max d'exemplaires vus, couleurs (celles des sorts lancés uniquement : une carte défaussée puis renvoyée en jeu sans être lancée, comme Sneaky Snacker, ne colore pas le deck)
- cartes jouées tour par tour (moi et l'adversaire) et journal complet

Dans le tableau de bord (clic sur l'icône) :
- en tête, le deck analysé : par défaut mon deck le plus joué sur 30 jours, sinon un autre deck, tous les decks d'un format ou tous mes decks (menu groupé par format) ; la période et un archétype adverse s'y ajoutent, et toutes les stats portent sur cette portée ;
- bilan matchs/games, matchups par archétype adverse (un clic sur une ligne filtre), résultats au play / à la draw, avec ou sans mulligan ; sous 5 résultats, pas de pourcentage mais un point par résultat, et les archétypes croisés moins de 3 fois se regroupent en « Autres » ; le match en cours ne compte pas ;
- en haut, la session en cours (ou la dernière, repliée) : ses matchs, l'archétype reconnu à confirmer en un clic, et ce qu'elle change à chaque matchup ; une session, ce sont des matchs à moins de 2 h d'écart ;
- le guide des matchups : bilan en matchs, G1, G2-G3, games au play et à la draw, tri par fréquence, pire ou meilleur d'abord (un taux sur moins de 5 matchs ne passe jamais en tête) ; un clic ouvre le panneau du matchup : son plan de side (une note par deck et par archétype, enregistrée pendant la frappe et rappelée sous la ligne), ses bilans par version, les cartes vues chez lui avec leur fréquence, ses matchs, et un bouton pour filtrer la page sur lui ; `j` / `k` parcourent les lignes, Échap ferme le panneau ;
- chaque bilan se lit aussi en G1 (main deck) et en G2-G3 (après sideboard), pour les matchups, le contexte et mes decks ;
- versions de la liste : quand le main deck enregistré d'un deck change, une nouvelle version commence (les retouches de side ne comptent pas) ; la portée montre la version actuelle par défaut, avec les cartes ajoutées et retirées depuis la précédente, un bouton pour mettre le bilan de la précédente à côté de chaque matchup, et un menu pour les autres versions ou toutes ;
- historique des matchs, avec sa recherche (adversaire, archétype, carte vue, note — touche `/`) et son filtre victoires/défaites, qui ne changent que la liste ;
- détail de chaque match : cartes adverses vues (aperçu de la carte au survol), main de départ, cartes jouées tour par tour, journal, archétype adverse et notes ;
- menu « Données » : export JSON (sauvegarde), export CSV (une ligne par game), import, tout effacer.

Seules les informations publiques (visibles en jeu) sont enregistrées. Tout reste en local (`chrome.storage.local`) ; seul l'aperçu au survol charge l'image de la carte depuis Scryfall.

## Reconnaissance du deck adverse

Le tableau de bord reconnaît le deck adverse à partir des cartes vues, grâce au métagame public d'endstep.cc (`/api/metagame/v1`) : pour chaque archétype, le site publie la liste des cartes et leur taux de présence. Le score est un classement bayésien naïf (part de métagame × taux de présence de chaque carte vue) ; en dessous de 60 % de certitude, ou avec moins de 2 cartes non-terrain, rien n'est proposé. Le nom reconnu s'affiche en pointillés dans la liste (le survol donne la certitude et les cartes décisives) et dans le détail, avec un bouton « Utiliser » pour le confirmer ; un archétype saisi à la main a toujours priorité. Les matchs d'un format suivi par le site (Modern, Pauper, Legacy, Premodern, Vintage, Duel Commander…) sont comparés aux archétypes de ce format, les autres (casual, freeplay) à tous. Les données sont chargées au besoin (environ une requête par archétype), mises en cache 7 jours dans `chrome.storage.local` (clé `meta`) ; les archétypes trop rares, dont le site ne publie pas la liste, ne peuvent pas être reconnus.

## Coach (bêta)

Pendant une partie, l'extension enregistre aussi chacune de mes décisions (invite du moteur, options proposées, choix, plateau). Le détail d'une game affiche « Mes décisions » et un bloc **Coach** : pour chaque décision, la probabilité de victoire avant et après (le plateau à la décision suivante, réponse adverse comprise), et les chutes nettes signalées comme erreurs probables (≤ −15 points) ou grosses erreurs (≤ −30).

**Meilleur coup.** Le laboratoire `Endstep-coach` peut rejouer chaque décision enregistrée dans Forge et classer les options comme le ferait son bot (main adverse tirée au sort depuis l'archétype reconnu). Deux façons : le **coach local**, `~/Developer/Endstep-coach/bot/coach-server.sh start` (Forge chargé une fois, écoute sur `127.0.0.1:8765` seulement, ne stocke rien), après quoi le détail d'un match propose *Analyser avec le coach local* et range le résultat lui-même ; ou l'aller-retour de fichiers : Données → *Exporter une sauvegarde (JSON)*, puis `node ~/Developer/Endstep-coach/bot/coach-replay.js <export.json> analysis.json 3 1` (3 mains adverses tirées au sort, profondeur 1), puis Données → *Importer une analyse…*. Sans serveur, le bouton n'apparaît pas et rien ne change. Le bloc Coach gagne deux colonnes : le meilleur coup selon le modèle et l'écart avec le tien (en points de probabilité de victoire). En profondeur 1, chaque option est jouée jusqu'au début de ton tour suivant, Forge tenant les deux camps (réponse adverse comprise) sur chaque main adverse tirée ; l'infobulle du meilleur coup donne « ± » l'écart-type entre ces mains, et la note sous le tableau le rappelle. Les attaques restent jugées à un coup. L'analyse est gardée à part (`ana:<matchId>`), exportée avec la sauvegarde, supprimée avec le match. Non rejoué : les décisions en réponse (pile non vide), les blocs, les mulligans, les choix internes d'un sort.

**Expliquer.** Si le serveur coach a une clé d'API Anthropic (fichier `~/Developer/Endstep-coach/.env` avec `ANTHROPIC_API_KEY=…`, et `ANTHROPIC_WORKSPACE_ID=…` pour une clé d'organisation ; `chmod 600`, jamais versionné), chaque décision signalée qui a une analyse propose *Expliquer* : le serveur résume le plateau (tour, vies, mains, tables, cimetières), le coup joué, le meilleur coup et les scores, et demande à Claude (`claude-sonnet-5` par défaut, `COACH_LLM_MODEL` pour changer) une explication de 80 mots au plus, rangée dans l'analyse et affichée sous la ligne. C'est le seul appel externe de tout le dispositif, il part du serveur local, jamais de l'extension, et seulement sur ce clic ; aucun pseudo ni identifiant de match n'est envoyé. Sans clé, le bouton n'existe pas.

La probabilité vient de `coach-model.json`, un petit modèle (depuis 0.9.1 un réseau « ensemble de cartes » : chaque carte visible passe par un petit MLP partagé, les résultats sont sommés par zone et joints aux comptes du plateau ; avant, une régression logistique) entraîné hors ligne sur des parties Forge AI contre Forge AI simulées avec mon deck (pipeline dans le dépôt séparé `Endstep-coach` : Forge en local, jamais sur endstep.cc). `coach.js` calcule les mêmes features dans l'extension et à l'entraînement. Sans modèle, une heuristique à la main prend le relais et l'interface le dit. Limites : le modèle a appris du niveau de Forge AI et de mon deck ; il repère les grosses erreurs (létal manqué, attaque suicidaire), pas les finesses.

## Langues

L'interface existe en français et en anglais : elle suit la langue de Chrome, et un sélecteur dans l'en-tête permet de forcer l'une ou l'autre. Les textes sont dans `_locales/en/messages.json` et `_locales/fr/messages.json` (le manifest utilise les mêmes fichiers). Pour ajouter une langue : copier `_locales/en`, traduire, puis l'ajouter à `LANGS` dans `shared.js`.

## Fonctionnement

- `hook.js` s'exécute dans la page avant le code d'Endstep et observe le WebSocket (`GAME_STATE`, `GAME_DELTA`, `GAME_EVENT`, `GAME_OVER`…) ainsi que quelques réponses `fetch` (noms de decks, format du match).
- `tracker.js` transforme ces messages en fiche de match (logique pure, testée).
- `content.js` persiste les fiches (et mes décisions sous `dec:<matchId>`) ; `dashboard.html` les affiche ; `meta.js` reconnaît le deck adverse ; `coach.js` évalue les décisions.
- `icons/` : sources SVG des icônes (`icon.svg` pour 48/128 px, `icon-32.svg`, `icon-16.svg`) et leurs PNG.

Limites : les événements survenus avant l'ouverture de la page de jeu (ex. rechargement de la page en plein match) ne sont pas rattrapés ; la liste adverse est un minimum (uniquement ce qui a été vu) ; un match supprimé du tableau de bord pendant qu'il se joue n'est plus suivi ; le deck attribué à un match est celui du siège de sa table, sinon le dernier deck choisi dans les 6 heures. Un match enregistré sans deck (ou avec le mauvais) se corrige dans son détail avec le sélecteur « Mon deck », qui propose tous les decks vus sur le site ; ce choix est gardé à part (`note:<matchId>`) et prime sur l'attribution automatique.

## Test

```bash
node test/replay.test.js && node test/meta.test.js && node test/coach.test.js && node test/hook.test.js
```

Le premier rejoue une vraie séquence de messages capturée (Bo3 contre l'IA) et vérifie la fiche produite et les décisions enregistrées ; le deuxième vérifie la reconnaissance du deck adverse sur un métagame réduit ; le troisième vérifie les features du coach et la parité entre le modèle Python et son exécution en JS. Le harnais Puppeteer est dans `test/harness/`.

## Publication (Chrome Web Store)

`./release.sh` construit `dist/endstep-tracker-<version>.zip` avec les seuls fichiers d'exécution (ni tests, ni `decks/`) ; ce zip sert aussi pour Edge. `./release.sh firefox` produit la variante Firefox (manifest réécrit : page d'événement au lieu du service worker, bloc `browser_specific_settings.gecko`, déclaration « aucune collecte de données »), à déposer sur addons.mozilla.org. Les textes de la fiche, les justifications de permissions et les captures à téléverser sont dans `store/` ; la politique de confidentialité à déclarer est [`PRIVACY.md`](PRIVACY.md). La version store ne contient pas le Coach : `release.sh` écarte `coach.js` et `coach-model.json` et retire leur balise du dashboard, qui masque alors le bloc Coach. Le store refuse un zip dont la version existe déjà : incrémenter `version` dans `manifest.json` avant chaque envoi.
