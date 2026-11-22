# The front page as the landing pad for learning (review, 22 Nov 2026)

Bryan, 22 Nov 2026: "pls look at void tv university as the landing pad for lea[rning, p]resented in ways that take
into account the science of learning and also the needs". Then: "Yes, start the review". Nothing here is built; the
layout options are pictures in `docs/landing-review/`, for Bryan to pick from.

## What the page is today (preview, 1316x821)

A headline ("Big ideas, shown with everyday things."), a Who is it for? filter, a search box, the If this, then that
bar, then 12 rows by area with 38 cards, about 6,800 pixels tall. "Pick up where you left off" shows once you have
started something. Course cards carry their everyday line ("Like five neighbors and a shared jar"); most picture
slots are still empty colour while the remodel's pictures are made.

So it is a catalogue: the first thing a newcomer does is choose among 38 cards. No learning happens on the page.

## What the research says matters most (the sources were read on their own pages)

1. **Guess before you learn.** Answering questions before reading a passage improved what people remembered, even
   for the questions they got wrong (Richland, Kornell and Kao 2009, J Exp Psychol Appl). This is Bryan's own rule:
   the gap between the guess and what happens is what gets stored.
2. **Curiosity opens the door.** People remember more about what they are curious about, and even unrelated things
   learned while curious (Gruber, Gelman and Ranganath 2014, Neuron).
3. **Pull it back out, spaced over days.** "Practice testing and distributed practice received high utility
   assessments" of ten techniques (Dunlosky and others 2013, Psychol Sci Public Interest). Taking a test "not only
   assesses what one knows, but also enhances later retention" (Roediger and Karpicke 2006, Psychol Sci).
4. **Six strategies with decades of support:** spaced practice, interleaving (mixing topics), retrieval practice,
   elaboration (asking why and how), concrete examples, and dual coding (words with pictures) (Weinstein, Madan and
   Sumeracki 2018, Cogn Res Princ Implic, CC BY 4.0).
5. **Three needs keep people coming back:** "competence, autonomy, and relatedness" (Ryan and Deci 2000, Am Psychol):
   seeing yourself get better, choosing your own way, and learning with others.

## The page against them

| Research | The page today | The gap |
|---|---|---|
| Guess first | Inside lessons (labs, explainers, scale stages, Check yourself) | Not on the landing pad: nothing asks a question before the catalogue |
| Curiosity | Cards name courses and an analogy | The pull is a course title, not a question someone wants answered ("Why do the lakes keep falling?") |
| Retrieval, spaced | Check yourself inside each unit, once | Nothing brings anything back a day or a week later; the two strongest techniques are missing from the whole site |
| Interleaving | One course at a time | No mixed review across topics |
| Concrete examples, dual coding | The everyday line on each card; scenes, labs, the 3D explainers inside lessons | The 3D explainers, the strongest "see it work" pieces, are invisible from the front page |
| Competence | Pick up where you left off; units marked done; rules found (on their own page) | Progress is scattered; no one place says "here is what you know now" |
| Autonomy | Rows by area, a level filter, search | Choice is by subject, not by the question or need that brought someone here |
| Relatedness | Answer on your phones (inside two courses), community nights (elsewhere on Void TV) | Learning together is not offered on the landing pad at all |
| Load | | 12 rows and 38 cards before any learning; the level filter hides little |

Learners' own needs (from the audience Bryan has set: young, everyday life, free, no account, tablets and phones,
international): short visits, no sign-up, nothing stored on servers, works one-handed on a phone, plain words,
honest about what is unfinished. The page meets most of these; "How a self holds together" is still live with both
units unfinished (an open item from 21 Nov).

## What I would build (small steps, each on Bryan's go)

- **L1, one question at the door.** The page opens on a single real question from a lesson, with its answers. You
  pick one; the page says what really happens (the gap, never right or wrong) and opens the lesson where you can
  see it work. The questions come from blocks that already have guesses (explainers, scale stages), rotating daily.
- **L2, bring it back.** A "Remember it" strip: three questions from lessons you have finished or rules you have
  found, mixed across topics, due a day, then three days, then a week later. Kept in your browser only, like Pick up
  where you left off. The questions are the quiz questions already written (each quotes its source).
- **L3, enter by the question, not the subject.** A row of the issues people misread, each a question ("Why does the
  CO2 keep rising if emissions stop growing?", "Why do Lake Mead and Lake Powell keep falling?"), opening the
  explainer. Grows with every explainer.
- **L4, one line of what you know.** A plain sentence, not tiles: "You have finished 4 lessons and found 9 rules;
  3 questions are ready to remember." Links to each.
- **L5, learn together.** A way to start Answer on your phones from the front page, for a class, a family or a
  community night.

The pictures in `docs/landing-review/` show two ways to lay these out, beside today's page (today.jpg): Option A,
question first (option-a-question-first.jpg: L1 at the door, L2 and L4 beside it, L3 and L5 under it, then the
area rows), and Option B, levers first (option-b-levers-first.jpg: three real rules, one found, then L2 and L4,
then the rows). Both drawn at 1316x821 with real questions and rules from lessons that exist; a.html and b.html are
the drawings themselves, not the site.

## Sources

- Richland LE, Kornell N, Kao LS (2009). The pretesting effect: do unsuccessful retrieval attempts enhance learning?
  J Exp Psychol Appl 15(3). PubMed 19751074.
- Gruber MJ, Gelman BD, Ranganath C (2014). States of curiosity modulate hippocampus-dependent learning via the
  dopaminergic circuit. Neuron. PubMed 25284006.
- Dunlosky J and others (2013). Improving students' learning with effective learning techniques. Psychol Sci Public
  Interest 14(1). PubMed 26173288.
- Roediger HL, Karpicke JD (2006). Test-enhanced learning. Psychol Sci 17(3). PubMed 16507066.
- Weinstein Y, Madan CR, Sumeracki MA (2018). Teaching the science of learning. Cogn Res Princ Implic 3:2. CC BY 4.0.
  https://cognitiveresearchjournal.springeropen.com/articles/10.1186/s41235-017-0087-y
- Ryan RM, Deci EL (2000). Self-determination theory and the facilitation of intrinsic motivation, social
  development, and well-being. Am Psychol 55(1). PubMed 11392867.
