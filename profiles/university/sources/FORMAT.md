# Source lists: one file per area

Each area of Void University has one file here, `<area-slug>.json`, for example `money.json` or `law-and-rights.json`.
A file holds what we found to build that area's courses from. HQ reads these files (University tab).

Bryan, 15 Nov 2026: "it's not just we show videos we create curriculum from what we find".

## The file

```json
{
  "area": "Money",
  "checked": "2026-11-15",
  "courses": [
    {
      "name": "Your money, plainly",
      "why": "One sentence on why a person needs this in everyday life.",
      "levels": ["high school", "young adults", "everyday"],
      "spine": "id of the source the course is built around (usually an open course or a book)",
      "uses": ["ids of the other sources this course draws on"],
      "units": ["Unit title 1", "Unit title 2"]
    }
  ],
  "sources": [
    {
      "id": "short-kebab-id",
      "kind": "open-course | book | guide | film | channel",
      "title": "Exact title as the source gives it",
      "by": "Author, teacher or agency",
      "year": 1923,
      "url": "Page the licence was read on",
      "licence": "Public domain | CC BY 4.0 | CC BY-NC-SA 3.0 | US government work | ...",
      "licenceSeen": "Where on the page the licence is stated, in a few words",
      "terms": "Anything in the terms about AI, ingestion or reuse; empty if none found",
      "video": { "archive": "archive.org item id, if the lectures or film are there", "files": 26 },
      "coursework": ["syllabus", "reading guides", "problem sets", "exams", "slides", "transcripts"],
      "courseworkUrl": "Where the coursework is",
      "text": "Direct link to the full text (Archive item, Gutenberg ebook number) for books and guides",
      "old": true,
      "levels": ["high school", "young adults", "everyday"],
      "needIt": "One plain sentence: why this helps someone decide or live better, even if they never work in the field.",
      "notes": "Anything a builder must know: missing lectures, poor scan, outdated facts that must be flagged"
    }
  ]
}
```

## Rules

- **Allowed:** Internet Archive (public domain or openly licensed items), Project Gutenberg, open university courses
  (Open Yale Courses, MIT OpenCourseWare, and others with a stated open licence), US government works (USDA, FEMA,
  CDC, ready.gov, the Library of Congress, Smithsonian open access), and peer-reviewed papers on Europe PMC with an
  open licence.
- **Forbidden:** OpenStax and Radiopaedia, by name. Never a site that blocks, charges, or shows a robot check to
  automated readers. If that happens, stop on that site and note it; never work round it.
- **Licence read on the page.** Never from memory. If a page says the material may not be used for AI or ingested
  by language models, write that in `terms`, and the source is link only.
- **Noncommercial sources bind the whole site.** Open Yale's terms (read 15 Nov 2026 at oyc.yale.edu/terms) count it as
  commercial use if the site "accepts advertising of any kind", charges for services, or "collects email addresses for
  any purpose". So Void University carries no ads, no sponsor listings, no paid anything, and no email sign-up while it
  uses Yale (or other NC) material. The CASH donation line is voluntary and not named in those terms. Credit the teacher
  and the university, link the course page, and link the licence (the build does this from `source`).
- **`old: true`** marks outdated but useful text in old English that we rewrite into plain modern English (the
  old-knowledge shelf). Facts that are now wrong or unsafe (old medicine, old wiring, old food canning times) go in
  `notes` so the builder flags them against a current government source.
- **Three audiences** (Bryan, 15 Nov 2026): high school, young adults, and adults who "aren't going to get a job in
  these fields" but want useful bits for everyday life. Every source says which it fits and why a person needs it.
- Plain language. No em dashes.
