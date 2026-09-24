# Chrome Web Store — listing and submission

Everything to paste into the developer dashboards. The store builds have no Coach: `release.sh` leaves out `coach.js`, `coach-model.json` and `coach-cards.json`. Build with `./release.sh` (Chrome Web Store and Edge Add-ons) or `./release.sh firefox` (AMO); bump `version` in `manifest.json` first, the stores refuse a version they already have.

## Listing

- **Name**: Endstep Tracker
- **Summary** (≤ 132 chars, same as the manifest): Records your endstep.cc matches: opponent cards, play/draw, mulligans, results and cards played.
- **Category**: Productivity (Tools)
- **Languages**: English, French (the extension follows Chrome's language; both are in `_locales`)
- **Homepage / support**: https://github.com/mcouzinet/Endstep-Tracker
- **Privacy policy URL**: https://github.com/mcouzinet/Endstep-Tracker/blob/main/PRIVACY.md

### Description (EN)

Endstep Tracker automatically records the Magic: The Gathering matches you play on endstep.cc and turns them into a personal match history, all stored locally in your browser.

While you play, the extension icon shows a REC badge, and a small panel on the game page shows, between two games, the opponent's archetype, your record against it and your sideboard plan for that matchup. The toolbar popup shows the same during a match, and your session otherwise.

The dashboard opens on the deck you play most:

• Your session in progress, and how it moved each matchup.
• Matchups: record in matches, game 1 (main deck) and games 2-3 (after sideboarding), on the play and on the draw; a sideboard plan per matchup.
• List versions: when your main deck changes, compare the new list with the previous one, matchup by matchup.
• Match history: date, format, opponent, your deck, score, result.
• Per game: play/draw, mulligans, your opening hand, turns, final life totals, duration, and the full game log.
• Opponent cards seen, with card preview on hover, and automatic archetype recognition from endstep.cc's public metagame (Pauper, Modern, Legacy, Vintage, Premodern, Duel Commander…).
• Honest numbers: every rate shows its sample size, and nothing reads as a percentage before 5 results.
• Search the history: opponent, archetype, card seen, note.
• Notes per match, "My deck" picker, export to JSON or CSV, import, delete everything.

Everything stays on your computer. The extension never sends anything to endstep.cc, never plays for you, and has no server, account, analytics or ads. Only public game information (what you could see on screen) is recorded, and nothing is recorded while spectating.

Not affiliated with endstep.cc or Wizards of the Coast.

### Description (FR)

Endstep Tracker enregistre automatiquement les parties de Magic: The Gathering que tu joues sur endstep.cc et en fait un historique personnel, stocké uniquement dans ton navigateur.

Pendant une partie, l'icône affiche un badge REC, et un petit panneau sur la page de jeu montre, entre deux games, l'archétype adverse, ton bilan contre lui et ton plan de side pour ce matchup. La popup de l'icône montre la même chose pendant un match, et ta session sinon.

Le tableau de bord s'ouvre sur le deck que tu joues le plus :

• Ta session en cours, et ce qu'elle a changé à chaque matchup.
• Matchups : bilan en matchs, en game 1 (main deck) et en games 2-3 (après side), au play et à la draw ; un plan de side par matchup.
• Versions de liste : quand ton main deck change, compare la nouvelle liste à la précédente, matchup par matchup.
• Historique des matchs : date, format, adversaire, ton deck, score, résultat.
• Par game : play/draw, mulligans, ta main de départ, tours, PV finaux, durée et journal complet.
• Cartes adverses vues, aperçu au survol, et reconnaissance automatique de l'archétype grâce au métagame public d'endstep.cc (Pauper, Modern, Legacy, Vintage, Premodern, Duel Commander…).
• Des chiffres honnêtes : chaque taux montre son échantillon, et rien ne s’affiche en pourcentage avant 5 résultats.
• Recherche dans l’historique : adversaire, archétype, carte vue, note.
• Notes par match, sélecteur « Mon deck », export JSON ou CSV, import, tout effacer.

Tout reste sur ton ordinateur. L'extension n'envoie jamais rien à endstep.cc, ne joue jamais à ta place, et n'a ni serveur, ni compte, ni analytique, ni publicité. Seules les informations publiques de la partie (ce que tu vois à l'écran) sont enregistrées, et rien en mode spectateur.

Non affilié à endstep.cc ni à Wizards of the Coast.

## Privacy tab

**Single purpose**: Record the matches the user plays on endstep.cc and display them in a local dashboard.

**Permission justifications**

- `storage` / `unlimitedStorage`: the match history (including full game logs) is stored locally in `chrome.storage.local`; a heavy user exceeds the default 10 MB quota.
- `scripting`: after the extension is installed or updated, the background worker re-injects the tracker into endstep.cc tabs that are already open, so a match in progress is not lost.
- Host permission `https://endstep.cc/*`: the only site the extension works on. The content script observes the game messages the site already exchanges with the browser (WebSocket) to build the match record, and shows a small panel with the user's own records and notes (in a closed shadow root, never focused, never acting on the game). Nothing is sent.
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

The dashboard has a "Test instructions" tab for reviewers (500 characters max; optional, but it saves a round trip since the extension only does something on endstep.cc). The deck the reviewer pastes is `store/reviewer-deck.txt` (mono-red, 60 cards, legal at the default "Casual" table). Paste:

> No account needed. 1) Open https://endstep.cc, choose "Continue as Guest". 2) Click "vs Bot" > Pick deck > Build a new deck > Edit as text, paste the list from https://github.com/mcouzinet/Endstep-Tracker/blob/main/store/reviewer-deck.txt, Save, pick it for you and the AI, start. 3) The icon shows a REC badge; play a few turns or concede. 4) Click the icon: the dashboard lists the match (result, play/draw, opponent cards, log). Data stays in chrome.storage.local; nothing is sent to endstep.cc.

## Firefox (addons.mozilla.org)

`./release.sh firefox` builds `dist/endstep-tracker-<version>-firefox.zip`: same files, manifest rewritten for Firefox (`background.scripts` instead of the service worker, a `browser_specific_settings.gecko` block with the add-on id `endstep-tracker@mcouzinet.github.io`, `strict_min_version` 140 and the mandatory `data_collection_permissions: none`). No code differs: Firefox's `chrome.*` returns promises, and `runtime.getContexts` and `scripting.executeScript` in the MAIN world are available (checked on Firefox 134).

- Upload: https://addons.mozilla.org/developers/ → Submit a New Add-on → "On this site". Listing texts, screenshots and privacy policy: same as above. AMO also asks for a summary (≤ 250 chars, the manifest one fits) and a category (Games & Entertainment or Other).
- Before uploading: `npx web-ext lint --source-dir <unzipped build>` must show 0 errors (it shows `innerHTML` warnings on dashboard.js, which AMO accepts; the content is escaped with `esc()`).
- Reviewer notes: the same 500-character text as the Chrome test instructions.
- Firefox 127+ grants `host_permissions` at install time, so the tracker runs on endstep.cc right after installing; on older Firefox the user would have to allow the site by hand, hence the minimum version.
- The Chrome zip also serves Edge Add-ons unchanged.

## Submission checklist

1. `node test/replay.test.js && node test/meta.test.js && node test/coach.test.js && node test/hook.test.js`
2. Bump `version` in `manifest.json`, commit, tag `v<version>`.
3. `./release.sh` → upload `dist/endstep-tracker-<version>.zip` (Chrome, Edge); `./release.sh firefox` → `dist/endstep-tracker-<version>-firefox.zip` (AMO).
4. Fill the listing, privacy tab, test instructions and assets from this file; set visibility (public or unlisted), then submit. Review usually takes 1 to 3 days; a `world: MAIN` content script and a host permission may trigger a question from the reviewer, the justifications above answer it.
5. Updates: same steps; users get them automatically, and open endstep.cc tabs are re-attached by `background.js`.
