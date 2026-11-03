// Matches against the site's AI stay in the history but count in no record. Run: node test/ai.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const H = 3600e3;
const now = 100 * H;
const match = (id, at, result, opp, extra = {}) => ({
  id, startedAt: at, updatedAt: at + H / 2, endedAt: at + H / 2, status: 'complete', result, mySeat: 0, colors: {}, score: [],
  players: [{ seat: 0, name: 'me' }, { seat: 1, name: opp }], games: [{ n: 1, winnerSeat: result === 'W' ? 0 : 1, firstSeat: 0 }], ...extra,
});
const human = match('h', now - 3 * H, 'W', 'Mikado', { participants: [{ username: 'me', isBot: false }, { username: 'Mikado', isBot: false }] });
const bot = match('b', now - 2 * H, 'L', 'Bot (Auto-Pilot)', { participants: [{ username: 'me', isBot: false }, { username: 'Bot (Auto-Pilot)', isBot: true }] });
const oldForge = match('f', now - H, 'L', 'Forge AI'); // recorded before participants were kept: judged by name

assert.equal(S.vsAI(human), false);
assert.equal(S.vsAI(bot), true, 'flagged by the site');
assert.equal(S.vsAI(oldForge), true, 'by the name when participants are missing');

const r = S.records([human, bot, oldForge], now);
assert.deepEqual(r.m, { W: 1, L: 0, D: 0 }, 'only the human match counts');
assert.deepEqual(r.play, { W: 1, L: 0, D: 0 }, 'on the play in game 1');
assert.deepEqual(S.lastSession([oldForge, bot, human]).map((m) => m.id), ['h'], 'the session skips AI matches');

// The dashboard opens on the deck of my last match: not one against the AI, not one with no deck known.
const C = { notes: {}, decks: {}, t: (k) => k };
const people = [{ username: 'me', isBot: false }, { username: 'Mikado', isBot: false }];
const played = (id, deck, extra) => match(id, now, 'W', 'Mikado', { participants: people, formatId: 'Pauper', myDeck: deck ? { id: deck, name: deck } : null, ...extra });
const last = (...list) => S.lastPlayed(list, C).deck;
assert.equal(last(played('n', 'New'), played('o1', 'Old'), played('o2', 'Old')), 'New', 'the last one, not the most played');
assert.equal(last({ ...bot, formatId: 'Pauper', myDeck: { id: 'T', name: 'Trained' } }, played('o', 'Old')), 'Old', 'never a deck played against the AI');
assert.equal(last(played('u', null), played('o', 'Old')), 'Old', 'a match with no deck known does not move the page');
assert.equal(last(played('u', null)), 'unknown', 'unless no match has one');
assert.deepEqual(S.lastPlayed([bot], C), { format: null, deck: null }, 'only the AI: every deck');

console.log('ai: ok');
