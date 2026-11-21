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

## How it is built

- One relay for every phone feature: PLAY's rooms (`play/rooms/`, `/api/room/*`), kind `remote` (16 phones, 10 messages a
  second, 12 hours). The relay keeps nothing.
- The phone knows no site. It draws what the screen sends: `r-site` (who the screen is), `r-now` (what is on, with the buttons
  that make sense there), `r-list` (lists, cut to fit 1 KB a message), `r-info` (a show's details). It sends back `r-do`, one
  action by name: `ch`, `tune`, `now`, `go`, `info`, `tv`. Anything else is dropped. Trivia's `t-` messages ride in the same room.
- `src/remote.js`: the shared, tested parts (messages, checks, the saved list). `src/screen.js`: the big screen's side, the same
  for every site. `src/phone.js` and `index.html`: the phone. `src/voidtv.js`: voidtv.net's adapter, the only part that knows
  voidtv.net (it acts through the page's own tune, surf, tvNow and go, so the schedule stays the clock's).
- Another VoidTV site (Kids, Void Cast) adds its own adapter with the same five calls (site, now, lists, info, act) and loads
  `screen.js` with it. Kids sets `kids: true` (no donation line on the phone).

## Before it works on voidtv.net

The rooms Worker (`play/rooms/worker/`) must be deployed with the `remote` kind in it, from Bryan's own terminal, as for the PLAY
phone controllers. Until then the button says the remote did not open; on the local PLAY server (`node play/serve.js`) it works.

Tests: `node --test tests/remote.test.js`.
