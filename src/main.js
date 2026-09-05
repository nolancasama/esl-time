import { allDifficulties, levelIdForDifficulty } from './data/times.js';
import { Progress } from './progress.js';
import { TimeGame, formatRunTime, ENABLE_SCORING } from './game.js';
import { renderClock } from './clock.js';

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
    button.querySelector('.difficulty-en').textContent = `${difficulty.en} · ${difficulty.blurb}`;
    button.addEventListener('click', () => {
      // Choosing a difficulty never starts a round; the child presses スタート.
      progress.updateSettings({ difficulty: difficulty.id });
      renderSettings();
    });
    difficultyChoices.append(button);
  }
}

function renderSummary(summary) {
  lastSummary = summary;
  const timed = summary.scoringEnabled;
  // With scoring off the result is just how the round went, not a race result.
  document.querySelector('#summary-score').hidden = !timed;
  document.querySelector('#summary-timed-stats').hidden = !timed;
  document.querySelector('#summary-new-best').hidden = !timed || !summary.isNewBest;
  document.querySelector('#summary-correct').textContent = `${summary.correct} / ${summary.rounds}`;
  document.querySelector('#summary-first').textContent = `${summary.firstTry} / ${summary.rounds}`;
  if (timed) {
    document.querySelector('#summary-score').textContent = formatRunTime(summary.finalScoreMs);
    document.querySelector('#summary-base').textContent = formatRunTime(summary.elapsedMs);
    document.querySelector('#summary-penalty').textContent = `+${Math.round(summary.penaltyMs / 1000)} sec`;
    document.querySelector('#summary-best').textContent = summary.bestMs === null
      ? '—'
      : formatRunTime(summary.bestMs);
  }
  const practiceTimes = document.querySelector('#practice-times');
  practiceTimes.replaceChildren();
  if (!summary.missed.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-practice';
    empty.textContent = 'No revealed times this session.';
    practiceTimes.append(empty);
  } else {
    for (const key of summary.missed) {
      const chip = document.createElement('span');
      chip.className = 'time-chip';
      chip.textContent = key;
      practiceTimes.append(chip);
    }
  }
  showScreen('screen-summary');
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
  if (!window.confirm('Reset all saved progress on this device?')) return;
  progress.reset();
  event.currentTarget.textContent = 'Progress reset';
  setTimeout(() => { event.currentTarget.textContent = 'Reset'; }, 1400);
});
document.querySelector('#practice-again').addEventListener('click', () => {
  if (!lastSummary) return;
  showScreen('screen-game');
  game.start({ levelId: lastSummary.levelId, practiceMode: 'difficult' });
});
document.querySelector('#play-again').addEventListener('click', startGame);
document.querySelector('#change-level').addEventListener('click', () => showScreen('screen-title'));

// The standalone analog renderer, otherwise unused now that every scene paints
// its own clock. 10:10 is the classic display setting: hands up and symmetric.
document.querySelector('#title-clock').append(renderClock('analog', { h: 10, m: 10 }, {
  label: 'Decorative clock',
}));

// Scoring is off for now, so its HUD is not shown at all.
document.querySelector('#run-timer-badge').hidden = !ENABLE_SCORING;
document.querySelector('.hud-divider').hidden = !ENABLE_SCORING;

buildDifficultyChoices();
renderSettings();
