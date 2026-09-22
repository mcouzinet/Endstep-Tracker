// Snapshot one format's metagame (deck list + top-50 cards per deck) for offline classifier design.
const fs = require('fs');
const BASE = 'https://endstep.cc/api/metagame/v1';
const format = process.argv[2] || 'Modern';
const j = (u) => fetch(u).then((r) => r.json());
(async () => {
  let decks = [];
  for (let page = 1; ; page++) {
    const d = await j(`${BASE}/${format}/decks?pageSize=50&page=${page}`);
    decks = decks.concat(d.decks.items);
    if (decks.length >= d.decks.total || !d.decks.items.length) break;
  }
  let i = 0;
  const out = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < decks.length) {
      const d = decks[i++];
      const c = await j(`${BASE}/${format}/decks/${encodeURIComponent(d.slug)}/cards?pageSize=50`);
      out.push({ name: d.name, slug: d.slug, machineNamed: d.machineNamed, colours: d.colours, keyCards: d.keyCards, registrations: d.share.registrations,
        cards: Object.fromEntries(c.cards.items.map((x) => [x.name, +x.playRate.rate.toFixed(3)])) , cardTotal: c.cards.total });
    }
  }));
  out.sort((a, b) => b.registrations - a.registrations);
  fs.writeFileSync(`meta-${format}.json`, JSON.stringify(out));
  console.log(format, out.length, 'decks;', 'bytes', fs.statSync(`meta-${format}.json`).size);
  console.log(out.slice(0, 40).map((d) => `${d.name} (${d.registrations})`).join(' | '));
})();
