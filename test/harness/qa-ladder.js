// QA of the ladders of a ranked match on the demo dashboard (run `node gen-demo.js` first): the opponent's score beside
// their name in the history, with its place on hover; both scores in the match detail; nothing for an unranked match.
const assert = require('node:assert/strict');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--host-resolver-rules=MAP * ~NOTFOUND'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`file://${__dirname}/harness-demo.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); localStorage.setItem('endstep-tracker.filters', JSON.stringify({ scope: { format: null, deck: null }, tab: 'history' })); });
  await p.reload();
  await sleep(1200);
  const opp = await p.evaluate(async () => {
    const m1 = JSON.parse(JSON.stringify(window.__DATA['match:m1']));
    const me = m1.players.find((x) => x.seat === m1.mySeat).name;
    const them = m1.players.find((x) => x.seat !== m1.mySeat).name;
    m1.ratings = { [me]: { score: 1343, rank: 431, of: 792, top: 55 }, [them]: { score: 1355, rating: 1467, rank: 427, of: 792, top: 54, provisional: false } };
    await chrome.storage.local.set({ 'match:m1': m1 });
    return them;
  });
  await sleep(300);
  const row = await p.evaluate(() => {
    const r = (id) => document.querySelector(`.match[data-id="${id}"] .rating`);
    const sp = (x) => x.replace(/\s/g, ' '); // French groups digits with a narrow no-break space
    return { m1: r('m1') && [sp(r('m1').textContent), sp(r('m1').title)], m6: !!r('m6') };
  });
  assert.deepEqual(row.m1, ['Cote 1 355', `Cote de ${opp} au début du match : 1 355 · 427e sur 792, top 54 %`]);
  assert.equal(row.m6, false, 'no ladder recorded: nothing');
  await p.evaluate(() => document.querySelector('.match[data-id="m1"] .match-row').click());
  await sleep(300);
  const meta = await p.evaluate(() => document.querySelector('.match[data-id="m1"] .detail-meta').textContent.replace(/\s+/g, ' '));
  assert.match(meta.replace(/\s/g, ' '), new RegExp(`Cote au début du match : moi 1 343, ${opp} 1 355`));
  assert.deepEqual(errors, []);
  console.log('qa-ladder: ok');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
