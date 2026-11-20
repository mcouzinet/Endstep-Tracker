// Where the scripts that drive a browser (QA, screenshots, icons) find puppeteer-core and Chrome for Testing. Both are
// this Mac's own copies: set PUPPETEER_CORE (the package's folder) and CHROME (the executable) to use others.
const PUPPETEER_CORE = process.env.PUPPETEER_CORE || '/Users/mickaelcouzinet/.npm/_npx/2eca716f256486a9/node_modules/puppeteer-core';
const CHROME = process.env.CHROME || '/Users/mickaelcouzinet/.cache/puppeteer/chrome/mac_arm-152.0.7977.42/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
module.exports = { puppeteer: require(PUPPETEER_CORE), CHROME };
