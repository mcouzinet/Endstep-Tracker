// Opponent deck recognition from Endstep's public metagame API (same card names and archetype names as the site).
// Pure scoring in classify(); loading/caching in loadFormat(). Shared by dashboard.js and test/meta.test.js.
(function (root) {
  'use strict';

  const API = 'https://endstep.cc/api/metagame/v1';
  const MAX_DECKS = 100; // archetypes per format, by share (the tail is <0.3 % each)
  const PAGE = 50; // API maximum
  const CONCURRENCY = 4;
  const UNSEEN = 0.01; // play rate assumed for a card missing from an archetype's top-50 list
  const BASICS = /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/;

  // Forge and the metagame API disagree on multi-face names ("Blood Crypt // Blood Crypt"): compare front faces.
  const norm = (s) => String(s || '').split(' // ')[0].trim().toLowerCase();

  // decks: [{ name, slug, colours, registrations, cards: { name: playRate } }]
  // seen: card names the opponent showed (any zone), duplicates allowed.
  // Naive Bayes over archetypes: prior = share, likelihood = play rate of each seen card (UNSEEN when absent).
  function classify(seen, decks, { minConfidence = 0.6, minCards = 2 } = {}) {
    if (!Array.isArray(decks) || !decks.length) return null;
    const known = new Set();
    for (const d of decks) for (const c of Object.keys(d.cards || {})) known.add(norm(c));
    const shown = {}; // normalized -> name as the opponent showed it (front face), for display
    for (const s of seen || []) { const c = norm(s); if (known.has(c) && !shown[c]) shown[c] = String(s).split(' // ')[0].trim(); }
    const names = Object.keys(shown);
    if (names.filter((c) => !BASICS.test(c)).length < minCards) return null;

    const total = decks.reduce((s, d) => s + (d.registrations || 0), 0) || decks.length;
    const scored = decks.map((d) => {
      const rates = {};
      for (const [c, r] of Object.entries(d.cards || {})) rates[norm(c)] = r;
      let log = Math.log(((d.registrations || 0) + 1) / (total + decks.length));
      const matched = [];
      for (const c of names) {
        const r = rates[c];
        log += Math.log(Math.max(r || 0, UNSEEN));
        if (r >= 0.5 && !BASICS.test(c)) matched.push(shown[c]);
      }
      return { deck: d, log, matched };
    });
    const max = Math.max(...scored.map((s) => s.log));
    const z = scored.reduce((s, x) => s + Math.exp(x.log - max), 0);
    scored.sort((a, b) => b.log - a.log);
    const best = scored[0];
    const p = Math.exp(best.log - max) / z;
    if (p < minConfidence || !best.matched.length) return null;
    return { name: best.deck.name, slug: best.deck.slug, colours: best.deck.colours || [], p, matched: best.matched };
  }

  const json = async (fetchFn, url) => {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  };

  // Formats that have metagame data (Standard, Pioneer… exist but are empty for now).
  async function listFormats(fetchFn = fetch) {
    const d = await json(fetchFn, `${API}/formats`);
    return (d.formats || []).map((f) => f.formatId);
  }

  // One format's archetypes with their top-50 card play rates; ~1 request per archetype, so cache the result.
  async function loadFormat(formatId, fetchFn = fetch) {
    const f = encodeURIComponent(formatId);
    let items = [];
    for (let page = 1; items.length < MAX_DECKS; page++) {
      const d = await json(fetchFn, `${API}/${f}/decks?pageSize=${PAGE}&page=${page}`);
      const got = (d.decks && d.decks.items) || [];
      items = items.concat(got);
      if (!got.length || items.length >= (d.decks.total || 0)) break;
    }
    items = items.slice(0, MAX_DECKS);
    if (!items.length) return { formatId, at: Date.now(), decks: [] };
    const decks = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < items.length) {
        const k = i++;
        const d = items[k];
        const c = await json(fetchFn, `${API}/${f}/decks/${encodeURIComponent(d.slug)}/cards?pageSize=${PAGE}`);
        const cards = {};
        for (const x of (c.cards && c.cards.items) || []) cards[x.name] = Math.round(x.playRate.rate * 1000) / 1000;
        decks[k] = { name: d.name, slug: d.slug, colours: d.colours || [], registrations: (d.share && d.share.registrations) || 0, cards };
      }
    }));
    // Small archetypes come back without a card list (the site withholds it): nothing to recognize them by.
    return { formatId, at: Date.now(), decks: decks.filter((d) => d && Object.keys(d.cards).length) };
  }

  const Meta = { classify, loadFormat, listFormats, norm };
  if (typeof module === 'object' && module.exports) module.exports = Meta;
  else root.EndstepMeta = Meta;
})(typeof self !== 'undefined' ? self : this);
