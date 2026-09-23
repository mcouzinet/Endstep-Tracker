// The Data menu's JSON export, built from the demo storage (demo-data.js) without a browser: what bot/coach-replay.js
// in Endstep-coach consumes. usage: node test/harness/demo-export.js [out=test/harness/demo-export.json]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'demo-data.js'), 'utf8'), sandbox);
const all = sandbox.window.__DATA;
const matches = [], notes = {}, decisions = {};
for (const [k, v] of Object.entries(all)) {
  if (k.startsWith('match:')) matches.push(v);
  else if (k.startsWith('note:')) notes[k.slice(5)] = v;
  else if (k.startsWith('dec:')) decisions[k.slice(4)] = v;
}
const out = process.argv[2] || path.join(__dirname, 'demo-export.json');
fs.writeFileSync(out, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), matches, notes, decisions }));
console.log(`${out}: ${matches.length} matches, ${Object.keys(decisions).length} with decisions`);
