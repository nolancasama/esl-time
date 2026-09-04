import { allLevels } from './data/times.js';
import { Progress } from './progress.js';
import { TimeGame } from './game.js';

const progress = new Progress();
const screens = [...document.querySelectorAll('.screen')];
const levelGrid = document.querySelector('#level-grid');
let returnScreen = 'screen-levels';
let lastSummary = null;

function showScreen(id) {
  for (const screen of screens) screen.classList.toggle('is-visible', screen.id === id);
}

function buildLevelCards() {
  levelGrid.replaceChildren();
  for (const level of allLevels()) {
    const button = document.createElement('button');
    button.className = 'level-card';
    button.type = 'button';
    button.innerHTML = `
      <span class="level-number">Level ${level.id}</span>
      <span class="level-name"></span>
      <span class="level-size">${level.times.length} times</span>
    `;
    button.querySelector('.level-name').textContent = level.name;
    button.addEventListener('click', () => {
      progress.updateSettings({ level: level.id });
      showScreen('screen-game');
      game.start({ levelId: level.id });
    });
    levelGrid.append(button);
  }
}

function renderSummary(summary) {
  lastSummary = summary;
  document.querySelector('#summary-correct').textContent = String(summary.correct);
  document.querySelector('#summary-first').textContent = String(summary.firstTry);
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

document.querySelector('#level-settings').addEventListener('click', () => openSettings('screen-levels'));
document.querySelector('#game-settings').addEventListener('click', () => openSettings('screen-game'));
document.querySelector('#game-back').addEventListener('click', () => {
  game.stop();
  showScreen('screen-levels');
});
document.querySelector('#settings-done').addEventListener('click', () => {
  showScreen(returnScreen);
  if (returnScreen === 'screen-game') game.resume();
});
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
document.querySelector('#play-again').addEventListener('click', () => {
  if (!lastSummary) return;
  showScreen('screen-game');
  game.start({ levelId: lastSummary.levelId });
});
document.querySelector('#change-level').addEventListener('click', () => showScreen('screen-levels'));

buildLevelCards();
renderSettings();
