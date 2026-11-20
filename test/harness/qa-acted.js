// QA, in the real extension, of two rules for players with several tabs or computers. endstep sends a match to every
// open tab of the account (checked on the real site, 2026-10-08): a tab records a match only once it plays in it (it
// sent a game action). A backup imported from another computer is merged: each match keeps its fuller copy.
// The hook's messages are posted from a stub endstep.cc page (answered locally). Run from this folder: node qa-acted.js
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { puppeteer, CHROME } = require('./browser.js');
const EXT = path.resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = 'endstep-tracker';
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const C = 'cccccccc-0000-4000-8000-000000000003';

const now = Date.now();
const player = (id, name, battlefield = []) => ({ id, name, hand: [], battlefield, graveyard: [], exile: [], commandZone: [] });
const state = (seq) => ({ type: 'GAME_STATE', matchId: A, viewerSeat: 0, seq, timestamp: now + seq * 100, payload: {
  turnNumber: '1', status: 'ACTIVE', gameType: 'Constructed', matchScore: { winsBySeat: [0, 0], gameNumber: 1, gamesPlayed: 0, gamesPerMatch: 1 },
  players: [player('0', 'me'), player('1', 'Bartok', [{ id: 9, name: 'Lightning Bolt', ownerId: '1' }])] } });
const started = { type: 'GAME_EVENT', matchId: A, timestamp: now + 150, payload: { type: 'GAME_STARTED', playerIndex: '0', sequenceNumber: 1, message: 'Game started' } };

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endstep-qa-'));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, enableExtensions: [EXT], userDataDir: profile, args: ['--no-first-run', '--lang=fr', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  try {
    const sw = await b.waitForTarget((x) => x.type() === 'service_worker' && x.url().startsWith('chrome-extension://'), { timeout: 10000 });
    const id = new URL(sw.url()).host;
    const ext = await b.newPage();
    await ext.goto(`chrome-extension://${id}/popup.html`);
    await ext.evaluate(() => chrome.storage.local.clear());
    const get = (k) => ext.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);

    const p = await b.newPage();
    await p.setRequestInterception(true);
    p.on('request', (r) => (new URL(r.url()).hostname === 'endstep.cc'
      ? r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>endstep (stub)</title><body></body>' }) : r.continue()));
    await p.goto('https://endstep.cc/history');
    await sleep(600);
    const hook = (kind, data) => p.evaluate((t, k, d) => window.postMessage({ [t]: k, data: d, at: Date.now() }, location.origin), TAG, kind, data);

    // A match this tab only watches (it is played in another tab, or on another computer): followed, not recorded.
    await hook('ws', JSON.stringify(state(1)));
    await hook('ws', JSON.stringify(started));
    await hook('ws', JSON.stringify(state(2)));
    await sleep(1500);
    assert.equal(await get('match:' + A), undefined, 'watched only: nothing recorded');

    // Played here: one game action, and the match is recorded from its start (the frames followed so far are kept).
    await hook('acted', A);
    await sleep(800);
    const rec = await get('match:' + A);
    assert.ok(rec && rec.games.length === 1 && rec.games[0].firstSeat === 0 && rec.players.some((x) => x.name === 'Bartok'), JSON.stringify(rec));

    // The page reloaded (F5) mid-match, and the match ends before my next action: its end is saved all the same.
    await p.reload();
    await sleep(600);
    const over = state(3);
    Object.assign(over.payload, { status: 'COMPLETE', matchScore: { winsBySeat: [1, 0], gameNumber: 1, gamesPlayed: 1, gamesPerMatch: 1, isMatchOver: true } });
    await hook('ws', JSON.stringify(over));
    await sleep(800);
    assert.equal((await get('match:' + A)).status, 'complete', 'reloaded, then over before any action: recorded as over');

    // Another tab watched B while this one played it and saved the main deck of game 2; then the user plays on in the
    // other tab: its first action keeps what this one saved.
    const B = 'bbbbbbbb-0000-4000-8000-000000000002';
    const q = await b.newPage();
    await q.setRequestInterception(true);
    q.on('request', (r) => (new URL(r.url()).hostname === 'endstep.cc'
      ? r.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>endstep (stub)</title><body></body>' }) : r.continue()));
    await q.goto('https://endstep.cc/play');
    await sleep(600);
    const hookQ = (kind, data) => q.evaluate((t, k, d) => window.postMessage({ [t]: k, data: d, at: Date.now() }, location.origin), TAG, kind, data);
    const sB = (seq) => { const s = state(seq); s.matchId = B; return s; };
    await hookQ('ws', JSON.stringify(sB(1)));
    await sleep(300);
    const played = { v: 1, id: B, status: 'active', startedAt: now, updatedAt: now + 500, mySeat: 0, players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'Bartok' }],
      games: [{ n: 1, mulligans: {}, life: {}, seen: {}, log: [] }], score: [], colors: {}, mains: { 2: { 'Lightning Bolt': 4 } } };
    await ext.evaluate((m) => chrome.storage.local.set({ ['match:' + m.id]: m }), played);
    await hookQ('acted', B);
    await sleep(800);
    assert.deepEqual((await get('match:' + B)).mains, { 2: { 'Lightning Bolt': 4 } }, 'the main deck saved by the other tab stays');
    await q.close();

    // A backup from another computer: a half-seen copy of A (it was watching there) and a match only it has (C).
    const ghostA = { v: 1, id: A, status: 'active', startedAt: now + 60000, updatedAt: now + 60000, mySeat: 0, formatId: 'pauper',
      players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'Bartok' }], games: [{ n: 1, mulligans: {}, life: {}, seen: {}, log: [] }], score: [], colors: {} };
    const onlyThere = { ...ghostA, id: C, status: 'complete', result: 'W', score: [2, 0], players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'Wren' }] };
    const file = path.join(profile, 'backup.json');
    fs.writeFileSync(file, JSON.stringify({ version: 1, matches: [ghostA, onlyThere], notes: { [A]: { archetype: 'Burn', notes: 'from there' } } }));
    await ext.evaluate((a) => chrome.storage.local.set({ ['note:' + a]: { notes: 'typed here' } }), A);
    const d = await b.newPage();
    await d.goto(`chrome-extension://${id}/dashboard.html`);
    await sleep(800);
    const input = await d.$('#import');
    await input.uploadFile(file);
    await sleep(1200);
    const merged = await get('match:' + A);
    assert.equal(merged.games[0].firstSeat, 0, 'the fuller copy (recorded here) stays');
    assert.equal(merged.formatId, 'pauper', 'completed with what the other knew');
    assert.ok(await get('match:' + C), 'a match only the backup has is added');
    assert.deepEqual(await get('note:' + A), { archetype: 'Burn', notes: 'typed here' }, 'notes: what is typed here stays, the backup fills the rest');

    console.log('qa-acted: ok');
  } finally {
    await b.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => { console.error(e); process.exit(1); });
