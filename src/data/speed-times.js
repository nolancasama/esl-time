/**
 * Target times for the digital speed challenge.
 *
 * The round gets harder as the student gets it right, in four stages: whole
 * hours, then quarters, then five-minute times, then any exact minute. The
 * stage is a function of the CUMULATIVE correct count and nothing else, so a
 * mistake can never demote a student to easier times - it only costs them the
 * seconds it took. Stage 4 is deliberately unrestricted: reading 6:02 or 8:17
 * off a digital face is the skill the whole ramp exists to reach.
 *
 * Scene artwork, difficulty settings and the analog deck are all irrelevant
 * here; this module imports nothing and knows only about times.
 */

const SPEED_STAGES = Object.freeze([
  Object.freeze({ stage: 1, minCorrect: 0, maxCorrect: 2, minutes: Object.freeze([0]) }),
  Object.freeze({ stage: 2, minCorrect: 3, maxCorrect: 5, minutes: Object.freeze([0, 15, 30, 45]) }),
  Object.freeze({
    stage: 3,
    minCorrect: 6,
    maxCorrect: 9,
    minutes: Object.freeze([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]),
  }),
  Object.freeze({
    stage: 4,
    minCorrect: 10,
    maxCorrect: null,
    minutes: Object.freeze(Array.from({ length: 60 }, (_, minute) => minute)),
  }),
]);

/** The stage number for a cumulative correct count. Rises only. */
export function stageForCorrect(correct) {
  if (!Number.isFinite(correct) || correct < 0) return 1;
  const c = Math.floor(correct);
  for (const s of SPEED_STAGES) {
    const max = s.maxCorrect === null ? Infinity : s.maxCorrect;
    if (c >= s.minCorrect && c <= max) return s.stage;
  }
  // Unreachable: stage 4 is open ended.
  return 4;
}

/** The minute pool one stage may draw from. Out-of-range stages clamp. */
export function stageMinutes(stage) {
  const s = Math.min(Math.max(Math.floor(stage ?? 1), 1), 4);
  return SPEED_STAGES[s - 1].minutes;
}

/** `6:02` - the hour is never padded, the minute always is. */
export function formatDigitalTime({ h, m }) {
  return `${h}:${String(m).padStart(2, '0')}`;
}

/**
 * Draws the round's targets, one at a time, from the active stage's pool.
 *
 * Repetition is avoided with a cascade of preferences rather than a retry
 * loop: each tier is a nicer draw than the next, and the first one with any
 * candidates wins. That cannot hang, and it degrades gracefully in stage 1,
 * where every time shares the same minute and only the hour can vary.
 */
export class SpeedTimeSource {
  /** @param {() => number} rng Injected so a run can be reproduced in tests. */
  constructor(rng = Math.random) {
    this.rng = rng;
    this._last = null; // previous time returned
    this._recentHours = []; // hour values of the last three draws
    this._stage = null; // stage of the most recent draw
  }

  /** The stage of the most recent draw, or null before the first. */
  get stage() {
    return this._stage;
  }

  /** Forget the history, so the next draw behaves like a fresh round. */
  reset() {
    this._last = null;
    this._recentHours = [];
    this._stage = null;
  }

  /** The next target for a cumulative correct count, as a frozen time. */
  next(correctCount) {
    const stage = stageForCorrect(correctCount);
    this._stage = stage;
    const minutes = stageMinutes(stage);

    // Build the full candidate set for this stage.
    const candidates = [];
    for (let h = 1; h <= 12; h += 1) {
      for (const m of minutes) {
        candidates.push({ h, m });
      }
    }

    const prev = this._last;
    let pool = candidates;
    if (prev !== null) {
      const recentSet = new Set(this._recentHours);
      const tiers = [
        // T1: hour differs, minute differs, hour not in recent three.
        (t) => t.h !== prev.h && t.m !== prev.m && !recentSet.has(t.h),
        // T2: hour differs, minute differs.
        (t) => t.h !== prev.h && t.m !== prev.m,
        // T3: hour differs.
        (t) => t.h !== prev.h,
        // T4: minute differs.
        (t) => t.m !== prev.m,
        // T5: not the identical time.
        (t) => !(t.h === prev.h && t.m === prev.m),
        // T6: any candidate.
        () => true,
      ];
      for (const predicate of tiers) {
        const filtered = candidates.filter(predicate);
        if (filtered.length) {
          pool = filtered;
          break;
        }
      }
    }

    const idx = Math.floor(this.rng() * pool.length);
    const choice = pool[idx];
    // Update history.
    this._last = choice;
    this._recentHours.push(choice.h);
    if (this._recentHours.length > 3) this._recentHours.shift();
    return Object.freeze({ ...choice });
  }
}

export { SPEED_STAGES };
