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

## Order of operations

VoidTV to live first (TV world, nightly job, domain swap). Then: READ mode (the reader B already
started) because it is both a University piece and its own thing; then the course hunt against the
Berkeley/OCW/Yale bodies; then the subject graph. Sync code arrives in between so progress follows
you from phone to TV.
