// QA of list versions and the G1 / G2-G3 split on the demo dashboard (run `node gen-demo.js` first).
// The two Modern Burn matches get different main decks: m6 (older) plays Lava Spike, m1 (latest) Goblin Guide.
const assert = require('node:assert/strict');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
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
    sum: document.getElementById('scope-sum').textContent.replace(/\s+/g, ' '),
    list: [...document.querySelectorAll('#matches .match')].map((li) => li.dataset.id),
  }));

  // Default: the current list (v2, m1 only). Dimir Control: match 1–0, G1 lost, games 2 and 3 won.
  let s = await read();
  assert.equal(s.versionHidden, false);
  assert.deepEqual(s.versions, ['v2 · actuelle (1)', 'v1 (1)', 'Toutes versions (2)']);
  assert.match(s.banner, /^v2 depuis le .+ : \+4 Goblin Guide, −4 Lava Spike ?Comparer à v1$/);
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'G1', 'G2-G3']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'G10–1', 'G2-G32–0']]);
  assert.deepEqual(s.list, ['m1']);
  assert.match(s.sum, /G1 0–1/);
  assert.match(s.sum, /G2-G3 2–0/);

  // Compare with v1: its matchups join, each row gets the v1 match record.
  await p.click('#versions [data-action="compare"]');
  await sleep(200);
  s = await read();
  assert.deepEqual(s.head, ['Archétype', 'Matchs', 'G1', 'G2-G3', 'v1']);
  assert.deepEqual(s.rows, [['Dimir Control', '1–0', 'G10–1', 'G2-G32–0', 'v1—'], ['Temur Nadu', '0–0', 'G1—', 'G2-G3—', 'v11–0']]);
  assert.match(s.sum, /v1 · Matchs 1–0/);
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

  assert.deepEqual(errors, []);
  console.log('qa-versions: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
