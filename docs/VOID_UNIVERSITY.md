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

4. **The whys, and nucleation learning** (B, 2026-10-13: "the whys of things mattering if you
   know it; the reasons why learning different is important; nucleation learning"). B's term,
   defined with him: knowledge nucleates. A few well-chosen seeds, planted in different domains,
   are what later information crystallises around; without seeds, facts stay in solution,
   supersaturated and inert, and wash out. Knowing *why* a thing matters is itself a seed, and the
   strongest one. Learning *different* things is not breadth for its own sake; it is laying down
   nucleation sites so that a connection can form between them (Burke's Connections, Koestler's
   bisociation, Papert's gears). Outcomes: say why a thing matters before you learn it, and if you
   can't, learn that first; carry seeds in many domains on purpose; recognise a nucleation moment
   (when scattered facts suddenly organise) and stop to let it set; tolerate supersaturation (the
   confusion before structure) without quitting; learn by analogy across domains; teach a thing to
   crystallise it; notice which of your beliefs never had a seed.

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

*The whys, and nucleation learning*
- Jacob Bronowski — mathematician and historian of science [D: a working scientist; T: The Ascent
  of Man (BBC 1973), Science and Human Values; O: Archive] — the anchor: knowledge as a personal
  act, the why before the what
- Richard Feynman — [T: the 1983 BBC "Fun to Imagine" interviews, above all the "why do magnets
  repel" answer, which is this entry in seven minutes; O: Archive]
- Alfred North Whitehead — philosopher [T: "The Aims of Education" (1929): the rhythm of romance,
  precision, generalisation — nucleation described a century early; O: public domain]
- Seymour Papert — [T: the gears story that opens Mindstorms: a child's seed crystal; O: Archive]
- Arthur Koestler — writer [T: The Act of Creation: bisociation, the idea forming where two
  domains touch; O: readings] — why learning different matters, stated as a mechanism
- Douglas Hofstadter — cognitive scientist [D: Gödel, Escher, Bach; T: "Analogy as the Core of
  Cognition" lecture; O: mirrored]
- Mortimer Adler — philosopher and teacher [D: the Great Books program, the Paideia schools; T:
  How to Read a Book, the 1950s–80s television teaching; O: Archive]
- John Holt — schoolteacher [D: a classroom career, then the unschooling movement; T: How Children
  Fail / How Children Learn; O: readings and interviews] — what kills the seed
- Maria Montessori — physician [D: the method, built from observation; T: The Montessori Method;
  O: public domain] — prepared environments as nucleation sites
- Michael Polanyi — chemist and philosopher [D: physical chemistry; T: Personal Knowledge, The
  Tacit Dimension; O: readings] — "we know more than we can tell": the seed is not always words
- Barbara Oakley — engineer [D: the most-taken online course ever, Learning How to Learn; T: the
  course, A Mind for Numbers; O: talks mirrored] — the practice angle: focused and diffuse modes
- Viktor Frankl — psychiatrist [D: survived the camps and treated others; T: Man's Search for
  Meaning, the 1972 lecture; O: Archive] — the why that outlasts the what
- Julian Jaynes — [see entry 1] — the largest seed B ever planted, by his own account
- Found piece to open the course with: Saul Bass, "Why Man Creates" (1968, 25 minutes; O: Archive)

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

## Void School: the homeschool toolkit (B, 2026-10-13)

B: "Could we build this using our full library to be homeschool tools — the entire class, videos to
go with, tests and study material and articles in all forms? I see this as no more than continuing
to apply the same way to all the rest, assigning criteria and filtering cross-connections with a
simple model."

Yes. It is the same machine with a different list, plus one generated layer. What changes, honestly:

**Same machine**
- *List*: a scope and sequence instead of a show list — strands (reading, writing, math, science,
  history/civics, arts, practical life) × levels, each lesson with an outcome. Not invented from
  scratch: whole K–12 curricula already exist under open licences and give us the spine and the
  order — Core Knowledge (K–8, CC BY-NC-SA), EngageNY / Eureka (K–12 math and ELA, CC BY-NC-SA), Illustrative Mathematics (CC BY), CK-12 (CC BY-NC), OpenStax high-school
  texts (CC BY), Khan Academy, Siyavula, Wikisource/Gutenberg for the readings. These are known
  bodies; we match to them like TVmaze.
- *Hunt*: the lesson's video from the library (Bronowski, Burke, Sagan, Feynman, the Documentary
  and Nature & Science rows, Computer Chronicles, the found courses), judged by the same criteria
  — right outcome, demonstrated voice, playable — plus **level** and **suitability** (see the door
  below).
- *Match*: article = Simple English Wikipedia or Wikipedia section + a public-domain primary source;
  reading = the open textbook chapter or a Gutenberg text; practice = the open curriculum's own
  activities where they fit.
- *X-Ray*: the subject graph connects a lesson to its voices, to the next lesson, to the
  documentary that shows it, to the machine you can run.

**Standards matter; grading and accrediting are not ours. (B, 2026-10-13: "I see standards and
that stuff as important. I won't be grading or accrediting. We will show what we have and what and
how it fits the standards of xyz.")** So: every lesson is mapped to the published standards it
serves (Common Core, NGSS, the C3 framework for social studies, and state codes — all public), and
Void School shows a family *what we have and how it fits*: pick your state or framework, see which
standards our lessons cover, with which pieces, and where the gaps are. What we do not do is score
a child, issue grades, or claim accreditation. What a family keeps is what Mine already keeps —
what we watched, what we read, where we stopped — alongside the standards those lessons served, so
a parent can show their own record against their own state's list if they choose to.

**The generated layer (the "simple model", builder side, static output)**
For each lesson the model writes the wrap the library cannot supply: a why-it-matters paragraph
in plain words (entry 4 made mandatory — the seed goes in first); the standards the lesson serves,
with the exact code and the sentence of the standard it meets, checked against the material rather
than asserted; three questions worth talking about at the table afterwards, open ones; study
material — the words a child will meet for the first time, a one-page summary, practice items where
the open curriculum has them (never scored by us); one thing to make, try, visit or look for this
week; and a note to the parent — what to listen for, what children usually get tangled in, where
the piece is wrong or dated and what to say about that. Grounded on the actual material (transcript + reading), never on
the model's memory. B reviews by sampling; a flag on any lesson sends it back. Cost: pennies a
lesson.

**Care, not volume.** B: "I wish this to have a good amount of effort and care given it." So the
standard for a Void School lesson is higher than for a VoidTV row, and the throughput lower:
- every piece watched by a person before it is assigned (B, or someone he trusts), not just
  judged by the hunter;
- the voice test applied strictly (did it, teaches it well) and a third test added — *is this the
  best thing we hold for a child meeting the idea for the first time?* — so one superb Bronowski
  hour beats five adequate ones;
- the whole lesson readable by a parent in two minutes before pressing play, standards included;
- a standards view that is honest: coverage shown as it is, gaps shown as gaps, never a lesson
  stretched to claim a code it does not really meet;
- sequence that respects nucleation: the why, then the story, then the mechanism, then the
  practice; and the next lesson chosen so the seed just planted has something to grow on;
- a strand is finished when it is finished, not when a quota is met. One strand done with care
  before the second begins.

**What the library cannot do, said plainly**
- *Hands-on*: labs, music practice, sport, making — we can show and suggest, not supervise. The
  parent is the teacher; we are the shelf, the planner and the person who already watched it all.
- *Socialisation*: the study hall, later, optional.

**The door, and the kids rule.** VoidTV is an adult app behind an 18+ gate; that does not change.
Void School is a separate door with its own list and its own filter: every piece passes a
suitability check (level, content, the hard excludes) before it can be assigned, and nothing from
the Late Night or mature shelves is reachable from inside it. Household profiles (parent, each
child) live in the same Mine blob; the sync code moves the household together.

**The School front page: rows, like TV (B, 2026-10-13: "in the same way we present the rows
that side-scroll with the TV content, present the homeschool media in genre or grade rows, and in
them the media we have that qualifies").** Same shelf component, same cards, same arrows, same
▾ details, same filters bar — no new UI, a different list.

- **Rows by grade band** first: Early Years (K–2), Grades 3–5, Middle (6–8), High (9–12). A piece
  can sit in more than one band (Bronowski's "The Ascent of Man" is Middle and High).
- **Rows by subject** below: Reading & Literature, Writing & Speaking, Math, Science, Nature &
  Earth, History & Civics, Geography & World, Arts & Music, Machines & Making, Practical Life,
  Faith & Philosophy (for families who want it; its own row, never mixed in).
- **A card is a bundle, not a single file** (B, 2026-10-13: "a card would not just be one type of
  media; it would be the main media in that category, but also connecting and corresponding media
  that goes with it, in a drop-down"). The face of the card is the **main piece** for that subject
  and level — one episode, one lecture, one documentary hour — with its poster or still, title,
  level, and small marks showing what travels with it (watch · read · listen · do). The ▾ opens
  the bundle: first the wrap (why it matters, the standards with codes, the talk-about questions,
  the parent note), then the **companions**, each with its own button — *Read* (the book chapter,
  the article, the primary source), *Listen* (the radio hour, the audiobook chapter), *Watch also*
  (the second documentary, the TV episode that shows it, from the library behind suitability),
  *Do* (the program to run, the practice, the thing to build), *Who* (the voices, to their person
  pages), and *Part of* (the course or strand). This is nucleation made into furniture: the main
  piece is the seed, the drop-down is what crystallises around it. Play opens the same player;
  Read opens the reader; nothing leaves the bundle without a way back to it.
- **Filters bar**: grade, subject, format, standards framework (Common Core / NGSS / C3 / state),
  length. **Explore by standard** grid under the rows, the way TV has Explore by Genre: pick a
  code, see every piece that serves it.
- **Household rows at the top**: Continue (per child), Our List, and "This week" (what the parent
  queued), all from Mine.
- **What qualifies** for a row: passed suitability; level and subject assigned by the model and
  confirmed by a person; the voice test; and the "best thing we hold for a first meeting" test for
  anything placed in a K–2 or 3–5 row. A piece without a why-it-matters paragraph is not shown.
- **Data**: `catalog/school/pieces.json` — one record per bundle: main (show + season + episode,
  course lecture, or book id), companions [{role: read | listen | watch | do, source, title,
  minutes, why-this-one}], voices [person ids], grades, subjects, standards [{framework, code,
  text}], why, questions, words, practice, parentNote, partOf, reviewedBy, reviewedAt. The site builder turns it into rows exactly
  as it turns the show list into rows today.

**Guided mode: the HR-training player, done kindly (B, 2026-10-13: "a player that draws from
corporate HR videos that don't allow going to the next page until the entire thing, or all the
media, is selected or played").** Yes, and it is a mode of the player we already have, not a new
one. A parent switches a child's profile (or a single bundle) into *guided mode*; then:

- **The main piece plays through.** The scrub bar cannot jump ahead of the furthest point
  actually watched (rewinding is always allowed); playback speed is capped at 1×; the piece counts
  as watched when the end is reached, with a small margin for credits.
- **Every companion must be opened** — and, for a reading or a listen, kept open for a minimum
  time scaled to its length — before the bundle's **Next** lights up. The ▾ shows the checklist:
  watch ✓, read ◻, listen ◻, do ◻. "Do" is marked by the child or parent, since nobody can see the
  kitchen table.
- **Next** goes to the next bundle in the week the aid or the parent planned. Outside guided mode,
  Next is just a suggestion and everything is free.
- **Completion is a memory, not a mark.** It lands in Mine as "finished" with the date, and in the
  parent's note. No score, no streak, no badge economy.
- **Pausing is never punished.** Leaving the tab pauses the piece and holds the spot; coming back
  resumes. Children are allowed to go to the bathroom.

The honest caveat: with no server, the gate is a promise the page keeps, not a lock. A child who
knows developer tools can defeat it in a minute; so can a reload if we are careless, so progress
is written to Mine every few seconds. That is the right strength for a home: it holds the honest
child to the lesson and asks nothing of the parent's trust it cannot earn. If a stronger lock is
ever wanted, it needs accounts and a server, and we will say so rather than pretend. (B,
2026-10-13: "for this part we will get some space; until then this will be fine" — so the
page-kept promise now, a small server-side check when School has its own hosting.)

Same mode, optional, for Void University's authored courses (a learner can switch it on for
themselves: "don't let me skip").

**Later: the teacher's aid (B, 2026-10-13: "in this area we can in the future build a teacher's
aid model that can act as a semi-automated instructor").** The study companion from "The model"
above, grown up and given a classroom. *Semi*-automated is the design: the parent sets it, it
runs the day, the parent sees everything. What it does, in the order a lesson happens:

1. **Plans the week** from the rows: given a child's band, the subjects the parent chose and what
   was finished last week, it lays out a sequence that respects nucleation — the why, the story,
   the mechanism, the practice — and the parent approves or drags it around.
2. **Introduces each piece** before play, in the child's register: the why-it-matters, the two
   words to listen for, what to notice. Thirty seconds, then the piece plays untouched.
3. **Talks afterwards**: asks the talk-about questions, listens to the answer (typed, later
   spoken), follows up once or twice, and if the child is stuck, explains using the piece itself —
   "go back to the part where Bronowski is standing in the ..." with the timestamp — never from its
   own memory.
4. **Hands over the practice** and, at the end of the day, writes the parent a short note: what
   was watched, what the child said, where they lit up, where they got tangled, what to talk about
   at dinner. A note, not a grade.

Rules that do not bend: grounded only in the lesson's transcript, readings and wrap; no grades,
scores or rankings of the child; nothing a child types leaves the household except to the model
call itself, and the parent can read every exchange; a child-safe system prompt that refuses to
go off-material; per-household monthly budget with a plain "the aid is resting until next month"
when it is spent; always optional — every lesson works with the aid switched off, because the
parent is the teacher and the aid is the aide. Built on the same Worker as the companion,
claude-haiku-5-5 behind it; needs transcripts (Whisper pass) first. Position in the order:
after the School rows exist and one strand is done with care.

**Order.** VoidTV live → Void University's found courses and the first authored entries → Void
School, starting with ONE strand end to end (B picks; history/civics or science would use the
library hardest) done with care before the second strand begins.

## 18 Oct additions: own domain, more sources, lessons from a local model (B, about 3 AM)

B: Void University and a Void School / home-school site, built out with Fable, on **its own domain**. It links to
voidtv.net and voidtv.net kids through the same "portal" area: one VOID universe of sites, each its own domain.
Diversify where material comes from (Gutenberg and LibriVox are two), then build a system that turns free-use
material (Gutenberg ebooks first) into lesson plans with **a local model on B's PC**.

**More sources, beyond the bodies listed above.** The licence travels with every item. Keep a per-item record of
source, licence, attribution and URL, like the kids show approvals.
- **Texts:**
  - HathiTrust (full-view public-domain volumes);
  - Wikisource (CC BY-SA);
  - Perseus Digital Library (Greek and Latin classics with translations, mostly CC BY-SA);
  - Chronicling America at the Library of Congress (US newspapers 1770-1963; primary sources for history lessons);
  - Biodiversity Heritage Library (natural history books and plates, mostly public domain);
  - Open Library and the Archive's texts, but **public-domain scans only**: its lending library is in copyright.
    Never.
  - Faded Page and Project Gutenberg Canada and Australia: public domain *there*. Check US status per title.
- **Audio and music:**
  - LibriVox (above);
  - Musopen (public-domain recordings and scores);
  - IMSLP (public-domain sheet music; check each score's licence);
  - Library of Congress National Jukebox (historic recordings, streaming terms apply).
- **Images and media:**
  - Smithsonian Open Access (CC0, millions of items);
  - NASA, NOAA, USGS and the National Archives (US government works are generally public domain; logos and
    endorsement rules apply);
  - Library of Congress "free to use" sets;
  - Wikimedia Commons (check each file).
- **Film:**
  - Prelinger Archives on the Archive (educational and ephemeral films, largely public domain);
  - NASA and National Archives films.
- **Open textbooks and curricula** (adding to Core Knowledge, EngageNY, CK-12, OpenStax and Khan above):
  - Open Textbook Library (University of Minnesota);
  - LibreTexts (mostly CC BY-NC-SA);
  - OER Commons and MERLOT (directories: check each item's licence).
- **Licence rules:**
  - Public domain and CC0: use freely.
  - CC BY: credit.
  - SA (share-alike): lesson plans built from it carry the same licence.
  - NC (non-commercial): VOID is a nonprofit with no ads, which fits, but get counsel's view before relying on NC
    for anything donation-funded.

**The local lesson-plan builder (on B's PC; no paid model needed, so it keeps working without AI access).**
- **Runtime:** a local runner (Ollama or LM Studio) with an instruct model that fits the RTX 5060 Ti's 16 GB.
  Candidates: Qwen 2.5 14B (Apache-2.0), Gemma 3 12B, Mistral NeMo 12B, Llama 3.1 8B; check each licence. Add a
  local embedding model for retrieval.
- **Pipeline:**
  1. Read Project Gutenberg's catalogue file (not a crawl).
  2. Pick books by subject and reading level (Flesch-Kincaid).
  3. Fetch the plain text once from a mirror, politely, and cache it.
  4. Strip the Project Gutenberg header, or keep it with their licence.
  5. Split by chapter, then generate a lesson per chapter: outcome, vocabulary, the reading, discussion questions,
     an activity, a short check, a grade band and the time it takes.
  6. Link the LibriVox reading of the same book for read-along, plus any VOID documentary or episode on the
     subject (X-Ray).
- **Review:** output goes to a review inbox. A person approves every lesson before it is published, as with kids
  shows. Nothing reaches a child or family unreviewed. A school site aimed at children under 13 follows the same
  COPPA design as voidtv.net kids: no identifiers, no accounts, no links out without a grown-up.
- **Sharing the GPU:** the card is shared with the local animation pipeline (`C:\Users\bryan\sprite-forge\LOCAL-ANIMATION-PLAN.md`,
  overnight queue), so lesson jobs go into the same queue rather than competing.
- **First slice:** three public-domain books (for example Aesop's Fables, *Alice's Adventures in Wonderland*,
  *The Story of My Life*), turned into reviewed lessons with LibriVox audio links, viewable locally.
  Alongside it, a sources table with licences.

## Order of operations

VoidTV to live first (TV world, nightly job, domain swap). Then: READ mode (the reader B already
started) because it is both a University piece and its own thing; then the course hunt against the
Berkeley/OCW/Yale bodies; then the subject graph. Sync code arrives in between so progress follows
you from phone to TV.
