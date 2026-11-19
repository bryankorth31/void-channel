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
