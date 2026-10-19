# Deploying VOIDtv (the static site)

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

## The one switch: SITE_PASSWORD

One setting decides both the password gate and how requests are routed, so the two cannot disagree
(audit CF-002, CF-003, SP-016). In the Pages project `voidtvsite`: Settings > Variables and Secrets >
the `SITE_PASSWORD` variable, in the Production list.

- **Type it as Text (plain text), not Secret.** The build reads the variable to choose the routes. Cloudflare
  hides a Secret from the build, so a Secret looks like "not set" to the build and the pages would be
  served with no password. The build log has a line starting `GATE:` that says which it saw, and `version.txt`
  records it (below).
- **Set = password on** (`gate=on`). `_routes.json` is `include /*, exclude /assets/*`: every page and data
  file runs through the gate Function (`functions/_middleware.js`). Each of those requests counts against the
  free allowance of 100,000 Function requests a day.
- **Not set = site open** (`gate=off`). `_routes.json` is `include /api/*, /q/*`: pages and data files are plain
  static files and do not count; only the analytics intake and the QR redirects run as Functions.
- **`--open` no longer exists.** It used to narrow the routes by hand while the variable said something else,
  and the two could disagree: the site came up open, with no password and no analytics. Passing it now fails the
  build at once (exit 2, message "--open no longer exists"), so an old build command is noticed and the old site
  stays up.
- **If SITE_PASSWORD has to be a Secret** (the Text type is not offered, or B prefers it hidden): add a second variable,
  type Text, named `GATE` with the value `on`. The build treats `GATE=on` as the gate being on; the running gate still
  checks the password from the Secret. Remove both on opening day.
- Preview deployments (other branches) have their own variable list. With none set they are open; only the
  Production list matters for voidtv.net.
- The doctor's `gate` light checks it from outside: it reads `gate=` from `https://voidtv.net/version.txt`, then
  `gate=on` must answer 401 on `/`, and `gate=off` must answer 200 on `/` and 200 on `/api/e`. A mismatch is red.

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

Three clicks on the Cloudflare zone, then one in the Pages project. The first three can be done any time before;
none of them changes what a visitor sees today. All paths below start at dash.cloudflare.com.

1. **www to the bare domain, for good.** Select the `voidtv.net` domain > Rules > Redirect Rules > Create rule.
   - Name: `www to bare domain`
   - When incoming requests match: Custom filter expression, Field `Hostname`, operator `equals`, value `www.voidtv.net`
     (the expression reads `(http.host eq "www.voidtv.net")`)
   - Then: Type `Dynamic`, expression `concat("https://voidtv.net", http.request.uri.path)`, Status code `301`,
     tick `Preserve query string`
   - Deploy.

   Why it is needed: once the password is off, `_routes.json` keeps pages away from the Function, so the middleware's
   www redirect only sees `/api/*` and `/q/*`. Only this rule redirects the pages. The www DNS record must stay
   proxied (orange cloud) for the rule to run. The doctor's `www` light wants `https://www.voidtv.net/` to answer a 301
   to `https://voidtv.net/`.
2. **HSTS.** voidtv.net > SSL/TLS > Edge Certificates > HTTP Strict Transport Security (HSTS) > Enable HSTS. Max age
   12 months. Leave "Apply HSTS policy to subdomains" and "Preload" off. The site already sends
   `Strict-Transport-Security: max-age=31536000` itself (see "Security headers"); the zone setting also covers answers
   Cloudflare gives without Pages, such as the redirect rule above. The doctor's `headers` light is yellow until HSTS is
   present on `/` and `/version.txt`.
3. **Rate limit the analytics intake.** voidtv.net > Security > WAF > Rate limiting rules > Create rule. The free plan
   allows one rule, which is this one.
   - Name: `api e flood`
   - When incoming requests match: Field `URI Path`, operator `equals`, value `/api/e`
   - Characteristics: `IP`
   - Requests: `30` per `10 seconds`
   - Action: `Block`, duration `10 seconds`
   - Deploy.

   `/api/e` also refuses, by itself, any request that does not carry `Sec-Fetch-Site: same-origin` (or `same-site`), any
   body over 16 KB, and any event whose show, episode, view or session id has the wrong shape (audit CF-013). A browser
   from before Safari 16.4 does not send that header, so its visits are not counted in analytics.
4. **Open the site.** Workers & Pages > `voidtvsite` > Settings > Variables and Secrets > delete `SITE_PASSWORD` in the
   Production list (and `GATE` if it was added), then Deployments > latest > Retry deployment. That is the whole launch.
5. **Check, about two minutes later.** Open `https://voidtv.net/version.txt`: the second line must start `gate=off`.
   Open `https://voidtv.net/` in a private window: no password page. Run the doctor (HQ > Overview > Run doctor, or
   `node scripts/doctor.js`) and read these lights:

   | light | should read |
   |---|---|
   | gate | green, "gate=off: the site is OPEN" |
   | files | green, the file count and the largest file |
   | www | green, "www.voidtv.net answers 301 to https://voidtv.net/" |
   | headers | green (yellow means step 2 is not done yet) |
   | live | green, voidtv.net serves origin/master |
   | shrink | green |
   | backup | green (run `node scripts/backup-cache.js --to <folder>` first if it is red) |

   `gate` red with "`/api/e` answered 401" means a password is still set where the running site can see it, usually a
   Secret the build could not read; delete it, redeploy.
6. **To close the site again:** add `SITE_PASSWORD` (type Text) and Retry deployment. `version.txt` returns to
   `gate=on` and the doctor's `gate` light wants a 401.

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
  If the drop is meant, set `SITE_ALLOW_SHRINK` = `1` as a plain variable for that one deploy, then delete it;
- 19,500 files or more (Pages refuses 20,000), or any file over 24 MiB (Pages refuses 25 MiB). The output folder is deleted so
  nothing half-built can be deployed by hand.

It warns, and goes on, at 18,000 files, and when a show grid file does not parse (that show is missing from the site; re-match it
from HQ). The doctor's `files` light reads the same counts from the live site: yellow at 18,000, red at 19,500 or a file over 24 MiB.

## Local test of the exact build

```
node scripts/site.js --base http://127.0.0.1:8766
python -m http.server 8766 --bind 127.0.0.1 --directory site
```

Then open `http://127.0.0.1:8766/` and `http://127.0.0.1:8766/show/seinfeld/`. Prefix the build with
`SITE_PASSWORD=x` to see what a gated build writes (`gate=on`, routes `/*`); the Python server does not run the gate.

## Limits that matter

Cloudflare Pages free: unlimited bandwidth, 500 builds a month, 20,000 files per deploy, 25 MiB per
file, and (Workers Free) 100,000 Function requests a day. On 18 Oct 2026 the build was about 15,450 files and 680 MB, growing about
350 files a day while hunts added shows; the build guard above and the doctor's `files` light exist because of that.
The TV-movie reference list (9 MB) is not part of the site.

## Vercel (current host of the old app)

Still serving the June Expo build on the free Hobby plan. Nothing to do there until the swap; after
the Cloudflare domain is live, the Vercel project can be deleted.
