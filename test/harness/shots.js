// Batched visual QA of the dashboard: wide, narrow, expanded + card preview, menu, empty, filtered-empty.
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const errors = [];
  const open = async (name, w, h) => {
    const p = await b.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    await p.goto(`file://${__dirname}/harness-${name}.html`);
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await sleep(400);
    return p;
  };
  // 1. wide overview
  let p = await open('demo', 1280, 900);
  await p.screenshot({ path: `${__dirname}/qa-wide.png`, fullPage: true });
  // 2. expanded match + hover preview on a card
  await p.click('.match[data-id="m1"] .match-row');
  await sleep(300);
  const card = await p.$('.match[data-id="m1"] .cardlist a.card');
  await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await sleep(300);
  const box = await card.boundingBox();
  await p.mouse.move(box.x + 5, box.y + 5);
  await sleep(1500);
  await p.screenshot({ path: `${__dirname}/qa-detail.png` });
  const previewShown = await p.evaluate(() => !document.getElementById('preview').hidden);
  // 3. data menu
  await p.mouse.move(5, 5);
  await p.evaluate(() => scrollTo(0, 0));
  await p.click('#data-btn');
  await sleep(200);
  await p.screenshot({ path: `${__dirname}/qa-menu.png`, clip: { x: 640, y: 0, width: 640, height: 320 } });
  await p.keyboard.press('Escape');
  // 4. filter by opponent archetype via breakdown + result seg, then filtered-empty via search
  await p.click('#by-opp button.rec');
  await sleep(200);
  await p.screenshot({ path: `${__dirname}/qa-facet.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });
  await p.type('#q', 'zzzz');
  await sleep(200);
  await p.screenshot({ path: `${__dirname}/qa-filtered-empty.png`, fullPage: true });
  // 4b. English, chosen from the selector
  p = await open('demo', 1280, 900);
  await p.select('#lang', 'en');
  await sleep(600);
  await p.click('.match[data-id="m1"] .match-row');
  await sleep(300);
  await p.screenshot({ path: `${__dirname}/qa-wide-en.png`, fullPage: true });
  const leftovers = await p.evaluate(() => (document.body.innerText.match(/\b[a-z]+_[a-z_]+\b/g) || []).filter((w) => !/^(m_|mono_)/.test(w)));
  console.log('untranslated keys:', JSON.stringify(leftovers));
  // 5. narrow window (side by side with the game)
  p = await open('demo', 430, 900);
  await p.click('.match[data-id="m-live"] .match-row');
  await sleep(300);
  await p.screenshot({ path: `${__dirname}/qa-narrow.png`, fullPage: true });
  // 6. onboarding
  p = await open('empty', 1280, 800);
  await p.screenshot({ path: `${__dirname}/qa-empty.png` });
  // keyboard: tab order reaches the first match row and toggles with Enter
  p = await open('demo', 1280, 900);
  let label = '';
  for (let i = 0; i < 40 && !label.includes('match-row'); i++) {
    await p.keyboard.press('Tab');
    label = await p.evaluate(() => document.activeElement.className + '');
  }
  await p.keyboard.press('Enter');
  await sleep(200);
  const kb = await p.evaluate(() => ({ expanded: document.activeElement.getAttribute('aria-expanded'), cls: document.activeElement.className }));
  console.log(JSON.stringify({ previewShown, kb, errors }, null, 1));
  await b.close();
})();
