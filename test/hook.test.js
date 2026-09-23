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
console.log('hook test: ok');
