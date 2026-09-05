import { getLevel, parseKey, timeKey } from './data/times.js';
import { allScenes } from './data/scenes.js';

/** Fisher-Yates, so unweighted passes are uniformly shuffled. */
export function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Preserve a queue's exact contents while greedily separating equal entries.
 * The most-frequent-first choice succeeds whenever any valid arrangement can.
 */
export function avoidAdjacentRepeats(queue, keyOf = (item) => item) {
  const counts = new Map();
  const values = new Map();
  for (const item of queue) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!values.has(key)) values.set(key, item);
  }

  const result = [];
  let previousKey = null;
  for (let i = 0; i < queue.length; i += 1) {
    let bestKey = null;
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count <= 0 || key === previousKey) continue;
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }

    // A repeat is only possible when the input multiset itself is impossible
    // to arrange without one; callers use pools large enough to avoid this.
    if (bestKey === null) {
      for (const [key, count] of counts) {
        if (count > 0) {
          bestKey = key;
          break;
        }
      }
    }
    if (bestKey === null) break;

    result.push(values.get(bestKey));
    counts.set(bestKey, counts.get(bestKey) - 1);
    previousKey = bestKey;
  }
  return result;
}

function weightedShuffle(items, weightOf, rng) {
  // Weighted random keys provide a permutation rather than sampling with
  // replacement, preserving the stronger every-target-before-repeat rule.
  return items
    .map((item) => {
      const random = Math.max(Number.MIN_VALUE, rng());
      return { item, priority: Math.log(random) / weightOf(item) };
    })
    .sort((a, b) => b.priority - a.priority)
    .map(({ item }) => item);
}

function nudgePassSeam(pass, previousKey, keyOf) {
  if (pass.length > 1 && keyOf(pass[0]) === previousKey) {
    const replacement = pass.findIndex((item, index) => index > 0 && keyOf(item) !== previousKey);
    if (replacement > 0) [pass[0], pass[replacement]] = [pass[replacement], pass[0]];
  }
  return pass;
}

function makeDealer(pool, { rng, keyOf, weightOf = null }) {
  let pass = [];
  let index = 0;
  let previousKey = null;

  return function deal() {
    if (index >= pass.length) {
      const shuffled = weightOf
        ? weightedShuffle(pool, weightOf, rng)
        : shuffle(pool, rng);
      pass = nudgePassSeam(avoidAdjacentRepeats(shuffled, keyOf), previousKey, keyOf);
      index = 0;
    }

    const item = pass[index];
    index += 1;
    previousKey = keyOf(item);
    return item;
  };
}

function normalizeDifficultTimes(progress) {
  if (!progress || typeof progress.strugglingTimes !== 'function') return [];
  const difficult = progress.strugglingTimes();
  if (!Array.isArray(difficult)) return [];

  const unique = new Map();
  for (const entry of difficult) {
    const time = typeof entry === 'string' ? parseKey(entry) : entry;
    if (!time || !Number.isInteger(time.h) || !Number.isInteger(time.m)) continue;
    if (time.h < 1 || time.h > 12 || time.m < 0 || time.m > 59) continue;
    unique.set(timeKey(time), Object.freeze({ h: time.h, m: time.m }));
  }
  return [...unique.values()];
}

/** Resolve the pool used by a session without mutating progress data. */
export function buildTimePool({ levelId, progress, practiceMode = 'normal' }) {
  const level = getLevel(levelId);
  if (!level) throw new RangeError(`Unknown level: ${levelId}`);

  if (practiceMode === 'difficult') {
    const difficult = normalizeDifficultTimes(progress);
    if (difficult.length >= 6) return difficult;
  }
  return [...level.times];
}

/**
 * Create independent infinite dealers for times and scenes.
 * `next()` merely pairs their next values; neither deck influences the other.
 */
export function createScheduler({
  levelId,
  progress = null,
  practiceMode = 'normal',
  sessionTimes = null,
  rng = Math.random,
} = {}) {
  const level = getLevel(levelId);
  if (!level) throw new RangeError(`Unknown level: ${levelId}`);
  if (typeof rng !== 'function') throw new TypeError('rng must be a function');

  // A pre-generated session deck (normal play) is dealt in its own order: it is
  // already balanced and spread, so re-shuffling it here would undo that.
  // Difficult practice keeps the weighted pool, which draws on missed times.
  let nextTime;
  if (sessionTimes && sessionTimes.length && practiceMode !== 'difficult') {
    let index = 0;
    nextTime = () => {
      const time = sessionTimes[index % sessionTimes.length];
      index += 1;
      return time;
    };
  } else {
    const timePool = buildTimePool({ levelId, progress, practiceMode });
    const useMixedWeights = practiceMode !== 'difficult' && level.minuteWeights;
    nextTime = makeDealer(timePool, {
      rng,
      keyOf: timeKey,
      weightOf: useMixedWeights ? (time) => level.minuteWeights[time.m] : null,
    });
  }
  const nextScene = makeDealer(allScenes(), {
    rng,
    keyOf: (scene) => scene.id,
  });

  return Object.freeze({
    nextTime,
    nextScene,
    next() {
      return { time: nextTime(), scene: nextScene() };
    },
  });
}
