// QA of the dashboard's layout and history views, on harness-cards.html (run `node gen-demo.js` first): labels keep
// their room at every width, the match detail keeps its two columns, Mes cartes sorts when narrow; the history is a list
// by default, by day on a click (a night past midnight with its evening, every day open, a click folds one, j reaches a
// folded day, the choice kept), Escape closes one layer. Run: node qa-layout.js
const assert = require('node:assert/strict');
const { puppeteer, CHROME } = require('./browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 1300, height: 1400 });
  await p.goto(`file://${__dirname}/harness-cards.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); localStorage.setItem('endstep-tracker.filters', JSON.stringify({ tab: 'matchups', scope: { format: 'Modern', deck: 'Burn' } })); });
  await p.reload();
  await sleep(1200);

  // Labels: the bars give way to the names, at every width the panels stack or sit side by side.
  for (const w of [600, 800, 900, 1000, 1217, 1300]) {
    await p.setViewport({ width: w, height: 1400 });
    await sleep(200);
    const narrowest = await p.evaluate(() => Math.min(...[...document.querySelectorAll('#overview .rec:not(.head) .rec-label, #lands .rec:not(.head) .rec-label, #by-opp .rec:not(.head) .rec-label')]
      .map((x) => x.getBoundingClientRect().width)));
    assert.ok(narrowest >= 120, `labels keep their room at ${w} px (${Math.round(narrowest)} px)`);
  }

  // Mes cartes, narrow: its columns still sort the list.
  await p.setViewport({ width: 700, height: 1400 });
  await p.click('#tab-cards');
  await sleep(200);
  assert.ok(await p.evaluate(() => !!document.querySelector('#cards-panel [data-card-sort="drawn"]').offsetParent), 'the sort buttons show when narrow');
  await p.click('#cards-panel [data-card-sort="drawn"]');
  await sleep(150);
  assert.equal(await p.evaluate(() => document.querySelector('#cards-panel [data-card-sort="drawn"]').getAttribute('aria-pressed')), 'true');

  // The history packed into evenings, four matches a night 35 minutes apart; the latest night runs past midnight.
  await p.setViewport({ width: 1300, height: 1400 });
  await p.evaluate(async () => {
    const all = Object.entries(window.__DATA).filter(([k, v]) => k.startsWith('match:') && v.status === 'complete').sort((a, b) => b[1].startedAt - a[1].startedAt);
    const night = new Date();
    night.setHours(0, 40, 0, 0);
    const add = {};
    all.forEach(([k, v], i) => {
      const m = JSON.parse(JSON.stringify(v));
      const shift = night.getTime() - Math.floor(i / 4) * 86400e3 - (i % 4) * 35 * 60e3 - m.startedAt;
      m.startedAt += shift; m.updatedAt += shift; if (m.endedAt) m.endedAt = m.startedAt + 20 * 60e3;
      add[k] = m;
    });
    await chrome.storage.local.set(add);
  });
  await p.click('#tab-history');
  await sleep(600);
  // A list by default: no caption, each row says how long ago.
  assert.equal(await p.evaluate(() => document.querySelectorAll('#matches .day').length), 0, 'a list by default');
  assert.doesNotMatch(await p.evaluate(() => document.querySelector('#matches .when').textContent), /^\d{1,2}:\d{2}/);
  // By day: the latest night, past midnight, is one day, labeled as its evening.
  await p.click('[data-filter="view"] [data-value="day"]');
  await sleep(300);
  const heads = () => p.evaluate(() => [...document.querySelectorAll('#matches .day')].map((x) => { const h = x.querySelector('button'); return h ? h.getAttribute('aria-expanded') : 'fixed'; }));
  let h = await heads();
  assert.ok(h.length > 1 && h.every((x) => x === 'true' || x === 'fixed'), 'every day open: ' + h);
  const first = await p.evaluate(() => {
    const day = document.querySelector('#matches .day');
    const hours = [];
    for (let el = day.nextElementSibling; el && el.classList.contains('match'); el = el.nextElementSibling) hours.push(new Date(matches.find((m) => m.id === el.dataset.id).startedAt).getHours());
    const back = new Date().getHours() < 5 ? 0 : -1; // the night's matches count for the evening before 00:40
    const label = new Intl.RelativeTimeFormat(document.documentElement.lang, { numeric: 'auto' }).format(back, 'day');
    return { hours, day: day.querySelector('.s-day').textContent, label, time: document.querySelector('#matches .when').textContent };
  });
  assert.ok(first.hours.some((x) => x < 5) && first.hours.some((x) => x >= 12), 'the night past midnight, one day: ' + first.hours);
  assert.equal(first.day.toLowerCase(), first.label.toLowerCase());
  assert.match(first.time, /^\d{1,2}:\d{2}/, 'under a day, the time of each match');

  // A match open in the first day: its caption folds it, the match closing; a click opens it again.
  await p.evaluate(() => document.querySelector('#matches .match-row').click());
  await sleep(200);
  await (await p.$('#matches .day button')).click();
  await sleep(200);
  h = await heads();
  assert.equal(h[0], 'false', 'a day folds with one of its matches open');
  assert.equal(await p.evaluate(() => openId), null);
  await (await p.$('#matches .day button')).click();
  await sleep(200);

  // j walks the rows and stops on a folded day's caption; Enter opens it.
  await p.evaluate(() => document.querySelectorAll('#matches .day button')[1].click());
  await sleep(200);
  await p.focus('#matches .match-row');
  const onCaption = () => p.evaluate(() => (document.activeElement.matches('button.s-head') ? [...document.querySelectorAll('#matches .day')].indexOf(document.activeElement.closest('.day')) : -1));
  for (let i = 0; i < 10 && (await onCaption()) < 0; i++) { await p.keyboard.press('j'); await sleep(40); }
  const at = await onCaption();
  assert.ok(at > 0, 'j reaches a folded day');
  await p.keyboard.press('Enter');
  await sleep(200);
  assert.equal((await heads())[at], 'true', 'Enter opens it');

  // The choice is kept; the list comes back on a click.
  await p.reload();
  await sleep(600);
  assert.ok(await p.evaluate(() => document.querySelectorAll('#matches .day').length > 1), 'by day after a reload');
  await p.click('[data-filter="view"] [data-value="list"]');
  await sleep(200);
  assert.equal(await p.evaluate(() => document.querySelectorAll('#matches .day').length), 0);

  // The detail: its fields beside the games from 981 px on, under them below, never past the panel.
  await p.evaluate(() => document.querySelector('#matches .match-row').click());
  await sleep(200);
  for (const w of [390, 981, 1100, 1217]) {
    await p.setViewport({ width: w, height: 1400 });
    await sleep(200);
    const d = await p.evaluate(() => {
      const g = document.querySelector('.detail-grid');
      const box = document.querySelector('.detail').getBoundingClientRect();
      return { cols: getComputedStyle(g).gridTemplateColumns.split(' ').length, over: [...document.querySelectorAll('.detail-side label.field')].some((x) => x.getBoundingClientRect().right > box.right + 1) };
    });
    assert.equal(d.cols, w > 980 ? 2 : 1, `${w} px: ${d.cols} column(s)`);
    assert.equal(d.over, false, `${w} px: the fields stay inside the detail`);
  }

  // Escape with an explanation open over a matchup's panel: the explanation closes, the panel stays.
  await p.setViewport({ width: 1300, height: 1400 });
  await p.click('#tab-matchups');
  await sleep(200);
  await p.click('#by-opp button.rec');
  await sleep(200);
  await p.click('#overview [data-info]');
  await sleep(150);
  const layers = () => p.evaluate(() => [document.querySelector('#info-pop').matches(':popover-open'), !!drawer]);
  assert.deepEqual(await layers(), [true, true]);
  await p.keyboard.press('Escape');
  await sleep(150);
  assert.deepEqual(await layers(), [false, true], 'Escape closes the explanation alone');
  await p.keyboard.press('Escape');
  await sleep(150);
  assert.deepEqual(await layers(), [false, false], 'then the panel');

  assert.deepEqual(errors, []);
  console.log('qa-layout: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
