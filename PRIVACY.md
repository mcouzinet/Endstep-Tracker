# Privacy policy — Endstep Tracker

*Last updated: 2026-09-23. Version française ci-dessous.*

Endstep Tracker is a Chrome extension that records the Magic: The Gathering matches you play on [endstep.cc](https://endstep.cc) and shows them in a local dashboard. It has no server and no account.

## What is recorded

Only information that is visible on screen during your own games on endstep.cc:

- match metadata: date, format, ranked or not, best-of, score, result;
- player names as shown by the site (yours and your opponent's);
- your deck (name and list, as returned by the site to your own browser);
- opponent cards you saw (battlefield, graveyard, exile, revealed cards), colours;
- per game: play/draw, mulligans, your opening hand, turns, life totals, duration, cards played, the game log;
- your in-game decisions (the prompt, the options offered, what you chose, and the board at that moment), shown under "My decisions" in a game's detail;
- notes and the opponent archetype you type in the dashboard.

Nothing is recorded when you are spectating.

## Where it is stored

Everything stays in your browser, in the extension's local storage (`chrome.storage.local`). The developer has no access to it. It is never transmitted to any server, never synced, never sold, never used for advertising. Uninstalling the extension deletes it. You can export it (JSON, CSV) or delete it at any time from the dashboard's "Data" menu.

## Network requests the extension makes

- **endstep.cc**: the extension only observes the traffic the site already exchanges with your browser. To recognise the opponent's archetype it also reads the site's public metagame API (`/api/metagame/v1`), which involves no personal data. It never sends anything to endstep.cc on your behalf and never plays for you.
- **Scryfall** (`api.scryfall.com`): when you hover a card name in the dashboard, the card image is fetched from Scryfall. The request contains only the card name.

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

Uniquement des informations visibles à l'écran pendant tes propres parties sur endstep.cc : métadonnées du match (date, format, classé ou non, Bo1/Bo3, score, résultat), noms des joueurs tels qu'affichés par le site, ton deck (nom et liste, tels que le site les renvoie à ton navigateur), les cartes adverses vues, et par game : play/draw, mulligans, ta main de départ, tours, points de vie, durée, cartes jouées, journal, ainsi que tes décisions en jeu (affichées sous « Mes décisions ») et les notes que tu saisis dans le tableau de bord. Rien n'est enregistré en mode spectateur.

## Où c'est stocké

Tout reste dans ton navigateur (`chrome.storage.local`). Le développeur n'y a pas accès. Rien n'est transmis à un serveur, synchronisé, vendu ni utilisé à des fins publicitaires. Désinstaller l'extension supprime ces données ; le menu « Données » du tableau de bord permet de les exporter (JSON, CSV) ou de tout effacer.

## Requêtes réseau

- **endstep.cc** : l'extension observe seulement le trafic que le site échange déjà avec ton navigateur. Pour reconnaître l'archétype adverse, elle lit l'API métagame publique du site (`/api/metagame/v1`), sans donnée personnelle. Elle n'envoie jamais rien à endstep.cc en ton nom et ne joue jamais à ta place.
- **Scryfall** : au survol d'un nom de carte dans le tableau de bord, l'image est chargée depuis Scryfall. La requête ne contient que le nom de la carte.

Pas d'analytique, pas de télémétrie, pas de script tiers.

## Contact

<https://github.com/mcouzinet/Endstep-Tracker/issues>
