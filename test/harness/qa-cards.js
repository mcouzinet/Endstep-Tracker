// "My cards" panel and side plans in the harness (harness-cards.html: made-up Burn Bo3s with draws and sideboarding).
const { puppeteer, CHROME } = require('./browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const errors = [];
  const open = async (w, h, lang = 'fr') => {
    const p = await b.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => m.type() === 'error' && !/8765/.test(m.text()) && errors.push(m.text()));
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto(`file://${__dirname}/harness-cards.html`);
    await p.evaluate((l) => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', l); localStorage.setItem('endstep-tracker.filters', JSON.stringify({ scope: { format: 'Modern', deck: 'Burn' } })); }, lang);
    await p.reload();
    await sleep(600);
    return p;
  };
  const out = {};
  let p = await open(1280, 900);
  out.tabs = await p.evaluate(() => [...document.querySelectorAll('#tabs [role="tab"]')].map((b) => b.textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')));
  await p.screenshot({ path: `${__dirname}/qa-tabs.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } });
  await p.click('#tab-cards');
  await sleep(200);
  let panel = await p.$('#cards-panel');
  out.cardsShown = await panel.evaluate((el) => !el.hidden);
  out.cardRows = await p.evaluate(() => [...document.querySelectorAll('#cards-panel > .rec:not(.head)')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).slice(0, 6));
  // Sorting by a column's head: by name (A to Z, then Z to A), by a rate (best first, a rate under 10 games never
  // first), kept for the next visit, the keyboard left on the head.
  const assert = require('node:assert/strict');
  const names = () => p.evaluate(() => [...document.querySelectorAll('#cards-panel .rec:not(.head) .rec-label a')].map((a) => a.textContent));
  const pressed = () => p.evaluate(() => [...document.querySelectorAll('#cards-panel [data-card-sort][aria-pressed="true"]')].map((b) => b.dataset.cardSort + b.textContent.slice(-1)));
  assert.deepEqual(await pressed(), ['gap↓']);
  await p.click('#cards-panel [data-card-sort="name"]');
  let list = await names();
  assert.deepEqual(list, [...list].sort((x, y) => x.localeCompare(y, 'fr')), list.join(', '));
  assert.deepEqual(await pressed(), ['name↑']);
  assert.equal(await p.evaluate(() => document.activeElement.dataset.cardSort), 'name');
  await p.click('#cards-panel [data-card-sort="name"]');
  assert.deepEqual(await names(), [...list].reverse());
  await p.click('#cards-panel [data-card-sort="opening"]');
  assert.deepEqual(await pressed(), ['opening↓']);
  const opening = await p.evaluate(() => [...document.querySelectorAll('#cards-panel .rec:not(.head)')].map((r) => {
    const c = r.querySelectorAll('.rec-sub')[1];
    const m = c && c.querySelector('b').textContent.match(/(\d+)\s?%/); // the rate, under the W–L
    return m ? Number(m[1]) : null;
  }));
  const ranked = opening.filter((x) => x !== null);
  assert.deepEqual(ranked, [...ranked].sort((x, y) => y - x), opening.join(' '));
  assert.ok(opening.indexOf(null) === -1 || opening.slice(opening.indexOf(null)).every((x) => x === null), 'too few games: after the rates');
  out.sortedByOpening = (await names()).slice(0, 4);
  await p.reload();
  await sleep(600);
  await p.click('#tab-cards');
  await sleep(200);
  assert.deepEqual(await pressed(), ['opening↓'], 'kept for the next visit');
  await p.click('#cards-panel [data-card-sort="gap"]'); // back to the default for the captures below
  panel = await p.$('#cards-panel');
  await panel.evaluate((el) => el.scrollIntoView());
  await sleep(200);
  await panel.screenshot({ path: `${__dirname}/qa-cards.png` });
  // Matchup panel: the usual sideboarding against Boros Energy.
  await p.click('#tab-matchups');
  await sleep(200);
  const row = await p.$('#by-opp button.rec[data-key="a:Boros Energy"]');
  await row.click();
  await sleep(300);
  out.sidePlan = await p.evaluate(() => (document.querySelector('#drawer .side-plan') || {}).innerText);
  await (await p.$('#drawer')).screenshot({ path: `${__dirname}/qa-side-drawer.png` });
  await p.keyboard.press('Escape');
  // A match's game 2: its side line.
  await p.click('#tab-history');
  await sleep(200);
  await p.evaluate(() => document.querySelector('.match[data-id="c0"] .match-row').click());
  await sleep(300);
  out.sideLine = await p.evaluate(() => [...document.querySelectorAll('.match[data-id="c0"] .side-line')].map((e) => e.innerText));
  const det = await p.$('.match[data-id="c0"] .games');
  await det.evaluate((el) => el.scrollIntoView());
  await det.screenshot({ path: `${__dirname}/qa-side-game.png` });
  // Their cards, a tab of its own (kept as a preference): the search narrows the list without losing the field; a row
  // opens its matches in the history.
  await p.click('#tab-theirs');
  await sleep(200);
  const theirs = () => p.evaluate(() => [...document.querySelectorAll('#theirs-panel [data-their-card]')].map((x) => x.dataset.theirCard));
  const every = await theirs();
  assert.ok(every.length > 0, 'their cards listed');
  assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('endstep-tracker.filters')).tab), 'theirs');
  const part = every[0].slice(1, 5).toUpperCase();
  await p.click('#their-q');
  await p.keyboard.type(part);
  await sleep(200);
  const found = await theirs();
  assert.ok(found.length >= 1 && found.every((x) => x.toUpperCase().includes(part)), 'the search: ' + found.join(', '));
  assert.equal(await p.evaluate(() => document.activeElement.id), 'their-q', 'typing goes on');
  await p.evaluate(() => { const q = document.getElementById('their-q'); q.value = ''; q.dispatchEvent(new Event('input')); });
  await sleep(200);
  await p.evaluate(() => document.querySelector('#theirs-panel [data-their-card]').click());
  await sleep(300);
  assert.deepEqual(await p.evaluate(() => [state.tab, state.q]), ['history', every[0]]);
  assert.ok(await p.evaluate(() => document.querySelectorAll('#matches .match').length > 0), 'its matches in the history');
  await p.evaluate(() => { document.getElementById('q').value = ''; setFilter({ q: '', tab: 'cards' }); });
  await sleep(200);
  // Narrow window, English.
  p = await open(430, 900, 'en');
  await p.click('#tab-cards');
  await sleep(200);
  const narrow = await p.$('#cards-panel');
  await narrow.evaluate((el) => el.scrollIntoView());
  await narrow.screenshot({ path: `${__dirname}/qa-cards-narrow.png` });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
