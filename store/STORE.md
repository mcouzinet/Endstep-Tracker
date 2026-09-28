# Chrome Web Store — listing and submission

Everything to paste into the developer dashboards. The store builds have no Coach: it lives in the Endstep-coach repository and is only ever copied next to the extension by its install script (git ignores those files here); `release.sh` still refuses a zip that would contain one. Build with `./release.sh` (Chrome Web Store and Edge Add-ons), `./release.sh firefox` (AMO) or `./release.sh safari` (Mac App Store). Versions and the release steps: see "Versions" and "Submission checklist" below; the stores refuse a version they already have.

## Listing

- **Name**: Endstep Tracker
- **Summary** (≤ 132 chars, same as the manifest): Records your endstep.cc matches: opponent cards, play/draw, mulligans, results and cards played.
- **Category**: Productivity (Tools)
- **Languages**: English, French (the extension follows Chrome's language; both are in `_locales`)
- **Homepage / support**: https://github.com/mcouzinet/Endstep-Tracker
- **Privacy policy URL**: https://github.com/mcouzinet/Endstep-Tracker/blob/main/PRIVACY.md

### Description (EN)

Endstep Tracker automatically records the Magic: The Gathering matches you play on endstep.cc and turns them into a personal match history, all stored locally in your browser.

While you play, the extension icon shows a REC badge, and a small panel on the game page shows, between two games, the opponent's archetype and your record against it. The toolbar popup shows the same during a match, and your session otherwise.

The dashboard opens on the deck you play most:

• At a glance: your win rate, your records on the play and on the draw, and your latest results.
• Matchups: record in matches, on the play and on the draw.
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

Pendant une partie, l'icône affiche un badge REC, et un petit panneau sur la page de jeu montre, entre deux games, l'archétype adverse et ton bilan contre lui. La popup de l'icône montre la même chose pendant un match, et ta session sinon.

Le tableau de bord s'ouvre sur le deck que tu joues le plus :

• En un coup d'œil : ton taux de victoire, tes bilans sur le play et sur la draw, et tes derniers résultats.
• Matchups : bilan en matchs, sur le play et sur la draw.
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

**Data usage** (check): *Website content* (game state shown by endstep.cc). Nothing else. All of it stays on the device.

**Certifications** (all true): not sold to third parties; not used for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy**: https://github.com/mcouzinet/Endstep-Tracker/blob/main/PRIVACY.md

## Assets

Screenshots in this folder, 1280×800 PNG without alpha, made from the demo data of `test/harness/shots.js` (no real player):

1. `1-dashboard-en.png` — dashboard overview, English
2. `2-match-detail.png` — expanded match: opponent cards seen, recognized archetype, notes, per-game detail
3. `3-dashboard-fr.png` — dashboard overview, French

Regenerate after a UI change: `node test/harness/gen-demo.js && node store/shots.js`.

Promo images and store icon, generated by `node store/promo.js` (icon SVG + screenshot 1, same palette as the dashboard):

- `icon-128.png`: store icon, the art at full size on its 128 px canvas (like Deck Compare's; the store's advice of 96 px art in 16 px of padding made it look smaller than its neighbours)
- `promo-440x280.png` — small promo tile
- `marquee-1400x560.png` — marquee

## Test instructions tab

The dashboard has a "Test instructions" tab for reviewers (500 characters max; optional, but it saves a round trip since the extension only does something on endstep.cc). The deck the reviewer pastes is `store/reviewer-deck.txt` (mono-red, 60 cards, legal at the default "Casual" table). Paste:

> No account needed. 1) Open https://endstep.cc, choose "Continue as Guest". 2) Click "vs Bot" > Pick deck > Build a new deck > Edit as text, paste the list from https://github.com/mcouzinet/Endstep-Tracker/blob/main/store/reviewer-deck.txt, Save, pick it for you and the AI, start. 3) The icon shows a REC badge; play a few turns or concede. 4) Click the icon: the dashboard lists the match (result, play/draw, opponent cards, log). Data stays in chrome.storage.local; nothing is sent to endstep.cc.

## Firefox (addons.mozilla.org)

`./release.sh firefox` builds `dist/endstep-tracker-<version>-firefox.zip`: same files, manifest rewritten for Firefox (`background.scripts` instead of the service worker, a `browser_specific_settings.gecko` block with the add-on id `endstep-tracker@mcouzinet.github.io`, `strict_min_version` 143 for `storage.getKeys` and the mandatory `data_collection_permissions: none`). No code differs: Firefox's `chrome.*` returns promises, and `runtime.getContexts` and `scripting.executeScript` in the MAIN world are available (checked on Firefox 134).

- Upload: https://addons.mozilla.org/developers/ → Submit a New Add-on → "On this site". Listing texts, screenshots and privacy policy: same as above. AMO also asks for a summary (≤ 250 chars, the manifest one fits) and a category (Games & Entertainment or Other).
- Before uploading: `npx web-ext lint --source-dir <unzipped build>` must show 0 errors (it shows `innerHTML` warnings on dashboard.js, which AMO accepts; the content is escaped with `esc()`).
- Reviewer notes: the same 500-character text as the Chrome test instructions.
- Firefox 127+ grants `host_permissions` at install time, so the tracker runs on endstep.cc right after installing; on older Firefox the user would have to allow the site by hand, hence the minimum version.
- The Chrome zip also serves Edge Add-ons unchanged.

## Safari (Mac App Store)

`./release.sh safari` builds `dist/safari/` (plus a zip): manifest rewritten with `browser_specific_settings.safari` (`strict_min_version` 18.4, for `storage.getKeys`) instead of `minimum_chrome_version`, a 1024 px icon (Apple's packager builds the App Store icon from the largest one), and `hook.js` out of `content_scripts`: Apple's packager says Safari ignores `world` there, so `background.js` registers it in the MAIN world with `scripting.registerContentScripts`. One code path differs: Safari has no `runtime.getContexts`, so `background.js` looks for the dashboard tab with `tabs.query`. The REC badge shows without its red background (Safari ignores `setBadgeBackgroundColor`).

- Wrapper app: the Xcode project `safari/Endstep Tracker/Endstep Tracker.xcodeproj`. It **references** `dist/safari/` instead of copying it: run `./release.sh safari` before archiving, and add any new extension file to the Extension target. Bundle id `io.github.mcouzinet.endsteptracker` (permanent once published), team `6DTUA72PA3`, macOS 13 minimum, category Entertainment, encryption exempt. Edit this project rather than regenerate it: Apple's converter ignores the requested app id, sets version 1.0, targets the SDK's macOS and leaves out the category.
- Each release: `MARKETING_VERSION` (the manifest version) and `CURRENT_PROJECT_VERSION` go up in both targets, app and extension.
- Upload: create the app in App Store Connect first (bundle id above), then Xcode: Product, Archive, Distribute App, App Store Connect. Listing texts, screenshots (1280×800 fits the Mac sizes) and privacy policy: same as above; App Privacy: Data Not Collected. The description in `_locales/*/messages.json` must stay at 112 characters or fewer in every language, or the upload is refused.
- The first time, Safari asks the user to allow the extension on endstep.cc; until then nothing is recorded.

## Versions

`manifest.json` reads **`X.Y` for a release, `X.Y.Z` for a dev build**, as in Deck Compare:

- **Release** `X.Y`: what the stores publish, tagged `vX.Y`. `Y` moves up by one at each release, `X` for a major one.
- **Dev** `X.Y.Z` between two releases: `X.Y.1`, `X.Y.2`… `Z` goes up at **every batch of changes tested in the browser**, so the number shown in `chrome://extensions` tells which build is loaded. The next release drops back to two numbers, `X.(Y+1)`.
- Browsers compare component by component, a missing one counts as 0: `0.9` < `0.9.2` < `0.10`. A release must stay above the previous published one.
- **The four stores ship together** (Chrome Web Store, Edge Add-ons, AMO, Mac App Store), once `CHANGELOG.md` "Non publié" holds enough. `release.sh safari` copies the manifest version into the Xcode project (`MARKETING_VERSION`); raise `CURRENT_PROJECT_VERSION` only to upload the same version to Apple again.

## Submission checklist

1. `node test/replay.test.js && node test/meta.test.js && node test/hook.test.js && node test/commander.test.js && node test/ai.test.js && node test/records.test.js`
2. `version` in `manifest.json` → `X.Y`; in `CHANGELOG.md`, "Non publié" becomes `[X.Y] (date)`; rewrite `promo_news` in both `_locales` (the Deck Compare news shown when the closed banner comes back with this release). Commit `Release X.Y`, lightweight tag `vX.Y`, then push `main` and the tag (`git push origin vX.Y`: a lightweight tag does not travel with `--follow-tags`).
3. `./release.sh` → upload `dist/endstep-tracker-<version>.zip` (Chrome, Edge); `./release.sh firefox` → `dist/endstep-tracker-<version>-firefox.zip` (AMO); `./release.sh safari`, then archive the Xcode project (Mac App Store).
4. Fill the listing, privacy tab, test instructions and assets from this file; set visibility (public or unlisted), then submit. Review usually takes 1 to 3 days; a `world: MAIN` content script and a host permission may trigger a question from the reviewer, the justifications above answer it.
5. Updates: same steps; users get them automatically, and open endstep.cc tabs are re-attached by `background.js`.
6. After the release, the next dev build is `X.Y.1`.
