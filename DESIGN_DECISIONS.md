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
