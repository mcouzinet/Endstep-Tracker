// Dashboard: match history, stats, annotations and exports.
const T = self.EndstepTracker;
const Meta = self.EndstepMeta;
const $ = (s) => document.querySelector(s);
const esc = self.EndstepShared.esc;

// --- i18n: every string lives in _locales/<lang>/messages.json (the manifest reads the same files) ---
const S = self.EndstepShared;
const LANG_PREF = S.LANG_PREF;
let locale = 'en';
let I18N = S.translator('en', () => null);
const t = (key, vars) => I18N.t(key, vars);
const tn = (key, n, vars) => I18N.tn(key, n, vars);

async function initI18n() {
  I18N = await S.loadI18n(); // the language picked here wins over the browser's; English fills any gap
  locale = I18N.locale;
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
const STALE_MS = S.STALE_MS;
const PREFS = 'endstep-tracker.filters';

// scope: null = the default (my most played deck over 30 days), else { format, deck }; a null format means every format,
// a null deck every deck of that format. Stats cover scope + period + opponent; result and search only narrow the history.
// version: null = the current list of the deck in view, 'all', '?' (matches without a recorded list) or a list key.
// tab: the view shown, one of TABS; kept across visits, never reset with the filters.
const TABS = ['matchups', 'cards', 'history'];
const state = { q: '', scope: null, version: null, compare: false, period: 'all', result: 'all', opp: null, sort: 'n', tab: 'matchups' };
let matches = [];
let notes = {}; // matchId -> { archetype, notes, deckId } (kept apart so the live tracker never overwrites them)
let decks = {}; // deckId -> { name, format, formatId, cards, sideboard }: my decks as seen on the site
let drawer = null; // { key } of the matchup open in the side panel
let curScope = null; // the scope of the last render
let openId = null;
let decisions = {}; // matchId -> { gameNumber: [decision] }, loaded only for the open match
let addon = null; // an optional module installed next to this page in development, never in the store builds
let pending = null; // storage changes held back while the user is editing or selecting inside a match
let toastTimer;

// --- data helpers ---
// Context for shared.js: my notes and decks as currently loaded, and the translator.
const C = { get notes() { return notes; }, get decks() { return decks; }, t: (k, v) => t(k, v) };
const { opps, colorsOf, gRes, onPlay, tally, pct } = S;
const oppLabel = (m) => opps(m).map((p) => p.name).join(', ') || '?';
const archetype = (m) => S.archetype(m, C);
const myDeck = (m) => S.myDeck(m, C);
const deckName = (m) => S.deckName(m, C);
const minutes = (from, to) => (from && to ? t('minutes', { n: Math.max(1, Math.round((to - from) / 60000)) }) : '');
const endReason = (r) => (r ? (END_REASON[r] ? t(END_REASON[r]) : r) : '');
const resultLabel = (r) => t(RESULT[r]);
const isLive = (m) => S.isLive(m);
const liveMatch = () => matches.find(isLive);

const formatOf = (m) => S.formatOf(m, C);
// Format as displayed: ranked is a queue, not a format, so it is a suffix here and absent from the format chips.
const fmt = (m) => formatOf(m) + (m.ranked ? t('ranked_suffix') : '');

const scoreText = S.scoreText;

const pips = (c) => S.pips(c, t);

const cardLink = (name) => `<a class="card" data-card="${esc(name)}" href="https://scryfall.com/search?q=${encodeURIComponent(`!"${name}"`)}" target="_blank" rel="noopener">${esc(name)}</a>`;

const ago = (ts) => S.ago(ts, I18N);
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
  if (!TABS.includes(state.tab)) state.tab = 'matchups';
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
  const rated = matches.filter((m) => !S.vsAI(m)); // a deck trained against the AI would open on empty records
  const best = top(rated.filter((m) => m.startedAt >= Date.now() - 30 * 864e5)) || top(rated);
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
function setTab(tab) {
  if (tab !== 'matchups') drawer = null; // the matchup panel belongs to the matchups
  setFilter({ tab });
}
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
// Version in view: 'all', '?' or a list key; every version by default, a single one when picked in the menu.
function activeVersion(vs) {
  if (vs.list.length < 2) return 'all';
  const v = state.version;
  return (v === '?' && vs.unknown) || vs.list.some((x) => x.key === v) ? v : 'all';
}
// Cards added (+) and cut (−) from one list key to another, additions first.
function listDiff(from, to) {
  const counts = (key) => Object.fromEntries(key.split('\n').map((l) => [l.slice(l.indexOf(' ') + 1), Number(l.slice(0, l.indexOf(' ')))]));
  const a = counts(from); const b = counts(to);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].map((n) => [n, (b[n] || 0) - (a[n] || 0)]).filter(([, d]) => d)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], locale));
}

// What the stats are about: the scope, its list version, the period, the opponent facet; never a match against the AI,
// which only the history lists (withAI).
function scoped(version, withAI = false) {
  const s = activeScope();
  const v = version === undefined ? activeVersion(versionsOf(s)) : version;
  const since = state.period === 'all' ? 0 : Date.now() - Number(state.period) * 864e5;
  return matches.filter((m) => inScope(m, s) && m.startedAt >= since
    && (v === 'all' || (v === '?' ? versionKey(m) === null : versionKey(m) === v))
    && (!state.opp || oppKey(m)[0] === state.opp.key)
    && (withAI || !S.vsAI(m)));
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
  const tree = new Map(); // format -> { n, decks: Map(deck -> n) }, counting the matches the records are made of
  const rated = matches.filter((m) => !S.vsAI(m));
  for (const m of rated) {
    const e = tree.get(formatOf(m)) || { n: 0, decks: new Map() };
    e.n++;
    e.decks.set(deckName(m), (e.decks.get(deckName(m)) || 0) + 1);
    tree.set(formatOf(m), e);
  }
  const byCount = (a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), locale);
  const opt = (format, deck, label, n) => `<option value="${esc(JSON.stringify([format, deck]))}">${esc(label)} (${n})</option>`;
  $('#f-scope').innerHTML = opt(null, null, t('scope_all'), rated.length) + [...tree].sort((a, b) => byCount([a[0], a[1].n], [b[0], b[1].n])).map(([f, e]) => `<optgroup label="${esc(f)}">${
    e.decks.size > 1 ? opt(f, null, t('scope_all_format', { format: f }), e.n) : ''}${
    [...e.decks].sort(byCount).map(([d, n]) => opt(f, d, t('scope_deck', { deck: d, format: f }), n)).join('')}</optgroup>`).join('');
}

// --- data loading ---
// Records come from the tracker or from an imported file: keep only what the page can render.
const obj = S.obj;
const normalizeMatch = S.normalizeMatch;

async function load() {
  const all = await S.loadStore();
  matches = [];
  notes = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('match:')) {
      const m = normalizeMatch(v);
      if (m) matches.push(m);
      else console.warn('[endstep-tracker] unreadable record skipped:', k);
    } else if (k.startsWith('note:')) notes[k.slice(5)] = obj(v);
    else if (k === 'decks') decks = obj(v);
  }
  // Imported from the site's history but recorded by the tracker too, under another id: the recorded one stays.
  const twins = new Set(S.historyDuplicates(matches));
  if (twins.size) {
    matches = matches.filter((m) => !twins.has(m.id));
    chrome.storage.local.remove([...twins].map((id) => 'match:' + id));
  }
  if (addon) addon.load(all);
  showPromo(all.promoClosed);
  refresh();
}

// Deck Compare promo, where Deck Compare is listed (Chrome Web Store, Edge Add-ons) and not installed. Closed, it stays
// hidden until the next release (X.Y, not a dev build), then comes back, with promo_news if that line changed.
const RELEASE = chrome.runtime.getManifest().version.split('.').slice(0, 2).join('.');
const DECK_COMPARE = location.protocol !== 'chrome-extension:' ? null // Firefox, Safari: not listed there yet
  : / Edg\//.test(navigator.userAgent)
    ? { id: 'akklkakfdidemfbbnjmhiofkhkcnhfbc', cta: 'promo_cta_edge', url: 'https://microsoftedge.microsoft.com/addons/detail/deck-compare-%E2%80%93-mtg/akklkakfdidemfbbnjmhiofkhkcnhfbc' }
    : { id: 'miijiappldgijnnokopjfiponelkdhcg', cta: 'promo_cta_chrome', url: 'https://chromewebstore.google.com/detail/deck-compare-%E2%80%93-mtg/miijiappldgijnnokopjfiponelkdhcg' };
let promoOn = false; // shown above the summary once there are matches (never over the onboarding)
async function showPromo(closed) {
  closed = obj(closed);
  if (!DECK_COMPARE || closed.at === RELEASE) return;
  // An installed Deck Compare answers this ping (its background.js); otherwise sendMessage rejects.
  if (await chrome.runtime.sendMessage(DECK_COMPARE.id, { ping: 'endstep-tracker' }).catch(() => null)) return;
  $('#promo-link').href = DECK_COMPARE.url;
  const cta = $('#promo-cta');
  cta.dataset.i18n = DECK_COMPARE.cta; // re-translated on a language switch
  cta.textContent = t(DECK_COMPARE.cta);
  $('#promo-news').hidden = !closed.at || closed.news === t('promo_news');
  promoOn = true;
  $('#promo').hidden = !matches.length;
}
$('#promo-close').addEventListener('click', () => {
  promoOn = false;
  $('#promo').hidden = true;
  chrome.storage.local.set({ promoClosed: { at: RELEASE, news: t('promo_news') } });
});

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
    } else if (k === 'decks') decks = obj(c.newValue);
    else if (k === 'meta') useMeta(c.newValue); // loaded by another dashboard tab
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

// --- opponent deck recognition, from endstep.cc's public metagame (see meta.js) ---
const META_TTL = 7 * 864e5;
const metaData = {}; // formatId -> { at, decks }
let metaFormats = null; // formats that have metagame data
let metaFormatsAt = 0;
let metaBusy = false;
let metaFailed = false;
const guessMemo = new Map();

function useMeta(s) {
  if (!s) return;
  Object.assign(metaData, obj(s.byFormat));
  if (Array.isArray(s.formats)) { metaFormats = s.formats; metaFormatsAt = s.formatsAt || 0; }
}
const initMeta = async () => useMeta((await chrome.storage.local.get('meta')).meta);
const persistMeta = () => chrome.storage.local.set({ meta: { formats: metaFormats, formatsAt: metaFormatsAt, byFormat: metaData } });

const oppCards = (m) => opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat)));
const recognizable = (m) => !archetype(m) && !S.NO_RECOGNITION.test(`${m.format || ''} ${m.formatId || ''}`)
  && oppCards(m).filter((c) => !S.BASIC.test(c)).length >= 2;
const metaFormatOf = (m) => S.metaFormat(m, C, metaFormats); // the one format a match is compared with (see shared.js)
const fresh = (f) => metaData[f] && Date.now() - metaData[f].at < META_TTL;

function guessFor(m) {
  if (!recognizable(m)) return null;
  const f = metaFormatOf(m);
  if (!f || !metaData[f]) return null;
  const key = `${m.id}|${m.updatedAt}|${f}${metaData[f].at}`;
  if (!guessMemo.has(key)) guessMemo.set(key, S.recognize(m, C, { formats: metaFormats, byFormat: metaData }, Meta, T));
  return guessMemo.get(key);
}

// Load what the current matches need, one format at a time (about one request per archetype), then re-render.
async function ensureMeta() {
  if (metaBusy || metaFailed) return;
  const need = matches.filter(recognizable);
  const stale = () => !metaFormats || Date.now() - metaFormatsAt > META_TTL;
  const wanted = () => [...new Set(need.map(metaFormatOf))].filter((f) => f && !fresh(f));
  if (!need.length || (!stale() && !wanted().length)) return;
  metaBusy = true;
  let loaded = false;
  try {
    // One dashboard tab downloads at a time: another one waiting here then finds the result in storage.
    await navigator.locks.request('endstep-tracker-meta', async () => {
      await initMeta();
      if (stale()) {
        metaFormats = await Meta.listFormats();
        metaFormatsAt = Date.now();
        await persistMeta();
      }
      for (const f of wanted()) {
        if (!metaData[f]) toast(t('guess_loading', { format: f }));
        metaData[f] = await Meta.loadFormat(f);
        await persistMeta();
        render();
        loaded = true;
      }
    });
    if (loaded) refresh(); // datalist gains the new archetype names
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
  for (const id of ['#filters', '#glance', '#tabs', '#list-tools', '#list-head', '#list-foot']) $(id).hidden = !has;
  $('#promo').hidden = !(has && promoOn);
  for (const b of document.querySelectorAll('#tabs [role="tab"]')) {
    const on = b.dataset.tab === state.tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  $('#split').hidden = !has || state.tab !== 'matchups';
  $('#cards-panel').hidden = !has || state.tab !== 'cards';
  $('#history').hidden = has && state.tab !== 'history'; // with no match yet, it holds the onboarding
  renderHeader();
  if (!has) { $('#matches').innerHTML = onboarding(); return; }
  const s = activeScope();
  const vs = versionsOf(s);
  const v = activeVersion(vs);
  const stats = scoped(v);
  const shown = scoped(v, true); // the history also lists the matches against the AI
  const list = listed(shown);
  const cur = vs.list.find((x) => x.key === v);
  const prev = cur && vs.list[cur.n - 2];
  const cmp = prev && state.compare ? { label: t('version_n', { n: prev.n }), list: scoped(prev.key) } : null;
  curScope = s;
  renderFilters(s, shown, list, vs, v);
  renderGlance(stats, cmp);
  renderVersions(cur, prev);
  renderOverview(stats);
  renderCards(s, stats);
  renderBreakdown('#by-opp', stats, oppKey, 'opp', cmp);
  $('#decks-panel').hidden = s.deck !== null; // one deck in view: nothing to break down
  if (s.deck === null) {
    renderBreakdown('#by-deck', stats, (m) => [JSON.stringify([formatOf(m), deckName(m)]),
      esc(deckName(m)) + (s.format === null ? ` <span class="muted">· ${esc(formatOf(m))}</span>` : ''), deckName(m)], 'deck');
  }
  $('#history').classList.toggle('one-deck', s.deck !== null);
  renderMatches(list);
  renderDrawer(s, stats, vs);
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

function renderFilters(s, shown, list, vs, v) {
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
  $('#count').textContent = tn('n_matches', list.length) + (list.length !== shown.length ? t('of_total', { total: shown.length }) : '');
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
const { wl } = S;
// Secondary record cells: [{ key, title, r, cls }], each W–L plus the rate once the sample allows it.
// Their key is read by screen readers and shown in narrow windows, where the column captions are hidden.
const sideCells = (r) => [{ key: t('col_play'), title: t('on_play'), r: r.play }, { key: t('col_draw'), title: t('on_draw'), r: r.draw }];
const cmpCell = (label, r) => ({ key: label, title: t('cmp_title', { v: label }), r, cls: ' cmp' });
function subCell({ key, title, r, cls = '' }) {
  const n = r.W + r.L + r.D;
  return `<span class="rec-sub${n < MIN_SAMPLE ? ' early' : ''}${cls}" title="${esc(title)}"><span class="k">${esc(key)}</span>${n >= MIN_SAMPLE ? `<b>${pct(r)}</b> ` : ''}${n ? wl(r) : '—'}</span>`;
}
// Column captions above records that carry cells; `opens` rows end with an arrow (they open the matchup panel).
const recHead = (first, main, cells, opens = false) => `<div class="rec${cells.length ? ' cells' : ''} head${opens ? ' opens' : ''}"${cells.length ? ` style="--cells:${cells.length}"` : ''} aria-hidden="true"><span>${esc(first)}</span><span class="main">${esc(main)}</span>`
  + `${cells.map((c) => `<span title="${esc(c.title)}">${esc(c.key)}</span>`).join('')}${opens ? '<span></span>' : ''}</div>`;
function rec(labelHtml, r, { tag = 'div', attrs = '', cells = [], opens = false } = {}) {
  const n = r.W + r.L + r.D;
  const aria = n ? [tn('wins', r.W), tn('losses', r.L), r.D ? tn('draws', r.D) : ''].filter(Boolean).join(', ') : t('no_data');
  const early = n < MIN_SAMPLE;
  const marks = early
    ? `<span class="dots" role="img" aria-label="${esc(aria)}" title="${esc(aria)}">${'<i class="w"></i>'.repeat(r.W)}${'<i class="d"></i>'.repeat(r.D)}${'<i class="l"></i>'.repeat(r.L)}</span>`
    : `<span class="bar" role="img" aria-label="${esc(aria)}" title="${esc(aria)}">${[['w', r.W], ['d', r.D], ['l', r.L]].filter(([, v]) => v)
      .map(([c, v]) => `<i class="${c}" style="flex-grow:${v}"></i>`).join('')}</span>`;
  const rate = !n ? '<span class="early">—</span>' : early ? `<span class="early" title="${esc(t('too_early_title', { n: MIN_SAMPLE }))}">${esc(t('too_early'))}</span>` : pct(r);
  const cls = `rec${cells.length ? ' cells' : ''}${opens ? ' opens' : ''}`;
  return `<${tag} class="${cls}" ${cells.length ? `style="--cells:${cells.length}" ` : ''}${attrs}>
    <span class="rec-label">${labelHtml}</span>
    ${marks}
    <span class="rec-pct">${rate}</span>
    <span class="rec-count">${wl(r)}</span>${cells.map(subCell).join('')}${opens ? '<svg class="i open-chev" aria-hidden="true"><use href="#i-chevron"/></svg>' : ''}
  </${tag}>`;
}

function renderOverview(list) {
  // Everything in matches: play/draw and the kept 7 or mulligan are those of game 1.
  const ctx = { play: tally(), draw: tally(), keep: tally(), mull: tally() };
  for (const x of list) {
    if (isLive(x) || !x.result) continue; // a match in progress has no record yet
    const p = S.matchOnPlay(x);
    if (p !== null) ctx[p ? 'play' : 'draw'][x.result]++;
    const g1 = S.firstGame(x);
    if (g1) ctx[g1.mulligans[x.mySeat] ? 'mull' : 'keep'][x.result]++;
  }
  const row = (label, k) => rec(esc(label), ctx[k]);
  $('#overview').innerHTML = `<h2 class="panel-title">${esc(t('by_context'))}</h2><p class="muted context-hint">${esc(t('context_hint'))}</p>
    ${row(t('on_play'), 'play')}${row(t('on_draw'), 'draw')}${row(t('kept_seven'), 'keep')}${row(t('after_mulligan'), 'mull')}`;
}

// --- my cards: the results of the games where I drew each card, beside those where it stayed in my library ---
// Counted in games (a card is drawn in a game). The gap between the two rates, in points, sorts the list once both
// have MIN_SAMPLE results: a link between drawing the card and winning, not proof that the card wins.
const CARD_ROWS = 15;
function renderCards(s, list) {
  const el = $('#cards-panel');
  if (s.deck === null) { // a card's results only mean something within one deck
    el.innerHTML = `<p class="muted cards-note">${esc(t('cards_needs_deck'))}</p>`;
    return;
  }
  const n = (r) => r.W + r.L + r.D;
  const winRate = (r) => (r.W + r.L ? r.W / (r.W + r.L) : null);
  const gap = (x) => (n(x.drawn) >= MIN_SAMPLE && n(x.notDrawn) >= MIN_SAMPLE && winRate(x.drawn) !== null && winRate(x.notDrawn) !== null
    ? Math.round(100 * winRate(x.drawn)) - Math.round(100 * winRate(x.notDrawn)) : null);
  const rows = S.cardStats(list, C).map((x) => Object.assign(x, { gap: gap(x) }))
    .filter((x) => n(x.drawn) || n(x.opening))
    .sort((a, b) => (a.gap === null) - (b.gap === null) || (b.gap || 0) - (a.gap || 0) || n(b.drawn) - n(a.drawn)
      || n(b.opening) - n(a.opening) || a.name.localeCompare(b.name, locale));
  const cells = (x) => [{ key: t('col_not_drawn'), title: t('not_drawn_title'), r: x.notDrawn }, { key: t('col_opening'), title: t('opening_title'), r: x.opening }];
  const row = (x) => {
    const g = x.gap === null ? '' : ` <span class="gap ${x.gap > 0 ? 'up' : x.gap < 0 ? 'down' : ''}" title="${esc(t('gap_title', { d: x.gap }))}">${x.gap > 0 ? '+' : x.gap < 0 ? '−' : '±'}${Math.abs(x.gap)}</span>`;
    return rec(cardLink(x.name) + g, x.drawn, { cells: cells(x) });
  };
  const recorded = list.some((m) => m.games.some((g) => g.drawn));
  const more = rows.slice(CARD_ROWS);
  const body = !rows.length ? `<p class="muted cards-note">${esc(t('cards_none'))}</p>`
    : recHead(t('col_card'), t('col_drawn'), cells({ notDrawn: S.tally(), opening: S.tally() })) + rows.slice(0, CARD_ROWS).map(row).join('')
      + (more.length ? `<details class="others more"${(el.querySelector('details.more') || {}).open ? ' open' : ''}><summary><svg class="i chev" aria-hidden="true"><use href="#i-chevron"/></svg>${esc(tn('more_cards', more.length))}</summary>${more.map(row).join('')}</details>` : '');
  el.innerHTML = `<h2 class="panel-title">${esc(t('by_card'))}</h2><p class="muted context-hint">${esc(t('cards_hint'))}</p>`
    + (recorded ? '' : `<p class="muted cards-note">${esc(t('cards_since'))}</p>`) + body;
}

// --- at a glance: the win rate in matches and the latest FORM matches, each one detailed on hover ---
const FORM = 20;
function renderGlance(list, cmp) {
  const el = $('#glance');
  const done = list.filter((x) => x.result && !isLive(x)).sort((a, b) => a.startedAt - b.startedAt);
  el.hidden = !done.length;
  if (!done.length) return;
  const n = done.length;
  const r = S.records(done);
  let mulls = 0; let played = 0; let time = 0; let timed = 0; // matches imported from the site's history have no games
  for (const x of done) {
    if (x.games.length) played++;
    for (const gm of x.games) mulls += gm.mulligans[x.mySeat] || 0;
    if (x.endedAt) { time += x.endedAt - x.startedAt; timed++; }
  }
  const enough = (x) => x.W + x.L + x.D >= MIN_SAMPLE;
  const record = (x) => `${wl(x)}${enough(x) ? ` <span class="muted">· ${pct(x)}</span>` : ''}`;
  const fact = (label, value, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
  const facts = [
    fact(t('matches'), record(r.m)),
    cmp ? fact(`${cmp.label} · ${t('matches')}`, record(S.records(cmp.list).m), 'cmp') : '',
    fact(t('on_play'), record(r.play)),
    fact(t('on_draw'), record(r.draw)),
    played ? fact(t('fact_mulligans'), `${(mulls / played).toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} <span class="muted">${esc(t('per_match'))}</span>`) : '',
    timed ? fact(t('fact_duration'), `${Math.max(1, Math.round(time / timed / 60000))} ${esc(t('min'))} <span class="muted">${esc(t('per_match'))}</span>`) : '',
  ].join('');
  const hero = `<b class="hero-n">${enough(r.m) ? pct(r.m) : wl(r.m)}</b><span class="hero-l">${esc(t(enough(r.m) ? 'glance_rate' : 'glance_early'))}<br><span class="muted">${esc(tn('glance_over', n))}</span></span>`;
  const square = (x) => `<button type="button" class="${x.result}" data-show="${esc(x.id)}" aria-label="${esc([resultLabel(x.result), scoreText(x), oppLabel(x), archetype(x)].filter(Boolean).join(' · '))}"><i></i></button>`;
  el.innerHTML = `<div class="glance-head"><div class="hero">${hero}</div><dl class="glance-facts">${facts}</dl></div>
    <div class="glance-form"><h3>${esc(t('recent_form', { n: Math.min(FORM, n) }))}</h3><div class="form-strip">${done.slice(-FORM).map(square).join('')}</div>
    <div class="form-tip" hidden></div></div>`;
}
// A square's card, on hover or keyboard focus: the result, the opponent, their archetype, my deck and the format, when.
function formCard(e) {
  const b = e.target.closest && e.target.closest('.form-strip button');
  const tip = $('#glance .form-tip');
  if (!tip) return;
  const m = b && matches.find((x) => x.id === b.dataset.show);
  if (!m) { tip.hidden = true; return; }
  const arch = archetype(m) || (guessFor(m) || {}).name;
  tip.innerHTML = `<p class="form-tip-head">${resultBadge(m)} <b>${esc(scoreText(m))}</b></p>`
    + `<p><span class="opp-name">${esc(t('ov_against', { opp: oppLabel(m) }))}</span> ${pips(colorsOf(m))}</p>`
    + (arch ? `<p><span class="tag${archetype(m) ? '' : ' guess'}">${esc(arch)}</span></p>` : '')
    + `<p class="muted">${esc(deckName(m))} · ${esc(fmt(m))}</p><p class="muted">${esc(ago(m.startedAt))}</p>`;
  const box = tip.parentElement.getBoundingClientRect();
  const r = b.getBoundingClientRect();
  const x = r.left + r.width / 2 - box.left;
  tip.style.left = x + 'px';
  tip.style.top = r.top - box.top + 'px';
  tip.dataset.side = x < 120 ? 'start' : x > box.width - 120 ? 'end' : 'mid';
  tip.hidden = false;
}

// A rate needs enough matches to rank: under MIN_SAMPLE a matchup sorts after the ones that have them.
const rate = (r) => { const n = r.W + r.L + r.D; return n ? (r.W + r.D / 2) / n : 0; };
function sortRows(rows, how) {
  const few = (e) => (e.r.m.W + e.r.m.L + e.r.m.D >= MIN_SAMPLE ? 0 : 1);
  const by = {
    worst: (a, b) => few(a) - few(b) || rate(a.r.m) - rate(b.r.m) || b.n - a.n,
    best: (a, b) => few(a) - few(b) || rate(b.r.m) - rate(a.r.m) || b.n - a.n,
    n: (a, b) => b.n - a.n,
  };
  return rows.sort((a, b) => (by[how] || by.n)(a, b) || (b.c.W + b.c.L + b.c.D) - (a.c.W + a.c.L + a.c.D));
}

// kind 'opp': the matchup guide, whose rows open the matchup panel; kind 'deck': my decks, whose rows scope the page.
// cmp: { label, list }, another list version whose match record sits beside each matchup.
function renderBreakdown(sel, list, keyOf, kind, cmp = null) {
  const groups = new Map();
  const group = (m) => {
    const [key, label, text] = keyOf(m);
    if (!groups.has(key)) groups.set(key, { key, label, text, list: [], cmp: [] });
    return groups.get(key);
  };
  for (const m of list) group(m).list.push(m);
  if (cmp) for (const m of cmp.list) group(m).cmp.push(m);
  const finished = (r) => r.W + r.L + r.D;
  // Only groups with a finished match (in either version): an in-progress match has no record yet.
  const rows = sortRows([...groups.values()].map((e) => Object.assign(e, { r: S.records(e.list), c: S.records(e.cmp).m, n: e.list.length }))
    .filter((e) => finished(e.r.m) || finished(e.c)), kind === 'opp' ? state.sort : 'n');
  const opp = kind === 'opp';
  const cellsOf = (r, c) => [...(opp ? sideCells(r) : []), ...(cmp ? [cmpCell(cmp.label, c)] : [])];
  const button = (e) => {
    const title = opp ? t('open_matchup', { label: e.text }) : t('only_show', { label: e.text });
    const attrs = `type="button" data-kind="${kind}" data-key="${esc(e.key)}" data-label="${esc(e.text)}" title="${esc(title)}"`
      + (opp ? ` aria-controls="drawer" aria-expanded="${!!drawer && drawer.key === e.key}"` : '');
    return rec(e.label, e.r.m, { tag: 'button', attrs, cells: cellsOf(e.r, e.c), opens: opp });
  };
  // Up to MAX_ROWS archetypes in the sort order; the ones after fold into one "Others" row (never a fold of one).
  const MAX_ROWS = 20;
  const fold = opp && rows.length > MAX_ROWS + 1;
  const rare = fold ? rows.slice(MAX_ROWS) : [];
  let html = (fold ? rows.slice(0, MAX_ROWS) : rows).map(button).join('');
  if (fold) {
    const sum = S.records(rare.flatMap((e) => e.list));
    const c = S.records(rare.flatMap((e) => e.cmp)).m;
    const open = !!($(sel).querySelector('details.others') || {}).open || rare.some((e) => drawer && drawer.key === e.key);
    html += `<details class="others"${open ? ' open' : ''}><summary>${rec(`<svg class="i chev" aria-hidden="true"><use href="#i-chevron"/></svg>${esc(tn('others', rare.length))}`, sum.m, { tag: 'span', cells: cellsOf(sum, c), opens: opp })}</summary>${rare.map(button).join('')}</details>`;
  }
  if (html) html = recHead(t(opp ? 'col_archetype' : 'col_deck'), t('matches'), cellsOf(S.records([]), S.tally()), opp) + html;
  $(sel).innerHTML = html || `<p class="muted" style="padding:6px 8px 10px">${esc(t(scopeActive() ? 'no_finished_selection' : 'no_finished_all'))}</p>`;
}

// --- matchup panel: one archetype against the deck in view, its cards, its matches ---
function renderDrawer(s, stats, vs) {
  const el = $('#drawer');
  const list = drawer ? stats.filter((m) => oppKey(m)[0] === drawer.key) : [];
  if (drawer && !list.length) drawer = null; // gone from the page's scope
  el.hidden = !drawer;
  document.body.classList.toggle('drawer-open', !!drawer);
  if (!drawer) return;
  const r = S.records(list);
  const stat = (label, x) => `<div><dt>${esc(label)}</dt><dd><b>${wl(x)}</b>${x.W + x.L + x.D >= MIN_SAMPLE ? ` · ${pct(x)}` : ''}</dd></div>`;
  const byVersion = vs.list.length > 1 ? [...vs.list].reverse().map((x) => {
    const rr = S.records(scoped(x.key).filter((m) => oppKey(m)[0] === drawer.key)).m;
    return rr.W + rr.L + rr.D ? `<li>${esc(t('version_n', { n: x.n }))} <b>${wl(rr)}</b></li>` : '';
  }).join('') : '';
  const seen = new Map(); // card -> number of these matches where it showed up
  for (const m of list) for (const name of new Set(opps(m).flatMap((p) => Object.keys(T.seenCards(m, p.seat))))) seen.set(name, (seen.get(name) || 0) + 1);
  const cards = [...seen].filter(([n]) => !S.BASIC.test(n)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale)).slice(0, 24)
    .map(([name, n]) => `<li>${cardLink(name)} <span class="muted">${esc(t('seen_in', { n, total: list.length }))}</span></li>`).join('');
  const where = s.deck !== null ? t('scope_deck', { deck: s.deck, format: s.format }) : s.format !== null ? t('scope_all_format', { format: s.format }) : t('scope_all');
  const ver = vs.list.find((x) => x.key === activeVersion(vs));
  // My usual sideboarding here, with the deck in view: across decks it would mean nothing.
  const side = s.deck === null ? `<p class="muted">${esc(t('side_needs_deck'))}</p>` : sidePlanBlock(S.sidePlan(list, C));
  el.innerHTML = `<header><h2 id="drawer-title">${oppKey(list[0])[1]}</h2><button class="icon-btn" data-close-drawer aria-label="${esc(t('drawer_close'))}" title="${esc(t('drawer_close'))}"><svg class="i"><use href="#i-x"/></svg></button></header>
    <p class="muted drawer-scope">${esc(where)}${ver ? ` · ${esc(t('version_n', { n: ver.n }))}` : ''}</p>
    <dl class="drawer-stats">${stat(t('matches'), r.m)}${stat(t('on_play'), r.play)}${stat(t('on_draw'), r.draw)}</dl>
    <section><h3>${esc(t('side_plan'))}</h3>${side}</section>
    ${byVersion ? `<section><h3>${esc(t('by_version'))}</h3><ul class="versions-list">${byVersion}</ul></section>` : ''}
    ${cards ? `<section><h3>${esc(t('cards_seen_there'))}</h3><ul class="seen-list">${cards}</ul></section>` : ''}
    <section><h3>${esc(t('matches_vs'))}</h3><ul class="drawer-matches">${list.map((m) => `<li><button class="drawer-match" data-show="${esc(m.id)}">${resultBadge(m)}`
      + `<span class="who"><span class="opp-name">${esc(oppLabel(m))}</span><span class="muted">${esc(ago(m.startedAt))}</span></span><span class="score">${scoreText(m)}</span></button></li>`).join('')}</ul></section>
    <div><button class="btn" data-filter-matchup>${esc(t('filter_matchup'))}</button></div>`;
}
// The cards I usually bring in and take out after game 1, each with the share of matches where I did.
function sidePlanBlock(plan) {
  if (!plan.matches) return `<p class="muted">${esc(t('side_none'))}</p>`;
  const item = (x, dir) => `<li><span class="chg ${dir > 0 ? 'add' : 'cut'}">${dir > 0 ? '+' : '−'}${esc(x.qty)}</span> ${cardLink(x.name)} <span class="muted">${esc(t('seen_in', { n: x.times, total: plan.matches }))}</span></li>`;
  const col = (label, xs, dir) => (xs.length ? `<div><h4>${esc(label)}</h4><ul>${xs.map((x) => item(x, dir)).join('')}</ul></div>` : '');
  const cols = col(t('side_in'), plan.in, 1) + col(t('side_out'), plan.out, -1);
  return `${cols ? `<div class="side-plan">${cols}</div>` : `<p>${esc(t('side_no_change'))}</p>`}<p class="muted side-over">${esc(tn('side_over', plan.matches))}</p>`;
}
function openDrawer(key) {
  drawer = { key };
  render();
  const close = $('#drawer [data-close-drawer]');
  if (close) close.focus();
}
function closeDrawer() {
  if (!drawer) return;
  const { key } = drawer;
  drawer = null;
  render();
  const row = [...document.querySelectorAll('#by-opp button.rec')].find((b) => b.dataset.key === key);
  if (row) row.focus();
}

// Open a match in the history, widening the filters when they hide it (its own deck, every list version if need be).
function showMatch(m) {
  drawer = null;
  state.tab = 'history';
  savePrefs();
  if (!listed(scoped()).includes(m)) {
    $('#q').value = '';
    setFilter({ q: '', result: 'all', period: 'all', opp: null, version: null, scope: scopeFor({ format: formatOf(m), deck: deckName(m) }) });
    if (!listed(scoped()).includes(m)) setFilter({ version: 'all' }); // its list is not recorded (yet)
  }
  openId = m.id;
  loadDecisions(m.id).then(() => {
    render();
    const el = document.querySelector(`.match[data-id="${CSS.escape(m.id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.querySelector('.match-row').focus({ preventScroll: true });
  });
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
    <span class="opp"><span class="opp-name">${esc(oppLabel(m))}</span>${pips(colorsOf(m))}${S.vsAI(m) ? `<span class="tag ai" title="${esc(t('ai_tag_title'))}">${esc(t('ai_tag'))}</span>` : ''}${a ? `<span class="tag">${esc(a)}</span>` : guessTag(m)}</span>
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
  const auto = m.myDeck ? (decks[m.myDeck.id] || {}).name || m.myDeck.name || `Deck ${m.myDeck.id.slice(0, 8)}` : m.limitedDeck ? t('limited_deck') : t('unknown');
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
        <label class="field">${esc(t('opp_archetype'))}<input data-note="archetype" list="archetypes" value="${esc(n.archetype || '')}" placeholder="${esc(S.commanderOf(m) || t('archetype_placeholder'))}"></label>
        ${guessLine(m)}
        <label class="field">${esc(t('notes'))}<textarea data-note="notes" placeholder="${esc(t('notes_placeholder'))}">${esc(n.notes || '')}</textarea></label>
        ${deckPicker}
        ${addon ? addon.matchActions(m) : ''}
        ${mine}
        <button class="btn-text" data-delete><svg class="i"><use href="#i-trash"/></svg>${esc(t('delete_match'))}</button>
      </div>
      <div class="games">${m.games.map((g) => gameBlock(m, g)).join('') || `<p class="muted">${esc(t(m.source === 'history' ? 'imported_no_games' : 'no_games'))}</p>`}</div>
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
  const changes = S.sideChanges(m, g.n, C);
  const side = changes ? `<p class="side-line"><span class="label">${esc(t('side_label'))}</span>${changes.length
    ? changes.map(([name, d]) => `<span class="chg ${d > 0 ? 'add' : 'cut'}">${d > 0 ? '+' : '−'}${Math.abs(d)} ${cardLink(name)}</span>`).join(', ')
    : esc(t('side_no_change'))}</p>` : '';

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
  return `<article class="game"><header class="game-head"><h4>${esc(t('game_n', { n: g.n }))}</h4>${res}<span class="facts-inline">${facts}</span></header>${kv}${side}${hand}${timeline}${addon ? addon.gameBlock(m, g) : ''}${decisionsBlock(m, g)}${log}</article>`;
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
  // dev-only { the decision journal: left out of the store builds by release.sh, which then shows nothing here
  const ds = (decisions[m.id] || {})[g.n] || [];
  if (!ds.length) return '';
  const rows = ds.map((d) => {
    const board = d.board && d.board.players ? d.board.players.map((pl, s) => `${s === m.mySeat ? t('me') : t('opp_short')} ${pl.life}`).join(' · ') : '';
    const prompt = d.prompt ? (d.prompt.message || d.prompt.type) : '';
    const options = d.prompt && d.prompt.options && d.prompt.options.length ? ` <span class="muted">[${esc(d.prompt.options.join(', '))}]</span>` : '';
    return `<li title="${esc(board)}"><span>T${esc(d.turn)} ${esc(d.phase || '')}</span>${esc(prompt)}${options} → <b>${esc(describeAction(d.answer || {}))}</b></li>`;
  }).join('');
  return `<details class="log" data-key="dec:${esc(m.id)}:${esc(g.n)}"><summary>${esc(t('decisions_title', { n: ds.length }))}</summary><ol>${rows}</ol></details>`;
  // } dev-only
  return '';
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
      <button class="btn" data-action="import-history"><svg class="i"><use href="#i-history"/></svg>${esc(t('import_history'))}</button>
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
    download(`endstep-tracker-${stamp()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), matches, notes, decisions: decs, decks: obj(all.decks), plans: Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith('plan:'))), ...(addon ? addon.exportExtra(all) : {}) }), 'application/json');
    toast(tn('exported', matches.length));
  },
  'export-csv': () => {
    const rows = [['date', 'match_id', 'format', 'my_deck', 'opponent', 'opp_archetype', 'opp_colors', 'game', 'play_draw',
      'my_mulligans', 'opp_mulligans', 'game_result', 'turns', 'end_reason', 'match_result', 'match_score', 'opp_cards_seen', 'opp_deck_recognized',
      'my_cards_drawn', 'side_changes']];
    for (const m of matches) {
      if (!m.games.length) { // imported from the site's history: the match alone
        rows.push(Object.assign(Array(rows[0].length).fill(''), [new Date(m.startedAt).toISOString(), m.id, fmt(m), deckName(m), oppLabel(m), archetype(m), colorsOf(m)],
          { 14: m.result || m.status, 15: (m.score || []).join('-') }));
      }
      for (const g of m.games) {
        const p = onPlay(m, g);
        rows.push([new Date(m.startedAt).toISOString(), m.id, fmt(m), deckName(m), oppLabel(m), archetype(m), colorsOf(m), g.n,
          p === null ? '' : p ? 'play' : 'draw', g.mulligans[m.mySeat], opps(m).map((o) => g.mulligans[o.seat]).join('/'),
          gRes(m, g), g.turns, g.endReason, m.result || m.status, (m.score || []).join('-'),
          opps(m).map((o) => Object.entries((g.seen || {})[o.seat] || {}).map(([c, ids]) => `${ids.length} ${c}`).join('; ')).join(' | '),
          (guessFor(m) || {}).name || '',
          Object.entries(g.drawn || {}).map(([c, ids]) => `${ids.length} ${c}`).join('; '),
          (S.sideChanges(m, g.n, C) || []).map(([c, d]) => `${d > 0 ? '+' : ''}${d} ${c}`).join('; ')]);
      }
    }
    download(`endstep-tracker-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
    toast(tn('csv_exported', rows.length - 1));
  },
  import: () => $('#import').click(),
  // My past matches: endstep.cc's history page opens, and imports what it lists for a while (content.js); browsing it
  // otherwise imports nothing.
  'import-history': async () => {
    await chrome.storage.local.set({ historyImport: { until: Date.now() + S.HISTORY_IMPORT_MS, read: 0, added: 0 } });
    chrome.tabs.create({ url: 'https://endstep.cc/history' });
  },
  clear: async () => {
    if (!confirm(t('confirm_clear'))) return;
    const all = await chrome.storage.local.get(null);
    const prefixes = ['match:', 'note:', 'dec:', 'plan:', ...(addon ? addon.prefixes : [])];
    await chrome.storage.local.remove(Object.keys(all).filter((k) => prefixes.some((p) => k.startsWith(p))));
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
    if (addon) addon.importItems(data, items);
    for (const [k, v] of Object.entries(obj(data && data.plans))) if (k.startsWith('plan:') && typeof v === 'string') items[k] = v;
    await chrome.storage.local.set(items);
    const skipped = raw.length - list.length;
    toast(list.length ? tn('imported', list.length) + (skipped ? tn('skipped', skipped) : '') : t('import_empty'), !list.length);
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
  if (addon && addon.onClick(e)) return;
  if (e.target.closest('[data-delete]')) {
    const id = e.target.closest('.match').dataset.id;
    if (!confirm(t('confirm_delete_match'))) return;
    openId = null;
    chrome.storage.local.remove(['match:' + id, 'note:' + id, 'dec:' + id, ...(addon ? addon.deleteKeys(id) : [])]).then(() => toast(t('match_deleted')));
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

for (const ev of ['pointerover', 'focusin']) $('#glance').addEventListener(ev, formCard);
for (const ev of ['pointerleave', 'focusout']) $('#glance').addEventListener(ev, () => { const tip = $('#glance .form-tip'); if (tip) tip.hidden = true; });
$('#glance').addEventListener('click', (e) => {
  const show = e.target.closest('[data-show]');
  const m = show && matches.find((x) => x.id === show.dataset.show);
  if (m) showMatch(m);
});
$('#split').addEventListener('click', (e) => {
  const show = e.target.closest('[data-show]');
  if (show) { const m = matches.find((x) => x.id === show.dataset.show); if (m) showMatch(m); return; }
  const b = e.target.closest('button.rec');
  if (!b) return;
  if (b.dataset.kind === 'deck') { const [format, deck] = JSON.parse(b.dataset.key); setFilter({ scope: scopeFor({ format, deck }), version: null, compare: false, opp: null }); }
  else if (drawer && drawer.key === b.dataset.key) closeDrawer();
  else openDrawer(b.dataset.key);
});
$('#drawer').addEventListener('click', (e) => {
  if (e.target.closest('[data-close-drawer]')) { closeDrawer(); return; }
  const show = e.target.closest('[data-show]');
  if (show) { const m = matches.find((x) => x.id === show.dataset.show); drawer = null; if (m) showMatch(m); return; }
  if (e.target.closest('[data-filter-matchup]')) {
    const { key } = drawer;
    const row = [...document.querySelectorAll('#by-opp button.rec')].find((x) => x.dataset.key === key);
    drawer = null;
    setFilter({ opp: { key, label: row ? row.dataset.label : key.slice(2) } });
  }
});

$('#q').addEventListener('input', (e) => setFilter({ q: e.target.value }));
// Tabs: a click, or the arrow keys, Home and End once one has the focus.
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) setTab(b.dataset.tab); });
$('#tabs').addEventListener('keydown', (e) => {
  const i = TABS.indexOf(state.tab);
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  setTab(TABS[(to + TABS.length) % TABS.length]);
  $(`#tab-${state.tab}`).focus();
});
$('#f-scope').addEventListener('change', (e) => {
  const [format, deck] = JSON.parse(e.target.value);
  setFilter({ scope: scopeFor({ format, deck }), version: null, compare: false, opp: null }); // an archetype facet rarely survives a change of deck
});
$('#f-version').addEventListener('change', (e) => {
  const v = e.target.value;
  const vs = versionsOf(activeScope());
  const x = vs.list.find((y) => String(y.n) === v);
  setFilter({ version: x ? x.key : v, compare: false }); // every version is the default
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
$('#live').addEventListener('click', () => { const m = liveMatch(); if (m) showMatch(m); });

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); if (state.tab !== 'history') setTab('history'); $('#q').focus(); }
  if (e.key === 'Escape') { hidePreview(); if (drawer && !e.target.closest('input, textarea, select')) closeDrawer(); }
  // j / k walk the matchups and the history rows
  if ((e.key === 'j' || e.key === 'k') && !e.target.closest('input, textarea, select') && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const rows = [...document.querySelectorAll('#by-opp > button.rec, #by-opp details[open] > button.rec, #matches .match-row')].filter((r) => r.offsetParent);
    const i = rows.indexOf(document.activeElement);
    const next = rows[e.key === 'j' ? i + 1 : Math.max(0, i - 1)];
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  }
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
  if (a && a.matches('input, textarea, select') && a.closest('.detail, .drawer')) return true;
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
  const mine = Object.fromEntries(Object.entries(changes).filter(([k]) => /^((match|note|dec):|decks$|meta$)/.test(k)));
  if (!Object.keys(mine).length) return;
  if (busy() || pending) { pending = Object.assign(pending || {}, mine); flushPending(); return; }
  applyChanges(mine);
});
setInterval(renderHeader, 60e3); // keep "il y a…" and the live pill fresh

(async () => {
  await initI18n();
  loadPrefs();
  await initMeta();
  // dev-only { the Coach (Endstep-coach/extension-coach), loaded when its files sit next to this page; release.sh leaves this out
  addon = await import(chrome.runtime.getURL('coach-ui.js')).then((mod) => mod.default({
    esc, toast, render, obj, myDeck, deckName, archetype, guessFor, colorsOf, opps, describeAction, $,
    matches: () => matches, decisions: () => decisions, locale: () => locale,
  })).catch(() => null);
  if (addon) await addon.init();
  // } dev-only
  await load();
})();
