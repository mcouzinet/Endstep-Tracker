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

// Moved by hand to another format (the dashboard's deck tools): that format wins, the site's is kept underneath.
const moved = { ...C, notes: { m: { formatId: 'canlander' } } };
assert.equal(S.formatOf(m({ formatId: 'casual', format: 'constructed' }), moved), 'Canlander', 'moved out of no banlist');
assert.equal(S.formatKey(m({ formatId: 'casual', format: 'constructed' }), moved), 'canlander');
assert.equal(S.formatOf(m({ formatId: 'Pauper' }), { ...C, notes: { m: { formatId: 'casual' } } }), 'Sans banlist', 'moved into no banlist');
assert.equal(S.formatLabel(null, C), 'Format inconnu');
assert.equal(S.metaFormat(m({ formatId: 'casual', format: 'constructed', myDeck: deck('dc') }), { ...C, notes: { m: { formatId: 'Pauper' } } }, ['Pauper']), 'Pauper', 'a moved match is compared with its new format');

// The one metagame format a match is compared with: the match's, else my deck's for a casual game, never all of them.
const tracked = ['Pauper', 'Modern', 'Legacy', 'duel-commander'];
assert.equal(S.metaFormat(m({ formatId: 'Modern', myDeck: deck('pauper') }), C, tracked), 'Modern', 'the match format wins');
assert.equal(S.metaFormat(m({ formatId: 'casual', format: 'freeplay', gameType: 'Constructed', myDeck: deck('pauper') }), C, tracked), 'Pauper', 'casual: my deck format');
assert.equal(S.metaFormat(m({ gameType: 'Constructed', myDeck: deck('pauper') }), C, tracked), 'Pauper', 'details missed: my deck format');
assert.equal(S.metaFormat(m({ formatId: 'casual', format: 'freeplay', gameType: 'Constructed', myDeck: null }), C, tracked), null, 'casual without a deck: nothing');
assert.equal(S.metaFormat(m({ formatId: 'Pauper' }), C, null), null, 'formats not known yet');
assert.equal(S.metaFormat(m({ formatId: 'casual', format: 'draft' }), C, tracked), null, 'limited: no recognition');

// A deck moved to another format (the dashboard's deck tools): its matches of that format follow, the next ones too.
const jeskai = { id: 'j', name: 'Jeskai' };
const rule = { ...C, formatMoves: { j: { casual: '7ph', Vintage: 'canadian-highlander', '': 'Modern' } } };
const inCasual = m({ formatId: 'casual', format: 'constructed', myDeck: jeskai });
assert.equal(S.formatOf(inCasual, rule), '7ph', 'moved with its deck');
assert.equal(S.siteFormat(inCasual, rule), 'casual', 'the site says otherwise underneath');
assert.equal(S.formatOf(m({ formatId: 'Vintage', myDeck: jeskai }), rule), 'Canadian-highlander', 'each format has its rule');
assert.equal(S.formatOf(m({ formatId: 'Legacy', myDeck: jeskai }), rule), 'Legacy', 'the same deck in another format stays');
assert.equal(S.formatOf(m({ gameType: 'Constructed', myDeck: jeskai }), rule), 'Modern', 'an unknown format can move too');
assert.equal(S.formatOf(m({ formatId: 'casual', format: 'constructed', myDeck: { id: 'other', name: 'Other' } }), rule), 'Sans banlist', 'another deck stays');
assert.equal(S.formatOf(inCasual, { ...rule, notes: { m: { formatId: 'Pauper' } } }), 'Pauper', 'a match moved on its own wins');
assert.equal(S.formatOf(inCasual, { ...rule, formatMoves: { j: { constructor: 'x', casual: 42 } } }), 'Sans banlist', 'a broken rule is ignored');
// A rule survives a merge and a deck picked by hand: it is looked up under every id the deck goes by.
assert.equal(S.formatOf(inCasual, { ...rule, merges: { j: { id: 'b', name: 'Big' } } }), '7ph', 'merged into another deck');
const merged = { ...C, formatMoves: { b: { casual: '7ph' } }, merges: { j: { id: 'b', name: 'Big' } } };
assert.equal(S.formatOf(inCasual, merged), '7ph', 'the rule of the deck it was merged into');
assert.equal(S.formatOf(m({ formatId: 'casual', myDeck: { id: 'x', name: 'X' } }), { ...rule, notes: { m: { deckId: 'j' } } }), '7ph', 'filed by hand under the moved deck');
assert.equal(S.formatOf(inCasual, { ...rule, notes: { m: { deckId: 'pauper' } } }), 'Sans banlist', 'recorded under the moved deck, filed by hand under another');
// The metagame follows: the new format when the site tracks it, never the old one.
assert.equal(S.metaFormat(m({ formatId: 'Vintage', myDeck: jeskai }), rule, ['Vintage', 'canadian-highlander']), 'canadian-highlander', 'compared with the new format');
assert.equal(S.metaFormat(m({ formatId: 'Vintage', myDeck: jeskai }), { ...C, formatMoves: { j: { Vintage: '7ph' } } }, ['Vintage']), null, 'no metagame for 7ph, not Vintage');
assert.equal(S.metaFormat(m({ formatId: 'Vintage' }), { ...C, notes: { m: { formatId: '7ph' } } }, ['Vintage']), null, 'a match moved on its own too');

console.log('format: ok');
