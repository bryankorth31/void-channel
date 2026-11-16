# The recipe: how a Void University course is made

Bryan, 15 Nov 2026: "find places either online or mainly in Internet archive books ... things that would go with these
topics and with these classes ... the paperwork and the textbooks and then build the system that we will use to put
these together in the future as HQ". And earlier the same day: "it's not just we show videos we create curriculum from
what we find".

Every step runs from **HQ > University** or one command line. Only step 3 needs a Claude chat, and HQ hands over the
whole prompt for it. The engine is `scripts/lib/uni.js`; the command line is `scripts/uni.js`.

## 1. Find

What a course is built from goes in `profiles/university/sources/<area>.json`, one file per area. The format and the
rules are in `sources/FORMAT.md`:
- the open course (lecture video, syllabus, reading guides, problem sets, exams, transcripts);
- the old public-domain books that match (the Internet Archive and Gutenberg);
- the US government guides;
- the 2 to 4 courses the area should have, each built on one spine source.

Licences are read on the page. OpenStax and Radiopaedia are forbidden. A site that blocks, charges or shows a robot
check is left alone.

**Count the lectures:** `node scripts/uni.js media` reads each Archive item and writes how many video (or sound-only) lectures it really holds. Finders get this wrong; never trust a hand count.

**Check it:** HQ > University > **Check sources**, or `node scripts/uni.js check`. It confirms that every link answers,
every source names its licence and where it was seen, nothing forbidden is used, there are no dashes, and every quiz
answer is one of its choices and quotes its source. The result is in the same tab (and `sources/check.json`).

## 2. Plan

HQ > University > an area > **Scaffold** next to a proposed course, or
`node scripts/uni.js scaffold <Area> <Course name>`.

This writes `courses/<slug>.json` with:
- the source and licence;
- the audiences (high school, young adults, everyday life);
- the units to do, under `todo`.

It also adds the course to `list.json` with `live: false`. A course with no finished unit is not built, so a plan never
shows on the site.

## 3. Write (the one Claude step)

HQ > University > an area > **Copy brief** next to a unit, or `node scripts/uni.js brief <slug> <unit>`. Paste the
whole prompt into a new Claude chat started in the void-channel folder. The chat:
1. reads the lecture transcript or the book chapter;
2. writes "Why you need this", the everyday analogy scene, the main piece, chapters, and a quiz whose answers quote the
   source word for word;
3. builds, looks at the result at desktop and tablet sizes, runs the check, and commits.

Old books get **Rewrite brief** instead. It produces the plain modern English shelf, original beside rewrite, with
warnings where old advice is now unsafe.

A unit is finished when it has:
- "why you need this", written for the unit;
- a scene or a lab;
- a main piece and a crystal ("Make it set"), except on the small supplement cards;
- for a course built from a found source, a quiz.

HQ shows what each unit still needs.

## 4. Look

HQ > University > **Build preview**, then **Open preview** (port 8783; start it with
`node profiles/university/serve.js` if it is not running). Look at 1920x1080 and the tablet sizes (1316x821, 821x1316).

## 5. Approve

When Bryan is happy with a course, he ticks **Live** on it in HQ (`live: true` in `list.json`). Labs ship only when
their own `live` is true. The public copy carries nothing else, so a draft that another chat is building never ships
with someone else's deploy.

## 6. Deploy

HQ > University > **Build public copy** (or `node scripts/uni.js build --site`). Then, in a terminal on this PC, run
this from the sprite-forge folder or anywhere; it deploys to the CASH Cloudflare account:

```
npx.cmd --yes wrangler@4.151.0 deploy --config C:\Users\bryan\void-channel\profiles\university\wrangler.jsonc
```

Check `https://university.voidtv.net` afterwards. Pushing void-channel to GitHub is separate, and rebuilds voidtv.net,
so ask first.

## What a finished course has, every time

- An everyday analogy scene for each unit (pictures first).
- "Why you need this" first: how it helps someone decide or live, even outside the field.
- The source's own material: lecture video in chapters, readings, coursework links, with credit and licence.
- Our own quiz, each answer quoting the line it comes from.
- Links to the mind's mechanisms where a unit uses one.
- Audience levels, so the "Who is it for?" filter works.
- The CASH donation line in the footer (the build adds it).
- No ads, sponsor listings, fees or email sign-up anywhere on the University: Open Yale's terms count any of those as
  commercial use of their courses (see sources/FORMAT.md).
