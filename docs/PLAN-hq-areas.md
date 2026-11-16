# PLAN-hq-areas: Kids and University as their own areas in HQ

Status: approved by Bryan, 15 Nov 2026 ("Yes, as recommended"). Nothing built yet. Owner: the HQ areas chat.

## What HQ has today
- One HQ (scripts/hq.js + scripts/hq/index.html, port 8780), 13 tabs for voidtv.net. University is one of them:
  15 areas, sources, proposed courses, Scaffold, Copy brief, Rewrite brief, Live switch, Listen and Set times per
  course, Check sources, Build preview / public copy. Deploy is still a terminal line.
- Kids has no area of its own. profiles/kids/HQ-KIDS.cmd starts a second copy of the same HQ with VOID_PROFILE=kids on
  8782: the voidtv.net tabs pointed at kids data (Shows, Hidden, Jobs). Show approval is still REVIEW.html, Export,
  then `node profiles/kids/approve.js`. Breaks (approve-breaks.js), standouts, questions, Play and Learn, Void Village
  have no HQ page at all.
- Kids code (Play and Learn, Village, listener, the profile-aware hq.js) is only on the local kids branch.

## Proposal
A. One HQ with an area switcher in the header: Void TV | Kids | University. Each area keeps its own tabs.
   HQ-KIDS.cmd and the second port retire once Kids works inside it.
B. Kids area tabs: Shows (approve / deny / add, 39 of 121 approved), Breaks and questions (standouts, what is heard,
   draft questions, approve per show), Play and Learn (packs, activities, voice lines, Remake voice), Void Village
   (places, tasks, built or not), Test site (kids-test deploy steps and checks: strict, audit, addresses).
C. University area tabs: Courses (today's tab), Sources, Listening (what is heard, find a phrase across lectures),
   Quizzes (quote and time checks per course), Labs and crystals, Publish (build, then the deploy line).
D. Listening + questions is one shared engine (memory: episode-questions-engine); each area shows its own view.
E. Every button also has its by-hand command in Help and docs/HQ.md (hq-manual-mode).

## Where more content comes from
Kids
- Shows: the K5 PBS-level tier first; hunt more learning shows on the Archive (HUNT.md found 97 of 108); public
  domain educational films (Prelinger, old classroom films; old facts get a warning or stay out); NASA and other US
  government kids video (public domain).
- Questions: the standouts transcribed overnight (about 60 of 113 heard so far) become talk-about-it questions.
- Play and Learn: a curriculum map from public early-learning frameworks (Head Start ELOF), our own activities.
- Void Village: LIFE-SKILLS-GAPS.md tasks; facts from CDC, USDA, ready.gov; the old how-to books University already
  found, rewritten for kids (shared with the old-knowledge shelf).
University
- The 54 proposed courses across 15 areas (5 started); the Open Yale lectures that have video on the Archive
  (PSYC 110, PHYS 200, HIST 116, PHIL 176, PLSC 114); MIT OCW; 116 old books to rewrite; US government guides.

## Decided (Bryan, 15 Nov 2026: "Yes, as recommended")
1. One HQ with an area switcher (Void TV | Kids | University). HQ-KIDS.cmd and port 8782 retire once Kids works inside it.
2. The Kids area is built on the local kids branch (C:\Users\bryan\void-kids) and reaches master with the kids merge.
   No push or merge without Bryan's go.
3. Build order:
   - H1. The switcher, and the University tab regrouped into its own area (no new features). DONE 15 Nov 2026,
     not committed: scripts/hq/index.html, tests/hq.test.js, docs/HQ.md.
   - H2. Kids Shows: approve, deny and add inside HQ, replacing the REVIEW.html export and approve.js round trip.
   - H3. Kids questions review: standouts, what is heard, draft questions, approve per show.
   - H4. Play and Learn and Void Village pages; Kids Test site page.
   - H5. University Listening, Quizzes, Labs and crystals, Publish tabs.
   Each step: its by-hand command in HQ Help and docs/HQ.md, tests in tests/hq.test.js, voidtv.net unchanged.

## Still open (Bryan's)
- Which University course is next, from the 54 proposed.
- Which kids pull is first: more shows, or questions from the overnight transcripts.
- Drafting questions uses Haiku and Sonnet agents: meters read and Bryan asked before any run.
