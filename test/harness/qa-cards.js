// "My cards" panel and side plans in the harness (harness-cards.html: made-up Burn Bo3s with draws and sideboarding).
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
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
  const panel = await p.$('#cards-panel');
  out.cardsShown = await panel.evaluate((el) => !el.hidden);
  out.cardRows = await p.evaluate(() => [...document.querySelectorAll('#cards-panel > .rec:not(.head)')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()).slice(0, 6));
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
