# The phone remote

Bryan, 20 Nov 2026: "using the qr code phone dynamic in creating a remote control to use across void tv in a custom way where
things are on the phone where ppl can select, a channel switcher, save to phone, info on the phone about the show, hold
information". And: "also use this for cast, and kids, across the entire voidtv universe".

## What it does

- The big screen's Phone remote button (on Live TV, beside Open show) shows a QR code and four letters.
- A phone that scans it, or types the letters at voidtv.net/join, becomes the remote. No app, no account.
- Remote tab: what is on now (channel, show, episode, time left, what is next), big CH buttons, About (year, network, stars,
  the story), Save to phone, Watch it now during a break, and every channel with what is on it (tap one to put it on).
- Saved tab: shows saved on this phone only. Open one on the phone, or put it on the big screen. One CASH donation line at the
  bottom (never on Kids).
- A reload of the big screen keeps the room for 45 seconds, so the phones stay connected.
- Trivia in the breaks (Bryan, 20 Nov 2026: "Trivia in breaks"):
  - In a Live TV break, three cards ask one question about the show that just played, and the fourth gives the answer and its source.
  - The question is the same for everyone on the channel: `trivia/src/live.js` picks it from the channel and the airing.
  - The cards are 5 to 8, or 13 to 16 when a video spot holds 8 to 11, so trivia never sits next to another spot. A break shorter than that has none, and so does a show with no questions (card 5 stays a fact spot). Never on kids channels.
  - Phones in the room answer it with Trivia Night's own messages (`t-q`, `t-a`, `t-got`, `t-res`) and get points, early answers worth more (Trivia's `points`).
  - The big screen says how many phones answered and how many got it. Scores last the evening, and a reload keeps them.
- Pop-ups during the show (Bryan, 20 Nov 2026: "a small vtv icon we make for trivia to pop up and then on the phone/ device
  connected from the ppl the info pops up to not obscure"):
  - While phones are in the room, a question pops up 3 minutes into an episode and then every 5 minutes, the same moment for everyone on the channel (`popAt` in `src/remote.js`).
  - The big screen shows only a small icon in the picture's top corner, with "1 of 2 answered" and then "got it", fading out after the result. The question is on the phones, which buzz.
  - The question is the clip chat's line just said (`trivia/src/timed.js`) when one is approved for that moment. Otherwise it is one about the show as a whole that gives nothing away (`trivia/src/live.js`, during).
  - Never on kids channels, never in the last minute of an episode. The icon's look is one setting, `ICON` in `src/voidtv.js`: the little neon TV as HQ shows it, in a circle (Bryan, 20 Nov 2026: "the lil neon tv used in the hq").

## The watch party (Bryan, 20 Nov 2026: "my parents live in central tz and i eastern ... the party that initiated gets their live tv to be the dominant and then when the others go they are on that one")

- On Live TV, **Watch party** (beside Phone remote): start a party on this TV, or join another TV's with its code.
- The first TV leads. A TV that joins plays Live TV in the first TV's time zone (`TVG.setOff` with `tzOff`), on its channel,
  and follows each channel change. Its own channel buttons wait ("In a watch party the first TV picks the channel").
  - Live TV is worked out from the clock in a zone, so the same zone means the same moment of the same airing everywhere. Times still show in each home's own time.
- Phones in either home scan their own TV's code. All play one game: the break trivia and the pop-ups, one score list.
  - Each phone is named by its home's city, never a person's name ("1st Phone 2 (New York) 530").
  - The list shows on every TV's trivia answer card, and the pop-up icon shows on every TV.
- Leaving gives the TV back its own zone and channel, even after a reload during the party. A reload of either TV keeps the party.
- A TV whose clock is more than 5 seconds off the first TV's says so in its panel; the clock is not corrected.
- Messages, all inside the remote's room:
  - `p-hi`: a TV joins, with its zone.
  - `p-tv`: the first TV's zone, channel and clock, on each change and every 30 s.
  - `p-quiz`: the open question's counts.
  - `p-score`: the list.
  - A phone that scanned a joined TV's code says so in its `r-hi` (`h`).
- Built: `src/party.js` (the joining TV), the party parts of `src/screen.js` (the first TV) and `src/voidtv.js` (zone and channel), and `src/remote.js` (`tzOff`, `zoneCity`, `partyScores`, `scoreLine`).
- Not yet: the clip chat's spot-it and whodunit rounds on the phones, and the Mystery channel screens. Each waits on Bryan's go.

## Pause, search and the play areas (Bryan, 22 Nov 2026: "the phone remote needs to have pause on it and also work for searching and interacting with the direct play areas of vtv")

He picked two options from pictures: L1 for Live TV and P1 for PLAY.

- **Pause and Play.** On Demand: the player's own pause and play (the same as its button), with the episode's time left and
  Next episode. A show page with nothing playing offers Play, which starts the show where this home left off.
- **Pause on Live TV (L1).** Live TV is the clock's, so Pause holds this TV's picture only. Play from here goes on from where it
  paused, behind the channel. Once more than 20 seconds behind, the phone says how far ("4 min behind live") and offers
  **Back to live**, which plays what the clock says now. Nothing starts early, and the next show still starts at its time: after a
  long pause the break is shorter, or this TV joins the next show where the clock is. No pause in a break (the cards are live).
- **Find tab.** The words go to the big screen, which searches with its own site's search and answers that phone alone. On
  voidtv.net that is the list page's own `qHit` (`scripts/lib/app.js`), past the adult door, shows and movies; names that start
  with the words first. A tap opens the result on the big screen, where Play starts it. On PLAY it searches the games.
- **Areas tab.** Every open area of the shared menu (`assets/brand/areas/areas.js`); a tap puts it on the big screen.
  - On voidtv.net itself (On Demand, Live TV, PLAY, Trivia) the room follows the big screen: the tab keeps it, and the next page
    takes it back within 45 seconds (`src/follow.js` on PLAY's shelf and game pages and Trivia's host page, loading the area's
    adapter only for a tab that holds a room). Live TV after a page change waits for Turn on, as always; the phone says
    "Live TV is off" and its Turn on does what that button does.
  - An area on its own address (University, Kids, Hindi, lexROM) cannot take the room: the phone is told where the big screen
    went (`r-away`), and the remote ends.
- **PLAY (P1).** The phone shows the most played games and searches them. A tap starts the game on the big screen and the phone
  becomes its controller: the shelf opens its own phone room (kind `pad`), the screen tells that one phone the room's four letters
  (`r-hand`), and the phone goes to `/join` with them, which opens PLAY's own pad page. The big screen waits until the phone is in
  that room (8 s at most), then opens the game, which takes the room back as it does for any phone from the shelf. **Phone as
  controller** does the same without a game: the pad steers the shelf. On a game page the remote offers Phone as controller,
  Back to the games and Live TV. The phone's Back button returns from the pad to the remote, still in its seat.
- **Trivia.** The phone presses the host screen's own buttons, only those and only while the screen shows them: Start, Start the
  game, Play again, and Pause (Go on while paused). Once a game has its room, **Play on this phone** hands the phone to Trivia's
  answer page the same way (`r-hand`). A phone answering there cannot also press Start the game; another phone, or the screen, does.
- Night audit N10 still holds: the phone takes no address from a message. A hand-over carries four letters, the same a person
  types at voidtv.net/join; the phone builds `/join?r=` itself. An area, a game or a show is an id the screen looks up in its own
  list.
- Built: `src/remote.js` (actions, `actOk`, `rowDo`, `handMsg`, `handPath`, `behind`, `rankFind`), `src/screen.js` (`find`, `hand`,
  `away`, `area`, `areaList`), `src/voidtv.js`, `src/play.js`, `src/trivia.js`, `src/follow.js`, `src/phone.js`, `index.html`;
  small hooks in `play/src/shelf-phones.js` (`PlayShelfPhones`), `trivia/src/host.js` (`TriviaHostRoom`), the three pages'
  script tags, and the build stamps (`scripts/site.js`, `scripts/trivia/stamp.js`).
- Not yet: a "Back to the remote" button on PLAY's pad page and Trivia's answer page (the phone's own Back does it now); pause in
  a PLAY game from the remote (the pad's Menu pauses it); tried on a real phone and a real TV browser (autoplay after Live TV's
  Turn on from the phone is the browser's call; every check here was a local build with the local relay, muted).

## How it is built

- One relay for every phone feature: PLAY's rooms (`play/rooms/`, `/api/room/*`), kind `remote` (16 phones, 10 messages a
  second, 12 hours). The relay keeps nothing.
- The phone knows no site. It draws what the screen sends: `r-site` (who the screen is, and what its search box searches),
  `r-now` (what is on, with the buttons that make sense there), `r-list` (lists, cut to fit 1 KB a message, each saying what a
  tap on a row does), `r-info` (a show's details), `r-hand` (an area's own phone room, by its code), `r-away` (the screen went to
  another address). It sends back `r-do`, one action by name: `ch`, `tune`, `now`, `go`, `info`, `tv`, `pause`, `play`, `live`,
  `find`, `watch`, `area`, `game`, `press`, `hand`. Anything else is dropped. Trivia's `t-` messages ride in the same room.
- `src/remote.js`: the shared, tested parts (messages, checks, the saved list). `src/screen.js`: the big screen's side, the same
  for every site. `src/phone.js` and `index.html`: the phone. `src/voidtv.js`: voidtv.net's adapter, the only part that knows
  voidtv.net (it acts through the page's own tune, surf, tvNow and go, so the schedule stays the clock's).
- Another VoidTV site (Kids, Void Cast) adds its own adapter with the same five calls (site, now, lists, info, act) and loads
  `screen.js` with it. Kids sets `kids: true` (no donation line on the phone).

## Before it works on voidtv.net

The rooms Worker (`play/rooms/worker/`) must be deployed with the `remote` kind in it, from Bryan's own terminal, as for the PLAY
phone controllers. Until then the button says the remote did not open; on the local PLAY server (`node play/serve.js`) it works.

Tests: `node --test tests/remote.test.js`.
