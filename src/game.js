import { matchTime, spokenForm } from './time-match.js';
import { levelIdForDifficulty, timeKey } from './data/times.js';
import { createScheduler } from './scheduler.js';
import { mountScene } from './scene.js';
import { HoldToTalk, MIC, speechSupported } from './speech.js';
import { AudioManager } from './audio.js';

export const SESSION_ROUNDS = 12;
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
    this.scheduler = createScheduler({
      levelId: selectedLevel,
      practiceMode: selectedMode,
      progress: this.progress,
    });
    this.session = {
      levelId: selectedLevel,
      practiceMode: selectedMode,
      roundIndex: -1,
      correct: 0,
      firstTry: 0,
      missed: new Set(),
    };
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
    this.audio.playCharacter(this.current.scene);
    this._setFeedback('');
    this._clearTranscript();
    this._setAnswerEnabled(true);
    this._updateProgress();
    if (this.typedFallback) this.elements.typedAnswer.focus({ preventScroll: true });
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

    this.current.genuineWrong += 1;
    this.audio.playFeedback('incorrect');
    const revealAfter = this.progress.getSettings().revealAfter;
    if (this.current.genuineWrong < revealAfter) return;

    this.current.resolved = true;
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
    this.elements.typedForm.hidden = false;
    this.elements.fallbackMessage.hidden = false;
    if (this.active && !this.paused) this.elements.typedAnswer.focus({ preventScroll: true });
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
  }

  resume() {
    if (!this.active) return;
    this.paused = false;
    this.refreshSettings();
    if (this.current?.resolved) {
      this._nextRound();
      return;
    }
    this._setAnswerEnabled(!this.current?.resolved);
    if (this.typedFallback && !this.current?.resolved) {
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
    const result = {
      levelId: this.session.levelId,
      correct: this.session.correct,
      firstTry: this.session.firstTry,
      missed: [...this.session.missed],
      rounds: SESSION_ROUNDS,
    };
    this.onComplete(result);
  }

  stop() {
    this.active = false;
    this.paused = false;
    this._clearAdvance();
    this.speech.cancel();
    this.audio.stopCharacter();
    this.elements.stage.classList.remove('is-correct');
    if (this.sceneMount) this.sceneMount.destroy();
    this.sceneMount = null;
    this.current = null;
  }
}
