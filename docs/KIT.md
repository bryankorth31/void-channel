# The VOID kit: run any catalog the way VOIDtv runs

VOIDtv is one instance of a general shape: a **list** of what you want, a messy public **archive**
to hunt in, a **reference** to judge files against, a **static site** that costs nothing to serve, a
**control room** for the human decisions, and a **doctor** that keeps it honest. The kit is that shape
with the TV-specific parts pulled into a profile, so the same code runs public-access television, an
old-time radio library, a lecture archive, a church's media library, or the next thing.

## What you need

- A Windows PC that stays on (any ordinary machine; the builder is polite and slow by design).
- Node 20 or newer. Git. A free GitHub account and a free Cloudflare account for the site.
- Optional: a free TMDB read token for art and people on TV-shaped catalogs.

## Install (ten minutes)

```bash
git clone <this repo> && cd void-channel
node scripts/setup.js
```

`setup.js` checks Node, creates the catalog folders, writes `backend/.env` for your keys, creates the
two Windows scheduled tasks (publish every two hours, the full pass nightly at 3:30), runs the doctor,
and prints the first commands. HQ, the control room, is `node scripts/hq.js --open` or the desktop app
(`hq-app/`, built with `npm run dist`).

## A profile is a folder

`profiles/<name>/profile.json`:

```json
{
  "siteName": "Public Access",
  "tagline": "community television, kept",
  "domain": "https://publicaccess.example.org",
  "listFile": "profiles/publicaccess/list.json",
  "catalogDir": "profiles/publicaccess/catalog",
  "siteDir": "profiles/publicaccess/site",
  "reference": "none",
  "mediatype": "movies",
  "taskPrefix": "PublicAccess",
  "port": 8781
}
```

- `reference`: `tvmaze` when the titles are real TV with episode lists on TVmaze (files are judged
  against those lists, with airdates, season/episode numbers, titles and runtimes); `none` when nothing
  outside knows the shape (public access, web series, radio, lectures): shows are listed from their own
  files, in the order the uploads give, and HQ is where a human tidies them.
- `mediatype`: `movies` for video, `audio` for radio, podcasts, audiobooks, concerts.
- The list, `list.json`: `{ "types": [rows in order], "shows": [{ "name", "type", "network", "tags" }] }`.
  Rows become the home-page shelves and the Live TV channels; tags become collections.

Pick the profile with an environment variable; everything reads it:

```bash
set VOID_PROFILE=publicaccess
node scripts/setup.js
node scripts/hunt.js --priority --open 8 --pause 2500 --budget 20000
node scripts/match.js
node scripts/site.js --base http://127.0.0.1:8766
```

Without the variable, everything is VOIDtv, exactly as before.

## What stays the same for every catalog

- The hunter: search loose, judge strict; politeness pauses, budgets, caches, at most two Archive jobs.
- The matcher: season and episode numbers, airdates, title similarity, runtime bands, the reaction and
  review filter, the other-show guard, playability from the Archive's own format field, and your
  decisions (accept, reject, alias, exclude, ids, hide) in `overrides.json` that it never overwrites.
- The site: lazy shelves, the player with captions and download, Live TV channels, X-Ray where there
  are people, the Mine layer, analytics intake. Branding comes from the profile; the CASH strip and the
  about pages are VOIDtv's and live in `scripts/lib/app.js` for now.
- HQ, the doctor, the link checker, the runbook.

## Publishing

`docs/DEPLOY.md`, with the build command `node scripts/site.js --base <your domain>` and the output
folder from the profile's `siteDir`. A password gate is one variable on the Cloudflare project; the
analytics intake is one binding. Both optional.

## Where the seams still are

- One repo, one HQ at a time: HQ serves the profile it was started with (`port` keeps two apart).
- The TV movie shelf, people pages and art assume TMDB; a `none` reference catalog simply has no art
  until you add posters by hand (`catalog/art.json`, keyed by slug).
- The CASH support strip, About and the /cash page are VOIDtv copy. Profiles will get their own
  support block next.
