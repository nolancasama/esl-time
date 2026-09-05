const SVG_NS = 'http://www.w3.org/2000/svg';
const renderers = new Map();

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function analogRenderer(time, opts = {}) {
  const svg = svgElement('svg', {
    viewBox: '0 0 200 200',
    role: 'img',
    'aria-label': opts.label || `Analog clock showing ${time.h}:${String(time.m).padStart(2, '0')}`,
  });
  svg.classList.add('analog-clock');

  svg.append(svgElement('circle', { class: 'clock-rim', cx: 100, cy: 100, r: 96 }));
  svg.append(svgElement('circle', { class: 'clock-face', cx: 100, cy: 100, r: 89 }));

  const ticks = svgElement('g', { class: 'clock-ticks', 'aria-hidden': 'true' });
  for (let minute = 0; minute < 60; minute += 1) {
    const major = minute % 5 === 0;
    ticks.append(svgElement('line', {
      class: major ? 'clock-tick clock-tick-major' : 'clock-tick',
      x1: 100,
      y1: major ? 13 : 15,
      x2: 100,
      y2: major ? 23 : 19,
      transform: `rotate(${minute * 6} 100 100)`,
    }));
  }
  svg.append(ticks);

  const numerals = svgElement('g', { class: 'clock-numerals', 'aria-hidden': 'true' });
  for (let hour = 1; hour <= 12; hour += 1) {
    const angle = (hour * 30 - 90) * Math.PI / 180;
    const numeral = svgElement('text', {
      x: 100 + Math.cos(angle) * 69,
      y: 100 + Math.sin(angle) * 69,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    numeral.textContent = String(hour);
    numerals.append(numeral);
  }
  svg.append(numerals);

  // The fractional hour angle is the lesson: 7:30 must sit between 7 and 8.
  const hourAngle = (time.h % 12) * 30 + time.m * 0.5;
  const minuteAngle = time.m * 6;
  svg.append(svgElement('line', {
    class: 'clock-hand clock-hour-hand',
    x1: 100,
    y1: 108,
    x2: 100,
    y2: 59,
    transform: `rotate(${hourAngle} 100 100)`,
  }));
  svg.append(svgElement('line', {
    class: 'clock-hand clock-minute-hand',
    x1: 100,
    y1: 110,
    x2: 100,
    y2: 37,
    transform: `rotate(${minuteAngle} 100 100)`,
  }));
  svg.append(svgElement('circle', { class: 'clock-pin-outer', cx: 100, cy: 100, r: 7 }));
  svg.append(svgElement('circle', { class: 'clock-pin', cx: 100, cy: 100, r: 3.5 }));
  return svg;
}

// Hands are drawn in a unit face of radius 100 and then mapped onto the scene's
// painted ellipse. The non-uniform scale is what makes a hand land on the same
// numeral the artwork shows: the painted numerals are foreshortened by exactly
// the same ellipse, so the hands have to be too. Lengths stay inside the face
// (minute 0.80, hour 0.55 of the radius) so no hand crosses the painted rim.
const HAND_GEOMETRY = Object.freeze({
  hour: { back: 9, tip: -55, width: 7.5 },
  minute: { back: 11, tip: -80, width: 5.5 },
});

/**
 * Hands only, for a clock already painted into the scene artwork.
 * Returns an SVG <g> to append inside the scene's image-space overlay, NOT a
 * standalone <svg> — the artwork supplies the face, rim, numerals and pin.
 */
function paintedHandsRenderer(time, opts = {}) {
  const { cx = 0, cy = 0, rx = 100, ry = 100, rotation = 0 } = opts.geometry || {};
  const group = svgElement('g', {
    class: 'painted-hands',
    role: 'img',
    'aria-label': opts.label || `Clock showing ${time.h}:${String(time.m).padStart(2, '0')}`,
    transform: `translate(${cx} ${cy}) rotate(${rotation}) scale(${rx / 100} ${ry / 100})`,
  });

  // The fractional hour angle is the lesson: 7:30 must sit between 7 and 8.
  const hourAngle = (time.h % 12) * 30 + time.m * 0.5;
  const minuteAngle = time.m * 6;

  for (const [name, angle] of [['hour', hourAngle], ['minute', minuteAngle]]) {
    const hand = HAND_GEOMETRY[name];
    group.append(svgElement('line', {
      class: `painted-hand painted-${name}-hand`,
      x1: 0,
      y1: hand.back,
      x2: 0,
      y2: hand.tip,
      'stroke-width': hand.width,
      transform: `rotate(${angle})`,
    }));
  }

  group.append(svgElement('circle', { class: 'painted-pin', cx: 0, cy: 0, r: 5 }));
  return group;
}

export function registerClockRenderer(type, fn) {
  if (!type || typeof fn !== 'function') throw new TypeError('A clock type and renderer are required.');
  renderers.set(type, fn);
}

export function renderClock(type, time, opts = {}) {
  const renderer = renderers.get(type);
  if (!renderer) throw new Error(`No clock renderer registered for "${type}".`);
  return renderer(time, opts);
}

registerClockRenderer('analog', analogRenderer);
registerClockRenderer('painted', paintedHandsRenderer);
