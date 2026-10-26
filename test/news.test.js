// "What's new": which release's entry the dashboard shows after an update. Run: node test/news.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const R = ['1.6', '1.9', '1.10'];
assert.equal(S.newsDue(R, undefined, '1.5'), null); // a dev build of 1.5 (1.5.11): nothing yet
assert.equal(S.newsDue(R, undefined, '1.6'), '1.6'); // updated from 1.5, where nothing was stored
assert.equal(S.newsDue(R, '1.5', '1.6'), '1.6');
assert.equal(S.newsDue(R, '1.6', '1.6'), null); // closed, or a fresh 1.6 install
assert.equal(S.newsDue(R, '1.6', '1.8'), null); // no entry for 1.7 or 1.8
assert.equal(S.newsDue(R, '1.6', '1.9'), '1.9');
assert.equal(S.newsDue(R, '1.5', '1.10'), '1.10'); // two releases skipped: the newest only, 1.10 after 1.9
assert.equal(S.newsDue(R, '1.10', '2.0'), null);

console.log('news: ok');
