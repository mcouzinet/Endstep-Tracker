// QA of a backup import on the demo dashboard (run `node gen-demo.js` first): a history twin of a match recorded here is
// dropped at once, decks come along, and an odd record (a hand-edited file) neither stops the page nor slips markup in.
const assert = require('node:assert/strict');
const fs = require('fs');
const { puppeteer, CHROME } = require('./browser.js');
const H = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`file://${H}/harness-demo.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); });
  await p.reload(); await sleep(1000);
  const m1 = await p.evaluate(() => window.__DATA['match:m1']);
  const before = await p.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('match:')).length);
  const twin = { id: 'h-twin', source: 'history', status: 'complete', result: m1.result, startedAt: m1.startedAt + 60e3, players: m1.players, participants: m1.participants, mySeat: 0, games: [], formatId: 'Modern' };
  const odd = { id: 'odd', status: 'complete', result: '"><img src=x>', formatId: 42, startedAt: Date.now() - 864e5, players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'X' }], mySeat: 0,
    games: [{ n: 1, mulligans: { 0: '<b>' }, seen: { 1: { Bolt: 'x' } } }], gamesPerMatch: Infinity, score: ['a', 'b'], participants: [{ username: 123 }] };
  const file = require('os').tmpdir() + '/endstep-qa-backup.json';
  fs.writeFileSync(file, JSON.stringify({ version: 1, matches: [twin, odd], notes: { odd: { archetype: 12 } }, decks: { 'deck-new': { name: 'Imported deck' }, 'deck-bad': null },
    deckMerges: { [m1.myDeck.id]: 'x', other: null } })); // a hand-edited file: odd decks and merges are left out
  await (await p.$('#import')).uploadFile(file);
  await sleep(800);
  const after = await p.evaluate(async () => { const all = await chrome.storage.local.get(null); return { keys: Object.keys(all).filter((k) => k.startsWith('match:')), decks: all.decks }; });
  assert.ok(!after.keys.includes('match:h-twin'), 'the twin is not kept');
  assert.ok(after.keys.includes('match:odd'));
  assert.equal(after.keys.length, before + 1);
  assert.equal(after.decks['deck-new'].name, 'Imported deck');
  assert.equal('deck-bad' in after.decks, false, 'an odd deck is left out');
  await p.evaluate(() => document.getElementById('tab-history').click()); await sleep(300);
  const shown = await p.evaluate(() => ({ img: !!document.querySelector('#glance img, #matches img'), loading: document.body.classList.contains('loading'), count: document.getElementById('count').textContent }));
  assert.deepEqual([shown.img, shown.loading], [false, false]);
  for (const id of ['odd', 'm1']) { await p.evaluate((x) => document.querySelector(`.match[data-id="${x}"] .match-row`).click(), id); await sleep(200); } // their details open
  assert.deepEqual(errors, []);
  console.log('qa-import: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
