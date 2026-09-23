// Extension installed/reloaded while an Endstep tab is already open: background.js (onInstalled) must inject hook.js,
// tracker.js and content.js into that tab. Chrome for Testing starts with no extension, opens endstep.cc, then
// installs the extension; a fake GAME_STATE frame posted from the page (as hook.js would) must land in chrome.storage.
// hook.js's replay to a re-injected content.js is covered by test/hook.test.js. Run: node test/harness/e2e-reload.js
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const EXT = '/Users/mickaelcouzinet/Developer/Endstep-tracker';
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAG = 'endstep-tracker';

const frame = (matchId, seq) => ({
  type: 'GAME_STATE', matchId, viewerSeat: 0, seq, timestamp: Date.now(), protocolVersion: 1,
  payload: {
    gameId: 'g-' + matchId, phase: 'MAIN1', turnNumber: '1', activePlayerId: '0', status: 'ACTIVE', gameType: 'Constructed',
    matchScore: { winsBySeat: [0, 0], player0Wins: 0, player1Wins: 0, gameNumber: 1, gamesPlayed: 0, gamesPerMatch: 1, isMatchOver: false },
    players: [
      { id: '0', name: 'e2e-me', life: 20, hand: [], battlefield: [], graveyard: [], exile: [] },
      { id: '1', name: 'Forge AI', life: 20, hand: [], battlefield: [], graveyard: [], exile: [] },
    ],
  },
});

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, enableExtensions: true, userDataDir: __dirname + '/e2e-profile',
    args: ['--no-first-run', '--window-size=1280,900'], defaultViewport: { width: 1280, height: 900 },
  });
  const out = {};
  try {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', (m) => { if (/endstep-tracker/.test(m.text())) logs.push(m.text().slice(0, 160)); });
    await page.goto('https://endstep.cc/', { waitUntil: 'networkidle2' });
    await sleep(1000);
    out.hookBeforeInstall = await page.evaluate(() => window.__endstepTrackerHook === true);

    // Install (same onInstalled handler as ↻ / update) with the tab open.
    const extId = await browser.installExtension(EXT);
    await sleep(3000);
    out.hookInjected = await page.evaluate(() => window.__endstepTrackerHook === true);

    const post = (id, seq) => page.evaluate((msg) => window.postMessage(msg, location.origin), { [TAG]: 'ws', data: JSON.stringify(frame(id, seq)), at: Date.now() });
    await post('e2e-reload-1', 1);
    await sleep(1500);
    const dash = await browser.newPage();
    await dash.goto(`chrome-extension://${extId}/dashboard.html`);
    await sleep(300);
    const all = await dash.evaluate(() => chrome.storage.local.get(null));
    out.storedAfterInstall = !!all['match:e2e-reload-1'];
    out.recordedPlayers = all['match:e2e-reload-1'] && all['match:e2e-reload-1'].players.map((p) => p.name);
    out.logs = logs;
    await dash.evaluate(() => chrome.storage.local.remove(['match:e2e-reload-1', 'dec:e2e-reload-1']));
  } catch (e) {
    out.error = String(e);
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
