/**
 * The optional 60-second digital speed challenge.
 *
 * A second, deliberately different activity that unlocks only once the twelve
 * illustrated analog scenes are finished. The analog round is a conversation:
 * a character asks, the student reads a painted clock and answers. This one is
 * pure production practice - see a digital time, say it, next - so it drops the
 * artwork, the character voices and the reveal, and adds the only time pressure
 * in the game.
 *
 * It reuses the analog round's speech stack unchanged (hold to talk, live
 * interim judging, the same matcher and the same "it's" grammar rule); nothing
 * about how an answer is judged differs between the two modes.
 */

import { matchTime } from './time-match.js';
import { SpeedTimeSource, formatDigitalTime } from './data/speed-times.js';
import { renderDigitalClock } from './digital-clock.js';
import { HoldToTalk, MIC, speechSupported } from './speech.js';
import { AudioManager } from './audio.js';

export const SPEED_DURATION_MS = 60000;

const TICK_MS = 100;
// Fast enough to keep the see/speak/next rhythm, slow enough that the tick and
// the new time are not the same frame.
const NEXT_DELAY_MS = 220;
const INTRO_STEP_MS = 620;
const STREAK_HOLD_MS = 950;
const ACCIDENTAL_TAP_MS = 300;
const LOW_TIME_SECONDS = 10;

/** Milestones worth a small celebration. Streaks never multiply the score. */
function isStreakMilestone(streak) {
  return streak === 3 || streak === 5 || (streak >= 10 && streak % 5 === 0);
}

export class SpeedRound {
  constructor({ elements, progress, onComplete }) {
    this.elements = elements;
    this.progress = progress;
    this.onComplete = onComplete || (() => {});
    this.audio = new AudioManager(progress.getSettings());
    this.source = new SpeedTimeSource();

    this.active = false;
    this.finished = true;
    this.expired = false;
    this.finishing = false;
    this.attemptOpen = false;
    this.resolving = false;
    this.typedFallback = false;
    this.target = null;
    this.state = null;
    this.deadline = 0;
    this.tick = null;
    this.nextTimer = null;
    this.introTimer = null;
    this.streakTimer = null;

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
      this.attemptOpen = false;
      this._judge([answer], { duration: null });
    });

    if (!speechSupported()) this._useTypedFallback();
  }

  start() {
    this.stop();
    this.audio.setSettings(this.progress.getSettings());
    this.source.reset();
    this.state = { correct: 0, mistakes: 0, streak: 0, bestStreak: 0 };
    this.active = true;
    this.finished = false;
    this.expired = false;
    this.finishing = false;
    this.resolving = false;
    this.attemptOpen = false;
    this.target = null;

    this._renderScore(false);
    this._renderCountdown(SPEED_DURATION_MS);
    this._setFeedback('');
    this._hideStreak();
    this.elements.clock.replaceChildren();
    this.elements.answer.hidden = true;
    this._setAnswerEnabled(false);
    this._runIntro();
  }

  /**
   * Three beats and go. The student already learned the interaction in the
   * analog round, so there is nothing here to read a second time.
   */
  _runIntro() {
    const steps = ['3', '2', '1', 'START!'];
    const overlay = this.elements.intro;
    const counter = this.elements.introCount;
    overlay.hidden = false;
    let index = 0;

    const step = () => {
      if (!this.active) return;
      if (index >= steps.length) {
        overlay.hidden = true;
        this._begin();
        return;
      }
      counter.textContent = steps[index];
      counter.classList.remove('is-beat');
      void counter.offsetWidth;
      counter.classList.add('is-beat');
      index += 1;
      this.introTimer = setTimeout(step, INTRO_STEP_MS);
    };
    step();
  }

  _begin() {
    // The countdown is anchored to a deadline rather than counted down a tick
    // at a time, so a stalled or throttled tab cannot buy extra seconds.
    this.deadline = performance.now() + SPEED_DURATION_MS;
    this.elements.answer.hidden = false;
    this.tick = setInterval(() => this._onTick(), TICK_MS);
    this._nextTarget();
  }

  _onTick() {
    const remaining = Math.max(0, this.deadline - performance.now());
    this._renderCountdown(remaining);
    if (remaining > 0) return;

    if (!this.expired) {
      this.expired = true;
      // An attempt already under way is never cut off: the student finishes
      // speaking, and a correct answer still scores. Only a NEW attempt is
      // refused after zero.
      if (this.attemptOpen) return;
      this._finish();
      return;
    }
    if (!this.attemptOpen && !this.finishing) this._finish();
  }

  _nextTarget() {
    this.nextTimer = null;
    if (!this.active || this.expired) return;
    this.resolving = false;
    this.target = this.source.next(this.state.correct);
    this.elements.clock.replaceChildren(renderDigitalClock(this.target));
    this.elements.clock.setAttribute('aria-label',
      'Say the time: ' + formatDigitalTime(this.target));
    this.elements.clock.classList.remove('is-changed');
    void this.elements.clock.offsetWidth;
    this.elements.clock.classList.add('is-changed');
    this._setFeedback('');
    this._setAnswerEnabled(true);
  }

  /**
   * Judge a hypothesis heard while the button is STILL held. Success only, for
   * the same reason as the analog round: an interim transcript is usually just
   * an unfinished sentence, so anything short of a complete match keeps
   * listening. This is what makes the round feel fast.
   */
  _judgeLive(transcripts) {
    if (!this.active || this.resolving || !this.target) return;
    if (matchTime(this.target, transcripts).reason !== 'match') return;
    this._resolveCorrect();
  }

  _judge(transcripts, { duration = null } = {}) {
    this.attemptOpen = false;
    if (!this.active) return;
    // A live hypothesis already carried this attempt; the release must not
    // judge the same speech a second time.
    if (this.resolving || !this.target) {
      if (this.expired && !this.finishing) this._afterAttempt(false);
      return;
    }

    // Very short holds are motor slips, not evidence that the child was wrong.
    const alternatives = duration !== null && duration < ACCIDENTAL_TAP_MS ? [] : transcripts;
    const result = matchTime(this.target, alternatives);
    if (result.reason === 'match') {
      this._resolveCorrect();
      return;
    }

    // A mistake costs time, which is punishment enough: the score never falls
    // and the same time stays on the display for another go.
    if (result.reason === 'wrong-time' || result.reason === 'bad-grammar') {
      this.state.mistakes += 1;
      this.state.streak = 0;
      this.audio.playFeedback('incorrect');
    }
    this._setFeedback('もういちど！');
    this._afterAttempt(false);
  }

  _resolveCorrect() {
    this.resolving = true;
    this.attemptOpen = false;
    this.state.correct += 1;
    this.state.streak += 1;
    this.state.bestStreak = Math.max(this.state.bestStreak, this.state.streak);
    // Also stops recognition: disabling the control cancels the open session,
    // which is what stops a late final result from being judged again.
    this._setAnswerEnabled(false);
    this._setFeedback('✓', 'correct');
    this._renderScore(true);
    this.audio.playFeedback('correct');
    if (isStreakMilestone(this.state.streak)) this._celebrateStreak(this.state.streak);
    this._afterAttempt(true);
  }

  _afterAttempt(correct) {
    if (this.expired) {
      // Time ran out mid-attempt. That attempt counted; nothing new may start.
      this.finishing = true;
      this._setAnswerEnabled(false);
      clearTimeout(this.nextTimer);
      this.nextTimer = setTimeout(() => this._finish(), correct ? 520 : 620);
      return;
    }
    if (!correct) {
      this._setAnswerEnabled(true);
      return;
    }
    this.nextTimer = setTimeout(() => this._nextTarget(), NEXT_DELAY_MS);
  }

  _celebrateStreak(streak) {
    const banner = this.elements.streak;
    if (!banner) return;
    banner.textContent = streak + 'れんぞく！';
    banner.hidden = false;
    banner.classList.remove('is-shown');
    void banner.offsetWidth;
    banner.classList.add('is-shown');
    this.audio.playFeedback('score');
    clearTimeout(this.streakTimer);
    this.streakTimer = setTimeout(() => this._hideStreak(), STREAK_HOLD_MS);
  }

  _hideStreak() {
    const banner = this.elements.streak;
    if (!banner) return;
    banner.classList.remove('is-shown');
    banner.hidden = true;
    this.streakTimer = null;
  }

  _renderCountdown(remainingMs) {
    const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
    this.elements.countdown.textContent = String(seconds);
    const chip = this.elements.countdownChip;
    if (!chip) return;
    chip.classList.toggle('is-low', seconds > 0 && seconds <= LOW_TIME_SECONDS);
    chip.classList.toggle('is-out', seconds === 0);
  }

  _renderScore(bumped) {
    this.elements.score.textContent = String(this.state ? this.state.correct : 0);
    const chip = this.elements.scoreChip;
    if (!chip) return;
    chip.classList.remove('is-scoring');
    if (!bumped) return;
    if (this.elements.scorePop) this.elements.scorePop.textContent = '+1';
    // Restart the animation even when it is already running.
    void chip.offsetWidth;
    chip.classList.add('is-scoring');
  }

  _setFeedback(message, kind = '') {
    const feedback = this.elements.feedback;
    feedback.textContent = message;
    feedback.lang = 'ja';
    feedback.classList.toggle('is-correct', kind === 'correct');
  }

  _showMicState(state) {
    const listening = state === MIC.LISTENING;
    if (listening) this.attemptOpen = true;
    this.elements.holdButton.classList.toggle('is-listening', listening);
    this.elements.holdButton.querySelector('.hold-main').textContent = listening
      ? 'Listening…'
      : 'Hold to Talk';
  }

  _useTypedFallback() {
    if (this.typedFallback) return;
    this.typedFallback = true;
    this.speech.setEnabled(false);
    this.elements.speechControls.hidden = true;
    this.elements.typedForm.hidden = false;
    this._setAnswerEnabled(Boolean(this.active && this.target && !this.resolving));
  }

  _setAnswerEnabled(enabled) {
    const usable = Boolean(enabled && this.active && !this.expired);
    if (this.typedFallback) {
      this.elements.typedAnswer.disabled = !usable;
      this.elements.typedForm.querySelector('button').disabled = !usable;
      if (usable) this.elements.typedAnswer.focus({ preventScroll: true });
    } else {
      this.speech.setEnabled(usable);
    }
  }

  _clearTimers() {
    clearInterval(this.tick);
    clearTimeout(this.nextTimer);
    clearTimeout(this.introTimer);
    clearTimeout(this.streakTimer);
    this.tick = null;
    this.nextTimer = null;
    this.introTimer = null;
    this.streakTimer = null;
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    this.finishing = false;
    this._clearTimers();
    this.speech.cancel();
    this.speech.setEnabled(false);
    this._renderCountdown(0);
    this._hideStreak();

    const best = this.progress.recordSpeedScore(this.state.correct);
    this.onComplete({
      correct: this.state.correct,
      mistakes: this.state.mistakes,
      bestStreak: this.state.bestStreak,
      bestScore: best.best,
      isNewBest: best.isNewBest,
      durationMs: SPEED_DURATION_MS,
    });
  }

  /** Leave the mode. Nothing may keep running once the screen is gone. */
  stop() {
    this.active = false;
    this.finished = true;
    this.expired = false;
    this.finishing = false;
    this.attemptOpen = false;
    this.resolving = false;
    this.target = null;
    this._clearTimers();
    this.speech.cancel();
    this.speech.setEnabled(false);
    this.audio.stopCharacter();
    if (this.elements.intro) this.elements.intro.hidden = true;
    this._hideStreak();
  }
}

export default SpeedRound;
