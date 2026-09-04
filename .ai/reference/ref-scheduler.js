/**
 * Word scheduling.
 *
 * A normal round is a plain shuffled pass over the chosen level: every word is
 * dealt once before any word is dealt twice. In a 30-second round a student
 * meets as many different words as they can get through, and the order is the
 * only thing that varies between rounds.
 *
 * Two teacher-driven modes deliberately narrow that pool instead:
 *   - `forceWords` — the Practice These Words flow, a short explicit list.
 *   - `practiceMode: 'difficult'` — drawn from words the student is struggling with.
 *
 * Missed words are still slipped back in 3–7 encounters later by the game loop
 * (see `requeuePosition` below). That is the one source of repetition in a
 * normal round, and it is the never-trap design, not scheduling.
 */

import { getLevel } from './data/words.js';

// A pass animation is currently 0.52s. Planning for one encounter every 0.35s
// leaves generous headroom while still keeping a finite, inexpensive queue.
// Even a 60-second round driven as fast as the state machine permits cannot
// exhaust this capacity.
const QUEUE_SECONDS_PER_ENCOUNTER = 0.35;
export function timedQueueSize(roundSeconds) {
  const seconds = [20, 30, 45, 60].includes(Number(roundSeconds))
    ? Number(roundSeconds) : 30;
  return Math.max(64, Math.ceil(seconds / QUEUE_SECONDS_PER_ENCOUNTER) + 3);
}

/** Fisher-Yates, so shuffles are actually uniform. */
function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Reorder so the same word never appears twice in a row.
 *
 * Greedy most-frequent-first placement: at each slot take whichever word has
 * the most repetitions left, excluding the one just placed. This succeeds
 * whenever a valid arrangement exists at all (i.e. no word occupies more than
 * half the queue), which a swap-based pass does not.
 *
 * It also preserves the exact multiset of words, so the 65/22/13 pool
 * proportions built above survive the reordering untouched. Ties resolve in
 * insertion order, and since the input arrives shuffled and most counts are 1,
 * the result stays random rather than falling into a visible cycle.
 */
function avoidAdjacentRepeats(queue) {
  const counts = new Map();
  for (const w of queue) counts.set(w, (counts.get(w) || 0) + 1);

  const out = [];
  let prev = null;

  for (let i = 0; i < queue.length; i++) {
    let best = null;
    let bestCount = 0;
    for (const [word, c] of counts) {
      if (c <= 0 || word === prev) continue;
      if (c > bestCount) { best = word; bestCount = c; }
    }

    // Only the previous word remains — unavoidable, so place it and move on.
    if (best === null) {
      for (const [word, c] of counts) {
        if (c > 0) { best = word; break; }
      }
      if (best === null) break;
    }

    out.push(best);
    counts.set(best, counts.get(best) - 1);
    prev = best;
  }

  return out;
}

/**
 * Build a session queue.
 *
 * @param {object} o
 * @param {number} o.levelId
 * @param {import('./progress.js').Progress} o.progress
 * @param {number} o.count           target number of word encounters
 * @param {string} o.practiceMode    'mixed' | 'difficult'
 * @param {string[]} [o.forceWords]  explicit list (Practice These Words flow)
 * @returns {string[]}
 */
export function buildQueue({ levelId, progress, count = 20, practiceMode = 'mixed', forceWords = null }) {
  // "Practice these words" repeats a short explicit list until the session is
  // full, so a 6-word review still produces a normal-length run.
  if (forceWords && forceWords.length) {
    const out = [];
    while (out.length < count) out.push(...shuffle(forceWords));
    return avoidAdjacentRepeats(out.slice(0, count));
  }

  const level = getLevel(levelId);

  if (practiceMode === 'difficult') {
    const hard = progress.strugglingWords(60);
    const pool = hard.length >= 6 ? hard : level.words;
    const out = [];
    while (out.length < count) out.push(...shuffle(pool));
    return avoidAdjacentRepeats(out.slice(0, count));
  }

  // A plain shuffled pass over the level. Every word in the level is dealt once
  // before any word is dealt twice, so a round shows as much variety as the
  // student can get through. A queue longer than the level deals another
  // reshuffled pass; the seam is nudged so a word cannot land back-to-back.
  const deck = [];
  while (deck.length < count) {
    const pass = shuffle(level.words);
    if (deck.length && pass.length > 1 && pass[0] === deck[deck.length - 1]) {
      [pass[0], pass[1]] = [pass[1], pass[0]];
    }
    deck.push(...pass);
  }
  return deck.slice(0, count);
}

/**
 * Where to re-insert a missed word so it returns later in the same session.
 *
 * The gap is 3–7 other encounters. That is long enough that the child is not
 * being visibly drilled on their mistake, and short enough that the modelled
 * pronunciation they just heard is still available to recall. Returning the
 * word immediately would read as correction and would stall momentum, which
 * this design specifically avoids.
 *
 * The recycling is silent — nothing in the UI announces that a word is a
 * repeat, and the second encounter is scored exactly like any other.
 */
export function requeuePosition(currentIndex, queueLength) {
  const gap = 3 + Math.floor(Math.random() * 5);   // 3–7
  return Math.min(queueLength, currentIndex + gap);
}
