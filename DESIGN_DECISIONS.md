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

## 2026-09-04 — Authored clock sizes floor at 20%, above the pixel rescue

Scene clock percentages start at 20% rather than the original 16-19%. This sits
on top of the 88 CSS-pixel floor above, which stays as the last-resort rescue.

Why: the pixel floor keeps a clock legible on a cramped stage, but a scene
authored small enough to hit it is permanently pinned to the emergency minimum,
which is not the same as being sized deliberately. The clock is the content of
this game, so the authored range should clear the floor on its own at ordinary
classroom sizes and let the rescue apply only where it is genuinely needed.
Size variety across scenes is preserved — the range is now 20% to 30%.
