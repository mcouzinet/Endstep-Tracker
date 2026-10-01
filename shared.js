// What the dashboard, the toolbar popup and the in-page panel must compute the same way: deck and format names,
// the opponent's archetype key, sessions, records, the metagame guess, and the strings.
// Pure functions; the match notes, my decks and the translator come in a context: { notes, decks, t }.
(function (root) {
  'use strict';

  const HISTORY_IMPORT_MS = 30 * 60e3; // "Import my past matches": endstep.cc's history page imports for this long after its last page
  const STALE_MS = 3 * 3600e3; // an "active" match untouched for this long is unfinished, not live
  const SESSION_GAP = 2 * 3600e3; // matches closer than this belong to one session
  const NO_RECOGNITION = /draft|sealed|momir|fish|(?<!-)commander|brawl|oathbreaker/i; // "duel-commander" is tracked by the site
  const BASIC = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;

  const esc = (s) => String(s === undefined || s === null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // Records come from the tracker or from an imported file: keep only what the pages can render.
  function normalizeMatch(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || !Number.isFinite(m.startedAt)) return null;
    if (!Array.isArray(m.players) || !Array.isArray(m.games)) return null;
    m.players = m.players.filter((p) => p && typeof p === 'object' && Number.isInteger(p.seat)).map((p) => ({ ...p, name: String(p.name || '?') }));
    m.games = m.games.filter((g) => g && typeof g === 'object' && Number.isFinite(g.n)).map((g) => ({
      ...g, mulligans: obj(g.mulligans), life: obj(g.life), seen: obj(g.seen), log: Array.isArray(g.log) ? g.log.filter(Array.isArray) : [],
      drawn: g.drawn === undefined ? undefined : Object.fromEntries(Object.entries(obj(g.drawn)).filter(([, ids]) => Array.isArray(ids))),
      openingHand: Array.isArray(g.openingHand) ? g.openingHand.filter((c) => typeof c === 'string') : undefined,
    }));
    if (m.mains !== undefined) {
      m.mains = Object.fromEntries(Object.entries(obj(m.mains))
        .map(([n, c]) => [n, Object.fromEntries(Object.entries(obj(c)).filter(([, k]) => Number.isFinite(k) && k > 0))]));
    }
    m.mySeat = Number.isInteger(m.mySeat) ? m.mySeat : null;
    m.score = Array.isArray(m.score) ? m.score.map(Number) : [];
    m.colors = obj(m.colors);
    m.status = m.status === 'complete' || m.status === 'abandoned' ? m.status : 'active';
    if (!Number.isFinite(m.updatedAt)) m.updatedAt = m.startedAt;
    if (m.myDeck && (typeof m.myDeck !== 'object' || typeof m.myDeck.id !== 'string')) m.myDeck = null;
    return m;
  }

  const opps = (m) => m.players.filter((p) => p && p.seat !== m.mySeat);
  // A match against the site's AI (Forge AI, Auto-Pilot…): kept in the history, left out of every record. The site flags
  // bots in the match's participants; a record without them is judged by the opponent's name.
  const AI_NAME = /^(Forge AI|Bot \(.+\))$/i;
  const vsAI = (m) => (Array.isArray(m.participants) && m.participants.length
    ? m.participants.some((p) => p && p.isBot)
    : opps(m).some((p) => AI_NAME.test(p.name)));
  // Matches imported from the site's history that the tracker recorded too: the history gives them other ids. The
  // twin of an imported match is a recorded one against the same opponents, with the same result, started within
  // TWIN_MS; each pairs once, the nearest in time first (two matches an hour apart against one player stay two).
  // The history names players by their account, which the game can show otherwise ("Malpelo96 LPO" played as
  // "Malpelo96"): a recorded match answers to its in-game names and to its participants' accounts.
  // Returns the ids of the imported duplicates.
  const importing = (h, now = Date.now()) => !!h && Number.isFinite(h.until) && now < h.until;
  const TWIN_MS = 2 * 3600e3;
  function historyDuplicates(list) {
    const low = (n) => String(n).toLowerCase();
    const recorded = list.filter((m) => m.source !== 'history');
    const names = new Map(recorded.map((m) => [m, new Set([...opps(m).map((p) => p.name),
      ...(Array.isArray(m.participants) ? m.participants.map((p) => p && p.username) : [])].filter(Boolean).map(low))]));
    const pairs = [];
    for (const h of list) {
      if (h.source !== 'history') continue;
      const who = opps(h).map((p) => low(p.name));
      for (const m of recorded) {
        const dt = Math.abs(m.startedAt - h.startedAt);
        if (dt <= TWIN_MS && who.every((n) => names.get(m).has(n)) && (!h.result || !m.result || h.result === m.result)) pairs.push({ dt, h: h.id, m: m.id });
      }
    }
    const used = new Set();
    return pairs.sort((a, b) => a.dt - b.dt).filter((p) => !used.has(p.h) && !used.has(p.m) && used.add(p.h).add(p.m)).map((p) => p.h);
  }
  const colorsOf = (m) => [...new Set(opps(m).map((p) => m.colors[p.seat] || '').join(''))].join('');
  const gRes = (m, g) => (g.winnerSeat === undefined ? '' : g.winnerSeat === null ? 'D' : g.winnerSeat === m.mySeat ? 'W' : 'L');
  const onPlay = (m, g) => (g.firstSeat === undefined || g.firstSeat === null ? null : g.firstSeat === m.mySeat);
  const tally = () => ({ W: 0, L: 0, D: 0 });
  const pct = (r) => (r.W + r.L ? `${Math.round((100 * r.W) / (r.W + r.L))} %` : '—');
  const wl = (r) => `${r.W}–${r.L}${r.D ? `–${r.D}` : ''}`;
  const isLive = (m, now = Date.now()) => m.status === 'active' && now - m.updatedAt < STALE_MS;
  function scoreText(m) {
    if (!m.score || !m.score.length) return '';
    const others = m.score.filter((_, i) => i !== m.mySeat);
    return `${m.score[m.mySeat] || 0}–${Math.max(0, ...others)}`;
  }
  const pips = (c, t) => `<span class="pips">${String(c).replace(/[^WUBRG]/g, '').split('')
    .map((x) => `<span class="pip pip-${x}" title="${esc(t('color_' + x))}" aria-label="${esc(t('color_' + x))}">${x}</span>`).join('')}</span>`;
  // "5 minutes ago", "yesterday", then a date. i18n: { locale, t }.
  function ago(ts, i18n) {
    const rtf = new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' });
    const diff = (ts - Date.now()) / 1000;
    const a = Math.abs(diff);
    if (a < 60) return i18n.t('just_now');
    if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    if (a < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
    const d = new Date(ts);
    return d.toLocaleDateString(i18n.locale, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  // A deck picked by hand in the match detail (note.deckId) wins over what the tracker attributed.
  function myDeck(m, c) {
    const id = c.notes[m.id] && c.notes[m.id].deckId;
    if (!id) return m.myDeck;
    const d = c.decks[id] || {};
    return { id, name: d.name || null, cards: d.cards || null, sideboard: d.sideboard || null, source: 'manual' };
  }
  // The deck's current name on the site, else the one it had during the match: a deck renamed there keeps its matches.
  function deckName(m, c) {
    const d = myDeck(m, c);
    return d ? (obj(c.decks)[d.id] || {}).name || d.name || `Deck ${d.id.slice(0, 8)}` : m.limitedDeck ? c.t('limited_deck') : c.t('unknown');
  }
  // The format alone (the site's formatId, else its game kind; constructed without a banlist is "no banlist").
  // When the site's match details were missed (no formatId), the deck I played tells it, if its format fits the game (a
  // Duel Commander deck does not name a constructed game); otherwise the format is unknown, never "no banlist".
  function formatOf(m, c) {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    if (m.formatId && m.formatId !== 'casual') return cap(m.formatId);
    if (m.format && m.format !== 'constructed') return cap(m.format);
    if (m.formatId === 'casual') return c.t('casual');
    const deckFormat = deckFormatOf(m, c);
    return deckFormat ? cap(deckFormat) : c.t('format_unknown');
  }
  // The format of the deck I played, when it fits the game (a Duel Commander deck does not name a constructed game).
  function deckFormatOf(m, c) {
    const d = myDeck(m, c);
    const f = d && obj(c.decks)[d.id] && obj(c.decks)[d.id].formatId;
    const commander = (x) => /commander/i.test(x || '');
    return f && commander(f) === commander(`${m.gameType} ${m.format}`) ? f : null;
  }
  // In Duel Commander the opponent's deck is named after its commander ("A + B" for partners). Matches recorded
  // before 1.1.3 may also list the site's own command-zone effects.
  const NOT_COMMANDERS = new Set(['Commander Effect', 'Keyword Effects']);
  const commanderOf = (m) => (m.formatId !== 'duel-commander' ? ''
    : opps(m).map((p) => obj(m.commanders)[p.seat]).filter(Array.isArray).map((l) => l.filter((n) => !NOT_COMMANDERS.has(n)).join(' + ')).filter(Boolean).join(', '));
  // The opponent's archetype: the one I set by hand, else its commander.
  const archetype = (m, c) => (c.notes[m.id] && c.notes[m.id].archetype) || commanderOf(m);
  // The opponent's deck: the archetype I confirmed, else the recognized one, else its colours.
  function oppKey(m, c, guessName) {
    const a = archetype(m, c) || guessName;
    if (a) return 'a:' + a;
    const col = colorsOf(m);
    return col ? 'c:' + col : '?';
  }

  // The one metagame format (of those the site tracks) a match's opponent is compared with: the match's own, else for a
  // casual game or missed match details the format of the deck I played; null when neither is tracked. Never all of
  // them: each format costs endstep.cc about a hundred requests to load.
  function metaFormat(m, c, formats) {
    if (!Array.isArray(formats) || NO_RECOGNITION.test(`${m.format || ''} ${m.formatId || ''}`)) return null;
    if (formats.includes(m.formatId)) return m.formatId;
    const f = deckFormatOf(m, c);
    return formats.includes(f) ? f : null;
  }

  // The archetype endstep.cc's metagame suggests from the cards seen. meta: { formats, byFormat } as cached by the dashboard.
  function recognize(m, c, meta, Meta, T) {
    const f = meta && metaFormat(m, c, meta.formats);
    if (!f) return null;
    const cards = opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat)));
    if (cards.filter((x) => !BASIC.test(x)).length < 2) return null;
    const decks = (meta.byFormat && meta.byFormat[f] && meta.byFormat[f].decks) || [];
    return decks.length ? Meta.classify(cards, decks) : null;
  }

  const endOf = (m) => m.endedAt || m.updatedAt || m.startedAt;
  // The latest session: matches following each other with less than SESSION_GAP between them. list: newest first.
  function lastSession(list) {
    const out = [];
    for (const m of list) {
      if (vsAI(m)) continue;
      if (out.length && out[out.length - 1].startedAt - endOf(m) > SESSION_GAP) break;
      out.push(m);
    }
    return out;
  }
  const sessionOpen = (session, now = Date.now()) => session.length > 0 && now - endOf(session[0]) < SESSION_GAP;

  // Records count matches, never games: a match is on the play or on the draw as its game 1 was (the only game where
  // who starts owes nothing to the previous result). A live match counts in none.
  const firstGame = (m) => m.games.find((gm) => gm.n === 1) || null;
  const matchOnPlay = (m) => { const g1 = firstGame(m); return g1 ? onPlay(m, g1) : null; };
  function records(list, now = Date.now()) {
    const r = { m: tally(), play: tally(), draw: tally() };
    for (const m of list) {
      if (isLive(m, now) || vsAI(m) || !m.result) continue;
      r.m[m.result]++;
      const p = matchOnPlay(m);
      if (p !== null) (p ? r.play : r.draw)[m.result]++;
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

  // All of chrome.storage but the decision logs (dec:*), the bulk of it: those load one match at a time.
  async function loadStore() {
    const keys = (await chrome.storage.local.getKeys()).filter((k) => !k.startsWith('dec:'));
    return chrome.storage.local.get(keys);
  }

  // --- my cards: what I drew, and what I sided in and out ---
  // A decklist as { name: copies }, from the site's [{ name, quantity }] or a list of names.
  function deckCounts(cards) {
    if (!Array.isArray(cards)) return null;
    const c = {};
    for (const x of cards) {
      const name = typeof x === 'string' ? x : x && x.name;
      if (name) c[name] = (c[name] || 0) + (typeof x === 'string' ? 1 : x.quantity || 1);
    }
    return Object.keys(c).length ? c : null;
  }
  // My main deck in game n: as I submitted it when sideboarding (m.mains), else the list I registered for the match.
  function mainOf(m, n, c) {
    const sided = m.mains && m.mains[n];
    if (sided && Object.keys(sided).length) return sided;
    const d = myDeck(m, c);
    return deckCounts((d && d.cards) || (m.limitedDeck && m.limitedDeck.deck));
  }
  // What game n's main deck changes from game 1's: [name, +in / -out], additions first. null when not recorded.
  function sideChanges(m, n, c) {
    const to = n >= 2 && m.mains && m.mains[n];
    const from = to && mainOf(m, 1, c);
    if (!from) return null;
    return [...new Set([...Object.keys(from), ...Object.keys(to)])].map((name) => [name, (to[name] || 0) - (from[name] || 0)])
      .filter(([, d]) => d).sort((a, b) => Math.sign(b[1]) - Math.sign(a[1]) || Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]));
  }
  // My usual sideboarding in these matches: each card that went in (or out) after game 1, in how many of the matches
  // whose sideboarding was recorded, with its usual number of copies. { matches, in: [...], out: [...] },
  // entries { name, qty, times }, most frequent first.
  function sidePlan(list, c) {
    const moves = new Map(); // name -> { times, qty: Map(copies -> matches) } for additions (> 0) and cuts (< 0) apart
    let n = 0;
    for (const m of list) {
      const games = Object.keys(m.mains || {}).map(Number).filter((g) => g >= 2);
      const changes = games.map((g) => sideChanges(m, g, c)).filter(Boolean);
      if (!changes.length) continue;
      n++;
      const net = new Map(); // a match counts once per card: its largest move over the games after side
      for (const ch of changes) for (const [name, d] of ch) if (Math.abs(d) > Math.abs(net.get(name) || 0)) net.set(name, d);
      for (const [name, d] of net) {
        const k = (d > 0 ? '+' : '-') + name;
        const e = moves.get(k) || { name, times: 0, qty: new Map(), dir: Math.sign(d) };
        e.times++;
        e.qty.set(Math.abs(d), (e.qty.get(Math.abs(d)) || 0) + 1);
        moves.set(k, e);
      }
    }
    const usual = (e) => ({ name: e.name, times: e.times, qty: [...e.qty].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] });
    const side = (dir) => [...moves.values()].filter((e) => e.dir === dir).map(usual)
      .sort((a, b) => b.times - a.times || b.qty - a.qty || a.name.localeCompare(b.name));
    return { matches: n, in: side(1), out: side(-1) };
  }
  // My cards' results, counted in games (a card is drawn in a game, not in a match): the games where I drew it (in my
  // hand from turn 1 on, or played) against the games where it stayed in my library, and the games it was in my opening
  // hand. Drawn cards are recorded since 1.1 (g.drawn): older games count for the opening hand only.
  // [{ name, drawn, notDrawn, opening }], each a W/L/D tally; basic lands left out.
  function cardStats(list, c) {
    const by = new Map();
    const row = (name) => by.get(name) || by.set(name, { name, drawn: tally(), notDrawn: tally(), opening: tally() }).get(name);
    for (const m of list) {
      for (const g of m.games) {
        const r = gRes(m, g);
        if (!r) continue;
        if (Array.isArray(g.openingHand)) for (const name of new Set(g.openingHand)) row(name).opening[r]++;
        if (!g.drawn) continue;
        const drawn = new Set(Object.keys(g.drawn));
        for (const name of drawn) row(name).drawn[r]++;
        for (const name of Object.keys(mainOf(m, g.n, c) || {})) if (!drawn.has(name)) row(name).notDrawn[r]++;
      }
    }
    return [...by.values()].filter((x) => !BASIC.test(x.name));
  }

  // The usual side plan in one line per direction for the in-page panel and the popup: "+2 Pyroblast, +1 Duress".
  const sideLine = (xs, dir, max = 5) => xs.slice(0, max).map((x) => `${dir > 0 ? '+' : '−'}${x.qty} ${x.name}`).join(', ') + (xs.length > max ? ', …' : '');

  const Shared = {
    STALE_MS, SESSION_GAP, LANG_PREF, NO_RECOGNITION, BASIC,
    esc, obj, normalizeMatch, scoreText, pips, ago,
    HISTORY_IMPORT_MS, importing, opps, vsAI, historyDuplicates, colorsOf, gRes, onPlay, firstGame, matchOnPlay, tally, pct, wl, isLive,
    myDeck, deckName, formatOf, commanderOf, archetype, oppKey, metaFormat, recognize, lastSession, sessionOpen, records,
    deckCounts, mainOf, sideChanges, sidePlan, sideLine, cardStats,
    loadI18n, browserI18n, translator, loadStore,
  };
  if (typeof module === 'object' && module.exports) module.exports = Shared;
  else root.EndstepShared = Shared;
})(typeof self !== 'undefined' ? self : this);
