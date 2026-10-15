# Indian VOID: the plan

A second VOID built from what VOIDtv taught us, aimed at Indian television on the Internet Archive.
Working name: **VOID Desi** (profile `desi`; the name is yours to change). Same engine, own profile,
own domain, own catalog; nothing in VOIDtv moves.

## What the Archive holds (counted 2026-10-15, video only)

| Query | Items |
|---|---|
| Hindi-language video, all | 24,996 |
| Hindi video tagged as a serial, episode or TV | 616 |
| Anything mentioning Doordarshan | 1,068 |
| Mahabharat or Ramayan | 433 |
| Hindi video dated 1980 to 2005 | 2,241 |
| Hindi tagged television | 907 |
| Tamil video | 3,813 |
| Telugu video | 3,662 |
| Bengali video | 2,385 |
| Tagged Bollywood | 2,605 |

Reading: the Doordarshan era and the mythologicals are there and well labelled; the soap era is thinner
and mostly in big multi-episode uploads; films outnumber serials, so a films shelf will be rich. Regional
languages have real depth. Expect transliterated filenames more often than Devanagari ones.

## The twelve lessons from VOIDtv, applied

1. **Search loose, judge strict.** Same hunter, same budgets, same two-job ceiling. Hindi titles get aliases for every common spelling before the first hunt (Mahabharat, Mahabharata, महाभारत).
2. **Never trust a filename over the Archive's format field.** Unchanged; it is what made the DVD rips play.
3. **A reference list can lose files.** TVmaze and TMDB know Indian TV, but their episode lists are thin for daily soaps. Keep the self-list fallback, and expect to use it more.
4. **Airdates are the surest key for daily shows.** Indian soaps are daily; uploads often carry dates. The airdate judge is the first thing to test on real uploads.
5. **Reaction, review and extras uploads sink.** Same regex; add the Hindi words (samiksha, pratikriya) and the common English ones used on Indian YouTube mirrors (recap, promo, precap).
6. **Human decisions live outside the builder.** overrides.json per profile; HQ is the same app with the port changed.
7. **Publish on a cadence, doctor nightly, link-check nightly.** Same tasks, prefixed `Desi`.
8. **Rows are a taste, not a taxonomy.** Write them for the audience, not from a genre list.
9. **The wall needs popular and cult mixed.** The featured pool rule carries over; the names change.
10. **Phones first.** Indian viewing is phone-heavy; the mobile fixes from this week matter more here, and the player's silent-audio card will fire more often (older rips with AC3). Test on a cheap Android.
11. **The gate and donations copy are per site.** VOID Desi gets its own support block (what it is, who makes it, why it is free) in its language.
12. **Tell the truth about what plays.** Download-only rows, dead-link retirement, the "Archive did not answer" card: all unchanged.

## What is new for this catalog

- **Language.** A strings table per profile (`profiles/desi/strings.json`) for every label the interface shows, Hindi with English alongside where it helps; a Devanagari-capable heading font paired with Unbounded, or a different display face. Overviews from TMDB in Hindi with English fallback.
- **Transliteration.** A Devanagari-to-Roman step in the normaliser so महाभारत, Mahabharat and Mahabharata are one core; the same for Tamil, Telugu and Bengali scripts once those rows exist. Title similarity runs on the Roman form.
- **Rows** (first draft; the scout will correct it):
  Doordarshan Classics (Hum Log, Buniyaad, Malgudi Days, Nukkad, Fauji, Circus, Byomkesh Bakshi, Chandrakanta) · Mythologicals (Ramayan 1987, Mahabharat 1988, Shri Krishna, Jai Hanuman) · Comedy (Dekh Bhai Dekh, Zabaan Sambhalke, Office Office, Sarabhai vs Sarabhai, Khichdi) · Thrillers and Crime (CID, Byomkesh, Karamchand, Tehkikaat) · Family Sagas (the 2000s soap era) · Kids and Teens of the 90s (Shaktimaan, Captain Vyom, Junior G) · Cinema on TV (the Bollywood TV-movie and telefilm shelf) · Regional doors: Tamil, Telugu, Bengali, Marathi · Music and Variety (Chitrahaar, Rangoli, Antakshari) · Documentary and News Archive (Surabhi, Turning Point).
- **Collections** (cross-row): Devotional, Freedom Movement, Based on Literature, Satyajit Ray and the auteurs on TV.
- **Scout first.** Point the scout at the Indian collections before writing the final list: it reports what uploaders actually call things and which series have enough episode-shaped uploads to be worth a shelf. VOIDtv's list was written before looking; this one should be written after.
- **Rights posture is unchanged**: nothing hosted, everything streams from the Archive, the site is a better index. Doordarshan material is a public broadcaster's; the Archive holds it openly.

## Build order (about two weeks of elapsed time, mostly hunting)

1. **Profile and scaffolding (one afternoon).** `profiles/desi/profile.json`, a seed list of 150 shows across the rows above with aliases, `strings.json` with the interface labels, the support block, port 8782, task prefix `Desi`. `setup.cmd desi`.
2. **Transliteration and matcher additions (one day).** Devanagari-to-Roman in `norm()`, the Hindi junk words, TMDB language parameter, test against ten known uploads (Mahabharat, Malgudi Days, CID, Shaktimaan, a Doordarshan news reel).
3. **Scout run (overnight).** `VOID_PROFILE=desi node scripts/scout.js` against Hindi and regional collections; read `docs/SCOUT.md` for the profile; rewrite the list from what is really there.
4. **First hunt (three to five nights, politely).** Balanced hunt; match; art and people; the site builds to `profiles/desi/site`.
5. **Site language pass (two days).** Strings table wired into the page, the font, a Hindi About page, phone test on Android, the featured wall tuned to the strongest shelves.
6. **Publish.** New Cloudflare Pages project, gate on, testers who read Hindi, then the domain.
7. **Regional doors (after launch).** Tamil, Telugu, Bengali as rows behind a language picker, each with its own transliteration and aliases, hunted one at a time.

## What I would want from you

- The name and the domain.
- Two or three people who grew up with this television to look at the rows and the list before the hunt; VOIDtv's rows came from your memory, this one needs someone else's.
- Whether the first release is Hindi only or Hindi with the regional doors already visible.

## What the kit gains from doing it

Strings tables, transliteration and per-profile support copy are the three seams KIT.md lists today. Building VOID Desi closes all three, and after it any language is a profile.
