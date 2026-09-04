/** @typedef {{h:number, m:number}} Time */

const FIVE_MINUTES = Object.freeze(Array.from({ length: 12 }, (_, index) => index * 5));

// Keeping level construction in this one table means a teacher-facing level can
// change without a second list elsewhere drifting out of sync.
const LEVEL_TABLE = Object.freeze([
  { id: 1, name: 'Whole hours', allowedMinutes: [0] },
  { id: 2, name: 'Half hours', allowedMinutes: [0, 30] },
  { id: 3, name: 'Quarter hours', allowedMinutes: [0, 15, 30, 45] },
  { id: 4, name: 'Five minutes', allowedMinutes: FIVE_MINUTES },
  {
    id: 5,
    name: 'Mixed',
    allowedMinutes: FIVE_MINUTES,
    // These are per-minute weights. Their totals across the four exclusive
    // groups are the frozen 20% / 20% / 25% / 35% mix.
    minuteWeights: {
      0: 0.2,
      30: 0.2,
      15: 0.125,
      45: 0.125,
      5: 0.04375,
      10: 0.04375,
      20: 0.04375,
      25: 0.04375,
      35: 0.04375,
      40: 0.04375,
      50: 0.04375,
      55: 0.04375,
    },
  },
]);

function makeLevel(definition) {
  const allowedMinutes = [...definition.allowedMinutes];
  const times = [];
  for (let h = 1; h <= 12; h += 1) {
    for (const m of allowedMinutes) times.push(Object.freeze({ h, m }));
  }

  return Object.freeze({
    id: definition.id,
    name: definition.name,
    allowedMinutes: Object.freeze(allowedMinutes),
    times: Object.freeze(times),
    minuteWeights: definition.minuteWeights
      ? Object.freeze({ ...definition.minuteWeights })
      : null,
  });
}

const LEVELS = Object.freeze(LEVEL_TABLE.map(makeLevel));

/** Return one immutable level definition, or null for an unknown id. */
export function getLevel(id) {
  return LEVELS.find((level) => level.id === Number(id)) || null;
}

/** Return the five immutable level definitions in teaching order. */
export function allLevels() {
  return [...LEVELS];
}

/** Canonical storage and scheduling key. */
export function timeKey({ h, m }) {
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Parse a canonical key, returning null rather than leaking invalid state. */
export function parseKey(key) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(key));
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 1 || h > 12 || m < 0 || m > 59) return null;
  return { h, m };
}
