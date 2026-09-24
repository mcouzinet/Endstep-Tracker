// Store screenshots, 1280x800 viewport, from the dashboard QA harness demo data (node test/harness/gen-demo.js first).
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const H = `${__dirname}/../test/harness`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const open = async (lang, prefs) => {
    const p = await b.newPage();
    // Same as the store build: no coach.js, no model (release.sh leaves them out); page errors would mean the dashboard needs them.
    await p.setRequestInterception(true);
    p.on('request', (r) => (/coach(-model\.json|\.js)$/.test(r.url()) ? r.abort() : r.continue()));
    p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await p.goto(`file://${H}/harness-demo.html`);
    await p.evaluate((prefs) => { localStorage.clear(); if (prefs) localStorage.setItem('endstep-tracker.filters', JSON.stringify(prefs)); }, prefs || null);
    await p.reload();
    await sleep(500);
    await p.select('#lang', lang);
    await sleep(2500); // let the stubbed metagame load so no toast is up
    return p;
  };
  const shot = async (p, name) => {
    await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await p.screenshot({ path: `${__dirname}/${name}` });
  };
  const ALL = { scope: { format: null, deck: null } }; // all decks: the default (most played deck) shows a thinner demo
  let p = await open('en', ALL);
  await shot(p, '1-dashboard-en.png');
  await p.click('.match[data-id="m1"] .match-row');
  await sleep(400);
  await p.evaluate(() => document.querySelector('.match[data-id="m1"]').scrollIntoView({ block: 'start' }));
  await sleep(300);
  await shot(p, '2-match-detail.png');
  p = await open('fr', ALL);
  await shot(p, '3-dashboard-fr.png');
  await b.close();
})();
