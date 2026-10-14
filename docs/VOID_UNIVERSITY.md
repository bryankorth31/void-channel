# Void University — the learning side of the Void

B, 2026-10-13: "I credit YouTube university as a huge part of my life and understanding. Also IRC,
and I archived to read books and such over my life. I would like to discuss the search and if there
is a known body we can pull from to build Void University."

This is the discussion, written down so it survives. Nothing here is built; it is the direction we
explode in after VoidTV is live (B: "I will finish this first... but then we explode in all the
other directions").

## The idea in one line

The same machine that turns the Archive's scattered TV uploads into ordered, playable shows can turn
its scattered lectures, books, recordings and software into ordered, followable **courses** — and
the X-Ray connections layer is what ties the media types together: a lecture links to the book it
assigns, the book to the documentary on the same subject, the documentary to the lecturer's other
courses, the course to the software you can run in the browser to try the idea.

## Known bodies to pull from (precise sources, not fuzzy hunting)

TV had to be hunted loosely because uploads are chaotic. Learning material mostly lives in named
collections with real metadata, so this hunt is **collection-scoped queries**, far easier and far
lighter on the Archive.

**Video lectures**
- **UC Berkeley webcasts** — about 20,000 course lectures Berkeley deleted from YouTube in 2017;
  preserved on the Archive as whole semesters. The single richest body.
- **MIT OpenCourseWare** and **Yale Open Courses** — CC BY-NC-SA, with structured course catalogs
  (course → lecture list) to match against, exactly the way TVmaze gives us show → episode list.
- **Khan Academy** (CC), **Stanford / Harvard / CMU** open lectures where mirrored.
- **Computer Chronicles** and **Net Café** — the Archive's own collections; the history of the
  machines we're using.
- **The Great Courses** uploads — "whatever the Archive has."
- **YouTube university, mirrored** — youtube-* Archive items of 3Blue1Brown, Computerphile,
  Numberphile, Crash Course, Veritasium, Kurzgesagt, CGP Grey, Periodic Videos, Sixty Symbols,
  Kahn-style channels. Same ruling as Internet Comedy: for this row the mirrors ARE the content.
- **Documentaries already in VoidTV** (Documentary & Geographic, History, Nature & Science) are
  course material too; a course can assign an episode.

**Books and reading**
- **Open Library** (the Archive's own lending library) and the Archive's texts collection.
- **Project Gutenberg** and **Standard Ebooks** — public domain, clean EPUBs.
- **LibriVox** — public-domain audiobooks, hosted on the Archive, read by volunteers.
- **Wikisource / Wikibooks / Wikiversity**, **OpenStax** textbooks (CC BY), **Saylor Academy**.
- This is the READ mode B has prior work on (books and comics reader). Same shell as the player.

**Sound**
- Old Time Radio collections (drama, but also lectures and talks), NPR/CBC archives where present,
  BBC Reith Lectures uploads, conference talks (CCC, DEF CON, PyCon archives are on the Archive).

**Software and practice**
- The Archive's emulated software (DOS, Apple II, Mac, consoles) runs in the browser already; a
  course on BASIC can hand you the actual machine. This is PLAY mode's engine pointed at learning.

**Community**
- IRC is the ancestor of the study hall: a plain text room per course or per subject, no accounts
  needed beyond a nickname. The social piece comes last and stays optional.

## How it would be built (the same factory, different store)

1. **Course list** instead of show list: `scripts/course-list.json` seeded from OCW/Yale/Berkeley
   catalogs (subject, course code, lecturer, year, lecture titles).
2. **Hunt** by collection and identifier (`collection:ucberkeley-webcast`, `creator:"MIT OpenCourseWare"`),
   match lectures to the catalog's lecture list by number and title, pick the playable file — the
   match.js judges work unchanged: runtime band (50/80 min lectures), sequence fallback, playability.
3. **Readings**: the catalog's assigned texts → Open Library / Gutenberg lookups by title+author →
   a reader link beside each lecture.
4. **People layer**: lecturers are people like actors are. TMDB won't have them; Wikidata will
   (occupation, institution, field). The connections graph then links a lecturer to every course,
   talk, book and documentary of theirs we hold.
5. **Subject graph**: Wikidata's subject hierarchy (physics → mechanics → ...) connects a course to
   the documentaries, books and software on the same subject across media types. That is the Void
   University X-Ray: not "who else is in this," but "what else teaches this."
6. **Site**: a University door off the home page; course page = syllabus (lectures in order, same
   player, resume, Mine, notes), readings, "what else teaches this," lecturer page.
7. **Mine** extends naturally: progress through a syllabus, notes per lecture, a transcript of what
   you've completed — exportable, synced later by the same code.

## What makes it different from a playlist site

- Order and completeness: lectures in syllabus order with the gaps shown, like our episode grids.
- Everything plays or opens here; no dead links to paywalls.
- The cross-media connection graph. YouTube can recommend the next video; it cannot hand you the
  book, the lecturer's other course, the documentary and the machine in one panel.
- Free, no accounts, same donation framing: the material belongs to the institutions and the
  Archive; the better way to find and follow it is the work of CASH.

## Courses we author ourselves: curriculum first, then the voices (B, 2026-10-13)

B: "Build a course of our own from known areas for things needed and useful to learn, and once we
build this list and course, from the inverse — people who've shown ability and speak on this — and
then build that into Void University courses, in addition to the courses we build from the material
at hand from the Archive in various media formats."

So there are two kinds of course, and they meet in the same graph:

| | **Found courses** | **Authored courses** |
|---|---|---|
| Starts from | material that exists (a Berkeley semester, an OCW course) | a need ("things needed and useful to learn") |
| Order comes from | the institution's syllabus | our curriculum: what a person needs to be able to DO |
| Teachers are | whoever the institution hired | the **voices**: people who have shown ability and speak on it, chosen by us |
| Media | mostly lecture video | whatever teaches it best: a talk, a chapter, a documentary, a radio interview, a program to run |

### Step 1 — the curriculum: what is needed and useful

A spine of domains → competencies → outcomes, written in B's voice (the editorial record; see
`voice:b` primacy). Not "Intro to Economics" but "keep a household solvent." The test for every
entry: would a busy person on a stretched budget be better off a month after learning it? Starter
domains to react to (B edits; nothing here is final):

- **Money** — budget, debt, credit, taxes, insurance, how banks and markets actually work
- **Food** — cook from staples, feed a family cheaply, preserve, nutrition without fads
- **Home** — fix what breaks (plumbing, electrical basics, drywall), tools, energy, renting and owning
- **Body** — sleep, strength, first aid, reading a lab result, navigating a hospital
- **Mind** — how to think (logic, probability, fallacies), how to learn, attention, consciousness
  (Jaynes belongs here)
- **Words** — write plainly, speak in a room, argue fairly, read hard books
- **Law and rights** — contracts, tenancy, police encounters, small claims, what a 501(c)(3) is
- **Work and trades** — how a trade is learned, running a one-person business, negotiating pay
- **Machines** — how computers, networks and the internet work; a first program; keeping your data
- **Making** — drawing, music, woodworking, electronics, photography, film
- **Land** — growing food, soil, water, weather, animals
- **Civics and history** — how government works, how we got here, the big arguments
- **Faith and philosophy** — the traditions, what they claim, how to read them
- **Family** — raising children, caring for parents, marriage, grief
- **Emergencies** — fire, flood, power out, bleeding, lost, car broken down

#### B's first two entries (2026-10-13), and a rule that comes with them

1. **Critical thinking.** Outcomes: tell a claim from its evidence; spot the standard ways an
   argument cheats; know what a number can and cannot say; notice when a story is doing the
   thinking for you; change your mind in public without shame; read a hard text without an
   intermediary telling you what it means.
2. **Data — without the predetermined silos as the walls.** Outcomes: find the primary source
   (the dataset, the filing, the paper, the transcript) instead of the report about it; read a
   table, a chart, a rate, a base rate; know how a statistic is manufactured and by whom; cross a
   discipline's border when the answer lives on the other side; tell measurement from
   interpretation; keep your own records.

3. **IFTTT and the mechanisms** (B, 2026-10-13). If-this-then-that as a way of seeing: everything
   from a toaster to a government to a news feed is a mechanism with triggers, actions and feedback,
   and most of them are running on you. Outcomes: take a thing apart (in your head or on the bench)
   until you can say what triggers what; recognise feedback loops, delays and incentives ("show me
   the incentive and I'll show you the outcome"); see the mechanism behind a feed, a fee, a form, a
   habit; build your own small automations (a spreadsheet rule, an IFTTT/Shortcuts recipe, a script)
   so the machine works for you instead; know when a mechanism is designed to be opaque.

**The rule** (B: "without using the predetermined silos as the walls the media and content needs
to come from"): the material for an authored course is not fenced by where it came from. A
university lecture, a 1970s public-television hour, a trade's apprenticeship film, a radio
interview, a hobbyist's demonstration, a court transcript and a chapter read aloud all qualify on
the same test — does it teach the outcome, and is the person demonstrated. The institution is one
source among many, not the wall. This applies to Step 2 as well: a demonstrated amateur beats an
undemonstrated credential.

### Step 2 — the inverse: who has shown ability and speaks on it

For each competency, find the **voices**: not the most famous, the most *demonstrated*. The
standard is evidence of doing, then evidence of teaching clearly, then open material:

1. **Did it** — built, fixed, ran, healed, grew, won, survived the thing (Wikidata occupations,
   awards and notable works; trade bodies; court records for lawyers; competition results).
2. **Teaches it well** — talks, lectures, books, interviews where people learned (the Open Syllabus
   Project — the most-assigned readings across millions of real syllabi — is a known body for the
   book side; conference archives for talks; LibriVox/Open Library for texts).
3. **Material is open** — on the Archive, mirrored, public domain, or CC.

Each voice becomes a person node in the same graph as the TV people, with `evidence` (why they
qualify) and `teaches` (which competencies). Two or three voices per unit from different angles
(the academic, the practitioner, the critic) so no single voice owns a subject. Grifters fail
test 1 by construction: selling it is not doing it.

#### Draft voices for the first two entries (candidates; B approves or strikes)

Evidence in brackets: D = did it, T = teaches it well, O = open material exists (Archive / mirrors /
public domain). All angles mixed on purpose: scientists, a magician, a schoolteacher, a doctor.

*Critical thinking*
- Richard Feynman — physicist [D: Nobel, Challenger inquiry; T: "Cargo Cult Science", Messenger
  Lectures; O: lectures and interviews on the Archive]
- Carl Sagan — astronomer [D: Voyager, Viking; T: the "baloney detection kit", Cosmos; O: Cosmos,
  talks]
- Neil Postman — media critic and teacher [D: 40 years teaching; T: "Bullshit and the Art of
  Crap-Detection" (1969 talk), Amusing Ourselves to Death; O: talks and readings on the Archive]
- James Randi — stage magician and investigator [D: exposed Geller, Popoff, faith healers with
  demonstrations, not arguments; T: lectures, the Million Dollar Challenge; O: Archive]
- Bertrand Russell — philosopher [D: Principia, a life of public argument; T: the 1959 BBC
  interviews, "ten commandments" of thinking; O: public domain and Archive]
- Daniel Kahneman — psychologist [D: Nobel for showing how judgment fails; T: Thinking, Fast and
  Slow, lectures; O: talks mirrored]
- John Taylor Gatto — schoolteacher [D: 30 years in NYC classrooms, NY State Teacher of the Year,
  then quit in public; T: "The Underground History of American Education", talks; O: Archive] —
  the critic angle on where thinking gets trained out of people
- Harry Frankfurt — philosopher [T: "On Bullshit"; O: readings] — short, exact, the vocabulary
- Julian Jaynes — psychologist [T: The Origin of Consciousness in the Breakdown of the Bicameral
  Mind, the 1980s lectures; O: Archive] — B's own reading of consciousness; the Mind domain's door

*Data without silos*
- Hans Rosling — physician and statistician [D: practiced medicine in Mozambique, built Gapminder;
  T: the bubble-chart talks that made a billion people read a trend; O: talks mirrored]
- Edward Tufte — statistician [D: the Challenger analysis; T: The Visual Display of Quantitative
  Information, the one-day course; O: lectures mirrored]
- Darrell Huff — journalist [T: How to Lie with Statistics (1954), the most-read statistics book
  ever written; O: Archive]
- W. Edwards Deming — statistician [D: rebuilt Japanese industry's quality from data; T: the
  four-day seminars, Out of the Crisis; O: 1980 NBC "If Japan Can, Why Can't We?" and seminars on
  the Archive]
- John Ioannidis — physician [D/T: "Why Most Published Research Findings Are False"; O: lectures]
- Ben Goldacre — physician [D: ran AllTrials; T: Bad Science, "Battling Bad Science"; O: talks]
- Nassim Taleb — trader turned scholar [D: made and kept money on tail risk; T: Fooled by
  Randomness, lectures; O: lectures mirrored] — the practitioner angle: skin in the game
- Tim Harford — economist and broadcaster [T: More or Less (BBC), How to Make the World Add Up; O:
  episodes mirrored] — how a number gets into the news
- Claude Shannon — engineer [D: information theory itself; T: lectures; O: Archive] — what data is
- Cathy O'Neil — mathematician and former quant [D: built the models; T: Weapons of Math
  Destruction; O: talks] — the critic angle on data used as a wall

*IFTTT and the mechanisms*
- Tim Hunkin — engineer and cartoonist [D: builds working machines for a living; T: The Secret
  Life of Machines (Channel 4, 1988–93), which he released freely himself; O: Archive, by the
  maker's own wish] — the anchor: a toaster, a fax, a washing machine, taken apart on camera
- James Burke — science historian [T: Connections (BBC 1978), The Day the Universe Changed; O:
  Archive] — mechanisms of change across centuries; one trigger, ten consequences
- Donella Meadows — systems scientist [D: Limits to Growth; T: Thinking in Systems, "Leverage
  Points"; O: lectures on the Archive] — stocks, flows, feedback, delay: the grammar of mechanisms
- Buckminster Fuller — inventor [D: the dome, the Dymaxion work; T: "Everything I Know" (42 hours,
  1975); O: Archive, released by his estate] — the long-form voice
- Richard Hamming — mathematician [D: Bell Labs, error-correcting codes; T: "You and Your
  Research", The Art of Doing Science and Engineering lectures; O: Archive]
- Norbert Wiener — mathematician [D: founded cybernetics; T: The Human Use of Human Beings; O:
  readings] — feedback as the idea behind the idea
- Seymour Papert — mathematician and educator [D: LOGO, the Turtle; T: Mindstorms; O: talks and
  the LOGO software itself, runnable in the browser] — learn a mechanism by building one
- Charlie Munger — investor [D: the record; T: the "Psychology of Human Misjudgment" talk, the
  mental-models speeches; O: mirrored talks] — incentives as the master mechanism
- Bill Hammack ("engineerguy") — chemical engineer [D: practising engineer; T: the engineerguy
  films; O: he publishes them freely] — a modern Hunkin
- Adam Savage — maker [D: builds; T: MythBusters method, Tested; O: episodes/talks mirrored]
- Don Norman — cognitive scientist [T: The Design of Everyday Things; O: talks] — why the door
  says push: mechanisms designed for or against you
- Ivan Illich — priest and critic [T: Tools for Conviviality, Deschooling Society; O: Archive] and
  Jacques Ellul — sociologist [T: The Technological Society; O: readings] — the critic angle: when
  the mechanism owns the user
- B. F. Skinner — psychologist [D: the operant chamber; T: the lectures; O: Archive] — the
  reinforcement schedule, which is what every feed runs; paired with Tristan Harris [D: ex-Google
  design ethicist; T: the attention-economy talks; O: mirrored] for the present tense
- Practice layer, not voices: IFTTT, Apple Shortcuts, Android Tasker, a spreadsheet, a first
  shell script — and the Archive's emulated machines for taking old software apart

Deliberately not here: pundits, politicians, anyone whose evidence is an audience rather than a
result. The hard exclude (politics/government/news) holds in Void University too.

### Step 3 — assemble the course

A course = ordered units. A unit = one primary piece (a talk, a lecture, a chapter read aloud) +
a reading + a documentary or episode from VoidTV if one fits + a practice ("do this tonight") +
the voices for that unit. The hunter finds the media the same way it finds episodes: search loose
(creator, title, collection), judge strict (runtime, source, playability). Progress, notes and
completion live in Mine.

### Files

- `curriculum/curriculum.json` — domains → competencies → outcomes, B's voice.
- `curriculum/voices.json` — person → { teaches: [competency], evidence, sources } (TMDB id if a
  TV person, Wikidata id otherwise).
- `catalog/courses/<slug>.json` — compiled courses (found and authored alike), same shape as a show
  grid: units instead of seasons, pieces instead of episodes.

### Why the graph is the point

Anthony Bourdain is a voice in Food and a show in Reality & Talk. Richard Feynman is a voice in
Mind and Machines, a lecturer in a found course, and a documentary subject. Pick any node and the
panel shows the rest. That is the same "degrees of separation" idea from B's first Archive-TV
design, now carrying learning instead of trivia.

## The model: where it adds (B, 2026-10-13: "build a model into this area where it adds")

Three places a model earns its keep here, in the order they pay off. Everything keeps the house
rules: the site stays static and free, no accounts, nothing required of the visitor.

**1. The course-drafting engine (builder side, on B's PC; first).** Given a curriculum entry, the
model does what I did by hand above, but against the actual bodies: queries Wikidata for people
whose occupations, works and awards match the competency; Open Syllabus for the most-assigned
texts; the Archive's search for talks, series and readings by those people; TVmaze/TMDB for the
documentary and episode tie-ins we already hold. It returns voices **with evidence** (did it /
teaches it / open), candidate units with the exact Archive items, and a draft syllabus in B's
voice. B approves, strikes, reorders in the Control Room; nothing publishes without him. Cost:
pennies per course, zero per visitor. Model: Claude (claude-sonnet-5-5 for drafting; the same
loop can run from a Claude Code session today without any new code).

**2. Transcripts and the connections index (builder side; alongside).** Most Archive lectures have
no transcript. Whisper on B's PC transcribes from the audio stream (no video stored) and writes
timed text per piece. That alone adds: search inside a lecture, "jump to where Feynman says it",
quotable passages with timestamps, captions. Then a local embedding model over transcripts,
chapters and episode overviews builds the **subject graph** statically: "what else teaches this"
across media types, computed once in the builder, shipped as neighbour lists. No inference at
visit time.

**3. The study companion (visitor side; after the site is live).** An "Ask" button on a unit,
grounded ONLY in that unit's transcript and readings (so it quotes Feynman rather than
impersonating him), that does three things: answers "what did he mean by X" with the timestamp,
asks the viewer one Socratic question back after a piece (the critical-thinking entry turned into
practice), and points to the connected piece in another medium. Runs as a Cloudflare Worker with a
monthly budget (Workers AI small model free tier first; claude-haiku-5-5 behind it if the
quality isn't there), rate-limited per IP, no login, opt-in per click. If the budget is spent,
the button says so and the course still works without it. Never a chatbot that replaces the
material; a reading partner that sits beside it.

What the model does NOT do: choose the curriculum (that is B's voice), rank voices by fame,
summarise a lecture so you can skip it, or talk to a visitor who did not press the button.

## Order of operations

VoidTV to live first (TV world, nightly job, domain swap). Then: READ mode (the reader B already
started) because it is both a University piece and its own thing; then the course hunt against the
Berkeley/OCW/Yale bodies; then the subject graph. Sync code arrives in between so progress follows
you from phone to TV.
