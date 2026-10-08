// QA of the warning shown when the extension has no lasting access to endstep.cc (a browser set to give it the site
// on a click only, which records matches in part). The access is faked through chrome.permissions in the real
// extension's popup and dashboard. Run from this folder: node qa-access.js
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
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run', '--lang=fr'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    // The browser gives the site on a click only: no access until the button asks for it, then access.
    const withoutAccess = () => {
      let granted = false;
      chrome.permissions.contains = async () => granted;
      chrome.permissions.request = async () => { granted = true; window.__asked = true; return true; };
    };

    // Access given (the default here): no warning.
    const d = await b.newPage();
    await d.goto(`chrome-extension://${id}/dashboard.html`);
    await sleep(600);
    assert.equal(await d.evaluate(() => document.getElementById('access').hidden), true);

    // On click only: the dashboard says so; its button asks for the site, and the warning goes.
    const d2 = await b.newPage();
    await d2.evaluateOnNewDocument(withoutAccess);
    await d2.setViewport({ width: 1100, height: 420 });
    await d2.goto(`chrome-extension://${id}/dashboard.html`);
    await sleep(600);
    assert.equal(await d2.evaluate(() => document.getElementById('access').hidden), false);
    assert.match(await d2.$eval('#access', (x) => x.innerText), /accès à endstep\.cc|always see endstep\.cc/);
    await d2.screenshot({ path: path.join(__dirname, 'qa-access-dashboard.png') });
    await d2.click('#access [data-action="access"]');
    await sleep(300);
    assert.equal(await d2.evaluate(() => window.__asked && document.getElementById('access').hidden), true);

    // The popup too.
    const p = await b.newPage();
    await p.evaluateOnNewDocument(withoutAccess);
    await p.setViewport({ width: 360, height: 420 });
    await p.goto(`chrome-extension://${id}/popup.html`);
    await sleep(600);
    assert.equal(await p.evaluate(() => document.getElementById('access').hidden), false);
    await p.screenshot({ path: path.join(__dirname, 'qa-access-popup.png') });
    await p.click('#access-btn');
    await sleep(300);
    assert.equal(await p.evaluate(() => window.__asked && document.getElementById('access').hidden), true);

    console.log('qa-access: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
