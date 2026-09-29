// Opponent deck recognition: scoring on a tiny synthetic metagame, and loading through a fake API. Run: node test/meta.test.js
const assert = require('node:assert/strict');
const Meta = require('../meta.js');

const decks = [
  { name: 'Burn', slug: 'burn', colours: ['R'], registrations: 500, cards: { 'Lightning Bolt': 1, 'Goblin Guide': 0.9, 'Mountain': 1, 'Skullcrack': 0.6 } },
  { name: 'Dimir Control', slug: 'dimir', colours: ['U', 'B'], registrations: 800, cards: { 'Counterspell': 1, 'Island': 1, 'Swamp': 0.9, 'Snapcaster Mage': 0.8, 'Fatal Push': 0.7 } },
  { name: 'Izzet Prowess', slug: 'prowess', colours: ['U', 'R'], registrations: 1200, cards: { 'Lightning Bolt': 0.9, 'Monastery Swiftspear': 1, 'Mountain': 0.9, 'Island': 0.6, 'Mutagenic Growth': 0.7 } },
];
const best = (seen, opts) => { const g = Meta.classify(seen, decks, opts); return g && g.name; };

assert.equal(best(['Lightning Bolt', 'Goblin Guide', 'Mountain']), 'Burn');
assert.equal(best(['Counterspell', 'Island', 'Snapcaster Mage']), 'Dimir Control');
assert.equal(best(['Lightning Bolt', 'Monastery Swiftspear']), 'Izzet Prowess', 'a shared card is settled by the distinctive one');
assert.equal(best(['Island', 'Mountain', 'Swamp']), null, 'basic lands alone prove nothing');
assert.equal(best(['Lightning Bolt']), null, 'one card is not enough');
assert.equal(best(['Tarmogoyf', 'Thoughtseize']), null, 'cards unknown to every archetype are ignored');
const tie = Meta.classify(['Lightning Bolt', 'Mountain'], decks, { minCards: 1 });
assert.equal(tie.name, 'Izzet Prowess', 'a Bolt is Burn or Prowess: the more played archetype leads');
assert.ok(tie.p > 0.6 && tie.p < 0.75, `…but only just (${tie.p.toFixed(2)})`);
assert.equal(best(['Lightning Bolt', 'Mountain'], { minCards: 1, minConfidence: 0.8 }), null, 'a stricter threshold abstains on that tie');

const g = Meta.classify(['Counterspell', 'island', 'Fatal Push // Fatal Push', 'Mountain'], decks);
assert.equal(g.name, 'Dimir Control');
assert.ok(g.p > 0.9 && g.p <= 1);
assert.deepEqual(g.matched, ['Counterspell', 'Fatal Push'], 'matched on normalized names, shown as seen (front face); basics are not listed as evidence');
assert.equal(Meta.norm('Blood Crypt // Blood Crypt'), 'blood crypt');

// loadFormat: two list pages, one archetype without a card list (withheld) is dropped.
const urls = [];
const fakeFetch = async (url) => {
  urls.push(url);
  const body = url.includes('/formats') ? { formats: [{ formatId: 'Modern' }, { formatId: 'Pauper' }] }
    : url.includes('/decks/') ? { cards: { items: url.includes('withheld') ? [] : [{ name: 'Lightning Bolt', playRate: { rate: 0.987654 } }, { name: 'Mountain', playRate: { rate: 1 } }], total: 2 } }
    : url.includes('page=1') ? { decks: { items: [{ name: 'Burn', slug: 'burn-1', colours: ['R'], share: { registrations: 500 } }], total: 2 } }
    : { decks: { items: [{ name: 'Tiny', slug: 'withheld-2', colours: [], share: { registrations: 3 } }], total: 2 } };
  return { ok: true, json: async () => body };
};
Meta.loadFormat('Modern', fakeFetch).then((snap) => {
  assert.equal(snap.formatId, 'Modern');
  assert.deepEqual(snap.decks.map((d) => d.slug), ['burn-1']);
  assert.equal(snap.decks[0].cards['Lightning Bolt'], 0.988);
  assert.equal(urls.filter((u) => u.includes('/decks?')).length, 2, 'both list pages fetched');
  return Meta.listFormats(fakeFetch);
}).then((formats) => {
  assert.deepEqual(formats, ['Modern', 'Pauper']);
  // Rate limit: a 429 is retried once the window resets, low remaining pauses, headers are read when present.
  let calls = 0;
  const limited = async () => {
    calls++;
    const h = { 'retry-after': '0', 'x-ratelimit-reset': '0', 'x-ratelimit-remaining': '3' };
    return calls === 1 ? { ok: false, status: 429, headers: { get: (k) => h[k] } }
      : { ok: true, status: 200, headers: { get: (k) => h[k] }, json: async () => ({ formats: [{ formatId: 'Pauper' }] }) };
  };
  return Meta.listFormats(limited);
}).then((formats) => {
  assert.deepEqual(formats, ['Pauper'], '429 retried');
  // Archetypes: under 4 players never asked for, one refused (404) skipped, a server error stops every worker.
  const deckList = (n, extra) => ({ decks: { items: Array.from({ length: n }, (_, k) => ({ name: `D${k}`, slug: `d${k}`, players: 10, share: { registrations: 100 - k } })).concat(extra || []), total: n + (extra ? extra.length : 0) } });
  const cardsOf = { cards: { items: [{ name: 'Lightning Bolt', playRate: { rate: 1 } }] } };
  const asked = [];
  const skipping = async (url) => {
    if (url.includes('/decks?')) return { ok: true, json: async () => deckList(3, [{ name: 'Tiny', slug: 'tiny', players: 2 }]) };
    asked.push(url);
    return url.includes('/d1/') ? { ok: false, status: 404 } : { ok: true, json: async () => cardsOf };
  };
  return Meta.loadFormat('Modern', skipping).then((snap) => {
    assert.deepEqual(snap.decks.map((d) => d.slug), ['d0', 'd2'], '404 skipped, the others kept');
    assert.ok(!asked.some((u) => u.includes('/tiny/')), 'an archetype under 4 players is not asked for');
    let cardCalls = 0;
    const failing = async (url) => {
      if (url.includes('/decks?')) return { ok: true, json: async () => deckList(40) };
      cardCalls++;
      await new Promise((ok) => setTimeout(ok, 5));
      return url.includes('/d0/') ? { ok: false, status: 500 } : { ok: true, json: async () => cardsOf };
    };
    return Meta.loadFormat('Modern', failing).then(() => assert.fail('a 500 fails the load'), async (err) => {
      assert.equal(err.status, 500);
      await new Promise((ok) => setTimeout(ok, 100)); // leave the other workers time to go on, if they would
      assert.ok(cardCalls <= 4, `workers stopped after the first failure (${cardCalls} card requests)`);
    });
  });
}).then(() => {
  console.log('meta test: ok');
});
