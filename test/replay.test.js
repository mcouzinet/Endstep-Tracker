// Replays a real Endstep Bo3 (captured 2026-09-22, guest vs Forge AI, condensed) through the tracker.
// Frame shapes and ordering are as observed on the wire. Run: node test/replay.test.js
const assert = require('node:assert/strict');
const T = require('../tracker.js');

const M = '860bdd5d-0e51-40f4-aed0-3ef08942fb65';
const ME = 'guest_rZ8gWdWE';
const AI = 'Forge AI';
let clock = 1790071704593;

const ev = (sequenceNumber, type, extra = {}) => ({
  type: 'GAME_EVENT', matchId: M, timestamp: (clock += 100), protocolVersion: 1,
  payload: { type, gameId: '070c543a-4409-42ed-a713-bf5815035f3f', sequenceNumber, message: '', ...extra },
});
const card = (id, name, owner, types, color) => ({ id, name, zone: 'Hand', ownerId: owner, controllerId: owner, faceDown: false, isToken: false, types, color });
const mine = (id, name) => card(id, name, '0', [], 'R');
const hidden = (k) => Array.from({ length: k }, (_, i) => ({ id: 1010000000 + i, name: 'Hidden card', faceDown: true, types: [] }));
const state = (seq, s) => ({
  type: 'GAME_STATE', matchId: M, viewerSeat: 0, seq, timestamp: (clock += 100), protocolVersion: 1,
  payload: {
    gameId: '070c543a-4409-42ed-a713-bf5815035f3f', phase: 'MAIN1', turnNumber: String(s.turn || 0), activePlayerId: s.active,
    status: s.status || 'ACTIVE', winnerId: s.winnerId, gameType: 'Constructed', sideboarding: false,
    matchScore: {
      winsBySeat: s.wins, player0Wins: s.wins[0], player1Wins: s.wins[1], gameNumber: s.n,
      gamesPlayed: s.wins[0] + s.wins[1], gamesPerMatch: 3, isMatchOver: !!s.matchOver,
    },
    players: [
      { id: '0', name: ME, life: s.life0 || 20, hand: s.hand0 || [], battlefield: s.bf0 || [], graveyard: [], exile: [] },
      { id: '1', name: AI, life: 20, hand: hidden(s.oppHand || 0), battlefield: s.bf1 || [], graveyard: [], exile: [] },
    ],
  },
});
const attach = (f) => ({ type: 'ATTACH', payload: { matchId: M, fromSeq: 0, headSeq: f.seq, frames: [f] } });

const G1_FIRST7 = [mine(15, 'Mountain'), mine(58, 'Skullcrack'), mine(52, 'Chain Lightning'), mine(22, 'Mountain'), mine(46, 'Rift Bolt'), mine(10, 'Mountain'), mine(44, 'Boros Charm')];
const G1_SECOND7 = [mine(48, 'Rift Bolt'), mine(34, 'Lava Spike'), mine(32, 'Lightning Bolt'), mine(22, 'Mountain'), mine(8, 'Goblin Guide'), mine(3, 'Monastery Swiftspear'), mine(6, 'Goblin Guide')];
const G1_KEPT6 = G1_SECOND7.slice(1); // Rift Bolt went to the bottom
const G2_HAND7 = [mine(13, 'Mountain'), mine(19, 'Mountain'), mine(11, 'Mountain'), mine(56, 'Eidolon of the Great Revel'), mine(41, 'Boros Charm'), mine(38, 'Searing Blaze'), mine(29, 'Lightning Bolt')];
const OPP_MOUNTAIN = card(88, 'Mountain', '1', ['Land'], 'C');
const OPP_GUIDE = card(65, 'Goblin Guide', '1', ['Creature'], 'R');

const wire = [
  { type: 'MATCH_STATUS', payload: { matchId: M, status: 'active', format: 'constructed' }, timestamp: clock },
  attach(state(1, { n: 1, wins: [0, 0], hand0: G1_FIRST7, oppHand: 7 })),
  attach(state(1, { n: 1, wins: [0, 0], hand0: G1_FIRST7, oppHand: 7 })), // delivered twice during the gateway MOVE
  ev(19, 'MULLIGAN', { playerIndex: '0', playerName: ME }),
  ev(20, 'CARD_ZONE_CHANGE', { message: 'a card: Hand -> Library', fromZone: 'Hand', toZone: 'Library', zoneOwnerIndex: '0' }),
  state(2, { n: 1, wins: [0, 0], hand0: G1_SECOND7, oppHand: 7 }),
  { type: 'GAME_DELTA', matchId: M, viewerSeat: 0, seq: 3, payload: { baseSeq: 2, patch: { state: { sequenceNumber: 11848821 } }, pendingAction: { type: 'MULLIGAN' } } },
  ev(38, 'HAND_SETTLED', { amount: 6, playerIndex: '0', playerName: ME, mulligans: 1 }),
  ev(39, 'HAND_SETTLED', { amount: 7, playerIndex: '1', playerName: AI, mulligans: 0 }),
  ev(40, 'TURN_BEGAN', { playerIndex: '1', playerName: AI, turnNumber: 1 }),
  ev(41, 'TURN_PHASE', { playerIndex: '1', phase: 'UNTAP' }),
  ev(45, 'CARD_ZONE_CHANGE', { cardName: 'Mountain', cardId: 88, fromZone: 'Hand', toZone: 'Battlefield', zoneOwnerIndex: '1' }),
  ev(46, 'LAND_PLAYED', { cardName: 'Mountain', cardId: 88, toZone: 'Battlefield', playerIndex: '1', message: 'Forge AI played Mountain' }),
  state(6, { n: 1, turn: 1, active: '1', wins: [0, 0], hand0: G1_KEPT6, oppHand: 5, bf1: [OPP_MOUNTAIN] }),
  ev(47, 'CARD_ZONE_CHANGE', { cardName: 'Goblin Guide', cardId: 68, fromZone: 'Hand', toZone: 'Stack', zoneOwnerIndex: '1' }),
  ev(50, 'SPELL_CAST', { cardName: 'Goblin Guide', cardId: 68, playerIndex: '1', message: 'Forge AI cast Goblin Guide' }),
  // I concede game 1: game 2's reset state arrives BEFORE game 1's GAME_OUTCOME.
  state(8, { n: 2, wins: [0, 1] }),
  ev(53, 'GAME_OUTCOME', { playerIndex: '1', playerName: AI, turnNumber: 1, endReason: 'concede' }),
  ev(1, 'SHUFFLE', { message: 'guest_rZ8gWdWE shuffled their library' }),
  { type: 'GAME_DELTA', matchId: M, viewerSeat: 0, seq: 9, payload: { baseSeq: 8, patch: { state: {}, players: [{ i: 0, librarySize: 60 }, { i: 1, librarySize: 60 }] }, pendingAction: { type: 'YES_NO' } } },
  ev(3, 'GAME_STARTED', { playerIndex: '0', playerName: ME, tossPlayerIndex: '0' }),
  state(11, { n: 2, wins: [0, 1], hand0: G2_HAND7, oppHand: 7 }),
  ev(34, 'MULLIGAN', { playerIndex: '1', playerName: AI }),
  ev(37, 'HAND_SETTLED', { amount: 7, playerIndex: '0', mulligans: 0 }),
  ev(38, 'HAND_SETTLED', { amount: 6, playerIndex: '1', mulligans: 1 }),
  ev(39, 'TURN_BEGAN', { playerIndex: '0', turnNumber: 1 }),
  state(14, { n: 2, turn: 1, active: '0', wins: [0, 1], hand0: G2_HAND7, oppHand: 6 }),
  ev(44, 'CARD_ZONE_CHANGE', { cardName: 'Mountain', cardId: 13, fromZone: 'Hand', toZone: 'Battlefield', zoneOwnerIndex: '0' }),
  ev(45, 'LAND_PLAYED', { cardName: 'Mountain', cardId: 13, playerIndex: '0' }),
  ev(57, 'TURN_BEGAN', { playerIndex: '1', turnNumber: 2 }),
  ev(64, 'LAND_PLAYED', { cardName: 'Mountain', cardId: 88, playerIndex: '1' }),
  ev(68, 'SPELL_CAST', { cardName: 'Goblin Guide', cardId: 65, playerIndex: '1' }),
  ev(76, 'TRIGGER_FIRED', { cardName: 'Goblin Guide', cardId: 65, playerIndex: '1' }),
  state(27, { n: 2, turn: 2, active: '1', wins: [0, 1], hand0: G2_HAND7.slice(1), oppHand: 5, bf0: [mine(13, 'Mountain')], bf1: [OPP_MOUNTAIN, OPP_GUIDE] }),
  // Goblin Guide reveals MY top card: must not count as an opponent card.
  ev(1473171363882280200, 'CARD_REVEALED', { cardName: 'Searing Blaze', cardId: 40, toZone: 'Library', playerIndex: '0', cardNames: ['Searing Blaze'], cardIds: [40], message: "Look at guest_rZ8gWdWE's library: Searing Blaze" }),
  ev(83, 'PLAYER_DAMAGED', { cardName: 'Goblin Guide', cardId: 65, amount: 2, playerIndex: '0' }),
  ev(84, 'PLAYER_LIFE_CHANGED', { oldValue: 20, newValue: 18, playerIndex: '0' }),
  ev(90, 'TURN_BEGAN', { playerIndex: '0', turnNumber: 3 }),
  ev(97, 'LAND_PLAYED', { cardName: 'Mountain', cardId: 19, playerIndex: '0' }),
  ev(97, 'LAND_PLAYED', { cardName: 'Mountain', cardId: 19, playerIndex: '0' }), // replayed duplicate
  ev(98, 'CARD_ZONE_CHANGE', { cardName: 'Lightning Bolt', cardId: 29, fromZone: 'Hand', toZone: 'Stack', zoneOwnerIndex: '0' }), // cancelled while targeting
  ev(103, 'GAME_OUTCOME', { playerIndex: '1', playerName: AI, turnNumber: 3, endReason: 'concede' }),
  state(47, { n: 2, turn: 3, wins: [0, 2], status: 'COMPLETE', winnerId: '1', matchOver: true, life0: 18 }),
  { ...state(48, { n: 2, turn: 3, wins: [0, 2], status: 'COMPLETE', winnerId: '1', matchOver: true, life0: 18 }), type: 'GAME_OVER' },
  // Someone else's match I'm only watching: no viewerSeat, must be ignored.
  { type: 'GAME_STATE', matchId: 'spectated', seq: 1, payload: { players: [{ id: '0', name: 'x' }, { id: '1', name: 'y' }] } },
];

const store = new Map();
const lobby = { id: 'lobby', config: { seatDecks: { u1: 'deck-burn' } }, seats: [{ user_id: 'u1', username: ME, seat_number: 0 }] };
const ctx = {
  meta: { [M]: { formatId: 'casual', ranked: false, lobbyId: 'lobby', participants: [{ userId: 'u1', username: ME, isBot: false }, { userId: 'bot', username: AI, isBot: true }] } },
  lobby,
  lastDeck: { id: 'deck-old', at: clock },
  decks: { 'deck-burn': { id: 'deck-burn', name: 'Burn' } },
};
for (const msg of wire) for (const f of T.frames(msg)) T.handle(store, f, ctx, f.timestamp || 0);

assert.deepEqual([...store.keys()], [M], 'only my match is tracked');
const rec = store.get(M).rec;
assert.equal(rec.mySeat, 0);
assert.deepEqual(rec.players.map((p) => p.name), [ME, AI]);
assert.equal(rec.format, 'constructed');
assert.equal(rec.formatId, 'casual');
assert.deepEqual(rec.myDeck && [rec.myDeck.id, rec.myDeck.name], ['deck-burn', 'Burn'], 'seat deck of the match\'s lobby wins over the last pick');
assert.equal(rec.status, 'complete');
assert.equal(rec.result, 'L');
assert.deepEqual(rec.score, [0, 2]);
assert.equal(rec.games.length, 2);

const [g1, g2] = rec.games;
assert.equal(g1.n, 1);
assert.equal(g1.firstSeat, 1, 'G1: opponent on the play (from TURN_BEGAN, GAME_STARTED was missed)');
assert.deepEqual(g1.mulligans, { 0: 1, 1: 0 });
assert.deepEqual([g1.winnerSeat, g1.endReason, g1.turns], [1, 'concede', 1]);
assert.deepEqual(g1.openingHand, G1_KEPT6.map((c) => c.name));

assert.equal(g2.n, 2);
assert.deepEqual([g2.firstSeat, g2.tossSeat], [0, 0], 'G2: I chose to play first');
assert.deepEqual(g2.mulligans, { 0: 0, 1: 1 });
assert.deepEqual([g2.winnerSeat, g2.endReason, g2.turns], [1, 'concede', 3]);
assert.deepEqual(g2.openingHand, G2_HAND7.map((c) => c.name));
assert.equal(g2.life[0], 18);

const opp = T.seenCards(rec, 1);
assert.deepEqual(opp, { Mountain: 1, 'Goblin Guide': 1 }, 'opponent cards seen, no Searing Blaze (mine)');
assert.equal(rec.colors[1], 'R');
assert.equal(T.seenCards(rec, 0)['Searing Blaze'], undefined);

const myLands = g2.log.filter((l) => l[2] === 'LAND_PLAYED' && l[1] === 0).map((l) => l[3]);
assert.deepEqual(myLands, ['Mountain', 'Mountain'], 'duplicate event ignored');
assert.ok(!g2.log.some((l) => l[2] === 'SPELL_CAST' && l[3] === 'Lightning Bolt'), 'cancelled cast is not a cast');
assert.ok(!g2.log.some((l) => l[2] === 'SHUFFLE' || l[2] === 'TURN_PHASE'), 'noise filtered');
assert.ok(g1.log.some((l) => l[0] === 1 && l[1] === 1 && l[2] === 'SPELL_CAST' && l[3] === 'Goblin Guide'));

// Deck attribution: another table's lobby is ignored, an old pick is not assumed, a late lobby id upgrades the guess.
const head = wire.slice(0, 2);
const replay = (c) => { const s = new Map(); for (const msg of head) for (const f of T.frames(msg)) T.handle(s, f, c, f.timestamp || 0); return s.get(M).rec; };
const other = (lastDeck) => ({ meta: { [M]: { lobbyId: 'other-table' } }, lobby, lastDeck, decks: {} });
assert.equal(replay(other({ id: 'deck-old', at: clock })).myDeck.id, 'deck-old', 'lobby of another table is ignored');
assert.equal(replay(other({ id: 'deck-old', at: clock - 7 * 3600e3 })).myDeck, null, 'a deck picked 7 h ago is not assumed');
const late = { meta: { [M]: {} }, lobby, lastDeck: { id: 'deck-old', at: clock }, decks: ctx.decks };
const lateRec = replay(late);
assert.equal(lateRec.myDeck.id, 'deck-old', 'without the lobby id, the recent pick is used');
late.meta[M].lobbyId = 'lobby';
T.applyMeta(lateRec, late.meta[M], late);
assert.equal(lateRec.myDeck.id, 'deck-burn', 'the lobby seat deck replaces the guess once the lobby id is known');

// My decisions: outgoing GAME_ACTION frames recorded with the prompt they answered and the board.
{
  const entry = store.get(M);
  entry.rt.state = { ...entry.rt.state, turnNumber: '3', phase: 'MAIN1', activePlayerId: '0', priorityPlayerId: '0',
    players: entry.rt.state.players.map((p, i) => (i === 0 ? { ...p, hand: [mine(29, 'Lightning Bolt'), mine(11, 'Mountain')], battlefield: [mine(13, 'Mountain')] }
      : { ...p, hand: hidden(5), handSize: 5, battlefield: [OPP_MOUNTAIN, OPP_GUIDE] })),
    pendingAction: { type: 'PRIORITY', message: 'Choose a spell or ability to play, or pass priority', cardOptions: [{ id: 29, name: 'Lightning Bolt', zone: 'Hand' }, { id: 11, name: 'Mountain', zone: 'Hand' }], min: 0, max: 0 } };
  const act = (payload) => T.onAction(store, { matchId: M, actionId: 'a', promptVersion: 9, ...payload }, clock);
  assert.equal(act({ type: 'SET_PHASE_STOPS', phaseStopsMyTurn: [] }), null, 'settings are not decisions');
  assert.ok(act({ type: 'PLAY_CARD', cardId: 29, abilityIndex: undefined, autoPassAfter: true }), 'a cast is recorded');
  assert.ok(act({ type: 'PASS_PRIORITY' }), 'passing with a playable option is a decision');
  entry.rt.state.pendingAction = { type: 'PRIORITY', message: 'x', cardOptions: [] };
  assert.equal(act({ type: 'PASS_PRIORITY' }), null, 'passing with nothing to do is not');
  entry.rt.state.pendingAction = { type: 'DECLARE_BLOCKERS', message: 'Declare blockers', cardOptions: [{ id: 65, name: 'Goblin Guide', zone: 'Battlefield' }] };
  act({ type: 'DECLARE_BLOCKERS', blockers: { 65: [13] } });
  entry.rt.state.pendingAction = { type: 'CHOOSE_TARGETS', message: 'Select any target', cardOptions: [{ id: -1, name: ME, zone: 'Player' }, { id: -2, name: AI, zone: 'Player' }, { id: 65, name: 'Goblin Guide', zone: 'Battlefield' }] };
  act({ type: 'CHOOSE_TARGETS', targets: [-2] });
  const ds = entry.dec[2];
  assert.equal(ds.length, 4);
  assert.deepEqual(ds[0].answer, { type: 'PLAY_CARD', cardId: 'Lightning Bolt', abilityIndex: undefined }, 'card ids become names, transport fields are dropped');
  assert.deepEqual(ds[0].prompt.options, ['Lightning Bolt', 'Mountain']);
  assert.deepEqual([ds[0].turn, ds[0].phase, ds[0].active], [3, 'MAIN1', 0]);
  assert.ok(ds[0].board.players[0].hand.includes('Lightning Bolt') && ds[0].board.players[1].hand === undefined, 'my hand is kept, the opponent\'s is a count');
  assert.equal(ds[0].board.players[1].handSize, 5);
  assert.deepEqual(ds[0].board.players[1].battlefield.map((c) => c.name), ['Mountain', 'Goblin Guide']);
  assert.deepEqual(ds[2].answer, { type: 'DECLARE_BLOCKERS', blockers: { 'Goblin Guide': ['Mountain'] } }, 'id-keyed maps are resolved too');
  assert.deepEqual(ds[3].answer, { type: 'CHOOSE_TARGETS', targets: [AI] }, 'player targets come from the prompt options');
}

// Persisted records must survive JSON (chrome.storage) and a page reload mid-match.
const reloaded = new Map([[M, { rec: JSON.parse(JSON.stringify(rec)), rt: {} }]]);
T.handle(reloaded, attach(state(48, { n: 2, turn: 3, wins: [0, 2], status: 'COMPLETE', winnerId: '1', matchOver: true })).payload.frames[0], ctx, clock);
assert.equal(reloaded.get(M).rec.games.length, 2);

console.log('replay test: ok');
