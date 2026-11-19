# Run Void University by yourself

For Bryan, with no chat open. Every step is a button in HQ or one line in a terminal.
The lines are run in `C:\Users\bryan\void-channel` (PowerShell or the Terminal panel).

HQ: open it from Studio Tools, or run `node scripts\hq.js` and go to http://localhost:8780. Pick **University** in the
header. The Help tab there lists every button with its by-hand line.

## 1. See where things stand

- HQ > University > Overview, or:

```
node scripts\uni.js status
```

It lists the 15 areas, the courses proposed, the courses built, and how many units each has finished.

## 2. Check that nothing is broken

Everything this PC can check alone (tests, lab physics, a preview build, quiz quotes and times). No web, no AI:

```
node scripts\uni.js selftest
```

Every line should say `pass`. A line that says `FAIL` prints what is wrong under it.

The links, licences and Archive items (this one calls the web, about a minute):

- HQ > University > **Check sources**, or:

```
node scripts\uni.js check
```

"Refused the checker, open it by hand" is a note, not a fault: the site (Gutenberg, Yale, OSHA) turns robots away.
Click one or two to see they open. Never get round a site that blocks.

## 3. Start a course

- HQ > University > Areas > an area > **Scaffold** beside a proposed course, or:

```
node scripts\uni.js scaffold "Faith and philosophy" "Ancient advice for a calm life"
```

This writes `profiles\university\courses\<slug>.json` with the units to do. Nothing shows on the site yet.

## 4. Hear the lectures

- HQ > University > Courses > **Listen** on the course, or:

```
node scripts\uni.js listen human-nature
```

Whisper hears every lecture the course plays, on the graphics card, about 17 minutes of PC time per lecture. Only
text is kept (`profiles\university\listen`). It can run overnight. Close other heavy programs first.

## 5. Write a unit

Today this is the one step that still needs a Claude chat: HQ > University > Courses > **Copy brief** beside the
unit, paste the whole prompt into a new chat started in the void-channel folder.

A unit is finished when HQ shows the green "finished" chip: Why you need this, a scene or a lab, the main piece,
a crystal, and (for a found course) a quiz whose answers quote the source.

## 6. Set the times

- HQ > University > Courses > **Set times**, or:

```
node scripts\uni.js times human-nature
```

Every quiz answer and chapter moves to the second its words are said. Find one line by hand:

```
node scripts\uni.js find human-nature 2 "the ring of Gyges"
```

Find a phrase across every lecture heard so far:

```
node scripts\uni.js search "weakness of will"
```

## 7. Look at it

- HQ > University > **Build preview**, then **Open preview**. By hand:

```
node scripts\uni.js build
```

```
node profiles\university\serve.js
```

Then open http://127.0.0.1:8783. Look at it full screen and on the tablet, both ways up.
Drafts show in the preview with a draft badge. They are not on the public site.

## 8. Put a course on the public site

1. HQ > University > Courses > tick **Live** on the course. Only ticked courses go public.
2. HQ > University > **Build public copy**, or:

```
node scripts\uni.js build --site
```

3. Deploy, in your own Terminal panel (it is signed in to the CASH Cloudflare account):

```
npx.cmd --yes wrangler@4.151.0 deploy --config C:\Users\bryan\void-channel\profiles\university\wrangler.jsonc
```

4. Open https://university.voidtv.net and click into the course.

To take a course off the site: untick Live, then steps 2 and 3 again.

## Rules that keep it legal

- No ads, sponsor listings, fees or email sign-up anywhere on the University. Open Yale and MIT allow their courses
  only for non-commercial use. The CASH donation line in the footer is fine.
- Sources: public domain, Open Yale, MIT OCW, US government. Never OpenStax or Radiopaedia.
- Pushing void-channel to GitHub does not deploy the University, but it does rebuild voidtv.net.

## Where things are

- Courses: `profiles\university\courses\*.json`. Which are live: `profiles\university\list.json`.
- Sources by area: `profiles\university\sources\*.json` (format in `sources\FORMAT.md`).
- The recipe in full: `docs\COURSE-RECIPE.md`. The decisions: `docs\DECISIONS.md`. What is left: `docs\FINISH-PLAN.md`.
