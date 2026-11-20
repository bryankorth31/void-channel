// TRIVIA NIGHTS: the build stamp (whole-site audit A34, 20 Nov 2026; Bryan: "Yes, fix it"). Browsers keep a page's stylesheet
// and scripts for up to 4 hours, so after a push a returning visitor could run yesterday's host.js against today's question bank
// (a clip question came up with no clip). scripts/site.js stamps each of them with the build's commit, the way PLAY does since
// 40fa2b960, so a push reaches every browser at once. Pure; tested in tests/trivia-door.test.js.
'use strict';

// Every stylesheet and script the trivia pages load from this site gets ?v=<stamp>: trivia.css, src/*.js and PLAY's QR maker.
function stampTrivia(html, v) {
  if (!/^[0-9a-f]{7,40}$/.test(String(v || ''))) return html;
  return String(html)
    .replace(/(<script src="(?:src\/[a-z0-9-]+|\/play\/src\/[a-z0-9-]+)\.js)"/g, '$1?v=' + v + '"')
    .replace(/(<link rel="stylesheet" href="trivia\.css)"/g, '$1?v=' + v + '"');
}

module.exports = { stampTrivia };
