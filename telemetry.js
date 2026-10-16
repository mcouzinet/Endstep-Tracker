// Anonymous usage statistics, so the author knows how many people use the extension (see the privacy policy).
// Sent to stats.tolarianstudio.com, the author's own server, and nowhere else:
//   - "install" and "update" (with the version and the browser's name), nothing else;
//   - "active", at most once a day, with a random id drawn at install time (it identifies nothing but this
//     install, and only serves to count each device once);
//   - on uninstall, the browser opens a short page on that server, which counts the uninstall.
// Never sent: decks, matches, names, pages visited, or anything typed. The server keeps no IP address.
// Off when the setting `telemetry` is false, and on Firefox unless the technical data permission is granted.
(() => {
  const STATS = 'https://stats.tolarianstudio.com';
  const PROJECT = 'endstep';
  const VERSION = chrome.runtime.getManifest().version;
  const ua = navigator.userAgent;
  const NAV = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox'
    : /Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua) ? 'safari' : 'chrome';

  async function allowed() {
    const { telemetry } = await chrome.storage.local.get('telemetry');
    if (telemetry === false) return false;
    if (NAV !== 'firefox') return true;
    // Firefox asks at install time (data_collection_permissions, optional "technicalAndInteraction").
    try { return await globalThis.browser.permissions.contains({ data_collection: ['technicalAndInteraction'] }); } catch { return false; }
  }

  async function send(e, extra) {
    if (!(await allowed())) return;
    // text/plain body: a simple request, no preflight, and no host permission needed.
    try { await fetch(`${STATS}/e`, { method: 'POST', body: JSON.stringify({ p: PROJECT, e, b: NAV, v: VERSION, ...extra }) }); } catch { /* offline: try again tomorrow */ }
  }

  async function installId() {
    let { telemetryId } = await chrome.storage.local.get('telemetryId');
    if (!telemetryId) { telemetryId = crypto.randomUUID(); await chrome.storage.local.set({ telemetryId }); }
    return telemetryId;
  }

  // One check at a time: two at once would both read yesterday's date and send the day twice.
  let checking = null;
  function daily() {
    return checking || (checking = (async () => {
      const day = new Date().toISOString().slice(0, 10);
      const { telemetryDay } = await chrome.storage.local.get('telemetryDay');
      if (telemetryDay === day || !(await allowed())) return;
      await chrome.storage.local.set({ telemetryDay: day });
      await send('active', { id: await installId() });
    })().finally(() => { checking = null; }));
  }

  async function uninstallUrl() {
    if (!chrome.runtime.setUninstallURL) return; // not in every Safari version
    const url = (await allowed()) ? `${STATS}/bye?p=${PROJECT}&b=${NAV}&v=${VERSION}` : '';
    try { await chrome.runtime.setUninstallURL(url); } catch { /* unsupported */ }
  }

  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason === 'install') send('install');
    else if (reason === 'update' && previousVersion !== VERSION) send('update');
  });
  // No onStartup listener: the worker loads at every browser start, and the call below runs then.
  // Switched on or off in the dashboard, or Firefox's data permission granted or taken back: applied at once.
  const refresh = () => { uninstallUrl(); daily(); };
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && 'telemetry' in changes) refresh(); });
  chrome.permissions?.onAdded?.addListener(refresh);
  chrome.permissions?.onRemoved?.addListener(refresh);
  daily();
  uninstallUrl();
})();
