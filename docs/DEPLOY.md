# Deploying VOIDtv (the static site)

The site is files. The builder on B's PC writes the catalog into `catalog/` (committed); the host
runs `node scripts/site.js` and serves the `site/` folder. No server, no database, no keys.

## Cloudflare Pages (chosen host)

One-time, in the Cloudflare dashboard (B does this; takes ten minutes):

1. Workers & Pages -> Create -> Pages -> Connect to Git -> pick `bryankorth31/void-channel`.
2. Build settings:
   - Production branch: `master`
   - Build command: `node scripts/site.js --base https://voidtv.net`
   - Build output directory: `site`
   - Environment variable: `NODE_VERSION` = `24` (the scripts use `node:sqlite` only in db.js, which
     the site build does not run, but Node 22+ is needed for the fetch and syntax used)
3. Deploy. The first deploy gives a `*.pages.dev` address; test there first.
4. Custom domain: add `voidtv.net` and `www.voidtv.net` to the Pages project. Cloudflare already holds
   the DNS zone, so it offers to create the records; accept. This is the moment the old Vercel site
   stops being served (swap, step 5). Until then the Pages address and voidtv.net coexist.

Every later push to `master` rebuilds and redeploys in about a minute.

**Catalog cadence:** `node scripts/publish.js` commits whatever the builder has written to `catalog/`
and `docs/` and pushes it (no-op when nothing changed). A Windows Task Scheduler job, "VoidTV
Publish", runs it every two hours on B's PC (log: `catalog/cache/publish.log`). Remove with
`schtasks /Delete /TN "VoidTV Publish" /F`; the nightly job will fold this in later. The catalog is in the repo,
so no secrets are needed at build time. `backend/.env` (the TMDB token) stays local and ignored.

## What `site/` contains

- `index.html` -- the app shell (22 KB) with the browse page, player, X-Ray and connections
- `data/index.js` -- the browse index for every show that plays (one cached file)
- `data/shows/<slug>.json` -- seasons, episodes, cast and crew, fetched when a show opens
- `data/graph.json` -- people and show-to-show links, fetched once
- `show/<slug>/index.html` -- the shell again with that show's title, image and description in the
  head, so a shared `/show/<slug>` link renders a real card in texts and social posts
- `_redirects` -- `/show/* -> /index.html 200` so the app can route addresses it did not prerender
- `_headers` -- five-minute caching on data and show pages
- `robots.txt`

## Local test of the exact build

```
node scripts/site.js --base http://127.0.0.1:8766
python -m http.server 8766 --bind 127.0.0.1 --directory site
```

Then open `http://127.0.0.1:8766/` and `http://127.0.0.1:8766/show/seinfeld/`.

## Limits that matter

Cloudflare Pages free: unlimited bandwidth, 500 builds a month, 20,000 files per deploy, 25 MB per
file. Today's build is ~500 files and 9 MB; a full 2,300-show build is roughly 5,000 files and
60 MB. The TV-movie reference list (9 MB) is not part of the site.

## Vercel (current host of the old app)

Still serving the June Expo build on the free Hobby plan. Nothing to do there until the swap; after
the Cloudflare domain is live, the Vercel project can be deleted.
