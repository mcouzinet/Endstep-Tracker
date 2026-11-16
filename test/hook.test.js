// hook.js replay buffer: after an extension reload, a re-injected content.js says "hello" and gets back the sticky
// bits (lobby, deck pick, deck/match details) and every frame since the last full game state, in order and tagged.
// Run: node test/hook.test.js
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TAG = 'endstep-tracker';
const posted = [];
const listeners = [];
class FakeWS { constructor() { this.handlers = {}; } addEventListener(type, fn) { this.handlers[type] = fn; } send() {} }
const window = {
  WebSocket: FakeWS,
  fetch: async () => ({ ok: false }),
  postMessage: (msg) => posted.push(msg),
  addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
};
window.window = window;
const sandbox = { window, location: { origin: 'https://endstep.cc', href: 'https://endstep.cc/game/x' }, URL, Reflect, Proxy, JSON, Date, Object, Array, RegExp };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8'), sandbox);

const ws = new window.WebSocket('wss://endstep.cc/ws');
const frame = (o) => ws.handlers.message({ data: JSON.stringify(o) });
const hello = () => listeners.forEach((fn) => fn({ source: window, data: { [TAG]: 'hello' } }));

// Fresh page: hello replays nothing.
hello();
assert.equal(posted.length, 0);

frame({ type: 'LOBBY_UPDATE', payload: { id: 'lobby1' } });
frame({ type: 'GAME_STATE', matchId: 'm', seq: 1, payload: {} });
frame({ type: 'GAME_DELTA', matchId: 'm', seq: 2, payload: {} });
ws.send('{"type":"GAME_ACTION","payload":{"matchId":"m","type":"PASS_PRIORITY"}}');
frame({ type: 'GAME_STATE', matchId: 'm', seq: 3, payload: {} }); // full state: the buffer restarts here
frame({ type: 'GAME_EVENT', matchId: 'm', seq: 4, payload: { type: 'TURN_BEGAN' } });
frame({ type: 'CHAT', payload: {} }); // not mirrored at all
const live = posted.splice(0);
assert.deepEqual(live.map((m) => m[TAG]), ['ws', 'ws', 'ws', 'out', 'ws', 'ws']);
assert.ok(live.every((m) => typeof m.at === 'number' && !m.replay), 'live messages carry the hook time and no replay flag');

hello();
const replay = posted.splice(0);
assert.deepEqual(replay.map((m) => [m[TAG], JSON.parse(m.data).type || JSON.parse(m.data).seq]),
  [['ws', 'LOBBY_UPDATE'], ['ws', 'GAME_STATE'], ['ws', 'GAME_EVENT']], 'lobby first, then everything since the last full state');
assert.ok(replay.every((m) => m.replay === true));
assert.equal(replay[1].at, live[4].at, 'a replayed frame keeps its original timestamp');

// hello from another window (or the site) is ignored; a second hook copy does not install.
listeners.forEach((fn) => fn({ source: {}, data: { [TAG]: 'hello' } }));
assert.equal(posted.length, 0);
assert.equal(sandbox.window.__endstepTrackerHook, true);
const before = sandbox.window.WebSocket;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8'), sandbox);
assert.equal(sandbox.window.WebSocket, before, 'the guard keeps the first copy');

// Store build (release.sh strips the dev-only blocks): of my own actions, only the sideboarding answer is mirrored.
const release = fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8').replace(/^.*\/\/ dev-only \{[\s\S]*?\/\/ \} dev-only.*$/gm, '');
const out = [];
const win2 = { ...window, WebSocket: FakeWS, postMessage: (msg) => out.push(msg), addEventListener: () => {}, __endstepTrackerHook: false };
win2.window = win2;
vm.runInNewContext(release, { ...sandbox, window: win2 });
const ws2 = new win2.WebSocket('wss://endstep.cc/ws');
ws2.send('{"type":"GAME_ACTION","payload":{"matchId":"m","type":"PASS_PRIORITY"}}');
ws2.send('{"type":"GAME_ACTION","payload":{"matchId":"m","type":"SIDEBOARD_SUBMIT","orderedCards":[0,1]}}');
ws2.send('{"type":"GAME_ACTION","payload":{"matchId":"m","type":"DECLINE"}}');
assert.deepEqual(out.filter((m) => m[TAG] === 'out').map((m) => JSON.parse(m.data).payload.type), ['SIDEBOARD_SUBMIT', 'DECLINE'], 'store build: sideboarding only');
// Any game action marks its match as played in this tab, and only its id goes out (store build included).
const M1 = '11111111-2222-3333-4444-555555555555';
out.length = 0;
ws2.send(`{"type":"GAME_ACTION","payload":{"matchId":"${M1}","type":"PASS_PRIORITY"}}`);
assert.deepEqual(out.map((m) => [m[TAG], m.data]), [['acted', M1]]);
// Reloaded mid-match (store build): the new content.js learns again that this tab plays it, before the frames, so that
// the end of the match is saved even if I take no other action.
const outR = [];
const onR = [];
const winR = { ...window, WebSocket: FakeWS, postMessage: (msg) => outR.push(msg), addEventListener: (type, fn) => { if (type === 'message') onR.push(fn); }, __endstepTrackerHook: false };
winR.window = winR;
vm.runInNewContext(release, { ...sandbox, window: winR });
const wsR = new winR.WebSocket('wss://endstep.cc/ws');
wsR.handlers.message({ data: JSON.stringify({ type: 'GAME_STATE', matchId: M1, seq: 1, payload: {} }) });
wsR.send(`{"type":"GAME_ACTION","payload":{"matchId":"${M1}","type":"PASS_PRIORITY"}}`);
wsR.handlers.message({ data: JSON.stringify({ type: 'GAME_EVENT', matchId: M1, seq: 2, payload: { type: 'GAME_OUTCOME' } }) });
outR.length = 0;
onR.forEach((fn) => fn({ source: winR, data: { [TAG]: 'hello' } }));
assert.deepEqual(outR.map((m) => m[TAG] === 'acted' ? ['acted', m.data] : [m[TAG], JSON.parse(m.data).seq]), [['acted', M1], ['ws', 1], ['ws', 2]]);

// My match history (/history): each page the site loads goes to content.js, cut down to what a match record needs; asked
// for the next page (an import I started), the hook sends the site's own request again, with the next cursor.
const page = { nextCursor: 'c1', matches: [{ id: 'h1', createdAt: '2026-09-01T10:00:00Z', result: 'won', formatId: 'pauper', stakes: 'ranked',
  score: { you: 2, opponent: 1 }, deckName: 'Esper Affinity', ratingBefore: 1500, opponents: [{ id: 'u2', username: 'Bartok', avatarUrl: 'x' }] }] };
const got = [];
const calls = [];
const on3 = [];
const win3 = { ...window, postMessage: (msg) => got.push(msg), addEventListener: (type, fn) => { if (type === 'message') on3.push(fn); }, __endstepTrackerHook: false,
  fetch: async (url, init) => { calls.push([String(url), init]); return /before=c1/.test(url) ? { ok: false } : { ok: true, clone: () => ({ json: async () => page }) }; } };
win3.window = win3;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8'), { ...sandbox, window: win3 });
const tick = () => new Promise((r) => setImmediate(r));
(async () => {
  await win3.fetch('/api/me/matches?limit=25', { credentials: 'include', headers: { Authorization: 'Bearer t0k' } });
  await win3.fetch('/api/me/badges');
  await tick();
  assert.deepEqual(got.map((m) => m[TAG]), ['history']);
  assert.deepEqual(JSON.parse(JSON.stringify(got[0].data)), { next: 'c1', rows: [{ id: 'h1', createdAt: '2026-09-01T10:00:00Z', result: 'won', formatId: 'pauper', stakes: 'ranked',
    score: { you: 2, opponent: 1 }, deckName: 'Esper Affinity', opponents: [{ username: 'Bartok' }] }] }, 'only what a record needs, and the next cursor');
  assert.ok(!JSON.stringify(got).includes('t0k'), 'the token never leaves the page');

  on3.forEach((fn) => fn({ source: win3, data: { [TAG]: 'history-next', cursor: 'c1' } }));
  await tick();
  const [url, init] = calls[calls.length - 1];
  assert.equal(url, 'https://endstep.cc/api/me/matches?limit=25&before=c1');
  assert.equal(init.headers.Authorization, 'Bearer t0k', "the site's own request");
  assert.deepEqual(JSON.parse(JSON.stringify(got[1].data)), { rows: [], next: null, failed: true }, 'a page that fails ends the import');
  on3.forEach((fn) => fn({ source: {}, data: { [TAG]: 'history-next', cursor: 'c2' } }));
  on3.forEach((fn) => fn({ source: win3, data: { [TAG]: 'history-next', cursor: 42 } }));
  await tick();
  assert.equal(calls.length, 3, 'another window, or no cursor: nothing sent');

  // A ranked match: each player's ladder in the match's format, asked once per match, only what is shown.
  const MID = '22222222-3333-4444-5555-666666666666';
  const asked = [];
  const sent = [];
  const onL = [];
  const ladder = (u) => ({ username: u, ladders: [{ formatId: 'pauper', score: 1200 }, { formatId: 'duel-commander', rating: 1467, score: 1355, rd: 56, rank: 427, rankedCount: 792, topPercent: 54, provisional: false, series: [1, 2], wins: 32 }] });
  const matchJson = (ranked) => ({ id: MID, formatId: 'duel-commander', ranked, gamesPerMatch: 3, stateHash: 'secret', participants: [{ userId: 'u1', username: 'Mika' }, { userId: 'u2', username: 'Malpelo96 LPO' }, { userId: 'b', username: 'Forge AI', isBot: true }] });
  let ranked = true;
  const winL = { ...window, postMessage: (msg) => sent.push(msg), addEventListener: (type, fn) => { if (type === 'message') onL.push(fn); }, __endstepTrackerHook: false,
    fetch: async (url) => { asked.push(String(url)); const u = /username=([^&]+)/.exec(url); const body = u ? ladder(decodeURIComponent(u[1])) : matchJson(ranked); return { ok: true, json: async () => body, clone: () => ({ json: async () => body }) }; } };
  winL.window = winL;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8'), { ...sandbox, window: winL });
  await winL.fetch(`/api/matches/${MID}`);
  await winL.fetch(`/api/matches/${MID}`); // asked again (a reload of the view): no second lookup
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(asked.filter((u) => u.includes('ranked')), ['/api/ranked/players?username=Mika', '/api/ranked/players?username=Malpelo96%20LPO'], 'once per player, never the bot');
  const ratings = sent.filter((m) => m[TAG] === 'rating').map((m) => m.data);
  assert.deepEqual(JSON.parse(JSON.stringify(ratings.find((r) => r.username === 'Malpelo96 LPO'))), { matchId: MID, username: 'Malpelo96 LPO', ladder: { score: 1355, rating: 1467, rank: 427, of: 792, top: 54, provisional: false } }, 'the match\'s format, only what is shown');
  assert.ok(!JSON.stringify(sent).includes('secret'), 'the match response is whitelisted');
  sent.length = 0;
  onL.forEach((fn) => fn({ source: winL, data: { [TAG]: 'hello' } }));
  assert.equal(sent.filter((m) => m[TAG] === 'rating').length, 2, 'replayed to a new content.js');
  // An unranked match asks nothing.
  ranked = false;
  asked.length = 0;
  const winU = { ...winL, __endstepTrackerHook: false, fetch: winL.fetch };
  winU.window = winU;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'hook.js'), 'utf8'), { ...sandbox, window: winU });
  await winU.fetch(`/api/matches/${MID}`);
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(asked, [`/api/matches/${MID}`]);
  console.log('hook test: ok');
})().catch((e) => { console.error(e); process.exit(1); });
