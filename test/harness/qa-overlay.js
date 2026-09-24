// QA of the in-page panel inside the real extension. Every request to endstep.cc is answered locally with a blank
// page (none reaches the site): the content scripts inject as on the real one, and the panel reads the demo data
// (`node gen-demo.js` first) seeded into chrome.storage. The panel's closed shadow root is read through DevTools.
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
  // The panel speaks the browser's language (English or French here): assertions accept both.
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    const ext = await b.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    const set = (items) => ext.evaluate((i) => chrome.storage.local.set(i), items);
    const get = (k) => ext.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);

    // The live demo match, between games 2 and 3 (they took game 2), with a side plan for this matchup.
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-data.js'), 'utf8').replace(/^window\.__DATA = /, '').replace(/;\s*$/, ''));
    const live = data['match:m-live'];
    Object.assign(live.games[1], { outcome: true, winnerSeat: 1 });
    live.score = [1, 1];
    live.updatedAt = Date.now();
    const plan = '+2 Kor Firewalker\nKeep life high';
    data['plan:' + JSON.stringify(['casual', 'Burn', 'c:BR'])] = plan;
    await ext.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); }, data);

    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const served = [];
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      if (new URL(r.url()).hostname === 'endstep.cc') { served.push(r.url()); r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>endstep (stub)</title><body style="background:#111"></body>' }); }
      else r.continue();
    });
    await p.setViewport({ width: 1280, height: 900 });
    await p.goto('https://endstep.cc/game/qa-stub');
    await sleep(600);

    const cdp = await p.createCDPSession();
    const shadow = async () => {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      const find = (n) => (n.attributes && n.attributes.includes('endstep-tracker-panel') ? n : (n.children || []).map(find).find(Boolean) || null);
      const host = find(root);
      return host && host.shadowRoots && host.shadowRoots[0];
    };
    const panelText = async () => {
      const sr = await shadow();
      const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: sr.nodeId });
      return outerHTML.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    };
    const clickIn = async (selector) => {
      const sr = await shadow();
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: sr.nodeId, selector });
      const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
      const [x1, y1, , , x3, y3] = model.content;
      await p.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
      await sleep(200);
    };
    const hidden = () => p.evaluate(() => document.getElementById('endstep-tracker-panel').hidden);

    // Between games: unfolded on the matchup and the side plan.
    assert.equal(await hidden(), false);
    let text = await panelText();
    assert.match(text, /REC · session/);
    assert.match(text, /(Against|Contre) Brisbane/);
    assert.ok(text.includes(plan.replace('\n', ' ')), text);

    // Folding it takes no keyboard focus away from the game.
    await clickIn('[data-toggle]');
    assert.equal(await p.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement), true);
    text = await panelText();
    assert.doesNotMatch(text, /(Against|Contre) Brisbane/);

    // Game 3 starts: a new phase, folded.
    live.games.push({ n: 3, mulligans: {}, life: {}, seen: {}, log: [], lastSeq: 0 });
    live.updatedAt = Date.now();
    await set({ 'match:m-live': live });
    await sleep(300);
    text = await panelText();
    assert.match(text, /REC · session/);
    assert.doesNotMatch(text, /(Against|Contre) Brisbane/);

    // Dragged by its bar, it stays where it was put.
    const before = await p.evaluate(() => getComputedStyle(document.getElementById('endstep-tracker-panel')).right);
    const sr = await shadow();
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: sr.nodeId, selector: '.grip' });
    const { model } = await cdp.send('DOM.getBoxModel', { nodeId });
    await p.mouse.move(model.content[0] + 2, model.content[1] + 2);
    await p.mouse.down();
    await p.mouse.move(model.content[0] - 200, model.content[1] - 100, { steps: 5 });
    await p.mouse.up();
    await sleep(200);
    assert.notEqual(await p.evaluate(() => getComputedStyle(document.getElementById('endstep-tracker-panel')).right), before);
    const stored = (await get('settings')).overlayPos;
    assert.ok(stored && stored.right > 168 && stored.bottom > 172, JSON.stringify(stored));

    // After the match: the result, then gone once closed.
    Object.assign(live.games[2], { outcome: true, winnerSeat: 0 });
    Object.assign(live, { status: 'complete', result: 'W', score: [2, 1], endedAt: Date.now(), updatedAt: Date.now() });
    await set({ 'match:m-live': live });
    await sleep(300);
    assert.match(await panelText(), /(Won|Victoire) 2–1 (against|contre) Brisbane/);
    await clickIn('[data-close]');
    assert.equal(await hidden(), true);

    // Switched off from the popup: nothing on the page.
    live.status = 'active'; live.updatedAt = Date.now(); delete live.result;
    await set({ 'match:m-live': live });
    await sleep(300);
    assert.equal(await hidden(), false);
    await set({ settings: { ...(await get('settings')), overlay: false } });
    await sleep(300);
    assert.equal(await hidden(), true);

    assert.ok(served.length > 0 && served.every((u) => u.startsWith('https://endstep.cc/')));
    assert.deepEqual(errors, []);
    console.log(`qa-overlay: ok (${served.length} endstep.cc request(s) answered locally)`);
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
