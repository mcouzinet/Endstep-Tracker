# Endstep Tracker : notes de développement

Le [README](../README.md) présente l'extension ; ce fichier garde le détail du fonctionnement, des tests et de la publication.

Extension Chrome (Manifest V3, sans dépendance) qui enregistre automatiquement tes matchs sur [endstep.cc](https://endstep.cc).

## Installation

Depuis les stores : [Chrome Web Store](https://chromewebstore.google.com/detail/endstep-tracker/ioeffckengdfapnapdbphkbnnnnaajho) (aussi pour Brave et Opera), [Firefox](https://addons.mozilla.org/en-US/firefox/addon/endstep-tracker/), [Edge](https://microsoftedge.microsoft.com/addons/detail/endstep-tracker/oloikebkijkmhlodohfbjbekkmghblbp), [Safari sur Mac](https://apps.apple.com/us/app/endstep-tracker/id6816954721?mt=12).

Pour soutenir le projet : [Buy me a coffee](https://buymeacoffee.com/mcouzinet).

Depuis ce dossier, pour le développement :

1. `chrome://extensions` → activer **Mode développeur**
2. **Charger l'extension non empaquetée** → sélectionner ce dossier
3. Recharger les onglets endstep.cc déjà ouverts. Pendant un match, l'icône affiche un badge **REC**.
4. Clic sur l'icône → popup : le match en cours (archétype adverse, mon bilan contre lui) ou la session, et le bouton du tableau de bord (historique, stats, exports).

Après une modification du code : bouton ↻ de l'extension dans `chrome://extensions`. Les onglets endstep.cc ouverts sont rattachés automatiquement (`background.js` réinjecte le traqueur et `hook.js`, qui survit dans la page, lui rejoue ce qu'il a manqué depuis le dernier état complet de la partie).

## Ce qui est enregistré

Par match : date, format (classé ou non, Bo1/Bo3), adversaire, mon deck (nom + liste), score, résultat, et mon side entre les games : le main deck que je soumets pour chaque game après la première (`mains`, par numéro de game ; celui de la game 1 vient du même écran de side, qui le montre en premier).

Par game :
- play/draw, qui a gagné le toss
- mulligans des deux joueurs, ma main de départ gardée
- vainqueur, raison de fin (concession…), nombre de tours, PV finaux, durée
- cartes adverses vues (sorts, terrains, cimetière, exil, cartes révélées) avec le nombre max d'exemplaires vus, couleurs (celles des sorts lancés uniquement : une carte défaussée puis renvoyée en jeu sans être lancée, comme Sneaky Snacker, ne colore pas le deck)
- cartes jouées tour par tour (moi et l'adversaire) et journal complet
- mes cartes piochées (`drawn`) : celles passées dans ma main à partir du tour 1 (les mains mulliganées n'en font pas partie), plus celles que j'ai jouées

Dans le tableau de bord (clic sur l'icône) :
- trois onglets sous la barre de filtres et le résumé, communs aux trois : Matchups (le guide des matchups, les bilans selon le contexte et mes decks), Mes cartes et Historique ; l'onglet ouvert est gardé, un clic sur un match (résumé, panneau du matchup, pastille du match en cours) ouvre l'Historique, `/` y mène directement, et les flèches, Début et Fin passent d'un onglet à l'autre ;
- en tête, le deck analysé : par défaut mon deck le plus joué sur 30 jours, sinon un autre deck, tous les decks d'un format ou tous mes decks (menu groupé par format) ; la période et un archétype adverse s'y ajoutent, et toutes les stats portent sur cette portée ;
- le format d'un match vient du site ; quand le site ne l'a pas donné, il est déduit du deck joué (s'il correspond au type de partie : un deck Duel Commander ne nomme pas une partie constructed), sinon le match est en « Format inconnu », jamais en faux « Sans banlist » ;
- tous les bilans se comptent en matchs, jamais en games : le play/draw et le mulligan d'un match sont ceux de sa première game ; matchups par archétype adverse (un clic sur une ligne filtre), résultats au play / à la draw, avec ou sans mulligan ; sous 5 résultats, pas de pourcentage mais un point par résultat, et au-delà de 20 archétypes, les suivants se regroupent en « Autres » ; le match en cours ne compte pas ;
- en haut, un résumé : le taux de victoire en grand (en matchs, pas de pourcentage sous 5 matchs), le bilan sur le play, sur la draw, les mulligans et la durée par match, et les 20 derniers résultats (un carré vert par victoire, rouge par défaite ; au survol, la fiche du match : résultat, adversaire, archétype, mon deck, format, date ; un clic l'ouvre) ;
- le guide des matchups : bilan en matchs, sur le play et sur la draw, tri par fréquence, pire ou meilleur d'abord (un taux sur moins de 5 matchs ne passe jamais en tête) ; un clic ouvre le panneau du matchup : le crayon renomme l'archétype sur tous les matchs classés sous lui, tous decks et formats (après confirmation ; un nom déjà utilisé fusionne les deux), ses bilans par version, les cartes vues chez lui avec leur fréquence, ses matchs, et un bouton pour filtrer la page sur lui ; `j` / `k` parcourent les lignes, Échap ferme le panneau ;
- les matchs contre l'IA du site (Forge AI, Auto-Pilot), que le site signale dans les participants du match, restent dans l'historique avec une étiquette « IA » mais ne comptent dans aucun bilan : ni matchups, ni session, ni popup, ni panneau, ni portée par défaut ;
- versions de la liste : quand le main deck enregistré d'un deck change, une nouvelle version commence (les retouches de side ne comptent pas) ; la portée montre toutes les versions par défaut ; choisir une version dans le menu montre les cartes ajoutées et retirées depuis la précédente, un bouton pour mettre le bilan de la précédente à côté de chaque matchup, et un menu pour les autres versions ou toutes ;
- historique des matchs, avec sa recherche (adversaire, archétype, carte vue, note — touche `/`) et son filtre victoires/défaites, qui ne changent que la liste ;
- « Mes cartes », quand un seul deck est en vue : pour chaque carte, le taux de victoire des games où je l'ai piochée (main de départ comprise), celui des games où elle est restée dans ma bibliothèque et celui des games où elle était dans ma main de départ ; l'écart en points entre les deux premiers classe la liste dès que chacun a 5 games. Un clic sur l'en-tête d'une colonne (Carte, Écart, Piochée, Pas piochée, Main de départ) trie par elle, un second inverse ; un taux sur moins de 5 games ne passe jamais devant ; le tri est gardé. Compté en games (une carte se pioche dans une game) ; une game après side compte avec le main deck que j'avais soumis. Les cartes piochées sont enregistrées depuis la 1.1 : les games plus anciennes ne comptent que pour la main de départ ;
- dans le panneau du matchup, mon side après la game 1 contre cet archétype : les cartes que je fais entrer et sortir, avec leur nombre d'exemplaires habituel et la part des matchs où je l'ai fait ;
- détail de chaque match : cartes adverses vues (aperçu de la carte au survol), main de départ, mon side pour chaque game après la première, cartes jouées tour par tour, journal, archétype adverse et notes ;
- menu « Données » : export JSON (sauvegarde), export CSV (une ligne par game, avec mes cartes piochées et mon side), import, tout effacer.

Seules les informations publiques (visibles en jeu) sont enregistrées. Tout reste en local (`chrome.storage.local`) ; seul l'aperçu au survol charge l'image de la carte depuis Scryfall.

## Pendant la partie

- **Importer mes anciens matchs** (menu Données, `hook.js`, `fromHistory` dans `tracker.js`) : le bouton ouvre ma page [Historique](https://endstep.cc/history) et arme l'import (clé `historyImport`, 30 min après la dernière page lue, ou jusqu'à « Terminer » dans le panneau, qui compte les matchs lus et ajoutés) ; sans lui, parcourir l'historique n'importe rien. Pendant l'import, les matchs que l'extension n'a pas enregistrés (joués avant elle, ou dans un autre navigateur) s'ajoutent, 25 par page chargée : date, adversaire, format, classé, score, résultat, deck par son nom. La première page est celle que le site charge ; les suivantes, l'extension les demande une par seconde en rejouant la requête du site avec le curseur suivant (`hook.js`, les en-têtes ne quittent pas la page), jusqu'à la dernière ou « Terminer ». Sans détail de games, ils comptent dans les bilans par deck et par format mais pas dans le play/draw, les mulligans ni Mes cartes. Un match supprimé du tableau de bord ne revient pas (clé `deletedMatches` : son id, et de quoi reconnaître son jumeau dans l'historique ; « Tout effacer » la vide). Un match déjà enregistré n'est jamais remplacé ni ajouté une seconde fois : l'historique lui donne un autre id, il est reconnu à son adversaire, son résultat et son heure (`historyDuplicates` dans `shared.js`, aussi appliqué au chargement du tableau de bord).
- **Panneau sur endstep.cc** (`overlay.js`) : pendant une game, une pastille « REC · session 4–2 » ; entre deux games, il se déplie sur l'adversaire, l'archétype reconnu, « Déjà croisé » quand j'ai déjà joué ce joueur (mon bilan contre lui et ce qu'il jouait la dernière fois, reconnu à son nom en jeu ou à son compte, `metBefore` dans `shared.js`), mon bilan contre lui avec ce deck et mon side habituel contre lui (tiré des matchs précédents) ; après le match, le résultat et l'archétype à confirmer en un clic. Le crayon à côté de l'archétype permet de le corriger (mêmes suggestions que le tableau de bord). Il se replie d'un clic, se déplace à la souris (la place est gardée), ne prend le focus clavier que dans ce champ, dont les touches ne vont pas au jeu (sinon Espace passerait la priorité), et vit dans un shadow root fermé. Il suit la langue du navigateur. Il se coupe depuis la popup.
- **Popup de l'icône** (`popup.html`) : la même chose pendant un match (le side habituel en Bo3), la session sinon, et le bouton du tableau de bord.
- La reconnaissance d'archétype du panneau et de la popup utilise le métagame mis en cache par le tableau de bord : ouvrir le tableau de bord une fois suffit à le charger.

## Reconnaissance du deck adverse

Le tableau de bord reconnaît le deck adverse à partir des cartes vues, grâce au métagame public d'endstep.cc (`/api/metagame/v1`) : pour chaque archétype, le site publie la liste des cartes et leur taux de présence. Le score est un classement bayésien naïf (part de métagame × taux de présence de chaque carte vue) ; en dessous de 60 % de certitude, ou avec moins de 2 cartes non-terrain, rien n'est proposé. Le nom reconnu s'affiche en pointillés dans la liste (le survol donne la certitude et les cartes décisives) et dans le détail, avec un bouton « Utiliser » pour le confirmer ; un archétype saisi à la main a toujours priorité. Chaque match est comparé aux archétypes d'un seul format : le sien quand le site le suit (Modern, Pauper, Legacy, Premodern, Vintage, Duel Commander…), sinon (casual, freeplay, détails du match manqués) celui de mon deck ; sans l'un ni l'autre, pas de reconnaissance. Les données sont chargées au besoin (environ une requête par archétype, 100 au plus par format), mises en cache 7 jours dans `chrome.storage.local` (clé `meta`). Le chargement ménage le site : il reste sous sa limite (300 requêtes par minute) avec une marge, attend la fin de la fenêtre sur un 429, ne demande pas les archétypes de moins de 4 joueurs (le site ne publie pas leur liste), ignore une archétype refusée et arrête tout sur une erreur serveur ; un seul onglet du tableau de bord charge à la fois. Les archétypes trop rares ne peuvent donc pas être reconnus.

En Duel Commander, l'archétype adverse est le nom de son commandant (« A + B » pour des partenaires), lu dans sa zone de commandement au début de la partie : il vaut comme un archétype confirmé, sans passer par le métagame. Un archétype saisi à la main reste prioritaire, et mon deck garde son nom.

## Coach (bêta)

En développement seulement, l'extension enregistre aussi chacune de mes décisions (invite du moteur, options proposées, choix, plateau). Le détail d'une game affiche alors « Mes décisions » et un bloc **Coach** : pour chaque décision, la probabilité de victoire avant et après (le plateau à la décision suivante, réponse adverse comprise), et les chutes nettes signalées comme erreurs probables (≤ −15 points) ou grosses erreurs (≤ −30).

**Où vit le coach.** Tout le coach est dans le dépôt séparé `Endstep-coach` (dossier `extension-coach/` pour la partie tableau de bord : `coach.js`, `coach-ui.js`, le modèle et la table de cartes ; `bot/` pour Forge, le serveur local, l'entraînement). `Endstep-coach/extension-coach/install.sh` copie ces fichiers à côté de `dashboard.js`, où git les ignore ; le tableau de bord les charge s'ils sont là et fonctionne sans eux. Les builds des stores n'en contiennent jamais : `release.sh` retire aussi le code marqué `// dev-only {` … `// } dev-only` (le chargement du coach, la capture de mes actions hors side, le journal « Mes décisions ») et refuse un paquet qui mentionne encore le coach. Le mode d'emploi (analyser un match, expliquer une décision, clés, limites) est dans le README de ce dossier.

## Langues

L'interface existe en français et en anglais : elle suit la langue de Chrome, et un sélecteur dans l'en-tête permet de forcer l'une ou l'autre. Les textes sont dans `_locales/en/messages.json` et `_locales/fr/messages.json` (le manifest utilise les mêmes fichiers). Pour ajouter une langue : copier `_locales/en`, traduire, puis l'ajouter à `LANGS` dans `shared.js`.

## Fonctionnement

- `hook.js` s'exécute dans la page avant le code d'Endstep et observe le WebSocket (`GAME_STATE`, `GAME_DELTA`, `GAME_EVENT`, `GAME_OVER`…) ainsi que quelques réponses `fetch` (noms de decks, format du match).
- `tracker.js` transforme ces messages en fiche de match (logique pure, testée).
- `content.js` persiste les fiches (et mes décisions sous `dec:<matchId>`) ; `dashboard.html` les affiche ; `meta.js` reconnaît le deck adverse ; `coach.js` évalue les décisions.
- `shared.js` : ce que le tableau de bord, la popup et le panneau calculent de la même façon (noms de deck et de format, clé d'archétype, sessions, bilans, reconnaissance, textes) ; `theme.css` : palette et composants communs au tableau de bord et à la popup ; `popup.js` ; `overlay.js`.
- `icons/` : sources SVG des icônes (`icon.svg` pour 48/128 px, `icon-32.svg`, `icon-16.svg`) et leurs PNG.

Limites : les événements survenus avant l'ouverture de la page de jeu (ex. rechargement de la page en plein match) ne sont pas rattrapés ; la liste adverse est un minimum (uniquement ce qui a été vu) ; un match supprimé du tableau de bord pendant qu'il se joue n'est plus suivi ; le deck attribué à un match est celui du siège de sa table, sinon le dernier deck choisi dans les 6 heures. Un match enregistré sans deck (ou avec le mauvais) se corrige dans son détail avec le sélecteur « Mon deck », qui propose tous les decks vus sur le site ; ce choix est gardé à part (`note:<matchId>`) et prime sur l'attribution automatique.

## Test

```bash
node test/replay.test.js && node test/meta.test.js && node test/hook.test.js && node test/commander.test.js && node test/ai.test.js && node test/records.test.js && node test/format.test.js && node test/cards.test.js && node test/history.test.js && node test/met.test.js && node test/feedback.test.js
```

Le premier rejoue une vraie séquence de messages capturée (Bo3 contre l'IA) et vérifie la fiche produite et les décisions enregistrées ; le deuxième vérifie la reconnaissance du deck adverse sur un métagame réduit ; les suivants vérifient que le commandant adverse nomme l'archétype en Duel Commander, que les matchs contre l'IA ne comptent dans aucun bilan, que les bilans se comptent en matchs, sur le play ou sur la draw selon la première game, et que le format d'un match reste juste quand le site ne l'a pas donné. Le harnais Puppeteer est dans `test/harness/`.

## Publication (Chrome, Edge, Firefox, Safari)

`./release.sh` construit `dist/endstep-tracker-<version>.zip` avec les seuls fichiers d'exécution (ni tests, ni `decks/`) ; ce zip sert aussi pour Edge. `./release.sh firefox` produit la variante Firefox (manifest réécrit : page d'événement au lieu du service worker, bloc `browser_specific_settings.gecko`, déclaration « aucune collecte de données »), à déposer sur addons.mozilla.org. `./release.sh safari` prépare `dist/safari/`, que référence l'app macOS du projet Xcode `safari/` à archiver pour le Mac App Store (détails dans `store/STORE.md`). Les textes de la fiche, les justifications de permissions et les captures à téléverser sont dans `store/` ; la politique de confidentialité à déclarer est [`PRIVACY.md`](../PRIVACY.md). La version store ne contient pas le Coach : `release.sh` écarte `coach.js` et `coach-model.json` et retire leur balise du dashboard, qui masque alors le bloc Coach. Versions : `X.Y` pour une release, publiée sur les quatre stores en même temps, `X.Y.Z` pour les builds de dev entre deux releases (`Z` monte à chaque lot testé) ; ce qui attend la prochaine release est dans [`CHANGELOG.md`](../CHANGELOG.md), la procédure dans `store/STORE.md`.
