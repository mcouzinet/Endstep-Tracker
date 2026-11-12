// QA of list versions on the demo dashboard (run `node gen-demo.js` first).
// The two Modern Burn matches get different main decks: m6 (older) plays Lava Spike, m1 (latest) Goblin Guide; each
// draws its own card in game 1.
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
    m6.games[0].drawn['Lava Spike'] = ['ls1'];
    const m1 = JSON.parse(JSON.stringify(window.__DATA['match:m1']));
    m1.games[0].drawn['Goblin Guide'] = ['gg1'];
    await chrome.storage.local.set({ 'match:m6': m6, 'match:m1': m1 });
  });
  await sleep(300);
  const read = () => p.evaluate(() => ({
    versions: [...document.querySelectorAll('#f-version option')].map((o) => o.textContent),
    versionHidden: document.getElementById('f-version').hidden,
    banner: document.getElementById('versions').hidden ? null : document.getElementById('versions').textContent.replace(/\s+/g, ' ').trim(),
    head: [...document.querySelectorAll('#by-opp .rec.head span')].map((s) => s.textContent),
    rows: [...document.querySelectorAll('#by-opp > button.rec')].map((r) => [...r.querySelectorAll('.rec-label, .rec-count, .rec-sub')].map((c) => c.textContent.trim())),
    sum: document.querySelector('#glance .glance-facts').textContent.replace(/\s+/g, ' '),
    list: document.getElementById('count').textContent, // the history itself waits for its tab
  }));

  // Default: every version (both matches, no version line); the current list is one pick away.
  let s = await read();
  assert.equal(s.versionHidden, false);
  assert.deepEqual(s.versions, ['v2 · actuelle (1)', 'v1 (1)', 'Toutes versions (2)']);
  assert.equal(await p.evaluate(() => document.getElementById('f-version').value), 'all');
  assert.equal(s.banner, null);
  assert.equal(s.list, '2 matchs');

  // The current list (v2, m1 only). Dimir Control: one match won, on the play in game 1.
  await p.select('#f-version', '2');
  await sleep(200);
  s = await read();
  assert.equal(await p.evaluate(() => document.getElementById('f-version').value), '2', 'picking the current list keeps it');
  assert.match(s.banner, /^v2 depuis le .+ : \+4 Goblin Guide, −4 Lava Spike ?Comparer à…Comparer à v1$/);
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'Play', 'Draw', '']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'Play1–0', 'Draw—']]);
  assert.equal(s.list, '1 match');
  assert.doesNotMatch(s.sum, /G1|G2-G3/, 'no G1 / G2-G3 split in 1.0');

  // Compare with v1: its matchups join, each row gets the v1 match record.
  await p.focus('#v-compare'); // as a click would
  await p.select('#v-compare', '1');
  await sleep(200);
  s = await read();
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'Play', 'Draw', 'v1', '']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'Play1–0', 'Draw—', 'v1—'], ['Temur Nadu', '0–0', 'Play—', 'Draw—', 'v11–0']]);
  assert.match(s.sum, /v1 · Matchs ?1–0/);
  assert.match(s.banner, /^v2 depuis le .+ : \+4 Goblin Guide, −4 Lava Spike ?Arrêter la comparaisonComparer à v1$/, 'against the previous version: no "par rapport à"');
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'v-compare', 'the keyboard stays on the menu');

  // v1 compared with v2, a later version: the changes read from v2.
  await p.select('#f-version', '1');
  await sleep(200);
  await p.select('#v-compare', '2');
  await sleep(200);
  s = await read();
  assert.match(s.banner, /^v1 depuis le .+, par rapport à v2 : \+4 Lava Spike, −4 Goblin Guide ?Arrêter la comparaisonComparer à v2$/);
  await p.select('#v-compare', '');
  await sleep(200);
  assert.match((await read()).banner, /^v1 depuis le .+ · première liste enregistrée ?Comparer à…Comparer à v2$/);

  // All versions: both matches, no version line.
  await p.select('#f-version', 'all');
  await sleep(200);
  s = await read();
  assert.equal(s.banner, null);
  assert.equal(s.list, '2 matchs');
  assert.equal(s.rows.length, 2);

  // My cards: the current list's (v2), each counted over every game it was in; Lava Spike, cut, folded below.
  await p.evaluate(() => { document.getElementById('tab-cards').click(); });
  await sleep(200);
  const cards = () => p.evaluate(() => ({
    kept: [...document.querySelectorAll('#cards-panel > .rec:not(.head) .rec-label')].map((l) => l.textContent.replace(/\s+/g, ' ').trim()),
    cut: [...document.querySelectorAll('#cards-panel .cut-cards .rec-label')].map((l) => l.textContent.trim()),
    summary: (document.querySelector('#cards-panel .cut-cards summary') || {}).textContent,
    open: !!document.querySelector('#cards-panel .cut-cards[open]'),
  }));
  let c = await cards();
  assert.ok(c.kept.some((x) => /^Goblin Guide nouvelle/.test(x)), 'added since v1: ' + c.kept.join(' | '));
  assert.ok(c.kept.some((x) => /^Lightning Bolt/.test(x)) && !c.kept.some((x) => /nouvelle/.test(x) && /Bolt/.test(x)), 'in both lists, not new');
  assert.ok(!c.kept.some((x) => /Lava Spike/.test(x)));
  // (The demo's opening hands come from a real Burn list, wider than the demo's three cards: those are folded too.)
  assert.ok(c.cut.includes('Lava Spike') && !c.cut.includes('Lightning Bolt'), c.cut.join(' | '));
  assert.deepEqual([c.summary, c.open], [`Plus dans la liste : ${c.cut.length} cartes`, false]);
  // Opened, it stays open through a redraw.
  await p.evaluate(() => { document.querySelector('#cards-panel .cut-cards summary').click(); });
  await p.evaluate(async () => chrome.storage.local.set({ ping: Date.now() })); // a storage change redraws
  await sleep(300);
  assert.equal((await cards()).open, true, 'still open after a redraw');
  // v1 picked: its list, so Lava Spike is back among the cards and Goblin Guide is not drawn there.
  await p.select('#f-version', '1');
  await sleep(200);
  c = await cards();
  assert.ok(c.kept.some((x) => /^Lava Spike/.test(x)) && !c.kept.some((x) => /nouvelle/.test(x)), c.kept.join(' | '));
  assert.ok(!c.cut.includes('Lava Spike') && !c.kept.some((x) => /Goblin Guide/.test(x)));
  // Least used: the button sorts, the least used first, a second click reverses it.
  await p.select('#f-version', 'all');
  await sleep(200);
  await p.click('#cards-panel [data-card-sort="used"]');
  await sleep(200);
  const used = await p.evaluate(() => ({ pressed: document.querySelector('#cards-panel [data-card-sort="used"]').getAttribute('aria-pressed'),
    arrow: document.querySelector('#cards-panel [data-card-sort="used"] .arrow').textContent, focus: document.activeElement.dataset.cardSort }));
  assert.deepEqual(used, { pressed: 'true', arrow: '↑', focus: 'used' });
  await p.click('#cards-panel [data-card-sort="used"]');
  await sleep(200);
  assert.equal(await p.evaluate(() => document.querySelector('#cards-panel [data-card-sort="used"] .arrow').textContent), '↓');
  await p.click('#cards-panel [data-card-sort="gap"]');
  await sleep(100);
  await p.evaluate(() => { document.getElementById('tab-matchups').click(); });
  await sleep(100);

  // The deck menu: decks by name within each format.
  const groups = await p.$$eval('#f-scope optgroup', (gs) => gs.map((g) => [...g.querySelectorAll('option')].map((o) => JSON.parse(o.value)[1]).filter((d) => d !== null)));
  for (const g of groups) assert.deepEqual(g, [...g].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true })), g.join(' | '));

  // The match detail names the list it was played with.
  await p.evaluate(() => { document.getElementById('tab-history').click(); });
  await sleep(200);
  assert.deepEqual(await p.$$eval('#matches .match', (li) => li.map((x) => x.dataset.id)), ['m1', 'm6']);
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
