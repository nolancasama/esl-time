/**
 * Optional character playback and short, synthesised feedback cues.
 * Audio is enhancement only: unavailable APIs and failed assets stay silent.
 */

function enabledFrom(value, settingName) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && settingName in value) {
    return value[settingName] !== false;
  }
  return true;
}

export class AudioManager {
  constructor(settings = {}) {
    this.settings = settings;
    this.character = null;
    this.context = null;
  }

  setSettings(settings = {}) {
    this.settings = settings;
  }

  stopCharacter() {
    if (!this.character) return;
    try {
      this.character.pause();
      this.character.currentTime = 0;
    } catch {
      // A disappearing or partially loaded asset should never affect the round.
    }
    this.character = null;
  }

  /**
   * Start a scene voice. `onDone` fires exactly once when the clip finishes OR
   * when it cannot play at all — a missing file, a blocked autoplay or a
   * disabled setting must never leave the caller waiting forever, because the
   * answer control is revealed by this callback.
   */
  playCharacter(sceneOrVoice, enabled = this.settings, onDone = null) {
    this.stopCharacter();
    const finish = typeof onDone === 'function' ? onDone : () => {};
    let settled = false;
    const settle = (played) => {
      if (settled) return;
      settled = true;
      finish(played);
    };

    if (!enabledFrom(enabled, 'characterAudio')) {
      settle(false);
      return false;
    }

    const voice = sceneOrVoice?.voice ?? sceneOrVoice;
    const src = typeof voice === 'string' ? voice : voice?.src;
    const AudioElement = globalThis.Audio;
    if (!src || typeof AudioElement !== 'function') {
      settle(false);
      return false;
    }

    try {
      const audio = new AudioElement(src);
      this.character = audio;
      const release = () => {
        if (this.character === audio) this.character = null;
      };
      audio.addEventListener('ended', () => { release(); settle(true); }, { once: true });
      audio.addEventListener('error', () => { release(); settle(false); }, { once: true });

      const playResult = audio.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(() => { release(); settle(false); });
      }
      return true;
    } catch {
      this.character = null;
      settle(false);
      return false;
    }
  }

  /** True while a scene voice is actively playing. */
  get characterPlaying() {
    return Boolean(this.character) && !this.character.paused && !this.character.ended;
  }

  playFeedback(kind, enabled = this.settings) {
    if (!enabledFrom(enabled, 'feedbackSounds')) return false;
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioContext !== 'function') return false;

    try {
      if (!this.context) this.context = new AudioContext();
      const play = () => this._scheduleFeedback(kind);

      // Browsers often suspend WebAudio until a gesture. Resume asynchronously
      // and absorb rejection so feedback can never hold up game progression.
      if (this.context.state === 'suspended') {
        const resumed = this.context.resume();
        if (resumed && typeof resumed.then === 'function') {
          resumed.then(play).catch(() => {});
        } else {
          play();
        }
      } else {
        play();
      }
      return true;
    } catch {
      return false;
    }
  }

  _scheduleFeedback(kind) {
    try {
      const now = this.context.currentTime;
      if (kind === 'correct') {
        this._tone(523.25, now, 0.10, 0.055);
        this._tone(659.25, now + 0.09, 0.14, 0.05);
      } else if (kind === 'score') {
        // A brighter arpeggio than 'correct', for the score ticking up: C-E-G-C
        // climbing an octave so it reads as a reward rather than a repeat.
        this._tone(523.25, now, 0.07, 0.038);
        this._tone(659.25, now + 0.055, 0.07, 0.038);
        this._tone(783.99, now + 0.11, 0.09, 0.04);
        this._tone(1046.5, now + 0.175, 0.20, 0.045);
      } else {
        this._tone(220, now, 0.16, 0.035, 'triangle');
      }
    } catch {
      // Feedback is deliberately best-effort.
    }
  }

  _tone(frequency, start, duration, volume, type = 'sine') {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }
}

const sharedAudio = new AudioManager();

export function playCharacterAudio(sceneOrVoice, settings) {
  return sharedAudio.playCharacter(sceneOrVoice, settings);
}

export function stopCharacterAudio() {
  sharedAudio.stopCharacter();
}

export function playFeedbackSound(kind, settings) {
  return sharedAudio.playFeedback(kind, settings);
}

export default sharedAudio;
