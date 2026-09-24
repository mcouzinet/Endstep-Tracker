# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

A Manifest V3 browser extension (Chrome, Edge, Firefox) for the endstep.cc Magic: The Gathering client.

## Users

Primary: competitive players who grind ranked matches on endstep.cc with one or two decks in a single format (Pauper, Modern, Legacy…). The author is one of them (Pauper, Esper Affinity). Confirmed as the audience arriving with the extension's traction.

Their main job: **tune their deck**. Across dozens of matches, see how the deck does per matchup, on the play versus on the draw, with or without a mulligan, and decide what to change in the main deck or the sideboard.

Secondary jobs the product already serves, ranked below deck tuning: review a match right after playing it, glance at the current opponent during a match, read which archetypes they meet most.

## Product Purpose

Record every match the user plays on endstep.cc automatically and passively, and turn that record into answers about their deck. Success: the player knows which matchups they lose and why, without logging anything by hand.

## Positioning

The record comes from the game's own message stream, not from manual entry or screenshots: it knows exactly what was visible (opponent cards by zone, opening hand, mulligans, turn-by-turn plays, life totals), and it names opponent archetypes with endstep.cc's own public metagame vocabulary. Everything stays in the browser.

## Operating Context

- endstep.cc open in a tab; the toolbar icon shows a REC badge while a match is tracked; a click opens the dashboard in its own tab (reused if already open).
- The dashboard is also used in a narrow window beside the game (about 430 px wide).
- Matches are Bo1 or Bo3, ranked or casual queue, against humans or the Forge AI bot, in a format or with no banlist.
- Sessions are bursts of several matches in a row, then review.

## Capabilities and Constraints

Existing, to preserve:
- Automatic match record: format, ranked, Bo1/Bo3, opponent, my deck (name and list), score, result; per game: play/draw, toss, mulligans, kept hand, winner, end reason, turns, final life, duration, opponent cards seen with max copies, colours of cast spells, cards played per turn, full log.
- Dashboard: overview and context win rates (play/draw, kept 7/after mulligan), breakdown by my deck and by opponent archetype (click to filter), filters (search, format chips, period, result), match list with expandable detail, notes and archetype per match, "My deck" override, card preview on hover (Scryfall), live-match pill, export JSON/CSV, import, delete all, EN/FR.
- Opponent archetype recognition from the endstep.cc metagame API (naive Bayes, confidence threshold, "Use" to confirm; manual archetype wins).

Constraints:
- Plain HTML/CSS/JS, no dependency, no build step, no remote code.
- Data in `chrome.storage.local` only. Outbound requests: endstep.cc public metagame API and Scryfall card images on hover. Nothing is sent on the user's behalf; nothing recorded while spectating.
- Host permission limited to `https://endstep.cc/*`.
- Store builds ship without the Coach (`coach.js` and model files are left out); every surface must work without it. The Coach is a separate workstream and out of scope for redesigns.
- Strings live in `_locales/en` and `_locales/fr`.

In scope for redesign, not yet built: a toolbar popup (quick summary instead of opening a tab directly) and an in-page panel on endstep.cc during a match.

Terminology: match, game, play/draw, mulligan (M1, M2…), archetype, ranked (classé), no banlist (sans banlist), Bo1/Bo3, my deck, opponents' decks.

## Brand Commitments

Name "Endstep Tracker". Icon: a gold card carrying a rising trend line (`icons/icon.svg`). Not affiliated with endstep.cc or Wizards of the Coast; the listing and UI must not imply otherwise.

## Evidence on Hand

- Demo data for screenshots: `test/harness/gen-demo.js` (synthetic matches built from a real replayed Bo3, no real player data).
- Store screenshots and promo images: `store/`.
- No user counts, ratings, testimonials or reviews exist yet; do not fabricate them.

## Product Principles

1. **Zero entry.** The record is automatic; manual input only corrects or annotates it.
2. **Deck decisions first.** The first thing a user sees answers "how does my deck do, and against what".
3. **Honest numbers.** Every rate carries its sample size; small samples must not read as conclusions.
4. **Passive and local.** Never act on endstep.cc, never send the user's data anywhere.
5. **Glance in game, depth after.** Surfaces used during a match show little and never compete with the game.
