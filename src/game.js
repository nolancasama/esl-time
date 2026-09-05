import { matchTime, spokenForm } from './time-match.js';
import { levelIdForDifficulty, timeKey } from './data/times.js';
import { generateSessionTimes } from './data/session-times.js';
import { createScheduler } from './scheduler.js';
import { mountScene } from './scene.js';
import { HoldToTalk, MIC, speechSupported } from './speech.js';
import { AudioManager } from './audio.js';

export const SESSION_ROUNDS = 12;

// Timed scoring is built but switched off: the game currently focuses on the
// question-and-answer exchange without any speed pressure. Turning this back on
// restores the stopwatch, penalties, best times and the timed result screen;
// plain round progress ("3 / 12") is unaffected either way.
export const ENABLE_SCORING = false;

// Time penalties, kept here so they are tuned in one place. A run is scored as
// elapsed time plus penalties, lower being better.
export const WRONG_ATTEMPT_PENALTY_MS = 3000;
export const REVEAL_PENALTY_MS = 5000;

const TIMER_TICK_MS = 100;

/** Monotonic stopwatch for one run. Never derives elapsed time from tick counts. */
class RunTimer {
  constructor() {
    this.accumulatedMs = 0;
    this.startedAt = null;
  }

  get running() {
    return this.startedAt !== null;
  }

  start() {
    if (this.running) return;
    this.startedAt = performance.now();
  }

  pause() {
    if (!this.running) return;
    this.accumulatedMs += performance.now() - this.startedAt;
    this.startedAt = null;
  }

  /** Elapsed milliseconds, computed from timestamps rather than tick counts. */
  elapsed() {
    return this.running
      ? this.accumulatedMs + (performance.now() - this.startedAt)
      : this.accumulatedMs;
  }

  reset() {
    this.accumulatedMs = 0;
    this.startedAt = null;
  }
}

/** `1:47.4` — minutes, seconds and tenths. */
export function formatRunTime(totalMs) {
  const ms = Math.max(0, Math.round(totalMs));
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
const ACCIDENTAL_TAP_MS = 300;

export class TimeGame {
  constructor({ elements, progress, onComplete }) {
    this.elements = elements;
    this.progress = progress;
    this.onComplete = onComplete || (() => {});
    this.audio = new AudioManager(progress.getSettings());
    this.sceneMount = null;
    this.scheduler = null;
    this.active = false;
    this.paused = false;
    this.typedFallback = false;
    this.advanceTimer = null;
    this.current = null;
    this.session = null;
    this.timer = new RunTimer();
    this.timerTick = null;

    this.speech = new HoldToTalk(elements.holdButton, {
      onResult: (transcripts, detail) => this._judge(transcripts, detail),
      onLiveResult: (transcripts) => this._judgeLive(transcripts),
      onState: (state) => this._showMicState(state),
      onUnavailable: () => this._useTypedFallback(),
    });

    elements.typedForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const answer = elements.typedAnswer.value.trim();
      elements.typedAnswer.value = '';
      this._judge([answer], { duration: null });
    });

    if (!speechSupported()) this._useTypedFallback();
  }

  start({ levelId, practiceMode } = {}) {
    this.stop();
    const settings = this.progress.getSettings();
    const selectedLevel = Number(levelId ?? levelIdForDifficulty(settings.difficulty));
    const selectedMode = practiceMode ?? settings.practiceMode;
    this.audio.setSettings(settings);
    // The whole deck is generated before the run starts, so no time is chosen
    // mid-run and the stopwatch never waits on it.
    const sessionTimes = selectedMode === 'difficult'
      ? null
      : generateSessionTimes(settings.difficulty, this.previousTimes);
    this.previousTimes = sessionTimes;
    this.scheduler = createScheduler({
      levelId: selectedLevel,
      practiceMode: selectedMode,
      sessionTimes,
      progress: this.progress,
    });
    this.session = {
      levelId: selectedLevel,
      practiceMode: selectedMode,
      difficulty: settings.difficulty,
      roundIndex: -1,
      correct: 0,
      firstTry: 0,
      genuineWrong: 0,
      penaltyMs: 0,
      elapsedMs: 0,
      finalScoreMs: null,
      missed: new Set(),
    };
    this.timer.reset();
    this._renderTimer();
    // Tracks what the badge is currently showing, so a rising score can be
    // celebrated exactly once rather than on every progress repaint.
    this.shownCorrect = 0;
    this.elements.progress.classList.remove('is-scoring');
    this.active = true;
    this.paused = false;
    this._nextRound();
  }

  _nextRound() {
    if (!this.active || this.paused) return;
    this._clearAdvance();
    this.session.roundIndex += 1;
    if (this.session.roundIndex >= SESSION_ROUNDS) {
      this._complete();
      return;
    }

    this.current = {
      ...this.scheduler.next(),
      genuineWrong: 0,
      resolved: false,
    };
    this.progress.recordShown(this.current.time);
    if (this.sceneMount) this.sceneMount.destroy();
    this.sceneMount = mountScene(this.elements.stage, this.current.scene, this.current.time, {
      onFit: (clockRect) => this._placeScoreBadge(clockRect),
    });
    this.elements.stage.setAttribute('aria-label', `${this.current.scene.name} scene`);
    this._setFeedback('');
    this._clearTranscript();
    this._updateProgress();
    this._askQuestion();
  }

  /**
   * The character asks "What time is it?", and only then can the student
   * answer. The control is HIDDEN rather than merely disabled during the
   * question, so nobody starts answering over the top of it — and so the
   * game's own recording can never be picked up by the microphone.
   */
  _askQuestion() {
    const round = this.current;
    this._setAnswerReady(false);
    this.audio.playCharacter(this.current.scene, this.progress.getSettings(), () => {
      // A late callback from a scene the student already left must do nothing.
      if (!this.active || this.current !== round || round.resolved) return;
      this._setAnswerReady(true);
    });
  }

  /** Replay the question without touching the round's score or attempts. */
  replayQuestion() {
    if (!this.active || this.paused || !this.current || this.current.resolved) return;
    this._askQuestion();
  }

  /**
   * Show or hide the answer control as one unit. Hiding also cancels any open
   * recognition, so a round can never be listening while hidden.
   */
  _setAnswerReady(ready) {
    const round = this.current;
    if (round) round.answerReady = ready;
    this.elements.speechControls.hidden = this.typedFallback || !ready;
    if (this.elements.replayQuestion) this.elements.replayQuestion.hidden = !ready;
    if (this.typedFallback) this.elements.typedForm.hidden = !ready;
    this._setAnswerEnabled(ready);
    if (ready) {
      // The run clock starts when the student can first answer, and then runs
      // continuously: ordinary scene changes and feedback are part of the run.
      this._startTimer();
      if (this.typedFallback) this.elements.typedAnswer.focus({ preventScroll: true });
    }
  }

  _startTimer() {
    if (!ENABLE_SCORING) return;
    if (!this.session || this.session.finalScoreMs !== null) return;
    this.timer.start();
    if (this.timerTick === null) {
      this.timerTick = setInterval(() => this._renderTimer(), TIMER_TICK_MS);
    }
    this._renderTimer();
  }

  _pauseTimer() {
    this.timer.pause();
    if (this.timerTick !== null) {
      clearInterval(this.timerTick);
      this.timerTick = null;
    }
    this._renderTimer();
  }

  _renderTimer() {
    const display = this.elements.runTimer;
    if (!display) return;
    const elapsed = this.session ? this.timer.elapsed() : 0;
    const penalty = this.session ? this.session.penaltyMs : 0;
    display.textContent = formatRunTime(elapsed + penalty);
  }

  /** Adds a time penalty and shows it, without ever touching the clock itself. */
  _penalise(milliseconds) {
    if (!ENABLE_SCORING || !this.session) return;
    this.session.penaltyMs += milliseconds;
    const badge = this.elements.timerBadge;
    if (badge) {
      const pop = this.elements.timerPop;
      if (pop) pop.textContent = `+${Math.round(milliseconds / 1000)}`;
      badge.classList.remove('is-penalised');
      void badge.offsetWidth;
      badge.classList.add('is-penalised');
    }
    this._renderTimer();
  }

  /**
   * Judge a hypothesis heard while the button is STILL held. Success only: an
   * interim transcript is often just an unfinished sentence ("it's seven" on
   * the way to "it's seven fifteen"), so anything short of a complete match
   * keeps listening. Wrongness is only ever decided once the attempt ended.
   */
  _judgeLive(transcripts) {
    if (!this.active || this.paused || !this.current || this.current.resolved) return;

    const result = matchTime(this.current.time, transcripts);
    if (result.reason !== 'match') return;
    this._resolveCorrect(result);
  }

  /**
   * The one success path, shared by live and release judging. Marks the round
   * resolved first, which is what makes every later release, onend or timeout
   * event a harmless no-op.
   */
  _resolveCorrect(result) {
    this.current.resolved = true;
    // Freeze the run the instant the last answer lands, so the celebration
    // animation and the results screen never add to the score.
    if (this.session.roundIndex >= SESSION_ROUNDS - 1) this._pauseTimer();
    this._showTranscript(result.heard);
    this.progress.recordCorrect(this.current.time);
    this.session.correct += 1;
    if (this.current.genuineWrong === 0) this.session.firstTry += 1;
    // Also stops recognition: disabling the control cancels the open session.
    this._setAnswerEnabled(false);
    this._setFeedback('✓ Great!', 'correct');
    this.elements.stage.classList.add('is-correct');
    this.audio.playFeedback('correct');
    this._updateProgress();
    this.advanceTimer = setTimeout(() => {
      this.elements.stage.classList.remove('is-correct');
      this._nextRound();
    }, 700);
  }

  _judge(transcripts, { duration = null } = {}) {
    if (!this.active || this.paused || !this.current || this.current.resolved) return;

    // Very short holds are motor slips, not evidence that the child was wrong.
    const alternatives = duration !== null && duration < ACCIDENTAL_TAP_MS ? [] : transcripts;
    const result = matchTime(this.current.time, alternatives);

    if (result.reason === 'match') {
      this._resolveCorrect(result);
      return;
    }

    this._showTranscript(result.heard);
    this._setFeedback('Try again');
    if (result.reason !== 'wrong-time' && result.reason !== 'bad-grammar') return;

    // Only a completed attempt that was genuinely a wrong time or bad grammar
    // is penalised. Short taps, silence, and recogniser failures reach the
    // early return above, and live interim speech never reaches _judge at all.
    this.current.genuineWrong += 1;
    this.session.genuineWrong += 1;
    this._penalise(WRONG_ATTEMPT_PENALTY_MS);
    this.audio.playFeedback('incorrect');
    const revealAfter = this.progress.getSettings().revealAfter;
    if (this.current.genuineWrong < revealAfter) return;

    this.current.resolved = true;
    this._penalise(REVEAL_PENALTY_MS);
    if (this.session.roundIndex >= SESSION_ROUNDS - 1) this._pauseTimer();
    this.progress.recordMiss(this.current.time);
    this.session.missed.add(timeKey(this.current.time));
    this._setAnswerEnabled(false);
    this._setFeedback(spokenForm(this.current.time), 'reveal');
    this.advanceTimer = setTimeout(() => this._nextRound(), 1900);
  }

  /**
   * Keep the score badge centred at the top unless it would sit on the clock.
   * Two scenes paint their clock dead centre and hard against the top of the
   * artwork (the station and the grand library), so no amount of panning can
   * move them clear; the badge steps aside instead. Reading the clock always
   * outranks the badge holding its position.
   */
  _placeScoreBadge(clockRect) {
    const badge = this.elements.progress;
    badge.classList.remove('is-shifted-left', 'is-shifted-right');
    if (!clockRect) return;

    const stageBox = this.elements.stage.getBoundingClientRect();
    const box = badge.getBoundingClientRect();
    const left = box.left - stageBox.left;
    const right = box.right - stageBox.left;
    const top = box.top - stageBox.top;
    const bottom = box.bottom - stageBox.top;

    const overlaps = left < clockRect.right && right > clockRect.left
      && top < clockRect.bottom && bottom > clockRect.top;
    if (!overlaps) return;

    const roomRight = clockRect.width - clockRect.right;
    badge.classList.add(roomRight >= clockRect.left ? 'is-shifted-right' : 'is-shifted-left');
  }

  _showMicState(state) {
    const listening = state === MIC.LISTENING;
    this.elements.holdButton.classList.toggle('is-listening', listening);
    // No emoji: the button carries an SVG mic of its own.
    this.elements.holdButton.querySelector('.hold-main').textContent = listening
      ? 'Listening…'
      : 'Hold to Talk';
  }

  _useTypedFallback() {
    if (this.typedFallback) return;
    this.typedFallback = true;
    this.speech.setEnabled(false);
    this.elements.speechControls.hidden = true;
    this.elements.fallbackMessage.hidden = false;
    // The typed box follows the same gate as the hold control: it appears only
    // once the character has finished asking.
    const ready = Boolean(this.current?.answerReady) && !this.current?.resolved;
    this.elements.typedForm.hidden = !ready;
    if (this.active && !this.paused && ready) {
      this.elements.typedAnswer.focus({ preventScroll: true });
    }
  }

  _setAnswerEnabled(enabled) {
    const usable = Boolean(enabled && this.active && !this.paused);
    if (this.typedFallback) {
      this.elements.typedAnswer.disabled = !usable;
      this.elements.typedForm.querySelector('button').disabled = !usable;
    } else {
      this.speech.setEnabled(usable);
    }
  }

  _setFeedback(message, kind = '') {
    const feedback = this.elements.feedback;
    feedback.textContent = message;
    feedback.classList.toggle('is-correct', kind === 'correct');
    feedback.classList.toggle('is-reveal', kind === 'reveal');
  }

  _showTranscript(heard) {
    const show = this.progress.getSettings().showTranscript;
    this.elements.transcript.hidden = !show;
    this.elements.transcript.textContent = show ? `Heard: ${heard || '—'}` : '';
  }

  _clearTranscript() {
    this.elements.transcript.hidden = true;
    this.elements.transcript.textContent = '';
  }

  refreshSettings() {
    const settings = this.progress.getSettings();
    this.audio.setSettings(settings);
    if (!settings.showTranscript) this._clearTranscript();
  }

  _updateProgress() {
    if (!this.session) return;
    const { scoreCorrect, scoreTotal, scorePop, progress } = this.elements;
    const position = Math.min(this.session.roundIndex + 1, SESSION_ROUNDS);
    const scored = this.session.correct > this.shownCorrect;

    // Score reads against the fixed session length: "3 / 12" is a stable score,
    // where a moving denominator would change meaning every round.
    if (scoreCorrect) scoreCorrect.textContent = String(this.session.correct);
    if (scoreTotal) scoreTotal.textContent = String(SESSION_ROUNDS);
    progress.setAttribute('aria-label',
      `Score ${this.session.correct} of ${SESSION_ROUNDS}, round ${position}`);

    if (scored) {
      if (scorePop) scorePop.textContent = '+1';
      // Restart the animation even when it is already running.
      progress.classList.remove('is-scoring');
      void progress.offsetWidth;
      progress.classList.add('is-scoring');
      this.audio.playFeedback('score');
    }
    this.shownCorrect = this.session.correct;
  }

  pause() {
    if (!this.active) return;
    this.paused = true;
    this._clearAdvance();
    this.speech.cancel();
    this.audio.stopCharacter();
    this._setAnswerEnabled(false);
    // Settings is a genuine pause, not part of the run: the time spent there
    // is not the student's, and resuming continues from the same total.
    this._pauseTimer();
  }

  resume() {
    if (!this.active) return;
    this.paused = false;
    this.refreshSettings();
    if (!this.current?.resolved) this._startTimer();
    if (this.current?.resolved) {
      this._nextRound();
      return;
    }
    // Resuming must not hand back the control if the character is still asking.
    const ready = Boolean(this.current?.answerReady) && !this.current?.resolved;
    this._setAnswerEnabled(ready);
    if (this.typedFallback && ready) {
      this.elements.typedAnswer.focus({ preventScroll: true });
    }
  }

  _clearAdvance() {
    clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
  }

  _complete() {
    this._clearAdvance();
    this.active = false;
    this.speech.cancel();
    this.audio.stopCharacter();
    this._setAnswerEnabled(false);
    this._pauseTimer();

    this.session.elapsedMs = this.timer.elapsed();
    this.session.finalScoreMs = this.session.elapsedMs + this.session.penaltyMs;
    // Only a completed run can set a best, and bests never cross difficulties.
    const best = ENABLE_SCORING
      ? this.progress.recordRunScore(this.session.difficulty, this.session.finalScoreMs)
      : { bestMs: null, isNewBest: false };

    const result = {
      levelId: this.session.levelId,
      difficulty: this.session.difficulty,
      correct: this.session.correct,
      firstTry: this.session.firstTry,
      genuineWrong: this.session.genuineWrong,
      elapsedMs: this.session.elapsedMs,
      penaltyMs: this.session.penaltyMs,
      finalScoreMs: this.session.finalScoreMs,
      bestMs: best.bestMs,
      isNewBest: best.isNewBest,
      missed: [...this.session.missed],
      rounds: SESSION_ROUNDS,
      scoringEnabled: ENABLE_SCORING,
    };
    this.onComplete(result);
  }

  stop() {
    this.active = false;
    this.paused = false;
    this._clearAdvance();
    // Abandoning back to the title discards the run: an unfinished run is
    // never a best score.
    this._pauseTimer();
    this.timer.reset();
    this.speech.cancel();
    this.audio.stopCharacter();
    this.elements.stage.classList.remove('is-correct');
    if (this.sceneMount) this.sceneMount.destroy();
    this.sceneMount = null;
    this.current = null;
  }
}
