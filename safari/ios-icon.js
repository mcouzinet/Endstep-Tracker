// iOS app icon: the tile of icons/icon.svg edge to edge on an opaque 1024 px square (iOS rounds the corners itself and
// refuses transparency). Usage: node ios-icon.js <icon.svg> <out.png>
const fs = require('fs');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const [svgPath, out] = process.argv.slice(2);
const svg = fs.readFileSync(svgPath, 'utf8')
  .replace('viewBox="0 0 128 128"', 'viewBox="4 4 120 120" width="1024" height="1024"') // the tile only
  .replace(/<rect x="4" y="4" width="120" height="120" rx="28"/, '<rect x="4" y="4" width="120" height="120"') // square: iOS masks it
  .replace(/<rect x="5\.5"[^>]*\/>/, ''); // no border: iOS draws none
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1024, height: 1024 });
  await p.setContent(`<style>html,body{margin:0;background:#0e0a07}svg{display:block}</style>${svg}`);
  fs.writeFileSync(out, await p.screenshot({ type: 'png', omitBackground: false }));
  await b.close();
})();
