import assert from 'node:assert/strict';
import {
  SPEED_STAGES,
  stageForCorrect,
  stageMinutes,
  formatDigitalTime,
  SpeedTimeSource,
} from './speed-times.js';

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

// Deterministic RNG for reproducible tests.
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Stage determination tests
// ---------------------------------------------------------------------------
check('stageForCorrect clamps negatives and NaN to stage 1', () => {
  assert.equal(stageForCorrect(-5), 1);
  assert.equal(stageForCorrect(NaN), 1);
});

check('stage boundaries exact', () => {
  const expectations = [
    [0, 1], [1, 1], [2, 1],
    [3, 2], [4, 2], [5, 2],
    [6, 3], [7, 3], [8, 3], [9, 3],
    [10, 4], [11, 4], [40, 4], [500, 4],
  ];
  for (const [c, s] of expectations) {
    assert.equal(stageForCorrect(c), s, `correct ${c} should be stage ${s}`);
  }
});

check('stageMinutes clamps stage numbers', () => {
  assert.deepEqual(stageMinutes(0), SPEED_STAGES[0].minutes);
  assert.deepEqual(stageMinutes(5), SPEED_STAGES[3].minutes);
});

// ---------------------------------------------------------------------------
// Minute pools per stage
// ---------------------------------------------------------------------------
check('stage 1 only yields minute 0', () => {
  const src = new SpeedTimeSource(seeded(1));
  for (let i = 0; i < 20; i++) {
    const t = src.next(0);
    assert.equal(t.m, 0);
    assert.ok(t.h >= 1 && t.h <= 12);
  }
});

check('stage 2 yields only 0,15,30,45', () => {
  const src = new SpeedTimeSource(seeded(2));
  for (let i = 0; i < 30; i++) {
    const t = src.next(4); // correct count within stage 2
    assert.ok([0,15,30,45].includes(t.m));
  }
});

check('stage 3 yields only multiples of 5', () => {
  const src = new SpeedTimeSource(seeded(3));
  for (let i = 0; i < 40; i++) {
    const t = src.next(7);
    assert.equal(t.m % 5, 0);
  }
});

check('stage 4 covers full minute range and non-multiples of 5', () => {
  const src = new SpeedTimeSource(seeded(4));
  const minutes = new Set();
  const nonMultiple = new Set();
  for (let i = 0; i < 200; i++) {
    const t = src.next(15);
    minutes.add(t.m);
    if (t.m % 5 !== 0) nonMultiple.add(t.m);
  }
  assert.ok(minutes.size > 30, 'should see many different minutes');
  assert.ok(nonMultiple.size > 0, 'should see at least one non-multiple of 5');
  // ensure minutes 1..9 appear
  for (let m = 1; m <= 9; m++) {
    assert.ok(minutes.has(m), `minute ${m} should appear`);
  }
});

// ---------------------------------------------------------------------------
// Consecutive repeat avoidance
// ---------------------------------------------------------------------------
check('no identical consecutive times across many draws', () => {
  const src = new SpeedTimeSource(seeded(5));
  let last = null;
  for (let i = 0; i < 500; i++) {
    const t = src.next(12);
    if (last) {
      assert.notDeepStrictEqual(t, last);
    }
    last = t;
  }
});

// ---------------------------------------------------------------------------
// formatDigitalTime correctness
// ---------------------------------------------------------------------------
check('formatDigitalTime pads minutes and leaves hour alone', () => {
  assert.equal(formatDigitalTime({ h: 6, m: 2 }), '6:02');
  assert.equal(formatDigitalTime({ h: 12, m: 47 }), '12:47');
  assert.equal(formatDigitalTime({ h: 9, m: 0 }), '9:00');
  assert.equal(formatDigitalTime({ h: 1, m: 5 }), '1:05');
});

// ---------------------------------------------------------------------------
// Frozen objects and deterministic behavior
// ---------------------------------------------------------------------------
check('generated objects are frozen', () => {
  const src = new SpeedTimeSource(seeded(6));
  const t = src.next(0);
  assert.throws(() => { t.h = 99; }, TypeError);
});

check('same seed produces identical sequence, different seed differs', () => {
  const srcA = new SpeedTimeSource(seeded(7));
  const srcB = new SpeedTimeSource(seeded(7));
  const srcC = new SpeedTimeSource(seeded(8));
  const seqA = [];
  const seqB = [];
  const seqC = [];
  for (let i = 0; i < 20; i++) {
    seqA.push(srcA.next(0));
    seqB.push(srcB.next(0));
    seqC.push(srcC.next(0));
  }
  assert.deepStrictEqual(seqA, seqB);
  assert.notDeepStrictEqual(seqA, seqC);
});

check('reset forgets the round, including the reported stage', () => {
  const source = new SpeedTimeSource(seeded(9));
  assert.equal(source.stage, null, 'no stage before the first draw');
  source.next(0);
  source.next(12);
  assert.equal(source.stage, 4);
  source.reset();
  assert.equal(source.stage, null, 'reset must clear the reported stage');
  const afterReset = source.next(0);
  assert.equal(source.stage, 1);
  assert.ok(afterReset.h >= 1 && afterReset.h <= 12);
});

// A mistake costs seconds, never difficulty: the stage is read from the
// cumulative correct count, so it can only ever climb.
check('a stage is never lost while the correct count only rises', () => {
  let highest = 0;
  for (let correct = 0; correct <= 60; correct += 1) {
    const stage = stageForCorrect(correct);
    assert.ok(stage >= highest, `stage fell from ${highest} to ${stage} at ${correct}`);
    highest = stage;
  }
});

// Stage 1 is the tight one: every time shares minute 0, so only the hour can
// differ and the tier cascade has to fall through to catch a repeat.
check('no identical consecutive time in ANY stage', () => {
  for (const correct of [0, 4, 7, 22]) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const source = new SpeedTimeSource(seeded(seed));
      let previous = null;
      for (let draw = 0; draw < 250; draw += 1) {
        const time = source.next(correct);
        if (previous) {
          assert.ok(!(time.h === previous.h && time.m === previous.m),
            `repeat ${time.h}:${time.m} at correct ${correct}, seed ${seed}`);
        }
        previous = time;
      }
    }
  }
});

check('hours stay within 1..12 in every stage', () => {
  for (const correct of [0, 3, 6, 10]) {
    const source = new SpeedTimeSource(seeded(correct + 21));
    for (let draw = 0; draw < 150; draw += 1) {
      const { h } = source.next(correct);
      assert.ok(Number.isInteger(h) && h >= 1 && h <= 12, `hour ${h} out of range`);
    }
  }
});

check('the reported stage follows the correct count handed to next()', () => {
  const source = new SpeedTimeSource(seeded(11));
  for (const [correct, stage] of [[0, 1], [2, 1], [3, 2], [5, 2], [6, 3], [9, 3], [10, 4]]) {
    source.next(correct);
    assert.equal(source.stage, stage, `correct ${correct} should report stage ${stage}`);
  }
});

check('every minute 0..59 formats with two digits and an unpadded hour', () => {
  for (let m = 0; m < 60; m += 1) {
    for (const h of [1, 9, 10, 12]) {
      const text = formatDigitalTime({ h, m });
      assert.equal(text, `${h}:${String(m).padStart(2, '0')}`);
      assert.match(text, /^(?:[1-9]|1[0-2]):[0-5]\d$/, `${text} is not H:MM`);
    }
  }
});

check('the stage table itself is frozen', () => {
  assert.throws(() => { SPEED_STAGES.push({}); }, TypeError);
  assert.throws(() => { SPEED_STAGES[0].minutes.push(7); }, TypeError);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
