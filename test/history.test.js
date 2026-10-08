// Matches from the site's history page (/api/me/matches), never seen by the tracker. Run: node test/history.test.js
const assert = require('node:assert/strict');
const T = require('../tracker.js');
const S = require('../shared.js');

const decks = { 'deck-1': { name: 'Esper Affinity' }, 'deck-2': { name: 'Twin' }, 'deck-3': { name: 'Twin' } };
const C = { notes: {}, decks, t: (k) => k };
const row = (o) => ({ id: 'h1', createdAt: '2026-09-01T10:00:00Z', result: 'won', formatId: 'pauper', stakes: 'ranked',
  score: { you: 2, opponent: 1 }, deckName: 'Esper Affinity', opponents: [{ username: 'Bartok' }], ...o });

// Won 2-1 in ranked Pauper with one of my decks, known by its name: a complete match, no games.
const m = S.normalizeMatch(T.fromHistory(row(), decks));
assert.equal(m.source, 'history');
assert.equal(m.status, 'complete');
assert.equal(m.result, 'W');
assert.equal(m.startedAt, Date.parse('2026-09-01T10:00:00Z'));
assert.deepEqual(m.score, [2, 1]);
assert.equal(S.scoreText(m), '2–1');
assert.deepEqual(S.opps(m).map((p) => p.name), ['Bartok']);
assert.equal(m.myDeck.id, 'deck-1', 'the one deck of mine with that name');
assert.equal(S.deckName(m, C), 'Esper Affinity');
assert.equal(S.formatOf(m, C), 'Pauper');
assert.equal(m.ranked, true);
assert.deepEqual(m.games, []);
assert.deepEqual(S.records([m], Date.now()).m, { W: 1, L: 0, D: 0 });
assert.equal(S.matchOnPlay(m), null, 'play or draw unknown');
assert.equal('endedAt' in m, false, 'no end time: no length');
assert.equal(T.fromHistory(row({ endedAt: '2026-09-01T10:42:00Z' }), decks).endedAt, Date.parse('2026-09-01T10:42:00Z'), 'its length when the site gives the end');

// The site's deck id wins; a name two decks share, or one no longer listed, stays a name.
assert.equal(T.fromHistory(row({ deckId: 'deck-9' }), decks).myDeck.id, 'deck-9');
const twin = T.fromHistory(row({ deckName: 'Twin' }), decks);
assert.equal(twin.myDeck.id, 'name:Twin');
assert.equal(S.deckName(S.normalizeMatch(twin), C), 'Twin');
assert.equal(T.fromHistory(row({ deckName: null }), decks).myDeck, null);

// Unfinished: kept, counted nowhere. Lost, draw. The older single "opponent" field.
const u = T.fromHistory(row({ result: 'unfinished' }), decks);
assert.equal(u.status, 'abandoned');
assert.equal('result' in u, false);
assert.equal(T.fromHistory(row({ result: 'lost' }), decks).result, 'L');
assert.equal(T.fromHistory(row({ result: 'draw' }), decks).result, 'D');
assert.deepEqual(T.fromHistory(row({ opponents: undefined, opponent: { username: 'Wren' } }), decks).players.map((p) => p.name), ['', 'Wren']);

// Against the site's AI: kept, left out of the records, as a recorded one.
const ai = S.normalizeMatch(T.fromHistory(row({ opponents: [{ username: 'Forge AI' }] }), decks));
assert.equal(S.vsAI(ai), true);
assert.deepEqual(S.records([ai], Date.now()).m, { W: 0, L: 0, D: 0 });

// Recorded by the tracker too, under another id: the imported copy is the duplicate, paired once, nearest first.
const H = Date.parse('2026-09-01T10:00:00Z');
const rec = (id, at, opp, result) => S.normalizeMatch({ id, startedAt: at, status: 'complete', result, mySeat: 0, players: [{ seat: 0, name: 'me' }, { seat: 1, name: opp }], games: [] });
const imp = (id, at, opp, result) => S.normalizeMatch(T.fromHistory(row({ id, createdAt: new Date(at).toISOString(), result, opponents: [{ username: opp }] }), decks));
const dups = (list) => S.historyDuplicates(list).sort();
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), imp('h1', H + 3 * 60e3, 'bartok', 'won')]), ['h1'], 'same opponent (any case), result, minutes apart');
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), imp('h1', H, 'Wren', 'won')]), [], 'another opponent');
const shown = Object.assign(rec('r1', H, 'Malpelo96', 'L'), { participants: [{ username: 'me' }, { username: 'Malpelo96 LPO' }] });
assert.deepEqual(dups([shown, imp('h1', H, 'Malpelo96 LPO', 'lost')]), ['h1'], 'the account name the history gives, the game showing another');
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), imp('h1', H, 'Bartok', 'lost')]), [], 'another result');
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), imp('h1', H + 3 * 3600e3, 'Bartok', 'won')]), [], 'hours apart');
assert.deepEqual(dups([rec('r1', H, 'Bartok', undefined), imp('h1', H, 'Bartok', 'won')]), ['h1'], 'an unfinished recording still pairs');
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), imp('h1', H + 2 * 60e3, 'Bartok', 'won'), imp('h2', H + 50 * 60e3, 'Bartok', 'won')]), ['h1'],
  'one recorded match, two played: the other one stays');
assert.deepEqual(dups([rec('r1', H, 'Bartok', 'W'), rec('r2', H + 50 * 60e3, 'Bartok', 'W'), imp('h2', H + 52 * 60e3, 'Bartok', 'won'), imp('h1', H + 2 * 60e3, 'Bartok', 'won')]),
  ['h1', 'h2'], 'two and two: each with its own');
assert.deepEqual(dups([imp('h1', H, 'Bartok', 'won'), imp('h2', H, 'Bartok', 'won')]), [], 'two imported ones are not duplicates of each other');

// A recorded match the tracker caught only in part (it woke up mid-match): its hist in the history fills what is missing,
// never what it has.
const part = rec('p1', H + 20 * 60e3, 'Bartok', undefined);
Object.assign(part, { status: 'active', score: [1, 0] });
const hist = imp('h9', H, 'Bartok', 'won');
hist.endedAt = H + 50 * 60e3;
assert.deepEqual(S.historyPairs([part, hist]), [{ h: 'h9', m: 'p1' }]);
assert.deepEqual(S.fillFromHistory(part, hist), ['formatId', 'ranked', 'myDeck', 'result', 'endedAt']);
assert.equal(part.formatId, 'pauper');
assert.equal(part.ranked, true);
assert.equal(S.deckName(part, C), 'Esper Affinity');
assert.equal(part.status, 'complete');
assert.equal(part.result, 'W');
assert.deepEqual(part.score, [2, 1], 'the score by seat: mine first here');
assert.deepEqual(part.historyFilled, ['formatId', 'ranked', 'myDeck', 'result', 'endedAt']);
assert.deepEqual(S.fillFromHistory(part, hist), [], 'nothing left to fill');
const full = Object.assign(rec('f1', H, 'Bartok', 'W'), { formatId: 'modern', ranked: false, myDeck: { id: 'deck-2', name: 'Twin' }, endedAt: H + 1 });
assert.deepEqual(S.fillFromHistory(full, hist), [], 'a complete record keeps its own');
assert.equal(full.formatId, 'modern');
const seat1 = Object.assign(S.normalizeMatch({ id: 's1', startedAt: H, status: 'active', mySeat: 1, players: [{ seat: 0, name: 'Bartok' }, { seat: 1, name: 'me' }], games: [] }));
S.fillFromHistory(seat1, hist);
assert.deepEqual(seat1.score, [1, 2], 'the score by seat: mine second here');

// Two copies of one match (two computers): the fuller one stays, whichever side it comes from, completed by the other.
const seenAll = Object.assign(rec('x1', H, 'Bartok', 'W'), { games: [{ n: 1, firstSeat: 0, mulligans: {}, life: {}, seen: {}, log: [[1, 0, 'GAME_STARTED'], [1, 0, 'LAND_PLAYED'], [2, 1, 'SPELL_CAST']] }] });
const ghost = () => Object.assign(rec('x1', H + 60e3, 'Bartok', undefined), { status: 'active', formatId: 'pauper', games: [{ n: 1, mulligans: {}, life: {}, seen: {}, log: [[0, 1, 'ATTACKERS_DECLARED']] }] });
for (const [a, b] of [[seenAll, ghost()], [ghost(), seenAll]]) {
  const kept = S.mergeMatch(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(kept.games[0].log.length, 3, 'the fuller copy stays');
  assert.equal(kept.formatId, 'pauper', 'completed by the other');
  assert.equal(kept.result, 'W');
  assert.equal('historyFilled' in kept, false, 'not marked as coming from the history');
}
assert.equal(S.mergeMatch(undefined, seenAll), seenAll, 'nothing here: the imported one');

// Nothing to make a record of.
assert.equal(T.fromHistory(row({ id: undefined }), decks), null);
assert.equal(T.fromHistory(row({ createdAt: 'yesterday' }), decks), null);
assert.equal(T.fromHistory(null, decks), null);

console.log('history: ok');
