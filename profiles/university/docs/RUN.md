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

On this PC, with no chat (the lecture must be heard first, step 4; Ollama must be running):

```
node scripts\uni.js draft human-nature 3
```

The local model (gemma4:12b on Ollama) reads what Whisper heard and writes Why you need this, the everyday scene,
the chapters, the quiz and the crystal. It takes under a minute. The program then checks the model: a quiz answer or
a chapter is kept only if its quoted words are said in the lecture word for word, and its time is taken from there.
The scene is laid out by the program from the model's words, on places that never touch; a word too long for its
place is refused. Everything dropped is listed. The draft lands in `profiles\university\drafts\human-nature-3.json`.

Every lecture heard so far, in one go:

```
node scripts\uni.js draft human-nature all
```

Build the preview (step 7) and the drafts show inside their course, titled "Draft, not kept yet". They are never
in the public copy. Read each one there. To change a line, open the draft file and edit it; build again to see it.
The model's scenes are plain and all use one layout (two sides, a thing between them); rewrite the words in the
draft's `scene` block if the analogy is weak. When a draft reads right:

```
node scripts\uni.js keep human-nature 3
```

That moves the unit into the course. It refuses, and says what is missing, if the draft is not whole.

To use another local model for one run (PowerShell): `$env:UNI_MODEL='gpt-oss:20b'` before the draft line.

The other way is still there: HQ > University > Courses > **Copy brief** beside the unit, paste the whole prompt
into a new Claude chat started in the void-channel folder.

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

1. HQ > University > Courses > tick **Live** on the course. Only ticked courses go public. Or one line
   (`off` takes it back out):

```
node scripts\uni.js live human-nature on
```

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

## 9. Old books in plain English (the shelf)

An old public-domain how-to book from the source list, with plain modern English beside the printed words.

1. Pick a book marked "old" in HQ > University > Areas (it must be on the Internet Archive) and plan it:

```
node scripts\uni.js shelf plan Land abc-vegetable-gardening-1916
```

It fetches the scan's text from the Archive and lists the chapters it found. A scan can get a heading wrong: fix
the title or delete a chapter in `profiles\university\shelf\<id>.json`.

2. Rewrite one chapter, or all of them (about 2 seconds a passage on this PC; a stopped run carries on where it was):

```
node scripts\uni.js shelf write abc-vegetable-gardening-1916 all
```

The printed side is cut from the scan by the program. The model writes only the plain side, and a rewrite that
is empty, far shorter or far longer than its passage is left out and counted (run it again to retry those).

3. Build the preview (step 7) and read it. The front page gets a row "Old books in plain English".

4. Warnings. A passage that names something now known to be unsafe shows a red warning with a US government page.
The rules are in `profiles\university\shelf\warnings.json` and are written by a person, never by the model: the
words to look for, the warning, the page. Open the page yourself before adding a rule. After a change, run the
write line again (it re-applies the rules without rewriting anything).

5. When the book reads right, put it in the public copy, then step 8:

```
node scripts\uni.js shelf live abc-vegetable-gardening-1916 on
```

## 10. A class from an old book

A class is a small course built from one book on the shelf: one unit for each chapter that is in plain English.
Each unit gets Why you need this, a scene, the chapter to read, a quiz whose answers quote the printed book, and
a crystal. It is a course like any other: same Courses tab, same Live switch.

```
node scripts\uni.js class abc-vegetable-gardening-1916 "Grow your own vegetables"
```

```
node scripts\uni.js draft grow-your-own-vegetables all
```

Then read the drafts in the preview and `keep` each one (step 5). The name after the book id is the class's name;
leave it off to use the book's own title. When the class goes Live, its book goes public with it.

## 11. A course from recorded lectures

For a proposed course whose source is an open course with lectures on the Internet Archive (Areas tab shows
"Archive video" or "Archive audio only" on the source):

```
node scripts\uni.js scaffold "Civics and history" "How the country began"
```

```
node scripts\uni.js lectures how-the-country-began
```

The second line makes one unit to do for each lecture in the Archive item and says how long listening will take.
Then step 4 (Listen), then `draft how-the-country-began all`, then read and keep. This is how Human nature is made.

## 12. The look

The preview header has a **Look** picker: Navy and brass (the first look), Bright night, Daylight. It changes the
look on your screen only, so you can judge each one on the real pages. To build the site with a look, set this
line in `profiles\university\profile.json`:

```
"look": "bright"
```

The words are `classic`, `bright` and `daylight`. Then build and deploy (step 8).

Type works the same way: the preview header has a Type picker (Inter, Atkinson Hyperlegible, Literata), and
`"type"` in profile.json (`inter`, `hyper` or `literata`) sets the faces the site is built with.

## Rules that keep it legal

- No ads, sponsor listings, fees or email sign-up anywhere on the University. Open Yale and MIT allow their courses
  only for non-commercial use. The CASH donation line in the footer is fine.
- Sources: public domain, Open Yale, MIT OCW, US government. Never OpenStax or Radiopaedia.
- Pushing void-channel to GitHub does not deploy the University, but it does rebuild voidtv.net.

## 13. A 3D scale stage

A unit can carry a `"scale"` block beside its scene and its lab: measured things drawn in 3D at their true size to
each other, that you can turn, zoom and walk along. Each thing is a block whose volume is its number.

The first one is in Critical thinking, unit 3 (The weight of everything alive). To make another, copy that block in
`profiles\university\courses\critical-thinking.json` into the unit you want and change:

- `things`: a name (22 letters at most), a `group` for its colour (plant, microbe, fungi, animal, people, farm, wild),
  its number under `values`, and `src`, the key of its source. Leave a number out of a state when no paper gives one;
  the stage then shows a faint outline and says so.
- `unit`: the words for the number and how many of them one counts for (the first set counts billions of tonnes of carbon).
- `states`: one or more times to compare (Today, Before people spread).
- `sources`: title, who wrote it, year and an https link. Papers only.
- `guess`: the question asked before the stage opens, its answers, the right one, and the line shown after.

Then check and look:

```
node scripts\uni.js check
node scripts\uni.js build
```

There are two kinds. `"kind": "amount"` draws blocks whose volume is the number (the biomass set). `"kind": "size"`
draws each thing as wide as it really is: every number is in metres, `"unit"` is `{ "measure": "length" }`, and each
thing may name a `shape` (ball, tall, disc, ring for an orbit, bar for a distance). The second block in the same unit
(From a blood cell to the next galaxy) is the one to copy. A unit can carry one block or a list of them.

A thing with no number or no source is refused by the check. The stage shows in the preview at once. It goes in the
public copy only when the block says `"live": true`, the same rule as a lab.

## 14. Make questions with your phone

While a lecture plays in the preview on this computer, your phone is the note pad. One viewing gives the unit its
timed questions.

1. Start the preview (`node profiles\university\serve.js`) and open a course that has lectures. The first time,
   Windows may ask whether Node.js may be reached on private networks. Say yes, or the phone cannot connect.
2. On a lecture, press **Make questions with your phone**. A QR picture shows. The button is there only for a
   lecture that has been heard (`node scripts\uni.js listen <course>`).
3. Scan it with the phone. The phone must be on the same Wi-Fi as this computer. If the phone cannot open the
   page, press **Phone cannot open it? Try another address**, or type the address and code shown beside the picture.
4. Play the lecture. When something worth a question is said, tap **Mark this moment** on the phone. The lecture
   stops and the words just said come up on the phone.
5. Tap the first and last line the answer comes from (8 words or more). Write the question, the right answer,
   three wrong answers and one line on why. Tap **Save the question**. The lecture plays again.
6. Press **Done** on the computer. The page is built again with your questions in Check yourself.

A question is refused, with the reason on the phone, when its words are under 8, two answers are the same, a box
is empty, or another question already quotes that moment. The quote is always the lecture word for word.

Where it is written: into the unit's draft while the unit is a draft (`keep` still decides when it joins the
course), or straight into the course once the unit is kept. A kept unit of a live course carries it at your next
deploy.

What a phone can reach: only the phone page and its room. The preview pages, the lecture's words and every save
stay on this computer. This works at home only; the live site has no make button.

### Taking a lesson on phones

The other button on a lecture, **Answer on your phones**, is for learners. It shows on any lecture that has timed
questions (Check yourself with times).

1. Press it. A QR picture shows. Everyone scans it; up to 40 phones, on the same Wi-Fi as this computer.
2. Play the lecture. When it reaches the end of a line a question quotes, the lecture stops and the question is on
   every phone.
3. Each phone gets two tries, then sees the answer, the reason and the lecture's own line. The computer shows only
   how many have answered.
4. The lecture plays on when every phone has answered. **Carry on** plays on without waiting.
5. **Done** ends it. Each phone shows its own score. Nothing is saved anywhere.

A question the lecture is skipped past is not asked; wind back before it and it is. This works at home only, like
making questions: the live site has neither button until the phone relay on voidtv.net accepts the University.

## 15. Body Atlas lessons in a course

Body Atlas (body.bspokevisuals.com) is a practice site in `profiles\university\list.json`, the same kind of entry as
Mind Gym. Its lessons are its rooms. A unit opens one with `"main": { "role": "train", "room": "<lesson name>" }`,
which shows a **See it in 3D** piece with an **Open the lesson** button. The course built on it is The body
(`courses\the-body.json`): shoulder, hip, knee, spleen.

To add a lesson once Body Atlas has made one public:

1. Add it to the Body Atlas entry's `rooms` in list.json: `id` (the lesson's short name), `name` (its title),
   `trains` (one line on what it shows).
2. Write its unit in `courses\the-body.json` like the others. Each quiz line names its `lesson` and `step` and
   quotes that step word for word, 8 words or more.
3. `node scripts\uni.js check` reads the lesson's own file from Body Atlas and refuses a quote the lesson does
   not say, a step that is gone, or a step that rests on a source the University does not use.

Mark it live with `node scripts\uni.js live the-body on`. That also turns on the Body Atlas card in the Body row.

## Where things are

- Courses: `profiles\university\courses\*.json`. Which are live: `profiles\university\list.json`.
- Sources by area: `profiles\university\sources\*.json` (format in `sources\FORMAT.md`).
- The recipe in full: `docs\COURSE-RECIPE.md`. The decisions: `docs\DECISIONS.md`. What is left: `docs\FINISH-PLAN.md`.
