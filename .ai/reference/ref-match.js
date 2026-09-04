/**
 * Forgiving word matching for Japanese EFL speakers.
 *
 * The question this module answers is NOT "was the pronunciation native-like".
 * It is "does the recogniser's output plausibly correspond to the child having
 * read the printed target word". The child is looking at the word, so a
 * homophone or an accented rendering is still a successful read.
 *
 * Matching runs as ordered layers, cheapest and safest first. Curated data
 * (VARIANTS, HOMOPHONES) handles the short function words where algorithms are
 * dangerous; the algorithmic layers generalise to everything else.
 *
 * No layer ever reports a confidence number to the UI. Children see only
 * "cleared" or "try again".
 */

import { VARIANTS, HOMOPHONES, DIGIT_WORDS, FILLERS } from './data/accept.js';

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** Homophone group lookup, built once. */
const HOMOPHONE_MAP = (() => {
  const map = new Map();
  for (const group of HOMOPHONES) {
    for (const w of group) {
      if (!map.has(w)) map.set(w, new Set());
      group.forEach((g) => map.get(w).add(g));
    }
  }
  return map;
})();

/**
 * Reduce a raw string to comparable letters.
 * Apostrophes are dropped rather than spaced so "don't" -> "dont" and
 * "it's" -> "its", both of which are how we store the targets.
 */
export function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split into tokens, expanding digits the recogniser substitutes for spelled
 * numbers ("4" -> "four") so number words clear normally.
 */
export function tokenize(raw) {
  const out = [];
  for (const tok of normalize(raw).split(' ')) {
    if (!tok) continue;
    if (/^\d+$/.test(tok) && DIGIT_WORDS[tok]) out.push(DIGIT_WORDS[tok]);
    else out.push(tok);
  }
  return out;
}

/**
 * Phonetic folding tuned to Japanese L1 substitutions.
 *
 * Every rule here MERGES sounds that Japanese speakers genuinely merge when
 * producing English. Merging can only make matching more permissive, never
 * less, so a wrong rule costs a false accept (harmless — the child still read
 * the printed word) rather than a false reject (harmful — the child is stuck).
 */
export function fold(word) {
  let s = normalize(word).replace(/\s/g, '');
  if (!s) return '';

  // Orthographic digraphs first, before single-letter rules touch them.
  s = s
    .replace(/ght/g, 't')      // right, light, eight
    .replace(/gh/g, '')        // laugh -> lau
    .replace(/ph/g, 'f')
    .replace(/wh/g, 'w')       // where -> were
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kw')
    .replace(/x/g, 'ks')
    .replace(/th/g, 's');      // th -> s is the dominant JP substitution

  // Single-letter merges.
  s = s
    .replace(/v/g, 'b')        // very -> bery
    .replace(/z/g, 's')
    .replace(/c/g, 'k')
    .replace(/l/g, 'r')        // the r/l merge
    .replace(/f/g, 'h')        // bilabial f sits close to h
    .replace(/j/g, 'z')
    .replace(/y/g, 'i');

  // Silent trailing e ("make" -> "mak"), then collapse doubles ("little").
  s = s.replace(/([^aeiou])e$/, '$1');
  s = s.replace(/(.)\1+/g, '$1');

  return s;
}

/**
 * Consonant skeleton — the tool for katakana vowel epenthesis.
 *
 * Japanese phonotactics forbid consonant clusters and final consonants, so
 * learners insert vowels: "best" -> "besuto", "stop" -> "sutoppu",
 * "from" -> "furomu". Trying to delete the inserted vowels is fragile because
 * some of them are the word's real vowels. Dropping ALL vowels from both sides
 * sidesteps the problem entirely.
 *
 * Only safe when the target has enough consonants to stay distinctive, so
 * callers must check length before trusting a skeleton match.
 */
export function skeleton(word) {
  const folded = fold(word);
  let out = '';
  for (const ch of folded) {
    if (!VOWELS.has(ch) && out[out.length - 1] !== ch) out += ch;
  }
  return out;
}

/** Standard Levenshtein distance, iterative two-row form. */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * How much fuzz a target can tolerate, scaled by length.
 *
 * Short function words get zero or tight fuzz because a single edit on a
 * two-letter word matches most of the language. Those words are instead
 * covered by the curated VARIANTS and HOMOPHONES layers, which are precise.
 * `sensitivity` shifts every threshold for teachers who need more or less
 * forgiveness in a noisy room.
 */
function fuzzBudget(foldedTarget, sensitivity = 1) {
  const n = foldedTarget.length;
  let budget;
  if (n <= 2) budget = 0;
  else if (n <= 3) budget = 1;
  else if (n <= 5) budget = 1;
  else if (n <= 7) budget = 2;
  else budget = 3;

  if (sensitivity > 1) budget += 1;          // more forgiving
  else if (sensitivity < 1) budget = Math.max(0, budget - 1);
  return budget;
}

/**
 * Strip filler tokens, but never strip a token that IS the target — several
 * Dolch words double as fillers, and erasing the target would guarantee a
 * false reject. Never strips down to nothing.
 */
function stripFillers(tokens, target) {
  const kept = tokens.filter((t) => t === target || !FILLERS.has(t));
  return kept.length ? kept : tokens;
}

/**
 * Does a single token clear the target?
 * Returns the name of the layer that accepted it, or null.
 */
function tokenMatches(token, target, sensitivity) {
  if (!token) return null;

  // L0 — exact.
  if (token === target) return 'exact';

  // L1 — curated accent/engine variants for this specific word.
  const variants = VARIANTS[target];
  if (variants && variants.some((v) => normalize(v).replace(/\s/g, '') === token)) {
    return 'variant';
  }

  // L2 — true homophones the engine cannot distinguish from audio.
  const group = HOMOPHONE_MAP.get(target);
  if (group && group.has(token)) return 'homophone';

  const ft = fold(target);
  const fk = fold(token);
  if (!ft || !fk) return null;

  // L3 — identical after phonetic folding.
  if (ft === fk) return 'phonetic';

  // Short targets stop here. Below this line the algorithms are too loose to
  // be trusted on two- and three-letter words.
  if (ft.length <= 2) return null;

  // L4 — consonant skeleton, for katakana epenthesis. Needs a distinctive
  // skeleton, otherwise "to"/"at"/"it"/"out" would all collide.
  const st = skeleton(target);
  if (st.length >= 3 && st === skeleton(token)) return 'skeleton';

  // L5 — scaled edit distance on folded forms. Three-letter targets must also
  // agree on their first sound, which is what stops "he" clearing "the".
  const budget = fuzzBudget(ft, sensitivity);
  if (budget > 0) {
    if (ft.length <= 3 && ft[0] !== fk[0]) return null;
    if (Math.abs(ft.length - fk.length) <= budget + 1) {
      if (editDistance(ft, fk) <= budget) return 'fuzzy';
    }
  }

  return null;
}

/**
 * Evaluate every transcript the engine offered against the target.
 *
 * @param {string} target        the printed word, as stored in words.js
 * @param {string[]} transcripts primary result plus alternatives
 * @param {number} sensitivity   0.8 stricter | 1 default | 1.2 forgiving
 * @returns {{ok: boolean, layer: string|null, heard: string|null}}
 */
export function matchAttempt(target, transcripts, sensitivity = 1) {
  const cleanTarget = normalize(target).replace(/\s/g, '');

  for (const raw of transcripts) {
    const tokens = stripFillers(tokenize(raw), cleanTarget);
    if (!tokens.length) continue;

    // Whole utterance collapsed, for multi-word renderings like "be cause".
    const joined = tokens.join('');
    const layerJoined = tokenMatches(joined, cleanTarget, sensitivity);
    if (layerJoined) return { ok: true, layer: layerJoined, heard: raw };

    // Any single token clearing the target counts — children often repeat
    // themselves ("the... the") or trail off.
    for (const token of tokens) {
      const layer = tokenMatches(token, cleanTarget, sensitivity);
      if (layer) return { ok: true, layer, heard: raw };
    }
  }

  return { ok: false, layer: null, heard: transcripts[0] || null };
}
