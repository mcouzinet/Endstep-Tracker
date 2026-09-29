// Snapshot one format's metagame for offline classifier design, loaded exactly as the extension does (meta.js: top
// archetypes only, paced under endstep.cc's rate limit). Run: node test/harness/fetch-meta.js Modern
const fs = require('fs');
const Meta = require('../../meta.js');
const format = process.argv[2] || 'Modern';
Meta.loadFormat(format).then(({ decks }) => {
  const file = `${__dirname}/meta-${format}.json`;
  fs.writeFileSync(file, JSON.stringify(decks));
  console.log(format, decks.length, 'decks;', 'bytes', fs.statSync(file).size);
  console.log(decks.slice(0, 40).map((d) => `${d.name} (${d.registrations})`).join(' | '));
});
