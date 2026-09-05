import assert from 'node:assert/strict';
import {
  generateEasyTimes,
  generateHardTimes,
  generateMediumTimes,
  generateMixedTimes,
  generateSessionTimes,
} from './session-times.js';

let passed = 0;
let failed = 0;

function check(label, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    console.error(`  ${error.message}`);
  }
}

const key = (t) => `${t.h}:${t.m}`;
const counts = (times) => times.reduce((acc, t) => {
  acc[t.m] = (acc[t.m] || 0) + 1;
  return acc;
}, {});

// A deterministic RNG so a failure is reproducible rather than a one-off.
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const RUNS = 200;

function everyDeck(generate, assertion, label) {
  check(label, () => {
    for (let seed = 1; seed <= RUNS; seed += 1) assertion(generate(seeded(seed)), seed);
  });
}

// --- shape rules that hold for every difficulty ---------------------------
for (const [name, generate] of Object.entries({
  easy: generateEasyTimes,
  medium: generateMediumTimes,
  hard: generateHardTimes,
  mixed: generateMixedTimes,
})) {
  everyDeck(generate, (deck, seed) => {
    assert.equal(deck.length, 12, `${name} seed ${seed}: expected 12 times`);
  }, `${name}: deals exactly 12 times`);

  everyDeck(generate, (deck, seed) => {
    assert.equal(new Set(deck.map(key)).size, 12, `${name} seed ${seed}: duplicate time in run`);
  }, `${name}: no exact duplicate time in a run`);

  everyDeck(generate, (deck, seed) => {
    for (const t of deck) {
      assert.ok(Number.isInteger(t.h) && t.h >= 1 && t.h <= 12, `${name} seed ${seed}: bad hour ${t.h}`);
      assert.ok(Number.isInteger(t.m) && t.m >= 0 && t.m <= 59 && t.m % 5 === 0,
        `${name} seed ${seed}: bad minute ${t.m}`);
    }
  }, `${name}: every hour 1-12 and minute a valid five-minute value`);

  everyDeck(generate, (deck, seed) => {
    for (let i = 1; i < deck.length; i += 1) {
      assert.notEqual(key(deck[i]), key(deck[i - 1]), `${name} seed ${seed}: repeated time back to back`);
    }
  }, `${name}: never repeats a time on consecutive rounds`);
}

// --- per-difficulty distributions ----------------------------------------
everyDeck(generateEasyTimes, (deck, seed) => {
  assert.deepEqual(counts(deck), { 0: 12 }, `seed ${seed}: easy must be whole hours only`);
  assert.deepEqual([...deck.map((t) => t.h)].sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], `seed ${seed}: easy must use each hour once`);
}, 'easy: whole hours only, each of the twelve hours exactly once');

everyDeck(generateMediumTimes, (deck, seed) => {
  assert.deepEqual(counts(deck), { 0: 3, 15: 3, 30: 3, 45: 3 },
    `seed ${seed}: medium must be three of each quarter`);
}, 'medium: three each of :00, :15, :30, :45');

everyDeck(generateHardTimes, (deck, seed) => {
  const hard = [5, 10, 20, 25, 35, 40, 50, 55];
  for (const t of deck) {
    assert.ok(hard.includes(t.m), `seed ${seed}: hard drew a non-hard minute ${t.m}`);
  }
  for (const m of hard) {
    assert.ok(deck.some((t) => t.m === m), `seed ${seed}: hard missed minute ${m}`);
  }
}, 'hard: only harder minutes, and all eight appear at least once');

everyDeck(generateMixedTimes, (deck, seed) => {
  const c = counts(deck);
  for (const m of [0, 15, 30, 45]) {
    assert.equal(c[m], 2, `seed ${seed}: mixed must hold exactly two of :${m}`);
  }
  const others = deck.filter((t) => ![0, 15, 30, 45].includes(t.m));
  assert.equal(others.length, 4, `seed ${seed}: mixed must hold four other five-minute times`);
}, 'mixed: 2 each of :00/:15/:30/:45 plus 4 other five-minute times');

// --- adjacency preference -------------------------------------------------
check('decks rarely repeat an hour or minute back to back', () => {
  let clashes = 0;
  let neighbours = 0;
  for (let seed = 1; seed <= RUNS; seed += 1) {
    const deck = generateMixedTimes(seeded(seed));
    for (let i = 1; i < deck.length; i += 1) {
      neighbours += 1;
      if (deck[i].h === deck[i - 1].h || deck[i].m === deck[i - 1].m) clashes += 1;
    }
  }
  const rate = clashes / neighbours;
  assert.ok(rate < 0.12, `expected few adjacent hour/minute repeats, got ${(rate * 100).toFixed(1)}%`);
});

// --- public entry point ---------------------------------------------------
check('generateSessionTimes routes each difficulty', () => {
  assert.deepEqual(counts(generateSessionTimes('easy', null, seeded(7))), { 0: 12 });
  assert.deepEqual(counts(generateSessionTimes('medium', null, seeded(7))), { 0: 3, 15: 3, 30: 3, 45: 3 });
  assert.equal(generateSessionTimes('hard', null, seeded(7)).length, 12);
});

check('an unknown difficulty falls back to mixed rather than throwing', () => {
  const deck = generateSessionTimes('nonsense', null, seeded(3));
  assert.equal(deck.length, 12);
});

check('a repeated deck is regenerated', () => {
  // Feeding a deck back as "previous" must not hand back that same order.
  const first = generateSessionTimes('mixed', null, seeded(11));
  const second = generateSessionTimes('mixed', first, seeded(11));
  assert.notEqual(first.map(key).join(','), second.map(key).join(','));
});

check('two consecutive runs differ', () => {
  let identical = 0;
  for (let seed = 1; seed <= 50; seed += 1) {
    const rng = seeded(seed);
    const a = generateSessionTimes('mixed', null, rng);
    const b = generateSessionTimes('mixed', a, rng);
    if (a.map(key).join(',') === b.map(key).join(',')) identical += 1;
  }
  assert.equal(identical, 0, `${identical} runs repeated the previous deck exactly`);
});

check('returned times are frozen so a round cannot mutate the deck', () => {
  const deck = generateSessionTimes('mixed', null, seeded(5));
  assert.throws(() => { deck[0].h = 99; }, TypeError);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
