import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as vendor from '../vendor/esl-pronunciation-coach/pronunciation-coach.mjs';
import { createPronunciationHints, PRONUNCIATION_COACH_ENABLED } from '../src/pronunciation-hints.js';
import { matchTime } from '../src/time-match.js';

const attached = new Set();
class Element {
  addEventListener(type, listener) { this.listener = listener; }
  remove() { attached.delete(this); }
  after(element) { attached.add(element); }
}
globalThis.document = { createElement: () => new Element() };
globalThis.location = { search: '' };
const calls = [], outputs = [], configurations = [];
globalThis.EslPronunciationCoach = {
  createGameCoach(options) {
    configurations.push(options);
    const coach = vendor.createGameCoach({ ...options, ui: false });
    return {
      get enabled() { return coach.enabled; },
      attempt(input) { calls.push(input); const output = coach.attempt(input); outputs.push(output); return output; },
      clear: () => coach.clear(), resetAll: () => coach.resetAll(), destroy: () => coach.destroy(),
    };
  },
};
const speech = { active: false, pointerId: null, enabled: true, setEnabled(value) { this.enabled = value; } };
const make = (factory = createPronunciationHints) => factory({ feedback: new Element(), speech, mode: 'regular' });
const time = { h: 3, m: 0 };
const attempt = (glue, transcript, detail = { duration: 450 }, target = time) => {
  const alternatives = Array.isArray(transcript) ? transcript : [transcript];
  return glue.attempt(target, alternatives, detail, matchTime(target, alternatives));
};
let checks = 0;
function check(name, fn) {
  fn(); checks += 1; console.log(`PASS: ${name}`);
}

const glue = make();
const plan = new vendor.PronunciationCoach({ hintLanguage: 'ja', accent: 'en-US', useTranscriptRanking: false }).getHints('three');
check('near miss advances through the vendor ranked hints', () => {
  const first = attempt(glue, "it's tree o'clock");
  const second = attempt(glue, "it's tree o'clock");
  assert.equal(first.classification, 'possible-pronunciation');
  assert.equal(first.hint.id, plan.hints[0].id);
  assert.equal(second.hint.id, plan.hints[1].id);
  assert.equal(calls.at(-1).exerciseId, 'regular:3:00');
  assert.equal(calls.at(-1).correct, false);
  assert.deepEqual(calls.at(-1).alternatives, [{ transcript: "it's tree o'clock" }]);
});
check('correct answer hides the hint and resets progression', () => {
  const success = attempt(glue, "it's three o'clock");
  assert.equal(success.classification, 'correct');
  assert.equal(success.hint, null);
  assert.equal(calls.at(-1).correct, true);
  assert.equal(attempt(glue, "it's tree o'clock").hint.id, plan.hints[0].id);
});
check('silence, recognition errors, short taps and typed answers do not advance', () => {
  attempt(glue, "it's three o'clock");
  const count = calls.length;
  attempt(glue, []);
  attempt(glue, "it's tree o'clock", { duration: 299 });
  attempt(glue, "it's tree o'clock", { duration: null });
  assert.equal(calls.length, count);
  const error = attempt(glue, "it's tree o'clock", { duration: 450, error: 'network' });
  assert.equal(error.classification, 'recognition-error');
  assert.equal(error.hint, null);
  assert.equal(attempt(glue, "it's tree o'clock").hint.id, plan.hints[0].id);
});
check('another valid game answer does not advance pronunciation', () => {
  attempt(glue, "it's three o'clock");
  const wrong = attempt(glue, "it's four o'clock");
  assert.equal(wrong.classification, 'different-answer');
  assert.equal(wrong.hint, null);
  assert.equal(attempt(glue, "it's tree o'clock").hint.id, plan.hints[0].id);
});
check('grammar-only errors with every focus word heard have no hint', () => {
  assert.equal(matchTime(time, ["three o'clock"]).reason, 'bad-grammar');
  const grammar = attempt(glue, "three o'clock");
  assert.equal(grammar.classification, 'not-pronunciation');
  assert.equal(grammar.hint, null);
  for (const [target, phrase] of [
    [{ h: 3, m: 30 }, 'half past three'],
    [{ h: 3, m: 45 }, 'quarter to four'],
    [{ h: 3, m: 25 }, 'three twenty five'],
  ]) assert.equal(attempt(glue, phrase, { duration: 450 }, target).hint, null);
});
check('targets are accepted by the unchanged matcher and alternatives are preserved', () => {
  attempt(glue, ["it's tree o'clock", "it's free o'clock"]);
  const input = calls.at(-1);
  assert.equal(input.transcript, "it's tree o'clock");
  assert.equal(input.alternatives.length, 2);
  for (const target of input.target) assert.equal(matchTime(time, [target]).ok, true, target);
  assert.ok(input.focus.includes('three'));
  assert.ok(input.answerSet.includes('fifty'));
  assert.ok(input.answerSet.includes('quarter'));
  const config = configurations[0];
  assert.deepEqual(config.coach, { hintLanguage: 'ja', accent: 'en-US', useTranscriptRanking: false });
  assert.equal(config.ui.showTryAgain, false);
  assert.equal(config.ui.placement, 'inline');
  assert.match(config.ui.note, /マイクのボタン/);
});
check('TTS uses HoldToTalk enabled state and restores only its previous state', () => {
  const config = configurations[0];
  speech.enabled = true;
  config.pauseListening();
  assert.equal(speech.enabled, false);
  config.resumeListening();
  assert.equal(speech.enabled, true);
  speech.enabled = false;
  config.pauseListening();
  config.resumeListening();
  assert.equal(speech.enabled, false);
  speech.enabled = true;
});
glue.destroy();
check('destroy removes the UI and a restart can create it again', () => {
  assert.equal(attached.size, 0);
  attempt(glue, "it's tree o'clock");
  assert.equal(attached.size, 1);
  glue.destroy();
});
check('coach=off creates no attached DOM and does not affect the game verdict', () => {
  globalThis.location.search = '?coach=off';
  const disabled = make();
  const result = attempt(disabled, "it's tree o'clock");
  assert.equal(result.classification, 'disabled');
  assert.equal(attached.size, 0);
  assert.equal(matchTime(time, ["it's three o'clock"]).ok, true);
  disabled.destroy();
  globalThis.location.search = '';
});
const originalVendor = globalThis.EslPronunciationCoach;
check('missing vendor and factory failures are inert', () => {
  for (const implementation of [undefined, { createGameCoach() { throw new Error('unavailable'); } }]) {
    globalThis.EslPronunciationCoach = implementation;
    const unavailable = make();
    assert.doesNotThrow(() => attempt(unavailable, "it's tree o'clock"));
    assert.doesNotThrow(() => unavailable.clear());
    assert.doesNotThrow(() => unavailable.destroy());
    assert.equal(attached.size, 0);
    assert.equal(matchTime(time, ["it's three o'clock"]).ok, true);
  }
});
globalThis.EslPronunciationCoach = originalVendor;
// Load only the adapter with its documented single flag disabled; retain real imports.
const adapterUrl = new URL('../src/pronunciation-hints.js', import.meta.url);
const disabledSource = (await readFile(adapterUrl, 'utf8'))
  .replace('PRONUNCIATION_COACH_ENABLED = true', 'PRONUNCIATION_COACH_ENABLED = false')
  .replaceAll("'./time-match.js'", JSON.stringify(new URL('../src/time-match.js', import.meta.url).href))
  .replaceAll("'./data/times.js'", JSON.stringify(new URL('../src/data/times.js', import.meta.url).href));
const disabledModule = await import('data:text/javascript;base64,' + Buffer.from(disabledSource).toString('base64'));
check('single source flag disables all coach work', () => {
  assert.equal(PRONUNCIATION_COACH_ENABLED, true);
  assert.equal(disabledModule.PRONUNCIATION_COACH_ENABLED, false);
  const count = configurations.length;
  const disabled = make(disabledModule.createPronunciationHints);
  attempt(disabled, "it's tree o'clock");
  assert.equal(configurations.length, count);
  assert.equal(attached.size, 0);
  disabled.destroy();
});
console.log(`${checks} pronunciation glue checks passed.`);
