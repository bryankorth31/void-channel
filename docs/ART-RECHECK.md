# Show art matched again (night audit N12, 21 Nov 2026)

Bryan, 21 Nov 2026: "Yes, fix all".

## What was wrong
`scripts/art.js` looked each show up on TMDB by name and first year, and when no TMDB show had the right year it took the
top search hit anyway. So "Payne" (CBS, 1999) wore the poster, story and cast of Tyler Perry's House of Payne (2007).
The cast followed the same wrong TMDB id, and `scripts/people.js` kept an old cast file even when a match changed.

## Where it stands (against the art as it was before 21 Nov)
- 11,891 shows: the same as before.
- 804 shows: now their own art and cast (Payne (1999) with John Larroquette; Clubhouse (2004); Cosby (1996); Hilda (2018);
  Hunter (1984); Will (2017); Buddies (1996); Spider-Man: The Animated Series (1994); Cosmos (1980) as "Cosmos: A Personal
  Voyage"; Whose Line Is It Anyway? (1998)).
- 7 shows: art cleared, each read by eye and plainly another show (Smosh vs. Zombies on "Smosh", Dragons: Race to the
  Edge on "The Edge", Property Snakes and Ladders, Top 5 Beatdown, Mischief City, The Genius of Invention, and a Japanese
  shock-video show). The site draws its own poster for them.
- 38 playing shows held, below.

## A first run went too far, and what was put back
The first run judged each show by its cached TVmaze record alone and cleared art when no TMDB record was within a year.
The night audit chat caught it (Columbo, M*A*S*H, SCTV, Dirty Jobs, Dateline NBC and Good Witch had lost poster and cast).
Two causes: a show's first year differs between sources by a pilot or TV movie (Columbo: 1968 on TVmaze, 1971 on TMDB),
and a cached TVmaze record can itself be another show (VoidTV's "M*A*S*H" is cached as TVmaze's "A Teacher", 2020).
Put back from the catalog as it was before (fa4636511^): 173 of the 180 cleared shows (art and cast), and 64 changes that
had swapped a same-name match for a longer name ("Doctor Who" had become "Doctor Who: Video Commentaries", "Biography"
"Sadat: Action Biography") or failed the stricter rule below. The first run's art reached the live site with the scheduled
VoidTV Publish at 1:20 AM (fa4636511); what was put back goes out with the next Publish.

## The rule now (scripts/lib/sameshow.js, tests/art-match.test.js)
- A show is judged by VoidTV's own name, and by the cached TVmaze name and year only when that name agrees.
- A TMDB record with exactly the show's name always beats one whose name only holds it; among same-name records, the one
  within a year, else the nearest in year.
- A longer name counts only when it starts with the show's name ("Cosmos: A Personal Voyage"), never when the name sits
  inside it ("Maps: Power, Plunder and Possession" is not "Plunder").
- `node scripts/art.js --recheck` replaces art only with a better match and never removes art; what it cannot match is
  listed in its output ("CHECK BY EYE"). Removing art is a person's call.

## Still to look at by eye (not changed tonight)
About 100 shows wear art under another name. Names alone cannot sort them: many are right ("Meet the Browns" is TMDB's
"Tyler Perry's Meet the Browns", "Luke Cage" is "Marvel's Luke Cage", "Wild Kingdom" is "Mutual of Omaha's Wild Kingdom"),
some are wrong ("Fear" wears Cape Fear, "The Castle" The Man in the High Castle, "Zone" The Twilight Zone, "Made" Made in
Abyss). They are as they were before 21 Nov. `node scripts/art.js --recheck` lists them.

## Held for Bryan: 38 playing shows where the video may be the other show
Here the TVmaze record (which gives the page its name, episode list and guide) and TMDB are namesakes of different years.
The years in the Archive uploads that play were read to see which one the video is. Where they point to the other show,
or name no year, the TVmaze record itself may be the wrong one, so the art was not changed: fixing the record (a TVmaze
id in HQ or overrides.json) is the real fix, and the art follows it on the next `node scripts/art.js --recheck`.

| Show | Page | TVmaze first year | TMDB art now | Years in the uploads | Why held |
|---|---|---|---|---|---|
| Adventure Time | /show/adventure-time | 2008 | Adventure Time (2010) | none named | same name, and the uploads name no year |
| Assassination Classroom | /show/assassination-classroom | 2013 | Assassination Classroom (2015) | none named | same name, and the uploads name no year |
| Bleak House | /show/bleak-house | 1959 | Bleak House (2005) | 2005x3 | the uploads are the other year: the TVmaze record looks wrong |
| Bob and Margaret | /show/bob-and-margaret | 1993 | Bob and Margaret (1998) | 2001x78 1998x57 1999x21 | the uploads are the other year: the TVmaze record looks wrong |
| Cunk on... | /show/cunk-on | 2016 | Cunk on... (2018) | none named | same name, and the uploads name no year |
| Dynasty | /show/dynasty | 2017 | Dynasty (1981) | none named | same name, and the uploads name no year |
| FLCL | /show/flcl | 2003 | FLCL (2000) | none named | same name, and the uploads name no year |
| Food Network Challenge | /show/food-network-challenge | 2000 | Food Network Challenge (2005) | none named | same name, and the uploads name no year |
| Gravity | /show/gravity | 2010 | Gravity Falls (2012) | 2012x1 | the uploads are nearer the other show's year |
| Impossible | /show/impossible | 2017 | Mission: Impossible (1966) | 1988x3 | the uploads are nearer the other show's year |
| Junkyard Wars | /show/junkyard-wars | 1998 | Junkyard Wars (2001) | none named | same name, and the uploads name no year |
| Life on Mars | /show/life-on-mars | 2006 | Life on Mars (2008) | none named | same name, and the uploads name no year |
| Maigret | /show/maigret | 2025 | Maigret (1991) | 1960x6 | the uploads are the other year: the TVmaze record looks wrong |
| More Than Words | /show/more-than-words | 2022 | More than Words (2014) | none named | same name, and the uploads name no year |
| Mr. Rhodes | /show/mr-rhodes | 1992 | Mr. Rhodes (1996) | 1996x8 | the uploads are the other year: the TVmaze record looks wrong |
| Navy SEALS - BUDS Class 234 | /show/navy-seals-buds-class-234 | 2002 | Navy SEALS - BUDS Class 234 (2000) | none named | same name, and the uploads name no year |
| Odd Man Out | /show/odd-man-out | 1977 | Odd Man Out (1999) | 1999x21 2000x14 | the uploads are the other year: the TVmaze record looks wrong |
| Perry Mason | /show/perry-mason | 2020 | Perry Mason (1957) | none named | same name, and the uploads name no year |
| Pointless | /show/pointless | 2009 | Pointless Celebrities (2011) | 2012x4 | the uploads are nearer the other show's year |
| Pride and Prejudice | /show/pride-and-prejudice | 2026 | Pride and Prejudice (1995) | 1995x16 | the uploads are the other year: the TVmaze record looks wrong |
| Queenie | /show/queenie | 2024 | Queenie (1987) | 1970x15 | the uploads are the other year: the TVmaze record looks wrong |
| Roommates | /show/roommates | 2009 | Roommates (2014) | none named | same name, and the uploads name no year |
| Scot Squad | /show/scot-squad | 2012 | Scot Squad (2014) | none named | same name, and the uploads name no year |
| Significant Others | /show/significant-others | 2022 | Significant Others (1998) | 1998x18 | the uploads are the other year: the TVmaze record looks wrong |
| Songs of Praise | /show/songs-of-praise | 1961 | Songs of Praise (2001) | 2024x1 | the uploads are the other year: the TVmaze record looks wrong |
| Tara Duncan | /show/tara-duncan | 2010 | Tara Duncan (2021) | none named | same name, and the uploads name no year |
| Teenage Mutant Ninja Turtles | /show/teenage-mutant-ninja-turtles | 1987 | Teenage Mutant Ninja Turtles (2012) | 2003x72 1987x16 | the uploads are the other year: the TVmaze record looks wrong |
| The Disastrous Life of Saiki K. | /show/the-disastrous-life-of-saiki-k | 2019 | The Disastrous Life of Saiki K. (2016) | none named | same name, and the uploads name no year |
| The Electric Company | /show/the-electric-company | 2009 | The Electric Company (1971) | none named | same name, and the uploads name no year |
| The Hollywood Squares | /show/the-hollywood-squares | 1966 | The New Hollywood Squares (1986) | 1987x68 1968x46 2000x28 | the uploads are nearer the other show's year |
| The Honeymooners | /show/the-honeymooners | 1952 | The Honeymooners (1955) | none named | same name, and the uploads name no year |
| The Link | /show/the-link | 2014 | The Weakest Link (2021) | 2021x3 | the uploads are nearer the other show's year |
| The Mole | /show/the-mole | 2022 | The Mole (2001) | none named | same name, and the uploads name no year |
| Thief | /show/thief | 2006 | Dope Thief (2025) | 2022x12 | the uploads are nearer the other show's year |
| Touching Evil | /show/touching-evil | 2004 | Touching Evil (1997) | 1997x20 | the uploads are the other year: the TVmaze record looks wrong |
| UFO | /show/ufo | 1970 | UFO Robot Grendizer (1975) | 1978x24 1971x3 | the uploads are nearer the other show's year |
| Whose Line Is It Anyway? | /show/whose-line-is-it-anyway | 1998 | Whose Line Is It Anyway? (2013) | none named | same name, and the uploads name no year |
| Witchblade | /show/witchblade | 2000 | Witchblade (2006) | none named | same name, and the uploads name no year |
