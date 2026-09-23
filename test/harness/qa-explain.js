// Explain button against a simulated coach server (COACH-GOAL-5 D2): the real server must be stopped first
// (Endstep-coach/bot/coach-server.sh stop). With `explain: true` the flagged decisions of m1 get a button, a click
// stores the text under ana:m1 and shows it; with `explain: false` no button exists.
// Run: node test/harness/qa-explain.js
const http = require('http');
const fs = require('fs');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEXT = 'Texte fixe du serveur simulé : attaquer ici expose ta créature pour rien.';
const analysis = JSON.parse(fs.readFileSync(__dirname + '/analysis-demo.json', 'utf8'));
let explain = true;
const calls = [];
const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/health') { res.writeHead(200, cors); return res.end(JSON.stringify({ ok: true, model: 9214, features: 229, cards: 713, busy: false, depth: true, explain, llm: explain ? 'mock' : null })); }
    if (req.url === '/analyse') { res.writeHead(200, cors); return res.end(JSON.stringify({ model: analysis.model, at: analysis.at, determinizations: 3, depth: 1, games: analysis.matches.m1, summary: { decisions: 4, replayed: 4 } })); }
    if (req.url === '/explain') {
      const b = JSON.parse(body);
      calls.push({ key: b.key, lang: b.lang, mySeat: b.mySeat, myDeck: b.myDeck, oppArchetype: b.oppArchetype, hasBoard: !!(b.decision && b.decision.board), best: b.analysis && b.analysis.best });
      if (!explain) { res.writeHead(404, cors); return res.end(JSON.stringify({ error: 'no key' })); }
      res.writeHead(200, cors); return res.end(JSON.stringify({ text: TEXT, model: 'mock', ms: 1, usage: { input: 1, output: 1 } }));
    }
    res.writeHead(404, cors); res.end('{"error":"nope"}');
  });
});
(async () => {
  const real = await fetch('http://127.0.0.1:8765/health').then((r) => r.ok).catch(() => false);
  if (real) { console.error('the real coach server is up: Endstep-coach/bot/coach-server.sh stop first'); process.exit(1); }
  await new Promise((r) => server.listen(8765, '127.0.0.1', r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.setViewport({ width: 1280, height: 900 });
  const open = async () => {
    await p.goto(`file://${__dirname}/harness-demo.html`);
    await p.evaluate(() => { localStorage.clear(); localStorage.setItem('endstep-tracker.lang', 'fr'); });
    await p.reload();
    await sleep(800);
    await p.evaluate(() => document.querySelector('.match[data-id="m1"] .match-row').click());
    await sleep(400);
    await p.evaluate(() => { const d = document.querySelector('.match[data-id="m1"] details.coach'); if (d) d.open = true; });
  };
  const out = {};
  await open();
  out.buttons = await p.evaluate(() => [...document.querySelectorAll('.match[data-id="m1"] [data-explain]')].map((x) => [x.dataset.game, x.dataset.explain, x.textContent.trim()]));
  out.demoExplanation = await p.evaluate(() => { const r = [...document.querySelectorAll('.match[data-id="m1"] tr.explain p')].map((x) => x.textContent.slice(0, 40)); return r; });
  await p.evaluate(() => document.querySelector('.match[data-id="m1"] [data-explain]').click());
  await sleep(120);
  out.buttonWhile = await p.evaluate(() => { const x = document.querySelector('.match[data-id="m1"] [data-explain]'); return x && [x.textContent.trim(), x.disabled]; });
  for (let i = 0; i < 40 && !(await p.evaluate((t) => [...document.querySelectorAll('.match[data-id="m1"] tr.explain p')].some((x) => x.textContent === t), TEXT)); i++) await sleep(150);
  out.shown = await p.evaluate((t) => [...document.querySelectorAll('.match[data-id="m1"] tr.explain p')].some((x) => x.textContent === t), TEXT);
  out.stored = await p.evaluate((t) => { const a = window.__DATA['ana:m1']; return a && a.games['1'].map((r) => r.explanation && (r.explanation.text === t ? 'mock' : r.explanation.model)); }, TEXT);
  out.calls = calls;
  await p.screenshot({ path: __dirname + '/qa-explain.png', clip: { x: 0, y: 0, width: 1280, height: 900 } });
  explain = false;
  await open();
  out.buttonsWithoutKey = await p.evaluate(() => document.querySelectorAll('.match[data-id="m1"] [data-explain]').length);
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
  server.close();
  process.exit(out.buttons.length >= 1 && out.shown && out.buttonsWithoutKey === 0 && calls.length === 1 && calls[0].hasBoard && !errors.length ? 0 : 1);
})();
