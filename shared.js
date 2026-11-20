// What the dashboard, the toolbar popup and the in-page panel must compute the same way: deck and format names,
// the opponent's archetype key, sessions, records, the metagame guess, and the strings.
// Pure functions; the match notes, my decks, their merges and moves, the translator and the cards' one names come in a
// context: { notes, decks, merges, formatMoves, t, canon }.
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
  // A deck list: card names, or { name, quantity } (anything else dropped).
  const cardList = (v) => (Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' || (x && typeof x.name === 'string' && (x.quantity === undefined || Number.isInteger(x.quantity)))) : null);
  // A map by id, read from storage or a backup: no name every object has ("constructor"), values checked by fix (null drops one).
  const byId = (v, fix) => Object.fromEntries(Object.entries(obj(v)).filter(([k]) => !(k in Object.prototype)).map(([k, x]) => [k, fix(x)]).filter(([, x]) => x));
  // My decks as seen on the site: { id: { name, format, formatId, cards, sideboard } }.
  const normalizeDecks = (v) => byId(v, (d) => {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    const out = { ...d };
    for (const k of ['name', 'format', 'formatId']) if (out[k] !== undefined && out[k] !== null && typeof out[k] !== 'string') delete out[k];
    for (const k of ['cards', 'sideboard']) if (out[k] !== undefined && out[k] !== null) out[k] = cardList(out[k]);
    return out;
  });
  // Decks merged into another one (deck tools): { id: { id, name, from } }.
  const normalizeMerges = (v) => byId(v, (to) => (to && typeof to.id === 'string' && to.id ? { ...to, name: typeof to.name === 'string' ? to.name : null } : null));
  // Decks moved to another format (same tools): { id: { format on the site: my format } }.
  const normalizeMoves = (v) => byId(v, (r) => { const to = byId(r, (x) => (typeof x === 'string' && x ? x : null)); return Object.keys(to).length ? to : null; });
  // Records come from the tracker or from an imported file: keep only what the pages can render. A field of the wrong
  // type is dropped, so that one odd record (a hand-edited backup) can neither stop the pages nor slip markup into them.
  const ids = (v) => Object.fromEntries(Object.entries(obj(v)).filter(([, x]) => Array.isArray(x))); // { card: [ids] }
  const MAX_DATE = 8.64e15; // beyond it, a Date is invalid
  function normalizeMatch(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || !Number.isFinite(m.startedAt) || Math.abs(m.startedAt) > MAX_DATE) return null;
    if (!Array.isArray(m.players) || !Array.isArray(m.games)) return null;
    m.players = m.players.filter((p) => p && typeof p === 'object' && Number.isInteger(p.seat)).map((p) => ({ ...p, name: String(p.name || '?') }));
    m.games = m.games.filter((g) => g && typeof g === 'object' && Number.isFinite(g.n)).map((g) => ({
      ...g, life: obj(g.life), log: Array.isArray(g.log) ? g.log.filter(Array.isArray) : [],
      mulligans: Object.fromEntries(Object.entries(obj(g.mulligans)).filter(([, k]) => Number.isInteger(k) && k >= 0)),
      seen: Object.fromEntries(Object.entries(obj(g.seen)).map(([seat, cards]) => [seat, ids(cards)])),
      drawn: g.drawn === undefined ? undefined : ids(g.drawn),
      played: g.played === undefined ? undefined : ids(g.played),
      board: g.board === undefined ? undefined : ids(g.board),
      openingHand: Array.isArray(g.openingHand) ? g.openingHand.filter((c) => typeof c === 'string') : undefined,
    }));
    if (!['W', 'L', 'D'].includes(m.result)) delete m.result;
    for (const k of ['format', 'formatId', 'gameType']) if (m[k] !== undefined && m[k] !== null && typeof m[k] !== 'string') delete m[k];
    for (const k of ['updatedAt', 'endedAt']) if (m[k] !== undefined && !(Number.isFinite(m[k]) && Math.abs(m[k]) <= MAX_DATE)) delete m[k];
    if (m.mains !== undefined) {
      m.mains = Object.fromEntries(Object.entries(obj(m.mains))
        .map(([n, c]) => [n, Object.fromEntries(Object.entries(obj(c)).filter(([, k]) => Number.isFinite(k) && k > 0))])
        .filter(([, c]) => Object.keys(c).length)); // an empty main is no main (it would read as every card taken out)
    }
    m.mySeat = Number.isInteger(m.mySeat) ? m.mySeat : null;
    const score = Array.isArray(m.score) ? m.score.map(Number) : [];
    m.score = score.every((x) => Number.isInteger(x) && x >= 0) ? score : [];
    if (m.gamesPerMatch !== undefined && !(Number.isInteger(m.gamesPerMatch) && m.gamesPerMatch > 0 && m.gamesPerMatch <= 9)) delete m.gamesPerMatch;
    if (m.participants !== undefined) m.participants = Array.isArray(m.participants) ? m.participants.filter((p) => p && typeof p.username === 'string') : [];
    m.colors = obj(m.colors);
    m.status = m.status === 'complete' || m.status === 'abandoned' ? m.status : 'active';
    if (!Number.isFinite(m.updatedAt)) m.updatedAt = m.startedAt;
    if (m.myDeck && (typeof m.myDeck !== 'object' || typeof m.myDeck.id !== 'string')) m.myDeck = null;
    if (m.myDeck && typeof m.myDeck.name !== 'string') m.myDeck = { ...m.myDeck, name: null };
    if (m.myDeck) m.myDeck = { ...m.myDeck, cards: cardList(m.myDeck.cards), sideboard: cardList(m.myDeck.sideboard) };
    if (m.ratings !== undefined) {
      const num = (v) => (Number.isFinite(v) ? v : undefined);
      m.ratings = Object.fromEntries(Object.entries(obj(m.ratings)).filter(([name, l]) => name && !(name in Object.prototype) && l && typeof l === 'object')
        .map(([name, l]) => [name, { score: num(l.score), rating: num(l.rating), rank: num(l.rank), of: num(l.of), top: num(l.top), provisional: l.provisional === true }]));
    }
    return m;
  }
  // A match's note, typed by me or imported: its text fields are text.
  function normalizeNote(n) {
    const out = { ...obj(n) };
    for (const k of ['archetype', 'notes', 'deckId', 'formatId']) if (out[k] !== undefined && typeof out[k] !== 'string') delete out[k];
    return out;
  }

  const opps = (m) => m.players.filter((p) => p && p.seat !== m.mySeat);
  // A ranked match's ladders as it started (m.ratings, by account): { mine, opp }, each null when unknown. The accounts
  // are matched with the names in the game (the game may shorten an account name) and with my account (me), if known.
  function ladders(m, me) {
    const r = obj(m.ratings);
    const names = Object.keys(r);
    const low = (n) => String(n || '').toLowerCase();
    const myName = low((m.players.find((p) => p.seat === m.mySeat) || {}).name);
    const isMe = (n) => (me ? low(n) === low(me) : !!myName && low(n) === myName);
    const isOpp = (n) => !isMe(n) && opps(m).some((p) => low(p.name) === low(n));
    const mine = names.find(isMe) || null;
    const opp = names.find(isOpp) || (mine && names.length === 2 ? names.find((n) => n !== mine) : null);
    return { mine: mine ? r[mine] : null, opp: opp ? r[opp] : null, oppName: opp };
  }
  // A ladder's score as the site shows it on a player's card, its chip ("Rating 1,613") and its detail on hover.
  const ladderScore = (l) => (l && Number.isFinite(l.score) ? l.score : l && Number.isFinite(l.rating) ? l.rating : null);
  const numberFormats = new Map(); // one per language
  const num = (n, locale) => (numberFormats.get(locale) || numberFormats.set(locale, new Intl.NumberFormat(locale)).get(locale)).format(n);
  function ladderTitle(name, l, i18n) {
    const n = (x) => num(x, i18n.locale);
    const place = Number.isFinite(l.rank) && Number.isFinite(l.of) ? i18n.t('rating_place', { rank: n(l.rank), of: n(l.of), top: Number.isFinite(l.top) ? l.top : '?' }) : '';
    return i18n.t('rating_title', { name, score: n(ladderScore(l)) }) + [place, l.provisional ? i18n.t('rating_provisional') : ''].filter(Boolean).map((x) => ` · ${x}`).join('');
  }
  function ladderChip(name, l, i18n) {
    return ladderScore(l) === null ? '' : `<span class="rating" title="${esc(ladderTitle(name, l, i18n))}">${esc(i18n.t('rating_short', { score: num(ladderScore(l), i18n.locale) }))}</span>`;
  }
  // A match against the site's AI (Forge AI, Auto-Pilot…): kept in the history, left out of every record. The site flags
  // bots in the match's participants; a record without them is judged by the opponent's name.
  const AI_NAME = /^(Forge AI|Bot \(.+\))$/i;
  const vsAI = (m) => (Array.isArray(m.participants) && m.participants.length
    ? m.participants.some((p) => p && p.isBot)
    : opps(m).some((p) => AI_NAME.test(p.name)));
  // The history import is on (historyImport: { until, read, added, completed, done, failed }).
  const importing = (h, now = Date.now()) => !!h && Number.isFinite(h.until) && now < h.until;
  // Matches imported from the site's history that the tracker recorded too: the history gives them other ids. The
  // twin of an imported match is a recorded one against the same opponents, with the same result, started within
  // TWIN_MS; each pairs once, the nearest in time first (two matches an hour apart against one player stay two).
  // The history names players by their account, which the game can show otherwise ("Malpelo96 LPO" played as
  // "Malpelo96"): a recorded match answers to its in-game names and to its participants' accounts.
  // Returns the pairs [{ h: imported id, m: recorded id }].
  const TWIN_MS = 2 * 3600e3;
  function historyPairs(list) {
    const low = (n) => String(n).toLowerCase();
    const at = new Map(list.map((m, i) => [m, i])); // ties go by the order of the list
    const recorded = list.filter((m) => m.source !== 'history').sort((a, b) => a.startedAt - b.startedAt);
    const first = (t) => { let lo = 0, hi = recorded.length; while (lo < hi) { const k = (lo + hi) >> 1; if (recorded[k].startedAt < t) lo = k + 1; else hi = k; } return lo; };
    const names = new Map(recorded.map((m) => [m, new Set([...opps(m).map((p) => p.name),
      ...(Array.isArray(m.participants) ? m.participants.map((p) => p && p.username) : [])].filter(Boolean).map(low))]));
    const pairs = [];
    for (const h of list) {
      if (h.source !== 'history') continue;
      const who = opps(h).map((p) => low(p.name));
      if (!who.length) continue;
      for (let i = first(h.startedAt - TWIN_MS); i < recorded.length && recorded[i].startedAt <= h.startedAt + TWIN_MS; i++) {
        const m = recorded[i];
        const dt = Math.abs(m.startedAt - h.startedAt);
        // One that was over before the other began is another match (a rematch): a minute allowed for the clocks.
        const apart = (h.endedAt && h.endedAt + 60e3 < m.startedAt) || (m.endedAt && m.endedAt + 60e3 < h.startedAt);
        if (dt <= TWIN_MS && !apart && who.every((n) => names.get(m).has(n)) && (!h.result || !m.result || h.result === m.result)) pairs.push({ dt, h: h.id, m: m.id, o: [at.get(h), at.get(m)] });
      }
    }
    const used = new Set();
    return pairs.sort((a, b) => a.dt - b.dt || a.o[0] - b.o[0] || a.o[1] - b.o[1]).filter((p) => !used.has(p.h) && !used.has(p.m) && used.add(p.h).add(p.m)).map(({ h, m }) => ({ h, m }));
  }
  // A recorded match the tracker caught only in part (it woke up mid-match: no format, no deck, no result), completed
  // from its twin in the site's history. Fills only what is missing; returns the fields it filled.
  function fillFromHistory(m, h, mark = true) {
    const filled = [];
    if (!m.formatId && h.formatId) { m.formatId = h.formatId; filled.push('formatId'); }
    if (m.ranked === undefined && typeof h.ranked === 'boolean') { m.ranked = h.ranked; filled.push('ranked'); }
    if (!m.myDeck && !m.limitedDeck && h.myDeck) { m.myDeck = h.myDeck; filled.push('myDeck'); }
    if (m.status !== 'complete' && h.result) {
      Object.assign(m, { status: 'complete', result: h.result });
      // Each score by its own seats: an imported one has mine at 0, another recorded copy may not.
      const others = opps(m);
      const theirs = opps(h);
      if (others.length === 1 && theirs.length === 1 && Number.isInteger(m.mySeat) && Number.isInteger(h.mySeat) && Array.isArray(h.score) && h.score.length) {
        const score = [];
        score[m.mySeat] = h.score[h.mySeat];
        score[others[0].seat] = h.score[theirs[0].seat];
        m.score = Array.from(score, (x) => x || 0);
      }
      filled.push('result');
    }
    if (!m.endedAt && h.endedAt) { m.endedAt = h.endedAt; filled.push('endedAt'); }
    if (filled.length && mark) m.historyFilled = [...new Set([...(Array.isArray(m.historyFilled) ? m.historyFilled : []), ...filled])];
    return filled;
  }
  // Two copies of one match (two computers, a backup imported): the fuller one stays, completed with what the other
  // has and it lacks. Fuller: more of the games seen (logged events, game starts); the match details only break a tie,
  // the copy kept takes them from the other anyway.
  const fullness = (m) => m.games.reduce((n, g) => n + (Array.isArray(g.log) ? g.log.length : 0) + (g.firstSeat === undefined || g.firstSeat === null ? 0 : 20), 0)
    + (m.formatId ? 0.1 : 0) + (m.myDeck ? 0.1 : 0) + (m.result ? 0.1 : 0);
  function mergeMatch(a, b) {
    if (!a || !b) return a || b;
    const [keep, other] = fullness(b) > fullness(a) ? [b, a] : [a, b];
    fillFromHistory(keep, other, false);
    return keep;
  }
  // My account on the site: the one name among the participants of every match whose details were seen (null when
  // that is not one name).
  function myAccount(list) {
    const counts = new Map();
    let n = 0;
    for (const m of list) {
      if (!Array.isArray(m.participants) || !m.participants.length) continue;
      n++;
      for (const name of new Set(m.participants.map((p) => p && p.username).filter(Boolean))) counts.set(name, (counts.get(name) || 0) + 1);
    }
    const all = [...counts].filter(([, k]) => k === n).map(([name]) => name);
    return all.length === 1 ? all[0] : null;
  }
  // Who a match was against, lowercased: the opponents' names in the game and, my account known, their accounts too
  // (what the history names them by).
  function oppIds(m, me) {
    const ids = opps(m).map((p) => p.name);
    if (me && Array.isArray(m.participants)) for (const p of m.participants) if (p && p.username && p.username !== me) ids.push(p.username);
    return new Set(ids.filter((n) => n && n !== '?').map((n) => n.toLowerCase()));
  }
  // My earlier matches against the same player, bots left out, newest first.
  function metBefore(m, list) {
    const me = myAccount(list);
    const ids = oppIds(m, me);
    return list.filter((x) => x.id !== m.id && x.startedAt < m.startedAt && !vsAI(x) && [...oppIds(x, me)].some((n) => ids.has(n)))
      .sort((a, b) => b.startedAt - a.startedAt);
  }
  const colorsOf = (m) => [...new Set(opps(m).map((p) => m.colors[p.seat] || '').join(''))].join('');
  const gRes = (m, g) => (g.winnerSeat === undefined || m.mySeat === null ? '' : g.winnerSeat === null ? 'D' : g.winnerSeat === m.mySeat ? 'W' : 'L');
  const onPlay = (m, g) => (g.firstSeat === undefined || g.firstSeat === null ? null : g.firstSeat === m.mySeat);
  const tally = () => ({ W: 0, L: 0, D: 0 });
  const count = (r) => r.W + r.L + r.D; // the results a tally holds
  const MIN_SAMPLE = 10; // below this many results a win rate is noise: the W–L alone
  // A rate in the language's format: 54 % in French, 54% in English.
  const percents = new Map();
  const percent = (x, locale = 'en') => (percents.get(locale) || percents.set(locale, new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })).get(locale)).format(x);
  const pct = (r, locale) => (r.W + r.L ? percent(r.W / (r.W + r.L), locale) : '—');
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
  const formats = new Map(); // language -> its formatters: building one costs more than formatting a date
  function ago(ts, i18n) {
    if (!formats.has(i18n.locale)) formats.set(i18n.locale, { rtf: new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto' }),
      day: new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short' }), year: new Intl.DateTimeFormat(i18n.locale, { day: 'numeric', month: 'short', year: 'numeric' }) });
    const { rtf, day, year } = formats.get(i18n.locale);
    const diff = (ts - Date.now()) / 1000;
    const a = Math.abs(diff);
    if (a < 60) return i18n.t('just_now');
    const sign = Math.sign(diff); // the unit is chosen on the rounded value: 59.6 minutes is an hour, not "60 minutes"
    if (Math.round(a / 60) < 60) return rtf.format(sign * Math.round(a / 60), 'minute');
    if (Math.round(a / 3600) < 24) return rtf.format(sign * Math.round(a / 3600), 'hour');
    if (Math.round(a / 86400) < 7) return rtf.format(sign * Math.round(a / 86400), 'day');
    return (new Date(ts).getFullYear() === new Date().getFullYear() ? day : year).format(ts);
  }

  // A deck picked by hand in the match detail (note.deckId) wins over what the tracker attributed.
  // A deck merged into another (the dashboard's deck tools, c.merges: { deckId: { id, name, from } }) counts as that one;
  // each match keeps its own list, so the merged deck's lists show as versions. A merge of a merge is followed; merges
  // that go round (A into B here, B into A in an imported backup) merge nothing.
  function mergedInto(id, c) {
    let to = null;
    const seen = new Set([id]);
    for (let hop = 0, at = id; hop < 5 && at && Object.hasOwn(obj(c.merges), at); hop++) { to = c.merges[at]; at = to.id; if (seen.has(at)) return null; seen.add(at); }
    return to;
  }
  function myDeck(m, c) {
    const id = c.notes[m.id] && c.notes[m.id].deckId;
    if (!id) {
      const to = m.myDeck && mergedInto(m.myDeck.id, c);
      return to ? { ...m.myDeck, id: to.id, name: to.name, source: 'merged' } : m.myDeck;
    }
    const d = (Object.hasOwn(obj(c.decks), id) && c.decks[id]) || {};
    const to = mergedInto(id, c);
    return { id: to ? to.id : id, name: (to && to.name) || d.name || null, cards: d.cards || null, sideboard: d.sideboard || null, source: 'manual' };
  }
  // The deck's current name on the site, else the one it had during the match: a deck renamed there keeps its matches.
  // The deck the site saves from a limited pool, a new one at each draft, is named after its kind and the day: they all make
  // one entry, not one per day. Renamed on the site, it is a deck of its own. ponytail: tied to the site's wording (DeckBuildView).
  const sitePool = (name) => /^(Draft|Sealed) pool \S+ \d{4}-\d{2}-\d{2}$/.test(name || '');
  function deckName(m, c) {
    const d = myDeck(m, c);
    if (!d) return m.limitedDeck ? c.t('limited_deck') : c.t('unknown');
    const name = ((Object.hasOwn(obj(c.decks), d.id) && c.decks[d.id]) || {}).name || d.name || `Deck ${d.id.slice(0, 8)}`;
    return sitePool(name) ? c.t('limited_deck') : name;
  }
  // The format as the site names it: its formatId, else its game kind ('casual' is constructed without a banlist). When
  // the site's match details were missed (no formatId), the deck I played tells it, if its format fits the game (a Duel
  // Commander deck does not name a constructed game); otherwise the format is unknown (null), never "no banlist".
  function siteFormat(m, c) {
    if (m.formatId && m.formatId !== 'casual') return m.formatId;
    if (duelCommander(m)) return 'duel-commander'; // match details missed: the game itself says so
    if (m.format && m.format !== 'constructed') return m.format;
    if (m.formatId === 'casual') return 'casual';
    return deckFormatOf(m, c);
  }
  // The ids a match's deck goes by: the one it counts under, and the one it had before a merge (picked by hand, else as
  // recorded; a deck picked by hand replaces the recorded one). A merge keeps a deck's moves.
  const deckIds = (m, c) => [(myDeck(m, c) || {}).id, (c.notes[m.id] && c.notes[m.id].deckId) || (m.myDeck && m.myDeck.id)].filter(Boolean);
  // The format I moved a match to (the dashboard's deck tools): this match alone (note.formatId), or a deck's matches of
  // one format on the site, the next ones included (c.formatMoves: { deckId: { format on the site, '' if unknown: mine } }).
  function movedFormat(m, c) {
    const picked = c.notes[m.id] && c.notes[m.id].formatId;
    if (picked) return picked;
    const from = siteFormat(m, c) || '';
    for (const id of deckIds(m, c)) {
      const to = obj(obj(c.formatMoves)[id])[from];
      if (to && typeof to === 'string') return to;
    }
    return null;
  }
  const formatKey = (m, c) => movedFormat(m, c) || siteFormat(m, c);
  function formatLabel(key, c) {
    return key === 'casual' ? c.t('casual') : key ? String(key).charAt(0).toUpperCase() + String(key).slice(1) : c.t('format_unknown');
  }
  const formatOf = (m, c) => formatLabel(formatKey(m, c), c);
  // The format of the deck I played, when it fits the game (a Duel Commander deck does not name a constructed game).
  function deckFormatOf(m, c) {
    const d = myDeck(m, c);
    const f = d && Object.hasOwn(obj(c.decks), d.id) && obj(c.decks[d.id]).formatId;
    const commander = (x) => /commander/i.test(x || '');
    return f && commander(f) === commander(`${m.gameType} ${m.format}`) ? f : null;
  }
  // In Duel Commander the opponent's deck is named after its commander ("A + B" for partners). Matches recorded
  // before 1.1.3 may also list the site's own command-zone effects.
  const NOT_COMMANDERS = new Set(['Commander Effect', 'Keyword Effects']);
  // A Duel Commander match: by its format, else by the game's own kind when the match details were missed (the tracker
  // woke up after the page had loaded them).
  const duelCommander = (m) => m.formatId === 'duel-commander' || (!m.formatId && m.gameType === 'DuelCommander');
  const commanderOf = (m) => (!duelCommander(m) ? ''
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
    const moved = movedFormat(m, c);
    if (moved) return formats.includes(moved) ? moved : null; // no metagame there: compared with nothing, not the old format
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
  // Sessions: matches following each other with less than SESSION_GAP between them. list: newest first, and so is each.
  function sessions(list) {
    const out = [];
    for (const m of list) {
      const cur = out[out.length - 1];
      if (cur && cur[cur.length - 1].startedAt - endOf(m) <= SESSION_GAP) cur.push(m);
      else out.push([m]);
    }
    return out;
  }
  const lastSession = (list) => sessions(list.filter((m) => !vsAI(m)))[0] || [];
  // The history by day: a match counts for the day it was played, a night past midnight for its evening (one started
  // before 5 o'clock goes to the day before). dayOf: that day's key. list: newest first, and so is each day.
  const DAY_START_MS = 5 * 3600e3;
  const dayOf = (m) => new Date(m.startedAt - DAY_START_MS).toDateString();
  function days(list) {
    const out = [];
    for (const m of list) {
      const cur = out[out.length - 1];
      if (cur && dayOf(cur[0]) === dayOf(m)) cur.push(m);
      else out.push([m]);
    }
    return out;
  }
  // The matches played right after two losses in a row in the same session (ids). A draw ends the run; a match without
  // a result (live, unfinished) leaves it as it is. list: newest first.
  function afterTwoLosses(list) {
    const out = new Set();
    for (const s of sessions(list.filter((m) => !vsAI(m)))) {
      let run = 0;
      for (const m of s.slice().reverse()) {
        if (!m.result) continue;
        if (run >= 2) out.add(m.id);
        run = m.result === 'L' ? run + 1 : 0;
      }
    }
    return out;
  }
  // The format and deck of my last match, newest first in the list: what the dashboard opens on. Not one against the AI
  // (a deck trained against it would open on empty records), and a match whose deck is unknown only when no other has one.
  function lastPlayed(list, c) {
    const rated = list.filter((m) => !vsAI(m));
    const m = rated.find((x) => myDeck(x, c) || x.limitedDeck) || rated[0];
    return m ? { format: formatOf(m, c), deck: deckName(m, c) } : { format: null, deck: null };
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
  // The one record counted in games: game 1, played with the main deck, against the games after sideboarding (2 and 3),
  // to tell whether my sideboarding works. Games whose winner is known, in the matches records() counts; a Bo1 has
  // game 1 only. { g1, post }
  function sideRecords(list, now = Date.now()) {
    const r = { g1: tally(), post: tally() };
    for (const m of list) {
      if (isLive(m, now) || vsAI(m) || !m.result) continue;
      for (const g of m.games) { const x = gRes(m, g); if (x) r[g.n === 1 ? 'g1' : 'post'][x]++; }
    }
    return r;
  }

  // Strings. Extension pages read _locales themselves so the language picked in the dashboard wins over the browser's;
  // content scripts cannot fetch extension files and use the browser's lookup, in the browser's language.
  const LANGS = ['en', 'fr', 'es', 'de', 'it', 'pt'];
  const LOCALE_DIR = { pt: 'pt_BR' }; // Chrome has no plain pt folder
  const LANG_PREF = 'endstep-tracker.lang';
  const baseLang = (l) => String(l || '').toLowerCase().split('-')[0];
  function translator(locale, lookup) {
    const rules = new Intl.PluralRules(locale);
    const t = (key, vars) => {
      let s = lookup(key) || key;
      if (vars) s = s.replace(/\{(\w+)\}/g, (all, k) => (Object.hasOwn(vars, k) ? String(vars[k] ?? '') : all)); // one pass: a value holding "{x}" stays as it is
      return s;
    };
    return { locale, t, tn: (key, n, vars) => t(`${key}_${rules.select(n)}`, { n, ...vars }) };
  }
  async function loadI18n() {
    let saved = null;
    try { saved = localStorage.getItem(LANG_PREF); } catch { /* storage unavailable */ }
    const locale = [saved, navigator.language].map(baseLang).find((l) => LANGS.includes(l)) || 'en';
    const read = async (lang) => { try { return await (await fetch(`_locales/${LOCALE_DIR[lang] || lang}/messages.json`)).json(); } catch { return {}; } };
    const messages = Object.assign(await read('en'), locale === 'en' ? {} : await read(locale)); // English fills any gap
    return translator(locale, (k) => messages[k] && messages[k].message);
  }
  function browserI18n() {
    const ui = baseLang(chrome.i18n.getUILanguage());
    return translator(LANGS.includes(ui) ? ui : 'en', (k) => chrome.i18n.getMessage(k));
  }

  // Feedback: a Tally form the user opens by a click. The link says which version, browser and language a report is
  // about; nothing else, and the extension itself sends nothing.
  const FEEDBACK = 'https://tally.so/r/LZQveG';
  function browserName(manifest, nav) {
    const bss = (manifest && manifest.browser_specific_settings) || {};
    const ua = (nav && nav.userAgent) || '';
    return bss.safari ? 'Safari' : bss.gecko || /Firefox\//.test(ua) ? 'Firefox' : / Edg\//.test(ua) ? 'Edge' : / OPR\//.test(ua) ? 'Opera'
      : nav && nav.brave ? 'Brave' : 'Chrome';
  }
  const feedbackUrl = (version, browser, lang) => `${FEEDBACK}?${new URLSearchParams({ version, browser, lang })}`;
  function feedbackLink(lang) {
    let manifest = {};
    try { manifest = chrome.runtime.getManifest(); } catch { /* a test page */ }
    return feedbackUrl(manifest.version || '?', browserName(manifest, typeof navigator === 'object' ? navigator : null), lang);
  }

  // Whether the extension may run on endstep.cc on its own. A browser can be set to give it the site only on a click on
  // its icon: it then wakes up mid-match and records it in part (no format, no deck, no game start).
  const SITE = { origins: ['https://endstep.cc/*'] };
  async function hasSiteAccess() { try { return await chrome.permissions.contains(SITE); } catch { return true; } } // unknown: no false alarm
  async function askSiteAccess() { try { return await chrome.permissions.request(SITE); } catch { return false; } }

  // The Safari build shows no tip link (Apple refuses them, guideline 3.1.1): its manifest names Safari.
  function dropTipLinks() {
    let safari = false;
    try { safari = !!(chrome.runtime.getManifest().browser_specific_settings || {}).safari; } catch { /* no manifest: a test page */ }
    if (safari) for (const el of document.querySelectorAll('.bmc')) el.remove();
  }

  // "What's new": the newest of `releases` (X.Y) after the one last seen and up to the running one, else null. Nothing
  // seen means an update from before the panel existed: background.js marks a fresh install's release as seen.
  const byRelease = (a, b) => a.localeCompare(b, 'en', { numeric: true }); // 1.10 after 1.9
  const newsDue = (releases, seen, running) => releases.filter((r) => byRelease(r, seen || '0') > 0 && byRelease(r, running) <= 0)
    .sort(byRelease).pop() || null;

  // The popup's and the in-page panel's copy of storage, kept up to date key by key: d = { matches: Map, notes, decks,
  // merges, formatMoves, meta, settings }. The matches lose their logs, never shown there and the heaviest part of a
  // record. Returns false for a key it does not keep.
  function applyStored(d, k, v) {
    if (k.startsWith('match:')) {
      const m = v === undefined ? null : normalizeMatch(v);
      if (m) { for (const g of m.games) g.log = []; d.matches.set(m.id, m); } else d.matches.delete(k.slice(6));
    } else if (k.startsWith('note:')) { if (v === undefined) delete d.notes[k.slice(5)]; else d.notes[k.slice(5)] = normalizeNote(v); }
    else if (k === 'decks') d.decks = normalizeDecks(v);
    else if (k === 'deckMerges') d.merges = normalizeMerges(v); // decks merged in the dashboard
    else if (k === 'formatMoves') d.formatMoves = normalizeMoves(v); // decks moved to another format in the dashboard
    else if (k === 'meta') d.meta = v ? { formats: v.formats, byFormat: obj(v.byFormat) } : null;
    else if (k === 'settings') d.settings = obj(v);
    else return false;
    return true;
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
  // A card's one name (c.canon, which the dashboard and the popup take from Scryfall): Beholder's Sleep Ray is Stifle.
  // Without it, the site's names. Applied when showing or exporting, never stored.
  const canonOf = (c) => (c && c.canon) || ((name) => name);
  // The names the dashboard looked up, kept in localStorage: read by the extension's pages (the in-page panel cannot
  // reach it), and only the dashboard asks Scryfall.
  const CARD_NAMES = 'endstep-tracker.cardNames';
  function savedCardNames() { try { return JSON.parse(localStorage.getItem(CARD_NAMES)) || {}; } catch { return {}; } }
  // A decklist { name: copies } under each card's one name: two printings of one card add up.
  function canonCounts(counts, c) {
    const canon = canonOf(c);
    const out = {};
    for (const [name, k] of Object.entries(counts)) out[canon(name)] = (out[canon(name)] || 0) + k;
    return out;
  }
  // My cards of one bucket of game g (key: drawn, played or board) as { name: copies }, one name per card: a transformed
  // double-faced card shows its other face (King T'Challa becomes Black Panther) under the same id within the game, and
  // the name it was first recorded under, in my hand, wins; then its one name (c.canon).
  function cardAliases(g) {
    const alias = new Map(); // card id -> name
    for (const bucket of [g.drawn, g.played, g.board]) {
      for (const [name, ids] of Object.entries(bucket || {})) for (const id of ids) if (id !== '?' && !alias.has(id)) alias.set(id, name);
    }
    return alias;
  }
  function gameCards(g, key, c, alias = cardAliases(g)) {
    const canon = canonOf(c);
    const copies = new Map(); // name -> distinct copies (an unknown id is one copy of the name it was recorded under)
    for (const [name, ids] of Object.entries(g[key] || {})) {
      for (const id of ids) {
        const one = canon(alias.get(id) || name);
        (copies.get(one) || copies.set(one, new Set()).get(one)).add(id === '?' ? `?${name}` : id);
      }
    }
    return Object.fromEntries([...copies].map(([name, s]) => [name, s.size]));
  }
  // What game n's main deck changes from game 1's: [name, +in / -out], additions first. null when not recorded. Each card
  // under its one name: a printing swapped for another of the same card is no change.
  function sideChanges(m, n, c) {
    const sided = n >= 2 && m.mains && m.mains[n];
    const before = sided && mainOf(m, 1, c);
    if (!before) return null;
    const [from, to] = [before, sided].map((x) => canonCounts(x, c));
    return [...new Set([...Object.keys(from), ...Object.keys(to)])].map((name) => [name, (to[name] || 0) - (from[name] || 0)])
      .filter(([, d]) => d).sort((a, b) => Math.sign(b[1]) - Math.sign(a[1]) || Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0]));
  }
  // My usual sideboarding in these matches: each card that went in (or out) after game 1, in how many of the matches
  // whose sideboarding was recorded, with its usual number of copies. { matches, in: [...], out: [...] },
  // entries { name, qty, times }, most frequent first; a card is one entry whatever printing each match used (sideChanges).
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
  // The cards of my deck as recorded with a match, each under its one name: its main, its sideboard (a companion, a wish
  // target) and its commanders.
  function deckNames(m, c) {
    const canon = canonOf(c);
    const d = myDeck(m, c);
    const lists = [d && d.cards, d && d.sideboard, d && (obj(c.decks)[d.id] || {}).commanders];
    return new Set(lists.flatMap((l) => Object.keys(deckCounts(l) || {})).map(canon));
  }
  // My cards' results, counted in games (a card is drawn in a game, not in a match): the games where I drew it (in my
  // hand from turn 1 on, or played) against the games where it stayed in my library, and the games it was in my opening
  // hand. Drawn cards are recorded since 1.1 (g.drawn): older games count for the opening hand only.
  // [{ name, drawn, notDrawn, opening, later, played, drawnTracked, used, board, boardOnly }], each a W/L/D tally; basic
  // lands left out.
  function cardStats(list, c, now = Date.now()) {
    const by = new Map();
    const canon = canonOf(c);
    const row = (name) => by.get(name) || by.set(name, { name, drawn: tally(), notDrawn: tally(), opening: tally(), later: tally(), played: tally(), drawnTracked: tally(), used: tally(), board: tally(), boardOnly: tally() }).get(name);
    for (const m of list) {
      if (isLive(m, now)) continue; // as the other records: the match in play waits for its end
      const own = m.games.length ? deckNames(m, c) : null;
      const lists = new Map(); // game n (0: not sided) -> its main's cards, and my deck's
      const listOf = (n) => {
        const k = m.mains && m.mains[n] && Object.keys(m.mains[n]).length ? n : 0;
        if (!lists.has(k)) {
          const main = mainOf(m, n, c);
          const inMain = main && new Set(Object.keys(main).map(canon));
          lists.set(k, { inMain, inDeck: inMain && new Set([...inMain, ...own]) });
        }
        return lists.get(k);
      };
      for (const g of m.games) {
        const r = gRes(m, g);
        if (!r) continue;
        if (Array.isArray(g.openingHand)) for (const name of new Set(g.openingHand.map(canon))) row(name).opening[r]++;
        if (!g.drawn) continue;
        const alias = cardAliases(g);
        // A bucket's cards, one card one name (gameCards' names, without counting the copies).
        const names = (key) => new Set(Object.entries(g[key] || {}).flatMap(([name, ids]) => ids.map((id) => canon(alias.get(id) || name))));
        // Only cards of my deck: its main for that game, its sideboard (a companion, a wish target) and its commanders; an
        // opponent's card that went through my hand, or that I cast or took, is not one (unknown main: all count).
        const { inMain, inDeck } = listOf(g.n);
        const mine = (name) => !inDeck || inDeck.has(name);
        const drawn = new Set([...names('drawn')].filter(mine));
        // Drawn later: in my hand during the game but not in the kept seven (unknown when the opening hand was missed).
        const kept = Array.isArray(g.openingHand) ? new Set(g.openingHand.map(canon)) : null;
        for (const name of drawn) { row(name).drawn[r]++; if (kept && !kept.has(name)) row(name).later[r]++; }
        for (const name of inMain || []) if (!drawn.has(name)) row(name).notDrawn[r]++;
        // Played and in play, recorded since 1.5.6 (games without the buckets count for neither); drawnTracked: the drawn
        // games that could say whether the card was played, for the ratios; used: those where I cast it or it reached my
        // battlefield (the cards I draw and leave in my hand have few).
        const board = g.board ? names('board') : null;
        if (g.played) {
          const played = names('played');
          for (const name of drawn) { row(name).drawnTracked[r]++; if (played.has(name) || (board && board.has(name))) row(name).used[r]++; }
          for (const name of played) if (mine(name)) row(name).played[r]++;
        }
        if (board) for (const name of board) if (mine(name)) { row(name).board[r]++; if (!drawn.has(name)) row(name).boardOnly[r]++; }
      }
    }
    return [...by.values()].filter((x) => !BASIC.test(x.name));
  }

  // The opponents' cards against me, counted in games: each card they cast, played as a land, activated or triggered in a
  // game (one name per card, c.canon), my results in those games against my results in the other games of the same
  // archetypes (keyOf(m): the match's archetype key), so that a card played by one deck is weighed against that deck.
  // Live matches, matches against the AI and lands left out (a card played as a land in one of these games, by anyone, and
  // the basics). [{ name, played, notPlayed, keys: Map(key -> games) }]
  const THEIR_PLAYS = new Set(['SPELL_CAST', 'LAND_PLAYED', 'ABILITY_ACTIVATED', 'TRIGGER_FIRED']);
  // The names of the cards the opponents played in game g, as the site gave them.
  const theirPlays = (m, g) => new Set(g.log.filter(([, seat, type, name]) => seat !== m.mySeat && name && THEIR_PLAYS.has(type)).map((e) => e[3]));
  function theirCardStats(list, c, keyOf, now = Date.now()) {
    const canon = canonOf(c);
    const all = new Map(); // archetype key -> my results in its games
    const by = new Map(); // card -> { name, played, keys }
    const lands = new Set();
    for (const m of list) for (const g of m.games) for (const [, , type, name] of g.log) if (type === 'LAND_PLAYED' && name) lands.add(canon(name));
    for (const m of list) {
      if (isLive(m, now) || vsAI(m) || m.mySeat === null) continue;
      const key = keyOf(m);
      for (const g of m.games) {
        const r = gRes(m, g);
        if (!r) continue;
        (all.get(key) || all.set(key, tally()).get(key))[r]++;
        for (const name of new Set([...theirPlays(m, g)].map(canon))) {
          if (BASIC.test(name) || lands.has(name)) continue;
          const e = by.get(name) || by.set(name, { name, played: tally(), keys: new Map() }).get(name);
          e.played[r]++;
          (e.keys.get(key) || e.keys.set(key, tally()).get(key))[r]++;
        }
      }
    }
    return [...by.values()].map((e) => {
      const notPlayed = tally();
      for (const [key, p] of e.keys) for (const x of ['W', 'L', 'D']) notPlayed[x] += all.get(key)[x] - p[x];
      return { ...e, notPlayed };
    });
  }

  // My lands, by their one name: the cards I ever played as a land (a basic counts even before that).
  const landsOf = new WeakMap(); // match -> the names I played as a land in it
  function landNames(list, c) {
    const canon = canonOf(c);
    const out = new Set();
    for (const m of list) {
      if (!landsOf.has(m)) {
        const names = new Set();
        for (const g of m.games) for (const [, seat, type, name] of g.log) if (type === 'LAND_PLAYED' && seat === m.mySeat && name) names.add(name);
        landsOf.set(m, names);
      }
      for (const name of landsOf.get(m)) out.add(canon(name));
    }
    return out;
  }
  // My results by the lands in my kept hand, counted in games: [0 or 1, 2, 3, 4 or more], each { all, play, draw }.
  // Games whose hand the tracker missed count for none.
  function landRecords(list, lands, c, now = Date.now()) {
    const canon = canonOf(c);
    const r = [0, 1, 2, 3].map(() => ({ all: tally(), play: tally(), draw: tally() }));
    for (const m of list) {
      if (isLive(m, now) || vsAI(m) || !m.result) continue;
      for (const g of m.games) {
        const x = gRes(m, g);
        if (!x || !Array.isArray(g.openingHand)) continue;
        const n = g.openingHand.filter((name) => { const k = canon(name); return BASIC.test(k) || lands.has(k); }).length;
        const b = r[Math.min(3, Math.max(0, n - 1))];
        b.all[x]++;
        const p = onPlay(m, g);
        if (p !== null) b[p ? 'play' : 'draw'][x]++;
      }
    }
    return r;
  }

  // The usual side plan in one line per direction for the in-page panel and the popup: "+2 Pyroblast, +1 Duress".
  const sideLine = (xs, dir, max = 5) => xs.slice(0, max).map((x) => `${dir > 0 ? '+' : '−'}${x.qty} ${x.name}`).join(', ') + (xs.length > max ? ', …' : '');

  const Shared = {
    STALE_MS, LANG_PREF, NO_RECOGNITION, BASIC,
    esc, obj, normalizeMatch, normalizeNote, normalizeDecks, normalizeMerges, normalizeMoves, scoreText, pips, ago,
    HISTORY_IMPORT_MS, importing, opps, ladders, ladderScore, ladderTitle, ladderChip, num, vsAI, historyPairs, fillFromHistory, mergeMatch, myAccount, metBefore, colorsOf, gRes, onPlay, firstGame, matchOnPlay, tally, count, MIN_SAMPLE, percent, pct, wl, isLive,
    myDeck, mergedInto, sitePool, deckName, deckIds, siteFormat, formatKey, formatLabel, formatOf, commanderOf, archetype, oppKey, metaFormat, recognize, sessions, lastSession, DAY_START_MS, dayOf, days, afterTwoLosses, lastPlayed, sessionOpen, records, sideRecords,
    deckCounts, mainOf, deckNames, CARD_NAMES, savedCardNames, canonCounts, cardAliases, gameCards, sideChanges, sidePlan, sideLine, cardStats, theirPlays, theirCardStats, landNames, landRecords,
    loadI18n, browserI18n, translator, applyStored, loadStore, dropTipLinks, newsDue, hasSiteAccess, askSiteAccess, browserName, feedbackUrl, feedbackLink,
  };
  if (typeof module === 'object' && module.exports) module.exports = Shared;
  else root.EndstepShared = Shared;
})(typeof self !== 'undefined' ? self : this);
