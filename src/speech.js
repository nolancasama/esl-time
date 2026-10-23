import { createRecognizer, isRecognitionSupported } from '../vendor/esl-stt/esl-stt.mjs';

const MAX_ALTERNATIVES = 5;
const MAX_HOLD_MS = 5000;

export const MIC = {
  IDLE: 'idle',
  LISTENING: 'listening',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
};

export function speechSupported() {
  return isRecognitionSupported();
}

/** One recognition session per physical hold; the mic is closed at every seam. */
export class HoldToTalk {
  constructor(button, { onResult, onLiveResult, onState, onUnavailable, SpeechRecognition } = {}) {
    this.button = button;
    this.onResult = onResult || (() => {});
    this.onLiveResult = onLiveResult || (() => {});
    this.onState = onState || (() => {});
    this.onUnavailable = onUnavailable || (() => {});
    this.enabled = true;
    this.active = false;
    this.pointerId = null;
    this.recognition = null;
    this.SpeechRecognition = SpeechRecognition;
    this.recognitionEnded = false;
    this.startedAt = 0;
    this.alternatives = [];
    this.timeout = null;
    this.finished = false;

    this._pointerDown = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      this.pointerId = event.pointerId;
      try { button.setPointerCapture(event.pointerId); } catch { /* capture is best effort */ }
      this._start();
    };
    this._pointerEnd = (event) => {
      if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
      event.preventDefault();
      this._releaseCapture();
      this._stop();
    };
    this._pointerLeave = (event) => {
      if (this.active && event.pointerType === 'mouse') this._pointerEnd(event);
    };
    this._keyDown = (event) => {
      if (![' ', 'Enter'].includes(event.key) || event.repeat) return;
      event.preventDefault();
      this._start();
    };
    this._keyUp = (event) => {
      if (![' ', 'Enter'].includes(event.key)) return;
      event.preventDefault();
      this._stop();
    };
    this._blockTouch = (event) => event.preventDefault();

    button.addEventListener('pointerdown', this._pointerDown);
    button.addEventListener('pointerup', this._pointerEnd);
    button.addEventListener('pointercancel', this._pointerEnd);
    button.addEventListener('lostpointercapture', this._pointerEnd);
    button.addEventListener('pointerleave', this._pointerLeave);
    button.addEventListener('keydown', this._keyDown);
    button.addEventListener('keyup', this._keyUp);
    button.addEventListener('touchstart', this._blockTouch, { passive: false });
    button.addEventListener('touchmove', this._blockTouch, { passive: false });
    button.addEventListener('contextmenu', this._blockTouch);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.button.disabled = !this.enabled;
    if (!this.enabled) this.cancel();
  }

  // Read-only semantic state for lifecycle/acceptance harnesses. An early
  // native end still counts as listening until the physical hold ends.
  get state() {
    return this.active ? 'listening' : this.recognition?.state ?? 'idle';
  }

  _releaseCapture() {
    if (this.pointerId === null) return;
    const pointerId = this.pointerId;
    this.pointerId = null;
    try {
      if (this.button.hasPointerCapture(pointerId)) this.button.releasePointerCapture(pointerId);
    } catch { /* a cancelled pointer may already have lost capture */ }
  }

  _createRecognition() {
    const receive = (results) => {
      const alternatives = results.map(({ transcript }) => transcript);
      if (!alternatives.length) return;
      this.alternatives = alternatives;
      // Interim hypotheses are offered for judging DURING the hold, so a
      // finished correct answer is accepted the moment the recogniser reports
      // it instead of waiting for the child to let go. Only while the hold is
      // live: once it ends, the final result belongs to onResult.
      // isFinal is passed for information but must not gate acceptance —
      // an interim hypothesis can already be a complete correct answer.
      if (this.active) {
        this.onLiveResult([...alternatives], { isFinal: results.every(result => result.final) });
      }
    };
    return createRecognizer({
      SpeechRecognition: this.SpeechRecognition,
      lang: 'en-US', continuous: false, interimResults: true,
      maxAlternatives: MAX_ALTERNATIVES, timeoutMs: MAX_HOLD_MS,
      onInterim: receive,
      onFinal: receive,
      onError: ({ code, kind }) => {
        this.error = code;
        // Preserve the game's code-specific fallback policy, rather than
        // adopting every unavailable classification or fallbackSuggested.
        if (kind === 'unavailable' && ['not-allowed', 'service-not-allowed'].includes(code)) {
          this._giveUp(MIC.DENIED);
        } else if (code === 'audio-capture') {
          this._giveUp(MIC.ERROR);
        }
      },
      onEnd: ({ alternatives, reason }) => {
        if (reason === 'cancelled' || this.finished) return;
        if (alternatives.length) this.alternatives = alternatives.map(({ transcript }) => transcript);
        // Native recognition may end before release. Keep the physical hold
        // open (including its time limit) until the child lets go.
        this.recognitionEnded = true;
        if (!this.active) this._finish();
      },
    });
  }

  _start() {
    if (!this.enabled || this.active) return;
    if (!isRecognitionSupported({ SpeechRecognition: this.SpeechRecognition })) {
      this._giveUp(MIC.UNSUPPORTED);
      return;
    }

    // A new hold supersedes a previous stop still waiting for its end event.
    this.recognition?.destroy();
    this.recognition = this._createRecognition();
    this.recognitionEnded = false;
    this.active = true;
    this.finished = false;
    this.alternatives = [];
    this.startedAt = performance.now();
    this.error = undefined;
    this.onState(MIC.LISTENING);
    // The adapter caps native recording; this timer also caps a physical hold
    // after the native engine has already ended and cleared its own timer.
    this.timeout = setTimeout(() => {
      this._releaseCapture();
      this._stop();
    }, MAX_HOLD_MS);
    if (!this.recognition.start() && !this.finished) this._giveUp(MIC.ERROR);
  }

  _stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timeout);
    this.timeout = null;
    this.onState(MIC.IDLE);
    if (this.recognitionEnded) this._finish();
    else this.recognition?.stop(); // esl-stt owns the 400 ms end-event grace.
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.active = false;
    clearTimeout(this.timeout);
    this.timeout = null;
    const duration = Math.max(0, performance.now() - this.startedAt);
    this.startedAt = 0;
    this.onState(MIC.IDLE);
    this.recognition?.destroy();
    this.recognition = null;
    this.onResult([...this.alternatives], { duration, error: this.error });
  }

  _giveUp(state) {
    this._releaseCapture();
    this.finished = true;
    this.recognition?.destroy();
    this.active = false;
    this.startedAt = 0;
    clearTimeout(this.timeout);
    this.timeout = null;
    this.recognition = null;
    this.onState(state);
    this.onUnavailable(state);
  }

  cancel() {
    this._releaseCapture();
    this.finished = true;
    this.recognition?.destroy();
    this.active = false;
    this.startedAt = 0;
    clearTimeout(this.timeout);
    this.timeout = null;
    this.recognition = null;
    this.onState(MIC.IDLE);
  }

  dispose() {
    this.cancel();
    const button = this.button;
    button.removeEventListener('pointerdown', this._pointerDown);
    button.removeEventListener('pointerup', this._pointerEnd);
    button.removeEventListener('pointercancel', this._pointerEnd);
    button.removeEventListener('lostpointercapture', this._pointerEnd);
    button.removeEventListener('pointerleave', this._pointerLeave);
    button.removeEventListener('keydown', this._keyDown);
    button.removeEventListener('keyup', this._keyUp);
    button.removeEventListener('touchstart', this._blockTouch);
    button.removeEventListener('touchmove', this._blockTouch);
    button.removeEventListener('contextmenu', this._blockTouch);
  }
}

