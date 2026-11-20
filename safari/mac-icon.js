// macOS app icon on Apple's grid: the tile, 824 px with ~185 px corners, centred on a transparent 1024 canvas, with a soft
// shadow. Usage: node mac-icon.js <icon.svg> <tile x in the svg's 128 viewBox> <tile size> <out.png>
const fs = require('fs');
const { puppeteer, CHROME } = require('../test/harness/browser.js');
const [svgPath, tileX, tileSize, out] = process.argv.slice(2);
const s = 824 / Number(tileSize); // svg units -> px, so the tile is 824 px
const size = 128 * s;
const at = 100 - Number(tileX) * s;
const svg = fs.readFileSync(svgPath, 'utf8').replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\s(width|height)="[^"]*"/g, '')} width="${size}" height="${size}">`);
(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1024, height: 1024 });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{position:absolute;left:${at}px;top:${at}px;filter:drop-shadow(0 10px 12px rgb(0 0 0 / .35))}</style>${svg}`);
  await p.screenshot({ path: out, omitBackground: true });
  await b.close();
})();
