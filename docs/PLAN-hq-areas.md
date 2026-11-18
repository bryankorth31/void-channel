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
     commit b28b7351c on master.
   - H1b (Bryan, 18 Nov 2026, relayed by the Kids Play chat: "Void TV Kids also needs to have the analytics and all of the
     rest of it that regular headquarters HQ does for Void TV"). The Kids area gets what Void TV HQ does, where it fits a
     static Worker site, built on the kids branch:
     - Analytics, read from the dataset voidtv_kids_events (same CASH account and token). COUNTS ONLY, by COPPA design:
       each row is type, show, episode, 'kids'. No visitors, sessions, places, devices or search words exist, and none
       are added without Bryan's go. Shown: plays and minutes per show and per episode by day, top shows, errors per
       show and episode, reports, searches as a number. Live once the kids Worker is deployed (kids commit 7ccc94797).
     - Health and live checks of kids.voidtv.net (it answers, the version, the newest build), deploy status, and the
       follow-up list of broken episodes from error events and reports.
     - The show list (H2 below) and Jobs for the kids catalog (hunt, match, sound check, build).
     - Every check also by hand (hq-manual-mode): the command for each in Kids Help.
   - DEADLINE (Bryan, 18 Nov 2026): Kids runs fully from HQ with no AI help by 28 Nov 2026 ("I don't want any need for
     language model assistance for any of my projects"). Why: his 17 Nov REVIEW.html export (77 approvals, Today's
     Special among them) sat unapplied because applying it needed a typed command. Schedule (proposed, waits on his go):
     - K1, 19 Nov (DONE 18 Nov, not committed): Kids area in HQ, Shows tab: approve, deny, add; counts (approved, denied, waiting, approved with 0
       playable episodes and the reason from strict-report.json).
     - K2, 20 Nov: Hunt more (make-list, resolve-tmdb, fetch-tvmaze, kids-hunt per row, match) and Sound check, with
       what was found shown plainly (the HUNT.md table).
     - K3, 21 Nov: Build (show count, warning when it drops below what is live), Deploy (wrangler under Bryan's own
       sign-in), then a live check of home, /village/, /play/ and the live show count against the build.
     - K4, 22 to 23 Nov: Breaks and questions (approve-breaks, breaks-review, talk-review, approve-talk), voice clips
       (how many lines have no clip, Make clips), and one Check button for every kids test.
     - K5, 24 Nov: Analytics (counts only), health lights, the broken-episode list from errors and reports.
     - 25 to 26 Nov: Bryan presses every button from a one-page checklist, by himself; fixes from what he finds.
     - 27 Nov: spare day. 28 Nov: ready.
   - Decided (Bryan, 18 Nov 2026, relayed by the top chat: "I agree with that recommendation ... Void TV should hold all of it
     in just different tabs"): where the Kids area code lives: in master's HQ (the app he already runs), with every
     kids job run inside C:\Users\bryan\void-kids, so it works by 28 Nov without merging kids into master. No kids site
     code goes on master and voidtv.net is unchanged. This replaces decision 2 for HQ only.
   - H2. Kids Shows: approve, deny and add inside HQ, replacing the REVIEW.html export and approve.js round trip.
   - H3. Kids questions review: standouts, what is heard, draft questions, approve per show.
   - H4. Play and Learn and Void Village pages; Kids Test site page.
   - H5. University Listening, Quizzes, Labs and crystals, Publish tabs.
   Each step: its by-hand command in HQ Help and docs/HQ.md, tests in tests/hq.test.js, voidtv.net unchanged.

## Still open (Bryan's)
- Which University course is next, from the 54 proposed.
- Which kids pull is first: more shows, or questions from the overnight transcripts.
- Drafting questions uses Haiku and Sonnet agents: meters read and Bryan asked before any run.
