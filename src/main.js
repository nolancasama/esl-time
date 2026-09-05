import { allDifficulties, levelIdForDifficulty, timeKey } from './data/times.js';
import { Progress } from './progress.js';
import { TimeGame, ENABLE_SCORING } from './game.js';
import { SpeedRound } from './speed-round.js';

const progress = new Progress();
const screens = [...document.querySelectorAll('.screen')];
const difficultyChoices = document.querySelector('#difficulty-choices');
let returnScreen = 'screen-title';
let lastSummary = null;

function showScreen(id) {
  for (const screen of screens) screen.classList.toggle('is-visible', screen.id === id);
}

function startGame() {
  const { difficulty } = progress.getSettings();
  showScreen('screen-game');
  game.start({ levelId: levelIdForDifficulty(difficulty) });
}

function buildDifficultyChoices() {
  difficultyChoices.replaceChildren();
  for (const difficulty of allDifficulties()) {
    const button = document.createElement('button');
    button.className = 'difficulty-choice';
    button.type = 'button';
    button.role = 'radio';
    button.dataset.difficulty = difficulty.id;
    // The filled dot carries the selection, not colour alone, so it stays
    // obvious on a washed-out classroom projector.
    button.innerHTML = `
      <span class="difficulty-dot" aria-hidden="true"></span>
      <span class="difficulty-text">
        <span class="difficulty-ja" lang="ja"></span>
        <span class="difficulty-en"></span>
      </span>
    `;
    button.querySelector('.difficulty-ja').textContent = difficulty.ja;
    // Japanese first, with the English kept for the teacher.
    button.querySelector('.difficulty-en').textContent = `${difficulty.blurbJa} · ${difficulty.en}`;
    button.addEventListener('click', () => {
      // Choosing a difficulty never starts a round; the child presses スタート.
      progress.updateSettings({ difficulty: difficulty.id });
      renderSettings();
    });
    difficultyChoices.append(button);
  }
}

const REDUCED_MOTION = globalThis.matchMedia
  ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

/**
 * Run a number up to its final value. Short on purpose: this is a beat of
 * arrival, not a scoreboard tally, so it lands inside half a second and skips
 * entirely when the browser asks for reduced motion.
 */
function countUp(element, total, duration = 460) {
  if (!element) return;
  if (REDUCED_MOTION.matches || total <= 0) {
    element.textContent = String(total);
    return;
  }
  const startedAt = performance.now();
  const step = (now) => {
    const progressed = Math.min(1, (now - startedAt) / duration);
    // Ease out, so the count arrives rather than stopping dead.
    element.textContent = String(Math.round(total * (1 - (1 - progressed) ** 3)));
    if (progressed < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * The completion screen says three things, in this order: you finished it,
 * here is the one result that matters, and there is an optional bonus round.
 * It is deliberately not a dashboard - the analog game keeps no timer, and
 * finishing IS the reward.
 */
function renderSummary(summary) {
  lastSummary = summary;
  const correct = document.querySelector('#summary-correct');
  correct.textContent = '0';
  document.querySelector('#summary-total').textContent = String(summary.rounds);
  document.querySelector('#summary-first').textContent = `${summary.firstTry} / ${summary.rounds}`;

  // Practice is offered when there is something real to practise: this
  // session's revealed times, or failing that the saved trouble spots. With
  // neither, the section is hidden rather than shown empty.
  const keys = summary.missed.length
    ? summary.missed
    : progress.strugglingTimes(6).map(timeKey);
  const practiceTimes = document.querySelector('#practice-times');
  practiceTimes.replaceChildren();
  for (const key of keys) {
    const chip = document.createElement('span');
    chip.className = 'time-chip';
    chip.textContent = key;
    practiceTimes.append(chip);
  }
  document.querySelector('#practice-section').hidden = keys.length === 0;

  showScreen('screen-summary');
  countUp(correct, summary.correct);
}

const game = new TimeGame({
  progress,
  onComplete: renderSummary,
  elements: {
    stage: document.querySelector('#stage'),
    progress: document.querySelector('#game-progress'),
    runTimer: document.querySelector('#run-timer'),
    replayQuestion: document.querySelector('#replay-question'),
    timerBadge: document.querySelector('#run-timer-badge'),
    timerPop: document.querySelector('#timer-pop'),
    scoreCorrect: document.querySelector('#score-correct'),
    scoreTotal: document.querySelector('#score-total'),
    scorePop: document.querySelector('#score-pop'),
    feedback: document.querySelector('#feedback'),
    speechControls: document.querySelector('#speech-controls'),
    holdButton: document.querySelector('#hold-to-talk'),
    typedForm: document.querySelector('#typed-form'),
    typedAnswer: document.querySelector('#typed-answer'),
    fallbackMessage: document.querySelector('#fallback-message'),
    transcript: document.querySelector('#transcript'),
  },
});

/**
 * The speed challenge is a separate activity with its own screen, its own
 * speech instance and its own scoring. It is reachable ONLY from the analog
 * completion screen, so it can never become the thing a child lands in first.
 */
const speedRound = new SpeedRound({
  progress,
  onComplete: renderSpeedResult,
  elements: {
    clock: document.querySelector('#speed-clock'),
    countdown: document.querySelector('#speed-countdown'),
    countdownChip: document.querySelector('#speed-countdown-chip'),
    score: document.querySelector('#speed-score'),
    scoreChip: document.querySelector('#speed-score-chip'),
    scorePop: document.querySelector('#speed-score-pop'),
    streak: document.querySelector('#speed-streak'),
    feedback: document.querySelector('#speed-feedback'),
    answer: document.querySelector('#speed-answer'),
    speechControls: document.querySelector('#speed-speech'),
    holdButton: document.querySelector('#speed-hold'),
    typedForm: document.querySelector('#speed-typed-form'),
    typedAnswer: document.querySelector('#speed-typed-answer'),
    intro: document.querySelector('#speed-intro'),
    introCount: document.querySelector('#speed-intro-count'),
  },
});

function startSpeedRound() {
  showScreen('screen-speed');
  speedRound.start();
}

function renderSpeedResult(result) {
  document.querySelector('#speed-result-count').textContent = String(result.correct);
  document.querySelector('#speed-result-mistakes').textContent = String(result.mistakes);
  document.querySelector('#speed-result-streak').textContent = String(result.bestStreak);
  document.querySelector('#speed-result-best').textContent = result.bestScore === null
    ? '—'
    : String(result.bestScore);
  document.querySelector('#speed-result-new-best').hidden = !result.isNewBest;
  showScreen('screen-speed-result');
}

function leaveSpeedRound(target) {
  speedRound.stop();
  showScreen(target);
}

function settingsValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

function renderSettings() {
  const settings = progress.getSettings();
  for (const group of document.querySelectorAll('[data-setting]')) {
    const key = group.dataset.setting;
    for (const button of group.querySelectorAll('button')) {
      button.classList.toggle('is-selected', settingsValue(button.dataset.value) === settings[key]);
    }
  }
  for (const button of difficultyChoices.querySelectorAll('.difficulty-choice')) {
    const selected = button.dataset.difficulty === settings.difficulty;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
}

function openSettings(from) {
  returnScreen = from;
  if (from === 'screen-game') game.pause();
  renderSettings();
  showScreen('screen-settings');
}

for (const group of document.querySelectorAll('[data-setting]')) {
  group.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-value]');
    if (!button) return;
    progress.updateSettings({ [group.dataset.setting]: settingsValue(button.dataset.value) });
    renderSettings();
  });
}

document.querySelector('#replay-question').addEventListener('click', () => game.replayQuestion());
document.querySelector('#start-game').addEventListener('click', startGame);
document.querySelector('#open-options').addEventListener('click', () => openSettings('screen-title'));
document.querySelector('#game-settings').addEventListener('click', () => openSettings('screen-game'));
document.querySelector('#game-back').addEventListener('click', () => {
  game.stop();
  showScreen('screen-title');
});
function closeSettings() {
  showScreen(returnScreen);
  if (returnScreen === 'screen-game') game.resume();
}

document.querySelector('#settings-done').addEventListener('click', closeSettings);
document.querySelector('#settings-back').addEventListener('click', closeSettings);
document.querySelector('#reset-progress').addEventListener('click', (event) => {
  if (!window.confirm('この きたいの きろくを ぜんぶ けしますか？')) return;
  progress.reset();
  event.currentTarget.textContent = 'けしました';
  setTimeout(() => { event.currentTarget.textContent = 'けす'; }, 1400);
});
document.querySelector('#practice-again').addEventListener('click', () => {
  if (!lastSummary) return;
  showScreen('screen-game');
  game.start({ levelId: lastSummary.levelId, practiceMode: 'difficult' });
});
document.querySelector('#play-again').addEventListener('click', startGame);
document.querySelector('#speed-challenge').addEventListener('click', startSpeedRound);
document.querySelector('#speed-back').addEventListener('click', () => leaveSpeedRound('screen-summary'));
document.querySelector('#speed-again').addEventListener('click', startSpeedRound);
document.querySelector('#speed-exit').addEventListener('click', () => leaveSpeedRound('screen-summary'));
document.querySelector('#change-level').addEventListener('click', () => showScreen('screen-title'));

// Scoring is off for now, so its HUD is not shown at all.
document.querySelector('#run-timer-badge').hidden = !ENABLE_SCORING;
document.querySelector('.hud-divider').hidden = !ENABLE_SCORING;

buildDifficultyChoices();
renderSettings();
