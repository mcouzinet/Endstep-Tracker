// QA of the redraws nobody asked for on the page (card names from Scryfall, the metagame, a live match): they take
// neither what I am typing nor the keyboard's place, and they do not swallow a click (run `node gen-demo.js` first).
const assert = require('node:assert/strict');
const { puppeteer, CHROME } = require('./browser.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOTE = 'Garder Skullcrack pour le G3.';
const FIELD = '.match[data-id="m1"] textarea[data-note="notes"]';
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const errors = [];
  // The demo in the history tab, no card name known yet. Scryfall is answered here, and only once `answer` is called;
  // Lightning Bolt comes back under another name, to see when the page takes it in.
  const open = async () => {
    const p = await b.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.setViewport({ width: 1280, height: 1400 });
    let answer;
    const answered = new Promise((r) => { answer = r; });
    await p.setRequestInterception(true);
    p.on('request', async (q) => {
      const u = new URL(q.url());
      if (u.host !== 'api.scryfall.com') return q.continue();
      await answered;
      const name = u.searchParams.get('exact');
      return q.respond({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ name: name === 'Lightning Bolt' ? 'Foudre' : name }) });
    });
    await p.goto(`file://${__dirname}/harness-demo.html`);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); });
    await p.reload();
    await sleep(600);
    await p.click('#tab-history');
    await sleep(200);
    return { p, answer };
  };
  const openMatch = async (p) => {
    await p.evaluate(() => document.querySelector('.match[data-id="m1"] .match-row').click());
    await sleep(200);
  };
  const typeInNote = async (p) => {
    await p.$eval(FIELD, (x) => { x.focus(); x.setSelectionRange(x.value.length, x.value.length); });
    await p.keyboard.type(' avant');
  };
  const noteKept = async (p) => {
    await p.keyboard.type(' après');
    assert.equal(await p.$eval(FIELD, (x) => x.value), `${NOTE} avant après`);
    assert.equal(await p.evaluate((s) => document.activeElement === document.querySelector(s), FIELD), true);
  };
  const focusedRow = (p) => p.evaluate(() => { const a = document.activeElement; return a.matches('.match-row') ? a.closest('.match').dataset.id : a.tagName; });
  const detail = (p) => p.evaluate(() => document.querySelector('.match[data-id="m1"] .detail').textContent);

  // Card names arrive while I type a note: the field keeps its text and the caret, and leaving it applies them.
  {
    const { p, answer } = await open();
    await openMatch(p);
    await typeInNote(p);
    answer();
    await p.waitForFunction(() => !resolving);
    await noteKept(p);
    assert.doesNotMatch(await detail(p), /Foudre/);
    await p.click('#q');
    await sleep(150);
    assert.equal(await p.evaluate(() => pending), null);
    assert.match(await detail(p), /Foudre/);
    assert.equal(await p.$eval(FIELD, (x) => x.value), `${NOTE} avant après`);
    assert.equal(await p.evaluate(() => window.__DATA['note:m1'].notes), `${NOTE} avant après`);
    await p.close();
  }

  // In the field with nothing typed: no save to redraw the page, the names still come in when I leave it.
  {
    const { p, answer } = await open();
    await openMatch(p);
    await p.focus(FIELD);
    answer();
    await p.waitForFunction(() => !resolving);
    assert.doesNotMatch(await detail(p), /Foudre/);
    await p.click('#q');
    await sleep(150);
    assert.match(await detail(p), /Foudre/);
    await p.close();
  }

  // A match opened from the keyboard: when the names arrive the focus is still on its row, and j goes on from there.
  {
    const { p, answer } = await open();
    await p.focus('.match[data-id="m1"] .match-row');
    await p.keyboard.press('Enter');
    await sleep(200);
    answer();
    await p.waitForFunction(() => !resolving);
    assert.equal(await focusedRow(p), 'm1');
    assert.equal(await p.evaluate(() => document.activeElement.getAttribute('aria-expanded')), 'true');
    assert.match(await detail(p), /Foudre/); // nobody is typing: at once
    await p.keyboard.press('j');
    assert.equal(await focusedRow(p), 'm2');
    await p.close();
  }

  // The metagame arrives while I type: the same. Leaving by the keyboard, the redraw waits for the last field of the
  // match and the focus stays where Tab took it.
  {
    const { p, answer } = await open();
    answer();
    await openMatch(p);
    await p.waitForFunction(() => !resolving);
    await p.evaluate(() => {
      const load = Meta.loadFormat;
      const gate = new Promise((r) => { window.__metaArrives = r; });
      Meta.loadFormat = async (f) => { await gate; return load(f); };
      delete metaData.Modern;
      delete window.__DATA.meta;
      ensureMeta();
    });
    await typeInNote(p);
    await p.evaluate(() => window.__metaArrives());
    await p.waitForFunction(() => !metaBusy);
    await noteKept(p);
    await p.keyboard.press('Tab');
    await sleep(100);
    assert.notEqual(await p.evaluate(() => pending), null);
    assert.equal(await p.evaluate(() => document.activeElement.dataset.note), 'deckId');
    await p.keyboard.press('Tab');
    await sleep(150);
    assert.equal(await p.evaluate(() => pending), null);
    assert.equal(await p.evaluate(() => document.activeElement.parentElement.dataset.key), 'deck:m1');
    await p.close();
  }

  // A live update with the keyboard on a row, in the history then in the matchups: the same row afterwards.
  {
    const { p, answer } = await open();
    answer();
    const liveUpdate = () => p.evaluate(async () => { const m = JSON.parse(JSON.stringify(window.__DATA['match:m-live'])); m.updatedAt = Date.now(); await chrome.storage.local.set({ 'match:m-live': m }); });
    await p.focus('.match[data-id="m2"] .match-row');
    await liveUpdate();
    await sleep(100);
    assert.equal(await focusedRow(p), 'm2');
    await p.click('#tab-matchups');
    await sleep(150);
    await p.focus('#by-opp button.rec[data-key="a:Temur Nadu"]');
    await liveUpdate();
    await sleep(100);
    assert.equal(await p.evaluate(() => document.activeElement.dataset.key), 'a:Temur Nadu');
    await p.close();
  }

  // Saving an edited note redraws the page: not between the press and the release of the click that left the field.
  {
    const { p, answer } = await open();
    answer();
    await openMatch(p);
    await p.waitForFunction(() => !resolving);
    const press = async (sel) => {
      const box = await (await p.$(sel)).boundingBox();
      await p.mouse.move(box.x + 100, box.y + box.height / 2);
      await p.mouse.down();
      await sleep(80); // a human press
      assert.notEqual(await p.evaluate(() => pending), null);
      await p.mouse.up();
      await sleep(300);
      assert.equal(await p.evaluate(() => pending), null); // the redraw held back came after the click
    };
    await typeInNote(p);
    await press('.match[data-id="m-live"] .match-row');
    assert.equal(await p.evaluate(() => openId), 'm-live');
    assert.equal(await p.evaluate(() => window.__DATA['note:m1'].notes), `${NOTE} avant`);
    await openMatch(p);
    await typeInNote(p);
    await press('#summary'); // nothing there to take the focus or redraw the page: only the release applies it
    assert.equal(await p.evaluate(() => window.__DATA['note:m1'].notes), `${NOTE} avant avant`);
    await p.close();
  }

  // An archetype confirmed in the in-game panel while I type a note: both stay. The note is saved as it is typed,
  // before I leave the field (closing the tab then loses nothing).
  {
    const { p, answer } = await open();
    answer();
    await openMatch(p);
    await p.waitForFunction(() => !resolving);
    await typeInNote(p);
    await p.evaluate(() => chrome.storage.local.set({ 'note:m1': { ...window.__DATA['note:m1'], archetype: 'Affinity' } }));
    await sleep(1100);
    const note = () => p.evaluate(() => { const n = window.__DATA['note:m1']; return [n.notes, n.archetype]; });
    assert.deepEqual(await note(), [`${NOTE} avant`, 'Affinity'], 'saved while typing, the archetype kept');
    await p.keyboard.type(' après');
    await p.click('#q');
    await sleep(300);
    assert.deepEqual(await note(), [`${NOTE} avant après`, 'Affinity'], 'saved on leaving the field, the archetype kept');
    await p.close();
  }

  assert.deepEqual(errors, []);
  console.log('qa-redraw: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
