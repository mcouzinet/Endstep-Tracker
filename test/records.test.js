// Records count matches, never games; a match is on the play or the draw as its game 1 was. Run: node test/records.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const g = (n, firstSeat, winnerSeat) => ({ n, firstSeat, winnerSeat, mulligans: {} });
const match = (id, result, games) => ({ id, startedAt: 0, updatedAt: 1, endedAt: 1, status: 'complete', result, mySeat: 0, colors: {}, score: [],
  players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'them' }], participants: [], games });

// Won 2-1, on the draw in game 1 though on the play in game 2: one match won, on the draw.
const a = match('a', 'W', [g(1, 1, 0), g(2, 0, 1), g(3, 1, 0)]);
// Lost 0-2, on the play in game 1.
const b = match('b', 'L', [g(1, 0, 1), g(2, 1, 1)]);
// Unfinished: no result, counts nowhere.
const c = match('c', undefined, [g(1, 0, 0)]);

const r = S.records([a, b, c], 10);
assert.deepEqual(r.m, { W: 1, L: 1, D: 0 });
assert.deepEqual(r.draw, { W: 1, L: 0, D: 0 }, 'game 1 decides the play/draw of a match');
assert.deepEqual(r.play, { W: 0, L: 1, D: 0 });
assert.equal('g' in r, false, 'no game record');

// Before and after sideboarding: the one record in games. A Bo1 has game 1 only; a match against the AI, one without its
// games (imported from the site's history) and an unfinished one count nowhere.
const bo1 = match('e', 'W', [g(1, 0, 0)]);
const bot = Object.assign(match('f', 'W', [g(1, 0, 0), g(2, 1, 0)]), { participants: [{ username: 'me' }, { username: 'Forge AI', isBot: true }] });
const imported = Object.assign(match('h', 'L', []), { source: 'history' });
const sr = S.sideRecords([a, b, c, bo1, bot, imported], 10);
assert.deepEqual(sr.g1, { W: 2, L: 1, D: 0 }, 'game 1 of a, b and the Bo1');
assert.deepEqual(sr.post, { W: 1, L: 2, D: 0 }, 'games 2 and 3 of a, game 2 of b');

// A deck renamed on the site: its matches take the current name, and group with the newer ones.
const C = (decks) => ({ notes: {}, decks, t: (k) => k });
const old = Object.assign(match('d', 'W', []), { myDeck: { id: 'deck-1', name: '[DC] - Yoshi Esper' } });
assert.equal(S.deckName(old, C({ 'deck-1': { name: '[DC] Yoshi Esper' } })), '[DC] Yoshi Esper');
assert.equal(S.deckName(old, C({})), '[DC] - Yoshi Esper', 'a deck the site no longer lists keeps the name it had');

// Decks merged in the dashboard: a match of the merged deck counts under the other one, with its own list.
{
  const mk = (id, deck) => S.normalizeMatch({ id, startedAt: 1, players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'opp' }], mySeat: 0, games: [], formatId: 'pauper', myDeck: { id: deck, name: deck === 'd-old' ? 'Asmoranom' : 'Asmo', cards: [{ name: deck, quantity: 1 }] } });
  const old = mk('m1', 'd-old'), cur = mk('m2', 'd-new');
  const ctx = { notes: {}, decks: { 'd-new': { name: 'Asmo' } }, t: (k) => k, merges: { 'd-old': { id: 'd-new', name: 'Asmo', from: 'Asmoranom' } } };
  assert.equal(S.deckName(old, ctx), 'Asmo', 'the merged deck takes the other name');
  assert.deepEqual(S.myDeck(old, ctx).cards, [{ name: 'd-old', quantity: 1 }], 'its own list stays');
  assert.equal(S.deckName(cur, ctx), 'Asmo');
  assert.equal(S.deckName(old, { ...ctx, merges: {} }), 'Asmoranom', 'split again: back to its own name');
  const chain = { ...ctx, merges: { a: { id: 'b', name: 'B' }, b: { id: 'c', name: 'C' } } };
  assert.equal(S.mergedInto('a', chain).name, 'C', 'a merge of a merge is followed');
  const picked = { ...ctx, notes: { m2: { deckId: 'd-old' } }, decks: { 'd-old': { name: 'Asmoranom' } } };
  assert.equal(S.deckName(cur, picked), 'Asmo', 'a deck picked by hand that was merged counts as the other one');
}

console.log('records: ok');
