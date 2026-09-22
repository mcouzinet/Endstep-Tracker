// Isolated-world bridge: receives frames from hook.js, runs the tracker, persists match records.
(() => {
  const T = self.EndstepTracker;
  const TAG = 'endstep-tracker';
  const store = new Map(); // matchId -> { rec, rt, dec }
  const looked = new Set(); // matchIds already looked up in storage
  const ignored = new Set(); // matchIds the user deleted from the dashboard while this page was open
  const timers = new Map();
  const ctx = { meta: {}, lobby: null, lastDeck: null, decks: {} };
  let live = false;

  let chain = chrome.storage.local.get(['lastDeck', 'decks']).then((s) => {
    ctx.lastDeck = s.lastDeck || null;
    ctx.decks = s.decks || {};
  });

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || typeof e.data !== 'object' || !e.data[TAG]) return;
    const { data } = e.data;
    const kind = e.data[TAG];
    chain = chain.then(() => onMessage(kind, data)).catch((err) => console.warn('[endstep-tracker]', err));
  });

  async function onMessage(kind, data) {
    if (kind === 'ws') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      for (const f of T.frames(msg)) await onFrame(f);
    } else if (kind === 'out') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      const entry = msg.payload && !ignored.has(msg.payload.matchId) && T.onAction(store, msg.payload, Date.now());
      if (entry) save(entry);
    } else if (kind === 'deck') {
      ctx.lastDeck = { id: data, at: Date.now() };
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
        if (changed) save(entry);
      }
    } else if (kind === 'match') {
      ctx.meta[data.id] = Object.assign(ctx.meta[data.id] || {}, data);
      const entry = store.get(data.id);
      if (entry) { T.applyMeta(entry.rec, ctx.meta[data.id], ctx); save(entry); }
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
    save(entry, gameEnded || entry.rec.status !== 'active');
    setLive(entry.rec.status === 'active');
  }

  // Decisions live under their own key so the dashboard list never has to load them.
  const write = (entry) => chrome.storage.local.set({ ['match:' + entry.rec.id]: entry.rec, ['dec:' + entry.rec.id]: entry.dec || {} });

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

  function setLive(on) {
    if (on === live) return;
    live = on;
    try { chrome.runtime.sendMessage({ live: on }).catch(() => {}); } catch { /* extension reloaded */ }
  }
})();
