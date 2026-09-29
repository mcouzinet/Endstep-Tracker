// Renders the promo video of Endstep Tracker: 16:9, 1920x1080, 60 fps, 15 s (same method as the Whozic reel).
//
// reel.html is a pure function of time: Chrome captures it frame by frame (nothing is filmed live) and sfx.js
// synthesizes the sound effects offline on the same timeline.
//
// Needs ffmpeg in the PATH and the puppeteer-core + Chrome for Testing that store/promo.js uses.
//   node store/reel/render.js                  → store/reel/out/endstep-tracker-15s.mp4 (about 6 min)
//   node store/reel/render.js stills 2.7 8.43  → out/still-02.70.png …
//   node store/reel/render.js audio            → out/sfx.wav + out/sfx-master.wav
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const puppeteer = require('/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core');
const CHROME = '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files'] });
  const page = await b.newPage();
  page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  page.on('requestfailed', (r) => { console.error('request failed:', r.url()); process.exitCode = 1; });
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`file://${__dirname}/reel.html`);
  await page.evaluate(() => window.__ready);

  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'stills') {
    for (const s of rest) {
      await page.evaluate((t) => window.__render(t), +s);
      await page.screenshot({ path: path.join(OUT, `still-${(+s).toFixed(2).padStart(5, '0')}.png`) });
    }
  } else {
    const FPS = +(process.env.FPS || 60), N = FPS * 15;
    const pcm = Buffer.from(await page.evaluate(() => window.__audio()), 'base64');
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
    h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(48000, 24);
    h.writeUInt32LE(48000 * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
    const wav = path.join(OUT, 'sfx.wav');
    fs.writeFileSync(wav, Buffer.concat([h, pcm]));
    // Static mastering, as for Whozic: fixed gain then an oversampled limiter (one-pass loudnorm pumps).
    const MASTER = `aresample=192000,volume=${process.env.GAIN || '9'}dB,alimiter=limit=0.66:attack=3:release=80:level=false,aresample=48000`;
    if (mode === 'audio') {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-af', MASTER, path.join(OUT, 'sfx-master.wav')]);
    } else {
      const mp4 = path.join(OUT, 'endstep-tracker-15s.mp4');
      // BT.709 tagged end to end: untagged, players guess and dull the gold.
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav,
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-bsf:v', 'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
        '-af', MASTER, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart', '-t', '15', mp4], { stdio: ['pipe', 'inherit', 'inherit'] });
      const t0 = Date.now();
      for (let i = 0; i < N; i++) {
        await page.evaluate((t) => window.__render(t), i / FPS);
        const buf = await page.screenshot({ type: 'png' });
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        if (i % 60 === 0) process.stdout.write(`\r${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
      ff.stdin.end();
      await new Promise((r) => ff.on('close', r));
      console.log(`\n${mp4}`);
    }
  }
  await b.close();
})();
