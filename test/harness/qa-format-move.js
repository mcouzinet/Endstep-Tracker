// QA of "Change format…" (the deck tools) in the real extension: a deck moves to a typed or known format, its next matches
// follow, the metagame follows, "Split" undoes it, a backup keeps it. The metagame is served here, nothing reaches the site.
// Run from this folder: node gen-demo.js && node qa-format-move.js (SHOTS=<folder> also saves captures)
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { puppeteer, CHROME } = require('./browser.js');
const EXT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOSTILE = '<img src=x onerror=window.__x=1>"';

(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-data.js'), 'utf8').replace(/^window\.__DATA = /, '').replace(/;\s*$/, ''));
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, 'meta-Modern.json'), 'utf8'));
  const decks = (snap.decks || snap).filter((d) => Object.keys(d.cards || {}).length);
  const seed = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'meta'));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endstep-qa-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run', '--lang=en', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    await (await b.target().createCDPSession()).send('Browser.setDownloadBehavior', { behavior: 'deny' }); // the backup test exports a file: never into ~/Downloads
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 900 });
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));

    const asked = {};
    const json = (o) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
    await p.setRequestInterception(true);
    p.on('request', (r) => {
      const u = new URL(r.url());
      if (u.protocol === 'chrome-extension:') return r.continue();
      const m = u.hostname === 'endstep.cc' && u.pathname.match(/^\/api\/metagame\/v1\/(?:(formats)|([\w-]+)\/decks(?:\/([^/]+)\/cards)?)$/);
      if (!m) return r.abort();
      if (m[1]) return r.respond(json({ formats: [{ formatId: 'Pauper' }, { formatId: 'Modern' }, { formatId: 'canadian-highlander' }] }));
      if (m[3]) return r.respond(json({ cards: { items: Object.entries(decks.find((d) => d.slug === m[3]).cards).map(([name, rate]) => ({ name, playRate: { rate } })) } }));
      asked[m[2]] = (asked[m[2]] || 0) + 1;
      return r.respond(json({ decks: { items: decks.map((d) => ({ name: d.name, slug: d.slug, colours: d.colours, players: 10, share: { registrations: d.registrations } })), total: decks.length } }));
    });
    let answer = true;
    let said = '';
    p.on('dialog', (d) => { said = d.message(); return answer ? d.accept() : d.dismiss(); });

    const shot = (name) => (process.env.SHOTS ? p.screenshot({ path: path.join(process.env.SHOTS, `${name}.png`) }) : null);
    const stored = () => p.evaluate(() => chrome.storage.local.get(null));
    const view = () => p.evaluate(() => {
      const sel = document.getElementById('f-scope');
      return { scope: JSON.parse(sel.value), shown: sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '', count: document.getElementById('count').textContent, tools: document.getElementById('deck-tools').textContent };
    });
    const go = async (format, deck) => {
      await p.select('#f-scope', JSON.stringify([format, deck]));
      await sleep(100);
    };
    // Opens the tool, types, and confirms by the button or the Enter key.
    const moveTo = async (text, how = 'click') => {
      await p.click('[data-dt="format-open"]');
      await p.type('#dt-format', text);
      if (how === 'enter') await p.keyboard.press('Enter');
      else await p.click('[data-dt="format"]');
      await sleep(250);
    };

    await p.goto(`chrome-extension://${id}/dashboard.html`);
    await p.evaluate(async (d) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(d);
      localStorage.clear();
      localStorage.setItem('endstep-tracker.lang', 'en');
      localStorage.setItem('endstep-tracker.filters', JSON.stringify({ scope: { format: 'No banlist', deck: 'Burn' }, tab: 'history' }));
    }, seed);
    await p.reload();
    await p.waitForSelector('[data-dt="format-open"]');
    await p.waitForFunction(() => document.querySelector('.match .tag.guess'), { timeout: 8000 });
    assert.equal((await view()).count.startsWith('3 '), true, 'three Burn matches with no banlist');

    // The tool opens on its field, with the formats known so far but not this one.
    await p.click('[data-dt="format-open"]');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'dt-format', 'the keyboard goes to the field');
    const known = await p.$$eval('#dt-formats option', (o) => o.map((x) => x.value));
    for (const f of ['Modern', 'Pauper', 'Canadian-highlander']) assert.ok(known.includes(f), `${f} is offered`);
    assert.ok(!known.includes('No banlist'), 'not the format it is in');
    await shot('format-open');

    // A redraw nobody asked for keeps what I am typing.
    await p.type('#dt-format', '7p');
    await p.evaluate(async () => { const { decks: d } = await chrome.storage.local.get('decks'); await chrome.storage.local.set({ decks: { ...d, late: { id: 'late', name: 'Late' } } }); });
    await sleep(200);
    assert.equal(await p.$eval('#dt-format', (i) => i.value), '7p', 'the text stays');
    assert.equal(await p.evaluate(() => document.activeElement.id), 'dt-format', 'the keyboard stays');
    await p.type('#dt-format', 'h');

    // Refused: nothing changes, the field is still there.
    answer = false;
    await p.click('[data-dt="format"]');
    await sleep(100);
    assert.match(said, /Move "Burn" from No banlist to 7ph\? Its 3 matches will count in 7ph, and so will its next matches in No banlist/);
    assert.equal((await stored()).formatMoves, undefined, 'nothing saved');
    assert.equal(await p.$eval('#dt-format', (i) => i.value), '7ph');
    answer = true;

    // Moved: the rule alone is saved, the view follows, the matches are no longer compared with Modern.
    await p.click('[data-dt="format"]');
    await sleep(250);
    let all = await stored();
    assert.deepEqual(all.formatMoves, { 'deck-Burn': { casual: '7ph' } });
    assert.equal(Object.keys(all).filter((k) => k.startsWith('note:') && all[k].formatId).length, 0, 'no match by match note');
    let v = await view();
    assert.deepEqual(v.scope, ['7ph', 'Burn']);
    assert.match(v.shown, /Burn/, 'the deck menu shows it');
    assert.ok(v.count.startsWith('3 '));
    assert.match(v.tools, /Also includes: No banlist \(3\)/);
    assert.equal(await p.evaluate(() => !!document.querySelector('.match .tag.guess')), false, 'no metagame for 7ph');
    await shot('format-moved');
    await go('Modern', 'Burn');
    assert.ok((await view()).count.startsWith('2 '), 'the Modern matches of the same deck stay');
    await go('7ph', 'Burn');

    // The next match of this deck with no banlist follows.
    await p.evaluate(async (m) => { await chrome.storage.local.set({ 'match:next': { ...m, id: 'next', startedAt: Date.now(), updatedAt: Date.now() } }); }, Object.values(data).find((x) => x && x.formatId === 'casual'));
    await sleep(250);
    v = await view();
    assert.deepEqual(v.scope, ['7ph', 'Burn']);
    assert.ok(v.count.startsWith('4 '), 'the next match follows');

    // Split: back where they were.
    await p.click('[data-dt="split"]');
    await sleep(250);
    assert.deepEqual((await stored()).formatMoves, {});
    v = await view();
    assert.deepEqual(v.scope, ['No banlist', 'Burn'], 'the view goes back with them');
    assert.ok(v.count.startsWith('4 '));
    assert.doesNotMatch(v.tools, /Also includes/);

    // By its name among players, with the Enter key: the site's format, and its metagame loads.
    await moveTo('CanLander', 'enter');
    assert.deepEqual((await stored()).formatMoves, { 'deck-Burn': { casual: 'canadian-highlander' } });
    v = await view();
    assert.deepEqual(v.scope, ['Canadian-highlander', 'Burn']);
    assert.match(v.shown, /Burn/, 'the deck menu shows it after the Enter key too');
    await p.waitForFunction(() => document.querySelector('.match .tag.guess'), { timeout: 8000 });
    assert.ok(asked['canadian-highlander'] >= 1, 'its metagame is asked for');

    // On to a format the deck already has, whatever the case: the two add up, Split leaves the Modern matches there.
    await moveTo('modern');
    assert.deepEqual((await stored()).formatMoves, { 'deck-Burn': { casual: 'Modern' } }, 'one rule, the same format on the site');
    v = await view();
    assert.deepEqual(v.scope, ['Modern', 'Burn']);
    assert.ok(v.count.startsWith('6 '));
    assert.match(v.tools, /Also includes: No banlist \(4\)/);
    await p.click('[data-dt="split"]');
    await sleep(250);
    assert.deepEqual((await view()).scope, ['No banlist', 'Burn'], 'the default view follows the last match, gone back');
    await go('Modern', 'Burn');
    assert.ok((await view()).count.startsWith('2 '), 'the Modern matches are still there');
    await go('No banlist', 'Burn');

    // Moved back to where it is on the site: no rule left.
    await moveTo('7ph');
    await moveTo('no banlist');
    assert.deepEqual((await stored()).formatMoves, {}, 'no rule to say what the site says');
    assert.deepEqual((await view()).scope, ['No banlist', 'Burn']);

    // Its own format, nothing typed: nothing asked.
    said = '';
    await p.click('[data-dt="format-open"]');
    await p.click('[data-dt="format"]');
    await p.type('#dt-format', 'No Banlist');
    await p.click('[data-dt="format"]');
    await sleep(100);
    assert.equal(said, '', 'nothing to confirm');
    await p.click('[data-dt="tool-cancel"]');

    // A merge keeps the move, and Split undoes both.
    await moveTo('7ph');
    await go('Pauper', 'Mono-U Tempo');
    await moveTo('7ph');
    assert.deepEqual((await stored()).formatMoves, { 'deck-Burn': { casual: '7ph' }, 'deck-Mono-U Tempo': { Pauper: '7ph' } });
    await go('Pauper', 'Esper Affinity');
    assert.ok((await view()).count.startsWith('1 '), 'a match recorded under Mono-U but filed under Esper Affinity stays');
    await go('7ph', 'Mono-U Tempo');
    await p.click('[data-dt="merge-open"]');
    assert.equal(await p.$('#dt-format'), null, 'one tool open at a time');
    const burn = await p.$$eval('#dt-merge option', (o) => (o.find((x) => x.textContent === 'Burn') || {}).value);
    await p.select('#dt-merge', burn);
    await p.click('[data-dt="merge"]');
    await sleep(250);
    v = await view();
    assert.deepEqual(v.scope, ['7ph', 'Burn'], 'still in 7ph after the merge');
    assert.ok(v.count.startsWith('5 '), 'four Burn, one Mono-U');
    await p.click('[data-dt="split"]');
    await sleep(250);
    all = await stored();
    assert.deepEqual(all.formatMoves, {});
    assert.deepEqual(all.deckMerges, {});
    assert.ok(['Burn', 'Mono-U Tempo'].includes((await view()).scope[1]), 'the view follows a match that went back');
    await go('No banlist', 'Burn');

    // Whatever is typed stays text.
    await moveTo(HOSTILE);
    assert.deepEqual((await stored()).formatMoves, { 'deck-Burn': { casual: HOSTILE } });
    assert.equal((await view()).scope[0], HOSTILE);
    await go('Pauper', 'Mono-U Tempo');
    await p.click('[data-dt="format-open"]');
    assert.ok((await p.$$eval('#dt-formats option', (o) => o.map((x) => x.value))).includes(HOSTILE), 'offered as it is');
    assert.equal(await p.evaluate(() => window.__x), undefined, 'never run');
    assert.equal(await p.evaluate(() => document.querySelectorAll('img[src="x"]').length), 0, 'never markup');
    await p.click('[data-dt="tool-cancel"]');
    await go(HOSTILE, 'Burn');
    await p.click('[data-dt="split"]');
    await sleep(250);

    // A backup carries the move; deleting everything removes it; importing brings it back.
    await moveTo('7ph');
    await p.evaluate(() => {
      const make = URL.createObjectURL;
      URL.createObjectURL = (x) => { x.text().then((s) => { window.__backup = s; }); return make.call(URL, x); };
      document.querySelector('[data-action="export-json"]').click();
    });
    await p.waitForFunction(() => window.__backup);
    const backup = await p.evaluate(() => window.__backup);
    assert.deepEqual(JSON.parse(backup).formatMoves, { 'deck-Burn': { casual: '7ph' } });
    await p.evaluate(() => document.querySelector('[data-action="clear"]').click());
    await sleep(300);
    assert.equal((await stored()).formatMoves, undefined, 'deleted with the rest');
    const file = path.join(profile, 'backup.json');
    fs.writeFileSync(file, backup);
    await (await p.$('#import')).uploadFile(file);
    await sleep(500);
    assert.deepEqual((await stored()).formatMoves, { 'deck-Burn': { casual: '7ph' } }, 'imported');
    assert.deepEqual((await view()).scope, ['7ph', 'Burn'], 'and applied at once');

    assert.deepEqual(errors, []);
    console.log('format move: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
