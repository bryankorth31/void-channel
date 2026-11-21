# FINISH-PLAN: Void University up to the level of Kids

Bryan, 19 Nov 2026: "void university is now the least finished among the builds im wanting done. lets fix that",
then "look at kids and see the level university still needs to be built".

Rule for this plan (17 and 18 Nov): finish, do not expand. Every tool ends runnable without a Claude chat, with
buttons in HQ, local models on this PC for the thinking parts, a plain run guide and a self-test.

Read on 19 Nov 2026: weekly meters 81% all models, 73% Fable; stop line 85% this week, 60% after the 22 Nov reset.
Tests that day: `tests/uni.test.js` 5 of 5, `tests/hq.test.js` 41 of 41, nothing failing.

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
