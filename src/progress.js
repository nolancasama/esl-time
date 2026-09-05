/**
 * Persistent per-time progress and teacher settings.
 *
 * Credit and counters only move upward. A miss can make a time eligible for
 * extra practice, but it cannot take away mastery the child already earned.
 */

export const STORAGE_KEY = 'eslTime.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  difficulty: 'mixed',
  practiceMode: 'normal',
  characterAudio: true,
  feedbackSounds: true,
  revealAfter: 2,
  showTranscript: false,
});

let memoryState = null;

function blankRecord() {
  return {
    shown: 0,
    correct: 0,
    misses: 0,
    lastSeen: null,
    peak: 0,
  };
}

function keyFor(time) {
  if (typeof time === 'string' && /^(?:[1-9]|1[0-2]):[0-5]\d$/.test(time)) {
    return time;
  }

  const h = Number(time?.h);
  const m = Number(time?.m);
  if (!Number.isInteger(h) || h < 1 || h > 12 ||
      !Number.isInteger(m) || m < 0 || m > 59) {
    throw new TypeError('Expected a time shaped like { h: 1..12, m: 0..59 }.');
  }
  return `${h}:${String(m).padStart(2, '0')}`;
}

function timeFromKey(key) {
  const [h, m] = key.split(':').map(Number);
  return { h, m };
}

function nonNegativeInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function sanitizeRecord(value) {
  const record = blankRecord();
  if (!value || typeof value !== 'object') return record;

  record.shown = nonNegativeInteger(value.shown);
  record.correct = nonNegativeInteger(value.correct);
  record.misses = nonNegativeInteger(value.misses);
  record.peak = nonNegativeInteger(value.peak);
  record.lastSeen = value.lastSeen !== null && value.lastSeen !== undefined &&
    Number.isFinite(Number(value.lastSeen))
    ? Number(value.lastSeen)
    : null;
  return record;
}

// Levels the teacher-facing difficulties replaced. A profile saved before the
// difficulty screen existed keeps the teacher's intent rather than silently
// snapping back to the default.
const LEVEL_TO_DIFFICULTY = Object.freeze({
  1: 'easy', 2: 'medium', 3: 'medium', 4: 'hard', 5: 'mixed', 6: 'hard',
});

function sanitizeSettings(value = {}) {
  const settings = { ...DEFAULT_SETTINGS };
  const revealAfter = Number(value.revealAfter);

  if (['easy', 'medium', 'hard', 'mixed'].includes(value.difficulty)) {
    settings.difficulty = value.difficulty;
  } else if (LEVEL_TO_DIFFICULTY[Number(value.level)]) {
    settings.difficulty = LEVEL_TO_DIFFICULTY[Number(value.level)];
  }
  if (value.practiceMode === 'normal' || value.practiceMode === 'difficult') {
    settings.practiceMode = value.practiceMode;
  }
  if (typeof value.characterAudio === 'boolean') {
    settings.characterAudio = value.characterAudio;
  }
  if (typeof value.feedbackSounds === 'boolean') {
    settings.feedbackSounds = value.feedbackSounds;
  }
  if (revealAfter === 2 || revealAfter === 3) settings.revealAfter = revealAfter;
  if (typeof value.showTranscript === 'boolean') {
    settings.showTranscript = value.showTranscript;
  }
  return settings;
}

function sanitizeState(value) {
  const state = {
    times: {},
    settings: sanitizeSettings(value?.settings),
  };

  if (value?.times && typeof value.times === 'object' && !Array.isArray(value.times)) {
    for (const [key, record] of Object.entries(value.times)) {
      if (/^(?:[1-9]|1[0-2]):[0-5]\d$/.test(key)) {
        state.times[key] = sanitizeRecord(record);
      }
    }
  }
  return state;
}

function parseState(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? sanitizeState(value) : null;
  } catch {
    return null;
  }
}

function cloneState(state) {
  return sanitizeState(state);
}

/**
 * Storage is optional in managed browser profiles. The module-level copy lets
 * separate Progress instances still share state when localStorage is blocked.
 */
function readState() {
  try {
    const stored = parseState(globalThis.localStorage?.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Continue with the session-only copy below.
  }
  return memoryState ? cloneState(memoryState) : sanitizeState(null);
}

function writeState(state) {
  memoryState = cloneState(state);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // The in-memory copy is deliberately sufficient for this session.
  }
}

export class Progress {
  constructor() {
    const state = readState();
    this.times = state.times;
    this.settings = state.settings;
    memoryState = cloneState(state);
  }

  save() {
    writeState({ times: this.times, settings: this.settings });
  }

  getSettings() {
    return { ...this.settings };
  }

  updateSettings(patch = {}) {
    this.settings = sanitizeSettings({ ...this.settings, ...patch });
    this.save();
    return this.getSettings();
  }

  get(time) {
    const key = keyFor(time);
    if (!this.times[key]) this.times[key] = blankRecord();
    return this.times[key];
  }

  /** Mark the beginning of a round, separately from its eventual outcome. */
  recordShown(time) {
    const record = this.get(time);
    record.shown += 1;
    record.lastSeen = Date.now();
    this._ratchet(record);
    this.save();
    return { ...record };
  }

  recordCorrect(time) {
    const record = this.get(time);
    record.correct += 1;
    record.lastSeen = Date.now();
    this._ratchet(record);
    this.save();
    return { ...record };
  }

  recordMiss(time) {
    const record = this.get(time);
    record.misses += 1;
    record.lastSeen = Date.now();
    this._ratchet(record);
    this.save();
    return { ...record };
  }

  /** Convenience for callers that record one completed encounter at a time. */
  recordEncounter(time, { correct = false, missed = !correct } = {}) {
    const record = this.get(time);
    record.shown += 1;
    if (correct) record.correct += 1;
    else if (missed) record.misses += 1;
    record.lastSeen = Date.now();
    this._ratchet(record);
    this.save();
    return { ...record };
  }

  mastery(time) {
    return this.get(time).peak;
  }

  _rawMastery(record) {
    if (record.shown === 0) return 0;
    const rate = record.correct / record.shown;
    if (record.correct >= 4 && rate >= 0.7) return 3;
    if (record.correct >= 2 && rate >= 0.5) return 2;
    return 1;
  }

  _ratchet(record) {
    record.peak = Math.max(record.peak, this._rawMastery(record));
  }

  /**
   * Return missed targets most in need of practice. Mastery stays sticky, so
   * selection follows misses and recent accuracy rather than the peak badge.
   */
  strugglingTimes(limit = 40) {
    return Object.entries(this.times)
      .filter(([, record]) => record.misses > 0)
      .sort(([, a], [, b]) => {
        const aRate = a.misses / Math.max(1, a.shown);
        const bRate = b.misses / Math.max(1, b.shown);
        return bRate - aRate || b.misses - a.misses ||
          (a.lastSeen ?? 0) - (b.lastSeen ?? 0);
      })
      .slice(0, Math.max(0, nonNegativeInteger(limit)))
      .map(([key]) => timeFromKey(key));
  }

  /** Reset learning records while retaining the teacher's chosen settings. */
  reset() {
    this.times = {};
    this.save();
  }
}

export default Progress;
