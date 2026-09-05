/**
 * A seven-segment digital clock face, drawn as inline SVG.
 *
 * The speed challenge shows its target as a THING, not as text: a dark cased
 * panel with lit segments and the unlit ones still faintly visible, the way a
 * real bedside or platform clock looks. Plain webpage numerals read as an
 * instruction; a clock reads as something to tell the time from.
 *
 * No font is loaded and no image is fetched — the segments are geometry, so
 * this stays cheap enough to redraw every couple of seconds on a Chromebook.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// One digit cell in local units. The segments are deliberately heavy: this is
// read from the back of a classroom, not at desk distance.
const CELL = { w: 100, h: 180, t: 19 };
// Every segment is pulled back from its corners so the display keeps the
// visible seams a real panel has instead of fusing into one solid glyph.
const INSET = 4;
const DIGIT_GAP = 26;
const COLON_W = 42;

function horizontal(y) {
  const half = CELL.t / 2;
  const x0 = INSET;
  const x1 = CELL.w - INSET;
  return [[x0, y], [x0 + half, y - half], [x1 - half, y - half],
    [x1, y], [x1 - half, y + half], [x0 + half, y + half]];
}

function vertical(x, top, bottom) {
  const half = CELL.t / 2;
  const y0 = top + INSET;
  const y1 = bottom - INSET;
  return [[x, y0], [x + half, y0 + half], [x + half, y1 - half],
    [x, y1], [x - half, y1 - half], [x - half, y0 + half]];
}

const SEGMENT_POINTS = Object.freeze({
  a: horizontal(CELL.t / 2),
  g: horizontal(CELL.h / 2),
  d: horizontal(CELL.h - CELL.t / 2),
  f: vertical(CELL.t / 2, 0, CELL.h / 2),
  b: vertical(CELL.w - CELL.t / 2, 0, CELL.h / 2),
  e: vertical(CELL.t / 2, CELL.h / 2, CELL.h),
  c: vertical(CELL.w - CELL.t / 2, CELL.h / 2, CELL.h),
});

const SEGMENT_NAMES = Object.freeze(Object.keys(SEGMENT_POINTS));

const LIT = Object.freeze({
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
});

// Four digit slots and a colon, at fixed positions. The layout never reflows
// between targets, so the colon does not hop sideways when 9:05 follows 11:47.
const SLOT_X = [
  0,
  CELL.w + DIGIT_GAP,
  CELL.w * 2 + DIGIT_GAP * 2 + COLON_W + DIGIT_GAP,
  CELL.w * 3 + DIGIT_GAP * 3 + COLON_W + DIGIT_GAP,
];
const COLON_X = CELL.w * 2 + DIGIT_GAP * 2;
const CONTENT_W = SLOT_X[3] + CELL.w;

const SCREEN_PAD = 26;
const CASE_PAD = SCREEN_PAD + 20;
const STROKE = 5;

function element(name, attributes) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function polygon(points, className, dx) {
  return element('polygon', {
    class: className,
    points: points.map(([x, y]) => `${x + dx},${y}`).join(' '),
  });
}

function colonDot(y, className) {
  const size = CELL.t + 1;
  return element('rect', {
    class: className,
    x: COLON_X + (COLON_W - size) / 2,
    y: y - size / 2,
    width: size,
    height: size,
    rx: 4,
  });
}

const COLON_Y = [CELL.h * 0.32, CELL.h * 0.72];

/**
 * @param {{h:number, m:number}} time 12-hour time; the hour is never zero
 *   padded and the minute always is, so 6:02 shows as a blank slot, 6, :, 0, 2.
 * @returns {SVGSVGElement}
 */
export function renderDigitalClock(time) {
  const hour = String(time.h);
  const minute = String(time.m).padStart(2, '0');
  const digits = [
    hour.length > 1 ? Number(hour[0]) : null,
    Number(hour.at(-1)),
    Number(minute[0]),
    Number(minute[1]),
  ];

  const svg = element('svg', {
    class: 'digital-clock',
    viewBox: [
      -CASE_PAD - STROKE / 2,
      -CASE_PAD - STROKE / 2,
      CONTENT_W + (CASE_PAD + STROKE / 2) * 2,
      CELL.h + (CASE_PAD + STROKE / 2) * 2,
    ].join(' '),
    role: 'img',
    'aria-label': `Digital clock showing ${time.h}:${minute}`,
  });

  svg.append(element('rect', {
    class: 'digital-case',
    x: -CASE_PAD, y: -CASE_PAD,
    width: CONTENT_W + CASE_PAD * 2,
    height: CELL.h + CASE_PAD * 2,
    rx: 30,
  }));
  svg.append(element('rect', {
    class: 'digital-screen',
    x: -SCREEN_PAD, y: -SCREEN_PAD,
    width: CONTENT_W + SCREEN_PAD * 2,
    height: CELL.h + SCREEN_PAD * 2,
    rx: 16,
  }));

  // Unlit segments are painted first and faintly, so the panel reads as a
  // physical display with digits switched off rather than as floating shapes.
  const ghosts = element('g', { class: 'digital-ghosts', 'aria-hidden': 'true' });
  const lit = element('g', { class: 'digital-lit', 'aria-hidden': 'true' });

  digits.forEach((digit, slot) => {
    // A blank leading slot stays completely dark, the way a real clock shows
    // 1:00 rather than 01:00. Ghosting it would read as an extra digit.
    if (digit === null) return;
    const on = LIT[digit];
    for (const name of SEGMENT_NAMES) {
      ghosts.append(polygon(SEGMENT_POINTS[name], 'digital-seg', SLOT_X[slot]));
      if (on.includes(name)) {
        lit.append(polygon(SEGMENT_POINTS[name], 'digital-seg', SLOT_X[slot]));
      }
    }
  });

  for (const y of COLON_Y) {
    ghosts.append(colonDot(y, 'digital-seg'));
    lit.append(colonDot(y, 'digital-seg'));
  }

  svg.append(ghosts, lit);
  return svg;
}

export default renderDigitalClock;
