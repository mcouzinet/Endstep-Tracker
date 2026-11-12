// A hand-edited or broken record (an imported backup) can neither stop the pages nor slip markup into them.
// Run: node test/normalize.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const base = () => ({ id: 'm1', startedAt: Date.parse('2026-11-01'), players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'opp' }], mySeat: 0,
  games: [{ n: 1, mulligans: { 0: 1, 1: '"><b>' }, seen: { 1: { Bolt: ['a'], Junk: 'x' }, 2: 'nope' }, drawn: { Bolt: ['b'], Bad: 3 } }] });
const C = { notes: {}, decks: {}, t: (k) => k };

const m = S.normalizeMatch({ ...base(), result: '"><img src=x>', formatId: 42, format: { x: 1 }, endedAt: 1e300 });
assert.equal(m.result, undefined, 'a result is W, L or D');
assert.equal(m.formatId, undefined);
assert.equal(m.format, undefined);
assert.equal(m.endedAt, undefined, 'a date a Date cannot hold');
assert.equal(typeof S.formatOf(m, C), 'string', 'no throw on the format');
assert.deepEqual(m.games[0].mulligans, { 0: 1 }, 'mulligans are counts');
assert.deepEqual(m.games[0].seen, { 1: { Bolt: ['a'] }, 2: {} }, 'seen cards are lists of ids');
assert.deepEqual(m.games[0].drawn, { Bolt: ['b'] });
assert.equal(S.normalizeMatch({ ...base(), startedAt: 1e300 }), null, 'no start, no match');
assert.equal(S.normalizeMatch({ ...base(), result: 'W' }).result, 'W');
assert.equal(S.normalizeMatch({ ...base(), myDeck: { id: 'd', name: 7 } }).myDeck.name, null);

assert.deepEqual(S.normalizeNote({ archetype: 12, notes: 'fine', deckId: {}, formatId: 'Pauper', extra: 1 }), { notes: 'fine', formatId: 'Pauper', extra: 1 });
assert.deepEqual(S.normalizeNote(null), {});
assert.equal(S.formatOf(m, { ...C, notes: { m1: S.normalizeNote({ formatId: 5 }) } }), S.formatOf(m, C), 'a note\'s odd format is ignored');

console.log('normalize: ok');
