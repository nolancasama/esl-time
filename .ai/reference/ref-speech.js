/**
 * Continuous speech recognition wrapper.
 *
 * The classroom experience is meant to be word -> speak -> word -> speak, with
 * no button press between words. That means recognition has to stay alive for
 * the whole session, which the Web Speech API does not really do on its own.
 *
 * What this module absorbs:
 *   - Chrome ends recognition on its own after silence; we restart it.
 *   - Restart storms. A failed start can fire onend immediately, so restarts
 *     are debounced and backed off.
 *   - `aborted` fires both when we stop deliberately and when the engine dies;
 *     an intent flag tells them apart.
 *   - Chrome's recogniser is server-side, so a flaky school network surfaces as
 *     `network` errors. After repeated failures we hand over to the fallback.
 *   - Pronunciation playback must not be transcribed as the child's answer,
 *     so callers can pause listening around it.
 *
 * Interim results are evaluated as well as final ones. For single short words
 * the interim hypothesis usually arrives several hundred milliseconds earlier,
 * and that difference is the gap between "instant" and "laggy" to a child.
 */

const MAX_ALTERNATIVES = 5;
const RESTART_DELAY_MS = 160;
const NETWORK_FAILURE_LIMIT = 4;

export const MIC = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PAUSED: 'paused',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  ERROR: 'error',
};

export function speechSupported() {
  return typeof window !== 'undefined'
    && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export class Listener {
  /**
   * @param {object} handlers
   * @param {(transcripts: string[], isFinal: boolean) => void} handlers.onResult
   * @param {(state: string, detail?: any) => void} handlers.onState
   * @param {(reason: string) => void} handlers.onGiveUp  recognition is unusable
   */
  constructor({ onResult, onState, onGiveUp } = {}) {
    this.onResult = onResult || (() => {});
    this.onState = onState || (() => {});
    this.onGiveUp = onGiveUp || (() => {});

    this.rec = null;
    this.state = MIC.IDLE;
    this.wantRunning = false;    // caller wants the mic live
    this.paused = false;         // temporarily suspended (pronunciation)
    this.stopping = false;       // a stop() we initiated
    this.running = false;        // engine reports itself started
    this._restartTimer = null;
    this._networkFailures = 0;
    this._lastEvaluated = '';
  }

  _setState(s, detail) {
    if (this.state === s) return;
    this.state = s;
    this.onState(s, detail);
  }

  _create() {
    const Impl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Impl) return null;

    const rec = new Impl();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = MAX_ALTERNATIVES;

    rec.onstart = () => {
      this.running = true;
      this._networkFailures = 0;
      if (!this.paused) this._setState(MIC.LISTENING);
    };

    rec.onresult = (event) => {
      // Collect every hypothesis from the newest result, primary first.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcripts = [];
        for (let a = 0; a < result.length; a++) {
          const t = result[a]?.transcript;
          if (t) transcripts.push(t);
        }
        if (!transcripts.length) continue;

        // Interim hypotheses repeat as they firm up; only act on changes.
        const key = (result.isFinal ? 'F:' : 'I:') + transcripts.join('|');
        if (!result.isFinal && key === this._lastEvaluated) continue;
        this._lastEvaluated = key;

        this.onResult(transcripts, result.isFinal);
      }
    };

    rec.onerror = (event) => {
      const err = event?.error;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.wantRunning = false;
        this._setState(MIC.DENIED);
        this.onGiveUp('denied');
        return;
      }
      if (err === 'network') {
        this._networkFailures += 1;
        if (this._networkFailures >= NETWORK_FAILURE_LIMIT) {
          this.wantRunning = false;
          this._setState(MIC.ERROR, 'network');
          this.onGiveUp('network');
        }
        return;
      }
      // 'no-speech' and 'aborted' are normal in continuous use; onend restarts.
    };

    rec.onend = () => {
      this.running = false;
      if (this.stopping) {
        this.stopping = false;
        this._setState(this.paused ? MIC.PAUSED : MIC.IDLE);
        return;
      }
      if (this.wantRunning && !this.paused) this._scheduleRestart();
      else this._setState(this.paused ? MIC.PAUSED : MIC.IDLE);
    };

    return rec;
  }

  _scheduleRestart() {
    if (this._restartTimer) return;
    // Back off as failures accumulate so we never spin.
    const delay = RESTART_DELAY_MS * (1 + this._networkFailures);
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      this._rawStart();
    }, delay);
  }

  _rawStart() {
    if (!this.rec || this.running || !this.wantRunning || this.paused) return;
    try {
      this.rec.start();
    } catch {
      // InvalidStateError means it is already running; anything else retries.
      if (this.wantRunning) this._scheduleRestart();
    }
  }

  /** Begin listening. Safe to call repeatedly. */
  start() {
    if (!speechSupported()) {
      this._setState(MIC.UNSUPPORTED);
      this.onGiveUp('unsupported');
      return;
    }
    if (!this.rec) this.rec = this._create();
    if (!this.rec) {
      this._setState(MIC.UNSUPPORTED);
      this.onGiveUp('unsupported');
      return;
    }
    this.wantRunning = true;
    this.paused = false;
    this._rawStart();
  }

  /** Stop listening entirely. */
  stop() {
    this.wantRunning = false;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    if (this.rec && this.running) {
      this.stopping = true;
      try { this.rec.stop(); } catch { /* ignore */ }
    } else {
      this._setState(MIC.IDLE);
    }
  }

  /**
   * Suspend around audio playback so the game does not transcribe itself.
   * Kept separate from stop() because the caller still wants the mic afterwards.
   */
  pause() {
    if (this.paused) return;
    this.paused = true;
    this._setState(MIC.PAUSED);
    if (this.rec && this.running) {
      this.stopping = true;
      try { this.rec.stop(); } catch { /* ignore */ }
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this._lastEvaluated = '';
    if (this.wantRunning) this._rawStart();
  }

  /** Forget interim history — call when the target word changes. */
  resetHypotheses() {
    this._lastEvaluated = '';
  }

  dispose() {
    this.wantRunning = false;
    if (this._restartTimer) clearTimeout(this._restartTimer);
    if (this.rec) {
      this.rec.onresult = null;
      this.rec.onend = null;
      this.rec.onerror = null;
      this.rec.onstart = null;
      try { this.rec.abort(); } catch { /* ignore */ }
    }
    this.rec = null;
  }
}
