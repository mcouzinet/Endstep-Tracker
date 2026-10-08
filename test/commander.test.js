// Duel Commander: the opponent's archetype is its commander, read from the command zone. Run: node test/commander.test.js
const assert = require('node:assert/strict');
const T = require('../tracker.js');
const S = require('../shared.js');

const M = 'dc-1';
const card = (id, name, owner, isCommander = false) => ({ id, name, ownerId: owner, faceDown: false, isToken: false, types: [], isCommander });
const state = (turn, cz0, cz1, bf1 = []) => ({
  type: 'GAME_STATE', matchId: M, viewerSeat: 0, seq: turn,
  payload: {
    turnNumber: String(turn), status: 'ACTIVE', gameType: 'DuelCommander',
    matchScore: { winsBySeat: [0, 0], gameNumber: 1, gamesPlayed: 0, gamesPerMatch: 3 },
    players: [
      { id: '0', name: 'me', hand: [], battlefield: [], graveyard: [], exile: [], commandZone: cz0 },
      { id: '1', name: 'opp', hand: [], battlefield: bf1, graveyard: [], exile: [], commandZone: cz1 },
    ],
  },
});

const run = (frames) => {
  const store = new Map();
  const ctx = { meta: { [M]: { format: 'commander', formatId: 'duel-commander' } }, lobby: null, lastDeck: null, decks: {} };
  for (const f of frames) T.handle(store, f, ctx, 1);
  return S.normalizeMatch(store.get(M).rec);
};
const C = (notes = {}) => ({ notes, decks: {}, t: (k) => k });

// Partners, as the site marks them; my own commander stays out; neither the site's "Commander Effect" there from the
// start nor an emblem arriving later is a commander.
const m = run([
  state(0, [card(1, 'Tymna the Weaver', '0', true)], [card(2, 'Thrasios, Triton Hero', '1', true), card(3, 'Kraum, Ludevic\'s Opus', '1', true), card(5, 'Commander Effect', '1')]),
  state(5, [], [card(4, 'Emblem Liliana', '1')], [card(2, 'Thrasios, Triton Hero', '1', true)]),
]);
assert.deepEqual(m.commanders, { 1: ['Thrasios, Triton Hero', 'Kraum, Ludevic\'s Opus'] });
assert.equal(S.archetype(m, C()), 'Thrasios, Triton Hero + Kraum, Ludevic\'s Opus');
assert.equal(S.oppKey(m, C()), 'a:Thrasios, Triton Hero + Kraum, Ludevic\'s Opus');
assert.equal(S.archetype(m, C({ [M]: { archetype: 'Thrasios Kraum' } })), 'Thrasios Kraum', 'a hand-set archetype wins');

// Tracker attached mid-game: the commander seen in the zone counts.
assert.deepEqual(run([state(7, [], [card(9, 'Ertai Resurrected', '1', true)])]).commanders, { 1: ['Ertai Resurrected'] });

// A match recorded before the flag was read: the site's effect is left out of the name.
assert.equal(S.archetype(Object.assign({}, m, { commanders: { 1: ['Deadpool, Trading Card', 'Commander Effect'] } }), C()), 'Deadpool, Trading Card');

// The match details missed (the tracker woke up after the page loaded them): the game's own kind says Duel Commander.
const late = Object.assign({}, m, { formatId: undefined, gameType: 'DuelCommander' });
assert.equal(S.archetype(late, C()), 'Thrasios, Triton Hero + Kraum, Ludevic\'s Opus');
assert.equal(S.formatOf(late, C()), 'Duel-commander');

// Outside Duel Commander the command zone does not name the deck.
const other = run([state(0, [], [card(2, 'Thrasios, Triton Hero', '1', true)])]);
other.formatId = 'Pauper';
assert.equal(S.archetype(other, C()), '');

console.log('commander: ok');
