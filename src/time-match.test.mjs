import assert from 'node:assert/strict';
import {
  matchTime,
  normalizeTranscript,
  parseUtterance,
  spokenForm,
  spokenWords,
} from './time-match.js';

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

function expectMatch(label, target, transcript, reason, extra = {}) {
  check(label, () => {
    const actual = matchTime(target, Array.isArray(transcript) ? transcript : [transcript]);
    assert.equal(actual.reason, reason, `expected reason ${reason}, got ${actual.reason}`);
    assert.equal(actual.ok, reason === 'match', `ok disagrees with reason ${reason}`);
    for (const [key, value] of Object.entries(extra)) assert.equal(actual[key], value, key);
  });
}

function expectNormalized(label, raw, expected) {
  check(label, () => assert.equal(normalizeTranscript(raw), expected));
}

// Numeral-form STT is the browser's common path, not an exceptional fallback.
// Every variant is prefixed "it's" - see the "it's is required" section below.
const numeralCases = [
  [{ h: 7, m: 15 }, ["it's 7:15", "it's 715", "it's 7 15", "it's seven fifteen"]],
  [{ h: 11, m: 45 }, ["it's 11:45", "it's 1145", "it's 11 45", "it's eleven forty-five"]],
  [{ h: 3, m: 30 }, ["it's 3:30", "it's 330", "it's 3 30", "it's three thirty"]],
  [{ h: 12, m: 25 }, ["it's 12:25", "it's 1225", "it's 12 25", "it's twelve twenty-five"]],
  [{ h: 9, m: 5 }, ["it's 9:05", "it's 905", "it's nine oh five"]],
  [{ h: 4, m: 50 }, ["it's 4:50", "it's 450", "it's 4 50", "it's four fifty"]],
];
for (const [target, variants] of numeralCases) {
  for (const variant of variants) {
    expectMatch(`numeral ${variant}`, target, variant, 'match');
  }
}
expectNormalized('7:05 and words normalize alike', '7:05', '7 OH 5');
expectNormalized('705 and words normalize alike', '705', '7 OH 5');
expectNormalized('seven oh five normalization', 'seven oh five', '7 OH 5');
expectNormalized('700 expansion', '700', '7 0');
expectNormalized('tens plus units folds', 'seven thirty five', '7 35');
expectNormalized('noncanonical tens do not fold', 'ten thirty', '10 30');

// Every accepted structure in section 3.4. Each transcript is prefixed "it's"
// - see the "it's is required" section below for why that prefix is load-bearing.
const accepted = [
  ['H oclock', { h: 7, m: 0 }, "it's seven o'clock", 'oclock', true],
  ['H', { h: 7, m: 0 }, "it's seven", 'bare-hour', true],
  ['H M 10..59', { h: 7, m: 15 }, "it's seven fifteen", 'digital', true],
  ['H OH M', { h: 7, m: 5 }, "it's seven oh five", 'oh', true],
  ['H M 1..9', { h: 7, m: 5 }, "it's seven five", 'digital', false],
  ['noon', { h: 12, m: 0 }, "it's noon", 'named', false],
  ['midday', { h: 12, m: 0 }, "it's midday", 'named', false],
  ['midnight', { h: 12, m: 0 }, "it's midnight", 'named', false],
  ['half past H', { h: 7, m: 30 }, "it's half past seven", 'past-to', false],
  ['half after H', { h: 7, m: 30 }, "it's half after seven", 'past-to', false],
  ['quarter past H', { h: 7, m: 15 }, "it's quarter past seven", 'past-to', false],
  ['quarter after H', { h: 7, m: 15 }, "it's quarter after seven", 'past-to', false],
  ['quarter to H', { h: 7, m: 45 }, "it's quarter to eight", 'past-to', false],
  ['quarter till H', { h: 7, m: 45 }, "it's quarter till eight", 'past-to', false],
  ['quarter of H', { h: 7, m: 45 }, "it's quarter of eight", 'past-to', false],
  ['M past H', { h: 3, m: 20 }, "it's twenty past three", 'past-to', false],
  ['M after H', { h: 3, m: 20 }, "it's twenty after three", 'past-to', false],
  ['M minutes past H', { h: 3, m: 20 }, "it's twenty minutes past three", 'past-to', false],
  ['M minutes after H', { h: 3, m: 20 }, "it's twenty minutes after three", 'past-to', false],
  ['M to H', { h: 2, m: 40 }, "it's twenty to three", 'past-to', false],
  ['M till H', { h: 2, m: 40 }, "it's twenty till three", 'past-to', false],
  ['M minutes to H', { h: 2, m: 40 }, "it's twenty minutes to three", 'past-to', false],
  ['M minutes till H', { h: 2, m: 40 }, "it's twenty minutes till three", 'past-to', false],
  ['to wraps at one', { h: 12, m: 45 }, "it's quarter to one", 'past-to', false],
  ['zero reads as twelve', { h: 12, m: 0 }, "it's zero o'clock", 'oclock', true],
];
for (const [label, target, transcript, form, preferred] of accepted) {
  expectMatch(label, target, transcript, 'match', { form, preferred });
}

// Every rejected row in section 3.5, including both general o'clock orders.
const rejected = [
  ['seven fifteen oclock', { h: 7, m: 15 }, "seven fifteen o'clock"],
  ['seven oclock fifteen', { h: 7, m: 15 }, "seven o'clock fifteen"],
  ['H oclock M', { h: 7, m: 15 }, "seven o'clock fifteen"],
  ['H M oclock nonzero', { h: 7, m: 15 }, "seven fifteen o'clock"],
  ['fifteen seven', { h: 7, m: 15 }, 'fifteen seven'],
  ['thirty four', { h: 4, m: 30 }, 'thirty four'],
  ['leftover number after form', { h: 7, m: 15 }, 'seven fifteen nine'],
];
for (const [label, target, transcript] of rejected) {
  expectMatch(label, target, transcript, 'bad-grammar');
}
expectMatch('valid oclock can be wrong time', { h: 7, m: 15 }, "it's seven o'clock", 'wrong-time');

for (const prefix of ['uh it\'s', 'I think it\'s', 'it is']) {
  expectMatch(`filler prefix: ${prefix}`, { h: 7, m: 15 }, `${prefix} seven fifteen`, 'match');
}

for (const suffix of ['am', 'pm', 'a.m.', 'p.m.', 'a m', 'p m']) {
  expectMatch(`whole hour ${suffix}`, { h: 7, m: 0 }, `it's 7 o'clock ${suffix}`, 'match');
  expectMatch(`non-whole ${suffix}`, { h: 7, m: 15 }, `it's 7:15 ${suffix}`, 'match');
}

expectMatch('seven oh five preferred', { h: 7, m: 5 }, "it's seven oh five", 'match', { preferred: true });
expectMatch('seven five accepted nonpreferred', { h: 7, m: 5 }, "it's seven five", 'match', { preferred: false });

for (let h = 1; h <= 12; h += 1) {
  expectMatch(`whole hour ${h}`, { h, m: 0 }, `it's ${h} o'clock`, 'match');
}

expectMatch('primary malformed cannot be rescued', { h: 7, m: 15 }, ["seven fifteen o'clock", 'seven fifteen'], 'bad-grammar');
expectMatch('alternative rescues no-time', { h: 7, m: 15 }, ['hello', "it's seven fifteen"], 'match');
expectMatch('alternative rescues empty', { h: 7, m: 15 }, ['', "it's seven fifteen"], 'match');
expectMatch('no time', { h: 7, m: 15 }, 'hello there', 'no-time');
expectMatch('empty raw', { h: 7, m: 15 }, '', 'empty');
expectMatch('fillers become empty', { h: 7, m: 15 }, 'uh well okay', 'empty');
expectMatch('ordered wrong valid time', { h: 7, m: 15 }, "it's eight fifteen", 'wrong-time');

check('parseUtterance returns null without a time shape', () => assert.equal(parseUtterance('hello there'), null));
check('spoken form whole hour', () => assert.equal(spokenForm({ h: 7, m: 0 }), "It's seven o'clock."));
check('spoken form leading minute', () => assert.equal(spokenForm({ h: 7, m: 5 }), "It's seven oh five."));
check('spoken form hyphenated minute', () => assert.equal(spokenForm({ h: 7, m: 45 }), "It's seven forty-five."));

// "It's" is required grammar, not decoration (see the dedicated section
// below) - an otherwise-valid structure said without it is bad-grammar, the
// same consequence as any other malformed order.
expectMatch('missing its downgrades an otherwise-valid answer', { h: 7, m: 0 }, "seven o'clock", 'bad-grammar');
expectMatch('missing its downgrades even when the time is right', { h: 12, m: 0 }, 'noon', 'bad-grammar');
expectMatch('its without apostrophe satisfies the requirement', { h: 7, m: 0 }, "its seven o'clock", 'match');
expectMatch('it is satisfies the requirement', { h: 7, m: 0 }, "it is seven o'clock", 'match');

// Every level-4 target must survive model generation and the same matcher path
// used by recognition. This also covers every generated minute word.
for (let h = 1; h <= 12; h += 1) {
  for (let m = 0; m < 60; m += 5) {
    const target = { h, m };
    expectMatch(`level-4 round trip ${h}:${String(m).padStart(2, '0')}`, target, `it's ${spokenWords(target)}`, 'match');
  }
}

// --- Review pass: two classes of false rejection found against the frozen
// spec, both of which failed a CORRECT student answer. Kept as regressions.

// A determiner is ordinary in the past/to forms and carries no meaning.
expectMatch('a quarter past', { h: 7, m: 15 }, "it's a quarter past seven", 'match');
expectMatch('a quarter to', { h: 7, m: 45 }, "it's a quarter to eight", 'match');
expectMatch('a half past', { h: 7, m: 30 }, "it's a half past seven", 'match');
expectMatch('an quarter past', { h: 2, m: 15 }, "it's an quarter past two", 'match');

// "seven o'clock" reaches the matcher as a numeral often enough that the whole
// hours must clear their H:MM and HMM renderings too.
for (let h = 1; h <= 12; h += 1) {
  const target = { h, m: 0 };
  expectMatch(`whole hour colon ${h}:00`, target, `it's ${h}:00`, 'match');
  expectMatch(`whole hour bare ${h}00`, target, `it's ${h}00`, 'match');
}

// Typed input commonly autocorrects a straight apostrophe to a curly one;
// "it’s"/"o’clock" must clear exactly like their straight-quote forms.
expectMatch('curly apostrophe it’s oclock', { h: 7, m: 0 }, 'it’s seven o’clock', 'match');
expectMatch('curly apostrophe quarter past', { h: 7, m: 15 }, 'it’s a quarter past seven', 'match');

// The grammar rules must survive both fixes above.
expectMatch('a does not rescue oclock misuse', { h: 7, m: 15 }, "it's a seven fifteen o'clock", 'bad-grammar');
expectMatch('whole-hour fix keeps oclock rule', { h: 7, m: 0 }, "seven zero o'clock", 'bad-grammar');
// A reversed answer whose first token cannot be an hour is still bad grammar.
// ("0 7" is deliberately NOT this case: 0 reads as 12, so it is a valid
// structure naming a different time, which is wrong-time.)
expectMatch('whole-hour fix keeps order rule', { h: 7, m: 30 }, '30 7', 'bad-grammar');
expectMatch('hour zero reads as twelve', { h: 12, m: 7 }, "it's 0 7", 'match');

// Every five-minute target must also clear its numeral rendering, not just its
// word form - this is the sweep that exposed the whole-hour gap.
for (let h = 1; h <= 12; h += 1) {
  for (let m = 0; m < 60; m += 5) {
    const target = { h, m };
    const numeral = `${h}:${String(m).padStart(2, '0')}`;
    expectMatch(`numeral round trip ${numeral}`, target, `it's ${numeral}`, 'match');
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
