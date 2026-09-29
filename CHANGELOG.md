# Journal des modifications

Les modifications visibles d'**Endstep Tracker** dans les versions des stores. Le Coach n'est pas dans les stores : son avancement est dans les fichiers `COACH-GOAL*.md`.
Les releases sont numérotées **`X.Y`** et taguées `vX.Y` ; entre deux releases, les builds de dev se lisent **`X.Y.Z`**, `Z` monté à chaque lot testé. Les quatre stores (Chrome, Edge, Firefox, Safari) publient la même release en même temps (voir `store/STORE.md`).

## [Non publié]

### Ajouté

- **Mes cartes** (tableau de bord, un deck en vue) : pour chaque carte, le taux de victoire des games où je l'ai piochée, celui des games où elle est restée dans ma bibliothèque et celui des games où elle était dans ma main de départ, avec l'écart en points. Les cartes piochées s'enregistrent à partir de cette version.
- **Mon side** : le main deck que je soumets entre deux games est enregistré. Le panneau du matchup montre ce que je fais entrer et sortir contre cet archétype, le détail d'un match montre le side de chaque game, et le panneau sur endstep.cc comme la popup rappellent mon side habituel entre deux games.

### Modifié

- **Tableau de bord en trois onglets** : Matchups, Mes cartes, Historique, sous le résumé (taux de victoire, 20 derniers matchs) et la barre de filtres, communs aux trois ; l'onglet ouvert est gardé d'une visite à l'autre, et un clic sur un match ouvre l'Historique. La présentation de Deck Compare passe tout en haut, sous l’en-tête.
- **Lisibilité** : titres de section plus grands (« Par archétype adverse » au lieu de répéter l’onglet, « Carte par carte »), onglets plus visibles, barres « Selon le contexte » à la même échelle que les autres, en-tête sur deux lignes en fenêtre étroite.
- **Reconnaissance des decks** : le chargement du métagame d'endstep.cc respecte la limite du site (300 requêtes par minute) et y laisse une marge : il attend au lieu d'échouer sur « métagame indisponible ». L'adversaire n'est comparé qu'au format de la partie, ou pour une partie libre à celui de mon deck : un seul format chargé (une partie libre en chargeait neuf). Les archétypes dont le site ne donne pas les cartes ne sont plus demandées, une archétype en erreur n'annule plus tout le format, et deux onglets du tableau de bord ne téléchargent plus la même chose.

## [1.0] (2026-09-28)

Première version sur les quatre stores (Chrome Web Store, Edge Add-ons, addons.mozilla.org, Mac App Store).

### Ajouté

- **Safari** : paquet (`./release.sh safari`) et app macOS pour le Mac App Store.
- **Popup** de la barre d'outils : le match en cours avec mon bilan contre cet adversaire, sinon la session.
- **Panneau sur endstep.cc** : entre deux games, le match détecté (adversaire, archétype, mon bilan contre lui) ; après le match, le résultat et l'archétype reconnu à confirmer. Se coupe depuis la popup.
- **Tableau de bord** : un résumé en tête (taux de victoire, bilans, les 20 derniers résultats avec la fiche de chaque match au survol), guide des matchups avec son panneau.
- Versions de liste d'un deck, avec comparaison.
- « Sans banlist » pour le constructed sans format. Quand le site n'a pas donné le format d'un match, il est déduit du deck joué, sinon le match est en « Format inconnu » (plus de faux « Sans banlist »).
- **Duel Commander** : l'archétype adverse est le nom de son commandant.
- **Deck Compare** en encart dans le tableau de bord, après les matchups : sur Chrome et Edge (là où il est publié), et seulement s'il n'est pas déjà installé. Fermé, il revient à la release suivante avec une nouveauté de Deck Compare.

### Modifié

- Tous les bilans se comptent en matchs, jamais en games : le play/draw et le mulligan d'un match sont ceux de sa première game.
- Les matchs contre l'IA du site restent dans l'historique (étiquette « IA ») mais ne comptent plus dans aucun bilan.
- Le tableau de bord part de mon deck : les matchups d'abord, le résultat et la recherche dans l'historique.
- Les couleurs adverses viennent des sorts lancés, plus de toutes les cartes vues.
- Popup : le bouton « Ouvrir le tableau de bord » passe en bas, sur toute la largeur.
- Les pages ne chargent plus les journaux de décisions à l'ouverture : popup, panneau et tableau de bord restent rapides quand l'historique grossit.
- Versions minimales : Chrome 130, Firefox 143, Safari 18.4.

### Retiré

- Le journal « Mes décisions » dans le détail d'une game : l'extension n'enregistre plus tes choix en jeu.
- Le menu « Tous mes decks » : cliquer sur la ligne d'un deck filtre déjà par deck.

## [0.8.1] (2026-09-23)

Dernière release taguée avant ce journal. Le Chrome Web Store publie encore la 0.6.0 : pour ses utilisateurs, cette release apporte aussi tout ce qui a changé depuis.
