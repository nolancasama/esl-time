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
  return typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** One recognition session per physical hold; the mic is closed at every seam. */
export class HoldToTalk {
  constructor(button, { onResult, onLiveResult, onState, onUnavailable } = {}) {
    this.button = button;
    this.onResult = onResult || (() => {});
    this.onLiveResult = onLiveResult || (() => {});
    this.onState = onState || (() => {});
    this.onUnavailable = onUnavailable || (() => {});
    this.enabled = true;
    this.active = false;
    this.pointerId = null;
    this.recognition = null;
    this.startedAt = 0;
    this.alternatives = [];
    this.timeout = null;
    this.finishTimer = null;
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

  _releaseCapture() {
    if (this.pointerId === null) return;
    const pointerId = this.pointerId;
    this.pointerId = null;
    try {
      if (this.button.hasPointerCapture(pointerId)) this.button.releasePointerCapture(pointerId);
    } catch { /* a cancelled pointer may already have lost capture */ }
  }

  _createRecognition() {
    const Implementation = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Implementation) return null;
    const recognition = new Implementation();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = MAX_ALTERNATIVES;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const alternatives = [];
      for (let index = 0; index < Math.min(result.length, MAX_ALTERNATIVES); index += 1) {
        const transcript = result[index]?.transcript;
        if (transcript) alternatives.push(transcript);
      }
      if (!alternatives.length) return;
      this.alternatives = alternatives;
      // Interim hypotheses are offered for judging DURING the hold, so a
      // finished correct answer is accepted the moment the recogniser reports
      // it instead of waiting for the child to let go. Only while the hold is
      // live: once it ends, the final result belongs to onResult.
      // isFinal is passed for information but must not gate acceptance —
      // an interim hypothesis can already be a complete correct answer.
      if (this.active) {
        this.onLiveResult([...alternatives], { isFinal: Boolean(result.isFinal) });
      }
    };
    recognition.onerror = (event) => {
      const reason = event?.error;
      if (reason === 'not-allowed' || reason === 'service-not-allowed') {
        this._giveUp(MIC.DENIED);
      } else if (reason === 'audio-capture') {
        this._giveUp(MIC.ERROR);
      }
    };
    // Some engines end after producing a final hypothesis even while the key
    // or finger remains down. Keep the answer pending until the hold ends.
    recognition.onend = () => {
      if (!this.active) this._finish();
    };
    return recognition;
  }

  _start() {
    if (!this.enabled || this.active) return;
    if (!speechSupported()) {
      this._giveUp(MIC.UNSUPPORTED);
      return;
    }

    this.recognition = this._createRecognition();
    if (!this.recognition) {
      this._giveUp(MIC.UNSUPPORTED);
      return;
    }

    this.active = true;
    this.finished = false;
    this.alternatives = [];
    this.startedAt = performance.now();
    this.onState(MIC.LISTENING);
    this.timeout = setTimeout(() => {
      this._releaseCapture();
      this._stop();
    }, MAX_HOLD_MS);
    try {
      this.recognition.start();
    } catch {
      this._giveUp(MIC.ERROR);
    }
  }

  _stop() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timeout);
    this.timeout = null;
    this.onState(MIC.IDLE);
    try { this.recognition?.stop(); } catch { this._finish(); }
    // Some implementations never deliver onend after a gesture cancellation.
    this.finishTimer = setTimeout(() => this._finish(), 400);
  }

  _finish() {
    if (this.finished || !this.startedAt) return;
    this.finished = true;
    this.active = false;
    clearTimeout(this.timeout);
    clearTimeout(this.finishTimer);
    this.timeout = null;
    this.finishTimer = null;
    const duration = Math.max(0, performance.now() - this.startedAt);
    this.startedAt = 0;
    this.onState(MIC.IDLE);
    this.onResult([...this.alternatives], { duration });
    this.recognition = null;
  }

  _giveUp(state) {
    this._releaseCapture();
    if (this.recognition) {
      this.recognition.onend = null;
      try { this.recognition.abort(); } catch { /* already closed */ }
    }
    this.active = false;
    this.startedAt = 0;
    clearTimeout(this.timeout);
    clearTimeout(this.finishTimer);
    this.timeout = null;
    this.finishTimer = null;
    this.recognition = null;
    this.onState(state);
    this.onUnavailable(state);
  }

  cancel() {
    this._releaseCapture();
    if (this.recognition) {
      this.recognition.onend = null;
      try { this.recognition.abort(); } catch { /* already closed */ }
    }
    this.active = false;
    this.finished = true;
    this.startedAt = 0;
    clearTimeout(this.timeout);
    clearTimeout(this.finishTimer);
    this.timeout = null;
    this.finishTimer = null;
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
