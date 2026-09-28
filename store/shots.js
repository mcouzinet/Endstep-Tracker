// Store screenshots, 1280x800 viewport, from the dashboard QA harness demo data (node test/harness/gen-demo.js first).
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const H = `${__dirname}/../test/harness`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The QA demo holds a handful of matches, too few for the summary to show a rate. For the screenshots only, 24 more
// synthetic Modern matches with Burn over three weeks (made-up opponents, real metagame archetypes), then a reload.
async function enrich() {
  const base = window.__DATA['match:m1'];
  const opps = ['Vexxa', 'Morrow_42', 'pikachu_mtg', 'Liliana_fan', 'Grimsby', 'Tomek', 'Ouzo', 'Salt_Lord', 'Nimbus', 'Haldor', 'Kestrel', 'Brume',
    'Quillon', 'Zephyr77', 'Ravenna', 'Otto_B', 'Maelle', 'Jaspar', 'Wren', 'Corvid', 'Delphine', 'Bartok', 'Sable', 'Ivo'];
  const archs = ['Boros Energy', 'Dimir Murktide', 'Amulet Titan', 'Eldrazi Tron', 'Boros Energy', 'Living End', 'Jeskai Control', 'Dimir Murktide',
    'Ruby Storm', 'Boros Energy', 'Amulet Titan', 'Eldrazi Tron', 'Golgari Yawgmoth', 'Boros Energy', 'Dimir Murktide', 'Living End',
    'Jeskai Control', 'Amulet Titan', 'Boros Energy', 'Eldrazi Tron', 'Mono-Red Prowess', 'Dimir Murktide', 'Boros Energy', 'Goryo Reanimator'];
  const lost = new Set([2, 5, 9, 13, 14, 19, 22]);
  const colors = { 'Boros Energy': 'RW', 'Dimir Murktide': 'UB', 'Amulet Titan': 'G', 'Eldrazi Tron': '', 'Living End': 'BRG', 'Jeskai Control': 'URW',
    'Ruby Storm': 'R', 'Golgari Yawgmoth': 'BG', 'Mono-Red Prowess': 'R', 'Goryo Reanimator': 'WB' };
  const game = (n, first, winner) => Object.assign(JSON.parse(JSON.stringify(base.games[(n - 1) % base.games.length])), {
    n, firstSeat: first, winnerSeat: winner, outcome: true, life: winner === 0 ? { 0: 6 + 3 * n, 1: 0 } : { 0: 0, 1: 11 - n },
    mulligans: { 0: n === 2 && winner ? 1 : 0, 1: 0 } });
  opps.forEach((opp, i) => {
    const won = !lost.has(i);
    const first = i % 3 === 1 ? 1 : 0;
    const threeGames = i % 4 === 0;
    const games = won ? (threeGames ? [game(1, first, 0), game(2, 1 - first, 1), game(3, first, 0)] : [game(1, first, 0), game(2, 1, 0)])
      : (threeGames ? [game(1, first, 1), game(2, 0, 0), game(3, 1, 1)] : [game(1, first, 1), game(2, 0, 1)]);
    const at = Date.now() - (22 - i * 0.85) * 864e5;
    const m = Object.assign(JSON.parse(JSON.stringify(base)), { id: 's' + i, startedAt: at, updatedAt: at + 38 * 60e3, endedAt: at + 38 * 60e3,
      status: 'complete', result: won ? 'W' : 'L', winnerSeat: won ? 0 : 1, score: [games.filter((g) => g.winnerSeat === 0).length, games.filter((g) => g.winnerSeat === 1).length], games });
    m.players = [{ seat: 0, name: 'guest_rZ8gWdWE' }, { seat: 1, name: opp }];
    m.colors = { 1: colors[archs[i]] };
    m.participants = m.players.map((pl) => ({ userId: 'u' + pl.seat, username: pl.name, isBot: false }));
    window.__DATA['match:s' + i] = m;
    window.__DATA['note:s' + i] = { archetype: archs[i] };
  });
  await load();
}

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const open = async (lang, prefs) => {
    const p = await b.newPage();
    // Same as the store build: no coach.js, no model (release.sh leaves them out); page errors would mean the dashboard needs them.
    await p.setRequestInterception(true);
    p.on('request', (r) => (/coach(-model\.json|\.js)$/.test(r.url()) ? r.abort() : r.continue()));
    p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
    await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await p.goto(`file://${H}/harness-demo.html`);
    await p.evaluate((prefs) => { localStorage.clear(); if (prefs) localStorage.setItem('endstep-tracker.filters', JSON.stringify(prefs)); }, prefs || null);
    await p.reload();
    await sleep(500);
    await p.select('#lang', lang); // reloads the page, and with it the demo data
    await sleep(1500);
    await p.evaluate(enrich);
    await sleep(2500); // let the stubbed metagame load so no toast is up
    return p;
  };
  const shot = async (p, name) => {
    await p.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await p.screenshot({ path: `${__dirname}/${name}` });
  };
  const BURN = { scope: { format: 'Modern', deck: 'Burn' } }; // the deck the synthetic matches are played with
  let p = await open('en', BURN);
  await shot(p, '1-dashboard-en.png');
  await p.click('.match[data-id="s21"] .match-row');
  await sleep(400);
  await p.evaluate(() => document.querySelector('.match[data-id="s21"]').scrollIntoView({ block: 'start' }));
  await sleep(300);
  await shot(p, '2-match-detail.png');
  p = await open('fr', BURN);
  await shot(p, '3-dashboard-fr.png');
  await b.close();
})();
