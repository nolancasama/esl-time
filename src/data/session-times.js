/**
 * Session time decks.
 *
 * A run's twelve target times are generated up front rather than drawn one at a
 * time, so each difficulty gets a GUARANTEED balance every run instead of one
 * that is merely right on average. Scene artwork is never involved: the deck is
 * paired with independently shuffled scenes, so no scene owns a time.
 */

import { SESSION_ROUNDS_PER_DECK } from './deck-size.js';

const QUARTERS = Object.freeze([0, 15, 30, 45]);
const HARD_MINUTES = Object.freeze([5, 10, 20, 25, 35, 40, 50, 55]);
const HOURS = Object.freeze(Array.from({ length: 12 }, (_, index) => index + 1));

function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function timeKey({ h, m }) {
  return `${h}:${m}`;
}

/**
 * Attach hours to a list of minutes, never repeating an exact time and drawing
 * from a reshuffled bag of all twelve hours so no hour dominates a run.
 */
function withHours(minutes, rng) {
  const used = new Set();
  const times = [];
  let bag = [];

  for (const m of minutes) {
    let chosen = null;
    for (let attempt = 0; attempt < 40 && chosen === null; attempt += 1) {
      if (!bag.length) bag = shuffled(HOURS, rng);
      const h = bag.pop();
      if (!used.has(timeKey({ h, m }))) chosen = h;
    }
    // Fall back to any hour that keeps the run duplicate-free.
    if (chosen === null) {
      chosen = HOURS.find((h) => !used.has(timeKey({ h, m }))) ?? HOURS[0];
    }
    used.add(timeKey({ h: chosen, m }));
    times.push({ h: chosen, m });
  }
  return times;
}

/**
 * Order a deck so neighbours differ in both hour and minute where possible.
 * Greedy with relaxation: a perfect ordering is a preference, never a
 * requirement that could hang the generator.
 */
function spread(times, rng) {
  const pool = shuffled(times, rng);
  const ordered = [];
  while (pool.length) {
    const previous = ordered[ordered.length - 1];
    let index = pool.findIndex((t) => !previous || (t.h !== previous.h && t.m !== previous.m));
    if (index === -1) index = pool.findIndex((t) => !previous || t.m !== previous.m);
    if (index === -1) index = 0;
    ordered.push(pool[index]);
    pool.splice(index, 1);
  }
  return ordered;
}

/** Every hour exactly once, on the hour: perfect coverage, no repeats. */
export function generateEasyTimes(rng = Math.random) {
  return spread(shuffled(HOURS, rng).map((h) => ({ h, m: 0 })), rng);
}

/** Three each of :00, :15, :30 and :45. */
export function generateMediumTimes(rng = Math.random) {
  const minutes = QUARTERS.flatMap((m) => [m, m, m]);
  return spread(withHours(shuffled(minutes, rng), rng), rng);
}

/** All eight harder minute values at least once, then four more from the same pool. */
export function generateHardTimes(rng = Math.random) {
  const minutes = [...HARD_MINUTES, ...shuffled(HARD_MINUTES, rng).slice(0, SESSION_ROUNDS_PER_DECK - HARD_MINUTES.length)];
  return spread(withHours(shuffled(minutes, rng), rng), rng);
}

/** Two each of :00, :15, :30, :45, plus four other five-minute values. */
export function generateMixedTimes(rng = Math.random) {
  const minutes = [
    ...QUARTERS.flatMap((m) => [m, m]),
    ...shuffled(HARD_MINUTES, rng).slice(0, 4),
  ];
  return spread(withHours(shuffled(minutes, rng), rng), rng);
}

const GENERATORS = Object.freeze({
  easy: generateEasyTimes,
  medium: generateMediumTimes,
  hard: generateHardTimes,
  mixed: generateMixedTimes,
});

/**
 * The twelve target times for one run.
 *
 * `previousTimes` only guards against handing back the identical deck twice in
 * a row; a couple of regenerations is deliberately as far as this goes.
 */
export function generateSessionTimes(difficulty, previousTimes = null, rng = Math.random) {
  const generate = GENERATORS[difficulty] || GENERATORS.mixed;
  let deck = generate(rng);

  if (previousTimes && previousTimes.length) {
    const before = previousTimes.map(timeKey).join(',');
    for (let attempt = 0; attempt < 3 && deck.map(timeKey).join(',') === before; attempt += 1) {
      deck = generate(rng);
    }
  }
  return deck.map((time) => Object.freeze({ ...time }));
}
