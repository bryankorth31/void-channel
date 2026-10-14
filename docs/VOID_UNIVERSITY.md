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

## Order of operations

VoidTV to live first (TV world, nightly job, domain swap). Then: READ mode (the reader B already
started) because it is both a University piece and its own thing; then the course hunt against the
Berkeley/OCW/Yale bodies; then the subject graph. Sync code arrives in between so progress follows
you from phone to TV.
