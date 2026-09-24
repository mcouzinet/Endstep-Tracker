// What the dashboard, the toolbar popup and the in-page panel must compute the same way: deck and format names,
// the opponent's archetype key, sessions, records, side plan keys, the metagame guess, and the strings.
// Pure functions; the match notes, my decks and the translator come in a context: { notes, decks, t }.
(function (root) {
  'use strict';

  const STALE_MS = 3 * 3600e3; // an "active" match untouched for this long is unfinished, not live
  const SESSION_GAP = 2 * 3600e3; // matches closer than this belong to one session
  const NO_RECOGNITION = /draft|sealed|momir|fish|(?<!-)commander|brawl|oathbreaker/i; // "duel-commander" is tracked by the site
  const BASIC = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

  const opps = (m) => m.players.filter((p) => p && p.seat !== m.mySeat);
  const colorsOf = (m) => [...new Set(opps(m).map((p) => m.colors[p.seat] || '').join(''))].join('');
  const gRes = (m, g) => (g.winnerSeat === undefined ? '' : g.winnerSeat === null ? 'D' : g.winnerSeat === m.mySeat ? 'W' : 'L');
  const onPlay = (m, g) => (g.firstSeat === undefined || g.firstSeat === null ? null : g.firstSeat === m.mySeat);
  const tally = () => ({ W: 0, L: 0, D: 0 });
  // Game 1 is played with the main deck, games 2 and 3 after sideboarding: every game record splits along that line.
  const half = (gm) => (gm.n === 1 ? 'g1' : 'g23');
  const halves = () => ({ g1: tally(), g23: tally() });
  const pct = (r) => (r.W + r.L ? `${Math.round((100 * r.W) / (r.W + r.L))} %` : '—');
  const wl = (r) => `${r.W}–${r.L}${r.D ? `–${r.D}` : ''}`;
  const isLive = (m, now = Date.now()) => m.status === 'active' && now - m.updatedAt < STALE_MS;

  // A deck picked by hand in the match detail (note.deckId) wins over what the tracker attributed.
  function myDeck(m, c) {
    const id = c.notes[m.id] && c.notes[m.id].deckId;
    if (!id) return m.myDeck;
    const d = c.decks[id] || {};
    return { id, name: d.name || null, cards: d.cards || null, sideboard: d.sideboard || null, source: 'manual' };
  }
  function deckName(m, c) {
    const d = myDeck(m, c);
    return d ? d.name || `Deck ${d.id.slice(0, 8)}` : m.limitedDeck ? c.t('limited_deck') : c.t('unknown');
  }
  // The format alone (the site's formatId, else its game kind; constructed without a banlist is "no banlist").
  function formatOf(m, c) {
    const base = m.formatId && m.formatId !== 'casual' ? m.formatId : m.format && m.format !== 'constructed' ? m.format : c.t('casual');
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  const archetype = (m, c) => (c.notes[m.id] && c.notes[m.id].archetype) || '';
  // The opponent's deck: the archetype I confirmed, else the recognized one, else its colours.
  function oppKey(m, c, guessName) {
    const a = archetype(m, c) || guessName;
    if (a) return 'a:' + a;
    const col = colorsOf(m);
    return col ? 'c:' + col : '?';
  }
  // One side plan per deck and opposing archetype.
  const planKey = (format, deck, key) => 'plan:' + JSON.stringify([format, deck, key]);

  // The archetype endstep.cc's metagame suggests from the cards seen. meta: { formats, byFormat } as cached by the dashboard.
  function recognize(m, meta, Meta, T) {
    if (!meta || !Array.isArray(meta.formats) || NO_RECOGNITION.test(`${m.format || ''} ${m.formatId || ''}`)) return null;
    const cards = opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat)));
    if (cards.filter((x) => !BASIC.test(x)).length < 2) return null;
    const formats = meta.formats.includes(m.formatId) ? [m.formatId] : meta.formats;
    const decks = formats.flatMap((f) => (meta.byFormat && meta.byFormat[f] && meta.byFormat[f].decks) || []);
    return decks.length ? Meta.classify(cards, decks) : null;
  }

  const endOf = (m) => m.endedAt || m.updatedAt || m.startedAt;
  // The latest session: matches following each other with less than SESSION_GAP between them. list: newest first.
  function lastSession(list) {
    const out = [];
    for (const m of list) {
      if (out.length && out[out.length - 1].startedAt - endOf(m) > SESSION_GAP) break;
      out.push(m);
    }
    return out;
  }
  const sessionOpen = (session, now = Date.now()) => session.length > 0 && now - endOf(session[0]) < SESSION_GAP;

  // Records of a list of matches: matches, games, G1 / G2-G3, games on the play / on the draw. A live match counts in none.
  function records(list, now = Date.now()) {
    const r = { m: tally(), g: tally(), s: halves(), play: tally(), draw: tally() };
    for (const m of list) {
      if (isLive(m, now)) continue;
      if (m.result) r.m[m.result]++;
      for (const gm of m.games) {
        const x = gRes(m, gm);
        if (!x) continue;
        r.g[x]++;
        r.s[half(gm)][x]++;
        const p = onPlay(m, gm);
        if (p !== null) (p ? r.play : r.draw)[x]++;
      }
    }
    return r;
  }

  // Strings. Extension pages read _locales themselves so the language picked in the dashboard wins over the browser's;
  // content scripts cannot fetch extension files and use the browser's lookup, in the browser's language.
  const LANGS = ['en', 'fr'];
  const LANG_PREF = 'endstep-tracker.lang';
  const baseLang = (l) => String(l || '').toLowerCase().split('-')[0];
  function translator(locale, lookup) {
    const rules = new Intl.PluralRules(locale);
    const t = (key, vars) => {
      let s = lookup(key) || key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
      return s;
    };
    return { locale, t, tn: (key, n, vars) => t(`${key}_${rules.select(n)}`, { n, ...vars }) };
  }
  async function loadI18n() {
    let saved = null;
    try { saved = localStorage.getItem(LANG_PREF); } catch { /* storage unavailable */ }
    const locale = [saved, navigator.language].map(baseLang).find((l) => LANGS.includes(l)) || 'en';
    const read = async (lang) => { try { return await (await fetch(`_locales/${lang}/messages.json`)).json(); } catch { return {}; } };
    const messages = Object.assign(await read('en'), locale === 'en' ? {} : await read(locale)); // English fills any gap
    return translator(locale, (k) => messages[k] && messages[k].message);
  }
  function browserI18n() {
    const ui = baseLang(chrome.i18n.getUILanguage());
    return translator(LANGS.includes(ui) ? ui : 'en', (k) => chrome.i18n.getMessage(k));
  }

  const Shared = {
    STALE_MS, SESSION_GAP, LANG_PREF, NO_RECOGNITION, BASIC,
    opps, colorsOf, gRes, onPlay, tally, half, halves, pct, wl, isLive,
    myDeck, deckName, formatOf, archetype, oppKey, planKey, recognize, lastSession, sessionOpen, records,
    loadI18n, browserI18n, translator,
  };
  if (typeof module === 'object' && module.exports) module.exports = Shared;
  else root.EndstepShared = Shared;
})(typeof self !== 'undefined' ? self : this);
