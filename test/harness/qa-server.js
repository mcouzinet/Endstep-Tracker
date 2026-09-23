// Analyse in place through the local coach server (Endstep-coach/bot/coach-server.sh start): the demo dashboard must
// show the button on m1, the click must store ana:m1 and the Coach block must gain its two columns.
// Run: node test/harness/qa-server.js   (fails fast if the server is down)
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const health = await fetch('http://127.0.0.1:8765/health').then((r) => r.json()).catch(() => null);
  if (!health || !health.ok) { console.error('coach server down: Endstep-coach/bot/coach-server.sh start'); process.exit(1); }
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.setViewport({ width: 1280, height: 900 });
  await p.goto(`file://${__dirname}/harness-demo.html`);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); });
  await p.reload();
  await sleep(800);
  const out = { health };
  await p.evaluate(async () => { await chrome.storage.local.remove(['ana:m1']); });
  await sleep(200);
  await p.evaluate(() => document.querySelector('.match[data-id="m1"] .match-row').click());
  await sleep(400);
  out.serverSeen = await p.evaluate(() => !!coachServer);
  out.buttonBefore = await p.evaluate(() => { const b = document.querySelector('.match[data-id="m1"] [data-analyse]'); return b && b.textContent.trim(); });
  out.columnsBefore = await p.evaluate(() => document.querySelectorAll('.match[data-id="m1"] .coach thead th').length);
  await p.evaluate(() => document.querySelector('.match[data-id="m1"] [data-analyse]').click());
  await sleep(150);
  out.buttonWhile = await p.evaluate(() => { const b = document.querySelector('.match[data-id="m1"] [data-analyse]'); return b && [b.textContent.trim(), b.disabled]; });
  for (let i = 0; i < 60 && !(await p.evaluate(() => !!window.__DATA['ana:m1'])); i++) await sleep(250);
  await sleep(300);
  out.stored = await p.evaluate(() => { const a = window.__DATA['ana:m1']; return a && { model: a.model, games: Object.keys(a.games), rows: a.games['1'].length, best: a.games['1'].map((r) => r.best || r.skipped) }; });
  out.columnsAfter = await p.evaluate(() => document.querySelectorAll('.match[data-id="m1"] .coach thead th').length);
  out.bestCells = await p.evaluate(() => [...document.querySelectorAll('.match[data-id="m1"] .coach tbody tr')].map((tr) => tr.children[5] && tr.children[5].textContent.trim()));
  out.buttonAfter = await p.evaluate(() => { const b = document.querySelector('.match[data-id="m1"] [data-analyse]'); return b && [b.textContent.trim(), b.disabled]; });
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  process.exit(out.stored && out.columnsAfter === 7 && !errors.length ? 0 : 1);
})();
