# Journal des modifications

Les modifications visibles d'**Endstep Tracker** dans les versions des stores. Le Coach n'est pas dans les stores : son avancement est dans les fichiers `COACH-GOAL*.md`.
Les releases sont numérotées **`X.Y`** et taguées `vX.Y` ; entre deux releases, les builds de dev se lisent **`X.Y.Z`**, `Z` monté à chaque lot testé. Les quatre stores (Chrome, Edge, Firefox, Safari) publient la même release en même temps (voir `store/STORE.md`).

## [Non publié]

### Ajouté

- **Safari** : paquet (`./release.sh safari`) et app macOS pour le Mac App Store.
- **Popup** de la barre d'outils : le match en cours avec mon bilan contre cet adversaire et mon plan de side, sinon la session.
- **Panneau sur endstep.cc** : entre deux games, le matchup et le plan de side ; après le match, le résultat et l'archétype reconnu à confirmer. Se coupe depuis la popup.
- **Tableau de bord** : bandeau de session, guide des matchups avec son panneau, plans de side par deck et archétype.
- G1 et G2-G3 séparés sur chaque bilan ; versions de liste d'un deck, avec comparaison.
- Filtre des formats en puces (plusieurs à la fois, le plus joué par défaut) ; « Sans banlist » pour le constructed sans format.
- **Duel Commander** : l'archétype adverse est le nom de son commandant.
- **Deck Compare** en encart dans le tableau de bord, après les matchups : sur Chrome et Edge (là où il est publié), et seulement s'il n'est pas déjà installé. Fermé, il revient à la release suivante avec une nouveauté de Deck Compare.

### Modifié

- Les matchs contre l'IA du site restent dans l'historique (étiquette « IA ») mais ne comptent plus dans aucun bilan.
- Le tableau de bord part de mon deck : les matchups d'abord, le résultat et la recherche dans l'historique.
- Les couleurs adverses viennent des sorts lancés, plus de toutes les cartes vues.
- Popup : le bouton « Ouvrir le tableau de bord » passe en bas, sur toute la largeur.
- Les pages ne chargent plus les journaux de décisions à l'ouverture : popup, panneau et tableau de bord restent rapides quand l'historique grossit.
- Versions minimales : Chrome 130, Firefox 143, Safari 18.4.

### Retiré

- Le menu « Tous mes decks » : cliquer sur la ligne d'un deck filtre déjà par deck.

## [0.8.1] (2026-09-23)

Dernière release taguée avant ce journal.
