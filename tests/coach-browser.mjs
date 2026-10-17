import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/nolan/ui-verify/node_modules/playwright'); }
const root = resolve('.');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const file = path === root ? resolve(root, 'index.html') : path;
    const body = await readFile(file);
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await playwright.chromium.launch({ headless: true });
await mkdir('.tmp/coach-screens', { recursive: true });

async function mockSpeech(page) {
  await page.addInitScript(() => {
    localStorage.setItem('eslTime.v1', JSON.stringify({ settings: { characterAudio: false, feedbackSounds: false, revealAfter: 3 } }));
    window.__recognitions = [];
    class Recognition {
      start() { window.__recognitions.push(this); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    window.SpeechRecognition = Recognition;
    window.SpeechSynthesisUtterance = class {
      constructor(text) { this.text = text; }
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'en-US', name: 'Test English' }],
      cancel() {},
      speak(utterance) { window.__spoken = utterance; utterance.onstart?.(); },
      addEventListener() {}, removeEventListener() {},
    } });
  });
}

async function hold(page, selector, transcripts, duration = 350) {
  const button = page.locator(selector);
  await button.focus();
  await page.keyboard.down(' ');
  await page.waitForTimeout(duration);
  await page.evaluate(transcripts => {
    const recognition = window.__recognitions.at(-1);
    const result = transcripts.map(transcript => ({ transcript, confidence: 0.9 }));
    result.isFinal = true;
    recognition.onresult({ results: [result], resultIndex: 0 });
  }, transcripts);
  await page.keyboard.up(' ');
}

try {
  for (const width of [360, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await mockSpeech(page);
    await page.goto(url);
    // Deterministic time fixtures; the page still renders and judges through its real game classes.
    await page.evaluate(async () => {
      const vendor = window.EslPronunciationCoach;
      window.EslPronunciationCoach = { ...vendor, createGameCoach(options) {
        const coach = vendor.createGameCoach(options);
        const originalAttempt = coach.attempt.bind(coach);
        coach.attempt = input => {
          const output = originalAttempt(input);
          window.__coachAttempt = { input, output };
          return output;
        };
        return coach;
      } };
      const { TimeGame } = await import('/src/game.js');
      const next = TimeGame.prototype._nextRound;
      TimeGame.prototype._nextRound = function () {
        window.__game = this;
        const deal = this.scheduler.next.bind(this.scheduler);
        this.scheduler = { ...this.scheduler, next: () => ({ ...deal(), time: { h: 3, m: 0 } }) };
        return next.call(this);
      };
      const { SpeedRound } = await import('/src/speed-round.js');
      const target = SpeedRound.prototype._nextTarget;
      SpeedRound.prototype._nextTarget = function () {
        window.__speed = this;
        this.source.next = () => ({ h: 3, m: 0 });
        return target.call(this);
      };
    });
    await page.locator('#start-game').click();
    await page.locator('#hold-to-talk').waitFor({ state: 'visible' });
    await hold(page, '#hold-to-talk', ["it's tree o'clock", "it's tree o clock"]);
    try {
      await page.locator('.epc-card:visible').waitFor({ timeout: 5000 });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        current: window.__game?.current,
        active: window.__game?.active,
        feedback: document.querySelector('#feedback')?.textContent,
        speech: window.__game && { active: window.__game.speech.active, enabled: window.__game.speech.enabled, alternatives: window.__game.speech.alternatives },
        vendor: typeof window.EslPronunciationCoach?.createGameCoach,
        coachAttempt: window.__coachAttempt,
        hints: document.querySelector('.pronunciation-hints')?.outerHTML,
      }));
      await page.screenshot({ path: `.tmp/coach-screens/failed-${width}.png`, fullPage: true });
      throw new Error(`${error.message}\nCoach diagnostic: ${JSON.stringify(diagnostic)}; page errors: ${JSON.stringify(errors)}`);
    }
    assert.equal(await page.locator('.epc-word:visible').innerText(), 'three');
    assert.equal(await page.locator('.epc-retry:visible').count(), 0);
    assert.match(await page.locator('.epc-note:visible').innerText(), /マイクのボタン/);
    assert.equal(await page.evaluate(() => window.__game.current.genuineWrong), 1);
    await page.screenshot({ path: `.tmp/coach-screens/regular-${width}.png`, fullPage: true });

    // Listen must not open TTS during a hold, and must lock recognition while speaking.
    await page.locator('#hold-to-talk').focus();
    await page.keyboard.down(' ');
    await page.locator('.epc-listen:visible').evaluate(button => button.click());
    assert.equal(await page.evaluate(() => Boolean(window.__spoken)), false);
    await page.keyboard.up(' ');
    await page.locator('.epc-listen:visible').click();
    assert.equal(await page.locator('#hold-to-talk').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__spoken.lang), 'en-US');
    await page.evaluate(() => window.__spoken.onend?.());
    assert.equal(await page.locator('#hold-to-talk').isEnabled(), true);
    await page.locator('#game-settings').click();
    assert.equal(await page.locator('.epc-card:visible').count(), 0);
    await page.locator('#settings-done').click();
    await page.locator('#game-back').click();
    // Enter through the existing speed challenge handler without playing twelve unrelated rounds.
    await page.locator('#speed-challenge').evaluate(button => button.click());
    await page.locator('#speed-hold').waitFor({ state: 'visible' });
    await page.waitForFunction(() => window.__speed?.speech.enabled);
    await hold(page, '#speed-hold', ["it's tree o'clock"]);
    await page.locator('.epc-card:visible').waitFor();
    assert.equal(await page.locator('.epc-word:visible').innerText(), 'three');
    await page.screenshot({ path: `.tmp/coach-screens/speed-${width}.png`, fullPage: true });
    await page.locator('#speed-back').click();
    assert.equal(await page.locator('.epc-card:visible').count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  for (const variant of ['?coach=off', '?missing-vendor']) {
    const page = await browser.newPage();
    await mockSpeech(page);
    if (variant.includes('missing')) await page.route('**/pronunciation-coach.min.js', route => route.abort());
    await page.goto(url + variant);
    await page.locator('#start-game').click();
    await page.locator('#hold-to-talk').waitFor({ state: 'visible' });
    await hold(page, '#hold-to-talk', ["it's tree o'clock"]);
    assert.equal(await page.locator('.epc-card').count(), 0);
    assert.match(await page.locator('#feedback').innerText(), /もういちど/);
    assert.equal(await page.locator('#hold-to-talk').isEnabled(), true);
    await page.close();
  }
  console.log('Coach browser checks passed; four screenshots saved to .tmp/coach-screens/.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
