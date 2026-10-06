// The feedback link: the Tally form, told which version, browser and language. Run: node test/feedback.test.js
const assert = require('node:assert/strict');
const S = require('../shared.js');

const nav = (userAgent, extra = {}) => ({ userAgent, ...extra });
const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
assert.equal(S.browserName({}, nav(CHROME)), 'Chrome');
assert.equal(S.browserName({}, nav(CHROME, { brave: {} })), 'Brave');
assert.equal(S.browserName({}, nav(CHROME + ' Edg/141.0.0.0')), 'Edge');
assert.equal(S.browserName({}, nav(CHROME + ' OPR/122.0.0.0')), 'Opera');
assert.equal(S.browserName({ browser_specific_settings: { gecko: {} } }, nav('Mozilla/5.0 Firefox/143.0')), 'Firefox');
assert.equal(S.browserName({ browser_specific_settings: { safari: {} } }, nav('Mozilla/5.0 Version/26.0 Safari/605.1.15')), 'Safari');
assert.equal(S.feedbackUrl('1.3.1', 'Firefox', 'fr'), 'https://tally.so/r/LZQveG?version=1.3.1&browser=Firefox&lang=fr');

console.log('feedback: ok');
