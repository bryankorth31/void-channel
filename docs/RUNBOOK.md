# Runbook: keeping VOIDtv healthy without help

The system is built to run itself: the builder hunts and matches on this PC, the two-hour publish and
the 3:30 nightly push the catalog, Cloudflare rebuilds the site. The **doctor** (`node scripts/doctor.js`,
run nightly and from HQ > Overview) turns the moving parts into lights. This page says what each light
means and what to do. Everything here is clickable in HQ or a one-line command.

## The lights

| Light | Green | Yellow | Red and what to do |
|---|---|---|---|
| publish | the last run pushed, or found nothing new, within 6 h | **held**: the catalog is committed but not pushed because commits from other chats are waiting (see unpushed); or no publish run for 6 h+ | **FAILED** or **refused**: open HQ > Jobs > publish.log, the last dated line says why. FAILED: a file git cannot add (odd name, locked by a job), a push that did not go through after three retries, or a push origin rejected because it has newer commits (pull or rebase by hand). refused: nothing was committed or pushed; the catalog shrank by more than 10% (find out what emptied it; if it is meant, `node scripts/publish.js --allow-shrink`), a catalog file is not valid JSON, or what was about to go out holds an address or a token (the line names the file). Fix the cause and press Publish now. |
| unpushed | nothing waiting on this PC, or a Catalog commit made under 30 min ago | commits from other chats are waiting for your push; the scheduled publish never sends them (it logs held) | a Catalog commit has waited over 30 min: the push failed or is held. Read publish.log, then run `node scripts/publish.js`, which pushes waiting Catalog commits first. To send the other commits together with the catalog, `node scripts/publish.js --allow-other-commits`. |
| addresses | no address-shaped text in the tracked catalog files | | an address-shaped string in a tracked catalog file; the light names the first files. Uploader addresses are other people's data and must not be published: remove the uploader field, or replace the text with [email], in the named file. (Archive file names that only look like an address, such as ones ending .mp4, are not counted. publish.js also refuses to add one.) |
| nightly | finished in the last 30 h, all steps ok | a step failed (hunt, art, people, db...) | no pass in 30 h: the task is missing or the PC was off. HQ > Overview > Re-create scheduled tasks. |
| task: VoidTV Publish / Nightly | scheduled | last result not 0 | missing or disabled: Re-create scheduled tasks (HQ > Overview). |
| jobs | 0 to 2 Archive jobs | | 3+ Archive-facing jobs: stop one in HQ > Jobs; the Archive throttles this address when it is hammered, and that hurts the viewer too. |
| catalog | every grid parses | | unreadable grids or a reserved-name file (con, prn, aux, nul, com1-9, lpt1-9). Re-match the show from HQ; a reserved-name file is deleted with the long path: `node -e "require('fs').unlinkSync('\\\\?\\C:\\path\\con.json')"`. |
| build | the page assembles, channels resolve | | assemble() throws or ships under 300 titles: the message names the file. Usually the catalog folder was emptied by a bad command; `git checkout -- catalog` restores it. |
| tvmaze / archive / tmdb | reachable | down or token rejected | Nothing to fix on our side; hunts and art pause themselves. A rejected TMDB token: get a new read token, put it in backend/.env. |
| live | voidtv.net serves the latest commit | serves an older commit | Cloudflare has not built yet (wait 3 min) or the build failed: dash.cloudflare.com > Workers & Pages > voidtvsite > Deployments, open the failed one, the log names the error (almost always a parse error the site guard would also print locally: `node scripts/site.js`). |
| analytics | token present | not connected | HQ > Reports lists the two one-time Cloudflare steps. |
| links | under 3% of sampled files dead | 3 to 8% | over 8%: the Archive took down a batch. Dead files are retired automatically and alternates picked at the next match; re-hunt the worst shows from HQ (Shows > the show > Re-hunt now) to find new copies. |
| cache | under 8 GB | | delete `catalog/cache/scrape-*` older than 60 days; the doctor already prunes old metadata files. |
| repo | .git under 4 GB | | run `git gc`; when that no longer helps, start a fresh catalog repo (copy `catalog/`, `docs/`, `scripts/show-list.json` into a new repo, point Cloudflare at it). |

## Daily, in HQ (five minutes)

1. Overview: all lights green? If not, the table above.
2. Reports: any Wrong file? reports or playback errors from viewers. Open the show, preview, Reject or Accept.
3. Shows > "review only": watch a minute of a file the judges were unsure about, Accept.
4. Analytics > Searches: zero-result searches are things people want; Add shows.

## Weekly

- Publish now after a session of decisions, so the site catches up without waiting for the schedule.
- Jobs: is the balanced hunt still running? Start it again if the list has unhunted shows (Overview shows hunted of listed).
- Glance at `docs/SELF_LISTED.md` and the shows flagged `tvmazeWeak` in HQ: those are listed from their own files because TVmaze could not place them; a wrong TVmaze id (set it on the show page) often fixes one.

## When Windows changes under us

- Tasks gone after an update or a new user profile: HQ > Overview > Re-create scheduled tasks.
- Node updated: run `node --check scripts/*.js`; nothing else depends on the version.
- New PC: clone the repo, `npm install` is only needed in `hq-app/` to rebuild the desktop app; HQ itself has no dependencies. Put `backend/.env` back (TMDB and analytics tokens). Re-create the tasks.

## What the system protects itself against already

- The site build refuses to ship a page whose script does not parse, has a trailing `//` comment, or carries under 100 titles.
- The matcher survives a corrupt file, re-reads your HQ decisions mid-run, keeps accepted files whatever the judges say, and treats dead files as rejected.
- HQ answers only this PC, validates every slug and argument, and keeps its job list across restarts.
- Every decision you make lives in `catalog/overrides.json` and is committed with the catalog; the builder never overwrites it.
