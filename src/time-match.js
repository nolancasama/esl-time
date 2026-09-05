/** @typedef {{h:number, m:number}} Time */

const SMALL_NUMBERS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen',
];

const TENS = new Map([
  ['twenty', 20],
  ['thirty', 30],
  ['forty', 40],
  ['fifty', 50],
]);

const NUMBER_WORDS = new Map(SMALL_NUMBERS.map((word, value) => [word, value]));
for (const [word, value] of TENS) NUMBER_WORDS.set(word, value);

// 'a' and 'an' are here for "it's A quarter past seven", which is ordinary
// English a student will produce. They can never carry meaning inside a time
// expression, and the o'clock fold below already consumed the one place 'a'
// matters ("a clock" -> oclock), so dropping them is safe.
const FILLERS = new Set([
  'um', 'uh', 'er', 'ah', 'mm', 'hmm', 'well', 'ok', 'okay', 'so', 'yes',
  'yeah', 'now', 'maybe', 'like', 'i', 'think', 'its', "it's", 'it', 'is',
  'the', 'time', 'answer', 'right', 'a', 'an',
]);

const TIME_MARKERS = new Set([
  'OH', 'oclock', 'past', 'after', 'to', 'till', 'of', 'half', 'quarter',
  'minutes', 'noon', 'midday', 'midnight',
]);

function isDigits(token) {
  return /^\d+$/.test(token);
}

function hourValue(token) {
  if (!isDigits(token)) return null;
  const value = Number(token);
  if (value < 0 || value > 12) return null;
  return value === 0 ? 12 : value;
}

function minuteValue(token, minimum = 0) {
  if (!isDigits(token)) return null;
  const value = Number(token);
  return value >= minimum && value <= 59 ? value : null;
}

/**
 * Lowercase, de-punctuate, and expand the numeral forms emitted by STT, up to
 * (but not including) filler removal. Shared by normalizeTranscript, which
 * drops fillers for structure matching, and parseUtterance, which also needs
 * the pre-filler tokens to check for a spoken "it's" (see spokenIts below).
 */
function tokenizeExpanded(raw) {
  let text = String(raw ?? '')
    .toLowerCase()
    // Typed input commonly autocorrects a straight apostrophe to a curly one
    // ("it's" -> "it’s"); fold every variant to ' before the char whitelist
    // below would otherwise drop it and strand a stray "s" token.
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[^a-z0-9\s:']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return [];

  text = text
    .replace(/\bo\s*'\s*clocks?\b/g, 'oclock')
    .replace(/\b(?:o|oh|a)\s+clocks?\b/g, 'oclock')
    .replace(/\boclocks?\b/g, 'oclock');

  text = text
    .replace(/\ba\s+m\b/g, 'am')
    .replace(/\bp\s+m\b/g, 'pm');

  let tokens = text.split(/\s+/).map((token) => {
    const number = NUMBER_WORDS.get(token);
    return number === undefined ? token : String(number);
  });

  // Only canonical tens combine. Wider number arithmetic would turn malformed
  // word order (such as "ten thirty") into an unintended valid time.
  const folded = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tens = Number(tokens[i]);
    const units = Number(tokens[i + 1]);
    if (/^(20|30|40|50)$/.test(tokens[i]) && /^[1-9]$/.test(tokens[i + 1] || '')) {
      folded.push(String(tens + units));
      i += 1;
    } else {
      folded.push(tokens[i]);
    }
  }
  tokens = folded;

  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if ((tokens[i] === 'oh' || tokens[i] === 'o') && /^[1-9]$/.test(tokens[i + 1])) {
      tokens[i] = 'OH';
    }
  }

  // Recognisers strongly prefer digit renderings. Expand them before grammar
  // parsing so 7:15, 715, 7 15, and their word form share one token sequence.
  const expanded = [];
  for (const token of tokens) {
    const colon = token.match(/^(\d{1,2}):(\d{1,2})$/);
    if (colon) {
      expanded.push(String(Number(colon[1])));
      if (/^0[1-9]$/.test(colon[2])) expanded.push('OH');
      expanded.push(String(Number(colon[2])));
      continue;
    }

    if (/^\d{3,4}$/.test(token)) {
      const hourText = token.slice(0, -2);
      const minuteText = token.slice(-2);
      const hour = Number(hourText);
      const minute = Number(minuteText);
      if (hour <= 12 && minute <= 59) {
        expanded.push(String(hour));
        if (/^0[1-9]$/.test(minuteText)) expanded.push('OH');
        expanded.push(String(minute));
        continue;
      }
    }
    expanded.push(token);
  }

  return expanded;
}

/** Lowercase, de-punctuate, and expand the numeral forms emitted by STT. */
export function normalizeTranscript(raw) {
  // Fillers are deliberately a closed list. In particular, numbers and time
  // markers survive so the parser can reject leftovers as bad grammar.
  return tokenizeExpanded(raw).filter((token) => !FILLERS.has(token)).join(' ');
}

/**
 * Whether the student said "it's" / "its" / "it is" anywhere in the
 * utterance. Checked against the pre-filler token list, since "it", "is",
 * "it's" and "its" are themselves fillers that structure matching ignores.
 */
function spokenIts(preFillerTokens) {
  for (let i = 0; i < preFillerTokens.length; i += 1) {
    const token = preFillerTokens[i];
    if (token === "it's" || token === 'its') return true;
    if (token === 'it' && preFillerTokens[i + 1] === 'is') return true;
  }
  return false;
}

function parsed(time, form, preferred) {
  return { time, form, valid: true, preferred };
}

function malformed(form = null) {
  return { time: null, form, valid: false, preferred: false };
}

/** Parse a cleaned, filler-stripped token list as one ordered time expression. */
function parseStructure(tokens) {
  if (tokens.at(-1) === 'am' || tokens.at(-1) === 'pm') tokens = tokens.slice(0, -1);
  if (!tokens.length) return malformed();

  const [a, b, c, d] = tokens;
  const hA = hourValue(a);

  if (tokens.length === 1 && ['noon', 'midday', 'midnight'].includes(a)) {
    return parsed({ h: 12, m: 0 }, 'named', false);
  }

  if (tokens.length === 2 && hA !== null && b === 'oclock') {
    return parsed({ h: hA, m: 0 }, 'oclock', true);
  }
  if (tokens.length === 1 && hA !== null) {
    return parsed({ h: hA, m: 0 }, 'bare-hour', true);
  }

  if (tokens.length === 3 && hA !== null && b === 'OH') {
    const minute = minuteValue(c, 1);
    if (minute !== null && minute <= 9) return parsed({ h: hA, m: minute }, 'oh', true);
  }

  // Minute 0 is admitted here so the numeral renderings of a whole hour clear.
  // "seven o'clock" reaches us as 7:00 or 700 often enough that rejecting them
  // would fail a correct answer, and a false accept of the (unspoken) literal
  // "seven zero" costs nothing by comparison.
  if (tokens.length === 2 && hA !== null) {
    const minute = minuteValue(b, 0);
    if (minute !== null) {
      return parsed({ h: hA, m: minute }, 'digital', minute === 0 || minute >= 10);
    }
  }

  if (tokens.length === 3 && (a === 'half' || a === 'quarter')) {
    const hour = hourValue(c);
    if (hour !== null && (b === 'past' || b === 'after')) {
      return parsed({ h: hour, m: a === 'half' ? 30 : 15 }, 'past-to', false);
    }
    if (a === 'quarter' && hour !== null && (b === 'to' || b === 'till' || b === 'of')) {
      return parsed({ h: hour === 1 ? 12 : hour - 1, m: 45 }, 'past-to', false);
    }
  }

  const minute = minuteValue(a, 1);
  const relationIndex = b === 'minutes' ? 2 : 1;
  const relation = tokens[relationIndex];
  const relationHour = hourValue(tokens[relationIndex + 1]);
  if (minute !== null && relationHour !== null && tokens.length === relationIndex + 2) {
    if (relation === 'past' || relation === 'after') {
      return parsed({ h: relationHour, m: minute }, 'past-to', false);
    }
    if (relation === 'to' || relation === 'till') {
      return parsed(
        { h: relationHour === 1 ? 12 : relationHour - 1, m: 60 - minute },
        'past-to',
        false,
      );
    }
  }

  const hasTimeShape = tokens.some((token) => isDigits(token) || TIME_MARKERS.has(token));
  if (!hasTimeShape) return null;

  // A recognizable time fragment with an invalid order is grammar failure,
  // not a different time. This preserves the teaching consequence of o'clock
  // misuse and prevents number-hunting from accepting reordered answers.
  const form = tokens.includes('oclock') ? 'oclock' : null;
  return malformed(form);
}

/** Parse a cleaned utterance as one complete, ordered time expression. */
export function parseUtterance(raw) {
  const preFillerTokens = tokenizeExpanded(raw);
  const tokens = preFillerTokens.filter((token) => !FILLERS.has(token));
  if (!tokens.length) return null;

  const result = parseStructure(tokens);

  // "It's" (or "it is" / "its") is required grammar, not decoration: an
  // otherwise-valid structure said without it is the same teaching failure as
  // any other malformed order, so it downgrades to bad-grammar rather than
  // silently passing.
  if (result && result.valid && !spokenIts(preFillerTokens)) return malformed(result.form);
  return result;
}

function verdict(target, parsedResult, heard) {
  if (!parsedResult.valid) {
    return { ok: false, reason: 'bad-grammar', form: parsedResult.form, preferred: false, heard };
  }

  const ok = parsedResult.time.h === target.h && parsedResult.time.m === target.m;
  return {
    ok,
    reason: ok ? 'match' : 'wrong-time',
    form: parsedResult.form,
    preferred: parsedResult.preferred,
    heard,
  };
}

/** Judge recogniser hypotheses while allowing alternatives only to rescue silence. */
export function matchTime(target, transcripts) {
  const alternatives = Array.isArray(transcripts) ? transcripts : [];
  const primary = alternatives[0] ?? '';
  const primaryParse = parseUtterance(primary);

  // Once the primary contains a time-shaped expression, even a malformed one,
  // alternatives cannot erase its grammar error (notably an illegal o'clock).
  if (primaryParse) return verdict(target, primaryParse, primary);

  for (let i = 1; i < alternatives.length; i += 1) {
    const result = parseUtterance(alternatives[i]);
    if (result) return verdict(target, result, alternatives[i]);
  }

  return {
    ok: false,
    reason: normalizeTranscript(primary) ? 'no-time' : 'empty',
    form: null,
    preferred: false,
    heard: primary || null,
  };
}

function numberWords(value) {
  if (value < 20) return SMALL_NUMBERS[value];
  const tens = Math.floor(value / 10) * 10;
  const tensWord = [...TENS].find(([, number]) => number === tens)?.[0];
  const units = value % 10;
  return units ? `${tensWord}-${SMALL_NUMBERS[units]}` : tensWord;
}

/** The taught, bare model form. */
export function spokenWords(target) {
  const hour = numberWords(target.h);
  if (target.m === 0) return `${hour} o'clock`;
  if (target.m < 10) return `${hour} oh ${numberWords(target.m)}`;
  return `${hour} ${numberWords(target.m)}`;
}

/** The taught model sentence shown after repeated misses. */
export function spokenForm(target) {
  return `It's ${spokenWords(target)}.`;
}
