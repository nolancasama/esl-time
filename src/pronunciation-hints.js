export const PRONUNCIATION_COACH_ENABLED = true;

import { spokenForm, matchTime } from './time-match.js';
import { timeKey } from './data/times.js';

const NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = ['zero', 'ten', 'twenty', 'thirty', 'forty', 'fifty'];
const number = (n) => n < 20 ? NUMBERS[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${NUMBERS[n % 10]}` : ''}`;
const words = (s) => s.toLowerCase().replace(/[.]/g, '').replace(/-/g, ' ').split(/\s+/).filter(Boolean);

// Spoken equivalents of the frozen matcher's digital, named and past/to forms.
// Check every model against the matcher rather than broadening its grammar.
function forms(time) {
  const h = number(time.h), m = number(time.m), next = number(time.h % 12 + 1);
  const candidates = [spokenForm(time), `It's ${h} ${m}.`];
  if (!time.m) candidates.push(`It's ${h}.`, ...(time.h === 12 ? ["It's noon.", "It's midday.", "It's midnight."] : []));
  if (time.m) {
    for (const relation of ['past', 'after']) {
      candidates.push(`It's ${m} ${relation} ${h}.`, `It's ${m} minutes ${relation} ${h}.`);
      if ([15, 30].includes(time.m)) candidates.push(`It's ${time.m === 15 ? 'quarter' : 'half'} ${relation} ${h}.`);
    }
    for (const relation of ['to', 'till']) candidates.push(`It's ${number(60 - time.m)} ${relation} ${next}.`, `It's ${number(60 - time.m)} minutes ${relation} ${next}.`);
    if (time.m === 45) for (const relation of ['to', 'till', 'of']) candidates.push(`It's quarter ${relation} ${next}.`);
  }
  return [...new Set(candidates)].filter((s) => matchTime(time, [s]).ok);
}

// All hours/minutes are possible in the speed round; the regular pool is a subset.
const ANSWER_SET = [...new Set([...Array(60)].flatMap((_, n) => words(number(n))).concat(
  "o'clock", 'oh', 'half', 'quarter', 'past', 'after', 'to', 'till', 'of', 'minutes', 'noon', 'midday', 'midnight',
))];

// Select only the structural family the student is attempting. This keeps an
// optional alternative (e.g. "half past") out of a digital answer's focus.
function focusForm(time, transcript) {
  const text = transcript.toLowerCase();
  const h = number(time.h), next = number(time.h % 12 + 1);
  const relation = text.match(/\b(past|after|to|till|of)\b/)?.[0];
  if (relation) {
    const to = ['to', 'till', 'of'].includes(relation);
    const minutes = to ? 60 - time.m : time.m;
    const amount = /\bquarter\b/.test(text) && minutes === 15 ? 'quarter'
      : /\bhalf\b/.test(text) && minutes === 30 ? 'half' : number(minutes);
    return `${amount} ${/\bminutes\b/.test(text) ? 'minutes ' : ''}${relation} ${to ? next : h}`;
  }
  if (!time.m) return time.h === 12 && /\b(noon|midday|midnight)\b/.test(text)
    ? text.match(/\b(noon|midday|midnight)\b/)[0] : `${h}${/clock/.test(text) ? " o'clock" : ''}`;
  return `${h} ${time.m < 10 && /\b(oh|o)\b/.test(text) ? 'oh ' : ''}${number(time.m)}`;
}

/** Fail-soft, lazy UI: a stopped game can reuse this wrapper on its next run. */
export function createPronunciationHints({ feedback, speech, mode }) {
  let coach, host, blocked = false, restoreEnabled = false;
  const resume = () => {
    if (!blocked) return;
    blocked = false;
    if (restoreEnabled) speech.setEnabled(true);
    restoreEnabled = false;
  };
  const init = () => {
    if (coach || !PRONUNCIATION_COACH_ENABLED || !globalThis.EslPronunciationCoach?.createGameCoach) return;
    try {
      host = document.createElement('div');
      host.className = 'pronunciation-hints';
      // Capture before the vendor's click handler, so Listen cannot run during a hold.
      host.addEventListener('click', (event) => {
        if (speech.active || speech.pointerId !== null) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      coach = globalThis.EslPronunciationCoach.createGameCoach({
        enabled: PRONUNCIATION_COACH_ENABLED,
        coach: { hintLanguage: 'ja', accent: 'en-US', useTranscriptRanking: false },
        ui: { container: host, placement: 'inline', showTryAgain: false,
          note: 'マイクのボタンをおしたまま、もう一回言ってみよう。',
          theme: { primary: 'var(--blue)', background: 'var(--paper)', text: 'var(--ink)', radius: 'var(--radius)', fontFamily: 'var(--font)', fontSize: '14px' } },
        pauseListening: () => { restoreEnabled = speech.enabled; blocked = true; speech.setEnabled(false); },
        resumeListening: resume,
      });
      if (coach.enabled) feedback.after(host);
    } catch { host?.remove(); coach = undefined; }
  };
  return {
    attempt(time, transcripts, { duration = null, error } = {}, result) {
      if (duration === null || duration < 300 || result.reason === 'empty') return;
      init();
      return coach?.attempt({ exerciseId: `${mode}:${timeKey(time)}`, correct: result.reason === 'match',
        transcript: transcripts[0] || '', alternatives: transcripts.map((transcript) => ({ transcript })), error,
        target: forms(time), focus: words(focusForm(time, transcripts[0] || '')), answerSet: ANSWER_SET });
    },
    // Progression is keyed by mode + time, so clearing the card (pause, next
    // round, reveal) keeps it; a correct answer resets it inside the adapter.
    clear() { coach?.clear(); },
    destroy() { coach?.destroy(); coach = undefined; host?.remove(); host = undefined; resume(); },
  };
}
