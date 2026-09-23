// Live-update behaviour: open journal survives a write, edits/selection defer the write, delete/clear apply, import validation.
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`file://${__dirname}/harness-demo.html`);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await sleep(400);
  const out = {};
  const snap = (label) => p.evaluate((l) => ({ l, rows: document.querySelectorAll('.match').length, ids: matches.map((m) => m.id).join(','), pending: !!pending, state: JSON.stringify(state), open: openId, detailRows: document.querySelectorAll('.detail').length }), label).then((r) => console.log(JSON.stringify(r)));
  // 1. open the live match + its journal, then simulate the tracker writing the record
  await p.click('.match[data-id="m-live"] .match-row');
  await sleep(200);
  await p.evaluate(() => { document.querySelector('details[data-key="log:m-live:1"]').open = true; });
  await p.evaluate(async () => { const m = JSON.parse(JSON.stringify(window.__DATA['match:m-live'])); m.updatedAt = Date.now(); m.games[1].turns = 9; await chrome.storage.local.set({ 'match:m-live': m }); });
  await sleep(100);
  out.journalStillOpen = await p.evaluate(() => document.querySelector('details[data-key="log:m-live:1"]').open);
  out.turnsUpdated = await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .game:nth-child(2) .facts-inline').textContent);
  // 2. typing a note defers the write; leaving the field applies it
  await p.click('.match[data-id="m-live"] input[data-note="archetype"]');
  await p.evaluate(async () => { const m = JSON.parse(JSON.stringify(window.__DATA['match:m-live'])); m.games[1].turns = 11; await chrome.storage.local.set({ 'match:m-live': m }); });
  await sleep(100);
  out.deferredWhileTyping = await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .game:nth-child(2) .facts-inline').textContent);
  await p.keyboard.type('Rakdos');
  await p.click('#q');
  await sleep(150);
  out.appliedAfterBlur = await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .game:nth-child(2) .facts-inline').textContent);
  out.noteSaved = await p.evaluate(() => window.__DATA['note:m-live'] && window.__DATA['note:m-live'].archetype);
  // 3. a text selection inside the list defers, collapsing it applies
  await p.evaluate(() => { const el = document.querySelector('.match[data-id="m-live"] .cardlist a.card'); const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await p.evaluate(async () => { const m = JSON.parse(JSON.stringify(window.__DATA['match:m-live'])); m.games[1].turns = 13; await chrome.storage.local.set({ 'match:m-live': m }); });
  await sleep(100);
  out.deferredWhileSelected = await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .game:nth-child(2) .facts-inline').textContent);
  await p.evaluate(() => getSelection().removeAllRanges());
  await sleep(150);
  out.appliedAfterDeselect = await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .game:nth-child(2) .facts-inline').textContent);
  await snap('before delete');
  // 3b. "My deck" picker: the note override shows in the row; clearing it falls back to the tracker's deck; picking another applies
  const deckCell = () => p.evaluate(() => document.querySelector('.match[data-id="m3"] .cell.deck').textContent);
  out.deckOverride = await deckCell();
  await p.evaluate(() => document.querySelector('.match[data-id="m3"] .match-row').click());
  await sleep(300);
  out.deckPickerValue = await p.evaluate(() => document.querySelector('.match[data-id="m3"] select[data-note="deckId"]').value);
  await p.select('.match[data-id="m3"] select[data-note="deckId"]', '');
  await sleep(150);
  out.deckAfterClear = [await deckCell(), await p.evaluate(() => JSON.stringify(window.__DATA['note:m3']))];
  await p.select('.match[data-id="m3"] select[data-note="deckId"]', 'deck-Burn');
  await sleep(150);
  out.deckAfterPick = [await deckCell(), await p.evaluate(() => !!document.querySelector('.match[data-id="m3"] details[data-key="deck:m3"]'))];
  await p.evaluate(() => document.querySelector('.match[data-id="m-live"] .match-row').click()); // back to the live match for step 4
  await sleep(300);
  // 4. deleting a match removes its row
  await p.evaluate(() => { window.confirm = () => true; document.querySelector('.match[data-id="m-live"] [data-delete]').click(); });
  await sleep(150);
  out.rowsAfterDelete = await p.evaluate(() => document.querySelectorAll('.match').length);
  await snap('after delete');
  // 5. malformed records are ignored, not fatal
  out.normalize = await p.evaluate(() => [
    normalizeMatch({ id: 'x', games: [] }) === null,
    normalizeMatch({ id: 'y', startedAt: 1, players: [], games: [{ n: 1 }] }).games[0].mulligans !== undefined,
    normalizeMatch({ id: 'z', startedAt: 1, players: [], games: [null, { n: 'a' }] }).games.length === 0,
  ]);
  await p.evaluate(async () => { await chrome.storage.local.set({ 'match:bad': { id: 'bad' }, 'match:ok': { id: 'ok', startedAt: Date.now() - 1e5, updatedAt: Date.now(), status: 'complete', result: 'W', mySeat: 0, players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'X' }], games: [{ n: 1, winnerSeat: 0 }], score: [1, 0], colors: {} } }); });
  await sleep(150);
  out.rowsAfterBadAndOk = await p.evaluate(() => document.querySelectorAll('.match').length);
  await snap('after bad+ok');
  // 6. clear everything → onboarding
  await p.evaluate(async () => { await chrome.storage.local.remove(Object.keys(window.__DATA).filter((k) => /^(match|note):/.test(k))); });
  await sleep(150);
  out.onboarding = await p.evaluate(() => !!document.querySelector('#matches .empty .steps'));
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
