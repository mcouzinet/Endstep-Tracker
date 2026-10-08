// Isolated-world bridge: receives frames from hook.js, runs the tracker, persists match records.
(() => {
  const T = self.EndstepTracker;
  const S = self.EndstepShared;
  const TAG = 'endstep-tracker';
  const store = new Map(); // matchId -> { rec, rt, dec }
  const looked = new Set(); // matchIds already looked up in storage
  const ignored = new Set(); // matchIds the user deleted from the dashboard while this page was open
  // Matches this tab plays (it sent a game action). endstep sends a match to every open tab of the account, on every
  // computer: a tab that only watches it, another tab or a computer left open, records nothing (it would write a
  // half-seen copy over the real one). Frames are followed all the same, and saved from the first action on.
  const acted = new Set();
  const timers = new Map();
  const ctx = { meta: {}, lobby: null, lastDeck: null, decks: {} };
  let live = false;
  const HISTORY_PAGE_MS = 1000; // between two pages of my history while importing it: far below the site's 300 requests a minute
  let nextPage = null;

  let chain = chrome.storage.local.get(['lastDeck', 'decks']).then((s) => {
    ctx.lastDeck = s.lastDeck || null;
    ctx.decks = s.decks || {};
  });

  // After an extension reload this copy is orphaned: every chrome.* call throws "Extension context invalidated"
  // and background.js has injected a fresh copy that took over. Go quiet instead of erroring on every frame.
  const orphaned = () => !(chrome.runtime && chrome.runtime.id);
  const onWindowMessage = (e) => {
    if (orphaned()) { window.removeEventListener('message', onWindowMessage); return; }
    if (e.source !== window || !e.data || typeof e.data !== 'object' || !e.data[TAG]) return;
    const { data } = e.data;
    const kind = e.data[TAG];
    const at = typeof e.data.at === 'number' ? e.data.at : Date.now(); // hook.js time: the same for a frame and its replay
    chain = chain.then(() => onMessage(kind, data, at)).catch((err) => { if (!orphaned()) console.warn('[endstep-tracker]', err); });
  };
  window.addEventListener('message', onWindowMessage);

  async function onMessage(kind, data, at) {
    if (kind === 'ws') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      for (const f of T.frames(msg)) await onFrame(f);
    } else if (kind === 'out') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      const a = msg.payload;
      if (!a || ignored.has(a.matchId)) return;
      acted.add(a.matchId);
      const side = T.onSideboard(store, a, at);
      if (side) save(side, true);
      // dev-only { the decision journal
      const entry = T.onAction(store, a, at);
      if (entry) save(entry);
      // } dev-only
    } else if (kind === 'deck') {
      ctx.lastDeck = { id: data, at };
      chrome.storage.local.set({ lastDeck: ctx.lastDeck });
    } else if (kind === 'decks') {
      for (const d of data) ctx.decks[d.id] = Object.assign(ctx.decks[d.id] || {}, d);
      chrome.storage.local.set({ decks: ctx.decks });
      // Deck details usually load after the match record guessed its deck: fill in what was missing.
      for (const entry of store.values()) {
        const mine = entry.rec.myDeck;
        const d = mine && ctx.decks[mine.id];
        if (!d) continue;
        let changed = false;
        if (!mine.name && d.name) { mine.name = d.name; changed = true; }
        if (!mine.cards && d.cards) { mine.cards = d.cards; mine.sideboard = d.sideboard || null; changed = true; }
        if (changed && acted.has(entry.rec.id)) save(entry);
      }
    } else if (kind === 'history') {
      // A page of the site's match history, only while I asked to import it (the dashboard's "Import my past matches"):
      // the matches never recorded here (played before the extension, or in another browser) are added. One already
      // here (under its history id, or recorded by the tracker under another), or deleted from the dashboard while this
      // page is open, is left. Then the next page, one a second, to the last one or until I stop; the count and how far
      // it got show in the in-page panel.
      const { historyImport: on, deletedMatches } = await chrome.storage.local.get(['historyImport', 'deletedMatches']);
      if (!S.importing(on)) return;
      const recs = data.rows.map((row) => T.fromHistory(row, ctx.decks)).filter(Boolean);
      const all = Object.entries(await S.loadStore()).filter(([k]) => k.startsWith('match:')).map(([, v]) => S.normalizeMatch(v)).filter(Boolean);
      // Matches I deleted from the dashboard stay deleted: by their id, or as the twin of a recorded one.
      const gone = Object.entries(S.obj(deletedMatches)).map(([id, f]) => S.normalizeMatch({ ...S.obj(f), id, games: [] })).filter(Boolean);
      const known = new Set([...all, ...gone].map((m) => m.id));
      const fresh = recs.filter((r) => !known.has(r.id) && !store.has(r.id) && !ignored.has(r.id));
      const pairs = S.historyPairs([...all, ...gone.filter((g) => g.source !== 'history'), ...fresh]);
      const twins = new Set(pairs.map((p) => p.h));
      const add = fresh.filter((r) => !twins.has(r.id));
      // A recorded twin the tracker caught only in part gets what the history knows: format, deck, ranked, result.
      const byId = new Map([...all, ...fresh].map((m) => [m.id, m]));
      const completed = pairs.map((p) => [byId.get(p.m), byId.get(p.h)])
        .filter(([m, h]) => m && h && m.source !== 'history' && !store.has(m.id) && S.fillFromHistory(m, h).length).map(([m]) => m);
      if (orphaned()) return;
      await chrome.storage.local.set({ ...Object.fromEntries([...add, ...completed].map((r) => ['match:' + r.id, r])),
        historyImport: { until: Date.now() + S.HISTORY_IMPORT_MS, read: (on.read || 0) + recs.length, added: (on.added || 0) + add.length,
          completed: (on.completed || 0) + completed.length, done: !data.next, failed: !!data.failed } });
      clearTimeout(nextPage); // the site's own "Older matches" and this chain make one chain
      if (data.next) {
        nextPage = setTimeout(async () => {
          const { historyImport: still } = await chrome.storage.local.get('historyImport');
          if (S.importing(still) && !orphaned()) window.postMessage({ [TAG]: 'history-next', cursor: data.next }, location.origin);
        }, HISTORY_PAGE_MS);
      }
    } else if (kind === 'match') {
      ctx.meta[data.id] = Object.assign(ctx.meta[data.id] || {}, data);
      const entry = store.get(data.id);
      if (entry) { T.applyMeta(entry.rec, ctx.meta[data.id], ctx); if (acted.has(data.id)) save(entry); }
    } else if (kind === 'acted') {
      if (typeof data !== 'string' || ignored.has(data)) return;
      acted.add(data);
      const entry = store.get(data);
      if (entry) { save(entry, true); setLive(entry.rec.status === 'active'); }
    }
  }

  async function onFrame(f) {
    if (f.type === 'LOBBY_UPDATE') { ctx.lobby = f.payload; return; }
    const id = T.matchIdOf(f);
    if (!id || ignored.has(id)) return;
    if (!store.has(id) && !looked.has(id)) {
      looked.add(id);
      const saved = await chrome.storage.local.get(['match:' + id, 'dec:' + id]);
      if (saved['match:' + id]) store.set(id, { rec: saved['match:' + id], rt: {}, dec: saved['dec:' + id] || {} });
    }
    const entry = T.handle(store, f, ctx, f.timestamp || Date.now());
    if (!entry) return;
    const gameEnded = f.type === 'GAME_EVENT' && f.payload && f.payload.type === 'GAME_OUTCOME';
    if (!acted.has(id)) return;
    save(entry, gameEnded || entry.rec.status !== 'active');
    setLive(entry.rec.status === 'active');
  }

  // Decisions live under their own key so the dashboard list never has to load them.
  const write = (entry) => {
    if (orphaned() || !entry) return; // a pending debounced write after a reload: the new copy owns the record now
    chrome.storage.local.set({ ['match:' + entry.rec.id]: entry.rec, ['dec:' + entry.rec.id]: entry.dec || {} });
  };

  function save(entry, immediately) {
    const id = entry.rec.id;
    clearTimeout(timers.get(id));
    if (immediately) { timers.delete(id); write(entry); return; }
    timers.set(id, setTimeout(() => { timers.delete(id); write(entry); }, 1000));
  }

  // A match deleted from the dashboard stays deleted: stop tracking it instead of writing it back.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [k, c] of Object.entries(changes)) {
      if (!k.startsWith('match:') || c.newValue !== undefined) continue;
      const id = k.slice(6);
      if (!store.has(id)) continue;
      clearTimeout(timers.get(id));
      timers.delete(id);
      store.delete(id);
      ignored.add(id);
      setLive(false);
    }
  });

  window.addEventListener('pagehide', () => {
    for (const id of [...timers.keys()]) { clearTimeout(timers.get(id)); write(store.get(id)); }
  });

  // Fresh page: nothing to get back. Re-injected after an extension reload: hook.js replays what this tab missed.
  window.postMessage({ [TAG]: 'hello' }, location.origin);

  function setLive(on) {
    if (on === live) return;
    live = on;
    if (orphaned()) return;
    try { chrome.runtime.sendMessage({ live: on }).catch(() => {}); } catch { /* extension reloaded */ }
  }
})();
