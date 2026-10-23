import assert from 'node:assert/strict';
import { HoldToTalk, MIC, speechSupported } from '../src/speech.js';

// A deterministic clock verifies both the adapter's timers and the hold timer
// without waiting five seconds or hiding leaked timers behind process exit.
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
let now = 0, timerId = 0;
const timers = new Map();
globalThis.setTimeout = (fn, delay) => {
  const id = ++timerId;
  timers.set(id, { fn, at: now + delay });
  return id;
};
globalThis.clearTimeout = id => timers.delete(id);
function advance(ms) {
  const until = now + ms;
  for (;;) {
    const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at;
    timers.delete(next[0]);
    next[1].fn();
  }
  now = until;
}
class Button {
  listeners = new Map();
  captured = null;
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type, fn) {
    if (this.listeners.has(type)) assert.equal(this.listeners.get(type), fn);
    this.listeners.delete(type);
  }
  setPointerCapture(id) { this.captured = id; }
  hasPointerCapture(id) { return this.captured === id; }
  releasePointerCapture() { this.captured = null; }
  emit(type, values = {}) {
    this.listeners.get(type)?.({ preventDefault() {}, pointerId: 1, button: 0, ...values });
  }
}
class FakeRecognition {
  static latest;
  constructor() { FakeRecognition.latest = this; }
  start() { this.onstart?.(); }
  stop() { this.stops = (this.stops || 0) + 1; }
  abort() { this.aborts = (this.aborts || 0) + 1; this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  result(transcripts, final = false) {
    const result = transcripts.map(transcript => ({ transcript }));
    result.isFinal = final;
    this.onresult?.({ results: [result], resultIndex: 0 });
  }
}
function setup(Implementation = FakeRecognition) {
  const button = new Button(), live = [], results = [], states = [], unavailable = [];
  const hold = new HoldToTalk(button, {
    SpeechRecognition: Implementation,
    onLiveResult: (...args) => live.push(args), onResult: (...args) => results.push(args),
    onState: value => states.push(value), onUnavailable: value => unavailable.push(value),
  });
  button.emit('pointerdown');
  return { button, hold, live, results, states, unavailable, native: FakeRecognition.latest };
}
function detached(native) {
  for (const key of Object.keys(native).filter(key => key.startsWith('on'))) assert.equal(native[key], null, key);
  assert.equal(timers.size, 0, 'no timers leaked');
}
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS: ${name}`); }
try {
  check('ranked interim and final hypotheses are live; completion waits for release', () => {
    const s = setup();
    assert.equal(s.native.lang, 'en-US');
    assert.equal(s.native.maxAlternatives, 5);
    assert.equal(s.native.interimResults, true);
    assert.equal(s.native.continuous, false);
    const ranked = ["it's seven fifteen o'clock", "it's seven fifteen", "it's seven fifty"];
    s.native.result(ranked);
    assert.deepEqual(s.live[0], [ranked, { isFinal: false }]);
    s.native.result(ranked, true);
    assert.deepEqual(s.live[1], [ranked, { isFinal: true }]);
    s.native.onend();
    assert.equal(s.hold.state, 'listening');
    assert.equal(s.results.length, 0);
    s.button.emit('pointerup');
    assert.deepEqual(s.results[0][0], ranked);
    assert.equal(s.results.length, 1);
    assert.equal(s.button.captured, null);
    assert.equal(s.hold.state, 'idle');
    detached(s.native);
    s.hold.dispose();
  });
  check('release permits late final results and completes once', () => {
    const s = setup();
    s.native.result(['interim']);
    s.button.emit('pointerup');
    assert.equal(s.native.stops, 1);
    assert.equal(s.hold.state, 'stopping');
    s.native.result(['final', 'second'], true);
    assert.equal(s.live.length, 1);
    s.native.onend();
    advance(400);
    assert.deepEqual(s.results.map(args => args[0]), [['final', 'second']]);
    detached(s.native);
    s.hold.dispose();
  });
  check('five-second cap stops and retains speech even without an end event', () => {
    const s = setup();
    s.native.result(['heard', 'runner up']);
    advance(4999);
    assert.equal(s.native.stops, undefined);
    advance(1);
    assert.equal(s.native.stops, 1);
    assert.equal(s.hold.active, false);
    assert.equal(s.button.captured, null);
    advance(400);
    assert.deepEqual(s.results.map(args => args[0]), [['heard', 'runner up']]);
    detached(s.native);
    s.hold.dispose();
  });
  check('early native end still has a five-second physical hold cap', () => {
    const s = setup();
    s.native.result(['heard']);
    s.native.onend();
    advance(5000);
    assert.equal(s.results.length, 1);
    assert.equal(s.hold.active, false);
    detached(s.native);
    s.hold.dispose();
  });
  check('cancel, disable and dispose discard speech and detach handlers/timers', () => {
    for (const action of ['cancel', 'disable', 'dispose']) {
      const s = setup();
      s.native.result(['pending']);
      const lateResult = s.native.onresult, lateEnd = s.native.onend;
      if (action === 'disable') s.hold.setEnabled(false);
      else s.hold[action]();
      lateResult({ results: [] }); lateEnd();
      advance(6000);
      assert.equal(s.results.length, 0);
      assert.equal(s.live.length, 1);
      assert.equal(s.button.captured, null);
      detached(s.native);
      s.hold.dispose();
      assert.equal(s.button.listeners.size, 0);
    }
  });
  check('permission, hardware and start failures preserve fallback states', () => {
    for (const [code, state] of [['not-allowed', MIC.DENIED], ['service-not-allowed', MIC.DENIED], ['audio-capture', MIC.ERROR]]) {
      const s = setup();
      s.native.onerror({ error: code });
      assert.deepEqual(s.unavailable, [state]);
      assert.equal(s.states.at(-1), state);
      assert.equal(s.results.length, 0);
      detached(s.native);
      s.hold.dispose();
    }
    class Failing extends FakeRecognition { start() { throw new Error('start failed'); } }
    const s = setup(Failing);
    assert.deepEqual(s.unavailable, [MIC.ERROR]);
    detached(s.native);
    s.hold.dispose();
  });
  check('silence and other errors retry on release without new fallback conditions', () => {
    for (const code of ['no-speech', 'aborted', 'network', 'start-failed', 'bad-grammar', 'language-not-supported', 'unsupported', 'unknown']) {
      const s = setup();
      s.native.onerror({ error: code });
      assert.equal(s.results.length, 0);
      assert.equal(s.hold.active, true);
      s.button.emit('pointerup');
      assert.deepEqual(s.results[0][0], []);
      assert.equal(s.results[0][1].error, code);
      assert.deepEqual(s.unavailable, []);
      detached(s.native);
      s.hold.dispose();
    }
    const s = setup();
    for (let index = 0; index < 3; index++) {
      if (index) s.button.emit('pointerdown');
      FakeRecognition.latest.onend();
      s.button.emit('pointerup');
    }
    assert.equal(s.results.length, 3);
    assert.deepEqual(s.unavailable, []);
    s.hold.dispose();
    assert.equal(timers.size, 0);
  });
  check('keyboard, pointer cancellation, lost capture and mouse leave finish holds', () => {
    for (const event of ['pointercancel', 'lostpointercapture', 'pointerleave', 'keyup']) {
      const s = setup();
      s.hold.cancel();
      s.button.emit('keydown', { key: 'Enter' });
      const native = FakeRecognition.latest;
      native.result(['keyboard']);
      s.button.emit(event, { key: 'Enter', pointerType: 'mouse' });
      advance(400);
      assert.deepEqual(s.results.map(args => args[0]), [['keyboard']]);
      detached(native);
      s.hold.dispose();
    }
  });
  check('unsupported constructor uses existing unavailable route', () => {
    assert.equal(speechSupported(), false);
    const s = setup(null);
    assert.deepEqual(s.unavailable, [MIC.UNSUPPORTED]);
    assert.equal(s.results.length, 0);
    s.hold.dispose();
    assert.equal(timers.size, 0);
  });
} finally {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}
console.log(`${checks} HoldToTalk checks passed.`);
