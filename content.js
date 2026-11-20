// Isolated-world bridge: receives frames from hook.js, runs the tracker, persists match records.
(() => {
  const T = self.EndstepTracker;
  const S = self.EndstepShared;
  const TAG = 'endstep-tracker';
  const store = new Map(); // matchId -> { rec, rt, dec }
  const looked = new Set(); // matchIds already looked up in storage
  const ignored = new Set(); // matchIds the user deleted from the dashboard while this page was open
  // Ids come from the page's world, where any script can post: the site's are UUIDs. A name every object has
  // ("__proto__", "constructor") never becomes a key: it would reach every object of this world.
  const isId = (id) => typeof id === 'string' && /^[\w-]{1,64}$/.test(id) && !(id in Object.prototype);
  // Matches this tab plays (it sent a game action). endstep sends a match to every open tab of the account, on every
  // computer: a tab that only watches it, another tab or a computer left open, records nothing (it would write a
  // half-seen copy over the real one). Frames are followed all the same, and saved from the first action on.
  // Kept in the tab's sessionStorage: after a reload (F5) mid-match, the end of the match is saved even when it comes
  // before my next action (the opponent concedes).
  const ACTED = 'endstep-tracker.acted';
  const acted = new Set((() => { try { const ids = JSON.parse(sessionStorage.getItem(ACTED)); return Array.isArray(ids) ? ids.filter(isId) : []; } catch { return []; } })());
  const markActed = (id) => {
    acted.add(id);
    try { sessionStorage.setItem(ACTED, JSON.stringify([...acted].slice(-50))); } catch { /* storage blocked */ }
  };
  const timers = new Map();
  const ctx = { meta: {}, lobby: null, lastDeck: null, decks: {} };
  let live = false;
  const HISTORY_PAGE_MS = 1000; // between two pages of my history while importing it: far below the site's 300 requests a minute
  let nextPage = null;
  // While my history is imported: the stored matches without their games (what pairing them needs), read once for the
  // whole import and kept up to date from storage.onChanged. null otherwise.
  let index = null;
  const light = (v) => S.normalizeMatch({ ...S.obj(v), games: [] });

  let chain = chrome.storage.local.get(['lastDeck', 'decks']).then((s) => {
    ctx.lastDeck = s.lastDeck || null;
    ctx.decks = S.normalizeDecks(s.decks);
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
      if (!a || !isId(a.matchId) || ignored.has(a.matchId)) return;
      if (!acted.has(a.matchId)) markActed(a.matchId);
      const side = T.onSideboard(store, a, at);
      if (side) save(side, true);
      // dev-only { the decision journal
      const entry = T.onAction(store, a, at);
      if (entry) save(entry);
      // } dev-only
    } else if (kind === 'deck') {
      if (!isId(data)) return;
      ctx.lastDeck = { id: data, at };
      chrome.storage.local.set({ lastDeck: ctx.lastDeck });
    } else if (kind === 'decks') {
      if (!Array.isArray(data)) return;
      // Read again before writing: another endstep.cc tab, or a backup imported in the dashboard, may have added decks.
      ctx.decks = S.normalizeDecks((await chrome.storage.local.get('decks')).decks);
      for (const d of data) if (d && isId(d.id)) ctx.decks[d.id] = Object.assign(ctx.decks[d.id] || {}, d);
      if (orphaned()) return;
      await chrome.storage.local.set({ decks: ctx.decks });
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
      if (!S.importing(on)) { index = null; return; }
      const recs = (Array.isArray(data.rows) ? data.rows : []).map((row) => T.fromHistory(row, ctx.decks)).filter(Boolean);
      if (!index) index = new Map(Object.entries(await S.loadStore()).filter(([k]) => k.startsWith('match:')).map(([, v]) => light(v)).filter(Boolean).map((m) => [m.id, m]));
      const all = [...index.values()];
      // Matches I deleted from the dashboard stay deleted: by their id, or as the twin of a recorded one.
      const gone = Object.entries(S.obj(deletedMatches)).map(([id, f]) => S.normalizeMatch({ ...S.obj(f), id, games: [] })).filter(Boolean);
      const known = new Set([...all, ...gone].map((m) => m.id));
      const fresh = recs.filter((r) => !known.has(r.id) && !store.has(r.id) && !ignored.has(r.id));
      const pairs = S.historyPairs([...all, ...gone.filter((g) => g.source !== 'history'), ...fresh]);
      const twins = new Set(pairs.map((p) => p.h));
      const add = fresh.filter((r) => !twins.has(r.id));
      // A recorded twin the tracker caught only in part gets what the history knows: format, deck, ranked, result. Told
      // on a copy of its light record, then filled in full.
      const byId = new Map([...all, ...fresh].map((m) => [m.id, m]));
      const owed = pairs.map((p) => [byId.get(p.m), byId.get(p.h)])
        .filter(([m, h]) => m && h && m.source !== 'history' && !store.has(m.id) && S.fillFromHistory({ ...m }, h, false).length);
      const full = owed.length ? await chrome.storage.local.get(owed.map(([m]) => 'match:' + m.id)) : {};
      const completed = owed.map(([m, h]) => [S.normalizeMatch(full['match:' + m.id]), h]).filter(([m, h]) => m && S.fillFromHistory(m, h).length).map(([m]) => m);
      if (orphaned()) return;
      // "Done" may have been clicked in the panel while the matches were being read: the import stays stopped.
      const { historyImport: now } = await chrome.storage.local.get('historyImport');
      const going = S.importing(now);
      await chrome.storage.local.set({ ...Object.fromEntries([...add, ...completed].map((r) => ['match:' + r.id, r])),
        ...(going ? { historyImport: { until: Date.now() + S.HISTORY_IMPORT_MS, read: (now.read || 0) + recs.length, added: (now.added || 0) + add.length,
          completed: (now.completed || 0) + completed.length, done: !data.next, failed: !!data.failed } } : {}) });
      for (const r of [...add, ...completed]) index.set(r.id, light(r));
      if (!going || !data.next) index = null; // over: read afresh next time
      clearTimeout(nextPage); // the site's own "Older matches" and this chain make one chain
      if (going && data.next) {
        nextPage = setTimeout(async () => {
          const { historyImport: still } = await chrome.storage.local.get('historyImport');
          if (S.importing(still) && !orphaned()) window.postMessage({ [TAG]: 'history-next', cursor: data.next }, location.origin);
        }, HISTORY_PAGE_MS);
      }
    } else if (kind === 'match') {
      if (!data || !isId(data.id)) return;
      ctx.meta[data.id] = Object.assign(ctx.meta[data.id] || {}, data);
      const entry = store.get(data.id);
      if (entry) { T.applyMeta(entry.rec, ctx.meta[data.id], ctx); if (acted.has(data.id)) save(entry); }
    } else if (kind === 'rating') {
      // A player's place on the ladder as the match starts (hook.js): kept with the match, the first one seen wins.
      if (!data || !isId(data.matchId) || typeof data.username !== 'string' || !data.username || data.username.length > 64 || data.username in Object.prototype) return;
      const meta = ctx.meta[data.matchId] = ctx.meta[data.matchId] || {};
      meta.ratings = { ...S.obj(meta.ratings), [data.username]: S.obj(data.ladder) };
      const entry = store.get(data.matchId);
      if (entry) { T.applyMeta(entry.rec, ctx.meta[data.matchId], ctx); if (acted.has(data.matchId)) save(entry); }
    } else if (kind === 'acted') {
      // Sent with each of my game actions: the first one makes the record appear at once, the frames save the rest.
      if (!isId(data) || ignored.has(data) || acted.has(data)) return;
      markActed(data);
      const entry = store.get(data);
      if (!entry) return;
      // This tab only watched until now: another tab of this browser may have played the match since this one read
      // it, and recorded what only the playing tab sees (the main deck submitted for a game, the decisions). Taken in
      // before this copy writes over it.
      const saved = await chrome.storage.local.get(['match:' + data, 'dec:' + data]);
      const rec = saved['match:' + data];
      if (rec && rec.mains) entry.rec.mains = { ...S.obj(entry.rec.mains), ...S.obj(rec.mains) };
      if (saved['dec:' + data]) entry.dec = { ...S.obj(entry.dec), ...S.obj(saved['dec:' + data]) };
      if (orphaned()) return;
      save(entry, true);
      setLive(entry.rec.status === 'active');
    }
  }

  async function onFrame(f) {
    if (f.type === 'LOBBY_UPDATE') { ctx.lobby = f.payload; return; }
    const id = T.matchIdOf(f);
    if (!isId(id) || ignored.has(id)) return; // frames come from the page's world too
    if (!store.has(id) && !looked.has(id)) {
      looked.add(id);
      const saved = await chrome.storage.local.get(['match:' + id, 'dec:' + id, 'deletedMatches']);
      if (S.obj(saved.deletedMatches)[id]) { ignored.add(id); return; } // deleted from the dashboard before this page was loaded
      if (saved['match:' + id]) store.set(id, { rec: saved['match:' + id], rt: {}, dec: saved['dec:' + id] || {} });
    }
    const entry = T.handle(store, f, ctx, Number.isFinite(f.timestamp) ? f.timestamp : Date.now());
    if (!entry) return;
    const gameEnded = f.type === 'GAME_EVENT' && f.payload && f.payload.type === 'GAME_OUTCOME';
    if (!acted.has(id)) return;
    save(entry, gameEnded || entry.rec.status !== 'active');
    setLive(entry.rec.status === 'active');
  }

  // Decisions (dev builds) live under their own key so the dashboard list never has to load them; none, no key.
  const write = (entry) => {
    if (orphaned() || !entry) return; // a pending debounced write after a reload: the new copy owns the record now
    const dec = entry.dec && Object.keys(entry.dec).length ? { ['dec:' + entry.rec.id]: entry.dec } : {};
    chrome.storage.local.set({ ['match:' + entry.rec.id]: entry.rec, ...dec });
  };

  function save(entry, immediately) {
    const id = entry.rec.id;
    clearTimeout(timers.get(id));
    if (immediately) { timers.delete(id); write(entry); return; }
    timers.set(id, setTimeout(() => { timers.delete(id); write(entry); }, 1000));
  }

  // A match deleted from the dashboard stays deleted: stop tracking it instead of writing it back. The decks and the
  // deck picked, which another endstep.cc tab may have changed, are taken in.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || orphaned()) return;
    if (changes.decks) ctx.decks = S.normalizeDecks(changes.decks.newValue);
    if (changes.lastDeck) ctx.lastDeck = changes.lastDeck.newValue || null;
    if (index) {
      for (const [k, c] of Object.entries(changes)) {
        if (!k.startsWith('match:')) continue;
        const m = c.newValue === undefined ? null : light(c.newValue);
        if (m) index.set(m.id, m); else index.delete(k.slice(6));
      }
    }
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
