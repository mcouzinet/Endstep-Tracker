// Sessions, the run after two losses, and the lands of the kept hand. Run: node test/sessions.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const H = 3600e3;
const match = (id, result, startedAt, games = []) => ({ id, startedAt, updatedAt: startedAt + 0.5 * H, endedAt: startedAt + 0.5 * H, status: 'complete', result, mySeat: 0,
  colors: {}, score: [], players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'them' }], participants: [], games });

// Newest first. Two sessions: 6 h without a match between 10 h 30 and 16 h 30.
const list = [match('f', 'W', 20 * H), match('e', 'L', 19 * H), match('d', 'L', 18 * H), match('c', 'W', 16.5 * H), match('b', 'L', 10 * H), match('a', 'L', 9 * H)];
assert.deepEqual(S.sessions(list).map((s) => s.map((m) => m.id)), [['f', 'e', 'd', 'c'], ['b', 'a']]);
assert.deepEqual(S.lastSession(list).map((m) => m.id), ['f', 'e', 'd', 'c']);

// By day: a night past midnight stays with its evening (before 5 o'clock is the day before), the next morning is a day of its own.
const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();
const nights = [match('n5', 'W', at(19, 9)), match('n4', 'L', at(19, 4, 50)), match('n3', 'W', at(19, 0, 30)), match('n2', 'L', at(18, 23)), match('n1', 'W', at(18, 5)), match('n0', 'W', at(18, 4, 59))];
assert.deepEqual(S.days(nights).map((d) => d.map((m) => m.id)), [['n5'], ['n4', 'n3', 'n2', 'n1'], ['n0']]);
assert.equal(S.dayOf(nights[1]), new Date(2026, 10, 18).toDateString());

// c follows two losses but in an earlier session: not counted; f follows d and e.
assert.deepEqual([...S.afterTwoLosses(list)], ['f']);
// A draw ends the run; an unfinished match leaves it as it is.
const run = [match('k', 'W', 5 * H), match('j', undefined, 4 * H), match('i', 'L', 3 * H), match('h', 'D', 2 * H), match('g', 'L', 1 * H), match('x', 'L', 0)];
assert.deepEqual([...S.afterTwoLosses(run)], ['h']);
const run2 = [match('k', 'W', 5 * H), match('j', undefined, 4 * H), match('i', 'L', 3 * H), match('h', 'L', 2 * H)];
assert.deepEqual([...S.afterTwoLosses(run2)], ['k'], 'the unfinished match between does not break the run');

// Lands: the basics, and any card I played as a land in some match (not one the opponent played).
const g = (n, firstSeat, winnerSeat, openingHand, log = []) => ({ n, firstSeat, winnerSeat, mulligans: {}, openingHand, log });
const m1 = match('m1', 'W', 0, [
  g(1, 0, 0, ['Island', 'Seat of the Synod', 'Thoughtcast', 'Frogmite', 'Myr Enforcer', 'Galvanic Blast', 'Springleaf Drum'], [[1, 0, 'LAND_PLAYED', 'Seat of the Synod', ''], [1, 1, 'LAND_PLAYED', 'Forest', '']]),
  g(2, 1, 1, ['Vault of Whispers', 'Frogmite', 'Thoughtcast', 'Myr Enforcer', 'Galvanic Blast', 'Ornithopter']),
  g(3, 0, 0, ['Island', 'Swamp', 'Seat of the Synod', 'Vault of Whispers', 'Frogmite', 'Thoughtcast']),
]);
const m2 = match('m2', 'L', 0, [g(1, 1, 1, ['Vault of Whispers', 'Island', 'Thoughtcast'], [[2, 0, 'LAND_PLAYED', 'Vault of Whispers', '']]), g(2, 0, 1)]);
const lands = S.landNames([m1, m2]);
assert.deepEqual([...lands].sort(), ['Seat of the Synod', 'Vault of Whispers']);
const r = S.landRecords([m1, m2], lands, null, 10);
assert.deepEqual(r.map((x) => x.all), [{ W: 0, L: 1, D: 0 }, { W: 1, L: 1, D: 0 }, { W: 0, L: 0, D: 0 }, { W: 1, L: 0, D: 0 }],
  '1 land (m1 g2), 2 lands (m1 g1, m2 g1), 4 lands (m1 g3); m2 g2 has no hand');
assert.deepEqual(r[1].play, { W: 1, L: 0, D: 0 });
assert.deepEqual(r[1].draw, { W: 0, L: 1, D: 0 });
console.log('sessions ok');
