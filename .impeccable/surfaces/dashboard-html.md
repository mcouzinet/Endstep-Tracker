---
slug: dashboard-html
primary_target: dashboard.html
related_targets: ["dashboard.js", "popup.html", "content.js"]
mode: operate
status: implemented 2026-09-24 (lots 1 to 5)
---

# Refonte UX : dashboard, popup, incrustation

Issue de `/impeccable` : init (PRODUCT.md), critique du 2026-09-24 (26/40, 3 P1), shape avec tirage de structure. Structure retenue : **Session d'abord**, cadrée par le deck. Le monde visuel actuel (sombre, or, vert/rouge, pastilles de game) est conservé : la refonte porte sur la structure, les parcours et les états, pas sur l'identité.

## 1. Job et public

Joueurs compétitifs qui grindent le classé sur endstep.cc avec un ou deux decks dans un format. Ils jouent par séries de matchs, puis font le point. Leur question : « comment fait mon deck, contre quoi, et est-ce que mon dernier changement a aidé ? ». Mode Operate : lisibilité, cohérence, confiance dans les chiffres avant l'expression.

## 2. Résultat attendu

- En ouvrant le dashboard, le joueur voit sa session en cours avec **son deck et sa version de liste**, puis ce que la session change à chaque matchup.
- Il sait, pour chaque archétype, son bilan en **G1 (main deck)** et en **G2-G3 (après side)**, au play et à la draw, avec la taille d'échantillon.
- Il sait si sa **version actuelle** fait mieux que la précédente.
- Entre deux games, l'incrustation lui rappelle **son plan de side** contre cet archétype.
- Aucun chiffre ne se présente comme une conclusion sur un échantillon trop petit.

## 3. Direction retenue : Session d'abord, cadrée par le deck

Réconciliation avec la priorité « mon deck en tête » : le deck et sa version cadrent toute la page (ligne de portée en haut), la session est le premier bloc **quand il y en a une**, et le guide des matchups vient juste après. Sans session récente, le bandeau se replie en une ligne (« Dernière session : jeudi, 4–2 ») et le guide des matchups remonte en tête. La page n'est donc jamais vide les jours sans partie.

Ordre de la page :

1. **Ligne de portée.** « Affinity – Esper · v3 (actuelle) · Pauper · 30 jours ». Chaque segment est un menu ou une puce effaçable. Deck par défaut : le plus joué sur 30 jours ; le format suit le deck (les decks sont groupés par format dans le menu), ce qui remplace les puces de format. Un filtre adversaire actif s'y ajoute comme puce. Toutes les stats de la page portent sur cette portée et seulement elle.
2. **Bandeau de session.** « Session en cours · 5–2 · 1 h 40 ». Les matchs de la session en lignes compactes : adversaire, archétype, pastilles G1 | G2 | G3. Un archétype deviné se confirme en un clic ou à la touche Entrée. À droite, « Ce que la session change » : chaque matchup touché, bilan avant et après (« Mono-Red Rally : de 3–5 à 4–5 »).
3. **Guide des matchups.** Une ligne par archétype : n, matchs, G1, G2-G3, play, draw, plan de side. Tri : fréquence (défaut), pire d'abord, meilleur d'abord. Archétypes à moins de 3 matchs regroupés en « Autres (n) », repliés. Un clic ouvre un tiroir latéral : matchs contre cet archétype, cartes vues chez lui (agrégées, avec fréquence), éditeur du plan de side, bilan par version.
4. **Versions.** Au-dessus du guide quand la liste a changé : « v3 depuis le 12/09 : +2 Galvanic Blast, −2 Thoughtcast ». Mode comparaison « v3 contre v2 » : le guide affiche l'écart par matchup.
5. **Contexte de jeu.** Play/draw, main de 7 gardée ou mulligan, chacun en G1 et G2-G3. Le panneau « Bilan » actuel devient une ligne dans la portée.
6. **Historique.** La liste actuelle des matchs, en onglet ou section repliée. Le filtre Tous/Victoires/Défaites vit ici et ne touche que la liste. Colonnes Deck et Format masquées quand la portée n'a qu'un deck.

### Mécanismes transverses

- **G1 / G2-G3 partout.** Chaque bilan se lit en deux sous-bilans. Les matchs en Bo1 ne nourrissent que G1.
- **Versions de liste.** Une version = un main deck enregistré distinct (`myDeck.cards`, sideboard ignoré), numérotée par date d'apparition, calculée à la lecture, sans migration. Les retouches de side ne coupent pas les stats. Match sans liste : « version inconnue ».
- **Chiffres honnêtes.** n toujours visible, y compris en fenêtre étroite. Sous 5 games, pas de pourcentage : des points W/L (●●○) et « trop tôt ». Le bilan « Matchs » ne compte pas le match en cours.
- **Plan de side.** Une note par deck et par archétype, éditable dans le guide et le tiroir, affichée par l'incrustation entre les games. Les notes par match existantes restent.

### Détail d'un match

Réordonné : d'abord l'histoire (games, main de départ, tours, cartes vues), puis l'annotation (archétype pré-rempli par la suggestion, notes), enfin l'administration (deck forcé, suppression) en bas. Le bloc Coach, « Importer une analyse » et « Mes décisions » restent tels quels : périmètre de l'autre chantier.

### Popup de l'icône

Le clic sur l'icône ouvre une popup d'environ 360 px au lieu d'un onglet.

- **Match en cours :** adversaire, archétype reconnu avec sa confiance, ton bilan contre lui (G1 et G2-G3), ton plan de side.
- **Sinon :** la session (bilan, trois derniers matchs) ou la dernière.
- Toujours un bouton « Ouvrir le tableau de bord », qui réutilise l'onglet existant comme aujourd'hui, et un interrupteur pour l'incrustation.

### Incrustation sur endstep.cc

Un élément discret ancré dans un coin, isolé en Shadow DOM, passif.

- **Pendant une game :** une pastille repliée « REC · session 4–2 », qui ne couvre jamais le plateau ni les contrôles.
- **Entre deux games** (fin de game jusqu'au début de la suivante, phase de side) : dépliée d'office sur l'archétype adverse, ton bilan G2-G3 contre lui et ton plan de side.
- **Après le match :** le résultat et la confirmation d'archétype en un clic.
- Elle se replie d'un clic, se désactive depuis la popup, respecte la réduction des animations et n'agit jamais sur le jeu.

## 4. Périmètre et limites

- **Dans le périmètre :** structure du dashboard, ligne de portée, bandeau de session, guide des matchups et tiroir, versions, G1/G2-G3, seuils d'échantillon, historique, détail réordonné, popup, incrustation, textes FR/EN.
- **Hors périmètre :** identité visuelle (palette, typo, composants gardés), Coach et ses restes, format des données enregistrées (tout se calcule à la lecture, seul le plan de side ajoute une clé de stockage).
- **Anti-objectifs :** pas de gamification ni de partage social, pas de cloud, pas de modale d'abord, rien qui agisse sur endstep.cc, pas de disparition de l'historique brut.

## 5. États et volumes

- **Données :** 0 match (onboarding actuel conservé), 1 à 4 matchs (« encore 4 matchs pour tes premières tendances », pas de 0 % rouge), environ 30 (cas de l'auteur), 500 et plus (historique paginé « Afficher plus »).
- **Decks :** 1 à 2 d'habitude, jusqu'à 10. **Versions :** 1 à 10 par deck. **Archétypes :** 5 à 40. **Session :** 1 à 15 matchs.
- **Match sans archétype :** « non tagué » avec ses couleurs, confirmation en un clic. Match inachevé : ligne atténuée, hors bilans.
- **Largeurs :** 1280 px et plus, 430 px (fenêtre à côté du jeu, où la portée se replie derrière un bouton et le guide passe en cartes), popup 360 px.

## 6. Interaction et mise en page

- La portée est la seule source de filtre ; tout ce qui filtre y apparaît comme une puce effaçable.
- Les lignes cliquables ont un état de survol et une flèche d'ouverture explicites.
- Navigation clavier : `/` recherche, j/k dans l'historique et le guide, Entrée ouvre, Échap ferme le tiroir.
- Le toast ne capte plus les clics et se place en bas, pleine largeur en étroit.
- Noms d'archétypes jamais tronqués sous 24 caractères : le libellé passe à la ligne avant d'être coupé.

## 7. Contraintes et décisions ouvertes

**Contraintes :** HTML/CSS/JS sans dépendance ni build ; version store sans Coach ; stockage local ; FR/EN ; aucune nouvelle permission (la popup passe par `action.default_popup` ; le code « réutiliser l'onglet » passe de `background.js` à la popup).

**Décisions prises (2026-09-24) :**
- **Structure :** Session d'abord, cadrée par le deck, validée telle quelle.
- **Nouvelle version de liste :** au changement du main deck seulement.
- **Incrustation à l'installation :** activée et repliée.

**Valeurs par défaut, ajustables à l'implémentation :**
- **Fin de session :** 2 h sans match.
- **Seuil d'échantillon :** 5 games.
- **Position de l'incrustation :** coin inférieur droit ; déplaçable ou non reste à trancher.

## 8. Découpage suggéré

1. Portée unique, deck en tête, chiffres honnêtes, filtre de résultat limité à l'historique (règle les trois P1).
2. G1 / G2-G3 et versions de liste.
3. Bandeau de session, guide des matchups avec tiroir et plan de side.
4. Popup.
5. Incrustation.

Commandes impeccable associées, dans l'ordre : `layout` (hiérarchie et portée), `clarify` (textes : « Selon le contexte », « trop tôt »), `adapt` (430 px, popup, incrustation), `onboard` (premiers matchs), `harden` (volumes, listes manquantes), puis `polish`.
