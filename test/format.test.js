// The format of a match, including when the site's match details were missed. Run: node test/format.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const decks = { pauper: { name: 'Monster tron', formatId: 'Pauper' }, dc: { name: 'Ellie', formatId: 'duel-commander' } };
const C = { notes: {}, decks, t: (k) => ({ casual: 'Sans banlist', format_unknown: 'Format inconnu' }[k] || k) };
const m = (o) => ({ id: 'm', players: [], games: [], mySeat: 0, ...o });
const deck = (id) => ({ id, name: decks[id].name });

assert.equal(S.formatOf(m({ formatId: 'Pauper', format: 'constructed' }), C), 'Pauper', 'the site says');
assert.equal(S.formatOf(m({ formatId: 'casual', format: 'constructed' }), C), 'Sans banlist', 'the site says: no banlist');
assert.equal(S.formatOf(m({ formatId: 'casual', format: 'freeplay' }), C), 'Freeplay');
assert.equal(S.formatOf(m({ formatId: 'duel-commander', format: 'commander' }), C), 'Duel-commander');
// Details missed: the deck tells it when it fits the game, else the format is unknown (never "no banlist").
assert.equal(S.formatOf(m({ gameType: 'Constructed', myDeck: deck('pauper') }), C), 'Pauper');
assert.equal(S.formatOf(m({ gameType: 'Constructed', format: 'constructed', myDeck: deck('dc') }), C), 'Format inconnu', 'a Duel Commander deck does not name a constructed game');
assert.equal(S.formatOf(m({ gameType: 'DuelCommander', myDeck: deck('dc') }), C), 'Duel-commander');
assert.equal(S.formatOf(m({ gameType: 'Constructed', myDeck: null }), C), 'Format inconnu', 'no deck, no format');
assert.equal(S.formatOf(m({ gameType: 'Constructed' }), { ...C, notes: { m: { deckId: 'pauper' } } }), 'Pauper', 'a deck picked by hand counts');

console.log('format: ok');
