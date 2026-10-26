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
assert.deepEqual(stats['Myr Enforcer'].later, { W: 1, L: 0, D: 0 }, 'drawn during game 1, not in the kept seven: drawn later');
assert.deepEqual(stats.Thoughtcast.later, { W: 0, L: 0, D: 0 }, 'in the kept seven: not drawn later');
assert.ok(!stats.Island, 'basic lands are left out');
// Played and in play (recorded since 1.5.6): game 2 has the buckets, game 1 (recorded before) does not count for them.
const pm = S.normalizeMatch(JSON.parse(JSON.stringify(m)));
Object.assign(pm.games.find((g) => g.n === 2), { played: { Pyroblast: [7] }, board: { 'Myr Enforcer': [4], 'Stolen Thing': [99] } });
const ps = Object.fromEntries(S.cardStats([pm], C).map((x) => [x.name, x]));
assert.deepEqual(ps.Pyroblast.played, { W: 0, L: 1, D: 0 });
assert.deepEqual(ps.Pyroblast.drawnTracked, { W: 0, L: 1, D: 0 }, 'drawn in a game that records plays');
assert.deepEqual(ps.Thoughtcast.played, { W: 0, L: 0, D: 0 }, 'game 1 has no record of plays');
assert.deepEqual([ps['Myr Enforcer'].board, ps['Myr Enforcer'].boardOnly], [{ W: 0, L: 1, D: 0 }, { W: 0, L: 1, D: 0 }], 'in play without being drawn (reanimated)');
assert.ok(!ps['Stolen Thing'], 'a card in play that is not in my deck is left out');
const stolen = S.normalizeMatch(JSON.parse(JSON.stringify(m)));
Object.assign(stolen.games.find((g) => g.n === 2), { drawn: { Pyroblast: [7], "Mishra's Bauble": [55] } });
assert.ok(!S.cardStats([stolen], C).some((x) => x.name === "Mishra's Bauble"), 'an opponent\'s card that went through my hand is not drawn');
// A double-faced card transformed on the battlefield keeps the name it had in my hand (same id within the game).
const dfc = S.normalizeMatch(JSON.parse(JSON.stringify(m)));
Object.assign(dfc.games.find((g) => g.n === 2), { drawn: { Pyroblast: [7], "King T'Challa": [42], 'Black Panther': [42] }, played: { "King T'Challa": [42] }, board: { 'Black Panther': [42] } });
dfc.mains[2] = { ...dfc.mains[2], "King T'Challa": 1 }; // in my deck, under its front name
const ds = Object.fromEntries(S.cardStats([dfc], C).map((x) => [x.name, x]));
assert.ok(!ds['Black Panther'], 'the back face is not a card of its own');
// Names as Scryfall knows them (C.canon): a printing with its own name and the other face of a card count as that card.
const cn = S.normalizeMatch(JSON.parse(JSON.stringify(m)));
Object.assign(cn.games.find((g) => g.n === 2), { drawn: { "Beholder's Sleep Ray": [3], 'Black Panther, Hope Enduring': [8] }, played: {}, board: { 'Black Panther, Hope Enduring': [8] } });
cn.mains[2] = { ...cn.mains[2], "Beholder's Sleep Ray": 1, "King T'Challa": 1 }; // the deck list as the site gives it
const canonC = { ...C, canon: (n) => ({ "Beholder's Sleep Ray": 'Stifle', 'Black Panther, Hope Enduring': "King T'Challa" })[n] || n };
const cs = Object.fromEntries(S.cardStats([cn], canonC).map((x) => [x.name, x]));
assert.ok(!cs["Beholder's Sleep Ray"] && !cs['Black Panther, Hope Enduring'], 'no row under the printed or back-face name');
assert.deepEqual([cs.Stifle.drawn, cs["King T'Challa"].board], [{ W: 0, L: 1, D: 0 }, { W: 0, L: 1, D: 0 }]);
assert.deepEqual([ds["King T'Challa"].drawn, ds["King T'Challa"].board, ds["King T'Challa"].boardOnly], [{ W: 0, L: 1, D: 0 }, { W: 0, L: 1, D: 0 }, { W: 0, L: 0, D: 0 }], 'drawn once, in play under its front name, drawn before');
assert.ok(!stats['Mulliganed Away']);
// The side and the exports name my cards the same way: a printing swapped for another of the same card within a match is
// no change, and one card sided in under two printings in two matches is one entry of the plan.
const slC = { ...C, canon: (n) => ({ "Beholder's Sleep Ray": 'Stifle' })[n] || n };
const swap = withMains({ 1: { ...g1, Stifle: 1 }, 2: { ...g1, "Beholder's Sleep Ray": 1, Pyroblast: 1, 'Galvanic Blast': 1 } });
assert.deepEqual(S.sideChanges(swap, 2, slC), [['Pyroblast', 1], ['Galvanic Blast', -1]], 'a printing for another: no change');
assert.deepEqual(S.sideChanges(swap, 2, C), [["Beholder's Sleep Ray", 1], ['Pyroblast', 1], ['Galvanic Blast', -1], ['Stifle', -1]], 'no names known: the site\'s');
const printings = [withMains({ 1: g1, 2: { ...g1, "Beholder's Sleep Ray": 1, 'Galvanic Blast': 1 } }), withMains({ 1: g1, 2: { ...g1, Stifle: 1, 'Galvanic Blast': 1 } })];
const one = S.sidePlan(printings, slC);
assert.deepEqual(one.in, [{ name: 'Stifle', times: 2, qty: 1 }], 'one card, one entry');
assert.equal(S.sideLine(one.in, 1), '+1 Stifle');
assert.deepEqual(S.sidePlan(printings, C).in.map((x) => x.name), ["Beholder's Sleep Ray", 'Stifle'], 'no names known: two entries');
assert.deepEqual(S.canonCounts({ Stifle: 2, "Beholder's Sleep Ray": 1, Island: 4 }, slC), { Stifle: 3, Island: 4 }, 'two printings add up');
assert.deepEqual(S.canonCounts({ Stifle: 2 }, {}), { Stifle: 2 });
// A game's cards for the CSV: copies per card, both faces of a card one copy (same id), an unknown id one copy.
const gc = { drawn: { "King T'Challa": [42], 'Black Panther': [42], "Beholder's Sleep Ray": [3], Stifle: [5], Island: ['?'] }, board: { 'Black Panther': [42] } };
assert.deepEqual(S.gameCards(gc, 'drawn', slC), { "King T'Challa": 1, Stifle: 2, Island: 1 });
assert.deepEqual(S.gameCards(gc, 'board', C), { "King T'Challa": 1 }, 'transformed in play: the name it had in my hand');
assert.deepEqual(S.gameCards(gc, 'played', C), {});

// A game recorded before 1.1 (no drawn cards) counts for the opening hand only.
const old = S.normalizeMatch({ ...JSON.parse(JSON.stringify(rec)), mains: undefined, games: [{ ...rec.games[0], drawn: undefined }] });
const oldStats = Object.fromEntries(S.cardStats([old], C).map((x) => [x.name, x]));
assert.deepEqual(oldStats.Thoughtcast.opening, { W: 1, L: 0, D: 0 });
assert.deepEqual(oldStats.Thoughtcast.drawn, { W: 0, L: 0, D: 0 });
const noHand = S.normalizeMatch({ ...JSON.parse(JSON.stringify(rec)), games: [{ ...rec.games[0], openingHand: undefined }] });
assert.ok(S.cardStats([noHand], C).every((x) => x.later.W + x.later.L === 0), 'opening hand missed: nothing counts as drawn later');

// Imported records: unreadable draws, opening hands and sideboarding entries are dropped, not fatal.
const junk = S.normalizeMatch({ ...JSON.parse(JSON.stringify(rec)), mains: { 1: { Bolt: 4, Zero: 0, Text: 'x' } },
  games: [{ ...rec.games[0], drawn: { Bolt: null, Guide: [1] }, openingHand: ['Guide', null, 3] }] });
assert.deepEqual(junk.games[0].drawn, { Guide: [1] });
assert.deepEqual(junk.games[0].openingHand, ['Guide']);
assert.deepEqual(junk.mains[1], { Bolt: 4 });
assert.ok(S.cardStats([junk], C).every((x) => typeof x.name === 'string'));

console.log('cards: ok');
