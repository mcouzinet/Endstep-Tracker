---
target: Deck Compare promo banner in the dashboard
total_score: 18
max_score: 32
na_heuristics: 9,10
p0_count: 0
p1_count: 2
timestamp: 2026-09-25T14-49-25Z
slug: dashboard-html-promo
---
# Critique: Deck Compare promo banner (dashboard.html #promo)

Method: dual-agent (A: design review, B: detector + browser evidence)

## Design Health Score: 18/32 (56 %, Acceptable). n/a: 9, 10

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Close tooltip states the rule; on comeback the reason (news) reads last |
| 2 | Match system / real world | 3 | "82 % similaires" has no subject; "Installer" opens a store page |
| 3 | User control and freedom | 2 | Returns every release, no "never", shown even if Deck Compare is installed |
| 4 | Consistency and standards | 1 | Second primary pill (teal vs gold), only serif, bar mimics win/loss bars |
| 5 | Error prevention | 3 | Nothing destructive |
| 6 | Recognition over recall | 3 | No way back once closed |
| 7 | Flexibility and efficiency | 2 | No compact state, two tab stops before the session |
| 8 | Aesthetic and minimalist | 1 | Eight elements in the most dominant block of the page |
| 9 | Error recovery | n/a | No error states |
| 10 | Help and documentation | n/a | A promo needs no docs |

## Design specificity
Authored for Deck Compare (exact paper/ink/teal, two-tone headline, A/shared/B bar), not for this page: a cream slab (luminance 0.92) on a near-black page where nothing else exceeds ~0.015, placed between the scope stats and the session they describe. 20 % of the first viewport at 1280 px, 41 % at 430 px. Detector: no CLI finding inside the promo; browser scan flags line-length (~99 chars) on .promo-sub and #promo-news.

## Priority issues
- [P1] Brightness and position break "deck decisions first" and "glance in game" (180 px at 1280, 368 px at 430, between stats and session). Fix: move out of the decision zone, dark-native (--surface, hairline), cap ~96 px. layout, quieter.
- [P1] Fake "82 %" (largest number on the page, bar mimics win/loss bars) in a product built on honest numbers. Fix: remove or replace with a real, labelled Deck Compare crop. distill, clarify.
- [P2] CTA hover bug: theme.css a:hover turns the pill text gold. Fix: color #fff on .promo-cta:hover. polish.
- [P2] Serif stack renders Georgia Bold in Chrome/Edge; 4-line title at 430 px, widow at 1280. Fix: bundle Beleren (licence permitting) or dashboard sans; text-wrap: balance. typeset.
- [P2] Comeback state: news reads last, mentions Firefox to Chromium users, stale "Nouveau" if not rewritten, shown when Deck Compare is installed. Fix: news first on comeback, drop Firefox, detect Deck Compare via onMessageExternal. harden, clarify.

## Persona red flags
- Alex: ~150 px lost per visit until closed; returns each release even with Deck Compare installed.
- Sam: glare in a chosen dark UI; unnamed aside landmark before the session; new tab not announced.
- Ranked grinder at 430 px: 41 % of the viewport, session below the fold, bright panel beside the game client.

## Minor observations
Missing Deck Compare wordmark; 28 px close (passes 24 px minimum); duplicate title/aria-label on close; "Installer" vs "Get"; "6 autres sites" will go stale; <em> used for color only.

## Questions
- Where is comparing two lists the natural next step in this dashboard (versions line)? Why is the ad above the session instead?
- With no click measurement (local only), should the design aim for "never annoying" over "maximally visible"?
