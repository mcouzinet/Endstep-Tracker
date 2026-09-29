// My cards: what the tracker records as drawn in each game, the main deck I submit when sideboarding, and what the
// pages compute from it (side changes, the usual side plan, card results). Frame shapes as the site's client reads
// them (GameView bundle, 2026-09-29). Run: node test/cards.test.js
const assert = require('node:assert/strict');
const T = require('../tracker.js');
const S = require('../shared.js');

const M = 'match-1';
let clock = 1790000000000;
let seq = 0;
const card = (id, name) => ({ id, name, zone: 'Hand', ownerId: '0', controllerId: '0', faceDown: false, isToken: false, types: [] });
const state = ({ n, played, turn, hand = [], pendingAction, wins = [0, 0] }) => ({
  type: 'GAME_STATE', matchId: M, viewerSeat: 0, seq: ++seq, timestamp: (clock += 100),
  payload: {
    gameId: 'g' + n, phase: 'MAIN1', turnNumber: String(turn), activePlayerId: '0', status: 'ACTIVE', gameType: 'Constructed', sideboarding: !!pendingAction,
    matchScore: { winsBySeat: wins, player0Wins: wins[0], player1Wins: wins[1], gameNumber: n, gamesPlayed: played, gamesPerMatch: 3, isMatchOver: false },
    players: [{ id: '0', name: 'me', life: 20, hand }, { id: '1', name: 'opp', life: 20, hand: [] }],
    pendingAction,
  },
});
let evSeq = 0;
const ev = (type, extra = {}) => ({ type: 'GAME_EVENT', matchId: M, timestamp: (clock += 100), payload: { type, sequenceNumber: ++evSeq, message: '', ...extra } });

const store = new Map();
const ctx = { meta: {}, lobby: null, lastDeck: null, decks: {} };
const feed = (f) => T.handle(store, f, ctx, f.timestamp);

// Game 1: a mulligan (the first seven are not drawn), then the kept hand, a card played straight from the top.
feed(state({ n: 1, played: 0, turn: 0, hand: [card(1, 'Thoughtcast'), card(2, 'Mulliganed Away')] }));
feed(ev('GAME_STARTED', { playerIndex: '0' }));
feed(ev('TURN_BEGAN', { playerIndex: '0', turnNumber: 1 }));
feed(state({ n: 1, played: 0, turn: 1, hand: [card(3, 'Thoughtcast'), card(4, 'Island'), card(5, 'Galvanic Blast')] }));
feed(state({ n: 1, played: 0, turn: 2, hand: [card(3, 'Thoughtcast'), card(6, 'Myr Enforcer')] }));
feed(ev('SPELL_CAST', { playerIndex: '0', cardName: 'Frogmite', cardId: 7 }));
feed(ev('SPELL_CAST', { playerIndex: '1', cardName: 'Counterspell', cardId: 90 })); // the opponent's: not mine
feed(ev('GAME_OUTCOME', { playerIndex: '0', endReason: 'life', turnNumber: 5 }));

const rec = store.get(M).rec;
assert.deepEqual(Object.keys(rec.games[0].drawn).sort(), ['Frogmite', 'Galvanic Blast', 'Island', 'Myr Enforcer', 'Thoughtcast'],
  'drawn: my hand from turn 1 on and what I played; not the mulliganed seven, not the opponent\'s cards');
assert.deepEqual(rec.games[0].drawn.Thoughtcast, [3], 'one entry per copy: the opening hand adds no second, id-less one');

// Sideboarding for game 2: the options are my main deck (mainCount cards) then my sideboard.
const MAIN = ['Thoughtcast', 'Thoughtcast', 'Galvanic Blast', 'Galvanic Blast', 'Myr Enforcer', 'Frogmite', 'Island', 'Island'];
const SIDE = ['Pyroblast', 'Pyroblast', 'Duress'];
const options = [...MAIN, ...SIDE].map((name, i) => ({ id: 100 + i, name }));
const prompt = { type: 'CHOOSE_CARDS', contextType: 'sideboard', cardOptions: options, min: 8, max: 8, sideboardState: { mainCount: 8, mode: 'SIDEBOARD', self: 'EDITING', opponent: 'EDITING' } };
feed(state({ n: 1, played: 1, turn: 5, wins: [1, 0], pendingAction: prompt }));
assert.deepEqual(rec.mains[1], { Thoughtcast: 2, 'Galvanic Blast': 2, 'Myr Enforcer': 1, Frogmite: 1, Island: 2 }, 'the prompt shows game 1\'s main deck');
assert.equal(T.onSideboard(store, { matchId: M, type: 'PASS_PRIORITY' }, clock), null, 'only the sideboarding answer is read');
// -2 Galvanic Blast, +2 Pyroblast: every position but 2 and 3, plus 8 and 9.
assert.ok(T.onSideboard(store, { matchId: M, type: 'SIDEBOARD_SUBMIT', orderedCards: [0, 1, 4, 5, 6, 7, 8, 9] }, clock));
assert.deepEqual(rec.mains[2], { Thoughtcast: 2, 'Myr Enforcer': 1, Frogmite: 1, Island: 2, Pyroblast: 2 });
// While the opponent still sideboards, the prompt may come back with my submitted deck first: game 1's stays.
const resent = [...Object.entries(rec.mains[2]).flatMap(([name, k]) => Array(k).fill(name)), 'Galvanic Blast', 'Galvanic Blast', 'Duress'].map((name, i) => ({ id: 300 + i, name }));
feed(state({ n: 1, played: 1, turn: 5, wins: [1, 0], pendingAction: { ...prompt, cardOptions: resent, sideboardState: { ...prompt.sideboardState, self: 'SUBMITTED' } } }));
assert.deepEqual(rec.mains[1], { Thoughtcast: 2, 'Galvanic Blast': 2, 'Myr Enforcer': 1, Frogmite: 1, Island: 2 }, 'after my submission the prompt no longer tells game 1\'s deck');

// Game 2 (event numbers restart): a sided-in card drawn, lost. Game 3: sideboarding declined, same deck again.
evSeq = 0;
feed(ev('GAME_STARTED', { playerIndex: '1' }));
feed(ev('TURN_BEGAN', { playerIndex: '1', turnNumber: 1 }));
feed(state({ n: 1, played: 1, turn: 1, wins: [1, 0], hand: [card(22, 'Duress')] })); // the score still says game 1
assert.ok(!rec.games[0].drawn.Duress && !(rec.games[1].drawn || {}).Duress, 'a hand is not filed under a game the score names late');
feed(state({ n: 2, played: 1, turn: 1, wins: [1, 0], hand: [card(20, 'Pyroblast'), card(21, 'Island')] }));
feed(ev('GAME_OUTCOME', { playerIndex: '1', endReason: 'life', turnNumber: 6 }));
const opts2 = Object.entries(rec.mains[2]).flatMap(([name, k]) => Array(k).fill(name)).concat(['Galvanic Blast', 'Galvanic Blast', 'Duress'])
  .map((name, i) => ({ id: 200 + i, name }));
feed(state({ n: 2, played: 2, turn: 6, wins: [1, 1], pendingAction: { ...prompt, cardOptions: opts2 } }));
assert.ok(T.onSideboard(store, { matchId: M, type: 'DECLINE' }, clock), 'DECLINE keeps the main deck as it was');
assert.deepEqual(rec.mains[3], rec.mains[2]);
assert.equal(T.onSideboard(store, { matchId: 'other', type: 'SIDEBOARD_SUBMIT', orderedCards: [0] }, clock), null, 'unknown match');

// --- what the pages compute ---
const C = { notes: {}, decks: {}, t: (k) => k };
const m = S.normalizeMatch(JSON.parse(JSON.stringify(rec)));
assert.deepEqual(S.sideChanges(m, 2, C), [['Pyroblast', 2], ['Galvanic Blast', -2]], 'game 2 against game 1, additions first');
assert.deepEqual(S.sideChanges(m, 1, C), null, 'game 1 has no side');
assert.deepEqual(S.mainOf(m, 1, C), rec.mains[1]);

// The usual plan over three matches: Pyroblast in every one (2 copies twice, 1 once), Duress once; one match without side.
const withMains = (mains) => ({ ...m, id: Math.random().toString(36), mains });
const g1 = rec.mains[1];
const plan = S.sidePlan([
  m,
  withMains({ 1: g1, 2: { ...g1, 'Galvanic Blast': 0, Pyroblast: 2 } }),
  withMains({ 1: g1, 2: { ...g1, 'Galvanic Blast': 1, Pyroblast: 1, Duress: 1, Island: 1 } }),
  withMains(undefined),
], C);
assert.equal(plan.matches, 3, 'matches whose sideboarding was recorded');
assert.deepEqual(plan.in, [{ name: 'Pyroblast', times: 3, qty: 2 }, { name: 'Duress', times: 1, qty: 1 }]);
assert.deepEqual(plan.out, [{ name: 'Galvanic Blast', times: 3, qty: 2 }, { name: 'Island', times: 1, qty: 1 }], 'usual copies: the most frequent (2 twice, 1 once)');

// Card results in games: game 1 won, game 2 lost; game 3 is not finished.
const stats = Object.fromEntries(S.cardStats([m], C).map((x) => [x.name, x]));
assert.deepEqual(stats.Thoughtcast.drawn, { W: 1, L: 0, D: 0 }, 'drawn in game 1 only');
assert.deepEqual(stats.Thoughtcast.notDrawn, { W: 0, L: 1, D: 0 }, 'in my deck for game 2, not drawn');
assert.deepEqual(stats.Pyroblast.drawn, { W: 0, L: 1, D: 0 });
assert.deepEqual(stats['Galvanic Blast'].notDrawn, { W: 0, L: 0, D: 0 }, 'sided out of game 2: not counted as not drawn there');
assert.deepEqual(stats['Galvanic Blast'].opening, { W: 1, L: 0, D: 0 }, 'in the kept seven of game 1');
assert.ok(!stats.Island, 'basic lands are left out');
assert.ok(!stats['Mulliganed Away']);

// A game recorded before 1.1 (no drawn cards) counts for the opening hand only.
const old = S.normalizeMatch({ ...JSON.parse(JSON.stringify(rec)), mains: undefined, games: [{ ...rec.games[0], drawn: undefined }] });
const oldStats = Object.fromEntries(S.cardStats([old], C).map((x) => [x.name, x]));
assert.deepEqual(oldStats.Thoughtcast.opening, { W: 1, L: 0, D: 0 });
assert.deepEqual(oldStats.Thoughtcast.drawn, { W: 0, L: 0, D: 0 });

// Imported records: unreadable draws, opening hands and sideboarding entries are dropped, not fatal.
const junk = S.normalizeMatch({ ...JSON.parse(JSON.stringify(rec)), mains: { 1: { Bolt: 4, Zero: 0, Text: 'x' } },
  games: [{ ...rec.games[0], drawn: { Bolt: null, Guide: [1] }, openingHand: ['Guide', null, 3] }] });
assert.deepEqual(junk.games[0].drawn, { Guide: [1] });
assert.deepEqual(junk.games[0].openingHand, ['Guide']);
assert.deepEqual(junk.mains[1], { Bolt: 4 });
assert.ok(S.cardStats([junk], C).every((x) => typeof x.name === 'string'));

console.log('cards: ok');
