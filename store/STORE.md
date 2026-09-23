# Chrome Web Store — listing and submission

Everything to paste into the developer dashboard. The store build has no Coach: `release.sh` leaves out `coach.js` and `coach-model.json`. Build the zip with `./release.sh` (bump `version` in `manifest.json` first: the store refuses a version it already has).

## Listing

- **Name**: Endstep Tracker
- **Summary** (≤ 132 chars, same as the manifest): Records your endstep.cc matches: opponent cards, play/draw, mulligans, results and cards played.
- **Category**: Productivity (Tools)
- **Languages**: English, French (the extension follows Chrome's language; both are in `_locales`)
- **Homepage / support**: https://github.com/mcouzinet/Endstep-Tracker
- **Privacy policy URL**: https://github.com/mcouzinet/Endstep-Tracker/blob/main/PRIVACY.md

### Description (EN)

Endstep Tracker automatically records the Magic: The Gathering matches you play on endstep.cc and turns them into a personal match history, all stored locally in your browser.

While you play, the extension icon shows a REC badge. Click it to open the dashboard:

• Match history: date, format, opponent, your deck, score, result.
• Per game: play/draw, mulligans, your opening hand, turns, final life totals, duration, and the full game log.
• Opponent cards seen, with card preview on hover, and automatic archetype recognition from endstep.cc's public metagame (Pauper, Modern, Legacy, Vintage, Premodern, Duel Commander…).
• Stats: win rates on the play and on the draw, with and without mulligan, by your deck and by opponent archetype. Click a row to filter.
• Filters and search: opponent, archetype, card seen, note, format, deck, period, result.
• Notes per match, "My deck" picker, export to JSON or CSV, import, delete everything.

Everything stays on your computer. The extension never sends anything to endstep.cc, never plays for you, and has no server, account, analytics or ads. Only public game information (what you could see on screen) is recorded, and nothing is recorded while spectating.

Not affiliated with endstep.cc or Wizards of the Coast.

### Description (FR)

Endstep Tracker enregistre automatiquement les parties de Magic: The Gathering que tu joues sur endstep.cc et en fait un historique personnel, stocké uniquement dans ton navigateur.

Pendant une partie, l'icône affiche un badge REC. Un clic ouvre le tableau de bord :

• Historique des matchs : date, format, adversaire, ton deck, score, résultat.
• Par game : play/draw, mulligans, ta main de départ, tours, PV finaux, durée et journal complet.
• Cartes adverses vues, aperçu au survol, et reconnaissance automatique de l'archétype grâce au métagame public d'endstep.cc (Pauper, Modern, Legacy, Vintage, Premodern, Duel Commander…).
• Statistiques : au play et à la draw, avec ou sans mulligan, par deck joué et par archétype adverse. Un clic sur une ligne filtre la liste.
• Filtres et recherche : adversaire, archétype, carte vue, note, format, deck, période, résultat.
• Notes par match, sélecteur « Mon deck », export JSON ou CSV, import, tout effacer.

Tout reste sur ton ordinateur. L'extension n'envoie jamais rien à endstep.cc, ne joue jamais à ta place, et n'a ni serveur, ni compte, ni analytique, ni publicité. Seules les informations publiques de la partie (ce que tu vois à l'écran) sont enregistrées, et rien en mode spectateur.

Non affilié à endstep.cc ni à Wizards of the Coast.

## Privacy tab

**Single purpose**: Record the matches the user plays on endstep.cc and display them in a local dashboard.

**Permission justifications**

- `storage` / `unlimitedStorage`: the match history (including full game logs) is stored locally in `chrome.storage.local`; a heavy user exceeds the default 10 MB quota.
- `scripting`: after the extension is installed or updated, the background worker re-injects the tracker into endstep.cc tabs that are already open, so a match in progress is not lost.
- Host permission `https://endstep.cc/*`: the only site the extension works on. The content script observes the game messages the site already exchanges with the browser (WebSocket) to build the match record. Nothing is sent.
- Content script in the page world (`world: MAIN`): the game state is only available by observing the site's own WebSocket, which is not accessible from the isolated world. The script is read-only.

**Remote code**: No. All code is in the package.

**Data usage** (check): *Website content* (game state shown by endstep.cc), *User activity* (the user's in-game choices, listed under "My decisions" in a game's detail). Nothing else. All of it stays on the device.

**Certifications** (all true): not sold to third parties; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy**: https://github.com/mcouzinet/Endstep-Tracker/blob/main/PRIVACY.md

## Assets

Screenshots in this folder, 1280×800 PNG without alpha, made from the demo data of `test/harness/shots.js` (no real player):

1. `1-dashboard-en.png` — dashboard overview, English
2. `2-match-detail.png` — expanded match: opponent cards seen, recognized archetype, notes, per-game detail
3. `3-dashboard-fr.png` — dashboard overview, French

Regenerate after a UI change: `node test/harness/gen-demo.js && node store/shots.js`.

Promo images and store icon, generated by `node store/promo.js` (icon SVG + screenshot 1, same palette as the dashboard):

- `icon-128.png` — store icon, 96 px art centred on a transparent 128 px canvas as the store recommends
- `promo-440x280.png` — small promo tile
- `marquee-1400x560.png` — marquee

## Test instructions tab

The dashboard has a "Test instructions" tab for reviewers (optional, but it saves a round trip since the extension only does something on endstep.cc). Paste:

> No account or credentials needed: endstep.cc offers guest play against a bot.
>
> 1. Install the extension, then open https://endstep.cc. If asked, choose "Continue as Guest".
> 2. On the tables page click "vs Bot" (solo practice against the AI). Under "You" click "Pick deck" → "Build a new deck" → "Edit as text", paste the 60-card list below, "Save", then pick that deck. Under "The AI's deck" pick the same deck. Start the match.
> 3. During the match the extension icon shows a red "REC" badge. Play a few turns (or open the board menu and concede).
> 4. Click the extension icon: the dashboard opens with the match (opponent "Forge AI", result, play/draw, mulligans, opponent cards seen, per-turn log). Expand the match row for the detail; the "Data" menu exports the stored JSON.
> 5. Everything is stored in chrome.storage.local only. The extension never sends anything to endstep.cc; the only outbound requests are endstep.cc's public metagame API (archetype recognition) and Scryfall (card image on hover in the dashboard).
>
> Deck list to paste (mono-red, legal in the default "Casual" table):
>
> ```
> 24 Mountain
> 4 Lightning Bolt
> 4 Goblin Guide
> 4 Monastery Swiftspear
> 4 Lava Spike
> 4 Rift Bolt
> 4 Skewer the Critics
> 4 Eidolon of the Great Revel
> 4 Searing Blaze
> 4 Fireblast
> ```

## Submission checklist

1. `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js && node test/hook.test.js`
2. Bump `version` in `manifest.json`, commit, tag `v<version>`.
3. `./release.sh` → upload `dist/endstep-tracker-<version>.zip`.
4. Fill the listing, privacy tab, test instructions and assets from this file; set visibility (public or unlisted), then submit. Review usually takes 1 to 3 days; a `world: MAIN` content script and a host permission may trigger a question from the reviewer, the justifications above answer it.
5. Updates: same steps; users get them automatically, and open endstep.cc tabs are re-attached by `background.js`.
