// One top bar for Play and Learn, Computer games, Void Village and Brave steps (audit, 19 Nov 2026: a child sent from Brave steps to
// the Village had no way back, and the three bars differed; "all the windows need to have a back arrow so they can go
// back to the main area"). The big arrow at the top left goes back one step: inside a page first (a game to the
// games, a ladder to the worries), then to where the child came from, then home. The app installs standalone, so
// there is no browser Back button to lean on.
//   A link can say where back leads: /village/#clinic&from=/brave/%23doctor goes back to the doctor ladder.
//   A page can handle back itself: window.kidsBackHere = () => true when it went back inside the page.

const LINKS = [['shows', '/', 'Shows'], ['play', '/play/', 'Play and Learn'], ['games', '/games/', 'Computer games'], ['village', '/village/', 'Void Village'], ['brave', '/brave/', 'Brave steps'], ['grown', '/about', 'For grown-ups']];

const CSS = '.kn{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:4px solid #1b1f3b;flex-wrap:wrap;background:#fff8e7}'
  + '.kn-back{flex:none;width:64px;height:64px;padding:12px;background:#fff;border:5px solid #1b1f3b;border-radius:20px;box-shadow:5px 5px 0 #1b1f3b;cursor:pointer}'
  + '.kn-back:active{box-shadow:1px 1px 0 #1b1f3b;transform:translate(4px,4px)}.kn-back svg{display:block;width:100%;height:100%}'
  + '.kn-home{all:unset;display:flex;align-items:center;gap:12px;cursor:pointer}.kn-home img{width:48px;height:48px}'
  + ".kn-home .n{font-family:Unbounded,system-ui,sans-serif;font-weight:800;font-size:22px;white-space:nowrap}.kn-home .w1{color:#ff5fa2}.kn-home .w2{color:#2ec4b6}"
  + '.kn nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}'
  + '.kn nav a{font:700 17px/1.2 system-ui,Segoe UI,Roboto,sans-serif;color:#1b1f3b;background:#fff;border:3px solid #1b1f3b;border-radius:999px;padding:8px 16px;text-decoration:none;white-space:nowrap}'
  + '.kn nav a[aria-current]{background:#ffd23f}'
  + '@media(max-width:700px){.kn{padding:8px 12px;gap:10px}.kn-back{width:56px;height:56px;padding:10px}.kn-home img{width:40px;height:40px}.kn-home .n{font-size:18px}.kn nav{margin-left:0;width:100%;gap:6px}.kn nav a{font-size:15px;padding:6px 12px}}';

const ARROW = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M60 20L30 50L60 80" fill="none" stroke="#1b1f3b" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Back: the page first, then a from= in the address, then the page before (same site), then home.
const SCRIPT = '(function(){var b=document.getElementById("kn-back");if(!b)return;b.onclick=function(){'
  + 'if(typeof window.kidsBackHere==="function"&&window.kidsBackHere())return;'
  + 'var f=location.hash.slice(1).split(/[&,]/).filter(function(p){return p.indexOf("from=")===0})[0];'
  + 'if(f){var to=decodeURIComponent(f.slice(5));if(to.charAt(0)==="/"&&to.charAt(1)!=="/"){location.href=to;return}}'
  + 'if(document.referrer.indexOf(location.origin+"/")===0&&history.length>1){history.back();return}'
  + 'location.href="/"}})();';

function bar(here) {
  return '<header class="kn"><button class="kn-back" id="kn-back" aria-label="Back">' + ARROW + '</button>'
    + '<a class="kn-home" href="/" title="Home"><img src="/assets/kids/mark.svg" alt=""><span class="n"><span class="w1">voidtv.net</span> <span class="w2">kids</span></span></a>'
    + '<nav aria-label="Kids">' + LINKS.filter(([id]) => id !== 'shows' || here !== 'shows').map(([id, href, name]) => '<a href="' + href + '"' + (id === here ? ' aria-current="page"' : '') + '>' + name + '</a>').join('') + '</nav></header>';
}

module.exports = { CSS, SCRIPT, bar, LINKS };
