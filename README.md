# What Time Is It?

A dependency-free ESL telling-time game for Japanese elementary EFL students.
A clock sits somewhere in a scene; the student holds one big button and says
the time out loud.

V1 is deliberately **placeholder-art only**. The point of this version is to get
the round loop, the speech path, the clock generation, the scoring grammar and
the scene architecture solid *before* any artwork exists.

## For teachers and school IT administrators / 先生・学校の情報担当者向け

**English:** This is a free, browser-based educational activity designed for
elementary-school English as a foreign language (EFL) lessons. Students practise
reading analog clocks and saying times in English. There is an optional timed
review activity. The site requires no student account and has no advertising
or third-party analytics scripts in this repository. It uses local browser
storage for learning progress; spoken answers may be handled by the browser's
speech recognition service when microphone input is enabled. A typed-answer
fallback is available.

**日本語:** このサイトは、小学校の外国語活動・外国語科の授業で使うための
無料の英語学習教材です。児童がアナログ時計を読み、時刻を英語で言う練習を
行います。復習用の時間制限付き活動もあります。児童のアカウント登録は不要です。
本リポジトリには広告や外部アクセス解析スクリプトはありません。
学習記録はブラウザ内に保存されます。マイクを利用する場合、音声認識は
ブラウザの音声認識サービスで処理されることがあります。文字入力でも回答できます。

**School filtering / フィルタリング:** If access is restricted, school
administrators should review the site's classification and approve the deployed
URL through the school's normal filtering policy. Educational metadata does
not bypass school security settings.

## Run

Open `index.html`, or serve the folder with any static server:

```
npm run serve      # http://localhost:8000
```

Speech recognition needs Chrome or Edge. In Firefox and Safari — or when the
microphone is refused — the game automatically swaps in a typed-answer box that
runs through the identical scoring path, so it is never a dead screen.

```
npm test           # 422 assertions over the answer matcher
```

`visual.html` renders all 12 scenes at once as a contact sheet, for checking
clock placement and legibility without playing through a session.

## How answers are judged

The matcher asks whether the student **expressed the correct time in valid
English**, not whether the right digits appear somewhere in the transcript.

Accepted for 7:15: "seven fifteen", "it's seven fifteen", "it is seven fifteen",
"uh, I think it's seven fifteen", "a quarter past seven", and the numeral
renderings Chrome actually returns (`7:15`, `715`, `7 15`).

Rejected for 7:15: "seven fifteen o'clock" and "seven o'clock fifteen" —
*o'clock is only valid on the hour* — and "fifteen seven", which is out of
order. These fail as **grammar**, separately from simply naming the wrong time.

AM/PM is never tested; an analog clock cannot express it, so either is accepted
and neither is required.

## Files

- `SPEC.md` — the frozen V1 specification. Start here.
- `src/time-match.js` — normalisation and grammar-aware answer scoring
- `src/clock.js` — inline SVG analog clock, dispatched through a type registry
- `src/scene.js` / `src/data/scenes.js` — the 12 layered placeholder scenes
- `src/scheduler.js` — independent shuffled passes over times and scenes
- `src/speech.js` — press-and-hold recognition, keyboard parity, typed fallback
- `src/game.js` / `src/main.js` — round loop and screen wiring
- `src/progress.js` — per-time records and settings, guarded local persistence

No build step, no dependencies, no framework.

## Not in V1

Scene artwork, foreground characters, recorded character voices, and non-analog
clock types. Each has a seat reserved: every scene already renders background /
clock / foreground layers in order, names its own voice asset independently, and
declares a clock type resolved through a registry.
