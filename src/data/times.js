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
  {
    id: 6,
    name: 'Hard',
    allowedMinutes: FIVE_MINUTES,
    // Same pool as level 4, different sequencing: the eight minutes that are
    // neither a whole hour nor a quarter carry ~72% of the weight, so "hard"
    // is not a re-labelled "mixed". Whole and quarter hours still appear.
    minuteWeights: {
      0: 0.07,
      15: 0.07,
      30: 0.07,
      45: 0.07,
      5: 0.09,
      10: 0.09,
      20: 0.09,
      25: 0.09,
      35: 0.09,
      40: 0.09,
      50: 0.09,
      55: 0.09,
    },
  },
]);

// The four teacher-facing difficulties, in order of increasing challenge, each
// mapping onto one pool above. Mixed is the default: a child should be able to
// open the game and press start without choosing anything.
const DIFFICULTY_TABLE = Object.freeze([
  { id: 'easy', levelId: 1, en: 'Easy', ja: 'かんたん', blurb: 'Whole hours only', blurbJa: 'ちょうどの じかん だけ' },
  { id: 'medium', levelId: 3, en: 'Medium', ja: 'ふつう', blurb: 'Hours, quarters and halves', blurbJa: 'ちょうど・15ふん・30ぷん・45ふん' },
  { id: 'hard', levelId: 6, en: 'Hard', ja: 'むずかしい', blurb: 'Every five minutes', blurbJa: '5ふん ごと ぜんぶ' },
  { id: 'mixed', levelId: 5, en: 'Mixed', ja: 'ミックス', blurb: 'A balanced mixture', blurbJa: 'いろいろ まぜて' },
]);

export const DEFAULT_DIFFICULTY = 'mixed';

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

/** Return the immutable level definitions in teaching order. */
export function allLevels() {
  return [...LEVELS];
}

/** Return the four immutable difficulty definitions in teaching order. */
export function allDifficulties() {
  return [...DIFFICULTY_TABLE];
}

/** Return one difficulty definition, falling back to the default. */
export function getDifficulty(id) {
  return DIFFICULTY_TABLE.find((difficulty) => difficulty.id === id)
    || DIFFICULTY_TABLE.find((difficulty) => difficulty.id === DEFAULT_DIFFICULTY);
}

/** The time pool a difficulty plays with. */
export function levelIdForDifficulty(id) {
  return getDifficulty(id).levelId;
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
