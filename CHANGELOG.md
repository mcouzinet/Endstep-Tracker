# Journal des modifications

Les modifications visibles d'**Endstep Tracker** dans les versions des stores. Le Coach n'est pas dans les stores : son avancement est dans les fichiers `COACH-GOAL*.md`.
Les releases sont numérotées **`X.Y`** et taguées `vX.Y` ; entre deux releases, les builds de dev se lisent **`X.Y.Z`**, `Z` monté à chaque lot testé. Les quatre stores (Chrome, Edge, Firefox, Safari) publient la même release en même temps (voir `store/STORE.md`).

## Non publié

### Ajouté

- **La cote de l'adversaire dans les matchs classés** (1.7.2) : sa cote au classement du format, telle qu'au début du match, dès la première game dans le panneau sur endstep.cc, puis à côté de son nom dans l'historique (sa place et le top au survol), et les deux cotes dans le détail du match. L'extension la demande une fois par match classé au site, comme sa fiche de joueur. Seulement pour les matchs joués à partir de cette version.
- **Trier les cartes peu jouées** (1.7.1) : dans « Carte par carte », « Peu jouées » range d'abord les cartes que tu lances ou mets en jeu le moins souvent une fois piochées, avec le pourcentage à côté du nom. Pour repérer celles qui restent en main. Demandé sur le Discord (Sympthom).
- **Comparer à n'importe quelle version** (1.7.1) : le menu « Comparer à… » sous les matchups propose toutes les autres versions de la liste, pas seulement celle d'avant. Les cartes changées s'affichent par rapport à la version choisie.

### Modifié

- **« Carte par carte » montre ta liste actuelle** (1.7.1) : seules les cartes de ta dernière liste (ou de la version choisie) sont listées, et celles que tu as retirées sont repliées en bas. Chaque carte compte toujours toutes les games où elle était dans ton deck. Une carte ajoutée depuis la version d'avant porte la mention « nouvelle ». L'image de tes stats suit la même liste.
- **Les decks par ordre alphabétique** (1.7.1) dans le menu, les formats les plus joués toujours en premier. Demandé sur le Discord (Sympthom).
- **Un tableau de bord plus rapide** (1.7.1) : seul l'onglet affiché se redessine, et la reconnaissance des decks adverses calcule une seule fois par métagame ce qu'elle refaisait pour chaque match (environ 25 fois plus rapide), dans le tableau de bord, la popup et le panneau sur endstep.cc.
- **Moins d'écritures pendant une partie** (1.7.1) : le match n'est plus réécrit en entier à chacune de mes actions (passer, payer, attaquer), seulement à la première, puis au fil des changements de la partie. Le panneau sur endstep.cc ne garde plus le journal des games, qu'il n'affiche pas.

### Corrigé

- **Un match pouvait rester « en cours »** (1.7.1) après une mise à jour de l'extension en pleine partie, si elle se finissait sans autre action de ma part (abandon adverse, létal pendant son tour) : l'onglet sait maintenant qu'il joue ce match dès son retour.
- **Firefox : chaque match pouvait s'enregistrer deux fois** (1.7.1) après une installation ou une mise à jour, Firefox remettant déjà lui-même le traqueur dans les onglets ouverts. Même chose sur Chrome et Edge après une mise à jour du navigateur.
- **Un deck vu dans un autre onglet n'est plus effacé** (1.7.1) : deux onglets endstep.cc ouverts ne réécrivent plus la liste de decks l'un de l'autre, et l'import d'une sauvegarde reprend maintenant les decks qu'elle contient (noms, listes, réserves).
- **Import d'une sauvegarde** (1.7.1) : un match de l'historique du site déjà enregistré ici sous un autre identifiant n'est plus compté deux fois jusqu'au rechargement. Une fiche bizarre (sauvegarde modifiée à la main) ne bloque plus le tableau de bord et ne peut plus y glisser de balisage.
- **Mulligans inconnus** (1.7.1) : une game dont le traqueur n'a pas vu la main de départ ne compte plus comme « garde 7 », ni dans la moyenne de mulligans.
- **Petites corrections** (1.7.1) : la pastille « en direct » d'un match contre l'IA ne remet plus tous les filtres à zéro ; renommer l'archétype filtré garde le filtre ; « Terminer » dans le panneau d'import de l'historique n'est plus annulé par la page en cours de lecture ; un match supprimé ne revient plus après un rechargement de la page ; déplacer le panneau n'est plus interrompu par une mise à jour du match.

## [1.7] (2026-11-05)

Changer le format d'un deck, fusionner deux decks, ranger d'un coup les matchs sans deck, les pools de draft sur une seule ligne, quatre nouvelles langues, et le tableau de bord qui s'ouvre sur ton dernier deck.

### Ajouté

- **Changer le format d'un deck** : sous les filtres, « Changer de format… » fait passer le deck affiché dans un autre format, choisi dans la liste ou écrit à la main (7ph, un format que le site ne connaît pas). Ses prochains matchs dans le format d'origine suivent. La reconnaissance utilise le métagame du nouveau format, et aucun s'il n'en a pas. « Séparer » annule le changement.
- **Fusionner deux decks** : sous les filtres, « Fusionner avec un autre deck… » range tous les matchs du deck affiché sous un autre deck du même format, les prochains compris ; chaque match garde sa liste, qui apparaît comme une version. Pratique pour un deck recréé sous un autre nom ou supprimé du site. « Séparer » défait la fusion. Les fusions sont dans les sauvegardes.
- **Ranger des matchs dans un autre format** : « Fusionner avec un autre deck… » et « Ranger sous ce deck » proposent aussi les decks des autres formats. Choisir l'un d'eux fait passer les matchs affichés dans ce deck et dans son format : des matchs joués en « Sans banlist » avant l'arrivée d'un format sur le site comptent enfin avec ce format. « Séparer » les remet dans leur format d'origine.
- **Ranger d'un coup les matchs sans deck** : sous les filtres, quand « Inconnu » est choisi (des matchs importés de l'historique dont le site ne donnait pas le deck), choisis un de tes decks et tous ces matchs passent sous lui, comme avec le sélecteur « Mon deck » de chaque match.
- **Quatre nouvelles langues** : espagnol, allemand, italien et portugais du Brésil, en plus du français et de l'anglais. L'extension suit la langue du navigateur, et le sélecteur de l'en-tête permet d'en choisir une autre.
- **Safari sur iPad** : l'app Safari, jusque-là réservée à l'iPhone, s'installe aussi sur iPad, avec ses propres captures sur l'App Store. Son écran dit « cet appareil » au lieu de « cet iPhone ».

### Modifié

- **Les pools de draft et de sealed sur une seule ligne** : endstep enregistre chaque pool comme un nouveau deck nommé d'après le jour. Ils se regroupent maintenant sous « Deck limité », anciens et nouveaux compris, au lieu d'une ligne par jour. Le détail d'un match garde le nom d'origine, et un pool renommé sur le site reste un deck à part.
- **Le tableau de bord s'ouvre sur le deck du dernier match**, au lieu du deck le plus joué sur 30 jours : après un changement de deck, les nouveaux matchs sont visibles tout de suite. Les matchs contre l'IA et ceux dont le deck est inconnu ne comptent pas. Un autre deck choisi dans le menu reste affiché jusqu'à ce qu'on réinitialise les filtres.

### Corrigé

- **Une note en cours de saisie n'est plus perdue** : à l'arrivée des noms de cartes ou du métagame, souvent juste après l'ouverture d'un match, le tableau de bord se redessinait sous le curseur : la suite du texte partait et le clavier perdait sa ligne. Il attend maintenant qu'on ait quitté le champ, et le clavier reste à sa place. Le clic qui suit une note modifiée n'est plus perdu non plus.
- **Popup : « Ouvrir le tableau de bord » ne répondait plus** : tant que tous les matchs enregistrés étaient contre l'IA, la popup plantait et son bouton ne faisait rien. Elle affiche maintenant ces matchs, et aucune donnée enregistrée ne peut plus bloquer le bouton.
- **Reconnaissance des decks quand endstep.cc est occupé** : un format que le site ne sert pas pour l'instant (réponse 503 « busy », vue sur Pauper) n'empêche plus les autres de se charger. Il est redemandé toutes les 5 minutes tant que le tableau de bord reste ouvert, sans avoir à le recharger. Le message « indisponible » ne s'affiche qu'une fois, et seulement si un format n'a aucune donnée : un métagame plus ancien reste utilisé.
- **« Mes cartes » sur iPad et dans une fenêtre étroite** : les noms de cartes se coupaient lettre par lettre sous 1164 px de large. Les colonnes se resserrent jusqu'à 1180 px ; sous 980 px, les chiffres passent sous le nom, trois par ligne.
- **Safari : tableau de bord et enregistrement réparés** : un fichier manquait aux apps depuis la 1.5, ce qui arrêtait tout le script d'arrière-plan : le bouton du tableau de bord ne faisait plus rien et, sur une installation neuve, les matchs n'étaient plus enregistrés. Une erreur des statistiques ne peut plus bloquer le reste.

## [1.6] (2026-10-26)

Filtre classés / non classés, « Jouée » et « En jeu » dans Mes cartes, avant et après side, une image de tes stats à partager, ton plan de side à copier, une carte un nom partout, et les nouveautés affichées après une mise à jour.

### Ajouté

- **Partager mes stats** (menu Données, avec un deck choisi) : une image à coller dans Discord, copiée dans le presse-papiers (enregistrée en fichier là où la copie est refusée) : le deck et son format, ton taux de victoire en matchs, sur le play et sur la draw, tes 5 matchups les plus joués et les cartes qui font le plus gagner ou perdre quand tu les pioches. Elle suit les filtres affichés.
- **Avant et après side, dans le panneau du matchup** : ton bilan en games à la game 1 (ton deck de départ) et aux games 2 et 3 (après side) contre cet archétype, pour voir si ton side marche ; le ⓘ explique ce qui est compté.
- **Nouveautés après une mise à jour** : une fois par release, un court encadré « Nouveautés de la 1.6 » en haut du tableau de bord, avec un lien vers ce journal ; rien à la première installation.
- **Un avis sur le store** : après 30 matchs enregistrés (hors IA et matchs importés), une ligne discrète propose de laisser un avis sur le store du navigateur ; « Laisser un avis » ou « Non merci » la fait disparaître pour de bon. Jamais en même temps que les nouveautés, jamais sur Safari (règle 5.6.1 d'Apple : la ligne est retirée du paquet Safari).
- **Le numéro de version** : en bas de la popup et du menu Données, pour savoir d'un coup d'œil quelle version est installée.
- **Filtre classés / non classés** : à côté de la période, « Tous », « Classés » ou « Non classés » ; tous les chiffres suivent, anciens matchs compris. Il n'apparaît qu'une fois un match classé enregistré.
- **Colonnes « Jouée » et « En jeu » dans « Carte par carte »** : les games où tu as lancé la carte (ou posé le terrain), et celles où elle est arrivée sur ton champ de bataille, même sans être piochée : une créature meulée puis réanimée compte enfin. Au survol de « Jouée », la part des games où tu l'as jouée après l'avoir piochée. Elles comptent les games jouées à partir de la 1.6 ; une carte prise à l'adversaire n'y entre pas.
- **Exporter mon plan de side** (menu Données, avec un deck choisi) : « Copier mon plan de side » met dans le presse-papiers un texte à coller dans Discord ou dans ses notes, un bloc par archétype adverse (le plus rencontré d'abord) avec les cartes entrées et sorties (+2 Kor Firewalker, −4 Lava Spike) ; « Exporter mon plan de side (CSV) » donne le même plan pour un tableur, une ligne par carte. Les deux suivent la période et la version de liste affichées.
- **Colonne « Plus tard » dans « Carte par carte »** : les games où la carte est arrivée en cours de partie, sans être dans la main de départ. Avec « Main de départ », elle détaille « Piochée » : une carte qui gagne quand elle est là dès le début et perd quand elle arrive tard se lit d'un coup d'œil. Triable comme les autres colonnes.

### Modifié

- **Chaque chiffre de « Carte par carte » s'explique au survol**, par exemple « Pas piochée : 60-29 en 89 games où elle est restée dans ta bibliothèque ; 67 % de victoires », et la ligne des noms de colonnes reste en haut de l'écran quand on descend une longue liste.
- **Le nombre de matchs sur le play et sur la draw** : dans le bandeau du haut, « Sur le play (7) » et « Sur la draw (18) », sans avoir à additionner le bilan.
- **Un ⓘ à côté du titre de chaque tableau** : le bandeau du haut, Mes decks, Par archétype adverse, Selon le contexte et Carte par carte. Un clic, ou un toucher sur téléphone, ouvre une courte explication de ce que compte le tableau (par exemple Piochée = Main de départ + Plus tard) ; un second clic, un clic ailleurs ou Échap la referme. Les phrases grises sous les titres disparaissent, l'explication les remplace.
- **Toutes les cartes dans « Carte par carte »** : la liste n'est plus coupée après 15 cartes avec un « N autres cartes » à déplier ; un deck de Duel Commander montre ses 100 cartes, triables par colonne comme avant.

### Corrigé

- **Une autre impression ne fait plus une nouvelle version de liste** : changer l'illustration d'une carte pour une impression qui porte un autre nom (Stifle en Beholder's Sleep Ray) ne coupe plus les stats en deux versions ; les versions se comptent avec le nom de référence de chaque carte, anciens matchs compris. À la première ouverture, deux versions peuvent fusionner quelques secondes après l'affichage, le temps que Scryfall réponde.
- **Une carte, un nom partout** : le plan de side, le détail d'un match (ta liste, ta main de départ, ton side, tes cartes jouées), les versions de liste, les exports et la popup nomment tes cartes comme « Carte par carte » (Beholder's Sleep Ray y devient Stifle). Les noms sont aussi demandés à Scryfall à l'ouverture du panneau d'un matchup ou du détail d'un match ; la popup reprend ceux déjà connus, sans rien demander. Le panneau sur endstep.cc garde les noms du site. Politique de confidentialité mise à jour.
- **Seules les cartes de ton deck dans « Carte par carte »** : une carte de l'adversaire passée par ta main (prise, échangée) ou lancée par toi n'y apparaît plus, y compris dans les games déjà enregistrées. Comptent les cartes du deck joué dans la game, de sa réserve (compagnon, cible d'un souhait) et ses commandants.
- **Une carte, un nom dans « Carte par carte »** : une carte imprimée sous un autre nom (Beholder's Sleep Ray est Stifle, versions Secret Lair et Universes Beyond) et l'autre face d'une carte à deux faces (Black Panther, Hope Enduring est King T'Challa) comptent comme la même carte, sous son nom de référence. Les noms sont demandés une fois à Scryfall quand on ouvre « Mes cartes » (la liste se met à jour au fil des réponses), puis gardés dans le navigateur ; hors connexion ou si Scryfall refuse, les noms restent ceux du site, sans nouvel essai avant 5 minutes. Politique de confidentialité mise à jour.
- **Les cartes à deux faces comptent pour une seule carte** : une carte transformée sur le champ de bataille prend le nom de son autre face (King T'Challa devient Black Panther) ; « Carte par carte » la range sous le nom qu'elle avait dans ta main, grâce à son identifiant dans la game. Vaut aussi pour les games déjà enregistrées, quand la carte y a été vue sous ses deux noms.

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
