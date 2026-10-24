# Journal des modifications

Les modifications visibles d'**Endstep Tracker** dans les versions des stores. Le Coach n'est pas dans les stores : son avancement est dans les fichiers `COACH-GOAL*.md`.
Les releases sont numérotées **`X.Y`** et taguées `vX.Y` ; entre deux releases, les builds de dev se lisent **`X.Y.Z`**, `Z` monté à chaque lot testé. Les quatre stores (Chrome, Edge, Firefox, Safari) publient la même release en même temps (voir `store/STORE.md`).

## Non publié

### Ajouté

- **Exporter mon plan de side** (1.5.5, menu Données, avec un deck choisi) : « Copier mon plan de side » met dans le presse-papiers un texte à coller dans Discord ou dans ses notes, un bloc par archétype adverse (le plus rencontré d'abord) avec les cartes entrées et sorties (+2 Kor Firewalker, −4 Lava Spike) ; « Exporter mon plan de side (CSV) » donne le même plan pour un tableur, une ligne par carte. Les deux suivent la période et la version de liste affichées.
- **Colonne « Plus tard » dans « Carte par carte »** (1.5.2) : les games où la carte est arrivée en cours de partie, sans être dans la main de départ. Avec « Main de départ », elle détaille « Piochée » : une carte qui gagne quand elle est là dès le début et perd quand elle arrive tard se lit d'un coup d'œil. Triable comme les autres colonnes.

### Modifié

- **Le nombre de matchs sur le play et sur la draw** (1.5.4) : dans le bandeau du haut, « Sur le play (7) » et « Sur la draw (18) », sans avoir à additionner le bilan.
- **Un ⓘ à côté du titre de chaque tableau** (1.5.3) : le bandeau du haut, Mes decks, Par archétype adverse, Selon le contexte et Carte par carte. Un clic, ou un toucher sur téléphone, ouvre une courte explication de ce que compte le tableau (par exemple Piochée = Main de départ + Plus tard) ; un second clic, un clic ailleurs ou Échap la referme. Les phrases grises sous les titres disparaissent, l'explication les remplace.
- **Toutes les cartes dans « Carte par carte »** (1.5.1) : la liste n'est plus coupée après 15 cartes avec un « N autres cartes » à déplier ; un deck de Duel Commander montre ses 100 cartes, triables par colonne comme avant.

## [1.5] (2026-10-21)

Safari sur iPhone et Firefox pour Android, des statistiques d'usage anonymes, « Mes decks » en tête des Matchups et la part des matchs commencés sur le play.

### Ajouté

- **Safari sur iPhone** : la même extension, dans une app iPhone qui explique comment l'activer (Réglages › Apps › Safari › Extensions, puis endstep.cc sur « Autoriser »). Une seule fiche App Store pour le Mac et l'iPhone. Les matchs restent sur l'appareil où ils sont joués : une sauvegarde exportée puis importée les réunit (sur iPhone, l'export passe par le menu de partage : Enregistrer dans Fichiers, AirDrop…). Il faut jouer dans Safari : les extensions ne tournent pas dans endstep ajouté à l'écran d'accueil.
- **Firefox pour Android vérifié** : popup, tableau de bord, panneau sur endstep.cc, import de l'historique et sauvegarde fonctionnent. AMO y proposait déjà l'extension.
- **Statistiques d'usage anonymes** : l'extension signale son installation, ses mises à jour, un jour d'utilisation (au plus une fois par jour, avec un identifiant aléatoire qui ne sert qu'à compter chaque appareil une fois) et sa désinstallation (une courte page s'ouvre). Jamais de match, de deck, de nom ni de page visitée ; pas d'adresse IP gardée. Se coupe dans le menu Données du tableau de bord ; sur Firefox, seulement avec l'accord donné à l'installation ou depuis ce menu. Politique de confidentialité mise à jour.
- **Part sur le play** : dans le bandeau du haut, la part des matchs commencés sur le play (première game), quel que soit le résultat, à côté des bilans sur le play et sur la draw ; le détail (par exemple 15 matchs sur 28) au survol.

### Modifié

- **« Mes decks » en tête de l'onglet Matchups** : quand « Tous mes decks » est choisi (un format ou tous), le bilan de chaque deck passe au-dessus des archétypes adverses au lieu d'être en bas de l'onglet. Il disparaît toujours dès qu'un deck est choisi.

### Corrigé

- **Le menu Données sur Safari** : avant Safari 26, il s'ouvrait dans le coin de la fenêtre au lieu de sous son bouton, et sur un téléphone il pouvait sortir de l'écran. Il s'ouvre maintenant sous le bouton, toujours en entier.
- **La popup sur téléphone** : sur Firefox pour Android, elle s'affichait en tout petit (rendue comme sur un écran d'ordinateur puis réduite). Elle prend maintenant la largeur de l'écran, sur Android comme sur iPhone.

## [1.4] (2026-10-08)

Plusieurs onglets et plusieurs ordinateurs sans copies à moitié vues, des sauvegardes qui fusionnent, les matchs incomplets réparés, et Whozic à côté de Deck Compare.

### Ajouté

- **Whozic à côté de Deck Compare** : en haut du tableau de bord, une seconde carte présente Whozic, le jeu de soirée musical du même auteur. Chacune se ferme séparément, jusqu'à la version suivante ; l'autre prend alors toute la largeur. Absente sur Safari.
- **Alerte d'accès au site** (popup et tableau de bord) : si le navigateur ne donne endstep.cc à l'extension qu'après un clic sur son icône, elle ne s'active qu'en cours de partie et n'enregistre les matchs qu'à moitié (sans format, sans deck, sans début de partie). Un bandeau le dit, avec un bouton « Autoriser sur endstep.cc » ; une fois l'accès donné, les onglets endstep.cc ouverts sont repris aussitôt.
- **Matchs incomplets réparés par l'import de l'historique** : un match enregistré à moitié reçoit ce que l'historique d'endstep connaît (format, deck, classé ou non, résultat et score s'il manquait). En Duel Commander, le format retrouvé fait revenir le commandant adverse. Le panneau compte ces matchs complétés, et leur détail le signale.
- **Donner un avis, signaler un bug** (menu Données du tableau de bord, et la popup) : ouvre un court formulaire, sans compte, qui sait déjà ta version, ton navigateur et ta langue. Rien n'est envoyé sans ce clic.

### Corrigé

- **Plusieurs onglets ou plusieurs ordinateurs** : endstep envoie chaque partie à tous les onglets ouverts du compte, même sur un autre ordinateur, et l'extension l'enregistrait dans chacun. Un onglet qui ne faisait que la recevoir en écrivait une copie à moitié vue (sans début de partie, ni format, ni deck), qui pouvait passer pour une perte de données. Désormais, seul l'onglet où l'on joue (celui qui envoie des actions) enregistre le match.
- **Importer une sauvegarde fusionne** au lieu d'écraser : un match présent des deux côtés garde sa copie la plus complète, complétée par l'autre, et les notes saisies ici restent. On peut ainsi réunir les données de deux ordinateurs.
- **Duel Commander reconnu même sans les détails du match** : quand l'extension s'éveille après le chargement de la page (accès au site « au clic »), elle manque les détails du match, donc son format. Le jeu lui-même dit pourtant qu'il s'agit de Duel Commander : le format et le commandant adverse s'affichent de nouveau, y compris pour les matchs déjà enregistrés.
- **Le nettoyage des doublons ne perd plus rien** : quand un match importé de l'historique double un match enregistré en direct, le tableau de bord gardait l'enregistré et jetait l'importé, même quand l'enregistré était incomplet. Format, deck et résultat pouvaient ainsi disparaître. L'enregistré reprend désormais ce qui lui manque avant que le doublon soit retiré.

## [1.3] (2026-10-05)

Aux couleurs du nouveau endstep.cc, avec les adversaires déjà croisés dans le panneau, les archétypes renommés partout, « Mes cartes » triable par colonne, et les matchs supprimés qui le restent.

### Ajouté

- **« Offre-moi un café »** : un lien vers https://buymeacoffee.com/mcouzinet dans la popup et en haut du tableau de bord, comme dans Deck Compare. Absent sur Safari, où Apple refuse les liens de don.
- **Adversaire déjà croisé** (panneau sur endstep.cc) : quand tu retrouves un joueur que tu as déjà affronté, le panneau affiche ton bilan contre lui et ce qu'il jouait la dernière fois. Il est reconnu à son nom en jeu ou à son nom de compte, donc aussi dans les matchs importés de l'historique.
- **Renommer un archétype partout** (panneau du matchup, le crayon à côté du nom) : le nouveau nom s'applique à tous les matchs classés sous cet archétype, tous decks et formats confondus, après confirmation. Un nom déjà utilisé fusionne les deux archétypes.
- **Trier « Mes cartes »** : un clic sur l'en-tête d'une colonne (Carte, Écart, Piochée, Pas piochée, Main de départ) trie la liste par elle, un second clic inverse l'ordre. Comme pour les matchups, un taux calculé sur moins de 5 games ne passe jamais devant. Le tri choisi est gardé d'une visite à l'autre.

### Modifié

- **Aux couleurs du nouveau endstep.cc** : le panneau sur le site reprend directement le nouveau design d'endstep (ses couleurs, ses polices Archivo et EB Garamond, ses boutons) et suivra ses prochains ajustements. Le tableau de bord et la popup passent à sa nouvelle palette : noir chaud, or ambré.
- **Matchs importés de l'historique** : leur durée est maintenant connue, le site donnant leur heure de fin.

### Corrigé

- **Un match supprimé reste supprimé** : importer à nouveau l'historique ne le fait plus revenir, qu'il ait été importé ou enregistré en direct. « Tout effacer » repart de zéro.

## [1.2] (2026-10-01)

Tes anciens matchs importés depuis l'historique d'endstep.cc, l'archétype corrigé depuis le panneau, et les decks renommés qui gardent leurs matchs.

### Ajouté

- **Importer mes anciens matchs** (menu Données, et page d'accueil du tableau de bord) : ouvre ta page [Historique](https://endstep.cc/history) sur endstep.cc ; pendant que tu la parcours, les matchs que l'extension n'a pas enregistrés s'ajoutent au tableau de bord (date, adversaire, format, classé ou non, score, résultat, deck). Les pages suivantes se chargent toutes seules, une par seconde, jusqu'à la dernière (ou jusqu'à « Terminer ») ; le panneau compte les matchs lus et ajoutés. Sans ce bouton, parcourir l'historique n'importe rien. Un match que l'extension a déjà enregistré n'est pas ajouté une seconde fois : l'historique lui donne un autre identifiant, il est reconnu à son adversaire, son résultat et son heure (moins de deux heures d'écart). Ils comptent dans les bilans par deck et par format, mais sans le détail des games (pas d'archétype reconnu, ni play/draw, ni mulligans) : l'historique du site ne le garde pas.
- **Corriger l'archétype depuis le panneau sur endstep.cc** : le crayon à côté de l'archétype ouvre un champ avec les mêmes suggestions que le tableau de bord. Entrée enregistre, Échap annule, un champ vide rend le match à la reconnaissance automatique. Pendant la saisie, les touches ne vont pas au jeu (Espace ne passe pas la priorité).

### Corrigé

- **Duel Commander** : l'archétype adverse ne contient plus « + Commander Effect ». Seuls les vrais commandants de la zone de commandement sont retenus, et les matchs déjà enregistrés s'affichent corrigés.
- **Deck renommé sur endstep.cc** : ses matchs, y compris les anciens, passent sous son nouveau nom au lieu de former un deck à part. L'extension reconnaît le deck à son identifiant sur le site, pas à son nom.

## [1.1] (2026-09-29)

Mes cartes, le side enregistré entre les games, un tableau de bord en onglets, et un chargement du métagame qui ménage endstep.cc.

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
