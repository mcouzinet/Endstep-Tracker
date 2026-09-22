// One-off E2E check: real extension in Chrome for Testing, guest quick-play vs Forge AI, then inspect storage + dashboard.
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const EXT = '/Users/mickaelcouzinet/Developer/Endstep-tracker';
const OUT = __dirname;
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const HEADLESS = process.env.HEADFUL ? false : true;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: HEADLESS, enableExtensions: [EXT], userDataDir: OUT + '/e2e-profile',
    args: ['--no-first-run', '--window-size=1280,900'], defaultViewport: { width: 1280, height: 900 },
  });
  try {
    await sleep(1500);
    const sw = browser.targets().find((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'));
    console.log('targets:', browser.targets().map((t) => t.type() + ' ' + t.url()).join(' | '));
    const ext = sw && { id: new URL(sw.url()).host };
    console.log('extension loaded:', !!ext, ext && ext.id);

    const page = await browser.newPage();
    page.on('console', (m) => { if (/endstep-tracker|Uncaught|Error/i.test(m.text())) console.log('[page]', m.text().slice(0, 300)); });
    await page.goto('https://endstep.cc/', { waitUntil: 'networkidle2' });
    console.log('title:', await page.title());
    await page.locator('::-p-text(Continue as Guest)').setTimeout(15000).click();
    await sleep(4000);

    const setup = await page.evaluate(async () => {
      const j = async (url, init) => { const r = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...init }); return { status: r.status, body: await r.json().catch(() => null) }; };
      const cards = [['Lightning Bolt', 4], ['Monastery Swiftspear', 4], ['Goblin Guide', 4], ['Lava Spike', 4], ['Rift Bolt', 4], ['Chain Lightning', 4], ['Skullcrack', 4], ['Searing Blaze', 4], ['Eidolon of the Great Revel', 4], ['Light Up the Stage', 4], ['Mountain', 20]].map(([name, quantity]) => ({ name, quantity }));
      const deck = await j('/api/decks', { method: 'POST', body: JSON.stringify({ name: 'E2E Burn', format: 'constructed', cards, sideboard: [] }) });
      await j('/api/decks');
      const qp = await j('/api/matches/quick-play', { method: 'POST', body: JSON.stringify({ deckId: deck.body && deck.body.id, gamesPerMatch: 1 }) });
      return { deck, qp };
    });
    console.log('setup:', JSON.stringify(setup).slice(0, 600));
    const matchId = setup.qp.body && (setup.qp.body.matchId || setup.qp.body.id);
    if (!matchId) throw new Error('no match id');

    await page.goto('https://endstep.cc/game/' + matchId, { waitUntil: 'networkidle2' });
    await sleep(3000);
    await page.screenshot({ path: OUT + '/e2e-start.png' });
    // Answer decisions (play/draw, keep) and pass priority so the AI plays a few turns.
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      await sleep(1500);
      const did = await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, [role=button], div, span')];
        const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
        const hit = els.find((el) => /^(Play first|Keep 7|Keep \d)$/.test(own(el)));
        if (hit) { (hit.closest('button,[role=button]') || hit).click(); return own(hit); }
        const pass = [...document.querySelectorAll('button, [role=button]')].find((x) => /pass priorit/i.test(x.textContent || ''));
        if (pass) { pass.click(); return 'pass'; }
        return null;
      });
      if (did && did !== 'pass') console.log('clicked', did);
    }
    await page.screenshot({ path: OUT + '/e2e-game.png' });
    const clickBtn = (re) => page.evaluate((src) => {
      const b = [...document.querySelectorAll('button')].filter((x) => new RegExp(src, 'i').test(x.getAttribute('aria-label') || x.textContent));
      if (b.length) b[b.length - 1].click();
      return b.length;
    }, re);
    console.log('menu', await clickBtn('^Board menu$'));
    await sleep(800);
    console.log('concede item', await clickBtn('^Concede( match)?$'));
    await sleep(800);
    console.log('confirm', await clickBtn('^Concede( match| game)?$'));
    await sleep(6000);
    await page.screenshot({ path: OUT + '/e2e-end.png' });

    const dash = await browser.newPage();
    await dash.goto(`chrome-extension://${ext.id}/dashboard.html`);
    await sleep(1000);
    // A Modern match with a recognizable opponent: exercises the real metagame API through the host permission.
    await dash.evaluate(() => chrome.storage.local.set({ 'match:qa-modern': { v: 1, id: 'qa-modern', status: 'complete', result: 'L', startedAt: Date.now() - 36e5, updatedAt: Date.now() - 30e5, endedAt: Date.now() - 30e5,
      format: 'constructed', formatId: 'Modern', ranked: true, gamesPerMatch: 3, mySeat: 0, score: [0, 2], colors: { 1: 'UR' },
      players: [{ seat: 0, name: 'me' }, { seat: 1, name: 'ProwessPlayer' }],
      games: [{ n: 1, firstSeat: 1, mulligans: { 0: 0, 1: 0 }, winnerSeat: 1, turns: 5, life: {}, log: [], seen: { 1: { 'Cori-Steel Cutter': [1], 'Mutagenic Growth': [2], 'Island': [3], 'Lightning Bolt': [4] } } }] } }));
    let guess = null;
    for (let i = 0; i < 90 && !guess; i++) { await sleep(1000); guess = await dash.evaluate(() => { const t = document.querySelector('.match[data-id="qa-modern"] .tag.guess'); return t && { name: t.textContent, title: t.title }; }); }
    console.log('recognized:', JSON.stringify(guess));
    console.log('decisions recorded:', JSON.stringify(await dash.evaluate(async () => { const d = (await chrome.storage.local.get('dec:' + location.hash.slice(1))); const all = await chrome.storage.local.get(null); const k = Object.keys(all).find((x) => x.startsWith('dec:') && !x.includes('qa-modern')); const v = k && all[k]; return k && { key: k, games: Object.keys(v), n: Object.values(v).reduce((s, a) => s + a.length, 0), sample: Object.values(v)[0] && Object.values(v)[0].slice(0, 3).map((x) => `T${x.turn} ${x.phase} ${x.prompt && x.prompt.type} -> ${x.answer.type} ${x.answer.cardId || x.answer.keepHand || ''}`) }; })));
    console.log('meta cache:', JSON.stringify(await dash.evaluate(async () => { const m = (await chrome.storage.local.get('meta')).meta; return m && { formats: m.formats, loaded: Object.fromEntries(Object.entries(m.byFormat).map(([k, v]) => [k, v.decks.length])) }; })));
    const data = await dash.evaluate(() => chrome.storage.local.get(null));
    const rec = data['match:' + matchId];
    console.log('storage keys:', Object.keys(data));
    console.log('record:', JSON.stringify(rec && {
      status: rec.status, result: rec.result, mySeat: rec.mySeat, players: rec.players, format: rec.format, formatId: rec.formatId,
      myDeck: rec.myDeck && { id: rec.myDeck.id, name: rec.myDeck.name, cards: !!rec.myDeck.cards }, colors: rec.colors, score: rec.score,
      games: rec.games.map((g) => ({ n: g.n, firstSeat: g.firstSeat, tossSeat: g.tossSeat, mulligans: g.mulligans, winnerSeat: g.winnerSeat, endReason: g.endReason, turns: g.turns, life: g.life, openingHand: g.openingHand, seen: g.seen, log: g.log.map((l) => `T${l[0]} s${l[1]} ${l[2]} ${l[3] || ''} | ${l[4]}`), plays: g.log.filter((l) => l[2] === 'SPELL_CAST' || l[2] === 'LAND_PLAYED').map((l) => `T${l[0]} s${l[1]} ${l[3]}`) })),
    }, null, 1));
    await dash.screenshot({ path: OUT + '/e2e-dashboard.png', fullPage: true });
    console.log('dashboard check:', JSON.stringify(await dash.evaluate(() => ({
      icon: document.querySelector('.brand img').naturalWidth,
      rows: document.querySelectorAll('.match-row').length,
      summary: document.getElementById('summary').textContent,
      lang: document.documentElement.lang, navLang: navigator.language,
      dataBtn: document.getElementById('data-btn').textContent.trim(),
    }))));
    console.log('manifest:', JSON.stringify(await dash.evaluate(() => ({ desc: chrome.runtime.getManifest().description, title: chrome.i18n.getMessage('action_title'), ui: chrome.i18n.getUILanguage() }))));
    await dash.click('.match-row');
    await sleep(500);
    await dash.screenshot({ path: OUT + '/e2e-dashboard-detail.png', fullPage: true });
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('E2E FAILED:', e); process.exit(1); });
