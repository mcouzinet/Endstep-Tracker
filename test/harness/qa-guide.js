// QA of the session band, the matchup panel and side plans on the demo dashboard (run `node gen-demo.js` first).
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

  // Session: the live match and the one before it, all decks in view.
  assert.equal(await p.evaluate(() => { const s = document.getElementById('session'); return !s.hidden && s.open; }), true);
  assert.match(await $text('#session > summary'), /^Session en cours · 1–0 · 2 matchs · \d+ min$/);
  assert.equal(await p.evaluate(() => document.querySelectorAll('#session .session-row').length), 2);
  assert.match(await $text('#session .session-effects'), /Dimir Control ?de 0–0 à 1–0/);

  // A recognized archetype is confirmed from the session in one click.
  assert.equal(await p.evaluate(() => document.querySelector('#session [data-confirm="m1"]').dataset.name), 'Dimir Control');
  await click('#session [data-confirm="m1"]');
  await sleep(200);
  assert.equal(await p.evaluate(() => window.__DATA['note:m1'].archetype), 'Dimir Control');
  assert.equal(await p.evaluate(() => !document.querySelector('#session [data-confirm="m1"]')), true);

  // A session row opens its match in the history; the scope only widens when it hides the match (not here: all decks).
  await click('#session [data-show="m-live"]');
  await sleep(300);
  assert.equal(await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .match-row').getAttribute('aria-expanded')), 'true');
  assert.equal(await p.evaluate(() => document.getElementById('f-scope').value), JSON.stringify([null, null]));

  // Matchup panel on Burn · Modern: records, side plan saved as typed, shown on the row.
  await p.select('#f-scope', JSON.stringify(['Modern', 'Burn']));
  await sleep(200);
  await click('#by-opp button.rec[data-key="a:Dimir Control"]');
  await sleep(200);
  assert.equal(await p.evaluate(() => !document.getElementById('drawer').hidden), true);
  assert.match(await $text('#drawer-title'), /Dimir Control/);
  assert.deepEqual(await p.evaluate(() => [...document.querySelectorAll('#drawer .drawer-stats > div')].map((d) => `${d.querySelector('dt').textContent} ${d.querySelector('dd').textContent}`)),
    ['Matchs 1–0', 'G1 0–1', 'G2-G3 2–0', 'Au play 1–1', 'À la draw 1–0']);
  assert.equal(await p.evaluate(() => document.querySelector('#by-opp button.rec[data-key="a:Dimir Control"]').getAttribute('aria-expanded')), 'true');
  await p.evaluate(() => { const ta = document.getElementById('plan'); ta.focus(); ta.value = '+2 Hydroblast −2 Thoughtcast\nRester sur la défensive'; ta.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(700);
  const key = 'plan:' + JSON.stringify(['Modern', 'Burn', 'a:Dimir Control']);
  assert.equal(await p.evaluate((k) => window.__DATA[k], key), '+2 Hydroblast −2 Thoughtcast\nRester sur la défensive');
  assert.equal(await $text('#plan-state'), 'Enregistré');
  await p.evaluate(() => document.getElementById('plan').blur());
  await sleep(200);
  assert.equal(await $text('#by-opp button.rec[data-key="a:Dimir Control"] .plan-peek'), '+2 Hydroblast −2 Thoughtcast');

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
