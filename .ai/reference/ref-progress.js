/**
 * Per-word progress, mastery estimation, and persistence.
 *
 * Progress is stored independently per level: Level 1 mastery has no effect on
 * Level 2. Records are keyed by word, and a word belongs to exactly one level,
 * so this falls out naturally.
 *
 * Two rules shape this module:
 *
 *  1. Children never lose progress. No decay, no demotion, no counter that can
 *     go down. Missing a word affects how OFTEN it is scheduled, never how much
 *     credit the child has already earned.
 *  2. Clinical metrics stay internal. Response latency and accept rates drive
 *     scheduling, but the UI only ever shows star bands and friendly counts.
 */

import { allWords } from './data/words.js';

const STORAGE_KEY = 'swf.progress.v2';
const SETTINGS_KEY = 'swf.settings.v2';

/** Response speed bands. Internal only — never shown to students. */
export const SPEED = {
  FAST: 'fast',
  NORMAL: 'normal',
  SLOW: 'slow',
  MISSED: 'missed',
};

/** Latency thresholds in ms, measured from when the word became legible. */
const FAST_MS = 2000;
const NORMAL_MS = 4200;

function blankRecord() {
  return {
    shown: 0,        // encounters
    correct: 0,      // accepted at the gate
    misses: 0,       // blocked at the barrier
    ttsHelp: 0,      // times the correct pronunciation was modelled
    fast: 0,         // accepted within the FAST band
    sessions: 0,     // distinct sessions this word appeared in
    lastSession: null,
    lastSeen: null,
    totalMs: 0,      // cumulative latency over accepted encounters
    // Highest star band ever earned. Stars are reported from this, never
    // recomputed live, so a later bad day cannot take away what a child has
    // already demonstrated. Scheduling still reacts to current struggle via
    // difficulty(), which is what should change — not their credit.
    peak: 0,
  };
}

const DEFAULT_SETTINGS = {
  // Kept under the existing key so saved teacher settings migrate in place.
  // The value is now the timed round length in seconds.
  wordsPerSession: 30,
  conveyorSpeed: 1,        // 0.75 slow | 1 normal | 1.3 brisk
  sound: true,
  sensitivity: 1,          // 0.8 strict | 1 default | 1.2 forgiving
  practiceMode: 'mixed',   // 'mixed' | 'difficult'
  devMode: false,          // Space = correct, X = miss (teacher/dev testing)
};

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Wraps localStorage but never throws if storage is unavailable (private
 * browsing, locked-down school profiles). The game then runs with in-memory
 * progress for that session rather than failing.
 */
export class Progress {
  constructor() {
    this.words = safeParse(this._read(STORAGE_KEY), {});
    this.settings = { ...DEFAULT_SETTINGS, ...safeParse(this._read(SETTINGS_KEY), {}) };
    const storedMeta = safeParse(this._read(STORAGE_KEY + '.meta'), {});
    this.meta = {
      sessionCount: 0,
      bestStreak: {},     // by level id
      bestScore: {},      // correct words by level id
      levelSessions: {},  // by level id
      ...storedMeta,
    };
    if (!this.meta.bestStreak || typeof this.meta.bestStreak !== 'object') this.meta.bestStreak = {};
    if (!this.meta.bestScore || typeof this.meta.bestScore !== 'object') this.meta.bestScore = {};
    if (!this.meta.levelSessions || typeof this.meta.levelSessions !== 'object') this.meta.levelSessions = {};

    // Old builds stored encounter targets (10/15/20/30) under this key. Values
    // outside the new 20/30/45/60-second choices fall back to the intended
    // 30-second round instead of becoming an accidental tiny/huge timer.
    const roundLength = Number(this.settings.wordsPerSession);
    this.settings.wordsPerSession = [20, 30, 45, 60].includes(roundLength)
      ? roundLength : DEFAULT_SETTINGS.wordsPerSession;
  }

  _read(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  _write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  save() {
    this._write(STORAGE_KEY, this.words);
    this._write(SETTINGS_KEY, this.settings);
    this._write(STORAGE_KEY + '.meta', this.meta);
  }

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this._write(SETTINGS_KEY, this.settings);
  }

  get(word) {
    if (!this.words[word]) this.words[word] = blankRecord();
    return this.words[word];
  }

  /** Begin a session; returns its id, used to count distinct occasions. */
  startSession(levelId) {
    this.meta.sessionCount = (this.meta.sessionCount || 0) + 1;
    this.meta.levelSessions[levelId] = (this.meta.levelSessions[levelId] || 0) + 1;
    this.save();
    return this.meta.sessionCount;
  }

  /** Sessions played at this level. Drives how fast new words are introduced. */
  levelSessionCount(levelId) {
    return this.meta.levelSessions[levelId] || 0;
  }

  /**
   * Record one word encounter.
   *
   * @param {string} word
   * @param {object} o
   * @param {boolean} o.correct   accepted at the gate
   * @param {number}  o.ms        latency from legible to accepted
   * @param {number}  o.sessionId
   * @returns {string} the internal speed band
   */
  recordEncounter(word, { correct, ms, sessionId }) {
    const r = this.get(word);
    r.shown += 1;
    r.lastSeen = Date.now();

    if (correct) {
      r.correct += 1;
      r.totalMs += Math.max(0, ms || 0);
      if ((ms || 0) <= FAST_MS) r.fast += 1;
    } else {
      r.misses += 1;
      r.ttsHelp += 1;   // a miss always models the pronunciation
    }

    if (r.lastSession !== sessionId) {
      r.lastSession = sessionId;
      r.sessions += 1;
    }

    // Ratchet the star band upward only.
    r.peak = Math.max(r.peak || 0, this._rawStars(r));

    this.save();
    return this.speedBand({ correct, ms });
  }

  speedBand({ correct, ms }) {
    if (!correct) return SPEED.MISSED;
    if ((ms || 0) <= FAST_MS) return SPEED.FAST;
    if ((ms || 0) <= NORMAL_MS) return SPEED.NORMAL;
    return SPEED.SLOW;
  }

  /**
   * Star band earned by the current record, before ratcheting.
   *
   * Mastery requires four accepted encounters across at least two separate
   * sessions, with evidence of automaticity (two of them fast). One good
   * encounter — or one lucky day — cannot mark a word permanently learned.
   */
  _rawStars(r) {
    if (!r || r.shown === 0) return 0;
    const rate = r.correct / r.shown;
    if (r.correct >= 4 && r.sessions >= 2 && r.fast >= 2 && rate >= 0.7) return 3;
    if (r.correct >= 2 && rate >= 0.5) return 2;
    return 1;
  }

  /**
   * Stars: 0 unseen, 1 Learning, 2 Getting it, 3 Mastered.
   *
   * Reported from the stored peak, so this can only ever go up. Records written
   * before `peak` existed fall back to a live computation once.
   */
  stars(word) {
    const r = this.words[word];
    if (!r || r.shown === 0) return 0;
    if (r.peak === undefined) r.peak = this._rawStars(r);
    return r.peak;
  }

  starLabel(word) {
    return ['New', 'Learning', 'Getting it', 'Mastered'][this.stars(word)];
  }

  /**
   * Scheduling weight. Higher means "show this more often".
   * Never-seen words sit mid-range so they enter rotation naturally.
   */
  difficulty(word) {
    const r = this.words[word];
    if (!r || r.shown === 0) return 0.5;
    const missRate = r.misses / r.shown;
    const avgMs = r.correct ? r.totalMs / r.correct : NORMAL_MS;
    const slowness = Math.min(1, Math.max(0, (avgMs - FAST_MS) / (8000 - FAST_MS)));
    return Math.min(1, missRate * 0.75 + slowness * 0.25);
  }

  /**
   * Should this word be scheduled for extra practice?
   *
   * Deliberately independent of stars. Stars are sticky credit and never fall,
   * so gating this on `stars < 3` would mean a once-mastered word the child has
   * started missing again could never be rescheduled. Scheduling has to follow
   * current performance even when credit does not.
   */
  needsPractice(word) {
    const r = this.words[word];
    if (!r || r.shown === 0) return false;
    return this.difficulty(word) >= 0.3;
  }

  /** Summary for a level-select card. */
  levelSummary(level) {
    let mastered = 0;
    let started = 0;
    for (const w of level.words) {
      const s = this.stars(w);
      if (s === 3) mastered += 1;
      if (s > 0) started += 1;
    }
    return {
      total: level.words.length,
      mastered,
      started,
      percent: Math.round((mastered / level.words.length) * 100),
      bestStreak: this.meta.bestStreak?.[level.id] || 0,
    };
  }

  recordStreak(levelId, streak) {
    if (!this.meta.bestStreak) this.meta.bestStreak = {};
    if (streak > (this.meta.bestStreak[levelId] || 0)) {
      this.meta.bestStreak[levelId] = streak;
      this.save();
    }
  }

  bestScore(levelId) {
    return this.meta.bestScore?.[levelId] || 0;
  }

  /** Store a level score as a peak. Returns true only when a new best is set. */
  recordBestScore(levelId, score) {
    if (!this.meta.bestScore) this.meta.bestScore = {};
    if (score > (this.meta.bestScore[levelId] || 0)) {
      this.meta.bestScore[levelId] = score;
      this.save();
      return true;
    }
    return false;
  }

  reset() {
    this.words = {};
    this.meta = { sessionCount: 0, bestStreak: {}, bestScore: {}, levelSessions: {} };
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + '.meta');
    } catch { /* ignore */ }
  }

  /** Hardest words with history, for the difficult-words practice mode. */
  strugglingWords(limit = 40) {
    return allWords()
      .filter((w) => this.needsPractice(w))
      .sort((a, b) => this.difficulty(b) - this.difficulty(a))
      .slice(0, limit);
  }
}
