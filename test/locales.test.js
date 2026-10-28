// Every language has the English keys, with the same {placeholders}. Run: node test/locales.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '_locales');
const read = (l) => JSON.parse(fs.readFileSync(path.join(dir, l, 'messages.json'), 'utf8'));
const vars = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(' ');
const en = read('en');

for (const l of fs.readdirSync(dir).filter((l) => l !== 'en')) {
  const m = read(l);
  assert.deepEqual(Object.keys(m), Object.keys(en), l);
  for (const k of Object.keys(en)) assert.equal(vars(m[k].message), vars(en[k].message), `${l} ${k}`);
  assert.ok(m.ext_description.message.length <= 112, `${l} ext_description: the App Store refuses more than 112 characters`);
}

console.log('locales: ok');
