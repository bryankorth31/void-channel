# voidtv.net ad kit

**The name is always voidtv.net** (lowercase, set like the neon sign: "voidtv" hot pink, ".net" neon blue). Never plain
"VOIDtv": other sites use VOID names, and we do not advertise for them.

Logos, lockups, badges, stat cards and ready-made ads, made 17 October 2026. Every piece has an editable
source in `src/` (plain HTML: change the words, colours or background, then re-render) and a PNG.
Re-render everything: `python brand-kit/tools/make_ads.py` (wording and colours live at the top of that file).

Colours are the neon sampled from the background art: pink `#dc20a9`, bright pink `#ff4fc8`, blue `#0ac1e0`,
bright blue `#5fe3ff`, violet `#a954e3`, gold `#f2a93b` for giving, on near-black `#07080c`. The type is
Unbounded (free licence, in `assets/brand/fonts/`). VOIDtv Kids uses its own bright daytime palette.

## What is in here

| Folder | Pieces | Use |
|---|---|---|
| `logos/` | Neon mark proposal (1024, transparent), wordmark neon and white (3000 wide), horizontal lockup, VOIDtv x CASH lockup, VOIDtv Kids mark and lockups for light and dark backgrounds | Anywhere a logo goes. The neon mark is a **proposal** next to Bryan's redraw; vector sources in `brand-kit/marks/mark-neon-proposal.svg` and `kids-tv-proposal.svg` |
| `badges/` | Free · No ads · No account · Starts in seconds · Search every show · Donation-supported · Nonprofit · From the Internet Archive · Every episode, in order (transparent pills) | Drop onto any ad, thumbnail or video |
| `stats/` | 4,600+ shows · 50,000+ episodes · $0 free, always (transparent) | Big-number moments in ads and videos |
| `ads/free`, `ads/library`, `ads/speed`, `ads/search`, `ads/manifesto`, `ads/cash` | Six campaigns, each in five sizes | Ready to post (see sizes below) |
| `ads/kids` | "Coming soon" teaser in five sizes | Only when VOIDtv Kids has a launch date |
| `ads/extras` | YouTube thumbnail 1280x720, X/Twitter header 1500x500 | Channel art |

Ad sizes: **square 1080x1080** (Instagram/Facebook feed), **portrait 1080x1350** (Instagram feed, tallest
allowed), **story 1080x1920** (Stories, Reels, TikTok, Shorts covers), **link 1200x630** (link previews,
Facebook link ads), **x 1600x900** (X/Twitter, LinkedIn).

## Copy bank (every claim checked 17 Oct 2026)

**Headlines**
- Free TV. No ads. No account.
- 4,600+ shows. 50,000+ episodes.
- Press play. It plays.
- Find the show you forgot you loved.
- Before AI slop, there was human creativity.
- Free because people give.
- Nonprofit TV, for the love of TV.
- Classic and cult TV, kept alive.
- Every episode, in order.
- voidtv.net kids: cartoons you grew up with, shows that teach. (Coming soon.)

**Supporting lines**
- Starts in seconds, straight from the Internet Archive.
- Search every show, every episode, instantly.
- voidtv.net is a nonprofit project of CASH, a 501(c)(3). Donations fund real-world work. Never required.
- A fully nonprofit ecosystem: voidtv.net, voidtv.net kids and every VOID service are projects of CASH.
- Safe, free and ad-free. Picked by people, not algorithms. (Kids.)

**Calls to action:** Watch free at voidtv.net · Start watching · Find your show · Give what it is worth to you.

**Where the numbers come from:** the live site's data on 17 Oct 2026: 4,645 shows and 50,820 episodes, written
as "4,600+" and "50,000+". Refresh them when the catalog changes (they live in `FACTS` in the generator).

## Rules that keep the ads honest and safe

1. **No show artwork in ads.** Posters, stills and character art belong to the studios. The kit uses only VOID's
   own art, type and the neon backgrounds. Naming a show in text is fine; showing its art is not.
2. **No Internet Archive logo.** "From the Internet Archive" in words is accurate and fine; their logo needs their
   permission.
3. **Speed:** "Starts in seconds" is what tests show (0.1 to 2.7 s to the first picture). Put a precise number in
   an ad only once real viewer numbers exist (the Cloudflare analytics step).
4. **Donations:** say "donation-supported" and "never required". Do not promise tax deductions in ads; CASH can
   say that on its own page if it applies.
5. **CASH's cross is a 120-pixel file.** It works small, as in these lockups. For print or anything large, ask
   CASH for a high-resolution original.
6. **Kids:** use the Kids teaser only once there is a launch date; until then it promises something not yet there.
   Do not name PBS or other brands in Kids ads until the legal review.
7. **Timing:** the site is still behind the testing password. Paid or public ads make sense on opening day.
