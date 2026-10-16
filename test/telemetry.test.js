// telemetry.js against a fake extension API: what is sent, when, and when nothing is.
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '..', 'telemetry.js'), 'utf8');

async function run({ ua = 'Mozilla/5.0 Chrome/140.0 Safari/537.36', stored = {}, firefoxGranted = true, day = '2026-10-16' } = {}) {
  const store = { ...stored }, sent = [], listeners = {}, uninstall = [];
  const on = (name) => ({ addListener: (f) => { listeners[name] = f; } });
  const chrome = {
    runtime: { getManifest: () => ({ version: '1.5' }), onInstalled: on('installed'), onStartup: on('startup'), setUninstallURL: async (u) => uninstall.push(u) },
    storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) }, onChanged: on('changed') },
  };
  const ctx = {
    chrome, navigator: { userAgent: ua }, crypto: { randomUUID: () => '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b' },
    fetch: async (url, init) => { sent.push({ url, ...JSON.parse(init.body) }); return {}; },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [`${day}T12:00:00Z`])); } },
  };
  ctx.globalThis = ctx;
  if (/Firefox/.test(ua)) ctx.browser = { permissions: { contains: async () => firefoxGranted } };
  vm.runInNewContext(code, ctx);
  await new Promise((r) => setTimeout(r, 10));
  return { store, sent, listeners, uninstall };
}

(async () => {
  // First run: one "active" a day with the random id, and the uninstall page set.
  let r = await run();
  assert.deepEqual(r.sent.map((s) => s.e), ['active']);
  assert.equal(r.sent[0].id, '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b');
  assert.deepEqual({ p: r.sent[0].p, b: r.sent[0].b, v: r.sent[0].v }, { p: 'endstep', b: 'chrome', v: '1.5' });
  assert.equal(r.uninstall[0], 'https://stats.tolarianstudio.com/bye?p=endstep&b=chrome&v=1.5');
  // Same day again: nothing more. Install and update are their own signals, without the id.
  r = await run({ stored: { telemetryDay: '2026-10-16', telemetryId: 'x' } });
  assert.equal(r.sent.length, 0);
  r.listeners.installed({ reason: 'install' });
  r.listeners.installed({ reason: 'update', previousVersion: '1.4' });
  r.listeners.installed({ reason: 'update', previousVersion: '1.5' }); // a reload, not an update
  await new Promise((res) => setTimeout(res, 10));
  assert.deepEqual(r.sent.map((s) => [s.e, s.id]), [['install', undefined], ['update', undefined]]);
  // Switched off: nothing is sent, and the uninstall page is removed.
  r = await run({ stored: { telemetry: false } });
  assert.equal(r.sent.length, 0);
  assert.deepEqual(r.uninstall, ['']);
  // Firefox: only with the technical data permission.
  r = await run({ ua: 'Mozilla/5.0 Gecko/20100101 Firefox/143.0', firefoxGranted: false });
  assert.equal(r.sent.length, 0);
  r = await run({ ua: 'Mozilla/5.0 Gecko/20100101 Firefox/143.0' });
  assert.equal(r.sent[0].b, 'firefox');
  // Edge and Safari are told apart from Chrome.
  assert.equal((await run({ ua: 'Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0' })).sent[0].b, 'edge');
  assert.equal((await run({ ua: 'Mozilla/5.0 (Macintosh) Version/18.4 Safari/605.1.15' })).sent[0].b, 'safari');
  console.log('telemetry ok');
})().catch((e) => { console.error(e); process.exit(1); });
