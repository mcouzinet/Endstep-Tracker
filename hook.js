// Runs in the page's own JS world at document_start, before Endstep's bundle.
// Mirrors game traffic to the extension (content.js) without touching it.
(() => {
  if (window.__endstepTrackerHook) return; // re-injected after an extension reload: the first copy keeps running
  window.__endstepTrackerHook = true;
  const TAG = 'endstep-tracker';

  // Replay buffer. When the extension is reloaded or updated, Chrome kills content.js in this tab but this
  // page-world script survives. The re-injected content.js says "hello" and gets back what it missed: the sticky
  // bits (lobby, deck pick, deck and match details) and every frame since the last full game state.
  const MAX_BUFFER = 3000;
  let buffer = [];
  const sticky = { lobby: null, deck: null, match: {}, decks: {}, acted: {}, ratings: {} };
  const post = (kind, data) => {
    const msg = { [TAG]: kind, data, at: Date.now() };
    remember(kind, data, msg);
    window.postMessage(msg, location.origin);
  };
  function remember(kind, data, msg) {
    if (kind === 'ws') {
      const head = data.slice(0, 64);
      if (head.includes('"type":"LOBBY_UPDATE"')) { sticky.lobby = msg; return; }
      if (/"type":"(GAME_STATE|ATTACH)"/.test(head)) buffer = [];
      buffer.push(msg);
    } else if (kind === 'out') buffer.push(msg);
    else if (kind === 'deck') sticky.deck = msg;
    else if (kind === 'match') sticky.match[data.id] = { ...msg, data: { ...(sticky.match[data.id] && sticky.match[data.id].data), ...data } }; // limited deck and details
    else if (kind === 'acted') sticky.acted[data] = msg; // this tab plays it: the new copy must keep recording it
    else if (kind === 'rating') sticky.ratings[`${data.matchId}|${data.username}`] = msg;
    else if (kind === 'decks') for (const d of data) sticky.decks[d.id] = { [TAG]: kind, data: [d], at: msg.at };
    if (buffer.length > MAX_BUFFER) buffer = []; // a game this long is not worth replaying
  }
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data) return;
    if (e.data[TAG] === 'history-next') { nextHistory(e.data.cursor); return; }
    if (e.data[TAG] !== 'hello') return;
    const replay = [sticky.lobby, sticky.deck, ...Object.values(sticky.decks), ...Object.values(sticky.match), ...Object.values(sticky.ratings), ...Object.values(sticky.acted), ...buffer];
    for (const m of replay) if (m) window.postMessage({ ...m, replay: true }, location.origin);
  });

  // While the in-page panel's archetype field has the keys (overlay.js), the game does not get them: its shortcuts
  // (Space passes priority) listen on window, in the capture phase too. This copy listens before them, even after an
  // extension update re-injects overlay.js after the page's listeners. Enter and Escape go on to the panel.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, (e) => {
      const panel = document.activeElement;
      if (!panel || panel.id !== 'endstep-tracker-panel') return;
      e.stopImmediatePropagation();
      if (type === 'keydown' && !e.isComposing && (e.key === 'Enter' || e.key === 'Escape')) panel.dispatchEvent(new CustomEvent('endstep-tracker-key', { detail: e.key }));
    }, true);
  }

  // --- my match history (/history): each page goes to content.js, cut down to what a match record needs. During an
  // import I started from the dashboard, content.js asks for the next page: the site's own request again (same address
  // and headers, which never leave this page), with the next cursor.
  let historyRequest = null; // { url, init } of the site's last /api/me/matches request
  const who = (o) => o && { username: o.username };
  const historyRow = (r) => ({
    id: r.id, createdAt: r.createdAt, endedAt: r.endedAt, result: r.result, formatId: r.formatId, stakes: r.stakes, score: r.score,
    deckId: r.deckId, deckName: r.deckName, opponent: who(r.opponent), opponents: Array.isArray(r.opponents) ? r.opponents.map(who) : undefined,
  });
  function readHistory(pending) {
    pending.then((res) => (res.ok ? res.clone().json() : null)).then((json) => {
      if (!json || !Array.isArray(json.matches)) throw new Error('no history page');
      post('history', { rows: json.matches.filter(Boolean).map(historyRow), next: typeof json.nextCursor === 'string' ? json.nextCursor : null });
    }).catch(() => post('history', { rows: [], next: null, failed: true }));
  }
  function nextHistory(cursor) {
    if (!historyRequest || typeof cursor !== 'string' || !cursor || cursor.length > 200) return;
    const url = new URL(historyRequest.url);
    url.searchParams.set('before', cursor);
    readHistory(nativeFetch.call(window, url.href, { ...historyRequest.init, signal: undefined }));
  }

  // --- WebSocket: every server frame the tracker cares about ---
  const WANTED = /"type":"(GAME_(STATE|DELTA|EVENT|OVER|GONE)|MATCH_STATUS|ATTACH|LOBBY_UPDATE)"/;
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(Target, args, newTarget) {
      const ws = Reflect.construct(Target, args, newTarget);
      ws.addEventListener('message', (e) => {
        if (typeof e.data === 'string' && WANTED.test(e.data.slice(0, 64))) post('ws', e.data);
      });
      // My own game actions: in every build only my answer to the sideboarding prompt (the main deck I submit, or
      // DECLINE to keep it), for the side plan.
      const send = ws.send;
      ws.send = function (data) {
        if (typeof data === 'string' && data.startsWith('{"type":"GAME_ACTION"')) {
          // This tab plays that match: endstep sends a match to every open tab of the account, the tracker records
          // only where it is played. The match id alone goes out.
          const played = /"matchId":"([0-9a-f-]{36})"/.exec(data);
          if (played) post('acted', played[1]);
          if (/"type":"(SIDEBOARD_SUBMIT|DECLINE)"/.test(data)) post('out', data);
          // dev-only { every other one (keep, cast, attack, targets…) for the decision journal; release.sh leaves this out
          else post('out', data);
          // } dev-only
        }
        return send.apply(this, arguments);
      };
      return ws;
    },
  });

  // --- fetch: deck selection/names, match metadata, and my match history ---
  const UUID = '[0-9a-f-]{36}';
  const DECK = new RegExp(`^/api/decks/${UUID}$`);
  const MATCH = new RegExp(`^/api/matches/(${UUID})$`);
  const MATCH_DECK = new RegExp(`^/api/matches/(${UUID})/deck$`);
  const deckMeta = (d) => ({ id: d.id, name: d.name, format: d.format, formatId: d.formatId });

  // A ranked match: each player's place on the format's ladder as the match starts, asked once per match, the way the
  // site's player card asks it (it needs my session). Only the ladder of the match's format, and only what is shown.
  const rated = new Set();
  function ladders(match) {
    if (match.ranked !== true || !match.id || rated.has(match.id)) return;
    rated.add(match.id);
    const format = String(match.formatId || '').toLowerCase();
    for (const p of match.participants || []) {
      if (!p || p.isBot || typeof p.username !== 'string' || !p.username) continue;
      nativeFetch.call(window, `/api/ranked/players?username=${encodeURIComponent(p.username)}`)
        .then((res) => (res.ok ? res.json() : null)).then((json) => {
          const l = json && Array.isArray(json.ladders) && json.ladders.find((x) => x && String(x.formatId).toLowerCase() === format);
          if (!l) return;
          post('rating', { matchId: match.id, username: p.username, ladder: {
            score: l.score, rating: l.rating, rank: l.rank, of: l.rankedCount, top: l.topPercent, provisional: l.provisional } });
        }).catch(() => {});
    }
  }

  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const pending = nativeFetch.apply(this, arguments);
    try {
      const url = new URL(String((input && input.url) || input), location.href);
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const body = init && typeof init.body === 'string' ? init.body : null;
      const path = url.pathname;

      if (method !== 'GET' && body && body.includes('"deckId"')) {
        const { deckId } = JSON.parse(body); // lobby seat, queue, quick-play
        if (deckId) post('deck', deckId);
      }
      const limited = method === 'POST' && body && path.match(MATCH_DECK);
      if (limited) {
        const { deck, sideboard } = JSON.parse(body);
        post('match', { id: limited[1], limitedDeck: { deck, sideboard } });
      }
      if (method === 'GET' && path === '/api/me/matches') {
        historyRequest = { url: url.href, init: init || {} };
        readHistory(pending);
      }
      if (method === 'GET' && (path === '/api/decks' || DECK.test(path) || MATCH.test(path))) {
        pending.then((res) => res.ok && res.clone().json()).then((json) => {
          if (!json) return;
          if (Array.isArray(json)) post('decks', json.map(deckMeta));
          else if (DECK.test(path)) post('decks', [{ ...deckMeta(json), cards: json.cards, sideboard: json.sideboard, commanders: json.commanders }]);
          else {
            // Whitelisted on purpose: this response also carries a server-side state
            // fingerprint that includes the opponent's hidden hand. Never forward it.
            const match = {
              id: json.id,
              lobbyId: json.lobbyId,
              format: json.format,
              formatId: json.formatId,
              ranked: json.ranked,
              gamesPerMatch: json.gamesPerMatch,
              participants: (json.participants || []).map((p) => ({
                username: p.username, isBot: !!p.isBot,
              })),
            };
            post('match', match);
            ladders(match);
          }
        }).catch(() => {});
      }
    } catch {
      // Never let tracking break the site.
    }
    return pending;
  };
})();
