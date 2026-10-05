// The same player met before, by the name in the game or the account the history gives. Run: node test/met.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const H = Date.parse('2026-09-10T20:00:00Z');
const match = (id, days, opp, o = {}) => S.normalizeMatch({ id, startedAt: H + days * 864e5, status: 'complete', result: 'W', mySeat: 0,
  players: [{ seat: 0, name: 'Mika' }, { seat: 1, name: opp }], games: [], ...o });
const acc = (...names) => ({ participants: names.map((username) => ({ username })) });

const now = match('now', 0, 'Malpelo96', acc('mika_acc', 'Malpelo96 LPO'));
const list = [
  now,
  match('t1', -3, 'malpelo96', { result: 'L', ...acc('mika_acc', 'Malpelo96 LPO') }), // recorded: the same in-game name
  match('h1', -10, 'Malpelo96 LPO', { source: 'history' }), // imported: the account only
  match('o1', -2, 'Bartok', acc('mika_acc', 'Bartok')), // someone else
  match('ai', -1, 'Forge AI'), // a bot
  match('later', 2, 'Malpelo96', acc('mika_acc', 'Malpelo96 LPO')), // after this one
];

assert.equal(S.myAccount(list), 'mika_acc', 'the one account in every match whose details were seen');
assert.deepEqual(S.metBefore(now, list).map((m) => m.id), ['t1', 'h1'], 'earlier ones, newest first, by game name or account');
assert.deepEqual(S.records(S.metBefore(now, list), Date.now()).m, { W: 1, L: 1, D: 0 });
assert.deepEqual(S.metBefore(list[3], list).map((m) => m.id), [], 'never met before');

// My account unknown (one match with details: two names in all of them): accounts left out, in-game names still match.
const few = [now, match('t2', -1, 'Malpelo96'), match('h2', -5, 'Malpelo96 LPO', { source: 'history' })];
assert.equal(S.myAccount(few), null);
assert.deepEqual(S.metBefore(now, few).map((m) => m.id), ['t2']);

console.log('met: ok');
