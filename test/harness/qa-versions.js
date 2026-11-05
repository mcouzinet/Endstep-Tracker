// QA of list versions on the demo dashboard (run `node gen-demo.js` first).
// The two Modern Burn matches get different main decks: m6 (older) plays Lava Spike, m1 (latest) Goblin Guide.
const assert = require('node:assert/strict');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`file://${__dirname}/harness-demo.html`);
  await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('endstep-tracker.lang', 'fr');
    localStorage.setItem('endstep-tracker.filters', JSON.stringify({ scope: { format: 'Modern', deck: 'Burn' } }));
  });
  await p.reload();
  await sleep(1200);
  await p.evaluate(async () => {
    const m6 = JSON.parse(JSON.stringify(window.__DATA['match:m6']));
    m6.myDeck.cards = [{ name: 'Lightning Bolt', quantity: 4 }, { name: 'Lava Spike', quantity: 4 }, { name: 'Mountain', quantity: 20 }];
    await chrome.storage.local.set({ 'match:m6': m6 });
  });
  await sleep(300);
  const read = () => p.evaluate(() => ({
    versions: [...document.querySelectorAll('#f-version option')].map((o) => o.textContent),
    versionHidden: document.getElementById('f-version').hidden,
    banner: document.getElementById('versions').hidden ? null : document.getElementById('versions').textContent.replace(/\s+/g, ' ').trim(),
    head: [...document.querySelectorAll('#by-opp .rec.head span')].map((s) => s.textContent),
    rows: [...document.querySelectorAll('#by-opp > button.rec')].map((r) => [...r.querySelectorAll('.rec-label, .rec-count, .rec-sub')].map((c) => c.textContent.trim())),
    sum: document.querySelector('#glance .glance-facts').textContent.replace(/\s+/g, ' '),
    list: [...document.querySelectorAll('#matches .match')].map((li) => li.dataset.id),
  }));

  // Default: every version (both matches, no version line); the current list is one pick away.
  let s = await read();
  assert.equal(s.versionHidden, false);
  assert.deepEqual(s.versions, ['v2 · actuelle (1)', 'v1 (1)', 'Toutes versions (2)']);
  assert.equal(await p.evaluate(() => document.getElementById('f-version').value), 'all');
  assert.equal(s.banner, null);
  assert.deepEqual(s.list, ['m1', 'm6']);

  // The current list (v2, m1 only). Dimir Control: one match won, on the play in game 1.
  await p.select('#f-version', '2');
  await sleep(200);
  s = await read();
  assert.equal(await p.evaluate(() => document.getElementById('f-version').value), '2', 'picking the current list keeps it');
  assert.match(s.banner, /^v2 depuis le .+ : \+4 Goblin Guide, −4 Lava Spike ?Comparer à v1$/);
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'Play', 'Draw', '']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'Play1–0', 'Draw—']]);
  assert.deepEqual(s.list, ['m1']);
  assert.doesNotMatch(s.sum, /G1|G2-G3/, 'no G1 / G2-G3 split in 1.0');

  // Compare with v1: its matchups join, each row gets the v1 match record.
  await p.click('#versions [data-action="compare"]');
  await sleep(200);
  s = await read();
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'Play', 'Draw', 'v1', '']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'Play1–0', 'Draw—', 'v1—'], ['Temur Nadu', '0–0', 'Play—', 'Draw—', 'v11–0']]);
  assert.match(s.sum, /v1 · Matchs ?1–0/);
  assert.match(s.banner, /Arrêter la comparaison$/);

  // All versions: both matches, no version line.
  await p.select('#f-version', 'all');
  await sleep(200);
  s = await read();
  assert.equal(s.banner, null);
  assert.deepEqual(s.list, ['m1', 'm6']);
  assert.equal(s.rows.length, 2);

  // The match detail names the list it was played with.
  await p.evaluate(() => document.querySelector('.match[data-id="m6"] .match-row').click()); // DOM click: the meta toast can sit over the row
  await sleep(200);
  const summary = await p.evaluate(() => document.querySelector('.match[data-id="m6"] details[data-key="deck:m6"] summary').textContent);
  assert.match(summary, / · v1$/);

  // The decks the site saves from a limited pool, a new one at each draft: one line, no versions, not offered for a merge.
  await p.evaluate(async () => {
    const pool = (id, day, card) => ({ ...JSON.parse(JSON.stringify(window.__DATA['match:m3'])), id, format: 'freeplay', formatId: 'casual', myDeck: { id: `pool-${day}`, name: `Draft pool \u2014 ${day}`, cards: [{ name: card, quantity: 40 }] } });
    await chrome.storage.local.set({
      'match:p1': pool('p1', '2026-10-30', 'Lightning Bolt'), 'match:p2': pool('p2', '2026-11-02', 'Counterspell'),
      decks: { ...(await chrome.storage.local.get('decks')).decks, 'pool-2026-10-30': { id: 'pool-2026-10-30', name: 'Draft pool \u2014 2026-10-30', format: 'draft', formatId: null } },
    });
  });
  await sleep(300);
  const scopes = await p.$$eval('#f-scope option', (o) => o.map((x) => x.textContent));
  assert.ok(scopes.includes('Deck limité · Freeplay (2)'), scopes.join(' | '));
  assert.ok(!scopes.some((x) => x.includes('Draft pool')), 'no line per day');
  await p.select('#f-scope', JSON.stringify(['Freeplay', 'Deck limité']));
  await sleep(200);
  const pools = await p.evaluate(() => ({ count: document.getElementById('count').textContent, versions: document.getElementById('f-version').hidden }));
  assert.match(pools.count, /^2 /);
  assert.equal(pools.versions, true, 'no version menu');
  await p.evaluate(() => { document.getElementById('tab-cards').click(); });
  await sleep(200);
  await p.select('#f-scope', JSON.stringify(['Modern', 'Burn']));
  await sleep(100);
  await p.evaluate(() => document.querySelector('[data-dt="merge-open"]').click());
  await sleep(100);
  assert.ok(!(await p.$$eval('#dt-merge option', (o) => o.map((x) => x.textContent))).some((x) => x.includes('Draft pool')), 'not offered for a merge');

  assert.deepEqual(errors, []);
  console.log('qa-versions: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
