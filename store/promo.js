// Store promo images: small tile 440x280, marquee 1400x560, store icon 128 (96 px art on a transparent canvas).
const fs = require('fs');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(`${__dirname}/../icons/icon.svg`).toString('base64');
const shot = 'data:image/png;base64,' + fs.readFileSync(`${__dirname}/1-dashboard-en.png`).toString('base64');
const css = `
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body { font-family: -apple-system, "Inter", "Segoe UI", sans-serif; color: #efe7d7; background: #0c0a08; overflow: hidden; -webkit-font-smoothing: antialiased; }
  .bg { position: absolute; inset: 0; background: radial-gradient(120% 90% at 0% 0%, rgb(212 174 98 / .16), transparent 55%), linear-gradient(180deg, #14110d, #0c0a08); }
  .tile { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 14px; padding: 24px; }
  .tile img { width: 104px; height: 104px; }
  .tile h1 { font-size: 30px; font-weight: 700; letter-spacing: -.01em; }
  .tile p { font-size: 15px; color: #bfb29a; }
  .marquee { position: relative; height: 100%; display: flex; align-items: center; padding: 0 0 0 84px; }
  .copy { width: 520px; flex: none; }
  .copy img { width: 88px; height: 88px; margin-bottom: 26px; }
  .copy h1 { font-size: 54px; font-weight: 700; letter-spacing: -.02em; line-height: 1.05; margin-bottom: 16px; }
  .copy p { font-size: 22px; color: #bfb29a; line-height: 1.35; margin-bottom: 26px; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; }
  .pills span { font-size: 14px; color: #ecca86; border: 1px solid rgb(212 174 98 / .45); border-radius: 999px; padding: 6px 12px; }
  .screen { position: absolute; left: 640px; top: 72px; width: 900px; border-radius: 12px; overflow: hidden; border: 1px solid #43392c; box-shadow: 0 30px 60px -20px rgb(0 0 0 / .8), 0 4px 12px rgb(0 0 0 / .5); }
  .screen img { display: block; width: 100%; }
  .icon { display: grid; place-items: center; height: 100%; background: transparent; }
  .icon img { width: 96px; height: 96px; }
`;
const pages = {
  'promo-440x280.png': { w: 440, h: 280, html: `<div class="bg"></div><div class="tile"><img src="${icon}"><h1>Endstep Tracker</h1><p>Your endstep.cc matches, recorded automatically.</p></div>` },
  'marquee-1400x560.png': { w: 1400, h: 560, html: `<div class="bg"></div><div class="marquee"><div class="copy"><img src="${icon}"><h1>Endstep Tracker</h1><p>Every match you play on endstep.cc, recorded automatically and kept on your computer.</p><div class="pills"><span>Play / draw &amp; mulligans</span><span>Opponent cards seen</span><span>Archetype recognition</span><span>Win rates by deck</span></div></div><div class="screen"><img src="${shot}"></div></div>` },
  'icon-128.png': { w: 128, h: 128, html: `<div class="icon"><img src="${icon}"></div>`, transparent: true },
};
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const [name, t] of Object.entries(pages)) {
    const p = await b.newPage();
    await p.setViewport({ width: t.w, height: t.h, deviceScaleFactor: 1 });
    await p.setContent(`<!doctype html><html><head><style>${css}${t.transparent ? 'body{background:transparent}' : ''}</style></head><body>${t.html}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${__dirname}/${name}`, omitBackground: !!t.transparent });
    console.log(name);
  }
  await b.close();
})();
