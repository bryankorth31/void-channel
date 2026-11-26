/* Every voidtv.net area, in one list, with one menu and one small ad (Bryan, 20 Nov 2026: "i need all the different void
   areas and pages now baring cast, to be advertised and or displayed in the proper way on each others headers. either a
   hamburger menu wit ocassionall other small ads on thew other sightes". From the pictures he picked M1, a hamburger at the
   left that opens a side drawer, and A1, an HCN-style card between rows.)

   One file serves every area. voidtv.net, PLAY and Trivia load it from /assets/brand/areas/areas.js; the sites on their own
   address (University, Hindi) load it from https://voidtv.net/assets/brand/areas/areas.js, so a new area is ONE new line in
   AREAS below, and it shows everywhere on the next voidtv.net push, with no other site rebuilt.

   On a page:
     <span data-void-areas-menu></span>      the hamburger button goes here (in the header)
     <div data-void-areas-ad></div>          one small card for another area goes here
     <div data-void-closing></div>           the closing line goes here, under the room's own footer
     <div data-void-notfound></div>          the "not found" words and every room go here, on a page for an address that is not there
     <script src=".../areas.js" defer data-here="play" data-ad-into="#rows" data-ad-at="3"></script>
       data-here       which area this page is (else worked out from the address)
       data-site       "main" when the page is on voidtv.net itself (else worked out from the address)
       data-ad-into/at  also put a card after that many children of that box, whenever the box is filled again
       data-ads="off"  the menu only, no card (University: Open Yale's terms say no ads there)

   The menu opens as "the voidverse" (Bryan, 25 Nov 2026, "Yes, your picks": N1, W2, B2). The whole has a name, the voidverse;
   voidtv.net stays the address and the wordmark, in the middle. Every room sits round it and the room you are in is lit, with
   "You are here". The sites made for a group of people (chip: kids and the three language sites) are a row of buttons under the
   rooms, in the list's own order. Words a visitor sees are plain ones: rooms, your phone. Each room carries its mark from the
   set he picked the same day ("S2 neon line").

   The closing line (Bryan, 25 Nov 2026, "Yes, your picks": join J10). Every room ends with the same short line, in the same
   words: the room is one room of the voidverse, free, a project of CASH. "From the Internet Archive" is said only where it is
   true (ia: true on the room's line; Trivia Night, Card games and lexROM are not from the Archive). It asks for nothing.

   The "not found" block (Bryan, 25 Nov 2026, "Yes, your picks": join J11). A page for an address that is not there says so in
   one line and offers every room, each with its mark. No room is lit there: the visitor is in none of them. A site gives the
   block a place on its own "not found" page and may put its own plain words inside the place; they show if this file fails to load.

   Rules: Void Cast is never here (Bryan's private viewer). Kids (kids.voidtv.net) never loads this file: its links to the
   other areas sit behind the grown-up check (its profile's portals), and no card is ever shown to a child. Only live areas
   are listed: set live: true when an area opens. Copy says shows and movies, free, no account, no ads sold. */
(function () {
  'use strict';
  if (window.VoidAreas) return;

  // id, menu name, one line for the menu, where it lives (main = voidtv.net), the card's words and picture.
  var MAIN = 'https://voidtv.net';
  // The one donation setting (voidverse join J7; Bryan, 25 Nov 2026: "Yes, your picks", then "Same link" for University and "Yes, build it").
  // Every room asks for a donation to CASH through these two addresses and no other; monthly is voidtv.net's monthly donation. Change
  // them here. A link a page marks with data-void-donate (or data-void-donate="monthly") gets its address from here each time the page
  // is drawn. A room keeps the same address typed in its own file as a spare, for the moment this file has not loaded;
  // tests/areas.test.js fails while any spare differs, so the spares are changed in the same commit.
  var DONATE = { url: 'https://square.link/u/bJl9PGAC', monthly: 'https://square.link/u/H1GYlvzp' };
  var AREAS = [
    { id: 'ondemand', ia: true, name: 'On Demand', line: 'Shows and movies, free', site: 'main', path: '/', live: true,
      kicker: 'Shows and movies', head: 'Shows and movies, free.', text: 'Pick a show, start an episode. Free, no account, no ads sold.',
      go: 'Browse shows', pic: '/assets/brand/bg/wall-m.jpg' },
    { id: 'live', ia: true, name: 'Live TV', line: 'Channels, always on', site: 'main', path: '/tv', live: true,
      kicker: 'Live TV', head: 'Turn it on. Something good is on.', text: 'Channels that play all day, with a guide like real TV. Free, no account.',
      go: 'Watch live', pic: '/assets/brand/bg/watcher-purple-m.jpg' },
    { id: 'play', ia: true, name: 'PLAY', line: 'Old games, free to play', site: 'main', path: '/play/', live: true,
      kicker: 'Games', head: 'Old games, free to play.', text: 'Arcade and computer games from the Internet Archive, right in your browser. Your phone can be the controller.',
      go: 'Play now', pic: '/assets/brand/bg/voidarcade-wall-m.webp' },
    { id: 'trivia', name: 'Trivia Night', line: 'Play along on the big screen', site: 'main', path: '/trivia/', live: true,
      kicker: 'Trivia', head: 'Trivia night at home.', text: 'Questions on the TV, answers on your phones. Play with the whole room.',
      go: 'Start trivia', pic: '/assets/brand/bg/trivianight-m.webp' },
    // Card games (Bryan, 23 Nov 2026: "Yes, add it"): the table on the TV, each hand on its own phone. Its picture is the real
    // table on voidtv.net, a Spades trick with four players round it.
    { id: 'cards', name: 'Card games', line: 'The table on the TV, your hand on your phone', site: 'main', path: '/cards/', live: true,
      kicker: 'Card games', head: 'Card night at home.', text: 'The table on the TV, each hand on its own phone. Spades, Hearts, Rummy and more, free, no account.',
      go: 'Deal a game', pic: '/assets/brand/bg/cardtable-m.webp' },
    { id: 'university', ia: true, name: 'Void University', line: 'Big ideas, shown with everyday things', site: 'university', url: 'https://university.voidtv.net/', live: true,
      kicker: 'Learning', head: 'Big ideas, shown with everyday things.', text: 'Free courses built from real lectures, with things to try. No account.',
      go: 'Start learning', pic: 'https://university.voidtv.net/img/c-critical-thinking.jpg' },
    { id: 'kids', ia: true, chip: 'kids', name: 'voidtv.net kids', line: 'Shows and games for children', site: 'kids', url: 'https://kids.voidtv.net/', live: true,
      kicker: 'For children', head: 'Cartoons you grew up with. Shows that teach.', text: 'Picked by people, with computer games too. Nothing to sign up for.',
      go: 'Open kids', pic: 'https://kids.voidtv.net/assets/kids/mark.svg', picFit: 'contain' },
    // Outside voidtv.net (Bryan, 21 Nov 2026, "yes" to the whole-house plan's question 5: Read joins the house as one line,
    // linking lexROM where it is). Its card does not say "Also on voidtv.net" (also).
    { id: 'read', name: 'lexROM', line: 'Books read one word at a time', site: 'lexrom', url: 'https://lexrom.bspokevisuals.com/', live: true,
      also: 'Also free', kicker: 'Reading', head: 'Read a book one word at a time.', text: 'Free classics, your own books and the news, on the breath. No account.',
      go: 'Open lexROM', pic: 'https://lexrom.bspokevisuals.com/icon-512.png', picFit: 'contain' },
    // The language sites come last, Spanish first, then West Side, then Hindi (Bryan, 23 Nov 2026: "Hindi void should not be in the list higher then
    // any other void verse page aside from west side or spanish"; then 24 Nov 2026, in the sister sites chat: "Hindi needs to be really relegated to
    // the sidelines of things even underneath Spanish it should go Spanish and then the West side and then Indy or Indian"). Every other room,
    // lexROM among them, stands above all three.
    // West Side and Spanish have been online since 22 Nov 2026 (Bryan: "Yes, put them online") but were missing here, so no other
    // room led to them and they led to none (Bryan, 23 Nov 2026, "Yes, both", to the same menu as Hindi).
    { id: 'espanol', ia: true, chip: 'español', name: 'voidtv.net español', line: 'Películas y series en español', site: 'espanol', url: 'https://espanol.voidtv.net/', live: true,
      kicker: 'Español', head: 'Películas y series en español.', text: 'Spanish films and shows, and dubs, Latin American first. Free, no account.',
      go: 'Abrir español', pic: '/assets/brand/bg/watcher-purple-m.jpg' },
    { id: 'westside', ia: true, chip: 'west side', name: 'voidtv.net west side', line: 'Films and shows from West Africa', site: 'westside', url: 'https://westside.voidtv.net/', live: true,
      kicker: 'West Africa', head: 'Films and shows from Ghana and Nigeria.', text: 'Kumawood, Ghallywood and Nollywood, free, no account.',
      go: 'Open west side', pic: '/assets/brand/bg/sign-pink-m.jpg' },
    { id: 'hindi', ia: true, chip: 'hindi', name: 'voidtv.net hindi', line: 'हिंदी में फ़िल्में और शो', site: 'hindi', url: 'https://hindi.voidtv.net/', live: true,
      kicker: 'हिंदी', head: 'हिंदी में फ़िल्में और शो', text: 'Hindi films and shows, Hindi dubs and Live TV. Free, with an English switch.',
      go: 'Open hindi', pic: '/assets/brand/bg/sign-orange-m.jpg' }
    // An area not open yet goes here with live: false; it joins the menu and the cards the day live turns true.
  ];

  // Each room's mark, the "neon line" set (Bryan, 25 Nov 2026: "S2 neon line"), in the brand's pink and blue only. The same
  // drawings are the files in /assets/brand/marks/<id>.svg (an install icon or a share card takes them from there); a test holds
  // the two equal. Here they are part of this one file, so the menu asks no site for a picture. A room without a mark is a plain ring.
  var MARKS = {
    ondemand: '<path d="M32 24 L21 9 M32 24 L43 9" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="21" cy="9" r="2" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/><circle cx="43" cy="9" r="2" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/><rect x="10" y="24" width="44" height="29" rx="6" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><rect x="15" y="29" width="34" height="19" rx="3" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M28 33 L38 38.5 L28 44 Z" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/><path d="M18 53 L16 57 M46 53 L48 57" fill="none" stroke="#ff4fc8" stroke-width="3.4"/>',
    live: '<path d="M32 30 L23 57 M32 30 L41 57 M26.5 47 L37.5 47" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M24.9 18.9 A10 10 0 0 0 24.9 33.1 M39.1 18.9 A10 10 0 0 1 39.1 33.1" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M19 13 A18 18 0 0 0 19 39 M45 13 A18 18 0 0 1 45 39" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="32" cy="26" r="4" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4"/>',
    play: '<path d="M31 42 L26 23" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="25" cy="17" r="7" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/><rect x="10" y="42" width="44" height="13" rx="5" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M16 48.5 H24" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="44" cy="37.5" r="3.5" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/>',
    trivia: '<rect x="17" y="8" width="30" height="46" rx="6" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M25.5 25 A6.5 6.5 0 1 1 35.5 30.5 Q32 32.5 32 38" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="32" cy="45" r="2.2" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4"/><path d="M52 10 V16 M49 13 H55" fill="none" stroke="#ff4fc8" stroke-width="3.4"/>',
    cards: '<rect x="10" y="12" width="25" height="37" rx="4" fill="none" stroke="#ff4fc8" stroke-width="3.4" transform="rotate(-14 22 50)"/><rect x="27" y="13" width="25" height="37" rx="4" fill="none" stroke="#ff4fc8" stroke-width="3.4" transform="rotate(10 40 50)"/><path d="M40.5 22 L47 31.5 L40.5 41 L34 31.5 Z" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4" transform="rotate(10 40 50)"/>',
    university: '<path d="M22 24 L42 24 L52 43 L12 43 Z" fill="#ff4fc8" fill-opacity="0.22" stroke="none" stroke-width="3.4"/><path d="M32 4 V12" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M22 24 L27 12 L37 12 L42 24 Z" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M9 45 Q20.5 41 32 46 Q43.5 41 55 45 V55 Q43.5 51 32 56 Q20.5 51 9 55 Z" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M32 46 V56" fill="none" stroke="#5fe3ff" stroke-width="3.4"/>',
    kids: '<path d="M32 6 L48 24 L32 44 L16 24 Z" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="27" cy="21.5" r="2.4" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4"/><circle cx="37" cy="21.5" r="2.4" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4"/><path d="M26.5 29 Q32 34 37.5 29" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M32 44 Q25 50 31 54 Q37 58 31 62" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M23.5 49 L28.5 51.5 L23.5 54 Z" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/>',
    read: '<rect x="7" y="21" width="50" height="22" rx="5" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M21 32 H43" fill="none" stroke="#5fe3ff" stroke-width="6.8"/><circle cx="13.5" cy="32" r="1.6" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4" opacity="0.55"/><circle cx="50.5" cy="32" r="1.6" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4" opacity="0.55"/><path d="M32 11 V18 M32 46 V53" fill="none" stroke="#ff4fc8" stroke-width="3.4"/>',
    espanol: '<path d="M32 10 C46 10 56 18 56 28 C56 38 46 46 32 46 C29 46 26 45.5 23.5 45 L12 53 L15 42 C10 38 8 33 8 28 C8 18 18 10 32 10 Z" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><text x="32" y="37" font-size="27" font-family="\'Segoe UI\',Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#ff4fc8">ñ</text>',
    westside: '<circle cx="32" cy="32" r="23" fill="none" stroke="#ff4fc8" stroke-width="3.4"/><path d="M32 9 A9 23 0 0 1 32 55" fill="none" stroke="#ff4fc8" stroke-width="1.7" opacity="0.55"/><path d="M20 20 Q27 15 35 16.5 L40 19.5 L44 22 L49 24.5 L43.5 29.5 Q44.5 36 41.5 42 Q38.5 48 34 52.5 Q31.5 47 32 41 Q30 36.5 25.5 36 Q19.5 35.5 16.5 30.5 Q15 24.5 20 20 Z" fill="#5fe3ff" stroke="#5fe3ff" stroke-width="3.4"/>',
    hindi: '<path d="M13 12 H51 Q56 12 56 17 V39 Q56 44 51 44 H31 L20 54 V44 H13 Q8 44 8 39 V17 Q8 12 13 12 Z" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><text x="32" y="38.5" font-size="25" font-family="\'Nirmala UI\',\'Nirmala UI Semilight\',sans-serif" font-weight="700" text-anchor="middle" fill="#ff4fc8">हि</text>',
    phone: '<rect x="19" y="6" width="26" height="52" rx="6" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M29 11.5 H35" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M28 51 H36" fill="none" stroke="#5fe3ff" stroke-width="3.4"/><path d="M29 22 H35 V27 H40 V33 H35 V38 H29 V33 H24 V27 H29 Z" fill="#ff4fc8" stroke="#ff4fc8" stroke-width="3.4"/>'
  };

  var me = document.currentScript;
  var opt = function (k) { return me && me.getAttribute('data-' + k); };
  var host = location.hostname;
  var local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  // main = voidtv.net itself (and its Pages previews, and a local build); a *.voidtv.net site is the first part of its
  // address; any other address (lexROM) is "other", so voidtv.net's links stay whole and nothing is marked unless the page
  // says data-here.
  var site = opt('site') || (host === 'voidtv.net' || host === 'www.voidtv.net' || /\.voidtvsite\.pages\.dev$/.test(host) || local ? 'main'
    : (/\.voidtv\.net$/.test(host) ? host.split('.')[0] : 'other'));
  var onMain = site === 'main';
  var root = onMain ? '' : MAIN;                  // pictures and voidtv.net paths, from here
  var hereId = function () {
    var h = opt('here'); if (h) return h;
    if (!onMain) return site;
    var p = location.pathname;
    if (/^\/play(\/|$)/.test(p)) return 'play';
    if (/^\/trivia(\/|$)/.test(p)) return 'trivia';
    if (/^\/cards(\/|$)/.test(p)) return 'cards';
    if (/^\/tv(\/|$)/.test(p)) return 'live';
    return 'ondemand';
  };
  var href = function (a) { return a.site === 'main' ? root + a.path : a.url; };
  var pic = function (a) { return /^https?:/.test(a.pic) ? a.pic : root + a.pic; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var live = AREAS.filter(function (a) { return a.live; });
  var rooms = live.filter(function (a) { return !a.chip; });     // round the middle
  var chips = live.filter(function (a) { return a.chip; });      // the row under them

  // Where each room sits: evenly round the middle, in the list's own order, so a new room in AREAS takes its place by itself.
  // A wide window starts at the left and goes over the top; a tall one (a phone held upright) starts at the top. In hundredths
  // of the box the rooms are drawn in.
  function spots(n, tall) {
    var out = [], rx = tall ? 33 : 40, ry = tall ? 38 : 35, from = tall ? -90 : 180;
    for (var i = 0; i < n; i++) {
      var t = (from + i * 360 / n) * Math.PI / 180;
      out.push({ x: Math.round((50 + rx * Math.cos(t)) * 10) / 10, y: Math.round((50 + ry * Math.sin(t)) * 10) / 10 });
    }
    return out;
  }
  // One glow for every mark, drawn once in the opened menu; each mark is a small drawing in the brand's pink and blue.
  var GLOW = '<svg class="va-defs" width="0" height="0" aria-hidden="true"><defs><filter id="va-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs></svg>';
  function mark(id) {
    return MARKS[id] ? '<svg class="va-mark" viewBox="0 0 64 64" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round" filter="url(#va-glow)">' + MARKS[id] + '</g></svg>' : '';
  }
  function linesHtml(p, cls, here, tall) {
    return '<svg class="va-lines ' + cls + '" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="50" cy="50" rx="' + (tall ? 33 : 40) + '" ry="' + (tall ? 38 : 35) + '"/>'
      + rooms.map(function (a, i) { return '<line x1="50" y1="50" x2="' + p[i].x + '" y2="' + p[i].y + '"' + (a.id === here ? ' class="on"' : '') + '/>'; }).join('') + '</svg>';
  }
  // The closing line for the room named in here, as text (the tests read it too). An address that is no room gets none.
  function closingHtml(here) {
    var a = live.filter(function (x) { return x.id === here; })[0];
    if (!a) return '';
    return '<p class="va-close">' + esc(a.name) + ' is one room of <b>the voidverse</b>: free, ' + (a.ia ? 'from the Internet Archive, ' : '')
      + 'a project of <a href="https://cashvalues.org" target="_blank" rel="noopener">CASH</a> (cashvalues.org).</p>';
  }
  // The "not found" block, as text (the tests read it too): the words, then every room as a button with its mark.
  function notFoundHtml() {
    return '<div class="va-nf">' + GLOW + '<h1 class="va-nf-h">That page is not here.</h1>'
      + '<p class="va-nf-p">The address may be old or mistyped. Every room of <b>the voidverse</b> is still open:</p>'
      + '<div class="va-nf-rooms">' + live.map(function (a) {
        return '<a class="va-chip" href="' + esc(href(a)) + '" data-va="' + a.id + '" title="' + esc(a.line) + '">' + mark(a.id) + esc(a.chip || a.name) + '</a>';
      }).join('') + '</div></div>';
  }
  // What the opened menu holds, as text, for the room named in here (the tests read it too).
  function mapHtml(here) {
    var w = spots(rooms.length, false), t = spots(rooms.length, true);
    var cur = function (a) { return a.id === here ? ' aria-current="page"' : ''; };
    return '<div class="va-stage">' + GLOW + linesHtml(w, 'va-lw', here, false) + linesHtml(t, 'va-lt', here, true)
      + '<span class="va-hub"><span class="va-wm">voidtv<i>.net</i></span></span>'
      + '<ul class="va-list">' + rooms.map(function (a, i) {
        return '<li style="--wx:' + w[i].x + ';--wy:' + w[i].y + ';--tx:' + t[i].x + ';--ty:' + t[i].y + '"><a href="' + esc(href(a)) + '"' + cur(a) + ' data-va="' + a.id + '" title="' + esc(a.line) + '">'
          + (a.id === here ? '<em class="va-here">You are here</em>' : '') + '<i class="va-dot' + (MARKS[a.id] ? ' has' : '') + '">' + mark(a.id) + '</i><b>' + esc(a.name) + '</b></a></li>';
      }).join('') + '</ul></div>'
      + '<div class="va-rows"><div class="va-row va-also"><span class="va-k">Also for</span>' + chips.map(function (a) {
        return '<a class="va-chip" href="' + esc(href(a)) + '"' + cur(a) + ' data-va="' + a.id + '" title="' + esc(a.line) + '">' + mark(a.id) + esc(a.chip) + (a.id === here ? ' <em>you are here</em>' : '') + '</a>';
      }).join('') + '</div>'
      + '<div class="va-row"><span class="va-say">' + mark('phone') + 'Your phone joins any room:</span><a class="va-chip" href="' + root + '/join" data-va="join">Type a code</a></div></div>'
      + '<p class="va-foot">All free. No account. No ads sold.</p>';
  }

  var CSS = ''
    + '.va-burger{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;flex:none;padding:0;margin:0;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:rgba(255,255,255,.04);color:#e8e6f0;cursor:pointer}'
    + '.va-burger:hover,.va-burger:focus-visible{border-color:#ff4fc8;color:#fff;outline:none}'
    + '.va-burger svg{width:20px;height:20px;display:block}'
    // The drawer's own layer: some sites lift every top-level box (University: position relative, z-index 1 under a sticky header).
    + '.va-wrap{position:fixed!important;inset:0;z-index:2147483000!important;display:block}.va-wrap[hidden]{display:none!important}'
    + '.va-shade{position:fixed;inset:0;z-index:2147483000;background:rgba(3,3,8,.6);opacity:0;transition:opacity .2s}'
    // The opened menu fills the window: a top line, the rooms round the middle, the two rows, the closing line.
    + '.va-drawer{position:fixed;inset:0;z-index:2147483001;display:flex;flex-direction:column;overflow-y:auto;background:radial-gradient(ellipse at 50% 42%,rgba(23,17,42,.97) 0%,rgba(7,8,12,.97) 72%);opacity:0;transition:opacity .2s ease;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;color:#dcd8e8;padding:14px 22px 12px;box-sizing:border-box}'
    + '.va-open .va-shade{opacity:1}.va-open .va-drawer{opacity:1}'
    + '@media (prefers-reduced-motion:reduce){.va-shade,.va-drawer{transition:none}}'
    + '.va-top{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}'
    + '.va-ttl{display:block;font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:20px;line-height:1.2;letter-spacing:0;color:#fff}'
    + '.va-sub{display:block;color:#a9a5bd;font-size:13.5px;margin-top:3px}'
    + '.va-wm{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:15px;letter-spacing:0;color:#ff4fc8}.va-wm i{font-style:normal;color:#5fe3ff}'
    + '.va-x{flex:none;width:40px;height:40px;border:0;border-radius:8px;background:transparent;color:#cfcbe0;font-size:28px;line-height:1;cursor:pointer}.va-x:hover,.va-x:focus-visible{background:rgba(255,255,255,.08);color:#fff;outline:none}'
    + '.va-stage{position:relative;flex:1 1 auto;min-height:300px;margin:4px 0 6px}'
    + '.va-lines{position:absolute;inset:0;width:100%;height:100%;display:block}'
    + '.va-lines line,.va-lines ellipse{fill:none;stroke:#2e2b47;stroke-width:1.2;vector-effect:non-scaling-stroke}.va-lines ellipse{stroke-dasharray:3 6}.va-lines line.on{stroke:#ff4fc8;stroke-width:1.6}'
    + '.va-lt{display:none}'
    + '.va-hub{position:absolute;left:50%;top:50%;width:116px;height:116px;margin:-58px 0 0 -58px;border-radius:50%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#0d0d15;border:1px solid #2a6f80;box-shadow:0 0 34px -8px rgba(95,227,255,.4)}'
    + '.va-list{position:absolute;inset:0;list-style:none;margin:0;padding:0}'
    + '.va-list li{position:absolute;left:calc(var(--wx)*1%);top:calc(var(--wy)*1%);width:0;height:0;margin:0;padding:0}'
    + '.va-list a{position:absolute;left:-75px;top:-24px;width:150px;display:flex;flex-direction:column;align-items:center;gap:5px;padding:0 0 3px;border-radius:12px;color:#dcd8e8;text-decoration:none;text-align:center}'
    + '.va-list a b{display:block;color:#e8e6f0;font-weight:600;font-size:15px;line-height:1.25;white-space:nowrap;padding:1px 7px;border-radius:7px;background:rgba(10,10,18,.9)}'
    + '.va-defs{position:absolute;width:0;height:0}.va-mark{display:block;flex:none;width:30px;height:30px;overflow:visible}.va-dot{display:flex;align-items:center;justify-content:center;position:relative;width:48px;height:48px;flex:none;box-sizing:border-box;border-radius:50%;border:1.5px solid #4d5273;background:#11121c}'
    + '.va-dot:after{content:"";position:absolute;inset:18px;border-radius:50%;background:#4d5273}.va-dot.has:after{display:none}'
    + '.va-list a:hover .va-dot,.va-list a:focus-visible .va-dot{border-color:#5fe3ff}.va-list a:hover .va-dot:after,.va-list a:focus-visible .va-dot:after{background:#5fe3ff}'
    + '.va-list a:hover b,.va-list a:focus-visible b{color:#fff}.va-list a:focus-visible,.va-chip:focus-visible{outline:2px solid #5fe3ff;outline-offset:4px}'
    + '.va-list a[aria-current] .va-dot{border:2.5px solid #ff4fc8;background:#1d0a1e;box-shadow:0 0 0 7px rgba(255,79,200,.13),0 0 24px rgba(255,79,200,.65)}.va-list a[aria-current] .va-dot:after{background:#fff}'
    + '.va-list a[aria-current] b{color:#fff;font-weight:700}'
    + '.va-here{position:absolute;left:50%;top:-31px;transform:translateX(-50%);padding:3px 7px;border-radius:7px;background:rgba(10,10,18,.9);font-style:normal;font-weight:700;font-size:12.5px;line-height:1;color:#5fe3ff;white-space:nowrap}'
    + '.va-rows{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 28px}'
    + '.va-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}'
    + '.va-k{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#9f9bb3;margin:0 4px 0 0}.va-say{display:inline-flex;align-items:center;gap:7px;color:#a9a5bd;font-size:13.5px;margin:0 4px 0 0}.va-say .va-mark{width:24px;height:24px}'
    + '.va-chip{display:inline-flex;align-items:center;gap:7px;padding:5px 15px 5px 11px;border:1px solid #3a3f58;border-radius:999px;background:#141522;color:#e8e6f0;font-size:14px;line-height:1.3;text-decoration:none;white-space:nowrap}'
    + '.va-chip .va-mark{width:22px;height:22px}.va-chip[data-va="join"]{padding-left:15px}.va-chip:hover,.va-chip:focus-visible{border-color:#5fe3ff;color:#fff}'
    + '.va-chip[aria-current]{border-color:#ff4fc8;color:#fff;box-shadow:0 0 16px rgba(255,79,200,.55)}.va-chip em{font-style:normal;font-size:12px;color:#5fe3ff}'
    + '.va-nf{max-width:760px;margin:0 auto;padding:56px 20px 44px;text-align:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e8e6f0}.va-nf-h{margin:0 0 12px;font:700 clamp(23px,5vw,36px)/1.2 Unbounded,system-ui,sans-serif;color:#fff}.va-nf-p{margin:0 0 24px;font-size:16px;line-height:1.5;color:#a9a5bd}.va-nf-p b{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:14px;color:#e8e6f0}.va-nf-rooms{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}.va-nf .va-chip{padding:8px 16px 8px 12px;font-size:15px}'
    + '.va-close{margin:12px 0 0;padding:0;text-align:center;font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#a9a5bd}.va-close b{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:12px;color:#e8e6f0}.va-close a{color:inherit;text-decoration:underline}'
    + '.va-foot{flex:none;margin:8px 0 0;color:#8f8ba6;font-size:12.5px;text-align:center}'
    // A phone held upright: the rooms start at the top and go round, the buttons are easier to press.
    + '@media (max-aspect-ratio:1/1){.va-drawer{padding:14px 16px 14px}.va-stage{min-height:430px}.va-lw{display:none}.va-lt{display:block}.va-list li{left:calc(var(--tx)*1%);top:calc(var(--ty)*1%)}.va-hub{width:98px;height:98px;margin:-49px 0 0 -49px}.va-wm{font-size:13px}.va-list a{left:-62px;top:-22px;width:124px}.va-dot{width:44px;height:44px}.va-dot .va-mark{width:28px;height:28px}.va-list a b{font-size:14px}.va-rows{flex-direction:column;align-items:flex-start;gap:14px}.va-also{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:340px}.va-also .va-k{grid-column:1/-1}.va-chip{padding:7px 15px 7px 11px}.va-foot{margin-top:14px}}'
    + '.va-ad{display:flex;gap:14px;align-items:center;max-width:760px;margin:22px 20px;padding:12px;border-radius:14px;background:linear-gradient(#0b0b12,#0b0b12) padding-box,linear-gradient(135deg,#ff4fc8,#5fe3ff 55%,#7b2cff) border-box;border:1.5px solid transparent;box-shadow:0 14px 34px rgba(0,0,0,.5),0 0 40px -16px rgba(255,79,200,.45);color:#dcd8e8;font:15px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none;box-sizing:border-box}'
    + '.va-ad .va-pic{flex:none;width:150px;height:96px;border-radius:9px;overflow:hidden;background:#1a1626}'
    + '.va-ad .va-pic img{width:100%;height:100%;object-fit:cover;display:block}.va-ad .va-pic.fit img{object-fit:contain;padding:10px;box-sizing:border-box;background:#fff6d8}'
    + '.va-ad .va-fk{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:#a9a5bd}'
    + '.va-ad .va-h{display:block;color:#fff;font-weight:700;font-size:17px;margin:2px 0}'
    + '.va-ad .va-t{display:block;color:#cfcbe0;font-size:14px}'
    + '.va-ad .va-go{display:inline-block;margin-top:8px;padding:6px 14px;border-radius:999px;background:#ff4fc8;color:#07080c;font-weight:700;font-size:14px}'
    + '.va-ad:hover .va-go,.va-ad:focus-visible .va-go{background:#5fe3ff}.va-ad:focus-visible{outline:2px solid #5fe3ff;outline-offset:3px}'
    + '@media (max-width:560px){.va-ad{margin:18px 12px;gap:12px;padding:10px}.va-ad .va-pic{width:96px;height:72px}.va-ad .va-h{font-size:15.5px}.va-ad .va-t{font-size:13px}}';

  function style() {
    if (document.getElementById('va-css')) return;
    var s = document.createElement('style'); s.id = 'va-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---- the hamburger and its drawer (the drawer sits on <body>: a header with backdrop-filter would trap a fixed box; a div
  // with role navigation, not a <nav>, so a site's own nav styles, like University's sticky sidebar, never reach it)
  var wrap = null, lastFocus = null;
  function drawer() {
    if (wrap) return wrap;
    wrap = document.createElement('div'); wrap.className = 'va-wrap'; wrap.hidden = true;
    wrap.innerHTML = '<div class="va-shade" data-va-close></div><div class="va-drawer" id="va-drawer" role="navigation" aria-label="The voidverse: every room" tabindex="-1">'
      + '<div class="va-top"><span><b class="va-ttl">the voidverse</b><span class="va-sub">Every room. Tap one to go there.</span></span><button type="button" class="va-x" data-va-close aria-label="Close the menu">&times;</button></div>'
      + '<div class="va-body" style="display:contents"></div></div>';
    document.body.appendChild(wrap);
    // The close button closes it, and so does a press on the empty space between the rooms.
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-va-close]') || !e.target.closest('a,.va-top')) close(); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = wrap.querySelectorAll('a,button'); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return wrap;
  }
  function fillList() {
    wrap.querySelector('.va-body').innerHTML = mapHtml(hereId());
  }
  function open() {
    drawer(); fillList(); lastFocus = document.activeElement;
    wrap.hidden = false;
    void wrap.offsetWidth;                         // lay it out closed first, so it slides (frames pause in a background tab)
    document.documentElement.classList.add('va-open'); wrap.classList.add('va-open');
    setButtons(true);
    var cur = wrap.querySelector('a[aria-current]') || wrap.querySelector('.va-list a');
    setTimeout(function () { (cur || wrap.querySelector('.va-drawer')).focus({ preventScroll: true }); }, 30);
  }
  function close() {
    if (!wrap || wrap.hidden) return;
    wrap.classList.remove('va-open'); document.documentElement.classList.remove('va-open'); setButtons(false);
    var done = function () { if (!wrap.classList.contains('va-open')) wrap.hidden = true; };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 230);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function setButtons(on) {
    document.querySelectorAll('.va-burger').forEach(function (b) { b.setAttribute('aria-expanded', on ? 'true' : 'false'); });
  }
  var BURGER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>';
  function menus() {
    document.querySelectorAll('[data-void-areas-menu]:not([data-va-done])').forEach(function (slot) {
      slot.setAttribute('data-va-done', '');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'va-burger'; b.innerHTML = BURGER;
      b.setAttribute('aria-label', 'The voidverse: every room'); b.setAttribute('title', 'The voidverse: every room');
      b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-controls', 'va-drawer');
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); open(); });
      slot.replaceWith(b);
    });
  }

  // ---- the small card: one other area, the next one on each visit (an even turn through them, not a random pick)
  var turn = (function () {
    var n = 0;
    // Kept as voidtv:menu-turn (the one prefix, voidverse plan M1); the count under its old name, va-turn, is carried over. On
    // voidtv.net this goes through the memory block (assets/brand/memory/memory.js); a site that does not load it does the same here.
    try {
      var M = window.VoidMemory, was = M ? M.get('voidtv:menu-turn') : (localStorage.getItem('voidtv:menu-turn') || localStorage.getItem('va-turn'));
      n = (parseInt(was, 10) || 0) + 1;
      if (M) M.set('voidtv:menu-turn', String(n)); else localStorage.setItem('voidtv:menu-turn', String(n));
    }
    catch (e) { n = Math.floor(Math.random() * 1000); }
    return n;
  })();
  function pick(skip) {
    var here = hereId();
    var others = live.filter(function (a) { return a.id !== here && skip.indexOf(a.id) < 0; });
    return others.length ? others[turn % others.length] : null;
  }
  function card(a) {
    var el = document.createElement('a');
    el.className = 'va-ad'; el.href = href(a); el.setAttribute('data-va', a.id);
    el.setAttribute('aria-label', a.name + ': ' + a.head + ' ' + a.text);
    el.innerHTML = '<span class="va-pic' + (a.picFit === 'contain' ? ' fit' : '') + '"><img src="' + esc(pic(a)) + '" alt="" loading="lazy" decoding="async"></span>'
      + '<span class="va-b"><span class="va-fk">' + esc(a.also || 'Also on voidtv.net') + ' &middot; ' + esc(a.kicker) + '</span><span class="va-h">' + esc(a.head) + '</span>'
      + '<span class="va-t">' + esc(a.text) + '</span><span class="va-go">&#9654; ' + esc(a.go) + '</span></span>';
    return el;
  }
  var adsOff = opt('ads') === 'off';
  function ads() {
    if (adsOff) return;
    var shown = [];
    document.querySelectorAll('[data-void-areas-ad]').forEach(function (slot) {
      if (slot.firstChild) { shown.push(slot.firstChild.getAttribute('data-va')); return; }
      var a = pick(shown); if (!a) return;
      shown.push(a.id); slot.appendChild(card(a));
    });
    var into = opt('ad-into'), at = parseInt(opt('ad-at'), 10) || 2;
    var box = into && document.querySelector(into);
    if (box && !box.querySelector(':scope > [data-va-slot]') && box.children.length > at) {
      var a = pick(shown); if (!a) return;
      var s = document.createElement('div'); s.setAttribute('data-va-slot', ''); s.setAttribute('data-void-areas-ad', '');
      s.appendChild(card(a));
      box.insertBefore(s, box.children[at]);
    }
  }

  var queued = false;
  // The closing line, in every place a page gives it; written again when the page moves to another room without loading anew.
  function closings() {
    var here = hereId();
    document.querySelectorAll('[data-void-closing]').forEach(function (slot) {
      if (slot.getAttribute('data-va-for') === here) return;
      slot.setAttribute('data-va-for', here); slot.innerHTML = closingHtml(here);
    });
  }
  // The "not found" block, in every place a page gives it (once: it does not change with the room).
  function notFounds() {
    document.querySelectorAll('[data-void-notfound]').forEach(function (slot) {
      if (slot.getAttribute('data-va-done')) return;
      slot.setAttribute('data-va-done', '1'); slot.innerHTML = notFoundHtml();
    });
  }
  // Donation links follow the one setting: every link a page has marked gets the address from DONATE.
  function donates() {
    document.querySelectorAll('a[data-void-donate]').forEach(function (a) {
      var u = a.getAttribute('data-void-donate') === 'monthly' ? DONATE.monthly : DONATE.url;
      if (a.getAttribute('href') !== u) a.setAttribute('href', u);
    });
  }
  function run() { queued = false; menus(); ads(); closings(); notFounds(); donates(); }
  function later() { if (!queued) { queued = true; setTimeout(run, 60); } }
  function start() {
    style(); run();
    // Pages that draw themselves (voidtv.net's app, PLAY's rows) put new slots in later: fill them as they come.
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  }
  window.VoidAreas = { areas: AREAS, open: open, close: close, refresh: run, spots: spots, html: mapHtml, marks: MARKS, closing: closingHtml, notFound: notFoundHtml, donate: DONATE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
