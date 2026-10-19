# Deploying voidtv.net (the static site)

The site is files. The builder on B's PC writes the catalog into `catalog/` (committed); the host
runs `node scripts/site.js` and serves the `site/` folder. No server, no database, no keys.

## Cloudflare Pages (chosen host)

One-time, in the Cloudflare dashboard (B does this; takes ten minutes):

1. Workers & Pages > Create > Pages > Connect to Git > pick `bryankorth31/void-channel`.
2. Build settings:
   - Production branch: `master`
   - Build command: `node scripts/site.js --base https://voidtv.net` (no other options; `--open` is gone, see
     "The one switch" below)
   - Build output directory: `site`
   - Environment variable: `NODE_VERSION` = `24` (the scripts use `node:sqlite` only in db.js, which
     the site build does not run, but Node 22+ is needed for the fetch and syntax used)
3. Deploy. The first deploy gives a `*.pages.dev` address; test there first.
4. Custom domain: add `voidtv.net` and `www.voidtv.net` to the Pages project. Cloudflare already holds
   the DNS zone, so it offers to create the records; accept. This is the moment the old Vercel site
   stops being served (swap, step 5). Until then the Pages address and voidtv.net coexist.

Every later push to `master` rebuilds and redeploys in about a minute.

## The one switch: SITE_PASSWORD and GATE

Two plain-text settings decide both the password gate and how requests are routed, so the two cannot disagree
(audit CF-002, CF-003, SP-016). In the Pages project `voidtvsite`: Settings > Variables and Secrets > the Production list.
The checks in "One-time setup in Cloudflare" (under Opening day, below) keep the password on, and "The day, step by step" there says how to open the site.

The build cannot see an encrypted Secret. That is the fact the whole switch is built around: a build that sees no password
cannot tell "there is none" from "it is a Secret", so **seeing nothing never opens the site**. Opening is something you
say out loud, with a plain `GATE` = `off`.

| what the build sees | gate | routes (`_routes.json`) | `version.txt` | what happens |
|---|---|---|---|---|
| `SITE_PASSWORD` (type Text) | on | `include /*, exclude /assets/*` | `gate=on` | every page and data file runs through the gate Function and counts as a Function request (Workers Paid is on since 18 Oct 2026: 10 million requests a month are included, then 0.30 dollars per million) |
| `GATE` = `on` (type Text), with the password kept as a Secret | on | same | `gate=on` | the same; the running gate still checks the password from the Secret |
| `GATE` = `off` (type Text) and no `SITE_PASSWORD` | off, the site is OPEN | `include /api/*, /q/*` | `gate=off` | pages and data files are plain static files and do not count; only the analytics intake and the QR redirects run as Functions |
| `GATE` = `off` and `SITE_PASSWORD` both | | | | the build stops with exit 1 (they say opposite things); the old site stays up |
| neither, on a Cloudflare build of voidtv.net | | | | the build stops with exit 1 and a message that names both variables; the old (gated) site stays up |
| neither, on a local build or another profile (kids, public access) | off | narrow | `gate=off` | written open, with a note in the log. A local build runs no Functions, so the password does not apply to it; do not upload a local `site/` folder by hand to a project that should have a password |

- **Type `SITE_PASSWORD` as Text (plain text), not Secret,** or keep it a Secret and add a Text `GATE` = `on` beside it. The
  build log has a line starting `GATE:` that says which it saw, and `version.txt` records it (below).
- **A Cloudflare build that stops with `GATE UNKNOWN` did the safe thing.** The old site stays up. Add the variable the
  message names and Retry deployment.
- **`--open` no longer exists.** It used to narrow the routes by hand while the variable said something else,
  and the two could disagree: the site came up open, with no password and no analytics. Passing it now fails the
  build at once (exit 2, message "--open no longer exists"), so an old build command is noticed and the old site
  stays up.
- Preview deployments (other branches) have their own variable list, and whether previews are built at all is a separate
  Cloudflare setting that you check (Workers & Pages > `voidtvsite` > Settings > Builds > Branch control). `GATE` = `on` in the
  Production list keeps only the production build gated; it does not put a password on previews, because `GATE` is read by the build
  only and the running gate checks `SITE_PASSWORD`. A preview is private only if its own list also has the password (`SITE_PASSWORD` as Text, or as a Secret
  beside a Text `GATE` = `on`). With `GATE` = `on` and no password the preview is open, and `GATE` = `off` opens it on purpose. A preview build of voidtv.net with neither variable is refused like the
  Production one. The simplest safe choice is to turn preview deployments off.
- The doctor's `gate` light checks it from outside: it reads `gate=` from `https://voidtv.net/version.txt`, then
  `gate=on` must answer 401 on `/`, and `gate=off` must answer 200 on `/` and 200 on `/api/e`. A mismatch is red.
  If `GATE` = `off` is set while the password is still saved as a Secret, the build opens the pages but the running site
  still guards `/api/e`: the light is red with "`/api/e` answered 401".

## Swap day (B said go on 2026-10-14; password STAYS)

B's call: the test password stays on after the domain moves, so he can control who tests it and the
~100 visitors a day voidtv.net still gets are not part of it yet. They see the gate page instead of
the old Vercel app. Steps, in the Pages project `voidtvsite`:

1. **Custom domains > Set up a custom domain:** `voidtv.net`. Cloudflare sees the zone in the same
   account and offers to replace the existing records (proxied records pointing at Vercel); accept.
   Then add `www.voidtv.net` the same way. Status goes Pending > Active in a minute or two.
2. Check `https://voidtv.net/` (gate page, then the new site after the password),
   `https://www.voidtv.net/` (answers a 301 to the bare domain: the gate's middleware does that while the
   password is on), `https://voidtv.net/show/seinfeld`.
3. Vercel: the old project can be deleted once step 2 passes. Nothing else points at it.

The build already stamps `https://voidtv.net` into share links and OG tags. `voidtvsite.pages.dev` keeps working as a
second door (same gate). The `_redirects` file has no rules on purpose: Pages rejects a rule whose source is a full
address, so the old www line never worked (audit F-004, CF-025).

## Opening day (whenever B says)

Opening the site is two edits to the Production variables of the Pages project and one rebuild. Nothing opens it by itself. No script does it: the launch check only reads, and the build only follows the variables. The password stays on until step 5 below, and step 5 is yours.

### What the switch does

"The one switch" (above) lists every case. On the day only two matter:

| Production variables | the rebuild writes | line 2 of `version.txt` starts | visitors |
|---|---|---|---|
| `SITE_PASSWORD` set (type Text) | `_routes.json` with `include /*, exclude /assets/*` | `gate=on` | every page asks for the password, and each page is a Function request |
| no `SITE_PASSWORD`, and `GATE` = `off` (type Text) | `_routes.json` with `include /api/*, /q/*` | `gate=off` | pages and data files are plain static files; only `/api/e` and `/q/*` run as Functions |

- With neither variable the build stops (`GATE UNKNOWN`) and the old gated site stays up. A password saved as a Secret looks exactly like "no password" to the build, so "nothing set" never opens the site. Opening is something you say out loud: `GATE` = `off`.
- There is no `--open` step. The build command stays `node scripts/site.js --base https://voidtv.net` and a command that still carries `--open` stops with exit 2.
- The site proves its state. The build writes `gate=on` or `gate=off` as the first word of line 2 of `https://voidtv.net/version.txt` (the file, and the other words on that line, are described under "What `version.txt` shows"). The doctor's `gate` light reads that word, then asks the front page with a HEAD request on `/`: `gate=on` must answer 401, `gate=off` must answer 200, and with `gate=off` a GET on `/api/e` must answer 200 too. A mismatch is red.

### The launch check (run it by hand)

```
node scripts/launch-check.js
```

Run it in the real void-channel folder (it reads `audit/`, `catalog/cache/` and `backend/.env`, which are not in git). It needs the internet and takes a few seconds. It prints one line for each of ten checks, each marked GO, NO-GO or WARN, and ends with a verdict line:

- **NO-GO** blocks the launch and prints a line starting `By hand:` that says what to do. The exit code is 1 when any row is NO-GO and 0 otherwise. In PowerShell, `$LASTEXITCODE` shows it right after the run.
- **WARN** is listed and never blocks. Read each one.
- Rows 1 to 9 are required (each can be NO-GO). Row 10 is advisory.

| row | what it looks at | NO-GO when |
|---|---|---|
| 1 Findings | `audit/findings.json` | any critical or high finding is still open (any status other than fixed or refuted); every one is listed |
| 2 Doctor | `catalog/cache/health.json`, written by the doctor | a red light (named), or the result is over 30 minutes old |
| 3 Live = master | `https://voidtv.net/version.txt` against `git ls-remote origin master` | the commits differ (a short commit id is accepted) |
| 4 File count | line 2 of the live `version.txt` | 19,500 files or more, or a file over 24 MiB (WARN from 18,000 files) |
| 5 Analytics | one small read-only Analytics Engine query through Cloudflare | the query fails or the keys are missing (WARN: no events in the last 24 hours) |
| 6 Sentry | the Sentry loader host, `js.sentry-cdn.com` | no answer (this proves the host answers, not that an event arrived) |
| 7 Gate | the `gate=` word in the live `version.txt` | `gate=off` (the site is open) while any other required row is NO-GO |
| 8 Publish | `catalog/cache/publish.log` | the last run FAILED or was refused by a guard (WARN: held, a refusal in the last day, no run for 6 hours) |
| 9 Backup | `catalog/cache/backup-stamp.json` | the cache was never backed up, or the last backup is over 7 days old (WARN over 3 days) |
| 10 Player soak | `catalog/cache/soak.json` | never (advisory); WARN when there is no result or a pause over 3 seconds. The player lab does not write this file yet, so it says "no soak result yet" |

Options: `--fresh` runs the quick doctor first (`node scripts/doctor.js --quick`, no network, which rewrites `health.json` as the doctor always does) and then reads it. `--findings <file>` reads the findings from another file. `VOID_ROOT=<folder>` looks for `audit/`, `catalog/cache/` and `backend/.env` under another folder.

It contacts only `voidtv.net`, `github.com`, `api.cloudflare.com` and `js.sentry-cdn.com`, each with a 5 second limit. It reads two keys from `backend/.env` (`CF_ACCOUNT_ID` and `CF_ANALYTICS_TOKEN`) for the analytics query and never prints them. It changes nothing and cannot open the site. It does not check the playback pause rate in Sentry or the catalog standard; look at those yourself (step 10).

Every row can be checked without it: row 3 is `git ls-remote origin master` against the first word of `https://voidtv.net/version.txt`; rows 2, 8 and 9 are the files named in the table; row 4 is line 2 of `version.txt`; row 7 is its `gate=` word.

### One-time setup in Cloudflare (before the day)

All paths start at dash.cloudflare.com. None of these changes what a visitor sees while the password is on. If a label on screen differs from the one written here, pick the one with the same meaning and tell the audit chat so this page is corrected.

1. **www to the bare domain, for good.** Select the `voidtv.net` domain > Rules > Overview > Create rule > Redirect Rule.
   - Rule name: `www to bare domain`
   - When incoming requests match: Wildcard pattern. Request URL `https://www.*`
   - Then: Target URL `https://${1}`, Status code `301`, Preserve query string on.
   - Deploy.

   (This is the "redirect www to root" example in Cloudflare's own documentation, so it keeps the path: `https://www.voidtv.net/show/seinfeld` goes to `https://voidtv.net/show/seinfeld`.)

   Why it is needed: once the password is off, `_routes.json` keeps pages away from the Function, so the middleware's www redirect only sees `/api/*` and `/q/*`. Only this rule redirects the pages. The `www` DNS record must stay proxied (orange cloud) for a redirect rule to run. How to tell it worked: `curl.exe -sI https://www.voidtv.net/` starts with a line ending `301` and has `location: https://voidtv.net/`. (While the password is on, the middleware already does this redirect, so the check also passes before the rule exists; the rule is what keeps it working after opening day.) The doctor's `www` light wants the same answer.
2. **HSTS.** Select the `voidtv.net` domain > SSL/TLS > Edge Certificates > HTTP Strict Transport Security (HSTS) > Enable HSTS > "I understand" > Next. Max age 12 months, leave "Apply HSTS policy to subdomains" off, leave Preload off, then Save. The site already sends `Strict-Transport-Security: max-age=31536000` itself (see "Security headers"); the zone setting also covers answers Cloudflare gives without Pages, such as the redirect rule above. How to tell it worked: the Edge Certificates page shows HSTS as enabled. The doctor's `headers` light is yellow when only HSTS is missing.
3. **Rate limit /api/e.** Select the `voidtv.net` domain > Security rules > Create rule > Rate limiting rules. The free plan allows one rule, which is this one.
   - Rule name: `api e flood`
   - When incoming requests match: Field `URI Path`, operator `equals`, value `/api/e`
   - With the same characteristics: `IP`
   - When rate exceeds: `30` requests per `10 seconds`
   - Then take action: `Block`, Duration `10 seconds`
   - Deploy.

   How to tell it worked: the rule is listed as enabled. `/api/e` also refuses, by itself, any request that does not carry `Sec-Fetch-Site: same-origin` (or `same-site`), any body over 16 KB, and any event whose show, episode, view or session id has the wrong shape (audit CF-013). A browser from before Safari 16.4 does not send that header, so its visits are not counted in analytics.
4. **Email when a deploy fails.** A failed build leaves the old site up and says nothing, so ask Cloudflare to tell you: Notifications > Add > Workers and Pages (Cloudflare's own notification list names the entry Pages, under the heading Project updates; pick the one for Pages projects). Filter to the project `voidtvsite`, the Production environment and the event Deployment failed, and send it to your own email address. How to tell it worked: the notification is listed. (The list also offers Deployment started and Deployment success; leave those off or you will get an email for every push.)
5. **Previews.** Workers & Pages > `voidtvsite` > Settings > Builds > Branch control > Preview branch: choose None (Disable automatic branch deployments). Without this, a push to any other branch could publish a copy of the site with no password at a guessable address. (`GATE` in the Production list does not protect previews: the Preview list has its own variables.) How to tell it worked: Preview branch reads None. A voidtv.net build that sees neither variable is refused in Preview as in Production.
6. **The Production variables.** Workers & Pages > `voidtvsite` > Settings > Variables and Secrets, Production list. What must be there, and how to tell:
   - `SITE_PASSWORD`, type Text (its value can be read in the list), or a Secret with a Text `GATE` = `on` beside it. The build cannot see a Secret.
   - `GATE_KEY` (a Secret is fine: only the running gate reads it).
   - `NODE_VERSION` = `24`.
   - No `SITE_ALLOW_SHRINK` (it is set for one deliberate shrink and deleted again).
   - Settings > Builds: build command exactly `node scripts/site.js --base https://voidtv.net`, output directory `site`.
   - The newest production deployment's build log (Deployments > View details > Build log) has a line starting `GATE:` that reads `GATE: on`.

### The day, step by step

Each step says how to tell it worked. If a step does not work, stop there: nothing later depends on guessing.

1. **Run the launch check:** `node scripts/launch-check.js`. It worked when the last lines say `Verdict: GO.` and the exit code is 0. If it says NO-GO, stop: each NO-GO row says what to do by hand, then run it again. If row 2 says the doctor result is old, run `node scripts/launch-check.js --fresh`. Then look yourself at the two things it does not check: the playback pause rate in Sentry against the target, and the catalog standard.
2. **Confirm Workers Paid is on.** Open the account's Billing page in the dashboard and check that Workers Paid is listed as active. It worked when you can see it there. Why: with the password off, `/api/e` and `/q/*` still run as Functions, and without Workers Paid they would stop at the free daily limit (the pages would not). With it, 10 million Function requests a month are included, then 0.30 dollars per million.
3. **Confirm `GATE_KEY` is set.** Settings > Variables and Secrets, Production list: the name `GATE_KEY` is listed (a Secret shows only its name). It matters if you ever put the password back: the cookie the gate hands out is then a signed value you can rotate (change the key to sign everyone out) instead of a plain hash of the password. If it is missing, add it as a Secret with a long random value you make up and keep only there. A changed variable is picked up by the next build, which is step 6.
4. **Say go.** Nothing below happens until you do. Make sure `https://voidtv.net/version.txt` still shows `gate=on` and the launch check was run on the same day.
5. **Open the site.** Settings > Variables and Secrets, Production list:
   - delete `SITE_PASSWORD` (a Secret too);
   - delete `GATE` if it is there as `on`;
   - add a variable of type **Text** named `GATE` with the value `off`.

   Both halves are needed. Deleting the password alone does not open the site: the build sees neither variable, stops with `GATE UNKNOWN`, and the old gated site stays up. Adding `GATE` = `off` while the password is still there also stops the build ("GATE=off but SITE_PASSWORD is also set"). It worked when the list shows `GATE` = `off` and no `SITE_PASSWORD`. Visitors still see the password page: nothing changes until the rebuild.
6. **Rebuild.** Deployments > the newest production deployment > its actions menu > Retry deployment. (If that item is not there, push any commit to `master`: Cloudflare builds on every push. Push only on your word.) It takes about a minute. It worked when the deployment shows success and its build log has the line `GATE: off (GATE=off was set on purpose). The site will be OPEN`. If the build stops with `GATE UNKNOWN` or "GATE=off but SITE_PASSWORD is also set", do what the message says; the old gated site is still up and nothing was lost.
7. **Confirm the site says so.** About two minutes after the deploy goes live:
   - Open `https://voidtv.net/version.txt` (or `curl.exe -s https://voidtv.net/version.txt`). Line 2 must start `gate=off`, and the first word must equal the start of `git ls-remote origin master`.
   - Open `https://voidtv.net/` in a private window: no password page.
   - Run the full doctor: HQ > Overview > Run doctor, or `node scripts/doctor.js` without `--quick`. Do not rely on the nightly run: it runs seconds after a push and reads the previous deploy. These lights should read:

   | light | should read |
   |---|---|
   | gate | green, "gate=off: the site is OPEN to everyone and the analytics intake answers" |
   | files | green, the file count and the largest file |
   | www | green, "www.voidtv.net answers 301 to https://voidtv.net/" |
   | headers | green (yellow means HSTS is not on yet: setup step 2) |
   | live:version | green, voidtv.net serves origin/master |
   | live:missing-files | green |
   | shrink | green |
   | backup | green (run `node scripts/backup-cache.js --to <folder>` first if it is red) |

   `gate` red with "`/api/e` answered 401" means a password is still set where the running site can see it, usually a Secret the build could not read: delete it and rebuild. `gate` red with "the front page answered ..." while `version.txt` says `gate=off` means the live site and `version.txt` disagree: run the doctor again after a minute, check in Deployments which deployment is live, and if it stays red do A in "Rollback and closing the site again".
8. **Check www and the headers by hand.**
   - `curl.exe -sI https://www.voidtv.net/` : the first line ends `301` and there is a line `location: https://voidtv.net/`.
   - `curl.exe -sI https://voidtv.net/` : the first line ends `200` and the headers include `strict-transport-security`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy`, `permissions-policy` and `content-security-policy-report-only`.

   (In PowerShell, plain `curl` is a different command; type `curl.exe`.) It worked when you see those lines. If the www answer is not a 301, setup step 1 is not done. The Content-Security-Policy is report-only: it blocks nothing, and a browser lists what it would have blocked under F12 > Console.
9. **Run the launch check again:** `node scripts/launch-check.js`. It worked when row 7 reads `gate=off: the site is OPEN, and every required row is GO` and the verdict is GO. If any required row is NO-GO now, row 7 is NO-GO too: the site is open on a failing check, so close it (next section) and fix the row.
10. **Watch for 48 hours before any promo.** Promo videos start only after 48 hours with the site open and no red row.
    - Sentry (organisation `church-of-american-strength-ho`, project `voidtv`): new issues named "Playback trouble: <show>", and the pause rate against the target.
    - Analytics: HQ > Analytics and HQ > Reports. Events keep arriving all day; a day with none while the site is open means the intake stopped (launch check row 5 says WARN for it). Reports lists what viewers flagged with "Wrong file?".
    - Run `node scripts/launch-check.js` morning and evening, and read the doctor lights in HQ > Overview. The nightly doctor does it as well.
    - If it goes wrong, close the site (next section). Closing is a decision for you, not a script.

### Rollback and closing the site again

There are two ways. Use the first to make the site private again. Use the second when the newest build broke something and you want the last good build back at once.

**A. Put the password back (a new build, certain).**

1. Settings > Variables and Secrets, Production list: add `SITE_PASSWORD` (type Text) with the password. Delete `GATE`, or set it to `on`. (The same password and the same `GATE_KEY` keep every earlier visitor's 30-day cookie valid.)
2. Rebuild: Deployments > the newest production deployment > actions menu > Retry deployment (or push; push only on your word).
3. It worked when line 2 of `https://voidtv.net/version.txt` starts `gate=on`, `curl.exe -sI https://voidtv.net/` answers 401, and the doctor's `gate` light is green. Run `node scripts/launch-check.js`: row 7 reads `gate=on`.

**B. Roll back to the previous good deployment (instant, no build).**

1. Workers & Pages > `voidtvsite` > Deployments > All deployments.
2. Find the last deployment that worked: look at its time and commit. Only production deployments that built successfully can be chosen.
3. Open its actions menu (the three dots) > Rollback to this deployment > confirm.
4. It worked when `https://voidtv.net/version.txt` starts with that deployment's commit. Then check the gate: line 2 says `gate=on` or `gate=off` as that old build was made, and the front page must agree (`gate=on` answers 401, `gate=off` answers 200 with `curl.exe -sI https://voidtv.net/`). The Cloudflare page on rollbacks does not say whether a rolled-back build runs with the password variables it had then or the ones set now. If the two disagree, or the site is open and you want it closed, do A.

What to know about B:

- It is a pause, not a fix. The next push to `master` builds again and replaces the rolled-back deployment, and the two-hourly publish pushes whenever the catalog changed. To hold builds while you fix the cause: Settings > Builds > Branch control > turn off "Enable automatic production branch deployments" (turn it on again afterwards), and disable the `VoidTV Publish` task in Windows Task Scheduler. The commit that caused it is still in `master`: revert it there before you turn builds back on.
- Nothing about the catalog changes: the data on this PC and in git is untouched; only the deployed site moves.
- The rollback has not been rehearsed yet (the fire drill is planned for a later day). Its steps come from Cloudflare's documentation.

What HQ and the checks show while rolled back:

- HQ > Overview > Run doctor: `live:version` turns yellow ("voidtv.net serves X but origin/master is Y") once the newest push is over 10 minutes old, which is correct: the live site is not the newest commit. `gate` stays green if `gate=` and the front page agree, red if they do not. `files` reads the rolled-back build's counts. An old build that has no line 2 in `version.txt` makes `gate` and `files` yellow ("no gate= word yet").
- `node scripts/launch-check.js`: row 3 is NO-GO until the live commit equals `origin/master` again. That is expected during a rollback.

**Re-confirm after either way.** Read `https://voidtv.net/version.txt` again: the first word is the commit you expect (`git ls-remote origin master` for the newest), line 2 says the `gate=` you expect, `curl.exe -sI https://voidtv.net/` answers 401 for `gate=on` and 200 for `gate=off`, and the doctor's `gate` and `live:version` lights are green. When the cause is fixed and pushed (on your word), Cloudflare builds the new `master`; confirm `version.txt` once more after that deploy.

## What `version.txt` shows

```
<commit> <build time>
gate=off files=15454 largest=10237790 shows=4774 episodes=52622 largestFile=data/graph.json
```

`gate` is the switch as the build saw it; `files` is every file in the output including `version.txt`; `largest` is the biggest
file in bytes and `largestFile` its path; `shows` and `episodes` are what the build carried. The doctor reads this from the live
site, not from the build log. A `version.txt` from before 18 Oct 2026 has only the first line, and the lights say so.

## What `site/` contains

- `index.html` -- the app shell (22 KB) with the browse page, player, X-Ray and connections
- `data/index.js` -- the browse index for every show that plays (one cached file)
- `data/shows/<slug>.json` -- seasons, episodes, cast and crew, fetched when a show opens
- `data/graph.json` -- people and show-to-show links, fetched once
- `show/<slug>/index.html` -- the shell again with that show's title, image and description in the
  head, so a shared `/show/<slug>` link renders a real card in texts and social posts
- `_redirects` -- comments only, no rules (see Swap day)
- `_headers` -- five-minute caching on data and show pages, and the security headers on everything
- `_routes.json` -- which paths run as Functions (see "The one switch")
- `version.txt` -- see above
- `robots.txt` -- allows the site, disallows `/data/` so search engines read the pages and not the JSON behind them

## Security headers

`_headers` sets these on static files, and `functions/_middleware.js` sets the same on every Function answer, the password page
included (which also gets `Cache-Control: no-store`):

- `Strict-Transport-Security: max-age=31536000`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Content-Security-Policy-Report-Only`: the policy built from what the page really loads (its own inline script and
  style, `js.sentry-cdn.com` and `browser.sentry-cdn.com`, posters from `image.tmdb.org` and the Archive, media and
  metadata from `archive.org` and its subdomains, Sentry's ingest hosts, `frame-ancestors 'none'`). **Report-only means it
  blocks nothing.** A browser lists what it would have blocked in its developer console (F12 > Console).

The list lives in `scripts/lib/siteguards.js`; `functions/_middleware.js` keeps a copy because a Function cannot import from
`scripts/`, and `tests/site-middleware.test.js` fails when the two differ. To enforce the policy later, visit the site with the console
open (home, a show, play an episode, search, the TV channel, the password page), clear every report, then rename the header to
`Content-Security-Policy` in both files. If Cloudflare Web Analytics is turned on for the project, it adds a script from
`static.cloudflareinsights.com` that the policy does not list.

## What the build refuses

`node scripts/site.js` stops, the old site stays up, and the build log names the reason:

- fewer than 100 shows (the list or the catalog did not load);
- a catalog more than 10% smaller, in shows or episodes, than the last one that went out. On this PC that is
  `catalog/cache/publish-state.json`; on a Cloudflare build (which has no cache folder) it is the live `https://voidtv.net/version.txt`.
  A drop that is meant needs **two overrides**, because publish and the Cloudflare build each check it: `node scripts/publish.js --allow-shrink`
  lets the push go out, and then a plain Text variable `SITE_ALLOW_SHRINK` = `1` (Production list) must be set for that one deploy
  (Retry deployment), and deleted again afterwards. With only the first, the push goes through and the build is refused;
- 19,500 files or more (Pages refuses 20,000), or any file over 24 MiB (Pages refuses 25 MiB). The output folder is deleted so
  nothing half-built can be deployed by hand.

It warns, and goes on, at 18,000 files, and when a show grid file does not parse (that show is missing from the site; re-match it
from HQ). The doctor's `files` light reads the same counts from the live site: yellow at 18,000, red at 19,500 or a file over 24 MiB.

### The file limit, by hand

The count is almost all shows: each show on the site is two files (its page and its data file) plus about 1.24 person pages.
Yellow (18,000 files) means Pages will soon refuse a deploy; red (19,500) means this build already refuses, and the old site
stays up. What you can do yourself, in this order:

1. Stop the growth: stop the hunts that add shows (HQ > Jobs) until the count is down.
2. Lower the count: in HQ open a show you can do without and press Hide from the site, then Publish now. A hidden show leaves
   the site together with its two files. This buys room one show at a time.
3. The lasting fix is a change to what the site writes: fewer per-show pages, or a data split (audit F-005). It is not a button;
   ask the audit chat.

The next deploy writes the new `files=` count into `version.txt`, and the `files` light follows.

## Local test of the exact build

```
node scripts/site.js --base http://127.0.0.1:8766
python -m http.server 8766 --bind 127.0.0.1 --directory site
```

Then open `http://127.0.0.1:8766/` and `http://127.0.0.1:8766/show/seinfeld/`. Prefix the build with
`SITE_PASSWORD=x` to see what a gated build writes (`gate=on`, routes `/*`); the Python server does not run the gate.

## Limits that matter

Cloudflare Pages (Free plan): unlimited bandwidth, 500 builds a month, 20,000 files per deploy, 25 MiB per
file. Workers Paid has been on since 18 Oct 2026, so Function requests have no daily cap: 10 million a month are included,
then 0.30 dollars per million. The narrow routes of an open site save cost, not a cap. On 18 Oct 2026 the build was about 15,450 files and 680 MB, growing about
350 files a day while hunts added shows; the build guard above and the doctor's `files` light exist because of that.
The TV-movie reference list (9 MB) is not part of the site.

## Vercel (current host of the old app)

Still serving the June Expo build on the free Hobby plan. Nothing to do there until the swap; after
the Cloudflare domain is live, the Vercel project can be deleted.
