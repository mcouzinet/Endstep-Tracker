// Dashboard: match history, stats, annotations and exports.
const T = self.EndstepTracker;
const Meta = self.EndstepMeta;
const Coach = self.EndstepCoach;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s === undefined || s === null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- i18n: every string lives in _locales/<lang>/messages.json (the manifest reads the same files) ---
const LANGS = ['en', 'fr'];
const LANG_PREF = 'endstep-tracker.lang';
let locale = 'en';
let messages = {};
let pluralRules = new Intl.PluralRules('en');
const t = (key, vars) => {
  let s = messages[key] ? messages[key].message : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
};
const tn = (key, n, vars) => t(`${key}_${pluralRules.select(n)}`, { n, ...vars });

function pickLocale() {
  const base = (l) => String(l || '').toLowerCase().split('-')[0];
  let saved = null;
  try { saved = localStorage.getItem(LANG_PREF); } catch { /* storage unavailable */ }
  for (const l of [saved, navigator.language]) if (LANGS.includes(base(l))) return base(l);
  return 'en';
}

async function initI18n() {
  locale = pickLocale();
  const read = async (lang) => { try { return await (await fetch(`_locales/${lang}/messages.json`)).json(); } catch { return {}; } };
  messages = Object.assign(await read('en'), locale === 'en' ? {} : await read(locale)); // English fills any gap
  pluralRules = new Intl.PluralRules(locale);
  document.documentElement.lang = locale;
  $('#lang').value = locale;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) { const [attr, key] = pair.split(':'); el.setAttribute(attr, t(key)); }
  }
}

const RESULT = { W: 'win', L: 'loss', D: 'draw' }; // message keys
const RESULT_ICON = { W: 'i-check', L: 'i-x', D: 'i-equal' };
const END_REASON = {
  concede: 'end_concede', conceded: 'end_concede', life: 'end_life', lifeZero: 'end_life',
  milled: 'end_decked', decked: 'end_decked', poison: 'end_poison', timeout: 'end_timeout', draw: 'end_draw',
};
const PLAYS = new Set(['LAND_PLAYED', 'SPELL_CAST']);
const BASICS = /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/;
const STALE_MS = 3 * 3600e3;
const PREFS = 'endstep-tracker.filters';

// scope: null = the default (my most played deck over 30 days), else { format, deck }; a null format means every format,
// a null deck every deck of that format. Stats cover scope + period + opponent; result and search only narrow the history.
// version: null = the current list of the deck in view, 'all', '?' (matches without a recorded list) or a list key.
const state = { q: '', scope: null, version: null, compare: false, period: 'all', result: 'all', opp: null };
let matches = [];
let notes = {}; // matchId -> { archetype, notes, deckId } (kept apart so the live tracker never overwrites them)
let decks = {}; // deckId -> { name, format, formatId, cards, sideboard }: my decks as seen on the site
let openId = null;
let decisions = {}; // matchId -> { gameNumber: [decision] }, loaded only for the open match
let analyses = {}; // matchId -> { model, at, determinizations, games: { gameNumber: [row per decision] } }, imported from Endstep-coach
let pending = null; // storage changes held back while the user is editing or selecting inside a match
let toastTimer;

// --- data helpers ---
const opps = (m) => m.players.filter((p) => p && p.seat !== m.mySeat);
const oppLabel = (m) => opps(m).map((p) => p.name).join(', ') || '?';
const archetype = (m) => (notes[m.id] && notes[m.id].archetype) || '';
const colorsOf = (m) => [...new Set(opps(m).map((p) => m.colors[p.seat] || '').join(''))].join('');
const gRes = (m, g) => (g.winnerSeat === undefined ? '' : g.winnerSeat === null ? 'D' : g.winnerSeat === m.mySeat ? 'W' : 'L');
const onPlay = (m, g) => (g.firstSeat === undefined || g.firstSeat === null ? null : g.firstSeat === m.mySeat);
// A deck picked by hand in the match detail (note.deckId) wins over what the tracker attributed.
function myDeck(m) {
  const id = notes[m.id] && notes[m.id].deckId;
  if (!id) return m.myDeck;
  const d = decks[id] || {};
  return { id, name: d.name || null, cards: d.cards || null, sideboard: d.sideboard || null, source: 'manual' };
}
const deckName = (m) => { const d = myDeck(m); return d ? d.name || `Deck ${d.id.slice(0, 8)}` : m.limitedDeck ? t('limited_deck') : t('unknown'); };
const tally = () => ({ W: 0, L: 0, D: 0 });
const pct = (t) => (t.W + t.L ? `${Math.round((100 * t.W) / (t.W + t.L))} %` : '—');
const minutes = (from, to) => (from && to ? t('minutes', { n: Math.max(1, Math.round((to - from) / 60000)) }) : '');
const endReason = (r) => (r ? (END_REASON[r] ? t(END_REASON[r]) : r) : '');
const resultLabel = (r) => t(RESULT[r]);
const isLive = (m) => m.status === 'active' && Date.now() - m.updatedAt < STALE_MS;
const liveMatch = () => matches.find(isLive);

// The format alone (the site's formatId, else its game kind; constructed without a banlist is "no banlist").
function formatOf(m) {
  const base = m.formatId && m.formatId !== 'casual' ? m.formatId : m.format && m.format !== 'constructed' ? m.format : t('casual');
  return base.charAt(0).toUpperCase() + base.slice(1);
}
// Format as displayed: ranked is a queue, not a format, so it is a suffix here and absent from the format chips.
const fmt = (m) => formatOf(m) + (m.ranked ? t('ranked_suffix') : '');

function scoreText(m) {
  if (!m.score || !m.score.length) return '';
  const others = m.score.filter((_, i) => i !== m.mySeat);
  return `${m.score[m.mySeat] || 0}–${Math.max(0, ...others)}`;
}

function pips(c) {
  return `<span class="pips">${String(c).replace(/[^WUBRG]/g, '').split('')
    .map((x) => `<span class="pip pip-${x}" title="${esc(t('color_' + x))}" aria-label="${esc(t('color_' + x))}">${x}</span>`).join('')}</span>`;
}

const cardLink = (name) => `<a class="card" data-card="${esc(name)}" href="https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}" target="_blank" rel="noopener">${esc(name)}</a>`;

function ago(ts) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = (ts - Date.now()) / 1000;
  const a = Math.abs(diff);
  if (a < 60) return t('just_now');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (a < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  const d = new Date(ts);
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
const fullDate = (ts) => new Date(ts).toLocaleString(locale, { dateStyle: 'full', timeStyle: 'short' });

function oppKey(m) {
  const a = archetype(m) || (guessFor(m) || {}).name; // a recognized deck files with the same-named manual tags
  if (a) return ['a:' + a, esc(a), a];
  const c = colorsOf(m);
  return c ? ['c:' + c, `${pips(c)} <span class="muted">${esc(t('untagged'))}</span>`, t('colors_label', { c })]
    : ['?', `<span class="muted">${esc(t('unknown'))}</span>`, t('unknown_deck')];
}

// --- filters ---
function loadPrefs() {
  try { Object.assign(state, JSON.parse(localStorage.getItem(PREFS)) || {}); } catch { /* storage unavailable */ }
  for (const k of ['format', 'formats', 'deck']) delete state[k]; // filters of earlier versions, replaced by the scope
  $('#q').value = state.q;
}
function savePrefs() {
  try { localStorage.setItem(PREFS, JSON.stringify(state)); } catch { /* storage unavailable */ }
}
const inScope = (m, s) => (s.format === null || formatOf(m) === s.format) && (s.deck === null || deckName(m) === s.deck);
// Default scope: the format + deck I played most over the last 30 days (all time when nothing recent).
function defaultScope() {
  const top = (list) => {
    const c = new Map();
    for (const m of list) { const k = JSON.stringify([formatOf(m), deckName(m)]); c.set(k, (c.get(k) || 0) + 1); }
    return [...c].sort((a, b) => b[1] - a[1])[0];
  };
  const best = top(matches.filter((m) => m.startedAt >= Date.now() - 30 * 864e5)) || top(matches);
  if (!best) return { format: null, deck: null };
  const [format, deck] = JSON.parse(best[0]);
  return { format, deck };
}
function activeScope() {
  const s = state.scope;
  if (!s || !matches.some((m) => inScope(m, s))) return defaultScope(); // deleted matches can empty a saved scope
  if (s.deck === null && s.format !== null) { // a format with one deck is that deck
    const ds = new Set(matches.filter((m) => formatOf(m) === s.format).map(deckName));
    if (ds.size === 1) return { format: s.format, deck: [...ds][0] };
  }
  return s;
}
const sameScope = (a, b) => a.format === b.format && a.deck === b.deck;
const scopeFor = (s) => (sameScope(s, defaultScope()) ? null : s); // stored as null when it is the default
const scopeActive = () => !!((state.scope && !sameScope(activeScope(), defaultScope())) || state.version || state.opp || state.period !== 'all');
function setFilter(patch) { Object.assign(state, patch); savePrefs(); render(); }
function resetFilters() {
  $('#q').value = '';
  setFilter({ q: '', scope: null, version: null, compare: false, period: 'all', result: 'all', opp: null });
}

// --- list versions: a version is a distinct main deck (sideboard tweaks do not split the stats) ---
function listKey(cards) {
  if (!Array.isArray(cards)) return null;
  const c = {};
  for (const x of cards) {
    const name = typeof x === 'string' ? x : x && x.name;
    if (name) c[name] = (c[name] || 0) + (typeof x === 'string' ? 1 : x.quantity || 1);
  }
  const names = Object.keys(c).sort();
  return names.length ? names.map((n) => `${c[n]} ${n}`).join('\n') : null;
}
const versionKey = (m) => listKey((myDeck(m) || {}).cards);
// One deck's versions, oldest first and numbered from 1; the current one is the list of my latest match.
function versionsOf(s) {
  const out = { list: [], current: null, unknown: 0 };
  if (s.format === null || s.deck === null) return out;
  const by = new Map();
  for (const m of matches) { // newest first
    if (formatOf(m) !== s.format || deckName(m) !== s.deck) continue;
    const k = versionKey(m);
    if (k === null) { out.unknown++; continue; }
    if (out.current === null) out.current = k;
    const v = by.get(k) || { key: k, from: m.startedAt, count: 0 };
    v.from = Math.min(v.from, m.startedAt);
    v.count++;
    by.set(k, v);
  }
  out.list = [...by.values()].sort((a, b) => a.from - b.from);
  out.list.forEach((v, i) => { v.n = i + 1; });
  return out;
}
// Version in view: 'all', '?' or a list key; the current list by default, every match when the deck has one list.
function activeVersion(vs) {
  if (vs.list.length < 2) return 'all';
  const v = state.version;
  return v === 'all' || (v === '?' && vs.unknown) || vs.list.some((x) => x.key === v) ? v : vs.current;
}
// Cards added (+) and cut (−) from one list key to another, additions first.
function listDiff(from, to) {
  const counts = (key) => Object.fromEntries(key.split('\n').map((l) => [l.slice(l.indexOf(' ') + 1), Number(l.slice(0, l.indexOf(' ')))]));
  const a = counts(from); const b = counts(to);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((n) => [n, (b[n] || 0) - (a[n] || 0)]).filter(([, d]) => d)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], locale));
}

// What the stats are about: the scope, its list version, the period, the opponent facet.
function scoped(version) {
  const s = activeScope();
  const v = version === undefined ? activeVersion(versionsOf(s)) : version;
  const since = state.period === 'all' ? 0 : Date.now() - Number(state.period) * 864e5;
  return matches.filter((m) => inScope(m, s) && m.startedAt >= since
    && (v === 'all' || (v === '?' ? versionKey(m) === null : versionKey(m) === v))
    && (!state.opp || oppKey(m)[0] === state.opp.key));
}
// The history list: the same matches, narrowed by result and search (which never change the stats).
function listed(list) {
  const q = state.q.trim().toLowerCase();
  return list.filter((m) => (state.result === 'all' || m.result === state.result) && (!q || haystack(m).includes(q)));
}

function haystack(m) {
  const n = notes[m.id] || {};
  const seen = opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat)));
  return [oppLabel(m), n.archetype, (guessFor(m) || {}).name, n.notes, deckName(m), fmt(m), ...seen].join('\n').toLowerCase();
}

// Scope menu: every deck, grouped by format, most played first.
function fillScope() {
  const tree = new Map(); // format -> { n, decks: Map(deck -> n) }
  for (const m of matches) {
    const e = tree.get(formatOf(m)) || { n: 0, decks: new Map() };
    e.n++;
    e.decks.set(deckName(m), (e.decks.get(deckName(m)) || 0) + 1);
    tree.set(formatOf(m), e);
  }
  const byCount = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), locale);
  const opt = (format, deck, label, n) => `<option value="${esc(JSON.stringify([format, deck]))}">${esc(label)} (${n})</option>`;
  $('#f-scope').innerHTML = opt(null, null, t('scope_all'), matches.length) + [...tree].sort((a, b) => byCount([a[0], a[1].n], [b[0], b[1].n])).map(([f, e]) => `<optgroup label="${esc(f)}">${
    e.decks.size > 1 ? opt(f, null, t('scope_all_format', { format: f }), e.n) : ''}${
    [...e.decks].sort(byCount).map(([d, n]) => opt(f, d, t('scope_deck', { deck: d, format: f }), n)).join('')}</optgroup>`).join('');
}

// --- data loading ---
// Records come from the tracker or from an imported file: keep only what the page can render.
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
function normalizeMatch(m) {
  if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id || !Number.isFinite(m.startedAt)) return null;
  if (!Array.isArray(m.players) || !Array.isArray(m.games)) return null;
  m.players = m.players.filter((p) => p && typeof p === 'object' && Number.isInteger(p.seat)).map((p) => ({ ...p, name: String(p.name || '?') }));
  m.games = m.games.filter((g) => g && typeof g === 'object' && Number.isFinite(g.n)).map((g) => ({
    ...g, mulligans: obj(g.mulligans), life: obj(g.life), seen: obj(g.seen), log: Array.isArray(g.log) ? g.log.filter(Array.isArray) : [],
  }));
  m.mySeat = Number.isInteger(m.mySeat) ? m.mySeat : null;
  m.score = Array.isArray(m.score) ? m.score.map(Number) : [];
  m.colors = obj(m.colors);
  m.status = m.status === 'complete' || m.status === 'abandoned' ? m.status : 'active';
  if (!Number.isFinite(m.updatedAt)) m.updatedAt = m.startedAt;
  if (m.myDeck && (typeof m.myDeck !== 'object' || typeof m.myDeck.id !== 'string')) m.myDeck = null;
  return m;
}

async function load() {
  const all = await chrome.storage.local.get(null);
  matches = [];
  notes = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('match:')) {
      const m = normalizeMatch(v);
      if (m) matches.push(m);
      else console.warn('[endstep-tracker] unreadable record skipped:', k);
    } else if (k.startsWith('note:')) notes[k.slice(5)] = obj(v);
    else if (k.startsWith('ana:')) analyses[k.slice(4)] = obj(v);
    else if (k === 'decks') decks = obj(v);
  }
  refresh();
}

// Apply a chrome.storage change set in place: no full reload while a match is being written every second.
function applyChanges(changes) {
  for (const [k, c] of Object.entries(changes)) {
    if (k.startsWith('match:')) {
      const id = k.slice(6);
      const m = c.newValue === undefined ? null : normalizeMatch(c.newValue);
      const i = matches.findIndex((x) => x.id === id);
      if (!m) { if (i >= 0) matches.splice(i, 1); if (openId === id) openId = null; }
      else if (i >= 0) matches[i] = m;
      else matches.push(m);
    } else if (k.startsWith('note:')) {
      const id = k.slice(5);
      if (c.newValue === undefined) delete notes[id];
      else notes[id] = obj(c.newValue);
    } else if (k.startsWith('dec:')) {
      const id = k.slice(4);
      if (c.newValue === undefined) delete decisions[id];
      else if (id === openId) decisions[id] = obj(c.newValue);
    } else if (k.startsWith('ana:')) {
      const id = k.slice(4);
      if (c.newValue === undefined) delete analyses[id];
      else analyses[id] = obj(c.newValue);
    } else if (k === 'decks') decks = obj(c.newValue);
  }
  refresh();
}

async function loadDecisions(id) {
  const key = 'dec:' + id;
  decisions[id] = obj((await chrome.storage.local.get(key))[key]);
}

function refresh() {
  matches.sort((a, b) => b.startedAt - a.startedAt);
  fillScope();
  const names = new Set(Object.values(notes).map((n) => n.archetype).filter(Boolean));
  for (const f of Object.values(metaData)) for (const d of f.decks) names.add(d.name); // the site's own archetype names
  $('#archetypes').innerHTML = [...names].sort((a, b) => a.localeCompare(b, locale)).map((a) => `<option value="${esc(a)}">`).join('');
  render();
  ensureMeta();
}

// --- coach: win probability before/after each recorded decision (see coach.js) ---
let coachModel = null; // coach-model.json when present and valid, else the heuristic
let coachCards = null; // coach-cards.json (card vectors) when the model uses the extended features
async function initCoach() {
  if (!Coach) return; // the store build ships without coach.js (see release.sh)
  try {
    const m = await (await fetch('coach-model.json')).json();
    const same = (list) => m && Array.isArray(m.features) && m.features.length === list.length && m.features.every((f, i) => f === list[i]);
    if (same(Coach.FEATURES)) coachModel = m;
    else if (same(Coach.FEATURES2)) {
      coachCards = await (await fetch('coach-cards.json')).json();
      if (coachCards && coachCards.cards && Coach.FEATURES.length + 6 * coachCards.dim === m.features.length) coachModel = m;
      else coachCards = null;
    }
  } catch { /* no model shipped: heuristic */ }
}
// Local coach server (Endstep-coach/bot/coach-server.sh): when it answers, a match's decisions can be analysed in place.
const COACH_SERVER = 'http://127.0.0.1:8765';
let coachServer = null; // /health answer when the server is up
async function initCoachServer() {
  if (!Coach) return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`${COACH_SERVER}/health`, { signal: ctl.signal });
    const h = r.ok ? await r.json() : null;
    if (h && h.ok) coachServer = h;
  } catch { /* no server: nothing changes */ } finally { clearTimeout(timer); }
}
const analysing = new Set(); // match ids being analysed
async function analyseMatch(m) {
  const decs = decisions[m.id];
  if (!decs || analysing.has(m.id)) return;
  analysing.add(m.id);
  render();
  try {
    const oppSeen = {};
    for (const p of opps(m)) for (const [c, n] of Object.entries(T.seenCards(m, p.seat))) oppSeen[c] = Math.max(oppSeen[c] || 0, n);
    const md = myDeck(m);
    const body = {
      matchId: m.id, format: String(m.formatId || m.format || '').toLowerCase(), mySeat: m.mySeat,
      myDeck: md && md.cards ? md.cards.map((c) => ({ name: c.name, quantity: c.quantity || 1 })) : null,
      oppArchetype: archetype(m) || (guessFor(m) || {}).name || null, oppColours: colorsOf(m).split(''), oppSeen, games: decs,
      k: coachServer && coachServer.depth ? 3 : 1, depth: coachServer && coachServer.depth ? 1 : 0,
    };
    const r = await fetch(`${COACH_SERVER}/analyse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const a = await r.json().catch(() => null);
    if (!r.ok || !a || a.error) throw new Error((a && a.error) || `HTTP ${r.status}`);
    analyses[m.id] = { model: a.model, at: a.at, determinizations: a.determinizations, depth: a.depth, games: obj(a.games) };
    await chrome.storage.local.set({ ['ana:' + m.id]: analyses[m.id] });
    const n = a.summary ? a.summary.replayed : 0;
    toast(tn('coach_analysed', n));
  } catch (e) {
    toast(t('coach_analyse_failed', { error: e.message || String(e) }), true);
  } finally {
    analysing.delete(m.id);
    render();
  }
}

const explaining = new Set(); // "matchId|game|index" being explained
async function explainDecision(m, gn, i) {
  const key = `${m.id}|${gn}|${i}`;
  const d = ((decisions[m.id] || {})[gn] || [])[i];
  const ana = analyses[m.id];
  const a = ana && ana.games && Array.isArray(ana.games[gn]) ? ana.games[gn][i] : null;
  if (!d || !a || explaining.has(key)) return;
  explaining.add(key);
  render();
  try {
    const body = { decision: d, analysis: a, mySeat: m.mySeat, myDeck: myDeck(m) ? deckName(m) : null, oppArchetype: archetype(m) || (guessFor(m) || {}).name || null, lang: locale.startsWith('fr') ? 'fr' : 'en', key };
    const r = await fetch(`${COACH_SERVER}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => null);
    if (!r.ok || !res || res.error || !res.text) throw new Error((res && res.error) || `HTTP ${r.status}`);
    a.explanation = { text: res.text, model: res.model || null, at: new Date().toISOString() };
    await chrome.storage.local.set({ ['ana:' + m.id]: ana });
  } catch (e) {
    toast(t('coach_explain_failed', { error: e.message || String(e) }), true);
  } finally {
    explaining.delete(key);
    render();
  }
}

const BAD = -0.15; // drop in P(win), in probability, flagged as a probable mistake
const BLUNDER = -0.30;

// The board a decision leads to is the next decision's board in the same game. The last decision of a game has
// no "after": the outcome would score 0/100 % and flag whatever came last, which is not a judgement of that play.
function coachRows(m, g) {
  const ds = (decisions[m.id] || {})[g.n] || [];
  if (!ds.length || m.mySeat === null) return [];
  const firstSeat = g.firstSeat;
  const p = (board) => (board && board.players ? Coach.predict(Coach.featuresFor(coachModel, board, m.mySeat, firstSeat, coachCards), coachModel) : null);
  return ds.map((d, i) => {
    const before = p(d.board);
    const next = ds[i + 1];
    const after = next ? p(next.board) : null;
    return { d, before, after, delta: before !== null && after !== null ? after - before : null };
  });
}

function coachBlock(m, g) {
  if (!Coach) return '';
  const rows = coachRows(m, g);
  if (!rows.length) return '';
  const pct = (v) => (v === null ? '—' : `${Math.round(v * 100)} %`);
  // Imported analysis (best play per decision, from Endstep-coach): two more columns when it exists for this game.
  const ana = analyses[m.id];
  const arows = ana && ana.games && Array.isArray(ana.games[g.n]) ? ana.games[g.n] : null;
  const bestCell = (i) => {
    const a = arows && arows[i];
    if (!a) return '<td></td><td class="num"></td>';
    if (a.skipped) return `<td class="muted" title="${esc(a.skipped)}">—</td><td class="num"></td>`;
    const gap = typeof a.delta === 'number' ? -a.delta : null; // played minus best, in probability
    const cls = gap !== null && gap <= BLUNDER ? 'bad' : gap !== null && gap <= BAD ? 'bad' : '';
    const same = a.played !== null && a.played === a.best;
    const label = Coach.describeOption(a.best, { pass: t('coach_pass'), noAttack: t('coach_no_attack'), attack: t('coach_attack_prefix') });
    const sd = typeof a.sd === 'number' && a.sd > 0 ? ` ${t('coach_sd_title', { sd: Math.round(a.sd * 100) })}` : '';
    return `<td class="${same ? 'muted' : ''}" title="${esc(t('coach_best_title', { p: Math.round((a.bestScore || 0) * 100) }) + sd)}">${same ? esc(t('coach_same')) : esc(label)}</td>`
      + `<td class="num delta ${cls}">${gap === null ? '—' : gap === 0 ? '0' : `${gap > 0 ? '+' : ''}${Math.round(gap * 100)}`}</td>`;
  };
  // Explanation by the local coach server (Claude behind it): a flagged decision with an analysis gets a button, the
  // text received stays in the analysis row (`explanation`) and is shown under the decision.
  const cols = arows ? 7 : 5;
  const explainRow = (i, delta) => {
    const a = arows && arows[i];
    if (!a || a.skipped) return '';
    if (a.explanation && a.explanation.text) return `<tr class="explain"><td colspan="${cols}"><p>${esc(a.explanation.text)}</p><small class="muted">${esc(t('coach_explain_by', { model: a.explanation.model || '?' }))}</small></td></tr>`;
    const flagged = (typeof a.delta === 'number' && a.delta >= 0.05) || (delta !== null && delta <= BAD);
    if (!flagged || !coachServer || !coachServer.explain) return '';
    const busy = explaining.has(`${m.id}|${g.n}|${i}`);
    return `<tr class="explain"><td colspan="${cols}"><button type="button" class="btn-text" data-explain="${i}" data-game="${esc(g.n)}"${busy ? ' disabled' : ''}>${esc(busy ? t('coach_explain_wait') : t('coach_explain'))}</button></td></tr>`;
  };
  const body = rows.map(({ d, before, after, delta }, i) => {
    const cls = delta !== null && delta <= BLUNDER ? 'blunder bad' : delta !== null && delta <= BAD ? 'bad' : '';
    const flag = delta !== null && delta <= BLUNDER ? `<span class="flag bad">${esc(t('coach_blunder'))}</span>` : delta !== null && delta <= BAD ? `<span class="flag bad">${esc(t('coach_mistake'))}</span>` : '';
    const sign = delta === null ? '' : delta > 0 ? '+' : '';
    return `<tr class="${cls}"><td class="turn">T${esc(d.turn)} ${esc(d.phase || '')}</td><td>${esc(describeAction(d.answer || {}))}${flag}</td>`
      + `<td class="num">${pct(before)}</td><td class="num">${pct(after)}</td><td class="num delta ${delta > 0.05 ? 'good' : ''}">${delta === null ? '—' : `${sign}${Math.round(delta * 100)}`}</td>`
      + (arows ? bestCell(i) : '') + '</tr>' + explainRow(i, delta);
  }).join('');
  const flagged = rows.filter((r) => r.delta !== null && r.delta <= BAD).length;
  const source = coachModel ? t('coach_model_note', { n: coachModel.games || '?' }) : t('coach_heuristic_note');
  const anaNote = arows ? ` · ${esc(t(ana.depth >= 1 ? 'coach_analysis_note_depth' : 'coach_analysis_note', { date: ana.at ? new Date(ana.at).toLocaleDateString(locale) : '?', model: ana.model || '?', k: ana.determinizations || 1 }))}` : '';
  return `<details class="coach" data-key="coach:${esc(m.id)}:${esc(g.n)}"><summary>${esc(t('coach_title', { n: rows.length }))}${flagged ? ` · <b>${esc(tn('coach_flagged', flagged))}</b>` : ''}</summary>
    <p class="coach-note">${esc(source)} · ${esc(t('coach_after_note'))}${anaNote}</p>
    <table><thead><tr><th></th><th>${esc(t('coach_decision'))}</th><th>${esc(t('coach_before'))}</th><th>${esc(t('coach_after'))}</th><th>Δ</th>${arows ? `<th>${esc(t('coach_best'))}</th><th title="${esc(t('coach_gap_title'))}">${esc(t('coach_gap'))}</th>` : ''}</tr></thead><tbody>${body}</tbody></table></details>`;
}

// --- opponent deck recognition, from endstep.cc's public metagame (see meta.js) ---
const META_TTL = 7 * 864e5;
const NO_RECOGNITION = /draft|sealed|momir|fish|(?<!-)commander|brawl|oathbreaker/i; // "duel-commander" is tracked by the site
const metaData = {}; // formatId -> { at, decks }
let metaFormats = null; // formats that have metagame data
let metaFormatsAt = 0;
let metaBusy = false;
let metaFailed = false;
const guessMemo = new Map();

async function initMeta() {
  const s = (await chrome.storage.local.get('meta')).meta;
  if (!s) return;
  Object.assign(metaData, obj(s.byFormat));
  if (Array.isArray(s.formats)) { metaFormats = s.formats; metaFormatsAt = s.formatsAt || 0; }
}
const persistMeta = () => chrome.storage.local.set({ meta: { formats: metaFormats, formatsAt: metaFormatsAt, byFormat: metaData } });

const oppCards = (m) => opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat)));
const recognizable = (m) => !archetype(m) && !NO_RECOGNITION.test(`${m.format || ''} ${m.formatId || ''}`)
  && oppCards(m).filter((c) => !/^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/.test(c)).length >= 2;
// Formats whose archetypes a match is compared with: its own when the site tracks it, otherwise every tracked format.
const metaFormatsFor = (m) => (!metaFormats ? [] : metaFormats.includes(m.formatId) ? [m.formatId] : metaFormats);
const fresh = (f) => metaData[f] && Date.now() - metaData[f].at < META_TTL;

function guessFor(m) {
  if (!recognizable(m)) return null;
  const formats = metaFormatsFor(m).filter((f) => metaData[f]);
  if (!formats.length) return null;
  const key = `${m.id}|${m.updatedAt}|${formats.map((f) => f + metaData[f].at).join()}`;
  if (!guessMemo.has(key)) guessMemo.set(key, Meta.classify(oppCards(m), formats.flatMap((f) => metaData[f].decks)));
  return guessMemo.get(key);
}

// Load what the current matches need, one format at a time (about one request per archetype), then re-render.
async function ensureMeta() {
  if (metaBusy || metaFailed) return;
  const need = matches.filter(recognizable);
  if (!need.length) return;
  metaBusy = true;
  try {
    if (!metaFormats || Date.now() - metaFormatsAt > META_TTL) {
      metaFormats = await Meta.listFormats();
      metaFormatsAt = Date.now();
      await persistMeta();
    }
    const wanted = [...new Set(need.flatMap(metaFormatsFor))].filter((f) => !fresh(f));
    for (const f of wanted) {
      if (!metaData[f]) toast(t('guess_loading', { format: f }));
      metaData[f] = await Meta.loadFormat(f);
      await persistMeta();
      render();
    }
    if (wanted.length) refresh(); // datalist gains the new archetype names
  } catch (err) {
    console.warn('[endstep-tracker] metagame unavailable:', err);
    metaFailed = true;
    toast(t('guess_unavailable'), true);
  } finally {
    metaBusy = false;
  }
}

function guessTag(m) {
  const g = guessFor(m);
  if (!g) return '';
  const title = t('guess_tag_title', { p: Math.round(g.p * 100), cards: g.matched.join(', ') });
  return `<span class="tag guess" title="${esc(title)}">${esc(g.name)}</span>`;
}

// --- rendering ---
function render() {
  document.body.classList.remove('loading');
  const has = matches.length > 0;
  for (const id of ['#filters', '#split', '#list-tools', '#list-head', '#list-foot']) $(id).hidden = !has;
  renderHeader();
  if (!has) { $('#matches').innerHTML = onboarding(); return; }
  const s = activeScope();
  const vs = versionsOf(s);
  const v = activeVersion(vs);
  const stats = scoped(v);
  const list = listed(stats);
  const cur = vs.list.find((x) => x.key === v);
  const prev = cur && vs.list[cur.n - 2];
  const cmp = prev && state.compare ? { label: t('version_n', { n: prev.n }), list: scoped(prev.key) } : null;
  renderFilters(s, stats, list, vs, v);
  renderVersions(cur, prev);
  renderOverview(stats, cmp);
  renderBreakdown('#by-opp', stats, oppKey, 'opp', cmp);
  $('#decks-panel').hidden = s.deck !== null; // one deck in view: nothing to break down
  if (s.deck === null) {
    renderBreakdown('#by-deck', stats, (m) => [JSON.stringify([formatOf(m), deckName(m)]),
      esc(deckName(m)) + (s.format === null ? ` <span class="muted">· ${esc(formatOf(m))}</span>` : ''), deckName(m)], 'deck');
  }
  $('#history').classList.toggle('one-deck', s.deck !== null);
  renderMatches(list);
}

function renderHeader() {
  const n = matches.length;
  $('#summary').textContent = n ? tn('summary', n, { ago: ago(matches[0].startedAt) }) : t('tagline');
  const live = liveMatch();
  $('#live').hidden = !live;
  if (live) {
    const score = scoreText(live);
    $('#live-text').textContent = t('live_pill', { opp: oppLabel(live) }) + (score ? ` · ${score}` : '');
  }
}

function renderFilters(s, stats, list, vs, v) {
  $('#f-scope').value = JSON.stringify([s.format, s.deck]);
  const sel = $('#f-version'); // options carry version numbers; the state keeps the list itself, which survives renumbering
  sel.hidden = vs.list.length < 2;
  if (!sel.hidden) {
    const total = vs.list.reduce((n, x) => n + x.count, vs.unknown);
    sel.innerHTML = [...vs.list].reverse().map((x) => `<option value="${x.n}">${esc(t(x.key === vs.current ? 'version_current' : 'version_n', { n: x.n }))} (${x.count})</option>`).join('')
      + `<option value="all">${esc(t('versions_all'))} (${total})</option>`
      + (vs.unknown ? `<option value="?">${esc(t('version_unknown'))} (${vs.unknown})</option>` : '');
    sel.value = v === 'all' || v === '?' ? v : String(vs.list.find((x) => x.key === v).n);
  }
  $('#count').textContent = tn('n_matches', list.length) + (list.length !== stats.length ? t('of_total', { total: stats.length }) : '');
  $('#reset').classList.toggle('off', !scopeActive());
  $('#facet').hidden = !state.opp;
  if (state.opp) $('#facet-label').textContent = t('opponent_facet', { label: state.opp.label });
  for (const seg of document.querySelectorAll('.seg[data-filter]')) {
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(state[seg.dataset.filter] === b.dataset.value));
  }
}

// One component for every win/loss record: label, proportional bar (50 % tick), win rate, W–L.
// Below MIN_SAMPLE results a rate is noise: one dot per result and "too early" instead of a bar and a percentage.
const MIN_SAMPLE = 5;
const wl = (r) => `${r.W}–${r.L}${r.D ? `–${r.D}` : ''}`;
// Game 1 is played with the main deck, games 2 and 3 after sideboarding: every game record splits along that line.
const half = (gm) => (gm.n === 1 ? 'g1' : 'g23');
const halves = () => ({ g1: tally(), g23: tally() });
// A secondary record cell (G1, G2-G3, a compared version): W–L, plus the rate once the sample allows it.
// Its key is read by screen readers and shown in narrow windows, where the column captions are hidden.
function subCell(key, title, r, cls = '') {
  const n = r.W + r.L + r.D;
  return `<span class="rec-sub${n < MIN_SAMPLE ? ' early' : ''}${cls}" title="${esc(title)}"><span class="k">${esc(key)}</span>${n >= MIN_SAMPLE ? `<b>${pct(r)}</b> ` : ''}${n ? wl(r) : '—'}</span>`;
}
// Column captions above records that carry G1 / G2-G3 (and a compared version).
const recHead = (first, main, cmp) => `<div class="rec halves head${cmp ? ' with-cmp' : ''}" aria-hidden="true"><span>${esc(first)}</span><span class="main">${esc(main)}</span>`
  + `<span title="${esc(t('g1_title'))}">${esc(t('g1'))}</span><span title="${esc(t('g23_title'))}">${esc(t('g23'))}</span>${cmp ? `<span>${esc(cmp)}</span>` : ''}</div>`;
function rec(labelHtml, r, { tag = 'div', attrs = '', split = null, cmp = null } = {}) {
  const n = r.W + r.L + r.D;
  const aria = n ? [tn('wins', r.W), tn('losses', r.L), r.D ? tn('draws', r.D) : ''].filter(Boolean).join(', ') : t('no_data');
  const early = n < MIN_SAMPLE;
  const marks = early
    ? `<span class="dots" role="img" aria-label="${esc(aria)}" title="${esc(aria)}">${'<i class="w"></i>'.repeat(r.W)}${'<i class="d"></i>'.repeat(r.D)}${'<i class="l"></i>'.repeat(r.L)}</span>`
    : `<span class="bar" role="img" aria-label="${esc(aria)}" title="${esc(aria)}">${[['w', r.W], ['d', r.D], ['l', r.L]].filter(([, v]) => v)
      .map(([c, v]) => `<i class="${c}" style="flex-grow:${v}"></i>`).join('')}</span>`;
  const rate = !n ? '<span class="early">—</span>' : early ? `<span class="early" title="${esc(t('too_early_title', { n: MIN_SAMPLE }))}">${esc(t('too_early'))}</span>` : pct(r);
  const extra = (split ? subCell(t('g1'), t('g1_title'), split.g1) + subCell(t('g23'), t('g23_title'), split.g23) : '')
    + (cmp ? subCell(cmp.label, t('cmp_title', { v: cmp.label }), cmp.r, ' cmp') : '');
  return `<${tag} class="rec${split ? ' halves' : ''}${cmp ? ' with-cmp' : ''}" ${attrs}>
    <span class="rec-label">${labelHtml}</span>
    ${marks}
    <span class="rec-pct">${rate}</span>
    <span class="rec-count">${wl(r)}</span>${extra}
  </${tag}>`;
}

function renderOverview(list, cmp) {
  const m = tally(); const g = tally(); const gs = halves();
  const ctx = { play: [tally(), halves()], draw: [tally(), halves()], keep: [tally(), halves()], mull: [tally(), halves()] };
  const add = (k, gm, r) => { ctx[k][0][r]++; ctx[k][1][half(gm)][r]++; };
  let turns = 0; let nTurns = 0; let myMulls = 0; let nGames = 0; let time = 0; let nTimed = 0;
  for (const x of list) {
    if (isLive(x)) continue; // a match in progress has no record yet, nor do its games count
    if (x.result) m[x.result]++;
    for (const gm of x.games) {
      const r = gRes(x, gm);
      if (!r) continue;
      g[r]++;
      gs[half(gm)][r]++;
      const p = onPlay(x, gm);
      if (p !== null) add(p ? 'play' : 'draw', gm, r);
      const k = gm.mulligans[x.mySeat] || 0;
      add(k ? 'mull' : 'keep', gm, r);
      myMulls += k;
      nGames++;
      if (gm.turns) { turns += gm.turns; nTurns++; }
      if (gm.startedAt && gm.endedAt) { time += gm.endedAt - gm.startedAt; nTimed++; }
    }
  }
  const num = (v, d = 1) => v.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const facts = [
    nGames ? `<span><b>${num(myMulls / nGames, 2)}</b> ${esc(t('per_game_mulligans'))}</span>` : '',
    nTurns ? `<span><b>${num(turns / nTurns)}</b> ${esc(t('avg_turns'))}</span>` : '',
    nTimed ? `<span><b>${Math.max(1, Math.round(time / nTimed / 60000))} ${esc(t('min'))}</b> ${esc(t('per_game'))}</span>` : '',
  ].join('');
  const line = (label, r, cls = '') => `<span${cls ? ` class="${cls}"` : ''}>${esc(label)} <b>${r.W}–${r.L}${r.D ? `–${r.D}` : ''}</b>${r.W + r.L + r.D >= MIN_SAMPLE ? ` · ${pct(r)}` : ''}</span>`;
  let cm = null;
  if (cmp) { cm = tally(); for (const x of cmp.list) if (x.result) cm[x.result]++; }
  $('#scope-sum').innerHTML = line(t('matches'), m) + (cm ? line(`${cmp.label} · ${t('matches')}`, cm, 'cmp') : '')
    + line(t('games'), g) + line(t('g1'), gs.g1) + line(t('g23'), gs.g23) + facts;
  const row = (label, k) => rec(esc(label), ctx[k][0], { split: ctx[k][1] });
  $('#overview').innerHTML = `<h2 class="panel-title">${esc(t('by_context'))}</h2>${recHead('', t('games'))}
    ${row(t('on_play'), 'play')}${row(t('on_draw'), 'draw')}${row(t('kept_seven'), 'keep')}${row(t('after_mulligan'), 'mull')}`;
}

// cmp: { label, list }, another list version whose match record sits beside each row.
function renderBreakdown(sel, list, keyOf, kind, cmp = null) {
  const groups = new Map();
  const group = (m) => {
    const [key, label, text] = keyOf(m);
    if (!groups.has(key)) groups.set(key, { key, label, text, n: 0, m: tally(), g: tally(), s: halves(), c: tally() });
    return groups.get(key);
  };
  for (const m of list) {
    const e = group(m);
    e.n++;
    if (m.result) e.m[m.result]++;
    if (!isLive(m)) for (const gm of m.games) { const r = gRes(m, gm); if (r) { e.g[r]++; e.s[half(gm)][r]++; } }
  }
  if (cmp) for (const m of cmp.list) if (m.result) group(m).c[m.result]++;
  const finished = (r) => r.W + r.L + r.D;
  // Only groups with a finished match (in either version): an in-progress match has no record yet.
  const rows = [...groups.values()].filter((e) => finished(e.m) || finished(e.c)).sort((a, b) => b.n - a.n || finished(b.c) - finished(a.c));
  const button = (e) => {
    const active = kind === 'opp' && !!state.opp && state.opp.key === e.key;
    const title = `${active ? t('remove_this_filter') : t('only_show', { label: e.text })} · ${t('games_record', { w: e.g.W, l: e.g.L })}`;
    const attrs = `type="button" data-kind="${kind}" data-key="${esc(e.key)}" data-label="${esc(e.text)}" aria-pressed="${active}" title="${esc(title)}"`;
    return rec(e.label, e.m, { tag: 'button', attrs, split: e.s, cmp: cmp && { label: cmp.label, r: e.c } });
  };
  // Archetypes met fewer than RARE times fold into one "Others" row, as long as some are met more often.
  const RARE = 3;
  const rare = kind === 'opp' ? rows.filter((e) => finished(e.m) < RARE) : [];
  const fold = rare.length >= 2 && rare.length < rows.length;
  let html = (fold ? rows.filter((e) => finished(e.m) >= RARE) : rows).map(button).join('');
  if (fold) {
    const sum = tally(); const s = halves(); const c = tally();
    for (const e of rare) for (const k of ['W', 'L', 'D']) { sum[k] += e.m[k]; s.g1[k] += e.s.g1[k]; s.g23[k] += e.s.g23[k]; c[k] += e.c[k]; }
    const open = !!($(sel).querySelector('details.others') || {}).open || rare.some((e) => state.opp && state.opp.key === e.key);
    html += `<details class="others"${open ? ' open' : ''}><summary>${rec(`<svg class="i chev" aria-hidden="true"><use href="#i-chevron"/></svg>${esc(tn('others', rare.length))}`, sum, { tag: 'span', split: s, cmp: cmp && { label: cmp.label, r: c } })}</summary>${rare.map(button).join('')}</details>`;
  }
  if (html) html = recHead(t(kind === 'opp' ? 'col_archetype' : 'col_deck'), t('matches'), cmp && cmp.label) + html;
  $(sel).innerHTML = html || `<p class="muted" style="padding:6px 8px 10px">${esc(t(scopeActive() ? 'no_finished_selection' : 'no_finished_all'))}</p>`;
}

function renderMatches(list) {
  if (!list.length) {
    $('#matches').innerHTML = `<li class="empty">
      <h2>${esc(t('no_match_filters'))}</h2>
      <p>${esc(t('no_match_filters_hint'))}</p>
      <div class="row"><button class="btn" data-action="reset">${esc(t('reset_filters'))}</button></div>
    </li>`;
    return;
  }
  // Re-rendering must not snap shut a journal or deck list the user opened.
  const open = new Set([...document.querySelectorAll('#matches details[open]')].map((d) => d.dataset.key));
  $('#matches').innerHTML = list.map((m) => `<li class="match" data-id="${esc(m.id)}">${row(m)}${m.id === openId ? detail(m) : ''}</li>`).join('');
  for (const d of document.querySelectorAll('#matches details')) if (open.has(d.dataset.key)) d.open = true;
}

function resultBadge(m) {
  if (m.status === 'complete') {
    const r = RESULT[m.result] ? m.result : '';
    return `<span class="result ${r}"><i></i>${r ? esc(resultLabel(r)) : '?'}</span>`;
  }
  const stale = m.status === 'abandoned' || Date.now() - m.updatedAt > STALE_MS;
  return stale ? `<span class="result open"><i></i>${esc(t('unfinished'))}</span>` : `<span class="result ongoing"><i></i>${esc(t('ongoing'))}</span>`;
}

function chip(m, g) {
  const r = gRes(m, g);
  const p = onPlay(m, g);
  const k = g.mulligans[m.mySeat] || 0;
  const label = `${t('game_n', { n: g.n })}${t('colon')}${(r ? resultLabel(r) : t('ongoing')).toLowerCase()}, ${
    p === null ? t('pos_unknown') : p ? t('on_play_l') : t('on_draw_l')}${k ? `, ${tn('mulligans', k)}` : ''}`;
  const icon = r ? `<svg class="i"><use href="#${RESULT_ICON[r]}"/></svg>` : '';
  return `<span class="g ${r || 'open'}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span class="g-res">${icon}</span>`
    + `<span class="g-pos">${p === null ? '—' : p ? 'play' : 'draw'}${k ? `<b>M${k}</b>` : ''}</span></span>`;
}

function row(m) {
  const open = m.id === openId;
  const a = archetype(m);
  return `<button class="match-row" aria-expanded="${open}" aria-controls="d-${esc(m.id)}">
    ${resultBadge(m)}
    <span class="opp"><span class="opp-name">${esc(oppLabel(m))}</span>${pips(colorsOf(m))}${a ? `<span class="tag">${esc(a)}</span>` : guessTag(m)}</span>
    <span class="score">${scoreText(m)}</span>
    <span class="chips">${m.games.map((g) => chip(m, g)).join('')}</span>
    <span class="cell deck">${esc(deckName(m))}</span>
    <span class="cell fmt">${esc(fmt(m))}${m.gamesPerMatch ? ` · Bo${esc(m.gamesPerMatch)}` : ''}</span>
    <time class="when" datetime="${new Date(m.startedAt).toISOString()}" title="${esc(fullDate(m.startedAt))}">${esc(ago(m.startedAt))}</time>
    <svg class="i chev" aria-hidden="true"><use href="#i-chevron"/></svg>
  </button>`;
}

function detail(m) {
  const n = notes[m.id] || {};
  const meta = [
    esc(fmt(m)) + (m.gamesPerMatch ? ` · Bo${esc(m.gamesPerMatch)}` : ''),
    esc(fullDate(m.startedAt)),
    esc(minutes(m.startedAt, m.endedAt)),
    `${esc(t('my_deck'))}${esc(t('colon'))}<b>${esc(deckName(m))}</b>`,
  ].filter(Boolean).join(' · ');
  const seen = opps(m).map((p) => `<section><h3>${esc(t('seen_at', { name: p.name }))} ${pips(m.colors[p.seat] || '')}</h3>${cardList(T.seenCards(m, p.seat))}</section>`).join('');
  const md = myDeck(m);
  const mine = md && md.cards
    ? `<details data-key="deck:${esc(m.id)}"><summary>${esc(t('my_list', { deck: deckName(m) }) + listVersion(m, md))}</summary>${deckList(md.cards)}</details>`
    : m.limitedDeck ? `<details data-key="deck:${esc(m.id)}"><summary>${esc(t('my_limited_deck'))}</summary>${deckList(m.limitedDeck.deck)}</details>` : '';
  // "My deck" picker: the tracker's own attribution stays the default; any deck seen on the site can replace it.
  const auto = m.myDeck ? m.myDeck.name || `Deck ${m.myDeck.id.slice(0, 8)}` : m.limitedDeck ? t('limited_deck') : t('unknown');
  const deckOptions = Object.entries(decks)
    .map(([id, d]) => ({ id, label: (d.name || id) + (d.format || d.formatId ? ` · ${d.format || d.formatId}` : '') }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
    .map((o) => `<option value="${esc(o.id)}"${o.id === n.deckId ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  const deckPicker = m.limitedDeck ? '' : `<label class="field">${esc(t('my_deck'))}<select data-note="deckId">
        <option value="">${esc(t('deck_auto', { deck: auto }))}</option>${deckOptions}</select></label>`;
  return `<div class="detail" id="d-${esc(m.id)}">
    <p class="detail-meta">${meta}</p>
    <div class="detail-grid">
      <div class="side">
        ${seen}
        <label class="field">${esc(t('opp_archetype'))}<input data-note="archetype" list="archetypes" value="${esc(n.archetype || '')}" placeholder="${esc(t('archetype_placeholder'))}"></label>
        ${guessLine(m)}
        <label class="field">${esc(t('notes'))}<textarea data-note="notes" placeholder="${esc(t('notes_placeholder'))}">${esc(n.notes || '')}</textarea></label>
        ${deckPicker}
        ${coachServer && decisions[m.id] && Object.values(decisions[m.id]).some((l) => Array.isArray(l) && l.length) ? `<button class="btn-text" data-analyse${analysing.has(m.id) ? ' disabled' : ''}><svg class="i"><use href="#i-spark"/></svg>${esc(analysing.has(m.id) ? t('coach_analysing') : t('coach_analyse'))}</button>` : ''}
        ${mine}
        <button class="btn-text" data-delete><svg class="i"><use href="#i-trash"/></svg>${esc(t('delete_match'))}</button>
      </div>
      <div class="games">${m.games.map((g) => gameBlock(m, g)).join('') || `<p class="muted">${esc(t('no_games'))}</p>`}</div>
    </div>
  </div>`;
}

function guessLine(m) {
  const g = guessFor(m);
  if (!g) return '';
  return `<p class="guess-line">${esc(t('guess_suggestion'))}${esc(t('colon'))}<b>${esc(g.name)}</b> · ${esc(t('guess_confidence', { p: Math.round(g.p * 100) }))} · ${esc(t('guess_from', { cards: g.matched.join(', ') }))}<button class="link" data-use-guess="${esc(g.name)}">${esc(t('use_guess'))}</button></p>`;
}

function cardList(cards) {
  const names = Object.keys(cards);
  if (!names.length) return `<p class="muted">${esc(t('no_cards_seen'))}</p>`;
  const byCount = (a, b) => cards[b] - cards[a] || a.localeCompare(b);
  const li = (c) => `<li><span class="qty">${esc(cards[c])}</span>${cardLink(c)}</li>`;
  const spells = names.filter((c) => !BASICS.test(c)).sort(byCount);
  const basics = names.filter((c) => BASICS.test(c)).sort(byCount);
  return `<ul class="cardlist">${spells.map(li).join('')}${basics.length ? `<li class="sep">${esc(t('basic_lands'))}</li>${basics.map(li).join('')}` : ''}</ul>`;
}

// " · v3" when the deck has had several lists.
function listVersion(m, md) {
  const vs = versionsOf({ format: formatOf(m), deck: deckName(m) });
  const x = vs.list.length > 1 && vs.list.find((y) => y.key === listKey(md.cards));
  return x ? ` · ${t('version_n', { n: x.n })}` : '';
}

// The version in view and what changed from the previous list; a toggle sets the previous list's records beside.
function renderVersions(cur, prev) {
  const el = $('#versions');
  el.hidden = !cur;
  if (!cur) return;
  const since = t('version_since', { n: cur.n, date: new Date(cur.from).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) });
  if (!prev) { el.innerHTML = `<span><b>${esc(since)}</b> · ${esc(t('version_first'))}</span>`; return; }
  const changes = listDiff(prev.key, cur.key);
  const MAX = 8;
  const shown = changes.slice(0, MAX).map(([name, d]) => `<span class="chg ${d > 0 ? 'add' : 'cut'}">${d > 0 ? '+' : '−'}${Math.abs(d)} ${cardLink(name)}</span>`).join(', ');
  el.innerHTML = `<span><b>${esc(since)}</b>${esc(t('colon'))}${shown}${changes.length > MAX ? ` ${esc(t('version_more', { n: changes.length - MAX }))}` : ''}</span>`
    + `<button class="link" data-action="compare" aria-pressed="${!!state.compare}">${esc(state.compare ? t('compare_stop') : t('compare_with', { n: prev.n }))}</button>`;
}

function deckList(list) {
  const cards = {};
  for (const c of list || []) {
    const name = typeof c === 'string' ? c : c.name;
    cards[name] = (cards[name] || 0) + (typeof c === 'string' ? 1 : c.quantity || 1);
  }
  return cardList(cards);
}

function gameBlock(m, g) {
  const r = gRes(m, g);
  const p = onPlay(m, g);
  const nameOf = (s) => (s === m.mySeat ? t('me') : opps(m).length > 1 ? (m.players[s] || {}).name || '?' : t('opp_short'));
  const facts = [p === null ? t('pos_unknown') : p ? t('on_play') : t('on_draw'), g.turns ? tn('turns', g.turns) : '',
    endReason(g.endReason), minutes(g.startedAt, g.endedAt)].filter(Boolean).map(esc).join(' · ');
  const mulls = m.players.map((pl) => `${esc(nameOf(pl.seat))} ${g.mulligans[pl.seat] === undefined ? '?' : esc(g.mulligans[pl.seat])}`).join(' · ');
  const life = Object.entries(g.life).map(([s, v]) => `${esc(nameOf(Number(s)))} ${esc(v)}`).join(' · ');
  const kv = `<dl class="kv"><div><dt>${esc(t('mulligans_label'))}</dt><dd>${mulls}</dd></div>${life ? `<div><dt>${esc(t('final_life'))}</dt><dd>${life}</dd></div>` : ''}${
    g.tossSeat === undefined || g.tossSeat === null ? '' : `<div><dt>${esc(t('play_draw_choice'))}</dt><dd>${esc(nameOf(g.tossSeat))}</dd></div>`}</dl>`;
  const hand = g.openingHand ? `<div class="hand"><span class="label">${esc(t('opening_hand'))}</span>${g.openingHand.map(cardLink).join('')}</div>` : '';

  const turns = new Map();
  for (const [tn_, s, type, c] of g.log) {
    if (!PLAYS.has(type) || !c) continue;
    const key = `${tn_}|${s}`;
    if (!turns.has(key)) turns.set(key, { t: tn_, s, cards: [] });
    turns.get(key).cards.push(type === 'LAND_PLAYED' ? `<span class="land">${cardLink(c)}</span>` : cardLink(c));
  }
  const timeline = turns.size
    ? `<div class="timeline">${[...turns.values()].map((x) => `<span class="t">T${esc(x.t)}</span><span class="who">${esc(nameOf(x.s))}</span><span>${x.cards.join(', ')}</span>`).join('')}</div>` : '';
  const log = `<details class="log" data-key="log:${esc(m.id)}:${esc(g.n)}"><summary>${esc(t('full_log', { n: g.log.length }))}</summary><ol>${g.log
    .map(([tn_, , type, c, msg]) => `<li><span>T${esc(tn_)}</span>${esc(msg || type + (c ? ` ${c}` : ''))}</li>`).join('')}</ol></details>`;
  const res = r ? `<span class="result ${r}"><i></i>${esc(resultLabel(r))}</span>` : `<span class="result ongoing"><i></i>${esc(t('ongoing'))}</span>`;
  return `<article class="game"><header class="game-head"><h4>${esc(t('game_n', { n: g.n }))}</h4>${res}<span class="facts-inline">${facts}</span></header>${kv}${hand}${timeline}${coachBlock(m, g)}${decisionsBlock(m, g)}${log}</article>`;
}

const ACTION_KEY = { PLAY_CARD: 'act_play', PASS_PRIORITY: 'act_pass', KEEP_HAND: 'act_keep', MULLIGAN: 'act_mulligan', DECLARE_ATTACKERS: 'act_attack',
  DECLARE_BLOCKERS: 'act_block', CHOOSE_TARGETS: 'act_target', CHOOSE_CARDS: 'act_choose', CHOOSE_MODE: 'act_mode', CHOOSE_ABILITY: 'act_ability',
  CHOOSE_NUMBER: 'act_number', YES: 'act_yes', NO: 'act_no', DECLINE: 'act_decline', CANCEL: 'act_cancel' };
const fmtVal = (v) => (Array.isArray(v) ? v.map(fmtVal).join(', ')
  : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ← ${fmtVal(x)}`).join(', ') : String(v));
// "plays Lightning Bolt", "blocks Goblin Guide ← Mountain": the action verb plus its card arguments.
function describeAction(a) {
  const args = Object.entries(a).filter(([k, v]) => k !== 'type' && typeof v !== 'boolean' && v !== undefined && v !== null && k !== 'abilityIndex').map(([, v]) => fmtVal(v));
  return [ACTION_KEY[a.type] ? t(ACTION_KEY[a.type]) : a.type, ...args].join(' ');
}

function decisionsBlock(m, g) {
  const ds = (decisions[m.id] || {})[g.n] || [];
  if (!ds.length) return '';
  const rows = ds.map((d) => {
    const board = d.board && d.board.players ? d.board.players.map((pl, s) => `${s === m.mySeat ? t('me') : t('opp_short')} ${pl.life}`).join(' · ') : '';
    const prompt = d.prompt ? (d.prompt.message || d.prompt.type) : '';
    const options = d.prompt && d.prompt.options && d.prompt.options.length ? ` <span class="muted">[${esc(d.prompt.options.join(', '))}]</span>` : '';
    return `<li title="${esc(board)}"><span>T${esc(d.turn)} ${esc(d.phase || '')}</span>${esc(prompt)}${options} → <b>${esc(describeAction(d.answer || {}))}</b></li>`;
  }).join('');
  return `<details class="log" data-key="dec:${esc(m.id)}:${esc(g.n)}"><summary>${esc(t('decisions_title', { n: ds.length }))}</summary><ol>${rows}</ol></details>`;
}

function onboarding() {
  return `<li class="empty">
    <img src="icons/icon-128.png" alt="">
    <h2>${esc(t('onboard_title'))}</h2>
    <p>${esc(t('onboard_intro'))}</p>
    <ol class="steps">
      <li><span><b>${esc(t('step1_b'))}</b> ${esc(t('step1'))}</span></li>
      <li><span><b>${esc(t('step2_b'))}</b> ${esc(t('step2'))} <span class="rec-badge">REC</span>.</span></li>
      <li><span><b>${esc(t('step3_b'))}</b> ${esc(t('step3'))}</span></li>
    </ol>
    <div class="row">
      <a class="btn primary" href="https://endstep.cc" target="_blank" rel="noopener">${esc(t('open_endstep'))}<svg class="i"><use href="#i-external"/></svg></a>
      <button class="btn" data-action="import"><svg class="i"><use href="#i-upload"/></svg>${esc(t('import_backup_btn'))}</button>
    </div>
  </li>`;
}

// --- feedback ---
function toast(msg, error = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Card image on hover/focus, from Scryfall.
const preview = $('#preview');
const previewImg = preview.appendChild(new Image()); // decorative: the hovered link already names the card
previewImg.alt = '';
let previewName = null; // card the user is pointing at
let loadedName = null; // card whose image previewImg currently shows
let hoverTimer;
function placePreview(x, y) {
  const w = preview.offsetWidth || 244;
  const h = preview.offsetHeight || 340;
  let left = x + 18;
  if (left + w > innerWidth - 8) left = x - w - 18;
  preview.style.left = `${Math.max(8, left)}px`;
  preview.style.top = `${Math.min(Math.max(8, y - h / 2), innerHeight - h - 8)}px`;
}
function showPreview(el, x, y) {
  const name = el.dataset.card;
  placePreview(x, y);
  if (previewName === name) return;
  previewName = name;
  clearTimeout(hoverTimer);
  if (loadedName === name) { preview.hidden = false; return; } // same card as before: nothing to fetch
  preview.hidden = true;
  // Short delay so sweeping the pointer across a list doesn't request every card passed over.
  hoverTimer = setTimeout(() => {
    loadedName = null;
    previewImg.onload = () => { if (previewName === name) { loadedName = name; preview.hidden = false; placePreview(x, y); } };
    previewImg.onerror = () => { if (previewName === name) preview.hidden = true; };
    previewImg.src = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
  }, 150);
}
function hidePreview() { clearTimeout(hoverTimer); previewName = null; preview.hidden = true; }

// --- actions ---
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const csvCell = (v) => { const s = String(v === undefined || v === null ? '' : v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

const ACTIONS = {
  'export-json': async () => {
    const all = await chrome.storage.local.get(null);
    const decs = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('dec:')).map(([k, v]) => [k.slice(4), v]));
    const anas = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('ana:')).map(([k, v]) => [k.slice(4), v]));
    download(`endstep-tracker-${stamp()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), matches, notes, decisions: decs, analyses: anas, decks: obj(all.decks) }), 'application/json');
    toast(tn('exported', matches.length));
  },
  'export-csv': () => {
    const rows = [['date', 'match_id', 'format', 'my_deck', 'opponent', 'opp_archetype', 'opp_colors', 'game', 'play_draw',
      'my_mulligans', 'opp_mulligans', 'game_result', 'turns', 'end_reason', 'match_result', 'match_score', 'opp_cards_seen', 'opp_deck_recognized']];
    for (const m of matches) {
      for (const g of m.games) {
        const p = onPlay(m, g);
        rows.push([new Date(m.startedAt).toISOString(), m.id, fmt(m), deckName(m), oppLabel(m), archetype(m), colorsOf(m), g.n,
          p === null ? '' : p ? 'play' : 'draw', g.mulligans[m.mySeat], opps(m).map((o) => g.mulligans[o.seat]).join('/'),
          gRes(m, g), g.turns, g.endReason, m.result || m.status, (m.score || []).join('-'),
          opps(m).map((o) => Object.entries((g.seen || {})[o.seat] || {}).map(([c, ids]) => `${ids.length} ${c}`).join('; ')).join(' | '),
          (guessFor(m) || {}).name || '']);
      }
    }
    download(`endstep-tracker-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
    toast(tn('csv_exported', rows.length - 1));
  },
  import: () => $('#import').click(),
  'import-analysis': () => $('#import-analysis').click(),
  clear: async () => {
    if (!confirm(t('confirm_clear'))) return;
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(all).filter((k) => /^(match|note|dec|ana):/.test(k)));
    openId = null;
    toast(t('all_deleted'));
  },
  reset: resetFilters,
  compare: () => setFilter({ compare: !state.compare }),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const menu = $('#data-menu');
  if (menu.matches(':popover-open')) menu.hidePopover();
  ACTIONS[el.dataset.action]();
});

$('#import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const raw = Array.isArray(data) ? data : (data && Array.isArray(data.matches)) ? data.matches : [];
    const list = raw.map(normalizeMatch).filter(Boolean);
    const items = {};
    for (const m of list) items['match:' + m.id] = m;
    for (const [id, n] of Object.entries(obj(data && data.notes))) if (items['match:' + id]) items['note:' + id] = obj(n);
    for (const [id, d] of Object.entries(obj(data && data.decisions))) if (items['match:' + id]) items['dec:' + id] = obj(d);
    for (const [id, a] of Object.entries(obj(data && data.analyses))) if (items['match:' + id]) items['ana:' + id] = obj(a);
    await chrome.storage.local.set(items);
    const skipped = raw.length - list.length;
    toast(list.length ? tn('imported', list.length) + (skipped ? tn('skipped', skipped) : '') : t('import_empty'), !list.length);
  } catch {
    toast(t('import_failed'), true);
  }
});

// An analysis produced by Endstep-coach/bot/coach-replay.js from this dashboard's JSON export: the best play per
// recorded decision. Kept under its own key, only for matches that are here.
$('#import-analysis').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const per = obj(data && data.matches);
    const items = {};
    for (const [id, games] of Object.entries(per)) {
      if (!matches.some((m) => m.id === id)) continue;
      items['ana:' + id] = { model: data.model || '', at: data.at || '', determinizations: data.determinizations || 1, games: obj(games) };
    }
    const n = Object.keys(items).length;
    if (n) await chrome.storage.local.set(items);
    toast(n ? tn('analysis_imported', n) : t('analysis_none'), !n);
  } catch {
    toast(t('import_failed'), true);
  }
});

$('#matches').addEventListener('click', (e) => {
  const use = e.target.closest('[data-use-guess]');
  if (use) {
    const id = use.closest('.match').dataset.id;
    notes[id] = Object.assign({}, notes[id], { archetype: use.dataset.useGuess });
    chrome.storage.local.set({ ['note:' + id]: notes[id] }).then(() => toast(t('archetype_saved')));
    return;
  }
  const ex = e.target.closest('[data-explain]');
  if (ex) {
    const id = ex.closest('.match').dataset.id;
    const m = matches.find((x) => x.id === id);
    if (m) explainDecision(m, ex.dataset.game, Number(ex.dataset.explain));
    return;
  }
  if (e.target.closest('[data-analyse]')) {
    const id = e.target.closest('.match').dataset.id;
    const m = matches.find((x) => x.id === id);
    if (m) analyseMatch(m);
    return;
  }
  if (e.target.closest('[data-delete]')) {
    const id = e.target.closest('.match').dataset.id;
    if (!confirm(t('confirm_delete_match'))) return;
    openId = null;
    chrome.storage.local.remove(['match:' + id, 'note:' + id, 'dec:' + id, 'ana:' + id]).then(() => toast(t('match_deleted')));
    return;
  }
  const btn = e.target.closest('.match-row');
  if (!btn) return;
  const id = btn.closest('.match').dataset.id;
  openId = openId === id ? null : id;
  const focusRow = () => { const again = document.querySelector(`.match[data-id="${CSS.escape(id)}"] .match-row`); if (again) again.focus({ preventScroll: true }); };
  if (openId) loadDecisions(id).then(() => { render(); focusRow(); });
  else { render(); focusRow(); }
});

$('#matches').addEventListener('change', (e) => {
  const field = e.target.dataset.note;
  if (!field) return;
  const id = e.target.closest('.match').dataset.id;
  const value = e.target.value.trim();
  notes[id] = Object.assign({}, notes[id], { [field]: value });
  if (!value) delete notes[id][field];
  const saved = { archetype: 'archetype_saved', notes: 'notes_saved', deckId: 'deck_saved' }[field] || 'notes_saved';
  chrome.storage.local.set({ ['note:' + id]: notes[id] }).then(() => toast(t(saved)));
});

$('#split').addEventListener('click', (e) => {
  const b = e.target.closest('button.rec');
  if (!b) return;
  if (b.dataset.kind === 'deck') { const [format, deck] = JSON.parse(b.dataset.key); setFilter({ scope: scopeFor({ format, deck }), version: null, compare: false, opp: null }); }
  else setFilter({ opp: state.opp && state.opp.key === b.dataset.key ? null : { key: b.dataset.key, label: b.dataset.label } });
});

$('#q').addEventListener('input', (e) => setFilter({ q: e.target.value }));
$('#f-scope').addEventListener('change', (e) => {
  const [format, deck] = JSON.parse(e.target.value);
  setFilter({ scope: scopeFor({ format, deck }), version: null, compare: false, opp: null }); // an archetype facet rarely survives a change of deck
});
$('#f-version').addEventListener('change', (e) => {
  const v = e.target.value;
  const vs = versionsOf(activeScope());
  const x = vs.list.find((y) => String(y.n) === v);
  setFilter({ version: x ? (x.key === vs.current ? null : x.key) : v, compare: false }); // the current list is the default
});
for (const seg of document.querySelectorAll('.seg[data-filter]')) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setFilter({ [seg.dataset.filter]: b.dataset.value });
  });
}
$('#facet-clear').addEventListener('click', () => setFilter({ opp: null }));
$('#reset').addEventListener('click', resetFilters);
$('#lang').addEventListener('change', (e) => {
  try { localStorage.setItem(LANG_PREF, e.target.value); } catch { /* storage unavailable */ }
  location.reload();
});
$('#live').addEventListener('click', () => {
  const m = liveMatch();
  if (!m) return;
  if (!listed(scoped()).includes(m)) { // bring the live match into view: its own deck, no other filter
    $('#q').value = '';
    setFilter({ q: '', result: 'all', period: 'all', opp: null, version: null, scope: scopeFor({ format: formatOf(m), deck: deckName(m) }) });
    if (!listed(scoped()).includes(m)) setFilter({ version: 'all' }); // its list is not recorded yet
  }
  openId = m.id;
  loadDecisions(m.id).then(render);
  const el = document.querySelector(`.match[data-id="${CSS.escape(m.id)}"]`);
  if (el) el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') hidePreview();
});
document.addEventListener('pointerover', (e) => {
  const el = e.target.closest('[data-card]');
  if (el && e.pointerType === 'mouse') showPreview(el, e.clientX, e.clientY);
});
document.addEventListener('pointermove', (e) => { if (previewName && e.target.closest('[data-card]')) placePreview(e.clientX, e.clientY); });
document.addEventListener('pointerout', (e) => {
  if (e.target.closest('[data-card]') && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-card]'))) hidePreview();
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest('[data-card]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  showPreview(el, r.right, r.top + r.height / 2);
});

// Live refresh while a match is being tracked: held back while the user types in a match or has text
// selected in the list (a re-render would destroy both), applied as soon as they are done.
const busy = () => {
  const a = document.activeElement;
  if (a && a.matches('input, textarea, select') && a.closest('.detail')) return true;
  const s = getSelection();
  return !!(s && !s.isCollapsed && s.anchorNode && $('#matches').contains(s.anchorNode));
};
function flushPending() {
  setTimeout(() => { // after focus/selection settle
    if (!pending || busy()) return;
    const changes = pending;
    pending = null;
    applyChanges(changes);
  }, 0);
}
document.addEventListener('focusout', (e) => {
  if (e.target.closest('[data-card]')) hidePreview();
  if (pending) flushPending();
});
document.addEventListener('selectionchange', () => { if (pending) flushPending(); });
addEventListener('scroll', hidePreview, { passive: true });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const mine = Object.fromEntries(Object.entries(changes).filter(([k]) => /^(match|note|dec|ana):/.test(k)));
  if (!Object.keys(mine).length) return;
  if (busy() || pending) { pending = Object.assign(pending || {}, mine); flushPending(); return; }
  applyChanges(mine);
});
setInterval(renderHeader, 60e3); // keep "il y a…" and the live pill fresh

(async () => {
  await initI18n();
  loadPrefs();
  await initMeta();
  await initCoach();
  initCoachServer().then(() => { if (coachServer) render(); }); // not awaited: a missing server must not delay the dashboard
  await load();
})();
