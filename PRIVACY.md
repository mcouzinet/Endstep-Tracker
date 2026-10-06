# Privacy policy — Endstep Tracker

*Last updated: 2026-10-06. Version française ci-dessous.*

Endstep Tracker is a Chrome extension that records the Magic: The Gathering matches you play on [endstep.cc](https://endstep.cc) and shows them in a local dashboard. It has no server and no account.

## What is recorded

Only information that is visible on screen during your own games on endstep.cc:

- match metadata: date, format, ranked or not, best-of, score, result;
- player names as shown by the site (yours and your opponent's);
- your deck (name and list, as returned by the site to your own browser);
- opponent cards you saw (battlefield, graveyard, exile, revealed cards), colours;
- per game: play/draw, mulligans, your opening hand, the cards you drew, turns, life totals, duration, cards played, the game log;
- your sideboarding between games: the main deck you submit for the next game (the only one of your own actions the extension reads);
- notes and the opponent archetype you type in the dashboard.

If you choose "Import my past matches" in the dashboard, your match history page on endstep.cc opens, and while you browse it the matches it lists that were not recorded yet are added the same way, with what that page shows: date, opponent's name, format, ranked or not, score, result, your deck's name.

Nothing is recorded when you are spectating.

## Where it is stored

Everything stays in your browser, in the extension's local storage (`chrome.storage.local`). The panel shown on endstep.cc during matches displays this data on your screen from a closed shadow root that the page's own scripts cannot read. The developer has no access to it. It is never transmitted to any server, never synced, never sold, never used for advertising. Uninstalling the extension deletes it. You can export it (JSON, CSV) or delete it at any time from the dashboard's "Data" menu.

## Network requests the extension makes

- **endstep.cc**: the extension only observes the traffic the site already exchanges with your browser. To recognise the opponent's archetype it also reads the site's public metagame API (`/api/metagame/v1`), which involves no personal data. It never plays for you, and sends nothing to endstep.cc on your behalf, with one exception you start yourself: when you import your past matches, it loads the next pages of your match history, one a second, with the same request the site makes for its first page (your sign-in stays in the endstep.cc page; the extension never stores or sends it anywhere else).
- **Feedback** (`tally.so`): "Give feedback", in the dashboard's Data menu or the popup, opens a Tally form in a new tab, only when you click it. The link tells the form the extension's version, your browser's name and the interface language, so that a report says what it is about; what you then type in the form goes to Tally and to the author. The extension itself sends nothing.
- **Scryfall** (`api.scryfall.com`): when you hover a card name in the dashboard, the card image is fetched from Scryfall. The request contains only the card name.
- **Deck Compare** (another extension by the same author): the dashboard asks it, inside your browser, whether it is installed, to stop showing its promotion if so. The message says only that; nothing else is exchanged and nothing leaves your browser. The store link in that promotion opens only if you click it.

No analytics, no telemetry, no crash reporting, no third-party scripts.

## Permissions

- `storage`, `unlimitedStorage`: keep your match history locally without a size cap.
- `scripting` and access to `https://endstep.cc/*`: attach the tracker to endstep.cc tabs, including tabs already open when the extension is installed or updated.

## Contact

Questions or requests: open an issue at <https://github.com/mcouzinet/Endstep-Tracker/issues>.

---

# Politique de confidentialité — Endstep Tracker

Endstep Tracker est une extension Chrome qui enregistre les parties de Magic: The Gathering que tu joues sur [endstep.cc](https://endstep.cc) et les affiche dans un tableau de bord local. Elle n'a ni serveur ni compte.

## Ce qui est enregistré

Uniquement des informations visibles à l'écran pendant tes propres parties sur endstep.cc : métadonnées du match (date, format, classé ou non, Bo1/Bo3, score, résultat), noms des joueurs tels qu'affichés par le site, ton deck (nom et liste, tels que le site les renvoie à ton navigateur), les cartes adverses vues, et par game : play/draw, mulligans, ta main de départ, les cartes que tu as piochées, tours, points de vie, durée, cartes jouées, journal, ton side entre les games (le main deck que tu soumets pour la game suivante, la seule de tes actions que l'extension lit), et les notes et archétypes que tu saisis dans le tableau de bord. Si tu choisis « Importer mes anciens matchs » dans le tableau de bord, ta page d'historique sur endstep.cc s'ouvre, et pendant que tu la parcours, les matchs qu'elle liste et qui n'étaient pas encore enregistrés s'ajoutent de la même façon, avec ce que cette page affiche : date, nom de l'adversaire, format, classé ou non, score, résultat, nom de ton deck. Rien n'est enregistré en mode spectateur.

## Où c'est stocké

Tout reste dans ton navigateur (`chrome.storage.local`). Le panneau affiché sur endstep.cc pendant les parties montre ces données à ton écran depuis un shadow root fermé, que les scripts de la page ne peuvent pas lire. Le développeur n'y a pas accès. Rien n'est transmis à un serveur, synchronisé, vendu ni utilisé à des fins publicitaires. Désinstaller l'extension supprime ces données ; le menu « Données » du tableau de bord permet de les exporter (JSON, CSV) ou de tout effacer.

## Requêtes réseau

- **endstep.cc** : l'extension observe seulement le trafic que le site échange déjà avec ton navigateur. Pour reconnaître l'archétype adverse, elle lit l'API métagame publique du site (`/api/metagame/v1`), sans donnée personnelle. Elle ne joue jamais à ta place et n'envoie rien à endstep.cc en ton nom, à une exception près, que tu déclenches toi-même : quand tu importes tes anciens matchs, elle charge les pages suivantes de ton historique, une par seconde, avec la même requête que celle du site pour la première page (ta connexion reste dans la page endstep.cc ; l'extension ne la stocke ni ne l'envoie nulle part ailleurs).
- **Avis** (`tally.so`) : « Donner un avis », dans le menu Données du tableau de bord ou dans la popup, ouvre un formulaire Tally dans un nouvel onglet, uniquement sur clic. Le lien indique au formulaire la version de l'extension, le nom de ton navigateur et la langue de l'interface, pour qu'un retour dise de quoi il parle ; ce que tu écris ensuite dans le formulaire va à Tally et à l'auteur. L'extension elle-même n'envoie rien.
- **Scryfall** : au survol d'un nom de carte dans le tableau de bord, l'image est chargée depuis Scryfall. La requête ne contient que le nom de la carte.
- **Deck Compare** (une autre extension du même auteur) : le tableau de bord lui demande, dans ton navigateur, si elle est installée, pour ne plus afficher sa promotion le cas échéant. Le message ne dit que ça ; rien d'autre n'est échangé et rien ne sort du navigateur. Le lien vers sa fiche ne s'ouvre que si tu cliques dessus.

Pas d'analytique, pas de télémétrie, pas de script tiers.

## Contact

<https://github.com/mcouzinet/Endstep-Tracker/issues>
