---
target: dashboard de l extension
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-09-24T12-31-55Z
slug: dashboard-html
---
Method: dual-agent (A: revue design · B: détecteur + navigateur)

## Design Health Score: 26/40, acceptable

| # | Heuristique | Note | Problème clé |
|---|---|---|---|
| 1 | Visibilité de l'état | 3 | Le bilan ne dit jamais sur quoi il porte ; seul « 3 matchs sur 7 » révèle que la puce de format par défaut masque 4 matchs. |
| 2 | Correspondance au monde réel | 3 | Vocabulaire MTG juste ; aucun split G1 / G2-G3, alors que c'est la question main deck contre side. |
| 3 | Contrôle et liberté | 3 | Réinitialiser, facette et lignes fonctionnent ; éteindre la dernière puce de format affiche tout. |
| 4 | Cohérence et standards | 2 | Puces multi-choix au même style que les choix uniques ; le filtre deck n'a pas de facette, l'adversaire si. |
| 5 | Prévention des erreurs | 2 | Le filtre Défaites produit des stats absurdes ; les échantillons de 1 match s'affichent en 0 % ou 100 % pleins. |
| 6 | Reconnaissance plutôt que rappel | 3 | Lignes cliquables révélées seulement par une infobulle ; légende en bas de liste. |
| 7 | Flexibilité et efficacité | 2 | `/`, recherche par carte vue, filtres croisés ; pas de tri des matchups, pas de navigation clavier, pas de comparaison de versions. |
| 8 | Esthétique et minimalisme | 3 | Calme et cohérent ; hiérarchie plate, colonnes Mon deck et Format redondantes pour un joueur mono-deck. |
| 9 | Récupération d'erreur | 3 | Erreur d'import explicite, état vide filtré avec bouton de retour. |
| 10 | Aide et documentation | 2 | Bon onboarding ; rien n'explique la confiance de reconnaissance ni le tag pointillé. |

## Verdict de spécificité
Les détails sont propres au produit : pastilles par game avec résultat, play/draw et M1 ; pips de couleur ; archétype reconnu en pointillé contre confirmé en plein. La composition est un dashboard analytique générique : en-tête, filtres, KPI, deux ventilations, tableau. La page est organisée autour de l'historique ; « mon deck contre le field » n'arrive qu'au troisième panneau, mélange tous les decks et ignore le split G1 / après side.
Détecteur : la CLI nue a rendu 0 faute de parseurs ; avec parseurs, 5 constats par fichier (ombre large sur couche flottante ×2, police sur-utilisée, hiérarchie typographique plate 12/13/14/20 px, point pulsant). Dans le navigateur, en plus : noms d'archétypes tronqués (32 px à 1280, 96 px à 430), ligne `.detail-meta` à ~178 caractères. Faux positifs : point pulsant (indicateur live légitime, coupé en reduced-motion), police (Roboto n'est qu'un repli, SF est rendu), ombres (menu et toast flottants). Accord fort entre les deux évaluations sur la hiérarchie plate et la troncature.

## Problèmes prioritaires
1. [P1] La page commence par l'historique, pas par les décisions de deck. Fix : bloc « Mon deck contre le field » en tête, deck par défaut le plus joué, tableau par archétype avec n, matchs, G1, G2-G3, play, draw ; bilan réduit à une ligne ; historique en second.
2. [P1] Échantillons malhonnêtes. 100 % ou 0 % pleins sur 1 match ; W–L masqué sous 560 px. Fix : n toujours visible, pourcentage estompé ou remplacé par des points W/L sous un seuil, archétypes rares regroupés en « Autres ».
3. [P1] Le filtre de résultat réécrit les stats. Fix : Tous/Victoires/Défaites ne filtre que la liste ; ligne de portée au-dessus des stats.
4. [P2] Modèle de filtres incohérent et en partie invisible. Fix : une ligne de portée unique et effaçable (deck, format, période, adversaire), style distinct pour les puces multi-choix, pas de sélection vide.
5. [P2] Le coup d'œil à 430 px ne marche pas. Le match en cours est à ~1060 px de haut, le toast se tasse sur 4 lignes et capte les clics, les liens de cartes de la chronologie font 17 px de haut. Fix : vue « en jeu » dédiée (popup ou incrustation) plutôt que le dashboard compressé.

## Personas
- Grinder classé mono-deck : colonnes redondantes, versions de liste confondues, pas de G1 / G2-G3, pas de tri par win rate, archétypes tronqués, filtre Défaites trompeur.
- Nouvel installé depuis le store : toasts « métagame Vintage » après un match sans banlist contre le bot, 0 % rouge au premier match, « Importer une analyse… » incompréhensible, lignes cliquables qui ont l'air statiques.
- Joueur en plein match, fenêtre de 430 px : match en cours sous la ligne de flottaison, W–L masqués, toast au milieu, rien sur son bilan contre cet archétype, champs d'édition avant le déroulé de la partie.

## Observations mineures
Toast qui capte les clics ; restes du Coach dans la version store (« Importer une analyse… », « Mes décisions ») ; bilan qui compte les games d'un match en cours mais pas le match ; lignes « Inachevé 0–0 » pleine hauteur ; sélecteur de langue dans l'en-tête ; suggestion d'archétype sous un champ vide au placeholder hors sujet ; légende loin des pastilles.

## Questions
1. Et si le dashboard s'ouvrait sur ton deck, dans ton format, et que l'historique venait ensuite ?
2. Et si G1 et G2-G3 étaient deux colonnes partout ?
3. Et si le tracker repérait les changements de liste et coupait les stats à chaque version ?
4. Et si un taux n'avait pas de pourcentage tant qu'il n'a pas assez de games ?
5. Et si la vue étroite était un vrai compagnon de partie, avec un récap « ce soir 4–2 » comme fin de session ?
