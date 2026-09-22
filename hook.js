// Runs in the page's own JS world at document_start, before Endstep's bundle.
// Mirrors game traffic to the extension (content.js) without touching it.
(() => {
  const TAG = 'endstep-tracker';
  const post = (kind, data) => window.postMessage({ [TAG]: kind, data }, location.origin);

  // --- WebSocket: every server frame the tracker cares about ---
  const WANTED = /"type":"(GAME_(STATE|DELTA|EVENT|OVER|GONE)|MATCH_STATUS|ATTACH|LOBBY_UPDATE)"/;
  window.WebSocket = new Proxy(window.WebSocket, {
    construct(Target, args, newTarget) {
      const ws = Reflect.construct(Target, args, newTarget);
      ws.addEventListener('message', (e) => {
        if (typeof e.data === 'string' && WANTED.test(e.data.slice(0, 64))) post('ws', e.data);
      });
      return ws;
    },
  });

  // --- fetch: deck selection/names and match metadata ---
  const UUID = '[0-9a-f-]{36}';
  const DECK = new RegExp(`^/api/decks/${UUID}$`);
  const MATCH = new RegExp(`^/api/matches/(${UUID})$`);
  const MATCH_DECK = new RegExp(`^/api/matches/(${UUID})/deck$`);
  const deckMeta = (d) => ({ id: d.id, name: d.name, format: d.format, formatId: d.formatId });

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
      if (method === 'GET' && (path === '/api/decks' || DECK.test(path) || MATCH.test(path))) {
        pending.then((res) => res.ok && res.clone().json()).then((json) => {
          if (!json) return;
          if (Array.isArray(json)) post('decks', json.map(deckMeta));
          else if (DECK.test(path)) post('decks', [{ ...deckMeta(json), cards: json.cards, sideboard: json.sideboard, commanders: json.commanders }]);
          else {
            // Whitelisted on purpose: this response also carries a server-side state
            // fingerprint that includes the opponent's hidden hand. Never forward it.
            post('match', {
              id: json.id,
              lobbyId: json.lobbyId,
              format: json.format,
              formatId: json.formatId,
              ranked: json.ranked,
              gamesPerMatch: json.gamesPerMatch,
              participants: (json.participants || []).map((p) => ({
                userId: p.userId, username: p.username, isBot: !!p.isBot, aiProfile: p.aiProfile || null,
              })),
            });
          }
        }).catch(() => {});
      }
    } catch {
      // Never let tracking break the site.
    }
    return pending;
  };
})();
