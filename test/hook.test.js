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
  console.log('hook test: ok');
})().catch((e) => { console.error(e); process.exit(1); });
