// QA of the summary block and the matchup panel on the demo dashboard (run `node gen-demo.js` first).
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
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); });
  await p.reload();
  await sleep(1500);
  const $text = (sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const click = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel); // DOM clicks: the meta toast can sit over things

  // Summary, all decks in view: 4 finished matches outside the AI (m1, m3, m5, m6), too few for a rate.
  assert.equal(await p.evaluate(() => document.getElementById('session')), null, 'no session band');
  assert.equal(await p.evaluate(() => !document.getElementById('glance').hidden), true);
  assert.match(await $text('#glance .hero'), /^3–1 ?trop tôt pour un taux ?sur 4 matchs$/); // no percentage under 5 matches
  assert.equal(await p.evaluate(() => !!document.querySelector('#glance svg, #glance .trend')), false, 'no curve');
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#glance .form-strip button')].map((b) => b.className + ':' + b.dataset.show)),
    ['W:m6', 'L:m5', 'W:m3', 'W:m1'], 'oldest first, the latest on the right');
  // Hovering a square shows its match: result, opponent, archetype, my deck and format.
  const sq = await p.$('#glance [data-show="m1"]');
  await sq.hover();
  await sleep(150);
  assert.match(await $text('#glance .form-tip'), /^Victoire 2–1 ?Contre Kaladin.*Dimir Control ?Burn · Modern \(classé\)/);
  await p.mouse.move(2, 2);
  await sleep(100);
  assert.equal(await p.evaluate(() => document.querySelector('#glance .form-tip').hidden), true);

  // A square opens its match in the history; the scope only widens when it hides the match (not here: all decks).
  await click('#glance [data-show="m1"]');
  await sleep(300);
  assert.equal(await p.evaluate(() => document.querySelector('.match[data-id="m1"] .match-row').getAttribute('aria-expanded')), 'true');
  assert.equal(await p.evaluate(() => document.getElementById('f-scope').value), JSON.stringify([null, null]));

  // Matchup panel on Burn · Modern: records, no side plan (left out of 1.0).
  await p.select('#f-scope', JSON.stringify(['Modern', 'Burn']));
  await sleep(200);
  await click('#by-opp button.rec[data-key="a:Dimir Control"]');
  await sleep(200);
  assert.equal(await p.evaluate(() => !document.getElementById('drawer').hidden), true);
  assert.match(await $text('#drawer-title'), /Dimir Control/);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#drawer .drawer-stats > div')].map((d) => `${d.querySelector('dt').textContent} ${d.querySelector('dd').textContent}`)),
    ['Matchs 1–0', 'Sur le play 1–0', 'Sur la draw 0–0']); // one match, on the play in game 1
  assert.equal(await p.evaluate(() => document.querySelector('#by-opp button.rec[data-key="a:Dimir Control"]').getAttribute('aria-expanded')), 'true');
  assert.equal(await p.evaluate(() => !!document.querySelector('#drawer textarea, .plan-peek')), false);

  // Escape closes the panel and gives the focus back to its row; j walks to the next row.
  await p.keyboard.press('Escape');
  await sleep(150);
  assert.equal(await p.evaluate(() => document.getElementById('drawer').hidden), true);
  assert.equal(await p.evaluate(() => document.activeElement.dataset.key), 'a:Dimir Control');
  await p.keyboard.press('j');
  assert.equal(await p.evaluate(() => document.activeElement.dataset.key), 'a:Temur Nadu');

  // Sorting is a view preference, kept like the filters.
  await click('.panel-head [data-value="worst"]');
  await sleep(100);
  assert.equal(await p.evaluate(() => document.querySelector('.panel-head [data-value="worst"]').getAttribute('aria-pressed')), 'true');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('endstep-tracker.filters')).sort), 'worst');

  // The toast never catches a click.
  assert.equal(await p.evaluate(() => getComputedStyle(document.getElementById('toast')).pointerEvents), 'none');

  assert.deepEqual(errors, []);
  console.log('qa-guide: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
