// Pure match-tracking logic: turns Endstep server frames into match records.
// Shared by content.js (browser) and test/replay.test.js (node).
(function (root) {
  'use strict';

  // Engine chatter that adds nothing to the stored log.
  const NOISE = new Set(['TURN_PHASE', 'MANA_LOG', 'SHUFFLE', 'PLAYER_CONTROL', 'SPELL_REMOVED_FROM_STACK', 'COMBAT_ENDED']);
  // Events whose playerIndex is the card's controller (PLAYER_DAMAGED etc. point at the victim instead).
  const PLAYED = new Set(['SPELL_CAST', 'LAND_PLAYED', 'ABILITY_ACTIVATED', 'TRIGGER_FIRED']);
  const ZONES = ['battlefield', 'graveyard', 'exile', 'commandZone', 'hand'];
  const UNSEQUENCED = 1e12; // CARD_REVEALED carries hash-like sequence numbers
  const NO_DECK = /draft|sealed|momir|fish/i; // formats where no saved deck of mine is played
  const RECENT_DECK_MS = 6 * 3600e3; // a deck picked longer ago than this is not assumed to be this match's
  // Outgoing actions that are settings or mana bookkeeping, not decisions worth reviewing.
  const NOT_DECISIONS = new Set(['SET_PHASE_STOPS', 'SET_AUTO_YIELDS', 'TAP_MANA', 'AUTO_PAY', 'USE_FLOATING_MANA', 'UNDO', 'CHEAT', 'CONCEDE_MATCH']);
  const ID_FIELDS = new Set(['cardId', 'targets', 'orderedCards', 'attackers', 'blockers']);
  const ACTION_META = new Set(['type', 'matchId', 'actionId', 'promptVersion', 'autoPassAfter']);

  const seatOf = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const current = (rec) => rec.games[rec.games.length - 1];

  // ATTACH bundles replayed frames; everything else is one frame.
  function frames(msg) {
    if (!msg || typeof msg !== 'object') return [];
    if (msg.type !== 'ATTACH') return [msg];
    return (msg.payload && Array.isArray(msg.payload.frames)) ? msg.payload.frames : [];
  }

  function matchIdOf(f) {
    return f.matchId || (f.payload && f.payload.matchId) || null;
  }

  // store: Map matchId -> { rec, rt }. rec is persisted, rt is per-page runtime state.
  // ctx: { meta: {matchId: {...}}, lobby, lastDeck: {id, at}, decks }. Returns the touched entry or null.
  function handle(store, f, ctx, now) {
    const id = matchIdOf(f);
    if (!id) return null;
    if (f.type === 'MATCH_STATUS') {
      const p = f.payload || {};
      ctx.meta[id] = Object.assign(ctx.meta[id] || {}, { format: p.format, serverStatus: p.status });
    }
    let entry = store.get(id);
    if (!entry) {
      const isState = f.type === 'GAME_STATE' || f.type === 'GAME_OVER';
      if (!isState || typeof f.viewerSeat !== 'number' || f.viewerSeat < 0) return null; // spectating / not ours
      entry = { rec: createMatch(id, now), rt: {}, dec: {} };
      store.set(id, entry);
    }
    const { rec, rt } = entry;
    applyMeta(rec, ctx.meta[id], ctx);

    switch (f.type) {
      case 'GAME_STATE':
      case 'GAME_OVER':
        if (!f.payload || !Array.isArray(f.payload.players)) break;
        rt.seq = f.seq;
        rt.state = f.payload;
        if (typeof f.viewerSeat === 'number') rec.mySeat = f.viewerSeat;
        syncState(rec, rt, f.payload, ctx, now);
        if (f.type === 'GAME_OVER') finish(rec, f.payload, now);
        break;
      case 'GAME_DELTA': {
        const p = f.payload;
        if (!rt.state || !p || !p.patch || p.baseSeq !== rt.seq) break; // gap: wait for the next full state
        rt.state = applyDelta(rt.state, p);
        rt.seq = f.seq;
        syncState(rec, rt, rt.state, ctx, now);
        break;
      }
      case 'GAME_EVENT':
        if (f.payload) onEvent(rec, rt, f.payload, now);
        break;
      case 'GAME_GONE':
        if (rec.status === 'active') { rec.status = 'abandoned'; rec.endedAt = now; }
        break;
    }
    rec.updatedAt = now;
    return entry;
  }

  function createMatch(id, now) {
    return {
      v: 1, id, status: 'active', startedAt: now, updatedAt: now,
      mySeat: null, players: [], games: [], score: [], colors: {},
    };
  }

  function applyMeta(rec, m, ctx) {
    if (!m) return;
    for (const k of ['format', 'formatId', 'ranked', 'gamesPerMatch', 'lobbyId', 'serverStatus', 'participants', 'limitedDeck']) {
      if (m[k] !== undefined && m[k] !== null) rec[k] = m[k];
    }
    if (rec.myDeck && noDeck(rec)) rec.myDeck = null; // format may be learnt after the deck was guessed
    // The match's lobby id can arrive after the deck was guessed from my last pick: prefer that lobby's seat deck.
    if (ctx && rec.lobbyId && rec.myDeck !== undefined && !(rec.myDeck && rec.myDeck.source === 'lobby')) {
      const d = resolveDeck(rec, ctx, rec.updatedAt);
      if (d && d.source === 'lobby') rec.myDeck = d;
    }
  }

  const noDeck = (rec) => NO_DECK.test(`${rec.format || ''} ${rec.formatId || ''}`);

  // Same merge the Endstep client does (players patched by index).
  function applyDelta(prev, p) {
    const next = Object.assign({}, prev, p.patch.state || {}, { pendingAction: p.pendingAction });
    if (Array.isArray(p.patch.players) && Array.isArray(prev.players)) {
      const byIndex = new Map(p.patch.players.map((x) => [x.i, x]));
      next.players = prev.players.map((pl, i) => {
        const d = byIndex.get(i);
        if (!d) return pl;
        const patch = Object.assign({}, d);
        delete patch.i;
        return Object.assign({}, pl, patch);
      });
    }
    return next;
  }

  function newGame(rec, n, now) {
    const g = { n, startedAt: now, mulligans: {}, kept: {}, life: {}, seen: {}, log: [], lastSeq: 0 };
    rec.games.push(g);
    return g;
  }

  function see(g, seat, name, id) {
    const bySeat = (g.seen[seat] = g.seen[seat] || {});
    const ids = (bySeat[name] = bySeat[name] || []);
    const key = id === undefined || id === null ? '?' : id;
    if (!ids.includes(key)) ids.push(key);
  }

  function addColors(rec, seat, color) {
    const have = new Set(((rec.colors[seat] || '') + color).split(''));
    rec.colors[seat] = 'WUBRG'.split('').filter((c) => have.has(c)).join('');
  }

  // My deck for this match: the seat deck of the match's own lobby when we saw it, otherwise the deck
  // I picked last (seat, queue, quick-play) if that pick is recent enough to plausibly be this match's.
  function resolveDeck(rec, ctx, now) {
    if (noDeck(rec)) return null; // limited decks arrive via limitedDeck instead
    const me = rec.players[rec.mySeat];
    const lobby = ctx.lobby;
    let id = null;
    let source = 'lobby';
    if (me && lobby && rec.lobbyId && lobby.id === rec.lobbyId && lobby.config && lobby.config.seatDecks) {
      const seat = (lobby.seats || []).find((s) => s.username === me.name);
      if (seat) id = lobby.config.seatDecks[seat.user_id] || null;
    }
    if (!id) {
      const last = ctx.lastDeck;
      if (!last || !last.id || typeof last.at !== 'number' || now - last.at > RECENT_DECK_MS) return null;
      id = last.id;
      source = 'recent';
    }
    const d = (ctx.decks && ctx.decks[id]) || {};
    return { id, name: d.name || null, cards: d.cards || null, sideboard: d.sideboard || null, source };
  }

  function syncState(rec, rt, st, ctx, now) {
    const ms = st.matchScore || null;
    const n = (ms && ms.gameNumber) || 1;
    rt.gameNumber = n;
    if (st.gameType) rec.gameType = st.gameType;
    if (ms && ms.gamesPerMatch) rec.gamesPerMatch = ms.gamesPerMatch;
    st.players.forEach((p, i) => { rec.players[i] = Object.assign(rec.players[i] || {}, { seat: i, name: p.name }); });
    if (rec.myDeck === undefined && rec.mySeat !== null) rec.myDeck = resolveDeck(rec, ctx, now);

    let g = current(rec);
    if (!g) g = newGame(rec, n, now);

    // Game winners from the score, in case a GAME_OUTCOME was missed (reload between games).
    if (ms && Array.isArray(ms.winsBySeat)) {
      ms.winsBySeat.forEach((w, s) => {
        if (w <= (rec.score[s] || 0)) return;
        const won = rec.games.find((x) => x.n === ms.gamesPlayed);
        if (won && won.winnerSeat === undefined) won.winnerSeat = s;
      });
      rec.score = ms.winsBySeat.slice();
    }

    const sg = rec.games.find((x) => x.n === n);
    if (sg) {
      // Opponent cards visible right now (face-down hand cards arrive as "Hidden card").
      st.players.forEach((p, i) => {
        for (const z of ZONES) {
          for (const c of p[z] || []) {
            if (!c || c.faceDown || c.isToken || c.isCopyOfRealCard || !c.name || c.name === 'Hidden card') continue;
            const owner = seatOf(c.ownerId) === null ? i : seatOf(c.ownerId);
            if (owner === rec.mySeat) continue;
            see(sg, owner, c.name, c.id);
            if (c.color && !(c.types || []).includes('Land')) addColors(rec, owner, c.color);
          }
        }
      });
      // Opening hand: first turn-1 snapshot + whatever I already moved out of my hand this turn.
      if (rt.collectHand && sg === current(rec) && Number(st.turnNumber) >= 1) {
        const mine = st.players[rec.mySeat] || {};
        sg.openingHand = (mine.hand || []).map((c) => c.name).concat(rt.handOut);
        rt.collectHand = false;
      }
    }
    if (st.status === 'COMPLETE' && (!ms || ms.isMatchOver)) finish(rec, st, now);
  }

  function onEvent(rec, rt, ev, now) {
    let g = current(rec);
    if (!g) return;
    const seq = ev.sequenceNumber;
    if (typeof seq === 'number' && seq < UNSEQUENCED) {
      if (seq <= g.lastSeq) {
        // Sequence numbers restart with each game of the match; anything else is a replay.
        const nextGame = seq < g.lastSeq && (g.outcome || (rt.gameNumber || 0) > g.n);
        if (!nextGame) return;
        g = newGame(rec, Math.max(g.n + 1, rt.gameNumber || 0), now);
        rt.collectHand = false;
      }
      g.lastSeq = seq;
    } else {
      rt.keys = rt.keys || new Set();
      const key = `${g.n}|${g.turns}|${ev.type}|${ev.message}`;
      if (rt.keys.has(key)) return;
      rt.keys.add(key);
    }

    const seat = seatOf(ev.playerIndex);
    const owner = seatOf(ev.zoneOwnerIndex);
    switch (ev.type) {
      case 'GAME_STARTED':
        g.firstSeat = seat;
        g.tossSeat = seatOf(ev.tossPlayerIndex);
        break;
      case 'TURN_BEGAN':
        g.turns = ev.turnNumber;
        if (ev.turnNumber === 1) {
          if (g.firstSeat === undefined || g.firstSeat === null) g.firstSeat = seat;
          g.startedAt = now;
          rt.collectHand = true;
          rt.handOut = [];
        }
        break;
      case 'MULLIGAN':
        g.mulligans[seat] = (g.mulligans[seat] || 0) + 1;
        break;
      case 'HAND_SETTLED':
        g.mulligans[seat] = ev.mulligans;
        g.kept[seat] = ev.amount;
        break;
      case 'PLAYER_LIFE_CHANGED':
        g.life[seat] = ev.newValue;
        break;
      case 'CARD_ZONE_CHANGE':
        if (!ev.cardName || owner === null) break;
        if (owner !== rec.mySeat) see(g, owner, ev.cardName, ev.cardId);
        else if (rt.collectHand && ev.fromZone === 'Hand') rt.handOut.push(ev.cardName);
        break;
      case 'CARD_REVEALED':
        if (seat === null || seat === rec.mySeat) break;
        (ev.cardNames || [ev.cardName]).forEach((name, i) => { if (name) see(g, seat, name, (ev.cardIds || [])[i]); });
        break;
      case 'GAME_OUTCOME':
        g.winnerSeat = seat; // null = draw
        g.endReason = ev.endReason || null;
        if (ev.turnNumber) g.turns = ev.turnNumber;
        g.endedAt = now;
        g.outcome = true;
        break;
      default:
        if (PLAYED.has(ev.type) && ev.cardName && seat !== null && seat !== rec.mySeat) see(g, seat, ev.cardName, ev.cardId);
    }

    if (!NOISE.has(ev.type) && !(ev.type === 'CARD_ZONE_CHANGE' && !ev.cardName)) {
      g.log.push([g.turns || 0, seat === null ? owner : seat, ev.type, ev.cardName || null, ev.message || '']);
    }
  }

  function finish(rec, st, now) {
    if (rec.status === 'complete') return;
    const g = current(rec);
    let w = seatOf(st.winnerId);
    if (w === null && g && g.winnerSeat !== undefined) w = g.winnerSeat;
    if (w === null && rec.score.length) {
      const best = Math.max(...rec.score);
      const leaders = rec.score.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
      if (best > 0 && leaders.length === 1) w = leaders[0];
    }
    rec.status = 'complete';
    rec.endedAt = now;
    rec.winnerSeat = w;
    rec.result = w === null ? 'D' : w === rec.mySeat ? 'W' : 'L';
    if (g && !g.endedAt) g.endedAt = now;
  }

  // One of my actions (hook.js mirrors outgoing GAME_ACTION frames), recorded with the prompt it answered
  // and the board at that moment: the raw material for the coach. Stored per game in entry.dec[gameNumber].
  function onAction(store, a, now) {
    const entry = a && store.get(a.matchId);
    if (!entry || NOT_DECISIONS.has(a.type)) return null;
    const { rec, rt } = entry;
    const st = rt.state;
    if (!st || rec.mySeat === null) return null;
    const pa = st.pendingAction || null;
    const options = (pa && pa.cardOptions) || [];
    if (a.type === 'PASS_PRIORITY' && !options.length) return null; // nothing else was possible
    const names = cardNames(st, options);
    const answer = { type: a.type };
    for (const [k, v] of Object.entries(a)) {
      if (!ACTION_META.has(k)) answer[k] = ID_FIELDS.has(k) ? resolve(v, names) : v;
    }
    const n = rt.gameNumber || 1;
    entry.dec = entry.dec || {};
    (entry.dec[n] = entry.dec[n] || []).push({
      at: now,
      turn: Number(st.turnNumber) || 0,
      phase: st.phase,
      active: seatOf(st.activePlayerId),
      prompt: pa && { type: pa.type, message: pa.message, options: options.map((o) => o.name).concat(pa.stringOptions || []), min: pa.min, max: pa.max },
      answer,
      board: snapshot(st, rec.mySeat),
    });
    return entry;
  }

  function cardNames(st, options) {
    const m = new Map();
    for (const p of st.players) for (const z of ZONES) for (const c of p[z] || []) if (c && c.name) m.set(c.id, c.name);
    for (const s of st.stack || []) if (s && s.sourceCard) m.set(s.sourceCard.id, s.sourceCard.name);
    for (const o of options) m.set(o.id, o.name); // prompt options win (targets include players, with negative ids)
    return m;
  }

  // Card ids -> names in any action shape: a single id, id arrays, or id-keyed maps (blockers).
  function resolve(v, names) {
    const name = (x) => (names.has(Number(x)) ? names.get(Number(x)) : x);
    if (Array.isArray(v)) return v.map((x) => resolve(x, names));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[name(k)] = resolve(x, names);
      return out;
    }
    return typeof v === 'number' || typeof v === 'string' ? name(v) : v;
  }

  // Public board plus my hand, in the shape coach.js reads (same field names as GAME_STATE where it matters).
  function snapshot(st, mySeat) {
    const card = (c) => {
      const o = { name: c.name, power: c.power, toughness: c.toughness, tapped: !!c.tapped, types: c.types || [], hasSummoningSickness: !!c.hasSummoningSickness };
      if (c.isToken) o.isToken = true;
      if (c.counters && Object.keys(c.counters).length) o.counters = c.counters;
      return o;
    };
    return {
      turnNumber: Number(st.turnNumber) || 0,
      phase: st.phase,
      activePlayerId: seatOf(st.activePlayerId),
      priorityPlayerId: seatOf(st.priorityPlayerId),
      players: st.players.map((p, i) => ({
        life: p.life,
        hand: i === mySeat ? (p.hand || []).map((c) => c.name) : undefined,
        handSize: p.handSize !== undefined ? p.handSize : (p.hand || []).length,
        librarySize: p.librarySize,
        battlefield: (p.battlefield || []).map(card),
        graveyard: (p.graveyard || []).map((c) => c.name),
        exile: (p.exile || []).map((c) => c.name),
        manaPool: p.manaPool && Object.keys(p.manaPool).length ? p.manaPool : undefined,
      })),
      stack: (st.stack || []).map((s) => (s && s.sourceCard && s.sourceCard.name) || null),
    };
  }

  // name -> most copies seen in a single game (a lower bound of the real decklist).
  function seenCards(rec, seat) {
    const out = {};
    for (const g of rec.games) {
      for (const [name, ids] of Object.entries((g.seen || {})[seat] || {})) out[name] = Math.max(out[name] || 0, ids.length);
    }
    return out;
  }

  const Tracker = { frames, matchIdOf, handle, onAction, applyMeta, applyDelta, seenCards };
  if (typeof module === 'object' && module.exports) module.exports = Tracker;
  else root.EndstepTracker = Tracker;
})(typeof self !== 'undefined' ? self : this);
