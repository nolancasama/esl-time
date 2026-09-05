# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-09-04 — Only the top STT hypothesis judges grammar

Speech engines return around five ranked hypotheses. `matchTime` lets only
`transcripts[0]` decide, and consults later alternatives solely to rescue an
utterance where no time was heard at all.

Why: the game teaches that "o'clock" is valid only on the hour. A student who
says "seven fifteen o'clock" reliably has plain "seven fifteen" somewhere in the
alternatives, so scanning all of them for any valid parse would silently accept
the exact error the rule exists to catch. Rejected alternative: best-of-all-
hypotheses matching, which is the obvious approach and is why this is written
down.

## 2026-09-04 — Time answers are parsed as an ordered sequence, never number-hunted

The matcher consumes a grammatical structure from the token list and treats any
leftover number as `bad-grammar`. It never asks "do the right digits appear
somewhere in the transcript".

Why: number-hunting cannot distinguish "seven fifteen" from "seven fifteen
o'clock" or "fifteen seven", so the grammar half of the exercise would not exist.
The cost is that every accepted phrasing must be an explicit structure.

## 2026-09-04 — "Half past" and "quarter past" are accepted but not taught

V1 models digital-style spoken time ("seven thirty"). The past/to forms are
nonetheless accepted as correct, flagged `preferred: false`.

Why: they are correct English. Marking a student wrong for producing them would
be a bad classroom moment and would teach the wrong lesson. Not teaching a form
and rejecting it are different decisions. The `preferred` flag is recorded so a
later version can model the taught form without changing what counts as correct.

## 2026-09-04 — Deliberate false accepts over false rejects

Where a transcript is genuinely ambiguous the matcher accepts. `7:00` and `700`
clear as the whole hour even though they could in principle be a literal "seven
zero"; "seven five" clears for 7:05 alongside the preferred "seven oh five".

Why: a false accept costs a student nothing — they said the time correctly and
move on. A false reject strands a child who answered correctly, repeatedly, with
no way to discover why. The two errors are not symmetric. Deliberately NOT
extended to phonetic folding or edit-distance fuzz, which the sibling sight-word
matcher uses: "fifteen" and "fifty" are one edit apart and are different times,
not pronunciation variants.

## 2026-09-04 — Typed-answer fallback when speech recognition is unavailable

The Web Speech API does not exist in Firefox or Safari, and a managed school
Chromebook can refuse the microphone. In those cases the hold button is replaced
by a typed-answer input running through the identical `matchTime` path.

Why: without it the game is a dead screen on a browser a classroom may well be
using, and the failure would look like a broken game rather than a missing
capability.

## 2026-09-04 — Sessions contain twelve rounds

A session ends after twelve completed targets, while the time and scene decks
continue to schedule independently.

Why: V1 has no session-length setting, but its progress indicator and summary
need a finite denominator. Twelve rounds gives each placeholder scene one turn
in the first shuffled scene pass without coupling any scene to a target time.

## 2026-09-04 — Small clocks have an 88 CSS-pixel readability floor

Scene clock diameters follow their authored percentage except when that would
make the complete numbered clock smaller than 88 CSS pixels.

Why: reserving space for the top bar and 96-pixel hold control at the frozen
1024x600 minimum makes a literal 16% clock roughly 60 pixels wide. Twelve
numerals and the fractional hour-hand position are not readable at that size.
The floor preserves the learning content; authored percentage sizing resumes
automatically when the stage is large enough.

## 2026-09-04 — A time enters difficult practice when its answer is revealed

Genuine wrong attempts increment the current round's reveal counter. The
persistent miss is recorded once if that counter reaches the reveal threshold;
an answer corrected before reveal is not added to difficult practice.

Why: the frozen round loop explicitly adds a time to the difficult pool after
the reveal threshold. `no-time`, `empty`, and sub-300 ms holds remain free
retries and never affect either progress or first-try credit.

## 2026-09-05 — Correct answers are accepted mid-hold, and only correct ones

Interim recognition hypotheses are judged while the child is still holding the
button. The instant one is a complete match for the target, the round resolves:
no waiting for the finger to come up. `HoldToTalk` gained an `onLiveResult`
callback; `game.js` gained `_judgeLive`, and the success path both judges share
moved into `_resolveCorrect`.

Live judging is deliberately **success-only**. An interim transcript is usually
an unfinished sentence — "it's seven" on the way to "it's seven fifteen" — so
treating a non-match as wrong would score a child mid-word. Every outcome other
than `match` simply keeps listening, and wrongness is decided only once the
attempt has actually ended. The asymmetry is the point: correct-only during the
hold, correct-or-wrong after release.

No debounce, stability timer or repeat-confirmation gates acceptance, and
`isFinal` is explicitly NOT required — an interim hypothesis can already be a
complete correct answer, and waiting for the final one is the delay being
removed.

Double-scoring is prevented by state that already existed: `_resolveCorrect`
sets `resolved` first, and disabling the answer control cancels the open
recognition session, which sets `finished` so no later release, `onend` or
timeout can deliver a second result. No new guard flag was needed.

## 2026-09-05 — A title screen replaces level selection; Mixed is the default

The first screen is now a title, one large `スタート` and a smaller
`オプション`. The five level cards are gone from the entry path, and difficulty
lives on the Options screen as four choices — かんたん / ふつう / むずかしい /
ミックス — with ミックス the default on a fresh profile.

Why: a Japanese elementary student should be able to open the game and play
without reading or deciding anything. Making them pick one of five numbered
levels before a single round put a teacher-facing decision in a child's way.

Difficulty maps onto the existing frozen pools rather than replacing them, so
level definitions stay the single source of truth for what times exist:
easy=1, medium=3, hard=6, mixed=5. Level 2 (half hours) is no longer surfaced
but still exists. A profile saved before this change keeps the teacher's
intent — the old `level` setting migrates to the nearest difficulty instead of
snapping back to the default.

Hard is deliberately NOT an alias of Mixed. Both draw the full five-minute
pool, but level 6 weights the eight non-quarter minutes to ~72% of deals while
Mixed stays balanced at ~35%, measured over 480 dealt rounds.

Difficulty changes the time pool and nothing else. Scene choice, clock size and
placement, hold-to-talk, matcher strictness and retries are all untouched: the
game tests telling the time in English, not finding a small clock.

## 2026-09-05 — Finished artwork supplies the clock; the game draws only hands

The twelve placeholder scenes are replaced with finished illustrations. Each
painting already contains the clock body, face, numerals and centre pin, drawn
deliberately WITHOUT hands. The game overlays only an hour hand, a minute hand
and a small pin. There is no second, floating SVG clock face any more.

Why: the clock now reads as an object inside the room rather than a quiz widget
pasted over a picture, which was the intent in SPEC §8 all along.

Geometry lives in `src/data/scenes.js` in SOURCE IMAGE PIXELS (the art is
1536x1024), not stage percentages, and the hand overlay is an SVG whose viewBox
is that same pixel box. One coordinate space, so hands cannot drift off the
painted clock at any stage size or aspect.

The painted faces are hand-drawn OVALS, not circles (the school library measures
0.78 wide-to-tall). Each scene therefore stores ellipse semi-axes `rx`/`ry`, and
hands are drawn in a unit circle then mapped through that ellipse. The painted
numerals are foreshortened by the same ellipse, so a hand lands on the numeral a
student would read. Measured by fitting the face region in each image rather
than eyeballed; an optional `rotation` is supported but no scene needed one.

## 2026-09-05 — The scene is the screen: full bleed, controls on the picture

The scene fills the viewport edge to edge. There is no top bar and no bottom
band: Back, the round counter, Hold to Talk and Settings float directly on the
artwork over a gradient scrim.

Why: the bars cost 200 px of a 768 px screen, which is exactly the height the
picture needed. Giving it back roughly DOUBLED every clock — a typical face
went from ~104 px to ~167 px at 1366x768, and from ~73 px to ~125 px at the
1024x600 floor — while removing the empty margins entirely.

**All chrome is at the bottom on purpose.** Every painted clock sits in the
upper part of its artwork, several in the top right, so a top bar would clip
them; the bottom of every scene is floor, table or torso and never a clock.
Verified: no clock is cropped or hidden behind the dock at 1024x600, 1366x768,
1920x1080 or portrait.

Cost, accepted knowingly: a 3:2 illustration cannot fill a 16:9 screen without
cropping, so some of each picture is lost — about 16% of image height in
landscape, and considerably more width in portrait. `fitScene` prefers the
artwork's own centre framing and pans only as far as needed to keep the clock
plus a margin on screen, so what goes is composition, never the clock. This
supersedes the earlier decision to letterbox the whole picture behind a blurred
backdrop, which kept every pixel of art but left clocks small and the screen
mostly margin.

## 2026-09-05 — Scene 10 is a town square, and the two libraries are named apart

The delivered artwork for scene 10 is an outdoor town square with a clock tower,
not the "Hallway" the original scene list named, so the scene is named for what
is drawn. Scenes 11 and 12 became Art Room and Library as intended, but two
scenes named "Library" is ambiguous in data and to a teacher, so they are
"School Library" (7) and "Grand Library" (12, its painted face reads
"Sunny Library").

Why record it: the old names are still in earlier git history and in the frozen
spec's scene table, so a future reader will otherwise think the mapping is wrong.

## 2026-09-05 — Scene artwork ships as WebP

The delivered PNGs were 28.2 MB for twelve scenes. They ship as WebP quality 88
instead, 3.17 MB total (~264 KB each, 89% smaller), at the same 1536x1024.
Checked at 4x zoom against the source: the painted numerals, which are the
teaching content, are indistinguishable.

Why: these load on school Chromebooks over school wifi, and 28 MB of scene art
is a real barrier to a lesson starting on time.

## 2026-09-05 — Per-scene times are demo data, not gameplay

Each scene carries a `defaultTime`, used by `visual.html` and as a test fixture.
Gameplay ignores it: the scheduler continues to shuffle times and scenes
independently across the level pools (SPEC §5).

Why: binding one fixed time per scene would collapse the five levels and the
difficult-practice pool into twelve fixed rounds. The fixed pairs are useful for
checking hand alignment against known artwork, which is exactly what they are
kept for.

## 2026-09-05 — "It's" is now required, reversing the original V1 decision

An answer only counts as `match` / `wrong-time` when the student also says
`it's` (or `its` / `it is`) somewhere in the utterance. A structurally valid
time spoken without it — e.g. bare "seven o'clock" — now downgrades to
`bad-grammar`, same consequence as any other malformed order. See
`SPEC.md` §3.4a.

Why: product decision that the taught model sentence is a full sentence
("It's seven o'clock."), and a bare fragment should not silently grade as
equally correct — that would teach the fragment instead of the sentence.

Previous approach: V1 deliberately made `it's` optional and unrewarded
("It's is never required and never rewarded" — old §3.3), reasoning that a
false reject (a correct student marked wrong) is worse than a false accept.
That asymmetry argument still holds for the *time itself* (§3.4 keeps
accepting past/to forms, ambiguous digit renderings, etc.) — this decision
narrows it specifically for the sentence frame, not the time grammar.

Implementation note: `it's`/`its`/`it is` are still stripped from the token
list before structure matching (they carry no time information and would
break exact-length structure checks otherwise); their presence is checked
separately against the pre-filler token list (`spokenIts` in
`time-match.js`) and gates whether a structurally valid parse is allowed to
stand as `valid`, rather than being folded into the structures themselves.

## 2026-09-04 — Authored clock sizes floor at 20%, above the pixel rescue

Scene clock percentages start at 20% rather than the original 16-19%. This sits
on top of the 88 CSS-pixel floor above, which stays as the last-resort rescue.

Why: the pixel floor keeps a clock legible on a cramped stage, but a scene
authored small enough to hit it is permanently pinned to the emergency minimum,
which is not the same as being sized deliberately. The clock is the content of
this game, so the authored range should clear the floor on its own at ordinary
classroom sizes and let the rescue apply only where it is genuinely needed.
Size variety across scenes is preserved — the range is now 20% to 30%.
