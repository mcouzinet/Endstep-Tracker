// QA of the history import inside the real extension: a stub endstep.cc /history page loads one page of
// /api/me/matches (answered locally, nothing reaches the site). Browsing it imports nothing; once asked from the
// dashboard, the matches never recorded are added, one the tracker recorded (under another id, as on the site) is
// not, the panel counts them until Done; a duplicate an earlier build imported is removed by the dashboard.
// Run from this folder: node qa-history.js
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const EXT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const recorded = { v: 1, id: 'm-rec', status: 'complete', result: 'L', startedAt: Date.parse('2026-09-20T20:00:00Z'), updatedAt: Date.parse('2026-09-20T20:30:00Z'),
  mySeat: 0, players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'Corvid' }], games: [{ n: 1, firstSeat: 0, winnerSeat: 1, mulligans: {}, life: {}, seen: {}, log: [] }], score: [0, 2], colors: {},
  formatId: 'pauper', ranked: true, myDeck: { id: 'deck-1', name: 'Esper Affinity', cards: null, sideboard: null, source: 'lobby' } };
const page = { nextCursor: 'c1', matches: [
  { id: 'h1', createdAt: '2026-09-02T18:00:00Z', result: 'won', formatId: 'pauper', stakes: 'ranked', score: { you: 2, opponent: 0 }, deckName: 'Esper Affinity', opponents: [{ id: 'u1', username: 'Bartok' }] },
  { id: 'h2', createdAt: '2026-09-01T18:00:00Z', result: 'lost', formatId: 'pauper', stakes: 'casual', score: { you: 1, opponent: 2 }, deckName: 'Esper Affinity', opponents: [{ id: 'u2', username: 'Wren' }] },
  { id: 'h3', createdAt: '2026-09-20T20:01:00Z', result: 'lost', formatId: 'pauper', stakes: 'ranked', score: { you: 0, opponent: 2 }, deckName: 'Esper Affinity', opponents: [{ id: 'u3', username: 'Corvid' }] },
] };
// The next page, asked by the extension during the import: the last one.
const older = { nextCursor: null, matches: [
  { id: 'h4', createdAt: '2026-08-30T18:00:00Z', result: 'won', formatId: 'pauper', stakes: 'ranked', score: { you: 2, opponent: 1 }, deckName: 'Esper Affinity', opponents: [{ id: 'u4', username: 'Delphine' }] },
] };

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endstep-qa-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run', '--lang=fr'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    const ext = await b.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    // Recorded live, and imported again by 1.1.5 under its history id.
    const stale = { v: 1, id: 'h3', source: 'history', status: 'complete', result: 'L', startedAt: Date.parse('2026-09-20T20:01:00Z'), updatedAt: Date.parse('2026-09-20T20:01:00Z'),
      mySeat: 0, players: [{ seat: 0, name: '' }, { seat: 1, name: 'Corvid' }], games: [], score: [0, 2], colors: {}, formatId: 'pauper', ranked: true,
      myDeck: { id: 'deck-1', name: 'Esper Affinity', cards: null, sideboard: null, source: 'history' } };
    await ext.evaluate(async (r, h) => { await chrome.storage.local.clear(); await chrome.storage.local.set({ 'match:m-rec': r, 'match:h3': h, decks: { 'deck-1': { id: 'deck-1', name: 'Esper Affinity', formatId: 'pauper' } } }); }, recorded, stale);
    const get = (k) => ext.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);

    const p = await b.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    const served = [];
    const api = []; // [query, Authorization] of each history request
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      const u = new URL(r.url());
      if (u.hostname !== 'endstep.cc') return r.continue();
      served.push(u.pathname);
      if (u.pathname === '/api/me/matches') {
        api.push([u.search, r.headers().authorization]);
        return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(u.searchParams.get('before') === 'c1' ? older : page) });
      }
      r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>endstep (stub)</title><body><script>fetch("/api/me/matches?limit=25", { headers: { Authorization: "Bearer qa-token" } })</script></body>' });
    });
    const cdp = await p.createCDPSession();
    const shadow = async () => {
      const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      const find = (n) => (n.attributes && n.attributes.includes('endstep-tracker-panel') ? n : (n.children || []).map(find).find(Boolean) || null);
      const host = find(root);
      return host && host.shadowRoots && host.shadowRoots[0];
    };
    const panelText = async () => {
      const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId: (await shadow()).nodeId });
      return outerHTML.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
    };
    const clickIn = async (selector) => {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: (await shadow()).nodeId, selector });
      const [x1, y1, , , x3, y3] = (await cdp.send('DOM.getBoxModel', { nodeId })).model.content;
      await p.mouse.click((x1 + x3) / 2, (y1 + y3) / 2);
      await sleep(300);
    };
    const hidden = () => p.evaluate(() => document.getElementById('endstep-tracker-panel').hidden);

    // Browsing the history without asking: nothing is imported.
    await p.goto('https://endstep.cc/history');
    await sleep(1800);
    assert.equal(await get('match:h1'), undefined, 'not asked: nothing imported');
    assert.deepEqual(api.splice(0).map((x) => x[0]), ['?limit=25'], 'not asked: no page loaded by the extension');
    assert.equal(await hidden(), true);

    // The dashboard: the duplicate an earlier build imported goes; "Import my past matches" opens the history page (the
    // QA opens it itself, with the site stubbed) and asks for the import.
    const d = await b.newPage();
    await d.goto(`chrome-extension://${id}/dashboard.html`);
    await sleep(800);
    assert.equal(await get('match:h3'), undefined, 'the duplicate an earlier build imported is gone');
    await d.evaluate(() => { window.__opened = []; Object.defineProperty(chrome.tabs, 'create', { value: (o) => window.__opened.push(o.url) }); });
    await d.evaluate(() => document.querySelector('#data-menu [data-action="import-history"]').click());
    await sleep(300);
    assert.deepEqual(await d.evaluate(() => window.__opened), ['https://endstep.cc/history']);
    assert.ok((await get('historyImport')).until > Date.now());

    // The history page, asked for: the next page loads by itself (the site's request, its token), the matches never
    // recorded are added, the recorded ones are not (h3, recorded under another id), and the panel counts them.
    await p.reload();
    await sleep(2500);
    assert.deepEqual(api.splice(0), [['?limit=25', 'Bearer qa-token'], ['?limit=25&before=c1', 'Bearer qa-token']]);
    assert.equal((await get('match:h4')).result, 'W', 'from the page the extension loaded');
    const h1 = await get('match:h1');
    assert.ok(h1 && h1.source === 'history' && h1.result === 'W' && h1.myDeck.id === 'deck-1', JSON.stringify(h1));
    assert.equal((await get('match:h2')).result, 'L');
    assert.equal(await get('match:h3'), undefined, 'recorded by the tracker: not imported');
    assert.deepEqual(await get('match:m-rec'), recorded, 'a match the tracker recorded is left as it is');
    const text = await panelText();
    assert.match(text, /(Import de l'historique|Importing your history) .*(Lus|Read) 4 (Ajoutés|Added) 3 (Tout ton historique est importé|Your whole history is imported)/, text);
    const r = await p.evaluate(() => { const x = document.getElementById('endstep-tracker-panel').getBoundingClientRect(); return { x: x.x, y: x.y, width: x.width, height: x.height }; });
    await p.screenshot({ path: path.join(__dirname, 'qa-history-panel.png'), clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 } });

    // The dashboard lists them; the detail says where it comes from.
    await d.reload();
    await sleep(800);
    await d.evaluate(() => { const tab = [...document.querySelectorAll('[role="tab"]')].find((x) => /Historique|History/.test(x.textContent)); if (tab) tab.click(); });
    await sleep(300);
    const rows = await d.$$eval('.match-row', (xs) => xs.map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
    assert.equal(rows.length, 4, rows.join('\n'));
    assert.ok(rows.some((x) => /Bartok/.test(x) && /2–0/.test(x)), rows.join('\n'));
    await d.evaluate(() => [...document.querySelectorAll('.match-row')].find((x) => /Bartok/.test(x.textContent)).click());
    await sleep(300);
    const detail = await d.$eval('.detail', (x) => x.innerText);
    assert.match(detail, /Importé depuis ton historique endstep\.cc|Imported from your endstep\.cc history/);
    assert.match(detail, /Esper Affinity/);
    await d.screenshot({ path: path.join(__dirname, 'qa-history.png') });

    // Done: the panel goes, and the history page imports nothing more.
    await clickIn('[data-import-done]');
    assert.equal(await get('historyImport'), undefined);
    assert.equal(await hidden(), true);
    await ext.evaluate(() => chrome.storage.local.remove('match:h2'));
    await p.reload();
    await sleep(1800);
    assert.equal(await get('match:h2'), undefined, 'done: nothing imported');
    assert.deepEqual(api.splice(0).map((x) => x[0]), ['?limit=25'], 'done: no page loaded by the extension');

    // Deleted from the dashboard, a match stays deleted when the history is imported again: an imported one (by its
    // id) and a recorded one (its history twin does not come in its place). One removed otherwise comes back.
    d.on('dialog', (x) => x.accept());
    for (const name of ['Bartok', 'Corvid']) {
      await d.evaluate((n) => {
        const li = [...document.querySelectorAll('#matches .match')].find((x) => x.querySelector('.match-row').textContent.includes(n));
        if (!li.querySelector('.detail')) li.querySelector('.match-row').click();
      }, name);
      await sleep(200);
      await d.evaluate((n) => [...document.querySelectorAll('#matches .match')].find((x) => x.querySelector('.match-row').textContent.includes(n)).querySelector('[data-delete]').click(), name);
      await sleep(400);
    }
    const gone = await get('deletedMatches');
    assert.ok(gone && gone.h1 && gone['m-rec'], JSON.stringify(gone));
    assert.equal(await get('match:h1'), undefined);
    assert.equal(await get('match:m-rec'), undefined);
    await ext.evaluate(() => chrome.storage.local.set({ historyImport: { until: Date.now() + 60e3, read: 0, added: 0 } }));
    await p.reload();
    await sleep(2500);
    assert.equal(await get('match:h1'), undefined, 'deleted: not imported again');
    assert.equal(await get('match:h3'), undefined, 'the twin of a deleted recorded match: not imported');
    assert.ok(await get('match:h2'), 'removed otherwise: imported again');

    assert.ok(served.includes('/api/me/matches') && served.every((u) => u.startsWith('/')));
    assert.deepEqual(errors, []);
    console.log('qa-history: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
