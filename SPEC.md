# What Time Is It? — frozen V1 spec

Vanilla ES modules, no build step, no dependencies. Open `index.html` directly
or serve statically. Structural reference: `C:/Users/nolan/Sight-Word-Factory`
(`src/match.js`, `src/scheduler.js`, `src/progress.js`, `src/speech.js`).

Target: Japanese elementary EFL students on classroom Chromebooks / touchscreens.

---

## 1. Round loop

1. Pick a scene and a target time independently (see §5).
2. Render the scene (placeholder screen) with an SVG analog clock showing the
   target time at that scene's clock position.
3. Play the scene's character audio if present; missing audio is silent and is
   not an error.
4. Student presses and HOLDS the big "Hold to Talk" button. Recognition starts
   on pointerdown, stops on pointerup. No Submit button, no countdown, no
   always-on mic.
5. Evaluate the utterance (§3).
6. Correct -> positive feedback, advance quickly. Incorrect -> "Try again",
   SAME scene, SAME time, clock unchanged. After `revealAfter` genuine wrong
   attempts (default 2) reveal the model spoken form and add the time to the
   difficult pool.

---

## 2. Time model

A target is `{ h, m }` with `h` in 1..12 and `m` in 0..59. There is no AM/PM:
an analog clock cannot express it, so AM/PM is never tested and never penalised.

Canonical key: `"7:15"` (`h + ':' + String(m).padStart(2,'0')`).

### Level pools (data-driven, one table, trivially editable)

| Level | Name | Minutes allowed | Size |
|---|---|---|---|
| 1 | Whole hours | 0 | 12 |
| 2 | Half hours | 0, 30 | 24 |
| 3 | Quarter hours | 0, 15, 30, 45 | 48 |
| 4 | Five minutes | every multiple of 5 | 144 |
| 5 | Mixed | every multiple of 5, weighted toward levels 1-3 | 144 |

Level 5 weighting: sample so roughly 20% whole hours, 20% half hours, 25%
quarter hours, 35% other five-minute times.

---

## 3. Answer matching (`src/time-match.js`)

### 3.1 API (frozen)

```js
/** @typedef {{h:number, m:number}} Time */

/** Lowercase, de-punctuate, expand numerals; exported for tests. */
export function normalizeTranscript(raw)   // -> string

/**
 * Parse one utterance into a time plus the structure that expressed it.
 * Returns null when no time-shaped expression is present at all.
 * Shape: { time: Time|null, form, valid: boolean, preferred: boolean }
 *   form: 'digital'|'oclock'|'oh'|'bare-hour'|'past-to'|'named'|null
 *   time is null when the structure was malformed
 */
export function parseUtterance(raw)

/**
 * Judge a set of recogniser alternatives against the target.
 * `transcripts[0]` is the primary hypothesis.
 * Shape: { ok, reason, form, preferred, heard }
 *   reason: 'match'|'wrong-time'|'bad-grammar'|'no-time'|'empty'
 *   heard: raw transcript — DEBUG DISPLAY ONLY
 */
export function matchTime(target, transcripts)

/** "It's seven fifteen." — the model form shown on reveal. */
export function spokenForm(target)

/** "seven fifteen" — bare words, for TTS or labels. */
export function spokenWords(target)
```

### 3.2 Alternatives policy (decided; do not change without asking)

Speech engines return several hypotheses. **Only `transcripts[0]` decides
grammar.** If `transcripts[0]` parses to any time-shaped expression — valid or
malformed — that is the verdict. Lower-ranked alternatives are consulted ONLY
to rescue a `no-time` / `empty` result.

Rationale: scanning every alternative for a valid parse would silently defeat
the o'clock grammar rule in §3.5, because a student who says "seven fifteen
o'clock" reliably has "seven fifteen" among the alternatives.

### 3.3 Normalisation

Chrome's recogniser returns spoken times as NUMERALS far more often than as
words. "seven fifteen" commonly arrives as `7:15`, `715`, or `7 15`, and "seven
o'clock" as `7 o'clock`. Handling this is not optional.

In order:

1. Lowercase. Strip all punctuation except `:` and `'`.
2. Fold o'clock spellings to one `oclock` token: `o'clock`, `oclock`,
   `o clock`, `oh clock`, `a clock`, `o'clocks`, `oclocks`.
3. Fold AM/PM spellings to `am` / `pm`: `a.m.`, `a m`, `am`, `pm`, `p.m.`,
   `p m`.
4. Map number words to integers, zero..fifty-nine, including hyphenated
   (`twenty-five` -> 25).
5. Fold tens+units pairs left to right: `[20|30|40|50] + [1..9]` -> sum.
   ("seven thirty five" -> `7 35`; "twenty five" -> `25`.)
   Do NOT fold anything else — "ten thirty" must stay `10 30`.
6. `oh` or `o` immediately before a 1..9 digit becomes the marker `OH`.
7. `H:MM` collapses to two tokens `H MM`.
8. A bare 3- or 4-digit run collapses to `H MM` only when it yields a valid
   time (`715` -> `7 15`, `1145` -> `11 45`). `700` -> `7 0`.
9. Drop fillers, but NEVER drop a number, `OH`, `oclock`, `past`, `to`, `half`,
   `quarter`, `noon`, `midnight`:
   `um uh er ah mm hmm well ok okay so yes yeah now maybe like i think its
   it is it the time answer is right`.
   Both `it's` and `it is` therefore vanish before parsing; "It's" is never
   required and never rewarded.

### 3.4 Accepted structures

Evaluated against the cleaned ordered token list. `am` / `pm` may trail any
form and is ignored. `H` must be 1..12 (`0` reads as 12); `M` must be 0..59.

| Structure | Time | Note | preferred |
|---|---|---|---|
| `H oclock` | (H, 0) | | yes |
| `H` | (H, 0) | | yes |
| `H M` (M 10..59) | (H, M) | | yes |
| `H OH M` (M 1..9) | (H, M) | "seven oh five" | yes |
| `H M` (M 1..9) | (H, M) | "seven five" | **no** |
| `noon` / `midday` / `midnight` | (12, 0) | | no |
| `half past H` / `half after H` | (H, 30) | | no |
| `quarter past H` / `quarter after H` | (H, 15) | | no |
| `quarter to H` / `quarter till H` / `quarter of H` | (H-1, 45) | | no |
| `M past H` / `M after H` (`minutes` optional) | (H, M) | | no |
| `M to H` / `M till H` (`minutes` optional) | (H-1, 60-M) | | no |

`H-1` wraps: 1 -> 12.

`preferred: false` means accepted as correct but not the taught model. It is
recorded on the attempt for future use; V1 shows no difference to the student.

**Past/to forms are accepted deliberately.** The plan says do not TEACH them;
rejecting valid English a student produces correctly would be a bad classroom
moment. "seven thirty" remains the modelled form everywhere.

### 3.5 Rejected structures — must return `bad-grammar`, not `wrong-time`

"o'clock" is valid ONLY when minutes are zero.

| Utterance | Target | Result |
|---|---|---|
| `seven fifteen o'clock` | 7:15 | bad-grammar |
| `seven o'clock fifteen` | 7:15 | bad-grammar |
| `H oclock M` (any) | any | bad-grammar |
| `H M oclock` where M != 0 | any | bad-grammar |
| `fifteen seven` | 7:15 | bad-grammar (15 is not an hour) |
| `thirty four` | 4:30 | bad-grammar (folds to `34`, no valid form) |
| any leftover number token after a form is consumed | any | bad-grammar |

`H oclock` where the target has minutes (e.g. "seven o'clock" for 7:15) is
structurally VALID but expresses (7,0) — that is `wrong-time`, not bad grammar.

Scoring must never reduce to "the right numbers appear somewhere in the string".

### 3.6 Result -> game consequence

| reason | Student sees | Counts as a wrong attempt |
|---|---|---|
| `match` | correct feedback, advance | — |
| `wrong-time` | "Try again" | **yes** |
| `bad-grammar` | "Try again" | **yes** |
| `no-time` | "Try again" | no |
| `empty` | "Try again" | no |

The student is never told WHICH of wrong-time / bad-grammar occurred, and the
answer is not revealed until `revealAfter` attempts.

---

## 4. Scenes (`src/data/scenes.js`)

12 scenes, data-driven, one record each:

```js
{
  id: 'scene-01',
  name: 'Classroom',                                  // future art hint only
  placeholder: 'Placeholder Scene 1',
  clock: { x: 18, y: 22, size: 26, type: 'analog' },  // % of stage box
  background: null,                                   // future asset
  character: null,                                    // future foreground NPC
  voice: null,                                        // future { src, speaker }
}
```

Clock positions must genuinely vary — spread across upper-left, upper-right,
centre-left, centre-right, high-wall, lower-side, and one partly behind where a
foreground character would stand. Sizes vary too. No two scenes share a
position.

**Layering is fixed now even though only one layer has art:** every scene
renders `background layer` / `clock layer` / `foreground character layer`, in
that order, as real elements. The character layer is present and empty in V1.
Do not architect around there being no character.

Voice: each scene names its own audio independently, so 6-8 different speakers
can later be distributed across the 12 scenes. Missing audio fails silently.

`clock.type` is dispatched through a renderer registry so `digital`, `alarm`,
`microwave`, `station` can be added later. V1 registers `analog` only.

---

## 5. Scheduling (`src/scheduler.js`)

Times and scenes are shuffled **independently**, so one scene shows many
different times across a session.

- Fisher-Yates shuffled pass over the level's time pool: every time in the pool
  is dealt once before any is dealt twice.
- Never the same time twice consecutively (greedy most-frequent-first
  placement, as in the reference `avoidAdjacentRepeats`).
- Never the same scene twice consecutively; cycle scenes on their own shuffled
  pass.
- `practiceMode: 'difficult'` draws the pool from times the student has missed
  (falling back to the level pool when fewer than 6 exist).
- Missed times are recorded to progress and re-offered later, but must NOT be
  over-weighted inside a normal shuffled round.

---

## 6. Speech (`src/speech.js`) — press and hold

Web Speech API, `lang='en-US'`, `continuous=false`, `interimResults=true`,
`maxAlternatives=5`.

- `pointerdown` -> start recognition immediately, button state becomes
  "Listening…" with a pulse.
- `pointerup` / `pointercancel` / pointer leaving the button -> stop
  immediately and evaluate.
- Use Pointer Events with `setPointerCapture` so a finger sliding off the
  button still ends the hold cleanly.
- `touch-action: none` on the button, and `preventDefault` on its touch events,
  so holding does not scroll or trigger long-press selection.
- Held **Space** or **Enter** is the keyboard equivalent (keydown starts, keyup
  stops; ignore auto-repeat). The button is a real `<button>` and focusable.
- Hard timeout ~5000 ms: recognition can never stay open indefinitely.
- Holds shorter than ~300 ms are treated as an accidental tap: `empty` result,
  free retry, never scored.
- The mic is closed between rounds. No always-on listening.

**Unsupported-browser fallback (required).** `window.SpeechRecognition` does
not exist in Firefox or Safari, and a school Chromebook can also refuse the
mic. When recognition is unsupported or permission is denied, swap the hold
button for a typed-answer input that runs through exactly the same
`matchTime()` path, and say so plainly once. The game must never be a dead
screen.

---

## 7. Transcript visibility

The live transcript is NEVER shown during normal play. Students are not asked
to debug the recogniser. Only `showTranscript` in Settings (teacher/debug,
default off) reveals it, and then only after the hold ends.

---

## 8. UI

- Scene fills most of the screen; the clock reads as an object inside the
  scene, not a floating quiz card.
- Bottom-centre: one large "🎙 Hold to Talk" button, minimum 96 px tall and
  240 px wide, with Japanese helper text beneath: 押している間、話そう.
  While held it reads "Listening…".
- Top bar: Back, progress (correct count / round position), Settings gear.
  Nothing else over the scene.
- Feedback sits low and never covers the clock.
- Large touch targets throughout, no hover-only affordances, no tiny buttons.
  Layout holds from 1024x600 (Chromebook) up to 1920x1080 and in portrait.

---

## 9. Settings (`localStorage`, one key `eslTime.v1`)

| Setting | Values | Default |
|---|---|---|
| Level | 1-5 | 1 |
| Practice mode | normal / difficult | normal |
| Character audio | on / off | on |
| Feedback sounds | on / off | on |
| Reveal after | 2 / 3 attempts | 2 |
| Show transcript (teacher) | on / off | off |

Plus "Reset progress". Storage access is wrapped so a locked-down school
profile falls back to in-memory state rather than throwing.

---

## 10. Progress (`src/progress.js`)

Per-time records keyed by `"7:15"`: shown, correct, misses, lastSeen, plus a
never-decreasing mastery peak. Missed times feed the difficult pool. Progress
never goes down.

---

## 11. Out of scope for V1

No finished artwork, no AI backgrounds, no placeholder cartoon characters, no
3D, no watch/phone animations, no camera mechanics, no synthesised character
voices. Scenes stay neutral labelled placeholders with a working clock.
