// Builds demo data for dashboard QA from the real replayed Bo3 plus variations.
const fs = require('fs');
const P = '/Users/mickaelcouzinet/Developer/Endstep-tracker';
const T = require(P + '/tracker.js');
const orig = T.handle; let store;
T.handle = (s, ...a) => { store = s; return orig(s, ...a); };
require(P + '/test/replay.test.js');
const base = [...store.values()][0].rec;
const H = 3600e3, D = 24 * H, now = Date.now();
const clone = (x) => JSON.parse(JSON.stringify(x));
function game(n, { first, mull = [0, 0], win, turns = 7, reason = 'life', mins = 12, seen = {}, from }) {
  const g = clone(base.games[1]);
  Object.assign(g, { n, firstSeat: first, mulligans: { 0: mull[0], 1: mull[1] }, turns, endReason: win === undefined ? undefined : reason });
  if (win === undefined) { delete g.winnerSeat; delete g.endedAt; } else { g.winnerSeat = win; }
  g.startedAt = from; if (win !== undefined) g.endedAt = from + mins * 60e3;
  g.seen = { 1: Object.fromEntries(Object.entries(seen).map(([c, k]) => [c, Array.from({ length: k }, (_, i) => c + i)])) };
  g.life = win === 0 ? { 1: 0 } : win === 1 ? { 0: 0 } : {};
  return g;
}
function match(id, o) {
  const m = clone(base);
  Object.assign(m, { id, startedAt: o.at, updatedAt: o.updated || o.at + 40 * 60e3, endedAt: o.status === 'active' ? undefined : o.at + 40 * 60e3,
    status: o.status || 'complete', result: o.result, winnerSeat: o.result === 'W' ? 0 : o.result === 'L' ? 1 : null,
    formatId: o.formatId || 'casual', ranked: !!o.ranked, gamesPerMatch: o.bo || 3, score: o.score, colors: { 1: o.colors },
    myDeck: { id: 'deck-' + o.deck, name: o.deck, cards: o.deck === 'Burn' ? [{ name: 'Lightning Bolt', quantity: 4 }, { name: 'Goblin Guide', quantity: 4 }, { name: 'Mountain', quantity: 20 }] : null } });
  m.players = [{ seat: 0, name: 'guest_rZ8gWdWE' }, { seat: 1, name: o.opp }];
  m.games = o.games.map((g, i) => game(i + 1, { ...g, from: o.at + i * 14 * 60e3 }));
  if (o.keepBaseLogs) m.games.forEach((g, i) => { g.log = clone(base.games[i % 2].log); g.openingHand = base.games[i % 2].openingHand; });
  return m;
}
const matches = [
  match('m-live', { at: now - 18 * 60e3, updated: now - 30e3, status: 'active', opp: 'Brisbane', colors: 'BR', deck: 'Burn', score: [1, 0],
    games: [{ first: 0, win: 0, seen: { 'Bloodghast': 2, 'Fatal Push': 1, 'Swamp': 2 } }, { first: 1, mull: [1, 0] }] }),
  match('m1', { at: now - 70 * 60e3, result: 'W', opp: 'Kaladin', colors: 'UB', deck: 'Burn', ranked: true, formatId: 'Modern', score: [2, 1], keepBaseLogs: true,
    games: [{ first: 0, win: 1, seen: { 'Counterspell': 2, 'Kaito, Bane of Nightmares': 1, 'Island': 3 } }, { first: 1, mull: [1, 0], win: 0, seen: { 'Fatal Push': 1, 'Swamp': 2 } }, { first: 0, win: 0, turns: 5 }] }),
  match('m2', { at: now - 2 * D, result: 'L', opp: 'Forge AI', colors: 'R', deck: 'Burn', score: [0, 2], keepBaseLogs: true,
    games: [{ first: 1, mull: [1, 0], win: 1, reason: 'concede', turns: 1, seen: { 'Goblin Guide': 1, 'Mountain': 1, 'Lightning Bolt': 2 } }, { first: 0, mull: [0, 1], win: 1, reason: 'concede', turns: 3, seen: { 'Goblin Guide': 1, 'Mountain': 1, 'Eidolon of the Great Revel': 1 } }] }),
  match('m3', { at: now - 3 * D, result: 'W', opp: 'Selesnya_Main', colors: 'GW', deck: 'Mono-U Tempo', formatId: 'Pauper', score: [2, 0],
    games: [{ first: 0, win: 0, seen: { 'Guardian of the Guildpact': 2 } }, { first: 1, win: 0, turns: 9 }] }),
  match('m4', { at: now - 5 * D, status: 'active', updated: now - 5 * D + 20 * 60e3, opp: 'Ghost', colors: '', deck: 'Burn', score: [0, 0],
    games: [{ first: 1 }] }),
  match('m5', { at: now - 9 * D, result: 'L', opp: 'Tarmo', colors: 'G', deck: 'Mono-U Tempo', formatId: 'Pauper', score: [1, 2],
    games: [{ first: 1, win: 0, seen: { 'Nettle Sentinel': 4, 'Rancor': 2 } }, { first: 0, mull: [2, 0], win: 1 }, { first: 1, win: 1, turns: 6 }] }),
  match('m6', { at: now - 15 * D, result: 'W', opp: 'Nadu_enjoyer', colors: 'UG', deck: 'Burn', ranked: true, formatId: 'Modern', score: [2, 1],
    games: [{ first: 0, win: 0, seen: { 'Nadu, Winged Wisdom': 1 } }, { first: 1, win: 1 }, { first: 0, win: 0, mull: [0, 1] }] }),
];
// m1 and m2 are left untagged so the metagame recognition has something to show.
const notes = { 'm1': { notes: 'Garder Skullcrack pour le G3.' }, 'm5': { archetype: 'Mono-Green Stompy' }, 'm6': { archetype: 'Temur Nadu' } };
const data = {};
for (const m of matches) data['match:' + m.id] = m;
for (const [id, n] of Object.entries(notes)) data['note:' + id] = n;
fs.writeFileSync(__dirname + '/demo-data.js', 'window.__DATA = ' + JSON.stringify(data) + ';');
fs.writeFileSync(__dirname + '/empty-data.js', 'window.__DATA = {};');

// Harness pages: the real dashboard with chrome.storage stubbed.
const html = fs.readFileSync(P + '/dashboard.html', 'utf8');
for (const name of ['demo', 'empty']) {
  const stub = `<script src="file://${__dirname}/${name}-data.js"></script>
<script>
  // chrome.storage stub that replays writes/removals to onChanged listeners, like the real API.
  const listeners = [];
  const fire = (changes) => listeners.forEach((fn) => fn(changes, 'local'));
  window.chrome = { storage: { local: {
    get: async () => window.__DATA,
    set: async (items) => { const ch = {}; for (const [k, v] of Object.entries(items)) { ch[k] = { oldValue: window.__DATA[k], newValue: JSON.parse(JSON.stringify(v)) }; window.__DATA[k] = v; } fire(ch); },
    remove: async (keys) => { const ch = {}; for (const k of [].concat(keys)) { if (k in window.__DATA) { ch[k] = { oldValue: window.__DATA[k] }; delete window.__DATA[k]; } } fire(ch); },
  }, onChanged: { addListener(fn) { listeners.push(fn); } } } };
</script>`;
  const out = html.replace('<head>', `<head><base href="file://${P}/">`).replace('<script src="tracker.js"></script>', stub + '\n  <script src="tracker.js"></script>')
    .replace('<script src="meta.js"></script>', `<script src="meta.js"></script>\n  <script src="file://${__dirname}/meta-stub.js"></script>`);
  fs.writeFileSync(`${__dirname}/harness-${name}.html`, out);
}
const snap = require('./meta-Modern.json').filter((d) => Object.keys(d.cards).length);
fs.writeFileSync(__dirname + '/meta-stub.js', `(() => { const SNAP = ${JSON.stringify(snap)}; const M = self.EndstepMeta; M.listFormats = async () => ['Pauper', 'Modern', 'Premodern', 'Legacy', 'Vintage']; M.loadFormat = async (f) => ({ formatId: f, at: Date.now(), decks: f === 'Modern' ? SNAP : [] }); })();`);
console.log('demo matches:', matches.length, '· meta stub decks:', snap.length);
