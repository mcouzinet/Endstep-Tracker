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
assert.deepEqual(r.g, { W: 1, L: 0, D: 0 });
assert.deepEqual(S.lastSession([oldForge, bot, human]).map((m) => m.id), ['h'], 'the session skips AI matches');

console.log('ai: ok');
