// QA of the metagame load when endstep.cc answers 503 "busy" for one format, in the real extension: every metagame
// request is served here, nothing reaches the site. The five-minute retry runs on a clock this script moves.
// Run from this folder: node gen-demo.js && node qa-meta-busy.js
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const EXT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-data.js'), 'utf8').replace(/^window\.__DATA = /, '').replace(/;\s*$/, ''));
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'meta-Modern.json'), 'utf8'));
  const decks = (snap.decks || snap).filter((d) => Object.keys(d.cards || {}).length);
  // The same match in two formats, no metagame in storage.
  const seed = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('match:') && k !== 'meta'));
  for (const [id, f] of [['mm', 'Modern'], ['mp', 'Pauper']]) seed[`match:${id}`] = { ...data['match:m2'], id, format: f, formatId: f };

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endstep-qa-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run', '--lang=en', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    let busy = true;
    const asked = { Pauper: 0, Modern: 0 };
    const json = (o, status = 200, headers = {}) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(o) });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'chrome-extension:') return r.continue();
      const m = u.hostname === 'endstep.cc' && u.pathname.match(/^\/api\/metagame\/v1\/(?:(formats)|(\w+)\/decks(?:\/([^/]+)\/cards)?)$/);
      if (!m) return r.abort();
      if (m[1]) return r.respond(json({ formats: [{ formatId: 'Pauper' }, { formatId: 'Modern' }] }));
      if (m[3]) return r.respond(json({ cards: { items: Object.entries(decks.find((d) => d.slug === m[3]).cards).map(([name, rate]) => ({ name, playRate: { rate } })) } }));
      asked[m[2]]++;
      if (m[2] === 'Pauper' && busy) return r.respond(json({ error: 'busy', code: 'metagame_unavailable' }, 503, { 'retry-after': '0' }));
      return r.respond(json({ decks: { items: decks.map((d) => ({ name: d.name, slug: d.slug, colours: d.colours, players: 10, share: { registrations: d.registrations } })), total: decks.length } }));
    });
    // Long timers wait for clock(); clock() moves Date.now past them.
    await p.evaluateOnNewDocument(() => {
      let shift = 0;
      const now = Date.now, set = window.setTimeout, late = [];
      Date.now = () => now() + shift;
      window.setTimeout = (fn, ms, ...a) => (ms >= 60000 ? late.push([fn, ms]) : set(fn, ms, ...a));
      window.clock = () => { for (const [fn, ms] of late.splice(0)) { shift += ms; fn(); } };
    });

    await p.goto(`chrome-extension://${id}/dashboard.html`);
    const stored = (d) => p.evaluate(async (d) => { await chrome.storage.local.clear(); await chrome.storage.local.set(d); localStorage.clear(); }, d);
    await stored(seed);
    await p.reload();
    await p.waitForSelector('#tab-history');
    await p.click('#tab-history');
    const guess = (m) => p.evaluate((m) => !!document.querySelector(`.match[data-id="${m}"] .tag.guess`), m);
    const toastError = () => p.evaluate(() => { const t = document.getElementById('toast'); return t.classList.contains('show') && t.classList.contains('error'); });

    // Pauper is busy: three tries, one error message, Modern loaded all the same.
    await p.waitForFunction(() => document.querySelector('#toast.show.error'), { timeout: 8000 });
    await sleep(300);
    assert.equal(asked.Pauper, 3, 'three tries');
    assert.equal(asked.Modern, 1, 'the next format still loads');
    assert.equal(await guess('mm'), true, 'Modern recognized');
    assert.equal(await guess('mp'), false, 'Pauper has nothing to compare with');

    // Five minutes later, still busy: asked again, nothing said.
    await p.evaluate(() => { document.getElementById('toast').classList.remove('show'); window.clock(); });
    await sleep(500);
    assert.equal(asked.Pauper, 6, 'asked again');
    assert.equal(asked.Modern, 1, 'what loaded is not asked again');
    assert.equal(await p.evaluate(() => document.getElementById('toast').classList.contains('show')), false, 'the retries stay quiet');

    // Five more, the site is back: recognized without reloading the page.
    busy = false;
    await p.evaluate(() => window.clock());
    await p.waitForSelector('.match[data-id="mp"] .tag.guess', { timeout: 4000 });
    assert.equal(asked.Pauper, 7);

    // A metagame gone old, the site busy: the old one still serves, no message.
    busy = true;
    await p.goto(`chrome-extension://${id}/popup.html`); // away from the dashboard, which would react to this change
    await p.evaluate(async () => { const { meta } = await chrome.storage.local.get('meta'); meta.byFormat.Pauper.at = 1; await chrome.storage.local.set({ meta }); });
    asked.Pauper = 0;
    await p.goto(`chrome-extension://${id}/dashboard.html`);
    await p.waitForSelector('#tab-history');
    await p.click('#tab-history');
    for (let i = 0; i < 20 && asked.Pauper < 3; i++) await sleep(100);
    await sleep(300);
    assert.equal(asked.Pauper, 3, 'the refresh was tried');
    assert.equal(await guess('mp'), true, 'the old metagame still recognizes');
    assert.equal(await toastError(), false, 'nothing to say');

    assert.deepEqual(errors, []);
    console.log('qa-meta-busy: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
