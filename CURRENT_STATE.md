# Current State

## Status

The dependency-free V1 telling-time game shell is implemented around the
frozen matcher.

## What Exists

- Four sibling screens: level selection, game, session summary, and teacher
  settings.
- Five data-driven time levels and twelve frozen neutral placeholder scenes.
- Independent shuffled-pass scheduling for time and scene decks, including
  difficult-practice fallback behavior.
- Layered scene mounting and a registry-dispatched inline SVG analog clock with
  60 ticks, 12 numerals, and a minute-adjusted hour hand.
- Press-and-hold Web Speech recognition with pointer capture, cancellation
  paths, keyboard parity, a five-second limit, and typed fallback.
- A twelve-round loop with distinct matcher consequences, reveal handling,
  progress, summary statistics, and difficult-practice replay.
- Guarded single-key local persistence and optional, nonblocking audio.
- Responsive layouts for classroom landscape sizes and portrait screens.
- `visual.html`, a contact sheet rendering all 12 scenes at once for checking
  clock placement and legibility without playing a session.

## Verified

- 422 matcher assertions pass (`npm test`).
- Round loop driven end to end through the typed fallback: bad grammar does not
  advance, a second genuine wrong reveals the model sentence, gibberish is a
  free retry that does not score, and six consecutive rounds produced six
  distinct scenes and six distinct times.
- Screenshots in `.ai/shots/` at 1366x768, 1024x600 and portrait, plus the
  12-scene contact sheet. No console or page errors.
- Speech itself is NOT verified end to end - it cannot run in a headless
  browser. The hold mechanics need a manual pass on a real Chromebook.

## Known Limits

- Scene backgrounds, characters, and voice files intentionally remain null
  placeholders for V1.
- Speech recognition availability and behavior still depend on the browser and
  its microphone policy; typed entry is the supported fallback.

## Next Steps

1. Manual pass on a real touchscreen Chromebook: hold, release, slide-off, and
   a denied-microphone run. This is the one path automation could not cover.
2. Then artwork. Future visual work can replace placeholder assets through scene data without
changing the round loop, clock API, or scene layer order. Additional clock
types can be registered without changing scene callers.
