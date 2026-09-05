# Current State

## Status

The dependency-free V1 telling-time game shell is implemented around the
frozen matcher.

## What Exists

- Four sibling screens: title, game, session summary, and options.
- Title screen is deliberately bare: title, large `スタート`, smaller
  `オプション`. Difficulty (かんたん / ふつう / むずかしい / ミックス) lives in
  Options and defaults to ミックス, so a child can open and play immediately.
- Five data-driven time levels and twelve finished illustrated scenes
  (Classroom, Kitchen, Living Room, Bedroom, Train Station, Park, School
  Library, Gym, Cafeteria, Town Square, Art Room, Grand Library) shipped as
  WebP in `assets/scenes/` (3.17 MB total, down from 28.2 MB of PNG).
- Each scene's clock is painted into the artwork WITHOUT hands; the game
  overlays only hands, positioned from per-scene ellipse geometry measured in
  source image pixels. Scenes run full bleed with the controls floating on the
  picture along the bottom; framing pans so no clock is ever cropped.
- Independent shuffled-pass scheduling for time and scene decks, including
  difficult-practice fallback behavior.
- Layered scene mounting and a registry-dispatched inline SVG analog clock with
  60 ticks, 12 numerals, and a minute-adjusted hour hand.
- Each scene opens with a prerecorded "What time is it?" in a voice matched to
  its character; the answer control is hidden until that recording ends, with a
  quiet replay button beside it.
- Timed scoring (stopwatch, penalties, best times) is implemented but switched
  off behind `ENABLE_SCORING` in src/game.js.
- Press-and-hold Web Speech recognition with pointer capture, cancellation
  paths, keyboard parity, a five-second limit, and typed fallback.
- Correct answers are accepted mid-hold: interim hypotheses are judged live
  (success only), so a finished correct answer resolves without waiting for
  the child to release. Non-matches during the hold keep listening.
- A twelve-round loop with distinct matcher consequences, reveal handling,
  progress, summary statistics, and difficult-practice replay.
- Guarded single-key local persistence and optional, nonblocking audio.
- Responsive layouts for classroom landscape sizes and portrait screens.
- `visual.html`, a contact sheet rendering all 12 scenes at once for checking
  clock placement and legibility without playing a session.

## Verified

- 435 matcher assertions and 26 session-deck assertions pass (`npm test`). Includes: curly/smart-quote
  apostrophes now normalize like straight ones, and saying "it's"/"its"/"it
  is" is required for any answer to count as correct (see
  DESIGN_DECISIONS.md, 2026-09-05) — a structurally valid time said without
  it is bad-grammar, not a match.
- Round loop driven end to end through the typed fallback: bad grammar does not
  advance, a second genuine wrong reveals the model sentence, gibberish is a
  free retry that does not score, and six consecutive rounds produced six
  distinct scenes and six distinct times.
- Screenshots in `.ai/shots/` at 1366x768, 1024x600 and portrait, plus the
  12-scene contact sheet. No console or page errors.
- Artwork wiring verified two ways: every scene's hand angles asserted against
  `(h%12)*30 + m*0.5` / `m*6` from the live DOM, and all 12 clocks inspected
  visually at zoom. Clock faces measure 88-265 px across 1024x600, 1366x768,
  1920x1080 and portrait, with no clock cropped out of frame at any size.
- Speech itself is NOT verified end to end - it cannot run in a headless
  browser. The hold mechanics need a manual pass on a real Chromebook.

## Known Limits

- Full bleed crops part of each picture, since 3:2 artwork cannot fill a 16:9
  screen: roughly 16% of image height in landscape and more width in portrait.
  Clocks are guaranteed in frame; composition is what is lost.
- Clock faces measure ~125 px at 1024x600, ~167 px at 1366x768 and ~235 px at
  1920x1080 for a typical scene. The town square's distant tower clock is still
  the smallest (~55-104 px) and is the first thing to revisit if a class
  struggles to read it.
- Scene `character` foreground art is still null; background art and question
  voices have landed.
- Only one young voice per gender exists, so five scenes share each. The
  supplied adult male recording is unused: no scene shows an adult man.
- Speech recognition availability and behavior still depend on the browser and
  its microphone policy; typed entry is the supported fallback.

## Next Steps

1. Manual pass on a real touchscreen Chromebook: hold, release, slide-off, and
   a denied-microphone run. This is the one path automation could not cover.
2. Confirm with a teacher that dropping level selection from the entry path is
   right for classroom use — a teacher who wants a narrower pool now has to go
   through オプション first.
2. Then artwork. Future visual work can replace placeholder assets through scene data without
changing the round loop, clock API, or scene layer order. Additional clock
types can be registered without changing scene callers.
