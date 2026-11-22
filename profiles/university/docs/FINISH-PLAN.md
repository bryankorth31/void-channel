# FINISH-PLAN: Void University up to the level of Kids

Bryan, 19 Nov 2026: "void university is now the least finished among the builds im wanting done. lets fix that",
then "look at kids and see the level university still needs to be built".

Rule for this plan (17 and 18 Nov): finish, do not expand. Every tool ends runnable without a Claude chat, with
buttons in HQ, local models on this PC for the thinking parts, a plain run guide and a self-test.

Read on 19 Nov 2026: weekly meters 81% all models, 73% Fable; stop line 85% this week, 60% after the 22 Nov reset.
Tests that day: `tests/uni.test.js` 5 of 5, `tests/hq.test.js` 41 of 41, nothing failing.

## Where it stands (21 Nov 2026)

This list is the current one. The table and steps below it are the plan as written on 19 Nov, kept for the record.
Self-test: `node scripts/uni.js selftest`, 4 parts, all pass. `tests/uni.test.js`: 28 of 28.

Done and live: Your money, plainly (8 of 8), Critical thinking (6 of 6, with the two 3D scale stages), The mind's
mechanisms (18 of 18), The body (4 of 4, opening Body Atlas lessons, with the way back). Moving backgrounds, a
second try on quiz answers, fonts kept on the site, Mind Gym at gym.bspokevisuals.com.

Done, on this PC only: the phone lessons, both sides (make questions, answer on phones). Not tried with real phones.

Nothing is left that can be finished without Bryan. What waits on his word, in order:

1. 55 drafted units to read and keep: Human nature 24, Grow your own vegetables 13, Sew, mend and make clothes 10,
   Manners 8. `node scripts\uni.js keep <course> <n>`. This is the largest thing between here and done.
2. How a self holds together is live with both units unfinished (no main piece, no crystal). Take it off the live
   site until they are written, or write them. His full name as author on that page is also his call.
3. Whisper: How the country began is 19 of 25 heard, Why we eat what we eat 0 of 23. Run on a night the lexROM job
   is not using the graphics card.
4. The phone lessons on the live site: built 21 Nov (the answering side). It waits on his University deploy, and
   then on one try with real phones.
5. HQ buttons (Draft, Self-test, Deploy): the HQ areas chat.
6. The VOID ACADEMY sign in the backgrounds against the name Void University.

Parked, not finishing work: new courses in the empty areas, the shelf beyond its first book, Body Atlas units
beyond the ankle lesson that is coming.

## Kids beside University

| Part | Kids today (branch `kids`, C:\Users\bryan\void-kids) | University today | What University lacks |
|---|---|---|---|
| Content depth | A full channel: shows approved by rule and by hand, Play and Learn, Void Village (a whole town of places with tasks), Brave steps, learning breaks | 4 live courses: Critical thinking 6 of 6, The mind's mechanisms 18 of 18, Your money, plainly 8 of 8, Human nature 2 of 26. 12 of 15 areas have no course. 116 old books found, none rewritten | Human nature's other 24 lectures; a first course in the empty areas; the old-knowledge shelf |
| HQ area and buttons | Kids area in HQ: Shows tab works (approve, deny, add). Hunt, Build, Deploy, Breaks, Analytics are scheduled K2 to K5, ready by 28 Nov (HQ areas chat) | University area in HQ: Overview, Courses, Areas, Source check, Help. Buttons: Check sources, Scaffold, Copy brief, Rewrite brief, Listen, Set times, Live, Build preview, Build public copy | Buttons for Draft a unit, Self-test and Deploy (step H5 of docs/PLAN-hq-areas.md, owned by the HQ areas chat) |
| Runs without a Claude chat | Approving, hunting, matching, sound check, build: yes. Drafting questions still uses Claude models | Find check, scaffold, listen, times, build: yes. Writing a unit: no, "Copy brief" goes into a Claude chat | A local draft of a unit (gemma on Ollama) that passes the checks already in `uni.js` |
| Local models | Whisper (listener), Kokoro (voice clips) | Whisper through the Kids listener | gemma for the unit draft and for the old-book rewrite |
| Self-tests | 30 test files, 624 tests | 5 tests plus `test-lab.js`; no one command that runs everything | One self-test command (tests, lab physics, build, offline course checks) |
| Run guide | DEPLOY-KIDS.md and the Kids Help page: steps Bryan runs by himself | COURSE-RECIPE.md tells a Claude chat what to do; HQ Help lists commands; no page written for Bryan alone | docs/RUN.md: start to finish with no chat |
| Deploy from a button | Not yet: a terminal line today, a button in K3 (21 Nov) | A terminal line | The same Deploy button, built once in K3 and reused |
| Listening and questions engine | The listener lives here (`scripts/listen-episodes.py`), questions drafted from what is heard | Uses the Kids listener; quiz quotes checked word for word, times set from Whisper | Nothing: this part is level. The listener reaches master with the kids merge |
| Checks | strict rules, audit, site guards, launch check | `uni.js check`: links, licences, forbidden sources, dashes, quiz quotes, times within 20 s. Last run 16 Nov | A fresh run; the offline half inside the self-test |
| Housekeeping | Built site not tracked in git | `site-preview` is tracked, so every build shows 6 changed files | Stop tracking the preview |
| Audience filter | Rows by age that really differ | Every course lists all three audiences, so "Who is it for?" hides nothing | Honest levels per course |

## The gaps as finish steps

Points are weekly all-models meter points. Each step ends at its finish line, committed, tests passing.

| # | Step | Points | Finish line |
|---|---|---|---|
| 1 | Housekeeping: stop tracking `site-preview`, run a fresh source check | 0.3 | `git status` is clean after a build; check dated today with 0 problems |
| 2 | Self-test: `node scripts/uni.js selftest` (uni tests, lab physics, a preview build, the offline course checks) | 0.4 | One command prints pass or fail per part and exits non-zero on a failure |
| 3 | Run guide: `docs/RUN.md`, written for Bryan alone, every step a button or one line | 0.3 | A person with no chat can add a unit, check it, build it, deploy it from the page |
| 4 | Honest audience levels on the 4 live courses | 0.3 | Picking an audience on the front page hides at least one course; Bryan can change any level in the course file |
| 5 | Local draft: `node scripts/uni.js draft <slug> <unit>`. gemma on Ollama reads the heard lecture and writes needIt, chapters, quiz and crystal into a draft file; the quote check, the time finder and the dash check are the gate; nothing reaches the course until the gate passes | 1.5 | One Human nature lecture drafted on this PC with every quiz quote found word for word in the transcript; a test covers the gate |
| 6 | HQ buttons: Draft, Self-test, Deploy (with the live check after). In the HQ areas chat's lane (H5, K3) | 1.0 there | Bryan presses Draft on a unit, Self-test, Build public copy, Deploy, and sees the result in HQ |
| 7 | The everyday scene for a drafted unit. A scene is a picture made of stamps; a local model cannot be trusted to place them. Finish line is a small scene picker in HQ (choose stamps and captions from the unit's own analogy line), or scenes stay the one Claude step | 1.5 | A drafted unit gets its scene without a chat, with no overlap at 1316 and 821 wide |
| 8 | Human nature, lectures 3 to 26 (24 units): Listen overnight (about 17 minutes of PC time each, 0 points), Draft each, Bryan keeps or edits | 0.2 each with step 5, 0.5 each by Claude chat | Human nature reads 26 of 26 and is still live |
| 9 | Old-knowledge shelf, first book ("Practical how-to"): a shelf page in build.js, `uni.js rewrite` run by gemma, original beside plain, warnings with the government source | 2.0 | One old book readable on the preview, checked at the three sizes |
| 10 | A first course in each empty area, from the 54 proposed, through steps 5 to 8. The front page already hides empty rows, so this is depth, not a hole | per course: 1 to 4 | Each area row shows a course |

Struck or changed after looking:
- "Deploy is a terminal line" is true for Kids too. It is one shared button (K3), not a University-only gap.
- "The source check is days old": it had 0 problems and 2 hand-open notes on 16 Nov; step 1 reruns it.
- The model named in the brief was gemma on Ollama; this PC has `gemma4:12b` and `gpt-oss:20b`. Step 5 tries gemma first.

## Order

Steps 1 to 5 fit under this week's 85% line (about 2.8 points of the 4 left) and need no HQ file. Step 6 goes to
the HQ areas chat. Steps 7 to 10 start after the 22 Nov reset.

## Log

- 19 Nov 2026: plan written.
- 19 Nov 2026, steps 1 and 2 done: preview no longer tracked; `node scripts/uni.js selftest` (4 parts, all pass);
  fresh source check: 187 links, 0 problems, Gutenberg refused the checker that day (71 links to open by hand).
- 19 Nov 2026, steps 3 and 4 done: `docs/RUN.md`; Human nature and Your money, plainly are now for young adults and
  everyday life (they are full Yale lectures), Critical thinking and the mechanisms keep all three. Picking High
  school on the front page now shows the Mind row only, and an area row with nothing left hides. Seen at 1920, 1316
  and 821 wide in the preview. Bryan can put "high school" back in a course file's `levels` at any time. Not deployed.
- 19 Nov 2026, step 5 done: `node scripts/uni.js draft <slug> <unit>` and `keep`. Trial on Human nature lecture 2
  (already heard): gemma4:12b answered in 17 seconds; 5 of 6 quiz questions kept, each quote said word for word in
  the lecture, times taken from the lecture (the Ring of Gyges quote at 1185 s; Yale's printed mark is 1200), 5
  chapters, a whole crystal, and a scene idea. The one question whose quote was not word for word was dropped and
  listed. `keep` refused the draft because it has no scene yet, as it should. The draft reads plainly but flatter
  than the units written with a chat: Bryan reads each one before keeping it. First try with a strict schema and
  the model's thinking on came back empty after 3 minutes a round; plain JSON with thinking off is what works.
  Human nature now lists its other 24 lectures as units to do, so Listen queues all 24 (about 7 hours of PC time).
  tests/uni.test.js 7 of 7. Step 6 (the HQ buttons) is written up for the HQ areas chat in the shared notes.
- 19 Nov 2026: the stop line for this work is 92% on both weekly meters until the 22 Nov reset. Bryan's words as
  relayed by the "Void University build" chat that day (this chat did not hear them itself): "no, raise the level.
  i want this doine", then he chose 92%. Steps 7, 8 and 9 now, first courses in the empty areas after the reset.
- 19 Nov 2026, step 7 done: the draft now carries its everyday scene. The local model gives only words (two sides,
  the thing between them, what happens, how each ends up, one spoken line, and the idea's own name for each); the
  program lays them out on fixed places (`sceneFrom` in scripts/lib/uni.js) and refuses a word too long for its
  place. Seen in the preview at 1316 and 821 wide on Human nature lecture 1: nothing touches, no sideways scroll.
  Every scene uses the one layout, and the model's analogies are plainer than the hand-made ones. A whole draft
  shows in the preview inside its course, titled "Draft, not kept yet", and never in the public copy.
  `node scripts/uni.js draft <slug> all` drafts every heard lecture still to do.
- 19 Nov 2026, step 8 started: Whisper began on Human nature's other 24 lectures at 9:25 (Bryan: "Yes, listen now").
  Lecture 1 was heard and drafted whole (7 questions, 5 chapters, crystal, scene). Human nature reads 26 of 26
  only after Bryan has read and kept each draft; `keep` is his step.
- 19 Nov 2026, step 9 done: the old-knowledge shelf. First book: A-B-C of vegetable gardening (Rexford, 1916,
  public domain, Archive scan). `node scripts/uni.js shelf plan | write | live`; the printed side is cut from the
  scan by the program, the plain side is the local model's, gated on length; warnings come from
  shelf/warnings.json (one rule so far: old pest poisons, US EPA page opened 19 Nov). The book's page and the front
  page row were checked at 1920, 1316 and 821 wide. Not live: Bryan reads it first.
- 19 Nov 2026: Bryan refilled the usage (both weekly meters read 0% that afternoon; the 92% line stands).
- 19 Nov 2026, step 10 starts now, not after the reset. Bryan's words as relayed by the "Void University build"
  chat, asked whether to start the first courses in the 12 empty areas: "Yes. University needs to be life knowledge
  as well. We can find and create "courses" or "classes"". How it is built (this chat's reading, his to change):
  - A class is a small course built from one old book on the shelf: one unit for each chapter, each with Why you
    need this, a scene, the chapter to read in plain English, a quiz whose answers quote the printed book, and a
    crystal. It is a course like any other (same file, same build, same Live switch), marked `"size": "class"`.
    `node scripts/uni.js class <shelf-id> [name]`, then `draft <slug> all`.
  - A course from filmed or recorded lectures is made the way Human nature is: Listen, then `draft <slug> all`.
  - Only sources already in the source lists with a licence read on the page are used. Books whose text is on
    Gutenberg wait: Gutenberg turned the checker away on 19 Nov, and a site that blocks is left alone.
  - Books with old medicine, first aid, canning, wiring or baby care wait until each has its warning rules, written
    by a person from a government page.
- 19 Nov 2026, step 10 tools built: `uni.js class <shelf-id> [name]` (a class from a shelf book; its units are
  drafted from the printed chapters, and a quiz quote opens its chapter on the book's page), `uni.js lectures <slug>`
  (one unit to do for each lecture in the source's Archive item, video or sound only; sound-only lectures play and
  jump by chapter like filmed ones). Books that number their chapters are cut at the "CHAPTER" marks. A book goes
  public when a live class reads it. Started: Grow your own vegetables (Land, class, 13 units); How the country
  began (Civics and history, Yale HIST 116, 25 filmed lectures) and Why we eat what we eat (Food, Yale PSYC 123,
  23 sound-only lectures) are laid out and wait in line for Whisper after Human nature (about 7 and 11 hours).
  On the shelf and being rewritten: The home dressmakers' guide (1919, Making) and eight chapters of Emily Post's
  Etiquette (1923 printing, Family). tests/uni.test.js 14 of 14.
  Not started, and why: Home, Words and Work and trades (their books are on Gutenberg, which turned the checker
  away that day); Body, Emergencies and most of Family (old medicine, first aid and baby care need warning rules
  first); Machines (its filmed course is Walter Lewin's MIT 8.01, which MIT itself took down in 2014: Bryan's call);
  Law and rights (a Yale sound-only course is ready to lay out the same way: Environmental politics and law).
- 19 Nov 2026, step 10, three areas now have a class in the preview (all drafts, none live): Land, Grow your own
  vegetables (13 units); Making, Sew, mend and make clothes (10 units, from The home dressmakers' guide, 1919);
  Family, Manners that make people comfortable (8 units, from eight chapters of Emily Post's Etiquette, 1923
  printing). Both new books carry a line on their page saying what is of its time. Human nature: 14 of 24 lectures
  drafted. When only the scene is missing from a draft the model is now asked for the scene alone. With more than
  six courses and books the header folds them into one "All courses" list by area, so it stays one row (the live
  site, with four courses, keeps its plain links); the header's own links are no longer caught by the unit list's
  sticky rule. Checked at 1920, 1316 and 821 wide.
- 19 Nov 2026, Bryan in this chat: "now that we have full usage we can really upgrade and update the explainers and
  content and really fill out the info and useability of this", then "also need to revamp the esthetic and overall
  look of university as it is quite dusty looking". Done that day, all in the preview, nothing live:
  - Usability: Find a course or a lesson; Pick up where you left off; Mark this unit done with ticks and counts
    (kept in the reader's browser only); a class unit's chapter is read inside the unit; no empty folds.
  - Explainers: a second scene layout (steps in a row); the 31 class units given plain titles, a Why you need this
    and a hand-written scene each.
  - Look: the colours are settings now, and there are three looks: Navy and brass (the first look), Bright night
    (near black, white type, the voidtv.net cyan, gold and pink, sans headings, brighter photos) and Daylight (light
    page, dark type, blue accent). The picture stages stay dark in every look. The preview header has a Look picker
    (kept per browser); `"look"` in profile.json sets the look the site is built with (classic until Bryan picks).
    Both new looks passed a contrast check on the front page, a course, a class, the mechanisms, a book and the
    credits at 1316 wide, and no sideways scroll at 1920, 1316 and 821.
- 19 Nov 2026: Bryan picked the look: "Bright night". profile.json `"look": "bright"`; the preview and the public
  copy are both built with it. The live site changes at his next deploy.
- 19 Nov 2026, step 8: Whisper finished all 26 Human nature lectures, and every one of the 24 new lectures is
  drafted whole. Bryan in this chat, asked whether to carry on after the chat cleanup note: "Yes, carry on".
  All 24 drafts have a plain title, a Why you need this and an everyday scene written by hand, each idea checked
  against what its lecture says (the seatbelt scene for lecture 25 was corrected to match it). Chapters, quiz,
  crystal, How this reaches you and Do this week are the local model's. Human nature reads 26 of 26 once Bryan has
  read and kept each draft. Whisper moved on to How the country began (Civics).
- 19 Nov 2026, audit round (the audit chat's findings U1 to U8; Bryan in this chat: "Yes, fix them"). The header
  now stays at the top of the window on every page, with a back arrow to Home and an up arrow on the page's own
  name that returns to its start; a link into the middle of a page lands below the header, not under it. The front
  page shows a tile only for an area that has a course, and each tile opens that area's row (no more "coming"
  tiles). A wrong address gets a real page (404.html) with a way to the front page and the course list. The offline
  note in the installed app has a Try again button. The public copies of our scripts carry the code only, no
  working notes, so no name is in a public comment. A course still being added to says the rest are coming and why
  the numbers skip; Human nature no longer says "full course". `node scripts\uni.js live <course> on|off` puts
  a course on or off the public copy without HQ (RUN.md section 8). Checked in the preview at 1920x1080, 1316x821,
  821x1316 and 1278x513: no sideways scroll, no console errors. Left for Bryan to decide: his full name as author on
  the Boundary course page, and whether a quiz answer should allow a second try. Nothing deployed.
- 19 Nov 2026, design tells (the audit chat's measured pass with the two design checklists; Bryan in this chat:
  "Yes, fix them"). The capitals line over the front page headline is gone; "free, no account" is now in the
  sentence under it. Every middle-dot string is plain words ("Mind, 6 units"; tab titles use a bar). Small labels
  are in plain case with no letter spacing; only the crest wordmark stays in capitals. A reduced-motion rule
  stills the hover lifts and smooth scroll for people who ask their device for less motion (the scenes and labs
  still play; they are the lesson). Type is now a setting like the look: `"type"` in profile.json (inter, hyper,
  literata), with a Type picker beside the Look picker in the preview. The public copy loads only the faces it
  uses. Left for Bryan: pick the type. Nothing deployed.
- 19 Nov 2026: Bryan picked the type: "Atkinson". profile.json `"type": "hyper"` (Atkinson Hyperlegible for
  reading, Bricolage Grotesque for headings); the preview and the public copy are both built with it. The live
  site changes at his next deploy.
- 19 Nov 2026, 3D scale stage (Bryan, voice typed in the first University chat: "you need to have visual explainers
  3 dimensional visible visual explainers to show scale ... that can be rotated and manipulated spatially"; in this
  chat: "Yes, build it"). A unit can now carry a `"scale"` block beside its scene and lab (scale.js): measured things
  as solid blocks whose volume is their number, on a stage you turn with a finger or the mouse, zoom by pinch or
  wheel, and walk along with Bigger and Smaller. Guess first, then the stage opens. A When switch grows and shrinks
  the blocks between two times; a thing with no measured number for a time is shown as a faint outline and says so.
  The list, numbers and sources are plain HTML, so they read with no 3D. three.js r160 (MIT) is in vendor with its
  licence and source note, and is credited on the credits page. First set: The weight of everything alive, 18
  groups from Table 1 of Bar-On, Phillips and Milo 2018 (read from the open-access text on Europe PMC), in Critical
  thinking unit 3. `uni.js check` refuses a thing with no number or no source. Checked by hand in the preview at
  1920x1080, 1316x821, 821x1316 and 1278x513: guess, turn, wheel zoom, list, walk, time switch; no sideways scroll,
  no console errors. Not checked: a real tablet's two-finger pinch (the preview has no touch). The block is
  `"live": false`, so the public copy does not carry it yet. Next step, not started: scale of size (cell to galaxy),
  the same block with spheres and travel across about 27 powers of ten.
- 19 Nov 2026, 3D scale stage, sizes (Bryan in this chat: "Yes, build it"). The scale block has a second kind,
  `"size"`: each thing drawn as wide as it really is, in metres. A unit may now carry a list of scale blocks.
  Thirteen things from a red blood cell (8 thousandths of a millimetre) to the gap to the Andromeda galaxy (2.5
  million light years), a span of about 27 powers of ten. The stage keeps what you look at in the middle and
  redraws the rest around it at the scale of the moment; Bigger and Smaller travel between neighbours, pulling back
  before moving. A solid thing far too big to fit shows as the wall of its near side. Shapes: ball, tall (a person),
  disc (a galaxy, a blood cell), ring (an orbit), bar (a distance). Every size was read from its source before it
  went in: NASA fact sheets (Sun, Moon, Earth, Jupiter, Neptune's orbit, the asteroids Bennu and Vesta), NASA Goddard
  (the Milky Way), and papers for the cell, the person, Betelgeuse, the nearest star and Andromeda. Left out on
  purpose: the observable universe, because no source I could read gave its width (not built on a number from
  memory); CDC's height page refused the reader, so the person's height is from the NCD-RisC paper instead.
  Found by looking and fixed: the eye first ended up inside the giant neighbour of a small thing, so bigger things
  now run behind what you look at. Checked by hand at 1920x1080, 1316x821, 821x1316 and 1278x513; no sideways
  scroll, no console errors; the amount stage still works beside it. Not checked: a real tablet's pinch. The shapes
  are plain coloured solids, not pictures of the real things. Both stages are `"live": false`.
- 19 Nov 2026, moving backgrounds (Bryan gave two pictures of an archive room, a wall of old TVs under a neon
  "UNIVERSITY ARCHIVES" sign; in this chat: "i want these used in the same ways as as vtv. the way the bg moves").
  Done the way voidtv.net does it (read from scripts/lib/app.js, written again in build.js). Front page: a column of
  the two pictures, one screen-wide tile after another down the whole page, behind the headline and the rows; it
  scrolls at about a third of the page's speed and each tile slowly breathes. Course, book, credits and not-found
  pages: one fixed picture, taller than the window, under a dark veil, that drifts and grows a little as you
  scroll (the angled picture behind courses, the straight-on one behind the rest). No movement for people who ask
  their device for less motion; on touch screens only the column moves, as on voidtv.net. The pictures belong to
  the Bright night look; the other two looks are unchanged. Lighter copies are in img\bg (1920 and 960 wide, about
  300 KB and 90 KB, the same sizes voidtv.net uses); the originals stay in Downloads. The credits page says the
  backgrounds are our own. Checked at 1920x1080, 1316x821, 821x1316 and 1278x513: no sideways scroll, no console
  errors. Known: the sign says "UNIVERSITY ARCHIVES", and at some widths it sits behind the headline's second
  line; the old library photo in the headline band is no longer shown in this look. Nothing deployed.
- 19 Nov 2026: Bryan, asked whether to mark both 3D stages live: "Yes, mark live". Both scale blocks in Critical
  thinking unit 3 are `"live": true`, so the public copy carries them, with scale.js and three.js beside the page.
  They reach the live site at his next deploy.
- 19 Nov 2026: Bryan: "make the background drift on my tablet too". The fixed picture behind the inner pages now
  drifts and grows on touch screens as well (voidtv.net keeps it still there). Only a window 700 wide or less keeps
  it still, and people who ask their device for less motion still get none. Not checked on the real tablet.
- 20 Nov 2026: Bryan: "allow a second try on quiz answers". In Check yourself, a first wrong pick is marked red and
  switched off, the page says "Not quite. You have one more try.", and the answer, the reason and the quote stay
  hidden. The next pick settles it: right says "Right, on your second try.", wrong shows the answer as before. The
  score line says how many took two tries. A right first pick works as it did.
- 20 Nov 2026, make questions with a phone (Bryan: "we could create a system where we build question answer during
  lectures ... we can create the lesson in one sitting"; "both, making first"; in this chat: "Yes, build it"). The
  making side, on his PC. A heard lecture in the preview has a Make questions button: it opens a lesson room on
  PLAY's phone relay (play/rooms, required as it is; the PLAY lead added the lesson kind) and shows a QR code. The
  phone marks a moment, the lecture stops, the words said there come up on the phone, and the question written
  from them is checked by the same gate as a drafted one (word for word quote of 8 words or more, four different
  answers, a reason) and written into the unit's draft, or the course once kept. Done rebuilds the page. The
  preview server now listens on the home network, and gives a device that is not this computer only the phone
  page and its room (checked with curl from the network address: every other page and every write answered 403).
  Checked with a second browser tab on the network address as the phone: join, mark, lines, Earlier words, three
  refusals, a good save, the question in Check yourself after Done, the phone told the room closed; the test
  question was then removed. Not checked: a real phone scanning the real code, and the Windows firewall prompt.
  Not built: the taking side, and the live site (the relay refuses the University's address until the PLAY lead
  opens it on Bryan's go there).
- 20 Nov 2026, new backgrounds (Bryan: "i have new artwork to use as the bg and use the other lemnets from voidtv.net
  like the colored lightning bg", with two zips of five pictures). Used: the two grown-up classroom pictures
  (img/bg/academy.jpg behind course pages, img/bg/hall.jpg behind the other inner pages, both first in the front
  page column, the archive room pictures after them). Added from voidtv.net, used the same way: the lightning and
  static tiles across each join of the column (static-glitch, static-bolt, static-dark, screen blend), the coloured
  dust that drifts faster than the page, and the film grain over everything. Bright night look only; no dust and
  no moving grain for people who ask for less motion. Not used, they belong to other builds: the classroom with
  children (Kids), Void Trivia Night (Trivia), and the style and material sheet (a reference). Open: the neon sign
  in the pictures says VOID ACADEMY and the site is named Void University.
- 20 Nov 2026, Body Atlas in the University (Bryan, in the Body Atlas chat: "it needs toi be worked in to that";
  in the first University chat: "add the body to university"; in this chat: "build it . also want more lessons").
  Not a new panel: Body Atlas is a second practice site in list.json beside Mind Gym, and its lessons are its
  rooms. A practice site can now say how a room opens, what it calls it, its own label and lines, and that it can
  send people back (the link then carries from=university and the unit number, never an address). The Body area
  has its first course, The body: four units (shoulder, hip, knee, spleen), each with why you need it, an everyday
  scene, the lesson to open, a crystal and five questions. All 20 quiz lines quote a step of the lesson word for
  word, checked against the lesson files fetched from the live site; `uni.js check` now does the same check and
  refuses a quote from a step that rests on StatPearls. Every claim in the units comes from a lesson line. Preview
  only: the course and the Body Atlas card are not live. Checked at 1316x821 and 821x1316: the piece, the link, a
  quiz answer and its link to the lesson; no sideways scroll, no console errors. Not checked: the lesson opening
  from the link on a tablet, and the back arrow, which the Body Atlas side is building. More lessons: they are
  made in Body Atlas first; each new public one is then one room and one unit here (RUN.md section 15).
- 20 Nov 2026: Bryan, asked whether to mark the Body course live: "Yes, mark live". The body and the Body Atlas card
  in the Body row are both live in list.json (`uni.js live the-body on` turns both on). They reach the live site at
  his next deploy. After that, the Body Atlas chat needs the word that the course is live, to aim its back arrow.
- 20 Nov 2026, the learner side of the phone lessons (Bryan: "build the learner side of the phone lessons"). A
  lecture with timed questions has a second button in the preview, Answer on your phones (make/answer-screen.js).
  It opens a lesson room and a QR code; up to 40 phones join. When the lecture reaches the end of the line a
  question quotes (the exact second from the transcript, uni.js quizEnds), it stops and the question goes to the
  phones. Two tries each, as on the page, then the answer, the reason and the lecture's line. The lecture plays on
  when all have answered or on Carry on; Done ends it and each phone shows its own score. The answer is judged on
  the computer and the computer shows only a count; nothing is kept. The phone page (make/phone.html) is the one
  page for both sides: the room tells it which. Checked with two browser tabs on the network address as phones:
  join, a question at its second, right on a second try, wrong twice, play on when both answered, a skipped
  question not asked, Carry on, Done and both scores; no console errors. Not checked: real phones, and a real
  lecture playing through (the play position was set by hand in the check). Not on the live site: the relay on
  voidtv.net still refuses the University's address.
- 21 Nov 2026: a test rewrote the real list.json on every run (reported by the Void TV assets chat; Bryan: "Yes, fix
  it"). The live test called the live switch on the real file, and the switch always saves the whole file. The
  switch now takes the file to change (the command still changes the real one), and the test works on a throwaway
  copy, checks both directions and the Body Atlas card with its course, and fails if the real file changed. No
  other University test writes a real project file.
- 21 Nov 2026, five finish items (Bryan: "finish them"). (1) The learner-side test read a heard lecture, which is
  kept out of git, so it failed on a fresh copy (night audit N20, also met by the PLAY lead): the timing is now a
  pure function, `endsFor`, tested on a made-up lecture. (2) Mind Gym's address is gym.bspokevisuals.com (his
  pick in the audit chat, N5); a test refuses any workers.dev address in a built page. (3) The preview server
  refuses a request that does not name this computer (127.0.0.1, localhost or its network address, with the port),
  so a page under a borrowed name cannot save a question or start a rebuild (N16). (4) The typefaces are kept in
  `fonts/` and served from the site; no page asks Google for anything (N17). The public copy carries only the
  chosen typeface, the preview all three. (5) This plan has a current list at the top. Checked in the preview at
  1278x513: the faces load from the site, Train it opens the new address, a borrowed name gets 403.
- 21 Nov 2026, Answer on your phones on the live site (Bryan: "Yes, build it", after the PLAY lead opened the
  relay's door to lesson rooms from university.voidtv.net). The public copy now ships the screen script
  (answer.js), PLAY's QR maker (qr.js) and the phone page as join.html, loaded only on a course that has a
  lecture with timed questions (Human nature, Your money, plainly: 10 units). On a voidtv.net address the pages
  open rooms at wss://voidtv.net, the QR leads to this site's own /join, and the page asks for no server. Each
  question carries the exact second its line ends (`"e"`, written by `node scripts/uni.js ends <course>`, also set
  on every new drafted or phone-made question): 39 set in the two live courses and 157 in the Human nature drafts;
  17 older questions whose quote is not in the lecture word for word keep the estimate. The phone page has a way
  home and the donation line on the live site. Making questions stays in the preview. Checked: 29 of 29 tests, the
  preview flow again with a stand-in phone. Not checked, and it cannot be before a deploy: the live path itself,
  since the relay accepts only the University's real address. Check after the deploy: open a Human nature lecture
  on the live site, press Answer on your phones, scan with a phone.
- 22 Nov 2026, the remodel, step 1 (Bryan, 21 Nov in the polish chat: "the stale stco images in university and the
  coloring of areas is flat and stale"; 22 Nov here: "The images are out dated and stale", "I'm wanting younger modern
  images that go with the edgy voidtv aesthetic", "And then it will be your job to continue the build to finish").
  Worked from audit/polish-2026-11-22/findings-uni.md (UNI-01, 03, 04, 05, 08). Stock photos: no page shows one and
  the public copy does not carry them; `img()` gives only our own pictures. A course card with no picture yet shows
  its own everyday line ("Like five neighbors and a shared jar") on its area's colour; mechanism cards are compact
  with no picture slot. Colour, in Bright night: three clear surface steps, shadows and a top light on cards, units
  and pieces, Void TV's own gold and pink, a see-through header, and one hue per area (15, all different) on the
  unit's top edge and number, the row mark, the card and the course headline. The navy and brass left-overs are
  gone from the crest, the Why you need this box, the quiz and the lab. Header: one row at every width (72 px at
  1278x513, 55 px at 821x1316; it was 126 and 190): the way home, this page, one Courses menu with Install inside.
  The scene and the crystal no longer run taller than the window. Checked in the preview at 1278x513 and 821x1316:
  no sideways scroll, no broken picture, no console errors. Not done yet: the picture engine and the pictures
  themselves (38 live units), the labelled boxes in the scenes (UNI-02), the VOID ACADEMY sign, channel cards. Not
  pushed, not deployed.
- 22 Nov 2026, explainers (Bryan: "i want thatr machine etc explainer to be incluiseded and usd in university now",
  then "global warming, el nino, water issues ie colorado river. i want less "thing" and more issues or delemas ...
  issues ppl cant seem to grasp", then "Yes, carbon bathtub"). Plan: chief-of-staff\plans\PLAN-university-explainers.md.
  Built: one explainer engine for issues that are a store filling and draining (explain-model.js, the same code the
  tests run; explain.js, the 3D stage on three.js; build.js explainBlock; uni.js explainerProblems). A unit's
  `explainer` block names stores, flows, the learner's choices (faders), the measured years and the sources; a rate
  is worked out from the measured years in the file, never typed in. First file: a new area, Earth and climate, and
  a new course, Our climate, plainly, unit 1 "Steady emissions still fill the air": the Earth from space (NASA Blue
  Marble, reused from Living World), the carbon in the air as specks (pale before coal and oil, pink added, each a
  quarter of a billion tonnes), fuel and forest clearing rising from the land, the ocean and land taking back.
  Numbers: Global Carbon Budget 2025 (Table 7) and NOAA Mauna Loa 1959 to 2025. Guess first (held at today's rate for
  50 years: 427 to 507 ppm), four rules to find, replay of the measured years, the line under the stage, a trace and
  a balance of in and out, a quiz quoting the sources, a crystal. The stage runs to 2075 only and its card says the
  real sinks are weakening (Raupach 2014), so the real rise is likely faster. tests/uni.test.js 33 of 33, selftest 4
  of 4. Checked in the preview at 1278x513, 1920x1080, 1316x821 and 821x1316: no sideways scroll, every control has a
  hover tip, no errors from the explainer. The course and block are `live: false`. Not pushed, not deployed.
- 22 Nov 2026, the If this, then that page (Bryan: "id like to bu8ild a ifttt page of many topics to show and be
  useful on and for many many topics"; then "If this, then that page"). ifttt.html: every rule from every lab and
  explainer that ships, by area, course and unit, 19 in the preview (16 from the live labs in the public copy). Each
  "then" stays hidden until the reader makes it happen in its own lab or explainer; a rule found anywhere is
  remembered in the reader's browser only (vu:found), so the page and a return visit show it found. Filters by area,
  found and still to find, and a search. Linked from the Courses menu and the front page. Each block carries its key
  (course/unit/lab or ex). Chains (a then that is the next rule's if) wait for a second climate unit whose rules
  really follow from the first; none were invented. tests 34 of 34. Checked at 1278x513, 1316x821, 821x1316: no
  sideways scroll. Not pushed, not deployed; at the next deploy the live site gains the page with the live labs' rules.
- 22 Nov 2026, explainer 2, the Colorado River (Bryan: "Colorado River"; "Yes, download both"; at the meter line,
  "Carry on"). Our climate, plainly, unit 2 "The Colorado River: more promised than it carries". A new world kind,
  "basin": the real ground of the Colorado basin from NOAA ETOPO1 with NASA's July Blue Marble laid over it (both
  downloaded on Bryan's yes, recorded in living-world/DOWNLOADS.md section E; cut by make/cut-basin.py into
  img/explain/colorado), the basin's own catchment traced downhill and the rest dimmed, rivers traced (ours), Lake
  Powell and Lake Mead as water at the level their storage gives, each lake grown on the heights to the area
  Reclamation measured when full and its bed shaped to the measured area at each level (ours, said on the card), the
  dry bed showing pale. Water moves along the rivers into Powell, down the Grand Canyon to Mead and on to Mexico, and
  rises off Powell as evaporation. Numbers: Reclamation's daily records for sites 919 and 921, water years 2000 to
  2026 (river, releases, evaporation, storage, levels; the books close for Powell to within 3,000 acre-feet a year),
  and the Law of the River page for the 1922, 1928 and 1944 promises. Engine: a flow may run from one store into
  another, an empty store lets out only what comes in, the hold line can name the store and choice, lakes have
  levels read off the measured curve. Guess: the deals' 9 against the recent river empties Lake Mead in about 9 years.
  tests 35 of 35, selftest 4 of 4, links answer. Checked at 1278x513, 1920x1080, 1316x821, 821x1316: no sideways
  scroll, every control tipped. Not checked: the motion and the water up close at full speed (the hidden preview
  pane runs a few frames a second). Not pushed, not deployed; the block and course are live: false.
- 22 Nov 2026, the front page as the landing pad (Bryan: "Option A" of docs/LANDING-REVIEW.md). The old headline band
  is now the door: one real question from a lesson, chosen by the day (the explainers' guesses, with their gap worked
  out at build time by the same model the page runs, and the scale stages' guesses), each with a short door wording
  where the lesson's is long; guess, the gap is stated as a plain fact, then "See it happen" opens the lesson. Beside
  it, Remember it: the quiz questions of lessons the reader marked done come back a day, three days, a week and three
  weeks later, mixed across lessons, answered in place (recall.json, fetched only once a lesson is done; kept in the
  browser as vu:recall; marking done now records when, vu:doneAt); one plain line of what you know ("You have
  finished 3 lessons and found 1 of 23 rules") with Pick up where you left off; a welcome card for a first visit.
  Under it, Things people get wrong (units carry a "hook" question: six so far) and Learn together (opens a lecture
  that has Answer on your phones). The public copy carries only live pieces: at the door the two scale-stage guesses,
  in Remember it only live courses. tests 36 of 36, selftest 4 of 4. Checked at 1278x513, 1316x821, 821x1316 and
  1920x1080: no sideways scroll. Not pushed, not deployed.
- 22 Nov 2026, Study together and the Tools row (Bryan: "i want this to be a side room ppl can use on void u. i want
  v u to be more hemn a place to mfind lectures. i want it to be a place of tools"; "Yes, build both"). study.html
  and study.js: a room for one shared screen and everyone's phones, on the lesson rooms the University already
  opens on voidtv.net's relay (no change to PLAY). Pick any lesson with questions (71 in the preview, live lessons
  only in the public copy); each question goes to every phone; each phone locks in a guess privately; when all are in
  (or Show how the room split) the screen shows the split and the source settles it with its quote; each phone is
  told plainly, no score; End the session tells the phones and keeps nothing. The phone page gained a study mode.
  recall.json now carries each question's quote and where it is from. The front page has a Tools row (Study
  together, See how it works, If this, then that, Mind Gym, Body Atlas), and the Courses menu links to Tools and the
  room (the header bar stays Home and the page's name, as the remodel set). Tested with two browser tabs as phones on
  the preview server: join, private picks, the split, the source on screen and phone, end. tests 37 of 37, selftest
  4 of 4; no sideways scroll at 821x1316, 1278x513, 1920x1080. Not tried with real phones. Not pushed, not deployed.
- 22 Nov 2026, Pattern Eater together in the study room (Bryan: "Pattern Eater together"; his design from Dec 2025,
  plans/research-aha-nucleation-pattern-eater.md). A lesson with a crystal can be studied as Pattern Eater: its true
  pieces and its wrong whole answers are dealt out to the phones; people send the ones they think belong; a wrong one
  cracks the crystal on the shared screen and dissolves, and the phone is told why; the next right piece rebuilds
  it; when every true piece is in, the screen asks the room to say out loud what idea just set, then Show the idea
  sets it on the screen and on every phone with the lesson's aha line. Deal again re-deals to whoever is in the room.
  recall.json carries each lesson's crystal. Tested with two tabs as phones: a wrong piece cracked it, five right
  pieces from two phones set it. tests 38 of 38, selftest 4 of 4. Not tried with real phones; not pushed or deployed.
- 22 Nov 2026, Say it another way in the study room (Bryan: "Say it another way"). From a lesson (or right after a
  Pattern Eater round sets) every phone writes the idea in its own words, up to 300 letters; nothing shows on the
  shared screen until all have written (or Show what is written); then the cards show without names in a shuffled
  order, each phone gets them all with its own marked and not pickable, and each picks the clearest; the room's pick
  lights up. Nothing graded, nothing kept. Tested with two tabs as phones. tests 39 of 39, selftest 4 of 4.
