// QA of the toolbar popup inside the real extension: Chrome for Testing, a throwaway profile, the demo data
// (`node gen-demo.js` first) seeded into chrome.storage. Nothing is sent to endstep.cc.
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const EXT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endstep-qa-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.setViewport({ width: 360, height: 600 });
    await p.goto(`chrome-extension://${id}/popup.html`);

    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-data.js'), 'utf8').replace(/^window\.__DATA = /, '').replace(/;\s*$/, ''));
    data['match:m-live'].updatedAt = Date.now(); // live
    const plan = '+2 Kor Firewalker\nLeur burn : garder les points de vie';
    data['plan:' + JSON.stringify(['casual', 'Burn', 'c:BR'])] = plan; // a no-banlist match: the key holds "casual" in every language
    const seed = async (lang) => {
      await p.evaluate(async (d, l) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); localStorage.setItem('endstep-tracker.lang', l); }, data, lang);
      await p.reload();
      await sleep(400);
    };
    const text = (sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);

    // Match in progress, in French then in English: the same side plan.
    await seed('fr');
    assert.match(await text('main h2'), /^En cours contre Brisbane/);
    assert.equal(await p.evaluate(() => document.querySelector('.plan').textContent), plan);
    assert.equal(await text('#open'), 'Ouvrir le tableau de bord');
    await seed('en');
    assert.match(await text('main h2'), /^In progress against Brisbane/);
    assert.equal(await p.evaluate(() => document.querySelector('.plan').textContent), plan);

    // The in-page panel switch: on by default, stored when turned off.
    assert.equal(await p.evaluate(() => document.getElementById('overlay').checked), true);
    await p.click('#overlay');
    await sleep(100);
    assert.equal(await p.evaluate(async () => (await chrome.storage.local.get('settings')).settings.overlay), false);

    // No match in progress: the session and its last matches.
    await p.evaluate(async () => { const m = (await chrome.storage.local.get('match:m-live'))['match:m-live']; m.updatedAt = Date.now() - 4 * 3600e3; await chrome.storage.local.set({ 'match:m-live': m }); });
    await sleep(300);
    assert.match(await text('main h2'), /^(Session in progress|Last session)/);
    assert.ok((await p.evaluate(() => document.querySelectorAll('.recent li').length)) <= 3);

    // "Open the dashboard" opens it in a tab.
    await p.click('#open');
    await b.waitForTarget((x) => x.url() === `chrome-extension://${id}/dashboard.html`, { timeout: 5000 });

    assert.deepEqual(errors, []);
    console.log('qa-popup: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
